/* Omega Codon Stage 1.7 — Stage 1.6 plus single-variable interventions on the reproduction -> predation ->
 * prey depletion -> extinction pathway. With every new option at its default this engine reproduces Stage 1.6
 * (../stage1.6/engine16.js) bit for bit; test17.js checks it. Each option moves ONE thing:
 *   birthScale        multiplies the per-step reproduction probability (births). Offspring still cost energy.
 *   captureScale      multiplies the probability that a hunt succeeds (predation intensity per hunt).
 *   preyGrowthScale   multiplies the prey logistic growth rate (prey recovery rate).
 *   preyHidden        a fraction of prey capacity that hunters cannot reach (PROTECTION ONLY): the stock seeds
 *                     recovery, but none of it is food.
 *   preyInflow        extra prey arriving per patch per step, as a fraction of capacity (FOOD ONLY): no stock
 *                     is protected from hunting.
 *   preyRefuge        (Stage 1.6) a floor the prey stock is reset to every step: protection AND a free food
 *                     supply; kept as the positive control, and its food contribution is now measured.
 * New measurements, so that every intervention can be checked for whether it moved its target variable:
 * births and catches per individual-step, prey produced / caught / added by the floor per patch-step.
 *
 * Stage 1.6 header follows.
 * Omega Codon Stage 1.6 — Stage 1.5 plus separately controllable mechanisms. With every new
 * option at its default this engine reproduces Stage 1.5 (../engine15.js) bit for bit; test16.js
 * checks that. New options (all neutral by default):
 *   storageSupply        probability weight that a mutation which retargets or adds a gene effect
 *                        picks the storage trait: P = s/(NL+s); 1 = uniform (Stage 1.5). A mutation-
 *                        SUPPLY knob; it does not favour any capacity.
 *   storageEffectScale   multiplier on the size of effect weights aimed at storage (new effects, and
 *                        point changes of existing ones). An effect-SIZE knob.
 *   infection            {duration, load}: a fixed infection duration instead of load dynamics, so the
 *                        infection duration is an independent parameter (the wave interval and the memory
 *                        retention memoryDecay are the other two).
 *   infectionSeverity    multiplier on infection damage (pathogen virulence).
 *   preyRefuge           prey density cannot fall below this fraction of capacity (breaks the
 *                        prey-depletion pathway); preyScale scales prey capacity only.
 *   fecundityLocked      reproduction uses the founder fecundity whatever the genome says (breaks the
 *                        'selection raises fecundity' pathway); every other trait still evolves.
 * New measurements: infection duration actually observed, wave exposures, exposures that met a held
 * memory, infections that memory PREVENTED (counted with the same random draw, so it adds none),
 * storage-carrier fraction over time, prey fraction early / minimum, early population maximum.
 *
 * Stage 1.5 header follows.
 * Omega Codon Stage 1.5 — Stage 1.4 plus evolvable energy storage, lineage tracking
 * and a memory benefit/cost separation. With every new option at its default this
 * engine reproduces Stage 1.4 (stage1.4/engine14.js) bit for bit; test15.js checks it.
 * New options (all off / neutral by default):
 *   storageEvolvable  true = the energy store capacity is a developed trait (index
 *                     NL in TRAITS, founder value 3 = Stage 1.4's constant). It has NO
 *                     founder gene: it can only change when a mutation points an
 *                     existing gene's effect at it, like any other trait.
 *   storageCost       energy per step per unit of capacity (applies to the fixed
 *                     capacity 3 as well when storageEvolvable is false, so a fixed
 *                     control can pay the same baseline).
 *   memoryBenefit     false = memory is learned, held and PAID FOR but gives no
 *                     protection, sensing or predation benefit (isolates the cost).
 *   lineageCount      >1 = founders are split into that many ancestral lineages
 *                     (founder i belongs to lineage i % lineageCount, inherited by every
 *                     descendant); per-lineage counts and extinction steps are reported,
 *                     so competition is measured directly, not inferred from trait means.
 * Reported separately and never combined: population (min/median/max), individual
 * lifespan (calendar / active / internal), and lineage persistence (calendar steps the
 * lineage existed, censored at the run length). Births are also traced per step.
 *
 * Stage 1.4 header follows.
 * Omega Codon Stage 1.4 — Stage 1.3 plus switchable ecological regimes.
 * With every new option at its default this engine reproduces Stage 1.3
 * (stage1.3/engine13.js) bit for bit; test14.js checks that directly.
 * New options (all off by default), used only to test whether longevity,
 * low metabolism, cell memory or GRN plasticity can be favoured by selection:
 *   pathogenRegime  {mode:'same'|'near'|'novel', interval, waveLength, strength}
 *                   epidemic waves of a pathogen strain with an antigen on a
 *                   16-position ring; immune memory is antigen-specific and,
 *                   like all memory here, lives only in original cells (A1)
 *   memoryCost      false = memory carried and learned at zero energy cost
 *   memoryDecay     multiplier on the memory decay rate (retention period)
 *   breedingRegime  {openProb, windowLength}: reproduction possible only in
 *                   rare, irregular windows (never forbidden outright)
 *   resourceRegime  {period, pulseLength}: same mean food delivered in pulses
 *   thermalRegime   {mode:'periodic'|'noise', mean, amp, period}: predictable
 *                   cycle vs. uncorrelated noise with the same distribution
 *   plasticity      false = develop at reference signals only, no re-acclimation
 *   acclimateEvery, acclimateCost  re-acclimation time scale and its energy cost
 * There is still no fitness function and no bonus for any outcome.
 *
 * Stage 1.3 header follows.
 * Omega Codon Stage 1.3 — gene-block genome with a gene-regulatory network.
 * An abstract software model, not a biological predictor. It does not create
 * organs, and it makes no claim about real plants, sharks, deep-sea animals
 * or archaea. Every capacity is one of the traits or modes declared below;
 * what evolves is the genome that produces them.
 *
 * Changes from Stage 1.2 (stage1.2/engine12.js, kept unchanged):
 *   - the fixed per-trait loci are replaced by an ordered list of gene blocks
 *     (structural and regulatory) that develop into the traits through a
 *     gene-regulatory network; genes are pleiotropic, no gene is one ability;
 *   - duplication, deletion, substitution, translocation, inversion,
 *     silencing and de novo genes; genome length and expression cost energy;
 *   - development responds to signals at birth and re-acclimates every 25
 *     steps of age (developmental plasticity; regulation=false removes it);
 *   - reviewer fixes: tie-safe switching threshold, decision quality scored
 *     on the chosen mode, capacity culls recorded as deaths, true median,
 *     no argument-spread max.
 * Behaviour, sensing, regeneration, memory, pathogens, disasters, birth,
 * death and extinction rules are Stage 1.2's, unchanged.
 *
 * Game-specific assumptions (stated, not derived from biology):
 *   A1 Memory lives only in the original cell cohort. Replaced cells start
 *      blank and division does not pass memory on. Offspring start at M = 0.
 *   A2 (switchable, `rateOfLiving`) intrinsic damage accrues per unit of
 *      metabolic activity ("internal time"), not per calendar step. This is
 *      a contested hypothesis in real biology; it is an option here so its
 *      effect can be measured rather than assumed.
 *   A3 One step = one calendar "season". Internal time is tracked separately
 *      and is never used as calendar time. No log scale is used anywhere in
 *      the model or its metrics; a log scale, if any, is a display choice.
 * There is no fitness function: only survival and reproduction select.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OmegaEngine19 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODES = ['dormant', 'wait', 'explore', 'hunt', 'repair'];
  const M_DORMANT = 0, M_WAIT = 1, M_EXPLORE = 2, M_HUNT = 3, M_REPAIR = 4, M_TRANSITION = 5;
  const NM = MODES.length;
  const INPUTS = ['bias', 'preyCue', 'scarcity', 'thermal', 'danger', 'energy', 'damage', 'infected', 'rhythmSin', 'rhythmCos'];
  const NI = INPUTS.length;

  // Traits: [name, min, max, founder value]. In Stage 1.3 these are no longer
  // loci: each is the developmental read-out of the gene-regulatory network.
  const LOCI = [
    ['metabolism', 0.2, 1.6, 1.0],     // scales every cost, every capacity, and (A2) ageing
    ['movement', 0, 1, 0.6],           // foraging reach while exploring
    ['predation', 0, 1, 0.4],          // capture ability while hunting
    ['tolerance', 0, 1, 0.4],          // resistance to heat/cold and disasters
    ['immune', 0, 1, 0.4],
    ['fecundity', 0, 1, 0.6],
    ['repairRate', 0, 1, 0.5],         // regeneration effort per step
    ['replaceRatio', 0, 1, 0.3],       // share of regeneration done by replacing cells
    ['dormancyDepth', 0.05, 0.5, 0.3], // metabolic fraction while dormant (lower = deeper)
    ['falsePositive', 0.02, 0.5, 0.25],
    ['falseNegative', 0.02, 0.5, 0.25],
    ['memoryLearn', 0, 1, 0.3],        // acquisition rate (costs while carried)
    ['memoryUpkeep', 0.05, 1, 0.5],    // maintenance spend: more = slower decay, more cost
    ['switchThreshold', 0, 2, 0.4],   // a new mode must beat the current one by this much
    ['rhythmPeriod', 4, 60, 20],
    ['rhythmPhase', -3.1416, 3.1416, 0],
  ];
  const L = Object.fromEntries(LOCI.map((l, i) => [l[0], i]));
  const NL = LOCI.length;
  // TRAITS = LOCI plus the energy-store capacity (developed like every trait; no founder gene)
  const TRAITS = LOCI.concat([['storage', 1, 10, 3]]);
  const NT = TRAITS.length;

  const DEFAULTS = {
    seed: 1, steps: 2000, founders: 100, patches: 4, maxPopulation: 6000,
    environment: 'rich', variable: true,
    selection: true, memory: true, switching: true, replacement: true, rateOfLiving: true,
    mutation: true, mutationRate: 0.3, extrinsicMortality: 0.01, migrationRate: 0.02,
    sampleEvery: 20, founderGenomes: null, maxEdges: 30, regulation: true, resourceScale: 1,
    pathogenRegime: null, memoryCost: true, memoryDecay: 1, breedingRegime: null, resourceRegime: null, thermalRegime: null,
    plasticity: true, acclimateEvery: 25, acclimateCost: 0,
    storageEvolvable: false, storageCost: 0, memoryBenefit: true, lineageCount: 1,
    storageSupply: 1, storageEffectScale: 1, infection: null, infectionSeverity: 1, preyRefuge: 0, preyScale: 1, fecundityLocked: false,
    birthScale: 1, captureScale: 1, preyGrowthScale: 1, preyHidden: 0, preyInflow: 0, live: false,
    continueWhenEmpty: false, // live mode: keep stepping when the arena is empty (the game layer may bring individuals back from outside)
    founderCounts: null, // null = `founders` split evenly over `lineageCount`; an array gives each lineage its own starting count (zero allowed: a lineage slot kept for later introduction)
    niche: null, // null = every individual draws on the same plant food; {slots, weights:[per lineage][per slot]} partitions that food into separate resources
    realms: null, // null = the original undivided patches (bit-identical to Stage 1.7); true or {…} = the four habitat realms below
    abnormal: null, // Stage 2.0: null = off (bit-identical); true or {…} = abnormal-cell (cancer-like) model: arises with cell turnover and damage, grows, is held down by immune surveillance, kills when it gets large
    civ: false, // Stage 2.0: true = accept per-realm / per-lineage pressure from an outside civilisation model (setCiv) and per-lineage strategies (setStance); false = bit-identical
    depth: null, // Stage 3.0: null = off (bit-identical); {T,P,res,act,box} = individuals have a depth/height bin in each realm; a bin outside an individual's temperature-pressure box damages it every step
    v31: null, // Stage 3.1: null = off (bit-identical); {free,evo,tgt} = free realm crossings, evolution events (exchange / fusion / separation) and per-target stances
    deathRecordCap: Infinity, // live runs of unbounded length keep only this many compact death records (counts and sums are exact regardless)
  };
  // Habitat realms (Stage 1.9B). A realm is a patch with a name and a minimal set of attributes. THESE NUMBERS ARE GAME SETTINGS, NOT
  // MEASUREMENTS: they only make the four realms different enough to matter (food, prey capacity, thermal stress, disease pressure),
  // relative to the chosen base environment. Movement between realms is an individual act that costs energy, needs a minimum reserve,
  // depends on the movement trait, and is only possible between adjacent realms; whether the arrival survives is decided by the
  // existing thermal / starvation / disease mechanics, not by a rule here.
  const REALM_DEFS = [
    { id: 'water', name: '水中', resource: 1.0, prey: 1.0, thermal: -0.05, pathogen: 1.0 },
    { id: 'land', name: '地上', resource: 1.0, prey: 1.0, thermal: 0.05, pathogen: 1.0 },
    { id: 'underground', name: '地中', resource: 0.45, prey: 0.5, thermal: -0.1, pathogen: 0.6 },
    { id: 'air', name: '空中', resource: 0.25, prey: 0.4, thermal: 0.15, pathogen: 0.3 },
  ];
  const REALM_ADJ = [[1, 2], [0, 2, 3], [0, 1], [1]]; // water-land, water-underground, land-underground, land-air
  const REALM_DIFF = [[0, 1.0, 1.5, 0], [1.0, 0, 1.0, 1.5], [1.5, 1.0, 0, 0], [0, 1.5, 0, 0]]; // relative crossing difficulty
  const FREE_DIFF = [[0, 1.0, 1.5, 3.0], [1.0, 0, 1.0, 1.5], [1.5, 1.0, 0, 2.5], [3.0, 1.5, 2.5, 0]]; // Stage 3.1: crossing difficulty between any two realms; the reference roads are the cheap ones, the rest are possible but dear
  const ALL_ADJ = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]];
  const REALM_MOVE = { rate: 0.05, cost: 0.04, reserve: 0.3, start: [1], startByLineage: null };

  // resource: plant food per patch per step; prey: prey carrying capacity per
  // patch; injury: damage multiplier while hunting.
  const ENVIRONMENTS = {
    rich:            { resource: 22, prey: 60, thermal: 0.2,  pathogen: 0.04, disasterRate: 0.002, injury: 1 },
    scarce:          { resource: 5,  prey: 15, thermal: 0.3,  pathogen: 0.04, disasterRate: 0.002, injury: 1 },
    plague:          { resource: 18, prey: 40, thermal: 0.2,  pathogen: 0.28, disasterRate: 0.002, injury: 1 },
    preyless:        { resource: 10, prey: 3,  thermal: 0.25, pathogen: 0.04, disasterRate: 0.002, injury: 1 },
    damageHeavy:     { resource: 16, prey: 40, thermal: 0.8,  pathogen: 0.06, disasterRate: 0.004, injury: 2.5 },
    extremeDisaster: { resource: 16, prey: 40, thermal: 0.4,  pathogen: 0.06, disasterRate: 0.03, injury: 1 },
  };

  const ENERGY_MAX = 3, MATURITY_AGE = 3, OFFSPRING_COST = 0.55, OFFSPRING_ENERGY = 0.45;
  const SWITCH_COST = 0.02, HUNT_GAIN = 1.5;
  const MODE_METAB = [null, 0.6, 1.0, 1.3, 0.9, 0.6]; // dormant comes from its locus

  function rng(seed) {
    let x = Number(seed) >>> 0;
    return function () {
      x = (x + 0x6D2B79F5) >>> 0;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---- genome: gene blocks + gene-regulatory network (Stage 1.3) ------------
  // A genome is an ordered list of gene blocks plus the behaviour circuit.
  //   structural gene {k:0, prom, sens, len, on, eff:[[trait, weight], ...]}
  //   regulatory gene {k:1, prom, sens, len, on, bind, w}
  // prom/bind are binding motifs on a 16-position ring. A regulatory gene's
  // product (a transcription factor) acts on every gene whose promoter motif
  // is close to its binding motif, more strongly on near neighbours in the
  // sequence (so order, translocation and inversion matter). sens couples a
  // promoter to one developmental signal. A structural gene's product shifts
  // one to three traits (pleiotropy), so no gene is one ability, and which
  // traits it touches can mutate. Traits are read out through a sigmoid from
  // baselines calibrated once so that the founder reproduces Stage 1.2's
  // founder phenotype exactly; the calibration constants never evolve.
  const MOTIFS = 16, MAX_GENES = 64, MIN_GENES = 4;
  const DEV_SIGNALS = ['scarcity', 'pathogen', 'thermal', 'damage'];
  const NDS = DEV_SIGNALS.length;
  const REFERENCE_DEV = [0.5, 0.2, 0.25, 0.1];
  const GENE_COST = 0.0008, EXPRESSION_COST = 0.0008, ACCLIMATE_EVERY = 25;
  const logit = (p) => Math.log(p / (1 - p));
  const sig = (v) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, v))));

  function motifDistance(a, b) { const d = Math.abs(a - b) % MOTIFS; return Math.min(d, MOTIFS - d); }

  function founderGenome() {
    const r = rng(20261017);
    const genes = [];
    // every trait is touched by at least one gene, most by several
    for (let k = 0; k < NL; k++) genes.push(structural(r, [[k, 0.6 + 0.4 * r()]]));
    for (let i = 0; i < 8; i++) {
      const eff = [], n = 1 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) eff.push([Math.floor(r() * NL), (r() - 0.5) * 1.6]);
      genes.splice(Math.floor(r() * genes.length), 0, structural(r, eff));
    }
    for (let i = 0; i < 6; i++) genes.splice(Math.floor(r() * genes.length), 0, regulatory(r));
    const e = (m, i, w) => ({ m, i: INPUTS.indexOf(i), w });
    const edges = [
      e(M_EXPLORE, 'bias', 0.6), e(M_WAIT, 'bias', 0.1), e(M_HUNT, 'bias', -0.3), e(M_REPAIR, 'bias', -0.6), e(M_DORMANT, 'bias', -1.2),
      e(M_HUNT, 'preyCue', 1.4), e(M_REPAIR, 'damage', 1.6), e(M_DORMANT, 'scarcity', 0.8), e(M_DORMANT, 'thermal', 0.5),
      e(M_WAIT, 'energy', 0.4),
    ];
    return { genes, edges };
  }
  function structural(r, eff) {
    return { k: 0, prom: Math.floor(r() * MOTIFS), sens: r() < 0.3 ? [Math.floor(r() * NDS), (r() - 0.5) * 2] : null, len: 1 + Math.floor(r() * 3), on: true, eff };
  }
  function regulatory(r) {
    return { k: 1, prom: Math.floor(r() * MOTIFS), sens: r() < 0.5 ? [Math.floor(r() * NDS), (r() - 0.5) * 3] : null, len: 1 + Math.floor(r() * 2), on: true,
      bind: Math.floor(r() * MOTIFS), w: (r() - 0.5) * 4 };
  }
  const cloneGene = (g) => ({ ...g, sens: g.sens ? g.sens.slice() : null, eff: g.eff ? g.eff.map((e) => e.slice()) : undefined });
  const cloneGenome = (g) => { const c = { genes: g.genes.map(cloneGene), edges: g.edges.map((x) => ({ m: x.m, i: x.i, w: x.w })) }; if (g.tags) c.tags = g.tags; if (g.sym) c.sym = true; return c; };

  // Regulatory wiring depends only on the genome, so it is computed once per
  // genome object (clones share the object) and cached on it.
  function wiring(genome) {
    if (genome._wiring) return genome._wiring;
    const gs = genome.genes, n = gs.length, links = [];
    for (let i = 0; i < n; i++) {
      if (!gs[i].on) continue;
      for (let j = 0; j < n; j++) {
        const tf = gs[j];
        if (tf.k !== 1 || !tf.on || i === j) continue;
        const d = motifDistance(gs[i].prom, tf.bind);
        if (d > 2) continue;
        const a = (d === 0 ? 1 : d === 1 ? 0.5 : 0.2) * (Math.abs(i - j) <= 2 ? 1.5 : 1);
        links.push(i, j, a * tf.w);
      }
    }
    let len = 0; for (const g of gs) len += g.len;
    genome._wiring = { links, len };
    return genome._wiring;
  }

  // Development: iterate the network to a near-steady expression under the
  // given signals, then read traits out. regulation=false removes every
  // regulatory and signal term (an additive genotype->phenotype map).
  function expressGenes(genome, signals, regulation) {
    const gs = genome.genes, n = gs.length, x = new Float64Array(n), w = wiring(genome);
    for (let i = 0; i < n; i++) x[i] = gs[i].on ? sig(-0.5) : 0;
    if (regulation) {
      const input = new Float64Array(n);
      for (let round = 0; round < 4; round++) {
        for (let i = 0; i < n; i++) input[i] = gs[i].sens ? gs[i].sens[1] * signals[gs[i].sens[0]] : 0;
        for (let k = 0; k < w.links.length; k += 3) input[w.links[k]] += w.links[k + 2] * x[w.links[k + 1]];
        for (let i = 0; i < n; i++) x[i] = gs[i].on ? sig(-0.5 + input[i]) : 0;
      }
    }
    return x;
  }
  function rawTraitDrive(genome, x) {
    const d = new Float64Array(NT), gs = genome.genes;
    for (let i = 0; i < gs.length; i++) if (gs[i].k === 0 && x[i] > 0) for (const [t, wt] of gs[i].eff) d[t] += wt * x[i];
    return d;
  }
  const CALIBRATION = {};
  function calibration(regulation) {
    const key = regulation ? 'on' : 'off';
    if (CALIBRATION[key]) return CALIBRATION[key];
    const f = founderGenome(), d = rawTraitDrive(f, expressGenes(f, REFERENCE_DEV, regulation));
    CALIBRATION[key] = TRAITS.map((l, k) => logit((l[3] - l[1]) / (l[2] - l[1])) - d[k]);
    return CALIBRATION[key];
  }
  // Returns {traits, geneCost}; traits are in the same units as Stage 1.2's loci.
  function develop(genome, signals, regulation = true) {
    const x = expressGenes(genome, signals, regulation), d = rawTraitDrive(genome, x), base = calibration(regulation);
    const traits = new Array(NT);
    for (let k = 0; k < NT; k++) { const [, lo, hi] = TRAITS[k]; traits[k] = lo + (hi - lo) * sig(base[k] + d[k]); }
    let expr = 0; for (let i = 0; i < x.length; i++) expr += x[i] * genome.genes[i].len;
    return { traits, geneCost: GENE_COST * wiring(genome).len + EXPRESSION_COST * expr };
  }

  // ---- Stage 4.0: the codon model (v31.codon). A GAME ABSTRACTION, not DNA: `len` is the physical length of a gene (cells of the codon strip), `len0` what it
  // would be unpacked, an effect with |weight| >= 0.15 is one unit of function. Physical length, functional information and the unpacked length are different numbers. ----
  const codonStats = (g) => {
    if (g._cd) return g._cd; let Lp = 0, Le = 0, info = 0, n = 0, red = 0; const seen = {};
    for (const x of g.genes) { Lp += x.len; Le += x.len0 || x.len; if (x.on) { if (x.k === 0) { for (const e of x.eff) if (Math.abs(e[1]) >= 0.15) info++; if (x.eff.length) { n++; seen[x.eff[0][0]] = (seen[x.eff[0][0]] || 0) + 1; } } else info += 0.5; } }
    for (const x of g.genes) if (x.on && x.k === 0 && x.eff.length && seen[x.eff[0][0]] > 1) red++;
    return (g._cd = { Lp, Le, info, density: Lp ? info / Lp : 0, redundancy: n ? red / n : 0, packed: Le > 0 ? 1 - Lp / Le : 0 });
  };
  let CODON_L0 = 0; const codonL0 = () => CODON_L0 || (CODON_L0 = codonStats(founderGenome()).Lp);
  const burdenOf = (cd) => Math.max(0, Math.min(2, cd.Lp / codonL0() - 1));
  function geneFragility(gene, gs) { // a packed gene mutates harder; a gene with a twin that does the same job mutates softer
    const pk = gene.len0 > gene.len ? 1 - gene.len / gene.len0 : 0; let twin = false;
    if (gene.k === 0 && gene.eff && gene.eff.length) for (const o of gs) if (o !== gene && o.on && o.k === 0 && o.eff && o.eff.length && o.eff[0][0] === gene.eff[0][0]) { twin = true; break; }
    return (1 + 2 * pk) * (twin ? 0.4 : 1);
  }
  function compressGenes(gs, i, r) { // merge a structural gene with its neighbour: shorter, with some risk to the function it carries
    const a = gs[i], b = gs[i + 1]; if (!a || !b || a.k !== 0 || b.k !== 0 || !a.on || !b.on) return null;
    const m = new Map(); for (const [t, w] of a.eff.concat(b.eff)) m.set(t, (m.get(t) || 0) + w);
    let eff = [...m.entries()].map(([t, w]) => [t, w]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])); let lost = 0, damped = false;
    if (eff.length > 3) { lost += eff.length - 3; eff = eff.slice(0, 3); }
    if (r() < 0.3) { const f = 0.6 + 0.4 * r(); eff = eff.map(([t, w]) => [t, w * f]); damped = true; } // interference between the merged functions
    if (eff.length > 1 && r() < 0.15) { eff.pop(); lost++; }
    const len0 = (a.len0 || a.len) + (b.len0 || b.len), len = Math.max(1, Math.ceil((a.len + b.len) * (0.55 + 0.2 * r())));
    return { gene: { ...a, eff, len, len0, sens: a.sens || b.sens }, lost, damped, dL: len - (a.len + b.len) };
  }
  function mutate(parent, r, maxEdges, nTraits = NL, mo = null) {
    const g = cloneGenome(parent), gs = g.genes;
    const sup = mo ? mo.supply : 1, sc = mo ? mo.scale : 1, lg = mo && mo.log ? mo.log : null, cdOn = !!(mo && mo.codon);
    const pick = () => (nTraits > NL && sup !== 1 ? (r() < sup / (NL + sup) ? NL : Math.floor(r() * NL)) : Math.floor(r() * nTraits));
    const ops = 1 + (r() < 0.3 ? 1 : 0);
    for (let n = 0; n < ops; n++) {
      const u = r(), i = Math.floor(r() * gs.length), gene = gs[i];
      if (u < 0.16) { // point: effect weight (structural) or TF strength (regulatory)
        if (gene.k === 0) { const e = gene.eff[Math.floor(r() * gene.eff.length)]; const k = e[0] === NL ? sc : 1, old = e[1], fr = cdOn ? geneFragility(gene, gs) : 1; e[1] = clamp(e[1] + (r() - 0.5) * 0.8 * k * fr, -3 * k, 3 * k); if (lg) lg.push(e[1] >= old ? 'strengthen' : 'weaken'); }
        else { const old = gene.w; gene.w = clamp(gene.w + (r() - 0.5) * 1.5, -4, 4); if (lg) lg.push(gene.w >= old ? 'strengthen' : 'weaken'); }
      } else if (u < 0.22) { // substitution: effect target or a new effect
        if (gene.k === 0) { if (gene.eff.length < 3 && r() < 0.5) { const t = pick(); gene.eff.push([t, (r() - 0.5) * 1.2 * (t === NL ? sc : 1)]); if (lg) lg.push('newcap'); } else { gene.eff[Math.floor(r() * gene.eff.length)][0] = pick(); if (lg) lg.push('alter'); } }
        else { gene.bind = Math.floor(r() * MOTIFS); if (lg) lg.push('alter'); }
      } else if (u < 0.28) { // promoter / signal-sensitivity change (rewiring)
        if (r() < 0.6) gene.prom = Math.floor(r() * MOTIFS); else gene.sens = r() < 0.3 ? null : [Math.floor(r() * NDS), (r() - 0.5) * 3];
        if (lg) lg.push('alter');
      } else if (u < 0.36) { // tandem duplication
        if (gs.length < MAX_GENES) { gs.splice(i + 1, 0, cloneGene(gene)); if (lg) lg.push('newcap'); }
      } else if (u < 0.44) { // deletion
        if (gs.length > MIN_GENES) { gs.splice(i, 1); if (lg) lg.push('loss'); }
      } else if (cdOn && u < 0.48) { // Stage 4.0: compression / reorganisation (replaces translocation in codon worlds)
        const c = compressGenes(gs, i, r); if (c) { gs.splice(i, 2, c.gene); if (lg) { lg.push('compress'); lg.push(c.lost || c.damped ? 'compress-lossy' : 'compress-clean'); } }
      } else if (u < 0.48) { // translocation
        const [x] = gs.splice(i, 1); gs.splice(Math.floor(r() * (gs.length + 1)), 0, x); if (lg) lg.push('alter');
      } else if (cdOn && u < 0.51 && gene.len0 > gene.len) { // Stage 4.0: unpacking a packed gene again
        gene.len = gene.len0; delete gene.len0; if (lg) lg.push('unpack');
      } else if (u < 0.51) { // inversion of a segment
        const j = Math.min(gs.length, i + 2 + Math.floor(r() * 4)); const seg = gs.slice(i, j).reverse(); gs.splice(i, seg.length, ...seg); if (lg) lg.push('alter');
      } else if (u < 0.55) { // silencing / reactivation
        gene.on = !gene.on; if (lg) lg.push(gene.on ? 'newcap' : 'loss');
      } else if (u < 0.57) { // de novo gene (rare)
        if (gs.length < MAX_GENES) { gs.splice(i, 0, r() < 0.5 ? (() => { const t = pick(); return structural(r, [[t, (r() - 0.5) * 1.2 * (t === NL ? sc : 1)]]); })() : regulatory(r)); if (lg) lg.push('newcap'); }
      } else if (u < 0.75) { // behaviour circuit: rewire a weight
        if (g.edges.length) { const x = g.edges[Math.floor(r() * g.edges.length)]; x.w = clamp(x.w + (r() - 0.5) * 1.2, -4, 4); if (lg) lg.push('behaviour'); }
      } else if (u < 0.88) {
        if (g.edges.length < maxEdges) { g.edges.push({ m: Math.floor(r() * NM), i: Math.floor(r() * NI), w: (r() - 0.5) * 3 }); if (lg) lg.push('behaviour'); }
      } else if (g.edges.length) { g.edges.splice(Math.floor(r() * g.edges.length), 1); if (lg) lg.push('behaviour'); }
    }
    return g;
  }

  function genomeStats(genome) {
    const gs = genome.genes, w = wiring(genome);
    const structuralGenes = gs.filter((g) => g.k === 0);
    return { genes: gs.length, totalLength: w.len, regulatory: gs.length - structuralGenes.length, silenced: gs.filter((g) => !g.on).length,
      regulatoryLinks: w.links.length / 3, signalSensitive: gs.filter((g) => g.sens && g.on).length,
      pleiotropy: structuralGenes.length ? structuralGenes.reduce((a, g) => a + new Set(g.eff.map((e) => e[0])).size, 0) / structuralGenes.length : 0 };
  }

  function decide(edges, input, switching, score, current, threshold) {
    score.fill(0);
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k];
      if (!switching && e.i !== 0) continue; // switching off: genetic default only
      score[e.m] += e.w * input[e.i];
    }
    let best = 0;
    for (let m = 1; m < NM; m++) if (score[m] > score[best]) best = m;
    // ties and sub-threshold advantages keep the current mode
    return best !== current && score[best] - score[current] <= threshold ? current : best;
  }

  // ---- simulation -----------------------------------------------------------
  function simulate(userOptions = {}) {
    const o = { ...DEFAULTS, ...userOptions };
    const baseEnv = ENVIRONMENTS[o.environment];
    if (!baseEnv) throw new Error('unknown environment: ' + o.environment);
    const env = { ...baseEnv, resource: baseEnv.resource * o.resourceScale, prey: baseEnv.prey * o.resourceScale * o.preyScale };
    o.steps = clamp(Math.floor(o.steps), 0, o.live ? 1e9 : 100000); // live mode has no fixed end; the game layer decides when to pause
    o.founders = clamp(Math.floor(o.founders), 0, o.maxPopulation);
    o.patches = clamp(Math.floor(o.patches), 1, 32);
    if (o.founderCounts) o.lineageCount = o.founderCounts.length;
    const RM = o.realms ? { ...REALM_MOVE, ...(o.realms === true ? {} : o.realms) } : null;
    if (RM) o.patches = REALM_DEFS.length;
    // Stage 2.0 optional parts. Both are null unless asked for, and every use below is written so that null changes nothing (x*1, x+0).
    const AB = o.abnormal ? { a0: 0.004, grow: 0.04, sup: 0.3, haz: 0.35, cost: 0.03, cap: 3, ...(o.abnormal === true ? {} : o.abnormal) } : null;
    const zeroRealm = () => new Array(o.patches).fill(0), perLin = () => Array.from({ length: o.lineageCount }, zeroRealm);
    // civilisation hooks: res/pathogen are multipliers on a realm, thermal and harm are additions, cap is the chance per step that an exposed
    // individual of a lineage in a realm is taken (capture, cull, machines), subsidy is food handed to a lineage, move scales how freely
    // anyone leaves a realm, press is how dangerous the realm is (used by fleeing individuals). stance: 0 none, 1 flee, 2 coexist, 3 defend, 4 attack.
    // depth: arrays indexed [realm][bin]. T in K, P in Pa, res = food multiplier, act = realms that use bins. box(traits, dormant, out) fills out = [Tlo, Thi, Pmin, Pmax].
    const DP = o.depth ? { T: o.depth.T, P: o.depth.P, res: o.depth.res, act: o.depth.act, box: o.depth.box, bins: o.depth.T[0].length, rate: o.depth.rate ?? 0.12, out: new Float64Array(4), out2: new Float64Array(4), tRate: o.depth.tRate ?? 0.003, pRate: o.depth.pRate ?? 0.05 } : null;
    const NSRC = 5 + (o.civ ? 1 : 0) + (DP ? 1 : 0), PIDX = 5 + (o.civ ? 1 : 0);
    const CV = o.civ ? { res: new Array(o.patches).fill(1), thermal: zeroRealm(), pathogen: new Array(o.patches).fill(1), harm: zeroRealm(), move: new Array(o.patches).fill(1), press: zeroRealm(),
      cap: perLin(), subsidy: perLin(), stance: new Array(o.lineageCount).fill(0), attack: perLin(), taken: perLin(), harmTaken: perLin() } : null;
    const t0 = Date.now();
    // Three independent streams: the environment's history is identical for
    // every condition run with the same seed (paired design), and mutation
    // draws never shift demographic draws.
    const rand = rng(o.seed), envRand = rng((o.seed * 2654435761) ^ 0x51ED27), mutRand = rng((o.seed * 40503) ^ 0xA5A5A5);

    const founder = founderGenome();
    const patches = [];
    for (let p = 0; p < o.patches; p++) { const def = RM ? REALM_DEFS[p] : null, preyCap = def ? env.prey * def.prey : env.prey; const rr = def ? env.resource * def.resource : env.resource, tt = def ? clamp(env.thermal + def.thermal, 0, 1) : env.thermal, pp = def ? clamp(env.pathogen * def.pathogen, 0, 0.6) : env.pathogen;
      patches.push({ i: p, resource: rr, thermal: tt, pathogen: pp, rMult: def ? def.resource : 1, tOff: def ? def.thermal : 0, pMult: def ? def.pathogen : 1, preyCap, hid: o.preyHidden * preyCap,
      target: { resource: rr, thermal: tt, pathogen: pp }, prey: preyCap,
      famine: 0, hit: 0, count: 0, infected: 0, demand: 0, eaten: 0 }); }

    let nextId = 1;
    const refKey = o.regulation ? '_refOn' : '_refOff';
    const carrier = (g) => (g._stc !== undefined ? g._stc : (g._stc = g.genes.some((x) => x.k === 0 && x.eff.some((e) => e[0] === NL))));
    const genotypeTraits = (genome) => genome[refKey] || (genome[refKey] = develop(genome, REFERENCE_DEV, o.regulation).traits);
    const devSignals = (p, damage) => [clamp(p.count * 0.35 / (p.resource + 1), 0, 2), clamp(p.pathogen * 3, 0, 2), p.thermal, clamp(damage, 0, 2)];
    const developInto = (x, signals) => { const d = develop(o.selection ? x.genome : founder, o.plasticity ? signals : REFERENCE_DEV, o.regulation); x.ph = d.traits; x.gcost = d.geneCost; x.cap = o.storageEvolvable ? x.ph[NL] : ENERGY_MAX; };
    const startInf = (x) => { x.load = IFR ? IFR.load : 0.2; x.infLeft = IFR ? IFR.duration : 0; x.infAge = 0; };
    const newborn = (genome, patch, energy, lin = 0) => birth({ id: nextId++, lin, cap: ENERGY_MAX, genome, patch, energy, age: 0, internal: 0, active: 0,
      damage: 0, load: 0, A: 0, O: 1, M: 0, Mpeak: 0, P: 0, mode: M_EXPLORE, pending: -1, arousal: 0, births: 0,
      dmgSrc: NSRC === 5 ? [0, 0, 0, 0, 0] : new Array(NSRC).fill(0), zb: 0, hunts: 0, catches: 0, present: false, strain: -1, imA: -1, imS: 0, imPeak: 0, infections: 0, reinfections: 0, acclimCost: 0, infLeft: 0, infAge: 0 });
    const birth = (x) => { developInto(x, devSignals(patches[x.patch], 0)); return x; };
    let pop = [];
    if (o.founderCounts) { for (let lin = 0; lin < o.founderCounts.length; lin++) for (let j = 0; j < o.founderCounts[lin]; j++) pop.push(newborn(cloneGenome(o.founderGenomes[lin % o.founderGenomes.length]), RM ? (RM.startByLineage ? RM.startByLineage[lin] : RM.start[j % RM.start.length]) : (pop.length % o.patches), 1.0, lin)); }
    else for (let i = 0; i < o.founders; i++) pop.push(newborn(cloneGenome(o.founderGenomes ? o.founderGenomes[i % o.founderGenomes.length] : founder), RM ? (RM.startByLineage ? RM.startByLineage[i % o.lineageCount] : RM.start[i % RM.start.length]) : i % o.patches, 1.0, i % o.lineageCount));

    // Energy ledger: sum(alive energy) == start + intake - spent - reproOverhead - lostAtDeath - overflow + deficit.
    const ledger = { start: pop.reduce((a, x) => a + x.energy, 0), intakePlant: 0, intakePrey: 0, spent: 0, reproOverhead: 0, lostAtDeath: 0, overflow: 0, deficit: 0 };
    const spentBy = { base: 0, memory: 0, regeneration: 0, switching: 0, hunting: 0, acclimation: 0, storage: 0 };
    // regime state (driven only by envRand, so paired seeds share it)
    const memOn = o.memory && o.memoryBenefit;
    const IFR = o.infection, FEC0 = LOCI[L.fecundity][3]; let pendingDisaster = 0; let lifeSumRun = 0;
    const envMod = { resource: 1, thermal: 0, pathogen: 1 }; // external conditions set by a scenario (live mode); neutral by default
    const NICHE = o.niche ? { S: o.niche.slots, w: o.niche.weights, bonus: o.niche.specialistBonus || 0 } : null; // bonus: digestive efficiency on a food rises with how much of the diet it is (a generalist gets factor 1 everywhere)
    const NLN = o.lineageCount, zeros = () => new Array(NLN).fill(0);
    // Stage 3.1 (all null/false unless o.v31): FREE realm crossings, EVOLUTION events and per-target stances (plants / animals). Everything below is a GAME model; see the design record.
    const V31 = o.v31 ? { free: o.v31.free !== false, evo: o.v31.evo !== false, tgt: o.v31.tgt !== false } : null;
    const FREE = !!(V31 && V31.free && RM), offPairs = V31 ? Array.from({ length: NLN }, () => new Array(16).fill(0)) : null;
    const CD = !!(V31 && o.v31.codon), O2S = V31 && o.v31.o2 ? { v: 1 } : null;
    const TG = V31 && V31.tgt ? { plant: zeros(), animal: zeros() } : null;
    const EV = V31 && V31.evo ? { list: [], nextId: 1, rate: { exchange: 0.0004, fusion: 0.0003, sep: 0.02, ...(o.v31.rates || {}) }, counts: Array.from({ length: NLN }, () => ({ strengthen: 0, weaken: 0, newcap: 0, alter: 0, loss: 0, behaviour: 0, exchange: 0, fusion: 0, separation: 0, compress: 0, 'compress-lossy': 0, 'compress-clean': 0, unpack: 0 })), rand: null } : null;
    if (EV) EV.rand = rng((o.seed * 7919) ^ 0x3C6EF3);
    const frRand = V31 ? rng((o.seed * 104729) ^ 0x7F4A7C) : null;
    if (EV) {
      EV.t = 0; const CAP = 400, EVN = 5;
      const CAPS = { mutation: 200, exchange: 100, fusion: 60, separation: 40, 'reorg:compress': 60, 'reorg:unpack': 40 };
      const capKey = (ev) => (ev.kind === 'reorg' ? 'reorg:' + (ev.sub === 'unpack' ? 'unpack' : 'compress') : ev.kind);
      const addEvent = (ev) => { // each kind has its own room, so a flood of one cannot push out the rare ones; a lost event makes room for a new one of its kind; counts are exact regardless
        const key = capKey(ev), same = EV.list.filter((e) => capKey(e) === key);
        if (same.length >= CAPS[key]) { const old = same.find((e) => e.status === 'lost' || e.status === 'faded'); if (!old) return null; EV.list.splice(EV.list.indexOf(old), 1); }
        ev.id = EV.nextId++; ev.t = EV.t; ev.status = 'occurred'; ev.carriers = 0; ev.peak = 0; EV.list.push(ev); return ev;
      };
      const tagged = (parent, child, ev) => { if (ev) { ev.par = parent.tags && parent.tags.length ? parent.tags[parent.tags.length - 1] : null; child.tags = (parent.tags || []).concat(ev.id).slice(-8); } else if (parent.tags) child.tags = parent.tags; return child; };
      // mutation: every one is counted by kind; the notable ones (a new capability, or a large change in a trait) are followed as events
      EV.afterMutation = (x, child, lg, nT) => {
        const c = EV.counts[x.lin]; for (const k of lg) c[k]++;
        if (CD && (lg.includes('compress') || lg.includes('unpack'))) { const pc = codonStats(x.genome), cc = codonStats(child); return tagged(x.genome, child, addEvent({ kind: 'reorg', sub: lg.includes('unpack') ? 'unpack' : lg.includes('compress-lossy') ? 'compress-lossy' : 'compress', lin: x.lin, trait: null, delta: 0, dL: cc.Lp - pc.Lp, dInfo: cc.info - pc.info })); }
        const pri = lg.includes('newcap') ? 'newcap' : lg[0]; if (!pri) return child;
        const pt = genotypeTraits(x.genome), ct = genotypeTraits(child); let bk = -1, bd = 0;
        for (let k = 0; k < NL; k++) { const [, lo2, hi2] = TRAITS[k], d = (ct[k] - pt[k]) / (hi2 - lo2); if (Math.abs(d) > Math.abs(bd)) { bd = d; bk = k; } }
        if (!(pri === 'newcap' || Math.abs(bd) >= 0.08)) return child;
        const ev = addEvent({ kind: 'mutation', sub: Math.abs(bd) >= 0.08 ? (bd > 0 ? 'strengthen' : 'weaken') : pri, lin: x.lin, trait: bk >= 0 ? TRAITS[bk][0] : null, delta: bd });
        return tagged(x.genome, child, ev);
      };
      EV.separate = (x, genome) => {
        if (EV.rand() >= EV.rate.sep * (x.energy < 0.8 ? 2 : 1)) return genome;
        const child = cloneGenome(genome); child.genes = child.genes.filter((g) => !g.sym); child.sym = false;
        if (child.genes.length < MIN_GENES || child.genes.length === genome.genes.length) return genome;
        EV.counts[x.lin].separation++;
        return tagged(genome, child, addEvent({ kind: 'separation', sub: 'release', lin: x.lin, trait: null, delta: 0, lost: genome.genes.length - child.genes.length }));
      };
      const sameSpot = (a, b) => a !== b && a.patch === b.patch && (!DP || Math.abs(a.zb - b.zb) <= 1);
      const findPartner = (a, interOnly) => { for (let tries = 0; tries < 8; tries++) { const b = pop[Math.floor(EV.rand() * pop.length)]; if (sameSpot(a, b) && (!interOnly || b.lin !== a.lin)) return b; } return null; };
      const withGenes = (r, add, ev) => { const ng = cloneGenome(r.genome); for (const g of add) ng.genes.push(g); tagged(r.genome, ng, ev); return ng; };
      const takeGenes = (d, n, sym) => {
        const pool = d.genome.genes.filter((g) => g.k === 0 && g.on), out = [];
        for (let i = 0; i < n && pool.length; i++) { const g = cloneGene(pool.splice(Math.floor(EV.rand() * pool.length), 1)[0]); if (sym) g.sym = true; out.push(g); }
        return out;
      };
      // Horizontal gene transfer: ONE gene at a time, never a finished organ. Known mainly in microbes; the game lets it happen rarely in anything, and far more often during an infection (a virus carries it).
      // Heritage (Stage 4.0): what an extinct lineage left behind, drifting as relics that survivors may pick up. Taking one can fail, and a relic fades. The way a lineage lives
      // (scavenging, living beside others, avoiding them) changes how often it finds one, but nobody chooses WHICH relic is taken, or hands one over.
      EV.pool = []; EV.heritageLog = []; EV.heritageN = 0;
      const geneOfPlain = (pl) => ({ k: 0, prom: pl.prom, sens: pl.sens ? pl.sens.slice() : null, len: pl.len || 1, on: true, eff: pl.eff.map(([n, w]) => [TRAITS.findIndex((l) => l[0] === n) >= 0 ? TRAITS.findIndex((l) => l[0] === n) : NL, w]) });
      EV.addHeritage = (items) => { for (const it of items) { if (EV.pool.length >= 80) EV.pool.shift(); const rec = { id: 'h' + (++EV.heritageN), from: it.from, kind: it.kind || 'function', plain: it, gene: geneOfPlain(it), born: EV.t, status: 'floating', takers: 0, takenBy: [], takenT: null, fromWorld: !!it.fromWorld }; EV.pool.push(rec); EV.heritageLog.push(rec); if (EV.heritageLog.length > 200) EV.heritageLog.shift(); } };
      const tryHeritage = (r) => {
        const it = EV.pool[Math.floor(EV.rand() * EV.pool.length)]; if (!it) return;
        if (EV.rand() >= Math.min(1, 0.3 * Math.exp(-(EV.t - it.born) / 1500) * (r.load > 0 ? 2 : 1))) return; // it may simply fail
        const g = cloneGene(it.gene); g.prom = r.genome.genes[Math.floor(EV.rand() * r.genome.genes.length)].prom; if (it.kind === 'symbiont') g.sym = true;
        EV.counts[r.lin].exchange++; const ev = addEvent({ kind: 'exchange', sub: it.kind === 'symbiont' ? 'heritage-symbiont' : 'heritage', via: 'relic', lin: r.lin, from: it.from, heritage: it.id, trait: null, delta: 0 });
        const ng = withGenes(r, [g], ev); if (it.kind === 'symbiont') ng.sym = true; r.genome = ng; developInto(r, devSignals(patches[r.patch], r.damage));
        it.takers++; if (it.status === 'floating') { it.status = 'taken'; it.takenT = EV.t; } if (!it.takenBy.includes(r.lin)) it.takenBy.push(r.lin);
      };
      const tryExchange = () => {
        const r = pop[Math.floor(EV.rand() * pop.length)]; if (r.genome.genes.length >= MAX_GENES) return;
        if (EV.pool.length) { const sf = TG ? [1, 1.6, 1.3, 0.6, 1][TG.animal[r.lin]] : 1; if (EV.rand() < 0.25 * sf) { tryHeritage(r); return; } }
        const d = findPartner(r, false); if (!d) return;
        const take = (r.load > 0 ? 4 : 1) * (r.genome.genes.length <= 10 ? 1 : 0.5) * (d.lin !== r.lin ? 0.5 : 1);
        if (EV.rand() >= Math.min(1, take * 0.25)) return;
        const g = takeGenes(d, 1, false)[0]; if (!g) return; if (EV.rand() < 0.5) g.prom = r.genome.genes[Math.floor(EV.rand() * r.genome.genes.length)].prom; // it has to be wired into the recipient's own regulation
        const cb = EV.counts[r.lin]; cb.exchange++;
        const ev = addEvent({ kind: 'exchange', sub: d.lin !== r.lin ? 'inter' : 'intra', via: r.load > 0 ? 'infection' : 'contact', lin: r.lin, from: d.lin, trait: null, delta: 0 });
        r.genome = withGenes(r, [g], ev); developInto(r, devSignals(patches[r.patch], r.damage));
      };
      // Fusion (endosymbiosis-like): a body that can engulf (predation) and does not destroy what it engulfs (low immune reaction) keeps a partner's genes as an internalised symbiont. Rare in nature (mitochondria, plastids); an extension here.
      const tryFusion = () => {
        const ai = Math.floor(EV.rand() * pop.length), a = pop[ai]; if (a.age < MATURITY_AGE || a.energy < 1.0 || a.genome.genes.length > MAX_GENES - 3) return;
        if (EV.rand() >= clamp(a.ph[L.predation] * (1 - 0.6 * a.ph[L.immune]) * (TG && (TG.plant[a.lin] === 2 || TG.animal[a.lin] === 2) ? 1.5 : 1), 0, 1)) return; // living beside others (symbiosis / coexistence) makes taking a partner in more likely
        let b = null, bi = -1; for (let tries = 0; tries < 8; tries++) { const k = Math.floor(EV.rand() * pop.length), c = pop[k]; if (sameSpot(a, c) && c.lin !== a.lin) { b = c; bi = k; break; } }
        if (!b) return;
        const genes = takeGenes(b, 2, true); if (!genes.length) return;
        const ev = addEvent({ kind: 'fusion', sub: 'symbiont', lin: a.lin, from: b.lin, trait: null, delta: 0 }); EV.counts[a.lin].fusion++;
        const ng = withGenes(a, genes, ev); ng.sym = true; a.genome = ng;
        const give = Math.min(0.5 * b.energy, a.cap - a.energy); a.energy += give; ledger.lostAtDeath += b.energy - give;
        causes.fusion = (causes.fusion || 0) + 1; lstat.deaths[b.lin]++; lstat.lifeSum[b.lin] += b.age; lstat.causes[b.lin].fusion = (lstat.causes[b.lin].fusion || 0) + 1; lifeSumRun += b.age; pushDeath([b.age, b.active, b.internal, b.births, b.O, b.Mpeak > 0 ? b.M / b.Mpeak : null, b.hunts, b.catches, b.imPeak > 0 ? b.imS / b.imPeak : null, b.infections, b.imPeak]);
        pop[bi] = pop[pop.length - 1]; pop.pop(); developInto(a, devSignals(patches[a.patch], a.damage));
      };
      const settle = (t) => {
        for (const it of EV.pool) if (it.takers === 0 && t - it.born > 4000) it.status = 'decayed'; EV.pool = EV.pool.filter((it) => it.status !== 'decayed'); // established = still carried by at least 3 individuals 150 steps on; lost = carried by nobody
        const pending = EV.list.filter((e) => e.status === 'occurred' || e.status === 'established'); if (!pending.length) return;
        const cnt = new Map(); for (const x of pop) { const tg = x.genome.tags; if (tg) for (const id of tg) cnt.set(id, (cnt.get(id) || 0) + 1); }
        for (const e of pending) {
          const n = cnt.get(e.id) || 0, age = t - e.t; e.carriers = n; if (n > e.peak) e.peak = n;
          if (e.status === 'occurred') { if (age >= 150 && n >= 3) { e.status = 'established'; e.estT = t; } else if (age >= 150 && n === 0) e.status = 'lost'; else if (age >= 800) e.status = 'lost'; }
          else if (n === 0) e.status = 'faded';
        }
      };
      function evoStep(t) {
        const n = pop.length;
        for (const [rate, fn] of [[EV.rate.exchange, tryExchange], [EV.rate.fusion, tryFusion]]) { const a = rate * n; let k = Math.floor(a) + (EV.rand() < a - Math.floor(a) ? 1 : 0); while (k-- > 0 && pop.length > 1) fn(); }
        if (t % 25 === 0) settle(t);
      }
      EV.step = evoStep;
    }
    const HB = 40, lstat = { hAt: Array.from({ length: o.lineageCount }, () => new Array(HB).fill(0)), hDe: Array.from({ length: o.lineageCount }, () => new Array(HB).fill(0)), dmgIn: zeros(), dmgOut: zeros(), spent: zeros(), dormEnter: zeros(), dormWake: zeros(), dormDeaths: zeros(), maxAgeDead: zeros(), births: zeros(), deaths: zeros(), lifeSum: zeros(), intake: zeros(), catches: zeros(), immigrants: zeros(), causes: Array.from({ length: NLN }, () => ({})) };
    if (NICHE) for (const p of patches) p.slotDemand = new Array(NICHE.S).fill(0);
    const moves = RM ? REALM_DEFS.map(() => REALM_DEFS.map(() => 0)) : null;
    const PR = o.pathogenRegime, BR = o.breedingRegime, RR = o.resourceRegime, TR = o.thermalRegime;
    let waveStrain = -1, waveOn = false, waves = 0, breedOpen = true, breedLeft = 0, pulse = 1, parentAgeSum = 0;
    const SIM = [1, 0.6, 0.25];
    const antigenSimilarity = (a, b) => { if (a < 0 || b < 0) return 0; const d = motifDistance(a, b); return d < 3 ? SIM[d] : 0; };
    const imStats = { infectedInWave: 0, protectedHits: 0, reinfectionSameAntigen: 0, infDurSum: 0, infDurN: 0, exposures: 0, exposuresWithMemory: 0, protSum: 0, prevented: 0, expectedPrevented: 0 };
    const eco = { sum: 0, n: 0, min: Infinity, earlySum: 0, earlyN: 0, produced: 0, floorAdded: 0 };
    const causes = { capacityCull: 0, extrinsic: 0, starvation: 0, senescence: 0, thermal: 0, pathogen: 0, disaster: 0, injury: 0 };
    const deaths = []; // compact records: calendar, active, internal, births, O, memoryRetention (capped at o.deathRecordCap; deathCount is exact)
    let deathCount = 0; const pushDeath = (r) => { deathCount++; if (deaths.length < o.deathRecordCap) deaths.push(r); };
    const DAMAGE_SOURCES = ['senescence', 'thermal', 'pathogen', 'disaster', 'injury']; if (CV) DAMAGE_SOURCES.push('civilization'); if (DP) DAMAGE_SOURCES.push('pressure');
    const decisions = { tp: 0, fp: 0, fn: 0, tn: 0 }, sensing = { cueWhenAbsent: 0, absent: 0, missWhenPresent: 0, present: 0 };
    const modeSteps = new Array(NM + 1).fill(0);
    let disasters = 0, envSignature = 0, huntSteps = 0, huntEncounters = 0, catches = 0, totalBirths = 0, extinctAt = null, capHit = false, switches = 0;
    const traceLen = Math.min(o.steps, 100000) + 1, popTrace = new Int32Array(traceLen), birthTrace = new Int32Array(traceLen); // live runs keep traces for the first 100000 steps only (writes beyond are ignored)
    const LT = o.lineageCount > 1, linExtinctAt = new Array(o.lineageCount).fill(null);
    popTrace[0] = pop.length;
    const history = [];
    const input = new Float64Array(NI), score = new Float64Array(NM);

    function traitMeans() {
      // Traits are reported GENOTYPICALLY: what each individual's own genome
      // develops into at the reference signals. Under selection=false this is
      // the drifting genome, not the founder phenotype the individual lives by.
      const m = new Array(NL).fill(0); let O = 0, Mm = 0, edges = 0, stor = 0, carriers = 0;
      for (const x of pop) { const gt = genotypeTraits(x.genome); for (let k = 0; k < NL; k++) m[k] += gt[k]; stor += gt[NL]; if (carrier(x.genome)) carriers++; O += x.O; Mm += x.M; edges += x.genome.edges.length; }
      const n = pop.length || 1;
      let genes = 0, links = 0, plei = 0;
      for (const x of pop) { const gst = genomeStats(x.genome); genes += gst.genes; links += gst.regulatoryLinks; plei += gst.pleiotropy; }
      return { loci: Object.fromEntries(LOCI.map((l, k) => [l[0], m[k] / n])), meanO: O / n, meanM: Mm / n, meanEdges: edges / n, meanStorage: stor / n, storageCarriers: carriers / n,
        meanGenes: genes / n, meanRegLinks: links / n, meanPleiotropy: plei / n };
    }
    function sample(t) {
      const tm = traitMeans();
      history.push({ step: t, population: pop.length, ...tm, prey: patches.reduce((a, p) => a + p.prey, 0) / patches.length });
    }
    sample(0);

    let lastT = 0;
    let spreadDone = false;
    const stepOnce = (t) => {
      if (EV) EV.t = t;
      if (!spreadDone) { spreadDone = true; if (DP && V31 && o.v31.spread) for (const x of pop) if (DP.act[x.patch]) x.zb = Math.floor(frRand() * DP.bins); } // Stage 4.0: the first cells are spread through the whole water column, not heaped at the surface
      lastT = t;
      if (pop.length === 0 && !o.continueWhenEmpty) { if (extinctAt === null) extinctAt = t - 1; return false; }

      if (PR) { // epidemic waves
        const phase = t % PR.interval;
        if (phase === 1) { waves++; waveStrain = PR.mode === 'same' ? 0 : PR.mode === 'near' ? (waves - 1) % MOTIFS : Math.floor(envRand() * MOTIFS); }
        waveOn = phase >= 1 && phase <= PR.waveLength;
      }
      if (BR) { if (breedLeft > 0) breedLeft--; else if (envRand() < BR.openProb) breedLeft = BR.windowLength; breedOpen = breedLeft > 0; }
      if (RR) pulse = (t % RR.period) < RR.pulseLength ? RR.period / RR.pulseLength : 0;
      for (const p of patches) {
        const cr = CV ? CV.res[p.i] : 1, ct = CV ? CV.thermal[p.i] : 0, cp = CV ? CV.pathogen[p.i] : 1;
        if (o.variable && envRand() < 0.01) p.target = { resource: env.resource * p.rMult * (0.5 + envRand()), thermal: clamp(env.thermal + p.tOff + (envRand() - 0.5) * 0.6, 0, 1), pathogen: clamp(env.pathogen * p.pMult * (0.4 + envRand() * 1.8), 0, 0.6) };
        p.resource += (p.target.resource * envMod.resource * cr - p.resource) * 0.05;
        p.thermal += (Math.min(1, p.target.thermal + envMod.thermal + ct) - p.thermal) * 0.05;
        p.pathogen += (p.target.pathogen * envMod.pathogen * cp - p.pathogen) * 0.05;
        if (TR) p.thermal = TR.mode === 'periodic' ? TR.mean + TR.amp * Math.sin(6.283185307 * t / TR.period) : TR.mean + TR.amp * Math.sin(6.283185307 * envRand());
        p.hit = 0;
        if (envRand() < env.disasterRate) { p.hit = 0.6 + envRand() * 0.9; p.famine = 15; disasters++; envSignature = (envSignature * 31 + t) % 1000000007; }
        if (pendingDisaster) { p.hit = Math.max(p.hit, pendingDisaster); p.famine = 15; } // player-triggered (live mode only); draws no random numbers
        { const grow = 0.3 * o.preyGrowthScale * p.prey * (1 - p.prey / p.preyCap) + 0.002 * p.preyCap + o.preyInflow * p.preyCap; p.prey += grow; if (grow > 0) eco.produced += grow; } // logistic growth + trickle immigration + optional inflow
        p.count = 0; p.infected = 0; p.demand = 0; p.eaten = 0; if (NICHE) p.slotDemand.fill(0);
      }
      for (const x of pop) { const p = patches[x.patch]; p.count++; if (x.load > 0) p.infected++; }

      const binCnt = DP ? DP.act.map((a, i) => (a ? new Int32Array(DP.bins) : null)) : null; if (DP) for (const x of pop) if (binCnt[x.patch]) binCnt[x.patch][x.zb]++;
      // 1. sense, decide, set demand
      for (const x of pop) {
        const p = patches[x.patch];
        x.acclimCost = 0;
        if (o.plasticity && x.age > 0 && x.age % o.acclimateEvery === 0) { developInto(x, devSignals(p, x.damage)); x.acclimCost = o.acclimateCost; } // re-acclimation
        const g = o.selection ? x.genome : founder, lo = x.ph;
        const metab = lo[L.metabolism];
        const prod = p.resource * (p.famine > 0 ? 0.4 : 1) * pulse * (DP && DP.act[x.patch] ? DP.res[x.patch][x.zb] : 1);
        const memF = memOn ? x.M : 0;
        // An encounter persists until the prey is caught or slips away, so a hunt
        // started on a cue can still find it after the switching delay.
        x.present = (x.present && rand() < 0.7) || rand() < 0.5 * Math.min(1, Math.max(0, p.prey - p.hid) / p.preyCap);
        const fpE = lo[L.falsePositive] * (1 - 0.6 * memF), fnE = lo[L.falseNegative] * (1 - 0.6 * memF);
        x.cue = x.present ? rand() >= fnE : rand() < fpE;
        if (x.present) { sensing.present++; if (!x.cue) sensing.missWhenPresent++; } else { sensing.absent++; if (x.cue) sensing.cueWhenAbsent++; }

        if (x.arousal > 0) { x.arousal--; x.switchCost = 0; x.eff = x.arousal > 0 ? M_DORMANT : M_TRANSITION; if (x.arousal === 0) x.mode = x.pending; }
        else {
          input[0] = 1; input[1] = x.cue ? 1 : 0; input[2] = clamp(p.count * 0.35 / (prod + 1), 0, 2); input[3] = p.thermal;
          input[4] = p.famine > 0 ? 1 : 0; input[5] = x.energy / x.cap; input[6] = clamp(x.damage, 0, 2); input[7] = x.load > 0 ? 1 : 0;
          const ph = 6.283185 * x.age / lo[L.rhythmPeriod] + lo[L.rhythmPhase];
          input[8] = Math.sin(ph); input[9] = Math.cos(ph);
          const d = decide(g.edges, input, o.switching, score, x.mode, lo[L.switchThreshold]);
          x.eff = x.mode;
          if (d !== x.mode) {
            switches++; if (d === M_DORMANT) lstat.dormEnter[x.lin]++; if (x.mode === M_DORMANT) lstat.dormWake[x.lin]++;
            x.switchCost = SWITCH_COST * metab;
            if (x.mode === M_DORMANT) { // waking takes time; deeper dormancy is slower
              x.arousal = Math.round((0.5 - lo[L.dormancyDepth]) * 6); x.pending = d;
              if (x.arousal === 0) { x.mode = d; x.eff = M_TRANSITION; } else x.eff = M_DORMANT;
            } else { x.mode = d; x.eff = M_TRANSITION; }
          } else x.switchCost = 0;
          // decision quality is scored on what the circuit chose, judged against
          // whether prey was actually present at decision time
          if (d !== M_DORMANT) {
            const hunting = d === M_HUNT;
            if (hunting && x.present) decisions.tp++; else if (hunting) decisions.fp++; else if (x.present) decisions.fn++; else decisions.tn++;
          }
        }
        if (x.eff === M_EXPLORE) x.demand = (0.3 + 0.7 * lo[L.movement]) * Math.min(1.3, metab);
        else if (x.eff === M_WAIT) x.demand = 0.15 * Math.min(1.3, metab);
        else x.demand = 0;
        p.demand += x.demand;
        if (NICHE) { const w = NICHE.w[x.lin]; for (let k = 0; k < NICHE.S; k++) p.slotDemand[k] += x.demand * w[k]; }
      }

      // 2. energy, infection, damage, regeneration, death, reproduction
      const next = [];
      for (const x of pop) {
        const lo = x.ph, p = patches[x.patch], mode = x.eff;
        const metab = lo[L.metabolism];
        modeSteps[mode]++;
        const modeMetab = mode === M_DORMANT ? lo[L.dormancyDepth] : MODE_METAB[mode];
        const activity = metab * modeMetab;
        const prod = p.resource * (p.famine > 0 ? 0.4 : 1) * pulse * (DP && DP.act[x.patch] ? DP.res[x.patch][x.zb] : 1);
        let gain = 0;
        if (x.demand > 0) {
          if (NICHE) { const w = NICHE.w[x.lin], ps = prod / NICHE.S; gain = 0; for (let k = 0; k < NICHE.S; k++) { const dk = x.demand * w[k]; if (dk > 0) gain += Math.min(dk * ps / (ps + 4 / NICHE.S), ps * dk / (p.slotDemand[k] || 1)) * (1 + NICHE.bonus * (w[k] - 1 / NICHE.S)); } }
          else gain = Math.min(x.demand * prod / (prod + 4), prod * x.demand / (p.demand || 1));
          ledger.intakePlant += gain; p.eaten += gain; lstat.intake[x.lin] += gain;
        }
        if (TG && gain > 0 && TG.plant[x.lin]) { // stance toward plants / fixed organisms (Stage 3.1). Each needs a body that can do it; without one the attempt wastes effort instead.
          const sp = TG.plant[x.lin], mn = clamp((metab - 0.2) / 1.4, 0, 1); let mult = 1, extra = 0;
          if (sp === 1) { const cap = 0.5 * lo[L.movement] + 0.5 * mn; mult = cap >= 0.3 ? 1 + 0.4 * cap : 0.9; extra = cap >= 0.3 ? 0.8 : 0; } // use: eat harder, strip the patch faster
          else if (sp === 2) { const cap = 0.5 * lo[L.immune] + 0.5 * lo[L.tolerance]; mult = 0.88; extra = -0.3 * cap; } // symbiosis: take less, and the patch recovers a little
          else if (sp === 3) mult = 0.6; // avoid
          else if (sp === 4) { const cap = 0.5 * mn + 0.5 * lo[L.movement]; mult = 1 + 0.2 * cap; } // compete
          const dg = gain * (mult - 1); gain += dg; ledger.intakePlant += dg; lstat.intake[x.lin] += dg; p.eaten += dg * extra;
        }
        if (CV) { const sb = CV.subsidy[x.lin][x.patch]; if (sb > 0) { gain += sb; ledger.intakePlant += sb; lstat.intake[x.lin] += sb; } }
        let huntCost = 0;
        if (mode === M_HUNT) {
          huntSteps++; x.hunts++; huntCost = 0.05 * metab;
          // hunting is an active search, not only a reaction to a cue
          if (!x.present) x.present = rand() < 0.6 * Math.min(1, Math.max(0, p.prey - p.hid) / p.preyCap) * (0.4 + 0.6 * lo[L.movement]);
          if (x.present && p.prey - p.hid >= 1) {
            huntEncounters++;
            const memF = memOn ? x.M : 0;
            const ta = TG ? TG.animal[x.lin] : 0, tmul = ta === 1 ? (lo[L.predation] >= 0.3 ? 1 + 0.3 * lo[L.predation] : 0.85) : ta === 2 ? 0.75 : ta === 3 ? 0.6 : 1;
            const pc = clamp(1.5 * lo[L.predation] * (0.4 + 0.6 * Math.min(1.2, metab)) * (1 + 0.8 * memF) * o.captureScale * tmul, 0, 0.95);
            if (rand() < pc) {
              const hg = HUNT_GAIN * (ta === 1 && lo[L.predation] >= 0.3 ? 1.25 : 1); gain += hg; ledger.intakePrey += hg; lstat.intake[x.lin] += hg; lstat.catches[x.lin]++; p.prey -= (ta === 2 ? 0.75 : 1); catches++; x.catches++; x.present = false;
              if (o.memory) x.M += lo[L.memoryLearn] * (x.O - x.M) * 0.2;
            }
          }
          if (rand() < 0.3) { const ta2 = TG ? TG.animal[x.lin] : 0, imul = ta2 === 1 ? 1.3 : ta2 === 2 ? 0.5 : ta2 === 3 ? 0.4 : ta2 === 4 ? 1 - 0.5 * (0.5 * lo[L.tolerance] + 0.5 * lo[L.repairRate]) : 1; const inj = 0.05 * env.injury * (1 - 0.5 * lo[L.tolerance]) * imul; x.damage += inj; lstat.dmgIn[x.lin] += inj; x.dmgSrc[4] += inj; }
        }
        const locusCost = 0.03 * lo[L.movement] + 0.04 * lo[L.predation] + 0.05 * lo[L.tolerance] + 0.06 * lo[L.immune]
          + 0.05 * ((0.5 - lo[L.falsePositive]) + (0.5 - lo[L.falseNegative])) / 0.48 + x.gcost;
        const base = activity * (0.05 + locusCost);
        const memCost = o.memory && o.memoryCost ? 0.02 * lo[L.memoryLearn] + 0.06 * lo[L.memoryUpkeep] * (PR ? x.M + x.imS : x.M) : 0;
        // regeneration
        const cdS = CD ? codonStats(x.genome) : null;
        const r = lo[L.repairRate] * (mode === M_REPAIR ? 2.5 : mode === M_DORMANT ? 0.5 : 1) * (x.energy > 0 ? 1 : 0.3) * Math.sqrt(Math.min(1.2, metab)) * (cdS ? 1 - 0.5 * cdS.packed : 1);
        const rho = o.replacement ? lo[L.replaceRatio] : 0;
        const fix = r * (1 - rho), rep = r * rho, eff = 1 / (1 + x.P / 3);
        const regenCost = 0.10 * fix + 0.05 * rep;
        const storCost = o.storageCost * (o.storageEvolvable ? x.cap : ENERGY_MAX);
        let surv = 0, survCost = 0, vig = 0;
        if (AB) { surv = AB.sup * lo[L.immune] * (x.load > 0 ? 0.5 : 1) * (x.energy > 0 ? 1 : 0.3); survCost = AB.cost * surv; if (survCost) spentBy.surveillance = (spentBy.surveillance || 0) + survCost; }
        if (CV) { const st = CV.stance[x.lin]; if ((st === 3 || st === 4) && CV.press[x.patch] > 0) { vig = (st === 3 ? 0.02 : 0.03) * activity; spentBy.vigilance = (spentBy.vigilance || 0) + vig; } if (st === 4 && mode === M_HUNT) CV.attack[x.lin][x.patch] += lo[L.predation] * (0.4 + 0.6 * lo[L.movement]); }
        if (TG) { const pl = TG.plant[x.lin], an = TG.animal[x.lin], v2 = (pl === 4 ? 0.01 : 0) + (an === 4 && mode === M_HUNT ? 0.015 : 0); if (v2) { vig += v2 * activity; spentBy.vigilance = (spentBy.vigilance || 0) + v2 * activity; } }
        const cost = base + memCost + regenCost + huntCost + x.switchCost + x.acclimCost + storCost + survCost + vig;
        spentBy.acclimation += x.acclimCost; spentBy.storage += storCost;
        spentBy.base += base; spentBy.memory += memCost; spentBy.regeneration += regenCost; spentBy.hunting += huntCost; spentBy.switching += x.switchCost;
        ledger.spent += cost; lstat.spent[x.lin] += cost;
        if (O2S && O2S.v < 1 && gain > 0) { const lostO = gain * 0.45 * (1 - O2S.v) * clamp((metab - 0.2) / 1.4, 0, 1); gain -= lostO; ledger.intakePlant -= lostO; lstat.intake[x.lin] -= lostO; } // little oxygen: a high metabolism cannot be fed
        x.energy += gain - cost;

        // infection (exposure depends on mode)
        const expo = (mode === M_EXPLORE || mode === M_HUNT ? 1.5 : mode === M_DORMANT ? 0.5 : 1) * (TG && TG.plant[x.lin] === 3 ? 0.85 : 1);
        const memF = memOn ? x.M : 0;
        if (x.load <= 0) {
          const pressure = p.pathogen + 0.35 * (p.count ? p.infected / p.count : 0);
          if (!PR) { if (rand() < pressure * expo * (1 - 0.85 * lo[L.immune]) * (1 - 0.5 * memF)) startInf(x); }
          else {
            // background infections carry no antigen; wave infections carry the wave's strain
            const wave = waveOn ? PR.strength : 0, sim = memOn ? antigenSimilarity(x.imA, waveStrain) : 0;
            const pBack = pressure * expo * (1 - 0.85 * lo[L.immune]) * (1 - 0.5 * memF);
            const pWave = wave * expo * (1 - 0.85 * lo[L.immune]) * (1 - 0.5 * memF) * (1 - 0.8 * x.imS * sim);
            if (wave && sim > 0 && x.imS > 0) imStats.protectedHits += wave * expo * 0.8 * x.imS * sim;
            const pNoMem = wave * expo * (1 - 0.85 * lo[L.immune]);
            if (wave) { imStats.exposures++; if (sim > 0 && x.imS > 0) { imStats.exposuresWithMemory++; imStats.protSum += 0.8 * x.imS * sim; } }
            const u = rand();
            if (u >= pWave && u < pNoMem) imStats.prevented++;
            imStats.expectedPrevented += pNoMem - pWave;
            if (u < pWave) { startInf(x); x.strain = waveStrain; x.infections++; imStats.infectedInWave++; if (x.imA === waveStrain) { x.reinfections++; imStats.reinfectionSameAntigen++; } }
            else if (u < pWave + pBack) { startInf(x); x.strain = -1; }
          }
        } else {
          x.infAge++;
          if (IFR) { x.infLeft--; x.load = x.infLeft > 0 ? IFR.load : 0; }
          else x.load += 0.3 * x.load * (1 - lo[L.immune]) - 0.12 * lo[L.immune] * (1 + 0.5 * memF);
          if (x.load <= 0) {
            x.load = 0; imStats.infDurSum += x.infAge; imStats.infDurN++; if (o.memory) x.M += lo[L.memoryLearn] * (x.O - x.M) * 0.2;
            if (PR && o.memory && x.strain >= 0) { // antigen-specific memory, one slot, held in original cells
              if (x.imA !== x.strain) { x.imA = x.strain; x.imS = 0; }
              x.imS += lo[L.memoryLearn] * (x.O - x.imS) * 0.5; if (x.imS > x.imPeak) x.imPeak = x.imS;
            }
            x.strain = -1;
          }
          else if (x.load > 2) x.load = 2;
        }

        // damage
        x.internal += activity;
        const ageing = o.rateOfLiving ? activity : 1;
        const clock = o.rateOfLiving ? x.internal : x.age;
        const sen = 0.012 * (1 + clock / 25) * ageing * (CD ? 1 + 0.15 * burdenOf(codonStats(x.genome)) : 1); // a long genome has more to go wrong
        const shelter = mode === M_DORMANT ? 0.5 : 1; // assumption: a dormant body is sheltered (cyst/burrow)
        const th = 0.12 * p.thermal * (1 - lo[L.tolerance]) * shelter;
        const pa = 0.08 * x.load * o.infectionSeverity;
        const di = p.hit * (1 - 0.6 * lo[L.tolerance]) * shelter;
        let ch = 0;
        if (CV) { const hv = CV.harm[x.patch]; if (hv > 0) { const st = CV.stance[x.lin]; ch = hv * (1 - 0.6 * lo[L.tolerance]) * shelter * (st === 3 ? 1 - 0.4 * (0.4 * lo[L.tolerance] + 0.3 * lo[L.immune] + 0.3 * Math.min(1, lo[L.repairRate])) : 1); CV.harmTaken[x.lin][x.patch] += ch; } }
        let dtm = 0, dpr = 0;
        if (DP && DP.act[x.patch]) { DP.box(lo, x.eff === M_DORMANT, DP.out); const T = DP.T[x.patch][x.zb], P = DP.P[x.patch][x.zb], b = DP.out; dtm = DP.tRate * Math.max(0, T - b[1], b[0] - T); dpr = DP.pRate * (Math.max(0, Math.log(P / b[3])) + Math.max(0, Math.log(b[2] / P))) / Math.LN10; }
        x.damage += sen + th + pa + di + ch + dtm + dpr; lstat.dmgIn[x.lin] += sen + th + pa + di + ch + dtm + dpr;
        x.dmgSrc[0] += sen; x.dmgSrc[1] += th + dtm; x.dmgSrc[2] += pa; x.dmgSrc[3] += di; if (ch) x.dmgSrc[5] += ch; if (dpr) x.dmgSrc[PIDX] += dpr;
        // regeneration: repair keeps original cells; replacement swaps them for blank ones
        { const removed = 0.15 * fix + 0.35 * rep * eff; lstat.dmgOut[x.lin] += Math.min(removed, Math.max(0, x.damage)); }
        x.damage -= 0.15 * fix + 0.35 * rep * eff;
        const Oold = x.O;
        x.O *= 1 - 0.25 * rep * eff;
        x.P += rep;
        if (x.damage > 0.4) x.O *= 1 - 0.03 * (x.damage - 0.4); // unrepaired cells die
        if (x.damage < 0) x.damage = 0;
        if (AB) { const div = 0.15 + 2 * rep, prot = 1 - 0.5 * Math.min(1, fix); x.A = Math.min(AB.cap, Math.max(0, x.A * (1 + AB.grow - surv) + AB.a0 * div * (1 + 2 * x.damage) * (1 + clock / 60) * prot)); }
        if (o.memory) {
          x.M *= x.O / Oold;                               // A1: memory goes with its cells
          x.M *= 1 - 0.03 * o.memoryDecay * (1 - lo[L.memoryUpkeep]);      // upkeep slows decay
          if (PR) { x.imS *= x.O / Oold; x.imS *= 1 - 0.03 * o.memoryDecay * (1 - lo[L.memoryUpkeep]); if (x.imS > x.O) x.imS = x.O; }
          if (x.M > x.O) x.M = x.O;
          if (x.M > x.Mpeak) x.Mpeak = x.M;
        }

        // mortality
        const hz = { extrinsic: o.extrinsicMortality, damage: 0.3 * x.damage * x.damage, starvation: 0 };
        if (x.energy < 0) { ledger.deficit += -x.energy; x.energy = 0; hz.starvation = 0.25; }
        if (x.energy > x.cap) { ledger.overflow += x.energy - x.cap; x.energy = x.cap; }
        const hb = Math.min(HB - 1, Math.floor(x.age / 25)); lstat.hAt[x.lin][hb]++;
        x.age++;
        if (mode !== M_DORMANT) x.active++;
        let hzc = 0, hza = 0;
        if (CV) { const c = CV.cap[x.lin][x.patch]; if (c > 0) { const st = CV.stance[x.lin], ex = mode === M_DORMANT ? 0.4 : mode === M_REPAIR || mode === M_WAIT ? 0.8 : mode === M_HUNT ? 1.5 : 1.2; hzc = c * ex * (1 - 0.5 * lo[L.movement]) * (st === 3 ? 1 - 0.4 * (0.4 * lo[L.tolerance] + 0.3 * lo[L.immune] + 0.3 * Math.min(1, lo[L.repairRate])) : 1) * (st === 4 && mode === M_HUNT ? 1.8 : 1); } }
        if (AB) hza = AB.haz * x.A * x.A;
        const hazard = hz.extrinsic + hz.damage + hz.starvation + hzc + hza;
        if (rand() < 1 - Math.exp(-hazard)) {
          let cause = hzc === 0 && hza === 0 ? (hz.starvation >= hz.damage && hz.starvation >= hz.extrinsic ? 'starvation' : hz.extrinsic >= hz.damage ? 'extrinsic' : null)
            : (() => { let best = null, bv = -1; for (const [n, v] of [['starvation', hz.starvation], ['extrinsic', hz.extrinsic], ['civilization', hzc], ['abnormal', hza], ['damage', hz.damage]]) if (v > bv) { bv = v; best = n; } return best === 'damage' ? null : best; })();
          if (cause === 'civilization') CV.taken[x.lin][x.patch]++;
          if (!cause) { let b = 0; for (let k = 1; k < DAMAGE_SOURCES.length; k++) if (x.dmgSrc[k] > x.dmgSrc[b]) b = k; cause = DAMAGE_SOURCES[b]; }
          lstat.hDe[x.lin][hb]++; if (mode === M_DORMANT) lstat.dormDeaths[x.lin]++; if (x.age > lstat.maxAgeDead[x.lin]) lstat.maxAgeDead[x.lin] = x.age;
          causes[cause] = (causes[cause] || 0) + 1; lstat.deaths[x.lin]++; lstat.lifeSum[x.lin] += x.age; lstat.causes[x.lin][cause] = (lstat.causes[x.lin][cause] || 0) + 1;
          ledger.lostAtDeath += x.energy;
          lifeSumRun += x.age; pushDeath([x.age, x.active, x.internal, x.births, x.O, x.Mpeak > 0 ? x.M / x.Mpeak : null, x.hunts, x.catches, x.imPeak > 0 ? x.imS / x.imPeak : null, x.infections, x.imPeak]);
          continue;
        }

        if (mode !== M_DORMANT && mode !== M_TRANSITION && x.age >= MATURITY_AGE && x.energy > OFFSPRING_COST + 0.3 && breedOpen && rand() < 0.7 * (o.fecundityLocked ? FEC0 : lo[L.fecundity]) * o.birthScale) {
          const oc = CD ? OFFSPRING_COST * (1 + 0.25 * burdenOf(codonStats(x.genome))) : OFFSPRING_COST; x.energy -= oc; ledger.reproOverhead += oc - OFFSPRING_ENERGY; // copying a long genome costs more
          let genome;
          if (o.mutation && mutRand() < o.mutationRate) {
            if (EV) { const lg = []; genome = EV.afterMutation(x, mutate(x.genome, mutRand, o.maxEdges, o.storageEvolvable ? NT : NL, { supply: o.storageEvolvable ? o.storageSupply : 1, scale: o.storageEvolvable ? o.storageEffectScale : 1, log: lg, codon: CD }), lg, o.storageEvolvable ? NT : NL); }
            else genome = mutate(x.genome, mutRand, o.maxEdges, o.storageEvolvable ? NT : NL, o.storageEvolvable ? { supply: o.storageSupply, scale: o.storageEffectScale } : null);
          } else genome = x.genome;
          if (EV && genome.sym) genome = EV.separate(x, genome);
          const patch = RM ? x.patch : rand() < o.migrationRate ? Math.floor(rand() * o.patches) : x.patch;
          { const nbx = newborn(genome, patch, OFFSPRING_ENERGY, x.lin); if (DP) nbx.zb = x.zb; next.push(nbx); } lstat.births[x.lin]++; birthTrace[t]++; x.births++; totalBirths++; parentAgeSum += x.age;
        }
        if (RM) {
          // Realm movement: only while exploring, only with a reserve, success odds scale with the movement trait, adjacent realms only.
          const mvm = CV ? CV.move[x.patch] * (CV.stance[x.lin] === 1 ? 1.8 : 1) : 1;
          if (mode === M_EXPLORE && x.energy > RM.reserve && rand() < RM.rate * lo[L.movement] * mvm) {
            const adj = FREE ? ALL_ADJ[x.patch] : REALM_ADJ[x.patch]; let dest = adj[Math.floor(rand() * adj.length)];
            if (CV && CV.stance[x.lin] === 1) { let bp = CV.press[x.patch], best = x.patch; for (const a of adj) if (CV.press[a] < bp) { best = a; bp = CV.press[a]; } if (best !== x.patch) dest = best; } // a fleeing individual heads for the safest neighbouring realm
            const offRef = FREE && !REALM_ADJ[x.patch].includes(dest), cost = RM.cost * (FREE ? FREE_DIFF[x.patch][dest] : REALM_DIFF[x.patch][dest]);
            if (!(offRef && frRand() > 0.15) && x.energy >= cost + RM.reserve) { x.energy -= cost; ledger.spent += cost; lstat.spent[x.lin] += cost; spentBy.moving = (spentBy.moving || 0) + cost; moves[x.patch][dest]++; if (offRef) offPairs[x.lin][x.patch * 4 + dest]++; x.patch = dest; if (DP) x.zb = 0; }
          }
        } else if (rand() < o.migrationRate * 0.25) x.patch = Math.floor(rand() * o.patches);
        if (DP && DP.act[x.patch] && (mode === M_EXPLORE || mode === M_WAIT || mode === M_HUNT) && x.energy > 0.35 && rand() < DP.rate * (0.3 + 0.7 * lo[L.movement])) {
          // up or down one bin, to the one that is better for this body (food and survival), a little crowd-shy, with a little exploration
          const pt = x.patch, nb = x.zb + (rand() < 0.5 ? -1 : 1);
          if (nb >= 0 && nb < DP.bins) {
            const bc = binCnt[pt], avg = Math.max(1, p.count / DP.bins), score = (b) => { DP.box(lo, false, DP.out2); const T = DP.T[pt][b], P = DP.P[pt][b], q = DP.out2, d = DP.tRate * Math.max(0, T - q[1], q[0] - T) + DP.pRate * (Math.max(0, Math.log(P / q[3])) + Math.max(0, Math.log(q[2] / P))) / Math.LN10; return DP.res[pt][b] * Math.max(0.02, 1 - 6 * d) / (1 + bc[b] / (avg + 2)); };
            if (score(nb) > score(x.zb) * 1.02 || rand() < 0.08) { x.energy -= 0.004; ledger.spent += 0.004; lstat.spent[x.lin] += 0.004; bc[x.zb]--; x.zb = nb; bc[nb]++; }
          }
        }
        next.push(x);
      }
      for (const p of patches) { if (p.famine > 0) p.famine--; { const preyFloor = o.preyRefuge * p.preyCap; if (p.prey < preyFloor) { eco.floorAdded += preyFloor - p.prey; p.prey = preyFloor; } } }
      if (next.length > o.maxPopulation) { capHit = true; while (next.length > o.maxPopulation) { const k = Math.floor(rand() * next.length), v = next[k]; ledger.lostAtDeath += v.energy; causes.capacityCull++; lstat.deaths[v.lin]++; lstat.lifeSum[v.lin] += v.age; lstat.causes[v.lin].capacityCull = (lstat.causes[v.lin].capacityCull || 0) + 1; pushDeath([v.age, v.active, v.internal, v.births, v.O, v.Mpeak > 0 ? v.M / v.Mpeak : null, v.hunts, v.catches]); next.splice(k, 1); } }
      pop = next;
      if (EV && pop.length > 1) EV.step(t);
      popTrace[t] = pop.length;
      { const pf = patches.reduce((a, p) => a + p.prey / p.preyCap, 0) / patches.length; eco.sum += pf; eco.n++; if (pf < eco.min) eco.min = pf; if (t <= 400) { eco.earlySum += pf; eco.earlyN++; } }
      if (LT) { const cnt = new Array(o.lineageCount).fill(0); for (const x of pop) cnt[x.lin]++; for (let k = 0; k < cnt.length; k++) if (cnt[k] === 0 && linExtinctAt[k] === null) linExtinctAt[k] = t; }
      if (pop.length === 0 && extinctAt === null) extinctAt = t;
      if (t % o.sampleEvery === 0 || t === o.steps || (pop.length === 0 && !(o.continueWhenEmpty && history.length && history[history.length - 1].population === 0))) sample(t); // an empty arena that keeps running is sampled once, not every step
      if (o.live && history.length > 2000) history.splice(0, history.length - 1500); // a live run has no end: keep the recent samples only
      pendingDisaster = 0;
      return true;
    };
    if (o.live) {
      // Live mode: the caller advances the very same loop body step by step. Nothing in the model differs.
      let tNow = 0, finished = false;
      const live = {
        get t() { return tNow; }, get done() { return finished; }, options: o, env,
        step(n = 1) { for (let i = 0; i < n && !finished; i++) { tNow++; if (!stepOnce(tNow) || tNow >= o.steps || (pop.length === 0 && !o.continueWhenEmpty)) finished = true; } return tNow; },
        setOption(name, value) { o[name] = value; if (name === 'preyHidden') for (const p of patches) p.hid = value * p.preyCap; },
        disaster(strength = 1.2) { pendingDisaster = strength; },
        patchState() { return patches.map((p) => ({ resource: p.resource, thermal: p.thermal, pathogen: p.pathogen, prey: p.prey, preyCap: p.preyCap })); },
        lineageDetail() { // read-only bookkeeping for the game layer (hazard by age, damage in/out, dormancy, spending)
          const alive = zeros(), aliveMaxAge = zeros(); for (const x of pop) { alive[x.lin]++; if (x.age > aliveMaxAge[x.lin]) aliveMaxAge[x.lin] = x.age; }
          return Array.from({ length: NLN }, (_, i) => ({ alive: alive[i], aliveMaxAge: aliveMaxAge[i], maxAgeDead: lstat.maxAgeDead[i], hAt: lstat.hAt[i].slice(), hDe: lstat.hDe[i].slice(), binWidth: 25, dmgIn: lstat.dmgIn[i], dmgOut: lstat.dmgOut[i], spent: lstat.spent[i], dormEnter: lstat.dormEnter[i], dormWake: lstat.dormWake[i], dormDeaths: lstat.dormDeaths[i] }));
        },
        exportArena(perLineage = 6) { // Stage 5.1: the living arena as a few groups per lineage and realm, for a milestone save. Individuals sharing one genome (clones) form one group.
          const groups = new Map();
          for (const x of pop) { const k = x.lin * 64 + x.patch; let m = groups.get(k); if (!m) groups.set(k, m = new Map()); const e = m.get(x.genome); if (e) e.n++; else m.set(x.genome, { lin: x.lin, patch: x.patch, genome: x.genome, n: 1 }); }
          const perLin = new Map(); for (const m of groups.values()) for (const e of m.values()) { const a = perLin.get(e.lin) || []; a.push(e); perLin.set(e.lin, a); }
          const out = []; for (const [lin, list] of perLin) {
            const total = list.reduce((a, e) => a + e.n, 0); list.sort((a, b) => b.n - a.n); const keep = list.slice(0, perLineage), kept = keep.reduce((a, e) => a + e.n, 0);
            for (const e of keep) out.push({ lin, patch: e.patch, genome: e.genome, n: Math.max(1, Math.round(e.n * total / kept)) });
          }
          return out;
        },
        introduce(lineage, genome, n, realm) { // individuals arriving from outside the arena; their energy is booked as starting energy so the ledger still closes
          let made = 0; for (let i = 0; i < n && pop.length < o.maxPopulation; i++) { const x = newborn(cloneGenome(genome), RM ? realm : realm % o.patches, 1.0, lineage); pop.push(x); ledger.start += x.energy; lstat.immigrants[lineage]++; made++; } return made;
        },
        setCiv(c) { // pressure from the civilisation model; only the fields given are changed
          if (!CV) throw new Error('civ option is off');
          for (const k of ['res', 'thermal', 'pathogen', 'harm', 'move', 'press']) if (c[k]) for (let i = 0; i < CV[k].length; i++) CV[k][i] = c[k][i];
          for (const k of ['cap', 'subsidy']) if (c[k]) for (let l = 0; l < NLN; l++) if (c[k][l]) for (let i = 0; i < CV[k][l].length; i++) CV[k][l][i] = c[k][l][i];
        },
        setTarget(lin, kind, code) { if (!TG) throw new Error('v31 tgt option is off'); if (kind !== 'plant' && kind !== 'animal') throw new Error('unknown target'); TG[kind][lin] = code; },
        setO2(v) { if (!O2S) throw new Error('v31 o2 option is off'); O2S.v = Math.max(0, Math.min(1, v)); },
        codon() { // per lineage: means over living individuals (genomes shared by clones are read once per individual)
          if (!CD) return null; const acc = Array.from({ length: NLN }, () => ({ n: 0, Lp: 0, Le: 0, info: 0, density: 0, redundancy: 0, packed: 0 }));
          for (const x of pop) { const c = codonStats(x.genome), a = acc[x.lin]; a.n++; a.Lp += c.Lp; a.Le += c.Le; a.info += c.info; a.density += c.density; a.redundancy += c.redundancy; a.packed += c.packed; }
          return acc.map((a) => (a.n ? { n: a.n, Lp: a.Lp / a.n, Le: a.Le / a.n, info: a.info / a.n, density: a.density / a.n, redundancy: a.redundancy / a.n, packed: a.packed / a.n, L0: codonL0() } : null));
        },
        sampleGenome(lin) { // the genome of the individual with the median physical length, as a strip of genes for display
          const list = pop.filter((x) => x.lin === lin); if (!list.length) return null; list.sort((a, b) => codonStats(a.genome).Lp - codonStats(b.genome).Lp); const g = list[list.length >> 1].genome, cd = codonStats(g);
          return { stats: { ...cd, L0: codonL0() }, genes: g.genes.map((x) => ({ len: x.len, len0: x.len0 || x.len, on: x.on, reg: x.k !== 0, sym: !!x.sym, eff: x.k === 0 ? x.eff.map(([t, w]) => [TRAITS[t] ? TRAITS[t][0] : 'storage', w]) : [] })) };
        },
        addHeritage(items) { if (!EV) throw new Error('v31 evo option is off'); EV.addHeritage(items); },
        heritage() { return EV ? EV.heritageLog.map((it) => ({ id: it.id, from: it.from, kind: it.kind, born: it.born, status: it.status, takers: it.takers, takenBy: it.takenBy.slice(), takenT: it.takenT, fromWorld: it.fromWorld, eff: it.plain.eff })) : null; },
        topGenes(lin, k = 3) { // the strongest structural genes of the individual with the median physical length: what a lineage would leave behind
          const list = pop.filter((x) => x.lin === lin); if (!list.length) return null; list.sort((a, b) => codonStats(a.genome).Lp - codonStats(b.genome).Lp); const g = list[list.length >> 1].genome;
          return g.genes.filter((x) => x.k === 0 && x.on && x.eff.length).sort((a, b) => Math.max(...b.eff.map((e) => Math.abs(e[1]))) - Math.max(...a.eff.map((e) => Math.abs(e[1])))).slice(0, k).map((x) => ({ prom: x.prom, sens: x.sens ? x.sens.slice() : null, len: x.len, kind: x.sym ? 'symbiont' : 'function', eff: x.eff.map(([t, w]) => [TRAITS[t] ? TRAITS[t][0] : 'storage', w]) }));
        },
        routes() { return offPairs ? offPairs.map((a) => a.slice()) : null; }, // per lineage: crossings OUTSIDE the reference roads, indexed from*4+to
        targets() { return TG ? { plant: TG.plant.slice(), animal: TG.animal.slice() } : null; },
        evo() { return EV ? { counts: EV.counts.map((c) => ({ ...c })), events: EV.list.map((e) => ({ ...e })), total: EV.nextId - 1 } : null; },
        setStance(lin, code) { if (!CV) throw new Error('civ option is off'); CV.stance[lin] = code; },
        clear() { for (const x of pop) ledger.lostAtDeath += x.energy; pop = []; }, // remove every individual (used by tests to stage an extinction)
        setDepth(d) { if (!DP) throw new Error('depth option is off'); for (const k of ['T', 'P', 'res']) if (d[k]) for (let r = 0; r < d[k].length; r++) for (let b = 0; b < d[k][r].length; b++) DP[k][r][b] = d[k][r][b]; },
        depthDist() { if (!DP) return null; const out = DP.act.map((a) => (a ? Array.from({ length: NLN }, () => new Array(DP.bins).fill(0)) : null)); for (const x of pop) if (out[x.patch]) out[x.patch][x.lin][x.zb]++; return out; },
        civTake() { // what the pressure did since the last call: attack power put out, individuals taken, damage dealt (per lineage, per realm)
          if (!CV) return null; const r = { attack: CV.attack.map((a) => a.slice()), taken: CV.taken.map((a) => a.slice()), harm: CV.harmTaken.map((a) => a.slice()) };
          for (const k of ['attack', 'taken', 'harmTaken']) for (const a of CV[k]) a.fill(0); return r;
        },
        leap(a) { // Stage 2.0 coarse time skip of `a.steps` engine steps. Nothing evolves and nobody is aged here: the arena is carried across by what was measured.
          const D = a.steps, rep = { before: zeros(), kept: zeros(), reseeded: zeros(), removed: zeros(), extinct: [] };
          for (const p of patches) { const f = 1 - Math.exp(-D / 20), cr = CV ? CV.res[p.i] : 1, ct = CV ? CV.thermal[p.i] : 0, cp = CV ? CV.pathogen[p.i] : 1;
            p.resource += (p.target.resource * envMod.resource * cr - p.resource) * f; p.thermal += (Math.min(1, p.target.thermal + envMod.thermal + ct) - p.thermal) * f; p.pathogen += (p.target.pathogen * envMod.pathogen * cp - p.pathogen) * f;
            p.prey += (p.preyCap - p.prey) * (1 - Math.exp(-D / 150)); p.famine = 0; p.hit = 0; }
          const byLin = Array.from({ length: NLN }, () => []); for (const x of pop) byLin[x.lin].push(x);
          const next = [];
          for (let l = 0; l < NLN; l++) {
            const list = byLin[l]; rep.before[l] = list.length; if (!list.length) continue;
            const g = a.growth ? a.growth[l] : 0; let Nt = g < 0 ? Math.round(list.length * Math.exp(g * D)) : list.length;
            if (Nt < (a.minKeep ?? 3)) Nt = 0;
            const rec = a.recordAge ? a.recordAge[l] : 0; // an individual crosses the gap only if its age plus the gap stays within the oldest life actually recorded for its lineage
            const keep = list.filter((x) => x.age + D <= rec).slice(0, Nt); for (const x of keep) next.push(x); rep.kept[l] = keep.length;
            const kept = new Set(keep); for (const x of list) if (!kept.has(x)) { ledger.lostAtDeath += x.energy; rep.removed[l]++; }
            if (Nt === 0) { rep.extinct.push(l); continue; }
            for (let i = keep.length; i < Nt && next.length < o.maxPopulation; i++) { const par = list[Math.floor(rand() * list.length)], y = newborn(par.genome, par.patch, 1.0, l); next.push(y); ledger.start += y.energy; rep.reseeded[l]++; }
          }
          pop = next; return rep;
        },
        setEnvMod(m) { envMod.resource = m.resource ?? 1; envMod.thermal = m.thermal ?? 0; envMod.pathogen = m.pathogen ?? 1; },
        stats() {
          const lin = o.lineageCount; const cnt = new Array(lin).fill(0); for (const x of pop) cnt[x.lin]++;
          const lifeSum = lifeSumRun;
          return { t: tNow, population: pop.length, lineageAlive: cnt, births: totalBirths, deaths: deathCount, meanLifespan: deathCount ? lifeSum / deathCount : null,
            realmAlive: (() => { const m = REALM_DEFS.map(() => new Array(o.lineageCount).fill(0)); if (RM) for (const x of pop) m[x.patch][x.lin]++; return RM ? m : null; })(), moves: moves ? moves.map((r) => r.slice()) : null,
            lineageStats: (() => { const en = zeros(), cnt = zeros(); for (const x of pop) { en[x.lin] += x.energy; cnt[x.lin]++; } return Array.from({ length: NLN }, (_, i) => ({ count: cnt[i], energy: en[i], births: lstat.births[i], deaths: lstat.deaths[i], lifeSum: lstat.lifeSum[i], intake: lstat.intake[i], catches: lstat.catches[i], immigrants: lstat.immigrants[i], causes: { ...lstat.causes[i] } })); })(),
            genTime: totalBirths ? parentAgeSum / totalBirths : null, parentAgeSum, lifeSum, thermal: patches.reduce((a, p) => a + p.thermal, 0) / patches.length, catches, huntSteps, causes: { ...causes }, disasters, preyFraction: patches.reduce((a, p) => a + p.prey / env.prey, 0) / patches.length,
            resource: patches.reduce((a, p) => a + p.resource, 0) / patches.length, extinctAt, capHit,
            modes: (() => { const m = new Array(NM + 1).fill(0); for (const x of pop) m[x.mode]++; return m; })(),
            meanEnergy: pop.length ? pop.reduce((a, x) => a + x.energy, 0) / pop.length : 0, meanAge: pop.length ? pop.reduce((a, x) => a + x.age, 0) / pop.length : 0 };
        },
        individuals() { return pop.map((x) => ({ id: x.id, lin: x.lin, age: x.age, energy: x.energy, mode: x.mode, patch: x.patch, damage: x.damage, births: x.births, catches: x.catches, hunts: x.hunts, O: x.O, P: x.P, active: x.active, internal: x.internal, M: x.M, load: x.load, infections: x.infections, eff: x.eff, A: x.A, zb: x.zb, traits: x.ph, genes: x.genome.genes.length })); },
        traitMeans, result: () => buildResult(),
      };
      return live;
    }
    for (let t = 1; t <= o.steps; t++) if (!stepOnce(t)) break;
    return buildResult();
    function buildResult() {
    const ran = Math.min(extinctAt === null ? (o.live ? lastT : o.steps) : extinctAt, traceLen - 1); // a live run has no fixed end: report the steps actually run (traces cover the first 100000)
    const personSteps = (() => { let s2 = 0; for (let t = 1; t <= ran; t++) s2 += popTrace[t - 1]; return s2; })();
    const patchSteps = o.patches * ran;
    const windowRate = (a, b) => { if (b < a) return null; let br = 0, ps = 0; for (let t = a; t <= b; t++) { br += birthTrace[t]; ps += popTrace[t - 1]; } return ps ? br / ps : null; };
    const trace = Array.from(popTrace.subarray(1, ran + 1)).sort((a, b) => a - b);
    const alive = pop.reduce((a, x) => a + x.energy, 0);
    const expected = ledger.start + ledger.intakePlant + ledger.intakePrey - ledger.spent - ledger.reproOverhead - ledger.lostAtDeath - ledger.overflow + ledger.deficit;
    const col = (k) => deaths.map((d) => d[k]).filter((v) => v !== null);
    const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    const maxOf = (a) => (a.length ? a.reduce((m, v) => (v > m ? v : m), -Infinity) : null); // no spread: safe for 10^6 deaths
    const totalModes = modeSteps.reduce((a, b) => a + b, 0) || 1;
    const dec = decisions, nd = dec.tp + dec.fp + dec.fn + dec.tn;
    return {
      options: { ...o, founderGenomes: o.founderGenomes ? o.founderGenomes.length : null },
      extinct: pop.length === 0, extinctAt, capHit, disasters, envSignature,
      lineagePersistence: ran,                      // calendar steps the lineage existed (censored at o.steps)
      population: { min: trace.length ? trace[0] : 0, median: med(trace), max: trace.length ? trace[trace.length - 1] : 0, final: pop.length },
      lifespan: { calendarMean: mean(col(0)), calendarMedian: med(col(0)), calendarMax: maxOf(col(0)),
        activeMean: mean(col(1)), internalMean: mean(col(2)), deathsRecorded: deaths.length },
      reproduction: { totalBirths, birthsPerDeath: mean(col(3)), maxBirths: maxOf(col(3)), generationTime: totalBirths ? parentAgeSum / totalBirths : null,
        breedersAmongDead: deaths.length ? deaths.filter((d) => d[3] > 0).length / deaths.length : null,
        earlyBirthRate400: windowRate(1, Math.min(400, ran)), lateBirthRate: ran > 400 ? windowRate(401, ran) : null },
      lineages: LT ? (() => { const cnt = new Array(o.lineageCount).fill(0); for (const x of pop) cnt[x.lin]++;
        const tot = cnt.reduce((a, b) => a + b, 0); return { count: o.lineageCount, alive: cnt, shareAtEnd: cnt.map((c) => (tot ? c / tot : null)),
          extinctAt: linExtinctAt, survivedHorizon: cnt.map((c) => c > 0) }; })() : null,
      regimes: { waves, waveInfections: imStats.infectedInWave, reinfectionsSameAntigen: imStats.reinfectionSameAntigen,
        immuneMemoryPeakAtDeath: mean(col(10)), immuneMemoryRetentionAtDeath: mean(col(8)), waveInfectionsPerDeath: mean(col(9)),
        infectionDurationMean: imStats.infDurN ? imStats.infDurSum / imStats.infDurN : null, infectionsCleared: imStats.infDurN,
        exposures: imStats.exposures, exposuresWithMemory: imStats.exposuresWithMemory, exposureWithMemoryFraction: imStats.exposures ? imStats.exposuresWithMemory / imStats.exposures : null,
        meanProtectionAtMemoryExposure: imStats.exposuresWithMemory ? imStats.protSum / imStats.exposuresWithMemory : null,
        defencePrevented: imStats.prevented, defenceExpectedPrevented: imStats.expectedPrevented },
      ecology: { preyFractionMean: eco.n ? eco.sum / eco.n : null, preyFractionMin: eco.n ? eco.min : null, preyFractionEarly: eco.earlyN ? eco.earlySum / eco.earlyN : null,
        earlyPopulationMax: (() => { let m = 0; for (let t = 1; t <= Math.min(400, ran); t++) if (popTrace[t] > m) m = popTrace[t]; return m; })(),
        personSteps, birthsPerIndividualStep: personSteps ? totalBirths / personSteps : null, catchesPerIndividualStep: personSteps ? catches / personSteps : null,
        preyProducedPerPatchStep: patchSteps ? eco.produced / patchSteps / env.prey : null, preyCaughtPerPatchStep: patchSteps ? catches / patchSteps / env.prey : null,
        preyFloorAddedPerPatchStep: patchSteps ? eco.floorAdded / patchSteps / env.prey : null },
      deathCauses: causes,
      energy: { ...ledger, alive, residual: alive - expected, spentBy },
      predation: { huntSteps, encounters: huntEncounters, catches, successPerHuntStep: huntSteps ? catches / huntSteps : null, successPerEncounter: huntEncounters ? catches / huntEncounters : null },
      switching: { switches, decisions: dec, huntPrecision: dec.tp + dec.fp ? dec.tp / (dec.tp + dec.fp) : null,
        huntRecall: dec.tp + dec.fn ? dec.tp / (dec.tp + dec.fn) : null, accuracy: nd ? (dec.tp + dec.tn) / nd : null,
        sensorFalsePositiveRate: sensing.absent ? sensing.cueWhenAbsent / sensing.absent : null,
        sensorFalseNegativeRate: sensing.present ? sensing.missWhenPresent / sensing.present : null },
      modeFractions: Object.fromEntries(MODES.concat(['transition']).map((m, k) => [m, modeSteps[k] / totalModes])),
      cells: { originalAtDeath: mean(col(4)), memoryRetentionAtDeath: mean(col(5)) },
      history, finalGenomes: pop.map((x) => x.genome), final: traitMeans(),
      elapsedMs: Date.now() - t0,
    };
    }
  }

  function assay(genomes, options = {}) {
    const n = options.founders ?? 100, set = [];
    for (let i = 0; i < n; i++) set.push(genomes[i % genomes.length]);
    return simulate({ lineageCount: genomes.length, ...options, founders: n, mutation: false, founderGenomes: set });
  }

  return { REALM_DEFS, REALM_ADJ, REALM_DIFF, REALM_MOVE, rng, MODES, INPUTS, LOCI, TRAITS, STORAGE_INDEX: NL, DEFAULTS, ENVIRONMENTS, DEV_SIGNALS, REFERENCE_DEV, founderGenome, cloneGenome, mutate, develop, genomeStats, simulate, assay };
});
