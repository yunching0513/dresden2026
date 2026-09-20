#!/usr/bin/env python3
"""Ergänzt data/stadtteile.geojson um die fehlenden statistischen Stadtteile.

背景
----
`data/stadtteile.geojson` 只收了61個統計Stadtteil，缺Dresden西側與北側的三個
（官方共64個）：涵蓋283.6 km²，比官方市域面積328.8 km²少約45 km²。少掉的部分
會讓「比較」頁的輪廓偏小，也讓落在那三區裡的OSM物件不被計入指標。

這支腳本從Overpass抓那三個Stadtteil底下的OSM Ortsteil界線，各自合併成一個
Stadtteil，再寫回`data/stadtteile.geojson`與`data/stadtteile.js`，並把
`js/cities.js`的`unitsBundled`更新成新的數量。

用法
----
    pip install -r scripts/requirements.txt
    python3 scripts/fetch-dresden-stadtteile.py --dry-run     # 只查、只印，不寫檔
    python3 scripts/fetch-dresden-stadtteile.py               # 實際寫回

    # 若自動比對抓到多個同名關聯，手動指定：
    python3 scripts/fetch-dresden-stadtteile.py --relation Schönborn=1234567

    # 官方面積（Stadtteilkatalog）覆蓋預設的幾何量測值：
    python3 scripts/fetch-dresden-stadtteile.py --area 36=14.4 --area 90=24.6

    # 用事先存好的Overpass回應（測試或離線）：
    python3 scripts/fetch-dresden-stadtteile.py --input overpass.json

Overpass是免費的公共服務，回504或直接斷線都很常見。腳本會輪流試四個端點、共四輪
（間隔8、16、32秒），並把抓到的關聯存進scripts/.overpass-cache/，所以中途失敗後
重跑只會補抓還沒拿到的部分。要強制重抓加 --no-cache。

注意：Stadtteil代碼（code）沿用Ortsamtsbereich編號規則推定，CSV以代碼對應分區前
請對照Kommunale Statistikstelle的Stadtteilkatalog確認；面積預設為幾何量測值
（EPSG:3035等積投影），與官方公告值會有小數點後的差異，故另記
`area_source`欄位區別。
"""
import argparse
import http.client
import json
import math
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from pyproj import Transformer
from shapely.geometry import LineString, mapping, shape
from shapely.ops import linemerge, polygonize, transform, unary_union
from shapely import make_valid

ROOT = pathlib.Path(__file__).resolve().parents[1]
GEOJSON = ROOT / 'data' / 'stadtteile.geojson'
JS = ROOT / 'data' / 'stadtteile.js'
CITIES = ROOT / 'js' / 'cities.js'

ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
CACHE = ROOT / 'scripts' / '.overpass-cache'   # 抓到的關聯存這裡，重跑時不必再問一次
ROUNDS = 4                                     # 每輪把所有端點試一遍，輪與輪之間等待
BACKOFF = 8                                    # 第n輪之前等 BACKOFF * 2**(n-1) 秒
# Dresden市域的外接矩形，用來把同名的其他村落排除在候選之外。
BBOX = (50.95, 13.50, 51.25, 14.05)
OFFICIAL_CITY_AREA_KM2 = 328.8       # Landeshauptstadt Dresden公告市域面積
PRECISION = 6                        # 與現有檔案相同的座標小數位
AREA_CRS = 'EPSG:3035'               # ETRS89-LAEA Europe：面積正確

# 三個缺漏的統計Stadtteil，各由數個OSM Ortsteil組成。
# code依Ortsamtsbereich編號規則推定（3＝Klotzsche、9＝Cotta），請與Stadtteilkatalog核對。
GROUPS = [
    {
        'code': '36',
        'name': 'Langebrück/Schönborn',
        'official_name': 'Langebrück/Schönborn',
        'bezirk': 'Ortschaften Langebrück und Schönborn',
        'bezirk_code': '3',
        'parts': ['Langebrück', 'Schönborn'],
    },
    {
        'code': '90',
        'name': 'Cossebaude/Mobschatz/Oberwartha',
        'official_name': 'Cossebaude/Mobschatz/Oberwartha',
        'bezirk': 'Ortschaften Cossebaude, Mobschatz und Oberwartha',
        'bezirk_code': '9',
        'parts': ['Cossebaude', 'Mobschatz', 'Oberwartha'],
    },
    {
        'code': '99',
        'name': 'Altfranken/Gompitz',
        'official_name': 'Altfranken/Gompitz',
        'bezirk': 'Ortschaften Altfranken und Gompitz',
        'bezirk_code': '9',
        'parts': ['Altfranken', 'Gompitz'],
    },
]
# 每個Stadtteil的合理面積範圍（km²），用來擋掉抓錯關聯的情形。
AREA_BOUNDS = (4.0, 60.0)

