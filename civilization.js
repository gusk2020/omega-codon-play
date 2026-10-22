(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaCiv = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Intelligent civilisation, as a coarse world-scale model (Stage 2.0).
  //
  //  * A civilisation here is NOT a creature of the arena. It is a few state variables (population N, technology T, social stability S) that evolve
  //    on the WORLD clock, in years, with an adaptive time step. It reaches the arena only through pressures: habitat conversion, capture, harm,
  //    barriers, subsidies (see `effects`). Every number below is a GAME ASSUMPTION; nothing is calibrated against history. Where a rough Earth figure
  //    exists it is only a scale, and the text says so.
  //  * It is never scheduled. It appears with a hazard that depends on the biosphere's cognitive capacity, the climate, the resources and what an earlier
  //    civilisation left behind; it rises, converts habitat, can fall (stress from its own pollution, crowding, wars, running out of accessible stock),
  //    and what it did persists after it is gone: pollution decays over hundreds of thousands of years, the mineable stock does not come back,
  //    and ruins and knowledge give the next one a head start.
  //  * It is not an all-powerful enemy. Its means are gated by technology, paid for out of a budget that also keeps society together, and its stance
  //    towards a lineage (ignore / use / coexist / hostile) is worked out from what that lineage is and does.
  // Time unit inside the equations: 1 kyr = 1000 years. Rates are per kyr.
  const STAGES = ['採集・狩猟', '農耕', '都市・金属', '工業化前夜', '工業', '電子・情報', '自動化・生物工学', '惑星規模の改変', '大規模環境制御'];
  const PAR = {
    // emergence (per year, at full readiness). Earth produced one in ~4.5 Gyr; the game assumes it is much commoner so that the player meets several.
    lambdaEmerge: 2.6e-8, cogRef: 0.5, cogScale: 0.08, recoveryYears: 1.5e7,
    // growth
    rN: 0.6, Nmin: 0.002, N0: 0.01, gT: 0.55, TmaxBase: 10, stockUse: 0.006, stockFloor: 0.02,
    // stability
    sRecover: 0.5, collapseS: 0.18, shockRate: 0.2, shockMin: 0.1, shockMax: 0.35, warCost: 0.5,
    // environment load (pollution + disturbance), its persistence, and how conversion relaxes and fades
    eRate: 0.12, eDecayKyr: 300, convTau: 2, convFadeKyr: 60,
    // what happens at a collapse
    collapseN: [0.05, 0.4], collapseDecay: 0.7, collapseT: [0.3, 0.6], legacyGain: 0.12,
  };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sat = (x) => x / (1 + x);
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const poisson = (rng, lam) => { if (lam <= 0) return 0; if (lam > 30) return Math.round(lam); const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 80); return k - 1; };

  // The world state this module owns. `residue` is what outlives any one civilisation.
  function create(seed, opts = {}) {
    return { rng: mulberry((seed * 2246822519) ^ 0x2C1B3C6D), noise: opts.noise !== false, civ: null, history: [],
      residue: { pollution: 0, conv: [0, 0, 0, 0], stock: 1, legacy: 0 }, lastEnd: -Infinity, count: 0, years: 0, par: { ...PAR, ...(opts.par || {}) } };
  }
  // ---- the ODE of one civilisation plus the residue it feeds -----------------------------------------------------------------------------------
  // y = [N, T, S, E, conv0..3, stock].  `env` = { prod, war }: prod is how productive the land is (climate, biosphere), war the share of the budget spent on conflict.
  function carrying(y, env) { const T = y[1], S = y[2], E = y[3]; return Math.max(0.02, (0.2 + 0.8 * sat(T / 2.5)) * env.prod * (1 - 0.6 * clamp(E / 2, 0, 1)) * (0.6 + 0.4 * S)); }
  function tmax(stock, par) { return par.TmaxBase * Math.sqrt(clamp(stock, par.stockFloor, 1)); }
  function deriv(y, env, par, legacy) {
    const [N, T, S, E] = y, stock = y[8], Kc = carrying(y, env), TM = tmax(stock, par);
    const dN = par.rN * N * (1 - N / Kc) * (0.5 + 0.5 * S);
    const dT = par.gT * (1 + 1.2 * legacy) * (0.3 + 0.7 * S) * Math.sqrt(N / (0.05 + N)) * Math.max(0, 1 - T / TM) * (1 - 0.5 * env.war);
    const heavy = Math.max(0, T - 2.5);
    const dE = par.eRate * heavy * N - E / par.eDecayKyr;
    const stress = 0.6 * Math.max(0, E - 0.6) + 0.5 * Math.max(0, N / Kc - 0.9) + par.warCost * env.war + 0.35 * Math.max(0, T - 6) * (1 - S * 0.3) + 0.4 * Math.max(0, 1 - sat(stock * 3) - 0.0);
    const dS = par.sRecover * (1 - S) * (S > 0 ? 1 : 0) - stress * 0.5 * S;
    const tgt = [clamp(0.12 * T * Math.sqrt(N / 0.3), 0, 0.95), clamp(0.07 * Math.max(0, T - 2), 0, 0.8), clamp(0.06 * Math.max(0, T - 3), 0, 0.8), clamp(0.07 * Math.max(0, T - 2), 0, 0.85)];
    const dc = [0, 1, 2, 3].map((r) => (tgt[r] > y[4 + r] ? (tgt[r] - y[4 + r]) / par.convTau : -y[4 + r] / par.convFadeKyr));
    const dStock = -par.stockUse * heavy * N * 1.0;
    return [dN, dT, dS, dE, dc[0], dc[1], dc[2], dc[3], dStock];
  }
  function stateVec(w) { const c = w.civ, r = w.residue; return [c ? c.N : 0, c ? c.T : 0, c ? c.S : 1, r.pollution, r.conv[0], r.conv[1], r.conv[2], r.conv[3], r.stock]; }
  function putState(w, y) {
    const c = w.civ, r = w.residue; if (c) { c.N = Math.max(0, y[0]); c.T = clamp(y[1], 0, 10); c.S = clamp(y[2], 0, 1); }
    r.pollution = Math.max(0, y[3]); for (let k = 0; k < 4; k++) r.conv[k] = clamp(y[4 + k], 0, 0.97); r.stock = clamp(y[8], 0, 1);
  }
  const SCALE = [0.05, 0.5, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05, 0.1];
  const addv = (a, b, k) => a.map((v, i) => v + k * b[i]);
  function heun(y, env, par, legacy, h) { const f1 = deriv(y, env, par, legacy), y1 = addv(y, f1, h), f2 = deriv(y1, env, par, legacy); return y.map((v, i) => v + 0.5 * h * (f1[i] + f2[i])); }
  // One advance of h years with step-doubling error control: the step is halved until a full Heun step and two half steps agree.
  function integrate(w, env, hYears, tol) {
    const par = w.par, legacy = w.residue.legacy; let remaining = hYears / 1000, used = 0, subs = 0, y = stateVec(w), hk = remaining;
    while (remaining > 1e-9 && subs < 4000) {
      let h = Math.min(hk, remaining), full, half;
      for (let tries = 0; tries < 30; tries++) {
        full = heun(y, env, par, legacy, h); half = heun(heun(y, env, par, legacy, h / 2), env, par, legacy, h / 2);
        let err = 0; for (let i = 0; i < y.length; i++) err = Math.max(err, Math.abs(full[i] - half[i]) / SCALE[i]);
        if (err <= tol || h < 1e-5) break; h /= 2;
      }
      y = half; remaining -= h; used += h; subs++; hk = h * 1.6; if (w.civ) { w.civ.N = Math.max(0, y[0]); }
      y[0] = Math.max(0, y[0]); y[8] = clamp(y[8], 0, 1);
    }
    putState(w, y); return { substeps: subs, kyr: used };
  }
  // ---- stochastic parts: shocks, collapse, extinction, emergence ------------------------------------------------------------------------------
  function startCiv(w, years, cogExcess) {
    w.count++; const par = w.par, r = w.residue;
    w.civ = { id: w.count, born: years, N: par.N0, T: 0.2, S: 0.9, peakN: par.N0, peakT: 0.2, collapses: 0, phase: 'rise', stance: {}, known: {}, war: 0, cogAtBirth: cogExcess, legacyAtBirth: r.legacy, stockAtBirth: r.stock, attackTaken: 0 };
    return { kind: 'civ-emerge', civ: w.civ.id, text: `知性文明が現れた（第${w.count}の文明）。前の文明が残した影響：資源の残り${Math.round(r.stock * 100)}%、遺産${Math.round(r.legacy * 100)}%、環境負荷${r.pollution.toFixed(2)}` };
  }
  function emergenceRate(w, ctx) { // per year
    const par = w.par, r = w.residue;
    const recov = 1 - Math.exp(-Math.max(0, (w.years - w.lastEndOrStart)) / par.recoveryYears);
    const cog = 1 / (1 + Math.exp(-(ctx.cog - par.cogRef) / par.cogScale));
    const climate = clamp(1 - Math.abs(ctx.warm) / 12, 0, 1), res = clamp(ctx.prod, 0, 1.2) / 1.2, clean = clamp(1 - r.pollution / 1.2, 0, 1), bio = clamp(ctx.biomass, 0, 1);
    return par.lambdaEmerge * recov * cog * climate * res * clean * bio * (1 + 0.8 * r.legacy);
  }
  // advance the whole civilisation side by h years (called by the world with a bounded h). Returns events.
  function step(w, h, ctx) {
    const ev = [], par = w.par; w.years += h;
    if (w.lastEndOrStart === undefined) w.lastEndOrStart = 0;
    const env = { prod: ctx.prod * (1 - 0.35 * (w.residue.conv[0] > 0.5 ? w.residue.conv[0] - 0.5 : 0)), war: w.civ ? w.civ.war : 0 };
    if (!w.civ) {
      // the residue still evolves (pollution fades, conversion is reclaimed); nothing to integrate while there is none
      const r = w.residue; if (r.pollution > 1e-6 || r.conv[0] > 1e-6 || r.conv[1] > 1e-6 || r.conv[2] > 1e-6 || r.conv[3] > 1e-6) integrate(w, env, h, 0.05);
      const lam = emergenceRate(w, ctx), p = 1 - Math.exp(-lam * h), u = w.rng();
      if (u < p) ev.push(startCiv(w, w.years, ctx.cog));
      return ev;
    }
    const c = w.civ; integrate(w, env, h, 0.05); c.peakN = Math.max(c.peakN, c.N); c.peakT = Math.max(c.peakT, c.T);
    if (w.noise) { const n = poisson(w.rng, par.shockRate * (h / 1000) * (0.5 + c.T / 6)); for (let i = 0; i < n; i++) { const d = par.shockMin + (par.shockMax - par.shockMin) * w.rng(); c.S = Math.max(0, c.S - d); c.N *= 1 - 0.12 * w.rng(); } }
    if (c.S < par.collapseS && c.N > par.Nmin) {
      const fN = (par.collapseN[0] + (par.collapseN[1] - par.collapseN[0]) * w.rng()) * Math.pow(par.collapseDecay, c.collapses), fT = par.collapseT[0] + (par.collapseT[1] - par.collapseT[0]) * w.rng(), tBefore = c.T;
      c.N *= fN; c.T *= fT; c.S = 0.55; c.collapses++; c.phase = 'decline'; c.war = 0;
      ev.push({ kind: 'civ-collapse', civ: c.id, text: `文明が崩壊した（技術段階${tBefore.toFixed(1)}→${c.T.toFixed(1)}、人口は${Math.round(fN * 100)}%に）。原因の主なもの：${collapseReason(w, ctx)}` });
    }
    if (c.phase === 'decline' && c.S > 0.8 && c.N > 0.5 * c.peakN * 0.1) c.phase = 'rise';
    if (c.phase === 'rise' && c.T >= 4 && c.N > 0.2) c.phase = 'peak';
    if (c.N < par.Nmin) {
      const r = w.residue; r.legacy = clamp(r.legacy + par.legacyGain * c.peakT / 10, 0, 1);
      w.history.push({ id: c.id, born: c.born, ended: w.years, peakT: c.peakT, peakN: c.peakN, collapses: c.collapses, residue: { pollution: r.pollution, stock: r.stock, conv: r.conv.slice() } });
      ev.push({ kind: 'civ-end', civ: c.id, text: `文明が滅びた（続いた期間 約${fmtYears(w.years - c.born)}、最高の技術段階 ${c.peakT.toFixed(1)}）。環境への影響は残る：環境負荷${r.pollution.toFixed(2)}、資源の残り${Math.round(r.stock * 100)}%` });
      w.lastEnd = w.years; w.lastEndOrStart = w.years; w.civ = null;
    }
    return ev;
  }
  function collapseReason(w, ctx) {
    const c = w.civ, r = w.residue, par = w.par, y = stateVec(w), Kc = carrying(y, { prod: ctx.prod, war: c.war });
    const parts = [['環境負荷（汚染・環境の悪化）', 0.6 * Math.max(0, r.pollution - 0.6)], ['人口過密', 0.5 * Math.max(0, c.N / Kc - 0.9)], ['対立への支出', par.warCost * c.war], ['高度技術の維持負担', 0.35 * Math.max(0, c.T - 6)], ['使える資源の枯渇', 0.4 * Math.max(0, 1 - sat(r.stock * 3))]].sort((a, b) => b[1] - a[1]);
    return parts[0][1] > 0.02 ? parts[0][0] : '内部の不安定（突発的な戦乱・疫病など）';
  }
  function fmtYears(y) { if (y < 1000) return Math.round(y) + '年'; if (y < 1e6) return Math.round(y / 100) / 10 + '千年'.replace('千年', '千年'); if (y < 1e8) return (y / 1e4).toFixed(y < 1e7 ? 1 : 0) + '万年'; return (y / 1e8).toFixed(2) + '億年'; }
  // ---- how long a step may be, so that nothing important is jumped over -----------------------------------------------------------------------
  // Returns the longest step (in years) over which the civilisation side changes by a bounded amount and the expected number of random events is small.
  function maxStep(w, ctx) {
    const par = w.par, c = w.civ;
    if (!c) { const lam = emergenceRate(w, ctx); const byEmerge = lam > 0 ? 0.3 / lam : Infinity; const resid = w.residue.pollution > 0.05 || w.residue.conv.some((v) => v > 0.03) ? 20000 : Infinity; return Math.min(byEmerge, resid); }
    const y = stateVec(w), d = deriv(y, { prod: ctx.prod, war: c.war }, par, w.residue.legacy); let m = Infinity;
    for (let i = 0; i < 4; i++) { const sc = SCALE[i] * 3; if (Math.abs(d[i]) > 1e-12) m = Math.min(m, sc / Math.abs(d[i])); }
    const shock = par.shockRate * (0.5 + c.T / 6); if (shock > 0) m = Math.min(m, 0.25 / shock);
    return Math.max(50, m * 1000);
  }
  // ---- relations with the arena's lineages and the pressure they feel ---------------------------------------------------------------------------
  // How far a civilisation of technology T can reach into each realm [water, land, underground, air] (a game assumption: land first, then the shallows,
  // then mines, then flight; the deep sea and the deep crust stay beyond reach for a long time).
  function reach(T) { return [clamp(0.09 * (T - 1.5), 0, 0.6), clamp(0.25 + 0.2 * T, 0, 1), clamp(0.12 * (T - 2.5), 0, 0.55), clamp(0.12 * (T - 3.5), 0, 0.6)]; }
  // A lineage profile (from the game): { abund:[4], total, traits:{predation,fecundity,movement,tolerance,immune,repair,cog} }.
  function assess(c, prof, strategy) {
    const R = reach(c.T), tot = Math.max(1, prof.total), contact = (prof.abund[0] * R[0] + prof.abund[1] * R[1] + prof.abund[2] * R[2] + prof.abund[3] * R[3]) / tot;
    const presence = clamp(prof.total / 60, 0, 1), exposure = presence * contact, tr = prof.traits;
    const threat = exposure * (0.7 * tr.predation + 0.3 * tr.cog), competition = exposure * 0.5, useful = exposure * clamp(0.6 * tr.fecundity * (1 - tr.predation) * sat(c.T / 1.5) * 1.6, 0, 1);
    const hostility = 1.2 * threat + competition * (1 - useful) + 0.25 * (1 - c.S);
    let stance = 'ignore';
    if (exposure < 0.04) stance = 'ignore';
    else if (strategy === 'coexist' && useful > 0.12 && tr.predation < 0.5) stance = 'coexist';
    else if (useful > hostility * 1.2 && useful > 0.12) stance = 'use';
    else if (hostility > 0.12) stance = 'hostile';
    return { stance, exposure, threat, competition, useful, hostility };
  }
  // Pressures on the arena. `profiles`: per lineage; `strategies`: per lineage ('none'|'flee'|'coexist'|'defend'|'attack').
  // Returns { res[4], thermal[4], pathogen[4], harm[4], move[4], press[4], cap[lin][4], subsidy[lin][4], stances[lin], war }
  function effects(w, profiles, strategies, ctx) {
    const nl = profiles.length, zero = () => [0, 0, 0, 0], r = w.residue, out = { res: [1, 1, 1, 1], thermal: zero(), pathogen: [1, 1, 1, 1], harm: zero(), move: [1, 1, 1, 1], press: zero(), cap: Array.from({ length: nl }, zero), subsidy: Array.from({ length: nl }, zero), stances: new Array(nl).fill('ignore'), assess: new Array(nl).fill(null), war: 0, active: false };
    // habitat conversion (and the pollution that lingers) works whether or not a civilisation is alive now
    for (let k = 0; k < 4; k++) out.res[k] = 1 - 0.85 * r.conv[k]; out.thermal[3] += 0.04 * clamp(r.pollution, 0, 2); out.pathogen[1] *= 1 + 0.3 * clamp(r.pollution, 0, 2);
    const c = w.civ; if (!c) { c0(w); return out; }
    out.active = true; const R = reach(c.T); let omega = 0;
    for (let l = 0; l < nl; l++) {
      const a = assess(c, profiles[l], strategies[l]); out.assess[l] = a; out.stances[l] = a.stance; c.stance[l] = a.stance;
      if (a.stance === 'hostile') omega = Math.max(omega, clamp(a.hostility, 0, 1));
    }
    omega *= 0.5 * c.S; c.war = omega; out.war = omega;
    const T = c.T, mach = T >= 6 ? 1 : 0;
    for (let l = 0; l < nl; l++) {
      const a = out.assess[l]; if (a.stance === 'ignore') continue;
      for (let k = 0; k < 4; k++) {
        if (a.stance === 'hostile') {
          const cap = (T >= 1.5 ? 0.0010 * (T / 3) : 0) + (T >= 2.5 ? 0.0030 * (T / 4) : 0) + mach * 0.012 * (T - 5) / 5;
          out.cap[l][k] = clamp(cap * omega * 2 * R[k], 0, 0.2);
        } else if (a.stance === 'use') out.cap[l][k] = clamp(0.002 * (1 + T / 3) * a.useful * R[k], 0, 0.05);
        else if (a.stance === 'coexist') { out.cap[l][k] = clamp(0.0012 * (1 + T / 3) * a.useful * R[k], 0, 0.03); if (k === 1) out.subsidy[l][k] = clamp(0.05 * sat(c.T / 1.5) * Math.min(1, c.N / 0.25) * (1 - 0.5 * a.threat), 0, 0.06); }
      }
    }
    for (let k = 0; k < 4; k++) {
      out.press[k] = R[k] * Math.max(omega, 0.1);
      if (omega > 0 && T >= 4) out.move[k] = 1 - 0.5 * omega * R[k];
      if (omega > 0 && T >= 5) { out.pathogen[k] *= 1 + 0.5 * omega * R[k]; out.thermal[k] += 0.02 * omega * R[k]; }
      if (omega > 0 && T >= 6) out.harm[k] += 0.01 * omega * R[k];
      if (omega > 0 && T >= 3 && k === 1) out.res[k] *= 1 - 0.25 * omega;
    }
    if (T >= 7.5) { const f = clamp((T - 7.5) / 2.5, 0, 1); for (let k = 0; k < 4; k++) { out.res[k] *= 1 - 0.2 * f; out.thermal[k] += 0.08 * f; } } // planet-scale engineering is rough on everyone
    return out;
  }
  function c0() {}
  // Damage the arena's attackers do to the civilisation over a window (attack = summed attack power per step over the window, steps = window length).
  function applyAttack(w, attackPower, steps) {
    const c = w.civ; if (!c || attackPower <= 0) return 0;
    const idx = attackPower / Math.max(1, steps), frac = clamp(idx / (60 + 400 * c.T * Math.max(0.05, c.N)), 0, 0.25) * (c.T >= 6 ? 0.2 : 1);
    c.N *= 1 - 0.5 * frac; c.S = Math.max(0, c.S - 0.8 * frac); c.attackTaken += frac; return frac;
  }
  return { STAGES, PAR, create, step, maxStep, emergenceRate, effects, applyAttack, assess, reach, carrying, deriv, stateVec, integrate, fmtYears, stageName: (T) => STAGES[Math.min(STAGES.length - 1, Math.floor(T))] };
});
