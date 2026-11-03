(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./colors')); else root.OmegaPhyloTree = factory(root.OmegaColors);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (COLORS) {
  'use strict';
  // Phylogeny layout and drawing (Stage 6). The same recorded events (game.phylo()) are laid out three ways:
  //   'rect'   : time runs left to right, one band per lineage (rectangular tree)
  //   'circle' : time runs from the centre outwards, lineages share the full circle
  //   'fan'    : like 'circle' but the lineages share a 200-degree fan opening upwards
  // Only recorded events are drawn. A node is an event that founded a clade; `parent` is the clade it came out of (an event id) or null (it came out of the lineage's own root).
  // Nothing is invented: lost branches are shown as a count, not as made-up ancestors.
  const KIND = { mutation: { sym: '✦', ja: '突然変異' }, reorg: { sym: '⟲', ja: '再編成（圧縮・展開）' }, separation: { sym: '⊘', ja: '分離' }, fusion: { sym: '⊕', ja: '融合' }, exchange: { sym: '⇄', ja: '機能の交換' } };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  // order the forest: lineages in roster order; inside a lineage, children by time. Returns leaf slots so that every lineage occupies a contiguous block.
  function arrange(p, opts = {}) {
    const collapsed = opts.collapsed || new Set(), byId = new Map(), kids = new Map(), roots = p.roots.filter((r) => r.alive > 0 || p.nodes.some((n) => n.lin === r.lin) || r.ends.length);
    for (const n of p.nodes) byId.set(n.id, n);
    for (const n of p.nodes) { const key = n.parent !== null && byId.has(n.parent) ? 'n' + n.parent : 'r' + n.lin; (kids.get(key) || kids.set(key, []).get(key)).push(n); }
    for (const a of kids.values()) a.sort((x, y) => x.y - y.y || x.id - y.id);
    let slot = 0; const pos = new Map(), blocks = [];
    const visit = (n) => { const ch = kids.get('n' + n.id) || []; if (!ch.length) { pos.set(n.id, slot++); return pos.get(n.id); } let s = 0; for (const c of ch) s += visit(c); pos.set(n.id, s / ch.length); return pos.get(n.id); };
    for (const r of roots) {
      const start = slot, top = kids.get('r' + r.lin) || [];
      if (collapsed.has(r.lin)) { slot += 1; blocks.push({ lin: r.lin, root: r, a: start, b: slot, mid: start + 0.5, collapsed: true, count: p.nodes.filter((n) => n.lin === r.lin).length }); continue; }
      if (!top.length) { slot += 1; blocks.push({ lin: r.lin, root: r, a: start, b: slot, mid: start + 0.5, collapsed: false, count: 0 }); continue; }
      const mids = top.map(visit); blocks.push({ lin: r.lin, root: r, a: start, b: slot, mid: (Math.min(...mids) + Math.max(...mids)) / 2 + 0.5, collapsed: false, count: p.nodes.filter((n) => n.lin === r.lin).length });
    }
    // node slots are leaf indices (+0.5 puts a node in the middle of its slot)
    return { blocks, pos, kids, byId, slots: Math.max(1, slot) };
  }
  // layout in a unit square [0,1]x[0,1] (rect) or unit disc (circle / fan). t = event time / total time.
  function layout(p, mode, opts = {}) {
    const A = arrange(p, opts), total = Math.max(1, p.years), out = { mode, nodes: [], edges: [], roots: [], links: [], slots: A.slots, blocks: A.blocks };
    const tOf = (y) => clamp(y / total, 0, 1);
    const place = (slotF, t) => {
      if (mode === 'rect') return { x: t, y: (slotF + 0.5) / A.slots };
      const frac = (slotF + 0.5) / A.slots, ang = mode === 'circle' ? (frac * 2 - 0.5) * Math.PI : (-Math.PI * 1.0 - 0.1 * Math.PI) + frac * Math.PI * 1.2; // circle starts at the top, fan opens upwards
      const r = 0.12 + 0.86 * t; return { x: r * Math.cos(ang), y: r * Math.sin(ang), ang, r };
    };
    const rootPos = new Map();
    for (const b of A.blocks) { const f = b.mid - 0.5; rootPos.set(b.lin, f); out.roots.push({ lin: b.lin, root: b.root, collapsed: b.collapsed, count: b.count, p0: place(f, 0), p1: place(f, b.root.alive > 0 ? 1 : tOf((b.root.ends.length ? b.root.ends[b.root.ends.length - 1].y : total))), extinct: b.root.alive === 0, lost: b.root.lostClades }); }
    const nodePos = new Map();
    for (const b of A.blocks) { if (b.collapsed) continue; }
    const hidden = (n) => (opts.collapsed || new Set()).has(n.lin);
    for (const n of p.nodes) { if (hidden(n)) continue; const f = A.pos.has(n.id) ? A.pos.get(n.id) : 0; const pt = place(f, tOf(n.y)); nodePos.set(n.id, pt); out.nodes.push({ ...n, ...pt, t: tOf(n.y), sym: (KIND[n.kind] || { sym: '・' }).sym, kindJa: (KIND[n.kind] || { ja: n.kind }).ja }); }
    for (const n of p.nodes) { if (hidden(n)) continue; const to = nodePos.get(n.id); let from; if (n.parent !== null && nodePos.has(n.parent)) from = { ...nodePos.get(n.parent), parent: true }; else from = place(rootPos.get(n.lin) === undefined ? 0 : rootPos.get(n.lin), tOf(n.y)); if (to && from) out.edges.push({ id: n.id, lin: n.lin, from, to, status: n.status }); }
    for (const l of p.links) { const to = nodePos.get(l.to); if (!to) continue; const f = rootPos.get(l.fromLin); if (f === undefined) continue; out.links.push({ type: l.type, fromLin: l.fromLin, to: l.to, from: place(f, tOf(l.y)), toPt: to }); }
    return out;
  }
  const { rgba } = COLORS;
  const newView = () => ({ zoom: 1, px: 0, py: 0, mode: 'circle', limit: 160, collapsed: new Set(), selLin: null, selNode: null });
  function frame(W, H, vs, mode) { const R0 = Math.min(W, H) / 2 - 8; if (mode === 'rect') { const w = W - 16, h = H - 16; return { ox: W / 2 + vs.px * w / 2, oy: H / 2 + vs.py * h / 2, sx: w * vs.zoom, sy: h * vs.zoom, rect: true, cx: W / 2, cy: H / 2 }; } return { ox: W / 2 + vs.px * R0, oy: (mode === 'fan' ? H * 0.62 : H / 2) + vs.py * R0, sx: R0 * vs.zoom, sy: R0 * vs.zoom, rect: false }; }
  const scr = (fr, pt, mode) => (fr.rect ? { x: fr.ox + (pt.x - 0.5) * fr.sx, y: fr.oy + (pt.y - 0.5) * fr.sy } : { x: fr.ox + pt.x * fr.sx, y: fr.oy + pt.y * fr.sy });
  function draw(ctx, W, H, lay, vs, p, colors) {
    ctx.clearRect(0, 0, W, H); const fr = frame(W, H, vs, lay.mode), S = (pt) => scr(fr, pt, lay.mode), sl = vs.selLin;
    // time rings / ticks
    ctx.strokeStyle = 'rgba(150,170,190,0.15)'; ctx.fillStyle = 'rgba(170,185,200,0.6)'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 1;
    const marks = [0.25, 0.5, 0.75, 1]; for (const m of marks) { if (lay.mode === 'rect') { const a = S({ x: m, y: 0 }), b = S({ x: m, y: 1 }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } else { const r = (0.12 + 0.86 * m) * fr.sx; ctx.beginPath(); ctx.arc(fr.ox, fr.oy, r, lay.mode === 'fan' ? Math.PI * 0.9 : 0, lay.mode === 'fan' ? Math.PI * 2.1 : Math.PI * 2); ctx.stroke(); } }
    ctx.fillText('古い', lay.mode === 'rect' ? S({ x: 0, y: 0 }).x + 12 : fr.ox, lay.mode === 'rect' ? S({ x: 0, y: 0 }).y - 4 : fr.oy + 12); ctx.fillText('新しい', lay.mode === 'rect' ? S({ x: 1, y: 0 }).x - 16 : fr.ox + (0.98 * fr.sx) * 0.0, lay.mode === 'rect' ? S({ x: 1, y: 0 }).y - 4 : fr.oy - 0.98 * fr.sy - 2);
    // roots (the lineages' own lines), then edges, links, nodes
    for (const r of lay.roots) { const a = S(r.p0), b = S(r.p1), c = colors[r.lin] || '#888', dim = sl !== null && sl !== r.lin; ctx.strokeStyle = rgba(c, dim ? 0.2 : 0.85); ctx.lineWidth = dim ? 1.5 : (r.lin === sl ? 4 : 2.6); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (r.extinct) { const s = 5; ctx.strokeStyle = rgba(c, dim ? 0.3 : 0.95); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x - s, b.y - s); ctx.lineTo(b.x + s, b.y + s); ctx.moveTo(b.x + s, b.y - s); ctx.lineTo(b.x - s, b.y + s); ctx.stroke(); }
      else { ctx.fillStyle = rgba(c, dim ? 0.3 : 1); ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 6.2832); ctx.fill(); }
      if (r.collapsed) { ctx.fillStyle = 'rgba(235,240,245,0.95)'; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`＋${r.count}`, a.x + 8, a.y - 6); } }
    for (const e of lay.edges) { // branches are drawn as in a phylogram: along the parent's ring (or row) to the child's position, then outwards (or along time)
      const a = S(e.from), b = S(e.to), c = colors[e.lin] || '#888', dim = sl !== null && sl !== e.lin; ctx.strokeStyle = rgba(c, dim ? 0.15 : 0.7); ctx.lineWidth = e.lin === sl ? 1.8 : 1.1; ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (lay.mode === 'rect') ctx.lineTo(a.x, b.y); else if (e.from.r !== undefined && e.to.r !== undefined) { let df = e.to.ang - e.from.ang; df = Math.atan2(Math.sin(df), Math.cos(df)); ctx.arc(fr.ox, fr.oy, e.from.r * fr.sx, e.from.ang, e.from.ang + df, df < 0); }
      ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.setLineDash([4, 3]); for (const l of lay.links) { const a = S(l.from), b = S(l.toPt); ctx.strokeStyle = l.type === 'fusion' ? 'rgba(255,210,90,0.85)' : l.type === 'heritage' ? 'rgba(190,150,255,0.85)' : 'rgba(120,230,220,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * 0.12, (a.y + b.y) / 2 - (b.x - a.x) * 0.12, b.x, b.y); ctx.stroke(); } ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.font = '11px system-ui';
    for (const n of lay.nodes) { const q = S(n), c = colors[n.lin] || '#888', dim = sl !== null && sl !== n.lin, r = n.id === vs.selNode ? 7 : 4.5; ctx.fillStyle = rgba(c, dim ? 0.25 : (n.status === 'established' ? 1 : 0.65)); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill(); if (n.status !== 'established') { ctx.strokeStyle = rgba(c, dim ? 0.3 : 1); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, r + 1.5, 0, 6.2832); ctx.stroke(); } if (n.id === vs.selNode) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, r + 2, 0, 6.2832); ctx.stroke(); } if (vs.zoom >= 2.2 && !dim) { ctx.fillStyle = 'rgba(240,245,250,0.9)'; ctx.fillText(n.sym, q.x, q.y - r - 3); } }
  }
  function hit(W, H, lay, vs, sx, sy, tol = 18) {
    const fr = frame(W, H, vs, lay.mode), S = (pt) => scr(fr, pt, lay.mode); let best = null, bd = tol * tol;
    for (const n of lay.nodes) { const q = S(n), d = (q.x - sx) * (q.x - sx) + (q.y - sy) * (q.y - sy); if (d < bd) { bd = d; best = { type: 'node', id: n.id, lin: n.lin }; } }
    if (!best) for (const r of lay.roots) { const a = S(r.p0), b = S(r.p1), L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; let t = L2 ? ((sx - a.x) * (b.x - a.x) + (sy - a.y) * (b.y - a.y)) / L2 : 0; t = clamp(t, 0, 1); const d = (a.x + t * (b.x - a.x) - sx) ** 2 + (a.y + t * (b.y - a.y) - sy) ** 2; if (d < bd) { bd = d; best = { type: 'root', lin: r.lin }; } }
    return best;
  }
  const LEGEND = [['●', '色＝系統。大きい線＝その系統そのもの。×＝絶えた系統、●＝現存'], ['✦ ⟲ ⊘ ⊕ ⇄', '記録された進化イベント（突然変異・再編成・分離・融合・機能の交換）。塗りつぶし＝定着、輪つき＝まだ定着していない'], ['破線', '親子ではない関係：黄＝融合、水色＝機能の交換、紫＝遺産の継承'], ['＋N', 'たたんだ系統。その系統に記録されたイベントの数']];
  return { KIND, arrange, layout, draw, hit, newView, frame, LEGEND };
});
