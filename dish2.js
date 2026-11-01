(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaDish2 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The circular life dish (Stage 6). One circle stands for the Earth.
  //   left half  = land (land surface, underground, air)      right half = water
  //   radius     = pressure: centre = high pressure, rim = low pressure / vacuum (log scale, the high-pressure centre is kept small)
  //   the ring at 1 atm is the land surface on the left and the sea surface on the right
  //   top -> bottom (on each half) = cold -> hot
  // Display coordinates are separate from the scientific values: a site keeps (side, temperature, pressure); the unit-disc position is computed from them here.
  // What is a real engine value and what is provisional is stated in `SOURCES` and shown in the legend.
  const TMIN = 190, TMAX = 440, P_ATM = 101325, PMAX = 3e8, PMIN = 1e2, ROWS = 12, RINGS = 12;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const SPAN = Math.log10(PMAX) - Math.log10(PMIN);
  // 0 at the centre (PMAX) .. 1 at the rim (PMIN); the exponent < 1 pulls the 1-atm ring outwards so that the high-pressure core stays small
  const radiusOfPressure = (P) => Math.pow(clamp((Math.log10(PMAX) - Math.log10(clamp(P, PMIN, PMAX))) / SPAN, 0, 1), 0.8);
  const R_ATM = radiusOfPressure(P_ATM);
  const pressureOfRadius = (r) => Math.pow(10, Math.log10(PMAX) - Math.pow(clamp(r, 0, 1), 1 / 0.8) * SPAN);
  const fractionOfTemperature = (T) => clamp((T - TMIN) / (TMAX - TMIN), 0, 1);
  // side: 'land' (left) or 'water' (right). f: 0 cold (top) .. 1 hot (bottom). Returns a point in the unit disc (x right, y down).
  function place(side, f, P) { const th = Math.PI * clamp(f, 0, 1), r = radiusOfPressure(P), s = side === 'land' ? -1 : 1; return { x: s * r * Math.sin(th), y: -r * Math.cos(th), r, th }; }
  // a site is a cell of the dish: side x temperature row x pressure ring
  const siteKey = (side, row, ring) => (side === 'land' ? 0 : 1) * 10000 + row * 100 + ring;
  function siteOf(side, T, P) { const f = fractionOfTemperature(T), r = radiusOfPressure(P); return { side, row: Math.min(ROWS - 1, Math.floor(f * ROWS)), ring: Math.min(RINGS - 1, Math.floor(r * RINGS)) }; }
  function siteCenter(key) { const side = key >= 10000 ? 'water' : 'land', k = key % 10000, row = Math.floor(k / 100), ring = k % 100, f = (row + 0.5) / ROWS, r = (ring + 0.5) / RINGS, th = Math.PI * f, s = side === 'land' ? -1 : 1; return { side, row, ring, x: s * r * Math.sin(th), y: -r * Math.cos(th), r, th, f }; }
  const distSites = (a, b) => { const p = siteCenter(a), q = siteCenter(b); return Math.hypot(p.x - q.x, p.y - q.y) + (p.side === q.side ? 0 : 0.35); };
  // A book keeps, for every lineage, the sites it has occupied (the "evolution path"): when it first came, when it was last seen, whether anyone is there now.
  // Nothing is made up: a site exists only if living individuals were counted there. `parent` is the nearest site the lineage already held when this one was first occupied
  // (a record of how its range spread, not a genealogy).
  const newBook = (nLin) => ({ lin: Array.from({ length: nLin }, () => ({ sites: {}, order: [] })) });
  // Links stay on one half of the dish: a site on the other half starts a new chain.
  // groups: [{ lin, key, n }] for the individuals alive now; year: the world clock now. Returns the number of new sites.
  function record(book, groups, year) {
    let fresh = 0; const now = new Map();
    for (const g of groups) now.set(g.lin * 1e6 + g.key, (now.get(g.lin * 1e6 + g.key) || 0) + g.n);
    for (const L of book.lin) for (const k of L.order) L.sites[k].n = 0;
    for (const [id, n] of now) {
      const lin = Math.floor(id / 1e6), key = id % 1e6, L = book.lin[lin]; if (!L) continue; let s = L.sites[key];
      if (!s) { let par = null, best = 1e9; for (const o of L.order) { if ((o >= 10000) !== (key >= 10000)) continue; const d = distSites(o, key); if (d < best) { best = d; par = o; } } s = L.sites[key] = { first: year, last: year, n: 0, peak: 0, par }; L.order.push(key); fresh++; }
      s.n = n; s.last = year; if (n > s.peak) s.peak = n;
    }
    return fresh;
  }
  // beads of one lineage for drawing: living (n > 0) or vacated; `par` links them
  function beads(book, lin) { const L = book.lin[lin]; if (!L) return []; return L.order.map((k) => ({ key: k, ...siteCenter(k), ...L.sites[k], alive: L.sites[k].n > 0 })); }
  const SOURCES = {
    water: '実値：水域・地下・空の位置は、個体が実際にいる温度・圧力の区間（進化計算の占有）から取っています。',
    land: '仮表示：陸の個体は地表（1気圧の線）の上にいますが、陸の温度は個体ごとに計算していないため、その系統の耐性の幅の中に仮に並べています。',
    civ: '仮表示：文明のモデルには場所がありません。×の位置は陸の線上の仮置きで、大きさ（環境を変える力）だけが文明モデルの値です。',
    influence: '代理指標：点の大きさ＝環境支配力（個体あたりの使用・影響・持続・広さの合成）×その場所にいる割合。個体数そのものではありません。',
  };
  return { TMIN, TMAX, P_ATM, PMAX, PMIN, ROWS, RINGS, R_ATM, radiusOfPressure, pressureOfRadius, fractionOfTemperature, place, siteKey, siteOf, siteCenter, distSites, newBook, record, beads, SOURCES };
});
