(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaHabitat = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Habitat map model (display + structure only).
  //
  // WHAT IS REAL: nothing here comes from the simulation engine. The engine has no pressure, no oxygen, no gravity and no
  // habitat realm; its `thermal` is a dimensionless 0..1 stress index. So the four boxes below are DISPLAY ASSUMPTIONS:
  // rough present-day Earth ranges, there to give the future realm model a place to live. They do not decide where anything can live.
  //
  // STRUCTURE: habitability is meant to depend on several factors. Temperature and pressure are drawn today; the others are
  // registered but undefined, so adding oxygen / moisture / gravity later means filling in a factor, not redesigning the map.
  const REALMS = [
    { id: 'water', name: '水中', color: '#4fa3ff', T: [271, 373], P: [1.0e5, 1.1e8], note: '海面から海溝底まで／0〜100℃付近' },
    { id: 'land', name: '地上', color: '#46c28a', T: [184, 331], P: [3.3e4, 1.07e5], note: '観測された地表気温の極値／高山から低地' },
    { id: 'underground', name: '地中', color: '#f2a03d', T: [273, 423], P: [1.0e5, 1.0e8], note: '地表付近から数km（深いほど高温・高圧）' },
    { id: 'air', name: '空中', color: '#b38cf0', T: [200, 320], P: [1.0e3, 1.05e5], note: '地表から高度約30kmまで' },
  ];
  const FACTORS = [
    { id: 'temperature', name: '温度', defined: true, unit: 'K' },
    { id: 'pressure', name: '絶対圧力', defined: true, unit: 'Pa' },
    { id: 'oxygen', name: '酸素', defined: false },
    { id: 'moisture', name: '水分', defined: false },
    { id: 'gravity', name: '重力', defined: false },
  ];
  const REFERENCE = { T: 288.15, P: 101325, label: '地球地表の全球平均気温 15℃（288.15 K）・1気圧（101325 Pa）' };
  const ABS_ZERO_OFFSET = 273.15;
  const kelvinToCelsius = (k) => k - ABS_ZERO_OFFSET;
  const celsiusToKelvin = (c) => c + ABS_ZERO_OFFSET;

  // Axis space. Data is always held in kelvin / pascal. A log axis exists only for strictly positive data; a Celsius axis
  // cannot be logarithmic (0 and negative values are valid there), so asking for it switches the unit to kelvin.
  function toAxis(v, scale) {
    if (!isFinite(v)) return null;
    if (scale === 'log') return v > 0 ? Math.log10(v) : null;
    return v;
  }
  function fromAxis(a, scale) { return scale === 'log' ? Math.pow(10, a) : a; }
  function normaliseAxisChoice(unit, scale) { return scale === 'log' && unit === 'C' ? { unit: 'K', scale } : { unit, scale }; }

  // The whole-picture range: the union of every box and the reference point, padded, expressed in data units.
  function autoRange(axis, scale, realms = REALMS, ref = REFERENCE) {
    const key = axis === 'x' ? 'T' : 'P', refV = axis === 'x' ? ref.T : ref.P;
    let lo = refV, hi = refV; for (const r of realms) { lo = Math.min(lo, r[key][0]); hi = Math.max(hi, r[key][1]); }
    if (scale === 'log') { const a = toAxis(lo, 'log'), b = toAxis(hi, 'log'), pad = (b - a) * 0.08 || 0.5; return [fromAxis(a - pad, 'log'), fromAxis(b + pad, 'log')]; }
    const pad = (hi - lo) * 0.08 || 1; return [Math.max(0, lo - pad), hi + pad];
  }
  function niceStep(span, target) { const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  // Ticks in data units. For a Celsius display the tick values are chosen in Celsius and returned as kelvin.
  function ticks(lo, hi, scale, unit = 'K', target = 5) {
    const out = [];
    if (scale === 'log') {
      const span = Math.log10(hi) - Math.log10(lo), mant = span < 1.2 ? [1, 1.5, 2, 3, 4, 5, 6, 8] : span < 2.6 ? [1, 2, 5] : [1];
      for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) for (const m of mant) { const v = m * Math.pow(10, e); if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v); }
      return out;
    }
    const off = unit === 'C' ? ABS_ZERO_OFFSET : 0, a = lo - off, b = hi - off, st = niceStep(b - a, target);
    for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9; v += st) out.push(Math.round((v + off) * 1e9) / 1e9);
    return out;
  }
  function formatTick(v, scale, kind, unit) {
    if (kind === 'x') return unit === 'C' ? `${Math.round(kelvinToCelsius(v) * 10) / 10}` : `${Math.round(v * 10) / 10}`;
    const trim = (n) => `${Math.round(n * 100) / 100}`;
    if (v >= 1e6) return `${trim(v / 1e6)}M`; if (v >= 1e3) return `${trim(v / 1e3)}k`; return trim(v);
  }
  // Zoom about an anchor (fraction 0..1 along the axis) and pan, both in axis space so a log axis zooms by ratio.
  function zoomRange(range, scale, factor, anchor = 0.5) {
    const a = toAxis(range[0], scale), b = toAxis(range[1], scale), c = a + (b - a) * anchor, span = (b - a) * factor;
    return clampRange([fromAxis(c - span * anchor, scale), fromAxis(c + span * (1 - anchor), scale)], scale);
  }
  function panRange(range, scale, fraction) {
    const a = toAxis(range[0], scale), b = toAxis(range[1], scale), d = (b - a) * fraction;
    return clampRange([fromAxis(a + d, scale), fromAxis(b + d, scale)], scale);
  }
  function clampRange(r, scale) {
    let [lo, hi] = r; if (scale !== 'log') lo = Math.max(0, lo);
    if (!(hi > lo)) hi = lo + (scale === 'log' ? lo : 1);
    return [lo, hi];
  }
  // Standard view (Stage 1.9D): x = temperature on a log axis in kelvin with HOT on the LEFT and cold on the right, y = absolute pressure on a log axis with LOW pressure
  // at the top and HIGH at the bottom. Ranges are per realm by default ('per'); 'common' uses one shared range for every panel.
  const REALM_IDS = ['water', 'land', 'underground', 'air'];
  const realmById = (id) => REALMS.find((r) => r.id === id);
  function defaultView() {
    const v = { split: true, xUnit: 'K', xScale: 'log', yScale: 'log', xRev: true, yRev: true, rangeMode: 'per', xr: autoRange('x', 'log'), yr: autoRange('y', 'log'), pr: {} };
    v.pr = autoPanels(v); return v;
  }
  function autoPanels(v) { const o = {}; for (const r of REALMS) o[r.id] = { xr: autoRange('x', v.xScale, [r]), yr: autoRange('y', v.yScale, [r]) }; return o; }
  // The range a panel draws with: the shared one when merged or in 'common' mode, otherwise the realm's own.
  function panelRange(view, realmId) { if (!view.split || view.rangeMode === 'common' || !view.pr || !view.pr[realmId]) return { xr: view.xr, yr: view.yr }; return view.pr[realmId]; }
  function setPanelRange(view, realmId, xr, yr) { if (!view.split || view.rangeMode === 'common') return { ...view, xr, yr }; return { ...view, pr: { ...view.pr, [realmId]: { xr, yr } } }; }
  // Switching scale or unit never leaves an invalid range behind: every range is rebuilt as the whole picture.
  function setScale(view, axis, scale) {
    const v = { ...view };
    if (axis === 'x') { const n = normaliseAxisChoice(v.xUnit, scale); v.xUnit = n.unit; v.xScale = n.scale; }
    else v.yScale = scale;
    v.xr = autoRange('x', v.xScale); v.yr = autoRange('y', v.yScale); v.pr = autoPanels(v); return v;
  }
  function setUnit(view, unit) { const n = normaliseAxisChoice(unit, view.xScale); const v = { ...view, xUnit: n.unit, xScale: n.scale }; if (n.scale !== view.xScale) { v.xr = autoRange('x', n.scale); v.pr = autoPanels(v); } return v; }
  function resetView(view) { const v = { ...view, xr: autoRange('x', view.xScale), yr: autoRange('y', view.yScale) }; v.pr = autoPanels(v); return v; }
  // Screen mapping inside a rectangle; `rev` flips the direction. Returns null for values a log axis cannot place.
  function project(v, range, scale, size, rev, isY) {
    const a = toAxis(v, scale), lo = toAxis(range[0], scale), hi = toAxis(range[1], scale); if (a === null || lo === null || hi === null) return null;
    let f = (a - lo) / (hi - lo); if (isY) f = 1 - f; if (rev) f = 1 - f; return f * size;
  }
  return { REALMS, FACTORS, REFERENCE, kelvinToCelsius, celsiusToKelvin, toAxis, fromAxis, normaliseAxisChoice, autoRange, ticks, formatTick, zoomRange, panRange, clampRange, defaultView, autoPanels, panelRange, setPanelRange, setScale, setUnit, resetView, project };
});
