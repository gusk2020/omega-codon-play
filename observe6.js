(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dish2'), require('./niche'), require('./world')); else root.OmegaObserve6 = factory(root.OmegaDish2, root.OmegaNiche, root.OmegaWorld);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DISH2, NICHE, WORLD) {
  'use strict';
  // Read-only observation for the Stage 6 screens (the circular dish, the ability gauges and the save summary). Nothing here feeds back into the simulation.
  // It is created once per game with what it needs from the game layer (createGame in game.js) and attaches game.dish2, game.abilities, game.summary2 and game.sel.
  //   env: { E, game, cfg, live, creatures, ever, extinctAt, wm, controlled(), lineageTraitMeans(), normOf(traits), codexCount(), featCount(), S4 }
  function create(env) {
    const { E, game, cfg, live, creatures, ever, extinctAt, wm, lineageTraitMeans, normOf, controlled, codexCount, featCount, S4 } = env;
      // ======== Stage 6: the circular dish. The sites a lineage has held are recorded from where living individuals really are (see dish2.js). ========
      const siteBook = S4 ? DISH2.newBook(creatures.length) : null, REALM_NAMES = ['water', 'land', 'underground', 'air'];
      const hash01 = (id) => { let h = (id * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
      function recordSites() {
        if (!siteBook || !wm) return; const inds = live.individuals(); if (!inds.length) { DISH2.record(siteBook, [], wm.years); return; }
        const amb = WORLD.ambient(wm), ce = WORLD.catEffects(wm), prof = REALM_NAMES.map((id, r) => NICHE.profile(id, amb.warmSolar + amb.warmCiv + (ce ? ce.dT[r] : 0))), means = lineageTraitMeans(), bxf = NICHE.makeBox(E), box = creatures.map((c, i) => { const m = means[i]; if (!m) return null; const o = new Float64Array(4); bxf(m.mean, false, o); return Array.from(o); });
        const acc = new Map();
        for (const q of inds) {
          const rn = REALM_NAMES[q.patch], p = prof[q.patch]; let side, T, P;
          if (rn === 'land') { const b = box[q.lin]; if (!b) continue; side = 'land'; P = DISH2.P_ATM; T = b[0] + (b[1] - b[0]) * hash01(q.id); } // provisional: land has no temperature bins, so individuals are spread over their lineage's tolerated range
          else { if (!p) continue; side = rn === 'water' ? 'water' : 'land'; T = p.T[q.zb]; P = p.P[q.zb]; }
          const s = DISH2.siteOf(side, T, P), key = DISH2.siteKey(side, s.row, s.ring), k = q.lin * 1e6 + key; acc.set(k, (acc.get(k) || 0) + 1);
        }
        DISH2.record(siteBook, [...acc].map(([k, n]) => ({ lin: Math.floor(k / 1e6), key: k % 1e6, n })), wm.years);
      }
      let dish2Cache = { t: -1, v: null };
      game.dish2 = () => {
        if (!S4) return null; if (dish2Cache.t === live.t && dish2Cache.v) return dish2Cache.v;
        const st = live.stats(), dom = game.dominance() || [], wi = game.worldInfo(), amb = WORLD.ambient(wm);
        const lineages = creatures.map((c, i) => {
          if (!ever[i]) return null; const d = dom[i], inf = d && d.value !== null && d.value !== undefined ? d.value : 0, bs = DISH2.beads(siteBook, i), tot = bs.reduce((a, b) => a + b.n, 0);
          return { lin: i, id: c.id, name: c.name, color: c.color, alive: st.lineageAlive[i], extinct: st.lineageAlive[i] === 0, extinctAt: extinctAt[i], influence: inf, influenceReliable: !!(d && d.reliable !== false && d.parts), beads: bs.map((b) => ({ ...b, share: tot ? b.n / tot : 0, size: inf * (tot ? b.n / tot : 0) })) };
        }).filter(Boolean);
        let civ = null; if (wi && wi.civ) { const f = DISH2.fractionOfTemperature(NICHE.TREF + amb.warmSolar + amb.warmCiv), p = DISH2.place('land', f, DISH2.P_ATM); civ = { x: p.x, y: p.y, T: wi.civ.T, stage: wi.civ.stage, N: wi.civ.N, size: Math.min(1, wi.civ.T / 8), reach: wi.civ.reach, pollution: wi.residue.pollution, placement: 'provisional' }; }
        const past = wi ? wi.history.map((h) => ({ born: h.born, ended: h.ended, peakT: h.peakT })) : [];
        const v = { t: live.t, years: wi ? wi.years : 0, presentYears: wi ? wi.presentYears : null, rAtm: DISH2.R_ATM, lineages, civ, pastCivs: past, focus: controlled(), sources: DISH2.SOURCES };
        dish2Cache = { t: live.t, v }; return v;
      };
      // the eight abilities of a lineage as 0..1 (each trait scaled over its own allowed range; dormancy is shown as depth, so deeper = more). Means over living individuals only.
      const ABILITIES = [['tolerance', '耐性', '暑さ・寒さ・圧力・病気へのたえやすさ'], ['metabolism', '代謝', '活動の速さ。高いほど動けるが、燃料を多く使う'], ['repairRate', '修復', '傷や劣化を直す力'], ['dormancyDepth', '休眠', '飢えや危機を休眠でしのぐ深さ'], ['predation', '捕食', '獲物を捕る力'], ['movement', '移動', '場所を動く力'], ['immune', '免疫', '病気に強い度合い'], ['fecundity', '繁殖', '子を残す力']];
      game.abilities = (lin) => { const m = lineageTraitMeans()[lin]; if (!m) return null; const nr = normOf(m.mean); return { lin, name: creatures[lin].name, count: m.count, items: ABILITIES.map(([k, ja, text]) => ({ id: k, name: ja, text, value: nr[k] })), note: '個体の形質の平均を、それぞれの取りうる範囲で0〜1にしたものです（生きている個体のみ）。' }; };
      game.sel = null; // the lineage the player is looking at on the dish / tree / codon screens (an id from the creature roster; kept in milestone saves)
      // A compact description of the world for the save screens (Stage 6): what a player needs to tell whether a loaded world is the same one.
      game.summary2 = () => {
        if (!S4 || !wm) return null; const st = live.stats(), wi = game.worldInfo(), rk = game.rank;
        return { v: 1, seed: cfg.seed, t: live.t, years: wi.years, bpText: wi.bpText, elapsedText: wi.elapsedText, mode: cfg.heritage ? '特殊' : '通常',
          alive: creatures.map((c, i) => (ever[i] ? { id: c.id, name: c.name, color: c.color, n: st.lineageAlive[i] } : null)).filter((x) => x && x.n > 0), extinct: creatures.filter((c, i) => ever[i] && st.lineageAlive[i] === 0).map((c) => c.id),
          individuals: st.population, individualsKind: '計算中の個体の実数', rank: { current: rk.current ? rk.current.rank : null, best: rk.best ? rk.best.rank : null, lin: rk.best ? creatures[rk.best.lin].id : null },
          codex: codexCount(), feats: featCount(), civ: wi.civ ? wi.civ.stage : null, mark: `乱数の種${cfg.seed}・${live.t}ステップ・図鑑${codexCount()}件・偉業${featCount()}件` };
      };
    return { siteBook, recordSites };
  }
  return { create };
});
