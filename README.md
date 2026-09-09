# Dresden Open Data Layers｜德勒斯登開放資料圖層

> 給都市規劃師的德勒斯登（Dresden）概覽地圖：把Landeshauptstadt Dresden的官方開放資料（WMS）、OpenStreetMap的即時查詢，以及Stadtteil統計分區骨架疊在同一張圖上，附分區統計與CSV choropleth。

純靜態網頁，不需後端、不需建置：開啟 `index.html`（建議用本機HTTP伺服器）或部署到GitHub Pages即可。

## 功能

| 頁籤 | 內容 |
|---|---|
| **圖層** | 七大主題、40個圖層：行政區與統計單元／土地使用與都市計畫／住宅、人口與開發動態／交通與運具／公共設施與生活機能／環境、綠地與地形／水系與洪水風險。每個圖層標示來源（官方WMS、OSM、附帶）、授權、說明與載入狀態。 |
| **概況** | 市域關鍵數字（面積、人口、行政分區、海拔、FNP生效日等）與六個「規劃情境」一鍵套用圖層組合：市域概況、法定計畫與開發壓力、生活機能（15分鐘城市）、運具供給、綠地與環境、洪水與地形風險。 |
| **統計** | 點任一Stadtteil顯示面積、所屬Stadtbezirk／Ortschaft與各設施數（含每km²密度）；表格可依Stadtteil或彙整為Stadtbezirk排序。 |
| **資料** | 貼上或上傳CSV（如opendata.dresden.de的「Einwohner ab Stadtteil」）以代碼或名稱對應Stadtteil，產生五分位choropleth；以NodeId加入任何官方WMS資料集；加入GeoJSON（URL或檔案）。 |

其他：搜尋（Stadtteil本地比對＋Nominatim地址）、點擊地圖查詢官方WMS屬性（GetFeatureInfo）、WMS圖例、OSM圖層匯出GeoJSON、URL hash保存檢視（可分享）、列印。

## 資料來源與授權

| 來源 | 取得方式 | 授權 |
|---|---|---|
| Landeshauptstadt Dresden開放資料（kommisdd.dresden.de OGC服務） | 瀏覽器即時載入WMS，以 `NodeId` 對應 [opendata.dresden.de](https://opendata.dresden.de)資料集 | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0)，需標示「Landeshauptstadt Dresden」 |
| OpenStreetMap | 瀏覽器透過Overpass API即時查詢 | [ODbL](https://www.openstreetmap.org/copyright) |
| Stadtteile界線（`data/stadtteile.geojson`） | 取自 [offenesdresden/GeoData](https://github.com/offenesdresden/GeoData)（OSM轉繪，來源標示Kommunale Statistikstelle Dresden） | ODbL |
| 底圖 | CARTO Positron／Dark、OpenStreetMap、OpenTopoMap | 各自條款 |

### 官方WMS圖層與NodeId

下列NodeId在GovData、Geoportal Sachsen等公開索引中確認過對應的資料集名稱：

| 圖層 | NodeId |
|---|---|
| Stadtgrenze市界 | 3 |
| Bebauungspläne建築計畫範圍 | 489 |
| Bewohnerparkgebiete住戶停車管理區 | 789 |
| Landschaftsschutzgebiete景觀保護區 | 21 |
| Grünes Dresden（公園、花園、墓園） | 300 |
| Spezifisches Grünvolumen pro Nettoteilblock 2009 | 1041 |
| Digitales Geländemodell (DGM) | 1459 |
| DGM1 Schummerung farbig | 1463 |
| Fließgewässer河川 | 202 |
| Elbe 650 cm Pegel Dresden，potentiell überschwemmte Flächen（Modell 2017） | 1373 |

Flächennutzungsplan（FNP 2020）、Lärmkartierung、Klimafunktionskarte、Kulturdenkmale、Sanierungsgebiete等資料集的NodeId請在opendata.dresden.de的資料集頁面複製WMS連結，於「資料」頁籤加入；目錄可在 `js/catalog.js` 直接擴充。

## 已知限制

- 附帶的Stadtteile為OSM轉繪版本，共61區，缺Langebrück/Schönborn、Cossebaude/Mobschatz/Oberwartha、Gompitz/Altfranken三個Ortschaft；面積為近似值。
- 官方WMS圖層名稱會嘗試以GetCapabilities自動偵測；若服務不允許跨域讀取，則以NodeId作為圖層名稱，並在WMS 1.3.0失敗時自動退回1.1.1。無法顯示時，請在「資料」頁籤手動填入 `LAYERS`。
- GetFeatureInfo若受跨域限制，會提供「在新分頁開啟查詢結果」連結。
- 設施數以OSM物件中心點落入分區計算，屬概覽性質；正式統計請以Kommunale Statistikstelle的Stadtteilkatalog為準。
- Overpass為公共服務，大型圖層（森林、住宅用地）需數秒，且有速率限制；結果會在同一頁面內快取。

## 本機執行

```bash
git clone https://github.com/yunching0513/dresden2026.git
cd dresden2026
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

無外部相依；Leaflet 1.9.4已放在 `vendor/leaflet/`。

## 部署到GitHub Pages

`.github/workflows/pages.yml` 會在推送到 `main` 時自動部署整個repo為靜態站。首次使用請在repo Settings → Pages將Source設為「GitHub Actions」。

## 專案結構

```
index.html               版面與四個頁籤
css/app.css              樣式（含列印與行動版）
js/catalog.js            圖層目錄、規劃情境、市域概況（要新增圖層改這裡）
js/app.js                地圖、圖層載入（WMS／Overpass／GeoJSON）、統計、CSV、搜尋、hash狀態
js/geo.js                point-in-polygon、面積、分位數等幾何工具
data/stadtteile.js       Stadtteile界線（含code、bezirk、area_km2）
data/stadtteile.geojson  同上，GeoJSON版
vendor/leaflet/          Leaflet 1.9.4（BSD-2-Clause）
```

### 新增圖層

在 `js/catalog.js` 的 `layers` 陣列加入一筆：

```js
// 官方WMS
{ id: 'laerm', group: 'umwelt', type: 'wms', nodeId: 1234, name: 'Lärmkartierung', desc: '…', source: 'Landeshauptstadt Dresden', license: 'dl-de/by-2-0', color: '#8e44ad' }
// OSM點資料
{ id: 'osm_cinema', group: 'daseins', type: 'overpass', geom: 'point', name: '電影院', query: 'nwr["amenity"="cinema"]({{bbox}});', source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', radius: 4 }
```
