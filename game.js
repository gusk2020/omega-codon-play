(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaGame = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NODE = typeof module === 'object' && typeof require === 'function';
  const RK = NODE ? require('./rank') : globalThis.OmegaRank;
  const DISH = NODE ? require('./dish') : globalThis.OmegaDish, CDX = NODE ? require('./codex4') : globalThis.OmegaCodex;
  const OFF = NODE ? require('./offworld') : globalThis.OmegaOffworld, NICHE = NODE ? require('./niche') : globalThis.OmegaNiche, WORLD = NODE ? require('./world') : globalThis.OmegaWorld, CIVM = NODE ? require('./civilization') : globalThis.OmegaCiv, HIST = NODE ? require('./earthhistory') : globalThis.OmegaHistory, BG = NODE ? require('./background') : globalThis.OmegaBackground, AD = NODE ? require('./adaptation') : globalThis.OmegaAdaptation;
  // The game layer. It owns no science: it picks founders, advances the Stage 1.7 engine, notices notable things, and offers the
  // player a small number of environment-wide interventions. Nothing here favours a lineage or a trait.
  const DETECT_EVERY = 25, FIRST_BRANCH = 300, MIN_BRANCH_GAP = 500, CHECKPOINT_GAP = 1500, SERIES_MAX = 700;
  const P20 = { period: 20, pulseLength: 4 };
  const KEY_TRAITS = ['metabolism', 'movement', 'predation', 'tolerance', 'immune', 'fecundity', 'repairRate', 'dormancyDepth'];
  const TRAIT_JA = { metabolism: '代謝', movement: '移動', predation: '捕食', tolerance: '耐性', immune: '免疫', fecundity: '繁殖力', repairRate: '修復', dormancyDepth: '休眠の深さ' };

  const CREATURES = [
    { id: 'standard', startRealm: 1, niche: [0.5, 0.3, 0.2], name: '標準型', color: '#4fa3ff', text: '特徴のない基準の生き物。' },
    { id: 'lowMetabolism', startRealm: 1, niche: [0.2, 0.3, 0.5], name: '低代謝型', color: '#46c28a', text: '燃費がよく、ゆっくり老いる。繁殖は控えめ。', traits: { metabolism: 0.5 } },
    { id: 'highFecundity', startRealm: 1, niche: [0.2, 0.6, 0.2], name: '多産型', color: '#f2a03d', text: 'たくさん産む。', traits: { fecundity: 0.9 } },
    { id: 'hunter', startRealm: 1, niche: [0.3, 0.2, 0.5], name: '狩猟型', color: '#e5586e', text: '獲物を捕るのが上手い。', traits: { predation: 0.8 } },
    { id: 'tough', startRealm: 1, niche: [0.2, 0.5, 0.3], name: '頑丈型', color: '#b38cf0', text: '暑さ・寒さ・病気に強い。', traits: { tolerance: 0.8, immune: 0.7 } },
  ];
  // Stage 3.0 adds two founders for the routes the concept names (dormancy, regeneration). They exist only in games started with stage 3: older saves keep the five.
  const CREATURES7 = CREATURES.concat([
    { id: 'dormant', startRealm: 2, niche: [0.25, 0.2, 0.55], name: '休眠型', color: '#7fd6d6', text: '深く休眠して、飢えや寒暖をやり過ごす。動きは遅い。', traits: { metabolism: 0.45, dormancyDepth: 0.08, tolerance: 0.6 } },
    { id: 'regenerator', startRealm: 1, niche: [0.3, 0.4, 0.3], name: '再生型', color: '#e8d36a', text: '傷をよく直し、細胞を入れ替え、病気に強い。維持に費用がかかる。', traits: { repairRate: 0.9, replaceRatio: 0.7, immune: 0.7, metabolism: 0.8 } },
  ]);
  // Niche weights: how a type spreads its plant-food intake over three separate food resources (A, B, C). Every type has one main food (50-60%) and
  // lesser use of the others; standard leans mildly to A. Differences between types are what lets several of them live on the same land
  // (resource partitioning); it never guarantees coexistence. HONEST NOTE: a first draft made `standard` an even generalist (1/3 each); as the player's
  // starting type it survived in only 1/8 trial runs, because specialists out-eat a generalist that pays no cost. These weights give every type one main
  // food instead (two alternative sets were compared and this one kept). That choice was made after seeing survival rates; nothing was tuned afterwards.
  // Remaining differences (e.g. 頑丈型 surviving less often) come from the types' genes and costs and are reported as they are.
  // NICHE_BONUS: digestive efficiency rises with how much of the diet a food is. 1.5 was the smallest value tried (0, 0.5, 1, 1.5) at which most
  // runs still had two or more lineages after 4000 steps (from internal trial runs). It is a modelling choice, not a measurement.
  const NICHE_BONUS = 1.5, NICHE_SLOTS = 3, NICHE_NAMES = ['餌A（地表の草・藻）', '餌B（種・実）', '餌C（根・腐植）'];
  // Traits shown in "what evolved", with the wording for a rise / a fall, and the parts of the cognition index.
  const EVO = [
    ['metabolism', '代謝', '代謝が高まった（活動的だが消費も増える）', '代謝が下がった（省エネで、ゆっくり老いる傾向）'],
    ['movement', '移動能力', '移動能力が伸びた', '移動能力が縮んだ'],
    ['predation', '捕食能力', '捕食能力が伸びた', '捕食能力が落ちた'],
    ['tolerance', '耐性', '寒暖・災害への耐性が増した', '寒暖・災害への耐性が減った'],
    ['immune', '免疫', '免疫が強まった', '免疫が弱まった'],
    ['fecundity', '繁殖力', '繁殖力が上がった', '繁殖力が下がった'],
    ['repairRate', '修復力', '修復力が高まった', '修復力が低下した'],
    ['replaceRatio', '細胞の入れ替えによる再生', '入れ替えで再生する割合が増えた', '入れ替えで再生する割合が減った'],
    ['dormancyDepth', '休眠の深さ（値が小さいほど深い）', '休眠が浅く（代謝が高いまま）なった', '休眠が深くなった'],
    ['memoryLearn', '学習（記憶の獲得）', '学習（記憶の獲得）が高まった', '学習（記憶の獲得）が低下した'],
    ['memoryUpkeep', '記憶の維持への投資', '記憶の維持に投資するようになった', '記憶の維持への投資を減らした'],
    ['falsePositive', '感覚の空振り（誤検出）', '空振りが増えた', '空振りが減った'],
    ['falseNegative', '感覚の見逃し', '見逃しが増えた', '見逃しが減った'],
    ['switchThreshold', '行動の切り替えにくさ', '行動を切り替えにくくなった', '行動を切り替えやすくなった'],
  ];
  const IMPORTANT = new Set(['branch', 'disaster', 'crisis', 'lineage', 'scenario', 'immigration', 'player', 'rank', 'civ', 'world']);
  const STRATEGIES = { none: { code: 0, name: '方針なし', icon: '・' }, flee: { code: 1, name: '逃避', icon: '↘' }, coexist: { code: 2, name: '共存', icon: '＝' }, defend: { code: 3, name: '防御', icon: '◇' }, attack: { code: 4, name: '攻撃', icon: '✕' } };
  // Stage 5.1 timing, for games created from Stage 5.1 on (cfg.light): leaps come more often and are cheaper so that the clock moves smoothly on a phone. A log-based save from an earlier
  // stage has no `light` in its cfg and keeps the old numbers (400-step windows, 240 approximate steps at mutation x2), so that its replay stays exact.
  const LIGHT_TIMING = { minGap: 120, genFactor: 3, approxMax: 80, approxMut: 3 }, LEGACY_TIMING = { minGap: 400, genFactor: 8, approxMax: 240, approxMut: 2 };
  const LEAP_FROM = 6000; // steps: the first years after the impact are always simulated step by step
  // Pauses with a choice (continue / save / start over): the first at the old fixed end (100000 steps), then at regular intervals. There is no fixed end any more.
  const CHECKPOINT = { first: 100000, every: 50000 };
  // Cognition index: a display composite (0..1) of learning, memory upkeep, sensing accuracy and behavioural flexibility.
  // It is NOT a measurement of intelligence, and says nothing about sharing, society or culture, which the engine does not model.
  function cognitionIndex(get) {
    const learn = get('memoryLearn'), keep = (get('memoryUpkeep') - 0.05) / 0.95, acc = 1 - ((get('falsePositive') - 0.02) / 0.48 + (get('falseNegative') - 0.02) / 0.48) / 2, flex = 1 - get('switchThreshold') / 2;
    return (learn + keep + acc + flex) / 4;
  }
  const ENVIRONMENTS = [
    { id: 'steady', engine: 'rich', regime: null, name: '安定した土地', text: '食べ物が毎日ある。遊びやすい。' },
    { id: 'pulse', engine: 'rich', regime: P20, name: '波のある土地', text: '食べ物が周期的に増減する（Stage 1.7の基準環境）。絶滅しやすい。' },
    { id: 'scarce', engine: 'scarce', regime: null, name: '乏しい土地', text: '食べ物が少ない。厳しい。' },
    { id: 'plague', engine: 'plague', regime: null, name: '疫病の土地', text: '病気が多い。' },
    { id: 'famine', engine: 'rich', regime: { period: 150, pulseLength: 10 }, name: '長い飢えのある土地', text: '食べ物が約150ステップごとの短い期間にだけ豊かになり、普段は乏しい。燃費がよく飢えを越えられる生き物が残る回がある（隠れた補正ではなく、飢えを越える力が実際に生死を分ける条件。繁殖型はほぼ残れない）。' },
  ];
  const OPTIONS = {
    watch: { id: 'watch', name: '見守る', text: '何もしない。' },
    support: { id: 'support', name: '食料を支援', text: '約200ステップ、獲物が少しずつ増える（全員に平等）。', duration: 200 },
    refuge: { id: 'refuge', name: '保護区を作る', text: '約300ステップ、獲物の一部が狩られず残る（全員に平等）。', duration: 300 },
    disaster: { id: 'disaster', name: '災害を起こす', text: '全区画に災害。弱い者が減る。', duration: 0 },
    auto: { id: 'auto', name: '自動', text: '中立的な「見守る」を選びます（選んだ理由が履歴に残ります）。' },
  };
  const AUTO_REASON = { once: 'このイベントを「自動」に任せたため', continuous: '連続自動モードがONのため' };
  const MAX_LINEAGES = 4;
  // Stage 4.0: the eight lineages of the primordial ocean. Single cells: nobody hunts well, flies or builds anything yet; they differ in what their bodies do with heat, time, repair and risk.
  const CELLS8 = [
    { id: 'thermo', startRealm: 0, niche: [0.1, 0.1, 0.8], name: '好熱型', color: '#e5586e', text: '熱と圧力に強い原始の細胞。', traits: { tolerance: 0.85, metabolism: 0.55, repairRate: 0.6, predation: 0.05 } },
    { id: 'fast', startRealm: 0, niche: [0.1, 0.8, 0.1], name: '速増型', color: '#f2a03d', text: 'とにかく速く増える。壊れやすい。', traits: { fecundity: 0.95, metabolism: 1.2, repairRate: 0.3, predation: 0.05 } },
    { id: 'sleeper', startRealm: 0, niche: [0.1, 0.2, 0.7], name: '休眠型', color: '#7fd6d6', text: '深く休眠して、飢えや寒暖をやり過ごす。', traits: { metabolism: 0.45, dormancyDepth: 0.08, tolerance: 0.6, predation: 0.05 } },
    { id: 'repairer', startRealm: 0, niche: [0.15, 0.7, 0.15], name: '修復型', color: '#46c28a', text: '傷をよく直し、細胞を入れ替える。維持に費用がかかる。', traits: { repairRate: 0.9, replaceRatio: 0.6, metabolism: 0.8, predation: 0.05 } },
    { id: 'drifter', startRealm: 0, niche: [0.8, 0.1, 0.1], name: '漂流型', color: '#4fa3ff', text: '水に乗って遠くへ広がる。', traits: { movement: 0.85, predation: 0.15 } },
    { id: 'engulfer', startRealm: 0, niche: [0.2, 0.7, 0.1], name: '捕食型', color: '#b38cf0', text: '小さな細胞を取り込んで食べる。', traits: { predation: 0.6, movement: 0.5 } },
    { id: 'shield', startRealm: 0, niche: [0.7, 0.2, 0.1], name: '防御型', color: '#e8d36a', text: '病気と損傷に強い。', traits: { tolerance: 0.7, immune: 0.8, predation: 0.05 } },
    { id: 'generalist', startRealm: 0, niche: [0.34, 0.33, 0.33], name: '汎用型', color: '#c28a6e', text: '特徴のない基準の細胞。', traits: { predation: 0.05 } },
  ];
  // Rivals are other founder types that evolve independently next to the player's focus lineages. Picking them from the
  // seed (never from how well they would do) keeps the choice neutral and repeatable.
  function pickRivals(seed, focusIds, n, roster = CREATURES) {
    const pool = roster.map((c) => c.id).filter((id) => !focusIds.includes(id));
    const keyed = pool.map((id, i) => [Math.sin((seed + 1) * 12.9898 + (i + 1) * 78.233) * 43758.5453 % 1, id]).map(([k, id]) => [k - Math.floor(k), id]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    return keyed.slice(0, Math.max(0, Math.min(n, MAX_LINEAGES - focusIds.length))).map((x) => x[1]);
  }

  // An individual much older than its lineage's usual lifespan (and older than 400 steps) is never carried across a time leap: while one is alive, time runs step by step.
  function leapBlocker(individuals, lifeMeanOf) { for (const x of individuals) if (x.age >= Math.max(400, 4 * lifeMeanOf(x.lin))) return x; return null; }

  function makeGenome(E, creature) {
    const g = E.founderGenome();
    for (const [name, value] of Object.entries(creature.traits || {})) {
      const k = E.TRAITS.findIndex((l) => l[0] === name);
      const make = (w) => { const h = E.cloneGenome(g); h.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[k, w]] }); return h; };
      let lo = -40, hi = 40;
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; }
      g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[k, (lo + hi) / 2]] });
    }
    return g;
  }

  function createGame(E, cfg, saved, resume) {
    const S3 = (cfg.stage === 3 || cfg.stage === 3.1 || cfg.stage === 4) && cfg.ecology === 'v2' && cfg.time === 'adaptive', S31 = S3 && cfg.stage >= 3.1, S4 = S3 && cfg.stage === 4, ROSTER = S4 ? CELLS8 : S3 ? CREATURES7 : CREATURES; // Stage 3.0 world: seven founders, long history, depth habitat
    const focus = S4 ? ROSTER.slice() : cfg.creatures.map((id) => ROSTER.find((c) => c.id === id)).filter(Boolean); // Stage 4.0: every primordial lineage is watched; the lineage in focus is chosen (and changed) on the screen
    const rivalDefs = (cfg.rivals || []).map((id) => ROSTER.find((c) => c.id === id)).filter(Boolean);
    if (!focus.length || (!S4 && focus.length > 3)) throw new Error('1〜3種を選んでください');
    if (!S4 && focus.length + rivalDefs.length > MAX_LINEAGES) throw new Error('系統は合計4つまでです');
    const v2 = cfg.ecology === 'v2'; // v2 = niche-partitioned food, every creature type has a lineage slot, background pools may send immigrants
    const realmsOn = v2 ? true : cfg.realms === true, scenario = cfg.scenario === 'kpg' ? 'kpg' : 'free';
    const creatures = v2 ? ROSTER.slice() : focus.concat(rivalDefs); // index = lineage id in the engine
    const focusIdx = focus.map((c) => creatures.indexOf(c)), rivalIdx = rivalDefs.map((c) => creatures.indexOf(c));
    const initialIdx = v2 ? focusIdx.concat(rivalIdx) : creatures.map((_, i) => i);
    const ever = creatures.map((_, i) => initialIdx.includes(i)); // has this lineage ever had individuals in the arena
    const roleOf = v2 ? (i) => (focusIdx.includes(i) ? 'focus' : rivalIdx.includes(i) ? 'rival' : ever[i] ? 'immigrant' : 'reserve') : (i) => (i < focus.length ? 'focus' : 'rival');
    const tag = (i) => (roleOf(i) === 'rival' ? '（競争相手）' : roleOf(i) === 'immigrant' ? '（移入）' : '');
    const genomeCache = [], genomeOf = (i) => genomeCache[i] || (genomeCache[i] = makeGenome(E, creatures[i]));
    const environment = cfg.environment || 'steady', envDef = ENVIRONMENTS.find((e) => e.id === environment);
    if (!envDef) throw new Error('unknown environment');
    const counts = creatures.map(() => 0); if (v2 && !resume) { const n = initialIdx.length, per = Math.floor(100 / n); initialIdx.forEach((li, k) => { counts[li] = per + (k < 100 - per * n ? 1 : 0); }); }
    const LIGHT = cfg.light === true, TIMING = LIGHT ? LIGHT_TIMING : LEGACY_TIMING;
    const TB = v2 && cfg.time === 'adaptive'; // Stage 2.0 time base (30 days per step, leaps, civilisation, abnormal cells)
    const live = E.simulate({ seed: cfg.seed, steps: 1e9, continueWhenEmpty: v2, ...(TB ? { civ: true, abnormal: true, deathRecordCap: 20000 } : {}), ...(S3 ? { depth: { ...NICHE.engineArrays(0), box: NICHE.makeBox(E), bins: NICHE.BINS } } : {}), ...(S31 ? { v31: S4 ? { codon: true, o2: true, spread: true } : {} } : {}), environment: envDef.engine, resourceRegime: envDef.regime, ...(envDef.scale ? { resourceScale: envDef.scale } : {}), founders: 100, lineageCount: creatures.length,
      founderGenomes: creatures.map((c, i) => genomeOf(i)), sampleEvery: 100, live: true,
      ...(v2 ? { founderCounts: counts, niche: { slots: NICHE_SLOTS, weights: creatures.map((c) => c.niche), specialistBonus: NICHE_BONUS } } : {}),
      realms: realmsOn ? { startByLineage: creatures.map((c) => c.startRealm) } : null });
    const game = { cfg: { ...(LIGHT ? { light: true } : {}), creatures: focus.map((c) => c.id), rivals: rivalDefs.map((c) => c.id), seed: cfg.seed, environment, realms: realmsOn, scenario, ecology: v2 ? 'v2' : 'legacy', ...(v2 && cfg.background === false ? { background: false } : {}), ...(TB ? { time: 'adaptive' } : {}), ...(S4 && cfg.heritage ? { heritage: cfg.heritage } : {}), ...(S3 ? { stage: S4 ? 4 : S31 ? 3.1 : 3, ...(cfg.testStartYears ? { testStartYears: cfg.testStartYears } : {}) } : {}), ...(cfg.checkpoint ? { checkpoint: cfg.checkpoint } : {}) }, creatures, v2, focusCount: focus.length, roleOf, autoContinuous: false, live, events: [], series: [], pending: null, effects: [], log: [], replayTo: null };
    const extinctAt = new Array(creatures.length).fill(null);
    const lti = KEY_TRAITS.map((n) => E.TRAITS.findIndex((l) => l[0] === n));
    const off = S3 ? OFF.create(cfg.seed) : null;
    const wm = TB ? WORLD.create(cfg.seed, S4 ? { history4: true, light: LIGHT, startYears: cfg.testStartYears } : S3 ? { catastrophe: true, light: LIGHT, startYears: cfg.testStartYears } : {}) : null;
    let replayLog = saved ? saved.log.map((e) => ({ ...e })) : null, replayPtr = 0;
    if (saved) { game.replayTo = saved.t; }
    const restoreAuto = () => { if (saved && game.replayTo === null) game.autoContinuous = saved.autoContinuous === true; };
    let seriesStride = 1, seriesCount = 0;
    const bg = v2 && cfg.background !== false ? BG.create(cfg.seed, creatures.map((c, i) => ({ id: c.id, lin: i, niche: c.niche })).filter((g, i) => S4 || !focusIdx.includes(i))) : null; // Stage 4.0: the wide ocean beyond the arena holds every ancestral type and keeps sending them in
    const lsnaps = []; // lineage statistics on the 25-step grid, for window rates
    const peakLin = creatures.map(() => 0), peakRealm = creatures.map(() => [0, 0, 0, 0]), everRealm = creatures.map(() => [false, false, false, false]), bgExtinctSeen = {}, domFlag = {};
    game.rangeSnapshots = [];
    let last = { peak: 100, popAtBranch: 100, shares: null, traits: null, branchT: 0, crisis: false, lastDisasters: 0, lineageDead: new Array(creatures.length).fill(false), dominant: -1, traitFlag: {} };

    // Clock. Generations and the lifespan-based reference time are ACCUMULATED over successive windows, each using that
    // window's own mean generation time / mean lifespan, so a change in lifespan can never move them backwards.
    // These are display estimates in STEPS. They never touch the simulation (see timemodel.js for the unit assumption).
    const clock = { gen: 0, refSteps: 0, t: 0, births: 0, parentAgeSum: 0, deaths: 0, lifeSum: 0, winGenTime: null, winLifespan: null };
    function updateClock(st) {
      const dt = st.t - clock.t; if (dt <= 0) return;
      const db = st.births - clock.births, dd = st.deaths - clock.deaths;
      if (db > 0) clock.winGenTime = (st.parentAgeSum - clock.parentAgeSum) / db; else if (clock.winGenTime === null && st.genTime) clock.winGenTime = st.genTime;
      if (dd > 0) clock.winLifespan = (st.lifeSum - clock.lifeSum) / dd; else if (clock.winLifespan === null && st.meanLifespan) clock.winLifespan = st.meanLifespan;
      if (clock.winGenTime > 0) { const dg = dt / clock.winGenTime; clock.gen += dg; if (clock.winLifespan > 0) clock.refSteps += dg * clock.winLifespan; }
      clock.t = st.t; clock.births = st.births; clock.parentAgeSum = st.parentAgeSum; clock.deaths = st.deaths; clock.lifeSum = st.lifeSum;
    }
    const gen = () => clock.gen;
    game.timeInfo = () => { const st = live.stats(); return { steps: st.t, generations: clock.gen, lifespanReferenceSteps: clock.refSteps, windowGenerationTime: clock.winGenTime, windowLifespan: clock.winLifespan }; };
    const meanTraits = () => {
      const ind = live.individuals(), m = new Array(KEY_TRAITS.length).fill(0), n = ind.length || 1;
      for (const x of ind) for (let i = 0; i < lti.length; i++) m[i] += x.traits[lti[i]];
      return m.map((v) => v / n);
    };
    const MINOR = new Set(['evo', 'immigration', 'disaster', 'local', 'trait']);
    let eventSeq = 0; // a counter that only grows: the log is trimmed from the front, so an index into it cannot be used to ask "what is new since?"
    const addEvent = (kind, text) => { const st = live.stats(); game.events.push({ seq: ++eventSeq, t: st.t, gen: Math.round(gen() * 10) / 10, kind, text, ...(TB ? { y: wm.years } : {}) }); if (game.events.length > 400) { const mi = S4 ? game.events.findIndex((x) => MINOR.has(x.kind)) : -1; if (mi >= 0) game.events.splice(mi, 1); else game.events.shift(); } /* in the long game the noisy kinds go first, so that the history of the world stays */ if (v2 && IMPORTANT.has(kind)) snapshotRanges(kind); };
    // History of the (placeholder) adaptation ranges: one snapshot every 100 steps and one at each important event. The ranges
    // come from game.adaptationProvider, which today is the dummy in adaptation.js; the history is only as real as that provider.
    game.adaptationProvider = AD.provider;
    function snapshotRanges(reason) {
      const t = live.t, S = game.rangeSnapshots, lastSnap = S[S.length - 1]; if (lastSnap && lastSnap.t === t && lastSnap.reason === reason) return;
      S.push({ t, reason, source: game.adaptationProvider.source, lineages: creatures.map((c, i) => ({ lin: i, ...game.adaptationProvider.lineageRange(i, cfg.seed, t) })) });
      if (S.length > 400) { for (let i = 1; i < S.length - 1; i++) if (S[i].reason === 'interval') { S.splice(i, 1); break; } if (S.length > 400) S.splice(1, 1); }
    }
    if (S4) addEvent('start', '開始：原始の海。単細胞の8つの系統が生まれている（開始は約38億年前と仮定した推定。生命の起源の年代には幅がある）');
    else addEvent('start', `開始：${rivalDefs.length ? '注目系統 ' : ''}${focus.map((c) => c.name).join('・')}${rivalDefs.length ? ` ／ 競争相手 ${rivalDefs.map((c) => c.name).join('・')}` : ''}（各${Math.floor(100 / creatures.length)}体前後）／${ENVIRONMENTS.find((e) => e.id === environment).name}`);
    last.traits = meanTraits();
    // Scenario: the impact applies EXTERNAL conditions (food, thermal stress) as a function of the step only; it is refreshed on the
    // fixed 25-step grid so that a replay with different stopping points sees exactly the same conditions. Evolution is not touched.
    function updateScenario() {
      if (scenario !== 'kpg') return; const c = HIST.impactConditions(live.t);
      if (TB) { const a = WORLD.ambient(wm); live.setEnvMod({ resource: c.resource * a.resource, thermal: c.thermal + a.thermal, pathogen: 1 }); } else live.setEnvMod(c);
    }
    if (scenario === 'kpg') {
      updateScenario(); live.disaster(HIST.IMPACT.strikeStrength);
      game.events.push({ t: 0, gen: 0, kind: 'scenario', text: `シナリオ開始：白亜紀末の巨大隕石衝突（${HIST.formatYearsBP(HIST.KPG_AGE_YEARS_BP)}）。衝突直後の食料減少と寒冷化を外部条件として加えます（規模はゲーム上の仮定）。` });
    }

    function record() {
      const st = live.stats();
      if (seriesCount++ % seriesStride !== 0) return;
      game.series.push({ t: st.t, pop: st.population, lin: st.lineageAlive, prey: st.preyFraction, traits: meanTraits(), ...(v2 ? { cog: lineageTraitMeans().map((m) => (m ? cogOf(m.mean) : null)) } : {}) });
      if (v2 && st.t % 100 === 0) snapshotRanges('interval');
      if (v2) { lsnaps.push({ t: st.t, stats: st.lineageStats }); if (lsnaps.length > 12) lsnaps.shift(); }
      if (game.series.length > SERIES_MAX) { game.series = game.series.filter((_, i) => i % 2 === 0); seriesStride *= 2; }
    }
    // ---- Stage 1.9C observations (v2 only). Everything here is read from the engine's own counts; nothing steers the simulation. ----
    const evoIdx = EVO.map((e) => E.TRAITS.findIndex((l) => l[0] === e[0])), evoBase = creatures.map(() => null), evoFlag = creatures.map(() => ({}));
    const popBefore = creatures.map(() => []); // [t, count] history per lineage for the 'same period' sentences
    let ltmT = -1, ltmV = null; const cachedMeans = () => { if (ltmT !== live.t) { ltmV = lineageTraitMeans(); ltmT = live.t; } return ltmV; }; // one pass per step, shared by the 8 lineages' rank metrics
    function lineageTraitMeans() {
      const sum = creatures.map(() => new Array(E.TRAITS.length).fill(0)), cnt = creatures.map(() => 0);
      for (const x of live.individuals()) { cnt[x.lin]++; for (let k = 0; k < x.traits.length; k++) sum[x.lin][k] += x.traits[k]; }
      return creatures.map((_, i) => (cnt[i] ? { count: cnt[i], mean: sum[i].map((v) => v / cnt[i]) } : null));
    }
    const cogOf = (mean) => cognitionIndex((name) => mean[E.TRAITS.findIndex((l) => l[0] === name)]);
    function v2Detect(st) {
      const total = st.population, means = lineageTraitMeans();
      for (let i = 0; i < creatures.length; i++) {
        if (st.lineageAlive[i] > 0) { ever[i] = true; if (last.lineageDead[i]) { last.lineageDead[i] = false; } }
        popBefore[i].push([st.t, st.lineageAlive[i]]); if (popBefore[i].length > 40) popBefore[i].shift();
        if (means[i] && !evoBase[i]) evoBase[i] = { t: st.t, mean: means[i].mean.slice(), cog: cogOf(means[i].mean) };
      }
      // local extinction: a lineage vanishes from one realm while surviving in another
      const ra = st.realmAlive;
      for (let i = 0; i < creatures.length; i++) for (let r = 0; r < 4; r++) {
        const n = ra[r][i];
        if (n > 0) everRealm[i][r] = true;
        else if (everRealm[i][r] && peakRealm[i][r] >= 5 && st.lineageAlive[i] > 0) { everRealm[i][r] = false; addEvent('local', `局所絶滅：${E.REALM_DEFS[r].name}で${creatures[i].name}${tag(i)}が絶えた（他の領域には残っている）`); }
      }
      // dominance (exclusion in progress) and joint collapse
      if (total > 0) for (let i = 0; i < creatures.length; i++) {
        const share = st.lineageAlive[i] / total, others = peakLin.filter((p, k) => p >= 5 && k !== i).length;
        if (share >= 0.9 && others > 0 && !domFlag[i]) { domFlag[i] = true; addEvent('dominance', `独占：${creatures[i].name}${tag(i)}が個体の${Math.round(share * 100)}%を占めた`); }
        else if (share < 0.7 && domFlag[i]) domFlag[i] = false;
      }
      for (let i = 0; i < creatures.length; i++) if (extinctAt[i] === st.t) for (let j = 0; j < creatures.length; j++) if (j !== i && extinctAt[j] !== null && extinctAt[j] !== st.t && Math.abs(extinctAt[j] - st.t) <= 150 && st.lineageAlive[j] === 0 && !last.pairLogged?.[`${Math.min(i, j)}-${Math.max(i, j)}`]) { (last.pairLogged ||= {})[`${Math.min(i, j)}-${Math.max(i, j)}`] = true; addEvent('collapse', `共倒れ：${creatures[j].name}${tag(j)}と${creatures[i].name}${tag(i)}が相次いで絶えた`); }
      // background groups that died out
      if (bg) for (const g of BG.summary(bg)) if (g.extinct && !bgExtinctSeen[g.id]) { bgExtinctSeen[g.id] = true; addEvent('background', `背景の${creatures[g.lin].name}の集団が絶えた（ここからの再侵入はもう起こりません）`); }
      // what changed in each lineage, against the first look at it
      for (let i = 0; i < creatures.length; i++) {
        if (!means[i] || !evoBase[i] || means[i].count < 5) continue;
        EVO.forEach((e, k) => {
          const idx = evoIdx[k], [, mn, mx] = E.TRAITS[idx], delta = means[i].mean[idx] - evoBase[i].mean[idx], shift = delta / (mx - mn), key = e[0] + Math.sign(delta);
          if (Math.abs(shift) >= 0.1 && !evoFlag[i][key]) {
            evoFlag[i][key] = true; evoFlag[i][e[0] + -Math.sign(delta)] = false;
            const ago = popBefore[i].find((p) => p[0] >= st.t - 200) || popBefore[i][0];
            addEvent('trait', `${creatures[i].name}${tag(i)}：${delta > 0 ? e[2] : e[3]}（${evoBase[i].mean[idx].toFixed(2)}→${means[i].mean[idx].toFixed(2)}）。同じ時期に個体数は${ago ? ago[1] : '-'}→${st.lineageAlive[i]}。※この変化が原因かどうかは検証していません`);
          }
        });
      }
    }
    // Immigration from the background pool. Runs on the same 25-step grid as everything else, with its own random stream,
    // so a replay stopping at different points sees identical arrivals.
    let lastBgT = -1;
    function bgTick() {
      if (!bg || live.t === 0 || lastBgT === live.t) return; lastBgT = live.t;
      const st = live.stats(), mod = (scenario === 'kpg' ? HIST.impactConditions(live.t).resource : 1) * bgWorldFactor();
      const r = BG.tick(bg, { dt: DETECT_EVERY, resourceMod: mod, arenaCount: st.realmAlive.map((m) => m.reduce((a, b) => a + b, 0)) });
      for (const im of r.immigrants) {
        const returning = last.lineageDead[im.lin] === true && st.lineageAlive[im.lin] === 0, made = live.introduce(im.lin, genomeOf(im.lin), im.n, im.realm);
        if (made > 0) { const was = ever[im.lin]; ever[im.lin] = true; if (!S4 || returning) addEvent('immigration', `${returning ? '再侵入' : was ? '背景からの追加移入' : '背景からの移入'}：${creatures[im.lin].name}${tag(im.lin)} ${made}個体が${E.REALM_DEFS[im.realm].name}に到達（アリーナ外の背景集団から。進化していない祖先型）`); }
      }
    }

    record();

    // ---- Stage 1.9D: individual-centred records, the alpha-to-Omega rank, checkpoints. Read-only observation of the engine. ----
    const cp = { first: cfg.checkpoint?.first ?? CHECKPOINT.first, every: cfg.checkpoint?.every ?? CHECKPOINT.every };
    let nextCp = cp.first, focusExtinctLogged = false;
    game.checkpoint = null; game.over = false; const msQueue = [];
    const isOver = () => (v2 ? game.over : live.done);
    const legacyReplay = () => !!saved && (saved.v || 1) < 5 && game.replayTo !== null; // saves from Stages 1.8-1.9C have no checkpoints in their logs
    const dsnaps = []; // lineage detail on a 100-step grid, for windowed measures
    const WINDOW = 5000;
    const founderMean = creatures.map(() => null), recordAge = creatures.map(() => ({ age: 0, id: null, t: 0 })), streak = creatures.map(() => 0), firstSeen = creatures.map(() => null);
    game.rank = { lineages: [], current: null, best: null, history: [], byLin: {} };
    function metricsFor(i, st, det) {
      const now = det[i], ref = dsnaps.find((x) => x.t >= st.t - WINDOW) || dsnaps[0];
      const base = ref && ref.t < st.t ? ref.detail[i] : null, bs = ref && ref.t < st.t ? ref.stats[i] : null;
      const diff = (a, b) => a.map((v, k) => v - (b ? b[k] : 0)), sum = (a, x, y) => a.slice(x, y).reduce((p, q) => p + q, 0);
      const hAt = diff(now.hAt, base && base.hAt), hDe = diff(now.hDe, base && base.hDe), youngAt = sum(hAt, 1, 2), oldAt = sum(hAt, 3, 40);
      const young = youngAt ? sum(hDe, 1, 2) / youngAt : null, old = oldAt ? sum(hDe, 3, 40) / oldAt : null;
      const dIn = now.dmgIn - (base ? base.dmgIn : 0), dOut = now.dmgOut - (base ? base.dmgOut : 0), spent = now.spent - (base ? base.spent : 0), indSteps = sum(hAt, 0, 40);
      const intake = st.lineageStats[i].intake - (bs ? bs.intake : 0), wake = now.dormWake - (base ? base.dormWake : 0), dd = now.dormDeaths - (base ? base.dormDeaths : 0);
      const fm = founderMean[i], cm = fm ? cachedMeans()[i] : null, drift = fm && cm ? lti.reduce((a, k, j) => a + Math.abs(cm.mean[k] - fm[j]) / (E.TRAITS[k][2] - E.TRAITS[k][1]), 0) / lti.length : null; // evolved change from the lineage's own starting traits
      return { alive: now.alive, legacy: !LIGHT, drift, observedSteps: firstSeen[i] === null ? 0 : st.t - firstSeen[i], continuity: Math.max(recordAge[i].age, now.maxAgeDead),
        aging: { value: young && old !== null && young > 0 ? old / young : null, young: youngAt, old: oldAt, youngRate: young, oldRate: old },
        repair: { value: dIn > 0 ? dOut / dIn : null }, efficiency: { value: indSteps > 0 ? spent / indSteps : null, intakeRatio: spent > 0 ? intake / spent : 0 },
        range: { value: st.realmAlive ? st.realmAlive.filter((r) => r[i] >= 5).length : 1 }, ...(TB ? { independence: { value: tb.episodes[i] } } : {}), dormancy: { value: wake + dd > 0 ? wake / (wake + dd) : null, episodes: wake + dd }, competition: { value: streak[i] }, windowSteps: ref ? st.t - ref.t : 0 };
    }
    function rankStep(st) {
      const det = live.lineageDetail(), ind = live.individuals(), dt = DETECT_EVERY;
      for (const x of ind) if (x.age > recordAge[x.lin].age) recordAge[x.lin] = { age: x.age, id: x.id, t: st.t };
      for (let i = 0; i < creatures.length; i++) {
        if (st.lineageAlive[i] > 0 && firstSeen[i] === null) { firstSeen[i] = st.t; const lm = lineageTraitMeans()[i]; if (lm) founderMean[i] = lti.map((k) => lm.mean[k]); }
        const comp = st.lineageAlive.some((n, k) => k !== i && n >= 20);
        if (st.lineageAlive[i] < 5) streak[i] = 0; else if (comp) streak[i] += dt;
      }
      const out = [];
      for (let i = 0; i < creatures.length; i++) if (TB ? ever[i] : roleOf(i) === 'focus') { const m = metricsFor(i, st, det), r = RK.evaluate(m); out.push({ lin: i, name: creatures[i].name, role: roleOf(i), metrics: m, ...r }); }
      if (st.t % 100 === 0) dsnaps.push({ t: st.t, detail: det, stats: st.lineageStats }), dsnaps.length > 60 && dsnaps.shift();
      game.rank.lineages = out;
      if (TB) { // per lineage: current, best ever (kept even if the lineage falls back), history. The headline numbers follow the lineage being controlled.
        for (const o of out) {
          const b = game.rank.byLin[o.lin] || (game.rank.byLin[o.lin] = { current: null, best: null, history: [] }); b.current = o.judged ? { rank: o.rank, rankIndex: o.rankIndex } : null;
          if (o.judged && (!b.best || o.rankIndex > b.best.rankIndex)) { const first = !b.best; b.best = { rank: o.rank, rankIndex: o.rankIndex, t: st.t, reason: o.reason }; if (o.lin === controlled && o.rankIndex > 0 && !first) addEvent('rank', `最高ランクを更新：${o.rank}（${o.name}）。${o.reason}`); }
          else if (o.judged && b.current && b.history.length && b.history[b.history.length - 1].rank !== o.rank && o.lin === controlled) addEvent('rank', `ランクが${b.history[b.history.length - 1].rank}から${o.rank}に${o.rankIndex > RK.order.indexOf(b.history[b.history.length - 1].rank) ? '上がった' : '下がった'}（${o.name}）。※過去の最高は${b.best.rank}のまま記録されています`);
          if (o.judged && (!b.history.length || b.history[b.history.length - 1].rank !== o.rank)) b.history.push({ t: st.t, rank: o.rank });
        }
        const cb = game.rank.byLin[controlled]; game.rank.current = cb && cb.current ? { ...cb.current, lin: controlled } : null; game.rank.best = cb && cb.best ? { ...cb.best, lin: controlled } : null; game.rank.history = cb ? cb.history : [];
      }
      const judged = out.filter((o) => o.judged), cur = TB ? null : judged.length ? judged.reduce((a, b) => (b.rankIndex > a.rankIndex ? b : a)) : null, prev = game.rank.current;
      if (!TB) game.rank.current = cur ? { rank: cur.rank, rankIndex: cur.rankIndex, lin: cur.lin } : null;
      if (cur && (!game.rank.best || cur.rankIndex > game.rank.best.rankIndex)) { game.rank.best = { rank: cur.rank, rankIndex: cur.rankIndex, t: st.t, lin: cur.lin, reason: cur.reason }; if (v2 && cur.rankIndex > 0) addEvent('rank', `最高ランクを更新：${cur.rank}（${cur.name}）。${cur.reason}`); }
      else if (v2 && prev && cur && cur.rankIndex !== prev.rankIndex) addEvent('rank', `ランクが${prev.rank}から${cur.rank}に${cur.rankIndex > prev.rankIndex ? '上がった' : '下がった'}（${cur.name}）。※過去の最高は${game.rank.best.rank}のまま記録されています`);
      if (cur && (!game.rank.history.length || game.rank.history[game.rank.history.length - 1].rank !== cur.rank)) game.rank.history.push({ t: st.t, rank: cur.rank });
      if (TB) { if (!controlExtinctLogged[controlled] && peakLin[controlled] >= 5 && st.lineageAlive[controlled] === 0) { controlExtinctLogged[controlled] = true; if (!game.checkpoint && !S4) game.checkpoint = { t: st.t, kind: 'focus-extinct' }; addEvent('lineage', `操作していた${creatures[controlled].name}が絶えました。ほかに生き残っている系統があれば、操作する系統を切り替えられます（敗北条件は未実装。観察は続けられます）`); } }
      else if (v2 && !focusExtinctLogged && focusIdx.length && focusIdx.every((li) => peakLin[li] >= 5 && st.lineageAlive[li] === 0)) { focusExtinctLogged = true; if (legacyReplay()) { /* a save from before this pause existed: the run went on, so replay goes on */ } else { if (!game.checkpoint) game.checkpoint = { t: st.t, kind: 'focus-extinct' }; addEvent('lineage', 'あなたが選んだ系統がすべて絶えました（敗北条件は未実装。観察は続けられます）'); } }
      if (v2) {
        const bgAlive = bg && BG.summary(bg).some((g) => !g.extinct);
        if (st.population === 0 && !bgAlive) {
          if (S3 && OFF.aliveOutside(off)) { // the Earth's biosphere is gone but something that left it is still alive: the game goes on (observation only)
            if (!tb.earthEnded) { tb.earthEnded = true; addEvent('world', '地球の生命圏は終わりました。地球の外へ出て一時的に生き残った系統がいるので、観察は続きます（宇宙での生存は未計算）'); msQueue.push({ cpKind: 'earth-ended', kind: 'earth-ended' }); popMilestone(); }
          } else game.over = true;
        }
      }
    }
    game.topIndividuals = (n = 5) => live.individuals().sort((a, b) => b.age - a.age).slice(0, n).map((x) => ({ ...x, born: live.t - x.age, name: creatures[x.lin].name, role: roleOf(x.lin) }));
    game.records = () => creatures.map((c, i) => ({ lin: i, name: c.name, role: roleOf(i), recordAge: Math.max(recordAge[i].age, live.lineageDetail()[i].maxAgeDead), holder: recordAge[i].id, aliveNow: live.lineageDetail()[i].aliveMaxAge })).filter((r, i) => !v2 || ever[i]);
    // Milestones of the long history (a warning, a catastrophe beginning, its aftermath) each pause the game like any checkpoint. If several fall together they are shown one after another.
    function popMilestone() { if (game.checkpoint || !msQueue.length) return; const m = msQueue.shift(); game.checkpoint = { t: live.t, kind: m.cpKind || (m.kind === 'warning' ? 'warning' : m.kind === 'onset' ? 'catastrophe' : 'aftermath'), ms: m, years: wm.years }; }
    function resolveCheckpoint() { if (game.checkpoint.kind === 'interval') nextCp += cp.every; game.checkpoint = null; popMilestone(); }
    function raiseMilestones() { if (wm && wm.pendingMs && wm.pendingMs.length) { for (const m of wm.pendingMs.splice(0)) if (!m.silent) msQueue.push(m); popMilestone(); } } // a crisis of the past (silent) is told in the log and never pauses
    game.continueFromCheckpoint = () => { if (!game.checkpoint) return false; game.log.push({ t: live.t, kind: 'continue' }); resolveCheckpoint(); return true; };
    game.individualScores = (x) => { const g = (n) => x.traits[E.TRAITS.findIndex((l) => l[0] === n)], nz = (v, lo, hi) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      return { instinct: (g('predation') + g('movement') + (1 - nz(g('falsePositive'), 0.02, 0.5)) + (1 - nz(g('falseNegative'), 0.02, 0.5))) / 4, intelligence: cognitionIndex(g) }; };
    Object.defineProperty(game, 'isOver', { get: () => isOver() });

    // ---- Stage 2.0: the world clock, civilisation, time leaps, strategies and control switching (adaptive time base only) ----
    const YPS = WORLD.YEARS_PER_STEP;
    const tb = TB ? { lastLeapT: 0, leapYears: 0, skipGens: 0, leaps: 0, wc: creatures.map(() => []), fx: null, lastStance: creatures.map(() => 'ignore'), takenTotal: creatures.map(() => 0), harmTotal: creatures.map(() => 0), episode: creatures.map(() => ({ on: false, startY: 0, helped: false })), episodes: creatures.map(() => 0), gapNote: creatures.map(() => false), attackTotal: 0, attackFrac: 0, leapLog: [], blocked: 0, lastBlocker: null } : null;
    const strategies = creatures.map(() => 'none'); let controlled = focusIdx[0];
    const controlExtinctLogged = creatures.map(() => false);
    const TRN = (name, v) => { const k = E.TRAITS.findIndex((l) => l[0] === name), [, mn, mx] = E.TRAITS[k]; return (v - mn) / (mx - mn); };
    const tk = (name) => E.TRAITS.findIndex((l) => l[0] === name);
    function profiles(means) {
      const st = live.stats(); means = means || lineageTraitMeans();
      return creatures.map((c, i) => {
        const m = means[i], g = (n) => (m ? TRN(n, m.mean[tk(n)]) : 0);
        return { lin: i, total: st.lineageAlive[i], abund: [0, 1, 2, 3].map((r) => st.realmAlive[r][i]), traits: { predation: g('predation'), fecundity: g('fecundity'), movement: g('movement'), tolerance: g('tolerance'), immune: g('immune'), repair: g('repairRate'), cog: m ? cogOf(m.mean) : 0 } };
      });
    }
    function worldCtx(st, means) {
      let cog = 0.5; if (means) means.forEach((m, i) => { if (m && m.count >= 5) cog = Math.max(cog, cogOf(m.mean)); });
      const bgUnits = bg ? BG.summary(bg).reduce((a, g) => a + g.units, 0) : 0;
      return { cog, biomass: Math.min(1, Math.max(0.15, (st.population + bgUnits) / 500)) };
    }
    function bgWorldFactor() { if (!TB) return 1; const a = WORLD.ambient(wm), cv = wm.civ.residue.conv; return a.prod * (1 - 0.85 * (cv[0] + cv[1] + cv[2] + cv[3]) / 4); }
    const STANCE_JA = { ignore: '気に留めていない', use: '利用しようとしている', coexist: '共存している', hostile: '敵対している' };
    // ---- life beyond the Earth (offworld.js): only reaching, and temporary survival, are computed ----
    function offProfiles() {
      const st = live.stats(), means = lineageTraitMeans(), ix = (n) => E.TRAITS.findIndex((l) => l[0] === n);
      return creatures.map((c, i) => { const m = means[i], g = (n) => (m ? TRN(n, m.mean[tk(n)]) : 0); return { lin: i, name: c.name, total: st.lineageAlive[i], abund: [0, 1, 2, 3].map((r) => st.realmAlive[r][i]), traits: { tolerance: g('tolerance'), repair: g('repairRate'), movement: g('movement'), metabolism: m ? m.mean[ix('metabolism')] : 1, dormancyDepth: m ? m.mean[ix('dormancyDepth')] : 0.3 } }; });
    }
    function offLog(recs) { for (const r of recs) { addEvent('world', `🚀 ${creatures[r.lin].name}：${OFF.ROUTES[r.route].name}で地球の外へ（${r.note}）${r.status === 'temporary' ? '。一時的には生き残った。宇宙での自律的な生存は未計算' : '。到達したが生き残りは確認できなかった'}`); game.events[game.events.length - 1].sub = 'offworld'; } }
    game.offworld = () => (S3 ? { records: off.records.map((r) => ({ ...r, name: creatures[r.lin].name, routeName: OFF.ROUTES[r.route].name })), summary: OFF.summary(off), earthEnded: !!tb.earthEnded, alive: OFF.aliveOutside(off), notes: '到達と、一時的な生存だけを計算しています。宇宙での自律的な生存は未計算（未実装）です。文明の輸送はΩの条件になりません。' } : null);
    // TEST-ONLY shortcuts (present only when the game is made with testHooks: true; never from the screens, never saved): stage an extinction of the Earth's life, or a record of life that left it.
    if (cfg.testHooks === true) game.testHooks = { killEarth() { live.clear(); if (bg) for (const g of bg.groups) { g.extinct = true; g.B.fill(0); } }, addOffworld(lin, route = 'ejecta', temporary = true) { const r = OFF.add(off, lin, route, wm.years, 1, route === 'transport', temporary, 'テスト用に追加'); offLog([r]); return r; } };
    game.worldMarks = [];
    function worldEvent(e) {
      if (e.kind === 'cat-aftermath') { const st = live.stats(), alive = creatures.map((c, i) => (st.lineageAlive[i] > 0 ? `${c.name}${st.lineageAlive[i]}体` : null)).filter(Boolean); e = { ...e, text: `${e.text}：アリーナで生きている系統は ${alive.join('・') || 'なし'}（実際に計算した個体数）` }; }
      if (S4) crisisHook(e);
      if (S3) { if (e.kind === 'impact') offLog(OFF.ejecta(off, offProfiles(), wm.years, 1)); else if (e.kind === 'cat-onset') { const c = wm.cat.find((x) => x.id === e.cat); if (c.parts.includes('impact') || c.parts.includes('lunar')) offLog(OFF.ejecta(off, offProfiles(), wm.years, (c.parts.includes('impact') ? 1 + c.severity : 0.7))); } }
      addEvent(e.kind.startsWith('civ') ? 'civ' : 'world', e.text); game.events[game.events.length - 1].sub = e.kind; game.worldMarks.push({ y: wm.years, kind: e.kind }); if (game.worldMarks.length > 300) game.worldMarks.shift(); }
    function pushEffects(st, means) {
      const prof = profiles(means), ctx = { prod: WORLD.ambient(wm).prod }, fx = CIVM.effects(wm.civ, prof, strategies, ctx), c = wm.civ.civ;
      const ce = wm.long ? WORLD.catEffects(wm) : null, res = fx.res.slice(), thr = fx.thermal.slice(), pth = fx.pathogen.slice(), hrm = fx.harm.slice();
      if (wm.h4) { const hc = WORLD.h4Conditions(wm); for (let r = 0; r < 4; r++) { res[r] *= hc.res[r]; hrm[r] += hc.harm[r]; } live.setO2(hc.o2); live.setOption('preyHidden', 1 - hc.prey); } // Stage 4.0: oxygen, the poor land and air of the early Earth, ultraviolet
      if (ce) for (let r = 0; r < 4; r++) { res[r] *= ce.res[r]; thr[r] += Math.max(0, ce.dT[r]) / 28.6; pth[r] *= ce.path[r]; hrm[r] += ce.harm[r]; } // heat is hot-stress in the engine; 28.6 K per unit is the same scale the Sun's warming uses
      live.setCiv({ res, thermal: thr, pathogen: pth, harm: hrm, move: fx.move, press: fx.press, cap: fx.cap, subsidy: fx.subsidy }); tb.fx = fx; tb.cat = ce;
      if (S3) { const am = WORLD.ambient(wm), dKs = [0, 1, 2, 3].map((r) => am.warmSolar + am.warmCiv + (ce ? ce.dT[r] : 0)); if (!tb.dK || dKs.some((v, r) => Math.abs(v - tb.dK[r]) > 0.05)) { tb.dK = dKs; live.setDepth(NICHE.engineArrays(dKs)); } }
      for (let i = 0; i < creatures.length; i++) {
        const sc = fx.stances[i] || 'ignore', prev = tb.lastStance[i];
        if (sc !== prev && (st.lineageAlive[i] > 0 || prev !== 'ignore')) { if (c && (sc !== 'ignore' || prev !== 'ignore')) addEvent('civ', `文明は${creatures[i].name}${tag(i)}を${STANCE_JA[sc]}（接触${Math.round((fx.assess[i] ? fx.assess[i].exposure : 0) * 100)}%）`); game.events[game.events.length - 1].sub = 'stance-' + sc; tb.lastStance[i] = sc; }
        // a hostile episode: counted as survived if the lineage is still standing when it ends, no coexistence policy was in force, and it lasted long enough
        const ep = tb.episode[i], hostile = !!c && sc === 'hostile';
        if (hostile && !ep.on) { ep.on = true; ep.startY = wm.years; ep.helped = false; }
        if (ep.on && strategies[i] === 'coexist') ep.helped = true;
        if (ep.on && !hostile) { if (!ep.helped && wm.years - ep.startY >= 2000 && st.lineageAlive[i] >= 5) { tb.episodes[i]++; addEvent('civ', `${creatures[i].name}${tag(i)}は文明の敵対を、支援に頼らず生き延びた（累計${tb.episodes[i]}回）`); } ep.on = false; }
      }
    }
    // one 25-step window of world time: the world models advance by the simulated years, the arena feels the pressures, attackers hurt the civilisation
    function worldWindow() {
      const st = live.stats(), means = lineageTraitMeans(), dy = DETECT_EVERY * YPS;
      const ev = WORLD.advance(wm, dy, worldCtx(st, means)); for (const e of ev) worldEvent(e);
      if (wm.pendingDisaster) { live.disaster(wm.pendingDisaster); wm.pendingDisaster = 0; }
      pushEffects(st, means);
      const take = live.civTake(); let atk = 0;
      for (let l = 0; l < creatures.length; l++) { for (let r = 0; r < 4; r++) { atk += take.attack[l][r]; tb.takenTotal[l] += take.taken[l][r]; tb.harmTotal[l] += take.harm[l][r]; } }
      if (atk > 0) { const f = CIVM.applyAttack(wm.civ, atk, DETECT_EVERY); tb.attackTotal += atk; tb.attackFrac += f; }
      for (let i = 0; i < creatures.length; i++) { tb.wc[i].push([st.t, st.lineageAlive[i]]); if (tb.wc[i].length > 400) tb.wc[i].shift(); }
      if (S3) offStep(dy, st); raiseMilestones(); checkEndOfHistory();
    }
    function offStep(dt, st) { if (!off) return; const air = st.realmAlive[3].some((n) => n >= 5), civT = wm.civ.civ && wm.civ.civ.T >= 8; if (!air && !civT) return; const prof = offProfiles(); if (air) offLog(OFF.selfReach(off, prof, wm.years, dt)); if (civT && tb.fx) offLog(OFF.transport(off, prof, tb.fx.stances, wm.civ.civ, wm.years, dt)); }
    // measured decline over this window (counts first quarter vs last quarter), extrapolated across a leap. Only a fall is extrapolated; nothing is ever grown across a leap.
    function windowGrowth(i) {
      const a = tb.wc[i]; if (a.length < 16) return 0; const q = Math.max(4, a.length >> 2), m = (arr) => arr.reduce((x, y) => x + y[1], 0) / arr.length;
      const f = m(a.slice(0, q)), l = m(a.slice(-q)); if (!(f > 0) || !(l > 0) || l >= 0.5 * f) return 0; // only a clear, sustained fall (the last quarter of the window under half the first) is carried across a leap
      return Math.log(l / f) / Math.max(1, (a[a.length - 1][0] - a[0][0]) * 0.75);
    }
    function lifeMean(i, st) { const s = st.lineageStats[i]; return s.deaths ? s.lifeSum / s.deaths : 25; }
    function leapCheck() {
      if (!TB || live.t < LEAP_FROM || game.pending || game.checkpoint || isOver()) return;
      const st = live.stats(), genSteps = clock.winGenTime || 25, Wreq = st.population === 0 ? DETECT_EVERY : Math.max(TIMING.minGap, Math.min(4000, Math.round(TIMING.genFactor * genSteps))); // with nobody in the arena there is nothing to simulate between leaps
      if (live.t - tb.lastLeapT < Wreq) return;
      const blocker = leapBlocker(live.individuals(), (l) => lifeMean(l, st)); // an exceptionally long-lived individual is never skipped over: while one is alive, time runs step by step
      if (blocker) { tb.blocked++; tb.lastBlocker = { lin: blocker.lin, age: blocker.age, t: st.t }; return; }
      tb.lastBlocker = null;
      const means = lineageTraitMeans(), ctx = worldCtx(st, means); let D = WORLD.safeLeap(wm, ctx); if (st.population < 30) D = Math.min(D, 20000);
      const growth = creatures.map((_, i) => windowGrowth(i)), det = live.lineageDetail(), rec = creatures.map((_, i) => Math.max(recordAge[i].age, det[i].maxAgeDead));
      const ev = WORLD.advance(wm, D, ctx); for (const e of ev) worldEvent(e);
      const rep = live.leap({ steps: D / YPS, growth, minKeep: 3, recordAge: rec });
      const post = () => { // everything that follows the leap (and, in the long game, follows the approximate evolution)
      for (const l of rep.extinct) tb.gapNote[l] = true;
      if (bg) { const k = Math.min(40, Math.max(1, Math.round(D / 5000))), arrived = creatures.map(() => 0); for (let j = 0; j < k; j++) { const r = bgRun(); for (const im of r) arrived[im.lin] += im.made; }
        arrived.forEach((n, l) => { if (n > 0 && !S4) addEvent('immigration', `${creatures[l].name}${tag(l)}：時間の跳躍の間に、アリーナ外の背景集団から合わせて${n}個体が到達（進化していない祖先型）`); }); }
      tb.leapYears += D; tb.leaps++; tb.skipGens += D / (genSteps * YPS); tb.lastLeapT = live.t; tb.wc = creatures.map(() => []);
      tb.leapLog.push({ t: st.t, years: D, atYears: wm.years, extinct: rep.extinct.slice(), extrapolated: growth.map((g, i) => (g < 0 && st.lineageAlive[i] > 0 ? i : -1)).filter((i) => i >= 0), kept: rep.kept.slice(), reseeded: rep.reseeded.slice(), removed: rep.removed.slice() }); if (tb.leapLog.length > 60) tb.leapLog.shift();
      if (wm.pendingDisaster) { live.disaster(wm.pendingDisaster); wm.pendingDisaster = 0; }
      updateScenario(); pushEffects(live.stats(), null); if (S3) offStep(D, live.stats()); raiseMilestones(); checkEndOfHistory();
          };
      if (S4 && startApprox(D / YPS, post)) return 'deferred';
      post();
    }
    // Stage 4.0, APPROXIMATE evolution across a leap: the skipped generations are not computed, but a small number of real steps is run right after each leap with the supply
    // of mutations doubled, so that long stretches of history leave a mark on the lineages. This is a stand-in, labelled as such: it is NOT the evolution of the skipped
    // generations (which number in the millions) and the ledger counts it separately from the steps that were really simulated.
    // The steps are run a few at a time, inside advance(), so that no single frame has to do them all (on a phone 240 steps in one go would freeze the screen). The order of
    // everything is unchanged: nothing else is simulated until they are done, they stop at every logged action of a replay, and what followed the leap follows them.
    let approx = null;
    function startApprox(skippedSteps, post) {
      const E_STEPS = Math.min(TIMING.approxMax, Math.round(skippedSteps / 20000)); if (E_STEPS < 1 || live.stats().population === 0) return false;
      const base = live.options.mutationRate; live.setOption('mutationRate', Math.min(1, base * TIMING.approxMut)); tb.approxLeaps = (tb.approxLeaps || 0) + 1; approx = { left: E_STEPS, base, post, tail: null }; return true;
    }
    function stepApprox(limit) {
      const stop = nextStop(limit), n = Math.min(approx.left, Math.max(1, stop - live.t)); live.step(n); approx.left -= n; tb.approxSteps = (tb.approxSteps || 0) + n;
      applyReplayEntries();
      if (approx.left === 0) { const a = approx; approx = null; live.setOption('mutationRate', a.base); a.post(); (a.tail || afterTail)(); }
    }
    function checkEndOfHistory() { if (S3 && !tb.ended && wm.years >= wm.maxYears - 1) { tb.ended = true; addEvent('world', '観測できる期間の終わりに達しました（約40億年後）。ゲーム内時間はここまでです'); game.over = true; } }
    function bgRun() { // one coarse tick of the background pools during a leap (own random stream; immigrants may arrive in the arena)
      const st = live.stats(), r = BG.tick(bg, { dt: DETECT_EVERY, resourceMod: (scenario === 'kpg' ? HIST.impactConditions(live.t).resource : 1) * bgWorldFactor(), arenaCount: st.realmAlive.map((m) => m.reduce((a, b) => a + b, 0)) });
      const out = []; for (const im of r.immigrants) { const returning = last.lineageDead[im.lin] === true && st.lineageAlive[im.lin] === 0, made = live.introduce(im.lin, genomeOf(im.lin), im.n, im.realm); if (made > 0) { ever[im.lin] = true; out.push({ lin: im.lin, made, returning }); if (returning) addEvent('immigration', `再侵入：${creatures[im.lin].name}${tag(im.lin)} ${made}個体が${E.REALM_DEFS[im.realm].name}に到達（時間の跳躍の間に、アリーナ外の背景集団から）`); } }
      return out;
    }
    function applyStrategy(lin, sName) { strategies[lin] = sName; live.setStance(lin, STRATEGIES[sName].code); addEvent('player', `${creatures[lin].name}の方針を「${STRATEGIES[sName].name}」にした`); }
    function applyControl(lin) { controlled = lin; game.rank.current = null; addEvent('player', `操作する系統を${creatures[lin].name}に切り替えた（世界はそのまま続く）`); }
    game.setStrategy = (lin, sName) => { if (!TB || !STRATEGIES[sName] || !ever[lin] || strategies[lin] === sName) return false; game.log.push({ t: live.t, kind: 'strategy', lin, s: sName }); applyStrategy(lin, sName); return true; };
    game.setControlled = (lin) => { if (!TB || lin === controlled || !ever[lin] || live.stats().lineageAlive[lin] === 0) return false; game.log.push({ t: live.t, kind: 'control', lin }); applyControl(lin); return true; };
    // What was computed and what was skipped, and how the skipped part was bridged. Years of the world clock are never presented as years of evolution.
    game.timeLedger = () => {
      if (!TB) return null; const st = live.stats(), ti = game.timeInfo();
      return { simulatedSteps: st.t, simulatedYears: st.t * YPS, simulatedGenerations: ti.generations, skippedYears: tb.leapYears, leaps: tb.leaps, skippedGenerationsEstimate: tb.skipGens, blockedByLongLived: tb.blocked, daysPerStep: WORLD.DAYS_PER_STEP,
        method: '跳躍の間は、気候・文明・天体衝突・大災厄のモデルだけを、誤差を抑えた可変の刻みで進める。生き物は進化せず、年も取らない。',
        conditions: '長寿な個体（400ステップ以上かつ系統の平均寿命の4倍超）がいない／予告・災厄の開始・事後報告の時刻を飛び越えない／文明がいる間は短い跳躍',
        limits: ['跳躍中の進化・個体の老化は計算していない（省略した世代の数は推定値で、進化の量ではない）', '個体は記録された最長寿命を超える期間は生き延びないものとして子孫に入れ替える', '数が減り続けていた系統は、その減少が続くとして絶滅と判定する（窓の最後の4分の1が最初の半分未満のときだけ）。増加は外挿しない', '跳躍の長さは世界モデルの変化量と出来事の期待数で決まる（収束はテストで確認）'],
        recent: tb.leapLog.slice(-12),
        ...(S4 ? { approximateEvolution: { steps: tb.approxSteps || 0, leaps: tb.approxLeaps || 0, method: '跳躍のあと、実際の世代の代わりに最大240ステップだけ、突然変異の供給を2倍にして計算する近似。省略した世代（数百万世代）の進化を計算したものではない', counted: 'シミュレーションしたステップとは別に数える' } } : {}) };
    };
    // The temperature x pressure habitat, all of it computed: the columns (shifted by the climate and any catastrophe), each lineage's tolerance box from its evolved traits,
    // where the individuals actually are (depth bins), and which bins suit the lineage being controlled.
    game.habitatInfo = (lin = controlled) => {
      if (!S3) return null; const dist = live.depthDist(), means = lineageTraitMeans(), amb = WORLD.ambient(wm), ce = WORLD.catEffects(wm), bx = NICHE.makeBox(E);
      const dK = [0, 1, 2, 3].map((r) => amb.warmSolar + amb.warmCiv + (ce ? ce.dT[r] : 0));
      const realms = NICHE.REALM_IDS.map((id, r) => { const prof = NICHE.profile(id, dK[r]); return prof ? { id, r, T: prof.T, P: prof.P, res: prof.res, dK: dK[r] } : null; });
      const boxes = creatures.map((c, i) => { const m = means[i]; if (!m) return null; const o = new Float64Array(4), d = new Float64Array(4); bx(m.mean, false, o); bx(m.mean, true, d); return { active: Array.from(o), dormant: Array.from(d), count: m.count }; });
      const suit = boxes[lin] ? realms.map((rl) => (rl ? NICHE.suitability(boxes[lin].active, rl) : null)) : null;
      return { realms, dK, boxes, dist, suit, segments: suit ? suit.map((x) => (x ? NICHE.segments(x) : null)) : null, controlled: lin, linkedToEvolution: true,
        note: '箱（適応可能領域）は、いまの系統の平均的な形質（耐性・代謝・修復・休眠）から計算した許容範囲です。点は、実際にその深さ・高さにいる個体です。箱の外の場所では毎ステップ損傷を受けます。箱の中心は進化しません（広さだけ進化します）。温度と圧力の柱は、ゲーム上の仮定（実際の海・地殻・大気をなぞった形）です。' };
    };
    game.rankChecklist = () => { const l = game.rank.lineages.find((x) => x.lin === controlled); return l ? RK.checklist(l, l.metrics) : null; };
    game.rankProgress = () => { const l = game.rank.lineages.find((x) => x.lin === controlled); return l ? RK.progress(l, l.metrics) : null; };
    game.strategies = () => strategies.slice();
    // What the controlled lineage faces: danger per realm (0..1) from capture hazard, damage and habitat loss, and the overall level.
    game.threat = () => {
      if (!TB || !tb.fx) return null; const l = controlled, fx = tb.fx, c = wm.civ.civ, a = fx.assess[l];
      const danger = [0, 1, 2, 3].map((r) => Math.min(1, fx.cap[l][r] * 12 + fx.harm[r] * 8 + (1 - fx.res[r]) * 0.35));
      const lvl = Math.max(...danger), level = !c && lvl < 0.05 ? 0 : lvl < 0.1 ? 1 : lvl < 0.35 ? 2 : 3;
      return { lin: l, civAlive: !!c, stance: fx.stances[l], exposure: a ? a.exposure : 0, danger, level, safestRealm: danger.indexOf(Math.min(...danger)), strategy: strategies[l], war: fx.war };
    };
    Object.defineProperty(game, 'controlled', { get: () => controlled });
    game.isAdaptive = TB;
    game.worldInfo = () => {
      if (!TB) return null; const c = wm.civ.civ, r = wm.civ.residue, a = WORLD.ambient(wm), st = live.stats(), simYears = st.t * YPS;
      return { presentYears: wm.presentYears || null, years: wm.years, simulatedYears: simYears, leapYears: tb.leapYears, bp: WORLD.bp(wm), bpText: WORLD.formatBP(wm), elapsedText: WORLD.jaYears(wm.years), leaps: tb.leaps, blocked: tb.blocked, blocker: tb.lastBlocker,
        generations: clock.gen, skippedGenerations: tb.skipGens, daysPerStep: WORLD.DAYS_PER_STEP,
        climate: { warm: a.warm, solar: a.warmSolar, civil: a.warmCiv, luminosity: WORLD.luminosity(-WORLD.bp(wm)) },
        civ: c ? { id: c.id, N: c.N, T: c.T, stage: CIVM.stageName(c.T), S: c.S, phase: c.phase, war: c.war, collapses: c.collapses, born: c.born, ageYears: wm.years - c.born, reach: CIVM.reach(c.T) } : null,
        residue: { pollution: r.pollution, conv: r.conv.slice(), stock: r.stock, legacy: r.legacy }, history: wm.civ.history.slice(), count: wm.civ.count, impacts: wm.impacts, volcs: wm.volcs,
        maxYears: S3 ? wm.maxYears : null, stage3: S3, stage31: S31, stances: tb.fx ? tb.fx.stances.slice() : null, attackTotal: tb.attackTotal, attackFrac: tb.attackFrac, emergenceRate: CIVM.emergenceRate(wm.civ, { ...worldCtx(st, lineageTraitMeans()), prod: a.prod, warm: a.warm }) };
    };
    // The great catastrophes as the player may see them: the standing forecasts (with what they would mean for the lineage being controlled) and every crisis's state.
    game.catInfo = () => {
      if (!S3) return null; const fcs = WORLD.activeForecasts(wm), status = WORLD.catStatus(wm), mean = lineageTraitMeans()[controlled], amb = WORLD.ambient(wm), ce = WORLD.catEffects(wm), box = new Float64Array(4);
      const have = !!mean; if (have) NICHE.makeBox(E)(mean.mean, false, box);
      const dK = (r) => amb.warmSolar + amb.warmCiv + (ce ? ce.dT[r] : 0), surfT = (r) => (r === 1 ? NICHE.TREF : NICHE.profile(NICHE.REALM_IDS[r], 0).T[0]) + dK(r);
      const forecasts = fcs.map((f) => {
        const realms = [0, 1, 2, 3].map((r) => {
          const id = NICHE.REALM_IDS[r], heat = f.realmHeatK[r], cold = f.realmColdK[r], Ts = surfT(r), res = f.realmRes[r];
          let bins = null; if (have && id !== 'land') { const prof = NICHE.profile(id, dK(r) + heat); bins = NICHE.segments(NICHE.suitability(box, prof)).reduce((a, [x, y]) => a + (y - x + 1), 0); }
          return { realm: r, id, resMul: res, heatK: heat, tMax: Ts + heat, tMin: Ts + cold, marginHeat: have ? box[1] - (Ts + heat) : null, marginCold: have ? Ts + cold - box[0] : null, habitableBins: bins, safe: have && res >= 0.4 && box[1] - (Ts + heat) >= 0 && Ts + cold - box[0] >= 0 && (bins === null || bins > 0) };
        });
        const needs = []; if (realms.some((x) => x.heatK > 3)) needs.push('heat'); if (realms.some((x) => x.resMul < 0.5)) needs.push('food'); if (f.pathogen.some((v) => v > 1.2)) needs.push('disease'); if (realms.some((x) => x.heatK < -3 || x.marginCold !== null && x.marginCold < 0)) needs.push('cold');
        return { ...f, advice: { lineage: controlled, name: creatures[controlled].name, realms, safeRealms: realms.filter((x) => x.safe).map((x) => x.realm), needs, box: have ? { Tlo: box[0], Thi: box[1], Pmin: box[2], Pmax: box[3] } : null } };
      });
      return { forecasts, status, years: wm.years };
    };
    game.strategyReport = () => creatures.map((c, i) => ({ lin: i, name: c.name, role: roleOf(i), strategy: strategies[i], stance: tb && tb.fx ? tb.fx.stances[i] : null, assess: tb && tb.fx ? tb.fx.assess[i] : null, takenByCivilisation: tb ? tb.takenTotal[i] : 0, harmByCivilisation: tb ? tb.harmTotal[i] : 0, episodesSurvived: tb ? tb.episodes[i] : 0 })).filter((r, i) => ever[i]);
    // Units (U): the picture counts 10 arena individuals as 1 U and 10 background units as 1 U. They are kept apart and never summed into one number elsewhere.
    game.units = () => {
      const st = live.stats(), out = { perUnit: 10, realms: [0, 1, 2, 3].map(() => creatures.map(() => ({ arenaIndividuals: 0, backgroundUnits: 0 }))) };
      for (let r = 0; r < 4; r++) for (let i = 0; i < creatures.length; i++) out.realms[r][i].arenaIndividuals = st.realmAlive[r][i];
      if (bg) for (const g of BG.summary(bg)) for (let r = 0; r < 4; r++) out.realms[r][g.lin].backgroundUnits = g.byRealm[r];
      out.arenaIndividuals = st.population; out.backgroundUnits = bg ? BG.summary(bg).reduce((a, g) => a + g.units, 0) : 0;
      out.note = '1U＝アリーナの実個体10体、または背景集団10単位（個体相当）。計算していない世界全体の個体数は示しません。'; return out;
    };

    function detect() {
      const st = live.stats(), total = st.population; updateClock(st);
      if (v2) for (let i = 0; i < creatures.length; i++) { peakLin[i] = Math.max(peakLin[i], st.lineageAlive[i]); for (let r = 0; r < 4; r++) peakRealm[i][r] = Math.max(peakRealm[i][r], st.realmAlive[r][i]); }
      last.peak = Math.max(last.peak, total);
      if (st.disasters > last.lastDisasters) { if (!TB || st.population > 0) addEvent('disaster', `災害が起きた（累計${st.disasters}回）`); last.lastDisasters = st.disasters; }
      for (let i = 0; i < creatures.length; i++) if (st.lineageAlive[i] === 0 && !last.lineageDead[i] && creatures.length > 1 && (!v2 || peakLin[i] >= 5)) { last.lineageDead[i] = true; extinctAt[i] = st.t; addEvent('lineage', `${creatures[i].name}${tag(i)}の系統が絶えた${tb && tb.gapNote[i] ? '（時間の跳躍の間に、個体数の減少が続くと外挿して絶滅と判定）' : ''}`); if (tb) tb.gapNote[i] = false; }
      if (creatures.length > 1 && total > 0) { let d = 0; for (let i = 1; i < creatures.length; i++) if (st.lineageAlive[i] > st.lineageAlive[d]) d = i; if (d !== last.dominant && (!TB || last.dominant < 0 || st.lineageAlive[last.dominant] === 0 || st.lineageAlive[d] >= 1.3 * st.lineageAlive[last.dominant])) { if (last.dominant >= 0) addEvent('lineage', `最大の系統が${creatures[last.dominant].name}${tag(last.dominant)}から${creatures[d].name}${tag(d)}に交代`); last.dominant = d; } }
      if (total > 0 && total < 30 && !last.crisis) { last.crisis = true; addEvent('crisis', `個体数が${total}体まで減った`); }
      if (last.crisis && total >= 60) last.crisis = false;
      const tm = meanTraits();
      if (v2) v2Detect(st);
      else for (let i = 0; i < KEY_TRAITS.length; i++) {
        const [, mn, mx] = E.TRAITS[lti[i]], shift = (tm[i] - last.traits[i]) / (mx - mn);
        const key = KEY_TRAITS[i];
        if (Math.abs(shift) >= 0.1 && !last.traitFlag[key + Math.sign(shift)]) { last.traitFlag[key + Math.sign(shift)] = true; addEvent('trait', `${TRAIT_JA[key]}が${shift > 0 ? '上がり' : '下がり'}始めた（${last.traits[i].toFixed(2)}→${tm[i].toFixed(2)}）`); }
      }
      record();
      rankStep(st);
      if (!game.pending && st.t >= FIRST_BRANCH && st.t - last.branchT >= MIN_BRANCH_GAP && total > 0 && !isOver()) {
        let why = null;
        if (total < 40 && total < 0.35 * last.peak) why = { kind: 'crisis', title: '存続の危機', text: `個体数が${total}体まで減った（最大${last.peak}体）。` };
        else if (total >= 250 && total >= 2.5 * last.popAtBranch) why = { kind: 'boom', title: '個体数の急増', text: `個体数が${total}体に増えた。資源が足りなくなるかもしれない。` };
        else if (creatures.length > 1) {
          const sh = st.lineageAlive.map((c) => c / total);
          if (last.shares && sh.some((v, i) => Math.abs(v - last.shares[i]) >= 0.25)) { const i = sh.findIndex((v, k) => Math.abs(v - last.shares[k]) >= 0.25); why = { kind: 'lineage', title: '系統の勢力交代', text: `${creatures[i].name}${tag(i)}の割合が${Math.round(last.shares[i] * 100)}%から${Math.round(sh[i] * 100)}%になった。` }; }
        }
        if (!why) { for (let i = 0; i < KEY_TRAITS.length; i++) { const [, mn, mx] = E.TRAITS[lti[i]]; if (Math.abs(tm[i] - last.traits[i]) / (mx - mn) >= 0.2) { why = { kind: 'drift', title: '形質の分岐', text: `${TRAIT_JA[KEY_TRAITS[i]]}が${last.traits[i].toFixed(2)}から${tm[i].toFixed(2)}に動いた。` }; break; } } }
        if (!why && !S31 && st.t - last.branchT >= CHECKPOINT_GAP) why = { kind: 'checkpoint', title: '節目', text: `${st.t}ステップ。いまの様子を見て、環境に手を入れるか決めよう。` };
        if (why && S31) { addEvent('branch', `${why.title}：${why.text}`); resolveBranch(); } // Stage 3.1: no environmental intervention; the note stays, the pause and the choice are gone
        else if (why) {
          const ids = why.kind === 'crisis' ? ['watch', 'support', 'refuge'] : ['watch', 'support', 'refuge', 'disaster'];
          game.pending = { ...why, t: st.t, options: ids.concat(['auto']).map((id) => OPTIONS[id]) };
          addEvent('branch', `分岐点：${why.title}`);
          if (game.autoContinuous && game.replayTo === null) game.choose('auto', 'continuous'); // never while replaying: the log decides then
        }
      }
    }

    function applyEffect(kind, reason) {
      const st = live.stats();
      if (kind === 'support') { live.setOption('preyInflow', 0.065); upsert('support', st.t + OPTIONS.support.duration); addEvent('player', '食料を支援した'); }
      else if (kind === 'refuge') { live.setOption('preyHidden', 0.3); upsert('refuge', st.t + OPTIONS.refuge.duration); addEvent('player', '保護区を作った'); }
      else if (kind === 'disaster') { live.disaster(1.2); addEvent('player', '災害を起こした'); }
      else if (kind === 'watch') addEvent('player', '見守ることにした');
      else if (kind === 'auto') addEvent('player', `自動：中立的に「見守る」を選んだ（理由：${AUTO_REASON[reason] || AUTO_REASON.once}）`);
    }
    function upsert(kind, until) { const e = game.effects.find((x) => x.kind === kind); if (e) e.until = Math.max(e.until, until); else game.effects.push({ kind, until }); }
    function expire() {
      for (const e of game.effects.slice()) if (live.t >= e.until) {
        game.effects.splice(game.effects.indexOf(e), 1);
        if (e.kind === 'support') live.setOption('preyInflow', 0); else if (e.kind === 'refuge') live.setOption('preyHidden', 0);
        addEvent('player', e.kind === 'support' ? '食料支援が終わった' : '保護区が解除された');
      }
    }
    function resolveBranch() { const st = live.stats(); last.branchT = st.t; last.popAtBranch = st.population; last.peak = st.population; last.shares = st.population ? st.lineageAlive.map((c) => c / st.population) : null; last.traits = meanTraits(); last.traitFlag = {}; }

    game.apply = (action) => { // internal and logged; the UI reaches it only through choose()
      game.log.push({ t: live.t, kind: action.kind }); applyEffect(action.kind); return true;
    };
    game.choose = (id, reason) => {
      if (!game.pending || !game.pending.options.some((o) => o.id === id)) return false;
      const entry = { t: live.t, kind: 'choice', id }; if (id === 'auto') entry.r = reason === 'continuous' ? 'continuous' : 'once';
      game.log.push(entry); game.pending = null; resolveBranch(); applyEffect(id, entry.r); return true;
    };
    game.setAutoContinuous = (on) => { game.autoContinuous = !!on; };
    const nextStop = (limit) => {
      let stop = Math.min(limit, (Math.floor(live.t / DETECT_EVERY) + 1) * DETECT_EVERY);
      for (const e of game.effects) if (e.until > live.t) stop = Math.min(stop, e.until);
      if (nextCp > live.t) stop = Math.min(stop, nextCp);
      if (replayLog) for (let i = replayPtr; i < replayLog.length; i++) if (replayLog[i].t > live.t) { stop = Math.min(stop, replayLog[i].t); break; }
      return stop;
    };
    function afterSegment() {
      expire();
      if (live.t % DETECT_EVERY === 0) { updateScenario(); bgTick(); if (TB && live.t > 0) { worldWindow(); if (leapCheck() === 'deferred') { approx.tail = afterTail; return; } } }
      afterTail();
    }
    function afterTail() {
      if (live.t % DETECT_EVERY === 0 || live.done) detect();
      if (S31 && live.t % DETECT_EVERY === 0) evoNotes();
      if (live.t === nextCp && !game.checkpoint) { if (legacyReplay()) nextCp += cp.every; else game.checkpoint = { t: live.t, kind: 'interval' }; }
      applyReplayEntries();
    }
    function applyReplayEntries() {
      if (replayLog) {
        while (replayPtr < replayLog.length && replayLog[replayPtr].t === live.t) {
          const e = replayLog[replayPtr++];
          if (e.kind === 'continue') { if (game.checkpoint) { game.log.push({ ...e }); resolveCheckpoint(); } }
          else if (e.kind === 'strategy') { game.log.push({ ...e }); applyStrategy(e.lin, e.s); }
          else if (e.kind === 'control') { game.log.push({ ...e }); applyControl(e.lin); }
          else if (e.kind === 'target') { game.log.push({ ...e }); applyTarget(e.lin, e.tg, e.s); }
          else if (e.kind === 'choice') { if (game.pending) { game.log.push({ ...e }); game.pending = null; resolveBranch(); applyEffect(e.id, e.r); } } else { game.log.push({ ...e }); applyEffect(e.kind); }
        }
        if (replayPtr >= replayLog.length && game.replayTo !== null && live.t >= game.replayTo) { replayLog = null; game.replayTo = null; restoreAuto(); }
      }
    }
    game.advance = (n) => {
      let limit = live.t + n; if (game.replayTo !== null) limit = Math.min(limit, game.replayTo);
      let guard = 0;
      while (live.t < limit && !isOver() && !game.pending && !game.checkpoint && guard++ < 100000) {
        if (approx) { stepApprox(limit); continue; }
        const target = nextStop(limit);
        live.step(target - live.t);
        afterSegment();
      }
      if (game.replayTo !== null && live.t >= game.replayTo && !isOver()) { replayLog = null; game.replayTo = null; restoreAuto(); }
      return live.t;
    };
    Object.defineProperty(game, 't', { get: () => live.t });

    // ======== Stage 3.1 ========
    // (1) Stances toward three kinds of others, set per lineage (the player never touches the environment).
    //     civ    : an intelligent civilisation (the existing hostile / coexist / avoid / defend)
    //     plant  : plants and other fixed organisms (fungi, sessile animals, ...). Grouped by how they live, not by taxon.
    //     animal : other animals (prey and rivals)
    //     A stance does nothing by itself: the engine checks whether the body can carry it out (see capability below); without the means it is wasted effort.
    const TARGETS = {
      civ: { name: '知性文明', list: [['none', '方針なし', '・'], ['attack', '敵対', '✕'], ['coexist', '共存', '＝'], ['flee', '回避', '↘'], ['defend', '防御', '◇']] },
      plant: { name: '植物・固着生物', list: [['none', '方針なし', '・'], ['use', '捕食・利用', '▽'], ['symbiosis', '共生', '＝'], ['avoid', '回避', '↘'], ['compete', '競争', '✕']] },
      animal: { name: '他の動物', list: [['none', '方針なし', '・'], ['hunt', '捕食・敵対', '✕'], ['coexist', '共存', '＝'], ['avoid', '回避', '↘'], ['defend', '防御', '◇']] },
    };
    const tg = { plant: creatures.map(() => 'none'), animal: creatures.map(() => 'none') };
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    function traitOf(m, n) { return m.mean[E.TRAITS.findIndex((l) => l[0] === n)]; }
    // how well the lineage's body can carry out a stance (0..1), from the same traits the engine reads. Below 0.3 the engine counts the attempt as a failure.
    function capability(lin, target, name) {
      const m = lineageTraitMeans()[lin]; if (!m) return null; const g = (n) => traitOf(m, n), mn = clamp01((g('metabolism') - 0.2) / 1.4);
      const table = {
        civ: { none: 1, attack: g('predation'), coexist: 1, flee: g('movement'), defend: (g('tolerance') + g('immune') + g('repairRate')) / 3 },
        plant: { none: 1, use: 0.5 * g('movement') + 0.5 * mn, symbiosis: 0.5 * g('immune') + 0.5 * g('tolerance'), avoid: 1, compete: 0.5 * mn + 0.5 * g('movement') },
        animal: { none: 1, hunt: g('predation'), coexist: 1, avoid: 1, defend: 0.5 * g('tolerance') + 0.5 * g('repairRate') },
      };
      const v = table[target][name]; return v === undefined ? null : v;
    }
    const needText = { civ: { attack: '捕食力', flee: '移動力', defend: '耐性・免疫・修復' }, plant: { use: '移動力と代謝', symbiosis: '免疫と耐性', compete: '代謝と移動力' }, animal: { hunt: '捕食力', defend: '耐性と修復' } };
    function applyTarget(lin, tgt, name) {
      if (tgt === 'civ') return applyStrategy(lin, name);
      const code = TARGETS[tgt].list.findIndex((x) => x[0] === name); tg[tgt][lin] = name; live.setTarget(lin, tgt, code);
      addEvent('player', `${creatures[lin].name}の「${TARGETS[tgt].name}」への方針を「${TARGETS[tgt].list[code][1]}」にした`);
    }
    game.setTarget = (lin, tgt, name) => {
      if (!S31 || !TARGETS[tgt] || !TARGETS[tgt].list.some((x) => x[0] === name) || !ever[lin]) return false;
      if (tgt === 'civ') return game.setStrategy(lin, name);
      if (tg[tgt][lin] === name) return false;
      game.log.push({ t: live.t, kind: 'target', lin, tg: tgt, s: name }); applyTarget(lin, tgt, name); return true;
    };
    game.targetInfo = (lin = controlled) => {
      if (!S31) return null;
      const cur = { civ: strategies[lin], plant: tg.plant[lin], animal: tg.animal[lin] };
      return { lin, name: creatures[lin].name, targets: Object.keys(TARGETS).map((k) => ({ id: k, name: TARGETS[k].name, current: cur[k], options: TARGETS[k].list.map(([id, label, icon]) => { const cap = capability(lin, k, id); return { id, label, icon, capability: cap, canDo: cap === null ? null : cap >= 0.3, needs: (needText[k] || {})[id] || null }; }) })),
        note: '方針は、その系統の行動の傾向を決めます。必要な能力が足りない方針は、実行しても失敗します（成功は保証されません）。別の系統に切り替えると、その系統の設定が表示されます。' };
    };
    // (2) Dominance over the environment ("環境支配力"). NOT a head count, and nothing here is scaled by how many individuals there are.
    //     use      how much of the energy it needs one individual actually takes in (per individual per step)
    //     impact   how much one individual affects others (captures per individual per step)
    //     persist  how long an individual typically lives
    //     range    how much of the world it can live in (the box over all depth bins) and where it actually lives (realms with a standing population)
    //     Not computed yet: dependence on, or effect on, other species beyond the above.
    //     Weights (0.35 / 0.15 / 0.25 / 0.25) and the scales below are game settings. Fewer than 5 living individuals marks the figure as unreliable; it is not changed.
    const DOM = { w: { use: 0.35, impact: 0.15, persist: 0.25, range: 0.25 }, useScale: 0.6, impactScale: 0.06, lifeScale: 100 };
    game.DOM = DOM;
    function fundamentalFraction(i, H) {
      const b = H.boxes[i]; if (!b) return null; let ok = 0, n = 0;
      H.realms.forEach((rl, r) => { if (rl) { const sv = NICHE.suitability(b.active, rl); for (const v of sv) { n++; if (v >= 0.75) ok++; } } else { n++; const T = NICHE.TREF + H.dK[r]; if (T >= b.active[0] && T <= b.active[1]) ok++; } });
      return n ? ok / n : null;
    }
    game.dominance = () => {
      if (!S31) return null; const st = live.stats(), H = game.habitatInfo(controlled);
      return creatures.map((c, i) => {
        if (!ever[i]) return null; const alive = st.lineageAlive[i], w = game.lineageWindow(i, 200);
        if (!alive || !w) return { lin: i, alive, value: alive ? null : 0, parts: null, reliable: false };
        const realised = st.realmAlive.filter((m) => m[i] > 0).length / 4, fund = fundamentalFraction(i, H);
        const parts = { use: clamp01(w.intakePerIndividual / DOM.useScale), impact: clamp01(w.catchRate / DOM.impactScale), persist: clamp01((w.lifespanRecent === null ? 0 : w.lifespanRecent) / DOM.lifeScale), range: 0.5 * realised + 0.5 * (fund === null ? realised : fund) };
        const value = DOM.w.use * parts.use + DOM.w.impact * parts.impact + DOM.w.persist * parts.persist + DOM.w.range * parts.range;
        return { lin: i, alive, value, parts, realised, fundamental: fund, reliable: alive >= 5, note: '個体数は含みません' };
      });
    };
    // (3) Evolution events: mutation, internalised symbionts (fusion), their release (separation) and single-gene exchange, with occurrence / establishment / loss told apart.
    const KIND_JA = { mutation: '突然変異', exchange: '機能交換', fusion: '融合（共生体の内部化）', separation: '分離（共生体の放出）' };
    const SUB_JA = { strengthen: '強まった', weaken: '弱まった', newcap: '新しい働きが現れた', alter: '働きが変質した', loss: '失われた', behaviour: '行動が変わった', symbiont: '', release: '', inter: '別の系統から', intra: '同じ系統内で' };
    const TRAIT_ALL_JA = { ...TRAIT_JA, replaceRatio: '細胞の入れ替え', falsePositive: '誤認（空振り）', falseNegative: '見落とし', memoryLearn: '学習', memoryUpkeep: '記憶の維持', switchThreshold: '行動の切り替え', rhythmPeriod: '活動の周期', rhythmPhase: '活動の位相', storage: '貯蔵' };
    let lastEvoLog = -1e9; const evoLogT = new Map(), evoSeen = new Map(), evoY = new Map(), lineageEnds = creatures.map(() => []);
    function evoText(e, phase) {
      const nm = creatures[e.lin].name, tr = e.trait ? TRAIT_ALL_JA[e.trait] || e.trait : null;
      if (e.kind === 'mutation') { const what = e.sub === 'strengthen' ? `${tr || '体質'}が強まった` : e.sub === 'weaken' ? `${tr || '体質'}が弱まった` : e.sub === 'newcap' ? `新しい働きが加わった${tr ? '（' + tr + 'に影響）' : ''}` : e.sub === 'loss' ? '働きが失われた' : '働きが変質した'; return `${nm}：突然変異で${what}${phase === 'established' ? '（定着）' : ''}`; }
      if (e.kind === 'exchange') return `${nm}：${SUB_JA[e.sub]}遺伝子を1つ受け取った（${e.via === 'infection' ? '感染を介して' : '接触で'}）${phase === 'established' ? '（定着）' : ''}`;
      if (e.kind === 'fusion') return `${nm}：${creatures[e.from].name}の遺伝子を共生体として内部に取り込んだ${phase === 'established' ? '（定着）' : ''}`;
      return `${nm}：取り込んでいた共生体の遺伝子を手放した個体が現れた${phase === 'established' ? '（定着）' : ''}`;
    }
    const trails = creatures.map(() => []); // each lineage's mean key traits every 200 steps: the route it has taken (a record, nothing steers by it)
    function evoNotes() {
      if (S4) recordsTick();
      if (live.t % 200 === 0) { const mm = lineageTraitMeans(); mm.forEach((m, i) => { if (m && m.count >= 3) { trails[i].push([live.t, lti.map((k) => m.mean[k])]); if (trails[i].length > 240) trails[i] = trails[i].filter((_, j) => j % 2 === 0); } }); }
      const ev = live.evo(); if (!ev) return; let budget = S4 ? 1 : 3;
      if (S4 && live.t % 400 === 0) { const ids = new Set(ev.events.map((e) => e.id)); for (const id of evoSeen.keys()) if (!ids.has(id)) { evoSeen.delete(id); evoY.delete(id); } } // events that fell out of the engine's list are forgotten here too
      for (const e of ev.events) {
        const prev = evoSeen.get(e.id);
        if (prev === undefined) { evoSeen.set(e.id, e.status); evoY.set(e.id, wm ? wm.years : 0); if (!S4 && budget > 0 && (e.kind !== 'mutation' || e.sub === 'newcap') && ever[e.lin]) { budget--; addEvent('evo', evoText(e, 'occurred')); } }
        else if (prev !== e.status) { evoSeen.set(e.id, e.status); if (e.status === 'established' && ever[e.lin] && (e.kind !== 'mutation' || e.sub === 'newcap' || Math.abs(e.delta) >= 0.15)) { const tx = evoText(e, 'established'); if (S4) { if (budget > 0 && live.t - lastEvoLog >= 150 && !(evoLogT.has(tx) && live.t - evoLogT.get(tx) < 1200)) { budget--; lastEvoLog = live.t; evoLogT.set(tx, live.t); addEvent('evo', tx); } } else addEvent('evo', tx); } }
      }
    }
    game.evoReport = () => {
      if (!S31) return null; const ev = live.evo(), by = (kind, st) => ev.events.filter((e) => e.kind === kind && (!st || e.status === st)).length;
      const recent = ev.events.slice(-30).reverse().map((e) => ({ id: e.id, t: e.t, kind: e.kind, kindJa: KIND_JA[e.kind], lin: e.lin, name: creatures[e.lin].name, status: e.status, carriers: e.carriers, text: evoText(e, e.status), inter: e.kind === 'exchange' ? e.sub === 'inter' : e.kind === 'fusion' }));
      const total = ev.counts.reduce((a, c) => { for (const k in c) a[k] = (a[k] || 0) + c[k]; return a; }, {});
      return { counts: total, byLineage: ev.counts, tracked: ev.events.length,
        status: { occurred: ev.events.filter((e) => e.status === 'occurred').length, established: ev.events.filter((e) => e.status === 'established').length, lost: ev.events.filter((e) => e.status === 'lost' || e.status === 'faded').length },
        fusions: total.fusion || 0, fusionsEstablished: by('fusion', 'established'), exchanges: total.exchange || 0, exchangesEstablished: by('exchange', 'established'), separations: total.separation || 0, recent,
        basis: { real: '突然変異・水平伝播（微生物で一般的、動物ではまれ）・内部共生（ミトコンドリアなど）は実在する現象です。', game: '頻度、動物でも起こり得るという拡張、感染で水平伝播が増えること、分離の確率はゲーム上の仮定です。完成した器官を丸ごと交換することはありません（遺伝子1つずつ）。', note: '追跡するのは目立つ変化だけです（回数はすべて数えています）。「定着」は150ステップ後に3個体以上が受け継いでいること。' } };
    };
    // (4) Unusual evolutionary routes are noted as discoveries. A discovery changes neither survival nor the rank: it is a record, nothing more.
    game.discoveries = () => {
      if (!S31) return []; const st = live.stats(), out = [], ev = live.evo(), H = st.realmAlive;
      const names = ['水中', '地上', '地中', '空中'], op = live.routes();
      for (let i = 0; i < creatures.length; i++) { if (!ever[i]) continue; op[i].forEach((n, k) => { const a = Math.floor(k / 4), b = k % 4; if (n >= 30 && H[b][i] >= 5) out.push({ id: `rt-${i}-${k}`, lin: i, text: `${creatures[i].name}が、参考ルートの外の経路（${names[a]}→${names[b]}）を${n}回通り、${names[b]}に住みついた`, kind: 'route' }); }); }
      for (const e of ev.events) if (e.status === 'established' && ever[e.lin]) {
        if (e.kind === 'fusion') out.push({ id: `f-${e.id}`, lin: e.lin, text: `${creatures[e.lin].name}に、${creatures[e.from].name}由来の共生体が定着`, kind: 'fusion' });
        else if (e.kind === 'exchange' && e.sub === 'inter') out.push({ id: `x-${e.id}`, lin: e.lin, text: `${creatures[e.lin].name}に、${creatures[e.from].name}の遺伝子が定着（種間の機能交換）`, kind: 'exchange' });
      }
      return out;
    };
    game.trails = () => (S31 ? { traits: KEY_TRAITS.slice(), names: KEY_TRAITS.map((k) => TRAIT_ALL_JA[k] || k), paths: trails.map((p, i) => ({ lin: i, name: creatures[i].name, color: creatures[i].color, points: p.slice(), start: p.length ? p[0][1] : null })).filter((x) => x.points.length) } : null);
    // ======== Stage 4.0: the life dish (see dish.js for the coordinates) ========
    const DISH_RANGE = (id, dK) => ({ water: { T: [262, 395 + Math.max(0, dK)], P: [1e5, 3e8] }, underground: { T: [272, 440 + Math.max(0, dK)], P: [1e5, 3e8] }, air: { T: [190, 330 + Math.max(0, dK)], P: [5e2, 1.5e5] }, land: { T: [240, 330 + Math.max(0, dK)], P: [1e5, 1e5] } })[id];
    let dishCache = { t: -1, v: null };
    game.dish = () => {
      if (!S4) return null; if (dishCache.t === live.t && dishCache.v) return dishCache.v;
      const st = live.stats(), dom = game.dominance() || [], H = game.habitatInfo(controlled), inds = live.individuals(), wi = game.worldInfo(), n = creatures.length;
      const domV = creatures.map((c, i) => (dom[i] && dom[i].value !== null && dom[i].value !== undefined ? dom[i].value : 0));
      const occ = DISH.ORDER.map((id) => { const r = DISH.REALM_INDEX[id]; let o = 0; for (let i = 0; i < n; i++) if (st.lineageAlive[i] > 0) o += domV[i] * (st.realmAlive[r][i] / st.lineageAlive[i]); return o; });
      const secs = DISH.sectors(occ), secOf = Object.fromEntries(secs.map((s) => [s.id, s]));
      const ranges = secs.map((s) => { const rg = DISH_RANGE(s.id, H.dK[s.realm]); return { id: s.id, Tlo: rg.T[0], Thi: rg.T[1], Plo: rg.P[0], Phi: rg.P[1] }; }), rangeOf = Object.fromEntries(ranges.map((r) => [r.id, r]));
      const acc = new Map(), add = (lin, a, r, k) => { const key = lin + ':' + Math.round(a * 400) + ':' + Math.round(r * 60); const e = acc.get(key); if (e) e.n++; else acc.set(key, { lin, a, r, n: 1 }); };
      const idOfRealm = ['water', 'land', 'underground', 'air'];
      for (const q of inds) {
        const id = idOfRealm[q.patch], sec = secOf[id], rg = rangeOf[id];
        if (id === 'land') {
          const bx = H.boxes[q.lin], margin = bx ? bx.active[1] - (NICHE.TREF + H.dK[1]) : 30, f = Math.max(0, Math.min(1, 1 - margin / 60)), intel = game.individualScores(q).intelligence;
          add(q.lin, DISH.angleOf(sec, f), 0.12 + 0.5 * Math.min(1, intel / 0.8), 1);
        } else { const prof = H.realms[q.patch]; if (!prof) continue; const T = prof.T[q.zb], P = prof.P[q.zb]; add(q.lin, DISH.angleOf(sec, (T - rg.Tlo) / (rg.Thi - rg.Tlo)), DISH.radiusOfPressure(P), 1); }
      }
      const grid = DISH.paint([...acc.values()], domV, n), civ = wi && wi.civ ? { a0: secOf.land.a0, a1: secOf.land.a1, r0: 0.62, r1: 0.62 + 0.33 * Math.min(1, wi.civ.T / 8), T: wi.civ.T, stage: wi.civ.stage } : null;
      const civFraction = civ ? secOf.land.width * (civ.r1 - civ.r0) / 0.33 * 0.5 : 0, shape = DISH.omegaShape(grid, civFraction);
      const v = { ...grid, sectors: secs, civ, ranges, focus: controlled, areas: DISH.areas(grid, n), shape, t: live.t, colors: creatures.map((c) => c.color), names: creatures.map((c) => c.name), alive: st.lineageAlive.slice(), dominance: domV };
      dishCache = { t: live.t, v }; return v;
    };

    // ======== Stage 4.0: the collection, heritage, feats and the Omega verdict. Everything is READ from the simulation; none of it is fed back into it, except the heritage
    // relics (which the engine lets survivors pick up by chance) and the player's stances. A discovery never grants an ability. ========
    const nameUse = new Map(), codexMap = new Map(), featMap = new Map(); game.achievements = []; game.codexNew = []; game.featsNew = [];
    const formSeen = new Map(), soloSteps = creatures.map(() => 0), extSteps = creatures.map(() => 0), prevAlive = creatures.map(() => 0), lastGenes = creatures.map(() => null), omegaHeld = creatures.map(() => 0);
    const heritageSeen = new Map(), aliveAtOnset = new Map(); game.omega = null; game.heritageNote = { exported: 0 };
    const yearsNow = () => (wm ? wm.years : 0);
    function achieve(kind, title, text, lin, special, ref) { game.achievements.unshift({ id: game.achievements.length + 1, kind, title, text, lin, t: live.t, y: yearsNow(), bp: WORLD.bp(wm), special: !!special, ref }); if (game.achievements.length > 80) game.achievements.pop(); }
    function discover(id, type, name, text, lin, rarity, tier) {
      if (codexMap.has(id)) return null; if (type === 'form') { const k = (nameUse.get(name) || 0) + 1; nameUse.set(name, k); if (k > 1) name = name.replace(/型$|形$/, (m) => m) + ' ' + ['', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'][Math.min(9, k - 1)]; } /* same words, a different combination of the six axes: told apart by a number */ const e = { id, type, name, text, t: live.t, y: yearsNow(), bp: WORLD.bp(wm), lin, lineage: creatures[lin].name, rarity, tier: tier || 0, rarityName: CDX.RARITY_NAME(rarity) }; codexMap.set(id, e); game.codexNew.push(e);
      const special = rarity >= 0.8 || type === 'mechanism'; achieve('codex', name, `${creatures[lin].name}：${text}（${e.rarityName}）`, lin, special, id); if (special) addEvent('codex', `📖 図鑑に記録：${name}（${creatures[lin].name}）`); return e;
    }
    function feat(id, name, text, lin, tier) {
      if (featMap.has(id)) return null; const e = { id, name, text, t: live.t, y: yearsNow(), bp: WORLD.bp(wm), lin, lineage: creatures[lin].name, tier: tier || 0 }; featMap.set(id, e); game.featsNew.push(e);
      achieve('feat', name, `${creatures[lin].name}：${text}`, lin, tier >= 2, id); addEvent('codex', `🏅 生存偉業：${name}（${creatures[lin].name}）`); return e;
    }
    const normOf = (traits) => { const nz = (n) => TRN(n, traits[tk(n)]); return { tolerance: nz('tolerance'), metabolism: nz('metabolism'), repairRate: nz('repairRate'), dormancyDepth: 1 - nz('dormancyDepth'), predation: nz('predation'), movement: nz('movement'), immune: nz('immune'), fecundity: nz('fecundity') }; };
    let lastRecT = -1;
    function recordsTick() {
      if (live.t === lastRecT) return; lastRecT = live.t; const st = live.stats(), n = creatures.length;
      // heritage: what each lineage would leave behind is noted every 200 steps; when a lineage dies out its relics are set adrift in the water
      if (live.t % 200 === 0) for (let i = 0; i < n; i++) if (st.lineageAlive[i] >= 5) { const gg = live.topGenes(i, 3); if (gg && gg.length) lastGenes[i] = gg; }
      for (let i = 0; i < n; i++) { if (prevAlive[i] >= 3 && st.lineageAlive[i] === 0 && lastGenes[i]) { lineageEnds[i].push({ y: yearsNow(), t: live.t }); live.addHeritage(lastGenes[i].map((it) => ({ ...it, from: i }))); addEvent('codex', `🧬 ${creatures[i].name}が絶えた。遺伝子の断片が遺産として残った（拾われるか、消えるかは運しだい）`); achieve('heritage', '進化遺産が残った', `${creatures[i].name}の遺伝子${lastGenes[i].length}個`, i, false); lastGenes[i] = null; } prevAlive[i] = st.lineageAlive[i]; }
      for (const h of live.heritage()) { const was = heritageSeen.get(h.id); if (was !== h.status) { heritageSeen.set(h.id, h.status); if (h.status === 'taken') { const tl = h.takenBy[0]; if (tl !== undefined) { addEvent('codex', `🧬 ${creatures[tl].name}が${creatures[h.from].name}の遺産を受け継いだ`); achieve('heritage', '進化遺産の継承', `${creatures[h.from].name}の遺伝子が${creatures[tl].name}に受け継がれた`, tl, true, h.id); } } } }
      if (live.t % 100 !== 0) { if (live.t % 25 === 0) omegaTick(st); return; }
      if (live.t % 400 === 0) { const cd0 = live.codon(); cd0.forEach((c, i) => { if (c && c.n >= 3) { codonSeries[i].push({ t: live.t, Lp: c.Lp, Le: c.Le, info: c.info, density: c.density }); if (codonSeries[i].length > 120) codonSeries[i] = codonSeries[i].filter((_, j) => j % 2 === 0); } }); }
      const inds = live.individuals(), H = game.habitatInfo(controlled), tot = inds.length || 1, sig = new Map();
      for (const q of inds) { const nm = normOf(q.traits), s = CDX.formSignature(nm), k = s.key + ':' + q.lin, e = sig.get(k); if (e) e.n++; else sig.set(k, { s, lin: q.lin, n: 1 }); }
      const living = new Map(); for (const q of inds) { const s = CDX.formSignature(normOf(q.traits)); living.set(s.key, (living.get(s.key) || 0) + 1); }
      for (const [, e] of sig) {
        if (e.n < 3) continue; const share = (living.get(e.s.key) || 0) / tot, rar = CDX.rarityOf(e.s.extremes, share);
        discover(`form:${e.s.key}`, 'form', e.s.name, `体の特徴の組み合わせ「${e.s.name}」が現れた`, e.lin, rar, e.s.extremes);
        const fs = formSeen.get(e.s.key); if (!fs) formSeen.set(e.s.key, { t: live.t, lin: e.lin, rar, max: e.n }); else { fs.max = Math.max(fs.max, e.n); if (rar >= 0.9 && fs.max >= 10 && live.t - fs.t >= 300) feat(`rare:${e.s.key}`, `希少な進化の定着：${e.s.name}`, `極めて珍しい特徴の組み合わせが、10個体以上で300ステップ以上続いた`, fs.lin, 2); }
      }
      const means = lineageTraitMeans(), cdn = live.codon();
      for (let i = 0; i < n; i++) {
        const m = means[i]; if (!m || m.count < 5) continue; const nm = normOf(m.mean);
        for (const [t, th, text, low] of CDX.ABILITY) { const v = nm[t === 'metabolism' ? 'metabolism' : t]; if (low ? v <= th : v >= th) discover(`ability:${t}:${i}`, 'ability', text, `${creatures[i].name}の${text.replace('が極めて', 'が')}`, i, 0.55, 1); }
        const bx = H.boxes[i]; if (bx) for (const ex of CDX.EXTREMES) if (ex.test(bx.active)) discover(`tol:${ex.id}:${i}`, 'tolerance', ex.name(bx.active), ex.text, i, 0.6, 1);
        const c = cdn && cdn[i]; if (c && c.n >= 5) { if (c.density >= 0.9) discover(`codon:dense:${i}`, 'codon', '高密度コドン', `機能密度${c.density.toFixed(2)}（物理長${c.Lp.toFixed(0)}・機能${c.info.toFixed(0)}）`, i, 0.7, 2); if (c.Lp <= 0.8 * c.L0) discover(`codon:compact:${i}`, 'codon', 'コンパクトなコドン', `物理長が祖先より2割以上短い（${c.Lp.toFixed(0)}／${c.L0}）`, i, 0.6, 1); if (c.packed >= 0.15) discover(`codon:packed:${i}`, 'codon', '圧縮されたコドン', `展開すると${c.Le.toFixed(0)}、圧縮で${c.Lp.toFixed(0)}`, i, 0.55, 1); }
      }
      // mechanisms that took hold: the first established fusion, exchange, relic taken, compression or release in each lineage
      const MECH = { fusion: ['共生体の内部化が定着', '別の系統の遺伝子を共生体として取り込んだ状態が定着した'], separation: ['共生体の放出が定着', '取り込んだ共生体を手放した系統が定着した'], reorg: ['コドンの再編成が定着', 'コドンの圧縮・再展開による変化が定着した'], exchange: ['遺伝子の受け渡しが定着', '別の個体から受け取った遺伝子が定着した'] };
      for (const e of live.evo().events) if (e.status === 'established' && MECH[e.kind] && (e.kind !== 'exchange' || e.sub === 'inter' || e.sub.startsWith('heritage'))) discover(`mech:${e.kind}${e.sub && e.sub.startsWith('heritage') ? ':heritage' : ''}:${e.lin}`, 'mechanism', MECH[e.kind][0] + (e.sub && e.sub.startsWith('heritage') ? '（遺産）' : ''), MECH[e.kind][1], e.lin, 0.7, 2);
      // feats: long lives, living on with almost no one left, extreme places
      const rec = game.records(); for (const r of rec) { if (!ever[r.lin]) continue; CDX.FEAT_TIERS.longevity.forEach((th, k) => { if (r.recordAge >= th) feat(`longevity:${r.lin}:${th}`, `長寿の記録 ${th}ステップ`, `ひとつの個体が${th}ステップ（約${(th * 30 / 365.25).toFixed(0)}年）途切れず生きた`, r.lin, k); }); }
      for (let i = 0; i < n; i++) { const a = st.lineageAlive[i]; if (a >= 1 && a <= 3 && peakLin[i] >= 5) soloSteps[i] += 100; else if (a > 3) soloSteps[i] = 0; CDX.FEAT_TIERS.solo.forEach((th, k) => { if (soloSteps[i] >= th) feat(`solo:${i}:${th}`, `わずかな個体で生き延びた ${th}ステップ`, `3個体以下になりながら、${th}ステップ続いた`, i, k + 1); }); }
      const ext = new Array(n).fill(false); for (const q of inds) { const p = H.realms[q.patch]; if (p && (p.T[q.zb] >= 330 || p.P[q.zb] >= 1e8)) ext[q.lin] = true; }
      for (let i = 0; i < n; i++) { if (ext[i]) extSteps[i] += 100; CDX.FEAT_TIERS.vent.forEach((th, k) => { if (extSteps[i] >= th) feat(`vent:${i}:${th}`, `極限環境で暮らした ${th}ステップ`, `高温・超高圧の場所に住み続けた`, i, k + 1); }); }
      omegaTick(st);
    }
    function omegaTick(st) {
      if (game.omega || !game.rank || !game.rank.lineages) return; const cdn = live.codon(), civAlive = !!(wm && wm.civ.civ);
      for (const l of game.rank.lineages) { const i = l.lin; if (!ever[i] || st.lineageAlive[i] < 5 || !l.judged) { omegaHeld[i] = 0; continue; } const c = cdn && cdn[i], cd = c ? { packed: c.packed, redundancy: c.redundancy, burden: Math.max(0, Math.min(2, c.Lp / c.L0 - 1)) } : null;
        const o = RK.omega(l, l.metrics, { civAlive, held: omegaHeld[i], codon: cd }); if (o.allButHeld) omegaHeld[i] += DETECT_EVERY; else omegaHeld[i] = 0;
        if (o.judged && o.criteria.every((x) => x.met || x.id === 'held') && omegaHeld[i] >= RK.OMEGA_NEED.held) { game.omega = { lin: i, name: creatures[i].name, t: live.t, y: yearsNow(), bp: WORLD.bp(wm) }; addEvent('omega', `Ω到達：${creatures[i].name}が、自力で極めて長く存続する生命になった`); achieve('omega', 'Ωコドン到達', `${creatures[i].name}`, i, true); if (!game.checkpoint) game.checkpoint = { t: live.t, kind: 'omega', lin: i }; break; }
      }
    }
    game.omegaStatus = (lin = controlled) => { const l = game.rank.lineages.find((x) => x.lin === lin); if (!l) return null; const c = live.codon(), cc = c && c[lin], cd = cc ? { packed: cc.packed, redundancy: cc.redundancy, burden: Math.max(0, Math.min(2, cc.Lp / cc.L0 - 1)) } : null; return { ...RK.omega(l, l.metrics, { civAlive: !!(wm && wm.civ.civ), held: omegaHeld[lin], codon: cd }), reached: game.omega }; };
    function crisisHook(e) {
      if (e.kind === 'cat-onset') { const st = live.stats(); aliveAtOnset.set(e.cat, st.lineageAlive.map((a, i) => (a >= 5 ? i : -1)).filter((i) => i >= 0)); }
      else if (e.kind === 'cat-aftermath') { const c = wm.cat.find((x) => x.id === e.cat), was = aliveAtOnset.get(e.cat) || [], st = live.stats(); for (const i of was) if (st.lineageAlive[i] >= 3) feat(`cat:${e.cat}:${i}`, `${c.label}を生き延びた`, `${c.historical ? '史実の' : ''}大災厄を、系統として生き延びた`, i, c.scale >= 2 ? 3 : c.scale >= 1.4 ? 2 : 1); }
    }
    const codonSeries = creatures.map(() => []);
    game.codonInfo = (lin) => {
      if (!S4) return null; const sg = live.sampleGenome(lin); if (!sg) return null; const cdn = live.codon(), s = sg.stats, burden = Math.max(0, Math.min(2, s.Lp / s.L0 - 1));
      return { lin, name: creatures[lin].name, genes: sg.genes, stats: s, means: cdn ? cdn[lin] : null, costs: { replication: 1 + 0.25 * burden, ageing: 1 + 0.15 * burden, repair: 1 - 0.5 * s.packed, upkeep: 0.0008 * s.Lp }, series: codonSeries[lin].slice() };
    };
    game.codex = () => [...codexMap.values()]; game.feats = () => [...featMap.values()];
    game.heritageReport = () => { const hs = live.heritage(); return { items: hs.map((h) => ({ ...h, fromName: creatures[h.from] ? creatures[h.from].name : '?', takenByNames: h.takenBy.map((l) => creatures[l].name), effText: h.eff.map(([t, w]) => `${TRAIT_ALL_JA[t] || t}${w >= 0 ? '＋' : '－'}`).join(' ') })), note: '遺産は、絶えた系統の遺伝子の断片です。拾われるかどうかは運で、拾われても定着するとは限りません。どの断片が誰に渡るかをプレイヤーが選ぶことはできません。方針（捕食・共生・回避）は、見つかる機会に影響します。' }; };
    // what to carry into another world (special mode only): relics still around plus the strongest genes of living lineages, as plain data
    game.exportHeritage = () => { const out = [], hs = live.heritage().filter((h) => h.status !== 'decayed').slice(-12); for (const h of hs) out.push({ fromId: creatures[h.from] ? creatures[h.from].id : null, kind: h.kind, eff: h.eff, prom: 0, sens: null, len: 2 }); const st = live.stats(); for (let i = 0; i < creatures.length && out.length < 24; i++) if (st.lineageAlive[i] >= 5) { const gg = live.topGenes(i, 1); if (gg) for (const it of gg) out.push({ fromId: creatures[i].id, kind: it.kind, eff: it.eff, prom: it.prom, sens: it.sens, len: it.len }); } return out.slice(0, 24); };
    game.records4 = () => ({ mode: cfg.heritage ? 'special' : 'normal', codex: game.codex(), feats: game.feats(), omega: game.omega, years: yearsNow(), bp: WORLD.bp(wm), seed: cfg.seed, bestRank: game.rank.best ? game.rank.best.rank : null });
    if (S4 && cfg.heritage && cfg.heritage.length) { const idx = (id) => Math.max(0, creatures.findIndex((c) => c.id === id)); live.addHeritage(cfg.heritage.map((it) => ({ ...it, from: idx(it.fromId), fromWorld: true }))); addEvent('codex', `🧬 前の世界の遺産${cfg.heritage.length}個が、この世界の水に漂っている（特殊モード）`); }
    // ======== Stage 4.0: the fan-shaped phylogeny. Built only from the engine's own records of mutation, reorganisation, fusion, separation, exchange and heritage; nothing is drawn that
    // was not recorded. Each node is an event that founded a clade (its descendants carry its tag); `par` is the clade it came out of. Time runs from the centre outwards. ========
    game.phylo = (limit = 160) => {
      if (!S4) return null; const ev = live.evo(), st = live.stats(), keep = [], lost = creatures.map(() => 0);
      const rank = { established: 0, occurred: 1, lost: 2, faded: 2 };
      const tracked = ev.events.filter((e) => ['mutation', 'reorg', 'separation', 'fusion', 'exchange'].includes(e.kind) && (e.kind !== 'mutation' || e.sub === 'newcap' || Math.abs(e.delta) >= 0.15) && (e.kind !== 'exchange' || e.sub !== 'intra'));
      const sorted = tracked.slice().sort((a, b) => rank[a.status] - rank[b.status] || b.t - a.t);
      for (const e of sorted) { if (keep.length < limit && rank[e.status] < 2) keep.push(e); else lost[e.lin]++; }
      const ids = new Set(keep.map((e) => e.id)), nodes = keep.map((e) => ({ id: e.id, parent: e.par && ids.has(e.par) ? e.par : null, lin: e.lin, y: evoY.has(e.id) ? evoY.get(e.id) : 0, t: e.t, kind: e.kind, sub: e.sub, status: e.status, carriers: e.carriers, from: e.from === undefined ? null : e.from, label: evoText(e.kind === 'reorg' ? { ...e, kind: 'mutation', sub: 'alter' } : e, e.status) }));
      const links = []; for (const nd of nodes) { if (nd.kind === 'fusion' && nd.from !== null) links.push({ type: 'fusion', fromLin: nd.from, to: nd.id, y: nd.y }); else if (nd.kind === 'exchange' && nd.from !== null) links.push({ type: nd.sub.startsWith('heritage') ? 'heritage' : 'exchange', fromLin: nd.from, to: nd.id, y: nd.y }); }
      const roots = creatures.map((c, i) => ({ lin: i, name: c.name, color: c.color, alive: st.lineageAlive[i], ends: lineageEnds[i].slice(), lostClades: lost[i] }));
      return { nodes, links, roots, focus: controlled, years: yearsNow(), scale: wm ? wm.presentYears + 1e9 : 1, tracked: tracked.length, shown: nodes.length, note: '記録されたイベントだけで描いています。古くて消えた枝は数だけを示します。' };
    };
    Object.defineProperty(game, 'approxLeft', { get: () => (approx ? approx.left : 0) }); // steps of approximate evolution still to run (they are spread over later frames)
    Object.defineProperty(game, 'eventSeq', { get: () => eventSeq });
    game.eventsSince = (seq) => { const out = []; for (let i = game.events.length - 1; i >= 0 && game.events[i].seq > seq; i--) out.push(game.events[i]); return out.reverse(); };
    game.freeRoutes = () => { if (!S31) return null; const mv = live.stats().moves; if (!mv) return null; const ref = E.REALM_ADJ; let on = 0, off = 0; mv.forEach((row, a) => row.forEach((n, b) => { if (a === b) return; if (ref[a].includes(b)) on += n; else off += n; })); return { reference: on, outside: off }; };
    game.save = () => ({ v: S4 ? 9 : S31 ? 8 : S3 ? 7 : TB ? 6 : 5, cfg: game.cfg, t: live.t, log: game.log.map((e) => ({ ...e })), autoContinuous: game.autoContinuous });
    // Only values the engine actually computes: living counts, their change over about the last 100 steps, extinction time,
    // and the catches recorded on individuals that are still alive. The prey is a shared background resource, not a lineage,
    // so there is no predator-prey relation between lineages to report; the report says so instead of inventing one.
    game.lineageReport = () => {
      const st = live.stats(), ind = live.individuals(), S = game.series, ago = st.t - 100;
      let ref = null; for (let i = S.length - 1; i >= 0; i--) if (S[i].t <= ago) { ref = S[i]; break; }
      const catches = new Array(creatures.length).fill(0); for (const x of ind) catches[x.lin] += x.catches;
      return creatures.map((c, i) => ({ lin: i, id: c.id, name: c.name, color: c.color, role: roleOf(i), alive: st.lineageAlive[i], change100: ref ? st.lineageAlive[i] - ref.lin[i] : null,
        extinct: st.lineageAlive[i] === 0, extinctAt: extinctAt[i], catchesOfLiving: catches[i], stats: st.lineageStats[i], window: v2 ? game.lineageWindow(i) : null })).filter((l) => !v2 || ever[l.lin]);
    };
    // Realm distribution and movement: counted from the engine's own individuals. Null for saves made before realms existed.
    game.realmReport = () => {
      if (!realmsOn) return null; const st = live.stats();
      return { realms: E.REALM_DEFS.map((r, i) => ({ id: r.id, name: r.name, total: st.realmAlive[i].reduce((a, b) => a + b, 0), byLineage: st.realmAlive[i].slice() })), moves: st.moves.map((r) => r.slice()) };
    };
    game.historyInfo = () => (scenario === 'kpg' ? { scenario, ...(TB ? { scaleId: 'adaptive', yearsSinceImpact: wm.years, yearsBP: WORLD.bp(wm), yearsBPUncertainty: HIST.KPG_UNCERTAINTY_YEARS, calibrated: false, withinFineScale: false } : HIST.clock(live.t)), events: HIST.EVENTS } : null);
    // ---- Stage 1.9C reports: only quantities the engine or the coarse background model actually computes ----
    game.lineageWindow = (i, steps = 100) => {
      const st = live.stats(), now = st.lineageStats[i], ref = lsnaps.slice().reverse().find((x) => x.t <= st.t - steps) || lsnaps[0]; if (!ref) return null;
      const dt = st.t - ref.t, a = ref.stats[i]; if (dt <= 0) return null; const avg = Math.max(1, (a.count + now.count) / 2), db = now.births - a.births, dd = now.deaths - a.deaths;
      return { steps: dt, birthRate: db / avg / dt, deathRate: dd / avg / dt, intakePerIndividual: (now.intake - a.intake) / avg / dt, lifespanRecent: dd > 0 ? (now.lifeSum - a.lifeSum) / dd : null, catchRate: (now.catches - a.catches) / avg / dt };
    };
    game.diversity = () => {
      const st = live.stats(), c = st.lineageAlive.filter((n) => n > 0), tot = c.reduce((a, b) => a + b, 0), H = (arr, t) => (t > 0 ? -arr.reduce((a, n) => a + (n > 0 ? (n / t) * Math.log(n / t) : 0), 0) : 0);
      const bgs = bg ? BG.summary(bg).filter((g) => !g.extinct) : [], bt = bgs.reduce((a, g) => a + g.units, 0);
      return { arenaRichness: c.length, arenaShannon: H(c, tot), backgroundRichness: bgs.length, backgroundShannon: H(bgs.map((g) => g.units), bt), note: '計算している系統・グループの中での多様性です（世界の実際の種数ではありません）' };
    };
    game.backgroundReport = () => !bg ? null : { source: '粗い計算（25ステップごと）', unit: '個体相当の単位（個体数そのものではない）', groups: BG.summary(bg).map((g) => ({ ...g, name: creatures[g.lin].name, color: creatures[g.lin].color, inArena: live.stats().lineageAlive[g.lin] })), computedSpecies: false, note: '計算しているのはこのグループだけです。世界にはさらに膨大な生き物がいると想定されますが、その数は計算していません。' };
    game.evolutionReport = () => {
      const st = live.stats(), means = lineageTraitMeans(), out = [];
      for (let i = 0; i < creatures.length; i++) {
        if (!evoBase[i]) continue; const now = means[i]; const rows = [];
        EVO.forEach((e, k) => { const idx = evoIdx[k], [, mn, mx] = E.TRAITS[idx], from = evoBase[i].mean[idx], to = now ? now.mean[idx] : null; if (to === null) return; const sh = (to - from) / (mx - mn); rows.push({ trait: e[0], name: e[1], from, to, delta: to - from, shift: sh, text: Math.abs(sh) < 0.05 ? '大きな変化なし' : (to > from ? e[2] : e[3]), changed: Math.abs(sh) >= 0.05 }); });
        const ls = st.lineageStats[i], tot = Object.values(ls.causes).reduce((a, b) => a + b, 0), top = Object.entries(ls.causes).sort((a, b) => b[1] - a[1])[0];
        const hist = popBefore[i], ago = hist.find((p) => p[0] >= st.t - 200) || hist[0];
        out.push({ lin: i, name: creatures[i].name, role: roleOf(i), color: creatures[i].color, firstSeenT: evoBase[i].t, alive: st.lineageAlive[i], rows,
          cognition: { index: now ? cogOf(now.mean) : null, base: evoBase[i].cog, parts: '学習・記憶の維持・感覚の正確さ・行動の柔軟さの合成（0〜1）', social: null, sharing: null, memeDependence: null, camp: 'genome' },
          outcome: { populationThen: ago ? ago[1] : null, populationNow: st.lineageAlive[i], topCause: top ? { cause: top[0], share: tot ? top[1] / tot : 0 } : null, birthsTotal: ls.births, deathsTotal: ls.deaths, meanLifespan: ls.deaths ? ls.lifeSum / ls.deaths : null },
          note: '形質の変化と同じ時期の個体数・死因を並べています。変化が生存の原因かどうかは検証していません。' });
      }
      return out;
    };
    game.background = () => { const st = live.stats(); return { preyFraction: st.preyFraction, plantResource: st.resource, computedSpecies: false, computedBackgroundPopulation: false }; };
    game.summary = () => {
      const st = live.stats(), ti = game.timeInfo(), r = [];
      r.push(st.population ? `${st.t}ステップ（推定${ti.generations.toFixed(1)}世代）を観察した。` : `${st.t}ステップ（推定${ti.generations.toFixed(1)}世代）で、計算していた全系統が絶えた。`);
      r.push(`いまの個体数${st.population}体。これまでの誕生${st.births}、死亡${st.deaths}、平均寿命${st.meanLifespan ? st.meanLifespan.toFixed(1) : '-'}。`);
      r.push(game.lineageReport().map((l) => `${l.name}${l.role === 'rival' ? '（競争相手）' : ''}：${l.alive ? l.alive + '体' : (l.extinctAt !== null ? l.extinctAt + 'ステップで絶えた' : '絶えた')}`).join(' ／ '));
      r.push(`介入${game.log.filter((e) => e.kind !== 'watch' && !(e.kind === 'choice' && (e.id === 'watch' || e.id === 'auto'))).length}回（自動${game.log.filter((e) => e.id === 'auto').length}回）。`);
      return { text: r.join('\n') };
    };

    // ---- Stage 5.1: milestone saves. A save is a state, not a history: it is taken only at a "continue?" screen, and loading it never replays anything. ----
    // What is kept is what the player sees and what later play depends on: the world (clock, climate, crises, civilisation), every lineage's records
    // (rank, codex, feats, achievements), and the living arena as a few representative genome groups per lineage and realm. What is NOT kept: the exact
    // position, age, energy and health of each individual (they are re-created from their genome at full energy), the random streams, and the per-step history
    // between milestones. So the game continues from the same world and the same evolved lineages, not bit-for-bit from the same instant.
    const plain = (x) => JSON.parse(JSON.stringify(x));
    const mergeInto = (target, src) => { for (const k of Object.keys(src)) { const v = src[k]; if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) mergeInto(target[k], v); else target[k] = v; } };
    game.milestone = () => {
      if (!S4 || !TB || approx) return null;
      const tbKeep = {}; for (const k of ['lastLeapT', 'leapYears', 'skipGens', 'leaps', 'takenTotal', 'harmTotal', 'episodes', 'gapNote', 'attackTotal', 'attackFrac', 'blocked', 'approxSteps', 'approxLeaps', 'lastStance', 'ended']) tbKeep[k] = tb[k];
      return plain({ v: 10, kind: 'milestone', cfg: game.cfg, t: live.t, autoContinuous: game.autoContinuous, wm, off, bg, tb: tbKeep, ever, extinctAt, recordAge, streak, firstSeen, strategies, controlled,
        peakLin, peakRealm, everRealm, founderMean, clock, eventSeq, events: game.events.slice(-120), achievements: game.achievements, codex: [...codexMap], feats: [...featMap], nameUse: [...nameUse], formSeen: [...formSeen],
        soloSteps, extSteps, omegaHeld, omega: game.omega, rank: { best: game.rank.best, history: game.rank.history, byLin: game.rank.byLin, current: game.rank.current },
        arena: live.exportArena(6) });
    };
    if (resume) {
      live.step(resume.t); // an empty arena: only the environment runs, which is quick
      mergeInto(wm, resume.wm); for (const [k, ex] of [['off', off], ['bg', bg]]) if (ex && resume[k]) mergeInto(ex, resume[k]);
      mergeInto(tb, resume.tb); tb.wc = creatures.map(() => []);
      resume.ever.forEach((v, i) => { ever[i] = v; }); resume.extinctAt.forEach((v, i) => { extinctAt[i] = v; }); resume.recordAge.forEach((v, i) => { recordAge[i] = v; }); resume.streak.forEach((v, i) => { streak[i] = v; }); resume.firstSeen.forEach((v, i) => { firstSeen[i] = v; });
      resume.peakLin.forEach((v, i) => { peakLin[i] = v; }); resume.peakRealm.forEach((v, i) => { peakRealm[i] = v; }); resume.everRealm.forEach((v, i) => { everRealm[i] = v; }); (resume.founderMean || []).forEach((v, i) => { founderMean[i] = v; });
      resume.strategies.forEach((v, i) => { strategies[i] = v; if (STRATEGIES[v]) live.setStance(i, STRATEGIES[v].code); }); controlled = resume.controlled;
      Object.assign(clock, resume.clock); eventSeq = resume.eventSeq; for (const e of resume.events) game.events.push(e);
      game.achievements = resume.achievements; for (const [k, v] of resume.codex) codexMap.set(k, v); for (const [k, v] of resume.feats) featMap.set(k, v); for (const [k, v] of resume.nameUse) nameUse.set(k, v); for (const [k, v] of resume.formSeen) formSeen.set(k, v);
      resume.soloSteps.forEach((v, i) => { soloSteps[i] = v; }); resume.extSteps.forEach((v, i) => { extSteps[i] = v; }); resume.omegaHeld.forEach((v, i) => { omegaHeld[i] = v; }); game.omega = resume.omega;
      Object.assign(game.rank, resume.rank, { lineages: [] }); game.autoContinuous = resume.autoContinuous === true;
      for (const a of resume.arena) { const made = live.introduce(a.lin, a.genome, a.n, a.patch); if (made > 0) prevAlive[a.lin] += made; }
      creatures.forEach((_, i) => { last.lineageDead[i] = ever[i] && extinctAt[i] !== null && prevAlive[i] === 0; });
      nextCp = live.t + cp.every; tb.lastLeapT = live.t; game.resumed = { t: resume.t, arena: resume.arena.length };
      try { updateScenario(); pushEffects(live.stats(), null); } catch (e) { /* the next step re-applies the pressures */ }
    }
    return game;
  }
  function newGame(E, cfg) { return createGame(E, { seed: 1, light: true, ...cfg }); }
  function validateSave(save) { // a damaged save is refused with a reason instead of wedging the replay
    const bad = (m) => { throw new Error('セーブが壊れています：' + m); };
    if (!save || typeof save !== 'object') bad('形式');
    if (save.kind === 'milestone') { // Stage 5.1: a state save, no log
      if (save.v !== 10) bad('版'); if (!save.cfg || typeof save.cfg !== 'object' || typeof save.cfg.seed !== 'number') bad('設定'); if (typeof save.t !== 'number' || !(save.t >= 0) || !isFinite(save.t)) bad('時刻');
      for (const k of ['wm', 'tb', 'clock', 'rank']) if (!save[k] || typeof save[k] !== 'object') bad(k); for (const k of ['arena', 'ever', 'extinctAt', 'recordAge', 'streak', 'firstSeen', 'strategies', 'events', 'achievements', 'codex', 'feats', 'nameUse', 'formSeen', 'soloSteps', 'extSteps', 'omegaHeld', 'peakLin', 'peakRealm', 'everRealm']) if (!Array.isArray(save[k])) bad(k);
      if (!save.arena.every((a) => a && Number.isInteger(a.lin) && Number.isInteger(a.patch) && a.genome && typeof a.genome === 'object' && a.n >= 1)) bad('個体群'); return save;
    } if (!save.cfg || typeof save.cfg !== 'object' || !Array.isArray(save.cfg.creatures)) bad('設定'); if (!Array.isArray(save.log)) bad('操作の記録'); if (typeof save.t !== 'number' || !(save.t >= 0) || !isFinite(save.t)) bad('時刻'); if (typeof save.cfg.seed !== 'number') bad('乱数の種');
    if (save.v !== undefined && (typeof save.v !== 'number' || save.v > 9)) bad('新しすぎる版');
    let last = 0; for (const e of save.log) { if (!e || typeof e !== 'object' || typeof e.t !== 'number' || typeof e.kind !== 'string') bad('記録の項目'); if (e.t < last) bad('記録の順序'); last = e.t; }
    return save;
  }
  function loadGame(E, save) { validateSave(save); if (save.kind === 'milestone') return createGame(E, save.cfg, null, save); return createGame(E, save.cfg, save); }
  return { validateSave, HIST, CREATURES, CREATURES7, CELLS8, ENVIRONMENTS, OPTIONS, KEY_TRAITS, TRAIT_JA, MAX_LINEAGES, STRATEGIES, pickRivals, makeGenome, newGame, loadGame, leapBlocker, DETECT_EVERY, LEAP_FROM, jaYears: WORLD.jaYears };
});
