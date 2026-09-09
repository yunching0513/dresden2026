"""Validate the delivered city dataset, independent of the conversion implementation."""
import json, pathlib, math
from shapely.geometry import shape
root=pathlib.Path(__file__).resolve().parents[1]/'data/buildings'
manifest=json.loads((root/'manifest.json').read_text())
seen=set(); holes=0; maximum=0; years=set()
for tile in manifest['tiles']:
    fc=json.loads((root/(tile['id']+'.geojson')).read_text())
    assert len(fc['features'])==tile['count']
    for f in fc['features']:
        assert f['id'] not in seen, f['id']
        seen.add(f['id'])
        geometry=shape(f['geometry'])
        assert geometry.is_valid and not geometry.is_empty, f['id']
        west,south,east,north=geometry.bounds
        assert 13.4<west<east<14.1 and 50.8<south<north<51.3, f['id']
        height=f['properties']['height_m']
        assert math.isfinite(height) and 0<height<400, (f['id'],height)
        maximum=max(maximum,height)
        years.add(f['properties']['production'])
        polygons=[geometry] if geometry.geom_type=='Polygon' else geometry.geoms
        holes+=sum(len(p.interiors) for p in polygons)
assert holes>0, 'Courtyards must be retained'
assert len(seen)>100000, 'Expected city-wide coverage'
print(f'PASS: {len(seen):,} unique objects, {len(manifest["tiles"])} tiles, {holes:,} holes retained; max {maximum} m; production years {sorted(years)}')
