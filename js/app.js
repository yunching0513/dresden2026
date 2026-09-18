/* app.js：Dresden Open Data Layers主程式 */
(function () {
  'use strict';

  const CITIES = window.DD_CITIES;
  const G = window.DDGeo;
  let C = null; // 目前城市的圖層目錄；切換城市時改指 CITIES[id].catalog
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, attrs, children) => {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    (children || []).forEach((c) => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };

  const state = {
    map: null,
    city: null,        // 目前城市設定（js/cities.js）
    cityId: null,
    layers: {},        // id -> { def, leaflet, status, features, counts }
    stFC: null,        // 統計單元（Stadtteile／行政區）FeatureCollection
    stIndex: null,
    stLayer: null,
    stLabels: null,
    unitId: null,      // 該市統計單元圖層的id
    unitColors: {},
    selectedCode: null,
    choropleth: null,  // { field, label, values: {code: number}, breaks, perKm2 }
    customCount: 0,
    baseLayers: {},
    baseControl: null,
    attribution: null,
  };

  /* ------------------------------------------------------------------ */
  /* 地圖初始化                                                           */
  /* ------------------------------------------------------------------ */
  function initMap() {
    const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomSnap: 0, minZoom: 8, maxZoom: 19 })
      .setView(state.city.center, state.city.zoom);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    map.on('click', onMapClick);
    map.on('moveend', writeHash);
    map.on('zoomend', updateLabelVisibility);
    state.map = map;
    setBaseLayers();
  }

  /* 底圖隨城市而異：臺北預設用國土測繪中心的通用版電子地圖。 */
  function setBaseLayers() {
    const map = state.map;
    Object.values(state.baseLayers).forEach((l) => { if (map.hasLayer(l)) map.removeLayer(l); });
    if (state.baseControl) { map.removeControl(state.baseControl); state.baseControl = null; }
    if (state.attribution) map.attributionControl.removeAttribution(state.attribution);
    const entries = {};
    state.city.baseLayers.forEach((b, i) => {
      const layer = L.tileLayer(b.url, b.opts);
      entries[b.name] = layer;
      if (i === 0) layer.addTo(map);
    });
    state.baseLayers = entries;
    state.baseControl = L.control.layers(entries, null, { position: 'topright', collapsed: true }).addTo(map);
    state.attribution = state.city.attribution;
    map.attributionControl.addAttribution(state.attribution);
  }

  /* ------------------------------------------------------------------ */
  /* Stadtteile（附帶資料）                                                */
  /* ------------------------------------------------------------------ */
  function initUnits() {
    if (state.stLayer && state.map.hasLayer(state.stLayer)) state.map.removeLayer(state.stLayer);
    if (state.stLabels && state.map.hasLayer(state.stLabels)) state.map.removeLayer(state.stLabels);
    const fc = state.city.boundaries();
    state.stFC = fc;
    state.stIndex = G.buildIndex(fc);
    state.unitId = (C.layers.find((l) => l.type === 'bundled') || {}).id;
    state.unitColors = {};
    fc.features.forEach((f, i) => {
      const p = f.properties;
      state.unitColors[p.code] = state.city.unit.hasParent
        ? (BEZIRK_COLORS[p.bezirk_code] || '#999')
        : UNIT_PALETTE[i % UNIT_PALETTE.length];
    });
    state.stLayer = L.geoJSON(fc, {
      style: styleStadtteil,
      onEachFeature(feature, layer) {
        layer.on({
          mouseover: (e) => { if (!state.choropleth) e.target.setStyle({ weight: 2.5, fillOpacity: 0.15 }); showHover(feature); },
          mouseout: (e) => { state.stLayer.resetStyle(e.target); hideHover(); },
          click: (e) => { if (window.DDAnnotate && window.DDAnnotate.isDrawing()) return; L.DomEvent.stopPropagation(e); selectStadtteil(feature.properties.code, true); },
        });
      },
    });
    state.stLabels = L.layerGroup();
    fc.features.forEach((f) => {
      const p = G.labelPoint(f);
      const m = L.marker(p, {
        interactive: false,
        icon: L.divIcon({ className: 'st-label', html: `<span>${f.properties.name}</span>`, iconSize: null }),
      });
      state.stLabels.addLayer(m);
    });
  }

  const BEZIRK_COLORS = { 0: '#e6194b', 1: '#3cb44b', 2: '#4363d8', 3: '#f58231', 4: '#911eb4', 5: '#42d4f4', 6: '#f032e6', 7: '#bfef45', 8: '#fabed4', 9: '#469990' };
  // 無上層分區的城市（如臺北12行政區）：直接給每個單元一個可辨識的顏色
  const UNIT_PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#469990', '#9a6324', '#800000', '#808000', '#000075'];

  function styleStadtteil(feature) {
    const p = feature.properties;
    const selected = state.selectedCode === p.code;
    if (state.choropleth) {
      const v = state.choropleth.values[p.code];
      const cls = Number.isFinite(v) ? G.classIndex(v, state.choropleth.breaks) : -1;
      return {
        color: selected ? '#000' : '#555', weight: selected ? 3 : 0.8,
        fillColor: cls < 0 ? '#eee' : CHORO_PALETTE[cls], fillOpacity: cls < 0 ? 0.3 : 0.75,
      };
    }
    return {
      color: selected ? '#000' : (p.ortschaft ? '#7b5e3b' : '#1f4e79'),
      weight: selected ? 3 : 1.2,
      dashArray: p.ortschaft ? '4 3' : null,
      fillColor: state.unitColors[p.code] || '#999',
      fillOpacity: selected ? 0.2 : 0.06,
    };
  }
  const CHORO_PALETTE = ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d'];

  function updateLabelVisibility() {
    if (!state.map || !state.stLabels) return;
    const on = state.map.hasLayer(state.stLayer) && state.map.getZoom() >= 12;
    if (on && !state.map.hasLayer(state.stLabels)) state.stLabels.addTo(state.map);
    if (!on && state.map.hasLayer(state.stLabels)) state.map.removeLayer(state.stLabels);
  }

  function showHover(feature) {
    const p = feature.properties;
    const box = $('#hoverbox');
    box.hidden = false;
    box.innerHTML = `<b>${p.code} ${p.name}</b><br><span class="muted">${p.bezirk} · ${G.fmt(p.area_km2, 2)} km²</span>`;
  }
  function hideHover() { $('#hoverbox').hidden = true; }

  function getFeatureByCode(code) {
    return state.stFC.features.find((f) => f.properties.code === code);
  }

  function selectStadtteil(code, zoom) {
    state.selectedCode = code;
    state.stLayer.setStyle(styleStadtteil);
    const f = getFeatureByCode(code);
    if (!f) return;
    if (zoom) {
      const b = G.bboxOfFeature(f);
      state.map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [40, 40], maxZoom: 15 });
    }
    renderDistrictCard(f);
    switchTab('stats');
  }

  function renderDistrictCard(f) {
    const p = f.properties;
    const card = $('#district-card');
    const rows = [];
    if (state.city.unit.hasParent) rows.push(`<tr><th>${state.city.unit.parent}</th><td>${p.bezirk}</td></tr>`);
    rows.push(`<tr><th>面積</th><td>${G.fmt(p.area_km2, 2)} km²</td></tr>`);
    if (p.official_name && p.official_name !== p.name) rows.push(`<tr><th>正式名稱</th><td>${p.official_name}</td></tr>`);
    if (state.choropleth) {
      const v = state.choropleth.values[p.code];
      rows.push(`<tr><th>${state.choropleth.label}</th><td>${G.fmt(v, 2)}</td></tr>`);
    }
    const loaded = Object.values(state.layers).filter((l) => l.def.type === 'overpass' && l.counts && l.def.geom !== 'line');
    for (const l of loaded) {
      const n = l.counts[p.code] || 0;
      rows.push(`<tr><th>${l.def.name}</th><td>${n} <span class="muted">（${G.fmt(n / p.area_km2, 1)}/km²）</span></td></tr>`);
    }
    card.innerHTML = `<h3>${p.code} ${p.name}</h3><table class="kv">${rows.join('')}</table>
      <p class="muted small">設施數以OSM物件中心點落入本區計算，僅供概覽；官方統計請以${state.city.id === 'taipei' ? '臺北市主計處與民政局' : 'Stadtteilkatalog'}為準。</p>`;
    card.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* 圖層面板                                                             */
  /* ------------------------------------------------------------------ */
  function renderLayerPanel() {
    const root = $('#layer-list');
    root.innerHTML = '';
    for (const g of C.groups) {
      const items = C.layers.filter((l) => l.group === g.id);
      const box = el('details', { class: 'group', open: '' }, [
        el('summary', {}, [el('span', { class: 'group-title', text: g.title }), el('span', { class: 'count', text: `${items.length}` })]),
        el('p', { class: 'hint', text: g.hint }),
      ]);
      items.forEach((def) => box.appendChild(layerRow(def)));
      root.appendChild(box);
    }
  }

  function layerRow(def) {
    const id = def.id;
    const row = el('div', { class: 'layer', 'data-id': id });
    const cb = el('input', { type: 'checkbox', id: `cb-${id}` });
    cb.addEventListener('change', () => toggleLayer(id, cb.checked));
    const swatch = el('span', { class: 'swatch', style: `background:${def.color || '#999'}` });
    const badge = el('span', { class: `badge src-${def.type}`, text: sourceLabel(def) });
    const status = el('span', { class: 'status', id: `st-${id}` });
    const label = el('label', { for: `cb-${id}` }, [swatch, el('span', { class: 'lname', text: def.name })]);
    const head = el('div', { class: 'layer-head' }, [cb, label, badge, status]);
    row.appendChild(head);

    const body = el('div', { class: 'layer-body', hidden: '' });
    body.appendChild(el('p', { class: 'desc', text: def.desc || '' }));
    body.appendChild(el('p', { class: 'meta', html: `<b>${def.de || ''}</b><br>來源：${def.source}（${def.license}）` }));
    if (def.type === 'wms' && C.WMS_BASE) {
      const capUrl = `${C.WMS_BASE}?NodeId=${def.nodeId}&Service=WMS&Request=GetCapabilities`;
      body.appendChild(el('p', { class: 'meta', html: `NodeId ${def.nodeId} · <a href="${capUrl}" target="_blank" rel="noopener">GetCapabilities</a> · <a href="${C.WFS_BASE}?NodeId=${def.nodeId}&Service=WFS&Request=GetCapabilities" target="_blank" rel="noopener">WFS</a>` }));
      const opacity = el('input', { type: 'range', min: 0, max: 100, value: Math.round((def.opacity || 0.8) * 100) });
      opacity.addEventListener('input', () => { const l = state.layers[id]; if (l && l.leaflet) l.leaflet.setOpacity(opacity.value / 100); });
      body.appendChild(el('div', { class: 'row' }, [el('span', { class: 'small', text: '透明度' }), opacity]));
      body.appendChild(el('div', { class: 'legend-box', id: `lg-${id}` }));
    }
    if (def.type === 'xyz') {
      const opacity = el('input', { type: 'range', min: 0, max: 100, value: Math.round((def.opacity || 0.8) * 100) });
      opacity.addEventListener('input', () => { const l = state.layers[id]; if (l && l.leaflet) l.leaflet.setOpacity(opacity.value / 100); });
      body.appendChild(el('div', { class: 'row' }, [el('span', { class: 'small', text: '透明度' }), opacity]));
      body.appendChild(el('p', { class: 'meta mono', text: def.url }));
      if (def.minZoom) body.appendChild(el('p', { class: 'meta', text: `放大至 z${def.minZoom} 以上才會顯示內容。` }));
    }
    if (def.type === 'portal') {
      const href = def.portalUrl || `https://opendata.dresden.de/?q=${encodeURIComponent(def.portalQuery || '')}`;
      const label = def.portalUrl ? '前往官方查詢系統 ↗' : `在opendata.dresden.de搜尋「${def.portalQuery}」`;
      body.appendChild(el('p', { class: 'meta', html: `<a href="${href}" target="_blank" rel="noopener">${label}</a>` }));
      cb.disabled = true;
      body.hidden = false;
    }
    if (def.type === 'overpass') {
      const q = def.rawQuery || (def.query + (def.relQuery || ''));
      body.appendChild(el('p', { class: 'meta mono', text: q.replace(/\(\{\{bbox\}\}\)/g, '') }));
      const btn = el('button', { class: 'mini', text: '匯出GeoJSON' });
      btn.addEventListener('click', () => exportLayer(id));
      body.appendChild(btn);
    }
    row.appendChild(body);

    const info = el('button', { class: 'info', title: '說明', text: 'i' });
    info.addEventListener('click', () => { body.hidden = !body.hidden; });
    head.appendChild(info);
    return row;
  }

  function sourceLabel(def) {
    if (def.type === 'wms') return def.verified ? '官方WMS' : '官方WMS?';
    if (def.type === 'xyz') return '官方圖磚';
    if (def.type === 'overpass') return 'OSM';
    if (def.type === 'bundled' || def.type === 'geojson') return '附帶';
    if (def.type === 'portal') return '待補NodeId';
    if (def.type === 'custom') return '自訂';
    return def.type;
  }

  function setStatus(id, text, cls) {
    const s = $(`#st-${id}`);
    if (!s) return;
    s.textContent = text || '';
    s.className = `status ${cls || ''}`;
  }

  /* ------------------------------------------------------------------ */
  /* 圖層開關                                                             */
  /* ------------------------------------------------------------------ */
  function toggleLayer(id, on) {
    const def = C.layers.find((l) => l.id === id) || (state.layers[id] && state.layers[id].def);
    if (!def) return;
    const cb = $(`#cb-${id}`);
    if (cb && cb.checked !== on) cb.checked = on;
    if (on) {
      if (def.type === 'bundled') { state.stLayer.addTo(state.map); updateLabelVisibility(); state.layers[id] = { def, leaflet: state.stLayer }; }
      else if (def.type === 'wms') addWms(def);
      else if (def.type === 'xyz') addXyz(def);
      else if (def.type === 'geojson') addLocalGeoJSON(def);
      else if (def.type === 'overpass') addOverpass(def);
      else if (def.type === 'custom' || def.type === 'annotation') { state.layers[id].leaflet.addTo(state.map); }
    } else {
      const l = state.layers[id];
      if (l && l.leaflet) state.map.removeLayer(l.leaflet);
      if (def.type === 'bundled') updateLabelVisibility();
      if (l && def.type !== 'custom' && def.type !== 'bundled' && def.type !== 'annotation') delete state.layers[id];
      setStatus(id, '');
    }
    writeHash();
    refreshStatsSelect();
  }

  /* ------------------------------------------------------------------ */
  /* 官方WMS                                                             */
  /* ------------------------------------------------------------------ */
  /* 官方WMTS／XYZ圖磚（如國土測繪中心） */
  function addXyz(def) {
    const entry = { def, leaflet: null, status: 'loading', errors: 0 };
    state.layers[def.id] = entry;
    setStatus(def.id, '載入中…', 'loading');
    const layer = L.tileLayer(def.url, {
      opacity: def.opacity === undefined ? 0.8 : def.opacity,
      maxZoom: 19, minZoom: def.minZoom || 0, attribution: def.source,
    });
    layer.on('load', () => { if (entry.status !== 'error') { entry.status = 'ok'; setStatus(def.id, '✓', 'ok'); } });
    layer.on('tileerror', () => { entry.errors++; if (entry.errors > 8) { entry.status = 'error'; setStatus(def.id, '⚠ 無法載入', 'error'); } });
    entry.leaflet = layer;
    layer.addTo(state.map);
  }

  /* 隨站附帶、開啟時才抓取的GeoJSON（如臺北里界） */
  const localCache = {};
  async function addLocalGeoJSON(def) {
    const id = def.id;
    const entry = { def, leaflet: null, status: 'loading' };
    state.layers[id] = entry;
    setStatus(id, '載入中…', 'loading');
    try {
      let fc = localCache[def.url];
      if (!fc) { const res = await fetch(def.url); if (!res.ok) throw new Error('HTTP ' + res.status); fc = await res.json(); localCache[def.url] = fc; }
      if (!state.layers[id]) return;
      entry.features = fc;
      const layer = L.geoJSON(fc, {
        renderer: L.canvas({ padding: 0.5 }),
        style: () => ({ color: def.color, weight: def.weight || 1, fillColor: def.color, fillOpacity: def.fill === undefined ? 0.05 : def.fill }),
        onEachFeature: (f, l) => l.bindPopup(() => popupHtml(f.properties || {}), { maxWidth: 320 }),
      });
      entry.leaflet = layer;
      layer.addTo(state.map);
      entry.status = 'ok';
      setStatus(id, `${fc.features.length} 筆`, 'ok');
    } catch (err) {
      entry.status = 'error';
      setStatus(id, '⚠ ' + (err.message || '失敗'), 'error');
    }
  }

  function addWms(def) {
    const id = def.id;
    const url = def.url || `${C.WMS_BASE}?NodeId=${def.nodeId}&Service=WMS&`;
    const entry = { def, leaflet: null, status: 'loading', errors: 0, version: '1.3.0' };
    state.layers[id] = entry;
    setStatus(id, '載入中…', 'loading');

    const make = (layersParam, version) => {
      const opts = {
        layers: layersParam, format: 'image/png', transparent: true, version,
        opacity: def.opacity || 0.8, maxZoom: 19,
      };
      if (version === '1.3.0') opts.crs = L.CRS.EPSG3857;
      const wl = L.tileLayer.wms(url, opts);
      wl.on('load', () => { if (entry.status !== 'error') { entry.status = 'ok'; setStatus(id, '✓', 'ok'); } });
      wl.on('tileerror', () => {
        entry.errors++;
        if (entry.errors === 3 && entry.version === '1.3.0') {
          // 退回WMS 1.1.1（部分服務對1.3.0 + EPSG:3857的支援不完整）
          entry.version = '1.1.1';
          state.map.removeLayer(wl);
          entry.leaflet = make(layersParam, '1.1.1');
          entry.leaflet.addTo(state.map);
        } else if (entry.errors > 8) {
          entry.status = 'error';
          setStatus(id, '⚠ 無法載入', 'error');
        }
      });
      return wl;
    };

    const start = (layersParam) => {
      entry.layersParam = layersParam;
      entry.leaflet = make(layersParam, '1.3.0');
      entry.leaflet.addTo(state.map);
      renderLegend(def, layersParam);
    };

    if (def.layers) { start(def.layers); return; }
    // 嘗試讀取GetCapabilities自動取得圖層名稱；跨域失敗則以NodeId作為圖層名
    fetchCapabilities(url).then((names) => {
      start(names && names.length ? names.join(',') : String(def.nodeId));
    }).catch(() => start(String(def.nodeId)));
  }

  async function fetchCapabilities(url) {
    const res = await fetch(`${url}Request=GetCapabilities&Version=1.3.0`, { mode: 'cors' });
    if (!res.ok) throw new Error('cap ' + res.status);
    const txt = await res.text();
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    const names = [];
    doc.querySelectorAll('Layer > Name').forEach((n) => { if (n.textContent.trim()) names.push(n.textContent.trim()); });
    return names;
  }

  function renderLegend(def, layersParam) {
    const box = $(`#lg-${def.id}`);
    if (!box) return;
    const url = def.url || `${C.WMS_BASE}?NodeId=${def.nodeId}&Service=WMS&`;
    const first = String(layersParam).split(',')[0];
    const legend = `${url}Request=GetLegendGraphic&Version=1.3.0&Format=image/png&Layer=${encodeURIComponent(first)}&Sld_Version=1.1.0`;
    box.innerHTML = '';
    const img = el('img', { src: legend, alt: '圖例', class: 'legend-img' });
    img.addEventListener('error', () => { box.innerHTML = '<span class="muted small">此服務未提供圖例</span>'; });
    box.appendChild(img);
  }

  /* GetFeatureInfo：點擊地圖查詢已開啟的WMS圖層屬性 */
  function onMapClick(e) {
    if (window.DDAnnotate && window.DDAnnotate.isDrawing()) return;
    const active = Object.values(state.layers).filter((l) => l.def.type === 'wms' && l.leaflet && state.map.hasLayer(l.leaflet));
    if (!active.length) return;
    const map = state.map;
    const size = map.getSize();
    const b = map.getBounds();
    const sw = L.CRS.EPSG3857.project(b.getSouthWest());
    const ne = L.CRS.EPSG3857.project(b.getNorthEast());
    const pt = map.latLngToContainerPoint(e.latlng);
    const links = active.map((l) => {
      const url = l.def.url || `${C.WMS_BASE}?NodeId=${l.def.nodeId}&Service=WMS&`;
      const q = `Request=GetFeatureInfo&Version=1.3.0&CRS=EPSG:3857&BBOX=${sw.x},${sw.y},${ne.x},${ne.y}&WIDTH=${size.x}&HEIGHT=${size.y}&LAYERS=${encodeURIComponent(l.layersParam)}&QUERY_LAYERS=${encodeURIComponent(l.layersParam)}&INFO_FORMAT=text/html&I=${Math.round(pt.x)}&J=${Math.round(pt.y)}&FEATURE_COUNT=10`;
      return { def: l.def, url: url + q };
    });
    const popup = L.popup({ maxWidth: 360 }).setLatLng(e.latlng)
      .setContent(`<div class="gfi">${links.map((x) => `<div class="gfi-item" data-url="${x.url}"><b>${x.def.name}</b><div class="gfi-body muted small">查詢中…</div></div>`).join('')}</div>`)
      .openOn(map);
    $$('.gfi-item', popup.getElement()).forEach(async (node) => {
      const url = node.getAttribute('data-url');
      const body = $('.gfi-body', node);
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(res.status);
        const html = await res.text();
        const txt = html.replace(/<script[\s\S]*?<\/script>/gi, '').trim();
        body.innerHTML = txt.length > 20 ? `<div class="gfi-html">${txt}</div>` : '<span class="muted">此處無屬性資料</span>';
        body.classList.remove('muted');
      } catch (err) {
        body.innerHTML = `瀏覽器跨域限制，無法內嵌顯示。<a href="${url}" target="_blank" rel="noopener">在新分頁開啟查詢結果 ↗</a>`;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Overpass（OSM）                                                      */
  /* ------------------------------------------------------------------ */
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const overpassCache = {};

  function buildQuery(def) {
    const bbox = state.city.bbox.join(',');
    if (def.rawQuery) return `[out:json][timeout:120];${def.rawQuery.replace(/\{\{bbox\}\}/g, bbox)}`;
    const q = def.query.replace(/\{\{bbox\}\}/g, bbox);
    if (def.geom === 'point') return `[out:json][timeout:120];(${q});out center tags;`;
    let s = `[out:json][timeout:120];(${q});out geom;`;
    if (def.relQuery) s += `(${def.relQuery.replace(/\{\{bbox\}\}/g, bbox)});out center tags;`;
    return s;
  }

  async function runOverpass(query) {
    let lastErr;
    for (const ep of OVERPASS) {
      try {
        const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Overpass無法連線');
  }

  function osmToFeatures(json, def) {
    const feats = [];
    for (const elmt of json.elements) {
      const tags = elmt.tags || {};
      const props = Object.assign({ _osm: `${elmt.type}/${elmt.id}` }, tags);
      if (elmt.type === 'node') {
        feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [elmt.lon, elmt.lat] } });
      } else if (elmt.geometry && elmt.geometry.length) {
        const coords = elmt.geometry.map((p) => [p.lon, p.lat]);
        const closed = coords.length > 3 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];
        if (def.geom === 'polygon' && closed) feats.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [coords] } });
        else feats.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
      } else if (elmt.center) {
        feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [elmt.center.lon, elmt.center.lat] } });
      }
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function featureCenter(f) {
    const g = f.geometry;
    if (g.type === 'Point') return g.coordinates;
    const b = G.bboxOfFeature(f);
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }

  function countPerStadtteil(fc) {
    const counts = {};
    let inside = 0;
    for (const f of fc.features) {
      const c = featureCenter(f);
      const st = state.stIndex.locate(c[0], c[1]);
      if (st) { counts[st.properties.code] = (counts[st.properties.code] || 0) + 1; inside++; }
    }
    return { counts, inside };
  }

  function popupHtml(props) {
    const skip = new Set(['_osm']);
    const name = props.name || props['name:de'] || props.official_name || '';
    const rows = Object.entries(props).filter(([k]) => !skip.has(k) && k !== 'name').slice(0, 14)
      .map(([k, v]) => `<tr><th>${k}</th><td>${String(v)}</td></tr>`).join('');
    const link = props._osm ? `<a href="https://www.openstreetmap.org/${props._osm}" target="_blank" rel="noopener" class="small">OSM ↗</a>` : '';
    return `<div class="poi"><b>${name || '(未命名)'}</b> ${link}<table class="kv small">${rows}</table></div>`;
  }

  async function addOverpass(def) {
    const id = def.id;
    const entry = { def, leaflet: null, status: 'loading' };
    state.layers[id] = entry;
    setStatus(id, '查詢OSM…', 'loading');
    try {
      const cacheKey = `${state.cityId}:${id}`;
      let fc = overpassCache[cacheKey];
      if (!fc) {
        const json = await runOverpass(buildQuery(def));
        fc = osmToFeatures(json, def);
        overpassCache[cacheKey] = fc;
      }
      if (!state.layers[id]) return; // 使用者已取消
      entry.features = fc;
      const renderer = L.canvas({ padding: 0.5 });
      const layer = L.geoJSON(fc, {
        renderer,
        pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: def.radius || 4, color: '#fff', weight: 1, fillColor: def.color, fillOpacity: 0.9 }),
        style: () => ({ color: def.color, weight: def.weight || 1.5, fillColor: def.color, fillOpacity: def.fill === undefined ? 0.3 : def.fill }),
        onEachFeature: (f, l) => l.bindPopup(() => popupHtml(f.properties), { maxWidth: 320 }),
      });
      entry.leaflet = layer;
      layer.addTo(state.map);
      entry.status = 'ok';
      if (def.geom === 'line') {
        setStatus(id, `${fc.features.length} 段`, 'ok');
      } else {
        const { counts, inside } = countPerStadtteil(fc);
        entry.counts = counts;
        setStatus(id, `${fc.features.length} 筆（市域內 ${inside}）`, 'ok');
      }
      refreshStatsSelect();
      if (state.selectedCode) renderDistrictCard(getFeatureByCode(state.selectedCode));
    } catch (err) {
      entry.status = 'error';
      setStatus(id, '⚠ ' + (err.message || '失敗'), 'error');
      console.error(err);
    }
  }

  function exportLayer(id) {
    const l = state.layers[id];
    const fc = (l && l.features) || overpassCache[`${state.cityId}:${id}`];
    if (!fc) { alert('請先開啟圖層並完成載入。'); return; }
    downloadText(`${id}.geojson`, JSON.stringify(fc));
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ------------------------------------------------------------------ */
  /* 統計頁籤                                                             */
  /* ------------------------------------------------------------------ */
  function refreshStatsSelect() {
    const sel = $('#stats-layer');
    const prev = sel.value;
    sel.innerHTML = '';
    const loaded = Object.values(state.layers).filter((l) => l.def.type === 'overpass' && l.counts && l.def.geom !== 'line');
    if (state.choropleth) sel.appendChild(el('option', { value: '__choro', text: `匯入指標：${state.choropleth.label}` }));
    loaded.forEach((l) => sel.appendChild(el('option', { value: l.def.id, text: l.def.name })));
    if (!sel.options.length) sel.appendChild(el('option', { value: '', text: '（請先開啟任一OSM圖層或匯入CSV）' }));
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
    renderStatsTable();
  }

  function renderStatsTable() {
    const sel = $('#stats-layer');
    const wrap = $('#stats-table');
    const byBezirk = $('#stats-bezirk').checked;
    const id = sel.value;
    if (!id) { wrap.innerHTML = ''; return; }
    let label, getVal;
    if (id === '__choro') { label = state.choropleth.label; getVal = (code) => state.choropleth.values[code]; }
    else { const l = state.layers[id]; if (!l) { wrap.innerHTML = ''; return; } label = '數量'; getVal = (code) => l.counts[code] || 0; }

    let rows;
    if (byBezirk) {
      const agg = {};
      for (const f of state.stFC.features) {
        const p = f.properties; const k = p.bezirk;
        agg[k] = agg[k] || { name: k, area: 0, val: 0, n: 0 };
        agg[k].area += p.area_km2;
        const v = getVal(p.code);
        if (Number.isFinite(v)) { agg[k].val += v; agg[k].n++; }
      }
      rows = Object.values(agg).map((a) => ({ code: '', name: a.name, area: a.area, val: id === '__choro' && !state.choropleth.additive ? (a.n ? a.val / a.n : NaN) : a.val }));
    } else {
      rows = state.stFC.features.map((f) => ({ code: f.properties.code, name: f.properties.name, area: f.properties.area_km2, val: getVal(f.properties.code) }));
    }
    const sortKey = wrap.dataset.sort || 'val';
    const dir = wrap.dataset.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = sortKey === 'name' ? a.name : sortKey === 'area' ? a.area : sortKey === 'dens' ? a.val / a.area : a.val;
      const bv = sortKey === 'name' ? b.name : sortKey === 'area' ? b.area : sortKey === 'dens' ? b.val / b.area : b.val;
      if (typeof av === 'string') return av.localeCompare(bv, state.city.locale) * dir;
      return ((Number.isFinite(av) ? av : -Infinity) - (Number.isFinite(bv) ? bv : -Infinity)) * dir;
    });
    const total = rows.reduce((s, r) => s + (Number.isFinite(r.val) ? r.val : 0), 0);
    const th = (k, t) => `<th data-key="${k}" class="sortable ${sortKey === k ? 'active' : ''}">${t}</th>`;
    const showDens = id !== '__choro' || state.choropleth.additive;
    wrap.innerHTML = `<table class="stats"><thead><tr>${th('name', byBezirk ? state.city.unit.parent : state.city.unit.one)}${th('area', 'km²')}${th('val', label)}${showDens ? th('dens', '/km²') : ''}</tr></thead>
      <tbody>${rows.map((r) => `<tr data-code="${r.code}"><td>${r.code ? r.code + ' ' : ''}${r.name}</td><td class="num">${G.fmt(r.area, 1)}</td><td class="num">${G.fmt(r.val, 2)}</td>${showDens ? `<td class="num">${G.fmt(r.val / r.area, 1)}</td>` : ''}</tr>`).join('')}</tbody>
      ${showDens ? `<tfoot><tr><td>合計</td><td class="num">${G.fmt(rows.reduce((s, r) => s + r.area, 0), 1)}</td><td class="num">${G.fmt(total, 0)}</td><td></td></tr></tfoot>` : ''}</table>`;
    $$('th.sortable', wrap).forEach((h) => h.addEventListener('click', () => {
      const k = h.dataset.key;
      if (wrap.dataset.sort === k) wrap.dataset.dir = wrap.dataset.dir === 'asc' ? 'desc' : 'asc';
      else { wrap.dataset.sort = k; wrap.dataset.dir = k === 'name' ? 'asc' : 'desc'; }
      renderStatsTable();
    }));
    $$('tbody tr', wrap).forEach((tr) => tr.addEventListener('click', () => { if (tr.dataset.code) selectStadtteil(tr.dataset.code, true); }));
  }

  /* ------------------------------------------------------------------ */
  /* CSV匯入 → choropleth                                                */
  /* ------------------------------------------------------------------ */
  function parseCsv(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length);
    if (!lines.length) return { header: [], rows: [] };
    const first = lines[0];
    const delim = [';', '\t', ','].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
    const split = (line) => {
      const out = []; let cur = ''; let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const header = split(lines[0]);
    const rows = lines.slice(1).map(split);
    return { header, rows };
  }

  const normName = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[()\-\/.,]/g, '');
  const toNum = (s) => {
    if (s === undefined || s === null) return NaN;
    let t = String(s).trim().replace(/\s/g, '');
    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    else t = t.replace(/,/g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : NaN;
  };

  function setupCsv() {
    const ta = $('#csv-text');
    const file = $('#csv-file');
    const keySel = $('#csv-key');
    const valSel = $('#csv-val');
    let parsed = null;

    const analyse = () => {
      parsed = parseCsv(ta.value);
      keySel.innerHTML = ''; valSel.innerHTML = '';
      if (!parsed.header.length) return;
      parsed.header.forEach((h, i) => {
        keySel.appendChild(el('option', { value: i, text: h }));
        valSel.appendChild(el('option', { value: i, text: h }));
      });
      // 自動猜測：鍵欄位＝最多列符合兩位數代碼或Stadtteil名稱者；值欄位＝最多列為數字者
      const codes = new Set(state.stFC.features.map((f) => f.properties.code));
      const names = new Map(state.stFC.features.map((f) => [normName(f.properties.name), f.properties.code]));
      let bestK = 0, bestKs = -1, bestV = Math.min(1, parsed.header.length - 1), bestVs = -1;
      parsed.header.forEach((h, i) => {
        let ks = 0, vs = 0;
        for (const r of parsed.rows) {
          const c = r[i];
          if (codes.has(String(c).padStart(2, '0')) || names.has(normName(c))) ks++;
          if (Number.isFinite(toNum(c))) vs++;
        }
        if (ks > bestKs) { bestKs = ks; bestK = i; }
        if (vs > bestVs && i !== bestK) { bestVs = vs; bestV = i; }
      });
      keySel.value = bestK; valSel.value = bestV;
      $('#csv-info').textContent = `已讀取 ${parsed.rows.length} 列、${parsed.header.length} 欄；鍵欄位比對到 ${bestKs} 列。`;
    };
    ta.addEventListener('input', analyse);
    file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { ta.value = reader.result; analyse(); };
      reader.readAsText(f, 'utf-8');
    });
    $('#csv-apply').addEventListener('click', () => {
      if (!parsed || !parsed.rows.length) { analyse(); if (!parsed.rows.length) return; }
      const ki = +keySel.value, vi = +valSel.value;
      const names = new Map(state.stFC.features.map((f) => [normName(f.properties.name), f.properties.code]));
      const codes = new Set(state.stFC.features.map((f) => f.properties.code));
      const values = {}; let matched = 0;
      for (const r of parsed.rows) {
        const k = r[ki]; let code = null;
        const padded = String(k).padStart(2, '0');
        if (codes.has(padded)) code = padded; else if (names.has(normName(k))) code = names.get(normName(k));
        if (!code) continue;
        const v = toNum(r[vi]);
        if (!Number.isFinite(v)) continue;
        values[code] = $('#csv-perkm2').checked ? v / getFeatureByCode(code).properties.area_km2 : v;
        matched++;
      }
      if (!matched) { $('#csv-info').textContent = `沒有任何列能對應到${state.city.unit.one}代碼或名稱，請確認鍵欄位。`; return; }
      const label = parsed.header[vi] + ($('#csv-perkm2').checked ? '（/km²）' : '');
      state.choropleth = { label, values, breaks: G.quantileBreaks(Object.values(values), 5), additive: !$('#csv-perkm2').checked && $('#csv-additive').checked };
      state.stLayer.setStyle(styleStadtteil);
      if (!state.map.hasLayer(state.stLayer)) toggleLayer(state.unitId, true);
      renderChoroLegend();
      $('#csv-info').textContent = `已套用：${matched} 個${state.city.unit.one}對應成功。`;
      refreshStatsSelect();
      $('#stats-layer').value = '__choro';
      renderStatsTable();
      switchTab('stats');
    });
    $('#csv-clear').addEventListener('click', () => {
      state.choropleth = null; state.stLayer.setStyle(styleStadtteil);
      $('#choro-legend').hidden = true; refreshStatsSelect();
    });
  }

  function renderChoroLegend() {
    const box = $('#choro-legend');
    const c = state.choropleth;
    const b = c.breaks;
    const items = CHORO_PALETTE.map((col, i) => {
      const lo = i === 0 ? '≤' : `${G.fmt(b[i - 1], 1)} –`;
      const hi = i < b.length ? G.fmt(b[i], 1) : '以上';
      return `<div class="lg-row"><span class="lg-sw" style="background:${col}"></span>${i === 0 ? '≤ ' + G.fmt(b[0], 1) : (i < b.length ? `${G.fmt(b[i - 1], 1)} – ${hi}` : `> ${G.fmt(b[b.length - 1], 1)}`)}</div>`;
    }).join('');
    box.innerHTML = `<b>${c.label}</b><div class="muted small">五分位分級</div>${items}`;
    box.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* 自訂圖層                                                             */
  /* ------------------------------------------------------------------ */
  function setupCustom() {
    $('#custom-wms-add').addEventListener('click', () => {
      const nodeIdInput = $('#custom-nodeid');
      const nodeId = nodeIdInput ? nodeIdInput.value.trim() : '';
      const url = $('#custom-wms-url').value.trim();
      const layersParam = $('#custom-wms-layers').value.trim();
      const name = $('#custom-wms-name').value.trim() || (nodeId ? `NodeId ${nodeId}` : 'WMS圖層');
      if (!nodeId && !url) { alert('請填NodeId或WMS URL。'); return; }
      const def = { id: `custom_${++state.customCount}`, group: 'custom', type: 'wms', name, desc: '使用者自訂的WMS圖層。', source: nodeId ? 'Landeshauptstadt Dresden' : url, license: nodeId ? 'dl-de/by-2-0' : '依來源', color: '#555', verified: false };
      if (nodeId) def.nodeId = nodeId; else def.url = url + (url.includes('?') ? '&' : '?');
      if (layersParam) def.layers = layersParam;
      registerCustom(def);
    });
    $('#custom-geojson-add').addEventListener('click', async () => {
      const url = $('#custom-geojson-url').value.trim();
      if (!url) return;
      try {
        const res = await fetch(url); const fc = await res.json();
        registerCustomGeoJSON(fc, $('#custom-geojson-name').value.trim() || url.split('/').pop());
      } catch (e) { alert('讀取失敗（可能是跨域限制）：' + e.message); }
    });
    $('#custom-geojson-file').addEventListener('change', (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { registerCustomGeoJSON(JSON.parse(r.result), f.name); } catch (e) { alert('不是有效的GeoJSON。'); } };
      r.readAsText(f);
    });
  }

  function registerCustom(def) {
    C.layers.push(def);
    let box = $('#custom-group');
    if (!box) {
      box = el('details', { class: 'group', id: 'custom-group', open: '' }, [el('summary', {}, [el('span', { class: 'group-title', text: '自訂圖層' })])]);
      $('#layer-list').appendChild(box);
    }
    box.appendChild(layerRow(def));
    toggleLayer(def.id, true);
    switchTab('layers');
  }

  function registerCustomGeoJSON(fc, name) {
    const def = { id: `custom_${++state.customCount}`, group: 'custom', type: 'custom', name, desc: '使用者匯入的GeoJSON。', source: '使用者', license: '依來源', color: '#e67e22' };
    const layer = L.geoJSON(fc, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, color: '#fff', weight: 1, fillColor: def.color, fillOpacity: 0.9 }),
      style: () => ({ color: def.color, weight: 2, fillOpacity: 0.25 }),
      onEachFeature: (f, l) => l.bindPopup(() => popupHtml(f.properties || {}), { maxWidth: 320 }),
    });
    state.layers[def.id] = { def, leaflet: layer, status: 'ok' };
    registerCustom(def);
    try { state.map.fitBounds(layer.getBounds(), { padding: [30, 30] }); } catch (e) { /* 空資料 */ }
  }

  /* ------------------------------------------------------------------ */
  /* 概況頁籤、情境                                                       */
  /* ------------------------------------------------------------------ */
  function renderOverview() {
    const facts = $('#facts');
    facts.innerHTML = C.facts.map((f) => `<div class="fact"><div class="fact-k">${f.k}</div><div class="fact-v">${f.v}</div><div class="fact-n muted small">${f.note}</div></div>`).join('');
    const pre = $('#presets');
    pre.innerHTML = '';
    C.presets.forEach((p) => {
      const b = el('button', { class: 'preset' }, [el('b', { text: p.title }), el('span', { class: 'small muted', text: p.desc })]);
      b.addEventListener('click', () => applyPreset(p));
      pre.appendChild(b);
    });
  }

  function applyPreset(p) {
    const keep = new Set(p.layers);
    Object.keys(state.layers).forEach((id) => { const t = state.layers[id].def.type; if (!keep.has(id) && t !== 'custom' && t !== 'annotation') toggleLayer(id, false); });
    p.layers.forEach((id) => { if (!state.layers[id]) toggleLayer(id, true); });
    switchTab('layers');
  }

  /* ------------------------------------------------------------------ */
  /* 搜尋（Nominatim）與Stadtteil快速跳轉                                */
  /* ------------------------------------------------------------------ */
  function setupSearch() {
    const input = $('#search');
    const list = $('#search-results');
    let timer;
    const render = (items) => {
      list.innerHTML = '';
      if (!items.length) { list.hidden = true; return; }
      items.forEach((it) => {
        const b = el('button', { class: 'result' }, [el('b', { text: it.title }), el('span', { class: 'small muted', text: it.sub || '' })]);
        b.addEventListener('click', () => { it.go(); list.hidden = true; input.value = it.title; });
        list.appendChild(b);
      });
      list.hidden = false;
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.hidden = true; return; }
      const local = state.stFC.features.filter((f) => (f.properties.name + ' ' + f.properties.code + ' ' + (f.properties.official_name || '') + ' ' + (f.properties.en || '')).toLowerCase().includes(q.toLowerCase()))
        .slice(0, 6).map((f) => ({ title: `${f.properties.code} ${f.properties.name}`, sub: f.properties.bezirk, go: () => selectStadtteil(f.properties.code, true) }));
      render(local);
      timer = setTimeout(async () => {
        try {
          const bb = state.city.bbox; // [s,w,n,e] → viewbox=w,n,e,s
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&viewbox=${bb[1]},${bb[2]},${bb[3]},${bb[0]}&bounded=1&q=${encodeURIComponent(q)}`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          const js = await res.json();
          const remote = js.map((r) => ({ title: r.display_name.split(',').slice(0, 2).join(','), sub: r.type, go: () => state.map.setView([+r.lat, +r.lon], 16) }));
          render(local.concat(remote));
        } catch (e) { /* 離線時僅顯示本地結果 */ }
      }, 400);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.searchbox')) list.hidden = true; });
  }

  /* ------------------------------------------------------------------ */
  /* URL hash狀態                                                        */
  /* ------------------------------------------------------------------ */
  let hashLock = false;
  function writeHash() {
    if (hashLock || !state.map) return;
    const ids = Object.keys(state.layers).filter((id) => state.layers[id].def.type !== 'custom' && state.layers[id].def.type !== 'annotation' && state.map.hasLayer(state.layers[id].leaflet || state.stLayer));
    const view = window.DD3D && window.DD3D.camera();
    const c = view ? view.center : state.map.getCenter();
    const zoom = view ? view.zoom : state.map.getZoom();
    const mode = view ? `&v=3d&p=${view.pitch.toFixed(1)}&b=${view.bearing.toFixed(1)}` : '&v=2d';
    history.replaceState(null, '', `#city=${state.cityId}&l=${ids.join(',')}&c=${c.lat.toFixed(5)},${c.lng.toFixed(5)},${zoom.toFixed(2)}${mode}`);
  }
  function readHash() {
    const h = location.hash.slice(1);
    if (!h) return null;
    const out = {};
    h.split('&').forEach((kv) => { const [k, v] = kv.split('='); out[k] = v; });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 頁籤與版面                                                           */
  /* ------------------------------------------------------------------ */
  function switchTab(id) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
    $$('.panel').forEach((p) => { p.hidden = p.id !== `panel-${id}`; });
  }

  function setupUi() {
    $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('#sidebar-toggle').addEventListener('click', () => { document.body.classList.toggle('collapsed'); setTimeout(() => state.map.invalidateSize(), 250); });
    $('#stats-layer').addEventListener('change', renderStatsTable);
    $('#stats-bezirk').addEventListener('change', renderStatsTable);
    $('#btn-print').addEventListener('click', () => { window.DD3D.close(); window.print(); });
    $('#btn-reset').addEventListener('click', () => { state.map.setView(state.city.center, state.city.zoom); state.selectedCode = null; state.stLayer.setStyle(styleStadtteil); });
    $('#btn-clear').addEventListener('click', () => { Object.keys(state.layers).forEach((id) => { if (state.layers[id].def.type !== 'annotation') toggleLayer(id, false); }); });
    $('#btn-share').addEventListener('click', async () => {
      writeHash();
      try { await navigator.clipboard.writeText(location.href); $('#btn-share').textContent = '已複製連結'; setTimeout(() => { $('#btn-share').textContent = '分享檢視'; }, 1500); } catch (e) { prompt('複製此連結：', location.href); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 城市切換                                                             */
  /* ------------------------------------------------------------------ */
  function applyCity(id) {
    state.city = CITIES[id];
    state.cityId = id;
    C = state.city.catalog;
    G.setLocale(state.city.locale === 'zh-TW' ? 'zh-TW' : 'de-DE');
    document.body.dataset.city = id;
  }

  /* 切換前清掉上一個城市的圖層、選取與分級設色；註記刻意保留（跨城市田野筆記）。 */
  function teardownCity() {
    Object.keys(state.layers).forEach((id) => {
      const entry = state.layers[id];
      if (entry.def.type === 'annotation') return;
      if (entry.leaflet && state.map.hasLayer(entry.leaflet)) state.map.removeLayer(entry.leaflet);
      delete state.layers[id];
    });
    if (state.stLabels && state.map.hasLayer(state.stLabels)) state.map.removeLayer(state.stLabels);
    if (state.stLayer && state.map.hasLayer(state.stLayer)) state.map.removeLayer(state.stLayer);
    state.choropleth = null;
    state.selectedCode = null;
    state.customCount = 0;
    $('#district-card').hidden = true;
    $('#choro-legend').hidden = true;
    const cg = $('#custom-group');
    if (cg) cg.remove();
  }

  function switchCity(id, opts) {
    if (!CITIES[id] || id === state.cityId) return;
    const o = opts || {};
    teardownCity();
    applyCity(id);
    initUnits();
    setBaseLayers();
    renderLayerPanel();
    renderOverview();
    applyCityChrome();
    hashLock = true;
    state.map.setView(o.center || state.city.center, o.zoom || state.city.zoom);
    const ids = o.layers || C.layers.filter((l) => l.default).map((l) => l.id);
    ids.forEach((lid) => toggleLayer(lid, true));
    hashLock = false;
    writeHash();
    refreshStatsSelect();
    try { localStorage.setItem('dd_city', id); } catch (e) { /* 隱私模式 */ }
    if (window.DD3D && window.DD3D.setCity) window.DD3D.setCity();
    if (window.DDCompare && window.DDCompare.cityChanged) window.DDCompare.cityChanged();
  }

  /* 側欄與標題列中隨城市而異的文字 */
  function applyCityChrome() {
    const city = state.city;
    $('#city-btn-flag').textContent = city.flag;
    $('#city-btn-name').textContent = city.name;
    $('#model-eyebrow').textContent = `${city.en.toUpperCase()} / CITY MODEL`;
    $('#model-title').textContent = city.model3d.title;
    $('#model-sub').textContent = city.model3d.sub;
    $('#overview-title').textContent = `${city.name}概況`;
    $('#overview-note').textContent = city.id === 'taipei'
      ? '參考值，請以臺北市政府主計處與民政局最新統計為準。'
      : '參考值，請以Kommunale Statistikstelle Dresden最新出版品（Stadtteilkatalog、Statistisches Jahrbuch）為準。';
    $('#layers-footnote').innerHTML = city.id === 'taipei'
      ? '「官方圖磚」由內政部國土測繪中心WMTS提供；「OSM」由Overpass API即時查詢OpenStreetMap；土地使用分區等需至都發局查詢系統逐筆查閱。'
      : '「官方WMS」由Landeshauptstadt Dresden（kommisdd.dresden.de）即時提供，依NodeId對應opendata.dresden.de的資料集；「OSM」由Overpass API即時查詢OpenStreetMap。點擊地圖可查詢已開啟官方圖層的屬性。';
    $('#search').placeholder = city.id === 'taipei' ? '搜尋行政區、地址或地點' : '搜尋Stadtteil、地址或地點（Nominatim）';
    $('#stats-bezirk-row').hidden = !city.unit.hasParent;
    if (!city.unit.hasParent) $('#stats-bezirk').checked = false;
    const places = $('#model-places');
    places.innerHTML = '';
    city.model3d.places.forEach((pl) => {
      places.appendChild(el('button', { 'data-place': pl.c, html: `${pl.title}<br><small>${pl.sub}</small>` }));
    });
    if (city.model3d.mode === 'tiles') {
      places.appendChild(el('button', { id: 'model-coverage', html: '資料範圍<br><small>查看已收錄區塊</small>' }));
    }
    document.title = `${city.name}開放資料圖層｜Dresden × Taipei`;
  }

  /* ------------------------------------------------------------------ */
  /* 啟動                                                                 */
  /* ------------------------------------------------------------------ */
  function boot() {
    const h = readHash();
    let startCity = 'dresden';
    try { const saved = localStorage.getItem('dd_city'); if (saved && CITIES[saved]) startCity = saved; } catch (e) { /* 隱私模式 */ }
    if (h && h.city && CITIES[h.city]) startCity = h.city;
    applyCity(startCity);

    initMap();
    initUnits();
    renderLayerPanel();
    renderOverview();
    applyCityChrome();
    setupCsv();
    setupCustom();
    setupSearch();
    setupUi();

    hashLock = true;
    if (h && h.c) {
      const [lat, lng, z] = h.c.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) state.map.setView([lat, lng], z || state.city.zoom);
    }
    const ids = h && h.l !== undefined ? h.l.split(',').filter(Boolean) : C.layers.filter((l) => l.default).map((l) => l.id);
    ids.forEach((id) => toggleLayer(id, true));
    hashLock = false;
    window.DDAnnotate.init({ state, switchTab });
    window.DDCompare.init({ state, switchTab, switchCity, runOverpass, osmToFeatures, el, downloadText });
    window.DD3D.init({ state, writeHash, switchTab }, h);
    writeHash();
    refreshStatsSelect();
  }

  document.addEventListener('DOMContentLoaded', boot);
  window.DDApp = { state, toggleLayer, selectStadtteil, applyPreset, switchCity };
})();
