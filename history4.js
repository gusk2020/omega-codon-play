(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaHistory4 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Earth history from the first cells to the present (Stage 4.0), as EXTERNAL CONDITIONS for the simulation.
  //
  // What is fixed here and what is not:
  //  * The dated events follow the widely accepted geological record (dates are central estimates; most carry uncertainties of a few to tens of percent).
  //    They act on the world only as conditions: oxygen, ultraviolet on land and in the air, how much food land and air can offer, the climate, and the
  //    great mass extinctions as disturbances. They NEVER decide which lineage lives: eukaryotes, multicellularity, the Cambrian animals and so on are
  //    listed as what happened on the real Earth (a reference), not imposed on the game's lineages, which evolve on their own.
  //  * The origin of life is uncertain (estimates range from about 4.2 to 3.5 billion years ago). The game STARTS at 3.8 billion years ago, a model setting.
  //  * The climate curve (temperature offset from the present) is a coarse, smoothed reading of published reconstructions: roughly right in sign and order of
  //    magnitude, not a reconstruction. The faint young Sun is taken as compensated by greenhouse gases (the usual resolution), so the past is not frozen.
  //  * The first high-technology civilisation is that of modern humans. Before it no civilisation can arise; it begins with farming about 12,000 years ago.
  //    After the present the history branches: the civilisation model (civilization.js) and the far-future crises (catastrophe.js) take over.
  const ORIGIN_BP = 3.8e9, HUMANS_BP = 3.0e5, FARMING_BP = 1.2e4;
  const EVENTS = [
    { bp: 3.8e9, id: 'ocean', kind: 'start', name: '原始海洋', text: '原始の海に、単細胞の生命が生まれている（開始年代は推定。生命の起源は約42億〜35億年前と幅がある）。' },
    { bp: 3.5e9, id: 'mats', kind: 'reference', name: '微生物マット', text: '史実：浅い海に微生物のマット（ストロマトライト）が広がっていた。' },
    { bp: 2.4e9, id: 'goe', kind: 'environment', name: '大酸化イベント', text: '大気に酸素が増え始めた（大酸化イベント）。酸素を使えない体には不利、代謝の高い体には有利になる。' },
    { bp: 1.85e9, id: 'euk', kind: 'reference', name: '真核生物（史実）', text: '史実：このころまでに真核生物が現れた（推定）。このゲームの系統がそうなるとは限らない。' },
    { bp: 1.2e9, id: 'multi', kind: 'reference', name: '多細胞化（史実）', text: '史実：多細胞の藻類の化石がある。' },
    { bp: 6.0e8, id: 'ozone', kind: 'environment', name: 'オゾン層', text: '酸素が増え、オゾン層が紫外線をさえぎるようになった。陸と空の紫外線による損傷が減る。' },
    { bp: 5.39e8, id: 'cambrian', kind: 'reference', name: 'カンブリア紀の多様化（史実）', text: '史実：動物の体のつくりが一気に多様になった。' },
    { bp: 4.7e8, id: 'land', kind: 'environment', name: '陸上進出', text: '植物が陸に広がり始め、陸の食べ物が増えていく。' },
    { bp: 4.0e8, id: 'flight', kind: 'environment', name: '空の食べ物', text: '昆虫と陸上植物が広がり、空でも食べ物が得られるようになっていく。' },
    { bp: 3.6e8, id: 'forest', kind: 'environment', name: '森林', text: '森林が広がった。' },
    { bp: 2.3e8, id: 'dino', kind: 'reference', name: '恐竜の時代（史実）', text: '史実：恐竜が栄えた時代の始まり。' },
    { bp: 6.6e7, id: 'mammal', kind: 'reference', name: '哺乳類の多様化（史実）', text: '史実：K–Pg境界のあと、哺乳類が多様になった。' },
    { bp: 2.6e6, id: 'ice', kind: 'environment', name: '第四紀の氷河時代', text: '氷期と間氷期がくり返す寒い時代になった。' },
    { bp: HUMANS_BP, id: 'humans', kind: 'reference', name: '現生人類の出現（史実）', text: '史実：現生人類が現れた。この時点では文明はまだない。' },
    { bp: FARMING_BP, id: 'farming', kind: 'civ', name: '人類の文明', text: '農耕が始まり、人類の文明が生まれた（最初の高度な文明は現生人類のもの、という設定）。' },
    { bp: 0, id: 'present', kind: 'present', name: '現代', text: '現代に着いた。ここから先は未来史で、どうなるかは決まっていない。' },
  ];
  // The great extinctions and the snowball glaciations, in the catastrophe format (catastrophe.js), so that they are forecast, paused at and recovered from
  // exactly like the future crises. Sizes are game settings ordered by the record (the end-Permian the worst).
  const CRISES = [
    { bp: 2.29e9, label: 'ヒューロニアン氷河時代', type: 'glaciation', scale: 1.6, tauR: 4e7 },
    { bp: 7.17e8, label: 'スノーボールアース（スターティアン）', type: 'glaciation', scale: 2.2, tauR: 2e7 },
    { bp: 6.5e8, label: 'スノーボールアース（マリノアン）', type: 'glaciation', scale: 1.8, tauR: 8e6 },
    { bp: 4.45e8, label: 'オルドビス紀末の大量絶滅', type: 'glaciation', scale: 1.2, tauR: 1.5e6 },
    { bp: 3.72e8, label: 'デボン紀後期の大量絶滅', type: 'climateShock', scale: 1.0, tauR: 2e6 },
    { bp: 2.52e8, label: 'ペルム紀末の大量絶滅', type: 'climateShock', scale: 2.2, tauR: 1.5e6 },
    { bp: 2.01e8, label: '三畳紀末の大量絶滅', type: 'climateShock', scale: 1.2, tauR: 8e5 },
    { bp: 6.6e7, label: 'K–Pg境界（白亜紀末）', type: 'impact', scale: 1.4, tauR: 4e4 },
  ];
  function crises() {
    return CRISES.map((c, i) => ({ era: 'H' + (i + 1), label: c.label, setting: '史実の大量絶滅・氷河時代（地球史）', onset: ORIGIN_BP - c.bp, type: c.type, parts: [c.type], scale: c.scale, severity: 1 - Math.exp(-0.9 * c.scale),
      recoverable: true, lead: 6e5, tauR: c.tauR, hits: [], fc: { timeErr: [0.4 - 0.1 * i, -0.2, 0.05], scaleErr: [0.2, -0.1, 0.03], wrongType: [false, false, false], wrongPick: 0 }, id: 101 + i, historical: true }));
  }
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const ramp = (bp, from, to) => (bp >= from ? 0 : bp <= to ? 1 : (from - bp) / (from - to)); // 0 before `from` (years ago), 1 after `to`
  // oxygen, relative to the present (0..1)
  function oxygen(bp) { if (bp > 2.4e9) return 0.01; if (bp > 2.0e9) return lerp(0.01, 0.1, ramp(bp, 2.4e9, 2.0e9)); if (bp > 8.0e8) return 0.1; return lerp(0.1, 1, ramp(bp, 8.0e8, 4.0e8)); }
  // smoothed temperature offset from the present, K (coarse reading of reconstructions; the crises add their own excursions on top)
  const CLIM = [[3.8e9, 8], [2.5e9, 7], [2.4e9, 2], [1.8e9, 5], [8e8, 4], [5.4e8, 7], [4.5e8, 4], [3.3e8, 0], [2.6e8, 3], [2.0e8, 6], [9e7, 8], [5e7, 6], [3.4e7, 3], [3e6, 1], [1e6, -1], [2e4, -1], [0, 0]];
  function climate(bp) { if (bp <= 0) return 0; for (let i = 1; i < CLIM.length; i++) { const [b0, t0] = CLIM[i - 1], [b1, t1] = CLIM[i]; if (bp <= b0 && bp >= b1) return lerp(t0, t1, (b0 - bp) / (b0 - b1)); } return CLIM[0][1]; }
  // per realm [water, land, underground, air]: food multiplier and damage per step from ultraviolet. Land and air are poor until plants and insects.
  function conditions(bp) {
    if (bp <= 0) return { o2: 1, res: [1, 1, 1, 1], harm: [0, 0, 0, 0], dT: 0, prey: 1 };
    const land = bp > 1.2e9 ? 0.05 : bp > 4.7e8 ? 0.15 : lerp(0.15, 1, ramp(bp, 4.7e8, 3.6e8)), air = bp > 4.0e8 ? 0.03 : lerp(0.03, 1, ramp(bp, 4.0e8, 3.0e8));
    const uv = 1 - ramp(bp, 8.0e8, 6.0e8);
    const prey = bp > 5.4e8 ? 0.03 : lerp(0.03, 1, ramp(bp, 5.4e8, 4.5e8)); // animals to hunt: almost none before the Cambrian
    return { o2: oxygen(bp), res: [1, land, 1, air], harm: [0, 0.006 * uv, 0, 0.008 * uv], dT: climate(bp), prey };
  }
  const eventsBetween = (bpFrom, bpTo) => EVENTS.filter((e) => e.bp < bpFrom && e.bp >= bpTo); // crossed going forward in time (bp falls)
  const civAllowed = (bp) => bp <= FARMING_BP;
  return { ORIGIN_BP, HUMANS_BP, FARMING_BP, EVENTS, CRISES, crises, oxygen, climate, conditions, eventsBetween, civAllowed };
});
