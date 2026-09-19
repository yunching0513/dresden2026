/* split.js：並列雙城地圖。
 *
 * 左右各一張地圖，鎖定「相同的地面比例尺」：Web Mercator的每像素公尺數
 * 隨緯度而變（m/px = 40075017 × cos(lat) / (256 × 2^z)），德勒斯登在51°N、
 * 臺北在25°N，同一個zoom看到的實際範圍差了約1.44倍。因此右圖的zoom會依
 * 兩圖中心緯度即時換算：z_b = z_a + log2(cos(lat_b) / cos(lat_a))，
 * 兩側的比例尺條與每像素公尺數才會一致。
 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const CITIES = window.DD_CITIES;
  const ORDER = window.DD_CITY_ORDER;
  const PAIRS = window.DD_SPLIT_PAIRS;
  const BASEMAPS = window.DD_BASEMAPS;
  const EARTH = 40075016.686;

  let app, active = false, syncing = false, built = false;
  const maps = {};
  const bases = {};
  const layers = {};   // `${cityId}:${themeId}` -> leaflet layer
  const boundaries = {};
  const on = new Set();
  let themes = [];

  const mpp = (lat, zoom) => EARTH * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, zoom));

  /* 兩市共同的比較主題：id相同的OSM圖層，加上兩市名稱不同但對應的軌道圖層 */
  function buildThemes() {
    const out = PAIRS.map((p) => ({
      id: p.id, name: p.name,
      defs: ORDER.reduce((acc, c) => {
        const def = CITIES[c].catalog.layers.find((l) => l.id === p.layers[c]);
        if (def) acc[c] = def;
        return acc;
      }, {}),
    })).filter((t) => Object.keys(t.defs).length === ORDER.length);

    const [a, b] = ORDER;
    CITIES[a].catalog.layers.filter((l) => l.type === 'overpass').forEach((def) => {
      const other = CITIES[b].catalog.layers.find((l) => l.id === def.id && l.type === 'overpass');
      if (!other) return;
      out.push({ id: def.id, name: def.name.replace(/[A-Za-zÄÖÜäöüß].*$/, '').trim() || def.name, defs: { [a]: def, [b]: other } });
    });
    return out;
  }

  /* ---------------- 建立地圖 ---------------- */
  function build() {
    if (built) return;
    built = true;
    ORDER.forEach((id) => {
      const city = CITIES[id];
      const map = L.map(`split-map-${id}`, {
        zoomControl: true, preferCanvas: true, zoomSnap: 0, minZoom: 8, maxZoom: 19, attributionControl: true,
      }).setView(city.center, city.zoom);
      L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 140 }).addTo(map);
      maps[id] = map;
      setBase(id, $('#split-base').value);
      boundaries[id] = L.geoJSON(city.boundaries(), {
        interactive: false,
        style: { color: city.chart, weight: 1, fill: false, opacity: 0.8 },
      }).addTo(map);
      map.on('move', () => followFrom(id));
      map.on('moveend', () => { readout(); if (app.writeHash) app.writeHash(); });
    });
    // 兩市中心緯度不同：右圖一開始就要換算到相同比例尺
    matchZoom(ORDER[0]);
    readout();
  }

  function setBase(cityId, key) {
    const map = maps[cityId];
    if (!map) return;
    if (bases[cityId]) map.removeLayer(bases[cityId]);
    // 「官方正射影像」在兩側各自取用該市的官方來源（GeoSN／國土測繪中心）
    const b = key === 'imagery' ? CITIES[cityId].imagery : (BASEMAPS[key] || BASEMAPS.positron);
    bases[cityId] = app.makeBaseLayer(b).addTo(map);
    bases[cityId].bringToBack();
  }

  /* ---------------- 比例尺鎖定 ---------------- */
  function targetZoom(fromId, toId) {
    const from = maps[fromId], to = maps[toId];
    const latFrom = from.getCenter().lat, latTo = to.getCenter().lat;
    return from.getZoom() + Math.log2(Math.cos(latTo * Math.PI / 180) / Math.cos(latFrom * Math.PI / 180));
  }

  function matchZoom(fromId) {
    if (syncing) return;
    syncing = true;
    try {
      ORDER.filter((id) => id !== fromId).forEach((id) => {
        const z = targetZoom(fromId, id);
        if (Math.abs(maps[id].getZoom() - z) > 0.001) maps[id].setZoom(z, { animate: false });
      });
    } finally { syncing = false; }
  }

  const lastCenter = {};
  function followFrom(fromId) {
    if (!active || syncing) return;
    syncing = true;
    try {
      const from = maps[fromId];
      ORDER.filter((id) => id !== fromId).forEach((id) => {
        const map = maps[id];
        const z = targetZoom(fromId, id);
        let center = map.getCenter();
        if ($('#split-sync').checked && lastCenter[fromId]) {
          // 同步平移：把來源地圖的位移換算成公尺，再套到另一張圖
          const prev = lastCenter[fromId], now = from.getCenter();
          const dLat = now.lat - prev.lat;
          const dLng = (now.lng - prev.lng) * Math.cos(prev.lat * Math.PI / 180) / Math.cos(center.lat * Math.PI / 180);
          center = L.latLng(center.lat + dLat, center.lng + dLng);
        }
        map.setView(center, z, { animate: false });
      });
      lastCenter[fromId] = from.getCenter();
    } finally { syncing = false; }
    readout();
  }

  function readout() {
    if (!active) return;
    const parts = ORDER.map((id) => {
      const map = maps[id];
      const m = mpp(map.getCenter().lat, map.getZoom());
      $(`#split-head-${id}`).textContent = `1 px ≈ ${m.toFixed(m < 10 ? 2 : 1)} m`;
      return m;
    });
    const diff = Math.abs(parts[0] - parts[1]) / parts[0];
    $('#split-scale').textContent = `目前地面解析度 1 px ≈ ${parts[0].toFixed(parts[0] < 10 ? 2 : 1)} 公尺，兩側一致${diff > 0.01 ? '（校正中…）' : ''}。右圖的zoom會比左圖高約 ${(Math.log2(Math.cos(maps[ORDER[1]].getCenter().lat * Math.PI / 180) / Math.cos(maps[ORDER[0]].getCenter().lat * Math.PI / 180))).toFixed(2)} 級，才能抵銷緯度造成的Mercator放大。`;
  }

  /* ---------------- 圖層 ---------------- */
  function renderLayerList() {
    const box = $('#split-layers');
    box.innerHTML = '';
    themes.forEach((t) => {
      const row = app.el('label', { class: 'split-layer' });
      const cb = app.el('input', { type: 'checkbox' });
      cb.checked = on.has(t.id);
      cb.addEventListener('change', () => toggleTheme(t.id, cb.checked));
      row.appendChild(cb);
      row.appendChild(app.el('span', { class: 'swatch', style: `background:${t.defs[ORDER[0]].color || '#999'}` }));
      row.appendChild(app.el('span', { class: 'lname', text: t.name }));
      row.appendChild(app.el('span', { class: 'status small muted', id: `sp-st-${t.id}` }));
      box.appendChild(row);
    });
  }

  async function toggleTheme(themeId, want) {
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return;
    if (!want) {
      on.delete(themeId);
      ORDER.forEach((c) => {
        const key = `${c}:${themeId}`;
        if (layers[key]) { maps[c].removeLayer(layers[key]); delete layers[key]; }
      });
      $(`#sp-st-${themeId}`).textContent = '';
      if (app.writeHash) app.writeHash();
      return;
    }
    on.add(themeId);
    $(`#sp-st-${themeId}`).textContent = '查詢中…';
    const counts = {};
    await Promise.all(ORDER.map(async (c) => {
      try {
        const def = theme.defs[c];
        const fc = await app.fetchOsm(c, def);
        if (!on.has(themeId)) return;
        const layer = L.geoJSON(fc, {
          renderer: L.canvas({ padding: 0.5 }),
          pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: def.radius || 4, color: '#fff', weight: 1, fillColor: def.color, fillOpacity: 0.9 }),
          style: () => ({ color: def.color, weight: def.weight || 1.5, fillColor: def.color, fillOpacity: def.fill === undefined ? 0.3 : def.fill }),
          onEachFeature: (f, l) => l.bindPopup(() => app.popupHtml(f.properties), { maxWidth: 300 }),
        }).addTo(maps[c]);
        layers[`${c}:${themeId}`] = layer;
        counts[c] = fc.features.length;
      } catch (err) {
        counts[c] = null;
      }
    }));
    if (!on.has(themeId)) return;
    $(`#sp-st-${themeId}`).textContent = ORDER.map((c) => `${CITIES[c].name.slice(0, 2)} ${counts[c] === null ? '失敗' : counts[c]}`).join(' ／ ');
    if (app.writeHash) app.writeHash();
  }

  /* ---------------- 開關 ---------------- */
  function open() {
    if (active) return;
    if (window.DD3D && window.DD3D.close && !$('#map3d').hidden) window.DD3D.close();
    active = true;
    document.body.classList.add('split');
    $('#map').hidden = true;
    $('#splitview').hidden = false;
    $('#btn-split').setAttribute('aria-pressed', 'true');
    $('#btn-split').textContent = '關閉並列';
    $('#split-controls').hidden = false;
    build();
    ORDER.forEach((id) => maps[id].invalidateSize());
    matchZoom(ORDER[0]);
    readout();
    app.switchTab('compare');
    if (app.writeHash) app.writeHash();
  }

  function close() {
    if (!active) return;
    active = false;
    document.body.classList.remove('split');
    $('#splitview').hidden = true;
    $('#map').hidden = false;
    $('#btn-split').setAttribute('aria-pressed', 'false');
    $('#btn-split').textContent = '並列雙城';
    $('#split-controls').hidden = true;
    app.state.map.invalidateSize();
    if (app.writeHash) app.writeHash();
  }

  function hashState() {
    if (!active) return null;
    const a = maps[ORDER[0]].getCenter(), b = maps[ORDER[1]].getCenter();
    return `&split=1&sz=${maps[ORDER[0]].getZoom().toFixed(2)}&sa=${a.lat.toFixed(4)},${a.lng.toFixed(4)}&sb=${b.lat.toFixed(4)},${b.lng.toFixed(4)}&sl=${[...on].join(',')}`;
  }

  function init(context, hash) {
    app = context;
    themes = buildThemes();

    const baseSel = $('#split-base');
    Object.entries(BASEMAPS).forEach(([key, b]) => baseSel.appendChild(app.el('option', { value: key, text: b.name })));
    baseSel.appendChild(app.el('option', { value: 'imagery', text: '官方正射影像（各市官方來源）' }));
    baseSel.value = 'positron';
    baseSel.addEventListener('change', () => ORDER.forEach((id) => setBase(id, baseSel.value)));

    renderLayerList();
    $('#btn-split').addEventListener('click', () => (active ? close() : open()));
    $('#split-open').addEventListener('click', () => (active ? close() : open()));
    $('#split-reset').addEventListener('click', () => {
      ORDER.forEach((id) => maps[id].setView(CITIES[id].center, CITIES[id].zoom, { animate: false }));
      matchZoom(ORDER[0]); readout();
    });
    $('#split-sync').addEventListener('change', () => { ORDER.forEach((id) => { lastCenter[id] = maps[id].getCenter(); }); });
    new ResizeObserver(() => { if (active) ORDER.forEach((id) => maps[id] && maps[id].invalidateSize()); }).observe($('#splitview'));

    if (hash && hash.split === '1') {
      open();
      const setFrom = (key, cityId) => {
        if (!hash[key]) return;
        const [lat, lng] = hash[key].split(',').map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lng)) maps[cityId].setView([lat, lng], maps[cityId].getZoom(), { animate: false });
      };
      setFrom('sa', ORDER[0]); setFrom('sb', ORDER[1]);
      const z = Number(hash.sz);
      if (Number.isFinite(z)) maps[ORDER[0]].setZoom(z, { animate: false });
      matchZoom(ORDER[0]);
      (hash.sl ? hash.sl.split(',').filter(Boolean) : []).forEach((id) => toggleTheme(id, true));
      renderLayerList();
    }
  }

  window.DDSplit = { init, open, close, isActive: () => active, hashState };
})();
