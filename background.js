(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaBackground = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Background ecosystem: the world OUTSIDE the detailed arena, simulated coarsely.
  //
  //  * It is a set of functional groups, one per creature type that the player is not following. Each group has a population
  //    in UNITS per realm (individual-equivalents, not counted individuals). Units are updated on a coarse grid with a logistic
  //    rule, niche-overlap competition between groups, a scenario resource factor, and a little deterministic noise.
  //  * Nothing here is also simulated in detail: arena individuals and background units live in different places, so they are
  //    never added together. Units that cross into the arena are REMOVED from the pool (conserved) and appear as individuals.
  //  * Nothing is created from nothing: a group can only supply immigrants while it still has units, and it can go extinct.
  //    Immigrants carry the group's ancestral genome; the background does not evolve.
  //  * The player's own lineage has no pool (it is the lineage being followed), so the arena can end it.
  // Only the groups listed are computed. The world is understood to hold vastly more life than that; no number here claims otherwise.
  const SUB = 5, REALMS = 4, REALM_FACTOR = [1.0, 1.0, 0.45, 0.25]; // water, land, underground, air (same order as the engine's realms)
  const PARAMS = { K0: 60, rho: 0.04, noise: 0.25, migration: 0.004, floor: 0.05 };
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function overlap(a, b) { let n = 0, d = 0; for (let k = 0; k < a.length; k++) { n += a[k] * b[k]; d += a[k] * a[k]; } return d > 0 ? n / d : 0; }
  function create(seed, groups) { // groups: [{ id, lin, niche:[..] }]
    const rng = mulberry(seed * 7919 + 13);
    const st = { rng, tick: 0, groups: groups.map((g) => ({ id: g.id, lin: g.lin, niche: g.niche, B: REALM_FACTOR.map((f) => 0.5 * PARAMS.K0 * f), prevTotal: 0, growth: 0, immigrantsTotal: 0, extinct: false })), alpha: null };
    st.alpha = st.groups.map((a) => st.groups.map((b) => overlap(a.niche, b.niche)));
    for (const g of st.groups) g.prevTotal = g.B.reduce((a, b) => a + b, 0);
    return st;
  }
  const poisson = (rng, lam) => { if (lam <= 0) return 0; const L = Math.exp(-Math.min(lam, 30)); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 60); return k - 1; };
  // ctx: { dt, resourceMod, arenaCount:[4] }  -> { immigrants:[{group, lin, realm, n}] }
  function tick(st, ctx) {
    const out = []; st.tick++;
    const dtEff = ctx.dt / SUB * PARAMS.rho;
    for (let s = 0; s < SUB; s++) for (let r = 0; r < REALMS; r++) {
      const K = PARAMS.K0 * REALM_FACTOR[r] * Math.max(0.05, ctx.resourceMod);
      for (let i = 0; i < st.groups.length; i++) { const g = st.groups[i]; if (g.extinct) continue; let load = 0; for (let j = 0; j < st.groups.length; j++) load += st.alpha[i][j] * st.groups[j].B[r]; g.B[r] = Math.max(0, g.B[r] + g.B[r] * dtEff * (1 - load / K)); }
    }
    for (const g of st.groups) {
      if (g.extinct) continue;
      for (let r = 0; r < REALMS; r++) { g.B[r] *= 1 + (st.rng() - 0.5) * PARAMS.noise * 0.2; if (g.B[r] < PARAMS.floor) g.B[r] = 0; }
      const total = g.B.reduce((a, b) => a + b, 0);
      if (total === 0) { g.extinct = true; g.growth = -1; continue; }
      g.growth = g.prevTotal > 0 ? (total - g.prevTotal) / g.prevTotal : 0; g.prevTotal = total;
      for (let r = 0; r < REALMS; r++) {
        const free = Math.max(0.05, 1 - (ctx.arenaCount[r] || 0) / (PARAMS.K0 * REALM_FACTOR[r] * 1.5));
        const n = Math.min(Math.floor(g.B[r]), poisson(st.rng, PARAMS.migration * g.B[r] * free * (ctx.dt / 25)));
        if (n > 0) { g.B[r] -= n; g.immigrantsTotal += n; out.push({ group: g.id, lin: g.lin, realm: r, n }); }
      }
    }
    return { immigrants: out };
  }
  function summary(st) { return st.groups.map((g) => ({ id: g.id, lin: g.lin, units: g.B.reduce((a, b) => a + b, 0), byRealm: g.B.slice(), growth: g.growth, immigrantsTotal: g.immigrantsTotal, extinct: g.extinct })); }
  return { PARAMS, REALM_FACTOR, create, tick, summary, overlap };
});
