(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaGame = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NODE = typeof module === 'object' && typeof require === 'function';
  const HIST = NODE ? require('./earthhistory') : globalThis.OmegaHistory, BG = NODE ? require('./background') : globalThis.OmegaBackground, AD = NODE ? require('./adaptation') : globalThis.OmegaAdaptation;
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
  const IMPORTANT = new Set(['branch', 'disaster', 'crisis', 'lineage', 'scenario', 'immigration', 'player']);
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
  // Rivals are other founder types that evolve independently next to the player's focus lineages. Picking them from the
  // seed (never from how well they would do) keeps the choice neutral and repeatable.
  function pickRivals(seed, focusIds, n) {
    const pool = CREATURES.map((c) => c.id).filter((id) => !focusIds.includes(id));
    const keyed = pool.map((id, i) => [Math.sin((seed + 1) * 12.9898 + (i + 1) * 78.233) * 43758.5453 % 1, id]).map(([k, id]) => [k - Math.floor(k), id]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    return keyed.slice(0, Math.max(0, Math.min(n, MAX_LINEAGES - focusIds.length))).map((x) => x[1]);
  }

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

  function createGame(E, cfg, saved) {
    const focus = cfg.creatures.map((id) => CREATURES.find((c) => c.id === id)).filter(Boolean);
    const rivalDefs = (cfg.rivals || []).map((id) => CREATURES.find((c) => c.id === id)).filter(Boolean);
    if (!focus.length || focus.length > 3) throw new Error('1〜3種を選んでください');
    if (focus.length + rivalDefs.length > MAX_LINEAGES) throw new Error('系統は合計4つまでです');
    const v2 = cfg.ecology === 'v2'; // v2 = niche-partitioned food, every creature type has a lineage slot, background pools may send immigrants
    const realmsOn = v2 ? true : cfg.realms === true, scenario = cfg.scenario === 'kpg' ? 'kpg' : 'free';
    const creatures = v2 ? CREATURES.slice() : focus.concat(rivalDefs); // index = lineage id in the engine
    const focusIdx = focus.map((c) => creatures.indexOf(c)), rivalIdx = rivalDefs.map((c) => creatures.indexOf(c));
    const initialIdx = v2 ? focusIdx.concat(rivalIdx) : creatures.map((_, i) => i);
    const ever = creatures.map((_, i) => initialIdx.includes(i)); // has this lineage ever had individuals in the arena
    const roleOf = v2 ? (i) => (focusIdx.includes(i) ? 'focus' : rivalIdx.includes(i) ? 'rival' : ever[i] ? 'immigrant' : 'reserve') : (i) => (i < focus.length ? 'focus' : 'rival');
    const tag = (i) => (roleOf(i) === 'rival' ? '（競争相手）' : roleOf(i) === 'immigrant' ? '（移入）' : '');
    const genomeCache = [], genomeOf = (i) => genomeCache[i] || (genomeCache[i] = makeGenome(E, creatures[i]));
    const environment = cfg.environment || 'steady', envDef = ENVIRONMENTS.find((e) => e.id === environment);
    if (!envDef) throw new Error('unknown environment');
    const counts = creatures.map(() => 0); if (v2) { const n = initialIdx.length, per = Math.floor(100 / n); initialIdx.forEach((li, k) => { counts[li] = per + (k < 100 - per * n ? 1 : 0); }); }
    const live = E.simulate({ seed: cfg.seed, steps: 100000, environment: envDef.engine, resourceRegime: envDef.regime, founders: 100, lineageCount: creatures.length,
      founderGenomes: creatures.map((c, i) => genomeOf(i)), sampleEvery: 100, live: true,
      ...(v2 ? { founderCounts: counts, niche: { slots: NICHE_SLOTS, weights: creatures.map((c) => c.niche), specialistBonus: NICHE_BONUS } } : {}),
      realms: realmsOn ? { startByLineage: creatures.map((c) => c.startRealm) } : null });
    const game = { cfg: { creatures: focus.map((c) => c.id), rivals: rivalDefs.map((c) => c.id), seed: cfg.seed, environment, realms: realmsOn, scenario, ecology: v2 ? 'v2' : 'legacy', ...(v2 && cfg.background === false ? { background: false } : {}) }, creatures, v2, focusCount: focus.length, roleOf, autoContinuous: false, live, events: [], series: [], pending: null, effects: [], log: [], replayTo: null };
    const extinctAt = new Array(creatures.length).fill(null);
    const lti = KEY_TRAITS.map((n) => E.TRAITS.findIndex((l) => l[0] === n));
    let replayLog = saved ? saved.log.map((e) => ({ ...e })) : null, replayPtr = 0;
    if (saved) { game.replayTo = saved.t; }
    const restoreAuto = () => { if (saved && game.replayTo === null) game.autoContinuous = saved.autoContinuous === true; };
    let seriesStride = 1, seriesCount = 0;
    const bg = v2 && cfg.background !== false ? BG.create(cfg.seed, creatures.map((c, i) => ({ id: c.id, lin: i, niche: c.niche })).filter((g, i) => !focusIdx.includes(i))) : null;
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
    const addEvent = (kind, text) => { const st = live.stats(); game.events.push({ t: st.t, gen: Math.round(gen() * 10) / 10, kind, text }); if (game.events.length > 400) game.events.shift(); if (v2 && IMPORTANT.has(kind)) snapshotRanges(kind); };
    // History of the (placeholder) adaptation ranges: one snapshot every 100 steps and one at each important event. The ranges
    // come from game.adaptationProvider, which today is the dummy in adaptation.js; the history is only as real as that provider.
    game.adaptationProvider = AD.provider;
    function snapshotRanges(reason) {
      const t = live.t, S = game.rangeSnapshots, lastSnap = S[S.length - 1]; if (lastSnap && lastSnap.t === t && lastSnap.reason === reason) return;
      S.push({ t, reason, source: game.adaptationProvider.source, lineages: creatures.map((c, i) => ({ lin: i, ...game.adaptationProvider.lineageRange(i, cfg.seed, t) })) });
      if (S.length > 400) { for (let i = 1; i < S.length - 1; i++) if (S[i].reason === 'interval') { S.splice(i, 1); break; } if (S.length > 400) S.splice(1, 1); }
    }
    addEvent('start', `開始：${rivalDefs.length ? '注目系統 ' : ''}${focus.map((c) => c.name).join('・')}${rivalDefs.length ? ` ／ 競争相手 ${rivalDefs.map((c) => c.name).join('・')}` : ''}（各${Math.floor(100 / creatures.length)}体前後）／${ENVIRONMENTS.find((e) => e.id === environment).name}`);
    last.traits = meanTraits();
    // Scenario: the impact applies EXTERNAL conditions (food, thermal stress) as a function of the step only; it is refreshed on the
    // fixed 25-step grid so that a replay with different stopping points sees exactly the same conditions. Evolution is not touched.
    function updateScenario() { if (scenario === 'kpg') live.setEnvMod(HIST.impactConditions(live.t)); }
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
      const st = live.stats(), mod = scenario === 'kpg' ? HIST.impactConditions(live.t).resource : 1;
      const r = BG.tick(bg, { dt: DETECT_EVERY, resourceMod: mod, arenaCount: st.realmAlive.map((m) => m.reduce((a, b) => a + b, 0)) });
      for (const im of r.immigrants) {
        const returning = last.lineageDead[im.lin] === true && st.lineageAlive[im.lin] === 0, made = live.introduce(im.lin, genomeOf(im.lin), im.n, im.realm);
        if (made > 0) { const was = ever[im.lin]; ever[im.lin] = true; addEvent('immigration', `${returning ? '再侵入' : was ? '背景からの追加移入' : '背景からの移入'}：${creatures[im.lin].name}${tag(im.lin)} ${made}個体が${E.REALM_DEFS[im.realm].name}に到達（アリーナ外の背景集団から。進化していない祖先型）`); }
      }
    }

    record();

    function detect() {
      const st = live.stats(), total = st.population; updateClock(st);
      if (v2) for (let i = 0; i < creatures.length; i++) { peakLin[i] = Math.max(peakLin[i], st.lineageAlive[i]); for (let r = 0; r < 4; r++) peakRealm[i][r] = Math.max(peakRealm[i][r], st.realmAlive[r][i]); }
      last.peak = Math.max(last.peak, total);
      if (st.disasters > last.lastDisasters) { addEvent('disaster', `災害が起きた（累計${st.disasters}回）`); last.lastDisasters = st.disasters; }
      for (let i = 0; i < creatures.length; i++) if (st.lineageAlive[i] === 0 && !last.lineageDead[i] && creatures.length > 1 && (!v2 || peakLin[i] >= 5)) { last.lineageDead[i] = true; extinctAt[i] = st.t; addEvent('lineage', `${creatures[i].name}${tag(i)}の系統が絶えた`); }
      if (creatures.length > 1 && total > 0) { let d = 0; for (let i = 1; i < creatures.length; i++) if (st.lineageAlive[i] > st.lineageAlive[d]) d = i; if (d !== last.dominant) { if (last.dominant >= 0) addEvent('lineage', `最大の系統が${creatures[last.dominant].name}${tag(last.dominant)}から${creatures[d].name}${tag(d)}に交代`); last.dominant = d; } }
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
      if (!game.pending && st.t >= FIRST_BRANCH && st.t - last.branchT >= MIN_BRANCH_GAP && total > 0 && !live.done) {
        let why = null;
        if (total < 40 && total < 0.35 * last.peak) why = { kind: 'crisis', title: '存続の危機', text: `個体数が${total}体まで減った（最大${last.peak}体）。` };
        else if (total >= 250 && total >= 2.5 * last.popAtBranch) why = { kind: 'boom', title: '個体数の急増', text: `個体数が${total}体に増えた。資源が足りなくなるかもしれない。` };
        else if (creatures.length > 1) {
          const sh = st.lineageAlive.map((c) => c / total);
          if (last.shares && sh.some((v, i) => Math.abs(v - last.shares[i]) >= 0.25)) { const i = sh.findIndex((v, k) => Math.abs(v - last.shares[k]) >= 0.25); why = { kind: 'lineage', title: '系統の勢力交代', text: `${creatures[i].name}${tag(i)}の割合が${Math.round(last.shares[i] * 100)}%から${Math.round(sh[i] * 100)}%になった。` }; }
        }
        if (!why) { for (let i = 0; i < KEY_TRAITS.length; i++) { const [, mn, mx] = E.TRAITS[lti[i]]; if (Math.abs(tm[i] - last.traits[i]) / (mx - mn) >= 0.2) { why = { kind: 'drift', title: '形質の分岐', text: `${TRAIT_JA[KEY_TRAITS[i]]}が${last.traits[i].toFixed(2)}から${tm[i].toFixed(2)}に動いた。` }; break; } } }
        if (!why && st.t - last.branchT >= CHECKPOINT_GAP) why = { kind: 'checkpoint', title: '節目', text: `${st.t}ステップ。いまの様子を見て、環境に手を入れるか決めよう。` };
        if (why) {
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
      if (replayLog) for (let i = replayPtr; i < replayLog.length; i++) if (replayLog[i].t > live.t) { stop = Math.min(stop, replayLog[i].t); break; }
      return stop;
    };
    function afterSegment() {
      expire();
      if (live.t % DETECT_EVERY === 0) { updateScenario(); bgTick(); }
      if (live.t % DETECT_EVERY === 0 || live.done) detect();
      if (replayLog) {
        while (replayPtr < replayLog.length && replayLog[replayPtr].t === live.t) {
          const e = replayLog[replayPtr++];
          if (e.kind === 'choice') { if (game.pending) { game.log.push({ ...e }); game.pending = null; resolveBranch(); applyEffect(e.id, e.r); } } else { game.log.push({ ...e }); applyEffect(e.kind); }
        }
        if (replayPtr >= replayLog.length && game.replayTo !== null && live.t >= game.replayTo) { replayLog = null; game.replayTo = null; restoreAuto(); }
      }
    }
    game.advance = (n) => {
      let limit = live.t + n; if (game.replayTo !== null) limit = Math.min(limit, game.replayTo);
      let guard = 0;
      while (live.t < limit && !live.done && !game.pending && guard++ < 100000) {
        const target = nextStop(limit);
        live.step(target - live.t);
        afterSegment();
      }
      if (game.replayTo !== null && live.t >= game.replayTo && !live.done) { replayLog = null; game.replayTo = null; restoreAuto(); }
      return live.t;
    };
    Object.defineProperty(game, 't', { get: () => live.t });
    game.save = () => ({ v: 4, cfg: game.cfg, t: live.t, log: game.log.map((e) => ({ ...e })), autoContinuous: game.autoContinuous });
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
    game.historyInfo = () => (scenario === 'kpg' ? { scenario, ...HIST.clock(live.t), events: HIST.EVENTS } : null);
    // ---- Stage 1.9C reports: only quantities the engine or the coarse background model actually computes ----
    game.lineageWindow = (i, steps = 100) => {
      const st = live.stats(), now = st.lineageStats[i], ref = lsnaps.slice().reverse().find((x) => x.t <= st.t - steps) || lsnaps[0]; if (!ref) return null;
      const dt = st.t - ref.t, a = ref.stats[i]; if (dt <= 0) return null; const avg = Math.max(1, (a.count + now.count) / 2), db = now.births - a.births, dd = now.deaths - a.deaths;
      return { steps: dt, birthRate: db / avg / dt, deathRate: dd / avg / dt, intakePerIndividual: (now.intake - a.intake) / avg / dt, lifespanRecent: dd > 0 ? (now.lifeSum - a.lifeSum) / dd : null };
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
    return game;
  }
  function newGame(E, cfg) { return createGame(E, { seed: 1, ...cfg }); }
  function loadGame(E, save) { return createGame(E, save.cfg, save); }
  return { HIST, CREATURES, ENVIRONMENTS, OPTIONS, KEY_TRAITS, TRAIT_JA, MAX_LINEAGES, pickRivals, makeGenome, newGame, loadGame, DETECT_EVERY };
});
