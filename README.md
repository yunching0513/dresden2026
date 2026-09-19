# Dresden × Taipei Open Data Layers｜雙城開放資料圖層

作者：Yun-Ching Wu｜吳昀慶｜D15544002@ntu.edu.tw

> 給都市規劃師的雙城概覽地圖：德勒斯登（Dresden）與臺北市可隨時切換，各自疊上官方開放資料與OpenStreetMap即時查詢，並以完全相同的OSM查詢產生跨城市可比指標。

兩市面積相近（328.8 km²對271.8 km²），人口卻相差四倍以上，是觀察密度、運具與生活機能配置差異的現成對照組。

純靜態網頁，不需後端、不需建置：開啟 `index.html`（建議用本機HTTP伺服器）或部署到GitHub Pages即可。

## 切換城市與雙城比較

標題列的城市按鈕會開啟切換視窗，點城市卡片即可換城市：圖層目錄、底圖、統計單元、市域概況、3D模型與搜尋範圍會一併切換，註記則跨城市保留。目前城市記在URL hash（`#city=…`）與瀏覽器，分享連結會帶著城市一起走。

「比較」頁籤提供四個層次：

0. **並列地圖**：左右同時開啟兩市地圖，並鎖定相同的地面比例尺。

1. **同尺度輪廓**：兩市界線以相同的公里／像素比例並排，規模差異一眼可見。
2. **基本數字**：面積、人口、密度、統計單元與海拔範圍，附倍數欄。
3. **OSM可比指標**：14項指標（學校、幼兒園、超市、便利商店、藥局、醫院、圖書館、宗教設施、遊戲場、軌道站點、公車站、共享單車站、公園綠地面積、自行車道長度），兩市跑**完全相同**的Overpass查詢，再以各市行政界線做點在多邊形內判斷，因此不會混入新北市或Radebeul等鄰接地區。可切換「每10萬人／每km²／絕對數量」，並匯出CSV。

### 並列地圖的比例尺鎖定

Web Mercator的每像素公尺數隨緯度變化：

```
m/px = 40075017 × cos(lat) / (256 × 2^zoom)
```

德勒斯登在51°N、臺北在25°N，同一個zoom看到的實際範圍相差約1.44倍。並列模式因此依兩圖中心緯度即時換算右圖的zoom：

```
z_臺北 = z_德勒斯登 + log2( cos(lat_臺北) / cos(lat_德勒斯登) ) ≈ z_德勒斯登 + 0.53
```

兩側的比例尺條與「1 px等於幾公尺」永遠一致，街廓大小可以直接目測比較。並列模式可勾選共同圖層（以相同的OSM查詢在兩側各畫一次）、切換底圖、開啟同步平移，狀態會寫進分享連結，也可直接列印。

指標結果存在瀏覽器localStorage，重新整理不會重跑。OSM由志願者維護，兩地標記習慣與完整度不同（例如臺北的便利商店、德勒斯登的Kleingarten），指標適合看數量級與結構差異，不適合當官方統計引用。

## 3D 城市建築量體

新訪客預設進入 3D，可隨時切回原有 2D 圖台。提供高度分色／白模、傾斜與旋轉、地點捷徑、建築查詢，並保存 3D 分享視角。兩市的資料來源不同：

| 城市 | 來源 | 說明 |
|---|---|---|
| 德勒斯登 | GeoSN 官方 LoD1 | 市域建築分成 117 個區塊隨站附帶，按視野載入；官方方塊量體，保留中庭與建築部分，沒有坡屋頂或地形起伏。詳見 [資料來源、授權與重建方式](docs/3D-DATA.md)。 |
| 臺北市 | OpenStreetMap 輪廓 | 放大至 z15 以上時向 Overpass 即時查詢建築輪廓；高度優先取 `height` 標籤，其次以樓層數 × 3.2 公尺推估，皆無則代入 9 公尺。**高度為推估值，不可作為法定高度或日照分析依據。** |

WMS、官方圖磚與一般向量圖層可疊在 3D；CSV 分級設色、WMS 屬性查詢與列印使用 2D。

## 功能

