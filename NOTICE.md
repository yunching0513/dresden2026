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
