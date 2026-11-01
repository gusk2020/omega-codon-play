(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(typeof require === 'function' ? require('./dish2') : null); else root.OmegaDishView = factory(root.OmegaDish2);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D2) {
  'use strict';
  // Drawing and hit-testing for the circular dish (Stage 6). Pure canvas code: it reads a `dish2()` result and a view state, and changes nothing in the game.
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const TAU = Math.PI * 2;
  const newView = () => ({ zoom: 1, px: 0, py: 0, mode: 'path', sel: null });
  // unit disc -> screen
  function geom(W, H, vs) { const R0 = Math.min(W, H) / 2 - 6, k = R0 * vs.zoom; return { cx: W / 2 + vs.px * R0, cy: H / 2 + vs.py * R0, R0, k }; }
  const toScreen = (g, u) => ({ x: g.cx + u.x * g.k, y: g.cy + u.y * g.k });
  // The future is drawn a little more spread out the further it lies beyond the present, so that branching is readable. Display only.
  function spreadFactor(d) { const present = d.presentYears || 0; if (!present) return 1; return 1 + 0.25 * clamp((d.years - present) / 1e9, 0, 1); }
  function beadPos(b, centre, f) { return { x: centre.x + (b.x - centre.x) * f, y: centre.y + (b.y - centre.y) * f }; }
  function centroid(beads) { let x = 0, y = 0, w = 0; for (const b of beads) { const m = b.alive ? 1 + b.n : 0.5; x += b.x * m; y += b.y * m; w += m; } return w ? { x: x / w, y: y / w } : { x: 0, y: 0 }; }
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  // beads of every lineage with their screen positions (shared by draw and hit)
  function layout(W, H, d, vs) {
    const g = geom(W, H, vs), f = spreadFactor(d), out = [];
    for (const L of d.lineages) { const c = centroid(L.beads); for (const b of L.beads) { const p = toScreen(g, beadPos(b, c, f)); out.push({ L, b, x: p.x, y: p.y, rad: 3 + 26 * Math.sqrt(Math.max(0, b.size)) * Math.min(1.6, 0.6 + vs.zoom * 0.25) }); } }
    return { g, items: out };
  }
  function draw(ctx, W, H, d, vs) {
    ctx.clearRect(0, 0, W, H); const g = geom(W, H, vs);
    ctx.save(); ctx.beginPath(); ctx.arc(g.cx, g.cy, g.k, 0, TAU); ctx.clip();
    // the two halves: land (left, warm earth) and water (right, blue)
    ctx.fillStyle = '#1b1a14'; ctx.fillRect(g.cx - g.k, g.cy - g.k, g.k, g.k * 2); ctx.fillStyle = '#0d1a2a'; ctx.fillRect(g.cx, g.cy - g.k, g.k, g.k * 2);
    // temperature: a faint cold (top) to hot (bottom) wash over both halves
    const gr = ctx.createLinearGradient(0, g.cy - g.k, 0, g.cy + g.k); gr.addColorStop(0, 'rgba(120,170,255,0.20)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,120,60,0.20)'); ctx.fillStyle = gr; ctx.fillRect(g.cx - g.k, g.cy - g.k, g.k * 2, g.k * 2);
    ctx.restore();
    // pressure rings (log scale): 1e8, 1e7, 1e5(=1 atm, thick), 1e3, 1e2 Pa
    ctx.lineWidth = 1; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
    for (const [P, lab] of [[1e8, '10⁸Pa'], [1e7, '10⁷'], [1e3, '10³']]) { const r = D2.radiusOfPressure(P) * g.k; ctx.strokeStyle = 'rgba(150,170,190,0.18)'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke(); if (vs.zoom >= 0.9) { ctx.fillStyle = 'rgba(170,185,200,0.55)'; ctx.fillText(lab, g.cx + 3, g.cy + r - 2); } }
    ctx.fillStyle = 'rgba(170,185,200,0.6)'; ctx.fillText('中心＝高圧', g.cx + 3, g.cy + 12); ctx.textAlign = 'right'; ctx.fillText('外側＝低圧・真空', g.cx - 4, g.cy + g.k - 22); ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(235,225,150,0.75)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g.cx, g.cy, D2.R_ATM * g.k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(235,225,150,0.9)'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('地表 1気圧', g.cx - D2.R_ATM * g.k * 0.72, g.cy + D2.R_ATM * g.k * 0.0 - 4); ctx.fillText('海面 1気圧', g.cx + D2.R_ATM * g.k * 0.72, g.cy - 4);
    ctx.strokeStyle = 'rgba(160,175,190,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.cx, g.cy - g.k); ctx.lineTo(g.cx, g.cy + g.k); ctx.stroke();
    ctx.strokeStyle = '#33465c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.k, 0, TAU); ctx.stroke();
    ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(190,205,220,0.9)'; ctx.fillText('陸', g.cx - g.k * 0.5, g.cy - g.k * 0.8); ctx.fillText('水', g.cx + g.k * 0.5, g.cy - g.k * 0.8);
    ctx.fillStyle = 'rgba(150,190,255,0.95)'; ctx.fillText('寒（上）', g.cx, g.cy - g.k + 14); ctx.fillStyle = 'rgba(255,150,100,0.95)'; ctx.fillText('熱（下）', g.cx, g.cy + g.k - 6);
    const { items } = layout(W, H, d, vs), sel = vs.sel;
    // chains first (so the beads sit on top)
    const byKey = new Map(); for (const it of items) byKey.set(it.L.lin * 1e6 + it.b.key, it);
    for (const it of items) { const par = it.b.par === null || it.b.par === undefined ? null : byKey.get(it.L.lin * 1e6 + it.b.par); if (!par) continue; const dim = sel !== null && sel !== it.L.lin; ctx.strokeStyle = rgba(it.L.color, dim ? 0.12 : (it.b.alive ? 0.7 : 0.35)); ctx.lineWidth = dim ? 1 : (it.L.lin === sel ? 2 : 1.4); if (!it.b.alive) ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(par.x, par.y); ctx.lineTo(it.x, it.y); ctx.stroke(); ctx.setLineDash([]); }
    if (vs.mode === 'territory') { // territories: soft colour pools, size = influence at the place
      for (const it of items) { if (!it.b.alive) continue; const dim = sel !== null && sel !== it.L.lin, r = it.rad * 2.6 + 6, gg = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, r); gg.addColorStop(0, rgba(it.L.color, dim ? 0.12 : 0.5)); gg.addColorStop(1, rgba(it.L.color, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, TAU); ctx.fill(); }
    }
    for (const it of items) {
      const dim = sel !== null && sel !== it.L.lin, r = Math.max(2.5, it.rad * (vs.mode === 'territory' ? 0.55 : 1));
      if (it.b.alive) { ctx.fillStyle = rgba(it.L.color, dim ? 0.3 : 0.95); ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, TAU); ctx.fill(); if (it.L.lin === sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); } }
      else { ctx.strokeStyle = rgba(it.L.color, dim ? 0.2 : 0.8); ctx.lineWidth = it.L.lin === sel ? 2 : 1.3; ctx.beginPath(); ctx.arc(it.x, it.y, Math.max(2.5, Math.min(r, 7)), 0, TAU); ctx.stroke(); }
    }
    if (d.civ) { // civilisation: a cross whose size is its power to change the environment, inside a black dashed region (placement is provisional)
      const p = toScreen(g, d.civ), s = 5 + 13 * d.civ.size, ro = g.k * (0.08 + 0.32 * d.civ.size);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(p.x, p.y, ro, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(p.x, p.y, ro, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (const [col, w] of [['rgba(255,255,255,0.85)', 5], ['#000', 2.5]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); ctx.stroke(); }
    }
    if (vs.zoom >= 2) { ctx.font = '10px system-ui'; ctx.textAlign = 'left'; for (const it of items) if (it.b.alive && it.L.lin === (sel !== null ? sel : it.L.lin) && it.rad > 7) { ctx.fillStyle = 'rgba(240,245,250,0.9)'; ctx.fillText(it.L.name, it.x + it.rad + 2, it.y + 3); } }
  }
  // the nearest bead (living or vacated) to a screen point, or null
  function hit(W, H, d, vs, sx, sy, tol = 22) {
    const { items } = layout(W, H, d, vs); let best = null, bd = tol * tol;
    for (const it of items) { const dx = it.x - sx, dy = it.y - sy, dd = dx * dx + dy * dy - Math.pow(Math.min(it.rad, 12), 2) * 0.5; if (dd < bd) { bd = dd; best = it; } }
    return best ? { lin: best.L.lin, key: best.b.key, alive: best.b.alive } : null;
  }
  const LEGEND = [
    ['●', '現存：いまそこにいる系統（色＝系統、大きさ＝環境支配力×その場所にいる割合）'],
    ['◯', '絶滅した場所：かつて個体がいて、いまは誰もいない場所。過去の枝は履歴として残る'],
    ['線', '進化経路：その系統が広がった順に、いちばん近い既存の場所へつなぐ（実際の系統関係ではなく、広がりの記録）'],
    ['×', '文明：大きさ＝環境を変える力。黒い破線の輪は影響のおよぶ範囲（場所は仮置き）'],
    ['左右', '左半円＝陸（地表・地下・空）／右半円＝水。半径＝圧力（中心＝高圧、外側＝低圧）。上＝低温、下＝高温'],
    ['気圧', '黄色い破線＝1気圧：左では地表、右では海面。内側ほど地下・深海、外側ほど空・真空に近い'],
  ];
  return { newView, geom, layout, draw, hit, toScreen, spreadFactor, LEGEND };
});
