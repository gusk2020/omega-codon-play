(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaGame = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const HIST = (typeof module === 'object' && typeof require === 'function') ? require('./earthhistory') : globalThis.OmegaHistory;
  // The game layer. It owns no science: it picks founders, advances the Stage 1.7 engine, notices notable things, and offers the
  // player a small number of environment-wide interventions. Nothing here favours a lineage or a trait.
  const DETECT_EVERY = 25, FIRST_BRANCH = 300, MIN_BRANCH_GAP = 500, CHECKPOINT_GAP = 1500, SERIES_MAX = 700;
  const P20 = { period: 20, pulseLength: 4 };
  const KEY_TRAITS = ['metabolism', 'movement', 'predation', 'tolerance', 'immune', 'fecundity', 'repairRate', 'dormancyDepth'];
  const TRAIT_JA = { metabolism: '代謝', movement: '移動', predation: '捕食', tolerance: '耐性', immune: '免疫', fecundity: '繁殖力', repairRate: '修復', dormancyDepth: '休眠の深さ' };

  const CREATURES = [
    { id: 'standard', startRealm: 1, name: '標準型', color: '#4fa3ff', text: '特徴のない基準の生き物。' },
    { id: 'lowMetabolism', startRealm: 1, name: '低代謝型', color: '#46c28a', text: '燃費がよく、ゆっくり老いる。繁殖は控えめ。', traits: { metabolism: 0.5 } },
    { id: 'highFecundity', startRealm: 1, name: '多産型', color: '#f2a03d', text: 'たくさん産む。', traits: { fecundity: 0.9 } },
    { id: 'hunter', startRealm: 1, name: '狩猟型', color: '#e5586e', text: '獲物を捕るのが上手い。', traits: { predation: 0.8 } },
    { id: 'tough', startRealm: 1, name: '頑丈型', color: '#b38cf0', text: '暑さ・寒さ・病気に強い。', traits: { tolerance: 0.8, immune: 0.7 } },
  ];
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
    const realmsOn = cfg.realms === true, scenario = cfg.scenario === 'kpg' ? 'kpg' : 'free';
    const creatures = focus.concat(rivalDefs); // index = lineage id in the engine; the first focus.length are the player's focus lineages
    const roleOf = (i) => (i < focus.length ? 'focus' : 'rival');
    const tag = (i) => (roleOf(i) === 'rival' ? '（競争相手）' : '');
    const environment = cfg.environment || 'steady', envDef = ENVIRONMENTS.find((e) => e.id === environment);
    if (!envDef) throw new Error('unknown environment');
    const live = E.simulate({ seed: cfg.seed, steps: 100000, environment: envDef.engine, resourceRegime: envDef.regime, founders: 100, lineageCount: creatures.length,
      founderGenomes: creatures.map((c) => makeGenome(E, c)), sampleEvery: 100, live: true,
      realms: realmsOn ? { startByLineage: creatures.map((c) => c.startRealm) } : null });
    const game = { cfg: { creatures: focus.map((c) => c.id), rivals: rivalDefs.map((c) => c.id), seed: cfg.seed, environment, realms: realmsOn, scenario }, creatures, focusCount: focus.length, roleOf, autoContinuous: false, live, events: [], series: [], pending: null, effects: [], log: [], replayTo: null };
    const extinctAt = new Array(creatures.length).fill(null);
    const lti = KEY_TRAITS.map((n) => E.TRAITS.findIndex((l) => l[0] === n));
    let replayLog = saved ? saved.log.map((e) => ({ ...e })) : null, replayPtr = 0;
    if (saved) { game.replayTo = saved.t; }
    const restoreAuto = () => { if (saved && game.replayTo === null) game.autoContinuous = saved.autoContinuous === true; };
    let seriesStride = 1, seriesCount = 0;
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
    const addEvent = (kind, text) => { const st = live.stats(); game.events.push({ t: st.t, gen: Math.round(gen() * 10) / 10, kind, text }); if (game.events.length > 400) game.events.shift(); };
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
      game.series.push({ t: st.t, pop: st.population, lin: st.lineageAlive, prey: st.preyFraction, traits: meanTraits() });
      if (game.series.length > SERIES_MAX) { game.series = game.series.filter((_, i) => i % 2 === 0); seriesStride *= 2; }
    }
    record();

    function detect() {
      const st = live.stats(), total = st.population; updateClock(st);
      last.peak = Math.max(last.peak, total);
      if (st.disasters > last.lastDisasters) { addEvent('disaster', `災害が起きた（累計${st.disasters}回）`); last.lastDisasters = st.disasters; }
      for (let i = 0; i < creatures.length; i++) if (st.lineageAlive[i] === 0 && !last.lineageDead[i] && creatures.length > 1) { last.lineageDead[i] = true; extinctAt[i] = st.t; addEvent('lineage', `${creatures[i].name}${tag(i)}の系統が絶えた`); }
      if (creatures.length > 1 && total > 0) { let d = 0; for (let i = 1; i < creatures.length; i++) if (st.lineageAlive[i] > st.lineageAlive[d]) d = i; if (d !== last.dominant) { if (last.dominant >= 0) addEvent('lineage', `最大の系統が${creatures[last.dominant].name}${tag(last.dominant)}から${creatures[d].name}${tag(d)}に交代`); last.dominant = d; } }
      if (total > 0 && total < 30 && !last.crisis) { last.crisis = true; addEvent('crisis', `個体数が${total}体まで減った`); }
      if (last.crisis && total >= 60) last.crisis = false;
      const tm = meanTraits();
      for (let i = 0; i < KEY_TRAITS.length; i++) {
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
      if (live.t % DETECT_EVERY === 0) updateScenario();
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
    game.save = () => ({ v: 3, cfg: game.cfg, t: live.t, log: game.log.map((e) => ({ ...e })), autoContinuous: game.autoContinuous });
    // Only values the engine actually computes: living counts, their change over about the last 100 steps, extinction time,
    // and the catches recorded on individuals that are still alive. The prey is a shared background resource, not a lineage,
    // so there is no predator-prey relation between lineages to report; the report says so instead of inventing one.
    game.lineageReport = () => {
      const st = live.stats(), ind = live.individuals(), S = game.series, ago = st.t - 100;
      let ref = null; for (let i = S.length - 1; i >= 0; i--) if (S[i].t <= ago) { ref = S[i]; break; }
      const catches = new Array(creatures.length).fill(0); for (const x of ind) catches[x.lin] += x.catches;
      return creatures.map((c, i) => ({ lin: i, id: c.id, name: c.name, color: c.color, role: roleOf(i), alive: st.lineageAlive[i], change100: ref ? st.lineageAlive[i] - ref.lin[i] : null,
        extinct: st.lineageAlive[i] === 0, extinctAt: extinctAt[i], catchesOfLiving: catches[i] }));
    };
    // Realm distribution and movement: counted from the engine's own individuals. Null for saves made before realms existed.
    game.realmReport = () => {
      if (!realmsOn) return null; const st = live.stats();
      return { realms: E.REALM_DEFS.map((r, i) => ({ id: r.id, name: r.name, total: st.realmAlive[i].reduce((a, b) => a + b, 0), byLineage: st.realmAlive[i].slice() })), moves: st.moves.map((r) => r.slice()) };
    };
    game.historyInfo = () => (scenario === 'kpg' ? { scenario, ...HIST.clock(live.t), events: HIST.EVENTS } : null);
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
