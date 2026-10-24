(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaDish = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The life dish (Stage 4.0): one disc on which every lineage's territory is painted like colonies on a culture plate.
  //
  // COORDINATES (a hierarchical reading of the two requirements "angle = temperature" and "angle = which kind of place"):
  //   * the circle is cut into four SECTORS, one per kind of place (water, underground, air, land). A sector's width follows how much of the world's
  //     dominance (never head counts) lives there, with a floor so that an empty sector stays visible;
  //   * INSIDE a sector the angle is the temperature of that place: clockwise = hotter (the same direction in every sector);
  //   * the radius is pressure: the centre is high pressure, the rim is close to vacuum (log scale);
  //   * LAND is the exception: there the radius is the layer of life, centre = bound to the environment (instinct), outside = changing it (technology, civilisation).
  // The two meanings of the angle cannot share one coordinate, so the sector says WHICH place and the position inside it says HOW WARM; the detail screen lists the
  // physical ranges of every sector. This is an interpretation chosen to keep the computation and the picture consistent.
  const A = 96, R = 28, ORDER = ['water', 'underground', 'air', 'land'], REALM_INDEX = { water: 0, land: 1, underground: 2, air: 3 }; // engine realm index by id
  const PMAX = 3e8, PMIN = 1e2, MIN_SECTOR = 0.1;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const radiusOfPressure = (P) => clamp((Math.log10(PMAX) - Math.log10(P)) / (Math.log10(PMAX) - Math.log10(PMIN)), 0, 1);
  // occ: dominance-weighted occupancy per kind of place, in the order of ORDER; returns the start/end of each sector as a fraction of the circle (0..1, from the top, clockwise)
  function sectors(occ) {
    const tot = occ.reduce((a, b) => a + b, 0), share = occ.map((v) => (tot > 0 ? v / tot : 0.25)), w = share.map((s) => MIN_SECTOR + (1 - MIN_SECTOR * 4) * s);
    const out = []; let a = 0; ORDER.forEach((id, k) => { out.push({ id, realm: REALM_INDEX[id], a0: a, a1: a + w[k], width: w[k], share: share[k] }); a += w[k]; }); return out;
  }
  // a point at fraction f (0 = coolest, 1 = hottest, clockwise) of its sector, radius r
  const angleOf = (sec, f) => sec.a0 + sec.width * clamp(f, 0.001, 0.999);
  // points: [{ lin, a, r, n }] (a in 0..1, r in 0..1); doms: dominance per lineage (0..1). Returns the owner of every cell and how firmly.
  function paint(points, doms, nLin) {
    const per = Array.from({ length: nLin }, () => null), idx = (ai, ri) => ri * A + ai;
    for (const p of points) {
      const dm = clamp(doms[p.lin] === null || doms[p.lin] === undefined ? 0 : doms[p.lin], 0, 1), rho = 2 + 6 * dm, base = (1 - Math.exp(-p.n / 1.5)) * (0.45 + dm);
      const a0 = Math.round(p.a * A), r0 = Math.round(p.r * (R - 1)), span = Math.ceil(2 * rho), g = per[p.lin] || (per[p.lin] = new Float32Array(A * R));
      for (let dr = -span; dr <= span; dr++) { const ri = r0 + dr; if (ri < 0 || ri >= R) continue; for (let da = -span; da <= span; da++) { const ai = (((a0 + da) % A) + A) % A, d2 = (da * da + dr * dr) / (rho * rho); if (d2 > 4) continue; const k = idx(ai, ri); g[k] = Math.min(1, g[k] + base * Math.exp(-d2)); } }
    }
    const owner = new Int8Array(A * R).fill(-1), strength = new Float32Array(A * R), second = new Int8Array(A * R).fill(-1), secondStrength = new Float32Array(A * R);
    for (let k = 0; k < A * R; k++) { let b = -1, bv = 0.04, s = -1, sv = 0.04; for (let l = 0; l < nLin; l++) { const v = per[l] ? per[l][k] : 0; if (v > bv) { s = b; sv = bv; b = l; bv = v; } else if (v > sv) { s = l; sv = v; } } owner[k] = b; strength[k] = b >= 0 ? bv : 0; second[k] = b >= 0 && s >= 0 && sv >= 0.7 * bv ? s : -1; secondStrength[k] = sv; }
    return { A, R, owner, strength, second, secondStrength };
  }
  // the area each lineage holds (cells), weighted by the ring's true area so that the centre does not count for more than the rim
  function areas(grid, nLin) { const out = new Array(nLin).fill(0); let tot = 0; for (let ri = 0; ri < R; ri++) { const w = (2 * ri + 1); for (let ai = 0; ai < A; ai++) { const o = grid.owner[ri * A + ai]; if (o >= 0) { out[o] += w; tot += w; } } } return { byLineage: out.map((v) => (tot ? v / tot : 0)), covered: tot }; }
  // the Omega-LIKE look of the whole disc: a narrow civilisation sector and a thick, continuous band of life at the rim. A picture only; the verdict on a lineage (rank.js) is separate.
  function omegaShape(grid, civFraction) {
    let rim = 0, n = 0; for (let ri = Math.floor(R * 0.7); ri < R; ri++) for (let ai = 0; ai < A; ai++) { n++; if (grid.owner[ri * A + ai] >= 0) rim++; }
    const outer = n ? rim / n : 0; return { civFraction, rimCoverage: outer, like: civFraction < 0.14 && outer >= 0.6 };
  }
  return { A, R, ORDER, REALM_INDEX, PMAX, PMIN, MIN_SECTOR, radiusOfPressure, sectors, angleOf, paint, areas, omegaShape };
});
