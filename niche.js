(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaNiche = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Temperature x pressure habitat model (Stage 3.0).
  //
  // WHAT IS COMPUTED, WHAT IS ASSUMED
  //  * Each of water / underground / air is a column of BINS depth (or height) bins. The temperature and pressure of every bin are GAME ASSUMPTIONS loosely
  //    shaped like the real thing (a thermocline and hot vents in the sea, a geothermal gradient underground, the troposphere and stratosphere in the air).
  //    The whole column is shifted by the climate (a global warming or cooling in K), so a changing world moves the habitat.
  //  * A lineage's FUNDAMENTAL NICHE is a box in (T, P): the range its body tolerates. Its edges come from the lineage's EVOLVED traits (tolerance,
  //    metabolism, repair rate, dormancy depth) through the formulas below. The mapping trait -> box is a game assumption; the traits themselves evolve.
  //    Dormancy widens the box.
  //  * The engine uses the same box: an individual in a bin whose temperature or pressure lies outside its box takes damage every step, so the box
  //    decides survival. Individuals also move between bins (toward the bin that is best for them), so the REALIZED DISTRIBUTION is what the
  //    simulation produced, not what the box allows. Nothing here is a dummy and nothing is decorative.
  //  * The centre of the box does not evolve (only its widths), and cold stress is only modelled at the depth/height scale, not as a separate trait.
  const BINS = 10, TREF = 288.15, PREF = 101325;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lg = (n) => Math.log(n) / Math.LN10;
  const RES = { // food availability by bin (shallow / low is richest)
    water: [1, 0.9, 0.75, 0.6, 0.5, 0.4, 0.33, 0.28, 0.45, 0.55], underground: [1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.28, 0.22, 0.18, 0.15], air: [1, 0.8, 0.6, 0.45, 0.35, 0.28, 0.22, 0.18, 0.15, 0.12] };
  const BASE = {
    water: { T: [290, 284, 278, 276, 275, 275, 275, 276, 300, 340], P: Array.from({ length: BINS }, (_, k) => Math.pow(10, 5 + 3.05 * (k / 9))), note: '海面→深海。最後の2つは熱水噴出孔のそば' },
    underground: { T: Array.from({ length: BINS }, (_, k) => 285 + (k * (423 - 285)) / 9), P: Array.from({ length: BINS }, (_, k) => Math.pow(10, 5 + 3 * (k / 9))), note: '地表付近→地殻の深部（深いほど高温・高圧）' },
    air: { T: [288, 268, 248, 228, 217, 217, 217, 222, 227, 230], P: Array.from({ length: BINS }, (_, k) => 1.0e5 * Math.exp(-k * 0.45)), note: '地表→高度約30km（高いほど低圧。対流圏の上は気温が一定）' },
  };
  const REALM_IDS = ['water', 'land', 'underground', 'air'];
  // dK: climate shift (K) of the whole column, or per realm [water, land, underground, air]
  function profile(realmId, dK = 0) { const b = BASE[realmId]; if (!b) return null; return { T: b.T.map((t) => t + dK), P: b.P.slice(), res: RES[realmId].slice(), note: b.note }; }
  // Arrays for the engine: index = realm patch (0 water, 1 land, 2 underground, 3 air); land has no depth model (active false).
  function engineArrays(dKs = [0, 0, 0, 0]) {
    const k = Array.isArray(dKs) ? dKs : [dKs, dKs, dKs, dKs], T = [], P = [], res = [], act = [];
    REALM_IDS.forEach((id, i) => { const p = profile(id, k[i]); if (p) { T.push(p.T); P.push(p.P); res.push(p.res); act.push(true); } else { T.push(new Array(BINS).fill(TREF + k[i])); P.push(new Array(BINS).fill(PREF)); res.push(new Array(BINS).fill(1)); act.push(false); } });
    return { T, P, res, act };
  }
  // trait -> box. `lo` is any array-like indexed by the engine's trait indices; `ix` maps names to indices.
  function boxFromTraits(get, dormant, out) {
    const tol = get('tolerance'), met = clamp((get('metabolism') - 0.2) / 1.4, 0, 1), rep = get('repairRate'), dep = clamp((0.5 - get('dormancyDepth')) / 0.45, 0, 1);
    let heatW = 6 + 52 * tol * (1 - 0.35 * met), coldW = 6 + 42 * (0.55 * tol + 0.45 * met), pHi = 0.4 + 3.4 * (0.5 * tol + 0.3 * rep + 0.2 * (1 - met)), pLo = 0.3 + 1.8 * (0.5 * tol + 0.5 * (1 - met));
    if (dormant) { const f = 1.3 + 0.9 * dep; heatW *= f; coldW *= f; pHi *= f; pLo *= f; }
    out[0] = TREF - coldW; out[1] = TREF + heatW; out[2] = PREF * Math.pow(10, -pLo); out[3] = PREF * Math.pow(10, pHi); return out;
  }
  function makeBox(E) { // returns the function the engine calls: (traits, dormant, out) -> out = [Tlo, Thi, Pmin, Pmax]
    const ix = {}; for (const n of ['tolerance', 'metabolism', 'repairRate', 'dormancyDepth']) ix[n] = E.TRAITS.findIndex((l) => l[0] === n);
    return (lo, dormant, out) => boxFromTraits((n) => lo[ix[n]], dormant, out);
  }
  // damage per step an individual with this box takes in a bin (the same formula the engine applies)
  const T_RATE = 0.003, P_RATE = 0.05;
  function mismatch(box, T, P) { return { dT: Math.max(0, T - box[1], box[0] - T), dPhi: Math.max(0, lg(P / box[3])), dPlo: Math.max(0, lg(box[2] / P)) }; }
  function damagePerStep(box, T, P) { const m = mismatch(box, T, P); return T_RATE * m.dT + P_RATE * (m.dPhi + m.dPlo); }
  // Suitability of each bin for a box: 1 = inside the box, falling to 0 where it would take 0.15 damage per step. Also the contiguous habitable runs.
  function suitability(box, prof) { return prof.T.map((T, k) => clamp(1 - damagePerStep(box, T, prof.P[k]) / 0.15, 0, 1)); }
  function segments(suit, level = 0.75) { const out = []; let a = null; suit.forEach((s, k) => { if (s >= level) { if (a === null) a = k; } else if (a !== null) { out.push([a, k - 1]); a = null; } }); if (a !== null) out.push([a, suit.length - 1]); return out; }
  return { BINS, TREF, PREF, REALM_IDS, RES, BASE, T_RATE, P_RATE, profile, engineArrays, boxFromTraits, makeBox, mismatch, damagePerStep, suitability, segments };
});
