(function (root, factory) {
  root.OmegaViews6 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The Stage 6 screens that read the game and draw on the page: the circular dish with its panel, the phylogeny (three layouts) and the codon screen.
  // They share one lineage selection (game.sel). The page (app.js) hands in what they need and calls the three draw functions.
  //   env: { $, S4(), fit(canvas, ctx), cv (the world canvas), cx (its 2d context), F (number formats), G (game module), game() -> current game, draw(force), isPlaying() }
  function create(env) {
    const { $, S4, fit, cv, cx, F, G } = env;
    // ======== Stage 6: the circular dish (dish2.js / dishview.js). The view state is plain UI state; nothing here changes the simulation. ========
    const DV = OmegaDishView, dview = DV.newView(); let dvGame = null, d2K = -1, d2V = null, gaugeStyle = 'needle', abilOpen = null, legendOpen = false;
    const selLin = () => { if (!env.game() || !env.game().sel) return null; const i = env.game().creatures.findIndex((c) => c.id === env.game().sel); return i < 0 ? null : i; };
    function setSel(lin) { env.game().sel = lin === null ? null : env.game().creatures[lin].id; abilOpen = null; env.draw(true); }
    const dish2Now = () => { const k = Math.floor(env.game().t / 25); if (d2K !== k || dvGame !== env.game()) { d2K = k; dvGame = env.game(); const v = env.game().dish2(); d2V = v; } return d2V; };
    function drawDish2() {
      const [W, H2] = fit(cv, cx), d = dish2Now(); if (!d) return; dview.sel = selLin(); DV.draw(cx, W, H2, d, dview); drawDishPanel(d);
    }
    // Pointer handling shared by the dish and the phylogeny: one finger drags, two fingers pinch, a short still touch is a tap, the wheel zooms (desktop).
    // opts: enabled() -> bool, onTap(x, y, rect), redraw(), maxZoom, panLimit(view) -> number, settle (pull the view back to the centre at zoom 1)
    function bindPanZoom(c, view, opts) {
      const ptr = new Map(), maxZoom = opts.maxZoom || 8, enabled = opts.enabled || (() => true); let tap = null, pinch = null;
      const local = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const clampPan = () => { const lim = opts.panLimit(view); view.px = Math.max(-lim, Math.min(lim, view.px)); view.py = Math.max(-lim, Math.min(lim, view.py)); if (opts.settle && view.zoom <= 1.001) { view.px *= 0.9; view.py *= 0.9; } };
      c.style.touchAction = 'none';
      c.addEventListener('pointerdown', (e) => { if (!enabled()) return; c.setPointerCapture(e.pointerId); ptr.set(e.pointerId, local(e)); if (ptr.size === 1) tap = { ...local(e), t: performance.now(), moved: 0 }; else { tap = null; const [p, q] = [...ptr.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), z: view.zoom }; } });
      c.addEventListener('pointermove', (e) => {
        if (!enabled() || !ptr.has(e.pointerId)) return; const prev = ptr.get(e.pointerId), cur = local(e); ptr.set(e.pointerId, cur); const r = c.getBoundingClientRect(), R0 = Math.min(r.width, r.height) / 2 - 6;
        if (ptr.size === 1) { view.px += (cur.x - prev.x) / R0; view.py += (cur.y - prev.y) / R0; if (tap) tap.moved += Math.hypot(cur.x - prev.x, cur.y - prev.y); }
        else if (ptr.size === 2 && pinch) { const [p, q] = [...ptr.values()]; view.zoom = Math.max(1, Math.min(maxZoom, pinch.z * Math.hypot(p.x - q.x, p.y - q.y) / Math.max(1, pinch.d))); }
        clampPan(); opts.redraw();
      });
      const up = (e) => { if (!enabled()) return; const was = ptr.has(e.pointerId); ptr.delete(e.pointerId); if (ptr.size < 2) pinch = null; if (was && tap && ptr.size === 0 && tap.moved < 8 && performance.now() - tap.t < 600) opts.onTap(tap.x, tap.y, c.getBoundingClientRect()); if (ptr.size === 0) tap = null; };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('wheel', (e) => { if (!enabled()) return; e.preventDefault(); view.zoom = Math.max(1, Math.min(maxZoom, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); opts.redraw(); }, { passive: false });
    }
    bindPanZoom(cv, dview, { enabled: S4, maxZoom: 8, panLimit: (v) => v.zoom, settle: true, redraw: () => { if (!env.isPlaying() || dview.zoom > 1) env.draw(false); else drawDish2(); }, onTap: (x, y, r) => { const d = dish2Now(), h = d ? DV.hit(r.width, r.height, d, dview, x, y) : null; setSel(h ? h.lin : null); } });
    const ICONS = { tolerance: '🛡️', metabolism: '🔥', repairRate: '🩹', dormancyDepth: '💤', predation: '🦷', movement: '👣', immune: '🧪', fecundity: '🥚' };
    function gaugeSvg(v) {
      const x = Math.max(0, Math.min(1, v));
      if (gaugeStyle === 'bars') { let s = '<svg viewBox="0 0 40 28" width="44" height="30" aria-hidden="true">'; for (let i = 0; i < 5; i++) { const on = x > i / 5 + 0.01, h = 6 + i * 4; s += `<rect x="${2 + i * 7.5}" y="${26 - h}" width="5.5" height="${h}" rx="1" fill="${on ? '#6fd3a0' : '#2c3b4a'}"/>`; } return s + '</svg>'; }
      const ang = (-90 + 180 * x) * Math.PI / 180, nx = 20 + 14 * Math.sin(ang), ny = 24 - 14 * Math.cos(ang);
      return `<svg viewBox="0 0 40 28" width="44" height="30" aria-hidden="true"><path d="M4 24 A16 16 0 0 1 36 24" fill="none" stroke="#2c3b4a" stroke-width="4"/><path d="M4 24 A16 16 0 0 1 36 24" fill="none" stroke="#6fd3a0" stroke-width="4" stroke-dasharray="${(50.3 * x).toFixed(1)} 60"/><line x1="20" y1="24" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#e8eef5" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="24" r="2.2" fill="#e8eef5"/></svg>`;
    }
    let dpChoice = '', dpBuiltAt = 0, dpHtml = '', dpTouching = false; // see drawDishPanel
    { const pn = $('dishpanel'); if (pn) { pn.addEventListener('pointerdown', () => { dpTouching = true; }); for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, () => { dpTouching = false; }); } }
    function drawDishPanel(d) {
      const el = $('dishpanel'); if (!el) return; if (el.hidden) el.hidden = false;
      // The panel is rebuilt at once when what the player chose changes (selection, mode, gauge style, opened detail, legend). Otherwise only its numbers move, so it is rebuilt at most twice a
      // second and never while a finger is on it: a button replaced between touch-down and touch-up would lose the tap (at x600 the numbers change every few frames).
      const sl = selLin(), choice = [sl, dview.mode, gaugeStyle, abilOpen, legendOpen].join('|'), now = performance.now();
      if (choice === dpChoice && (dpTouching || now - dpBuiltAt < 500)) return;
      const L = sl === null ? null : d.lineages.find((l) => l.lin === sl), ab = L ? env.game().abilities(sl) : null, rk = L ? env.game().rank.byLin[sl] : null;
      dpChoice = choice; dpBuiltAt = now;
      const aliveN = L ? L.beads.filter((b) => b.alive).length : 0, vac = L ? L.beads.length - aliveN : 0;
      let h = `<div class="dp-row"><button class="chip${dview.mode === 'path' ? ' on' : ''}" data-dm="path">進化経路</button><button class="chip${dview.mode === 'territory' ? ' on' : ''}" data-dm="territory">勢力圏</button><button class="chip" data-dact="reset">表示を戻す</button><button class="chip${legendOpen ? ' on' : ''}" data-dact="legend">凡例</button></div>`;
      if (legendOpen) h += '<div class="dp-legend">' + DV.LEGEND.map(([k, t]) => `<div><b>${k}</b><span>${t}</span></div>`).join('') + `<div><b>注意</b><span>${d.sources.land}</span></div><div><b>注意</b><span>${d.sources.civ}</span></div><div><b>代理</b><span>${d.sources.influence}</span></div><div><b>表示</b><span>未来が遠いほど枝を少し広げて描きます（見やすくするための表示で、計算結果は変えません）。絶滅した系統で、場所の記録がないものは、記録開始前に絶えたためです。</span></div></div>`;
      if (!L) h += `<div class="dp-sel dim">円の中の点か、下の系統の名前をタップすると、その系統の情報が出ます。<br>${d.lineages.filter((l) => !l.extinct).length}系統が現存、${d.lineages.filter((l) => l.extinct).length}系統が絶滅。</div>` + `<div class="dp-chips">${d.lineages.map((l) => `<button class="lchip${l.extinct ? ' dead' : ''}" data-dl="${l.lin}" style="--c:${l.color}"><i></i><b>${l.name}</b><span>${l.extinct ? '絶' : l.alive + '体'}</span></button>`).join('')}</div>`;
      else {
        h += `<div class="dp-sel" style="border-color:${L.color}"><div class="dp-name"><i style="background:${L.color}"></i><b>${L.name}</b><span>${L.extinct ? '絶滅' + (L.extinctAt !== null && L.extinctAt !== undefined ? '（' + L.extinctAt + 'ステップ）' : '') : '現存 ' + L.alive + '体'}</span></div>`
          + `<div class="dp-meta">ランク：現在 <b>${rk && rk.current ? rk.current.rank : '—'}</b> ／ 最高 <b>${rk && rk.best ? rk.best.rank : '—'}</b>　場所：現存 ${aliveN} ／ 絶滅 ${vac}　環境支配力 ${L.influenceReliable ? L.influence.toFixed(2) : '（算出中）'}</div>`
          + `<div class="dp-row"><button class="chip" data-dact="tree">系統樹で見る</button><button class="chip" data-dact="codon">コドンで見る</button><button class="chip" data-dact="desel">選択を外す</button></div></div>`;
        h += `<div class="dp-row"><span class="note">能力</span><button class="chip${gaugeStyle === 'needle' ? ' on' : ''}" data-dg="needle">針</button><button class="chip${gaugeStyle === 'bars' ? ' on' : ''}" data-dg="bars">棒</button></div>`;
        if (ab) { h += '<div class="abil">' + ab.items.map((i) => `<button class="tile${abilOpen === i.id ? ' open' : ''}" data-da="${i.id}"><span class="ic">${ICONS[i.id] || '・'}</span>${gaugeSvg(i.value)}<small>${i.name}</small></button>`).join('') + '</div>'; const op = ab.items.find((i) => i.id === abilOpen); if (op) h += `<div class="abil-d"><b>${ICONS[op.id]} ${op.name}　${Math.round(op.value * 100)}%</b><span>${op.text}。${ab.note}</span></div>`; else h += '<div class="abil-d dim">能力をタップすると詳しい説明が出ます。</div>'; }
        else h += '<div class="abil-d dim">この系統は現存しないため、能力は表示できません。</div>';
      }
      if (h !== dpHtml) { dpHtml = h; el.innerHTML = h; } else return;
      el.querySelectorAll('[data-dm]').forEach((b) => { b.onclick = () => { dview.mode = b.dataset.dm; dpChoice = ''; env.draw(true); }; });
      el.querySelectorAll('[data-dl]').forEach((b) => { b.onclick = () => setSel(Number(b.dataset.dl)); });
      el.querySelectorAll('[data-dg]').forEach((b) => { b.onclick = () => { gaugeStyle = b.dataset.dg; dpChoice = ''; env.draw(true); }; });
      el.querySelectorAll('[data-da]').forEach((b) => { b.onclick = () => { abilOpen = abilOpen === b.dataset.da ? null : b.dataset.da; dpChoice = ''; env.draw(true); }; });
      el.querySelectorAll('[data-dact]').forEach((b) => { b.onclick = () => { const a = b.dataset.dact; if (a === 'reset') { Object.assign(dview, { zoom: 1, px: 0, py: 0 }); } else if (a === 'legend') legendOpen = !legendOpen; else if (a === 'desel') { env.game().sel = null; abilOpen = null; } else if (a === 'tree' || a === 'codon') { const t = document.querySelector(`#tabs [data-tab=${a === 'tree' ? 'phylo' : 'codon'}]`); if (t) t.click(); } dpChoice = ''; env.draw(true); }; });
    }
    // ======== Stage 6: the phylogeny in three layouts (phylotree.js), tied to the dish and the codon screen by the lineage id (env.game().sel) ========
    const PT = OmegaPhyloTree, tview = PT.newView(); let tviewGame = null, tLay = null, tLayKey = '', tPtrBound = false, tInfoKey = '';
    function drawPhyloTab() {
      const el = $('tab-phylo'); if (!env.game() || !S4()) return;
      if (tviewGame !== env.game()) { tviewGame = env.game(); tview.collapsed = new Set(); tview.selNode = null; el.innerHTML = ''; tPtrBound = false; tLayKey = ''; }
      if (!el.firstChild) el.innerHTML = '<div class="dp-row" id="pt-modes"></div><canvas id="fan" width="360" height="360"></canvas><div id="fan-note" class="note"></div><div id="pt-detail"></div><div class="dp-row" id="pt-acts"></div><div id="pt-legend" class="dp-legend"></div>';
      const c = $('fan'), sl = selLin(); tview.selLin = sl;
      const key = [env.game().t, tview.mode, tview.limit, [...tview.collapsed].join(','), tview.selLin, tview.selNode].join('|'); if (key === tLayKey && c.width) return; // nothing changed since the last drawing: skip the work
      const p = env.game().phylo(tview.limit); if (!p) return; tLayKey = key;
      const Wc = c.clientWidth || 360, Hc = tview.mode === 'rect' ? Math.round(Wc * 0.9) : Wc; if (c.style.height !== Hc + 'px') c.style.height = Hc + 'px'; const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr); const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tLay = PT.layout(p, tview.mode, { collapsed: tview.collapsed }); PT.draw(ctx, Wc, Hc, tLay, tview, p, p.roots.map((r) => r.color));
      $('pt-modes').innerHTML = [['circle', '円形'], ['fan', '放射状'], ['rect', '矩形']].map(([m, t]) => `<button class="chip${tview.mode === m ? ' on' : ''}" data-pm="${m}">${t}</button>`).join('') + `<button class="chip${tview.limit > 160 ? ' on' : ''}" data-pl="1">${tview.limit > 160 ? '記録すべて' : '主な160'}</button><button class="chip" data-pr="1">表示を戻す</button>`;
      $('fan-note').innerHTML = `表示${p.shown}／記録${p.tracked}件　消えた枝：${p.roots.filter((r) => r.lostClades).map((r) => `${r.name.replace(/型$/, '')}${r.lostClades}`).join('・') || 'なし'}。${p.note}<br>線の太さ＝系統、✕＝絶えた系統。タップで系統・イベントを選択、系統名の先頭の線をタップでたたむ。`;
      const nd = tview.selNode !== null ? p.nodes.find((n) => n.id === tview.selNode) : null, L = tview.selLin !== null ? p.roots[tview.selLin] : null;
      $('pt-detail').innerHTML = nd ? `<div class="dp-sel" style="border-color:${p.roots[nd.lin].color}"><div class="dp-name"><i style="background:${p.roots[nd.lin].color}"></i><b>${nd.label}</b></div><div class="dp-meta">${p.roots[nd.lin].name}　記録ID ${nd.id}　${(PT.KIND[nd.kind] || { ja: nd.kind }).ja}　状態：${nd.status === 'established' ? '定着' : nd.status === 'occurred' ? '発生（まだ定着していない）' : '消失'}　世界の開始から${G.jaYears(nd.y)}ごろ${nd.parent !== null ? '　親：記録ID ' + nd.parent : '　親：系統そのもの'}</div></div>` : L ? `<div class="dp-sel" style="border-color:${L.color}"><div class="dp-name"><i style="background:${L.color}"></i><b>${L.name}</b><span>${L.alive > 0 ? '現存 ' + L.alive + '体' : '絶滅'}</span></div><div class="dp-meta">記録イベント ${p.nodes.filter((n) => n.lin === L.lin).length}件（表示中）／消えた枝 ${L.lostClades}${L.ends.length ? '／絶えた記録 ' + L.ends.length + '回' : ''}</div></div>` : '<div class="dp-sel dim">点か線をタップすると、記録された情報が出ます。</div>';
      $('pt-acts').innerHTML = L ? `<button class="chip" data-pa="dish">シャーレで見る</button><button class="chip" data-pa="codon">コドンで見る</button><button class="chip" data-pa="fold">${tview.collapsed.has(L.lin) ? '展開する' : 'たたむ'}</button>` : '';
      $('pt-legend').innerHTML = PT.LEGEND.map(([k, t]) => `<div><b>${k}</b><span>${t}</span></div>`).join('');
      $('pt-modes').querySelectorAll('[data-pm]').forEach((b) => { b.onclick = () => { tview.mode = b.dataset.pm; Object.assign(tview, { zoom: 1, px: 0, py: 0 }); tLayKey = ''; drawPhyloTab(); }; });
      $('pt-modes').querySelectorAll('[data-pl]').forEach((b) => { b.onclick = () => { tview.limit = tview.limit > 160 ? 160 : 600; tLayKey = ''; drawPhyloTab(); }; });
      $('pt-modes').querySelectorAll('[data-pr]').forEach((b) => { b.onclick = () => { Object.assign(tview, { zoom: 1, px: 0, py: 0 }); tLayKey = ''; drawPhyloTab(); }; });
      $('pt-acts').querySelectorAll('[data-pa]').forEach((b) => { b.onclick = () => { const a = b.dataset.pa; if (a === 'fold') { const l = L.lin; if (tview.collapsed.has(l)) tview.collapsed.delete(l); else tview.collapsed.add(l); tLayKey = ''; drawPhyloTab(); } else { const t = document.querySelector(`#tabs [data-tab=${a === 'dish' ? 'world' : 'codon'}]`); if (a === 'dish') { const w = $('world'); if (w) w.scrollIntoView({ block: 'center' }); } else if (t) t.click(); } }; });
      if (!tPtrBound) { tPtrBound = true; bindPanZoom(c, tview, { maxZoom: 10, panLimit: (v) => v.zoom + 0.5, redraw: () => { tLayKey = ''; drawPhyloTab(); }, onTap: (x, y, r) => { if (!tLay) return; const h = PT.hit(r.width, r.height, tLay, tview, x, y); if (!h) { env.game().sel = null; tview.selNode = null; } else { env.game().sel = env.game().creatures[h.lin].id; tview.selNode = h.type === 'node' ? h.id : null; } tLayKey = ''; drawPhyloTab(); } }); }
    }
    // ---- コドン ----
    let codonExpand = false; const CODON_COL = { tolerance: '#c9786e', metabolism: '#d9a35f', repairRate: '#7fb89a', dormancyDepth: '#7fb8c4', predation: '#a98cd6', movement: '#6f9fe0', immune: '#d4c46a', fecundity: '#d98fb0' };
    function drawCodonTab() {
      const si = env.game().sel ? env.game().creatures.findIndex((c) => c.id === env.game().sel) : -1, lin = si >= 0 ? si : env.game().controlled, info = env.game().codonInfo(lin), el = $('tab-codon');
      const chipsHtml = () => env.game().dish2().lineages.map((l) => `<button class="lchip${l.lin === lin ? ' on' : ''}${l.extinct ? ' dead' : ''}" data-cl="${l.lin}" style="--c:${l.color}"><i></i><b>${l.name}</b><span>${l.extinct ? '絶' : l.alive + '体'}</span></button>`).join('');
      const bindChips = () => el.querySelectorAll('[data-cl]').forEach((b) => { b.onclick = () => { env.game().sel = env.game().creatures[Number(b.dataset.cl)].id; drawCodonTab(); }; });
      if (!info) { el.innerHTML = `<div class="dp-chips">${chipsHtml()}</div><div class="note">この系統は絶えているため、遺伝情報を取り出せません（絶えた系統の最後の構造は保存していません）。系統を切り替えてください。</div>`; bindChips(); return; }
      if (!el.firstChild || !$('codon-cv')) el.innerHTML = '<div class="dp-chips" id="cx-lins"></div><div class="note" id="cx-disc"></div><div class="chips"><button class="chip" id="cx-tog"></button></div><canvas id="codon-cv" width="360" height="200"></canvas><div id="codon-num"></div><div id="cx-events"></div>';
      $('cx-lins').innerHTML = chipsHtml(); bindChips();
      $('cx-disc').innerHTML = '<b>これはこのゲーム独自の抽象モデルです。</b>実際のDNAの塩基配列やコドン表ではありません。1つの記号＝1つの機能単位で、その遺伝子がどの能力に影響するかを色で表しています。';
      $('cx-tog').textContent = codonExpand ? '展開表示（機能に必要な長さ）' : '圧縮表示（実際の長さ）'; $('cx-tog').onclick = () => { codonExpand = !codonExpand; drawCodonTab(); };
      const c = $('codon-cv'), W = c.clientWidth || 360, cell = 12, perRow = Math.max(8, Math.floor((W - 16) / cell)), genes = info.genes; c.width = Math.round(W * 2); const total = genes.reduce((s, g) => s + (codonExpand ? g.len0 : g.len), 0), MAXC = perRow * 14, rows = Math.min(14, Math.ceil(Math.min(total, MAXC) / perRow)); c.height = Math.round((rows * (cell + 6) + 14) * 2); c.style.height = (rows * (cell + 6) + 14) + 'px';
      const ctx = c.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, W, rows * (cell + 6) + 14); let k = 0, shown = 0;
      const pnodes = (env.game().phylo(160) || { nodes: [] }).nodes.filter((n) => n.lin === lin), selEv = pnodes.find((n) => n.id === tview.selNode), hiTrait = selEv && selEv.trait ? selEv.trait : null;
      // a strip of base-pair-like rungs, left-top to right-bottom, turning back on itself at each row end (boustrophedon)
      for (const g of genes) {
        const n = codonExpand ? g.len0 : g.len, col = g.reg ? '#6c7a89' : g.eff.length ? CODON_COL[g.eff.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0][0]] || '#8895a3' : '#8895a3';
        for (let q = 0; q < n; q++, k++) {
          if (k >= MAXC) break; const row = Math.floor(k / perRow), pos = k % perRow, x = 8 + (row % 2 === 0 ? pos : perRow - 1 - pos) * cell + cell / 2, y = 10 + row * (cell + 6) + cell / 2;
          ctx.globalAlpha = g.on ? 1 : 0.3; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - 5, 2, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(x, y + 5, 2, 0, 6.2832); ctx.fill();
          if (g.sym) { ctx.strokeStyle = '#c58cf0'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.stroke(); }
          if (hiTrait && g.eff.some((e) => e[0] === hiTrait)) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 6.2832); ctx.stroke(); }
          if (!g.on) { ctx.strokeStyle = '#e5586e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.stroke(); }
          if (!codonExpand && g.len0 > g.len && q === 0) { ctx.strokeStyle = '#f0f4f8'; ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 6, y - 6); ctx.stroke(); } // a packed gene is marked
          shown++;
        }
        ctx.globalAlpha = 1; if (k >= MAXC) break;
      }
      const s = info.stats, ms = info.means, cost = info.costs;
      $('codon-num').innerHTML = `<div class="g4"><div><small>表示の長さ</small><b>${codonExpand ? F.num(Math.round(s.Le)) : F.num(Math.round(s.Lp))}</b></div><div><small>物理的なゲノム長</small><b>${F.num(Math.round(s.Lp))}</b></div><div><small>機能情報</small><b>${F.small(s.info, 1)}</b></div><div><small>機能密度</small><b>${s.density.toFixed(2)}</b></div></div>
        <div class="g4"><div><small>圧縮率</small><b>${Math.round(s.packed * 100)}%</b></div><div><small>冗長性</small><b>${Math.round(s.redundancy * 100)}%</b></div><div><small>祖先との比</small><b>${(s.Lp / s.L0).toFixed(2)}</b></div><div><small>展開した長さ</small><b>${F.num(Math.round(s.Le))}</b></div></div>
        ${total > MAXC ? `<div class="note">長いので先頭の${F.num(MAXC)}個だけ表示しています（全体 ${F.num(total)}）。</div>` : ''}
        <div class="card2"><div class="row2"><b>この構造が実際にかけている負担</b></div><div class="note">複製の費用 ×${cost.replication.toFixed(2)}／老化の進み ×${cost.ageing.toFixed(2)}／修復力 ×${cost.repair.toFixed(2)}／維持費 ${cost.upkeep.toFixed(3)}（1ステップ）</div></div>
        <div class="note">凡例：色＝その遺伝子が主に影響する能力（${Object.entries({ tolerance: '耐性', metabolism: '代謝', repairRate: '修復', dormancyDepth: '休眠', predation: '捕食', movement: '移動', immune: '免疫', fecundity: '繁殖' }).map(([k2, v]) => `<i style="color:${CODON_COL[k2]}">■</i>${v}`).join(' ')}）、灰＝調節の遺伝子、薄い＝働いていない遺伝子、紫の輪＝取り込んだ共生体。<br>ゲーム独自の抽象化です。実際のDNAの塩基配列ではなく、「物理的な長さ」「機能の情報量」「圧縮後と展開後の長さ」は別の数字です。コドンは本来3塩基の単位ですが、ここでは作品固有の「Ωコドン」の考え方で、遺伝子の構造を指します。長すぎると複製・維持・損傷の代償があり、詰めすぎると修復の余地と頑健さを失います。</div>
        <details><summary>この系統の平均（${ms ? F.num(ms.n) : 0}個体）と変化</summary>${info.series.length ? `<canvas id="codon-ser" width="320" height="90"></canvas>` : ''}<div class="note">物理長（実線）と機能情報（点線）の推移。</div></details>`;
      { const SYM = { mutation: '✦', reorg: '⟲', separation: '⊘', fusion: '⊕', exchange: '⇄' }, evs = pnodes.slice().sort((x, y) => y.y - x.y).slice(0, 12), er = env.game().evoReport(), cnt = er && er.byLineage[lin] ? er.byLineage[lin] : null;
        $('cx-events').innerHTML = `<div class="card2"><div class="row2"><b>記録された遺伝のできごと</b></div><div class="note">${cnt ? `この系統で記録された回数：強まる${cnt.strengthen}・弱まる${cnt.weaken}・新しい働き${cnt.newcap}・変質${cnt.alter}・<b>欠失</b>${cnt.loss}・行動${cnt.behaviour}・交換${cnt.exchange}・融合${cnt.fusion}・分離${cnt.separation}・圧縮${cnt.compress}・展開${cnt.unpack}。<b>重複（遺伝子の増幅）</b>はこのゲームでは記録していません（未記録）。` : '記録はまだありません。'}</div><div class="evl">${evs.length ? evs.map((n) => `<button class="evb${n.id === tview.selNode ? ' on' : ''}" data-ev="${n.id}"><span>${SYM[n.kind] || '・'}</span><b>${n.label.replace(/^[^：]*：/, '')}</b><small>ID ${n.id}・${n.status === 'established' ? '定着' : '発生'}</small></button>`).join('') : '<div class="note">表示できる個別のできごとはありません。</div>'}</div><div class="note">できごとをタップすると、その働きに関わる遺伝子に白い輪がつきます（対応は働きの種類による推定です）。系統樹でも同じ記録IDが選ばれます。</div><div class="note">印：紫の輪＝共生体由来（融合）／赤い斜線＝停止中／上の短い線＝圧縮された遺伝子／白い輪＝選んだできごとと同じ種類の働き。</div></div>`;
        $('cx-events').querySelectorAll('[data-ev]').forEach((b) => { b.onclick = () => { const id = Number(b.dataset.ev); tview.selNode = tview.selNode === id ? null : id; tLayKey = ''; drawCodonTab(); }; }); }
      if (info.series.length) { const sc = $('codon-ser'), ctx2 = sc.getContext('2d'), n = info.series.length, mx = Math.max(...info.series.map((x) => Math.max(x.Lp, x.info))) * 1.1 || 1; ctx2.clearRect(0, 0, 320, 90); for (const [key, dash, col] of [['Lp', [], '#8fb4d8'], ['info', [3, 3], '#c9d6a0']]) { ctx2.strokeStyle = col; ctx2.setLineDash(dash); ctx2.beginPath(); info.series.forEach((x, i) => { const px = n === 1 ? 160 : (i / (n - 1)) * 316 + 2, py = 86 - (x[key] / mx) * 80; if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py); }); ctx2.stroke(); } ctx2.setLineDash([]); }
    }
    return { drawDish2, drawPhyloTab, drawCodonTab, resetDishPanel: () => { dpChoice = ''; dpHtml = ''; } };
  }
  return { create };
});
