'use strict';
(function () {
  const E = OmegaEngine19, G = OmegaGame, TM = OmegaTime, H = OmegaHabitat, HS = OmegaHistory, AD = OmegaAdaptation;
  const $ = (id) => document.getElementById(id);
  const SPEEDS = [10, 30, 100, 400, 1500, 6000], SPEED_LABEL = ['×1', '×3', '×10', '×40', '×150', '×600']; // target steps per second
  const SLOT_OF_REALM = [3, 0, 2, 1], REALM_OF_SLOT = [1, 3, 2, 0]; // realm ids are water, land, underground, air; slots are top-left, top-right, bottom-left, bottom-right. Land TL, air TR, underground BL, water BR
  const REALM_COLOR = { water: '#4fa3ff', land: '#46c28a', underground: '#f2a03d', air: '#b38cf0' };
  const KEY = 'omega-codon-saves-v1', SKEY = 'omega-codon-settings-v2';
  const MODE_JA = ['休眠', '待機', '探索', '狩り', '修復', '移行'];
  const CAUSE_JA = { capacityCull: '過密', extrinsic: '事故', starvation: '飢餓', senescence: '老衰', thermal: '寒暖', pathogen: '病気', disaster: '災害', injury: '狩りの傷' };
  let sel = ['standard'], rivalN = 2, measured = { rate: 0, t: 0, steps: 0 }, scenarioId = 'kpg', envId = 'steady', game = null, playing = false, speedIdx = 1, tab = 'stat', metric = 'pop', loading = null;
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
  function putSave(slot, label) {
    if (!game) return false;
    const s = readSaves(); s[slot] = { ...game.save(), ts: Date.now(), label: label || describe(game) };
    return writeSaves(s);
  }
  function describe(g) { const st = g.live.stats(); return `${g.cfg.creatures.map((id) => G.CREATURES.find((c) => c.id === id).name).join('・')} ／ ${st.t}ステップ ／ ${st.population}体`; }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 1800); }

  // ---------- start screen ----------
  function renderStart() {
    $('creatures').innerHTML = '';
    for (const c of G.CREATURES) {
      const b = document.createElement('button'); b.className = 'cr' + (sel.includes(c.id) ? ' on' : '');
      b.innerHTML = `<i style="background:${c.color}"></i><div><b>${c.name}</b><span>${c.text}</span></div>`;
      b.onclick = () => { if (sel.includes(c.id)) { if (sel.length > 1) sel = sel.filter((x) => x !== c.id); } else if (sel.length < 3) sel.push(c.id); else toast('選べるのは3種までです'); renderStart(); };
      $('creatures').appendChild(b);
    }
    $('rivals').innerHTML = '';
    const maxR = Math.max(0, G.MAX_LINEAGES - sel.length); if (rivalN > maxR) rivalN = maxR;
    for (let n = 0; n <= Math.min(2, maxR); n++) { const b = document.createElement('button'); b.className = 'chip' + (n === rivalN ? ' on' : ''); b.textContent = n === 0 ? 'なし' : n + '種'; b.onclick = () => { rivalN = n; renderStart(); }; $('rivals').appendChild(b); }
    const seedNow = Math.max(1, Math.floor(Number($('seed').value)) || 1), rv = G.pickRivals(seedNow, sel, rivalN);
    $('rival-preview').textContent = rv.length ? '競争相手（乱数の種から自動で決まります）：' + rv.map((id) => G.CREATURES.find((c) => c.id === id).name).join('・') : '競争相手なし：選んだ生き物だけが計算されます。';
    $('scenarios').innerHTML = '';
    for (const [id, n] of [['kpg', '白亜紀末の隕石衝突から（約6,600万年前）'], ['free', '自由（衝突なし）']]) { const b = document.createElement('button'); b.className = 'chip' + (id === scenarioId ? ' on' : ''); b.textContent = n; b.onclick = () => { scenarioId = id; renderStart(); }; $('scenarios').appendChild(b); }
    $('envs').innerHTML = '';
    for (const e of G.ENVIRONMENTS) { const b = document.createElement('button'); b.className = 'chip' + (e.id === envId ? ' on' : ''); b.textContent = e.name; b.title = e.text; b.onclick = () => { envId = e.id; renderStart(); }; $('envs').appendChild(b); }
    renderSlots($('slots-start'));
  }
  function renderSlots(el, withSave) {
    const s = readSaves(); el.innerHTML = '';
    const names = [['auto', '自動保存'], ['s1', 'スロット1'], ['s2', 'スロット2'], ['s3', 'スロット3']];
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
  $('go').onclick = () => { const seed = Math.max(1, Math.floor(Number($('seed').value)) || 1); begin(G.newGame(E, { creatures: sel.slice(), rivals: G.pickRivals(seed, sel, rivalN), environment: envId, seed, realms: true, scenario: scenarioId, ecology: 'v2' })); };

  // ---------- play ----------
  function begin(g) {
    game = g; startTraits = g.series[0] ? g.series[0].traits.slice() : null; playing = true; lastAuto = g.t;
    $('start').hidden = true; $('play').hidden = false; $('modal').hidden = true;
    buildSpeeds(); measured = { rate: 0, t: performance.now(), steps: g.t };
    $('legend').innerHTML = '<div><b>点の意味</b>（アリーナ＝詳細に計算している範囲）</div><div>● 注目系統　■ 競争相手・移入した系統　1点＝<b>実際の1個体</b>　点の大きさ＝<b>その個体のエネルギー量</b>　赤い輪＝狩り中　薄い＝休眠</div><div>下の「背景」の1点＝背景集団の<b>10単位</b>（個体数ではなく、粗い計算の代表集団）　点の大きさ＝<b>直近の増殖率</b></div>';
    setSpeed(speedIdx); setPP(); setAutoBtn(); draw(true);
    if (g.pending) showPrompt();
  }
  function setAutoBtn() { const on = !!(game && game.autoContinuous); $('auto').textContent = '自動：' + (on ? 'ON' : 'OFF'); $('auto').classList.toggle('on', on); $('auto-note').textContent = on ? '分岐点では止まらず、中立的な「見守る」を選びます（履歴に理由を残します）' : '分岐点で止まります'; }
  $('auto').onclick = () => { if (!game) return; game.setAutoContinuous(!game.autoContinuous); setAutoBtn(); toast(game.autoContinuous ? '連続自動モード ON' : '連続自動モード OFF'); };
  function buildSpeeds() { const el = $('speeds'); if (el.children.length) return; SPEED_LABEL.forEach((n, i) => { const b = document.createElement('button'); b.dataset.s = i; b.textContent = n; b.onclick = () => setSpeed(i); el.appendChild(b); }); }
  function setSpeed(i) { speedIdx = i; document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === i)); }
  function setPP() { $('pp').textContent = playing ? '⏸' : '▶'; }
  $('pp').onclick = () => { if (!game || game.pending || game.live.done || loading) return; playing = !playing; setPP(); };
  $('save').onclick = () => { if (!game) return; playing = false; setPP(); openMenu(true); };
  $('menu').onclick = () => { if (!game) return; playing = false; setPP(); openMenu(false); };
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); for (const t of ['stat', 'trait', 'graph', 'env', 'log']) $('tab-' + t).hidden = t !== tab; draw(true); }; });

  function openMenu(saveFocus) {
    const card = $('modal-card'); card.innerHTML = `<h3>${saveFocus ? '保存' : 'メニュー'}</h3><div id="menu-slots"></div>`;
    const slots = card.querySelector('#menu-slots'); renderSlots(slots, true);
    const mk = (t, f, cls) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || '') + ' big'; b.textContent = t; b.onclick = f; card.appendChild(b); };
    mk('閉じて続ける', () => { $('modal').hidden = true; if (!game.pending && !game.live.done) { playing = true; setPP(); } }, 'primary');
    mk('タイトルに戻る（自動保存します）', () => { putSave('auto'); game = null; playing = false; $('modal').hidden = true; $('play').hidden = true; $('start').hidden = false; renderStart(); });
    $('modal').hidden = false;
  }

  function showPrompt() {
    const p = game.pending; if (!p) return; playing = false; setPP(); putSave('auto');
    const card = $('modal-card'); card.innerHTML = `<h3>分岐点：${p.title}</h3><p class="note">${p.text}</p><p class="note">環境への介入は全系統に平等に働きます。選ぶのは1つだけ。</p>`;
    for (const o of p.options) { const b = document.createElement('button'); b.className = 'opt' + (o.id === 'auto' ? ' auto' : ''); b.innerHTML = `<b>${o.name}</b><span>${o.text}</span>`; b.onclick = () => { game.choose(o.id, 'once'); putSave('auto'); $('modal').hidden = true; playing = true; setPP(); draw(true); }; card.appendChild(b); }
    const c = document.createElement('button'); c.className = 'opt auto'; c.innerHTML = '<b>以後ずっと自動にする</b><span>連続自動モードをONにして、この分岐点も自動で進めます。あとで画面の「自動イベント」ボタンでOFFに戻せます。</span>';
    c.onclick = () => { game.setAutoContinuous(true); game.choose('auto', 'continuous'); setAutoBtn(); putSave('auto'); $('modal').hidden = true; playing = true; setPP(); draw(true); }; card.appendChild(c);
    $('modal').hidden = false;
  }
  function showEnd() {
    playing = false; setPP(); putSave('auto');
    const st = game.live.stats(), card = $('modal-card');
    card.innerHTML = `<h3>${st.population ? '観察終了' : '絶滅しました'}</h3><p style="white-space:pre-line">${game.summary().text}</p>`;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = 'タイトルに戻る'; b.onclick = () => { game = null; $('modal').hidden = true; $('play').hidden = true; $('start').hidden = false; renderStart(); }; card.appendChild(b);
    $('modal').hidden = false;
  }

  function loadSlot(k) {
    const sv = readSaves()[k]; if (!sv) return;
    let g; try { g = G.loadGame(E, sv); } catch (e) { toast('読み込めませんでした'); return; }
    playing = false; loading = { g, target: sv.t };
    const card = $('modal-card'); card.innerHTML = `<h3>読み込み中…</h3><p class="note">${sv.label}<br>保存した地点まで再現しています（同じ結果になります）。</p><div class="prog"><div id="prog"></div></div>`;
    $('modal').hidden = false; $('start').hidden = true; $('play').hidden = false;
    const tick = () => {
      const t0 = performance.now();
      while (loading.g.replayTo !== null && performance.now() - t0 < 14) loading.g.advance(20);
      $('prog').style.width = Math.min(100, (loading.g.t / Math.max(1, loading.target)) * 100) + '%';
      if (loading.g.replayTo !== null) requestAnimationFrame(tick); else { const gg = loading.g; loading = null; begin(gg); playing = !gg.pending; setPP(); toast('読み込みました'); }
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
    if (playing && !game.pending && !game.live.done) {
      acc += dt * SPEEDS[speedIdx]; const t0 = performance.now(), budget = speedIdx >= 4 ? 11 : 8, chunk = speedIdx >= 4 ? 25 : 10;
      while (acc >= 1 && performance.now() - t0 < budget && !game.pending && !game.live.done) { const n = Math.min(Math.floor(acc), chunk); game.advance(n); acc -= n; }
      if (acc > SPEEDS[speedIdx] * 0.2) acc = SPEEDS[speedIdx] * 0.2; // drop the backlog instead of falling ever further behind
      if (game.t - lastAuto >= 500) { putSave('auto'); lastAuto = game.t; }
      if (game.pending) showPrompt(); else if (game.live.done) showEnd();
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
  const bc = $('bgstrip'), bx = bc.getContext('2d');
  function drawBackground() {
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
    const cmpHtml = game.v2 ? '<div class="grp">系統の比較（実際に計算した値）</div><table class="cmp"><tr><th>系統</th><th>個体数</th><th>直近増減</th><th>出生率</th><th>死亡率</th><th>平均寿命</th><th>摂取/個体</th><th>エネルギー合計</th></tr>' + rep.map((l) => { const w = l.window, ls = l.stats; return `<tr><td><i style="color:${l.color}">${l.role === 'focus' ? '●' : '■'}</i> ${l.name}</td><td>${l.alive}</td><td class="${l.change100 > 0 ? 'up' : l.change100 < 0 ? 'dn' : ''}">${l.change100 === null ? '-' : (l.change100 > 0 ? '+' : '') + l.change100}</td><td>${w ? fmt(w.birthRate * 100, 1) : '-'}</td><td>${w ? fmt(w.deathRate * 100, 1) : '-'}</td><td>${ls.deaths ? fmt(ls.lifeSum / ls.deaths, 1) : '-'}</td><td>${w ? fmt(w.intakePerIndividual, 2) : '-'}</td><td>${fmt(ls.energy, 0)}</td></tr>`; }).join('') + '</table><p class="note">出生率・死亡率は、1個体あたり100ステップあたりの数（直近約100ステップ）。平均寿命は死亡した個体の平均（ステップ）。摂取は1個体・1ステップあたりのエネルギー。エネルギー合計は生物量の代わりの指標で、体の大きさは計算していません。</p>' +
      (() => { const d = game.diversity(); return `<p class="note">多様性（計算している範囲の中で）：アリーナに系統 ${d.arenaRichness}（シャノン指数 ${d.arenaShannon.toFixed(2)}）／背景のグループ ${d.backgroundRichness}（${d.backgroundShannon.toFixed(2)}）。${d.note}</p>`; })() : '';
    const bgr = game.backgroundReport(), bgHtml = bgr ? '<div class="grp">背景生態系（アリーナの外・粗い計算）</div>' + `<table class="cmp"><tr><th>グループ</th><th>単位</th><th>増殖</th><th>移入累計</th><th>状態</th></tr>${bgr.groups.map((g) => `<tr><td><i style="color:${g.color}">◆</i> ${g.name}</td><td>${g.extinct ? '-' : Math.round(g.units)}</td><td class="${g.growth > 0 ? 'up' : g.growth < 0 ? 'dn' : ''}">${g.extinct ? '-' : (g.growth * 100).toFixed(1) + '%'}</td><td>${g.immigrantsTotal}</td><td>${g.extinct ? '絶えた' : g.inArena ? 'アリーナにも' : '背景のみ'}</td></tr>`).join('')}</table><p class="note">単位は個体相当の量で、個体数そのものではありません。アリーナの個体と背景の単位は別の場所のもので、重ねて数えていません。背景から来た個体は進化していない祖先型です。${bgr.note}</p>` : '';
    $('tab-stat').innerHTML = histHtml + realmHtml + cmpHtml + bgHtml + '<div class="grp">注目系統（あなたが選んだ生き物）</div>' + linRows(focus) +
      (riv.length ? '<div class="grp">競争相手（独立に進化を計算）</div>' + linRows(riv) + '<p class="note">競争相手を捕食する関係は計算していません（獲物は全系統に共通の背景資源です）。</p>' : '<div class="grp">競争相手</div><p class="note">なし。選んだ生き物だけが計算されています。</p>') +
      `<div class="grp">背景の生態系（選ばれなかった多数の生き物）</div><p class="note">選ばれなかった生き物は個別には計算せず、植物資源と獲物という背景に簡略化しています。種数や背景の個体数は計算していないので、数字は出しません。</p>` +
      kv([['獲物の残り（容量比）', Math.round(bg.preyFraction * 100) + '%'], ['植物資源（区画平均）', bg.plantResource.toFixed(1)]]) +
      '<div class="grp">集団全体</div>' + kv([
      ['個体数（全系統）', st.population], ['平均寿命（死亡した個体）', st.meanLifespan ? st.meanLifespan.toFixed(1) + ' ステップ' : '-'], ['現在の平均年齢', st.meanAge.toFixed(1)],
      ['平均エネルギー', st.meanEnergy.toFixed(2)], ['誕生／死亡（累計）', `${st.births} ／ ${st.deaths}`], ['捕獲した獲物（累計）', st.catches],
      ['代謝の平均', game.series.length ? game.series[game.series.length - 1].traits[0].toFixed(2) : '-'],
      ['行動の割合（休眠/待機/探索/狩り/修復）', st.modes.slice(0, 5).map((v) => Math.round((v / tot) * 100) + '%').join(' '), 1], ['死因（累計）', tc, 1]]);
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
    $('tab-trait').innerHTML = '<p class="note">各系統を最初に観察したときの平均値と比べた変化です。<b>変化と生存結果は並べて示しているだけで、変化が結果の原因かどうかは検証していません。</b></p>' + rep.map((e) => {
      const ch = e.rows.filter((r) => r.changed), cg = e.cognition;
      return `<div class="evo"><h4><i style="color:${e.color}">${e.role === 'focus' ? '●' : '■'}</i> ${e.name}${e.role === 'rival' ? '（競争相手）' : e.role === 'immigrant' ? '（移入）' : ''}　<small>${e.alive}体</small></h4>` +
        (ch.length ? ch.map((r) => `<div class="chg">${r.delta > 0 ? '＋' : '－'} <b>${r.text}</b>（${r.from.toFixed(2)}→${r.to.toFixed(2)}）</div>`).join('') : '<div class="chg na">大きな形質の変化はまだありません。</div>') +
        `<div class="chg" style="margin-top:4px">同じ期間：個体数 ${e.outcome.populationThen === null ? '-' : e.outcome.populationThen}→${e.outcome.populationNow}、累計の出生 ${e.outcome.birthsTotal}／死亡 ${e.outcome.deathsTotal}${e.outcome.topCause ? `、死因の最多は${CAUSE_JA[e.outcome.topCause.cause] || e.outcome.topCause.cause}（${Math.round(e.outcome.topCause.share * 100)}%）` : ''}</div>` +
        `<div class="chg">認知・学習の指標：<b>${cg.index === null ? '-' : cg.index.toFixed(2)}</b>（最初 ${cg.base.toFixed(2)}）<small>＝${cg.parts}。知能そのものの測定ではありません</small></div>` +
        `<div class="chg na">社会性・情報共有：未計算（エンジンに無い）　ミーム（文化・技術）への依存度：未計算（文明モデルは後の段階）　陣営：ゲノム側（自己の遺伝的な適応が中心）</div></div>`;
    }).join('');
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
    $('tab-log').innerHTML = game.events.slice().reverse().slice(0, 120).map((e) => `<div class="ev ${e.kind}"><small>${e.t}ステップ／約${e.gen}世代</small>${e.text}</div>`).join('') || '<p class="note">まだ出来事はありません。</p>';
  }
  function drawTimeline(ti) {
    const a = TM.find(assume), hi = game.historyInfo();
    if (hi) { $('timeline').innerHTML = `経過 <b>${ti.steps}ステップ ≈ 衝突から${TM.formatDays(ti.steps)}</b>（仮定：1ステップ=1日・未校正）<br>地球史：<b>${HS.formatYearsBP(HS.KPG_AGE_YEARS_BP)}</b>（K–Pg境界）＋ 約${hi.yearsSinceImpact.toFixed(1)}年　参考（世代×平均寿命）≈ ${Math.round(ti.lifespanReferenceSteps)}ステップ分　<a href="#" id="why-time" style="color:var(--accent)">これは何？</a>`; const w0 = $('why-time'); if (w0) w0.onclick = (e) => { e.preventDefault(); openTimeInfo(); }; return; }
    $('timeline').innerHTML = `経過 <b>${ti.steps}ステップ ≈ ${TM.format(ti.steps, assume)}</b>（仮定：${a.name}）<br>参考：世代×その時点の平均寿命 ≈ <b>${Math.round(ti.lifespanReferenceSteps)}ステップ分 ≈ ${TM.format(ti.lifespanReferenceSteps, assume)}</b>　<a href="#" id="why-time" style="color:var(--accent)">これは何？</a>`;
    const w = $('why-time'); if (w) w.onclick = (e) => { e.preventDefault(); openTimeInfo(); };
  }
  function openTimeInfo() {
    const ti = game.timeInfo(), card = $('modal-card'), p = playing; playing = false; setPP();
    card.innerHTML = `<h3>時間の表示について</h3><div class="assume">この時間は<b>仮定</b>です。エンジンが数えているのは「ステップ」だけで、日・年への換算は<b>校正されていません</b>。下で選ぶ換算は、見やすくするための仮の目盛りです。</div>
      <p class="note">・経過：ステップ数に、選んだ仮定（${TM.find(assume).name}）を掛けた値。<br>・推定世代：各区間の平均世代時間（親が子を産んだときの年齢の平均）で、経過ステップを割って足し合わせた値。寿命が変わっても減りません。<br>・参考（世代×平均寿命）：各区間の世代の増分に、その区間の平均寿命を掛けて足した値。真の経過時間ではなく、世代と寿命の関係を見るための参考値です。<br>・現在の区間：世代時間 ${ti.windowGenerationTime ? ti.windowGenerationTime.toFixed(1) : '-'} ステップ／平均寿命 ${ti.windowLifespan ? ti.windowLifespan.toFixed(1) : '-'} ステップ。<br>・将来の長期設定では、開始は約6,600万年前の想定です。いまのステップとの対応は未校正で、この画面の値は6,600万年前からの経過年ではありません。</p>
      ${game.historyInfo() ? (() => { const sc = HS.scaleCheck(ti.windowLifespan || 0, ti.windowGenerationTime || 0); return `<div class="assume"><b>地球史モードの時間尺度（仮定）：</b>1ステップ=1日に固定されています。いまの区間では、平均寿命は約${Math.round(sc.lifespanDays)}日、世代時間は約${Math.round(sc.generationDays)}日に相当します。${sc.note}<br>6,600万年を1ステップずつ進めることは想定していません。時代を飛び越す粗い時間尺度は未実装です。</div>`; })() : ''}
      <select id="assume-sel"${game.historyInfo() ? ' disabled' : ''}>${TM.ASSUMPTIONS.map((a) => `<option value="${a.id}"${a.id === assume ? ' selected' : ''}>${a.name}（仮定）</option>`).join('')}</select>`;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = '閉じる'; b.onclick = () => { if (!game.historyInfo()) assume = $('assume-sel').value; saveSettings(); $('modal').hidden = true; if (p && !game.pending && !game.live.done) { playing = true; setPP(); } draw(true); }; card.appendChild(b);
    $('modal').hidden = false;
  }

  // ---------- habitat map (tab 環境) ----------
  const hc = $('habitat'), hx = hc.getContext('2d');
  let hRects = [], ov = ['none', 'lineage', 'individual'].includes(settings.ov) ? settings.ov : 'none', ovHist = settings.ovHist === 'hist' ? 'hist' : 'now', histT = null, selInd = null, lastEnvT = -1;
  function drawHabitat() {
    const [W, Hh] = fit(hc, hx); hx.clearRect(0, 0, W, Hh); hRects = [];
    const gap = 6, cols = hv.split ? 2 : 1, rows = hv.split ? 2 : 1, pw = (W - gap * (cols - 1)) / cols, ph = (Hh - gap * (rows - 1)) / rows;
    const small = hv.split, ml = small ? 38 : 48, mb = small ? 24 : 32, mt = small ? 16 : 8, mr = 6, panels = hv.split ? [0, 1, 2, 3].map((slot) => [H.REALMS[REALM_OF_SLOT[slot]]]) : [H.REALMS];
    panels.forEach((rl, k) => {
      const ox = (k % cols) * (pw + gap), oy = Math.floor(k / cols) * (ph + gap), px0 = ox + ml, py0 = oy + mt, w = pw - ml - mr, h = ph - mt - mb, realmId = hv.split ? rl[0].id : null;
      const rg = H.panelRange(hv, realmId || 'land'); hRects.push({ x: px0, y: py0, w, h, realmId });
      hx.save(); hx.fillStyle = '#0d1520'; hx.fillRect(px0, py0, w, h); hx.beginPath(); hx.rect(px0, py0, w, h); hx.clip();
      const X = (T) => H.project(T, rg.xr, hv.xScale, w, hv.xRev, false), Y = (P) => H.project(P, rg.yr, hv.yScale, h, hv.yRev, true);
      hx.strokeStyle = '#223348'; hx.lineWidth = 1; hx.fillStyle = '#7f93a8';
      const xt = H.ticks(rg.xr[0], rg.xr[1], hv.xScale, hv.xUnit, small ? 3 : 5), yt = H.ticks(rg.yr[0], rg.yr[1], hv.yScale, 'K', small ? 3 : 5);
      for (const t of xt) { const x = X(t); if (x === null) continue; hx.beginPath(); hx.moveTo(px0 + x, py0); hx.lineTo(px0 + x, py0 + h); hx.stroke(); }
      for (const t of yt) { const y = Y(t); if (y === null) continue; hx.beginPath(); hx.moveTo(px0, py0 + y); hx.lineTo(px0 + w, py0 + y); hx.stroke(); }
      for (const r of rl) {
        const x1 = X(r.T[0]), x2 = X(r.T[1]), y1 = Y(r.P[0]), y2 = Y(r.P[1]); if ([x1, x2, y1, y2].some((v) => v === null)) continue;
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        hx.globalAlpha = 0.18; hx.fillStyle = r.color; hx.fillRect(px0 + rx, py0 + ry, rw, rh); hx.globalAlpha = 1; hx.strokeStyle = r.color; hx.lineWidth = 1.5; hx.strokeRect(px0 + rx, py0 + ry, rw, rh);
        hx.fillStyle = r.color; hx.font = 'bold ' + (small ? 10 : 12) + 'px system-ui'; hx.fillText(r.name, px0 + Math.max(rx, 0) + 4, py0 + Math.max(ry, 0) + (small ? 11 : 14) + (small ? 0 : H.REALMS.indexOf(r) * 14));
      }
      if (ov !== 'none') drawOverlay(px0, py0, X, Y, small);
      const rx = X(H.REFERENCE.T), ry = Y(H.REFERENCE.P);
      hx.setLineDash([4, 3]); hx.strokeStyle = '#ffffff'; hx.globalAlpha = 0.75; hx.lineWidth = 1;
      if (rx !== null) { hx.beginPath(); hx.moveTo(px0 + rx, py0); hx.lineTo(px0 + rx, py0 + h); hx.stroke(); }
      if (ry !== null) { hx.beginPath(); hx.moveTo(px0, py0 + ry); hx.lineTo(px0 + w, py0 + ry); hx.stroke(); }
      hx.setLineDash([]); hx.globalAlpha = 1;
      if (rx !== null && ry !== null) { hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(px0 + rx, py0 + ry, 3.5, 0, 6.2832); hx.fill(); hx.font = (small ? 9 : 11) + 'px system-ui'; hx.fillText('基準', px0 + Math.min(rx + 6, w - 28), py0 + Math.max(ry - 5, 10)); }
      hx.restore();
      hx.fillStyle = '#7f93a8'; hx.font = (small ? 9 : 10) + 'px system-ui'; hx.textAlign = 'center';
      for (const t of xt) { const x = X(t); if (x === null || x < -1 || x > w + 1) continue; hx.fillText(H.formatTick(t, hv.xScale, 'x', hv.xUnit), px0 + x, py0 + h + 12); }
      hx.textAlign = 'right';
      for (const t of yt) { const y = Y(t); if (y === null || y < -1 || y > h + 1) continue; hx.fillText(H.formatTick(t, hv.yScale, 'y', 'K'), px0 - 3, py0 + y + 3); }
      hx.textAlign = 'center'; hx.fillText(`温度 (${hv.xUnit === 'C' ? '℃' : 'K'}${hv.xScale === 'log' ? '・対数' : ''}) ${hv.xRev ? '右=低温' : '右=高温'}`, px0 + w / 2, py0 + h + (small ? 22 : 28));
      hx.save(); hx.translate(ox + 9, py0 + h / 2); hx.rotate(-Math.PI / 2); hx.fillText(`圧力 Pa${hv.yScale === 'log' ? '・対数' : ''} ${hv.yRev ? '上=低圧' : '上=高圧'}`, 0, 0); hx.restore(); hx.textAlign = 'left';
      if (small) { hx.fillStyle = rl[0].color; hx.font = 'bold 10px system-ui'; hx.fillText(rl[0].name, px0, oy + 11); }
    });
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
  function renderEnvControls() {
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
    const st = game.live.stats(), tol = game.series.length ? game.series[game.series.length - 1].traits[3] : null;
    $('env-note').innerHTML = `<div class="assume"><b>この四角は「表示用の仮定」です。</b>現在の地球の概数を置いたもので、エンジンの値ではありません。白い点線と「基準」は、地球地表の全球平均気温15℃（288.15 K）と1気圧（101325 Pa）。標準は、横＝温度の対数（右が高温）、縦＝圧力の対数（上が低圧、下が高圧）です。地図の上をなぞると移動、2本指（またはホイール）で拡大できます。</div>
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
  function draw(force) {
    if (!game) return; const st = game.live.stats();
    const ti = game.timeInfo(); $('h-t').textContent = st.t; $('h-gen').textContent = ti.generations.toFixed(1); $('h-pop').textContent = st.population; drawTimeline(ti);
    drawWorld(st); drawLinbar(); drawBackground();
    if (tab === 'stat') drawStat(st); else if (tab === 'trait' && (force || st.t % 25 === 0)) drawTrait(); else if (tab === 'graph' && (force || st.t % 25 === 0)) drawChart(); else if (tab === 'env') { if (force || !envShown) { renderEnvControls(); drawHabitat(); drawEnvNote(); envShown = true; lastEnvT = st.t; } else if (st.t - lastEnvT >= 25) { drawEnvNote(); if (ov !== 'none') drawHabitat(); lastEnvT = st.t; } } else if (tab === 'log' && (force || logN !== game.events.length)) { drawLog(); logN = game.events.length; }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden && game) { putSave('auto'); } });
  renderStart(); requestAnimationFrame(frame);
  window.__omega = { layoutNames: () => [0, 1, 2, 3].map((slot) => E.REALM_DEFS[REALM_OF_SLOT[slot]].name), speeds: SPEEDS, get hv() { return hv; }, get game() { return game; }, begin, setSpeed, loadSlot, get playing() { return playing; } };
})();
