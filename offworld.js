(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaOffworld = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Life beyond the Earth: the minimum state the game needs so that it does not end while something is still alive out there (Stage 3.0).
  //
  // THREE THINGS ARE KEPT STRICTLY APART, and only the first two are computed here:
  //   reached      the lineage got off the Earth (by one of the routes below)
  //   temporary    some of what left was still alive after the journey (a crude survival model; it says nothing about living out there)
  //   autonomous   it can live and renew itself in space unaided: NOT COMPUTED. No environment or survival model for space exists yet, so this is never shown as
  //                computed and never as achieved.
  // Routes: self (the lineage itself reaches the air, high up, with the body for it), ejecta (an impact throws rock carrying life), transport (a civilisation carries it).
  // A lineage that was only carried by a civilisation is NEVER eligible for the Omega condition (omegaEligible=false): being transported is not autonomy.
  // Every rate and survival chance below is a GAME ASSUMPTION; there is no data to calibrate them against.
  const ROUTES = { self: { name: '自力で宇宙へ', text: '高い空に定着し、宇宙環境に耐える体を持つ系統が、ごくまれに宇宙へ出る（ゲーム上の仮定）。' }, ejecta: { name: '自然現象による放出', text: '天体衝突で飛び散った岩石に、休眠した生命が乗って宇宙へ出る。' }, transport: { name: '文明による輸送', text: '宇宙へ出る技術をもつ文明が、役に立つと見なした系統を運ぶ。自律的な生存とは認めない。' } };
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const poisson = (rng, lam) => { if (lam <= 0) return 0; if (lam > 30) return Math.round(lam); const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 60); return k - 1; };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  function create(seed) { return { rng: mulberry((seed * 2891336453) ^ 0x1B873593), records: [], n: 0 }; }
  // profile: { lin, name, abund:[water,land,underground,air], total, traits:{tolerance,repair,metabolism,dormancyDepth,movement,...normalised 0..1 except dormancyDepth/metabolism raw} }
  const deepDormancy = (t) => clamp((0.5 - t.dormancyDepth) / 0.45, 0, 1), lowMetab = (t) => clamp(1 - (t.metabolism - 0.2) / 1.4, 0, 1);
  const hardiness = (t) => 0.4 * t.tolerance + 0.3 * t.repair + 0.3 * deepDormancy(t);
  function add(w, lin, route, years, count, supported, temporary, note) {
    const rec = { id: ++w.n, lin, route, years, count, status: temporary ? 'temporary' : 'reached', supported, omegaEligible: route !== 'transport', autonomous: null, autonomousNote: '宇宙環境での自律的な生存は、まだ計算していません', note };
    w.records.push(rec); return rec;
  }
  // an impact (or a lunar fragment strike) throws rock into space. `strength` ~ 1 for an ordinary great impact.
  function ejecta(w, profiles, years, strength) {
    const out = [];
    for (const p of profiles) {
      const rock = p.abund[1] + p.abund[2]; if (rock < 5) continue;
      const bodies = poisson(w.rng, 0.12 * strength * (rock / 50) * (0.3 + 0.7 * p.traits.tolerance));
      if (bodies <= 0) continue;
      const pSurvive = 0.02 + 0.6 * hardiness(p.traits); let alive = 0; for (let i = 0; i < bodies; i++) if (w.rng() < pSurvive) alive++;
      out.push(add(w, p.lin, 'ejecta', years, bodies, false, alive > 0, `放出された岩石${bodies}個のうち、旅のあと生命が残ったもの${alive}個（簡易モデル）`));
    }
    return out;
  }
  // the lineage itself, over `dt` years
  function selfReach(w, profiles, years, dt) {
    const out = [];
    for (const p of profiles) {
      const air = p.abund[3]; if (air < 5) continue; const t = p.traits;
      if (t.tolerance < 0.75 || t.repair < 0.55 || deepDormancy(t) < 0.5 || lowMetab(t) < 0.3) continue; // the body for it: tolerant, self-repairing, deep dormancy, modest metabolism
      const rate = 2e-9 * (air / 50) * hardiness(t); if (w.rng() < 1 - Math.exp(-rate * dt)) out.push(add(w, p.lin, 'self', years, 1, false, w.rng() < 0.05 + 0.5 * hardiness(t), '高い空から宇宙へ出た個体（簡易モデル）'));
    }
    return out;
  }
  // a civilisation at the technology of large-scale environment control or beyond (T >= 8) carries lineages it uses or lives with
  function transport(w, profiles, stances, civ, years, dt) {
    const out = []; if (!civ || civ.T < 8) return out;
    for (const p of profiles) {
      const st = stances[p.lin]; if (!(st === 'use' || st === 'coexist') || p.total < 20) continue;
      const rate = 4e-4 * (civ.T - 7.5); if (w.rng() < 1 - Math.exp(-rate * dt)) out.push(add(w, p.lin, 'transport', years, Math.max(1, Math.round(p.total / 20)), true, w.rng() < 0.9, '文明が運んだ（文明の支えで生き延びた分。自律的な生存ではない）'));
    }
    return out;
  }
  // every lineage with something still alive out there (temporary survival), as the game uses it to decide whether the game goes on
  const aliveOutside = (w) => w.records.some((r) => r.status === 'temporary');
  function summary(w) { const by = {}; for (const r of w.records) { const k = r.lin; (by[k] = by[k] || { lin: k, reached: 0, temporary: 0, routes: {} }); by[k].reached++; if (r.status === 'temporary') by[k].temporary++; by[k].routes[r.route] = (by[k].routes[r.route] || 0) + 1; } return Object.values(by); }
  return { ROUTES, create, add, ejecta, selfReach, transport, aliveOutside, summary, hardiness, deepDormancy };
});
