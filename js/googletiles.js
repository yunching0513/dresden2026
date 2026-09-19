/* googletiles.js：選用的Google底圖（Map Tiles API）。
 *
 * 為什麼要這樣接：Google Maps Platform的條款禁止以官方API以外的方式取得圖磚，
 * 直接指向 mt*.google.com 的作法違反條款。合法路徑是Map Tiles API：
 *   1. POST /v1/createSession 取得session token（依mapType與語系各自一組）
 *   2. 圖磚 https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=…&key=…
 *   3. 依viewport端點回傳的copyright字串顯示標示（條款要求）
 *
 * 金鑰由使用者自備，只存在瀏覽器的localStorage，不會寫進這個repo，也不會上傳。
 * 沒有金鑰時，Google底圖完全不會出現在任何選單中。
 */
(function () {
  'use strict';

  const KEY_STORE = 'dd_gmaps_key';
  const SESSION_STORE = 'dd_gmaps_sessions_v1';
  const ENDPOINT = 'https://tile.googleapis.com';
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  const TYPES = [
    { id: 'roadmap', name: 'Google 街道圖', mapType: 'roadmap', google: true },
    { id: 'satellite', name: 'Google 衛星影像', mapType: 'satellite', google: true },
    { id: 'hybrid', name: 'Google 衛星＋街道', mapType: 'satellite', layerTypes: ['layerRoadmap'], google: true },
  ];

  const listeners = [];
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隱私模式 */ } };
  const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } };
  const hasKey = () => !!getKey();

  function setKey(value) {
    try {
      if (value) localStorage.setItem(KEY_STORE, value);
      else { localStorage.removeItem(KEY_STORE); localStorage.removeItem(SESSION_STORE); }
    } catch (e) { /* 隱私模式 */ }
    listeners.forEach((fn) => fn());
  }

  const langOf = (locale) => (locale === 'zh-TW' ? { language: 'zh-TW', region: 'TW' } : { language: 'de-DE', region: 'DE' });

  /* session token依mapType與語系各存一份；官方有效期約兩週，到期前重新申請。 */
  async function session(def, locale) {
    const key = getKey();
    if (!key) throw new Error('尚未填入API金鑰');
    const cacheId = `${def.id}:${locale}`;
    const cache = read(SESSION_STORE);
    const hit = cache[cacheId];
    if (hit && hit.fingerprint === key.slice(-6) && Number(hit.expiry) * 1000 > Date.now() + 60000) return hit.session;

    const body = Object.assign({ mapType: def.mapType }, langOf(locale));
    if (def.layerTypes) body.layerTypes = def.layerTypes;
    const res = await fetch(`${ENDPOINT}/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.session) {
      const reason = (json.error && json.error.message) || `HTTP ${res.status}`;
      throw new Error(reason);
    }
    cache[cacheId] = { session: json.session, expiry: json.expiry, fingerprint: key.slice(-6) };
    write(SESSION_STORE, cache);
    return json.session;
  }

  /* 條款要求顯示viewport回傳的著作權標示，隨視野更新。 */
  function attachAttribution(layer, map, token) {
    let timer;
    const update = async () => {
      if (!map.hasLayer(layer)) return;
      try {
        const b = map.getBounds();
        const url = `${ENDPOINT}/tile/v1/viewport?session=${encodeURIComponent(token)}&key=${encodeURIComponent(getKey())}`
          + `&zoom=${Math.round(map.getZoom())}&north=${b.getNorth()}&south=${b.getSouth()}&east=${b.getEast()}&west=${b.getWest()}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.copyright) return;
        if (map.attributionControl) {
          map.attributionControl.removeAttribution(layer.options.attribution);
          layer.options.attribution = json.copyright;
          if (map.hasLayer(layer)) map.attributionControl.addAttribution(json.copyright);
        }
      } catch (e) { /* 標示取得失敗時沿用預設字串 */ }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 600); };
    map.on('moveend', schedule);
    layer.on('add', schedule);
    schedule();
  }

  function makeLayer(def, map, locale) {
    const layer = L.tileLayer(BLANK, {
      maxZoom: 22, maxNativeZoom: 22, minZoom: 0,
      attribution: 'Map data ©Google', // 先放預設值，取得viewport標示後替換
    });
    // session token在圖層真的被選用時才申請，沒選到的底圖不會用掉配額
    let started = false;
    layer.on('add', () => {
      if (started) return;
      started = true;
      session(def, locale).then((token) => {
        layer.setUrl(`${ENDPOINT}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(token)}&key=${encodeURIComponent(getKey())}`);
        attachAttribution(layer, map, token);
        status('');
      }).catch((err) => {
        started = false;
        status(`Google底圖無法啟用：${err.message}。請確認金鑰已啟用Map Tiles API與帳務，並允許此網域。`, true);
      });
    });
    return layer;
  }

  function status(text, isError) {
    const node = document.getElementById('gmaps-status');
    if (!node) return;
    if (text) { node.textContent = text; node.className = `small ${isError ? 'gmaps-error' : 'muted'}`; }
    else if (node.classList.contains('gmaps-error')) { node.textContent = 'Google底圖已啟用。'; node.className = 'small muted'; }
  }

  function basemaps() { return hasKey() ? TYPES.slice() : []; }
  function typeById(id) { return TYPES.find((t) => t.id === id); }

  function init() {
    const input = document.getElementById('gmaps-key');
    const save = document.getElementById('gmaps-save');
    const clear = document.getElementById('gmaps-clear');
    if (!input) return;
    if (hasKey()) { input.value = getKey(); status('Google底圖已啟用，可在底圖選單中選用。'); }
    save.addEventListener('click', async () => {
      const value = input.value.trim();
      if (!value) { status('請先貼上API金鑰。', true); return; }
      setKey(value);
      status('正在向Google申請session token…');
      try {
        await session(TYPES[0], 'zh-TW');
        status('金鑰可用，Google底圖已加入底圖選單。');
      } catch (err) {
        status(`金鑰測試失敗：${err.message}`, true);
      }
    });
    clear.addEventListener('click', () => { input.value = ''; setKey(''); status('已移除金鑰，Google底圖已從選單中撤下。'); });
  }

  window.DDGoogle = { init, basemaps, typeById, makeLayer, hasKey, onChange: (fn) => listeners.push(fn) };
})();
