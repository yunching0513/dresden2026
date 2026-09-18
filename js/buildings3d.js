/* GeoSN LoD1 city model. Local, independently loaded 2 km GeoJSON tiles. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const empty = () => ({ type: 'FeatureCollection', features: [] });
  const heightColor = ['interpolate', ['linear'], ['get', 'height_m'], 0, '#dce4df', 10, '#b0c8c0', 20, '#739c99', 40, '#43676d', 80, '#cb9560'];
  let app, map, active = false, ready = false, syncing = false, manifest, enginePromise, openVersion = 0;
  const tiles = new Map(), overlays = new Map();
  let tileTimer, overlayTimer, popup;
  // 臺北沒有附帶官方 LoD1 區塊，改以 OpenStreetMap 輪廓＋樓層推估即時建模
  const OSM_SRC = 'osm-buildings';
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let osmController, osmBounds = null;
  const mode = () => (app.state.city.model3d.mode || 'tiles');
  function status(message) { $('buildings-status').textContent = message; }
  function camera() { return active && map ? { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } : null; }
  function engine() {
    if (window.maplibregl) return Promise.resolve();
    if (!enginePromise) enginePromise = new Promise((resolve,reject) => {
      const script = document.createElement('script'); script.src = 'vendor/maplibre/maplibre-gl.js';
      script.onload = resolve; script.onerror = () => { script.remove(); enginePromise = null; reject(new Error('無法載入 3D 引擎')); };
      document.head.appendChild(script);
    });
    return enginePromise;
  }
  async function open(initial) {
    const version = ++openVersion;
    $('btn-3d').disabled = true;
    app.switchTab('3d'); status('正在啟動 3D 建築地圖…');
    try {
      await engine();
      if (version !== openVersion) return;
      active = true; $('map').hidden = true; $('map3d').hidden = false;
      $('btn-3d').textContent = '切回 2D'; $('btn-3d').setAttribute('aria-pressed', 'true');
      const c = app.state.map.getCenter();
      const hasCamera = initial && initial.c;
      const zoom = hasCamera ? app.state.map.getZoom() : Math.max(15.5, app.state.map.getZoom());
      if (!map) {
        map = new maplibregl.Map({ container: 'map3d', center: [c.lng,c.lat], zoom, pitch: number(initial && initial.p,55,0,70), bearing: number(initial && initial.b,-25,-180,180), maxPitch:70, minZoom:9, maxZoom:19,
          style: { version:8, sources:{ base:{ type:'raster', tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256, maxzoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } }, layers:[{id:'base',type:'raster',source:'base',paint:{'raster-saturation':-0.8,'raster-opacity':0.8}}], light:{anchor:'viewport',color:'#fff7e9',intensity:0.4,position:[1.5,200,40]} },
          attributionControl: { customAttribution: app.state.city.model3d.attribution }
        });
        map.addControl(new maplibregl.NavigationControl({visualizePitch:true}), 'top-right');
        map.addControl(new maplibregl.ScaleControl({unit:'metric'}), 'bottom-right');
        map.on('load', async () => {
          ready = true;
          syncOverlays();
          await refreshBuildings();
        });
        map.on('moveend', () => {
          if (!active) return;
          if (!syncing) {
            syncing = true; const c = map.getCenter();
            app.state.map.setView([c.lat,c.lng],map.getZoom(),{animate:false}); syncing = false;
          }
          $('model-pitch').value = Math.round(map.getPitch()); $('model-pitch-value').textContent = Math.round(map.getPitch())+'°';
          app.writeHash(); schedule();
        });
        map.on('error', e => {
          if (e.sourceId && tiles.has(e.sourceId)) { tiles.get(e.sourceId).error = true; report(); }
        });
        map.on('click', inspectBuilding);
        if (window.DDAnnotate) window.DDAnnotate.attach3d(map);
        map.getCanvas().addEventListener('webglcontextlost', () => { status('3D 顯示資源已中斷，請切回 2D 或重新整理頁面。'); });
      } else {
        map.resize(); map.jumpTo({center:[c.lng,c.lat],zoom:app.state.map.getZoom()}); syncOverlays(); schedule();
      }
      app.writeHash();
    } catch (error) {
      close(); if (map && !ready) { map.remove(); map=null; }
      status('無法啟動 3D：'+error.message+'。仍可使用 2D；請確認瀏覽器支援 WebGL。');
    } finally { $('btn-3d').disabled = false; }
  }
  function number(value,fallback,min,max) { const n=value == null ? NaN : Number(value); return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback; }
  function close() {
    ++openVersion;
    active = false; $('map').hidden = false; $('map3d').hidden = true;
    $('btn-3d').textContent = '開啟 3D'; $('btn-3d').setAttribute('aria-pressed','false');
    app.state.map.invalidateSize(); app.writeHash();
  }
  function setCity() {
    osmBounds = null; manifest = null;
    if (osmController) { osmController.abort(); osmController = null; }
    const wasActive = active;
    if (map) { map.remove(); map = null; ready = false; tiles.clear(); overlays.clear(); }
    $('model-inventory').textContent = '';
    if (wasActive) { active = false; open(); } else { close(); }
  }

  function schedule() { clearTimeout(tileTimer); tileTimer = setTimeout(refreshBuildings, mode() === 'osm' ? 500 : 180); }

  async function refreshBuildings() {
    if (mode() === 'osm') return updateOsm();
    if (!manifest) return loadManifest();
    return updateTiles();
  }

  /* ---- OpenStreetMap 建築（臺北） ---- */
  function osmHeight(tags) {
    const h = parseFloat(tags.height || tags['building:height']);
    if (Number.isFinite(h) && h > 0) return { h, est: false };
    const levels = parseFloat(tags['building:levels']);
    if (Number.isFinite(levels) && levels > 0) return { h: Math.max(3, levels * 3.2), est: true };
    return { h: 9, est: true };
  }
  function osmToBuildings(json) {
    const features = [];
    for (const e of json.elements || []) {
      if (!e.geometry || e.geometry.length < 4) continue;
      const tags = e.tags || {};
      const ring = e.geometry.map(p => [p.lon, p.lat]);
      if (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1]) ring.push(ring[0]);
      const { h, est } = osmHeight(tags);
      const base = parseFloat(tags.min_height) || (parseFloat(tags['building:min_level']) || 0) * 3.2;
      features.push({ type:'Feature', properties:{
        height_m: h, base_m: Number.isFinite(base) ? base : 0, estimated: est ? 1 : 0,
        levels: tags['building:levels'] || '', name: tags.name || '', kind: tags.building || 'yes',
        id: 'way/' + e.id,
      }, geometry:{ type:'Polygon', coordinates:[ring] } });
    }
    return { type:'FeatureCollection', features };
  }
  function osmLayerPaint() {
    return { 'fill-extrusion-height':['get','height_m'], 'fill-extrusion-base':['get','base_m'],
      'fill-extrusion-color': $('model-color').value === 'white' ? '#e6e2d7' : heightColor, 'fill-extrusion-opacity':0.94 };
  }
  function setOsmData(data) {
    if (!map.getSource(OSM_SRC)) {
      map.addSource(OSM_SRC, { type:'geojson', data });
      map.addLayer({ id:OSM_SRC, type:'fill-extrusion', source:OSM_SRC, minzoom:14.5,
        layout:{ visibility: $('buildings-visible').checked ? 'visible' : 'none' }, paint: osmLayerPaint() });
      syncOverlays();
    } else map.getSource(OSM_SRC).setData(data);
  }
  async function updateOsm() {
    if (!active || !ready || mode() !== 'osm') return;
    if (!$('buildings-visible').checked) { status('建築量體已關閉。'); return; }
    if (map.getZoom() < 15) { osmBounds = null; if (map.getSource(OSM_SRC)) map.getSource(OSM_SRC).setData(empty()); status('放大至街區尺度（z15 以上）即可載入 OpenStreetMap 建築輪廓。'); return; }
    const b = map.getBounds();
    if (osmBounds && osmBounds.contains(b.getNorthEast()) && osmBounds.contains(b.getSouthWest())) return;
    const pad = 0.003;
    const west = b.getWest() - pad, east = b.getEast() + pad, south = b.getSouth() - pad, north = b.getNorth() + pad;
    if (osmController) osmController.abort();
    osmController = new AbortController();
    const signal = osmController.signal;
    status('正在向 Overpass 查詢 OpenStreetMap 建築…');
    const query = `[out:json][timeout:60];way["building"](${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)});out geom;`;
    let json = null, lastError;
    for (const ep of OVERPASS) {
      try {
        const res = await fetch(ep, { method:'POST', body:'data=' + encodeURIComponent(query), signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        json = await res.json(); break;
      } catch (error) { if (error.name === 'AbortError') return; lastError = error; }
    }
    if (!json) { status('建築查詢失敗：' + (lastError && lastError.message) + '。可按「重新載入」重試。'); return; }
    const fc = osmToBuildings(json);
    osmBounds = new maplibregl.LngLatBounds([west, south], [east, north]);
    setOsmData(fc);
    const est = fc.features.filter(f => f.properties.estimated).length;
    status(`已載入 ${fc.features.length.toLocaleString()} 棟建築輪廓（其中 ${est.toLocaleString()} 棟高度為推估）· 點擊建築查看資料`);
    $('model-inventory').textContent = '建築輪廓與樓層來自 OpenStreetMap，依目前視野即時查詢；未標高度者以樓層數 × 3.2 公尺或 9 公尺代入，僅供量體感受，不可作為法定高度依據。';
  }

  async function loadManifest() {
    try {
      const response = await fetch('data/buildings/manifest.json');
      if (!response.ok) throw new Error('HTTP '+response.status);
      manifest = await response.json();
      $('model-inventory').textContent = `收錄 ${manifest.tiles.length} 個區塊、${manifest.tiles.reduce((sum,t)=>sum+t.count,0).toLocaleString()} 筆建築／建築部分。取得日期：${manifest.retrieved}。資料年份依建築所屬區塊而異。`;
      const fc = {type:'FeatureCollection',features:manifest.tiles.map(t=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[t.ring]}}))};
      if (!map.getSource('coverage')) {
        map.addSource('coverage',{type:'geojson',data:fc});
        map.addLayer({id:'coverage',type:'line',source:'coverage',paint:{'line-color':'#a87a45','line-width':1,'line-opacity':0.45,'line-dasharray':[3,3]}});
      }
      updateTiles();
    } catch (error) { status('建築目錄載入失敗，請按「重新載入」。'+error.message); }
  }

  function report() {
    if (!manifest || mode() === 'osm') return;
    if (!$('buildings-visible').checked) { status('建築量體已關閉。'); return; }
    if (map.getZoom()<13) { status('已顯示資料區塊範圍；放大至街區尺度即可載入建築。'); return; }
    const entries = [...tiles.values()];
    const failed=entries.filter(t=>t.error).length, loading=entries.filter(t=>!t.data&&!t.error).length;
    const count=entries.reduce((sum,t)=>sum+(t.data ? t.data.features.length : 0),0);
    status(failed ? `${failed} 個區塊載入失敗；已取得 ${count.toLocaleString()} 筆，按「重新載入」重試。` : loading ? `正在載入 ${loading} 個區塊… 已取得 ${count.toLocaleString()} 筆。` : count ? `已載入 ${count.toLocaleString()} 筆量體 · 點擊查看高度` : '目前視野沒有已收錄建築；可按「資料範圍」查看覆蓋區域。');
  }
  function removeTile(id) {
    const entry=tiles.get(id); if(entry && entry.controller) entry.controller.abort();
    if(map.getLayer(id)) map.removeLayer(id);
    if(map.getSource(id)) map.removeSource(id);
    tiles.delete(id);
  }
  async function addTile(meta) {
    const id='building-'+meta.id, controller=new AbortController();
    const entry={controller,data:null,error:false}; tiles.set(id,entry);
    try {
      const res=await fetch(`data/buildings/${meta.id}.geojson`,{signal:controller.signal});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json(); if(tiles.get(id)!==entry) return;
      entry.data=data;
      map.addSource(id,{type:'geojson',data});
      map.addLayer({id,type:'fill-extrusion',source:id,minzoom:13,layout:{visibility:$('buildings-visible').checked?'visible':'none'},paint:{'fill-extrusion-height':['get','height_m'],'fill-extrusion-base':0,'fill-extrusion-color':$('model-color').value==='white'?'#e6e2d7':heightColor,'fill-extrusion-opacity':0.96}});
    } catch (error) { if(error.name!=='AbortError' && tiles.get(id)===entry) entry.error=true; }
    report();
  }
  function updateTiles() {
    if(!active||!ready||!manifest||mode()==='osm') return;
    const b=map.getBounds(), c=map.getCenter();
    // Bound memory at city-scale zooms. Distances are only for priority, not measurement.
    const candidates=map.getZoom()<13||!$('buildings-visible').checked ? [] : manifest.tiles.filter(t=>t.bounds[0]<=b.getEast()&&t.bounds[2]>=b.getWest()&&t.bounds[1]<=b.getNorth()&&t.bounds[3]>=b.getSouth()).sort((a,b)=>distance(a,c)-distance(b,c)).slice(0,16);
    const desired=new Set(candidates.map(t=>'building-'+t.id));
    for(const id of tiles.keys()) if(!desired.has(id)) removeTile(id);
    candidates.forEach(t=>{if(!tiles.has('building-'+t.id)) addTile(t);});
    report();
  }
  function distance(t,c) { return ((t.bounds[0]+t.bounds[2])/2-c.lng)**2+((t.bounds[1]+t.bounds[3])/2-c.lat)**2; }
  function inspectBuilding(event) {
    if (window.DDAnnotate && window.DDAnnotate.isDrawing()) return;
    const ids=[...tiles.keys()].filter(id=>map.getLayer(id)); if(map.getLayer(OSM_SRC)) ids.push(OSM_SRC);
    if(!ids.length) return;
    const feature=map.queryRenderedFeatures(event.point,{layers:ids})[0]; if(!feature) return;
    const p=feature.properties, content=document.createElement('div'); content.className='building-popup';
    const h=document.createElement('strong'); h.textContent=Number(p.height_m).toFixed(1)+' m'; content.appendChild(h);
    const desc=document.createElement('p');
    desc.textContent = feature.layer.id===OSM_SRC
      ? `${Number(p.estimated) ? '高度為推估值' : 'OSM 標記高度'}\n${p.levels ? '樓層數：'+p.levels+'\n' : ''}類型：${p.kind}${p.name ? '\n名稱：'+p.name : ''}`
      : `官方模型高度（非樓層推估）\n模型製作：${p.production}\n雷射資料：${p.laser}｜輪廓：${p.footprints}`;
    desc.style.whiteSpace='pre-line'; content.appendChild(desc);
    const id=document.createElement('p'); id.className='building-id'; id.textContent=p.id; content.appendChild(id);
    if(popup) popup.remove(); popup=new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(map);
  }
  function syncOverlays() {
    if(!active||!ready) return;
    for(const ids of overlays.values()) {
      ids.layers.forEach(id=>{if(map.getLayer(id)) map.removeLayer(id);});
      if(map.getSource(ids.source)) map.removeSource(ids.source);
    }
    overlays.clear();
    const before=[...tiles.keys()].find(id=>map.getLayer(id)) || (map.getLayer(OSM_SRC) ? OSM_SRC : undefined);
    Object.entries(app.state.layers).forEach(([key,entry])=>{
      const l=entry.leaflet; if(!l||!app.state.map.hasLayer(l)) return;
      const id='overlay-'+key, color=entry.def.color||'#48697a';
      try {
        if(l.wmsParams) {
          const url=new URL(l._url,location.href);
          // Preserve dataset identifiers; replace only WMS request parameters.
          for(const k of [...url.searchParams.keys()]) if(['service','request','version','layers','styles','format','transparent','width','height','crs','srs','bbox'].includes(k.toLowerCase())) url.searchParams.delete(k);
          const params={service:'WMS',request:'GetMap',version:'1.1.1',layers:l.wmsParams.layers,styles:l.wmsParams.styles||'',format:'image/png',transparent:'true',width:256,height:256,srs:'EPSG:3857',bbox:'{bbox-epsg-3857}'};
          Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
          map.addSource(id,{type:'raster',tiles:[url.href.replace('%7Bbbox-epsg-3857%7D','{bbox-epsg-3857}')],tileSize:256,attribution:entry.def.source});
          map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':l.options.opacity??0.8}},before);
          overlays.set(key,{source:id,layers:[id]});
        } else if(l.toGeoJSON) {
          map.addSource(id,{type:'geojson',data:l.toGeoJSON()});
          const fc=['coalesce',['get','color'],color], annot=entry.def.type==='annotation';
          const layers=[{id:id+'-fill',type:'fill',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':fc,'fill-opacity':annot?0.22:0.12}}, {id:id+'-line',type:'line',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':fc,'line-width':annot?2.5:1.2}}, {id:id+'-point',type:'circle',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':fc,'circle-radius':annot?7:4,'circle-stroke-width':annot?2:1,'circle-stroke-color':'#fff'}}];
          // 註記畫在建築量體之上，其餘向量圖層維持在量體之下
          layers.forEach(layer=>map.addLayer({...layer,source:id},annot?undefined:before));
          overlays.set(key,{source:id,layers:layers.map(l=>l.id)});
        }
      } catch(error) { console.warn('3D overlay unavailable',key,error); }
    });
  }
  function init(context,hash) {
    app=context;
    $('btn-3d').addEventListener('click',()=>active?close():open());
    $('model-pitch').addEventListener('input',()=>{const n=+$('model-pitch').value;$('model-pitch-value').textContent=n+'°';if(map) map.setPitch(n);});
    $('model-north').addEventListener('click',()=>{if(map)map.easeTo({bearing:0});});
    $('model-color').addEventListener('change',()=>{
      if(!map)return;
      const color=$('model-color').value==='white'?'#e6e2d7':heightColor;
      for(const id of tiles.keys())if(map.getLayer(id))map.setPaintProperty(id,'fill-extrusion-color',color);
      if(map.getLayer(OSM_SRC))map.setPaintProperty(OSM_SRC,'fill-extrusion-color',color);
    });
    $('buildings-visible').addEventListener('change',()=>{
      if(map&&map.getLayer(OSM_SRC))map.setLayoutProperty(OSM_SRC,'visibility',$('buildings-visible').checked?'visible':'none');
      refreshBuildings();
    });
    $('model-retry').addEventListener('click',()=>{
      if(!active) {open();return;}
      if(mode()==='osm'){osmBounds=null;updateOsm();return;}
      if(!manifest){loadManifest();return;}
      for(const [id,t] of tiles)if(t.error)removeTile(id); updateTiles();
    });
    $('model-places').addEventListener('click',async(event)=>{
      const button=event.target.closest('button'); if(!button)return;
      if(button.id==='model-coverage'){
        if(!map||!manifest)return;
        const b=new maplibregl.LngLatBounds();
        manifest.tiles.forEach(t=>{b.extend(t.bounds.slice(0,2));b.extend(t.bounds.slice(2));});
        map.fitBounds(b,{padding:35,pitch:0,bearing:0}); return;
      }
      if(!button.dataset.place)return;
      if(!active)await open();
      if(map&&active)map.flyTo({center:button.dataset.place.split(',').map(Number),zoom:16,pitch:55,bearing:-25});
    });
    app.state.map.on('moveend',()=>{if(active&&map&&!syncing){const c=app.state.map.getCenter();syncing=true;map.jumpTo({center:[c.lng,c.lat],zoom:app.state.map.getZoom()});syncing=false;}});
    const queueOverlays=()=>{clearTimeout(overlayTimer);overlayTimer=setTimeout(syncOverlays,100);};
    app.state.map.on('layeradd layerremove',queueOverlays);
    new MutationObserver(queueOverlays).observe($('layer-list'),{childList:true,subtree:true,characterData:true});
    $('layer-list').addEventListener('input',queueOverlays);
    new ResizeObserver(()=>{if(map)map.resize();}).observe($('map3d'));
    // Explicit 2D share links retain 2D; new visits open the city model.
    if(!hash||hash.v!=='2d')open(hash);
  }
  window.DD3D={init,camera,close,setCity,refreshOverlays:()=>{clearTimeout(overlayTimer);overlayTimer=setTimeout(syncOverlays,100);}};
})();
