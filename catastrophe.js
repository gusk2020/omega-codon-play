(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaCatastrophe = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Great catastrophes of the long history (Stage 3.0): one crisis in each of the 10-, 20- and 30-hundred-million-year eras (years since the start, which is the
  // end-Cretaceous impact 66 Myr ago). Nothing here is "scripted": the time of each crisis, its kind, its size and whether the world can recover are drawn from
  // the world's seed (so the same seed gives the same history and different seeds give different ones), inside the setting of the era.
  //
  // WHAT IS SCIENCE AND WHAT IS ASSUMED
  //  * The slow brightening of the Sun, which makes the crises of the later eras more likely and more severe, is the science (see world.js). How the
  //    carbonate-silicate weathering buffer weakens with time, and the sizes and recovery times below, are GAME ASSUMPTIONS.
  //  * Impacts, large igneous provinces and the loss of the oceans are real kinds of events; their frequency and exact effect here are rough game assumptions.
  //  * The "lunar" crisis (fragmentation or an orbit change of the Moon, with a rain of fragments, wild tides and a swinging axis) is this work's OWN HYPOTHESIS, not
  //    established science. It is labelled as such wherever it is shown.
  //  * The forecasts shown to the player come from an observation model of the GAME (an outside view of the planet), not from any ability of the creatures. They are
  //    truthful but imprecise: the stated time window, size class and even the kind can be wrong, and are refined as the crisis nears.
  // Everything the crises do reaches the arena through numbers (food multipliers, heat, disease, injury, a disaster pulse) that the individuals live under.
  const ERAS = [
    { id: 1, label: '10億年代', from: 1.0e9, to: 2.0e9, minScale: 1.0, recover: 0.85, setting: 'K–Pg級以上の大規模災厄' },
    { id: 2, label: '20億年代', from: 2.0e9, to: 3.0e9, minScale: 1.6, recover: 0.55, setting: '生命圏を著しく脅かす大災厄' },
    { id: 3, label: '30億年代', from: 3.0e9, to: 3.8e9, minScale: 2.6, recover: 0.0, setting: '地球生命圏の終焉に相当する危機' },
  ];
  const TYPES = {
    impact: { name: '大規模天体衝突', icon: '☄', science: 'real-kind', text: '天体が衝突し、粉じんで暗く寒くなったあと、温暖化する。陸と空がいちばん傷つく。' },
    oceanLoss: { name: '海洋の縮小・喪失', icon: '🏜', science: 'real-kind', text: '太陽の光度が増して海が失われていく。水中の資源が消え、陸は乾いて高温になる。ゆっくり進み、ほぼ元に戻らない。' },
    climateShock: { name: '気候と大気の激変', icon: '🌋', science: 'real-kind', text: '大噴火や気体の放出で、全球が高温・低酸素・酸性になる。数十万年〜数百万年続く。' },
    lunar: { name: '月の破局（作品独自の仮説）', icon: '🌙', science: 'hypothesis', text: '月の破片や軌道の変化で、破片の雨、巨大な潮汐、地軸の揺れが起こる。※科学的に確立した説ではなく、この作品の仮説です。' },
    compound: { name: '複合災害', icon: '💥', science: 'mixed', text: '二つの災厄が重なる。' },
  };
  const WEIGHTS = [
    { impact: 0.35, climateShock: 0.25, oceanLoss: 0.15, lunar: 0.10, compound: 0.15 },
    { impact: 0.15, climateShock: 0.20, oceanLoss: 0.30, lunar: 0.10, compound: 0.25 },
    { impact: 0.05, climateShock: 0.10, oceanLoss: 0.45, lunar: 0.10, compound: 0.30 },
  ];
  const SCALE_CLASS = [[1.3, '大'], [2.0, '非常に大'], [3.2, '極大'], [Infinity, '生命圏規模']];
  const classOf = (s) => (SCALE_CLASS.find(([m]) => s < m) || SCALE_CLASS[3])[1];
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (rng, w, skip) => { let tot = 0; for (const [k, v] of Object.entries(w)) if (k !== skip && k !== 'compound') tot += v; let u = rng() * tot; for (const [k, v] of Object.entries(w)) { if (k === skip || k === 'compound') continue; u -= v; if (u <= 0) return k; } return 'impact'; };
  const gauss = (rng) => { let s = 0; for (let i = 0; i < 6; i++) s += rng(); return (s - 3) / 0.7071; };
  // The schedule of the whole history, from the seed alone. `opts.startElapsed` is a TEST-ONLY shortcut: it moves every crisis nearer so that a test can reach one quickly.
  function schedule(seed) {
    const rng = mulberry((seed * 1597334677) ^ 0x3C6EF372), out = [];
    ERAS.forEach((era, i) => {
      const span = era.to - era.from, onset = era.from + span * (0.1 + 0.8 * rng()), W = WEIGHTS[i];
      let type = null; { let u = rng(), acc = 0; for (const [k, v] of Object.entries(W)) { acc += v; if (u <= acc) { type = k; break; } } type = type || 'impact'; }
      const scale = Math.min(era.minScale * 3, era.minScale * Math.exp(Math.abs(gauss(rng)) * 0.3)), sev = 1 - Math.exp(-0.9 * scale);
      const parts = type === 'compound' ? (() => { const a = pick(rng, W), b = pick(rng, W, a); return [a, b]; })() : [type];
      const recoverable = i === 2 ? false : rng() < era.recover, lead = (2 + 4 * rng()) * 1e6;
      const tauR = (type === 'oceanLoss' ? 3e8 : type === 'climateShock' ? 8e5 : type === 'lunar' ? 3e5 : 4e4) * Math.sqrt(scale);
      const hits = parts.includes('lunar') ? Array.from({ length: 5 + Math.floor(rng() * 4) }, () => ({ dt: rng() * 2e5, strength: 0.8 + 0.6 * rng() })).sort((a, b) => a.dt - b.dt) : [];
      // the forecast's mistakes are drawn now (so the forecast is repeatable), but they never change what actually happens
      const fc = { timeErr: [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1], scaleErr: [gauss(rng) * 0.35, gauss(rng) * 0.2, gauss(rng) * 0.06], wrongType: [rng() < 0.22, rng() < 0.1, false], wrongPick: rng() };
      out.push({ era: era.id, label: era.label, setting: era.setting, onset, type, parts, scale, severity: sev, recoverable, lead, tauR, hits, fc, id: i + 1 });
    });
    return out;
  }
  // ---- what a catastrophe does, as a function of the years since its onset (analytic, so any leap length gives the same answer) ----
  const dec = (t, tau) => (tau === Infinity ? 1 : Math.exp(-t / tau)), ramp = (t, T) => 1 - Math.exp(-t / T);
  const Z4 = () => [0, 0, 0, 0];
  // returns { res:[w,l,u,a] multipliers, dT:[..] K, path:[..] multipliers, harm:[..] }
  function partEffects(kind, c, tau) {
    const out = { res: [1, 1, 1, 1], dT: Z4(), path: [1, 1, 1, 1], harm: Z4() }, s = c.scale * (c.parts.length > 1 ? 0.75 : 1), sev = 1 - Math.exp(-0.9 * s), perm = c.recoverable ? 0 : 0.7;
    if (tau < 0) return out;
    if (kind === 'impact') {
      const tr = c.tauR, d = perm + (1 - perm) * dec(tau, tr), cool = dec(tau, tr * 0.2), rebound = (1 - cool) * dec(tau, tr);
      out.res = [1 - 0.6 * sev * d, 1 - 0.9 * sev * d, 1 - 0.25 * sev * d, 1 - 0.9 * sev * d];
      const dT = -14 * sev * cool + 5 * sev * rebound; out.dT = [dT * 0.5, dT, dT * 0.3, dT]; out.path = [1, 1 + 0.5 * sev * d, 1, 1]; out.harm = [0.002 * sev * d, 0.01 * sev * d, 0, 0.01 * sev * d];
    } else if (kind === 'oceanLoss') {
      const r = ramp(tau, 2e7 * s), f = r * (c.recoverable ? Math.max(0, 1 - ramp(tau, c.tauR)) : 1); // a recoverable loss only fades back over hundreds of millions of years
      out.res = [1 - 0.97 * sev * f, 1 - 0.55 * sev * f, 1 - 0.3 * sev * f, 1 - 0.35 * sev * f]; out.dT = [20 * sev * f, 30 * sev * f, 10 * sev * f, 30 * sev * f]; out.path = [1, 1, 1, 1]; out.harm = [0, 0.002 * sev * f, 0, 0.004 * sev * f];
    } else if (kind === 'climateShock') {
      const d = perm + (1 - perm) * dec(tau, c.tauR), up = ramp(tau, 5e3), K = (8 + 14 * sev) * up * d;
      out.dT = [K * 0.6, K, K * 0.4, K]; out.res = [1 - 0.7 * sev * d * up, 1 - 0.5 * sev * d * up, 1 - 0.3 * sev * d * up, 1 - 0.5 * sev * d * up]; out.path = [1 + 0.3 * sev * d, 1 + 0.6 * sev * d, 1 + 0.2 * sev * d, 1 + 0.3 * sev * d]; out.harm = [0.003 * sev * d, 0.004 * sev * d, 0, 0.004 * sev * d];
    } else if (kind === 'lunar') {
      const d = perm + (1 - perm) * dec(tau, c.tauR), osc = Math.sin((2 * Math.PI * tau) / 3e4);
      out.dT = [0, 10 * sev * dec(tau, 6e5) * osc, 0, 10 * sev * dec(tau, 6e5) * osc * 0.8]; out.res = [1 - 0.5 * sev * dec(tau, 3e5), 1 - 0.35 * sev * d, 1 - 0.1 * sev * d, 1 - 0.3 * sev * d]; out.harm = [0.004 * sev * dec(tau, 1e5), 0.006 * sev * dec(tau, 1e5), 0, 0.004 * sev * dec(tau, 1e5)];
    }
    return out;
  }
  function effectsAt(cat, years) {
    const tot = { res: [1, 1, 1, 1], dT: Z4(), path: [1, 1, 1, 1], harm: Z4(), active: [] };
    for (const c of cat) { const tau = years - c.onset; if (tau < 0) continue; for (const k of c.parts) { const e = partEffects(k, c, tau); for (let r = 0; r < 4; r++) { tot.res[r] *= e.res[r]; tot.dT[r] += e.dT[r]; tot.path[r] *= e.path[r]; tot.harm[r] += e.harm[r]; } } tot.active.push(c.id); }
    for (let r = 0; r < 4; r++) tot.res[r] = Math.max(0.02, tot.res[r]);
    return tot;
  }
  // strengths of the disaster pulses that fall inside (a, b]: the onset itself and, for a lunar crisis, each fragment strike
  function pulsesBetween(cat, a, b) {
    let m = 0;
    for (const c of cat) { if (c.onset > a && c.onset <= b) m = Math.max(m, 1.0 + 0.6 * c.severity * (c.parts.includes('impact') ? 1.2 : 1)); for (const h of c.hits) { const t = c.onset + h.dt; if (t > a && t <= b) m = Math.max(m, h.strength); } }
    return m;
  }
  // ---- the milestones: warnings, onset, aftermath ----
  const LEAD = [1, 0.3, 0.05], STAGE_NAME = ['early', 'update', 'imminent'];
  function milestones(cat) {
    const out = [];
    for (const c of cat) { LEAD.forEach((f, i) => out.push({ t: c.onset - c.lead * f, kind: 'warning', stage: STAGE_NAME[i], stageIndex: i, cat: c.id })); out.push({ t: c.onset, kind: 'onset', cat: c.id }); out.push({ t: c.onset + 2e5, kind: 'aftermath', cat: c.id }); }
    return out.sort((a, b) => a.t - b.t);
  }
  // What the observation model says at a warning stage. Truthful on average, imprecise, and improving. It never reveals more than the schedule holds and
  // it can be wrong in time, size class and (early on) kind.
  function forecast(c, stageIndex, now) {
    const rem = Math.max(0, c.onset - now), width = c.lead * LEAD[stageIndex] * (stageIndex === 0 ? 0.6 : stageIndex === 1 ? 0.35 : 0.15);
    const centre = c.onset + c.fc.timeErr[stageIndex] * width * 0.6, scaleHat = Math.max(0.5, c.scale * Math.exp(c.fc.scaleErr[stageIndex]));
    const kinds = Object.keys(TYPES).filter((k) => k !== 'compound'); let predicted = c.parts, wrong = false;
    if (c.fc.wrongType[stageIndex]) { wrong = true; const alt = kinds.filter((k) => !c.parts.includes(k)); predicted = [alt[Math.floor(c.fc.wrongPick * alt.length)]]; }
    const probe = { ...c, parts: predicted, scale: scaleHat, severity: 1 - Math.exp(-0.9 * scaleHat) };
    const e1 = effectsAt([{ ...probe, onset: 0 }], 1e3), e2 = effectsAt([{ ...probe, onset: 0 }], 2e5);
    return { cat: c.id, era: c.era, eraLabel: c.label, setting: c.setting, stage: STAGE_NAME[stageIndex], stageIndex, remainingYears: rem, window: [centre - width, centre + width], windowYears: width * 2,
      scaleClass: classOf(scaleHat), scaleValue: scaleHat, kinds: predicted, kindNames: predicted.map((k) => TYPES[k].name), kindText: predicted.map((k) => TYPES[k].text), hypothesis: predicted.includes('lunar'),
      realmRes: e1.res.map((v, i) => Math.min(v, e2.res[i])), realmHeatK: e1.dT.map((v, i) => Math.max(v, e2.dT[i])), realmColdK: e1.dT.map((v) => Math.min(0, v)), pathogen: e1.path, recoverableGuess: stageIndex === 2 ? c.recoverable : null,
      confidence: ['低い（時期・種類・規模は大きくずれうる）', '中くらい（時期の幅が狭まった）', '高い（種類は確定、時期と規模の誤差は小さい）'][stageIndex], note: '観測モデル（ゲーム側の外からの視点）による推定です。生き物が未来を予知しているわけではありません。確率的な事象なので、実際とずれることがあります。' };
  }
  const nextMilestone = (list, years) => list.find((m) => m.t > years + 1e-6) || null;
  return { ERAS, TYPES, schedule, effectsAt, partEffects, pulsesBetween, milestones, forecast, nextMilestone, classOf, STAGE_NAME };
});
