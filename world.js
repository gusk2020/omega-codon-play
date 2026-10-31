(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./civilization'), require('./catastrophe'), require('./history4')); else root.OmegaWorld = factory(root.OmegaCiv, root.OmegaCatastrophe, root.OmegaHistory4);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CIV, CAT, H4) {
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
  function solarAnomaly(yearsBP, par = PAR, baseBP = START_YEARS_BP) {
    const dF = par.absorbed * (luminosity(-yearsBP) - luminosity(-baseBP)); // luminosity(-BP) gives L at BP years in the past
    return dF * par.sensitivity * (1 - par.buffered);
  }
  // Long history (Stage 3.0): the weathering buffer weakens with time (a GAME ASSUMPTION; the brightening of the Sun itself is the science), so the later eras
  // are harsher even before the great catastrophes (catastrophe.js) are added. Years since the start. Not used by worlds made without `catastrophe: true`.
  const MAX_YEARS = 3.99e9;
  function bufferAt(years) { return years <= 1e9 ? 0.78 : years <= 2e9 ? 0.78 - 0.08 * ((years - 1e9) / 1e9) : years <= 3e9 ? 0.70 - 0.15 * ((years - 2e9) / 1e9) : 0.55 - 0.05 * Math.min(1, (years - 3e9) / 1e9); }
  function create(seed, cfg = {}) {
    const rng = (() => { let a = ((seed * 2654435761) ^ 0x7F4A7C15) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const w = { years: 0, rng, par: { ...PAR, ...(cfg.par || {}) }, civ: CIV.create(seed, { noise: cfg.noise !== false, par: cfg.catastrophe === true ? { stockStressByTech: true, lowTechSlack: true, ...(cfg.civPar || {}) } : cfg.civPar }), events: [], impacts: 0, volcs: 0, lastShockYears: 0, biosphereResetYears: 0, pendingDisaster: 0 };
    w.civ.lastEndOrStart = 0; w.light = cfg.light === true; w.civ.light = w.light; // Stage 5.1: longer leaps while a civilisation or its residue lasts (games created from 5.1 only)
    if (cfg.catastrophe === true) {
      w.long = true; w.cat = CAT.schedule(seed); w.ms = CAT.milestones(w.cat); w.msIdx = 0; w.pendingMs = []; w.maxYears = MAX_YEARS;
      // `startYears` is a TEST-ONLY shortcut (not reachable from the game screens): begin the world later in its history so that a test can reach an era quickly.
      if (cfg.startYears) { w.years = cfg.startYears; w.civ.years = cfg.startYears; w.civ.lastEndOrStart = cfg.startYears; while (w.msIdx < w.ms.length && w.ms[w.msIdx].t <= w.years) w.msIdx++; }
    }
    if (cfg.history4 === true) { // Stage 4.0: from the first cells (3.8 billion years ago) through the present into a branching future
      w.h4 = true; w.long = true; w.startBP = H4.ORIGIN_BP; w.presentYears = H4.ORIGIN_BP;
      w.par = { ...w.par, impactRate: 1 / 3e8, volcRate: 1 / 1.5e8, quietMax: 1e7 }; // the background rate of big impacts and eruptions is set lower here: the great extinctions of history are scheduled separately
      w.cat = H4.crises().concat(CAT.schedule(seed, { offset: w.presentYears })); w.ms = CAT.milestones(w.cat); w.msIdx = 0; w.pendingMs = []; w.maxYears = w.presentYears + MAX_YEARS;
      w.hEv = H4.EVENTS.map((e) => ({ ...e, t: H4.ORIGIN_BP - e.bp })).filter((e) => e.kind !== 'start').sort((a, b) => a.t - b.t); w.hIdx = 0; w.humanStarted = false;
      if (cfg.startYears) { w.years = cfg.startYears; w.civ.years = cfg.startYears; w.civ.lastEndOrStart = cfg.startYears; while (w.msIdx < w.ms.length && w.ms[w.msIdx].t <= w.years) w.msIdx++; while (w.hIdx < w.hEv.length && w.hEv[w.hIdx].t <= w.years) w.hIdx++; if (bpOf(w) <= H4.FARMING_BP) w.humanStarted = true; } // TEST-ONLY shortcut: begin later in history
    }
    return w;
  }
  const bpOf = (w) => (w.startBP !== undefined ? w.startBP : START_YEARS_BP) - w.years;
  const bp = bpOf;
  // the ambient conditions at this moment (before the civilisation's own pressures)
  function ambient(w) {
    const par = w.long ? { ...w.par, buffered: bufferAt(w.h4 ? Math.max(0, w.years - w.presentYears) : w.years) } : w.par, warmCiv = 1.6 * Math.min(2, w.civ.residue.pollution);
    const warmSolar = w.h4 ? (bp(w) > 0 ? H4.climate(bp(w)) : solarAnomaly(bp(w), par, 0)) : solarAnomaly(bp(w), par); // Stage 4.0: the past follows the climate curve (history4.js); the future follows the brightening Sun from the present
    let cat = null, meanRes = 1, meanDT = 0; if (w.long) { cat = CAT.effectsAt(w.cat, w.years); meanRes = (cat.res[0] + cat.res[1] + cat.res[2] + cat.res[3]) / 4; meanDT = (cat.dT[0] + cat.dT[1] + cat.dT[2] + cat.dT[3]) / 4; }
    const warm = warmSolar + warmCiv + meanDT, base = warmSolar + warmCiv; // `base` is the climate the arena feels everywhere; the catastrophe's own effect reaches it per realm (game.js)
    const prodOf = (x) => clamp(1 + 0.03 * Math.min(x, 3) - 0.07 * Math.max(0, x - 3) - 0.04 * Math.max(0, -x - 2), 0.2, 1.15);
    const prod = prodOf(warm) * meanRes;
    return { warm, warmSolar, warmCiv, prod, thermal: 0.035 * Math.max(0, base) + 0.03 * Math.max(0, -base), resource: w.long ? prodOf(base) : prodOf(warm), cat, buffered: par.buffered };
  }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  // The longest leap that is safe now. `ctx`: { cog, biomass, activity } where activity (0..1) says that something is going on in the arena.
  function safeLeap(w, ctx) {
    const a = ambient(w), c = { cog: ctx.cog, biomass: ctx.biomass, prod: a.prod, warm: a.warm };
    let m = Math.min(CIV.maxStep(w.civ, c), 0.25 / (w.par.impactRate + w.par.volcRate), w.long ? w.par.quietMax * 3 : w.par.quietMax);
    // the climate: keep the temperature drift per leap under 0.4 K
    const dT = w.h4 ? Math.abs((bp(w) > 1e6 ? H4.climate(bp(w) - 1e6) : solarAnomaly(bp(w) - 1e6, w.par, 0)) - (bp(w) > 0 ? H4.climate(bp(w)) : solarAnomaly(bp(w), w.par, 0))) / 1e6 : Math.abs(solarAnomaly(bp(w) - 1e6, w.par) - solarAnomaly(bp(w), w.par)) / 1e6; if (dT > 0) m = Math.min(m, 0.4 / dT);
    if (w.h4) { const he = w.hEv[w.hIdx]; if (he) m = Math.min(m, Math.max(1, he.t - w.years)); } // never jump over a dated event of the history
    if (w.civ.civ) m = Math.min(m, Math.max(w.long && w.civ.civ.T < 3 ? 40000 : 4000, w.long && w.light ? Math.min(2e5, 0.02 * (w.years - w.civ.civ.born)) : 0)); // the cap grows with the civilisation's age (Stage 5.0): a society that has lasted millions of years no longer holds the world to 4000-year steps // while a civilisation is alive, leaps stay short: it changes within thousands of years (a society that has not reached industry changes more slowly)
    if (w.long) {
      // never jump over a warning, an onset or an aftermath report: the leap ends exactly at the next milestone
      const nm = w.ms[w.msIdx]; if (nm) m = Math.min(m, Math.max(1, nm.t - w.years));
      // while a catastrophe is unfolding the leaps start short and grow, so the fast part of the change is resolved
      for (const c of w.cat) { const tau = w.years - c.onset; if (tau >= 0 && tau < 3 * c.tauR) m = Math.min(m, Math.max(500, 0.25 * tau)); }
      m = Math.min(m, Math.max(1, w.maxYears - w.years));
    }
    let out = Math.max(w.civ.civ ? 200 : w.par.quietMin, m);
    if (w.long) { const nm = w.ms[w.msIdx]; if (nm) out = Math.min(out, Math.max(1, nm.t - w.years)); out = Math.min(out, Math.max(1, w.maxYears - w.years)); if (w.h4) { const he = w.hEv[w.hIdx]; if (he) out = Math.min(out, Math.max(1, he.t - w.years)); } } // the floor never carries a leap past a milestone
    return out;
  }
  // advance the world by h years (h <= safeLeap); returns events [{kind,text,...}] and sets pendingDisaster when a catastrophe falls inside this span
  function advance(w, h, ctx) {
    const ev = [], a0 = ambient(w);
    // catastrophes: Poisson in this span. A fall-in-the-span is applied at its end as a disturbance of the arena.
    const ni = poisson(w.rng, w.par.impactRate * h), nv = poisson(w.rng, w.par.volcRate * h);
    const c = { cog: ctx.cog, biomass: ctx.biomass, prod: a0.prod, warm: a0.warm };
    if (w.h4) { const b0 = bp(w); c.noEmerge = b0 > 0; c.protect = b0 > 0 && !!w.civ.civ; } // before the present only the first, historical civilisation exists, and it is not left to chance
    const sub = CIV.step(w.civ, h, c); for (const e of sub) ev.push(e);
    const y0 = w.years; w.years += h;
    if (w.long) {
      const pulse = CAT.pulsesBetween(w.cat, y0, w.years); if (pulse > 0) w.pendingDisaster = Math.max(w.pendingDisaster, pulse);
      while (w.msIdx < w.ms.length && w.ms[w.msIdx].t <= w.years + 1e-3) { const m = w.ms[w.msIdx++]; w.pendingMs.push(m); ev.push(milestoneEvent(w, m)); }
    }
    if (w.h4) while (w.hIdx < w.hEv.length && w.hEv[w.hIdx].t <= w.years + 1e-3) {
      const e = w.hEv[w.hIdx++];
      if (e.id === 'farming') { if (!w.civ.civ && !w.humanStarted) ev.push(CIV.forceStart(w.civ, ctx.cog, '農耕が始まり、人類の文明が生まれた（最初の高度な文明は現生人類のもの、という設定）')); w.humanStarted = true; }
      else if (e.id === 'present') {
        if (!w.civ.civ) { ev.push(CIV.forceStart(w.civ, ctx.cog, '人類の文明（現代）')); w.humanStarted = true; }
        const cv = w.civ.civ; if (cv) { cv.T = Math.max(cv.T, 6.2); cv.N = Math.max(cv.N, 0.6); cv.S = Math.max(cv.S, 0.7); w.civ.residue.pollution = Math.max(w.civ.residue.pollution, 0.4); } // the modern state is part of the record, not an outcome of the model
        w.pendingMs.push({ kind: 'present', cpKind: 'present', t: w.years }); ev.push({ kind: 'history', sub: 'present', text: `${e.name}：${e.text}` });
      } else ev.push({ kind: 'history', sub: e.id, text: `${e.name}：${e.text}` });
    }
    if (ni > 0) { w.impacts += ni; w.pendingDisaster = Math.max(w.pendingDisaster, 1.6); ev.push({ kind: 'impact', text: `巨大な隕石衝突があった（ゲーム上の仮定：発生率は大まかな目安）` }); }
    if (nv > 0) { w.volcs += nv; w.pendingDisaster = Math.max(w.pendingDisaster, 1.0); ev.push({ kind: 'volcanic', text: `巨大火成活動（大量の溶岩と火山ガス）があった` }); }
    return ev;
  }
  const CATSTAGE_JA = ['早期の予告', '更新された予告', '直前の警告'];
  function milestoneEvent(w, m) {
    const c = w.cat.find((x) => x.id === m.cat);
    if (c.historical) return m.kind === 'onset' ? { kind: 'cat-onset', cat: c.id, text: `史実：${c.label}が始まった（外部条件：${CAT.TYPES[c.type].name}）。生き物がどうなるかは決まっていない` } : { kind: 'cat-aftermath', cat: c.id, text: `史実：${c.label}から${CIV.fmtYears(w.years - c.onset)}後` };
    if (m.kind === 'warning') { const f = CAT.forecast(c, m.stageIndex, w.years); return { kind: 'cat-warning', cat: c.id, stage: m.stageIndex, text: `⚠ 大災厄の${CATSTAGE_JA[m.stageIndex]}（${c.label}）：${f.kindNames.join('＋')}、規模「${f.scaleClass}」、およそ${CIV.fmtYears(f.remainingYears)}後（誤差の幅 約${CIV.fmtYears(f.windowYears)}）` }; }
    if (m.kind === 'onset') return { kind: 'cat-onset', cat: c.id, text: `大災厄が始まった（${c.label}）：${c.parts.map((k) => CAT.TYPES[k].name).join('＋')}、規模「${CAT.classOf(c.scale)}」。${c.recoverable ? '生態系が回復する余地のある災厄です' : '元に戻らない環境の変化をともないます'}` };
    return { kind: 'cat-aftermath', cat: c.id, text: `大災厄（${c.label}）の${CIV.fmtYears(w.years - c.onset)}後` };
  }
  // the forecasts that stand now: for every catastrophe warned about and not yet begun, the latest stage's forecast
  function activeForecasts(w) {
    if (!w.long) return []; const out = [];
    for (const c of w.cat) { if (w.years >= c.onset) continue; let st = -1; for (const m of w.ms) if (m.cat === c.id && m.kind === 'warning' && m.t <= w.years + 1e-3) st = m.stageIndex; if (st >= 0) out.push(CAT.forecast(c, st, w.years)); }
    return out;
  }
  // every catastrophe's state as the player may know it (kind, size and onset are revealed only when it has begun)
  function catStatus(w) {
    if (!w.long) return []; return w.cat.map((c) => { const began = w.years >= c.onset, tau = w.years - c.onset; return { id: c.id, era: c.era, label: c.label, setting: c.setting, state: !began ? (activeForecasts(w).some((f) => f.cat === c.id) ? 'warned' : 'future') : tau < 2e5 ? 'active' : tau < 3 * c.tauR ? 'aftermath' : 'past',
      onset: began ? c.onset : null, kinds: began ? c.parts : null, kindNames: began ? c.parts.map((k) => CAT.TYPES[k].name) : null, scale: began ? c.scale : null, scaleClass: began ? CAT.classOf(c.scale) : null, recoverable: began ? c.recoverable : null, hypothesis: began ? c.parts.includes('lunar') : null }; });
  }
  const h4Conditions = (w) => (w.h4 ? H4.conditions(bp(w)) : null);
  const catEffects = (w) => (w.long ? CAT.effectsAt(w.cat, w.years) : null);
  function poisson(rng, lam) { if (lam <= 0) return 0; if (lam > 30) return Math.round(lam); const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 80); return k - 1; }
  // Stage 5.2: years written down to the 10,000-year digit (5億1234万年), so that a slowly moving clock visibly moves. Display only: nothing in the simulation reads this.
  function jaYears(y) { y = Math.abs(y); if (y < 1e4) return `${Math.round(y)}年`; const man = Math.floor(y / 1e4), oku = Math.floor(man / 1e4), rem = man % 1e4; return oku > 0 ? (rem > 0 ? `${oku}億${rem}万年` : `${oku}億年`) : `${man}万年`; }
  function formatBP(w) { const y = bp(w); if (y >= 1) return `${jaYears(y)}前`; return y > -1 ? '現代' : `いまから${jaYears(-y)}後`; }
  return { DAYS_PER_STEP, YEARS_PER_STEP, START_YEARS_BP, MAX_YEARS, PAR, bufferAt, luminosity, solarAnomaly, create, ambient, safeLeap, advance, bp, formatBP, jaYears, activeForecasts, catStatus, catEffects, h4Conditions, h4: H4, civ: CIV, cat: CAT };
});