TO_AREA = Transformer.from_crs('EPSG:4326', AREA_CRS, always_xy=True).transform


def log(*args):
    print(*args, file=sys.stderr)


# Overpass是免費的公共服務，忙碌時常見504、429，或直接把連線關掉
# （RemoteDisconnected不是URLError的子類，所以這裡一律接OSError與HTTPException）。
RETRYABLE = (OSError, http.client.HTTPException, json.JSONDecodeError)


def request_once(endpoint, query):
    request = urllib.request.Request(
        endpoint,
        data=urllib.parse.urlencode({'data': query}).encode(),
        headers={'User-Agent': 'dresden2026 stadtteile fetcher (+https://github.com/yunching0513/dresden2026)'},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.loads(response.read().decode())
    remark = payload.get('remark')
    if remark:                                   # Overpass把逾時、記憶體不足放在remark裡，HTTP仍是200
        raise RuntimeError(f'Overpass remark: {remark}')
    return payload


def overpass(query, endpoints, rounds=ROUNDS):
    last = None
    for attempt in range(rounds):
        for endpoint in endpoints:
            log(f'  → {endpoint}')
            try:
                return request_once(endpoint, query)
            except urllib.error.HTTPError as error:
                if error.code == 400:            # 查詢語法錯誤，重試沒有意義
                    detail = error.read().decode(errors='replace') if error.fp else str(error)
                    raise SystemExit(f'Overpass拒絕這個查詢（400）：\n{detail[:800]}')
                log(f'    失敗：HTTP {error.code} {error.reason}')
                last = error
            except RETRYABLE as error:
                log(f'    失敗：{type(error).__name__}: {error}')
                last = error
            except RuntimeError as error:
                log(f'    失敗：{error}')
                last = error
        if attempt + 1 < rounds:
            wait = BACKOFF * (2 ** attempt)
            log(f'  所有端點都沒成功，等{wait}秒後重試（第{attempt + 2}／{rounds}輪）')
            time.sleep(wait)
    raise SystemExit(f'Overpass連續{rounds}輪都失敗，最後一個錯誤：{last}\n'
                     '稍後再跑一次即可，已抓到的關聯有快取不會重抓。')


def discovery_query(names):
    pattern = '|'.join(re.escape(n) for n in names)
    south, west, north, east = BBOX
    return (
        '[out:json][timeout:180];'
        f'rel["boundary"="administrative"]["name"~"^({pattern})$"]({south},{west},{north},{east});'
        'out ids tags;'
    )


def geometry_query(relation_id):
    # 一次只要一個關聯：請求小、比較不會踩到Overpass的逾時，失敗也只需重抓那一個。
    return f'[out:json][timeout:180];rel(id:{relation_id});out geom;'


def pick_relations(elements, names, overrides):
    """每個Ortsteil名稱必須正好對到一個OSM關聯，否則請使用--relation指定。"""
    chosen, problems = {}, []
    for name in names:
        if name in overrides:
            chosen[name] = overrides[name]
            log(f'  {name}: 使用 --relation 指定的 {overrides[name]}')
            continue
        hits = [
            e for e in elements
            if e.get('tags', {}).get('name') == name
            and e.get('tags', {}).get('admin_level') in ('9', '10', '11')
        ]
        if len(hits) == 1:
            chosen[name] = hits[0]['id']
            tags = hits[0]['tags']
            log(f"  {name}: relation/{hits[0]['id']}（admin_level={tags.get('admin_level')}）")
        else:
            problems.append((name, [f"relation/{h['id']} admin_level={h.get('tags', {}).get('admin_level')}" for h in hits]))
    if problems:
        for name, hits in problems:
            log(f'  ✗ {name}：找到{len(hits)}個候選 {hits or "（無）"}')
        raise SystemExit('無法唯一比對，請用 --relation 名稱=關聯ID 指定後重跑。')
    return chosen


def relation_polygon(element):
    """把Overpass `out geom` 的關聯成員縫成多邊形。"""
    rings = {'outer': [], 'inner': []}
    for member in element.get('members', []):
        if member.get('type') != 'way' or not member.get('geometry'):
            continue
        role = 'inner' if member.get('role') == 'inner' else 'outer'
        points = [(p['lon'], p['lat']) for p in member['geometry']]
        if len(points) > 1:
            rings[role].append(LineString(points))
    if not rings['outer']:
        raise SystemExit(f"relation/{element['id']} 沒有可用的outer成員")
    outer = unary_union(list(polygonize(linemerge(rings['outer']))))
    if outer.is_empty:
        raise SystemExit(f"relation/{element['id']} 的outer環無法閉合（OSM資料可能有缺口）")
    if rings['inner']:
        inner = unary_union(list(polygonize(linemerge(rings['inner']))))
        if not inner.is_empty:
            outer = outer.difference(inner)
    return make_valid(outer)


def area_km2(geom):
    return transform(TO_AREA, geom).area / 1e6


def round_geometry(geom):
    def snap(x, y, z=None):
        return (round(x, PRECISION), round(y, PRECISION))
    return transform(snap, geom)


def cached_json(path, produce):
    """抓過的東西存下來：Overpass不穩，重跑時不該把成功的部分再問一次。"""
    if path and path.exists():
        log(f'  （使用快取 {path.name}）')
        return json.loads(path.read_text(encoding='utf-8'))
    value = produce()
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    return value


def load_overpass_elements(args, names):
    if args.input:
        data = json.loads(pathlib.Path(args.input).read_text(encoding='utf-8'))
        log(f'使用本機檔案 {args.input}（{len(data.get("elements", []))} 個元素）')
        return data['elements']
    endpoints = [args.endpoint] if args.endpoint else ENDPOINTS
    cache = None if args.no_cache else pathlib.Path(args.cache)
    overrides = dict(args.relation)

    def discover():
        missing = [n for n in names if n not in overrides]
        found = overpass(discovery_query(missing), endpoints)['elements'] if missing else []
        return pick_relations(found, names, overrides)

    log('比對Ortsteil與OSM關聯：')
    chosen = cached_json(cache / 'relations.json' if cache else None, discover)
    log('  ' + '、'.join(f'{name}=relation/{rid}' for name, rid in chosen.items()))

    log('抓取界線幾何：')
    elements = []
    for name in names:
        relation_id = chosen[name]
        log(f'  {name}（relation/{relation_id}）')
        elements.append(cached_json(
            cache / f'relation-{relation_id}.json' if cache else None,
            lambda rid=relation_id: pick_relation_element(overpass(geometry_query(rid), endpoints), rid)))
    return elements


def pick_relation_element(payload, relation_id):
    for element in payload.get('elements', []):
        if element.get('type') == 'relation' and element.get('id') == relation_id:
            return element
    raise SystemExit(f'relation/{relation_id} 沒有回傳內容，請確認這個ID是否正確')


def build_features(elements, areas):
    by_name = {}
    for element in elements:
        if element.get('type') != 'relation':
            continue
        name = element.get('tags', {}).get('name')
        if name:
            by_name.setdefault(name, element)
    features = []
    for group in GROUPS:
        parts = []
        for part in group['parts']:
            element = by_name.get(part)
            if element is None:
                raise SystemExit(f'回應裡找不到 {part} 的關聯，請檢查 --relation 或改用 --input')
            polygon = relation_polygon(element)
            log(f"  {part}: relation/{element['id']} {area_km2(polygon):.3f} km²")
            parts.append(polygon)
        merged = make_valid(unary_union(parts))
        measured = area_km2(merged)
        if not AREA_BOUNDS[0] <= measured <= AREA_BOUNDS[1]:
            raise SystemExit(f'{group["name"]} 量到 {measured:.2f} km²，超出合理範圍 {AREA_BOUNDS}，中止。')
        official = areas.get(group['code'])
        properties = {
            'code': group['code'],
            'name': group['name'],
            'official_name': group['official_name'],
            'bezirk': group['bezirk'],
            'bezirk_code': group['bezirk_code'],
            'ortschaft': True,
            'area_km2': round(official if official is not None else measured, 3),
            'area_source': 'Stadtteilkatalog' if official is not None else 'geometry',
            'osm_id': ','.join(f"relation/{by_name[p]['id']}" for p in group['parts']),
        }
        log(f'  → {group["name"]}（{group["code"]}）{properties["area_km2"]} km²'
            f'（{properties["area_source"]}，幾何量測 {measured:.3f}）')
        features.append({
            'type': 'Feature',
            'properties': properties,
            'geometry': json.loads(json.dumps(mapping(round_geometry(merged)))),
        })
    return features


def merge(existing, new_features):
    by_code = {f['properties']['code']: f for f in existing['features']}
    for feature in new_features:
        code = feature['properties']['code']
        if code in by_code:
            log(f'  代碼{code}已存在，覆蓋舊的「{by_code[code]["properties"]["name"]}」')
        by_code[code] = feature
    existing['features'] = [by_code[c] for c in sorted(by_code)]
    return existing


def write_outputs(collection):
    payload = json.dumps(collection, ensure_ascii=False, separators=(',', ':'))
    GEOJSON.write_text(payload + '\n', encoding='utf-8')
    header = JS.read_text(encoding='utf-8').split('\n', 1)[0]
    JS.write_text(f'{header}\nwindow.DD_STADTTEILE={payload};\n', encoding='utf-8')
    log(f'寫入 {GEOJSON.relative_to(ROOT)} 與 {JS.relative_to(ROOT)}')


def update_units_bundled(count):
    source = CITIES.read_text(encoding='utf-8')
    updated, hits = re.subn(r'(units:\s*64,\s*unitsBundled:\s*)\d+', rf'\g<1>{count}', source, count=1)
    if hits:
        CITIES.write_text(updated, encoding='utf-8')
        log(f'js/cities.js：unitsBundled → {count}')
    else:
        log('js/cities.js：找不到unitsBundled，請手動更新')


def key_value(text):
    if '=' not in text:
        raise argparse.ArgumentTypeError('格式為 鍵=值')
    key, value = text.split('=', 1)
    return key.strip(), value.strip()


def relation_pair(text):
    key, value = key_value(text)
    return key, int(value.rsplit('/', 1)[-1])


def area_pair(text):
    key, value = key_value(text)
    return key, float(value)


def main():
    parser = argparse.ArgumentParser(description='補齊Dresden缺漏的統計Stadtteil界線')
    parser.add_argument('--dry-run', action='store_true', help='只查詢與檢查，不寫檔')
    parser.add_argument('--endpoint', help='指定單一Overpass端點')
    parser.add_argument('--input', help='改用事先存好的Overpass回應（JSON檔）')
    parser.add_argument('--cache', default=str(CACHE), help=f'抓到的關聯存放目錄（預設 {CACHE.relative_to(ROOT)}）')
    parser.add_argument('--no-cache', action='store_true', help='不使用快取，每次都重新向Overpass查詢')
    parser.add_argument('--relation', type=relation_pair, action='append', default=[],
                        metavar='名稱=ID', help='手動指定某個Ortsteil的OSM關聯')
    parser.add_argument('--area', type=area_pair, action='append', default=[],
                        metavar='代碼=km2', help='以Stadtteilkatalog的官方面積覆蓋幾何量測值')
    args = parser.parse_args()

    names = [part for group in GROUPS for part in group['parts']]
    elements = load_overpass_elements(args, names)
    log('組裝Stadtteil：')
    features = build_features(elements, dict(args.area))

    collection = json.loads(GEOJSON.read_text(encoding='utf-8'))
    before = len(collection['features'])
    before_area = sum(f['properties'].get('area_km2') or 0 for f in collection['features'])
    collection = merge(collection, features)
    after = len(collection['features'])
    after_area = sum(f['properties'].get('area_km2') or 0 for f in collection['features'])

    log('')
    log(f'Stadtteil數：{before} → {after}（官方64）')
    log(f'面積合計：{before_area:.1f} → {after_area:.1f} km²（官方市域 {OFFICIAL_CITY_AREA_KM2} km²，'
        f'差 {after_area - OFFICIAL_CITY_AREA_KM2:+.1f}）')
    if abs(after_area - OFFICIAL_CITY_AREA_KM2) > 8:
        raise SystemExit('合計面積與官方市域差太多，可能抓到錯的界線，已中止寫檔。')
    if after != 64:
        log('⚠ 數量不是64，請確認GROUPS設定。')

    if args.dry_run:
        log('--dry-run：沒有寫入任何檔案。')
        return
    write_outputs(collection)
    update_units_bundled(after)
    log('')
    log('接著請確認：code欄位是否與Stadtteilkatalog一致；若要用官方公告面積，'
        '以 --area 代碼=km2 重跑。')


if __name__ == '__main__':
    main()
