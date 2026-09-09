# Dresden Open Data Layers｜德勒斯登開放資料圖層

> 給都市規劃師的德勒斯登（Dresden）概覽地圖：把 Landeshauptstadt Dresden 的官方開放資料（WMS）、OpenStreetMap 的即時查詢，以及 Stadtteil 統計分區骨架疊在同一張圖上，附分區統計與 CSV choropleth。

純靜態網頁，不需後端、不需建置：開啟 `index.html`（建議用本機 HTTP 伺服器）或部署到 GitHub Pages 即可。

## 功能

| 頁籤 | 內容 |
|---|---|
| **圖層** | 七大主題、40 個圖層：行政區與統計單元／土地使用與都市計畫／住宅、人口與開發動態／交通與運具／公共設施與生活機能／環境、綠地與地形／水系與洪水風險。每個圖層標示來源（官方 WMS、OSM、附帶）、授權、說明與載入狀態。 |
| **概況** | 市域關鍵數字（面積、人口、行政分區、海拔、FNP 生效日等）與六個「規劃情境」一鍵套用圖層組合：市域概況、法定計畫與開發壓力、生活機能（15 分鐘城市）、運具供給、綠地與環境、洪水與地形風險。 |
| **統計** | 點任一 Stadtteil 顯示面積、所屬 Stadtbezirk／Ortschaft 與各設施數（含每 km² 密度）；表格可依 Stadtteil 或彙整為 Stadtbezirk 排序。 |
| **資料** | 貼上或上傳 CSV（如 opendata.dresden.de 的「Einwohner ab Stadtteil」）以代碼或名稱對應 Stadtteil，產生五分位 choropleth；以 NodeId 加入任何官方 WMS 資料集；加入 GeoJSON（URL 或檔案）。 |

其他：搜尋（Stadtteil 本地比對＋Nominatim 地址）、點擊地圖查詢官方 WMS 屬性（GetFeatureInfo）、WMS 圖例、OSM 圖層匯出 GeoJSON、URL hash 保存檢視（可分享）、列印。

## 資料來源與授權

| 來源 | 取得方式 | 授權 |
|---|---|---|
| Landeshauptstadt Dresden 開放資料（kommisdd.dresden.de OGC 服務） | 瀏覽器即時載入 WMS，以 `NodeId` 對應 [opendata.dresden.de](https://opendata.dresden.de) 資料集 | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0)，需標示「Landeshauptstadt Dresden」 |
| OpenStreetMap | 瀏覽器透過 Overpass API 即時查詢 | [ODbL](https://www.openstreetmap.org/copyright) |
| Stadtteile 界線（`data/stadtteile.geojson`） | 取自 [offenesdresden/GeoData](https://github.com/offenesdresden/GeoData)（OSM 轉繪，來源標示 Kommunale Statistikstelle Dresden） | ODbL |
| 底圖 | CARTO Positron／Dark、OpenStreetMap、OpenTopoMap | 各自條款 |

### 官方 WMS 圖層與 NodeId

下列 NodeId 在 GovData、Geoportal Sachsen 等公開索引中確認過對應的資料集名稱：

| 圖層 | NodeId |
|---|---|
| Stadtgrenze 市界 | 3 |
| Bebauungspläne 建築計畫範圍 | 489 |
| Bewohnerparkgebiete 住戶停車管理區 | 789 |
| Landschaftsschutzgebiete 景觀保護區 | 21 |
| Grünes Dresden（公園、花園、墓園） | 300 |
| Spezifisches Grünvolumen pro Nettoteilblock 2009 | 1041 |
| Digitales Geländemodell (DGM) | 1459 |
| DGM1 Schummerung farbig | 1463 |
| Fließgewässer 河川 | 202 |
| Elbe 650 cm Pegel Dresden，potentiell überschwemmte Flächen（Modell 2017） | 1373 |

Flächennutzungsplan（FNP 2020）、Lärmkartierung、Klimafunktionskarte、Kulturdenkmale、Sanierungsgebiete 等資料集的 NodeId 請在 opendata.dresden.de 的資料集頁面複製 WMS 連結，於「資料」頁籤加入；目錄可在 `js/catalog.js` 直接擴充。

## 已知限制

- 附帶的 Stadtteile 為 OSM 轉繪版本，共 61 區，缺 Langebrück/Schönborn、Cossebaude/Mobschatz/Oberwartha、Gompitz/Altfranken 三個 Ortschaft；面積為近似值。
- 官方 WMS 圖層名稱會嘗試以 GetCapabilities 自動偵測；若服務不允許跨域讀取，則以 NodeId 作為圖層名稱，並在 WMS 1.3.0 失敗時自動退回 1.1.1。無法顯示時，請在「資料」頁籤手動填入 `LAYERS`。
- GetFeatureInfo 若受跨域限制，會提供「在新分頁開啟查詢結果」連結。
- 設施數以 OSM 物件中心點落入分區計算，屬概覽性質；正式統計請以 Kommunale Statistikstelle 的 Stadtteilkatalog 為準。
- Overpass 為公共服務，大型圖層（森林、住宅用地）需數秒，且有速率限制；結果會在同一頁面內快取。

## 本機執行

```bash
git clone https://github.com/yunching0513/dresden2026.git
cd dresden2026
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

無外部相依；Leaflet 1.9.4 已放在 `vendor/leaflet/`。

## 部署到 GitHub Pages

`.github/workflows/pages.yml` 會在推送到 `main` 時自動部署整個 repo 為靜態站。首次使用請在 repo Settings → Pages 將 Source 設為「GitHub Actions」。

## 專案結構

```
index.html            版面與四個頁籤
css/app.css           樣式（含列印與行動版）
js/catalog.js         圖層目錄、規劃情境、市域概況（要新增圖層改這裡）
js/app.js             地圖、圖層載入（WMS／Overpass／GeoJSON）、統計、CSV、搜尋、hash 狀態
js/geo.js             point-in-polygon、面積、分位數等幾何工具
data/stadtteile.js    Stadtteile 界線（含 code、bezirk、area_km2）
data/stadtteile.geojson  同上，GeoJSON 版
vendor/leaflet/       Leaflet 1.9.4（BSD-2-Clause）
```

### 新增圖層

在 `js/catalog.js` 的 `layers` 陣列加入一筆：

```js
// 官方 WMS
{ id: 'laerm', group: 'umwelt', type: 'wms', nodeId: 1234, name: 'Lärmkartierung', desc: '…', source: 'Landeshauptstadt Dresden', license: 'dl-de/by-2-0', color: '#8e44ad' }
// OSM 點資料
{ id: 'osm_cinema', group: 'daseins', type: 'overpass', geom: 'point', name: '電影院', query: 'nwr["amenity"="cinema"]({{bbox}});', source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', radius: 4 }
```
