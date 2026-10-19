(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaHistory = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Earth-history layer. The game's formal start is the end-Cretaceous impact, about 66 million years ago.
  //
  // THREE KINDS OF CONTENT, kept apart on purpose:
  //   1. dated events (age and uncertainty, from the literature; the references live in the private development notes),
  //   2. the time scale that says how many days one simulation step is (an ASSUMPTION, uncalibrated),
  //   3. the scenario conditions the impact applies to the simulation (GAME ASSUMPTIONS: qualitative shape from the literature, magnitudes invented).
  // What evolves under those conditions is never fixed here.
  const KPG_AGE_YEARS_BP = 66.043e6, KPG_UNCERTAINTY_YEARS = 0.011e6;
  const EVENTS = [
    { id: 'kpg-impact', ageMa: 66.043, uncMa: 0.011, kind: '衝突', name: '白亜紀末の巨大隕石衝突（チクシュルーブ）', status: 'applied',
      text: '直径10〜15kmほどの天体が現在のメキシコ・ユカタン半島に衝突したと推定される。衝突後、数か月〜数年の暗黒・寒冷化と生態系の崩壊が起きたと考えられている。', scale: '放出エネルギーは10^23〜10^24ジュール級の推定（幅あり）' },
    { id: 'deccan', ageMa: 66.0, uncMa: 0.4, kind: '火山', name: 'デカン・トラップの主要な噴火期', status: 'listed',
      text: 'インド西部で大規模な洪水玄武岩の噴火が続いた。衝突との前後関係や影響の大きさには議論がある。', scale: '噴火期は数十万年にわたる' },
    { id: 'petm', ageMa: 55.8, uncMa: 0.1, kind: '温暖化', name: '暁新世・始新世境界の温暖化（PETM）', status: 'listed',
      text: '数千年のうちに炭素が大気海洋へ放出され、全球の気温が約5〜8℃上がったと推定される。', scale: '昇温は約5〜8℃の推定（幅あり）' },
    { id: 'eot', ageMa: 33.9, uncMa: 0.1, kind: '寒冷化', name: '始新世・漸新世の寒冷化', status: 'listed',
      text: '南極に大きな氷床が成長し、気候が寒冷・乾燥へ向かった。', scale: '' },
    { id: 'mmco', ageMa: 16.0, uncMa: 1.0, kind: '温暖化', name: '中期中新世の温暖期', status: 'listed',
      text: '新生代後半では比較的温暖な時期。その後は長い寒冷化が続く。', scale: '' },
    { id: 'qg', ageMa: 2.58, uncMa: 0.01, kind: '寒冷化', name: '第四紀の氷期・間氷期サイクルの始まり', status: 'listed',
      text: '氷期と間氷期が繰り返され、海面と気候が大きく変動した。', scale: '' },
  ];
  // Time scales. Only `fine` exists in 1.9B. It is an assumption (1 step = 1 day) for the first years after the impact, where the
  // scenario conditions are applied. There is deliberately NO step-by-step scale for the following 66 million years: jumping
  // between eras with a coarser scale is designed for later and not implemented.
  const TIMESCALES = { fine: { id: 'fine', name: '衝突直後の細かい時間', daysPerStep: 1, calibrated: false, coversYears: 100 } };
  const DEFAULT_SCALE = 'fine';
  const daysPerYear = 365.25;
  function yearsSinceImpact(steps, scaleId = DEFAULT_SCALE) { return steps * TIMESCALES[scaleId].daysPerStep / daysPerYear; }
  function clock(steps, scaleId = DEFAULT_SCALE) {
    const years = yearsSinceImpact(steps, scaleId);
    return { scaleId, yearsSinceImpact: years, yearsBP: KPG_AGE_YEARS_BP - years, yearsBPUncertainty: KPG_UNCERTAINTY_YEARS, calibrated: TIMESCALES[scaleId].calibrated,
      withinFineScale: years <= TIMESCALES[scaleId].coversYears };
  }
  // Scenario conditions applied to the simulation after the impact (relative to the chosen base environment).
  // Shape: an abrupt loss of plant production and a rise in thermal stress that both relax back. Magnitudes and time constants are game
  // assumptions in STEPS (tau chosen so the recovery takes on the order of a year at 1 step = 1 day); they are not geophysical results.
  const IMPACT = { resourceDrop: 0.6, tauSteps: 250, thermalRise: 0.1, thermalTauSteps: 750, strikeStrength: 1.5 };
  function impactConditions(steps) {
    const r = 1 - IMPACT.resourceDrop * Math.exp(-steps / IMPACT.tauSteps), th = IMPACT.thermalRise * Math.exp(-steps / IMPACT.thermalTauSteps);
    return { resource: r, thermal: th, pathogen: 1 };
  }
  // Is the step scale sensible for these lifespans? A check, not a fix: it reports what the assumption implies.
  function scaleCheck(lifespanSteps, generationSteps, scaleId = DEFAULT_SCALE) {
    const d = TIMESCALES[scaleId].daysPerStep, life = lifespanSteps * d, gen = generationSteps * d;
    return { lifespanDays: life, generationDays: gen, note: life < 365 ? '寿命が1年未満：この時間尺度では、小型で短命な生き物の時間感覚になります。長寿の生き物を扱うには、時間尺度の見直し（未実装）が必要です。' : '寿命が1年以上。' };
  }
  function formatYearsBP(y) { return y >= 1e6 ? `約${(y / 1e4).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}万年前` : `約${Math.round(y).toLocaleString('ja-JP')}年前`; }
  return { KPG_AGE_YEARS_BP, KPG_UNCERTAINTY_YEARS, EVENTS, TIMESCALES, DEFAULT_SCALE, IMPACT, yearsSinceImpact, clock, impactConditions, scaleCheck, formatYearsBP };
});
