# Third-party content

- **Leaflet 1.9.4** (`vendor/leaflet/`): BSD-2-Clause, © Volodymyr Agafonkin. See `vendor/leaflet/LICENSE`.
- **Stadtteile Dresden** (`data/stadtteile.geojson`, `data/stadtteile.js`): derived from OpenStreetMap via
  https://github.com/offenesdresden/GeoData (relation boundaries, source tag "Kommunale Statistikstelle Dresden").
  © OpenStreetMap contributors, ODbL 1.0. Properties `code`, `bezirk`, `area_km2` were added by this project.
- **Landeshauptstadt Dresden open data** is loaded at runtime from kommisdd.dresden.de under
  Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0). Attribution: "Landeshauptstadt Dresden, opendata.dresden.de".
- **OpenStreetMap data** loaded at runtime via Overpass API: © OpenStreetMap contributors, ODbL 1.0.
- **Taipei district boundaries** (`data/taipei_districts.geojson`, `data/taipei_districts.js`) and
  **Taipei village boundaries** (`data/taipei_villages.geojson`): derived from OpenStreetMap via
  https://github.com/g0v/twgeojson (`twTown1982`, `twVillage1982`). © OpenStreetMap contributors, ODbL 1.0.
  Modified by this project: filtered to Taipei City; geometry simplified (Douglas-Peucker, ~3 m / ~4 m);
  coordinates rounded to 6 decimals; properties `code`, `official_name`, `en`, `area_geom_km2` added.
  The `area_km2` property is NOT derived from the geometry: it is the official figure published by the
  Taipei City Department of Civil Affairs (city total 271.7997 km²), because the OSM-derived outlines
  differ from the gazetted boundaries along the rivers.
- **National Land Surveying and Mapping Center (NLSC) WMTS tiles** are loaded at runtime from
  wmts.nlsc.gov.tw (layers EMAP, PHOTO2, LANDSECT, LUIMAP) under the terms of the
  國土測繪圖資服務雲 (https://maps.nlsc.gov.tw). Attribution: "內政部國土測繪中心".
- **GeoSN Saxony digital orthophotos** are loaded at runtime as WMS tiles from
  geodienste.sachsen.de (`wms_geosn_dop-rgb`) under Datenlizenz Deutschland – Namensnennung – Version 2.0
  (dl-de/by-2-0). Attribution: "Geodaten Sachsen".
- **Google Maps content** is never bundled with or proxied by this project. Google basemaps are available
  only as an opt-in layer served through the official Google Map Tiles API, using an API key that the end
  user supplies and that is stored solely in their own browser (localStorage). Tiles are requested with a
  session token as the API requires, and the copyright string returned by the viewport endpoint is displayed
  on the map. No Google tile is cached, stored, or redistributed by this project. Without a key, no Google
  basemap appears anywhere in the interface.
- **GeoSN historical topographic maps** (`wms_geosn_hist`) are loaded at runtime as WMS tiles under
  dl-de/by-2-0. Attribution: "Landesamt für Geobasisinformation Sachsen (GeoSN)".
- **Academia Sinica century-old historical maps of Taiwan** are loaded at runtime as tiles from
  gis.sinica.edu.tw (layers JM20K_1904, JM25K_1921, TM25K_1966, TM25K_1989). Use is subject to the terms
  published by the Center for GIS, RCHSS, Academia Sinica; attribution to 中央研究院人社中心GIS專題中心 is
  shown on the map. No tile is cached or redistributed by this project.
- **Visit counter**: the number shown in the sidebar footer is stored by a third-party counter service
  (Abacus, with CounterAPI as fallback). Only an integer is stored; no cookie is set and no visitor data is
  kept by this project. The counter hides itself if the services are unavailable.
- **MapLibre GL JS 5.6.1** (`vendor/maplibre/`): BSD-3-Clause. See `vendor/maplibre/LICENSE.txt`.
- **Dresden LoD1 building geometry** (`data/buildings/`): Quelle: GeoSN, dl-de/by-2-0.
  Source: https://www.geodaten.sachsen.de/downloadbereich-digitale-3d-stadtmodelle-4875.html
  License: https://www.govdata.de/dl-de/by-2-0
  Official terms: https://www.geodaten.sachsen.de/rechtsgrundlagen-und-nutzungsbedingungen-4509.html
  Modified by this project: filtered to municipality 14612000; ground surfaces unioned with courtyard holes retained;
  projected from EPSG:25833 to EPSG:4326; height derived from LoD1 solid top minus bottom;
  invalid polygon topology repaired; duplicate object IDs removed. Ground elevation is retained as metadata
  but rendered on a flat zero-height plane. Not an unmodified CityGML or LoD2 roof model.
  Per-tile original URLs, SHA-256 checksums, acquisition date and source years are in `data/buildings/manifest.json`.
