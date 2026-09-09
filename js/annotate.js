/* annotate.js：註記工具（落Pin、畫線、畫多邊形、文字註記）。
 * 2D（Leaflet）與3D（MapLibre）皆可繪製；資料存於瀏覽器localStorage，可匯出／匯入GeoJSON。 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const KEY = 'dd_annotations_v1';
  const COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50'];
  const CATEGORIES = ['觀察', '問題點', '機會點', '提案', '待查證', '訪談／田野', '其他'];
  const KIND_LABEL = { pin: '地點', line: '路線', polygon: '範圍' };

  let app, map, G;
  let group;                  // L.FeatureGroup：所有已完成的註記
  const items = [];           // {id, kind, coords, title, note, color, category, created}
  const layersById = new Map();
  let tool = null;            // 'pin' | 'line' | 'polygon' | null
  let sketch = [];            // [[lng,lat],...]
  let sketchGroup = null;     // Leaflet 草圖
  let map3d = null;
  let selectedId = null;
  let saveTimer;

  /* ------------------------------------------------------------------ */
  /* 幾何工具                                                             */
  /* ------------------------------------------------------------------ */
  function haversine(a, b) {
    const R = 6371008.8, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function lengthM(coords) { let s = 0; for (let i = 1; i < coords.length; i++) s += haversine(coords[i - 1], coords[i]); return s; }
  function polygonAreaM2(coords) { return G.areaM2({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords.concat([coords[0]])] } }); }
  function fmtLen(m) { return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m'; }
  function fmtArea(m2) { return m2 >= 10000 ? (m2 / 10000).toFixed(2) + ' ha（' + Math.round(m2).toLocaleString('de-DE') + ' m²）' : Math.round(m2).toLocaleString('de-DE') + ' m²'; }
  function centerOf(it) {
    if (it.kind === 'pin') return it.coords;
    const xs = it.coords.map((c) => c[0]), ys = it.coords.map((c) => c[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }
  function measure(it) {
    if (it.kind === 'line') return '長度 ' + fmtLen(lengthM(it.coords));
    if (it.kind === 'polygon') return '面積 ' + fmtArea(polygonAreaM2(it.coords)) + '，周長 ' + fmtLen(lengthM(it.coords.concat([it.coords[0]])));
    return `${it.coords[1].toFixed(5)}, ${it.coords[0].toFixed(5)}`;
  }
  function stadtteilOf(it) {
    const c = centerOf(it);
    const f = app.state.stIndex && app.state.stIndex.locate(c[0], c[1]);
    return f ? `${f.properties.code} ${f.properties.name}` : '';
  }
  const uid = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------------ */
  /* 資料持久化（localStorage ＋ GeoJSON）                                 */
  /* ------------------------------------------------------------------ */
  function toGeoJSON() {
    return {
      type: 'FeatureCollection',
      name: 'Dresden annotations',
      features: items.map((it) => ({
        type: 'Feature',
        properties: { id: it.id, kind: it.kind, title: it.title, note: it.note, color: it.color, category: it.category, created: it.created, stadtteil: stadtteilOf(it), measure: measure(it) },
        geometry: it.kind === 'pin' ? { type: 'Point', coordinates: it.coords }
          : it.kind === 'line' ? { type: 'LineString', coordinates: it.coords }
            : { type: 'Polygon', coordinates: [it.coords.concat([it.coords[0]])] },
      })),
    };
  }
  function fromGeoJSON(fc, replace) {
    if (!fc || !Array.isArray(fc.features)) throw new Error('不是GeoJSON FeatureCollection');
    if (replace) clearAll(true);
    let n = 0;
    for (const f of fc.features) {
      const g = f.geometry; if (!g) continue;
      const p = f.properties || {};
      let kind, coords;
      if (g.type === 'Point') { kind = 'pin'; coords = g.coordinates.slice(0, 2); }
      else if (g.type === 'LineString') { kind = 'line'; coords = g.coordinates.map((c) => c.slice(0, 2)); }
      else if (g.type === 'Polygon') { kind = 'polygon'; coords = g.coordinates[0].map((c) => c.slice(0, 2)); if (coords.length > 1 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) coords.pop(); }
      else if (g.type === 'MultiPolygon') { kind = 'polygon'; coords = g.coordinates[0][0].map((c) => c.slice(0, 2)); coords.pop(); }
      else continue;
      addItem({ id: (p.id && !items.some((i) => i.id === p.id)) ? p.id : uid(), kind, coords, title: p.title || p.name || '', note: p.note || p.description || '', color: COLORS.includes(p.color) ? p.color : COLORS[0], category: p.category || CATEGORIES[0], created: p.created || new Date().toISOString() }, false);
      n++;
    }
    persist(); renderList(); refresh3d();
    return n;
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(toGeoJSON())); } catch (e) { /* 私密視窗或容量已滿 */ } }, 150);
  }
  function restore() {
    try { const raw = localStorage.getItem(KEY); if (raw) fromGeoJSON(JSON.parse(raw), false); } catch (e) { console.warn('annotations restore failed', e); }
  }

  /* ------------------------------------------------------------------ */
  /* 圖徵繪製（Leaflet）                                                   */
  /* ------------------------------------------------------------------ */
  function pinIcon(color, selected) {
    return L.divIcon({
      className: 'annot-pin' + (selected ? ' selected' : ''),
      html: `<svg viewBox="0 0 24 34" width="26" height="36"><path d="M12 1C6 1 1.5 5.6 1.5 11.5c0 7.6 8.7 18.8 10.5 21 1.8-2.2 10.5-13.4 10.5-21C22.5 5.6 18 1 12 1z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="11.5" r="4" fill="#fff"/></svg>`,
      iconSize: [26, 36], iconAnchor: [13, 35], popupAnchor: [0, -30], tooltipAnchor: [0, -30],
    });
  }
  function popupContent(it) {
    const div = document.createElement('div');
    div.className = 'annot-popup';
    div.innerHTML = `<div class="annot-cat" style="background:${it.color}">${esc(it.category)}</div><b>${esc(it.title) || '（未命名）'}</b>${it.note ? `<p>${esc(it.note).replace(/\n/g, '<br>')}</p>` : ''}<div class="muted small">${esc(measure(it))}${stadtteilOf(it) ? '<br>' + esc(stadtteilOf(it)) : ''}</div>`;
    const b = document.createElement('button'); b.className = 'mini'; b.textContent = '編輯';
    b.addEventListener('click', () => { select(it.id); app.switchTab('annotate'); });
    div.appendChild(b);
    return div;
  }
  function styleFor(it, selected) {
    return { color: it.color, weight: selected ? 4 : 3, opacity: 0.95, fillColor: it.color, fillOpacity: it.kind === 'polygon' ? (selected ? 0.35 : 0.2) : 0, dashArray: null };
  }
  function buildLayer(it) {
    let layer;
    const selected = it.id === selectedId;
    if (it.kind === 'pin') {
      layer = L.marker([it.coords[1], it.coords[0]], { icon: pinIcon(it.color, selected), draggable: true, zIndexOffset: 1000 });
      layer.on('dragend', () => { const ll = layer.getLatLng(); it.coords = [+ll.lng.toFixed(6), +ll.lat.toFixed(6)]; persist(); renderList(); refresh3d(); });
    } else {
      const latlngs = it.coords.map((c) => [c[1], c[0]]);
      layer = it.kind === 'line' ? L.polyline(latlngs, styleFor(it, selected)) : L.polygon(latlngs, styleFor(it, selected));
    }
    layer.feature = { type: 'Feature', properties: { color: it.color, title: it.title, kind: it.kind } };
    if (it.title) layer.bindTooltip(it.title, { permanent: it.kind !== 'line', direction: it.kind === 'pin' ? 'top' : 'center', className: 'annot-label' });
    layer.bindPopup(() => popupContent(it), { maxWidth: 300 });
    layer.on('click', (e) => { if (tool) return; L.DomEvent.stopPropagation(e); select(it.id, false); });
    return layer;
  }
  function addItem(it, save) {
    items.push(it);
    const layer = buildLayer(it);
    layersById.set(it.id, layer);
    group.addLayer(layer);
    if (save !== false) { persist(); renderList(); refresh3d(); }
    return it;
  }
  function rebuild(it) {
    const old = layersById.get(it.id);
    if (old) group.removeLayer(old);
    const layer = buildLayer(it);
    layersById.set(it.id, layer);
    group.addLayer(layer);
  }
  function removeItem(id) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const layer = layersById.get(id);
    if (layer) group.removeLayer(layer);
    layersById.delete(id);
    items.splice(idx, 1);
    if (selectedId === id) { selectedId = null; renderEditor(); }
    persist(); renderList(); refresh3d();
  }
  function clearAll(silent) {
    items.splice(0, items.length);
    layersById.clear();
    group.clearLayers();
    selectedId = null;
    if (!silent) { persist(); renderList(); renderEditor(); refresh3d(); }
  }
  function refresh3d() { if (window.DD3D && window.DD3D.refreshOverlays) window.DD3D.refreshOverlays(); }

  /* ------------------------------------------------------------------ */
  /* 繪製工具                                                             */
  /* ------------------------------------------------------------------ */
  function setTool(kind) {
    if (tool) cancelTool(true);
    if (!kind) { updateToolUi(); return; }
    tool = kind; sketch = [];
    document.body.classList.add('drawing');
    map.doubleClickZoom.disable();
    if (map3d) map3d.doubleClickZoom.disable();
    sketchGroup = L.featureGroup().addTo(map);
    updateToolUi();
    hint(kind === 'pin' ? '在地圖上點一下放置Pin。Esc取消。' : `逐點點擊地圖${kind === 'line' ? '畫線' : '畫範圍'}；雙擊或按「完成」結束，Esc取消。`);
  }
  function cancelTool(silent) {
    tool = null; sketch = [];
    document.body.classList.remove('drawing');
    map.doubleClickZoom.enable();
    if (map3d) map3d.doubleClickZoom.enable();
    if (sketchGroup) { map.removeLayer(sketchGroup); sketchGroup = null; }
    updateSketch3d();
    updateToolUi();
    if (!silent) hint('');
  }
  function addVertex(lng, lat) {
    const pt = [+lng.toFixed(6), +lat.toFixed(6)];
    if (tool === 'pin') {
      const it = addItem({ id: uid(), kind: 'pin', coords: pt, title: '', note: '', color: currentColor(), category: currentCategory(), created: new Date().toISOString() });
      cancelTool(true); select(it.id, false); hint('已放置Pin，可在右側填寫標題與註記；拖曳Pin可移動。');
      return;
    }
    const last = sketch[sketch.length - 1];
    if (last && Math.abs(last[0] - pt[0]) < 1e-7 && Math.abs(last[1] - pt[1]) < 1e-7) return;
    sketch.push(pt);
    updateSketch();
  }
  // 雙擊會先觸發兩次click：若最後兩點幾乎重合，視為同一點
  function dropDoubleClickVertex() {
    if (sketch.length >= 2 && haversine(sketch[sketch.length - 1], sketch[sketch.length - 2]) < 5) sketch.pop();
  }
  function finishSketch() {
    if (!tool || tool === 'pin') return;
    const need = tool === 'line' ? 2 : 3;
    if (sketch.length < need) { hint(`至少需要${need}個點。`); return; }
    const it = addItem({ id: uid(), kind: tool, coords: sketch.slice(), title: '', note: '', color: currentColor(), category: currentCategory(), created: new Date().toISOString() });
    cancelTool(true); select(it.id, false); hint(`已建立${KIND_LABEL[it.kind]}（${measure(it)}），請填寫標題與註記。`);
  }
  function updateSketch() {
    if (!sketchGroup) return;
    sketchGroup.clearLayers();
    const latlngs = sketch.map((c) => [c[1], c[0]]);
    const color = currentColor();
    if (latlngs.length >= 2) sketchGroup.addLayer(tool === 'polygon' && latlngs.length >= 3 ? L.polygon(latlngs, { color, weight: 2, dashArray: '6 4', fillOpacity: 0.12 }) : L.polyline(latlngs, { color, weight: 2, dashArray: '6 4' }));
    latlngs.forEach((ll) => sketchGroup.addLayer(L.circleMarker(ll, { radius: 4, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 1 })));
    updateSketch3d();
    if (sketch.length >= 2) {
      const m = tool === 'polygon' && sketch.length >= 3 ? '面積 ' + fmtArea(polygonAreaM2(sketch)) : '長度 ' + fmtLen(lengthM(sketch));
      hint(`${sketch.length}個點，${m}。雙擊或按「完成」結束。`);
    }
  }
  function updateSketch3d() {
    if (!map3d || !map3d.getSource('annot-sketch')) return;
    const color = currentColor();
    const feats = [];
    if (sketch.length >= 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: tool === 'polygon' && sketch.length >= 3 ? sketch.concat([sketch[0]]) : sketch } });
    sketch.forEach((c) => feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
    map3d.getSource('annot-sketch').setData({ type: 'FeatureCollection', features: feats });
    ['annot-sketch-line', 'annot-sketch-point'].forEach((id) => { if (map3d.getLayer(id)) map3d.setPaintProperty(id, id.endsWith('line') ? 'line-color' : 'circle-color', color); });
  }
  function attach3d(m) {
    map3d = m;
    const ensure = () => {
      if (map3d.getSource('annot-sketch')) return;
      map3d.addSource('annot-sketch', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map3d.addLayer({ id: 'annot-sketch-line', type: 'line', source: 'annot-sketch', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': COLORS[0], 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      map3d.addLayer({ id: 'annot-sketch-point', type: 'circle', source: 'annot-sketch', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': COLORS[0], 'circle-radius': 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
    };
    if (map3d.loaded && map3d.isStyleLoaded()) ensure(); else map3d.once('load', ensure);
    map3d.on('click', (e) => { if (tool) addVertex(e.lngLat.lng, e.lngLat.lat); });
    map3d.on('dblclick', (e) => { if (tool && tool !== 'pin') { e.preventDefault(); dropDoubleClickVertex(); finishSketch(); } });
    if (tool) map3d.doubleClickZoom.disable();
  }
  const isDrawing = () => !!tool;

  /* ------------------------------------------------------------------ */
  /* 側欄UI                                                               */
  /* ------------------------------------------------------------------ */
  function hint(text) { const h = $('#annot-hint'); h.textContent = text; h.hidden = !text; }
  function currentColor() { return $('#annot-color-picker .active')?.dataset.color || COLORS[0]; }
  function currentCategory() { return $('#annot-default-cat').value || CATEGORIES[0]; }
  function updateToolUi() {
    $$('#annot-tools [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    $('#annot-finish').hidden = !(tool === 'line' || tool === 'polygon');
    $('#annot-cancel').hidden = !tool;
  }
  function select(id, zoom) {
    const prev = selectedId;
    selectedId = id;
    if (prev && prev !== id) { const p = items.find((i) => i.id === prev); if (p) rebuild(p); }
    const it = items.find((i) => i.id === id);
    if (it) {
      rebuild(it);
      if (zoom) {
        const layer = layersById.get(id);
        if (it.kind === 'pin') map.setView([it.coords[1], it.coords[0]], Math.max(map.getZoom(), 16));
        else map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 17 });
      }
    }
    renderEditor(); renderList();
  }
  function renderEditor() {
    const box = $('#annot-editor');
    const it = items.find((i) => i.id === selectedId);
    if (!it) { box.hidden = true; return; }
    box.hidden = false;
    $('#annot-kind').textContent = KIND_LABEL[it.kind] + ' · ' + measure(it) + (stadtteilOf(it) ? ' · ' + stadtteilOf(it) : '');
    $('#annot-title').value = it.title;
    $('#annot-note').value = it.note;
    $('#annot-cat').value = CATEGORIES.includes(it.category) ? it.category : '其他';
    $$('#annot-edit-colors span').forEach((s) => s.classList.toggle('active', s.dataset.color === it.color));
  }
  function applyEditor() {
    const it = items.find((i) => i.id === selectedId);
    if (!it) return;
    it.title = $('#annot-title').value.trim();
    it.note = $('#annot-note').value;
    it.category = $('#annot-cat').value;
    rebuild(it); persist(); renderList(); refresh3d();
  }
  function renderList() {
    const list = $('#annot-list');
    $('#annot-count').textContent = items.length ? `${items.length}筆` : '';
    if (!items.length) { list.innerHTML = '<p class="muted small">尚無註記。選擇上方工具後在地圖上點擊即可開始。</p>'; return; }
    list.innerHTML = '';
    items.slice().reverse().forEach((it) => {
      const row = document.createElement('div');
      row.className = 'annot-item' + (it.id === selectedId ? ' selected' : '');
      row.innerHTML = `<span class="annot-sw" style="background:${it.color}"></span><div class="annot-body"><b>${esc(it.title) || '（未命名）'}</b><span class="small muted">${esc(it.category)} · ${KIND_LABEL[it.kind]} · ${esc(measure(it))}</span>${it.note ? `<span class="small annot-note">${esc(it.note).slice(0, 80)}${it.note.length > 80 ? '…' : ''}</span>` : ''}</div>`;
      const del = document.createElement('button'); del.className = 'annot-del'; del.title = '刪除'; del.textContent = '×';
      del.addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`刪除「${it.title || '未命名'}」？`)) removeItem(it.id); });
      row.appendChild(del);
      row.addEventListener('click', () => select(it.id, true));
      list.appendChild(row);
    });
  }
  function exportMarkdown() {
    const lines = ['# Dresden註記', '', `匯出時間：${new Date().toLocaleString('zh-TW')}`, ''];
    items.forEach((it, i) => {
      lines.push(`## ${i + 1}. ${it.title || '（未命名）'}`);
      lines.push(`- 類型：${it.category}／${KIND_LABEL[it.kind]}`);
      lines.push(`- ${measure(it)}`);
      if (stadtteilOf(it)) lines.push(`- Stadtteil：${stadtteilOf(it)}`);
      const c = centerOf(it); lines.push(`- 座標：${c[1].toFixed(5)}, ${c[0].toFixed(5)}`);
      if (it.note) lines.push('', it.note);
      lines.push('');
    });
    return lines.join('\n');
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function setupUi() {
    const picker = $('#annot-color-picker');
    COLORS.forEach((c, i) => { const s = document.createElement('span'); s.dataset.color = c; s.style.background = c; if (!i) s.classList.add('active'); s.addEventListener('click', () => { $$('span', picker).forEach((x) => x.classList.remove('active')); s.classList.add('active'); updateSketch(); }); picker.appendChild(s); });
    const editColors = $('#annot-edit-colors');
    COLORS.forEach((c) => { const s = document.createElement('span'); s.dataset.color = c; s.style.background = c; s.addEventListener('click', () => { const it = items.find((i) => i.id === selectedId); if (!it) return; it.color = c; applyEditor(); renderEditor(); }); editColors.appendChild(s); });
    const catSel = $('#annot-default-cat'), catEdit = $('#annot-cat');
    CATEGORIES.forEach((c) => { catSel.appendChild(new Option(c, c)); catEdit.appendChild(new Option(c, c)); });

    $$('#annot-tools [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(tool === b.dataset.tool ? null : b.dataset.tool)));
    $('#annot-finish').addEventListener('click', finishSketch);
    $('#annot-cancel').addEventListener('click', () => cancelTool());
    $('#annot-visible').addEventListener('change', (e) => { if (e.target.checked) group.addTo(map); else map.removeLayer(group); refresh3d(); });
    ['#annot-title', '#annot-note', '#annot-cat'].forEach((s) => $(s).addEventListener('input', applyEditor));
    $('#annot-zoom').addEventListener('click', () => selectedId && select(selectedId, true));
    $('#annot-delete').addEventListener('click', () => { if (selectedId && confirm('刪除此註記？')) removeItem(selectedId); });
    $('#annot-close').addEventListener('click', () => { const p = selectedId; selectedId = null; const it = items.find((i) => i.id === p); if (it) rebuild(it); renderEditor(); renderList(); });
    $('#annot-export').addEventListener('click', () => download(`dresden-annotations-${new Date().toISOString().slice(0, 10)}.geojson`, JSON.stringify(toGeoJSON(), null, 1)));
    $('#annot-export-md').addEventListener('click', () => download(`dresden-annotations-${new Date().toISOString().slice(0, 10)}.md`, exportMarkdown(), 'text/markdown'));
    $('#annot-import').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const n = fromGeoJSON(JSON.parse(r.result), false); hint(`已匯入${n}筆註記。`); } catch (err) { alert('匯入失敗：' + err.message); } e.target.value = ''; };
      r.readAsText(f);
    });
    $('#annot-clear').addEventListener('click', () => { if (items.length && confirm(`清除全部${items.length}筆註記？此動作無法復原（建議先匯出）。`)) clearAll(); });

    map.on('click', (e) => { if (tool) addVertex(e.latlng.lng, e.latlng.lat); });
    map.on('dblclick', () => { if (tool && tool !== 'pin') { dropDoubleClickVertex(); finishSketch(); } });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && tool) { cancelTool(); hint('已取消。'); }
      if (e.key === 'Enter' && tool && tool !== 'pin' && !/input|textarea/i.test(e.target.tagName)) finishSketch();
    });
  }

  function init(context) {
    app = context; map = app.state.map; G = window.DDGeo;
    group = L.featureGroup();
    group.addTo(map);
    // 讓3D同步機制把註記視為一般向量圖層
    app.state.layers.annotations = { def: { id: 'annotations', type: 'annotation', name: '註記', color: COLORS[0] }, leaflet: group, status: 'ok' };
    setupUi();
    restore();
    renderList(); renderEditor();
  }

  window.DDAnnotate = { init, attach3d, isDrawing, toGeoJSON, select, setTool };
})();
