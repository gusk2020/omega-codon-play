(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./civilization')); else root.OmegaWorld = factory(root.OmegaCiv);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CIV) {
  'use strict';
  // The world clock and everything on it that is slow (Stage 2.0): the Sun, the climate it drives, rare catastrophes, and the civilisations (civilization.js).
  //
  // TIME. The arena (the detailed individuals) runs in engine STEPS. In the new time base one step is TAKEN TO BE 30 DAYS (the founders live ~25 steps, about two
  // years: a small animal). Individuals and generations are counted in steps and are only ever advanced by steps actually simulated. The WORLD clock, in years,
  // is advanced two ways: by the steps simulated (steps * 30/365.25 years each) and by LEAPS, in which only the world-scale models here advance, with an adaptive
  // step (`maxStep`), and the arena is carried across by measured rates (see game.js). So years can run far ahead of simulated generations. The game shows both and
  // never counts the skipped generations as evolution.
  //
  // CLIMATE. Solar luminosity grows slowly (standard solar-evolution result, ~+1% per 110 Myr). How much of that reaches surface temperature is the uncertain
  // part: the carbonate-silicate weathering thermostat buffers it for a long time, and its limits are debated. The game ASSUMES a fixed buffered share
  // (`buffered`) and a global-mean sensitivity; it does NOT assert that Earth's life must end at any particular future date.
  const DAYS_PER_STEP = 30, YEARS_PER_STEP = DAYS_PER_STEP / 365.25;
  const START_YEARS_BP = 66.043e6;
  const SUN_AGE_NOW = 4.57e9;
  const PAR = {
    sensitivity: 0.8,      // K per W/m2 of forcing, no feedback beyond the buffer below (game assumption; real range roughly 0.3-1.2)
    buffered: 0.78,        // share of the extra solar forcing removed by long-term weathering feedbacks (game assumption)
    absorbed: 240,         // W/m2 absorbed by the Earth now (standard figure)
    impactRate: 1 / 9e7,   // large impacts per year able to disturb the whole biosphere (rough scale only)
    volcRate: 1 / 3.5e7,   // large igneous province eruptions per year (rough scale only)
    quietMin: 2000,        // shortest leap when nothing is happening (years)
    quietMax: 3e6,         // longest single leap (years)
  };
  function luminosity(yearsFromNow) { const age = SUN_AGE_NOW + yearsFromNow; return 1 / (1 + 0.4 * (1 - age / SUN_AGE_NOW)); } // L / L_now, standard approximation
  // yearsBP: years before present (negative = future). Temperature offset (K) relative to the world's starting year.
  function solarAnomaly(yearsBP, par = PAR) {
    const dF = par.absorbed * (luminosity(-yearsBP) - luminosity(-START_YEARS_BP)); // luminosity(-BP) gives L at BP years in the past
    return dF * par.sensitivity * (1 - par.buffered);
  }
  function create(seed, cfg = {}) {
    const rng = (() => { let a = ((seed * 2654435761) ^ 0x7F4A7C15) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const w = { years: 0, rng, par: { ...PAR, ...(cfg.par || {}) }, civ: CIV.create(seed, { noise: cfg.noise !== false, par: cfg.civPar }), events: [], impacts: 0, volcs: 0, lastShockYears: 0, biosphereResetYears: 0, pendingDisaster: 0 };
    w.civ.lastEndOrStart = 0; return w;
  }
  const bp = (w) => START_YEARS_BP - w.years;
  // the ambient conditions at this moment (before the civilisation's own pressures)
  function ambient(w) {
    const warmSolar = solarAnomaly(bp(w), w.par), warmCiv = 1.6 * Math.min(2, w.civ.residue.pollution);
    const warm = warmSolar + warmCiv;
    const prod = clamp(1 + 0.03 * Math.min(warm, 3) - 0.07 * Math.max(0, warm - 3) - 0.04 * Math.max(0, -warm - 2), 0.2, 1.15);
    return { warm, warmSolar, warmCiv, prod, thermal: 0.035 * Math.max(0, warm) + 0.03 * Math.max(0, -warm), resource: prod };
  }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  // The longest leap that is safe now. `ctx`: { cog, biomass, activity } where activity (0..1) says that something is going on in the arena.
  function safeLeap(w, ctx) {
    const a = ambient(w), c = { cog: ctx.cog, biomass: ctx.biomass, prod: a.prod, warm: a.warm };
    let m = Math.min(CIV.maxStep(w.civ, c), 0.25 / (w.par.impactRate + w.par.volcRate), w.par.quietMax);
    // the climate: keep the temperature drift per leap under 0.4 K
    const dT = Math.abs(solarAnomaly(bp(w) - 1e6, w.par) - solarAnomaly(bp(w), w.par)) / 1e6; if (dT > 0) m = Math.min(m, 0.4 / dT);
    if (w.civ.civ) m = Math.min(m, 4000);              // while a civilisation is alive, leaps stay short: it changes within thousands of years
    return Math.max(w.civ.civ ? 200 : w.par.quietMin, m);
  }
  // advance the world by h years (h <= safeLeap); returns events [{kind,text,...}] and sets pendingDisaster when a catastrophe falls inside this span
  function advance(w, h, ctx) {
    const ev = [], a0 = ambient(w);
    // catastrophes: Poisson in this span. A fall-in-the-span is applied at its end as a disturbance of the arena.
    const ni = poisson(w.rng, w.par.impactRate * h), nv = poisson(w.rng, w.par.volcRate * h);
    const c = { cog: ctx.cog, biomass: ctx.biomass, prod: a0.prod, warm: a0.warm };
    const sub = CIV.step(w.civ, h, c); for (const e of sub) ev.push(e);
    w.years += h;
    if (ni > 0) { w.impacts += ni; w.pendingDisaster = Math.max(w.pendingDisaster, 1.6); ev.push({ kind: 'impact', text: `巨大な隕石衝突があった（ゲーム上の仮定：発生率は大まかな目安）` }); }
    if (nv > 0) { w.volcs += nv; w.pendingDisaster = Math.max(w.pendingDisaster, 1.0); ev.push({ kind: 'volcanic', text: `巨大火成活動（大量の溶岩と火山ガス）があった` }); }
    return ev;
  }
  function poisson(rng, lam) { if (lam <= 0) return 0; if (lam > 30) return Math.round(lam); const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 80); return k - 1; }
  function formatBP(w) { const y = bp(w); if (y >= 1e8) return `${(y / 1e8).toFixed(2)}億年前`; if (y >= 1e4) return `${(y / 1e4).toFixed(y >= 1e7 ? 0 : 1)}万年前`.replace(/^(\d+)\.0万/, '$1万'); if (y > 0) return `${Math.round(y)}年前`; return `いまから約${CIV.fmtYears(-y)}後`; }
  return { DAYS_PER_STEP, YEARS_PER_STEP, START_YEARS_BP, PAR, luminosity, solarAnomaly, create, ambient, safeLeap, advance, bp, formatBP, civ: CIV };
});
