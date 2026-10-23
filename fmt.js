(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaFmt = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Number display (Stage 3.1). Display only: every internal value keeps its full precision.
  //   counts / steps  : 1,234 / 1.5万 / 123万 / 25億   (Japanese units from 10,000 up; three significant digits)
  //   years           : 480年 / 1,200年 / 15万年 / 25億年
  //   technical (SI)  : 1.2k / 1.5M / 3.4G
  // Rounding keeps three significant digits, so a figure is never shown more precisely than that and never changed in its order of magnitude.
  const sig3 = (x) => { if (x === 0 || !isFinite(x)) return x; const p = Math.pow(10, 2 - Math.floor(Math.log10(Math.abs(x)))); return Math.round(x * p) / p; };
  const trim = (x) => { const s = String(sig3(x)); return s.indexOf('e') >= 0 ? Number(s).toFixed(0) : s; };
  const group = (n) => Math.round(n).toLocaleString('en-US');
  const JP = [[1e12, '兆'], [1e8, '億'], [1e4, '万']];
  function jp(n) { // 10,000 and up in 万/億/兆 with 3 significant digits
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (!isFinite(n)) return String(n);
    if (a < 1e4) return s + (a >= 100 ? group(a) : trim(a));
    for (let i = 0; i < JP.length; i++) { const [u, name] = JP[i]; if (sig3(a) >= u) { const v = sig3(a) / u; if (v >= 1e4 && i > 0) continue; return s + trim(v) + name; } }
    return s + group(a);
  }
  const num = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : jp(n));
  const years = (y) => { if (y === null || y === undefined || Number.isNaN(y)) return '—'; const a = Math.abs(y); return a < 1e4 ? (a < 100 ? trim(y) : group(y)) + '年' : jp(y) + '年'; };
  const SI = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k']];
  const si = (n, unit = '') => { if (n === null || n === undefined || Number.isNaN(n)) return '—'; const a = Math.abs(n); for (const [u, p] of SI) if (sig3(a) >= u) return trim(n / u) + p + unit; return trim(n) + unit; };
  const small = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? '—' : Math.abs(x) >= 100 ? group(x) : Number(x.toFixed(d)).toString());
  const pct = (x, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? '—' : (x * 100).toFixed(d) + '%');
  const exact = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number.isInteger(n) ? n.toLocaleString('en-US') : String(n));
  return { num, years, si, small, pct, exact, jp, sig3 };
});