| 頁籤 | 內容 |
|---|---|
| **圖層** | 每市各七大主題、各40個圖層：行政區與統計單元／土地使用與都市計畫／住宅與開發／交通與運具／公共設施與生活機能／環境、綠地與地形／水系與洪水風險。每個圖層標示來源（官方WMS、官方圖磚、OSM、附帶）、授權、說明與載入狀態。 |
| **比較** | 雙城同尺度輪廓、基本數字與14項OSM可比指標，可切換正規化方式並匯出CSV。 |
| **概況** | 市域關鍵數字（面積、人口、行政分區、海拔、FNP生效日等）與六個「規劃情境」一鍵套用圖層組合：市域概況、法定計畫與開發壓力、生活機能（15分鐘城市）、運具供給、綠地與環境、洪水與地形風險。 |
| **統計** | 點任一分區顯示面積與各設施數（含每km²密度）。德勒斯登可再彙整為Stadtbezirk／Ortschaft；臺北為12行政區。 |
| **註記** | 在2D或3D地圖上落Pin、畫路線、畫範圍，填寫標題、類別（觀察／問題點／機會點／提案／待查證…）、顏色與說明；自動計算長度、面積與所在Stadtteil。註記保存在瀏覽器localStorage，可匯出／匯入GeoJSON、匯出Markdown摘要。 |
| **歷史地圖** | 圖層目錄中的「歷史地圖」群組：德勒斯登接GeoSN歷史地形圖WMS（Messtischblatt 1922–1945、東德TK25 1976–1989、TK25 1990–1996），臺北接中央研究院百年歷史地圖圖磚（1904臺灣堡圖、1921與1966、1989地形圖）。搭配「捲簾比較」可左右拉線對照現況。 |
| **資料** | 貼上或上傳CSV（德勒斯登：opendata.dresden.de的「Einwohner ab Stadtteil」；臺北：data.taipei的「各區土地人口按月別」）以代碼或名稱對應分區，產生五分位choropleth；加入官方WMS（德勒斯登可用NodeId）；加入GeoJSON（URL或檔案）。 |

「捲簾比較」在「圖層」頁籤的工具列：開啟後地圖上出現一條可拖曳的直線，線左邊顯示已開啟的WMS與圖磚圖層（歷史地圖、正射影像等），右邊只顯示底圖，向量圖層不受影響。列印時捲簾狀態會保留，把手不會印出來。

其他：搜尋（Stadtteil本地比對＋Nominatim地址）、點擊地圖查詢官方WMS屬性（GetFeatureInfo）、WMS圖例、OSM圖層匯出GeoJSON、URL hash保存檢視（可分享）、列印。

## 資料來源與授權

