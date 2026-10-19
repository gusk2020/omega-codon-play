(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaTime = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Display-only conversion of simulation steps into a human time scale.
  // The engine counts STEPS. It has no physical calibration, so every conversion here is an explicit ASSUMPTION
  // chosen by the player, never a measurement. Nothing in this file feeds back into the simulation.
  const ASSUMPTIONS = [
    { id: 'day', name: '1ステップ = 1日', days: 1 },
    { id: 'week', name: '1ステップ = 1週間', days: 7 },
    { id: 'month', name: '1ステップ = 1か月', days: 30.4375 },
    { id: 'year', name: '1ステップ = 1年', days: 365.25 },
  ];
  const DEFAULT_ASSUMPTION = 'day';
  // Long-term scenario hook (design only): the full game is meant to start about 66 million years before present.
  // Nothing is claimed about how steps map onto that span yet.
  const SCENARIO_START_YEARS_BP = 66e6;
  function find(id) { return ASSUMPTIONS.find((a) => a.id === id) || ASSUMPTIONS.find((a) => a.id === DEFAULT_ASSUMPTION); }
  function stepsToDays(steps, id) { return steps * find(id).days; }
  function formatDays(days) {
    if (!(days >= 0) || !isFinite(days)) return '-';
    if (days < 1) return '1日未満';
    if (days < 365.25) return `約${Math.round(days)}日`;
    const y = days / 365.25;
    if (y < 100) return `約${y.toFixed(y < 10 ? 1 : 0)}年`;
    if (y < 1e4) return `約${Math.round(y).toLocaleString('ja-JP')}年`;
    if (y < 1e8) return `約${Number((y / 1e4).toFixed(y < 1e6 ? 1 : 0)).toLocaleString('ja-JP')}万年`;
    return `約${Number((y / 1e8).toFixed(1))}億年`;
  }
  function format(steps, id) { return formatDays(stepsToDays(steps, id)); }
  return { ASSUMPTIONS, DEFAULT_ASSUMPTION, SCENARIO_START_YEARS_BP, stepsToDays, formatDays, format, find };
});
