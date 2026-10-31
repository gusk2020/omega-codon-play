'use strict';
(function () {
  const E = OmegaEngine19, G = OmegaGame, TM = OmegaTime, H = OmegaHabitat, HS = OmegaHistory, AD = OmegaAdaptation;
  const $ = (id) => document.getElementById(id);
  const SPEEDS = [10, 30, 100, 400, 1500, 6000], SPEED_LABEL = ['×1', '×3', '×10', '×40', '×150', '×600']; // target steps per second
  const SLOT_OF_REALM = [3, 0, 2, 1], REALM_OF_SLOT = [1, 3, 2, 0]; // realm ids are water, land, underground, air; slots are top-left, top-right, bottom-left, bottom-right. Land TL, air TR, underground BL, water BR
  const REALM_COLOR = { water: '#4fa3ff', land: '#46c28a', underground: '#f2a03d', air: '#b38cf0' };
  const KEY = 'omega-codon-saves-v1', SKEY = 'omega-codon-settings-v3';
  const MODE_JA = ['休眠', '待機', '探索', '狩り', '修復', '移行'];
  const CAUSE_JA = { capacityCull: '過密', extrinsic: '事故', starvation: '飢餓', senescence: '老衰', thermal: '寒暖', pathogen: '病気', disaster: '災害', injury: '狩りの傷' };
  let sel = ['standard'], rivalN = 2, measured = { rate: 0, t: 0, steps: 0 }, scenarioId = 'kpg', envId = 'steady', game = null, playing = false, speedIdx = 1, tab = 'world', timeMode = 'adaptive', metric = 'pop', loading = null;
  let acc = 0, lastTs = 0, lastDraw = 0, lastAuto = 0, startTraits = null;
  // UI-only settings (never part of the simulation or the save): the time-unit assumption and the habitat map view.
  const settings = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
  let assume = TM.find(settings.assume).id, hv = H.defaultView();
  (() => { const v = settings.hv; const ok = (r, lg) => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[1] > r[0] && r[0] >= 0 && !(lg && r[0] <= 0);
    if (!v || !['linear', 'log'].includes(v.xScale) || !['linear', 'log'].includes(v.yScale) || !['C', 'K'].includes(v.xUnit) || (v.xScale === 'log' && v.xUnit === 'C') || !ok(v.xr, v.xScale === 'log') || !ok(v.yr, v.yScale === 'log')) return;
    const n = { ...hv, split: v.split !== false, xUnit: v.xUnit, xScale: v.xScale, yScale: v.yScale, xRev: !!v.xRev, yRev: !!v.yRev, rangeMode: v.rangeMode === 'common' ? 'common' : 'per', xr: v.xr, yr: v.yr };
    n.pr = H.autoPanels(n); if (v.pr) for (const id of Object.keys(n.pr)) if (v.pr[id] && ok(v.pr[id].xr, n.xScale === 'log') && ok(v.pr[id].yr, n.yScale === 'log')) n.pr[id] = v.pr[id];
    hv = n; })();
  function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify({ assume, hv, ov, ovHist })); } catch (e) { /* storage may be unavailable */ } }

  // ---------- storage ----------
  function readSaves() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function writeSaves(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
  // Stage 5.1: a save is a state taken at a "continue?" screen only (game.milestone()); nothing is saved while the game runs between milestones.
  function putSave(slot, label) {
    if (!game || !game.checkpoint) return false;
    const snap = game.milestone(); if (!snap) return false;
    const s = readSaves(); s[slot] = { ...snap, ts: Date.now(), label: label || describe(game) };
    return writeSaves(s);
  }
  function describe(g) { const st = g.live.stats(), wi = g.worldInfo(); if (g.cfg.stage === 4) return `原始の海から ／ ${wi.bpText} ／ ${st.t}ステップ ／ ${g.cfg.heritage ? '特殊モード' : '通常モード'}`; return `${g.cfg.creatures.map((id) => (G.CREATURES7.find((c) => c.id === id) || {}).name).join('・')} ／ ${wi ? wi.bpText + ' ／ ' : ''}${st.t}ステップ ／ ${st.population}体`; }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 1800); }

  // ---------- start screen ----------
  const rosterNow = () => (timeMode === 'adaptive' && scenarioId === 'kpg' ? G.CREATURES7 : G.CREATURES);
  function renderStart() {
    $('creatures').innerHTML = '';
    { const ids = rosterNow().map((c) => c.id); sel = sel.filter((id) => ids.includes(id)); if (!sel.length) sel = ['standard']; }
    for (const c of rosterNow()) {
      const b = document.createElement('button'); b.className = 'cr' + (sel.includes(c.id) ? ' on' : '');
      b.innerHTML = `<i style="background:${c.color}"></i><div><b>${c.name}</b><span>${c.text}</span></div>`;
      b.onclick = () => { if (sel.includes(c.id)) { if (sel.length > 1) sel = sel.filter((x) => x !== c.id); } else if (sel.length < 3) sel.push(c.id); else toast('選べるのは3種までです'); renderStart(); };
      $('creatures').appendChild(b);
    }
    $('rivals').innerHTML = '';
    const maxR = Math.max(0, G.MAX_LINEAGES - sel.length); if (rivalN > maxR) rivalN = maxR;
    for (let n = 0; n <= Math.min(2, maxR); n++) { const b = document.createElement('button'); b.className = 'chip' + (n === rivalN ? ' on' : ''); b.textContent = n === 0 ? 'なし' : n + '種'; b.onclick = () => { rivalN = n; renderStart(); }; $('rivals').appendChild(b); }
    const seedNow = Math.max(1, Math.floor(Number($('seed').value)) || 1), rv = G.pickRivals(seedNow, sel, rivalN, rosterNow());
    $('rival-preview').textContent = rv.length ? '競争相手（乱数の種から自動で決まります）：' + rv.map((id) => rosterNow().find((c) => c.id === id).name).join('・') : '競争相手なし：選んだ生き物だけが計算されます。';
    $('scenarios').innerHTML = '';
    for (const [id, n] of [['kpg', '白亜紀末の隕石衝突から（約6,600万年前）'], ['free', '自由（衝突なし）']]) { const b = document.createElement('button'); b.className = 'chip' + (id === scenarioId ? ' on' : ''); b.textContent = n; b.onclick = () => { scenarioId = id; renderStart(); }; $('scenarios').appendChild(b); }
    $('envs').innerHTML = '';
    for (const e of G.ENVIRONMENTS) { const b = document.createElement('button'); b.className = 'chip' + (e.id === envId ? ' on' : ''); b.textContent = e.name; b.title = e.text; b.onclick = () => { envId = e.id; renderStart(); }; $('envs').appendChild(b); }
    $('timemodes').innerHTML = '';
    for (const [id, n] of [['adaptive', '可変時間（新・文明あり）'], ['fixed', '固定（旧・1ステップ＝1日）']]) { const b = document.createElement('button'); b.className = 'chip' + (id === timeMode ? ' on' : ''); b.textContent = n; b.onclick = () => { timeMode = id; renderStart(); }; $('timemodes').appendChild(b); }
    $('timemode-note').textContent = timeMode === 'adaptive' ? '1ステップ＝30日とみなし、平穏な期間は世界の時計だけを大きく進めます（進化はその間は進みません）。知性文明が現れ、環境を変えます。' : '旧方式：文明も時間の跳躍もありません。比較や古いセーブとの互換のために残しています。';
    $('modes').innerHTML = ''; for (const [id, n] of [['normal', '通常'], ['special', '特殊（遺産を引き継ぐ）']]) { const b = document.createElement('button'); b.className = 'chip' + (id === modeSel ? ' on' : ''); b.textContent = n; b.onclick = () => { modeSel = id; renderStart(); }; $('modes').appendChild(b); }
    $('mode-note').textContent = modeSel === 'normal' ? '通常：図鑑と偉業の記録だけが次の世界に残ります。生き物は強くなりません。' : `特殊：前の世界の遺産（${(Meta.load().heritage || []).length}個）が水に漂った状態で始まります。記録と評価は通常モードとは別に数えます。`;
    renderSlots($('slots-start'));
  }
  function renderSlots(el, withSave) {
    const s = readSaves(); el.innerHTML = '';
    const names = [['auto', '節目の自動保存'], ['s1', 'スロット1'], ['s2', 'スロット2'], ['s3', 'スロット3']];
    for (const [k, n] of names) {
      const d = document.createElement('div'); d.className = 'slot';
      const sv = s[k];
      d.innerHTML = `<div><b>${n}</b><small>${sv ? sv.label + '<br>' + new Date(sv.ts).toLocaleString('ja-JP') : '空'}</small></div>`;
      if (withSave && k !== 'auto') { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '保存'; b.onclick = () => { toast(putSave(k) ? `${n}に保存しました` : '保存できませんでした'); renderSlots(el, withSave); }; d.appendChild(b); }
      if (sv) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '読込'; b.onclick = () => loadSlot(k); d.appendChild(b); }
      el.appendChild(d);
    }
  }
  $('reseed').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 99999); renderStart(); };
  $('seed').oninput = () => renderStart();
  $('seed').value = 1 + Math.floor(Math.random() * 99999);
  $('go').onclick = () => { const seed = Math.max(1, Math.floor(Number($('seed').value)) || 1), cfg = { creatures: [], rivals: [], environment: 'steady', seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4 };
    if (modeSel === 'special') { const h = Meta.load().heritage; if (!h || !h.length) { toast('引き継げる遺産がまだありません（先に通常モードで遊ぶと貯まります）'); return; } cfg.heritage = h.slice(0, 24); }
    begin(G.newGame(E, cfg)); };

  // ---------- play ----------
  function begin(g) {
    game = g; document.body.classList.toggle('s31', g.cfg.stage >= 3.1); document.body.classList.toggle('s4', g.cfg.stage === 4); if (g.cfg.stage >= 3.1) $('skip').textContent = '⏭ 次の出来事';
    if (g.cfg.stage === 4) { $('tabs').innerHTML = '<button data-tab="codex" class="on">図鑑</button><button data-tab="phylo">系統樹</button><button data-tab="codon">コドン</button><button data-tab="feats">偉業</button><button data-tab="log">年表</button><button data-tab="detail">詳細</button>'; tab = 'codex'; runId = Date.now(); const m = Meta.load()[g.cfg.heritage ? 'special' : 'normal'] || Meta.blank(); metaKnown = new Set(Object.keys(m.codex)); achSeen = 0; secSmooth = null; metaT = -1; for (const id of ['world', 'stat', 'ind', 'rank', 'trait', 'graph', 'env', 'log', 'codex', 'phylo', 'codon', 'feats', 'about']) $('tab-' + id).hidden = id !== 'codex'; } else { $('tabs').innerHTML = TABS_ORIG; tab = 'world'; for (const id of ['world', 'stat', 'ind', 'rank', 'trait', 'graph', 'env', 'log', 'codex', 'phylo', 'codon', 'feats', 'about']) { const e = $('tab-' + id); if (e) e.hidden = id !== 'world'; } $('detailnav').hidden = true; }
    updateMapCap(); startTraits = g.series[0] ? g.series[0].traits.slice() : null; playing = true; lastAuto = g.t;
    $('start').hidden = true; $('play').hidden = false; $('modal').hidden = true;
    buildSpeeds(); measured = { rate: 0, t: performance.now(), steps: g.t };
    if ($('legend')) $('legend').innerHTML = '<div><b>点の意味</b>（アリーナ＝詳細に計算している範囲）</div><div>● 注目系統　■ 競争相手・移入した系統　1点＝<b>実際の1個体</b>　点の大きさ＝<b>その個体のエネルギー量</b>　赤い輪＝狩り中　薄い＝休眠</div><div>下の「背景」の1点＝背景集団の<b>10単位</b>（個体数ではなく、粗い計算の代表集団）　点の大きさ＝<b>直近の増殖率</b></div>';
    setSpeed(speedIdx); setPP(); setAutoBtn(); draw(true);
    cpShown = false; if (g.pending) showPrompt(); else if (g.checkpoint) showCheckpoint();
  }
  function setAutoBtn() { const on = !!(game && game.autoContinuous); $('auto').textContent = '自動：' + (on ? 'ON' : 'OFF'); $('auto').classList.toggle('on', on); $('auto-note').textContent = on ? '分岐点では止まらず、中立的な「見守る」を選びます（履歴に理由を残します）' : '分岐点で止まります'; }
  $('auto').onclick = () => { if (!game) return; game.setAutoContinuous(!game.autoContinuous); setAutoBtn(); toast(game.autoContinuous ? '連続自動モード ON' : '連続自動モード OFF'); };
  function buildSpeeds() { const el = $('speeds'); if (el.children.length) return; SPEED_LABEL.forEach((n, i) => { const b = document.createElement('button'); b.dataset.s = i; b.textContent = n; b.onclick = () => setSpeed(i); el.appendChild(b); }); }
  function setSpeed(i) { speedIdx = i; document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === i)); }
  function setPP() { $('pp').textContent = playing ? '⏸' : '▶'; }
  $('pp').onclick = () => { if (!game || game.pending || game.checkpoint || game.isOver || loading) return; playing = !playing; setPP(); };
  $('save').onclick = () => { if (!game) return; playing = false; setPP(); openMenu(true); };
  $('menu').onclick = () => { if (!game) return; playing = false; setPP(); openMenu(false); };
  // Writes that would put in the very same markup are skipped: it keeps the page from being rebuilt several times a second at high speed (and keeps buttons stable under a finger).
  (() => { const wrap = (el, prop) => { const desc = Object.getOwnPropertyDescriptor(prop === 'innerHTML' ? Element.prototype : Node.prototype, prop); let last = null; Object.defineProperty(el, prop, { configurable: true, get() { return desc.get.call(this); }, set(v) { if (v === last) return; last = v; desc.set.call(this, v); } }); }; for (const id of ['hud2', 'hud-rank', 'rankstrip', 'ticker', 'tab-codex', 'tab-feats', 'tab-log']) wrap($(id), 'innerHTML'); for (const id of ['hud-era', 'hud-sub']) wrap($(id), 'textContent'); })();
  const TABS_ORIG = $('tabs').innerHTML;
  $('tabs').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; const t = b.dataset.tab; setTab(t === 'detail' ? detailSub : t); });

  function openMenu(saveFocus) {
    const card = $('modal-card'); card.innerHTML = `<h3>${saveFocus ? '保存' : 'メニュー'}</h3><div id="menu-slots"></div>`;
    const slots = card.querySelector('#menu-slots'); renderSlots(slots, !!(game && game.checkpoint)); if (!(game && game.checkpoint)) { const n = document.createElement('p'); n.className = 'note'; n.textContent = '保存できるのは、「続けますか？」と出る節目のときだけです。'; card.insertBefore(n, slots); }
    const mk = (t, f, cls) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || '') + ' big'; b.textContent = t; b.onclick = f; card.appendChild(b); };
    mk('閉じて続ける', () => { $('modal').hidden = true; if (!game.pending && !game.isOver) { playing = true; setPP(); } }, 'primary');
    mk('タイトルに戻る（最後の節目より後の進行は失われます）', () => { game = null; playing = false; $('modal').hidden = true; $('play').hidden = true; $('start').hidden = false; renderStart(); });
    $('modal').hidden = false;
  }

  function showPrompt() {
    const p = game.pending; if (!p) return; playing = false; setPP();
    const card = $('modal-card'); card.innerHTML = `<h3>分岐点：${p.title}</h3><p class="note">${p.text}</p><p class="note">環境への介入は全系統に平等に働きます。選ぶのは1つだけ。</p>`;
    for (const o of p.options) { const b = document.createElement('button'); b.className = 'opt' + (o.id === 'auto' ? ' auto' : ''); b.innerHTML = `<b>${o.name}</b><span>${o.text}</span>`; b.onclick = () => { game.choose(o.id, 'once'); $('modal').hidden = true; playing = true; setPP(); draw(true); }; card.appendChild(b); }
    const c = document.createElement('button'); c.className = 'opt auto'; c.innerHTML = '<b>以後ずっと自動にする</b><span>連続自動モードをONにして、この分岐点も自動で進めます。あとで画面の「自動イベント」ボタンでOFFに戻せます。</span>';
    c.onclick = () => { game.setAutoContinuous(true); game.choose('auto', 'continuous'); setAutoBtn(); $('modal').hidden = true; playing = true; setPP(); draw(true); }; card.appendChild(c);
    $('modal').hidden = false;
  }
  function showEnd() {
    playing = false; setPP();
    const st = game.live.stats(), card = $('modal-card');
    card.innerHTML = `<h3>${st.population ? '観察終了' : '絶滅しました'}</h3><p style="white-space:pre-line">${game.summary().text}</p>`;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = 'タイトルに戻る'; b.onclick = () => { game = null; $('modal').hidden = true; $('play').hidden = true; $('start').hidden = false; renderStart(); }; card.appendChild(b);
    $('modal').hidden = false;
  }

  function loadSlot(k) {
    const sv = readSaves()[k]; if (!sv) return;
    let g; try { g = G.loadGame(E, sv); } catch (e) { toast('読み込めませんでした：' + String(e.message || e) + '（保存データは消していません）'); return; }
    playing = false; loading = { g, target: sv.t, savedAt: sv.ts };
    const card = $('modal-card'); card.innerHTML = `<h3>読み込み中…</h3><p class="note">${sv.label}<br>${sv.kind === 'milestone' ? '節目の保存から再開します（すぐ終わります）。' : '古い形式のセーブです。最初から操作を再現するため、時間がかかります（同じ結果になります）。'}</p><div class="prog"><div id="prog"></div></div>`;
    $('modal').hidden = false; $('start').hidden = true; $('play').hidden = false;
    const tick = () => {
      const t0 = performance.now();
      try { while (loading.g.replayTo !== null && performance.now() - t0 < 14) loading.g.advance(20); } catch (err) { loading = null; $('modal').hidden = true; $('play').hidden = !game; $('start').hidden = !!game; toast('セーブの再生に失敗しました（保存データは消していません）'); if (game) { playing = false; setPP(); } return; } // never leave the loading screen standing
      $('prog').style.width = Math.min(100, (loading.g.t / Math.max(1, loading.target)) * 100) + '%';
      if (loading.g.replayTo !== null) requestAnimationFrame(tick); else { const gg = loading.g; const away = loading.savedAt ? Date.now() - loading.savedAt : 0; loading = null; begin(gg); playing = !gg.pending; setPP(); toast(gg.cfg.stage === 4 && away > 600000 ? '読み込みました。閉じていた間は進んでいません（実際に計算していない期間の出来事は作りません）' : '読み込みました'); }
    };
    requestAnimationFrame(tick);
  }

  // ---------- main loop ----------
  // The simulation and the drawing are decoupled: each frame spends a fixed time budget on simulation (so touches stay responsive), and the
  // picture is redrawn at a lower rate. The speed actually reached is measured and shown; it is never claimed to be the target.
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0); lastTs = ts;
    if (!game || loading) return;
    if (playing && !game.pending && !game.checkpoint && !game.isOver) {
      const t0 = performance.now();
      if (skipping) {
        while (performance.now() - t0 < 12 && !game.pending && !game.checkpoint && !game.isOver) { game.advance(5); if (game.eventsSince(skipping.seq0).some((e) => STOP_KINDS.has(e.kind)) || game.t - skipping.t0 >= MAX_SKIP) { stopSkip(false); break; } }
        if (skipping) $('skipnote').textContent = `早送り中… ${(game.t - skipping.t0).toLocaleString('ja-JP')}ステップ`; else acc = 0;
      } else {
        acc += dt * SPEEDS[speedIdx]; const budget = speedIdx >= 4 ? 11 : 8, chunk = 5; // Stage 5.1: small chunks (a 25-step chunk can take ~40 ms on a phone, longer than the whole frame budget, which froze the clock and delayed touches)
        while (acc >= 1 && performance.now() - t0 < budget && !game.pending && !game.checkpoint && !game.isOver) { const n = Math.min(Math.floor(acc), chunk); game.advance(n); acc -= n; }
      }
      if (acc > SPEEDS[speedIdx] * 0.2) acc = SPEEDS[speedIdx] * 0.2; // drop the backlog instead of falling ever further behind
      if (game.t - lastAuto >= 500) { lastAuto = game.t; metaSync(); } // Stage 5.1: no periodic save of the game (only the codex and feats records are synced)
      if (game.pending) { skipping = null; $('skip').textContent = '⏭ 次の出来事まで早送り'; showPrompt(); } else if (game.checkpoint) showCheckpoint(); else if (game.isOver) showEnd();
      const now = performance.now(); if (now - measured.t >= 1000) { measured = { rate: (game.t - measured.steps) / ((now - measured.t) / 1000), t: now, steps: game.t }; showSpeed(); }
    } else { measured = { rate: 0, t: performance.now(), steps: game.t }; showSpeed(); }
    if (ts - lastDraw > (speedIdx >= 4 ? 110 : 66)) { draw(false); lastDraw = ts; }
  }
  function showSpeed() {
    const el = $('speedinfo'); if (!el) return; if (!playing || !measured.rate) { el.textContent = playing ? '' : '停止中'; el.className = 'note'; return; }
    const target = SPEEDS[speedIdx], r = measured.rate, behind = r < target * 0.85;
    el.textContent = `目標 ${target}/秒 ・ 実測 ${Math.round(r)}ステップ/秒${behind ? '（処理が追いつかず、目標より遅い）' : ''}`; el.className = 'note' + (behind ? ' behind' : '');
  }

  // ---------- drawing ----------
  const cv = $('world'), cx = cv.getContext('2d');
  function fit(c, ctx) { const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); const w = Math.round(r.width * d), h = Math.round(r.height * d); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } ctx.setTransform(d, 0, 0, d, 0, 0); return [r.width, r.height]; }
  const hash = (n, k) => { const x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  function drawWorld(st) {
    const [W, H2] = fit(cv, cx), gw = W / 2, gh = H2 / 2; cx.clearRect(0, 0, W, H2);
    const realms = !!game.cfg.realms, rr = realms ? game.realmReport() : null, slotOf = (patch) => (realms ? SLOT_OF_REALM[patch] : patch);
    for (let slot = 0; slot < 4; slot++) {
      const p = realms ? REALM_OF_SLOT[slot] : slot, x0 = (slot % 2) * gw, y0 = Math.floor(slot / 2) * gh, id = realms ? E.REALM_DEFS[p].id : null, col = id ? REALM_COLOR[id] : '#46c28a';
      cx.fillStyle = 'rgba(70,194,138,' + (0.04 + 0.12 * st.preyFraction) + ')'; cx.fillRect(x0 + 2, y0 + 2, gw - 4, gh - 4);
      if (realms) { cx.globalAlpha = 0.07; cx.fillStyle = col; cx.fillRect(x0 + 2, y0 + 2, gw - 4, gh - 4); cx.globalAlpha = 1; }
      cx.strokeStyle = realms ? col : '#1f2e3f'; cx.globalAlpha = realms ? 0.55 : 1; cx.strokeRect(x0 + 2, y0 + 2, gw - 4, gh - 4); cx.globalAlpha = 1;
      cx.font = 'bold 12px system-ui'; cx.fillStyle = realms ? col : '#7f93a8'; cx.fillText(realms ? `${E.REALM_DEFS[p].name}  ${rr.realms[p].total}体` : `区画${p + 1}（旧）`, x0 + 8, y0 + 16);
    }
    const ind = game.live.individuals(), now = performance.now() / 1000, n = Math.min(ind.length, 1200);
    for (let i = 0; i < n; i++) {
      const x = ind[i], slot = slotOf(x.patch), x0 = (slot % 2) * gw, y0 = Math.floor(slot / 2) * gh;
      const px = x0 + 8 + hash(x.id, 1) * (gw - 16) + Math.sin(now * 1.3 + x.id) * 2, py = y0 + 22 + hash(x.id, 2) * (gh - 30) + Math.cos(now * 1.1 + x.id * 0.7) * 2;
      const r = 2.2 + Math.min(3, x.energy) * 0.9, sq = game.roleOf(x.lin) !== 'focus';
      cx.globalAlpha = x.mode === 0 ? 0.3 : 1; cx.fillStyle = game.creatures[x.lin].color; cx.beginPath(); if (sq) cx.rect(px - r, py - r, r * 2, r * 2); else cx.arc(px, py, r, 0, 6.2832); cx.fill();
      if (x.mode === 3) { cx.strokeStyle = '#ff5d73'; cx.lineWidth = 1.5; cx.stroke(); } else if (x.mode === 4) { cx.strokeStyle = '#46c28a'; cx.lineWidth = 1.2; cx.stroke(); }
    }
    cx.globalAlpha = 1;
  }
  // Background strip: one row per background group. 1 dot = 10 units of a coarse group population (NOT individuals), dot size = recent growth.
  function drawBackground() {
    const bc = $('bgstrip'); if (!bc || !bc.getBoundingClientRect().width) return; const bx = bc.getContext('2d');
    const [W, Hh] = fit(bc, bx); bx.clearRect(0, 0, W, Hh); const rep = game.backgroundReport();
    bx.font = '11px system-ui'; if (!rep) { bx.fillStyle = '#7f93a8'; bx.fillText('このセーブは背景生態系の導入前のものです（背景は計算していません）', 8, 20); return; }
    const rows = rep.groups, rh = Math.min(22, (Hh - 6) / Math.max(1, rows.length));
    rows.forEach((g, k) => {
      const y = 4 + k * rh + rh / 2; bx.fillStyle = g.extinct ? '#5b6b7c' : g.color; bx.textAlign = 'left'; bx.fillText(`${g.name}`, 6, y + 4);
      bx.fillStyle = '#7f93a8'; bx.fillText(g.extinct ? '絶えた' : `${Math.round(g.units)}単位`, 70, y + 4);
      if (!g.extinct) { const dots = Math.min(28, Math.round(g.units / 10)), rad = 2.5 + Math.max(0, Math.min(3, 3 + g.growth * 8)) * 0.8; for (let d = 0; d < dots; d++) { bx.globalAlpha = 0.85; bx.fillStyle = g.color; bx.beginPath(); bx.moveTo(130 + d * 8.5, y - rad); bx.lineTo(130 + d * 8.5 + rad, y); bx.lineTo(130 + d * 8.5, y + rad); bx.lineTo(130 + d * 8.5 - rad, y); bx.closePath(); bx.fill(); } bx.globalAlpha = 1; }
      bx.fillStyle = '#7f93a8'; bx.textAlign = 'right'; bx.fillText(g.inArena ? `アリーナに${g.inArena}体` : g.extinct ? '' : `移入${g.immigrantsTotal}`, W - 6, y + 4);
    }); bx.textAlign = 'left';
  }
  function drawLinbar() {
    const rep = game.lineageReport(); $('linbar').innerHTML = rep.filter((l) => l.alive > 0 || l.role === 'focus').map((l) => { const c = l.change100; return `<span><i style="color:${l.color}">${l.role === 'focus' ? '●' : '■'}</i> ${l.name}${l.role === 'rival' ? '（相手）' : l.role === 'immigrant' ? '（移入）' : ''} <b>${l.alive}</b>${c === null ? '' : `<span class="${c > 0 ? 'up' : c < 0 ? 'dn' : ''}"> ${c > 0 ? '▲' : c < 0 ? '▼' : '＝'}${Math.abs(c)}</span>`}</span>`; }).join('');
  }
  function kv(rows) { return '<div class="kv">' + rows.map(([a, b, w]) => (w ? `<span class="w"><small>${a}</small><br>${b}</span>` : `<span>${a}</span><span>${b}</span>`)).join('') + '</div>'; }
  function linRows(list) {
    return list.map((l) => `<div class="lin"><div><i style="color:${l.color}">${game.roleOf(l.lin) === 'rival' ? '■' : '●'}</i> ${l.name}<small>${l.extinct ? (l.extinctAt !== null ? l.extinctAt + 'ステップで絶えた' : '絶えた') : '生存中'}・生存個体の累計捕獲 ${l.catchesOfLiving}</small></div><div class="num">${l.alive} 体<small class="${l.change100 > 0 ? 'up' : l.change100 < 0 ? 'dn' : ''}">${l.change100 === null ? '増減：計測中' : '直近約100ステップ ' + (l.change100 > 0 ? '+' : '') + l.change100}</small></div></div>`).join('');
  }
  function drawStat(st) {
    const tot = st.modes.reduce((a, b) => a + b, 0) || 1, tc = Object.entries(st.causes).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${CAUSE_JA[k]} ${v}`).join('／') || '-';
    const rep = game.lineageReport(), bg = game.background(), focus = rep.filter((l) => l.role === 'focus'), riv = rep.filter((l) => l.role === 'rival');
    const rr = game.realmReport(), hi = game.historyInfo();
    const realmHtml = rr ? '<div class="grp">4つの領域ごとの分布（実際に計算）</div>' + `<table class="rt"><tr><th></th>${rr.realms.map((r) => `<th style="color:${REALM_COLOR[r.id]}">${r.name}</th>`).join('')}</tr>` +
      game.creatures.map((c, i) => `<tr><td><i style="color:${c.color}">${game.roleOf(i) === 'rival' ? '■' : '●'}</i> ${c.name}</td>${rr.realms.map((r) => `<td>${r.byLineage[i]}</td>`).join('')}</tr>`).join('') + '</table>' +
      '<p class="note">領域間の移動（累計）：' + (() => { const f = []; rr.moves.forEach((row, a) => row.forEach((n, b) => { if (n > 0) f.push([n, `${rr.realms[a].name}→${rr.realms[b].name} ${n}`]); })); return f.sort((x, y) => y[0] - x[0]).map((x) => x[1]).join('／') || 'まだなし'; })() + '。移動は探索中の個体が、移動能力・エネルギーの余裕に応じて隣の領域へ移る計算です（移動にはコストがかかり、行き先で生き残れるかは環境次第）。</p>' : '<p class="note">このセーブは領域が導入される前のものです。4つの区画は領域の属性を持たない「旧区画」として動きます（結果は以前と同じ）。</p>';
    const histHtml = hi ? '<div class="grp">地球史（シナリオ）</div>' + `<p class="note">開始：${HS.formatYearsBP(HS.KPG_AGE_YEARS_BP)}（白亜紀末の衝突）。衝突から約${hi.yearsSinceImpact.toFixed(1)}年（1ステップ=1日の仮定・未校正）。年代の不確かさは前後約${Math.round(hi.yearsBPUncertainty / 1000)}千年。</p>` +
      hi.events.map((e) => `<div class="ev"><small>${e.status === 'applied' ? '✔ 計算に反映' : '○ 年表のみ（計算には未反映）'}｜約${e.ageMa}百万年前（±${e.uncMa}）｜${e.kind}</small>${e.name}</div>`).join('') : '';
    const fmt = (v, d = 1) => (v === null || v === undefined ? '-' : v.toFixed(d));
    const recs = game.records(), recOf = (i) => recs.find((r) => r.lin === i) || { recordAge: 0, aliveNow: 0 };
    const cmpHtml = game.v2 ? (() => {
      const tot = Math.max(1, rep.reduce((a, l) => a + l.alive, 0)), est = rep.filter((l) => l.alive >= 5);
      const best = (f, dir) => { let b = null; for (const l of est) { const v = f(l); if (v === null || v === undefined) continue; if (b === null || (dir > 0 ? v > b.v : v < b.v)) b = { v, l }; } return b; };
      const bn = best((l) => l.alive, 1), bl = best((l) => recOf(l.lin).recordAge, 1), bd = best((l) => (l.window ? l.window.deathRate : null), -1);
      const eff = (l) => { const d = game.live.lineageDetail()[l.lin]; return d.spent > 0 ? l.stats.intake / d.spent : null; }, bef = best(eff, 1);
      return '<div class="grp">系統の比較（実際に計算した値）</div><table class="cmp"><tr><th>系統</th><th>個体数</th><th>直近増減</th><th>最長（生存中/記録）</th><th>平均寿命</th><th>死亡率</th><th>出生率</th><th>資源効率</th></tr>' + rep.map((l) => { const w = l.window, ls = l.stats, r = recOf(l.lin), e = eff(l); return `<tr><td><i style="color:${l.color}">${l.role === 'focus' ? '●' : '■'}</i> ${l.name}</td><td>${l.alive}</td><td class="${l.change100 > 0 ? 'up' : l.change100 < 0 ? 'dn' : ''}">${l.change100 === null ? '-' : (l.change100 > 0 ? '+' : '') + l.change100}</td><td>${r.aliveNow}/${r.recordAge}</td><td>${ls.deaths ? fmt(ls.lifeSum / ls.deaths, 1) : '-'}</td><td>${w ? fmt(w.deathRate * 100, 1) : '-'}</td><td>${w ? fmt(w.birthRate * 100, 1) : '-'}</td><td>${e === null ? '-' : fmt(e, 2)}</td></tr>`; }).join('') + '</table>' +
        `<p class="note"><b>数の優勢</b>：${bn ? `${bn.l.name}（個体の${Math.round((bn.v / tot) * 100)}%）` : '-'}　<b>長く生きる優勢</b>（最長記録）：${bl ? `${bl.l.name}（${bl.v}ステップ）` : '-'}　<b>死亡率が最も低い</b>：${bd ? bd.l.name : '-'}　<b>資源効率が最も高い</b>：${bef ? bef.l.name : '-'}。数が多いことと、少数でも強く長く生きることは別の優勢です。</p>` +
        '<p class="note">死亡率・出生率は、1個体あたり100ステップあたり（直近約100ステップ）。平均寿命は死亡した個体の平均、最長は個体が途切れず生きた期間。資源効率は、摂取エネルギー÷消費エネルギー。エネルギー合計や生物量は体の大きさを計算していないため、比較に使っていません。背景の集団については、個体ごとの寿命・死亡率は計算していません。</p>' +
        (() => { const d = game.diversity(); return `<p class="note">多様性（計算している範囲の中で）：アリーナに系統 ${d.arenaRichness}（シャノン指数 ${d.arenaShannon.toFixed(2)}）／背景のグループ ${d.backgroundRichness}（${d.backgroundShannon.toFixed(2)}）。${d.note}</p>`; })();
    })() : '';
    const bgr = game.backgroundReport(), bgHtml = bgr ? '<div class="grp">背景生態系（アリーナの外・粗い計算）</div>' + `<table class="cmp"><tr><th>グループ</th><th>単位</th><th>増殖</th><th>移入累計</th><th>状態</th></tr>${bgr.groups.map((g) => `<tr><td><i style="color:${g.color}">◆</i> ${g.name}</td><td>${g.extinct ? '-' : Math.round(g.units)}</td><td class="${g.growth > 0 ? 'up' : g.growth < 0 ? 'dn' : ''}">${g.extinct ? '-' : (g.growth * 100).toFixed(1) + '%'}</td><td>${g.immigrantsTotal}</td><td>${g.extinct ? '絶えた' : g.inArena ? 'アリーナにも' : '背景のみ'}</td></tr>`).join('')}</table><p class="note">単位は個体相当の量で、個体数そのものではありません。アリーナの個体と背景の単位は別の場所のもので、重ねて数えていません。背景から来た個体は進化していない祖先型です。${bgr.note}</p>` : '';
    const statDet = '<div class="bghead">背景（アリーナの外の世界）：粗い計算</div><canvas id="bgstrip" width="360" height="110" style="width:100%;height:110px"></canvas>' + histHtml + realmHtml + cmpHtml + bgHtml + '<div class="grp">注目系統（あなたが選んだ生き物）</div>' + linRows(focus) +
      (riv.length ? '<div class="grp">競争相手（独立に進化を計算）</div>' + linRows(riv) + '<p class="note">競争相手を捕食する関係は計算していません（獲物は全系統に共通の背景資源です）。</p>' : '<div class="grp">競争相手</div><p class="note">なし。選んだ生き物だけが計算されています。</p>') +
      `<div class="grp">背景の生態系（選ばれなかった多数の生き物）</div><p class="note">選ばれなかった生き物は個別には計算せず、植物資源と獲物という背景に簡略化しています。種数や背景の個体数は計算していないので、数字は出しません。</p>` +
      kv([['獲物の残り（容量比）', Math.round(bg.preyFraction * 100) + '%'], ['植物資源（区画平均）', bg.plantResource.toFixed(1)]]) +
      '<div class="grp">集団全体</div>' + kv([
      ['個体数（全系統）', st.population], ['平均寿命（死亡した個体）', st.meanLifespan ? st.meanLifespan.toFixed(1) + ' ステップ' : '-'], ['現在の平均年齢', st.meanAge.toFixed(1)],
      ['平均エネルギー', st.meanEnergy.toFixed(2)], ['誕生／死亡（累計）', `${st.births} ／ ${st.deaths}`], ['捕獲した獲物（累計）', st.catches],
      ['代謝の平均', game.series.length ? game.series[game.series.length - 1].traits[0].toFixed(2) : '-'],
      ['行動の割合（休眠/待機/探索/狩り/修復）', st.modes.slice(0, 5).map((v) => Math.round((v / tot) * 100) + '%').join(' '), 1], ['死因（累計）', tc, 1]]);
    wrapVisual('stat', S31() ? statVisual31() : statVisual(), (S31() ? countsHtml31() : '') + statDet); drawBackground();
  }
  function drawTrait() {
    if (game.v2) { drawEvolution(); return; }
    if (!game.series.length) return; const cur = game.series[game.series.length - 1].traits, first = startTraits || cur;
    $('tab-trait').innerHTML = '<p class="note">いまの集団の平均値（開始時からの変化）。項目をタップすると推移グラフに出ます。</p>' + G.KEY_TRAITS.map((k, i) => {
      const [, mn, mx] = E.TRAITS[E.TRAITS.findIndex((l) => l[0] === k)], d = cur[i] - first[i];
      return `<div data-m="${k}"><div class="tr"><span>${G.TRAIT_JA[k]}</span><span>${cur[i].toFixed(2)} <span class="d">(${d >= 0 ? '+' : ''}${d.toFixed(2)})</span></span></div><div class="bar"><div style="width:${Math.round(((cur[i] - mn) / (mx - mn)) * 100)}%"></div></div></div>`;
    }).join('');
    $('tab-trait').querySelectorAll('[data-m]').forEach((el) => { el.onclick = () => { metric = el.dataset.m; document.querySelector('#tabs [data-tab=graph]').click(); }; });
  }
  // What evolved, per lineage: the change since each lineage was first seen, in words, set beside the outcomes of the same period.
  function drawEvolution() {
    const rep = game.evolutionReport(); if (!rep.length) { $('tab-trait').innerHTML = '<p class="note">観察を始めたばかりです。</p>'; return; }
    const evoHtml = '<p class="note">各系統を最初に観察したときの平均値と比べた変化です。<b>変化と生存結果は並べて示しているだけで、変化が結果の原因かどうかは検証していません。</b></p>' + rep.map((e) => {
      const ch = e.rows.filter((r) => r.changed), cg = e.cognition;
      return `<div class="evo"><h4><i style="color:${e.color}">${e.role === 'focus' ? '●' : '■'}</i> ${e.name}${e.role === 'rival' ? '（競争相手）' : e.role === 'immigrant' ? '（移入）' : ''}　<small>${e.alive}体</small></h4>` +
        (ch.length ? ch.map((r) => `<div class="chg">${r.delta > 0 ? '＋' : '－'} <b>${r.text}</b>（${r.from.toFixed(2)}→${r.to.toFixed(2)}）</div>`).join('') : '<div class="chg na">大きな形質の変化はまだありません。</div>') +
        `<div class="chg" style="margin-top:4px">同じ期間：個体数 ${e.outcome.populationThen === null ? '-' : e.outcome.populationThen}→${e.outcome.populationNow}、累計の出生 ${e.outcome.birthsTotal}／死亡 ${e.outcome.deathsTotal}${e.outcome.topCause ? `、死因の最多は${CAUSE_JA[e.outcome.topCause.cause] || e.outcome.topCause.cause}（${Math.round(e.outcome.topCause.share * 100)}%）` : ''}</div>` +
        `<div class="chg">認知・学習の指標：<b>${cg.index === null ? '-' : cg.index.toFixed(2)}</b>（最初 ${cg.base.toFixed(2)}）<small>＝${cg.parts}。知能そのものの測定ではありません</small></div>` +
        `<div class="chg na">社会性・情報共有：未計算（エンジンに無い）　ミーム（文化・技術）への依存度：未計算（文明モデルは後の段階）　陣営：ゲノム側（自己の遺伝的な適応が中心）</div></div>`;
    }).join('');
    wrapVisual('trait', S31() ? traitVisual31() : traitVisual(), evoHtml); if (S31()) drawTrail31();
  }
  const ch = $('chart'), cc = ch.getContext('2d');
  function drawChart() {
    const [W, H] = fit(ch, cc); cc.clearRect(0, 0, W, H); const S = game.series; if (S.length < 2) { cc.fillStyle = '#8fa3b8'; cc.fillText('データを集めています…', 10, 20); return; }
    const mi = G.KEY_TRAITS.indexOf(metric); let lines = [], label = '';
    if (metric === 'pop') { label = '個体数'; lines = [{ c: '#e6edf5', v: S.map((s) => s.pop) }]; if (game.creatures.length > 1) game.creatures.forEach((c, i) => lines.push({ c: c.color, v: S.map((s) => s.lin[i]) })); }
    else if (metric === 'cog') { label = '認知・学習の指標（系統別・0〜1の合成指標）'; game.creatures.forEach((c, i) => { if (S.some((x) => x.cog && x.cog[i] !== null)) lines.push({ c: c.color, v: S.map((x) => (x.cog && x.cog[i] !== null ? x.cog[i] : NaN)) }); }); if (!lines.length) lines = [{ c: '#888', v: S.map(() => 0) }]; }
    else if (metric === 'prey') { label = '獲物の残り（容量比）'; lines = [{ c: '#46c28a', v: S.map((s) => s.prey) }]; }
    else { label = G.TRAIT_JA[metric] + '（平均）'; lines = [{ c: '#4fa3ff', v: S.map((s) => s.traits[mi]) }]; }
    let mn = Infinity, mx = -Infinity; for (const l of lines) for (const v of l.v) { if (v < mn) mn = v; if (v > mx) mx = v; } if (mx - mn < 1e-9) { mx += 1; mn -= 1; } if (metric === 'pop') mn = 0;
    const L = 38, B = 18, T = 8, R = 6, t0 = S[0].t, t1 = S[S.length - 1].t || 1; cc.strokeStyle = '#243548'; cc.fillStyle = '#8fa3b8'; cc.font = '11px system-ui'; cc.lineWidth = 1;
    for (let k = 0; k <= 3; k++) { const y = T + ((H - T - B) * k) / 3; cc.beginPath(); cc.moveTo(L, y); cc.lineTo(W - R, y); cc.stroke(); const v = mx - ((mx - mn) * k) / 3; cc.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2), 2, y + 4); }
    cc.fillText(t0 + '', L, H - 4); cc.fillText(t1 + ' ステップ', W - 70, H - 4);
    for (const l of lines) { cc.strokeStyle = l.c; cc.lineWidth = 2; cc.beginPath(); let pen = false; l.v.forEach((v, i) => { if (!isFinite(v)) { pen = false; return; } const x = L + ((S[i].t - t0) / Math.max(1, t1 - t0)) * (W - L - R), y = T + (1 - (v - mn) / (mx - mn)) * (H - T - B); if (pen) cc.lineTo(x, y); else { cc.moveTo(x, y); pen = true; } }); cc.stroke(); }
    $('chart-note').innerHTML = `<div class="chips" id="metrics"></div><div style="margin-top:6px">${label}</div>`;
    const wrap = $('metrics'); [['pop', '個体数'], ['prey', '獲物'], ...(game.v2 ? [['cog', '認知指標']] : []), ...G.KEY_TRAITS.map((k) => [k, G.TRAIT_JA[k]])].forEach(([k, n]) => { const b = document.createElement('button'); b.className = 'chip' + (k === metric ? ' on' : ''); b.textContent = n; b.onclick = () => { metric = k; drawChart(); }; wrap.appendChild(b); });
  }
  function drawLog() {
    wrapVisual('log', logVisual(), game.events.slice().reverse().slice(0, 150).map((e) => `<div class="ev ${e.kind}"><small>${e.y !== undefined ? fmtY(e.y) + '後／' : ''}${e.t}ステップ／約${e.gen}世代</small>${evIcon(e)} ${e.text}</div>`).join('') || '<p class="note">まだ出来事はありません。</p>', 'すべての出来事');
  }
  // The headline time is the elapsed time under an ASSUMED step length (uncalibrated), the era, and the cumulative generations. Steps are small print.
  function drawTimeline(ti) {
    const hi = game.historyInfo(), unit = hi ? 'day' : assume, a = TM.find(unit);
    const era = hi ? `年代：<b>${HS.formatYearsBP(HS.KPG_AGE_YEARS_BP)}</b>（K–Pg境界）＋ 約${hi.yearsSinceImpact.toFixed(1)}年` : `年代：自由開始（地球史とは対応させていません）`;
    $('timeline').innerHTML = `${era}　<small>内部 ${ti.steps.toLocaleString('ja-JP')}ステップ／${a.name}（仮定・未校正）</small><br><small>参考：世代×その時点の平均寿命 ≈ ${NUM(ti.lifespanReferenceSteps)}ステップ分 ≈ ${TM.format(ti.lifespanReferenceSteps, unit)}　<a href="#" id="why-time" style="color:var(--accent)">これは何？</a></small>`;
    const w = $('why-time'); if (w) w.onclick = (e) => { e.preventDefault(); openTimeInfo(); };
  }
  function openTimeInfo() {
    if (ADAPT()) { const card = $('modal-card'), p = playing; playing = false; setPP(); card.className = 'card'; card.innerHTML = `<h3>時間のしくみ</h3>${timeExplainHtml(game.worldInfo())}`; const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { $('modal').hidden = true; if (p && !game.pending && !game.checkpoint && !game.isOver) { playing = true; setPP(); } }; card.appendChild(b); $('modal').hidden = false; return; }
    const ti = game.timeInfo(), card = $('modal-card'), p = playing; playing = false; setPP();
    card.innerHTML = `<h3>時間の表示について</h3><div class="assume">この時間は<b>仮定</b>です。エンジンが数えているのは「ステップ」だけで、日・年への換算は<b>校正されていません</b>。下で選ぶ換算は、見やすくするための仮の目盛りです。</div>
      <p class="note">・経過：ステップ数に、選んだ仮定（${TM.find(assume).name}）を掛けた値。<br>・推定世代：各区間の平均世代時間（親が子を産んだときの年齢の平均）で、経過ステップを割って足し合わせた値。寿命が変わっても減りません。<br>・参考（世代×平均寿命）：各区間の世代の増分に、その区間の平均寿命を掛けて足した値。真の経過時間ではなく、世代と寿命の関係を見るための参考値です。<br>・現在の区間：世代時間 ${ti.windowGenerationTime ? ti.windowGenerationTime.toFixed(1) : '-'} ステップ／平均寿命 ${ti.windowLifespan ? ti.windowLifespan.toFixed(1) : '-'} ステップ。<br>・将来の長期設定では、開始は約6,600万年前の想定です。いまのステップとの対応は未校正で、この画面の値は6,600万年前からの経過年ではありません。</p>
      ${game.historyInfo() ? (() => { const sc = HS.scaleCheck(ti.windowLifespan || 0, ti.windowGenerationTime || 0); return `<div class="assume"><b>地球史モードの時間尺度（仮定）：</b>1ステップ=1日に固定されています。いまの区間では、平均寿命は約${Math.round(sc.lifespanDays)}日、世代時間は約${Math.round(sc.generationDays)}日に相当します。${sc.note}<br>6,600万年を1ステップずつ進めることは想定していません。時代を飛び越す粗い時間尺度は未実装です。</div>`; })() : ''}
      <select id="assume-sel"${game.historyInfo() ? ' disabled' : ''}>${TM.ASSUMPTIONS.map((a) => `<option value="${a.id}"${a.id === assume ? ' selected' : ''}>${a.name}（仮定）</option>`).join('')}</select>`;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { if (!game.historyInfo()) assume = $('assume-sel').value; saveSettings(); $('modal').hidden = true; if (p && !game.pending && !game.isOver) { playing = true; setPP(); } draw(true); }; card.appendChild(b);
    $('modal').hidden = false;
  }

  // ---------- habitat map (tab 環境) ----------
  const hc = $('habitat'), hx = hc.getContext('2d');
  let hRects = [], ov = ['none', 'lineage', 'individual'].includes(settings.ov) ? settings.ov : 'none', ovHist = settings.ovHist === 'hist' ? 'hist' : 'now', histT = null, selInd = null, lastEnvT = -1;
  let envLin = null, envBox = true, envDist = true;
  function drawHabitat3() {
    const [W, Hh] = fit(hc, hx); hx.clearRect(0, 0, W, Hh); const hab = game.habitatInfo(envLin !== null && game.live.stats().lineageAlive[envLin] > 0 ? envLin : game.controlled), wi = game.worldInfo(), gap = 8, pw = (W - gap) / 2, ph = (Hh - gap) / 2, st = game.live.stats();
    hRects = [];
    for (let slot = 0; slot < 4; slot++) {
      const p = REALM_OF_SLOT[slot], id = E.REALM_DEFS[p].id, ox = (slot % 2) * (pw + gap), oy = Math.floor(slot / 2) * (ph + gap), x = ox + 44, y = oy + 18, w = pw - 50, h = ph - 50;
      hx.fillStyle = REALM_COLOR[id]; hx.font = 'bold 12px system-ui'; hx.fillText(`${REALM_ICON[id]} ${E.REALM_DEFS[p].name}`, ox + 4, oy + 12);
      if (id === 'land') { hx.save(); drawLandBands(ox + 2, oy + 2, pw - 4, ph - 4, st, wi, hx); hx.restore(); } else tpMap(hx, x, y, w, h, hab, p, { showBox: envBox, showDist: envDist });
    }
  }
  function drawHabitat() {
    if (STAGE3()) return drawHabitat3();
    const [W, Hh] = fit(hc, hx); hx.clearRect(0, 0, W, Hh); hRects = [];
    const gap = 6, cols = hv.split ? 2 : 1, rows = hv.split ? 2 : 1, pw = (W - gap * (cols - 1)) / cols, ph = (Hh - gap * (rows - 1)) / rows;
    const small = hv.split, ml = small ? 38 : 48, mb = small ? 24 : 32, mt = small ? 16 : 8, mr = 6, panels = hv.split ? [0, 1, 2, 3].map((slot) => [H.REALMS[REALM_OF_SLOT[slot]]]) : [H.REALMS];
    panels.forEach((rl, k) => {
      const ox = (k % cols) * (pw + gap), oy = Math.floor(k / cols) * (ph + gap), px0 = ox + ml, py0 = oy + mt, w = pw - ml - mr, h = ph - mt - mb, realmId = hv.split ? rl[0].id : null;
      const rg = H.panelRange(hv, realmId || 'land'), layered = hv.split && realmId === 'land'; hRects.push({ x: px0, y: py0, w, h, realmId });
      hx.save(); hx.fillStyle = '#0d1520'; hx.fillRect(px0, py0, w, h); hx.beginPath(); hx.rect(px0, py0, w, h); hx.clip();
      const X = (T) => H.project(T, rg.xr, hv.xScale, w, hv.xRev, false), Y = (P) => H.project(P, rg.yr, hv.yScale, h, hv.yRev, true);
      hx.strokeStyle = '#223348'; hx.lineWidth = 1; hx.fillStyle = '#7f93a8';
      const xt = H.ticks(rg.xr[0], rg.xr[1], hv.xScale, hv.xUnit, small ? 3 : 5), yt = layered ? [] : H.ticks(rg.yr[0], rg.yr[1], hv.yScale, 'K', small ? 3 : 5);
      for (const t of xt) { const x = X(t); if (x === null) continue; hx.beginPath(); hx.moveTo(px0 + x, py0); hx.lineTo(px0 + x, py0 + h); hx.stroke(); }
      for (const t of yt) { const y = Y(t); if (y === null) continue; hx.beginPath(); hx.moveTo(px0, py0 + y); hx.lineTo(px0 + w, py0 + y); hx.stroke(); }
      if (!layered) for (const r of rl) {
        const x1 = X(r.T[0]), x2 = X(r.T[1]), y1 = Y(r.P[0]), y2 = Y(r.P[1]); if ([x1, x2, y1, y2].some((v) => v === null)) continue;
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        hx.globalAlpha = 0.18; hx.fillStyle = r.color; hx.fillRect(px0 + rx, py0 + ry, rw, rh); hx.globalAlpha = 1; hx.strokeStyle = r.color; hx.lineWidth = 1.5; hx.strokeRect(px0 + rx, py0 + ry, rw, rh);
        hx.fillStyle = r.color; hx.font = 'bold ' + (small ? 10 : 12) + 'px system-ui'; hx.fillText(r.name, px0 + Math.max(rx, 0) + 4, py0 + Math.max(ry, 0) + (small ? 11 : 14) + (small ? 0 : H.REALMS.indexOf(r) * 14));
      }
      if (layered) drawLandLayers(px0, py0, w, h, X, small); else if (ov !== 'none') drawOverlay(px0, py0, X, Y, small);
      const rx = X(H.REFERENCE.T), ry = Y(H.REFERENCE.P);
      hx.setLineDash([4, 3]); hx.strokeStyle = '#ffffff'; hx.globalAlpha = 0.75; hx.lineWidth = 1;
      if (rx !== null) { hx.beginPath(); hx.moveTo(px0 + rx, py0); hx.lineTo(px0 + rx, py0 + h); hx.stroke(); }
      if (ry !== null && !layered) { hx.beginPath(); hx.moveTo(px0, py0 + ry); hx.lineTo(px0 + w, py0 + ry); hx.stroke(); }
      hx.setLineDash([]); hx.globalAlpha = 1;
      if (rx !== null && ry !== null && !layered) { hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(px0 + rx, py0 + ry, 3.5, 0, 6.2832); hx.fill(); hx.font = (small ? 9 : 11) + 'px system-ui'; hx.fillText('基準', px0 + Math.min(rx + 6, w - 28), py0 + Math.max(ry - 5, 10)); }
      if (hv.split && !layered) { // where the display-assumption corners lie, whichever way the axes are turned (a sketch: real realms overlap widely)
        const hotLeft = hv.xRev, highBottom = hv.yRev; hx.font = (small ? 9 : 10) + 'px system-ui'; hx.fillStyle = rl[0].color; hx.globalAlpha = 0.9;
        if (realmId === 'air') { hx.textAlign = 'center'; hx.fillText(highBottom ? '↑ 宇宙側（低圧）' : '宇宙側（低圧）↓', px0 + w / 2, highBottom ? py0 + 24 : py0 + h - 6); }
        else if (realmId === 'underground') { hx.textAlign = hotLeft ? 'left' : 'right'; hx.fillText('高温・高圧：地殻深部', hotLeft ? px0 + 4 : px0 + w - 4, highBottom ? py0 + h - 6 : py0 + 24); }
        else if (realmId === 'water') { hx.textAlign = hotLeft ? 'right' : 'left'; hx.fillText('低温・高圧：深海', hotLeft ? px0 + w - 4 : px0 + 4, highBottom ? py0 + h - 6 : py0 + 24); }
        hx.globalAlpha = 1; hx.textAlign = 'left';
      }
      hx.restore();
      hx.fillStyle = '#7f93a8'; hx.font = (small ? 9 : 10) + 'px system-ui'; hx.textAlign = 'center';
      for (const t of xt) { const x = X(t); if (x === null || x < -1 || x > w + 1) continue; hx.fillText(H.formatTick(t, hv.xScale, 'x', hv.xUnit), px0 + x, py0 + h + 12); }
      hx.textAlign = 'right';
      for (const t of yt) { const y = Y(t); if (y === null || y < -1 || y > h + 1) continue; hx.fillText(H.formatTick(t, hv.yScale, 'y', 'K'), px0 - 3, py0 + y + 3); }
      hx.textAlign = 'center'; hx.fillText(`温度 (${hv.xUnit === 'C' ? '℃' : 'K'}${hv.xScale === 'log' ? '・対数' : ''}) ${hv.xRev ? '左=高温' : '右=高温'}`, px0 + w / 2, py0 + h + (small ? 22 : 28));
      hx.save(); hx.translate(ox + 9, py0 + h / 2); hx.rotate(-Math.PI / 2); hx.fillText(layered ? '行動・情報処理の層（上=社会的知性）' : `圧力 Pa${hv.yScale === 'log' ? '・対数' : ''} ${hv.yRev ? '上=低圧' : '上=高圧'}`, 0, 0); hx.restore(); hx.textAlign = 'left';
      if (small) { hx.fillStyle = rl[0].color; hx.font = 'bold 10px system-ui'; hx.fillText(rl[0].name, px0, oy + 11); }
    });
  }
  // The land panel's vertical axis is three layers of behavioural / information-processing ability instead of pressure.
  // Instinct and individual intelligence are COMPUTED from traits (see game.individualScores); social intelligence is NOT computed, so that band is
  // hatched and empty. Each land individual appears once in each computed band (filled mark, then a ring), so marks overlap on purpose. The horizontal
  // position is not a temperature: individual temperatures are not computed, so marks sit at the realm's representative temperature, spread for legibility.
  function drawLandLayers(px0, py0, w, h, X, small) {
    const bh = h / 3, names = ['社会的知性（未計算）', '個体知能 ✔計算済み', '生存本能 ✔計算済み'], cx0 = X(AD.realmCentre(H.REALMS[1]).T);
    for (let k = 0; k < 3; k++) {
      const y0 = py0 + k * bh; hx.globalAlpha = k % 2 ? 0.1 : 0.05; hx.fillStyle = '#46c28a'; hx.fillRect(px0, y0, w, bh); hx.globalAlpha = 1;
      if (k === 0) { hx.strokeStyle = '#46607a'; hx.lineWidth = 1; for (let d = -bh; d < w; d += 8) { hx.beginPath(); hx.moveTo(px0 + d, y0 + bh); hx.lineTo(px0 + d + bh, y0); hx.stroke(); } }
      hx.strokeStyle = '#2c3f55'; hx.beginPath(); hx.moveTo(px0, y0); hx.lineTo(px0 + w, y0); hx.stroke();
      hx.fillStyle = k === 0 ? '#7f93a8' : '#46c28a'; hx.font = 'bold ' + (small ? 9 : 11) + 'px system-ui'; hx.fillText(names[k], px0 + 4, y0 + (small ? 11 : 13));
    }
    const ind = game.live.individuals().filter((x) => x.patch === 1);
    for (const x of ind) {
      const sc = game.individualScores(x), c = game.creatures[x.lin], rect = game.roleOf(x.lin) !== 'focus', jx = px0 + (cx0 === null ? w / 2 : cx0) + (hash(x.id, 3) - 0.5) * w * 0.35;
      for (const [k, v, ring] of [[2, sc.instinct, false], [1, sc.intelligence, true]]) {
        const y = py0 + (k + 1) * bh - 3 - v * (bh - 6), r = small ? 2.4 : 3; hx.beginPath(); if (rect) hx.rect(jx - r, y - r, r * 2, r * 2); else hx.arc(jx, y, r, 0, 6.2832);
        if (ring) { hx.strokeStyle = c.color; hx.lineWidth = 1.4; hx.stroke(); } else { hx.globalAlpha = 0.85; hx.fillStyle = c.color; hx.fill(); hx.globalAlpha = 1; }
      }
    }
    hx.setLineDash([4, 3]); hx.strokeStyle = '#fff'; hx.globalAlpha = 0.5; if (cx0 !== null) { hx.beginPath(); hx.moveTo(px0 + cx0, py0); hx.lineTo(px0 + cx0, py0 + h); hx.stroke(); } hx.setLineDash([]); hx.globalAlpha = 1;
    hx.fillStyle = '#7f93a8'; hx.font = (small ? 8 : 10) + 'px system-ui'; hx.textAlign = 'center'; hx.fillText('横：代表温度に揃えて配置（個体の温度は未計算）', px0 + w / 2, py0 + h - 3); hx.textAlign = 'left';
  }
  // Overlay of adaptation ranges. The provider is a PLACEHOLDER (adaptation.js): not linked to genomes or to the simulation.
  function rangeBox(rg, X, Y) { const x1 = X(rg.T[0]), x2 = X(rg.T[1]), y1 = Y(rg.P[0]), y2 = Y(rg.P[1]); if ([x1, x2, y1, y2].some((v) => v === null)) return null; return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }; }
  function snapAt(t) { const S = game.rangeSnapshots; let best = null; for (const s of S) if (s.t <= t) best = s; return best || S[0] || null; }
  function drawOverlay(px0, py0, X, Y, small) {
    const seed = game.cfg.seed, step = game.t, P = game.adaptationProvider;
    const one = (r, color, o) => {
      const a = rangeBox(r.active, X, Y), d = rangeBox(r.dormant, X, Y);
      if (d && o.dormant !== false) { hx.setLineDash([5, 3]); hx.strokeStyle = color; hx.lineWidth = 1; hx.globalAlpha = o.alpha * 0.9; hx.strokeRect(px0 + d.x, py0 + d.y, d.w, d.h); hx.setLineDash([]); }
      if (a) { if (o.fill) { hx.globalAlpha = 0.12; hx.fillStyle = color; hx.fillRect(px0 + a.x, py0 + a.y, a.w, a.h); } hx.globalAlpha = o.alpha; hx.strokeStyle = color; hx.lineWidth = o.width; hx.strokeRect(px0 + a.x, py0 + a.y, a.w, a.h); if (o.label && !small) { hx.globalAlpha = 1; hx.fillStyle = color; hx.font = '10px system-ui'; hx.fillText(o.label, px0 + a.x + 3, py0 + a.y + a.h - 4); } }
      hx.globalAlpha = 1;
    };
    const hist = ovHist === 'hist', S = game.rangeSnapshots, pick = [];
    if (hist) { const n = Math.min(10, S.length); for (let k = 0; k < n; k++) pick.push(S[Math.floor((k * (S.length - 1)) / Math.max(1, n - 1))]); }
    const sel = hist && histT !== null ? snapAt(histT) : null;
    if (ov === 'lineage') {
      game.lineageReport().forEach((l) => {
        const i = l.lin, c = game.creatures[i], focus = l.role === 'focus';
        if (hist) pick.forEach((sn, k) => { const r = sn.lineages[i]; if (r) one(r, c.color, { alpha: 0.08 + 0.3 * (k / Math.max(1, pick.length - 1)), width: 1, fill: false, dormant: false }); });
        if (sel && sel.lineages[i]) one(sel.lineages[i], c.color, { alpha: 1, width: 2.6, fill: true, label: focus ? `t=${sel.t}` : '' });
        one(P.lineageRange(i, seed, step), c.color, { alpha: sel ? 0.55 : 1, width: focus ? 2.2 : 1.2, fill: !sel, label: focus ? c.name : c.name + '（相手）' });
      });
    } else if (ov === 'individual') {
      const ind = currentInd(); if (!ind) return; const c = game.creatures[ind.lin], born = step - ind.age;
      if (hist) pick.filter((sn) => sn.t >= born).forEach((sn, k, a) => one(P.individualRange(ind.id, ind.lin, seed, sn.t), c.color, { alpha: 0.1 + 0.3 * (k / Math.max(1, a.length - 1)), width: 1, fill: false, dormant: false }));
      if (sel && sel.t >= born) one(P.individualRange(ind.id, ind.lin, seed, sel.t), c.color, { alpha: 1, width: 2.6, fill: true, label: `t=${sel.t}` });
      one(P.individualRange(ind.id, ind.lin, seed, step), c.color, { alpha: sel ? 0.55 : 1, width: 2.4, fill: !sel, label: `#${ind.id}` });
      if (game.cfg.realms) { const rl = H.REALMS[ind.patch], ctr = AD.realmCentre(rl), mx = X(ctr.T), my = Y(ctr.P); if (mx !== null && my !== null) { hx.fillStyle = '#fff'; hx.strokeStyle = c.color; hx.lineWidth = 2; hx.beginPath(); hx.arc(px0 + mx, py0 + my, 4.5, 0, 6.2832); hx.fill(); hx.stroke(); if (!small) { hx.fillStyle = '#fff'; hx.font = '10px system-ui'; hx.fillText(`現在: ${rl.name}（領域の仮定値）`, px0 + Math.min(mx + 7, 120), py0 + Math.max(my - 6, 12)); } } }
    }
    hx.fillStyle = '#f2a03d'; hx.font = 'bold 10px system-ui'; hx.fillText('ダミー表示', px0 + 4, py0 + (small ? 22 : 12));
  }
  function currentInd() { const list = game.live.individuals(); if (!list.length) return null; return list.find((x) => x.id === selInd) || list.find((x) => game.roleOf(x.lin) === 'focus') || list[0]; }
  const REASON_JA = { interval: '一定間隔', branch: '分岐点', disaster: '災害', crisis: '存続の危機', lineage: '系統の変化', scenario: 'シナリオ', immigration: '背景からの移入', player: '介入' };
  function renderOverlayControls() {
    const m = $('ov-modes'); m.innerHTML = '<span class="note">生命の重ね描き：</span>';
    const chip = (host, label, on, fn) => { const b = document.createElement('button'); b.className = 'chip' + (on ? ' on' : ''); b.textContent = label; b.onclick = fn; host.appendChild(b); };
    for (const [id, n] of [['none', 'なし'], ['lineage', '系統'], ['individual', '個体']]) chip(m, n, ov === id, () => { ov = id; saveSettings(); renderOverlayControls(); drawHabitat(); });
    const d = $('ov-detail'); d.innerHTML = '';
    if (ov !== 'none') {
      const t = document.createElement('div'); t.className = 'chips'; t.innerHTML = '<span class="note">表示：</span>'; chip(t, '現在のみ', ovHist === 'now', () => { ovHist = 'now'; histT = null; saveSettings(); renderOverlayControls(); drawHabitat(); }); chip(t, '履歴', ovHist === 'hist', () => { ovHist = 'hist'; saveSettings(); renderOverlayControls(); drawHabitat(); }); d.appendChild(t);
    }
    if (ov === 'individual') {
      const list = game.live.individuals().slice().sort((a, b) => a.lin - b.lin || a.id - b.id).slice(0, 60), cur = currentInd(); selInd = cur ? cur.id : null;
      const sel = document.createElement('select'); sel.innerHTML = list.map((x) => `<option value="${x.id}"${cur && x.id === cur.id ? ' selected' : ''}>#${x.id} ${game.creatures[x.lin].name}${game.cfg.realms ? '／' + E.REALM_DEFS[x.patch].name : ''}／年齢${x.age}</option>`).join('');
      sel.onchange = () => { selInd = Number(sel.value); drawHabitat(); }; d.appendChild(sel);
    }
    if (ov !== 'none' && ovHist === 'hist') {
      const S = game.rangeSnapshots, wrap = document.createElement('div'), cur = histT === null ? game.t : histT;
      wrap.innerHTML = `<input class="sl" id="hist-slider" type="range" min="0" max="${Math.max(25, game.t)}" step="1" value="${Math.min(cur, Math.max(25, game.t))}"><div class="note" id="hist-label"></div>`; d.appendChild(wrap);
      const lab = () => { const sn = snapAt(histT === null ? game.t : histT); $('hist-label').textContent = sn ? `時刻 ${histT === null ? game.t : histT}ステップ／いちばん近い過去の記録：${sn.t}ステップ（${REASON_JA[sn.reason] || sn.reason}）／記録 ${S.length}件（100ステップごと＋重要な出来事）` : '記録がまだありません'; };
      $('hist-slider').oninput = (e) => { const v = Number(e.target.value); histT = v >= game.t ? null : v; lab(); drawHabitat(); }; lab();
    }
    d.insertAdjacentHTML('beforeend', ov === 'none' ? '' : `<div class="ovbadge">⚠ ${game.adaptationProvider.label}。範囲は乱数の種と時刻だけから決まる仮の動きで、ゲノムや生存・進化の計算とは無関係です。実線＝活動可能／破線＝休眠すれば生存可能／それ以外＝生存不能（いずれもダミー）。履歴は「一定間隔＋重要な出来事」のときに記録した、その時点のダミーの輪郭です。${ov === 'individual' ? '白い点は、その個体がいる領域の表示用の代表値です。' : ''}</div>`);
  }
  function renderEnv3() {
    const modes = $('env-modes'); modes.innerHTML = '<span class="note">どの系統の適応可能領域（箱）を見るか：</span>'; $('ov-modes').innerHTML = ''; $('ov-detail').innerHTML = ''; $('env-tools').innerHTML = '';
    const cur = envLin !== null ? envLin : game.controlled;
    game.lineageReport().filter((l) => l.alive > 0).forEach((l) => { const b = document.createElement('button'); b.className = 'chip' + (cur === l.lin ? ' on' : ''); b.textContent = l.name; b.onclick = () => { envLin = l.lin; renderEnv3(); drawHabitat3(); }; modes.appendChild(b); });
    const t = $('env-tools'); [['適応可能領域（箱）', () => envBox, () => { envBox = !envBox; }], ['実際の分布（点）', () => envDist, () => { envDist = !envDist; }]].forEach(([n, get, flip]) => { const b = document.createElement('button'); b.textContent = n; if (get()) b.className = 'on'; b.onclick = () => { flip(); renderEnv3(); drawHabitat3(); }; t.appendChild(b); });
  }
  function renderEnvControls() {
    if (STAGE3()) { renderEnv3(); return; }
    renderOverlayControls();
    const modes = $('env-modes'); modes.innerHTML = '';
    for (const [sp, n] of [[true, '4分割'], [false, '統合']]) { const b = document.createElement('button'); b.className = 'chip' + (hv.split === sp ? ' on' : ''); b.textContent = n; b.onclick = () => { hv = { ...hv, split: sp }; saveSettings(); renderEnvControls(); drawHabitat(); }; modes.appendChild(b); }
    modes.insertAdjacentHTML('beforeend', '<span class="note">軸範囲：</span>');
    for (const [m, n] of [['per', '領域別'], ['common', '共通']]) { const b = document.createElement('button'); b.className = 'chip' + (hv.rangeMode === m ? ' on' : ''); b.textContent = n; b.onclick = () => { hv = { ...hv, rangeMode: m }; saveSettings(); renderEnvControls(); drawHabitat(); }; modes.appendChild(b); }
    const t = $('env-tools'); t.innerHTML = '';
    const add = (label, on, fn, dis) => { const b = document.createElement('button'); b.textContent = label; if (on) b.className = 'on'; if (dis) b.disabled = true; b.onclick = () => { fn(); hv = { ...hv }; saveSettings(); renderEnvControls(); drawHabitat(); }; t.appendChild(b); };
    add('温度 ℃', hv.xUnit === 'C', () => { hv = H.setUnit(hv, 'C'); if (hv.xScale === 'log') toast('℃では対数にできません'); });
    add('温度 K', hv.xUnit === 'K', () => { hv = H.setUnit(hv, 'K'); });
    add('横 線形', hv.xScale === 'linear', () => { hv = H.setScale(hv, 'x', 'linear'); });
    add('横 対数(K)', hv.xScale === 'log', () => { const u = hv.xUnit; hv = H.setScale(hv, 'x', 'log'); if (u === 'C') toast('対数はケルビンで表示します'); });
    add('縦 線形', hv.yScale === 'linear', () => { hv = H.setScale(hv, 'y', 'linear'); });
    add('縦 対数', hv.yScale === 'log', () => { hv = H.setScale(hv, 'y', 'log'); });
    add('横を反転', hv.xRev, () => { hv = { ...hv, xRev: !hv.xRev }; });
    add('縦を反転', hv.yRev, () => { hv = { ...hv, yRev: !hv.yRev }; });
    add('全体表示', false, () => { hv = H.resetView(hv); });
    add('初期設定に戻す', false, () => { hv = H.defaultView(); });
  }
  function drawEnvNote() {
    if (STAGE3()) { const h = game.habitatInfo(), nm = game.creatures[h.controlled].name; $('env-note').innerHTML = `<div class="assume"><b>これは進化の計算とつながっています。</b>${h.note}</div><div class="note">左＝高温・右＝低温、上＝低圧・下＝高圧。地上は圧力ではなく3層（下＝生存本能、中＝個体の学習・判断、上＝文明）で表します。層は価値の序列ではなく、同じ生物が複数の層に分布します。<br>緑の点＝${nm}が暮らせる場所、赤＝損傷を受ける場所。四角＝${nm}の適応可能領域（点線は休眠中）。気候が変わると柱が動き、暮らせる場所が縮んだり分かれたりします。</div>`; return; }
    const st = game.live.stats(), tol = game.series.length ? game.series[game.series.length - 1].traits[3] : null;
    $('env-note').innerHTML = `<div class="assume"><b>この四角は「表示用の仮定」です。</b>現在の地球の概数を置いたもので、エンジンの値ではありません。白い点線と「基準」は、地球地表の全球平均気温15℃（288.15 K）と1気圧（101325 Pa）。標準は、横＝温度の対数（<b>左が高温、右が低温</b>）、縦＝圧力の対数（上が低圧、下が高圧）です。<b>地上の四角だけは縦軸が圧力ではなく、行動・情報処理の3層</b>です（地上の圧力は内部に残しています）。空中側は宇宙環境、地中側は高温・高圧の地殻深部、水中側は低温・高圧の深海を意識した模式図で、<b>現実の空中・地中・水中の環境は広く重なり合っています</b>。地図の上をなぞると移動、2本指（またはホイール）で拡大できます。</div>
      <p class="note"><b>計算しているもの：</b>4つの領域ごとの個体数と領域間の移動（状況タブ）。領域は食料・獲物・熱ストレス・病気の強さが違うゲーム上の設定です。熱ストレス指標 ${st.thermal.toFixed(2)}（0〜1の無次元量で、温度ではありません）／集団の耐性の平均 ${tol === null ? '-' : tol.toFixed(2)}。<br><b>まだ計算していないもの：</b>温度・圧力・酸素・水分・重力そのもの、生き物ごとの適応範囲（重ね描きと履歴はダミー）。種分化・交雑は後のステージで実装します（いまは未実装です）。</p>`;
  }
  // pan / zoom on the map (per panel when ranges are per realm)
  const pts = new Map(); let pinch = null;
  function panelAt(x, y) { return hRects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || hRects[0]; }
  function applyPan(dx, dy, r) {
    const rg = H.panelRange(hv, r.realmId || 'land'), fx = (hv.xRev ? 1 : -1) * dx / r.w, fy = (hv.yRev ? -1 : 1) * dy / r.h;
    hv = H.setPanelRange(hv, r.realmId || 'land', H.panRange(rg.xr, hv.xScale, fx), H.panRange(rg.yr, hv.yScale, fy));
  }
  function applyZoom(factor, cx0, cy0, r) {
    const rg = H.panelRange(hv, r.realmId || 'land'), ax = hv.xRev ? 1 - (cx0 - r.x) / r.w : (cx0 - r.x) / r.w, ay = hv.yRev ? (cy0 - r.y) / r.h : 1 - (cy0 - r.y) / r.h;
    hv = H.setPanelRange(hv, r.realmId || 'land', H.zoomRange(rg.xr, hv.xScale, factor, Math.min(1, Math.max(0, ax))), H.zoomRange(rg.yr, hv.yScale, factor, Math.min(1, Math.max(0, ay))));
  }
  hc.addEventListener('pointerdown', (e) => { hc.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  hc.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return; const nx = e.offsetX, ny = e.offsetY;
    if (pts.size === 1) { applyPan(nx - p.x, ny - p.y, panelAt(p.x, p.y)); }
    else if (pts.size === 2 && pinch) { pts.set(e.pointerId, { x: nx, y: ny }); const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (d > 4) { applyZoom(pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2, panelAt((a.x + b.x) / 2, (a.y + b.y) / 2)); pinch = d; } }
    pts.set(e.pointerId, { x: nx, y: ny }); drawHabitat();
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = null; saveSettings(); };
  hc.addEventListener('pointerup', up); hc.addEventListener('pointercancel', up);
  hc.addEventListener('wheel', (e) => { e.preventDefault(); applyZoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY, panelAt(e.offsetX, e.offsetY)); drawHabitat(); saveSettings(); }, { passive: false });
  let envShown = false;
  let logN = -1;

  // ---------- rank (α → Ω), individuals, checkpoints, fast-forward to the next event ----------
  const RANK_NOTE = 'ランクは、能力の合計や知能の高さではなく、個体が自力で長く生き続ける力から判定する<b>暫定の判定</b>です。判定できる範囲だけを使い、未実装の能力は採点していません。';
  function drawRankbar() {
    const rk = game.rank, cur = rk.current, best = rk.best;
    $('rankbar').innerHTML = `<span class="rk">${cur ? cur.rank : '？'}</span><span>ランク（現在・暫定）　<small>過去最高 <b>${best ? best.rank : '—'}</b>${cur ? '' : '／判定中または個体が少なすぎます'}　Ω：判定未実装</small></span>`;
  }
  function tierBar(t) { return '<div class="tierbar">' + [1, 2, 3, 4].map((k) => `<i class="${t !== null && t >= k ? 'on' : ''}"></i>`).join('') + '</div>'; }
  function fmtVal(a) { if (a.value === null) return a.why || '判定できません'; return a.id === 'efficiency' ? a.value.toFixed(3) : a.id === 'range' ? `${a.value}領域` : a.id === 'competition' ? `${NUM(a.value)}ステップ` : a.value.toFixed(a.id === 'repair' ? 3 : 2); }
  function drawRankTab() {
    const rk = game.rank, RKs = RKmod();
    let html = `<p class="note">${RANK_NOTE}</p><div class="rk-big">${rk.current ? rk.current.rank : '？'} <small style="font-size:14px;color:var(--dim)">現在 ／ 過去最高 ${rk.best ? rk.best.rank + `（${rk.best.t.toLocaleString('ja-JP')}ステップ）` : 'なし'}</small></div>`;
    html += `<p class="note">段階：${RKs.order.map((r) => `<b style="color:${rk.current && rk.current.rank === r ? 'var(--accent)' : rk.best && rk.best.rank === r ? 'var(--ok)' : 'var(--dim)'}">${r}</b>`).join(' → ')} → <b>Ω（判定未実装）</b></p>`;
    for (const l of rk.lineages) {
      html += `<div class="evo"><h4>${l.name}（注目系統）　${l.judged ? `ランク <span style="color:var(--accent)">${l.rank}</span>` : ''}</h4>`;
      if (!l.judged) { html += `<div class="chg na">${l.reason}</div></div>`; continue; }
      html += `<div class="chg"><b>この判定の理由：</b>${l.reason}</div>`;
      html += l.missing.length ? `<div class="chg"><b>次（${l.nextRank}）に足りない条件：</b>${l.missing.map((m) => `<div class="miss">・${m}</div>`).join('')}</div>` : (l.nextRank ? '' : '<div class="chg">判定できる範囲の最高に達しています（Ωは判定未実装です）。</div>');
      html += `<div class="axis"><b>連続生存期間</b>　段階${l.C}／5　<small>最長記録 ${l.metrics.continuity.toLocaleString('ja-JP')}ステップ（${RKs.CONTINUITY.unit}）</small>${tierBar(Math.min(4, l.C))}</div>`;
      for (const a of l.axes) html += `<div class="axis"><b>${a.name}</b>　${a.tier === null ? '<span class="na">判定できません</span>' : '段階' + a.tier}　<small>${fmtVal(a)}${a.next !== null && a.tier !== null ? `／次の段階：${a.better === 'low' ? '≤' : '≥'}${a.next}` : ''}</small><br><small>${a.unit}</small>${tierBar(a.tier)}</div>`;
      html += `<div class="axis na">採点していない軸：外部集団・技術への非依存（現在のエンジンでは全個体が自立していて区別できない）／温度・圧力の適応範囲（地図の範囲はダミーのため）／4領域より外の環境。<br>判定の窓：直近約${l.metrics.windowSteps.toLocaleString('ja-JP')}ステップ。能力が落ちると現在のランクは下がることがあります（過去最高は残ります）。</div></div>`;
    }
    html += `<p class="note">${RKs.OMEGA.text}</p>`;
    wrapVisual('rank', rankVisual(), html);
  }
  const RKmod = () => (typeof OmegaRank !== 'undefined' ? OmegaRank : null);
  let selId = null;
  function drawIndTab() {
    const top = game.topIndividuals(12), rec = game.records(), cur = top.find((x) => x.id === selId) || top[0]; selId = cur ? cur.id : null;
    let html = '<p class="note">細胞や器官が入れ替わっても、同じ個体として生き続けていれば年齢（連続生存期間）は続きます。個体ごとの数値は、エンジンが実際に計算している値です。</p><div class="grp">系統ごとの最長記録</div><table class="cmp"><tr><th>系統</th><th>生存中の最長</th><th>これまでの最長記録</th></tr>' + rec.map((r) => `<tr><td>${r.name}</td><td>${r.aliveNow}</td><td>${r.recordAge}</td></tr>`).join('') + '</table><p class="note">単位はステップ（時間尺度は未校正）。</p>';
    if (cur) {
      const sc = game.individualScores(cur), act = cur.age ? cur.active / cur.age : 0;
      html += `<div class="grp">個体を選ぶ（生存中で長生きの順）</div><select id="ind-sel">${top.map((x) => `<option value="${x.id}"${x.id === cur.id ? ' selected' : ''}>#${x.id} ${x.name}／${x.age}ステップ生存${game.cfg.realms ? '／' + E.REALM_DEFS[x.patch].name : ''}</option>`).join('')}</select>` +
        kv([['個体ID', '#' + cur.id], ['連続生存期間', cur.age.toLocaleString('ja-JP') + ' ステップ'], ['生まれた時刻', cur.born.toLocaleString('ja-JP') + ' ステップ'], ['いる領域', game.cfg.realms ? E.REALM_DEFS[cur.patch].name : '区画' + (cur.patch + 1)], ['いまの行動', MODE_JA[cur.eff] || MODE_JA[cur.mode]],
          ['損傷の蓄積', cur.damage.toFixed(2) + '（大きいほど死にやすい）'], ['元の細胞の割合', (cur.O * 100).toFixed(0) + '%（入れ替わっていない細胞）'], ['細胞を入れ替えた量', cur.P.toFixed(2) + '（増えるほど更新の効きが落ちる）'], ['活動していた割合', (act * 100).toFixed(0) + '%（残りは休眠）'],
          ['内部時間（代謝に応じた老化の時計）', cur.internal.toFixed(1)], ['エネルギー', cur.energy.toFixed(2)], ['狩り／捕獲', `${cur.hunts}／${cur.catches}`], ['感染した回数', cur.infections], ['記憶（元の細胞にある分）', cur.M.toFixed(2)], ['生んだ子の数', cur.births],
          ['生存本能の指標（計算済み）', sc.instinct.toFixed(2)], ['個体知能の指標（計算済み）', sc.intelligence.toFixed(2)], ['社会的知性', '未計算']]) +
        '<p class="note">個体内のゲノム変化（体細胞の変化）と、子に伝わる遺伝的な進化は区別して扱います。体細胞のゲノム変化はまだ実装していません。</p>';
    }
    wrapVisual('ind', indVisual(), html); const sel = $('ind-sel'); if (sel) sel.onchange = () => { selId = Number(sel.value); drawIndTab(); };
  }
  // checkpoint: a pause with a choice. No fixed end: the world and the ecosystem stay as they are when you continue.
  let cpShown = false;
  function showCheckpoint() {
    const c = game.checkpoint; if (!c || cpShown) return; cpShown = true; playing = false; skipping = null; setPP(); const autoSaved = putSave('auto'); // the milestone save
    const ti = game.timeInfo(), card = $('modal-card'), rk = game.rank, st = game.live.stats(); card.className = 'card cpmodal';
    metaSync(true);
    if (c.kind === 'present') card.innerHTML = `<h3>現代に着きました</h3><p class="note">ここまでは地球の歴史に沿った外部条件でした。これから先は未来史で、生き物にも文明にも決まった筋書きはありません。</p><div class="sumline">図鑑 <b>${game.codex().length}</b>件／偉業 <b>${game.feats().length}</b>件／生き残っている系統 <b>${game.live.stats().lineageAlive.filter((n) => n > 0).length}</b></div>`; else if (c.kind === 'omega') card.innerHTML = `<h3 class="omega-h">Ω</h3><p class="note"><b>${game.omega ? game.omega.name : ''}</b>が、自力で極めて長く存続する生命（Ωコドン）に到達しました。判定は、ランクθ・長い個体の生存・全ての能力軸・文明に頼らない自律・コドンの安定を、長く保ち続けたことによります。円盤の形ではありません。</p><div class="sumline">${game.omega ? bpText(game.omega.bp) : ''}</div>`; else
    if (['warning', 'catastrophe', 'aftermath', 'earth-ended'].includes(c.kind)) card.innerHTML = catCheckpointCard(c); else
    card.innerHTML = `<h3>${c.kind === 'focus-extinct' ? 'あなたが選んだ系統が絶えました' : '節目'}</h3><p class="note">${c.kind === 'focus-extinct' ? '敗北条件はまだ実装していません。観察は続けられます（競争相手や背景の生き物は、そのまま続きます）。' + (ADAPT() ? 'ほかに生き残っている系統があれば、画面の系統ボタンで操作する系統を切り替えられます（世界はリセットされません）。' : '') : `${ti.steps.toLocaleString('ja-JP')}ステップ（${game.historyInfo() ? 'K–Pg境界から約' + game.historyInfo().yearsSinceImpact.toFixed(0) + '年・仮定' : TM.format(ti.steps, assume) + '・仮定'}）に達しました。ここまでの様子を確認して、続けるか選べます。`}</p><p>累積世代 ${NUM(ti.generations)}／個体数 ${st.population}／ランク 現在 ${rk.current ? rk.current.rank : '—'}・過去最高 ${rk.best ? rk.best.rank : '—'}（暫定）</p>`;
    { const n = document.createElement('p'); n.className = 'note'; n.textContent = autoSaved ? '💾 この節目を「節目の自動保存」に保存しました。保存できるのは節目だけで、次の節目までの進行は、読み込むと失われます。' : '⚠ この節目は保存できませんでした（保存容量が足りない可能性があります）。次の節目までの進行は、読み込むと失われます。'; card.appendChild(n); }
    const mk = (t, f, cls) => { const b = document.createElement('button'); b.className = 'btn big ' + (cls || ''); b.textContent = t; b.onclick = f; card.appendChild(b); };
    mk('続行する（生命と生態系はそのまま）', () => { game.continueFromCheckpoint(); cpShown = false; card.className = 'card'; $('modal').hidden = true; playing = true; setPP(); }, 'primary');
    mk('保存する', () => { toast(putSave('s1', null) ? 'スロット1に保存しました' : '保存できませんでした'); });
    mk('最初からやり直す', () => { if (!confirm('いまの世界は失われます（直前の節目の保存は残ります）。最初からやり直しますか？')) return; cpShown = false; card.className = 'card'; game = null; playing = false; $('modal').hidden = true; $('play').hidden = true; $('start').hidden = false; renderStart(); });
    $('modal').hidden = false;
  }
  // fast-forward to the next notable event (at most MAX_SKIP steps), then stop and show what happened
  let skipping = null; const STOP_KINDS = new Set(['lineage', 'dominance', 'collapse', 'crisis', 'rank', 'background', 'branch', 'trait', 'civ', 'world', 'codex', 'omega']), MAX_SKIP = 30000;
  function startSkip() { if (!game || game.pending || game.checkpoint || game.isOver || loading) return; if (skipping) { stopSkip(true); return; } skipping = { t0: game.t, n0: game.events.length, seq0: game.eventSeq }; playing = true; setPP(); $('skip').textContent = '■ 止める'; }
  function stopSkip(manual) {
    if (!skipping) return; const sk = skipping; skipping = null; $('skip').textContent = S31() ? '⏭ 次の出来事' : '⏭ 次の出来事まで早送り'; $('skipnote').textContent = ''; playing = false; setPP();
    if (game.pending || game.checkpoint) return; const ev = game.eventsSince(sk.seq0).filter((e) => e.kind !== 'disaster');
    const card = $('modal-card'); card.className = 'card'; card.innerHTML = `<h3>${manual ? '早送りを止めました' : ev.some((e) => STOP_KINDS.has(e.kind)) ? '出来事がありました' : `${NUM(MAX_SKIP)}ステップ進めましたが、目立った出来事はありませんでした`}</h3><p class="note">${(game.t - sk.t0).toLocaleString('ja-JP')}ステップ進みました。</p>` + (ev.length ? ev.slice(-12).map((e) => `<div class="ev ${e.kind}"><small>${e.t.toLocaleString('ja-JP')}ステップ</small>${e.text}</div>`).join('') : '');
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '確認した（閉じる）'; b.onclick = () => { $('modal').hidden = true; draw(true); }; card.appendChild(b); $('modal').hidden = false; draw(true);
  }
  $('skip').onclick = () => startSkip();

  // ---------- Stage 2.0: visual-first screens (pictograms, gauges, graphs). Details sit underneath, one tap away. ----------
  const ADAPT = () => !!(game && game.isAdaptive);
  const fmtY = (y) => (S31() ? OmegaFmt.years(y) : typeof OmegaCiv !== 'undefined' ? OmegaCiv.fmtYears(y) : Math.round(y) + '年');
  const REALM_ICON = { water: '🌊', land: '🌿', underground: '⛏', air: '☁' };
  const STRAT_ICON = { none: '・', flee: '🏃', coexist: '🤝', defend: '🛡', attack: '⚔' };
  const STANCE_ICON = { ignore: '😐', use: '🧺', coexist: '🤝', hostile: '⚔' }, STANCE_NAME = { ignore: '気に留めていない', use: '利用しようとしている', coexist: '共存', hostile: '敵対' };
  const EVENT_ICON = { 'civ-emerge': '🏛', 'civ-collapse': '💥', 'civ-end': '☠', impact: '☄', volcanic: '🌋', 'stance-hostile': '⚔', 'stance-use': '🧺', 'stance-coexist': '🤝', 'stance-ignore': '😐' };
  const KIND_ICON = { evo: '🧬', civ: '🏛', world: '🌍', lineage: '🧬', rank: '🏅', crisis: '⚠', trait: '🧪', immigration: '🔁', player: '🕹', branch: '❓', scenario: '☄', background: '🌱', local: '📍', dominance: '👑', disaster: '🔥', start: '▶' };
  const S4_ICON = { codex: '◇', omega: 'Ω', world: '○', civ: '□', evo: '◇', lineage: '△', rank: '▲', immigration: '→' };
  const evIcon = (e) => (game && game.cfg.stage === 4 ? S4_ICON[e.kind] || '・' : EVENT_ICON[e.sub] || KIND_ICON[e.kind] || '・');
  const MAJOR_KINDS = new Set(['evo', 'civ', 'world', 'lineage', 'rank', 'crisis', 'immigration', 'player', 'scenario', 'background', 'dominance', 'start']);
  const detailsOpen = {};
  const gauge = (v, cls) => `<div class="gauge ${cls || ''}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`;
  const uTxt = (n) => (n < 5 ? (n === 0 ? '0' : '<1') : n < 100 ? (n / 10).toFixed(1) : String(Math.round(n / 10))) + 'U';
  function wrapVisual(id, visual, details, label) {
    const el = $('tab-' + id), open = detailsOpen[id] ? ' open' : '';
    el.innerHTML = `<div class="vis">${visual}</div><details${open} data-d="${id}"><summary>${label || 'くわしい数値と説明'}</summary>${details}</details>`;
    const d = el.querySelector('details'); if (d) d.ontoggle = () => { detailsOpen[id] = d.open; };
  }
  // --- top status ---
  function drawHud() {
    const wi = game.worldInfo(), st = game.live.stats(), ti = game.timeInfo(), rk = game.rank, cur = rk.current, best = rk.best;
    let era, sub;
    if (wi) { era = wi.bpText; sub = `開始から ${fmtY(wi.years)}　世代 ${NUM(wi.generations)}（計算）`; }
    else { const hi = game.historyInfo(); era = hi ? HS.formatYearsBP(hi.yearsBP).replace('約', '') : '自由開始'; sub = `${TM.format(ti.steps, hi ? 'day' : assume)}経過（仮定・旧方式）　世代 ${NUM(ti.generations)}`; }
    $('hud-era').textContent = era; $('hud-sub').textContent = sub;
    const wrap = $('hud-rank'); wrap.innerHTML = `<span class="rk">${cur ? cur.rank : '？'}</span><small>最高 <b>${best ? best.rank : 'なし'}</b></small>`;
    const th = wi ? game.threat() : null, pops = `<span class="hchip" title="アリーナの実個体10体を1Uとして表示">🫧 ${uTxt(st.population)}</span>`;
    const civ = wi ? (wi.civ ? `<span class="hchip">🏛 ${wi.civ.stage}</span>` : '<span class="hchip dim">🏛 文明なし</span>') : '';
    const lv = th ? ['安全', '注意', '危険', '非常に危険'][th.level] : null, col = th ? ['#46c28a', '#f2d13d', '#f2a03d', '#e5586e'][th.level] : null;
    const thr = th ? `<span class="hchip" style="border-color:${col};color:${col}">${['🟢', '🟡', '🟠', '🔴'][th.level]} ${lv}</span>` : '';
    $('hud2').innerHTML = pops + civ + thr + (STAGE3() ? catBannerChips() : '') + `<span class="hchip dim" id="hud-time" role="button">⏳ 時間のしくみ</span>`;
    document.querySelectorAll('#hud2 [data-cat]').forEach((e) => { e.onclick = () => openCatDetail(); }); document.querySelectorAll('#hud2 [data-off]').forEach((e) => { e.onclick = () => openOffworld(); });
    const t = $('hud-time'); if (t) t.onclick = () => openTimeInfo();
  }
  // --- lineage chips: the lineage you are controlling is ringed; tap another living one to switch (the world does not reset) ---
  function drawLinbar2() {
    const rep = game.lineageReport(), rk = game.rank.byLin || {};
    $('linbar').innerHTML = rep.filter((l) => l.alive > 0 || l.role === 'focus' || game.controlled === l.lin).map((l) => {
      const b = rk[l.lin] && rk[l.lin].current, on = ADAPT() && game.controlled === l.lin;
      return `<button class="lchip${on ? ' on' : ''}${l.alive ? '' : ' dead'}" data-l="${l.lin}" style="--c:${l.color}"><i></i><b>${l.name}</b><span>${l.alive ? uTxt(l.alive) : '絶'}${b ? ' ' + b.rank : ''}</span></button>`;
    }).join('');
    if (ADAPT()) $('linbar').querySelectorAll('.lchip').forEach((el) => { el.onclick = () => { const l = Number(el.dataset.l); if (l === game.controlled) return; if (game.setControlled(l)) { toast(`${game.creatures[l].name}を操作します`); draw(true); } else toast('絶えた系統は操作できません'); }; });
  }
  // --- strategies: flee / coexist / defend / attack, applied to the controlled lineage. Choosing one does not make it work: see the effect note ---
  function drawStratbar() {
    const el = $('stratbar'); if (!ADAPT()) { el.hidden = true; return; } el.hidden = false;
    const cur = game.strategies()[game.controlled], th = game.threat(), S = G.STRATEGIES;
    const stance = th ? `${STANCE_ICON[th.stance]} 文明は${STANCE_NAME[th.stance]}` : '';
    el.innerHTML = '<div class="strow">' + ['flee', 'coexist', 'defend', 'attack', 'none'].map((k) => `<button class="sbtn${cur === k ? ' on' : ''}" data-s="${k}"><span>${STRAT_ICON[k]}</span><small>${S[k].name}</small></button>`).join('') + `<button class="sbtn q" id="strat-help"><span>？</span><small>説明</small></button></div><div class="note" id="strat-line">${game.creatures[game.controlled].name}の方針：<b>${S[cur].name}</b>　${stance}</div>`;
    el.querySelectorAll('.sbtn[data-s]').forEach((b) => { b.onclick = () => { if (game.setStrategy(game.controlled, b.dataset.s)) { toast(`方針：${S[b.dataset.s].name}`); draw(true); } }; });
    $('strat-help').onclick = () => openStrategyHelp();
  }
  function openStrategyHelp() {
    const card = $('modal-card'), p = playing; playing = false; setPP(); card.className = 'card';
    card.innerHTML = `<h3>4つの方針</h3><p class="note">選んだだけでは成功しません。効き目は、その系統の能力と、いる領域・文明の技術しだいです。遺伝子を直接書き換えることはできません。</p>
      <div class="help"><b>🏃 逃避</b>：移動できる個体が、文明の影響が弱い領域（深海・地中など）へ向かいやすくなる。移動能力が低いと効かない。移動にはエネルギーがかかる。</div>
      <div class="help"><b>🤝 共存</b>：文明が「役に立つ・脅威でない」と見なした系統だけ、捕獲は減り、食べ物の支援が得られる。ただし利用（捕獲）は続き、自力の生存としては数えない。</div>
      <div class="help"><b>🛡 防御</b>：耐性・免疫・修復が高い個体ほど、捕獲と損傷が減る。警戒のためのエネルギーを使い続ける。</div>
      <div class="help"><b>⚔ 攻撃</b>：捕食能力の高い個体が文明にダメージを与える。高い技術の文明にはほとんど効かず、攻撃する個体は反撃を受けやすい。文明の敵意が高まることもある。</div>
      <div class="help"><b>・ 方針なし</b>：自然のまま。</div>`;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { $('modal').hidden = true; if (p && !game.pending && !game.checkpoint && !game.isOver) { playing = true; setPP(); } }; card.appendChild(b); $('modal').hidden = false;
  }
  // --- latest important events ---
  function drawTicker() {
    const ev = game.events.filter((e) => MAJOR_KINDS.has(e.kind) && e.kind !== 'start').slice(-3).reverse();
    $('ticker').innerHTML = ev.length ? ev.map((e) => `<div class="tk"><span>${evIcon(e)}</span><div>${e.text.length > 70 ? e.text.slice(0, 68) + '…' : e.text}<small>${e.y !== undefined ? fmtY(e.y) + '後' : e.t + 'ステップ'}</small></div></div>`).join('') : '<div class="tk dim">まだ大きな出来事はありません</div>';
    $('ticker').onclick = () => document.querySelector('#tabs [data-tab=log]').click();
  }
  // --- the world picture: four realms, units (U), the three layers on land, the civilisation in the top layer ---
  function drawWorld2(st) {
    const [W, H2] = fit(cv, cx), gw = W / 2, gh = H2 / 2; cx.clearRect(0, 0, W, H2);
    const U = game.units(), wi = game.worldInfo(), th = wi ? game.threat() : null, rg = [0, 1, 2, 3], hab = STAGE3() ? game.habitatInfo() : null;
    const dangerCol = (d) => (d < 0.1 ? null : d < 0.35 ? 'rgba(242,160,61,' : 'rgba(229,88,110,');
    rg.forEach((p) => {
      const slot = SLOT_OF_REALM[p], x0 = (slot % 2) * gw, y0 = Math.floor(slot / 2) * gh, id = E.REALM_DEFS[p].id, col = REALM_COLOR[id], ux = x0 + 2, uy = y0 + 2, uw = gw - 4, uh = gh - 4;
      cx.globalAlpha = 0.10; cx.fillStyle = col; cx.fillRect(ux, uy, uw, uh); cx.globalAlpha = 1; cx.strokeStyle = col; cx.globalAlpha = 0.6; cx.strokeRect(ux, uy, uw, uh); cx.globalAlpha = 1;
      if (th) { const dc = dangerCol(th.danger[p]); if (dc) { cx.fillStyle = dc + (0.12 + 0.25 * th.danger[p]) + ')'; cx.fillRect(ux, uy, uw, uh); } }
      let tot = 0; U.realms[p].forEach((c) => { tot += c.arenaIndividuals; });
      cx.font = 'bold 12px system-ui'; cx.fillStyle = col; cx.fillText(S31() ? `${REALM_ICON[id]} ${E.REALM_DEFS[p].name}` : `${REALM_ICON[id]} ${E.REALM_DEFS[p].name}  ${uTxt(tot)}`, ux + 6, uy + 15);
      if (id === 'land') drawLandBands(ux, uy, uw, uh, st, wi); else if (hab) tpMap(cx, ux + 3, uy + 20, uw - 6, uh - 24, hab, p, { small: true }); else drawUnitRows(p, ux, uy + 20, uw, uh - 22, U);
    });
    if (th && th.civAlive) { cx.font = '11px system-ui'; cx.fillStyle = '#e6edf5'; cx.textAlign = 'right'; cx.fillText(`${STANCE_ICON[th.stance]} ${game.creatures[game.controlled].name}への文明の態度`, W - 6, H2 - 4); cx.textAlign = 'left'; }
  }
  // each living lineage is a row of unit marks (1 mark = 1U = 10 individuals, a faint outline mark = 1U of background); big counts shrink the marks
  function drawUnitRows(p, x, y, w, h, U) {
    const rows = []; game.creatures.forEach((c, i) => { const r = U.realms[p][i]; if (r.arenaIndividuals > 0 || r.backgroundUnits >= 5) rows.push({ i, c, a: r.arenaIndividuals / 10, b: r.backgroundUnits / 10 }); });
    if (!rows.length) { cx.fillStyle = '#5d7388'; cx.font = '11px system-ui'; cx.fillText('だれもいない', x + 8, y + 22); return; }
    const rh = Math.min(26, h / rows.length);
    rows.forEach((r, k) => {
      const yy = y + k * rh + rh / 2, ctl = ADAPT() && game.controlled === r.i, sq = game.roleOf(r.i) !== 'focus', cap = Math.floor((w - 14) / 9);
      let a = r.a, size = 4; const marks = Math.max(r.a > 0 ? 1 : 0, Math.round(r.a)); let show = marks, scale = 1; if (marks > cap - 3) { scale = (cap - 3) / marks; show = cap - 3; size = 4 * Math.max(0.6, scale + 0.3); }
      for (let m = 0; m < show; m++) { const px = x + 8 + m * 9, py = yy; cx.fillStyle = r.c.color; cx.globalAlpha = ctl ? 1 : 0.85; cx.beginPath(); if (sq) cx.rect(px - size, py - size, size * 2, size * 2); else cx.arc(px, py, size, 0, 6.2832); cx.fill(); }
      if (ctl && show) { cx.strokeStyle = '#fff'; cx.lineWidth = 1; cx.strokeRect(x + 2, yy - rh / 2 + 1, Math.min(w - 4, 8 + show * 9 + 2), rh - 2); }
      const bm = Math.min(Math.max(0, cap - 3 - show), Math.round(r.b)); cx.globalAlpha = 0.6; cx.strokeStyle = r.c.color; cx.lineWidth = 1;
      for (let m = 0; m < bm; m++) { const px = x + 8 + (show + m) * 9, py = yy; cx.beginPath(); cx.arc(px, py, 3, 0, 6.2832); cx.stroke(); }
      cx.globalAlpha = 1;
    });
  }
  // the land square: three layers. Bottom = survival instinct, middle = individual intelligence (both computed), top = society/culture: the civilisation (computed, abstract)
  const mainCtx = cx;
  function drawLandBands(x, y, w, h, st, wi, ctxArg) {
    const c0 = ctxArg || mainCtx;
    const top = y + 20, bh = (h - 22) / 3, names = ['🏛 文明・文化', '🧠 個体の知能', '🦴 生存本能'];
    for (let k = 0; k < 3; k++) {
      const by = top + k * bh; c0.globalAlpha = k % 2 ? 0.1 : 0.05; c0.fillStyle = '#46c28a'; c0.fillRect(x, by, w, bh); c0.globalAlpha = 1; c0.strokeStyle = '#2c3f55'; c0.beginPath(); c0.moveTo(x, by); c0.lineTo(x + w, by); c0.stroke();
      c0.fillStyle = k === 0 && !(wi && wi.civ) ? '#6f8296' : '#46c28a'; c0.font = '9px system-ui'; c0.fillText(names[k], x + 4, by + 10);
    }
    const ind = game.live.individuals().filter((q) => q.patch === 1), buckets = [0, 1].map(() => game.creatures.map(() => new Array(6).fill(0)));
    for (const q of ind) { const sc = game.individualScores(q); buckets[0][q.lin][Math.min(5, Math.floor(sc.instinct * 6))]++; buckets[1][q.lin][Math.min(5, Math.floor(sc.intelligence * 6))]++; }
    [[2, 0], [1, 1]].forEach(([band, bi]) => { const by = top + band * bh;
      game.creatures.forEach((c, i) => { buckets[bi][i].forEach((n, b) => { if (!n) return; const r = S31() ? domR(i, true) * 0.8 : Math.min(7, 2 + Math.sqrt(n / 10) * 2.2), px = x + 10 + (b + 0.5) / 6 * (w - 20) + (i - 2) * 3, py = by + bh - 6 - (b % 2) * 3; c0.globalAlpha = 0.8; c0.fillStyle = c.color; c0.beginPath(); c0.arc(px, py - 2, r, 0, 6.2832); c0.fill(); c0.globalAlpha = 1; }); }); });
    const ty = top, civ = wi && wi.civ;
    if (civ) { const n = Math.max(1, Math.round(1 + civ.N * 12)); c0.font = '13px system-ui'; for (let k = 0; k < n; k++) c0.fillText(k % 3 === 2 ? '🏭' : '🏛', x + 6 + (k % Math.floor((w - 12) / 16)) * 16, ty + 26 + Math.floor(k / Math.floor((w - 12) / 16)) * 13); c0.font = '10px system-ui'; c0.fillStyle = '#e6edf5'; c0.textAlign = 'right'; c0.fillText(`${civ.stage}  安定${Math.round(civ.S * 100)}%`, x + w - 4, ty + 10); c0.textAlign = 'left'; }
    else { c0.fillStyle = '#6f8296'; c0.font = '10px system-ui'; c0.fillText(wi ? '文明はいない' : '未計算（旧方式）', x + 6, ty + 26); }
  }
  // --- 世界 tab: the civilisation timeline, the present civilisation, what it left behind, the controlled lineage's danger, how time works ---
  const wcv = document.createElement('canvas'); wcv.id = 'civline'; wcv.height = 120;
  function drawCivTimeline() {
    const wi = game.worldInfo(), c = wcv, ctx = c.getContext('2d'), [W, Hh] = fit(c, ctx); ctx.clearRect(0, 0, W, Hh);
    const span = Math.max(wi.years, 2e6), X = (y) => 8 + (y / span) * (W - 16);
    ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, W, Hh);
    ctx.strokeStyle = '#243548'; ctx.fillStyle = '#7f93a8'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    for (let k = 0; k <= 4; k++) { const y = (span * k) / 4, x = X(y); ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, Hh - 16); ctx.stroke(); ctx.fillText(k === 0 ? '開始' : '+' + fmtY(y).replace('約', ''), Math.min(W - 24, Math.max(18, x)), Hh - 4); }
    ctx.textAlign = 'left'; const rows = [...wi.history.map((h) => ({ a: h.born, b: h.ended, T: h.peakT, live: false })), ...(wi.civ ? [{ a: wi.civ.born, b: wi.years, T: wi.civ.T, live: true }] : [])];
    rows.forEach((r) => { const x1 = X(r.a), x2 = Math.max(x1 + 3, X(r.b)), hot = Math.min(1, r.T / 8); ctx.fillStyle = `hsl(${40 - hot * 40},80%,${r.live ? 62 : 50}%)`; ctx.fillRect(x1, 34, x2 - x1, 34); if (r.live) { ctx.strokeStyle = '#fff'; ctx.strokeRect(x1, 34, x2 - x1, 34); } });
    ctx.font = '12px system-ui'; for (const m of game.worldMarks) { if (m.kind === 'impact' || m.kind === 'volcanic') { ctx.fillText(m.kind === 'impact' ? '☄' : '🌋', X(m.y) - 6, 26); } }
    ctx.fillStyle = '#e6edf5'; ctx.font = '10px system-ui'; ctx.fillText('文明の続いた期間（色＝最高の技術段階：赤いほど高い）／☄衝突 🌋大噴火', 8, 12);
    ctx.fillStyle = '#e6edf5'; const now = X(wi.years); ctx.fillRect(now - 1, 14, 2, Hh - 30);
  }
  function worldVisual(wi) {
    const th = game.threat(), civ = wi.civ, R = wi.residue;
    let h = '<canvas id="civline-slot" style="display:none"></canvas><div id="civline-host"></div>';
    h += civ ? `<div class="card2"><div class="row2"><b>🏛 ${civ.stage}</b><span>第${civ.id}の文明・${fmtY(civ.ageYears)}</span></div><div class="stage">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<i class="${civ.T >= k + 0.5 ? 'on' : ''}"></i>`).join('')}</div>
        <div class="g3"><span>人口</span>${gauge(civ.N / 1.2)}<span>安定</span>${gauge(civ.S, civ.S < 0.35 ? 'bad' : '')}<span>対立への支出</span>${gauge(civ.war, civ.war > 0.15 ? 'bad' : '')}</div><div class="note">崩壊 ${civ.collapses}回　領域への影響の届きやすさ：${['🌊', '🌿', '⛏', '☁'].map((ic, k) => ic + Math.round(civ.reach[k] * 100) + '%').join(' ')}</div></div>`
      : `<div class="card2"><div class="row2"><b>🏛 いま文明はいない</b><span>これまでに${wi.count}つ</span></div><div class="note">出現の確率（1万年あたり）：${(wi.emergenceRate * 1e4 * 100).toFixed(3)}%　※生物圏の認知能力・気候・資源・前の文明の跡で決まります。決まった周期はありません。</div></div>`;
    h += `<div class="card2"><div class="row2"><b>🌍 文明が残したもの</b><span>消えにくい</span></div><div class="g3"><span>☣ 環境負荷</span>${gauge(R.pollution / 2, R.pollution > 0.8 ? 'bad' : '')}<span>⛏ 使える資源の残り</span>${gauge(R.stock)}<span>📜 遺産（次の文明の足がかり）</span>${gauge(R.legacy)}</div><div class="note">生息地の改変：${['🌊', '🌿', '⛏', '☁'].map((ic, k) => ic + Math.round(R.conv[k] * 100) + '%').join(' ')}</div></div>`;
    if (th) h += `<div class="card2"><div class="row2"><b>${STANCE_ICON[th.stance]} ${game.creatures[th.lin].name}の状況</b><span>文明は${STANCE_NAME[th.stance]}</span></div><div class="g3"><span>接触の度合い</span>${gauge(th.exposure)}</div><div class="dang">${[0, 1, 2, 3].map((r) => `<div><span>${REALM_ICON[E.REALM_DEFS[r].id]}</span>${gauge(th.danger[r], th.danger[r] > 0.35 ? 'bad' : th.danger[r] > 0.1 ? 'warn' : '')}</div>`).join('')}</div><div class="note">領域ごとの危険度。いちばん安全なのは ${E.REALM_DEFS[th.safestRealm].name}。方針：${STRAT_ICON[th.strategy]} ${G.STRATEGIES[th.strategy].name}</div></div>`;
    const sim = wi.simulatedYears, leap = wi.leapYears, tot = Math.max(1, sim + leap);
    h += `<div class="card2"><div class="row2"><b>⏳ 時間の内訳</b><span>${fmtY(wi.years)}</span></div><div class="split"><i style="width:${Math.max(1, (sim / tot) * 100)}%" class="a"></i><i style="width:${(leap / tot) * 100}%" class="b"></i></div><div class="note">計算した時間 ${fmtY(sim)}（個体を1ステップずつ）／跳躍で進めた時間 ${fmtY(leap)}（世界のモデルだけ・${wi.leaps}回）　世代：計算 ${NUM(wi.generations)}、跳躍で省略した分（推定・計算外）${wi.skippedGenerations.toExponential(1)}</div></div>`;
    if (STAGE3()) h += worldVisual3();
    return h;
  }
  function timeExplainHtml(wi) {
    return `<p class="note"><b>時間のしくみ（仮定）：</b>1ステップを30日とみなします（最初の生き物の寿命は約25ステップ＝約2年）。個体と世代は、実際に計算したステップだけ進みます。世界の時計（年）は、計算したステップ分に加えて「跳躍」で進みます。跳躍では気候・文明・隕石や大噴火だけが粗い計算で進み、生き物は<b>進化もしません</b>。跳躍の間に起こりうる出来事（文明の出現・崩壊、天体衝突）を飛び越えないよう、跳躍の長さは自動で短くなります。</p>
      <p class="note"><b>跳躍をまたぐとき：</b>個体は年を取りません。その代わり、記録されている最長寿命を超える期間は生き延びられないものとして、子孫（同じ遺伝子）に入れ替えます。数が減り続けていた系統は、その減少が続くものとして絶滅と判定します（増えることは外挿しません）。特別に長寿な個体が生きている間は、跳躍せずに1ステップずつ進みます${wi.blocker ? `（いま：系統${game.creatures[wi.blocker.lin].name}の個体が${wi.blocker.age}ステップ生存中のため、跳躍を見合わせています）` : ''}。</p>
      <p class="note"><b>気候：</b>太陽の光度は約1億1千万年で1%ずつ増えます。地表の気温への影響は、炭酸塩ケイ酸塩の風化による調整で大部分が打ち消される、とゲーム上で仮定しています（残る割合は22%）。いまの気温偏差：太陽 ${wi.climate.solar.toFixed(2)}K、文明 ${wi.climate.civil.toFixed(2)}K。<b>約10億年後に必ず全生命が絶えると決めているわけではありません。</b></p>
      <p class="note"><b>文明：</b>発生・技術の発展・環境の改変・崩壊・再出現は、生物圏の認知能力（計算した系統の認知指標）、気候、資源、前の文明の跡から確率的に決まります。出現の頻度は地球の実績よりずっと高いと、ゲーム上で仮定しています（結果を見て調整した値です）。文明は計算した5系統のどれでもない、抽象的な知性種として扱います。衝突や噴火の頻度も大まかな目安です。</p>
      <p class="note">衝突${wi.impacts}回／大噴火${wi.volcs}回（これまで）。跳躍は${wi.leaps}回、見合わせ${wi.blocked}回。</p>`;
  }
  function drawWorldTab() {
    const wi = game.worldInfo(); if (!wi) { $('tab-world').innerHTML = '<div class="vis"><p class="note">このセーブは旧い時間方式（1ステップ＝1日・文明なし）です。新しく始めると、可変時間と文明モデルが使えます。</p></div>'; return; }
    const det = timeExplainHtml(wi);
    if (S31()) wrapVisual('world', worldVisual31(wi), worldVisual(wi) + det, 'くわしい数値と説明（時間・気候・文明・災厄）'); else wrapVisual('world', worldVisual(wi), det, 'くわしい説明（時間・気候・文明の仮定）');
    const host = $('civline-host'); if (host) { host.appendChild(wcv); wcv.style.width = '100%'; wcv.style.height = '120px'; drawCivTimeline(); }
  }
  // --- 状況 / 個体 / ランク / 形質: a picture first, the previous detail below ---
  function statVisual() {
    const U = game.units(), rep = game.lineageReport(), recs = game.records();
    const totals = [0, 1, 2, 3].map((p) => U.realms[p].reduce((a, c) => a + c.arenaIndividuals, 0)), mxr = Math.max(1, ...totals);
    let h = '<div class="rl">' + [0, 1, 2, 3].map((p) => { const id = E.REALM_DEFS[p].id; return `<div class="rrow"><span>${REALM_ICON[id]}</span><div class="stack">${U.realms[p].map((c, i) => (c.arenaIndividuals ? `<i style="width:${(c.arenaIndividuals / mxr) * 100}%;background:${game.creatures[i].color}"></i>` : '')).join('')}</div><b>${uTxt(totals[p])}</b></div>`; }).join('') + '</div>';
    const est = rep.filter((l) => l.alive >= 5), tot = Math.max(1, rep.reduce((a, l) => a + l.alive, 0));
    const bn = est.slice().sort((a, b) => b.alive - a.alive)[0], rec = (i) => (recs.find((r) => r.lin === i) || { recordAge: 0 }).recordAge, bl = est.slice().sort((a, b) => rec(b.lin) - rec(a.lin))[0];
    h += `<div class="duo"><div>👑 <b>数の優勢</b><br>${bn ? `${bn.name}（${Math.round((bn.alive / tot) * 100)}%）` : 'なし'}</div><div>⏳ <b>長く生きる優勢</b><br>${bl ? `${bl.name}（最長${rec(bl.lin)}ステップ）` : 'なし'}</div></div><div class="note">1U＝アリーナの実個体10体。背景集団は別に数えます（詳細）。</div>`;
    return h;
  }
  function indVisual() {
    const recs = game.records().filter((r) => r.recordAge > 0 || r.aliveNow > 0), mx = Math.max(10, ...recs.map((r) => r.recordAge));
    return '<div class="note">⏳ 個体が途切れず生きた最長記録（ステップ）。濃い線＝いま生きている最年長</div>' + recs.map((r) => `<div class="brow"><span style="color:${game.creatures[r.lin].color}">●</span><b>${r.name}</b><div class="bar2"><i class="rec" style="width:${(r.recordAge / mx) * 100}%"></i><i class="now" style="width:${(r.aliveNow / mx) * 100}%"></i></div><small>${r.recordAge}</small></div>`).join('');
  }
  function rankVisual() {
    const rk = game.rank, RKs = RKmod(), lin = rk.lineages.find((l) => l.lin === game.controlled) || rk.lineages[0], cur = rk.current ? rk.current.rank : null, best = rk.best ? rk.best.rank : null;
    let h = '<div class="ladder">' + RKs.order.map((r) => `<span class="${cur === r ? 'cur' : ''} ${best === r ? 'best' : ''}">${r}</span>`).join('') + '<span class="om">Ω<small>未判定</small></span></div>';
    h += `<div class="note">現在 <b>${cur || 'なし'}</b>／過去最高 <b>${best || 'なし'}</b>（${game.creatures[game.controlled].name}）。Ωは判定未実装のため表示しません。</div>`;
    if (lin && lin.judged) h += '<div class="axes">' + lin.axes.map((a) => `<div class="ax"><span>${AXIS_ICON[a.id] || '・'}</span><div class="tierbar">${[1, 2, 3, 4].map((k) => `<i class="${a.tier !== null && a.tier >= k ? 'on' : ''}"></i>`).join('')}</div><small>${a.name.length > 9 ? a.name.slice(0, 9) + '…' : a.name}${a.tier === null ? '（未判定）' : ''}</small></div>`).join('') + '</div>';
    else h += `<div class="note">${lin ? lin.reason : '判定中です'}</div>`;
    return h;
  }
  const AXIS_ICON = { aging: '⌛', repair: '🩹', efficiency: '🔋', range: '🌐', dormancy: '😴', independence: '🧍', competition: '🥊' };
  function traitVisual() {
    const rep = game.evolutionReport().find((e) => e.lin === game.controlled); if (!rep) return '<div class="note">観察を始めたばかりです。</div>';
    const ch = rep.rows.filter((r) => r.changed);
    return `<div class="note">${game.creatures[game.controlled].name}：最初に観察したときからの変化</div><div class="chg2">${ch.length ? ch.map((r) => `<span class="${r.delta > 0 ? 'up' : 'dn'}">${r.delta > 0 ? '▲' : '▼'} ${r.name.split('（')[0]}</span>`).join('') : '<span class="na">大きな変化なし</span>'}</div>` + (rep.cognition.index !== null ? `<div class="g3"><span>🧠 認知・学習の指標</span>${gauge(rep.cognition.index)}</div>` : '') + '<div class="note">変化は並べて示すだけで、生存の原因とは断定しません。</div>';
  }
  function logVisual() { const ev = game.events.filter((e) => MAJOR_KINDS.has(e.kind)).slice(-12).reverse(); return ev.map((e) => `<div class="tk"><span>${evIcon(e)}</span><div>${e.text}<small>${e.y !== undefined ? fmtY(e.y) + '後' : ''} ${e.t}ステップ</small></div></div>`).join('') || '<div class="note">まだありません</div>'; }

  // ---------- Stage 3.0: temperature x pressure maps, rank progress, catastrophe forecasts, life beyond the Earth ----------
  const STAGE3 = () => !!(game && game.cfg.stage >= 3);
  const S31 = () => !!(game && game.cfg.stage >= 3.1), F = OmegaFmt, NUM = (n) => (S31() ? F.num(n) : NUM(n));
  const NEED_ICON = { heat: '🌡', food: '🍃', disease: '🦠', cold: '❄' };
  const NEED_TEXT = { heat: ['耐性を高める', '維持費がかかる'], food: ['低代謝・深い休眠で飢えを越える', '取り分と繁殖力が落ちる'], disease: ['免疫を強める', '維持費がかかる'], cold: ['代謝を上げる／深い休眠', 'エネルギー消費が増える'] };
  const NEED_NAME = { heat: '高温', food: '食べ物の減少', disease: '病気の増加', cold: '低温' };
  const TP_RANGE = (id, dK) => ({ water: { T: [262, 395 + Math.max(0, dK)], P: [1e5, 3e8] }, underground: { T: [272, 440 + Math.max(0, dK)], P: [1e5, 3e8] }, air: { T: [190, 330 + Math.max(0, dK)], P: [5e2, 1.5e5] } })[id];
  const KfmtT = (T) => `${Math.round(T - 273.15)}℃`;
  const Pfmt = (P) => (P >= 1e7 ? `${Math.round(P / 1e6)}MPa` : P >= 1e5 ? `${(P / 1e5).toFixed(P >= 1e6 ? 0 : 1)}気圧` : P >= 1e3 ? `${(P / 1e3).toFixed(0)}kPa` : `${Math.round(P)}Pa`);
  // One realm's temperature x pressure map (left = hot, top = low pressure). Drawn: the column of the realm (shifted by the climate), the controlled lineage's tolerance box
  // (what its evolved body allows; dashed = while dormant), which bins suit it, and where the individuals really are (circles = units, 10 individuals each).
  function tpMap(c, x, y, w, h, hab, p, opt = {}) {
    const rl = hab.realms[p]; if (!rl) return; const rg = TP_RANGE(rl.id, rl.dK), lp0 = Math.log10(rg.P[0]), lp1 = Math.log10(rg.P[1]);
    const X = (T) => x + ((rg.T[1] - T) / (rg.T[1] - rg.T[0])) * w, Y = (P) => y + ((Math.log10(P) - lp0) / (lp1 - lp0)) * h, clampX = (v) => Math.max(x, Math.min(x + w, v)), clampY = (v) => Math.max(y, Math.min(y + h, v));
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = '#0d1520'; c.fillRect(x, y, w, h); c.strokeStyle = '#1d2d40'; c.lineWidth = 1;
    for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x + (w * k) / 4, y); c.lineTo(x + (w * k) / 4, y + h); c.stroke(); c.beginPath(); c.moveTo(x, y + (h * k) / 4); c.lineTo(x + w, y + (h * k) / 4); c.stroke(); }
    const col = REALM_COLOR[rl.id], ctl = hab.controlled, bx = hab.boxes[ctl], suit = hab.suit && hab.suit[p];
    if (opt.showBox !== false && bx) { const a = bx.active, d = bx.dormant; c.setLineDash([3, 3]); c.strokeStyle = game.creatures[ctl].color; c.globalAlpha = 0.6; c.strokeRect(clampX(X(d[1])), clampY(Y(d[2])), clampX(X(d[0])) - clampX(X(d[1])), clampY(Y(d[3])) - clampY(Y(d[2]))); c.setLineDash([]); c.globalAlpha = 0.14; c.fillStyle = game.creatures[ctl].color; const bw = clampX(X(a[0])) - clampX(X(a[1])), bh = clampY(Y(a[3])) - clampY(Y(a[2])); c.fillRect(clampX(X(a[1])), clampY(Y(a[2])), bw, bh); c.globalAlpha = 1; c.lineWidth = 1.6; c.strokeRect(clampX(X(a[1])), clampY(Y(a[2])), bw, bh); }
    c.strokeStyle = col; c.globalAlpha = S31() ? 0.3 : 0.5; c.lineWidth = S31() ? 1 : 1.5; if (S31()) c.setLineDash([2, 3]); c.beginPath(); rl.T.forEach((T, k) => { const px = X(T), py = Y(rl.P[k]); if (k === 0) c.moveTo(px, py); else c.lineTo(px, py); }); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    rl.T.forEach((T, k) => { const ok = suit ? suit[k] >= 0.75 : true; c.fillStyle = ok ? '#46c28a' : '#e5586e'; c.globalAlpha = 0.9; c.beginPath(); c.arc(X(T), Y(rl.P[k]), opt.small ? 2 : 3, 0, 6.2832); c.fill(); }); c.globalAlpha = 1;
    // where individuals are: per lineage per bin, sized by units
    const d = hab.dist[p]; if (d && opt.showDist !== false) game.creatures.forEach((cr, i) => { d[i].forEach((n, k) => { if (!n) return; const r = S31() ? domR(i, opt.small) : Math.min(opt.small ? 8 : 12, 2.5 + Math.sqrt(n / 10) * (opt.small ? 3 : 4.5)), off = (i - 3) * (opt.small ? 1.6 : 2.2); c.globalAlpha = i === ctl ? 0.95 : 0.6; c.fillStyle = cr.color; c.beginPath(); c.arc(X(rl.T[k]) + off, Y(rl.P[k]) + off * 0.6, r, 0, 6.2832); c.fill(); if (i === ctl) { c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); } }); }); c.globalAlpha = 1;
    c.restore();
    if (!opt.small) { c.fillStyle = '#7f93a8'; c.font = '10px system-ui'; c.textAlign = 'center'; for (let k = 0; k <= 4; k += 2) { const T = rg.T[1] - ((rg.T[1] - rg.T[0]) * k) / 4; c.fillText(KfmtT(T), Math.max(x + 14, Math.min(x + w - 14, x + (w * k) / 4)), y + h + 12); } c.textAlign = 'right'; for (let k = 0; k <= 4; k++) { const lp = lp0 + ((lp1 - lp0) * k) / 4; c.fillText(Pfmt(Math.pow(10, lp)), x - 3, y + (h * k) / 4 + 3); } c.textAlign = 'center'; c.fillText('温度（左＝高温・右＝低温）', x + w / 2, y + h + 25); c.textAlign = 'left'; }
    else { c.fillStyle = '#7f93a8'; c.font = '8px system-ui'; c.textAlign = 'left'; c.fillText('熱◀', x + 2, y + h - 3); c.textAlign = 'right'; c.fillText('▶冷', x + w - 2, y + h - 3); c.textAlign = 'left'; c.fillText('低圧', x + 2, y + 18); c.fillText('高圧', x + w - 24, y + h - 12); }
  }
  // ---------- rank progress: the next rank, and what stands in the way ----------
  function drawRankStrip() {
    const el = $('rankstrip'); if (!el) return; const p = game.rankProgress && game.rankProgress();
    if (!p || !p.judged) { el.innerHTML = `<span class="rs-none">次のランク：${p ? '判定中（個体が増え、観察が300ステップを超えると表示）' : '—'}</span>`; el.onclick = null; return; }
    if (!p.to) { el.innerHTML = '<span class="rs-none">判定できる範囲の最高です（Ωは判定未実装）</span>'; el.onclick = null; return; }
    el.innerHTML = `<span class="rs-to">次 <b>${p.to}</b></span>` + p.requirements.map((r) => `<span class="rq ${r.met ? 'ok' : ''}" title="${r.label}"><i>${r.icon}</i><b>${r.met ? '✔' : r.id === 'continuity' ? `あと${Math.round(r.short)}` : `あと${r.short}つ`}</b><u style="width:${Math.round(r.ratio * 100)}%"></u></span>`).join('') + '<span class="rs-more">▸</span>';
    el.onclick = () => openRankProgress();
  }
  function openRankProgress() {
    const p = game.rankProgress(), rk = game.rank, card = $('modal-card'), was = playing; playing = false; setPP(); card.className = 'card';
    let h = `<h3>次のランクへ</h3><div class="ladder">${RKmod().order.map((r) => `<span class="${rk.current && rk.current.rank === r ? 'cur' : ''} ${rk.best && rk.best.rank === r ? 'best' : ''}">${r}</span>`).join('')}<span class="om">Ω<small>未判定</small></span></div><div class="note">現在 <b>${rk.current ? rk.current.rank : 'なし'}</b>　歴代最高 <b>${rk.best ? rk.best.rank : 'なし'}</b>${rk.best ? `（${rk.best.t.toLocaleString('ja-JP')}ステップ）` : ''}。現在は下がることがあり、歴代最高は記録として残ります。</div>`;
    if (!p || !p.judged) h += `<div class="card2"><div class="note">${p ? p.reason : '判定中です'}</div></div>`;
    else if (!p.to) h += `<div class="card2">${p.note}</div>`;
    else {
      h += `<div class="card2"><div class="row2"><b>${p.from} → ${p.to}</b><span>達成度 ${Math.round(p.done * 100)}%</span></div>${gauge(p.done)}<div class="note">${p.note}</div></div>`;
      for (const r of p.requirements) {
        h += `<div class="card2"><div class="row2"><b>${r.icon} ${r.label}</b><span>${r.met ? '✔ 達成' : '未達'}</span></div>`;
        if (r.id === 'continuity') h += `<div class="g3"><span>いま／必要</span>${gauge(r.ratio, r.met ? '' : 'warn')}</div><div class="note">いま ${NUM(r.have)}ステップ（約${(r.have * 30 / 365.25).toFixed(1)}年）／必要 ${NUM(r.need)}ステップ${r.met ? '' : `　<b>あと ${NUM(r.short)}ステップ</b>`}</div>${r.met ? '' : advBlock(r.advice)}`;
        else {
          h += `<div class="note">達した軸 ${r.haveCount}／必要 ${r.needCount}${r.met ? '' : `　<b>あと${r.short}つ</b>`}</div>`;
          if (!r.met) h += r.candidates.slice(0, 3).map((cd) => `<div class="cand"><b>${AXIS_ICON[cd.id] || '・'} ${cd.name}</b>　<small>${cd.value === null ? (cd.why || '判定できません') : `いま ${fmtAxis(cd)}→ 必要 ${cd.target}（${cd.shortRatio === null ? '' : `あと約${Math.round(cd.shortRatio * 100)}%`}）`}</small>${advBlock(cd.advice)}</div>`).join('');
        }
        h += '</div>';
      }
    }
    h += '<div class="note">ランクは能力の足し算ではありません。知能・人口・文明の規模が高いだけでは上がりません。戦略には代償があり、どの道を選んでも保証はありません。</div>';
    card.innerHTML = h; const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { $('modal').hidden = true; if (was && !game.pending && !game.checkpoint && !game.isOver) { playing = true; setPP(); } }; card.appendChild(b); $('modal').hidden = false;
  }
  const fmtAxis = (cd) => (cd.value === null ? '-' : cd.id === 'range' ? `${cd.value}領域` : cd.id === 'competition' ? `${Math.round(cd.value)}ステップ` : cd.id === 'independence' ? `${cd.value}回` : cd.value.toFixed(cd.value < 10 ? 3 : 0));
  const advBlock = (a) => (a ? `<div class="adv"><div>${a.strategies.map((s) => `<span class="st">＋ ${s}</span>`).join('')}</div><div>${a.costs.map((s) => `<span class="co">− ${s}</span>`).join('')}</div></div>` : '');
  // ---------- catastrophe forecasts and the pauses around them ----------
  let catCache = { t: -1, v: null };
  const catNow = () => { if (!STAGE3()) return null; if (catCache.t !== game.t) catCache = { t: game.t, v: game.catInfo() }; return catCache.v; };
  function forecastCard(f, live) {
    const adv = f.advice, ico = f.kinds.map((k) => ({ impact: '☄', oceanLoss: '🏜', climateShock: '🌋', lunar: '🌙' }[k] || '💥')).join('');
    let h = `<div class="fc"><div class="fc-head"><span class="fc-ico">${ico}</span><div><b>${f.kindNames.join('＋')}</b><small>${f.eraLabel}の危機（${f.setting}）</small></div></div>`;
    h += `<div class="row2"><span>${live ? '推定' : '予告'}：およそ <b>${fmtY(f.remainingYears)}後</b></span><span>誤差の幅 約${fmtY(f.windowYears)}</span></div>`;
    h += `<div class="g3"><span>規模「${f.scaleClass}」</span>${gauge(Math.min(1, f.scaleValue / 4), f.scaleValue >= 2 ? 'bad' : 'warn')}<span>確からしさ</span><small>${f.confidence}</small></div>`;
    h += '<div class="dang">' + [0, 1, 2, 3].map((r) => `<div><span>${REALM_ICON[E.REALM_DEFS[r].id]}</span>${gauge(1 - f.realmRes[r], 1 - f.realmRes[r] > 0.5 ? 'bad' : 'warn')}<small>${f.realmHeatK[r] > 2 ? '＋' + Math.round(f.realmHeatK[r]) + 'K' : f.realmColdK[r] < -2 ? Math.round(f.realmColdK[r]) + 'K' : '±0'}</small></div>`).join('') + '</div><div class="note">棒＝その領域の食べ物の減り方、下の数字＝気温の変化の見込み</div>';
    h += `<div class="note">${f.kindText.join(' ')}</div>`;
    if (adv) {
      h += `<div class="card2"><div class="row2"><b>🛡 ${adv.name}にとって</b><span>${adv.needs.length ? adv.needs.map((n) => NEED_ICON[n] + NEED_NAME[n]).join('・') : '大きな脅威は見込まれません'}</span></div>`;
      h += '<div class="rsafe">' + adv.realms.map((r) => `<span class="${r.safe ? 'ok' : 'ng'}">${REALM_ICON[r.id]}${r.safe ? '残れそう' : '厳しい'}</span>`).join('') + '</div>';
      const safe = adv.safeRealms.map((r) => E.REALM_DEFS[r].name); h += `<div class="note">${safe.length ? `影響が小さく残れそうな領域：<b>${safe.join('・')}</b>（逃避の方針は、移動できる個体を、領域・深さの安全なほうへ向かわせます）` : '安全に残れそうな領域は見当たりません。耐性・休眠・修復で耐えるしかありません。'}</div>`;
      if (adv.box) h += `<div class="note">いまの耐熱の上限 ${KfmtT(adv.box.Thi)}、耐寒の下限 ${KfmtT(adv.box.Tlo)}。予想される最高気温（領域の地表）：${adv.realms.filter((r) => r.id !== 'underground').map((r) => `${REALM_ICON[r.id]}${KfmtT(r.tMax)}`).join(' ')}</div>`;
      for (const n of adv.needs) h += `<div class="adv"><div><span class="st">${NEED_ICON[n]} ＋ ${NEED_TEXT[n][0]}</span></div><div><span class="co">− ${NEED_TEXT[n][1]}</span></div></div>`;
      h += '</div>';
    }
    if (f.hypothesis) h += '<div class="assume">🌙 月の破局は、この作品独自の仮説です。科学的に確立した説ではありません。</div>';
    h += `<details><summary>この予告について</summary><p class="note">${f.note} 太陽の光度の増大（科学的な根拠のある現象）が後の年代の危機を重くしますが、災厄の種類・規模・時期はゲーム上の確率モデルです。</p></details></div>`;
    return h;
  }
  function catCheckpointCard(c) {
    const ci = game.catInfo(); const ms = c.ms; let h = '';
    if (c.kind === 'warning') { const f = ci.forecasts.find((x) => x.cat === ms.cat); h = `<h3>⚠ 大災厄の${['早期の予告', '更新された予告', '直前の警告'][ms.stageIndex]}</h3>` + (f ? forecastCard(f, false) : '<p class="note">予告の詳細を取得できませんでした。</p>'); }
    else if (c.kind === 'catastrophe') {
      const st = ci.status.find((x) => x.id === ms.cat), fcPrev = null; h = `<h3>🔥 大災厄が始まった</h3><div class="fc"><div class="fc-head"><span class="fc-ico">${st.kinds.map((k) => ({ impact: '☄', oceanLoss: '🏜', climateShock: '🌋', lunar: '🌙' }[k] || '💥')).join('')}</span><div><b>${st.kindNames.join('＋')}</b><small>${st.label}の危機・規模「${st.scaleClass}」</small></div></div><div class="note">${st.recoverable ? '生態系が回復する余地のある災厄です。生き残りがいれば、時間をかけて戻ります。' : '元に戻らない環境の変化をともないます。生き残れる場所は限られます。'}</div>${st.hypothesis ? '<div class="assume">🌙 月の破局は、この作品独自の仮説です。</div>' : ''}<div class="note">予告と実際の結果は一致しないことがあります。ここから先は、実際に計算された影響が生き物に作用します。</div></div>`;
    } else if (c.kind === 'aftermath') { const st = game.live.stats(), alive = game.creatures.map((cr, i) => (st.lineageAlive[i] > 0 ? `<span class="lchip" style="--c:${cr.color}"><i></i><b>${cr.name}</b><span>${uTxt(st.lineageAlive[i])}</span></span>` : '')).join(''); h = `<h3>災厄のあと</h3><div class="note">災厄の始まりから約20万年。いま実際に計算されている生き残りです。</div><div id="linbar-lite">${alive || '<div class="note">アリーナで生きている系統はいません</div>'}</div><div class="note">背景の生き物や文明は、世界の「世界」タブで確認できます。回復できる災厄なら、これから生態系が戻り、新しい系統や文明が現れることがあります。</div>`; }
    else if (c.kind === 'earth-ended') { const o = game.offworld(); h = `<h3>🌍 地球の生命圏は終わりました</h3><div class="note">地球の外へ出て、一時的に生き残った系統がいるので、観察は続きます。</div>${offworldHtml(o)}`; }
    return h;
  }
  function offworldHtml(o) {
    if (!o) return ''; const recs = o.records.slice(-8).reverse();
    return `<div class="card2"><div class="row2"><b>🚀 地球の外へ出た系統</b><span>${o.records.length}件</span></div>${recs.length ? recs.map((r) => `<div class="orow"><span>${r.route === 'transport' ? '🛸' : r.route === 'ejecta' ? '☄' : '🚀'}</span><div><b>${r.name}</b>　${r.routeName}<small>${r.status === 'temporary' ? '到達・一時的に生存' : '到達のみ（生存は確認できず）'}${r.supported ? '・文明の支え' : ''}${r.omegaEligible ? '' : '・Ωの条件にはならない'}</small></div></div>`).join('') : '<div class="note">まだありません</div>'}<div class="note">${o.notes}</div></div>`;
  }
  function openOffworld() { const card = $('modal-card'), was = playing; playing = false; setPP(); card.className = 'card'; card.innerHTML = `<h3>地球の外</h3>${offworldHtml(game.offworld())}`; const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { $('modal').hidden = true; if (was && !game.pending && !game.checkpoint && !game.isOver) { playing = true; setPP(); } }; card.appendChild(b); $('modal').hidden = false; }
  function openCatDetail() {
    const ci = game.catInfo(); const card = $('modal-card'), was = playing; playing = false; setPP(); card.className = 'card';
    card.innerHTML = `<h3>大災厄</h3>${ci.forecasts.length ? ci.forecasts.map((f) => forecastCard(f, true)).join('') : '<div class="note">いま出ている予告はありません。</div>'}${catTimelineHtml(ci)}`;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { $('modal').hidden = true; if (was && !game.pending && !game.checkpoint && !game.isOver) { playing = true; setPP(); } }; card.appendChild(b); $('modal').hidden = false;
  }
  function catRowsHtml(ci) {
    const ICON = { future: '・', warned: '⚠', active: '🔥', aftermath: '🌱', past: '✔' }, NAME = { future: 'まだ先（予告なし）', warned: '予告あり', active: '最中', aftermath: '回復の途中', past: '過ぎた' };
    return ci.status.map((s) => `<div class="orow"><span>${ICON[s.state]}</span><div><b>${s.label}</b>　${NAME[s.state]}<small>${s.kindNames ? `${s.kindNames.join('＋')}・規模「${s.scaleClass}」・${s.recoverable ? '回復の余地あり' : '元に戻らない'}` : s.setting}</small></div></div>`).join('');
  }
  function catTimelineHtml(ci) {
    const ICON = { future: '・', warned: '⚠', active: '🔥', aftermath: '🌱', past: '✔' }, NAME = { future: 'まだ先（予告なし）', warned: '予告あり', active: '最中', aftermath: '回復の途中', past: '過ぎた' };
    return '<div class="card2"><div class="row2"><b>長期の危機</b><span>10億・20億・30億年代</span></div>' + ci.status.map((s) => `<div class="orow"><span>${ICON[s.state]}</span><div><b>${s.label}</b>　${NAME[s.state]}<small>${s.kindNames ? `${s.kindNames.join('＋')}・規模「${s.scaleClass}」・${s.recoverable ? '回復の余地あり' : '元に戻らない'}` : s.setting}</small></div></div>`).join('') + '</div>';
  }
  function catBannerChips() {
    const ci = catNow(); if (!ci) return ''; let out = '';
    for (const f of ci.forecasts) out += S31() ? `<span class="hchip warnchip" data-cat="1">⚠ 大災厄 あと${fmtY(f.remainingYears)}</span>` : `<span class="hchip warnchip" data-cat="1">⚠ 大災厄の予告 ${fmtY(f.remainingYears)}後 規模「${f.scaleClass}」</span>`;
    const act = ci.status.find((s) => s.state === 'active' || s.state === 'aftermath'); if (act) out += `<span class="hchip warnchip" data-cat="1">${act.state === 'active' ? '🔥 大災厄の最中' : '🌱 災厄の回復途中'}（${act.label}）</span>`;
    const o = game.offworld(); if (o && o.records.length) out += `<span class="hchip" data-off="1">${S4() ? '外' : '🚀'} ${o.records.length}</span>`;
    return out;
  }
  // ---------- 世界 tab additions: crises, life beyond the Earth, the time ledger ----------
  function worldVisual3() {
    const ci = game.catInfo(), o = game.offworld(), L = game.timeLedger(); let h = '';
    h += `<div class="card2"><div class="row2"><b>🌋 長期の危機</b><span>${ci.forecasts.length ? '予告が出ています' : '予告なし'}</span></div>${ci.forecasts.map((f) => `<div class="note">⚠ ${f.kindNames.join('＋')}（${f.eraLabel}）あと約${fmtY(f.remainingYears)}・規模「${f.scaleClass}」</div>`).join('')}${catRowsHtml(ci)}</div>`;
    if (o) h += offworldHtml(o);
    if (L) h += `<div class="card2"><div class="row2"><b>⏳ 計算した時間／省略した時間</b><span>跳躍${L.leaps}回</span></div><div class="note">計算した ${fmtY(L.simulatedYears)}（${L.simulatedSteps.toLocaleString('ja-JP')}ステップ、${NUM(L.simulatedGenerations)}世代）／跳躍で省略 ${fmtY(L.skippedYears)}（世代は推定 ${L.skippedGenerationsEstimate.toExponential(1)}・進化していない）。<br><small>${L.method}</small></div><details><summary>近似の条件と限界</summary><div class="note">${L.conditions}</div>${L.limits.map((x) => `<div class="note">・${x}</div>`).join('')}${L.recent.slice(-4).map((r) => `<div class="note"><small>跳躍 ${fmtY(r.years)}（${r.t}ステップ時点）：減少の外挿 ${r.extrapolated.length ? r.extrapolated.map((i) => game.creatures[i].name).join('・') : 'なし'}、入れ替え ${r.reseeded.reduce((a, b) => a + b, 0)}体、絶滅 ${r.extinct.length ? r.extinct.map((i) => game.creatures[i].name).join('・') : 'なし'}</small></div>`).join('')}</details></div>`;
    return h;
  }

  // ---------- Stage 3.1: a quieter main screen ----------
  // The main screen carries only: where we are in time, danger, the rank and what it still lacks, the lineages, the stance buttons and the latest event.
  // Everything else is one tap away (details). Circle size on the maps is DOMINANCE over the environment, never a head count.
  let domC = { k: -1, g: null, v: null };
  const domNow = () => { if (!S31()) return null; const k = Math.floor(game.t / 25); if (domC.k !== k || domC.g !== game) domC = { k, g: game, v: game.dominance() }; return domC.v; };
  const domR = (i, small) => { const d = domNow(), v = d && d[i] && d[i].value !== null ? d[i].value : 0; return (small ? 3 : 4.5) + v * (small ? 9 : 14); };
  const R_GLYPH = { continuity: 'T', aging: 'A', repair: 'R', efficiency: 'E', range: 'W', dormancy: 'D', independence: 'I', competition: 'C' }, rIcon = (i) => (S4() ? R_GLYPH[i.id] || '・' : i.icon); // Stage 4.0: dry letters instead of pictures
  const STAT_JA = { met: '達成', part: '一部達成', near: '惜しい', short: '不足', na: '未計算' }, STAT_MARK = { met: '✔', part: '△', near: '△', short: '✕', na: '–' };
  const SHORT_NAME = (n) => n.replace(/型$/, '');
  function openCard(html, onClose) {
    const card = $('modal-card'), was = playing; playing = false; setPP(); card.className = 'card'; card.innerHTML = html;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { $('modal').hidden = true; if (onClose) onClose(); if (was && !game.pending && !game.checkpoint && !game.isOver) { playing = true; setPP(); } }; card.appendChild(b); $('modal').hidden = false; return card;
  }
  function drawHud31() {
    const wi = game.worldInfo(), rk = game.rank, cur = rk.current, best = rk.best;
    $('hud-era').textContent = wi.bpText; $('hud-sub').textContent = `開始から ${F.years(wi.years)}`;
    $('hud-rank').innerHTML = `<span class="rk">${cur ? cur.rank : '？'}</span><small>最高 <b>${best ? best.rank : 'なし'}</b></small>`;
    const th = game.threat(), lv = th ? ['安全', '注意', '危険', '非常に危険'][th.level] : null, col = th ? ['#46c28a', '#f2d13d', '#f2a03d', '#e5586e'][th.level] : null;
    const thr = th ? `<span class="hchip" style="border-color:${col};color:${col}">${S4() ? '●' : ['🟢', '🟡', '🟠', '🔴'][th.level]} ${lv}</span>` : '';
    const civ = wi.civ ? `<span class="hchip">${S4() ? '文明' : '🏛'} ${wi.civ.stage}</span>` : '';
    $('hud2').innerHTML = thr + civ + catBannerChips();
    document.querySelectorAll('#hud2 [data-cat]').forEach((e) => { e.onclick = () => openCatDetail(); }); document.querySelectorAll('#hud2 [data-off]').forEach((e) => { e.onclick = () => openOffworld(); });
  }
  function drawRankStrip31() {
    const el = $('rankstrip'); if (!el) return; const c = game.rankChecklist();
    if (!c || !c.judged) { el.innerHTML = `<span class="rs-none">次のランク：判定中</span>`; el.onclick = null; return; }
    if (!c.to) { el.innerHTML = '<span class="rs-none">判定範囲の最高（Ωは未判定）</span>'; el.onclick = null; return; }
    el.innerHTML = `<span class="rs-to">次 <b>${c.to}</b></span>` + c.items.map((i) => `<span class="rd ${i.status}" title="${i.label}"><i>${rIcon(i)}</i><em>${STAT_MARK[i.status]}</em></span>`).join('') + '<span class="rs-more">▸</span>';
    el.onclick = () => openRankProgress31();
  }
  function openRankProgress31() {
    const c = game.rankChecklist(), rk = game.rank; let h = `<h3>次のランクへ</h3><div class="ladder">${RKmod().order.map((r) => `<span class="${rk.current && rk.current.rank === r ? 'cur' : ''} ${rk.best && rk.best.rank === r ? 'best' : ''}">${r}</span>`).join('')}<span class="om">Ω<small>未判定</small></span></div><div class="note">現在 <b>${rk.current ? rk.current.rank : 'なし'}</b>　歴代最高 <b>${rk.best ? rk.best.rank : 'なし'}</b>。現在は下がることがあり、最高は記録として残ります。</div>`;
    if (!c || !c.judged || !c.to) h += `<div class="card2"><div class="note">${c && c.note ? c.note : c ? c.reason : '判定中です'}</div></div>`;
    else {
      h += `<div class="card2"><div class="row2"><b>${c.from} → ${c.to}</b><span>${c.rules.map((r) => `段階${r.level}以上 ${r.have}/${r.need}`).join('　')}</span></div>` + c.items.map((i) => {
        let line = '';
        if (i.id === 'continuity') line = `いま ${F.num(i.have)} ／ 必要 ${F.num(i.need)}ステップ`;
        else if (i.value === null) line = i.why || '判定できません';
        else line = `いま ${i.id === 'range' ? i.value + '領域' : i.id === 'competition' ? F.num(i.value) + 'ステップ' : i.id === 'independence' ? i.value + '回' : F.small(i.value, i.value < 10 ? 3 : 0)}${i.target !== null && i.target !== undefined ? ` ／ 目標 ${i.id === 'competition' ? F.num(i.target) : F.small(i.target, 3)}` : ''}${i.tier !== null && i.tier !== undefined ? `（段階${i.tier}）` : ''}`;
        return `<div class="ck ${i.status}"><span class="ck-i">${rIcon(i)}</span><div><b>${i.label}</b><small>${line}</small></div><em>${STAT_JA[i.status]}</em></div>`;
      }).join('') + `<div class="note">${c.note}</div></div><button class="btn small" id="rk-more">必要量と、寄与し得る能力・代償</button>`;
    }
    h += '<div class="note">ランクは能力の足し算ではありません。知能・人口・文明の規模だけでは上がらず、環境支配力やこの表示の見やすさも判定には使いません。</div>';
    const card = openCard(h); const m = card.querySelector('#rk-more'); if (m) m.onclick = () => { $('modal').hidden = true; openRankProgress(); };
  }
  function drawLinbar31() {
    const rep = game.lineageReport(), rk = game.rank.byLin || {};
    $('linbar').innerHTML = rep.filter((l) => l.alive > 0 || l.role === 'focus' || game.controlled === l.lin).map((l) => {
      const b = rk[l.lin] && rk[l.lin].current, on = game.controlled === l.lin;
      return `<button class="lchip${on ? ' on' : ''}${l.alive ? '' : ' dead'}" data-l="${l.lin}" style="--c:${l.color}"><i></i><b>${SHORT_NAME(l.name)}</b><span>${l.alive ? (b ? b.rank : '') : '✝'}</span></button>`;
    }).join('');
    $('linbar').querySelectorAll('.lchip').forEach((el) => { el.onclick = () => { const l = Number(el.dataset.l); if (l === game.controlled) return; if (game.setControlled(l)) { toast(`${game.creatures[l].name}を操作します`); draw(true); } else toast('絶えた系統は操作できません'); }; });
  }
  const TG_SHORT = { civ: '文明', plant: '植物など', animal: '動物' };
  function drawStance31() {
    const el = $('stratbar'); el.hidden = false; const ti = game.targetInfo();
    el.innerHTML = '<div class="strow3">' + ti.targets.map((t) => { const cur = t.options.find((o) => o.id === t.current); return `<button class="tbtn${t.current !== 'none' ? ' on' : ''}" data-t="${t.id}"><small>${TG_SHORT[t.id]}</small><span>${cur.icon} ${cur.label}</span></button>`; }).join('') + '</div>';
    el.querySelectorAll('.tbtn').forEach((b) => { b.onclick = () => openStance31(b.dataset.t); });
  }
  function openStance31(tid) {
    const ti = game.targetInfo(), t = ti.targets.find((x) => x.id === tid); let h = `<h3>${ti.name}：${t.name}への方針</h3><div class="note">選んでも成功するとは限りません。体に必要な力がないと、失敗します。環境を直接動かすことはできません。</div>`;
    h += t.options.map((o) => `<button class="opt${o.id === t.current ? ' on' : ''}" data-o="${o.id}"><span class="oi">${o.icon}</span><div><b>${o.label}</b>${o.needs ? `<small>必要な力：${o.needs}</small>` : '<small>特別な力は不要</small>'}</div><span class="cap">${o.capability === null || o.id === 'none' ? '' : `<div class="gauge ${o.canDo ? '' : 'bad'}"><i style="width:${Math.round(Math.min(1, o.capability) * 100)}%"></i></div><small>${o.canDo ? '実行できる' : '力が足りず失敗しやすい'}</small>`}</span></button>`).join('');
    const card = openCard(h); card.querySelectorAll('.opt').forEach((b) => { b.onclick = () => { game.setTarget(game.controlled, tid, b.dataset.o); toast(`方針：${t.options.find((o) => o.id === b.dataset.o).label}`); $('modal').hidden = true; stratKey = ''; draw(true); if (!game.pending && !game.checkpoint && !game.isOver) { playing = true; setPP(); } }; });
  }
  function drawTicker31() {
    const ev = game.events.filter((e) => MAJOR_KINDS.has(e.kind) && e.kind !== 'start').slice(-1)[0];
    $('ticker').innerHTML = ev ? `<div class="tk1"><span>${evIcon(ev)}</span><div>${ev.text.length > 52 ? ev.text.slice(0, 50) + '…' : ev.text}</div></div>` : '<div class="tk1 dim">まだ大きな出来事はありません</div>';
    $('ticker').onclick = () => document.querySelector('#tabs [data-tab=log]').click();
  }
  function worldVisual31(wi) {
    const ci = game.catInfo(), o = game.offworld(), th = game.threat(); let h = '';
    h += `<div class="line1"><span>🏛</span><div>${wi.civ ? `第${wi.civ.id}の文明 ${wi.civ.stage}` : 'いま文明はいない'}</div></div>`;
    h += `<div class="line1"><span>🌋</span><div>${ci.forecasts.length ? ci.forecasts.map((f) => `⚠ ${f.eraLabel}の危機 あと約${fmtY(f.remainingYears)}（規模「${f.scaleClass}」）`).join('<br>') : '大災厄の予告はありません'}</div></div>`;
    const act = ci.status.find((s) => s.state === 'active' || s.state === 'aftermath'); if (act) h += `<div class="line1"><span>${act.state === 'active' ? '🔥' : '🌱'}</span><div>${act.state === 'active' ? '大災厄の最中' : '災厄からの回復途中'}（${act.label}）</div></div>`;
    h += `<div class="line1"><span>🚀</span><div>地球外：到達${o.records.length}件／自律的な生存は未計算</div></div>`;
    if (th) h += `<div class="line1"><span>${['🟢', '🟡', '🟠', '🔴'][th.level]}</span><div>${game.creatures[th.lin].name}の危険度：${['安全', '注意', '危険', '非常に危険'][th.level]}</div></div>`;
    return h + '<div class="note">くわしい数値は下の「くわしい数値と説明」に収めています。</div>';
  }
  function statVisual31() {
    const d = domNow() || [], rep = game.lineageReport(); let h = '<div class="note">環境支配力（個体数ではありません）。資源の使いこなし・他への影響・長く生きる力・生息域の広さから計算します。</div>';
    h += rep.filter((l) => l.alive > 0).map((l) => { const x = d[l.lin]; return `<div class="brow"><span style="color:${l.color}">●</span><b>${SHORT_NAME(l.name)}</b><div class="bar2"><i class="rec" style="width:${x && x.value !== null ? Math.round(x.value * 100) : 0}%"></i></div><small>${x && x.value !== null ? x.value.toFixed(2) : '—'}${x && !x.reliable ? ' 参考' : ''}</small></div>`; }).join('') || '<div class="note">生き残っている系統がありません</div>';
    return h;
  }
  function countsHtml31() {
    const rep = game.lineageReport(), d = domNow() || [];
    return '<div class="grp">個体数と環境支配力（別のものです）</div><table class="cmp"><tr><th>系統</th><th>実個体（アリーナ）</th><th>環境支配力</th><th>利用・影響・持続・広さ</th></tr>' + rep.filter((l) => l.alive > 0 || l.role === 'focus').map((l) => { const x = d[l.lin], p = x && x.parts; return `<tr><td>${l.name}</td><td>${F.num(l.alive)}</td><td>${x && x.value !== null ? x.value.toFixed(2) : '—'}</td><td>${p ? [p.use, p.impact, p.persist, p.range].map((v) => v.toFixed(2)).join(' / ') : '—'}</td></tr>`; }).join('') + '</table><p class="note">環境支配力＝0.35×資源の使いこなし＋0.15×他への影響＋0.25×持続（寿命）＋0.25×生息域の広さ。いずれも「1個体あたり」で、個体数は含みません。少数でも強い系統は大きく、多数でも弱い系統は小さくなります。重みと基準値はゲーム上の仮定です。生き物どうしの依存関係は未計算。生存者が5体未満の値は参考です。</p>';
  }
  const EV_ST = { occurred: '○', established: '◎', lost: '×', faded: '×' };
  function traitVisual31() {
    const r = game.evoReport(), c = r.counts, mut = (c.strengthen || 0) + (c.weaken || 0) + (c.newcap || 0) + (c.alter || 0) + (c.loss || 0) + (c.behaviour || 0);
    let h = `<div class="evchips"><span>🧪 突然変異<b>${F.num(mut)}</b></span><span>🔀 機能交換<b>${F.num(c.exchange || 0)}</b></span><span>🧬 融合<b>${F.num(c.fusion || 0)}</b></span><span>✂ 分離<b>${F.num(c.separation || 0)}</b></span></div>`;
    h += `<div class="note">追跡中：定着 ${r.status.established}／途中 ${r.status.occurred}／消えた ${r.status.lost}　（◎定着 ○途中 ×消失）</div>`;
    h += r.recent.slice(0, 5).map((e) => `<div class="evl"><span>${EV_ST[e.status] || '○'}</span><div>${e.text}</div></div>`).join('') || '<div class="note">まだ目立った変化はありません</div>';
    const dv = game.discoveries(); if (dv.length) h += '<div class="grp">🔎 発見（記録のみ。生存やランクには影響しません）</div>' + dv.slice(0, 4).map((d) => `<div class="evl"><span>🔎</span><div>${d.text}</div></div>`).join('');
    const fr = game.freeRoutes(); if (fr) h += `<div class="note">領域間の移動：参考ルート ${F.num(fr.reference)}回／それ以外 ${F.num(fr.outside)}回（線は参考で、進化できる範囲の境界ではありません）</div>`;
    h += `<div class="trailbox"><div class="row2"><select id="trail-x"></select><span>×</span><select id="trail-y"></select></div><canvas id="trail" width="360" height="200"></canvas><div class="note">各系統の平均的な形質の道筋。◯が現在、□が最初です。どの形質の組み合わせにも進めます。</div></div>`;
    return h;
  }
  let trailAx = [0, 3];
  function drawTrail31() {
    const tr = game.trails(), cvs = $('trail'); if (!tr || !cvs) return; const sx = $('trail-x'), sy = $('trail-y');
    if (!sx.options.length) { tr.names.forEach((n, k) => { sx.add(new Option(n, k)); sy.add(new Option(n, k)); }); }
    sx.value = trailAx[0]; sy.value = trailAx[1]; sx.onchange = sy.onchange = () => { trailAx = [Number(sx.value), Number(sy.value)]; drawTrail31(); };
    const c = cvs.getContext('2d'), W = cvs.width, H = cvs.height, pad = 24; c.clearRect(0, 0, W, H); c.fillStyle = '#0d1520'; c.fillRect(0, 0, W, H);
    const rng = (k) => { const [, mn, mx] = E.TRAITS[E.TRAITS.findIndex((l) => l[0] === tr.traits[k])]; return [mn, mx]; }, [x0, x1] = rng(trailAx[0]), [y0, y1] = rng(trailAx[1]);
    const X = (v) => pad + ((v - x0) / (x1 - x0)) * (W - pad * 2), Y = (v) => H - pad - ((v - y0) / (y1 - y0)) * (H - pad * 2);
    c.strokeStyle = '#1d2d40'; for (let k = 0; k <= 4; k++) { c.beginPath(); c.moveTo(pad + (k * (W - 2 * pad)) / 4, pad); c.lineTo(pad + (k * (W - 2 * pad)) / 4, H - pad); c.stroke(); c.beginPath(); c.moveTo(pad, pad + (k * (H - 2 * pad)) / 4); c.lineTo(W - pad, pad + (k * (H - 2 * pad)) / 4); c.stroke(); }
    c.fillStyle = '#7f93a8'; c.font = '10px system-ui'; c.textAlign = 'center'; c.fillText(tr.names[trailAx[0]] + ' →', W / 2, H - 6); c.save(); c.translate(9, H / 2); c.rotate(-Math.PI / 2); c.fillText(tr.names[trailAx[1]] + ' →', 0, 0); c.restore();
    for (const p of tr.paths) {
      c.strokeStyle = p.color; c.fillStyle = p.color; c.globalAlpha = 0.85; c.lineWidth = 1.6; c.beginPath(); p.points.forEach(([, v], k) => { const px = X(v[trailAx[0]]), py = Y(v[trailAx[1]]); if (k === 0) c.moveTo(px, py); else c.lineTo(px, py); }); c.stroke();
      const s0 = p.points[0][1], e = p.points[p.points.length - 1][1]; c.strokeRect(X(s0[trailAx[0]]) - 3, Y(s0[trailAx[1]]) - 3, 6, 6); c.beginPath(); c.arc(X(e[trailAx[0]]), Y(e[trailAx[1]]), 5, 0, 6.2832); c.fill(); c.globalAlpha = 1;
    }
  }

  // ======================= Stage 4.0 screens =======================
  // One disc (the life dish), one achievement card, and everything else a tap away. All of it is read from game.js; nothing here computes biology.
  const S4 = () => !!(game && game.cfg.stage === 4);
  const META_KEY = 'omega_meta4';
  const Meta = (() => {
    const blank = () => ({ codex: {}, feats: {}, runs: {}, omega: 0 });
    const load = () => { try { const m = JSON.parse(localStorage.getItem(META_KEY)); if (m && m.v === 1) return m; } catch (e) { /* none */ } return { v: 1, normal: blank(), special: blank(), heritage: [] }; };
    const store = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); return true; } catch (e) { return false; } };
    return { load, store, blank };
  })();
  let metaKnown = new Set(), runId = 0, metaT = -1, modeSel = 'normal';
  const modeOf = () => (game && game.cfg.heritage ? 'special' : 'normal');
  function metaSync(force) {
    if (!S4() || (!force && game.t - metaT < 500)) return; metaT = game.t; const m = Meta.load(), md = m[modeOf()] || (m[modeOf()] = Meta.blank()), r = game.records4();
    for (const e of r.codex) if (!md.codex[e.id]) md.codex[e.id] = { name: e.name, type: e.type, rarity: e.rarity, bp: e.bp, lineage: e.lineage, seed: r.seed };
    for (const e of r.feats) if (!md.feats[e.id]) md.feats[e.id] = { name: e.name, tier: e.tier, bp: e.bp, lineage: e.lineage, seed: r.seed };
    if (r.omega) md.omega = Math.max(md.omega || 0, 1);
    md.runs[runId] = { seed: r.seed, bp: r.bp, codex: r.codex.length, feats: r.feats.length, rank: r.bestRank, omega: !!r.omega, ts: Date.now() }; const keys = Object.keys(md.runs); if (keys.length > 30) delete md.runs[keys[0]];
    if (modeOf() === 'normal' || true) { const h = game.exportHeritage(); if (h.length) m.heritage = h; } // the relics of the latest world, offered to the special mode
    Meta.store(m);
  }
  // ---- the dish ----
  const dishOff = document.createElement('canvas'); dishOff.width = dishOff.height = 168; const dctx = dishOff.getContext('2d'); let dishImg = null;
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  let dishC = { k: -1, g: null, v: null }, secSmooth = null, dishPainted = null;
  const NOISE = new Float32Array(168 * 168); for (let y = 0; y < 168; y++) for (let x = 0; x < 168; x++) NOISE[y * 168 + x] = hash(x, y) - 0.5; // the edge jitter, computed once
  const dishNow = () => { const k = Math.floor(game.t / 25); if (dishC.k !== k || dishC.g !== game) dishC = { k, g: game, v: game.dish() }; return dishC.v; };
  function picto(c, kind, x, y, s, col) {
    c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.4; c.lineCap = 'round'; c.lineJoin = 'round'; c.translate(x, y);
    if (kind === 'water') { for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(-s, -s * 0.2 + k * s * 0.7); c.quadraticCurveTo(-s * 0.5, -s * 0.8 + k * s * 0.7, 0, -s * 0.2 + k * s * 0.7); c.quadraticCurveTo(s * 0.5, s * 0.4 + k * s * 0.7, s, -s * 0.2 + k * s * 0.7); c.stroke(); } }
    else if (kind === 'underground') { for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-s, -s * 0.7 + k * s * 0.7); c.lineTo(s, -s * 0.7 + k * s * 0.7); c.stroke(); } c.beginPath(); c.moveTo(0, -s); c.lineTo(0, s * 0.9); c.stroke(); }
    else if (kind === 'air') { c.beginPath(); c.arc(-s * 0.4, 0, s * 0.45, Math.PI * 0.5, Math.PI * 1.5); c.arc(0, -s * 0.25, s * 0.55, Math.PI, 0); c.arc(s * 0.45, 0, s * 0.45, Math.PI * 1.5, Math.PI * 0.5); c.closePath(); c.stroke(); }
    else { c.beginPath(); c.moveTo(-s, s * 0.7); c.lineTo(-s * 0.2, -s * 0.8); c.lineTo(s * 0.3, s * 0.1); c.lineTo(s * 0.6, -s * 0.3); c.lineTo(s, s * 0.7); c.closePath(); c.stroke(); }
    c.restore();
  }
  const KIND_PIC = { water: 'water', underground: 'underground', air: 'air', land: 'land' };
  function drawDish() {
    const [W, H2] = fit(cv, cx); cx.clearRect(0, 0, W, H2); const d = dishNow(); if (!d) return;
    const cxp = W / 2, cyp = H2 / 2, R0 = Math.min(W, H2) / 2 - 8;
    // sector widths are smoothed so that the layout drifts instead of jumping
    const target = d.sectors.map((s) => s.a0); if (!secSmooth || secSmooth.g !== game) secSmooth = { g: game, a: target.slice() }; for (let k = 0; k < 4; k++) secSmooth.a[k] += (target[k] - secSmooth.a[k]) * 0.25;
    // the territories, painted pixel by pixel on a small canvas and scaled up (soft, colony-like edges)
    const N = dishOff.width, A = d.A, R = d.R;
    if (dishPainted !== d) { // the picture changes only when the dish is recomputed (every 25 steps); in between the painted image is simply drawn again
    const id = dctx.createImageData(N, N), px = id.data, cols = d.colors.map(hex), foc = d.focus;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - N / 2) / (N / 2), dy = (y + 0.5 - N / 2) / (N / 2), r = Math.sqrt(dx * dx + dy * dy), o = (y * N + x) * 4;
      if (r > 1) { px[o + 3] = 0; continue; }
      const noise = NOISE[y * N + x] * 0.9, f = ((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1, ai = Math.max(0, Math.min(A - 1, Math.floor(f * A + noise))), ri = Math.max(0, Math.min(R - 1, Math.round(r * (R - 1) + noise))), k = ri * A + ai, ow = d.owner[k];
      if (ow < 0) { px[o] = 14; px[o + 1] = 20; px[o + 2] = 28; px[o + 3] = 255; continue; }
      const s = d.strength[k], c1 = cols[ow], sc = d.second[k]; let cr = c1[0], cg = c1[1], cb = c1[2];
      if (sc >= 0) { const c2 = cols[sc]; cr = (cr + c2[0]) / 2; cg = (cg + c2[1]) / 2; cb = (cb + c2[2]) / 2; }
      const a = 0.30 + 0.7 * Math.min(1, s); px[o] = 14 + (cr - 14) * a; px[o + 1] = 20 + (cg - 20) * a; px[o + 2] = 28 + (cb - 28) * a; px[o + 3] = 255;
      if (ow === foc) { // the lineage in focus: a pale outline where its territory meets another
        const k2 = [ri * A + ((ai + 1) % A), ri * A + ((ai + A - 1) % A), Math.min(R - 1, ri + 1) * A + ai, Math.max(0, ri - 1) * A + ai]; if (k2.some((q) => d.owner[q] !== foc)) { px[o] = 235; px[o + 1] = 240; px[o + 2] = 245; }
      }
    }
    dctx.putImageData(id, 0, 0); dishPainted = d; }
    cx.save(); cx.beginPath(); cx.arc(cxp, cyp, R0, 0, 6.2832); cx.clip(); cx.imageSmoothingEnabled = true; cx.drawImage(dishOff, cxp - R0, cyp - R0, R0 * 2, R0 * 2); cx.restore();
    cx.strokeStyle = '#2c3f55'; cx.lineWidth = 2; cx.beginPath(); cx.arc(cxp, cyp, R0, 0, 6.2832); cx.stroke();
    // the civilisation sector (land): its own radial meaning, centre = bound to the environment, outside = changing it
    const land = d.sectors.find((s) => s.id === 'land');
    if (d.civ) { cx.save(); cx.beginPath(); cx.arc(cxp, cyp, R0 * d.civ.r1, (land.a0 - 0.25) * 2 * Math.PI, (land.a1 - 0.25) * 2 * Math.PI); cx.arc(cxp, cyp, R0 * d.civ.r0, (land.a1 - 0.25) * 2 * Math.PI, (land.a0 - 0.25) * 2 * Math.PI, true); cx.closePath(); cx.fillStyle = 'rgba(200,205,210,0.22)'; cx.fill(); cx.strokeStyle = 'rgba(220,225,230,0.7)'; cx.setLineDash([3, 3]); cx.stroke(); cx.restore(); }
    // sector boundaries and pictograms
    d.sectors.forEach((s) => { const a = (s.a0 - 0.25) * 2 * Math.PI; cx.strokeStyle = 'rgba(160,175,190,0.35)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(cxp, cyp); cx.lineTo(cxp + Math.cos(a) * R0, cyp + Math.sin(a) * R0); cx.stroke(); const m = ((s.a0 + s.a1) / 2 - 0.25) * 2 * Math.PI; picto(cx, KIND_PIC[s.id], cxp + Math.cos(m) * (R0 + 0) * 0.93, cyp + Math.sin(m) * R0 * 0.93, 6, 'rgba(225,232,240,0.85)'); });
    if (d.shape.like) { cx.fillStyle = 'rgba(240,245,250,0.9)'; cx.font = '600 15px system-ui'; cx.textAlign = 'center'; cx.fillText('Ω形', cxp, cyp + 5); cx.textAlign = 'left'; }
  }
  function updateMapCap() { const el = $('mapcap'); if (el) el.textContent = S4() ? '扇＝場所／扇の中は時計回りが高温／中心＝高圧' : '円の大きさ＝環境支配力（個体数ではない）／点線＝参考の道筋'; }
  // ---- the achievement card ----
  const ACH_ICON = { codex: '◇', feat: '△', heritage: '⌬', omega: 'Ω' };
  let achSeen = 0, flashUntil = 0;
  function drawAch4() {
    const el = $('ticker'), a = game.achievements[0];
    if (a && a.id !== achSeen) { if (achSeen !== 0 && a.special) { flashUntil = performance.now() + 3200; toast(`${ACH_ICON[a.kind] || ''} ${a.title}`); } achSeen = a.id; }
    el.classList.toggle('flash', performance.now() < flashUntil); el.classList.toggle('ach-special', !!(a && a.special));
    el.innerHTML = a ? `<div class="ach"><span class="ach-i">${ACH_ICON[a.kind] || '・'}</span><div><b>${a.title}</b><small>${a.text}</small></div></div>` : '<div class="ach dim"><span class="ach-i">・</span><div><b>最初の成果を待っています</b><small>生き物が進化すると、ここに成果が出ます</small></div></div>';
    el.onclick = () => document.querySelector('#tabs [data-tab=codex]').click();
  }
  // ---- 図鑑 ----
  let codexFilter = 'all';
  const TYPE_JA = { form: '形態', ability: '能力', tolerance: '耐性', mechanism: '仕組み', codon: 'コドン' };
  function drawCodexTab() {
    const list = game.codex().slice().reverse(), meta = Meta.load()[modeOf()] || Meta.blank(), tot = Object.keys(meta.codex).length;
    const shown = list.filter((e) => codexFilter === 'all' || e.type === codexFilter);
    let h = `<div class="sumline"><b>${list.length}</b>件（この世界）／累計 <b>${tot}</b>件<small>${modeOf() === 'special' ? '特殊モード' : '通常モード'}</small></div><div class="chips" id="codex-f">${['all', 'form', 'ability', 'tolerance', 'mechanism', 'codon'].map((k) => `<button class="chip${codexFilter === k ? ' on' : ''}" data-k="${k}">${k === 'all' ? 'すべて' : TYPE_JA[k]}</button>`).join('')}</div>`;
    h += shown.slice(0, 80).map((e) => `<div class="cx r${Math.min(3, Math.floor(e.rarity * 4))}"><i style="background:${game.creatures[e.lin].color}"></i><div><b>${e.name}</b><small>${TYPE_JA[e.type]}・${e.rarityName}・${game.creatures[e.lin].name}・${bpText(e.bp)}${metaKnown.has(e.id) ? '・別の世界で発見済み' : '・新発見'}</small><small class="cxt">${e.text}</small></div></div>`).join('') || '<div class="note">まだ記録がありません。進化が起こると、実際に現れた形態や能力が記録されます。</div>';
    h += '<div class="note">図鑑は実際の進化の記録です。記録しても能力は与えられず、次の世界の生き物も強くなりません。</div>';
    $('tab-codex').innerHTML = h; $('tab-codex').querySelectorAll('#codex-f .chip').forEach((b) => { b.onclick = () => { codexFilter = b.dataset.k; drawCodexTab(); }; });
  }
  const bpText = (bp) => (bp >= 1e8 ? `${F.num(bp)}年前` : bp >= 1 ? `${F.years(bp)}前` : bp > -1 ? '現代' : `${F.years(-bp)}後`);
  // ---- 偉業 ----
  function drawFeatsTab() {
    const fs = game.feats().slice().reverse(), os = game.omegaStatus(), rk = game.rank, meta = Meta.load()[modeOf()] || Meta.blank();
    let h = `<div class="sumline"><b>${fs.length}</b>件（この世界）／累計 <b>${Object.keys(meta.feats).length}</b>件<small>人口の多さは偉業になりません</small></div>`;
    h += `<div class="card2"><div class="row2"><b>Ωへの道（${game.creatures[game.controlled].name}）</b><span>${game.omega ? 'Ω到達' : os && os.judged ? (os.achieved ? '達成' : '未到達') : '判定中'}</span></div>`;
    if (os && os.judged) h += os.criteria.map((c) => `<div class="ck ${c.met ? 'met' : 'short'}"><span class="ck-i">${c.met ? '✔' : '✕'}</span><div><b>${c.label}</b><small>いま ${typeof c.have === 'number' ? F.num(c.have) : c.have}${c.unit ? c.unit : ''} ／ 必要 ${typeof c.need === 'number' ? F.num(c.need) : c.need}${c.unit ? c.unit : ''}</small></div><em>${c.met ? '達成' : '不足'}</em></div>`).join('') + '<div class="note">Ωの判定は、ランクθ・長い個体の生存・全能力軸・自律・コドンの安定を、長く保ち続けたかどうかで決まります。円盤の見た目では判定しません。暫定の基準です。</div>';
    else h += `<div class="note">${os ? os.reason : '判定中です'}</div>`;
    h += '</div>';
    h += fs.map((e) => `<div class="cx r${Math.min(3, e.tier)}"><i style="background:${game.creatures[e.lin].color}"></i><div><b>${e.name}</b><small>${e.lineage}・${bpText(e.bp)}</small><small class="cxt">${e.text}</small></div></div>`).join('') || '<div class="note">まだ偉業はありません。長寿、わずかな個体での生存、大災厄の突破、極限環境、希少な進化が記録されます。</div>';
    $('tab-feats').innerHTML = h;
  }
  // ---- 年表: what you obtained, kept apart from what merely happened in the background ----
  function drawTimeline4() {
    const mine = game.events.filter((e) => ['codex', 'omega'].includes(e.kind)).slice(-14).reverse(), bgd = game.events.filter((e) => ['world', 'civ', 'evo', 'lineage', 'rank', 'immigration'].includes(e.kind)).slice(-24).reverse();
    const row = (e) => `<div class="tk"><span>${evIcon(e)}</span><div>${e.text}<small>${e.y !== undefined ? bpText(presentY() - e.y) : ''}</small></div></div>`;
    $('tab-log').innerHTML = `<div class="grp">獲得した成果（図鑑・偉業・遺産）</div>${mine.map(row).join('') || '<div class="note">まだありません</div>'}<div class="grp">世界で起きたこと（背景。あなたの成果ではありません）</div>${bgd.map(row).join('') || '<div class="note">まだありません</div>'}`;
  }
  const presentY = () => { const wi = game.worldInfo(); return wi && wi.presentYears ? wi.presentYears : 0; };
  // ---- 系統樹: a fan, time from the centre outwards ----
  let phyloSel = null; const phyloGeom = [];
  function drawPhyloTab() {
    const el = $('tab-phylo'); if (!el.firstChild) el.innerHTML = '<canvas id="fan" width="360" height="360"></canvas><div id="fan-note" class="note"></div><div id="fan-info" class="note"></div>';
    const c = $('fan'), ctx = c.getContext('2d'), W = c.clientWidth || 360; c.width = Math.round(W * 2); c.height = Math.round(W * 2); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, W, W);
    const p = game.phylo(); if (!p) return; p.scale = Math.max(3e8, p.years * 1.12); const presentYrs = presentY(); const cxp = W / 2, cyp = W / 2, Rm = W / 2 - 14, nL = p.roots.length, slice = (2 * Math.PI) / nL; phyloGeom.length = 0; // the fan grows outward as the world ages
    const rOf = (y) => 0.06 + 0.92 * Math.min(1, Math.max(0, y) / p.scale), P = (r, a) => [cxp + Math.cos(a) * r * Rm, cyp + Math.sin(a) * r * Rm];
    ctx.strokeStyle = '#18222e'; ctx.lineWidth = 1; for (const f of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); ctx.arc(cxp, cyp, f * Rm, 0, 6.2832); ctx.stroke(); }
    if (p.years >= presentYrs) { ctx.strokeStyle = '#3a4c60'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(cxp, cyp, rOf(presentYrs) * Rm, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
    const ang = new Map(); // node angles: leaves spread across the slice, parents at the mean of their children
    p.roots.forEach((rt) => {
      const a0 = -Math.PI / 2 + rt.lin * slice, kids = p.nodes.filter((n) => n.lin === rt.lin), byPar = new Map(); for (const n of kids) { const k = n.parent === null ? 'root' : n.parent; (byPar.get(k) || byPar.set(k, []).get(k)).push(n); }
      const leaves = kids.filter((n) => !byPar.has(n.id)), step = slice * 0.84 / Math.max(1, leaves.length); let li = 0; const place = (n) => { const ch = byPar.get(n.id); if (!ch) { ang.set(n.id, a0 + slice * 0.08 + step * (li++ + 0.5)); return; } ch.forEach(place); ang.set(n.id, ch.reduce((s, x) => s + ang.get(x.id), 0) / ch.length); };
      (byPar.get('root') || []).forEach(place); rt.angle = a0 + slice / 2;
    });
    p.roots.forEach((rt) => { // the lineage's own spine
      const last = Math.max(rOf(p.years), 0.1), col = rt.color, a = rt.angle, focus = rt.lin === p.focus; ctx.strokeStyle = col; ctx.globalAlpha = rt.alive > 0 ? (focus ? 1 : 0.7) : 0.35; ctx.lineWidth = focus ? 3 : 1.6; ctx.beginPath(); const [x0, y0] = P(0.04, a), [x1, y1] = P(rt.alive > 0 ? last : Math.max(0.1, rOf((rt.ends[rt.ends.length - 1] || { y: 0 }).y)), a); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.globalAlpha = 1;
      for (const e of rt.ends) { const [ex, ey] = P(rOf(e.y), a); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke(); }
      const [lx, ly] = P(1.0, a); ctx.fillStyle = col; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(rt.name.replace(/型$/, ''), lx, ly + 3);
    });
    for (const n of p.nodes) { // branches
      const rt = p.roots[n.lin], a = ang.get(n.id), par = n.parent !== null ? p.nodes.find((q) => q.id === n.parent) : null, [x, y] = P(rOf(n.y), a), [px, py] = par ? P(rOf(par.y), ang.get(par.id)) : P(rOf(n.y), rt.angle);
      ctx.strokeStyle = rt.color; ctx.globalAlpha = n.status === 'established' ? 0.9 : 0.45; ctx.lineWidth = n.status === 'established' ? 1.8 : 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
      const sz = n.kind === 'fusion' ? 4 : n.kind === 'separation' ? 3.5 : 3; ctx.fillStyle = n.status === 'established' ? rt.color : '#0b1118'; ctx.strokeStyle = rt.color; ctx.lineWidth = 1.4; ctx.beginPath(); if (n.kind === 'fusion') { ctx.rect(x - sz, y - sz, sz * 2, sz * 2); } else if (n.kind === 'separation') { ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y + sz); ctx.lineTo(x - sz, y + sz); ctx.closePath(); } else ctx.arc(x, y, sz, 0, 6.2832); ctx.fill(); ctx.stroke();
      phyloGeom.push({ id: n.id, x, y, n });
    }
    ctx.lineWidth = 1.2; for (const l of p.links) { const to = p.nodes.find((q) => q.id === l.to); if (!to) continue; const [tx, ty] = P(rOf(to.y), ang.get(to.id)), [fx, fy] = P(rOf(to.y) * 0.9, p.roots[l.fromLin].angle); ctx.strokeStyle = l.type === 'fusion' ? '#c58cf0' : l.type === 'heritage' ? '#e8c36a' : '#6fd0d6'; ctx.setLineDash(l.type === 'fusion' ? [] : [3, 3]); ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(cxp, cyp, tx, ty); ctx.stroke(); }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    $('fan-note').innerHTML = `外側ほど新しい時代。点線の円＝現代。◯分岐 □融合 △分離 ✕絶滅。紫＝融合、水色の点線＝機能交換、金の点線＝遺産の継承。表示${p.shown}／記録${p.tracked}（消えた古い枝は数だけ：${p.roots.map((r) => (r.lostClades ? `${r.name.replace(/型$/, '')}${r.lostClades}` : '')).filter(Boolean).join('・') || 'なし'}）`;
    c.onclick = (ev) => { const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) * (W / r.width), y = (ev.clientY - r.top) * (W / r.height); let best = null, bd = 18; for (const g of phyloGeom) { const dd = Math.hypot(g.x - x, g.y - y); if (dd < bd) { bd = dd; best = g; } } phyloSel = best ? best.n : null; $('fan-info').innerHTML = phyloSel ? `<b>${phyloSel.label}</b><br>${bpText(presentY() - phyloSel.y)}／いま${F.num(phyloSel.carriers)}個体が受け継いでいる（${phyloSel.status === 'established' ? '定着' : '途中'}）` : '枝をタップすると説明が出ます'; };
  }
  // ---- コドン ----
  let codonExpand = false; const CODON_COL = { tolerance: '#c9786e', metabolism: '#d9a35f', repairRate: '#7fb89a', dormancyDepth: '#7fb8c4', predation: '#a98cd6', movement: '#6f9fe0', immune: '#d4c46a', fecundity: '#d98fb0' };
  function drawCodonTab() {
    const lin = game.controlled, info = game.codonInfo(lin), el = $('tab-codon'); if (!info) { el.innerHTML = '<div class="note">この系統は絶えています。主注目系統を切り替えてください。</div>'; return; }
    if (!el.firstChild || !$('codon-cv')) el.innerHTML = '<div class="chips"><button class="chip" id="cx-tog"></button></div><canvas id="codon-cv" width="360" height="200"></canvas><div id="codon-num"></div>';
    $('cx-tog').textContent = codonExpand ? '展開表示（機能に必要な長さ）' : '圧縮表示（実際の長さ）'; $('cx-tog').onclick = () => { codonExpand = !codonExpand; drawCodonTab(); };
    const c = $('codon-cv'), W = c.clientWidth || 360, cell = 12, perRow = Math.max(8, Math.floor((W - 16) / cell)), genes = info.genes; c.width = Math.round(W * 2); const total = genes.reduce((s, g) => s + (codonExpand ? g.len0 : g.len), 0), MAXC = perRow * 14, rows = Math.min(14, Math.ceil(Math.min(total, MAXC) / perRow)); c.height = Math.round((rows * (cell + 6) + 14) * 2); c.style.height = (rows * (cell + 6) + 14) + 'px';
    const ctx = c.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, W, rows * (cell + 6) + 14); let k = 0, shown = 0;
    // a strip of base-pair-like rungs, left-top to right-bottom, turning back on itself at each row end (boustrophedon)
    for (const g of genes) {
      const n = codonExpand ? g.len0 : g.len, col = g.reg ? '#6c7a89' : g.eff.length ? CODON_COL[g.eff.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0][0]] || '#8895a3' : '#8895a3';
      for (let q = 0; q < n; q++, k++) {
        if (k >= MAXC) break; const row = Math.floor(k / perRow), pos = k % perRow, x = 8 + (row % 2 === 0 ? pos : perRow - 1 - pos) * cell + cell / 2, y = 10 + row * (cell + 6) + cell / 2;
        ctx.globalAlpha = g.on ? 1 : 0.3; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - 5, 2, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(x, y + 5, 2, 0, 6.2832); ctx.fill();
        if (g.sym) { ctx.strokeStyle = '#c58cf0'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.stroke(); }
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
    if (info.series.length) { const sc = $('codon-ser'), ctx2 = sc.getContext('2d'), n = info.series.length, mx = Math.max(...info.series.map((x) => Math.max(x.Lp, x.info))) * 1.1 || 1; ctx2.clearRect(0, 0, 320, 90); for (const [key, dash, col] of [['Lp', [], '#8fb4d8'], ['info', [3, 3], '#c9d6a0']]) { ctx2.strokeStyle = col; ctx2.setLineDash(dash); ctx2.beginPath(); info.series.forEach((x, i) => { const px = n === 1 ? 160 : (i / (n - 1)) * 316 + 2, py = 86 - (x[key] / mx) * 80; if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py); }); ctx2.stroke(); } ctx2.setLineDash([]); }
  }
  // ---- 詳細: the older screens, behind one tab ----
  const DETAIL_SUBS = [['stat', '状況'], ['ind', '個体'], ['trait', '形質'], ['graph', '推移'], ['env', '生息域'], ['world', '世界'], ['rank', 'ランク'], ['about', '説明']];
  const DETAIL_SET = new Set(DETAIL_SUBS.map((x) => x[0])); let detailSub = 'stat';
  let navKey = '';
  function drawDetailNav() { const el = $('detailnav'); el.hidden = !(S4() && DETAIL_SET.has(tab)); if (el.hidden) { navKey = ''; return; } if (navKey === tab) return; navKey = tab; /* rebuilt only when the tab changes: a button that is replaced between touch-down and touch-up cannot be tapped */ el.innerHTML = DETAIL_SUBS.map(([k, n]) => `<button class="chip${tab === k ? ' on' : ''}" data-k="${k}">${n}</button>`).join(''); el.querySelectorAll('.chip').forEach((b) => { b.onclick = () => { detailSub = b.dataset.k; setTab(detailSub); }; }); }
  function setTab(t) { tab = t; const nav = document.querySelector('#tabs'); nav.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t || (x.dataset.tab === 'detail' && DETAIL_SET.has(t) && S4()))); for (const id of ['world', 'stat', 'ind', 'rank', 'trait', 'graph', 'env', 'log', 'codex', 'phylo', 'codon', 'feats', 'about']) { const e = $('tab-' + id); if (e) e.hidden = id !== t; } drawDetailNav(); draw(true); }
  function drawAbout() {
    $('tab-about').innerHTML = `<div class="note"><b>時間のしくみ</b>：1ステップ＝30日とみなします。世界の時計（年）は、計算したステップと、跳躍（世界のモデルだけを進める）で進みます。跳躍のあと、実際の世代の代わりに最大240ステップだけ、突然変異を2倍にして計算します（近似）。省略した世代は進化として数えません。</div>
      <div class="note"><b>地球史</b>：約38億年前（生命の起源の年代には幅があります）から現代まで、酸素・紫外線・陸と空の食べ物・氷河時代・大量絶滅は史実の年代にそろえた外部条件です。どの系統が生き残るかは固定していません。最初の高度な文明は現生人類（約1.2万年前の農耕から）で、それ以前に文明は起きません。現代以降は未来史で、決まっていません。</div>
      <div class="note"><b>円盤</b>：扇＝場所の種類、扇の中の角度＝温度（時計回りが高温）、半径＝圧力（中心が高圧）。陸だけは半径が生活の層（中心＝環境に縛られる、外＝環境を変える文明）。色の面積は個体数ではなく、実際の分布と環境支配力から決まります。</div>
      <div class="note"><b>遺産と図鑑</b>：すべて実際の進化の記録です。能力を与えることはできません。遺産は、絶えた系統の遺伝子の断片が拾われることがあるというだけで、失敗や消失があります。</div>
      <div class="note"><b>仮定</b>：頻度・重み・基準値の多くはゲーム上の仮定で、科学的に実証したものではありません。詳細は設計記録にあります。</div>`;
  }
  const dishRefresh = () => { drawDish(); };

  let lastTabT = -999, tkN = -1, stratKey = '', linKey = '', rsT = -999;
  function draw(force) {
    if (!game) return; const st = game.live.stats();
    if (S31()) drawHud31(); else drawHud(); if (S4()) drawDish(); else if (game.cfg.realms) drawWorld2(st); else drawWorld(st);
    const lk = game.lineageReport().map((l) => (S31() ? (l.alive > 0 ? 1 : 0) : l.alive) + ':' + (game.rank.byLin[l.lin] && game.rank.byLin[l.lin].current ? game.rank.byLin[l.lin].current.rank : '')).join(',') + '|' + game.controlled; if (force || lk !== linKey) { linKey = lk; if (S31()) drawLinbar31(); else drawLinbar2(); }
    const th = ADAPT() ? game.threat() : null, sk = (ADAPT() ? game.strategies().join(',') + (th ? th.stance : '') : '') + '|' + game.controlled; if (force || sk !== stratKey) { stratKey = sk; if (S31()) drawStance31(); else drawStratbar(); }
    if (force || tkN !== game.events.length) { tkN = game.events.length; if (S4()) drawAch4(); else if (S31()) drawTicker31(); else drawTicker(); }
    if (force || st.t - rsT >= 50 || st.t < rsT) { rsT = st.t; if (S31()) drawRankStrip31(); else drawRankStrip(); }
    const due = force || st.t - lastTabT >= 25; if (due && tab !== 'env') lastTabT = st.t;
    if (S4()) drawDetailNav();
    if (tab === 'codex') { if (due) drawCodexTab(); }
    else if (tab === 'phylo') { if (due || force) drawPhyloTab(); }
    else if (tab === 'codon') { if (due) drawCodonTab(); }
    else if (tab === 'feats') { if (due) drawFeatsTab(); }
    else if (tab === 'about') { if (force) drawAbout(); }
    else if (tab === 'log' && S4()) { if (due || logN !== game.events.length) { drawTimeline4(); logN = game.events.length; } }
    else if (tab === 'world') { if (due) drawWorldTab(); }
    else if (tab === 'stat') { if (due) drawStat(st); }
    else if (tab === 'ind') { if (due) drawIndTab(); }
    else if (tab === 'rank') { if (due) drawRankTab(); }
    else if (tab === 'trait') { if (due) drawTrait(); }
    else if (tab === 'graph') { if (due) drawChart(); }
    else if (tab === 'env') { if (force || !envShown) { renderEnvControls(); drawHabitat(); drawEnvNote(); envShown = true; lastEnvT = st.t; } else if (st.t - lastEnvT >= 25) { drawEnvNote(); if (ov !== 'none') drawHabitat(); lastEnvT = st.t; } }
    else if (tab === 'log' && !S4() && (force || logN !== game.events.length)) { drawLog(); logN = game.events.length; }
  }


  document.addEventListener('visibilitychange', () => { if (document.hidden && game) { metaSync(true); } }); // Stage 5.1: no game save here (milestones only)
  renderStart(); requestAnimationFrame(frame);
  window.__omega = { layoutNames: () => [0, 1, 2, 3].map((slot) => E.REALM_DEFS[REALM_OF_SLOT[slot]].name), speeds: SPEEDS, get hv() { return hv; }, get game() { return game; }, begin, setSpeed, loadSlot, get playing() { return playing; } };
})();
