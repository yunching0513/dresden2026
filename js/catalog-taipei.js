/* catalog-taipei.js：臺北市圖層目錄。
 *
 * 圖層來源：
 *  - bundled：隨程式附帶的行政區界線（data/taipei_districts.js）。
 *  - geojson：隨站附帶、開啟時才抓取的GeoJSON（如里界）。
 *  - xyz：官方WMTS圖磚（內政部國土測繪中心），以REST樣板網址載入。
 *  - overpass：OpenStreetMap即時查詢，查詢式與德勒斯登目錄一致，以利跨城市比較。
 *  - portal：尚無穩定OGC服務、需到官方系統查詢的資料，附說明與連結。
 *
 * 授權：NLSC圖磚依國土測繪圖資服務雲使用規範；OSM資料ODbL。
 */
(function () {
  'use strict';

  const NLSC = 'https://wmts.nlsc.gov.tw/wmts';

  const groups = [
    { id: 'admin', title: '行政區與統計單元', hint: '12行政區與里界：統計、選區與里長治理的空間骨架。' },
    { id: 'planung', title: '土地使用與都市計畫', hint: '臺北市全域皆在都市計畫範圍內；分區管制查詢請至都發局系統。' },
    { id: 'wohnen', title: '住宅、開發與產業用地', hint: '施工中基地、閒置地與產業用地：都市更新與開發動態的側寫。' },
    { id: 'verkehr', title: '交通與運具', hint: '捷運、台鐵、公車與自行車：高密度城市的運具供給。' },
    { id: 'daseins', title: '公共設施與生活機能', hint: '學校、醫療、市場與宮廟：15分鐘生活圈的基礎盤點。' },
    { id: 'umwelt', title: '環境、綠地與地形', hint: '公園、山坡地與保護區。臺北市近半市域為山區。' },
    { id: 'wasser', title: '水系與洪水風險', hint: '淡水河水系與盆地排水：颱風與極端降雨下的關鍵議題。' },
    { id: 'historie', title: '歷史地圖', hint: '中研院百年歷史地圖圖磚：日治到戰後的地形圖，判讀水系變遷與市街擴張。建議搭配「捲簾比較」使用。' },
  ];

  const BBOX = [24.95, 121.45, 25.22, 121.67];

  const layers = [
    /* ---------- 行政區 ---------- */
    {
      id: 'tpe_districts', group: 'admin', type: 'bundled', default: true,
      name: '行政區（12區）', de: '臺北市行政區',
      desc: '12個行政區界線。界線為OSM轉繪（g0v/twgeojson），面積採臺北市政府民政局公告值。點擊分區可看面積與各圖層設施數。',
      source: 'OpenStreetMap／臺北市政府民政局', license: 'ODbL', color: '#c0392b',
    },
    {
      id: 'tpe_villages', group: 'admin', type: 'geojson', url: 'data/taipei_villages.geojson',
      name: '里界（449里）', de: '臺北市里界',
      desc: '里是臺北市最基層的治理與統計單元。本圖層為OSM轉繪版本，共449里，與現行編組（含2018年調整）略有出入，僅供概覽；正式界線請以民政局公告為準。',
      source: 'OpenStreetMap（g0v/twgeojson）', license: 'ODbL', color: '#7f8c8d', fill: 0.05, weight: 0.8,
      labelField: 'name',
    },
    {
      id: 'nlsc_landsect', group: 'admin', type: 'xyz',
      url: NLSC + '/LANDSECT/default/GoogleMapsCompatible/{z}/{y}/{x}',
      name: '地籍圖（段籍圖）', de: 'LANDSECT',
      desc: '國土測繪中心段籍圖圖磚：可看地籍段界與地號範圍，是基地尺度作業的底圖。放大後才有內容。',
      source: '內政部國土測繪中心', license: '國土測繪圖資服務雲', color: '#8e44ad', opacity: 0.85, minZoom: 15,
    },

    /* ---------- 土地使用與都市計畫 ---------- */
    {
      id: 'nlsc_luimap', group: 'planung', type: 'xyz',
      url: NLSC + '/LUIMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',
      name: '國土利用現況調查', de: 'LUIMAP',
      desc: '全國國土利用現況調查成果圖：以實際使用（建築、農業、林地、水域等）分類，可與都市計畫分區對照，看出計畫與現況的落差。',
      source: '內政部國土測繪中心', license: '國土測繪圖資服務雲', color: '#d35400', opacity: 0.7,
    },
    {
      id: 'tpe_zoning', group: 'planung', type: 'portal',
      name: '都市計畫土地使用分區', de: '使用分區查詢',
      desc: '臺北市全域皆已發布實施都市計畫。分區（住一至住四、商一至商四、工業區、保護區等）與土管規定請至都發局「土地使用分區線上查詢」逐筆查詢；該系統目前未提供開放的WMS/WMTS服務。',
      portalUrl: 'https://zone.udd.gov.taipei/', source: '臺北市政府都市發展局', license: '依來源', color: '#e67e22',
    },
    {
      id: 'tpe_urbanplan', group: 'planung', type: 'portal',
      name: '都市計畫整合查詢（含計畫書圖）', de: '都市計畫整合查詢系統',
      desc: '查詢細部計畫、主要計畫、都市更新地區與計畫書圖；歷次變更內容亦在此檢索。',
      portalUrl: 'https://webgis.udd.gov.taipei/', source: '臺北市政府都市發展局', license: '依來源', color: '#e67e22',
    },
    {
      id: 'tpe_historymap', group: 'planung', type: 'portal',
      name: '臺北百年歷史地圖', de: '中央研究院',
      desc: '中研院人社中心GIS專題中心的歷史圖資套疊：清代、日治到戰後各版地形圖與航照，是判讀紋理演變與水系變遷的必備工具。',
      portalUrl: 'https://gis.sinica.edu.tw/taipei/', source: '中央研究院', license: '依來源', color: '#7f8c8d',
    },

    /* ---------- 住宅與開發 ---------- */
    {
      id: 'osm_construction', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '施工中基地', de: 'landuse=construction / building=construction',
      desc: 'OSM標記為施工中的土地與建物：都市更新與危老重建的熱區側寫。',
      query: 'way["landuse"="construction"]({{bbox}});way["building"="construction"]({{bbox}});',
      relQuery: 'relation["landuse"="construction"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#e67e22', fill: 0.35,
    },
    {
      id: 'osm_brownfield', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '閒置／棕地', de: 'landuse=brownfield|greenfield',
      desc: '棕地與未開發預定地。臺北市可開發素地稀少，此類基地多與軍方、國有地或工業遷移有關。',
      query: 'way["landuse"~"^(brownfield|greenfield)$"]({{bbox}});',
      relQuery: 'relation["landuse"~"^(brownfield|greenfield)$"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#7f8c8d', fill: 0.4,
    },
    {
      id: 'osm_residential', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '住宅用地', de: 'landuse=residential',
      desc: 'OSM住宅用地範圍，用來對照各區的建成密度。資料量較大，載入需數秒。',
      query: 'way["landuse"="residential"]({{bbox}});',
      relQuery: 'relation["landuse"="residential"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#f1c40f', fill: 0.3,
    },
    {
      id: 'osm_industrial', group: 'wohnen', type: 'overpass', geom: 'polygon',
      name: '工業／商業用地', de: 'landuse=industrial|commercial|retail',
      desc: '就業用地分布：可對照內湖科技園區、南港經貿園區與信義計畫區。',
      query: 'way["landuse"~"^(industrial|commercial|retail)$"]({{bbox}});',
      relQuery: 'relation["landuse"~"^(industrial|commercial|retail)$"]({{bbox}});',
      source: 'OpenStreetMap', license: 'ODbL', color: '#9b59b6', fill: 0.3,
    },

    /* ---------- 交通 ---------- */
    {
      id: 'osm_metro_lines', group: 'verkehr', type: 'overpass', geom: 'line', default: true,
      name: '捷運路網', de: 'route=subway',
      desc: '臺北捷運路線（跨臺北市與新北市）：高密度城市的運輸骨幹。',
      rawQuery: 'relation["route"="subway"]({{bbox}});way(r);out geom;',
      source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', weight: 3,
    },
    {
      id: 'osm_metro_stops', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '捷運站', de: 'station=subway',
      query: 'node["railway"="station"]["station"="subway"]({{bbox}});',
      desc: '捷運車站站點，用於計算各區的軌道服務密度。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', radius: 5,
    },
    {
      id: 'osm_rail', group: 'verkehr', type: 'overpass', geom: 'line',
      name: '台鐵／高鐵路線', de: 'railway=rail',
      query: 'way["railway"="rail"]["service"!~"."]({{bbox}});',
      desc: '主線鐵路（臺北市區段多已地下化，OSM亦含地下線形）。', source: 'OpenStreetMap', license: 'ODbL', color: '#2c3e50', weight: 2,
    },
    {
      id: 'osm_stations', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '火車站', de: 'railway=station|halt',
      query: 'node["railway"~"^(station|halt)$"]["station"!="subway"]({{bbox}});',
      desc: '台鐵與高鐵車站。', source: 'OpenStreetMap', license: 'ODbL', color: '#2c3e50', radius: 6,
    },
    {
      id: 'osm_bus_stops', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '公車站', de: 'highway=bus_stop',
      query: 'node["highway"="bus_stop"]({{bbox}});',
      desc: '公車停靠站。臺北公車路網密度高，與捷運形成雙層系統。', source: 'OpenStreetMap', license: 'ODbL', color: '#2980b9', radius: 3,
    },
    {
      id: 'osm_mainroads', group: 'verkehr', type: 'overpass', geom: 'line',
      name: '主要道路', de: 'highway=motorway|trunk|primary|secondary',
      query: 'way["highway"~"^(motorway|trunk|primary|secondary)$"]({{bbox}});',
      desc: '國道、快速道路與市區主要幹道（含建國、市民高架）。', source: 'OpenStreetMap', license: 'ODbL', color: '#7f8c8d', weight: 2,
    },
    {
      id: 'osm_cycleways', group: 'verkehr', type: 'overpass', geom: 'line',
      name: '自行車道', de: 'highway=cycleway',
      query: 'way["highway"="cycleway"]({{bbox}});',
      desc: '獨立自行車道，河濱自行車道為主體。', source: 'OpenStreetMap', license: 'ODbL', color: '#27ae60', weight: 2,
    },
    {
      id: 'osm_bike_rental', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '共享單車站（YouBike）', de: 'amenity=bicycle_rental',
      query: 'nwr["amenity"="bicycle_rental"]({{bbox}});',
      desc: 'YouBike站點：臺北公共自行車系統密度為全球前列，是接駁捷運的關鍵。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#16a085', radius: 4,
    },
    {
      id: 'osm_charging', group: 'verkehr', type: 'overpass', geom: 'point',
      name: '充電站', de: 'amenity=charging_station',
      query: 'nwr["amenity"="charging_station"]({{bbox}});',
      desc: '電動車充電站。', source: 'OpenStreetMap', license: 'ODbL', color: '#f39c12', radius: 4,
    },

    /* ---------- 公共設施 ---------- */
    {
      id: 'osm_schools', group: 'daseins', type: 'overpass', geom: 'point', default: true,
      name: '學校', de: 'amenity=school',
      query: 'nwr["amenity"="school"]({{bbox}});',
      desc: '國中小與高中職。學校用地在臺北市同時是重要的開放空間與防災據點。', source: 'OpenStreetMap', license: 'ODbL', color: '#2980b9', radius: 5,
    },
    {
      id: 'osm_kita', group: 'daseins', type: 'overpass', geom: 'point',
      name: '幼兒園／托育', de: 'amenity=kindergarten',
      query: 'nwr["amenity"="kindergarten"]({{bbox}});',
      desc: '幼兒園與托嬰中心：少子化下的公共托育布局。', source: 'OpenStreetMap', license: 'ODbL', color: '#e84393', radius: 4,
    },
    {
      id: 'osm_university', group: 'daseins', type: 'overpass', geom: 'point',
      name: '大學與研究機構', de: 'amenity=university|college|research_institute',
      query: 'nwr["amenity"~"^(university|college|research_institute)$"]({{bbox}});',
      desc: '臺大、政大、師大等校與中研院、工研院據點。', source: 'OpenStreetMap', license: 'ODbL', color: '#34495e', radius: 5,
    },
    {
      id: 'osm_hospital', group: 'daseins', type: 'overpass', geom: 'point',
      name: '醫院', de: 'amenity=hospital|clinic',
      query: 'nwr["amenity"~"^(hospital|clinic)$"]({{bbox}});',
      desc: '醫學中心與地區醫院。', source: 'OpenStreetMap', license: 'ODbL', color: '#c0392b', radius: 6,
    },
    {
      id: 'osm_doctors', group: 'daseins', type: 'overpass', geom: 'point',
      name: '診所／藥局', de: 'amenity=doctors|pharmacy',
      query: 'nwr["amenity"~"^(doctors|pharmacy)$"]({{bbox}});',
      desc: '基層診所與藥局。', source: 'OpenStreetMap', license: 'ODbL', color: '#e74c3c', radius: 3,
    },
    {
      id: 'osm_supermarket', group: 'daseins', type: 'overpass', geom: 'point',
      name: '超市', de: 'shop=supermarket',
      query: 'nwr["shop"="supermarket"]({{bbox}});',
      desc: '連鎖超市。', source: 'OpenStreetMap', license: 'ODbL', color: '#27ae60', radius: 4,
    },
    {
      id: 'osm_convenience', group: 'daseins', type: 'overpass', geom: 'point',
      name: '便利商店', de: 'shop=convenience',
      query: 'nwr["shop"="convenience"]({{bbox}});',
      desc: '超商在臺灣承擔繳費、取貨、代收與24小時照明等準公共服務，密度是理解生活圈的關鍵指標。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#16a085', radius: 3,
    },
    {
      id: 'osm_market', group: 'daseins', type: 'overpass', geom: 'point',
      name: '傳統市場／夜市', de: 'amenity=marketplace',
      query: 'nwr["amenity"="marketplace"]({{bbox}});',
      desc: '公有零售市場、傳統市場與夜市：臺北生活機能與街道活力的核心節點。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#d35400', radius: 5,
    },
    {
      id: 'osm_library', group: 'daseins', type: 'overpass', geom: 'point',
      name: '圖書館／活動中心', de: 'amenity=library|community_centre',
      query: 'nwr["amenity"~"^(library|community_centre)$"]({{bbox}});',
      desc: '市立圖書館分館與里民活動中心。', source: 'OpenStreetMap', license: 'ODbL', color: '#8e44ad', radius: 4,
    },
    {
      id: 'osm_worship', group: 'daseins', type: 'overpass', geom: 'point',
      name: '宮廟／宗教設施', de: 'amenity=place_of_worship',
      query: 'nwr["amenity"="place_of_worship"]({{bbox}});',
      desc: '宮廟、教堂與宗教場所：在臺北常兼具社區集會、節慶與街道公共生活的功能。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#b7950b', radius: 4,
    },
    {
      id: 'osm_playground', group: 'daseins', type: 'overpass', geom: 'point',
      name: '兒童遊戲場', de: 'leisure=playground',
      query: 'nwr["leisure"="playground"]({{bbox}});',
      desc: '公園與校園內的遊戲場。', source: 'OpenStreetMap', license: 'ODbL', color: '#f39c12', radius: 3,
    },
    {
      id: 'osm_sports', group: 'daseins', type: 'overpass', geom: 'point',
      name: '運動中心／場館', de: 'leisure=sports_centre|swimming_pool|stadium',
      query: 'nwr["leisure"~"^(sports_centre|swimming_pool|stadium)$"]({{bbox}});',
      desc: '各區運動中心、泳池與體育場。', source: 'OpenStreetMap', license: 'ODbL', color: '#16a085', radius: 4,
    },
    {
      id: 'osm_fire_police', group: 'daseins', type: 'overpass', geom: 'point',
      name: '消防／警察', de: 'amenity=fire_station|police',
      query: 'nwr["amenity"~"^(fire_station|police)$"]({{bbox}});',
      desc: '消防分隊與警察分局、派出所。', source: 'OpenStreetMap', license: 'ODbL', color: '#2c3e50', radius: 4,
    },

    /* ---------- 環境與地形 ---------- */
    {
      id: 'osm_parks', group: 'umwelt', type: 'overpass', geom: 'polygon',
      name: '公園綠地', de: 'leisure=park|garden',
      query: 'way["leisure"~"^(park|garden)$"]({{bbox}});',
      relQuery: 'relation["leisure"~"^(park|garden)$"]({{bbox}});',
      desc: '公園與花園（含大安森林公園、中山堂前廣場等）。河濱高灘地多未標記為park，需另看水域圖層。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#27ae60', fill: 0.4,
    },
    {
      id: 'osm_forest', group: 'umwelt', type: 'overpass', geom: 'polygon',
      name: '森林／山林', de: 'landuse=forest / natural=wood',
      query: 'way["landuse"="forest"]({{bbox}});way["natural"="wood"]({{bbox}});',
      relQuery: 'relation["landuse"="forest"]({{bbox}});relation["natural"="wood"]({{bbox}});',
      desc: '陽明山、南港山系等林地。資料量大，載入需數秒。', source: 'OpenStreetMap', license: 'ODbL', color: '#1e8449', fill: 0.35,
    },
    {
      id: 'osm_farmland', group: 'umwelt', type: 'overpass', geom: 'polygon',
      name: '農地／田園基地', de: 'landuse=farmland|allotments|orchard',
      query: 'way["landuse"~"^(farmland|allotments|orchard)$"]({{bbox}});',
      relQuery: 'relation["landuse"~"^(farmland|allotments|orchard)$"]({{bbox}});',
      desc: '北投、士林與文山的農地，以及市民農園（田園城市政策）。',
      source: 'OpenStreetMap', license: 'ODbL', color: '#7dcea0', fill: 0.4,
    },
    {
      id: 'tpe_hillside', group: 'umwelt', type: 'portal',
      name: '山坡地範圍與地質敏感區', de: '坡地開發管制',
      desc: '臺北市約半數市域為山坡地，開發須另受水土保持與地質敏感區法規管制。範圍圖請至臺北市資料大平臺與經濟部地調所查詢。',
      portalUrl: 'https://data.taipei/dataset?q=%E5%B1%B1%E5%9D%A1%E5%9C%B0', source: '臺北市政府／經濟部地質調查及礦業管理中心', license: '依來源', color: '#a04000',
    },

    /* ---------- 歷史地圖 ---------- */
    {
      id: 'hist_1904', group: 'historie', type: 'xyz',
      url: 'https://gis.sinica.edu.tw/tileserver/file-exists.php?img=JM20K_1904-jpg-{z}-{x}-{y}',
      name: '臺灣堡圖（1904）', de: 'JM20K_1904',
      desc: '日治初期1:20,000臺灣堡圖（明治版）：可看見尚未市區改正的艋舺、大稻埕街庄與舊河道、埤塘。',
      source: '中央研究院人社中心GIS專題中心', license: '依中研院使用規範（學術與非商業使用，需標示來源）', color: '#8d6e63', opacity: 0.85,
    },
    {
      id: 'hist_1921', group: 'historie', type: 'xyz',
      url: 'https://gis.sinica.edu.tw/tileserver/file-exists.php?img=JM25K_1921-jpg-{z}-{x}-{y}',
      name: '日治二萬五千分之一地形圖（1921）', de: 'JM25K_1921',
      desc: '市區改正後的臺北：可對照三線道路、鐵道與新設市區計畫街廓。',
      source: '中央研究院人社中心GIS專題中心', license: '依中研院使用規範', color: '#6d4c41', opacity: 0.85,
    },
    {
      id: 'hist_1966', group: 'historie', type: 'xyz',
      url: 'https://gis.sinica.edu.tw/tileserver/file-exists.php?img=TM25K_1966-jpg-{z}-{x}-{y}',
      name: '二萬五千分之一地形圖（1966）', de: 'TM25K_1966',
      desc: '戰後都市擴張初期：基隆河尚未截彎取直，東區多為農地。',
      source: '中央研究院人社中心GIS專題中心', license: '依中研院使用規範', color: '#a1887f', opacity: 0.85,
    },
    {
      id: 'hist_1989', group: 'historie', type: 'xyz',
      url: 'https://gis.sinica.edu.tw/tileserver/file-exists.php?img=TM25K_1989-jpg-{z}-{x}-{y}',
      name: '二萬五千分之一地形圖（1989）', de: 'TM25K_1989',
      desc: '捷運動工前後的臺北：可對照信義計畫區、內湖與南港的開發前狀態。',
      source: '中央研究院人社中心GIS專題中心', license: '依中研院使用規範', color: '#bcaaa4', opacity: 0.85,
    },
    {
      id: 'hist_portal_tw', group: 'historie', type: 'portal',
      name: '更多歷史圖層（中研院／北市都發局）', de: '百年歷史地圖',
      desc: '中研院「臺北百年歷史地圖」另有數十個圖層（航照、地籍、各版市街圖），可在其網站取得圖磚樣板後於「資料」頁籤加入；臺北市都發局的「歷史圖資展示系統」亦提供WMTS。',
      portalUrl: 'https://gis.sinica.edu.tw/taipei/',
      source: '中央研究院／臺北市政府都市發展局', license: '依各來源規範', color: '#8d6e63',
    },

    /* ---------- 水系與洪水 ---------- */
    {
      id: 'osm_water', group: 'wasser', type: 'overpass', geom: 'polygon',
      name: '水域', de: 'natural=water',
      query: 'way["natural"="water"]({{bbox}});',
      relQuery: 'relation["natural"="water"]({{bbox}});',
      desc: '淡水河、基隆河、新店溪與景美溪水面。', source: 'OpenStreetMap', license: 'ODbL', color: '#5dade2', fill: 0.5,
    },
    {
      id: 'osm_waterway', group: 'wasser', type: 'overpass', geom: 'line',
      name: '河川與排水路', de: 'waterway=river|stream|canal',
      query: 'way["waterway"~"^(river|stream|canal)$"]({{bbox}});',
      desc: '河川主流、支流與排水路：盆地排水系統的骨架。', source: 'OpenStreetMap', license: 'ODbL', color: '#2e86c1', weight: 2,
    },
    {
      id: 'tpe_flood', group: 'wasser', type: 'portal',
      name: '淹水潛勢圖', de: '水利署 / NCDR',
      desc: '臺北市防洪以堤防與抽水站為主體，堤內淹水風險取決於降雨強度與抽排能力。淹水潛勢圖（不同降雨情境）請至國家災害防救科技中心災害潛勢地圖網站查詢。',
      portalUrl: 'https://dmap.ncdr.nat.gov.tw/', source: '國家災害防救科技中心', license: '依來源', color: '#2e86c1',
    },
  ];

  const presets = [
    { id: 'overview', title: '市域概況', desc: '行政區、捷運路網、主要道路、水域', layers: ['tpe_districts', 'osm_metro_lines', 'osm_mainroads', 'osm_water'] },
    { id: 'planning', title: '法定計畫與開發壓力', desc: '國土利用現況、施工中基地、閒置地、產業用地', layers: ['tpe_districts', 'nlsc_luimap', 'osm_construction', 'osm_brownfield', 'osm_industrial'] },
    { id: 'daily', title: '生活機能（15分鐘城市）', desc: '學校、幼兒園、超市、超商、市場、診所藥局、捷運站', layers: ['tpe_districts', 'osm_schools', 'osm_kita', 'osm_supermarket', 'osm_convenience', 'osm_market', 'osm_doctors', 'osm_metro_stops'] },
    { id: 'mobility', title: '運具供給', desc: '捷運、台鐵、公車站、自行車道、YouBike', layers: ['tpe_districts', 'osm_metro_lines', 'osm_metro_stops', 'osm_rail', 'osm_stations', 'osm_bus_stops', 'osm_cycleways', 'osm_bike_rental'] },
    { id: 'green', title: '綠地與環境', desc: '公園、森林山林、農地與田園基地', layers: ['tpe_districts', 'osm_parks', 'osm_forest', 'osm_farmland'] },
    { id: 'risk', title: '水系與地形風險', desc: '水域、河川排水路、里界（疏散與防災單元）', layers: ['tpe_districts', 'osm_water', 'osm_waterway', 'tpe_villages'] },
    { id: 'history', title: '紋理變遷（歷史對照）', desc: '1904臺灣堡圖與現況對照', layers: ['tpe_districts', 'hist_1904'] },
  ];

  const facts = [
    { k: '市域面積', v: '271.80 km²', note: '約與德勒斯登（328.8 km²）同級，但人口為其4倍以上。山坡地約占一半。' },
    { k: '人口', v: '約242萬', note: '2026年7月戶籍人口（民政局）。日間活動人口另含大量自新北通勤者。' },
    { k: '人口密度', v: '約8,900人/km²', note: '以市域全區計；扣除山坡地後，平地市街的實際密度遠高於此。' },
    { k: '行政分區', v: '12個行政區', note: '下設里與鄰；里長為民選，是最基層的治理單元。' },
    { k: '里', v: '本圖層收錄449里', note: 'OSM轉繪版本，與現行編組略有出入；現行里數請以民政局公告為準。' },
    { k: '海拔', v: '0–1,120 m', note: '臺北盆地中心僅數公尺，最高點為大屯火山群的七星山（1,120 m）。' },
    { k: '水系', v: '淡水河、基隆河、新店溪、景美溪', note: '市區由堤防圍繞，堤內排水依賴抽水站；河濱高灘地是主要的大型開放空間。' },
    { k: '都市計畫', v: '全市皆在都市計畫範圍內', note: '含住宅區、商業區、工業區與保護區；土管規定請至都發局分區查詢系統逐筆確認。' },
    { k: '大眾運輸', v: '捷運6條路線', note: '含環狀線第一階段，路網跨臺北市與新北市；公車與YouBike承擔接駁。' },
    { k: '資料取得', v: 'data.taipei 與 data.gov.tw', note: '臺北市資料大平臺提供各區、各里的人口與土地統計CSV，可於「資料」頁籤匯入做choropleth。' },
  ];

  window.DD_CATALOGS = window.DD_CATALOGS || {};
  window.DD_CATALOGS.taipei = { BBOX, groups, layers, presets, facts };
})();