| 來源 | 取得方式 | 授權 |
|---|---|---|
| Landeshauptstadt Dresden開放資料（kommisdd.dresden.de OGC服務） | 瀏覽器即時載入WMS，以 `NodeId` 對應 [opendata.dresden.de](https://opendata.dresden.de)資料集 | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0)，需標示「Landeshauptstadt Dresden」 |
| OpenStreetMap | 瀏覽器透過Overpass API即時查詢 | [ODbL](https://www.openstreetmap.org/copyright) |
| Stadtteile界線（`data/stadtteile.geojson`） | 取自 [offenesdresden/GeoData](https://github.com/offenesdresden/GeoData)（OSM轉繪，來源標示Kommunale Statistikstelle Dresden） | ODbL |
| 內政部國土測繪中心（wmts.nlsc.gov.tw） | 瀏覽器載入WMTS圖磚：通用版電子地圖（EMAP）、正射影像（PHOTO2）、地籍段籍圖（LANDSECT）、國土利用現況調查（LUIMAP） | 國土測繪圖資服務雲使用規範 |
| 臺北市行政區界線（`data/taipei_districts.geojson`） | 取自 [g0v/twgeojson](https://github.com/g0v/twgeojson)（OSM轉繪）；面積欄位改用臺北市政府民政局公告值 | ODbL |
| 臺北市里界（`data/taipei_villages.geojson`） | 同上，共449里 | ODbL |
| 底圖 | CARTO Positron／Dark、OpenStreetMap、OpenTopoMap、NLSC通用版電子地圖與正射影像 | 各自條款 |

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

### 臺北市官方圖磚（NLSC WMTS）

| 圖層 | 代碼 | 用途 |
|---|---|---|
| 通用版電子地圖 | EMAP | 底圖（臺北預設） |
| 正射影像 | PHOTO2 | 底圖 |
| 地籍段籍圖 | LANDSECT | 疊圖，z15以上才有內容 |
| 國土利用現況調查 | LUIMAP | 疊圖，可與都市計畫分區對照 |

圖磚網址格式：`https://wmts.nlsc.gov.tw/wmts/{代碼}/default/GoogleMapsCompatible/{z}/{y}/{x}`。

## 底圖與授權

| 底圖 | 來源 | 授權與標示 |
|---|---|---|
| OpenStreetMap、CARTO Positron／Dark | OSM contributors／CARTO | ODbL；需標示「© OpenStreetMap contributors」 |
| OpenTopoMap | OpenTopoMap | CC-BY-SA |
| 通用版電子地圖、正射影像（臺北預設） | 內政部國土測繪中心WMTS（EMAP、PHOTO2） | 國土測繪圖資服務雲使用規範；標示「內政部國土測繪中心」 |
| 正射影像（德勒斯登） | GeoSN薩克森 `wms_geosn_dop-rgb` | dl-de/by-2-0；標示「Geodaten Sachsen」 |
| Google 街道圖／衛星影像／衛星＋街道（選用） | Google Map Tiles API | 需自備API金鑰與帳務；標示由viewport端點取得後自動顯示 |

「官方正射影像」在並列模式中會讓兩側各自使用自己國家的官方影像，兩市仍維持相同的地面比例尺。

### Google底圖：填入金鑰才啟用

Google Maps的圖磚**不能**直接接進Leaflet或MapLibre：Google Maps Platform的條款禁止以官方API以外的方式取得圖磚，也禁止預取與快取，並限制把Google的內容顯示在非Google的地圖上。直接指向 `mt*.google.com/vt/` 的作法違反條款，因此本專案不採用。

本專案走官方的 **Map Tiles API**，做成選用底圖：

1. 在Google Cloud Console啟用Map Tiles API與帳務，建立API金鑰，並限制金鑰可用的HTTP referrer。
2. 在「資料」頁籤貼上金鑰。金鑰只存在該瀏覽器的localStorage，不會寫進本repo，也不會傳給第三方。
3. 底圖選單（含並列模式）會出現Google街道圖、衛星影像與衛星＋街道；不填金鑰則完全不出現。

實作上依條款要求處理三件事：以 `POST /v1/createSession` 取得session token（依地圖類型與語系各一組，德勒斯登用de-DE、臺北用zh-TW），圖磚走 `/v1/2dtiles/{z}/{x}/{y}?session=…&key=…`，並以viewport端點回傳的 `copyright` 字串即時更新圖上的著作權標示。session token在底圖真的被選用時才申請，沒選到的不會用掉配額。

計費屬Essentials級SKU，有每月免費額度；2025年3月起Google已取消舊的每月200美元抵用額，改為各SKU分別計算。另一條路徑是Maps JavaScript API（由Google自己的引擎繪圖），但本專案的向量圖層就得整組改寫成Google的overlay，沒有採用。

### 學術使用的界線

- **論文插圖**：依Google的Geo Guidelines，教育與非商業用途的截圖不需另外申請授權，但必須保留圖上的「Google」與資料提供者標示（例如「Map data ©2026 Google」），且不得裁掉或塗改標示。投稿前仍建議確認目標期刊的圖片授權規定。
- **重製與衍生**：不能把Google的影像或圖磚存下來重新散布，也不能用來描繪向量圖資再宣稱為自己的資料。要做數化或量測，請改用官方正射影像（上表兩個來源皆可自由使用並標示來源）。
- **本專案的建議**：分析與出圖都用官方正射影像與OSM，來源、年份與授權都能寫進圖說，審查與再現性上都比較乾淨。

### 歷史地圖的來源與授權

| 城市 | 來源 | 授權與標示 |
|---|---|---|
| 德勒斯登 | GeoSN `wms_geosn_hist`：`adv_tk25mb`（Messtischblatt，1922–1945）、`adv_tk25as`（TK25 DDR，1976–1989）、`adv_tk25h`（TK25，1990–1996） | dl-de/by-2-0；標示「Landesamt für Geobasisinformation Sachsen (GeoSN)」 |
| 臺北市 | 中央研究院人社中心GIS專題中心「百年歷史地圖」圖磚：`JM20K_1904`、`JM25K_1921`、`TM25K_1966`、`TM25K_1989` | 依中研院公告之使用規範（學術與非商業使用，需標示來源） |

德勒斯登的歷史圖層同時指定 `layers` 與 `layerHint`：程式先讀GetCapabilities，優先取名稱完全相符者、其次取包含hint者；該服務不允許跨域讀取GetCapabilities，因此實際上會退回 `layers` 指定的官方名稱。圖磚本身是以 `<img>` 載入，不受跨域限制影響。每個WMS圖層的說明區都有 `LAYERS` 欄位，服務改版或名稱不符時可直接修改後按「套用」重載，不必等程式更新。中研院圖磚樣板為 `https://gis.sinica.edu.tw/tileserver/file-exists.php?img={圖層}-jpg-{z}-{x}-{y}`，其他圖層可在其網站查到代碼後，於「資料」頁籤的「加入圖磚圖層」貼入。

自行校正的掃描圖（Map Warper、Allmaps等）產生的XYZ樣板同樣可從該處加入，適合把自己數化的都市計畫圖或空照圖帶進來對照。

## 已知限制

- 附帶的Stadtteile為OSM轉繪版本，共61區，缺Langebrück/Schönborn、Cossebaude/Mobschatz/Oberwartha、Gompitz/Altfranken三個Ortschaft；面積為近似值。
- 臺北里界為OSM轉繪的1982年版編組，共449里，與現行編組（含2018年調整）有出入，僅供概覽；行政區界線亦為OSM轉繪，但面積欄位採民政局公告值（全市271.7997 km²）。
- 臺北市的土地使用分區、都市更新地區等法定計畫目前沒有穩定的公開OGC服務，目錄中以連結導向都發局查詢系統；NLSC圖磚的圖層代碼若日後調整，需更新 `js/catalog-taipei.js`。
- 雙城比較的分母：德勒斯登為主要居所登記人口（2025年12月31日，571,510人），臺北市為戶籍人口（2026年7月，約242萬人），統計基準不同；臺北日間活動人口另含大量新北通勤者，「每10萬人」會低估實際使用強度。
- 薩克森的WMS（正射影像 `sn_dop_020`、歷史地形圖 `adv_tk25*`）不允許跨域讀取GetCapabilities，程式改用目錄中寫死的官方圖層名稱；若日後服務改名，於圖層說明區的 `LAYERS` 欄位修改即可。
- 公園綠地面積指標只計OSM的way物件，以relation（multipolygon）繪製的公園未納入；自行車道長度以整條way計入其中心點所在城市。
- 官方WMS圖層名稱會嘗試以GetCapabilities自動偵測；若服務不允許跨域讀取，則以NodeId作為圖層名稱，並在WMS 1.3.0失敗時自動退回1.1.1。無法顯示時，請在「資料」頁籤手動填入 `LAYERS`。
- GetFeatureInfo若受跨域限制，會提供「在新分頁開啟查詢結果」連結。
- 設施數以OSM物件中心點落入分區計算，屬概覽性質；正式統計請以Kommunale Statistikstelle的Stadtteilkatalog為準。
- Overpass為公共服務，大型圖層（森林、住宅用地）需數秒，且有速率限制；結果會在同一頁面內快取。

## 造訪人次

側欄底部顯示累計造訪人次。本站是純靜態網站、沒有自己的後端，因此數字存在外部計數服務（`js/visits.js`）：

- 依序嘗試 [Abacus](https://abacus.jasoncameron.dev)、[CounterAPI](https://counterapi.dev)，第一個回應成功的會記在瀏覽器中，之後優先使用。
- 同一瀏覽器每天只計一次，其餘時候只讀取數字。
- 服務全部失效時計數器自動隱藏，不顯示錯誤，也不影響地圖功能。

**隱私**：這些服務只保存一個累計數字，不設cookie、不做跨站追蹤；但與任何網路請求一樣，服務端會看到來訪者的IP。若不希望有第三方參與，有兩個替代作法：

1. **Vercel Web Analytics**：官方、無cookie，數字在Vercel後台，不會顯示在頁面上。
2. **自架計數端點**：在Vercel加一個函式（`api/visits`）搭配KV或Blob儲存，把 `js/visits.js` 的 `PROVIDERS` 換成自己的端點即可，資料完全留在自己的帳號。

## 本機執行

```bash
git clone https://github.com/yunching0513/dresden2026.git
cd dresden2026
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

前端免建置；Leaflet 1.9.4 與 MapLibre GL JS 5.6.1 已放在 `vendor/`，3D 引擎於開啟時才載入。建築資料隨站提供，底圖與 WMS 需網路。

## 部署到GitHub Pages

`.github/workflows/pages.yml` 會在推送到 `main`、`claude/taipei-dresden-compare` 或 `claude/dresden-opendata-layer-309sn8` 時自動部署整個repo為靜態站。Source需在repo Settings → Pages設為「GitHub Actions」。

注意：`github-pages` 環境預設只允許**預設分支**部署。若要讓 `claude/taipei-dresden-compare` 上線，需二擇一：

- Settings → General → Default branch 改為 `claude/taipei-dresden-compare`；或
- Settings → Environments → `github-pages` → Deployment branches 加入該分支。

## 專案結構

```
index.html                    版面與七個頁籤
css/app.css                   樣式（含列印與行動版）
js/cities.js                  城市設定：中心、bbox、統計單元、底圖、市域數字、3D模式、比較指標
js/catalog.js                 德勒斯登圖層目錄、規劃情境、市域概況
js/catalog-taipei.js          臺北市圖層目錄、規劃情境、市域概況
js/app.js                     地圖、圖層載入（WMS／WMTS／Overpass／GeoJSON）、統計、CSV、搜尋、城市切換、hash狀態
js/compare.js                 城市切換視窗與雙城比較（同尺度輪廓、基本數字、OSM指標）
js/split.js                   並列雙城地圖（左右兩張圖、鎖定相同地面比例尺、共同圖層）
js/googletiles.js             選用的Google底圖（Map Tiles API；金鑰由使用者自備，存在瀏覽器）
js/swipe.js                   捲簾比較（以clip-path裁切WMS與圖磚圖層）
js/annotate.js                註記工具（Pin／線／範圍、編輯、localStorage、匯入匯出）
js/buildings3d.js             3D建築量體（MapLibre GL；GeoSN LoD1 或 OSM即時查詢）
js/geo.js                     point-in-polygon、面積、分位數等幾何工具
data/stadtteile.geojson       Dresden Stadtteile界線（.js為同內容的全域變數版）
data/taipei_districts.geojson 臺北市12行政區（.js為同內容的全域變數版）
data/taipei_villages.geojson  臺北市449里（開啟圖層時才抓取）
vendor/leaflet/               Leaflet 1.9.4（BSD-2-Clause）
```

要新增城市，在 `js/cities.js` 加一組設定並提供對應的目錄檔即可；比較指標定義也在同一個檔案。

### 新增圖層

在 `js/catalog.js`（德勒斯登）或 `js/catalog-taipei.js`（臺北）的 `layers` 陣列加入一筆：

```js
// 官方WMS
{ id: 'laerm', group: 'umwelt', type: 'wms', nodeId: 1234, name: 'Lärmkartierung', desc: '…', source: 'Landeshauptstadt Dresden', license: 'dl-de/by-2-0', color: '#8e44ad' }
// OSM點資料
{ id: 'osm_cinema', group: 'daseins', type: 'overpass', geom: 'point', name: '電影院', query: 'nwr["amenity"="cinema"]({{bbox}});', source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', radius: 4 }
```
