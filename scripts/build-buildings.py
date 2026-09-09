#!/usr/bin/env python3
"""Download GeoSN LoD1 tiles for Dresden and publish browser-ready GeoJSON.
Requires pyproj, shapely. Run from any directory; raw ZIP cache stays outside repo.
"""
import argparse, concurrent.futures, csv, datetime, hashlib, io, json, math, pathlib, re, time, urllib.request, zipfile
import xml.etree.ElementTree as ET
from pyproj import Transformer
from shapely.geometry import Polygon, mapping, shape as read_shape
from shapely.ops import unary_union, transform
from shapely import make_valid

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGE = 'https://www.geodaten.sachsen.de/batch-download-4719.html'
SOURCE = 'https://www.geodaten.sachsen.de/downloadbereich-digitale-3d-stadtmodelle-4875.html'
NS = {'b': 'http://www.opengis.net/citygml/building/1.0', 'g': 'http://www.opengis.net/gml', 'gen': 'http://www.opengis.net/citygml/generics/1.0'}
CRS = Transformer.from_crs(25833, 4326, always_xy=True)

def get(url):
    with urllib.request.urlopen(url, timeout=240) as r:
        return r.read()

def config():
    html = get(PAGE).decode()
    products = json.loads(re.search(r'batchConfig.products=(\{[^\r\n]+)', html)[1])
    areas = json.loads(re.search(r'batchConfig.mapping=(\{[^\r\n]+)', html)[1])
    packed = areas['14612000']['grid_id']
    tiles = set()
    for start, count in zip(packed[::2], packed[1::2]):
        for code in range(start, start + count):
            tiles.add((code // 10000 // 2 * 2, code % 10000 // 2 * 2))
    return products['LoD1_CityGML']['share_id'], sorted(tiles)

def convert(raw, tile, url):
    features, skipped = [], 0
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        root = ET.fromstring(z.read(next(n for n in z.namelist() if n.endswith('.gml'))))
        years = list(csv.DictReader(io.StringIO(z.read(next(n for n in z.namelist() if n.endswith('.csv'))).decode('utf-8-sig')), delimiter=';'))[0]
    for building in root.findall('.//b:Building', NS):
        municipality = building.find("gen:intAttribute[@name='Gemeindeschluessel']/gen:value", NS)
        if municipality is None or municipality.text != '14612000':
            continue
        for obj in [building] + building.findall('.//b:BuildingPart', NS):
            solids = obj.findall('b:lod1Solid', NS)
            if not solids:
                continue
            polygons, zs = [], []
            for solid in solids:
                for polygon in solid.findall('.//g:Polygon', NS):
                    rings = []
                    for ring in polygon.findall('g:exterior/g:LinearRing/g:posList', NS) + polygon.findall('g:interior/g:LinearRing/g:posList', NS):
                        vals = list(map(float, ring.text.split()))
                        if len(vals) % 3:
                            raise ValueError('Expected 3D coordinates')
                        coords = list(zip(vals[::3], vals[1::3], vals[2::3]))
                        zs.extend(c[2] for c in coords)
                        rings.append(coords)
                    if rings and max(p[2] for p in rings[0]) - min(p[2] for p in rings[0]) < 0.01:
                        polygons.append((rings[0][0][2], rings))
            if not zs:
                skipped += 1
                continue
            ground, top = min(zs), max(zs)
            bases = [Polygon([(x,y) for x,y,_ in rings[0]], [[(x,y) for x,y,_ in hole] for hole in rings[1:]]) for z,rings in polygons if abs(z-ground)<0.02]
            if not bases or top <= ground:
                skipped += 1
                continue
            shape = unary_union(bases)
            if not shape.is_valid:
                shape = shape.buffer(0)
            if shape.is_empty or shape.geom_type not in ('Polygon', 'MultiPolygon'):
                skipped += 1
                continue
            gid = obj.get('{'+NS['g']+'}id') or building.get('{'+NS['g']+'}id')
            height = round(top-ground, 3)
            geometry = mapping(transform(lambda x,y,z=None: CRS.transform(x,y), shape))
            # Preserve full geographic precision: rounding to 1 cm can collapse narrow parts.
            converted = read_shape(geometry)
            if not converted.is_valid:
                converted = make_valid(converted)
                if converted.geom_type == 'GeometryCollection':
                    converted = unary_union([g for g in converted.geoms if g.geom_type in ('Polygon', 'MultiPolygon')])
                geometry = mapping(converted)
            if converted.is_empty or converted.geom_type not in ('Polygon', 'MultiPolygon'):
                skipped += 1
                continue
            features.append({'type':'Feature', 'id':gid, 'properties':{'id':gid, 'height_m':height, 'ground_m':round(ground,3), 'height_source':'LoD1 solid top minus bottom', 'production':years['produktion'], 'laser':years['lsc'], 'footprints':years['basis_dlm']}, 'geometry':geometry})
    fc = {'type':'FeatureCollection','features':features}
    corners = [CRS.transform(x*1000,y*1000) for x,y in [(tile[0],tile[1]),(tile[0]+2,tile[1]),(tile[0]+2,tile[1]+2),(tile[0],tile[1]+2)]]
    meta = {'id':f'{tile[0]}_{tile[1]}', 'url':url, 'sha256':hashlib.sha256(raw).hexdigest(), 'count':len(features), 'skipped':skipped, 'years':years, 'bounds':[min(c[0] for c in corners),min(c[1] for c in corners),max(c[0] for c in corners),max(c[1] for c in corners)], 'ring':corners+[corners[0]]}
    return fc, meta

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=pathlib.Path, default=pathlib.Path('/tmp/dresden-geosn-lod1'))
    parser.add_argument('--workers',type=int,default=4)
    parser.add_argument('--center-only',action='store_true',help='Only four 2 km city-centre tiles')
    args=parser.parse_args()
    share, tiles = config()
    if args.center_only: tiles=[(410,5654),(410,5656),(412,5654),(412,5656)]
    out=ROOT/'data/buildings'; out.mkdir(parents=True,exist_ok=True); args.cache.mkdir(parents=True,exist_ok=True)
    def work(tile):
        filename=f'lod1_33{tile[0]}_{tile[1]}_2_sn_citygml.zip'
        url=f'https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/{share}/{filename}'
        path=args.cache/filename
        for attempt in range(3):
            try:
                raw=path.read_bytes() if path.exists() else get(url)
                fc, meta=convert(raw,tile,url)
                if not path.exists(): path.write_bytes(raw)
                (out/f'{meta["id"]}.geojson').write_text(json.dumps(fc,separators=(',',':')))
                print(f'{meta["id"]}: {meta["count"]} buildings, {meta["skipped"]} skipped',flush=True)
                return meta
            except Exception:
                if attempt==2: raise
                time.sleep(2)
    print(f'Downloading/converting {len(tiles)} tiles',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        metadata=list(pool.map(work,tiles))
    # Adjacent official tiles occasionally repeat the same object. Keep one copy.
    seen = set()
    for tile in metadata:
        path = out / (tile['id'] + '.geojson')
        fc = json.loads(path.read_text())
        unique = []
        for feature in fc['features']:
            if feature['id'] not in seen:
                seen.add(feature['id']); unique.append(feature)
        tile['count'] = len(unique)
        fc['features'] = unique
        path.write_text(json.dumps(fc, separators=(',', ':')))
    manifest={'source':'GeoSN', 'license':'dl-de/by-2-0', 'source_url':SOURCE, 'retrieved':datetime.date.today().isoformat(),'model':'LoD1','coverage':'Dresden municipal grid' if not args.center_only else 'City centre, four tiles', 'tiles':metadata}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Finished: {sum(t["count"] for t in metadata)} features',flush=True)
if __name__=='__main__': main()
