(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaAdaptation = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // DISPLAY LAYER for temperature-pressure adaptation ranges.
  //
  // THIS PROVIDER IS A PLACEHOLDER. Its ranges are generated deterministically from the seed, the lineage number and the step,
  // and are NOT connected to any genome, trait or simulation result. They exist so the map's drawing, switching and labelling can be
  // built and checked before a real adaptation model exists. Nothing here may feed survival, evolution or any win condition.
  // A real provider replaces this object; the map only talks to the interface:
  //   lineageRange(lin, seed, step)  -> { active:{T:[K,K],P:[Pa,Pa]}, dormant:{...} }
  //   individualRange(id, lin, seed, step)
  //   source / linkedToEvolution / label
  const h = (n) => { const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453; return x - Math.floor(x); };
  const wave = (step, period, phase) => 0.5 + 0.5 * Math.sin(2 * Math.PI * (step / period + phase));
  function box(Tc, Th, logPc, dec) { return { T: [Math.max(1, Tc - Th), Tc + Th], P: [Math.pow(10, logPc - dec), Math.pow(10, logPc + dec)] }; }
  function build(key, step, jitter = 0, scale = 1) {
    const a = wave(step, 900 + 170 * (key % 5), h(key + 1)), b = wave(step, 1300 + 110 * (key % 7), h(key + 2));
    const Tc = 288.15 + (h(key + 3) - 0.5) * 36 + (h(key + 9) - 0.5) * 12 * jitter, logPc = 5.0 + (h(key + 4) - 0.5) * 1.4 + (h(key + 8) - 0.5) * 0.6 * jitter;
    const Th = (12 + 38 * a) * scale, dec = (0.45 + 1.4 * b) * scale;
    return { active: box(Tc, Th, logPc, dec), dormant: box(Tc, Th * 1.8, logPc, dec * 1.8) };
  }
  const provider = {
    id: 'dummy-v1', source: 'dummy', linkedToEvolution: false, label: 'ダミー表示・進化計算とは未連動',
    lineageRange(lin, seed, step) { return build(seed * 31 + lin * 101, step); },
    individualRange(id, lin, seed, step) { return build(seed * 31 + lin * 101, step, 1 + h(id), 0.6 + 0.8 * h(id + 7)); },
  };
  // Where an individual currently is, in temperature-pressure terms: the display-assumption box of its realm, taken at its centre.
  function realmCentre(realm) { return { T: (realm.T[0] + realm.T[1]) / 2, P: Math.pow(10, (Math.log10(realm.P[0]) + Math.log10(realm.P[1])) / 2) }; }
  return { provider, realmCentre };
});
