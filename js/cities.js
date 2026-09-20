/* cities.js：城市設定。把「德勒斯登版」擴充為可切換的雙城圖台。
 *
 * 每個城市提供：空間骨架（統計單元界線）、底圖、圖層目錄（js/catalog*.js）、
 * 市域概況數字、3D城市模型的資料來源，以及可跨城市比較的OSM指標定義。
 *
 * 比較指標刻意使用「完全相同的OSM查詢」在兩市各跑一次，
 * 再以各市行政界線做點在多邊形內判斷，避免bbox外圍（如新北市、Radebeul）混入。
 */
(function () {
  'use strict';

  const CARTO = {
    positron: { name: 'Positron（淺色）', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', opts: { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/">CARTO</a>' } },
    osm: { name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
    dark: { name: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', opts: { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO' } },
    topo: { name: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', opts: { maxZoom: 17, attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' } },
  };

  /* 官方正射影像：兩市各用自己的國家級來源，授權清楚、可直接在論文中引用。
   * Google的圖磚不能這樣接（見README「底圖與授權」），因此不列入選單。 */
  const DOP_SACHSEN = {
    name: '正射影像（GeoSN 薩克森）',
    wms: true,
    url: 'https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest?',
    fallbackLayers: 'sn_dop_020',
    opts: { format: 'image/png', transparent: false, version: '1.3.0', maxZoom: 19,
      attribution: '© <a href="https://www.geodaten.sachsen.de">Geodaten Sachsen</a>（dl-de/by-2-0）' },
  };

  const NLSC_EMAP = { name: '通用版電子地圖（國土測繪中心）', url: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', opts: { maxZoom: 19, attribution: '<a href="https://maps.nlsc.gov.tw">內政部國土測繪中心</a> 通用版電子地圖' } };
  const NLSC_PHOTO = { name: '正射影像（國土測繪中心）', url: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}', opts: { maxZoom: 19, attribution: '<a href="https://maps.nlsc.gov.tw">內政部國土測繪中心</a> 正射影像' } };

  /* 跨城市可比指標：兩市跑同一段Overpass查詢。
   * kind：count＝物件數；area＝面積（ha）；length＝長度（km）。 */
  const indicators = [
    { id: 'school', name: '學校', kind: 'count', per: 'pop', query: 'nwr["amenity"="school"]({{bbox}});', note: '含各級學校（不含幼兒園）。' },
    { id: 'kindergarten', name: '幼兒園／托育', kind: 'count', per: 'pop', query: 'nwr["amenity"="kindergarten"]({{bbox}});', note: 'Kita與幼兒園、托嬰中心。' },
    { id: 'supermarket', name: '超市', kind: 'count', per: 'pop', query: 'nwr["shop"="supermarket"]({{bbox}});', note: '日常採買的主力業態。' },
    { id: 'convenience', name: '便利商店', kind: 'count', per: 'pop', query: 'nwr["shop"="convenience"]({{bbox}});', note: '台灣密度全球數一數二，德國幾乎不存在此業態，可看出生活支援體系的差異。' },
    { id: 'pharmacy', name: '藥局', kind: 'count', per: 'pop', query: 'nwr["amenity"="pharmacy"]({{bbox}});' },
    { id: 'hospital', name: '醫院', kind: 'count', per: 'pop', query: 'nwr["amenity"="hospital"]({{bbox}});', note: '不含一般診所。' },
    { id: 'library', name: '圖書館', kind: 'count', per: 'pop', query: 'nwr["amenity"="library"]({{bbox}});' },
    { id: 'worship', name: '宗教設施', kind: 'count', per: 'pop', query: 'nwr["amenity"="place_of_worship"]({{bbox}});', note: '宮廟、教堂等，反映公共空間與社區節點的文化差異。' },
    { id: 'playground', name: '兒童遊戲場', kind: 'count', per: 'pop', query: 'nwr["leisure"="playground"]({{bbox}});' },
    { id: 'railstop', name: '軌道站點', kind: 'count', per: 'pop', query: 'node["railway"~"^(station|halt|tram_stop)$"]({{bbox}});', note: '德勒斯登以電車站為主，臺北以捷運與台鐵車站為主。' },
    { id: 'busstop', name: '公車站', kind: 'count', per: 'pop', query: 'node["highway"="bus_stop"]({{bbox}});' },
    { id: 'bikeshare', name: '共享單車站', kind: 'count', per: 'pop', query: 'nwr["amenity"="bicycle_rental"]({{bbox}});', note: 'YouBike對MOBIbike。' },
    { id: 'park', name: '公園綠地面積', kind: 'area', per: 'area', geom: 'polygon', query: 'way["leisure"~"^(park|garden)$"]({{bbox}});', relQuery: 'relation["leisure"~"^(park|garden)$"]({{bbox}});', note: '僅計OSM標記為park／garden者，不含森林、河濱高灘地與校園。' },
    { id: 'cycleway', name: '自行車道長度', kind: 'length', per: 'area', geom: 'line', query: 'way["highway"="cycleway"]({{bbox}});', note: '僅計獨立自行車道，不含標線型車道。' },
  ];

  const cities = {
    dresden: {
      id: 'dresden',
      name: '德勒斯登', nameLocal: 'Dresden', en: 'Dresden',
      country: '德國 · 薩克森邦', flag: '🇩🇪', chart: '#2b7bba',
      tagline: '易北河谷的中型城市：綠地充裕、電車為骨幹',
      center: [51.05, 13.74], zoom: 12,
      bbox: [50.97, 13.57, 51.18, 13.97],
      locale: 'de',
      unit: { one: 'Stadtteil', many: 'Stadtteile', label: '統計分區', parent: 'Stadtbezirk / Ortschaft', hasParent: true },
      boundaries: () => window.DD_STADTTEILE,
      attribution: 'Datenquelle: <a href="https://opendata.dresden.de">Landeshauptstadt Dresden</a> (dl-de/by-2-0)',
      baseLayers: [CARTO.osm, CARTO.positron, DOP_SACHSEN, CARTO.dark, CARTO.topo],
      imagery: DOP_SACHSEN,
      stats: {
        area_km2: 328.8,
        population: 571510, populationAsOf: '2025-12-31',
        populationNote: '主要居所人口（Hauptwohnsitz），資料來源：Landeshauptstadt Dresden戶籍登記。',
        units: 64, unitsBundled: 64,
        elevation: [101, 383],
        greenNote: '約1/4市域為森林。',
      },
      model3d: {
        mode: 'tiles',
        title: '德勒斯登城市數位模型', sub: '官方建築量體 · GeoSN LoD1',
        attribution: '建築：<a href="https://www.geodaten.sachsen.de/downloadbereich-digitale-3d-stadtmodelle-4875.html">GeoSN</a> · <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a> · LoD1 / 平面地面',
        places: [
          { c: '13.740,51.052', title: 'Altstadt', sub: '舊城・易北河' },
          { c: '13.752,51.066', title: 'Neustadt', sub: '新城街廓' },
          { c: '13.729,51.028', title: 'TU Dresden', sub: '大學周邊' },
        ],
      },
    },

    taipei: {
      id: 'taipei',
      name: '臺北市', nameLocal: '臺北市', en: 'Taipei',
      country: '臺灣 · 直轄市', flag: '🇹🇼', chart: '#c0392b',
      tagline: '盆地中的高密度首都：捷運與巷弄混合使用',
      center: [25.045, 121.545], zoom: 12,
      bbox: [24.95, 121.45, 25.22, 121.67],
      locale: 'zh-TW',
      unit: { one: '行政區', many: '行政區', label: '行政區', parent: null, hasParent: false },
      boundaries: () => window.DD_TAIPEI_DISTRICTS,
      attribution: '界線：<a href="https://github.com/g0v/twgeojson">g0v/twgeojson</a>（OSM, ODbL）；面積：臺北市政府民政局',
      baseLayers: [NLSC_EMAP, CARTO.osm, CARTO.positron, NLSC_PHOTO, CARTO.dark, CARTO.topo],
      imagery: NLSC_PHOTO,
      stats: {
        area_km2: 271.7997,
        population: 2420000, populationAsOf: '2026-07',
        populationNote: '戶籍人口，臺北市政府民政局月報；日間活動人口另含大量通勤者。',
        units: 12, unitsBundled: 12,
        elevation: [0, 1120],
        greenNote: '市域近半為山坡地與保護區（大屯火山群、南港山系）。',
      },
      model3d: {
        mode: 'osm',
        title: '臺北城市數位模型', sub: 'OpenStreetMap建築輪廓 · 樓層推估量體',
        attribution: '建築：<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors（ODbL）· 高度由樓層數推估',
        places: [
          { c: '121.5170,25.0478', title: '臺北車站', sub: '雙子星・站區' },
          { c: '121.5645,25.0335', title: '信義計畫區', sub: '高層核心' },
          { c: '121.5100,25.0570', title: '大稻埕', sub: '老城街屋' },
          { c: '121.6070,25.0550', title: '南港', sub: '軟體與會展' },
        ],
      },
    },
  };

  const order = ['dresden', 'taipei'];
  order.forEach((id) => { cities[id].catalog = (window.DD_CATALOGS || {})[id]; });

  /* 並列地圖中兩市對應、但圖層id不同的主題 */
  const splitPairs = [
    { id: 'rail_lines', name: '軌道路網', layers: { dresden: 'osm_tram_lines', taipei: 'osm_metro_lines' } },
    { id: 'rail_stops', name: '軌道站點', layers: { dresden: 'osm_tram_stops', taipei: 'osm_metro_stops' } },
  ];

  window.DD_BASEMAPS = CARTO;
  window.DD_SPLIT_PAIRS = splitPairs;
  window.DD_CITIES = cities;
  window.DD_CITY_ORDER = order;
  window.DD_INDICATORS = indicators;
})();
