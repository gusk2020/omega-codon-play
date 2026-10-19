'use strict';
(function () {
  const E = OmegaEngine18, G = OmegaGame;
  const $ = (id) => document.getElementById(id);
  const SPEEDS = [10, 30, 100, 400]; // steps per second
  const KEY = 'omega-codon-saves-v1';
  const MODE_JA = ['休眠', '待機', '探索', '狩り', '修復', '移行'];
  const CAUSE_JA = { capacityCull: '過密', extrinsic: '事故', starvation: '飢餓', senescence: '老衰', thermal: '寒暖', pathogen: '病気', disaster: '災害', injury: '狩りの傷' };
  let sel = ['standard', 'hunter'], envId = 'steady', game = null, playing = false, speedIdx = 1, tab = 'stat', metric = 'pop', loading = null;
  let acc = 0, lastTs = 0, lastDraw = 0, lastAuto = 0, startTraits = null;

  // ---------- storage ----------
  function readSaves() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function writeSaves(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
  function putSave(slot, label) {
    if (!game) return false;
    const s = readSaves(); s[slot] = { ...game.save(), ts: Date.now(), label: label || describe(game) };
    return writeSaves(s);
  }
  function describe(g) { const st = g.live.stats(); return `${g.creatures.map((c) => c.name).join('・')} ／ ${st.t}ステップ ／ ${st.population}体`; }
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
  $('reseed').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 99999); };
  $('seed').value = 1 + Math.floor(Math.random() * 99999);
  $('go').onclick = () => { const seed = Math.max(1, Math.floor(Number($('seed').value)) || 1); begin(G.newGame(E, { creatures: sel.slice(), environment: envId, seed })); };

  // ---------- play ----------
  function begin(g) {
    game = g; startTraits = g.series[0] ? g.series[0].traits.slice() : null; playing = true; lastAuto = g.t;
    $('start').hidden = true; $('play').hidden = false; $('modal').hidden = true;
    $('legend').innerHTML = g.creatures.map((c) => `<span><i style="background:${c.color}"></i>${c.name}</span>`).join('') + '<span>● 色=系統　赤い輪=狩り中　薄い=休眠</span>';
    setSpeed(speedIdx); setPP(); draw(true);
    if (g.pending) showPrompt();
  }
  function setSpeed(i) { speedIdx = i; document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === i)); }
  function setPP() { $('pp').textContent = playing ? '⏸' : '▶'; }
  document.querySelectorAll('#speeds button').forEach((b) => { b.onclick = () => setSpeed(Number(b.dataset.s)); });
  $('pp').onclick = () => { if (!game || game.pending || game.live.done || loading) return; playing = !playing; setPP(); };
  $('save').onclick = () => { if (!game) return; playing = false; setPP(); openMenu(true); };
  $('menu').onclick = () => { if (!game) return; playing = false; setPP(); openMenu(false); };
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); for (const t of ['stat', 'trait', 'graph', 'log']) $('tab-' + t).hidden = t !== tab; draw(true); }; });

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
    for (const o of p.options) { const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = `<b>${o.name}</b><span>${o.text}</span>`; b.onclick = () => { game.choose(o.id); putSave('auto'); $('modal').hidden = true; playing = true; setPP(); draw(true); }; card.appendChild(b); }
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
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0); lastTs = ts;
    if (!game || loading) return;
    if (playing && !game.pending && !game.live.done) {
      acc += dt * SPEEDS[speedIdx]; const t0 = performance.now();
      while (acc >= 1 && performance.now() - t0 < 12 && !game.pending && !game.live.done) { const n = Math.min(Math.floor(acc), 10); game.advance(n); acc -= n; }
      if (acc > 200) acc = 0;
      if (game.t - lastAuto >= 500) { putSave('auto'); lastAuto = game.t; }
      if (game.pending) showPrompt(); else if (game.live.done) showEnd();
    }
    if (ts - lastDraw > 66) { draw(false); lastDraw = ts; }
  }

  // ---------- drawing ----------
  const cv = $('world'), cx = cv.getContext('2d');
  function fit(c, ctx) { const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); const w = Math.round(r.width * d), h = Math.round(r.height * d); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } ctx.setTransform(d, 0, 0, d, 0, 0); return [r.width, r.height]; }
  const hash = (n, k) => { const x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  function drawWorld(st) {
    const [W, H] = fit(cv, cx), gw = W / 2, gh = H / 2; cx.clearRect(0, 0, W, H);
    for (let p = 0; p < 4; p++) { const x0 = (p % 2) * gw, y0 = Math.floor(p / 2) * gh; cx.fillStyle = `rgba(70,194,138,${0.04 + 0.2 * st.preyFraction})`; cx.fillRect(x0 + 2, y0 + 2, gw - 4, gh - 4); cx.strokeStyle = '#1f2e3f'; cx.strokeRect(x0 + 2, y0 + 2, gw - 4, gh - 4); }
    const ind = game.live.individuals(), now = performance.now() / 1000, n = Math.min(ind.length, 1200);
    for (let i = 0; i < n; i++) {
      const x = ind[i], x0 = (x.patch % 2) * gw, y0 = Math.floor(x.patch / 2) * gh;
      const px = x0 + 8 + hash(x.id, 1) * (gw - 16) + Math.sin(now * 1.3 + x.id) * 2, py = y0 + 8 + hash(x.id, 2) * (gh - 16) + Math.cos(now * 1.1 + x.id * 0.7) * 2;
      const r = 2.2 + Math.min(3, x.energy) * 0.9;
      cx.globalAlpha = x.mode === 0 ? 0.3 : 1; cx.fillStyle = game.creatures[x.lin].color; cx.beginPath(); cx.arc(px, py, r, 0, 6.2832); cx.fill();
      if (x.mode === 3) { cx.strokeStyle = '#ff5d73'; cx.lineWidth = 1.5; cx.stroke(); } else if (x.mode === 4) { cx.strokeStyle = '#46c28a'; cx.lineWidth = 1.2; cx.stroke(); }
    }
    cx.globalAlpha = 1;
  }
  function kv(rows) { return '<div class="kv">' + rows.map(([a, b, w]) => (w ? `<span class="w"><small>${a}</small><br>${b}</span>` : `<span>${a}</span><span>${b}</span>`)).join('') + '</div>'; }
  function drawStat(st) {
    const tot = st.modes.reduce((a, b) => a + b, 0) || 1, tc = Object.entries(st.causes).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${CAUSE_JA[k]} ${v}`).join('／') || '-';
    $('tab-stat').innerHTML = kv([
      ['個体数', st.population], ['平均寿命（死亡した個体）', st.meanLifespan ? st.meanLifespan.toFixed(1) + ' ステップ' : '-'], ['現在の平均年齢', st.meanAge.toFixed(1)],
      ['平均エネルギー', st.meanEnergy.toFixed(2)], ['誕生／死亡（累計）', `${st.births} ／ ${st.deaths}`], ['捕獲した獲物（累計）', st.catches],
      ['獲物の残り', Math.round(st.preyFraction * 100) + '%'], ['代謝の平均', game.series.length ? game.series[game.series.length - 1].traits[0].toFixed(2) : '-'],
      ...game.creatures.map((c, i) => [`<i style="color:${c.color}">●</i> ${c.name}`, st.lineageAlive[i] + ' 体']),
      ['行動の割合（休眠/待機/探索/狩り/修復）', st.modes.slice(0, 5).map((v) => Math.round((v / tot) * 100) + '%').join(' '), 1], ['死因（累計）', tc, 1]]);
  }
  function drawTrait() {
    if (!game.series.length) return; const cur = game.series[game.series.length - 1].traits, first = startTraits || cur;
    $('tab-trait').innerHTML = '<p class="note">いまの集団の平均値（開始時からの変化）。項目をタップすると推移グラフに出ます。</p>' + G.KEY_TRAITS.map((k, i) => {
      const [, mn, mx] = E.TRAITS[E.TRAITS.findIndex((l) => l[0] === k)], d = cur[i] - first[i];
      return `<div data-m="${k}"><div class="tr"><span>${G.TRAIT_JA[k]}</span><span>${cur[i].toFixed(2)} <span class="d">(${d >= 0 ? '+' : ''}${d.toFixed(2)})</span></span></div><div class="bar"><div style="width:${Math.round(((cur[i] - mn) / (mx - mn)) * 100)}%"></div></div></div>`;
    }).join('');
    $('tab-trait').querySelectorAll('[data-m]').forEach((el) => { el.onclick = () => { metric = el.dataset.m; document.querySelector('#tabs [data-tab=graph]').click(); }; });
  }
  const ch = $('chart'), cc = ch.getContext('2d');
  function drawChart() {
    const [W, H] = fit(ch, cc); cc.clearRect(0, 0, W, H); const S = game.series; if (S.length < 2) { cc.fillStyle = '#8fa3b8'; cc.fillText('データを集めています…', 10, 20); return; }
    const mi = G.KEY_TRAITS.indexOf(metric); let lines = [], label = '';
    if (metric === 'pop') { label = '個体数'; lines = [{ c: '#e6edf5', v: S.map((s) => s.pop) }]; if (game.creatures.length > 1) game.creatures.forEach((c, i) => lines.push({ c: c.color, v: S.map((s) => s.lin[i]) })); }
    else if (metric === 'prey') { label = '獲物の残り（容量比）'; lines = [{ c: '#46c28a', v: S.map((s) => s.prey) }]; }
    else { label = G.TRAIT_JA[metric] + '（平均）'; lines = [{ c: '#4fa3ff', v: S.map((s) => s.traits[mi]) }]; }
    let mn = Infinity, mx = -Infinity; for (const l of lines) for (const v of l.v) { if (v < mn) mn = v; if (v > mx) mx = v; } if (mx - mn < 1e-9) { mx += 1; mn -= 1; } if (metric === 'pop') mn = 0;
    const L = 38, B = 18, T = 8, R = 6, t0 = S[0].t, t1 = S[S.length - 1].t || 1; cc.strokeStyle = '#243548'; cc.fillStyle = '#8fa3b8'; cc.font = '11px system-ui'; cc.lineWidth = 1;
    for (let k = 0; k <= 3; k++) { const y = T + ((H - T - B) * k) / 3; cc.beginPath(); cc.moveTo(L, y); cc.lineTo(W - R, y); cc.stroke(); const v = mx - ((mx - mn) * k) / 3; cc.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2), 2, y + 4); }
    cc.fillText(t0 + '', L, H - 4); cc.fillText(t1 + ' ステップ', W - 70, H - 4);
    for (const l of lines) { cc.strokeStyle = l.c; cc.lineWidth = 2; cc.beginPath(); l.v.forEach((v, i) => { const x = L + ((S[i].t - t0) / Math.max(1, t1 - t0)) * (W - L - R), y = T + (1 - (v - mn) / (mx - mn)) * (H - T - B); if (i) cc.lineTo(x, y); else cc.moveTo(x, y); }); cc.stroke(); }
    $('chart-note').innerHTML = `<div class="chips" id="metrics"></div><div style="margin-top:6px">${label}</div>`;
    const wrap = $('metrics'); [['pop', '個体数'], ['prey', '獲物'], ...G.KEY_TRAITS.map((k) => [k, G.TRAIT_JA[k]])].forEach(([k, n]) => { const b = document.createElement('button'); b.className = 'chip' + (k === metric ? ' on' : ''); b.textContent = n; b.onclick = () => { metric = k; drawChart(); }; wrap.appendChild(b); });
  }
  function drawLog() {
    $('tab-log').innerHTML = game.events.slice().reverse().slice(0, 120).map((e) => `<div class="ev ${e.kind}"><small>${e.t}ステップ／約${e.gen}世代</small>${e.text}</div>`).join('') || '<p class="note">まだ出来事はありません。</p>';
  }
  let logN = -1;
  function draw(force) {
    if (!game) return; const st = game.live.stats();
    $('h-t').textContent = st.t; $('h-gen').textContent = (st.genTime ? st.t / st.genTime : 0).toFixed(1); $('h-pop').textContent = st.population;
    drawWorld(st);
    if (tab === 'stat') drawStat(st); else if (tab === 'trait' && (force || st.t % 25 === 0)) drawTrait(); else if (tab === 'graph' && (force || st.t % 25 === 0)) drawChart(); else if (tab === 'log' && (force || logN !== game.events.length)) { drawLog(); logN = game.events.length; }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden && game) { putSave('auto'); } });
  renderStart(); requestAnimationFrame(frame);
  window.__omega = { get game() { return game; }, begin, setSpeed, loadSlot, get playing() { return playing; } };
})();
