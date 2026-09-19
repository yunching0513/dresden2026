/* visits.js：造訪人次。
 *
 * 這是純靜態網站，沒有自己的後端，因此累計次數存在外部的計數服務。
 * 設計上刻意做成「壞掉也不影響地圖」：
 *  - 依序嘗試多個服務，第一個成功的就記住，之後直接用它
 *  - 全部失敗就把計數器整個隱藏，不顯示錯誤
 *  - 同一瀏覽器每天只計一次，其餘時候只讀取數字
 *
 * 隱私：這些服務只保存一個累計數字，不設cookie、不做行為追蹤；但與任何網路請求
 * 一樣，服務端會看到來訪者的IP。若不希望有第三方參與，可改用自架端點（見README）。
 */
(function () {
  'use strict';

  const NS = 'dresden-taipei';
  const KEY = 'visits';
  const STORE_DAY = 'dd_visit_day';
  const STORE_PROVIDER = 'dd_visit_provider';
  const TIMEOUT = 5000;

  const PROVIDERS = [
    {
      id: 'abacus',
      hit: (ns, k) => `https://abacus.jasoncameron.dev/hit/${ns}/${k}`,
      get: (ns, k) => `https://abacus.jasoncameron.dev/get/${ns}/${k}`,
      read: (json) => json && (json.value !== undefined ? json.value : json.count),
      name: 'Abacus',
    },
    {
      id: 'counterapi',
      hit: (ns, k) => `https://api.counterapi.dev/v1/${ns}/${k}/up`,
      get: (ns, k) => `https://api.counterapi.dev/v1/${ns}/${k}`,
      read: (json) => json && (json.count !== undefined ? json.count : json.value),
      name: 'CounterAPI',
    },
  ];

  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 隱私模式 */ } };

  async function ask(provider, increment) {
    const url = (increment ? provider.hit : provider.get)(NS, KEY);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const value = provider.read(await res.json());
      if (!Number.isFinite(Number(value))) throw new Error('無法解析回應');
      return Number(value);
    } finally { clearTimeout(timer); }
  }

  async function run() {
    const node = document.getElementById('visit-counter');
    if (!node) return;
    const today = new Date().toISOString().slice(0, 10);
    const increment = get(STORE_DAY) !== today;   // 同一瀏覽器每天只計一次
    const preferred = get(STORE_PROVIDER);
    const order = PROVIDERS.slice().sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));

    for (const provider of order) {
      try {
        const value = await ask(provider, increment);
        if (increment) set(STORE_DAY, today);
        set(STORE_PROVIDER, provider.id);
        node.querySelector('.visit-value').textContent = value.toLocaleString('zh-TW');
        node.title = `累計造訪人次，計數由${provider.name}提供；同一瀏覽器每天只計一次。`;
        node.hidden = false;
        return;
      } catch (e) { /* 換下一個服務 */ }
    }
    node.hidden = true;   // 服務全掛掉時不顯示，也不打擾使用者
  }

  window.DDVisits = { run };
  document.addEventListener('DOMContentLoaded', run);
})();
