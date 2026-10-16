/* cartotiles.js：選用的CARTO底圖（Positron、Dark Matter）。
 *
 * CARTO自2026年9月25日起不再提供無金鑰的raster圖磚：沒帶金鑰的請求仍會回圖，
 * 但整片蓋上「API KEY REQUIRED」浮水印。金鑰免費、免註冊，於
 * https://carto.com/basemaps/apikey 填信箱即寄送，非商業用途每月500萬張圖磚。
 *
 * 作法與Google底圖一致：金鑰只存在使用者瀏覽器的localStorage，不會寫進這個repo，
 * 也不會傳給第三方。沒有金鑰時，這兩個底圖完全不會出現在任何選單，使用者不會
 * 莫名其妙看到浮水印。預設底圖是免金鑰的OpenStreetMap，因此不填金鑰也能用。
 */
(function () {
  'use strict';

  const KEY_STORE = 'dd_carto_key';
  const HOST = 'https://basemaps.cartocdn.com/rastertiles';
  const SIGNUP = 'https://carto.com/basemaps/apikey';

  const TYPES = [
    { id: 'positron', name: 'CARTO Positron（淺色）', style: 'light_all' },
    { id: 'dark', name: 'CARTO Dark Matter（深色）', style: 'dark_all' },
  ];
  const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

  const listeners = [];
  const $ = (sel) => document.querySelector(sel);
  const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } };
  const hasKey = () => !!getKey();

  function setKey(value) {
    try {
      if (value) localStorage.setItem(KEY_STORE, value);
      else localStorage.removeItem(KEY_STORE);
    } catch (e) { /* 隱私模式下localStorage不可寫，略過 */ }
    listeners.forEach((fn) => fn());
  }

  function tileUrl(type, key) {
    return `${HOST}/${type.style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`;
  }

  /* 有金鑰才回傳；沒金鑰時回空陣列，選單自然不會出現這些選項。 */
  function basemaps() {
    if (!hasKey()) return [];
    return TYPES.map((t) => ({ id: t.id, name: t.name, carto: true, style: t.style }));
  }

  const typeById = (id) => basemaps().find((t) => t.id === id) || null;

  function makeLayer(def) {
    const type = TYPES.find((t) => t.id === def.id) || TYPES[0];
    return L.tileLayer(tileUrl(type, getKey()), {
      maxZoom: 20, attribution: ATTRIBUTION, crossOrigin: true,
    });
  }

  /* 只能確認圖磚載得進來，無法分辨「有效金鑰」與「無效金鑰的浮水印圖」，
   * 因為瀏覽器拿到的都是一張正常的PNG。狀態文字據實說明。 */
  function probe(key) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = tileUrl(TYPES[0], key).replace('{z}', '12').replace('{x}', '2200').replace('{y}', '1343').replace('{r}', '');
    });
  }

  function reflect() {
    const status = $('#carto-status');
    if (!status) return;
    status.textContent = hasKey()
      ? '金鑰已儲存，CARTO底圖已加入底圖選單。'
      : `未填金鑰，CARTO底圖不會出現在選單。可於 ${SIGNUP} 免費索取。`;
  }

  function init() {
    const input = $('#carto-key'), save = $('#carto-save'), clear = $('#carto-clear'), status = $('#carto-status');
    if (!input) return;
    if (hasKey()) input.value = getKey();
    reflect();
    if (save) {
      save.addEventListener('click', async () => {
        const value = input.value.trim();
        if (!value) { setKey(''); reflect(); return; }
        if (status) status.textContent = '測試中…';
        const ok = await probe(value);
        setKey(value);
        if (status) {
          status.textContent = ok
            ? '圖磚載入成功，CARTO底圖已加入底圖選單。若圖上仍有「API KEY REQUIRED」浮水印，表示金鑰無效，請再確認。'
            : '圖磚載入失敗，請確認金鑰與網路。金鑰仍已儲存，可直接在底圖選單中切換測試。';
        }
      });
    }
    if (clear) {
      clear.addEventListener('click', () => { input.value = ''; setKey(''); reflect(); });
    }
  }

  window.DDCarto = { init, basemaps, typeById, makeLayer, hasKey, onChange: (fn) => listeners.push(fn), signupUrl: SIGNUP };
}());
