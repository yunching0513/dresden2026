/* swipe.js：捲簾比較。
 *
 * 歷史地圖疊上現況後，最常見的判讀方式是左右拉一條線：線左邊看歷史圖、右邊看現況。
 * 作法是把「已開啟的WMS／圖磚類圖層」的容器以clip-path裁切，底圖與向量圖層不受影響，
 * 因此右半邊會露出現在的底圖，左半邊維持歷史圖。
 */
(function () {
  'use strict';

  let app, handle, active = false, pos = 50;

  function rasterLayers() {
    return Object.values(app.state.layers).filter((entry) => {
      const l = entry.leaflet;
      return l && (entry.def.type === 'wms' || entry.def.type === 'xyz') && app.state.map.hasLayer(l) && l.getContainer;
    });
  }

  function apply() {
    const pane = app.state.map.getPane('tilePane');
    if (pane) Array.from(pane.children).forEach((node) => { node.style.clipPath = ''; });
    if (!active) return;
    rasterLayers().forEach((entry) => {
      const container = entry.leaflet.getContainer();
      if (container) container.style.clipPath = `inset(0 ${(100 - pos).toFixed(2)}% 0 0)`;
    });
  }

  function move(clientX) {
    const rect = document.getElementById('map').getBoundingClientRect();
    pos = Math.min(98, Math.max(2, ((clientX - rect.left) / rect.width) * 100));
    handle.style.left = `${pos}%`;
    apply();
  }

  function setActive(on) {
    active = on;
    handle.hidden = !on;
    document.getElementById('btn-swipe').setAttribute('aria-pressed', String(on));
    document.getElementById('btn-swipe').textContent = on ? '關閉捲簾' : '捲簾比較';
    if (on) {
      handle.style.left = `${pos}%`;
      if (!rasterLayers().length) app.notify('捲簾已開啟：請再開啟一個歷史地圖或WMS圖層，線的左邊就會顯示該圖層。');
    }
    apply();
  }

  function init(context) {
    app = context;
    handle = document.createElement('div');
    handle.id = 'swipe-handle';
    handle.hidden = true;
    handle.innerHTML = '<span class="swipe-grip"></span><span class="swipe-label swipe-left">疊加圖層</span><span class="swipe-label swipe-right">底圖現況</span>';
    document.getElementById('map').appendChild(handle);
    // 拖曳捲簾時不要觸發地圖平移與WMS屬性查詢
    L.DomEvent.disableClickPropagation(handle);
    L.DomEvent.disableScrollPropagation(handle);

    const onMove = (e) => { move(e.clientX === undefined ? e.touches[0].clientX : e.clientX); e.preventDefault(); };
    const stop = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', stop);
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', stop);
    });

    document.getElementById('btn-swipe').addEventListener('click', () => setActive(!active));
    app.state.map.on('layeradd layerremove', () => setTimeout(apply, 0));
  }

  window.DDSwipe = { init, isActive: () => active, refresh: apply };
})();
