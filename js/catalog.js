/* catalog.js：德勒斯登開放資料圖層目錄。
 *
 * 三種圖層來源：
 *  - wms：Landeshauptstadt Dresden的官方OGC服務（kommisdd.dresden.de），以NodeId指定資料集。
 *               NodeId來自opendata.dresden.de各資料集頁面的「WMS/WFS」連結；verified=true代表
 *               在公開索引（GovData、Geoportal Sachsen）中確認過此NodeId對應的資料集名稱。
 *  - overpass：OpenStreetMap，透過Overpass API在瀏覽器端即時查詢（跨域允許，最穩定）。
 *  - bundled：隨程式附帶的靜態資料（data/stadtteile.js）。
 *
 * 授權：Dresden官方資料dl-de/by-2-0（需標示「Landeshauptstadt Dresden, opendata.dresden.de」）；
 *       OSM資料ODbL（© OpenStreetMap contributors）。
 */
(function () {
  'use strict';

  const WMS_BASE = 'https://kommisdd.dresden.de/net3/public/ogc.ashx';
  const WFS_BASE = 'https://kommisdd.dresden.de/net3/public/ogcsl.ashx';

  const groups = [
    { id: 'admin', title: '行政區與統計單元', hint: 'Stadtbezirke、Ortschaften、Stadtteile：所有統計與規劃資料的空間骨架。' },
    { id: 'planung', title: '土地使用與都市計畫', hint: 'Bebauungsplan、停車管理等法定計畫與管制範圍。' },
    { id: 'wohnen', title: '住宅、人口與開發動態', hint: '開發中基地、閒置地與人口指標（可自行匯入CSV做choropleth）。' },
    { id: 'verkehr', title: '交通與運具', hint: '軌道、公車、自行車與共享運具的供給分布。' },
    { id: 'daseins', title: '公共設施與生活機能', hint: '教育、醫療、日常採買與休憩設施：檢視15分鐘生活圈的基礎。' },
    { id: 'umwelt', title: '環境、綠地與地形', hint: '保護區、公園、綠量與地形。' },
    { id: 'wasser', title: '水系與洪水風險', hint: '易北河洪氾範圍與河川。Dresden於2002、2013年皆曾遭遇重大洪水。' },
  ];

  // Overpass查詢用的Dresden範圍 (south, west, north, east)
  const BBOX = [50.97, 13.57, 51.18, 13.97];

  const layers = [
    /* ---------- 行政區 ---------- */
    {
      id: 'stadtteile', group: 'admin', type: 'bundled',
      name: 'Stadtteile統計分區（61區）', de: 'Stadtteile',
      desc: '市統計處的Stadtteil界線（OSM轉繪，缺Langebrück/Schönborn、Cossebaude、Gompitz/Altfranken三個Ortschaft）。點擊分區可看面積、所屬Stadtbezirk與各圖層設施數。',
      source: 'OpenStreetMap（offenesdresden/GeoData）', license: 'ODbL', default: true, color: '#1f4e79',
    },
    {
      id: 'stadtgrenze', group: 'admin', type: 'wms', nodeId: 3, verified: true,
      name: 'Stadtgrenze市界', de: 'Stadtgrenze',
      desc: '德勒斯登行政市界（UEK25基礎）。', source: 'Landeshauptstadt Dresden', license: 'dl-de/by-2-0', color: '#333',
    },

    /* ---------- 土地使用與計畫 ---------- */
    {
      id: 'bplan', group: 'planung', type: 'wms', nodeId: 489, verified: true, default: true,
      name: 'Bebauungspläne建築計畫範圍', de: 'Bebauungspläne',
      desc: '所有具法律效力與進行中的B-Plan範圍，含qualifizierter/einfacher B-Plan與程序狀態。點擊地圖可查詢屬性。',
      source: 'Landeshauptstadt Dresden, Stadtplanungsamt', license: 'dl-de/by-2-0', color: '#c0392b',
    },
    {
      id: 'bewohnerparken', group: 'planung', type: 'wms', nodeId: 789, verified: true,
      name: 'Bewohnerparkgebiete住戶停車管理區', de: 'Bewohnerparkgebiete',
      desc: '住戶優先停車區：觀察停車壓力與內城停車管理策略的範圍。',
      source: 'Landeshauptstadt Dresden', license: 'dl-de/by-2-0', color: '#8e44ad',
    },
    {
      id: 'fnp', group: 'planung', type: 'portal',
      name: 'Flächennutzungsplan（FNP 2020）', de: 'Flächennutzungsplan',
      desc: '2020年10月22日生效的市域土地使用計畫。此資料集的WMS NodeId未能在公開索引中確認，請至opendata.dresden.de搜尋「Flächennutzungsplan」，將其WMS連結中的NodeId填入「資料」頁籤的自訂圖層。',
      portalQuery: 'Flächennutzungsplan', source: 'Landeshauptstadt Dresden', license: 'dl-de/by-2-0', color: '#d35400',
    },

    /* ---------- 住宅與開發 ---------- */
    {
      id: 'osm_construction', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '施工中基地Baustellen', de: 'landuse=construction / building=construction',
      desc: 'OSM標記為施工中的土地與建物：目前開發熱區的即時側寫。',
      query: 'way["landuse"="construction"]({{bbox}});way["building"="construction"]({{bbox}});',
      relQuery: 'relation["landuse"="construction"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#e67e22', fill: 0.35,
    },
    {
      id: 'osm_brownfield', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '閒置／棕地Brachflächen', de: 'landuse=brownfield|greenfield',
      desc: '棕地與尚未開發的預定地：內部發展（Innenentwicklung）潛力點。',
      query: 'way["landuse"~"^(brownfield|greenfield)$"]({{bbox}});',
      relQuery: 'relation["landuse"~"^(brownfield|greenfield)$"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#7f8c8d', fill: 0.4,
    },
    {
      id: 'osm_residential', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '住宅用地Wohnbauflächen', de: 'landuse=residential',
      desc: 'OSM住宅用地範圍，用來對照Stadtteil的建成密度。資料量較大，載入需數秒。',
      query: 'way["landuse"="residential"]({{bbox}});',
      relQuery: 'relation["landuse"="residential"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#f1c40f', fill: 0.3,
    },
    {
      id: 'osm_industrial', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '工業／商業用地', de: 'landuse=industrial|commercial|retail',
      desc: '就業用地分布：可對照Silicon Saxony北部（Klotzsche）與傳統工業帶。',
      query: 'way["landuse"~"^(industrial|commercial|retail)$"]({{bbox}});',
      relQuery: 'relation["landuse"~"^(industrial|commercial|retail)$"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#9b59b6', fill: 0.3,
    },

    /* ---------- 交通 ---------- */
    {
      id: 'osm_tram_lines', group: 'verkehr', type: 'overpass', geom: 'line', default: true,
      name: '電車路網Straßenbahn', de: 'route=tram',
      desc: 'DVB電車路線：Dresden大眾運輸骨幹。',
      rawQuery: 'relation["route"="tram"]({{bbox}});way(r);out geom;',
      source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', weight: 3,
    },
    {
      id: 'osm_tram_stops', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '電車站Haltestellen (Tram)', de: 'railway=tram_stop',
      query: 'node["railway"="tram_stop"]({{bbox}});',
      desc: '電車停靠站點，用於計算各Stadtteil的軌道服務密度。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', radius: 4,
    },
    {
      id: 'osm_bus_stops', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '公車站Bushaltestellen', de: 'highway=bus_stop',
      query: 'node["highway"="bus_stop"]({{bbox}});',
      desc: '公車停靠站。', source: 'OpenStreetMap', license: 'ODbL', color: '#2980b9', radius: 3,
    },
    {
      id: 'osm_rail', group: 'verkehr', type: 'overpass', geom: 'line',
      name: '鐵路Eisenbahn', de: 'railway=rail',
      query: 'way["railway"="rail"]["service"!~"."]({{bbox}});',
      desc: '主線鐵路（不含側線）。', source: 'OpenStreetMap', license: 'ODbL', color: '#2c3e50', weight: 2,
    },
    {
      id: 'osm_stations', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '火車站Bahnhöfe', de: 'railway=station|halt',
      query: 'node["railway"~"^(station|halt)$"]["station"!="subway"]({{bbox}});',
      desc: 'S-Bahn與長途鐵路車站。', source: 'OpenStreetMap', license: 'ODbL', color: '#2c3e50', radius: 6,
    },
    {
      id: 'osm_mainroads', group: 'verkehr', type: 'overpass', geom: 'line',
      name: '主要道路Hauptstraßen', de: 'highway=motorway|trunk|primary|secondary',
      query: 'way["highway"~"^(motorway|trunk|primary|secondary)$"]({{bbox}});',
      desc: '高速公路（A4、A17）、國道與主要幹道。', source: 'OpenStreetMap', license: 'ODbL', color: '#7f8c8d', weight: 2,
    },
    {
      id: 'osm_cycleways', group: 'verkehr', type: 'overpass', geom: 'line',
      name: '自行車道Radwege', de: 'highway=cycleway',
      query: 'way["highway"="cycleway"]({{bbox}});',
      desc: '獨立自行車道（含Elberadweg）。', source: 'OpenStreetMap', license: 'ODbL', color: '#27ae60', weight: 2,
    },
    {
      id: 'osm_bike_rental', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '共享單車站Leihräder', de: 'amenity=bicycle_rental',
      query: 'nwr["amenity"="bicycle_rental"]({{bbox}});',
      desc: 'MOBIbike等共享單車站點。', source: 'OpenStreetMap', license: 'ODbL', color: '#16a085', radius: 4,
    },
    {
      id: 'osm_carsharing', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '共享汽車／MOBIpunkt', de: 'amenity=car_sharing',
      query: 'nwr["amenity"="car_sharing"]({{bbox}});',
      desc: 'teilAuto等共享汽車站點。', source: 'OpenStreetMap', license: 'ODbL', color: '#8e44ad', radius: 4,
    },
    {
      id: 'osm_charging', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '充電站Ladesäulen', de: 'amenity=charging_station',
      query: 'nwr["amenity"="charging_station"]({{bbox}});',
      desc: '電動車充電站。', source: 'OpenStreetMap', license: 'ODbL', color: '#f39c12', radius: 4,
    },

    /* ---------- 公共設施 ---------- */
    {
      id: 'osm_schools', group: 'daseins', type: 'overpass', geom: 'point', default: true,
      name: '學校Schulen', de: 'amenity=school',
      query: 'nwr["amenity"="school"]({{bbox}});',
      desc: '中小學（Grundschule、Oberschule、Gymnasium等）。', source: 'OpenStreetMap', license: 'ODbL', color: '#2980b9', radius: 5,
    },
    {
      id: 'osm_kita', group: 'daseins', type: 'overpass', geom: 'point',
      name: '幼兒園Kitas', de: 'amenity=kindergarten',
      query: 'nwr["amenity"="kindergarten"]({{bbox}});',
      desc: '托育與幼兒園：Dresden出生率長期為德國大城前段班，Kita供給是規劃焦點。', source: 'OpenStreetMap', license: 'ODbL', color: '#e84393', radius: 4,
    },
    {
      id: 'osm_university', group: 'daseins', type: 'overpass', geom: 'point',
      name: '大學與研究機構', de: 'amenity=university|college|research_institute',
      query: 'nwr["amenity"~"^(university|college|research_institute)$"]({{bbox}});',
      desc: 'TU Dresden、HTW及各研究所（Fraunhofer、Max-Planck、Helmholtz）。', source: 'OpenStreetMap', license: 'ODbL', color: '#34495e', radius: 5,
    },
    {
      id: 'osm_hospital', group: 'daseins', type: 'overpass', geom: 'point',
      name: '醫院Krankenhäuser', de: 'amenity=hospital|clinic',
      query: 'nwr["amenity"~"^(hospital|clinic)$"]({{bbox}});',
      desc: '醫院與診所。', source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', radius: 6,
    },
    {
      id: 'osm_doctors', group: 'daseins', type: 'overpass', geom: 'point',
      name: '診所／藥局', de: 'amenity=doctors|pharmacy',
      query: 'nwr["amenity"~"^(doctors|pharmacy)$"]({{bbox}});',
      desc: '基層醫療與藥局。', source: 'OpenStreetMap', license: 'ODbL', color: '#e74c3c', radius: 3,
    },
    {
      id: 'osm_supermarket', group: 'daseins', type: 'overpass', geom: 'point',
      name: '超市Supermärkte', de: 'shop=supermarket',
      query: 'nwr["shop"="supermarket"]({{bbox}});',
      desc: '日常採買：Nahversorgung的核心指標。', source: 'OpenStreetMap', license: 'ODbL', color: '#27ae60', radius: 4,
    },
    {
      id: 'osm_library', group: 'daseins', type: 'overpass', geom: 'point',
      name: '圖書館／社區中心', de: 'amenity=library|community_centre',
      query: 'nwr["amenity"~"^(library|community_centre)$"]({{bbox}});',
      desc: '公共文化與社區設施。', source: 'OpenStreetMap', license: 'ODbL', color: '#8e44ad', radius: 4,
    },
    {
      id: 'osm_playground', group: 'daseins', type: 'overpass', geom: 'point',
      name: '遊戲場Spielplätze', de: 'leisure=playground',
      query: 'nwr["leisure"="playground"]({{bbox}});',
      desc: '兒童遊戲場。', source: 'OpenStreetMap', license: 'ODbL', color: '#f39c12', radius: 3,
    },
    {
      id: 'osm_sports', group: 'daseins', type: 'overpass', geom: 'point',
      name: '運動場館', de: 'leisure=sports_centre|swimming_pool|stadium',
      query: 'nwr["leisure"~"^(sports_centre|swimming_pool|stadium)$"]({{bbox}});',
      desc: '室內外運動設施與泳池。', source: 'OpenStreetMap', license: 'ODbL', color: '#16a085', radius: 4,
    },
    {
      id: 'osm_fire_police', group: 'daseins', type: 'overpass', geom: 'point',
      name: '消防／警察', de: 'amenity=fire_station|police',
      query: 'nwr["amenity"~"^(fire_station|police)$"]({{bbox}});',
      desc: '緊急服務據點。', source: 'OpenStreetMap', license: 'ODbL', color: '#2c3e50', radius: 4,
    },

    /* ---------- 環境與地形 ---------- */
    {
      id: 'osm_parks', group: 'umwelt', type: 'overpass', geom: 'polygon',
      name: '公園綠地Parks', de: 'leisure=park|garden',
      query: 'way["leisure"~"^(park|garden)$"]({{bbox}});',
      relQuery: 'relation["leisure"~"^(park|garden)$"]({{bbox}});',
      desc: '公園與花園（含Großer Garten）。', source: 'OpenStreetMap', license: 'ODbL', color: '#27ae60', fill: 0.4,
    },
    {
      id: 'osm_allotments', group: 'umwelt', type: 'overpass', geom: 'polygon',
      name: '市民農園Kleingärten', de: 'landuse=allotments',
      query: 'way["landuse"="allotments"]({{bbox}});',
      relQuery: 'relation["landuse"="allotments"]({{bbox}});',
      desc: 'Dresden有超過350個Kleingartenverein，是東德城市特色綠地型態。', source: 'OpenStreetMap', license: 'ODbL', color: '#7dcea0', fill: 0.4,
    },
    {
      id: 'osm_forest', group: 'umwelt', type: 'overpass', geom: 'polygon',
      name: '森林Wald', de: 'landuse=forest / natural=wood',
      query: 'way["landuse"="forest"]({{bbox}});way["natural"="wood"]({{bbox}});',
      relQuery: 'relation["landuse"="forest"]({{bbox}});relation["natural"="wood"]({{bbox}});',
      desc: 'Dresdner Heide等森林。資料量大，載入需數秒。', source: 'OpenStreetMap', license: 'ODbL', color: '#1e8449', fill: 0.35,
    },
    {
      id: 'gruenes_dresden', group: 'umwelt', type: 'wms', nodeId: 300, verified: true,
      name: 'Grünes Dresden公園與墓園（官方）', de: 'Parkanlagen, Gärten, Friedhöfe',
      desc: '市府綠地管理單位的公園、花園與墓園。', source: 'Landeshauptstadt Dresden', license: 'dl-de/by-2-0', color: '#229954',
    },
    {
      id: 'lsg', group: 'umwelt', type: 'wms', nodeId: 21, verified: true,
      name: 'Landschaftsschutzgebiete景觀保護區', de: 'Landschaftsschutzgebiete',
      desc: '景觀保護區（LSG）：Elbhänge、Dresdner Heide等，是開發限制的主要範圍。', source: 'Landeshauptstadt Dresden, Umweltamt', license: 'dl-de/by-2-0', color: '#1e8449',
    },
    {
      id: 'gruenvolumen', group: 'umwelt', type: 'wms', nodeId: 1041, verified: true,
      name: 'Grünvolumen綠量（2009）', de: 'Spezifisches Grünvolumen pro Nettoteilblock 2009',
      desc: '每個街廓的單位綠量（m³/m²）：評估都市熱島與綠化不足街廓的指標。', source: 'Landeshauptstadt Dresden, Umweltamt', license: 'dl-de/by-2-0', color: '#82e0aa',
    },
    {
      id: 'dgm_shade', group: 'umwelt', type: 'wms', nodeId: 1463, verified: true,
      name: 'DGM1地形暈渲（彩色）', de: 'Digitales Geländemodell 1 m, Schummerung farbig',
      desc: '1公尺數值地形模型的彩色暈渲圖：易北河谷地與兩側坡地一目瞭然。', source: 'Landeshauptstadt Dresden, Vermessungsamt', license: 'dl-de/by-2-0', color: '#a04000', opacity: 0.6,
    },
    {
      id: 'dgm', group: 'umwelt', type: 'wms', nodeId: 1459, verified: true,
      name: 'DGM數值地形模型', de: 'Digitales Geländemodell (DGM)',
      desc: '數值地形模型（高程分帶）。', source: 'Landeshauptstadt Dresden, Vermessungsamt', license: 'dl-de/by-2-0', color: '#a04000', opacity: 0.6,
    },

    /* ---------- 水系與洪水 ---------- */
    {
      id: 'elbe_hq5', group: 'wasser', type: 'wms', nodeId: 1373, verified: true,
      name: '易北河650 cm潛在淹沒範圍（< HQ5）', de: 'Elbe – 650 cm Pegel Dresden, potentiell überschwemmte Flächen (Modell 2017)',
      desc: '易北河水位650 cm時的潛在淹沒面（2017模型）。2002年洪峰達940 cm、2013年876 cm，可作為風險對照。',
      source: 'Landeshauptstadt Dresden, Umweltamt', license: 'dl-de/by-2-0', color: '#2e86c1', opacity: 0.6,
    },
    {
      id: 'fliessgewaesser', group: 'wasser', type: 'wms', nodeId: 202, verified: true,
      name: 'Fließgewässer河川水系', de: 'Fließgewässer',
      desc: '市域內河川與溪流（Weißeritz、Prießnitz、Lockwitzbach等）。', source: 'Landeshauptstadt Dresden, Umweltamt', license: 'dl-de/by-2-0', color: '#2e86c1',
    },
    {
      id: 'osm_water', group: 'wasser', type: 'overpass', geom: 'polygon',
      name: '水域Gewässer（OSM）', de: 'natural=water',
      query: 'way["natural"="water"]({{bbox}});',
      relQuery: 'relation["natural"="water"]({{bbox}});',
      desc: '易北河、湖泊與池塘的水面。', source: 'OpenStreetMap', license: 'ODbL', color: '#5dade2', fill: 0.5,
    },
  ];

  // 規劃師快速情境：一鍵套用圖層組合
  const presets = [
    { id: 'overview', title: '市域概況', desc: 'Stadtteile、電車路網、市界、主要道路', layers: ['stadtteile', 'stadtgrenze', 'osm_tram_lines', 'osm_mainroads', 'osm_water'] },
    { id: 'planning', title: '法定計畫與開發壓力', desc: 'B-Plan、施工中基地、棕地、住宅用地', layers: ['stadtteile', 'bplan', 'osm_construction', 'osm_brownfield'] },
    { id: 'daily', title: '生活機能（15分鐘城市）', desc: '學校、幼兒園、超市、診所藥局、電車站', layers: ['stadtteile', 'osm_schools', 'osm_kita', 'osm_supermarket', 'osm_doctors', 'osm_tram_stops'] },
    { id: 'mobility', title: '運具供給', desc: '電車、公車、鐵路、自行車道、共享運具', layers: ['stadtteile', 'osm_tram_lines', 'osm_tram_stops', 'osm_bus_stops', 'osm_rail', 'osm_stations', 'osm_cycleways', 'osm_bike_rental', 'osm_carsharing'] },
    { id: 'green', title: '綠地與環境', desc: '公園、市民農園、森林、景觀保護區、綠量', layers: ['stadtteile', 'osm_parks', 'osm_allotments', 'osm_forest', 'lsg', 'gruenvolumen'] },
    { id: 'risk', title: '洪水與地形風險', desc: '易北河淹沒範圍、河川、地形暈渲', layers: ['stadtteile', 'elbe_hq5', 'fliessgewaesser', 'dgm_shade', 'osm_water'] },
  ];

  // 市域概況（參考值，請以Kommunale Statistikstelle最新出版品為準）
  const facts = [
    { k: '市域面積', v: '328.8 km²', note: '約1/4為森林（Dresdner Heide等），為德國最綠的大城之一；面積與臺北市（271.8 km²）同級。' },
    { k: '人口密度', v: '約1,740人/km²', note: '約為臺北市（約8,900人/km²）的五分之一：兩市面積相近，但人口規模與密度差距懸殊。' },
    { k: '人口', v: '571,510人', note: '主要居所人口，2025年12月31日戶籍登記；2010年代持續成長後近年微幅下降。' },
    { k: '行政分區', v: '10 Stadtbezirke＋9 Ortschaften', note: '1990年代併入的周邊鄉鎮保留Ortschaft地位與地方議會。' },
    { k: '統計分區', v: '64 Stadtteile', note: '本圖層附帶其中61區（OSM轉繪），再細分為Statistische Bezirke。' },
    { k: '海拔', v: '101–383 m', note: '易北河谷地約110 m，兩側為Elbhänge坡地與Dresdner Heide台地。' },
    { k: '易北河', v: '流經市域約30 km', note: '2002年（940 cm）與2013年（876 cm）洪水後，洪氾管理為規劃核心議題。' },
    { k: 'Flächennutzungsplan', v: '2020年10月22日生效', note: '2020-01-31版本，取代1998年FNP；下一級為Bebauungspläne。' },
    { k: '大眾運輸', v: '12條電車線（DVB）', note: '電車為骨幹，S-Bahn三條線連結Meißen、Pirna、機場。' },
    { k: '經濟結構', v: 'Silicon Saxony半導體聚落', note: 'Klotzsche北部（Infineon、GlobalFoundries、TSMC/ESMC）帶動住宅與交通需求。' },
    { k: 'Ortschaften界線缺漏', v: '3區未含', note: 'Langebrück/Schönborn、Cossebaude/Mobschatz/Oberwartha、Gompitz/Altfranken需自官方WFS補齊。' },
  ];

  window.DD_CATALOGS = window.DD_CATALOGS || {};
  window.DD_CATALOGS.dresden = { WMS_BASE, WFS_BASE, BBOX, groups, layers, presets, facts };
  window.DD_CATALOG = window.DD_CATALOGS.dresden; // 舊名保留
})();
