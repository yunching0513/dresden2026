/* geo.js：輕量幾何工具（point-in-polygon、面積、bbox），不依賴外部函式庫。 */
(function () {
  'use strict';

  const DDGeo = {};

  // ray casting：pt=[lng,lat]，ring=[[lng,lat],...]
  function pointInRing(pt, ring) {
    const x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygonCoords(pt, polyCoords) {
    if (!pointInRing(pt, polyCoords[0])) return false;
    for (let h = 1; h < polyCoords.length; h++) {
      if (pointInRing(pt, polyCoords[h])) return false;
    }
    return true;
  }

  DDGeo.pointInFeature = function (pt, feature) {
    const g = feature.geometry;
    if (!g) return false;
    if (g.type === 'Polygon') return pointInPolygonCoords(pt, g.coordinates);
    if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) if (pointInPolygonCoords(pt, poly)) return true;
    }
    return false;
  };

  DDGeo.bboxOfFeature = function (feature) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c) => {
      if (typeof c[0] === 'number') {
        if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
      } else c.forEach(walk);
    };
    walk(feature.geometry.coordinates);
    return [minX, minY, maxX, maxY];
  };

  // 建立可快速查詢的索引：先用 bbox 篩，再做 point-in-polygon
  DDGeo.buildIndex = function (featureCollection) {
    const items = featureCollection.features.map((f) => ({ f, bbox: DDGeo.bboxOfFeature(f) }));
    return {
      locate(lng, lat) {
        for (const it of items) {
          const b = it.bbox;
          if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
          if (DDGeo.pointInFeature([lng, lat], it.f)) return it.f;
        }
        return null;
      },
    };
  };

  // 多邊形的簡易質心（以外環頂點平均，適合標籤定位）
  DDGeo.labelPoint = function (feature) {
    const g = feature.geometry;
    let ring = g.type === 'Polygon' ? g.coordinates[0] : null;
    if (g.type === 'MultiPolygon') {
      // 取面積最大的外環
      let best = null, bestA = -1;
      for (const poly of g.coordinates) {
        const a = Math.abs(DDGeo.ringAreaPlanar(poly[0]));
        if (a > bestA) { bestA = a; best = poly[0]; }
      }
      ring = best;
    }
    let sx = 0, sy = 0, sa = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      sx += (ring[j][0] + ring[i][0]) * cross;
      sy += (ring[j][1] + ring[i][1]) * cross;
      sa += cross;
    }
    if (Math.abs(sa) < 1e-12) {
      const b = DDGeo.bboxOfFeature(feature);
      return [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2];
    }
    sa *= 0.5;
    return [sy / (6 * sa), sx / (6 * sa)]; // [lat,lng]
  };

  DDGeo.ringAreaPlanar = function (ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return a / 2;
  };

  // 地理座標下的近似面積（m²），等距柱狀投影，用於市域尺度已足夠
  DDGeo.areaM2 = function (feature) {
    const g = feature.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : []);
    const R = 6371008.8;
    const ringArea = (ring) => {
      const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const k = Math.cos(lat0 * Math.PI / 180);
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const x1 = ring[j][0] * Math.PI / 180 * k * R, y1 = ring[j][1] * Math.PI / 180 * R;
        const x2 = ring[i][0] * Math.PI / 180 * k * R, y2 = ring[i][1] * Math.PI / 180 * R;
        a += x1 * y2 - x2 * y1;
      }
      return Math.abs(a) / 2;
    };
    let total = 0;
    for (const poly of polys) {
      total += ringArea(poly[0]);
      for (let h = 1; h < poly.length; h++) total -= ringArea(poly[h]);
    }
    return total;
  };

  // 分位數分級（用於 choropleth）
  DDGeo.quantileBreaks = function (values, classes) {
    const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return [];
    const breaks = [];
    for (let i = 1; i < classes; i++) {
      const idx = Math.floor((i / classes) * (v.length - 1));
      breaks.push(v[idx]);
    }
    return breaks;
  };

  DDGeo.classIndex = function (value, breaks) {
    let i = 0;
    while (i < breaks.length && value > breaks[i]) i++;
    return i;
  };

  DDGeo.fmt = function (n, digits) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '–';
    return n.toLocaleString('de-DE', { maximumFractionDigits: digits === undefined ? 1 : digits });
  };

  window.DDGeo = DDGeo;
})();
