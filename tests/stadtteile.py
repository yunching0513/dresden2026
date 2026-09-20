"""Exercise scripts/fetch-dresden-stadtteile.py against a synthetic Overpass response.

No network: the fixture stands in for the Overpass reply, so this checks the parts that
can silently go wrong — stitching split ways into rings, subtracting inner rings,
dissolving the Ortsteile of one Stadtteil, and the area/count guards.
"""
import json, math, pathlib, subprocess, sys, tempfile
from pyproj import Transformer

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'fetch-dresden-stadtteile.py'
FWD = Transformer.from_crs('EPSG:4326', 'EPSG:3035', always_xy=True).transform
INV = Transformer.from_crs('EPSG:3035', 'EPSG:4326', always_xy=True).transform

# name -> (lon, lat, km²); totals land near the 45 km² the shipped boundary is missing.
PARTS = {
    'Langebrück': (13.83, 51.13, 9.5), 'Schönborn': (13.87, 51.16, 4.9),
    'Cossebaude': (13.63, 51.09, 9.2), 'Mobschatz': (13.66, 51.07, 8.5), 'Oberwartha': (13.60, 51.11, 6.8),
    'Altfranken': (13.66, 51.02, 2.0), 'Gompitz': (13.63, 51.03, 4.3),
}
HOLED = 'Mobschatz'


def ways(lon, lat, km2, hole):
    cx, cy = FWD(lon, lat)
    half = math.sqrt(km2 * 1e6) / 2
    ring = [INV(x, y) for x, y in
            [(cx - half, cy - half), (cx + half, cy - half), (cx + half, cy + half), (cx - half, cy + half), (cx - half, cy - half)]]
    def member(points, role, ref):
        return {'type': 'way', 'ref': ref, 'role': role,
                'geometry': [{'lon': round(x, 7), 'lat': round(y, 7)} for x, y in points]}
    members = [member(ring[:3], 'outer', 1), member(ring[2:], 'outer', 2)]   # 拆兩段，測試縫合
    if hole:
        q = half / 4
        inner = [INV(x, y) for x, y in
                 [(cx - q, cy - q), (cx + q, cy - q), (cx + q, cy + q), (cx - q, cy + q), (cx - q, cy - q)]]
        members.append(member(inner, 'inner', 3))
    return members


fixture = {'elements': [
    {'type': 'relation', 'id': 9000000 + i,
     'tags': {'name': name, 'boundary': 'administrative', 'admin_level': '10'},
     'members': ways(lon, lat, km2, name == HOLED)}
    for i, (name, (lon, lat, km2)) in enumerate(PARTS.items())
]}

with tempfile.NamedTemporaryFile('w', suffix='.json', encoding='utf-8', delete=False) as handle:
    json.dump(fixture, handle, ensure_ascii=False)
    path = handle.name

run = subprocess.run([sys.executable, str(SCRIPT), '--input', path, '--dry-run',
                      '--area', '36=14.4', '--area', '90=24.6'],
                     capture_output=True, text=True)
report = run.stdout + run.stderr
assert run.returncode == 0, report
assert 'Stadtteil數：61 → 64' in report, report
assert 'Langebrück/Schönborn（36）14.4 km²（Stadtteilkatalog' in report, report      # 官方面積覆蓋量測值
assert 'Altfranken/Gompitz（99）6.3 km²（geometry' in report, report                 # 未給官方值時退回幾何量測
assert '幾何量測 7.969' in report or 'Mobschatz: relation/9000003 7.969' in report, report  # 內環已扣除
assert '沒有寫入任何檔案' in report, report

# 相鄰的Cossebaude與Mobschatz在合併後必須融成一塊，而不是把重疊面積算兩次。
group = sum(PARTS[n][2] for n in ('Cossebaude', 'Mobschatz', 'Oberwartha'))
assert '（90）24.6 km²（Stadtteilkatalog，幾何量測 22.884）' in report, report
assert 22.884 < group, report

# 抓到錯誤界線時必須中止，不能把壞資料寫進repo。
broken = {'elements': [dict(e, members=ways(*PARTS[e['tags']['name']][:2], 0.5, False)) for e in fixture['elements']]}
with tempfile.NamedTemporaryFile('w', suffix='.json', encoding='utf-8', delete=False) as handle:
    json.dump(broken, handle, ensure_ascii=False)
    broken_path = handle.name
guard = subprocess.run([sys.executable, str(SCRIPT), '--input', broken_path, '--dry-run'],
                       capture_output=True, text=True)
assert guard.returncode != 0, guard.stdout + guard.stderr
assert '超出合理範圍' in guard.stdout + guard.stderr, guard.stdout + guard.stderr

print('PASS: ways stitched, inner ring subtracted, Ortsteile dissolved, official areas honoured, guards abort.')
