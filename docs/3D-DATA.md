# Dresden 建築量體資料與 3D 圖台

## 已串接

使用 **GeoSN 官方 LoD1 CityGML**，依官方批次下載頁的 Dresden 行政區網格取得 117 個 2 km × 2 km 區塊，保留 `Gemeindeschluessel=14612000` 的建築與建築部分。網格覆蓋範圍包含邊界外土地，但輸出物件按官方市鎮代碼篩選；不是僅用原專案不完整的 61 個 Stadtteile 篩選。

- 官方模型下載：https://www.geodaten.sachsen.de/downloadbereich-digitale-3d-stadtmodelle-4875.html
- 官方批次下載與網格：https://www.geodaten.sachsen.de/batch-download-4719.html
- LoD1 / LoD2 說明：https://www.geodaten.sachsen.de/digitale-hoehenmodelle-3994.html
- 授權：https://www.geodaten.sachsen.de/rechtsgrundlagen-und-nutzungsbedingungen-4509.html
- 署名：**GeoSN, dl-de/by-2-0**。

`data/buildings/manifest.json` 記錄每個區塊的下載網址、原 ZIP SHA-256、模型製作／雷射／輪廓／地形年份、筆數與範圍。下載日不是測量日。當前資料模型製作年份為 2021–2024，雷射年份為 2016、2017、2019；不得稱為「2026 現況建築」。

## 表現與限制

MapLibre 以 `fill-extrusion` 呈現真實輪廓與 LoD1 模型高度，1:1 公尺比例。高度取同一建築 solid 的最高點減最低點，不以樓層數或任意預設值補高。中庭、複合輪廓及建築部分保留，跨區塊重複 ID 僅保留一份。高度是模型方塊高度，不代表尖塔頂點、精確簷高或實測現況高度。

地面統一放在 0 m；原地面高程保留於 `ground_m`，目前**沒有地形起伏**。不能以此判讀淹水深度、絕對屋頂高程、精確陰影或真實建築體積。LoD1 沒有坡屋頂和立面材質。

每次最多載入與視野相交的 16 個鄰近區塊，移出視野即釋放；縮小至 zoom < 13 時只顯示網格。大型視野不是所有可見區塊同時顯示。建築檔案由網站本身提供，不依賴公用 Overpass 服務，也不需要 API key。外部 OSM 底圖和原 WMS 仍需網路與供應方服務可用。

既有 WMS 以 EPSG:3857 GetMap 貼至地面，GeoJSON 設施／界線同步至 3D。CSV 分級設色、WMS 點選屬性與列印使用原有 2D；3D 點選提供建築高度及資料年份。現有外部圖層若不支援 CORS，可能在 3D 無法顯示。

## LoD2 的後續串接路徑

同一官方下載入口也提供 **LoD2 CityGML**，保留標準屋頂形狀。真正顯示屋頂須將完整屋頂／牆面／地面多邊形轉成 glTF / 3D Tiles，再接入 3D Tiles renderer 或 Cesium；不能把 `fill-extrusion` 換成較高方塊就稱為 LoD2。本版不包含這項轉換。

另已找到 [GovData 的 Dresden LoD2 / OGC API 3D GeoVolumes 資料目錄](https://data.gov.de/suche/daten/gebaudemodell-in-lod2-der-stadt-dresden)，內容標示來自 GeoSN DGM1 與 LoD2。該目錄不能直接當成可用的 tileset URL，因此本版採用已實際下載驗證的 GeoSN 資料。

## 重建與驗證

網站維持純靜態、免建置；Python 僅用於資料更新，Node / Playwright 僅用於開發驗證。

```sh
python3 -m pip install -r scripts/requirements.txt
python3 scripts/build-buildings.py
python3 tests/buildings.py
python3 -m http.server 8000
# 另一個終端；需要 Google Chrome
npm install
npm test
```

ZIP 快取預設 `/tmp/dresden-geosn-lod1`，可用 `--cache` 指定永久目錄。重建會先產出全部區塊，成功後才寫入 manifest；不應直接在對外提供服務的目錄執行。`--center-only` 僅供快速試作，會改成四個市中心區塊，正式更新請使用預設全市模式。
