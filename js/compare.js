/* compare.js：城市切換視窗與雙城比較。
 *
 * 比較的可信度來自兩件事：
 *  1. 兩市跑「完全相同」的Overpass查詢（定義見js/cities.js的indicators）；
 *  2. 以各市的行政界線做點在多邊形內判斷，bbox外圍的鄰接城市（新北、Radebeul）不列入。
 *
 * OSM由志願者維護，標記完整度本身就是城市間的差異之一，結果適合看數量級與結構，
 * 不適合當官方統計引用。
 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const G = window.DDGeo;
  const CITIES = window.DD_CITIES;
  const ORDER = window.DD_CITY_ORDER;
  const INDICATORS = window.DD_INDICATORS;
  const KEY = 'dd_compare_v1';

  let app;                       // { state, switchTab, switchCity, runOverpass, osmToFeatures, el, downloadText }
  let results = {};              // `${cityId}:${indicatorId}` -> { value, n }
  let fetchedAt = null;
  let running = false;
  const indexCache = {};

  // 比較面板是中文介面，數字一律用台灣慣例，不隨目前城市的語系變動
  const fmt = (v, d) => (Number.isFinite(v) ? v.toLocaleString('zh-TW', { maximumFractionDigits: d === undefined ? 1 : d }) : '—');
  const num = (v) => fmt(v, 1);

  function indexOf(cityId) {
    if (!indexCache[cityId]) indexCache[cityId] = G.buildIndex(CITIES[cityId].boundaries());
    return indexCache[cityId];
  }

  /* ---------------- 量測 ---------------- */
  function centerOf(f) {
    const g = f.geometry;
    if (g.type === 'Point') return g.coordinates;
    const b = G.bboxOfFeature(f);
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }

  function lineLengthM(coords) {
    const R = 6371008.8;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      const [x1, y1] = coords[i - 1], [x2, y2] = coords[i];
      const dy = (y2 - y1) * Math.PI / 180 * R;
      const dx = (x2 - x1) * Math.PI / 180 * R * Math.cos((y1 + y2) / 2 * Math.PI / 180);
      total += Math.hypot(dx, dy);
    }
    return total;
  }

  function measure(fc, ind, cityId) {
    const idx = indexOf(cityId);
    let value = 0, n = 0;
    for (const f of fc.features) {
      const c = centerOf(f);
      if (!idx.locate(c[0], c[1])) continue;   // 落在市界外（鄰接城市）
      n++;
      if (ind.kind === 'count') value++;
      else if (ind.kind === 'area') { if (f.geometry.type === 'Polygon') value += G.areaM2(f) / 10000; }        // ha
      else if (ind.kind === 'length') { if (f.geometry.type === 'LineString') value += lineLengthM(f.geometry.coordinates) / 1000; } // km
    }
    return { value, n };
  }

  function queryFor(ind, city) {
    const bbox = city.bbox.join(',');
    const q = ind.query.replace(/\{\{bbox\}\}/g, bbox);
    if (!ind.geom) return `[out:json][timeout:180];(${q});out center tags;`;
    return `[out:json][timeout:180];(${q});out geom;`;
  }

  /* ---------------- 取得指標 ---------------- */
  async function runAll(force) {
    if (running) return;
    running = true;
    $('#compare-run').disabled = true;
    $('#compare-refresh').disabled = true;
    const total = INDICATORS.length * ORDER.length;
    let done = 0, failed = 0;
    for (const ind of INDICATORS) {
      for (const cityId of ORDER) {
        const key = `${cityId}:${ind.id}`;
        done++;
        if (!force && results[key]) continue;
        $('#compare-status').textContent = `查詢中 ${done}/${total}：${CITIES[cityId].name}／${ind.name}`;
        try {
          const json = await app.runOverpass(queryFor(ind, CITIES[cityId]));
          const fc = app.osmToFeatures(json, { geom: ind.geom || 'point' });
          results[key] = measure(fc, ind, cityId);
          renderTable();
        } catch (err) {
          failed++;
          results[key] = { value: NaN, n: 0, error: true };
        }
      }
    }
    fetchedAt = new Date().toISOString();
    save();
    running = false;
    $('#compare-run').disabled = false;
    $('#compare-refresh').disabled = false;
    $('#compare-status').textContent = failed
      ? `完成，但有 ${failed} 項查詢失敗（Overpass忙碌或速率限制），可按「重新查詢」補。資料取得：${new Date(fetchedAt).toLocaleString('zh-TW')}`
      : `資料取得：${new Date(fetchedAt).toLocaleString('zh-TW')}（存於此瀏覽器，可按「重新查詢」更新）`;
    renderTable();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ fetchedAt, results })); } catch (e) { /* 隱私模式 */ }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      results = obj.results || {};
      fetchedAt = obj.fetchedAt || null;
      if (fetchedAt) $('#compare-status').textContent = `上次取得：${new Date(fetchedAt).toLocaleString('zh-TW')}（按「重新查詢」更新）`;
    } catch (e) { /* 忽略毀損的快取 */ }
  }

  /* ---------------- 呈現 ---------------- */
  function normalized(ind, cityId) {
    const r = results[`${cityId}:${ind.id}`];
    if (!r || !Number.isFinite(r.value)) return NaN;
    const st = CITIES[cityId].stats;
    const mode = $('#compare-norm').value;
    if (mode === 'abs') return r.value;
    if (mode === 'pop') return r.value / st.population * 100000;
    return r.value / st.area_km2;
  }

  function unitLabel(ind) {
    const mode = $('#compare-norm').value;
    const base = ind.kind === 'area' ? 'ha' : ind.kind === 'length' ? 'km' : '處';
    if (mode === 'abs') return base;
    if (mode === 'pop') return `${base}／10萬人`;
    return `${base}／km²`;
  }

  function renderHeads() {
    const box = $('#compare-heads');
    box.innerHTML = ORDER.map((id) => {
      const c = CITIES[id], st = c.stats;
      const active = app.state.cityId === id;
      return `<div class="ccard ${active ? 'active' : ''}" data-city="${id}">
        <div class="ccard-top"><span class="cdot" style="background:${c.chart}"></span><b>${c.flag} ${c.name}</b>${active ? '<span class="tag">目前檢視</span>' : ''}</div>
        <table class="kv small">
          <tr><th>面積</th><td>${num(st.area_km2)} km²</td></tr>
          <tr><th>人口</th><td>${num(st.population)}</td></tr>
          <tr><th>密度</th><td>${num(Math.round(st.population / st.area_km2))} 人/km²</td></tr>
        </table></div>`;
    }).join('');
    box.querySelectorAll('.ccard').forEach((n) => n.addEventListener('click', () => app.switchCity(n.dataset.city)));
  }

  /* 等面積投影：Lambert方位等積投影（球體，各市以自身界線形心為切點）。
   * 等積投影下，共用同一個像素／公里比例的兩個輪廓，螢幕面積比就等於真實面積比，
   * 不受緯度影響。先前用的等距近似（lng×cos(lat0)）會讓兩市面積各少算約0.42%，
   * 比值雖幾乎不變，但既然是面積對照，就用真正保面積的投影。 */
  const R_KM = 6371.0088;
  function laeaProjector(lng0, lat0) {
    const rad = Math.PI / 180, f1 = lat0 * rad, sf1 = Math.sin(f1), cf1 = Math.cos(f1);
    return (lng, lat) => {
      const dl = (lng - lng0) * rad, f = lat * rad, sf = Math.sin(f), cf = Math.cos(f), cd = Math.cos(dl);
      const k = Math.sqrt(2 / (1 + sf1 * sf + cf1 * cf * cd));
      return [R_KM * k * cf * Math.sin(dl), -R_KM * k * (cf1 * sf - sf1 * cf * cd)];   // y向下為正
    };
  }
  function ringArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    return Math.abs(a / 2);
  }
  function outerRings(fc) {
    const out = [];
    fc.features.forEach((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach((poly) => out.push(poly[0]));
    });
    return out;
  }

  /* 同尺度輪廓：兩市界線以相同的像素／公里比例並排，直接看出規模差異。
   * 另外疊一個虛線方框＝官方統計面積開根號的正方形（同樣等面積），
   * 這樣即使手上的界線資料不完整，仍讀得出官方面積的真正大小關係。 */
  function outlineShapes() {
    return ORDER.map((id) => {
      const c = CITIES[id], fc = c.boundaries();
      let sx = 0, sy = 0, n = 0;
      outerRings(fc).forEach((r) => r.forEach(([lng, lat]) => { sx += lng; sy += lat; n++; }));
      const prj = laeaProjector(sx / n, sy / n);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, drawn = 0;
      const rings = outerRings(fc).map((r) => {
        const pts = r.map(([lng, lat]) => {
          const p = prj(lng, lat);
          if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
          return p;
        });
        drawn += ringArea(pts);
        return pts;
      });
      const official = c.stats.area_km2;
      const side = Math.sqrt(official);                       // 等面積參考方框邊長（km）
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const w = Math.max(maxX - minX, side), h = Math.max(maxY - minY, side);
      return { id, rings, drawn, official, side, cx, cy, w, h, coverage: drawn / official };
    });
  }

  function renderOutline() {
    const H = 158, pad = 6, gap = 26, foot = 30;
    const shapes = outlineShapes();
    const scale = (H - pad * 2 - foot) / Math.max(...shapes.map((s) => s.h));   // px/km，兩市共用
    const totalW = shapes.reduce((a, s) => a + s.w * scale, 0) + gap * (shapes.length - 1) + pad * 2;
    let x = pad;
    const groups = shapes.map((s) => {
      const c = CITIES[s.id];
      const left = x, top = pad;
      x += s.w * scale + gap;
      const px = (kx) => (left + (kx - (s.cx - s.w / 2)) * scale).toFixed(1);
      const py = (ky) => (top + (ky - (s.cy - s.h / 2)) * scale).toFixed(1);
      const d = s.rings.map((r) => 'M' + r.map(([a, b]) => `${px(a)},${py(b)}`).join('L') + 'Z').join(' ');
      const sq = `<rect x="${px(s.cx - s.side / 2)}" y="${py(s.cy - s.side / 2)}" width="${(s.side * scale).toFixed(1)}" height="${(s.side * scale).toFixed(1)}"
        fill="none" stroke="${c.chart}" stroke-width="1" stroke-dasharray="3 3" stroke-opacity="0.65"/>`;
      const cxPx = (left + (s.w * scale) / 2).toFixed(1);
      const gap2 = s.coverage < 0.98 ? `<text x="${cxPx}" y="${H - 6}" text-anchor="middle" class="outline-label">界線資料涵蓋 ${Math.round(s.coverage * 100)}%</text>` : '';
      return `${sq}<path d="${d}" fill="${c.chart}" fill-opacity="0.14" stroke="${c.chart}" stroke-width="1" stroke-linejoin="round"/>
        <text x="${cxPx}" y="${H - 17}" text-anchor="middle" class="outline-label">${c.name}　${num(s.official)} km²</text>${gap2}`;
    }).join('');
    const bar = (5 * scale).toFixed(1);
    $('#compare-outline').innerHTML = `<svg viewBox="0 0 ${totalW.toFixed(0)} ${H + 14}" role="img" aria-label="兩市界線等面積同尺度對照">
      ${groups}
      <g transform="translate(${pad},${H + 8})"><line x1="0" y1="0" x2="${bar}" y2="0" stroke="currentColor" stroke-width="1.5"/><text x="${(+bar) + 5}" y="3.5" class="outline-label">5 km（兩市同尺度，Lambert方位等積投影）</text></g>
    </svg>`;
    const short = shapes.filter((s) => s.coverage < 0.98);
    const note = $('#compare-outline-note');
    if (!note) return;
    note.innerHTML = `虛線方框是該市官方統計面積換算的等面積正方形；實心輪廓是手上的行政界線資料。`
      + (short.length ? ' ' + short.map((s) => {
        const c = CITIES[s.id];
        return `<b>${c.name}</b>的界線目前只有${c.stats.unitsBundled}個${c.unit.label}（官方${c.stats.units}個），少了${num(s.official - s.drawn)} km²，所以輪廓比方框小；落在這些區裡的OSM物件也不會被計入下方指標。`;
      }).join(' ') : '');
  }

  function renderBasic() {
    const [a, b] = ORDER.map((id) => CITIES[id]);
    const rows = [
      { k: '市域面積', f: (c) => `${num(c.stats.area_km2)} km²`, v: (c) => c.stats.area_km2 },
      { k: '人口', f: (c) => num(c.stats.population), v: (c) => c.stats.population },
      { k: '人口密度', f: (c) => `${num(Math.round(c.stats.population / c.stats.area_km2))} 人/km²`, v: (c) => c.stats.population / c.stats.area_km2 },
      { k: '統計單元', f: (c) => `${c.stats.units} 個${c.unit.label}`, v: () => NaN },
      { k: '海拔範圍', f: (c) => `${num(c.stats.elevation[0])}–${num(c.stats.elevation[1])} m`, v: () => NaN },
    ];
    $('#compare-basic').innerHTML = `<table class="stats compare"><thead><tr><th>項目</th><th>${a.name}</th><th>${b.name}</th><th>倍數</th></tr></thead><tbody>${
      rows.map((r) => {
        const va = r.v(a), vb = r.v(b);
        const ratio = Number.isFinite(va) && Number.isFinite(vb) && va > 0 ? `${fmt(vb / va, 2)}×` : '—';
        return `<tr><td>${r.k}</td><td class="num">${r.f(a)}</td><td class="num">${r.f(b)}</td><td class="num muted">${ratio}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="muted small">「倍數」為${b.name} ÷ ${a.name}。人口統計基準不同：${ORDER.map((id) => `${CITIES[id].name}${CITIES[id].stats.populationAsOf}`).join('、')}；${a.stats.populationNote}${b.stats.populationNote}</p>`;
  }

  function renderTable() {
    const box = $('#compare-table');
    const [a, b] = ORDER;
    const rows = INDICATORS.map((ind) => {
      const va = normalized(ind, a), vb = normalized(ind, b);
      const max = Math.max(Number.isFinite(va) ? va : 0, Number.isFinite(vb) ? vb : 0) || 1;
      const bar = (v, cityId) => {
        if (!Number.isFinite(v)) return '<div class="cbar-row"><span class="cbar-empty">未查詢</span></div>';
        const w = Math.max(1.5, (v / max) * 100);
        return `<div class="cbar-row"><span class="cbar" style="width:${w.toFixed(1)}%;background:${CITIES[cityId].chart}"></span><span class="cbar-val">${num(v)}</span></div>`;
      };
      const ratio = Number.isFinite(va) && Number.isFinite(vb) && va > 0 ? `${fmt(vb / va, 2)}×` : '—';
      return `<tr><th scope="row"><span class="ind-name${ind.note ? ' has-note' : ''}"${ind.note ? ` title="${ind.note}"` : ''}>${ind.name}</span><span class="muted small"> ${unitLabel(ind)}</span></th>
        <td class="cbars" title="${CITIES[a].name} ${num(va)} ／ ${CITIES[b].name} ${num(vb)} ${unitLabel(ind)}">${bar(va, a)}${bar(vb, b)}</td>
        <td class="num muted">${ratio}</td></tr>`;
    }).join('');
    box.innerHTML = `<table class="stats compare-ind"><thead><tr><th>指標</th><th>
      <span class="legend-inline"><span class="cdot" style="background:${CITIES[a].chart}"></span>${CITIES[a].name}
      <span class="cdot" style="background:${CITIES[b].chart}"></span>${CITIES[b].name}</span></th><th>倍數</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function exportCsv() {
    const [a, b] = ORDER;
    const lines = [['指標', '單位', CITIES[a].name, CITIES[b].name, `${CITIES[a].name}／10萬人`, `${CITIES[b].name}／10萬人`, `${CITIES[a].name}／km²`, `${CITIES[b].name}／km²`].join(',')];
    INDICATORS.forEach((ind) => {
      const base = ind.kind === 'area' ? 'ha' : ind.kind === 'length' ? 'km' : '處';
      const cell = (cityId, mode) => {
        const r = results[`${cityId}:${ind.id}`];
        if (!r || !Number.isFinite(r.value)) return '';
        const st = CITIES[cityId].stats;
        const v = mode === 'abs' ? r.value : mode === 'pop' ? r.value / st.population * 100000 : r.value / st.area_km2;
        return v.toFixed(3);
      };
      lines.push([ind.name, base, cell(a, 'abs'), cell(b, 'abs'), cell(a, 'pop'), cell(b, 'pop'), cell(a, 'area'), cell(b, 'area')].join(','));
    });
    lines.push('');
    lines.push(`# 資料來源：OpenStreetMap（ODbL），經Overpass API查詢；取得時間：${fetchedAt || '—'}`);
    ORDER.forEach((id) => lines.push(`# ${CITIES[id].name}：面積 ${CITIES[id].stats.area_km2} km²、人口 ${CITIES[id].stats.population}（${CITIES[id].stats.populationAsOf}）`));
    app.downloadText('city-compare.csv', '﻿' + lines.join('\n'));
  }

  /* ---------------- 城市切換視窗 ---------------- */
  function renderCityCards() {
    const box = $('#city-cards');
    box.innerHTML = ORDER.map((id) => {
      const c = CITIES[id], st = c.stats;
      const active = app.state.cityId === id;
      return `<button class="city-card ${active ? 'active' : ''}" data-city="${id}" ${active ? 'aria-current="true"' : ''}>
        <span class="city-card-flag">${c.flag}</span>
        <b>${c.name}<small>${c.nameLocal !== c.name ? ' ' + c.nameLocal : ''}</small></b>
        <span class="muted small">${c.country}</span>
        <span class="small">${c.tagline}</span>
        <span class="city-card-stats small">${num(st.area_km2)} km² · ${num(st.population)}人 · ${num(Math.round(st.population / st.area_km2))} 人/km²</span>
        <span class="city-card-go">${active ? '目前檢視中' : '切換到此城市 →'}</span>
      </button>`;
    }).join('');
    box.querySelectorAll('.city-card').forEach((n) => n.addEventListener('click', () => {
      const id = n.dataset.city;
      closeModal();
      if (id !== app.state.cityId) app.switchCity(id);
    }));
  }

  function openModal() { renderCityCards(); $('#city-modal').hidden = false; }
  function closeModal() { $('#city-modal').hidden = true; }

  function cityChanged() {
    renderHeads();
    renderBasic();
    renderTable();
    renderCityCards();
  }

  function init(context) {
    app = context;
    restore();
    renderHeads();
    renderOutline();
    renderBasic();
    renderTable();
    renderCityCards();

    $('#btn-city').addEventListener('click', openModal);
    $('#city-modal-close').addEventListener('click', closeModal);
    $('#city-modal').addEventListener('click', (e) => { if (e.target.dataset.close) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#city-modal').hidden) closeModal(); });
    $('#city-modal-compare').addEventListener('click', () => { closeModal(); app.switchTab('compare'); });
    $('#compare-run').addEventListener('click', () => runAll(false));
    $('#compare-refresh').addEventListener('click', () => runAll(true));
    $('#compare-export').addEventListener('click', exportCsv);
    $('#compare-norm').addEventListener('change', renderTable);
  }

  window.DDCompare = { init, cityChanged, openModal };
})();
