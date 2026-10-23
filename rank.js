(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaRank = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The alpha-to-Omega rank. A DISPLAY judgement made from what the engine measured about a lineage's individuals. It never feeds back
  // into the simulation: nothing in survival or reproduction knows about ranks, and reaching a rank is not guaranteed by anything here.
  //
  // What it rests on (individual autonomy, not numbers of animals, not intelligence):
  //   continuity  : the longest an individual of the lineage has stayed alive without a break (record), in steps.
  //   six ability axes, each judged over a recent window and each with tiers 0-4:
  //     aging       how little the death rate rises with age (rate at age >= 75 steps / rate at ages 25-49 steps; lower is better)
  //     repair      the share of incoming damage that repair and renewal actually removed
  //     efficiency  energy spent per individual per step (lower = lower metabolism), with intake covering spending
  //     range       how many habitat realms hold a standing population of the lineage
  //     dormancy    the share of dormancy episodes that ended in waking, rather than in death while dormant
  //     competition how long the lineage has persisted in a row while a competing lineage was present
  //   A rank is a set of conditions on continuity and on HOW MANY axes reach which tier, never on which axes. Different
  //   evolutionary routes (low metabolism and dormancy, repair, wide range, competition) can satisfy the same rank.
  //     independence (Stage 2.0) hostile-civilisation episodes survived without help from a coexistence subsidy; not computed when the world has no civilisation model.
  // Not scored, because the engine cannot tell the difference yet: temperature-pressure range (the map's ranges are dummies), and anything beyond the four realms.
  // Omega is never awarded: its formal test needs abilities that are not implemented.
  const AXES = [
    { id: 'aging', name: '老化・損傷への抵抗', unit: '75ステップ以上の死亡率÷25〜49ステップの死亡率（低いほど良い。年齢の区切りはステップ数）', better: 'low', tiers: [2.5, 1.8, 1.25, 1.05], need: { young: 300, old: 300 } },
    { id: 'repair', name: '修復・身体更新', unit: '入ってきた損傷のうち修復・更新で取り除いた割合', better: 'high', tiers: [0.92, 0.96, 0.985, 0.997] },
    { id: 'efficiency', name: '資源効率・低代謝', unit: '1個体・1ステップの消費エネルギー（低いほど低代謝）', better: 'low', tiers: [0.24, 0.17, 0.11, 0.07], intakeRatio: 0.9 },
    { id: 'range', name: '活動できる環境の広さ', unit: '個体群が定着している領域の数（4領域まで。温度・圧力の範囲は未計算）', better: 'high', tiers: [3, 4, Infinity, Infinity], capTier: 2 },
    { id: 'dormancy', name: '休眠からの回復', unit: '休眠のうち、目覚めで終わった割合（死亡で終わらなかった割合）', better: 'high', tiers: [0.6, 0.75, 0.88, 0.96], need: { episodes: 30 } },
    { id: 'independence', name: '集団・技術に頼らない自力の生存', unit: '知性文明の敵対（捕獲・駆除・環境破壊）の下で、共存による支援に頼らずに存続した回数（ゲーム上の仮定。文明が現れない世界では未計算）', better: 'high', tiers: [1, 2, 4, 8] },
    { id: 'competition', name: '競争下での持続力', unit: '競争相手がいる状態で、系統が途切れず存続した期間（ステップ）', better: 'high', tiers: [4000, 15000, 50000, 150000] },
  ];
  const CONTINUITY = { name: '連続生存期間', unit: '個体が途切れず生きた最長記録（ステップ）', tiers: [150, 300, 600, 1500, 4000] };
  // rank rules over C (continuity tier 0-5) and K[l] = number of ability axes at tier >= l
  const RANKS = [
    { id: 'α', name: 'α', C: 0, K: [] },
    { id: 'β', name: 'β', C: 1, K: [[1, 1]] },
    { id: 'γ', name: 'γ', C: 1, K: [[1, 2]] },
    { id: 'δ', name: 'δ', C: 2, K: [[1, 3], [2, 1]] },
    { id: 'ε', name: 'ε', C: 2, K: [[2, 3]] },
    { id: 'ζ', name: 'ζ', C: 3, K: [[2, 4], [3, 1]] },
    { id: 'η', name: 'η', C: 4, K: [[3, 3]] },
    { id: 'θ', name: 'θ', C: 5, K: [[3, 4], [4, 2]] },
  ];
  const OMEGA = { id: 'Ω', judgeable: false, text: 'Ωの正式な判定は、まだ実装できていません。必要な能力（宇宙・放射線への耐性、体の更新の限界、時間尺度の校正、集団や技術に依存しないことの検証など）の一部が未実装のため、Ω達成を表示することはありません。いま判定できる最高はθ（暫定）です。' };
  const tierOf = (value, ax) => { if (value === null || value === undefined || Number.isNaN(value)) return null; let t = 0; for (const th of ax.tiers) { if (ax.better === 'low' ? value <= th : value >= th) t++; else break; } return ax.capTier !== undefined ? Math.min(t, ax.capTier) : t; };
  const contTier = (v) => { let t = 0; for (const th of CONTINUITY.tiers) { if (v >= th) t++; else break; } return t; };
  // m: { continuity, aging:{value,young,old}, repair:{value}, efficiency:{value,intakeRatio}, range:{value}, dormancy:{value,episodes}, competition:{value}, observedSteps, alive }
  function evaluate(m) {
    if (!m || m.alive < 5 || m.observedSteps < 300) return { judged: false, reason: m && m.alive < 5 ? '個体が5体未満のため判定できません' : '観察が300ステップに満たないため判定中です', rank: null, axes: [], C: 0, K: [0, 0, 0, 0, 0] };
    const axes = AXES.map((ax) => {
      const d = m[ax.id] || {}; let value = d.value ?? null, why = null;
      if (ax.id === 'aging' && (d.young < ax.need.young || d.old < ax.need.old)) { value = null; why = 'データ不足'; }
      if (ax.id === 'dormancy' && !(d.episodes >= ax.need.episodes)) { value = null; why = '休眠の回数が少なくてデータ不足'; }
      if (ax.id === 'efficiency' && value !== null && d.intakeRatio < ax.intakeRatio) { value = null; why = '摂取が消費を賄えていない'; }
      if (ax.id === 'independence' && (d.value === undefined || d.value === null)) { value = null; why = '文明のモデルがない世界では未計算'; }
      const tier = tierOf(value, ax);
      const next = tier === null ? null : ax.tiers[tier] !== undefined && ax.tiers[tier] !== Infinity && (ax.capTier === undefined || tier < ax.capTier) ? ax.tiers[tier] : null;
      return { id: ax.id, name: ax.name, unit: ax.unit, value, tier, next, why, better: ax.better };
    });
    const C = contTier(m.continuity || 0), K = [0, 1, 2, 3, 4].map((l) => axes.filter((a) => a.tier !== null && a.tier >= l).length);
    let best = RANKS[0], idx = 0;
    RANKS.forEach((r, i) => { if (C >= r.C && r.K.every(([l, n]) => K[l] >= n)) { best = r; idx = i; } });
    const nextRank = RANKS[idx + 1] || null, missing = [];
    if (nextRank) {
      if (C < nextRank.C) missing.push(`連続生存期間が段階${nextRank.C}（${CONTINUITY.tiers[nextRank.C - 1]}ステップ以上）に届いていない（最長記録 ${m.continuity}）`);
      for (const [l, n] of nextRank.K) if (K[l] < n) missing.push(`能力の軸のうち、段階${l}以上のものがあと${n - K[l]}つ必要（いま${K[l]}／${n}）`);
    }
    const strong = axes.filter((a) => a.tier !== null && a.tier >= 1).map((a) => `${a.name}（段階${a.tier}）`);
    const reason = best.id === 'α' ? 'まだ、判定できる能力が基準に届いていません。' : `連続生存期間が段階${C}（最長記録 ${m.continuity}ステップ）で、段階1以上の能力軸が${K[1]}つ：${strong.join('、') || 'なし'}。`;
    return { judged: true, rank: best.id, rankIndex: idx, C, K, axes, reason, nextRank: nextRank ? nextRank.id : null, missing, omega: OMEGA, provisional: true };
  }
  // ---- Stage 3.0: what stands between this rank and the next, as numbers ----
  // For each requirement: what the lineage has, what is needed, the shortfall, and (for the ability axes) which axes are the nearest to the needed tier. Nothing here
  // changes the rank rules; it only reads the same result `evaluate` produced.
  const ADVICE = {
    continuity: { strategies: ['低代謝にして老化を遅らせる', '修復・更新を高める', '休眠で飢えをやり過ごす', '危険の少ない領域・深さへ移る'], costs: ['餌の取り分で不利になり、繁殖も控えめになる（摂食量は代謝に比例）', '修復・免疫の維持に毎ステップの費用がかかる', '細胞の入れ替えを増やすと異常細胞のリスクが上がる', '移動のたびにエネルギーを使う'] },
    aging: { strategies: ['低代謝（内部時計がゆっくり進む）', '修復力を上げる', '細胞の入れ替えで再生する', '免疫で損傷の原因を減らす'], costs: ['取り分と繁殖力が落ちる', '修復の維持費', '入れ替えは異常細胞を増やす', '免疫の維持費'] },
    repair: { strategies: ['修復力を上げる', '細胞の入れ替えを増やす', '免疫を強めて異常細胞を抑える', '修復に向く休息（修復モード）を多くとる'], costs: ['毎ステップの維持費', '入れ替えが多いほど異常細胞が増える', '免疫の維持費', 'その間は餌を探せない'] },
    efficiency: { strategies: ['代謝を下げる', '休眠を深くする', '無駄な移動・狩りを減らす'], costs: ['餌の奪い合いで負けやすい', '動けない間は繁殖や探索ができない', '食べ物が少ないと伸びにくい'] },
    range: { strategies: ['移動能力を高めて別の領域に広がる', '耐性を高めて厳しい領域でも暮らす'], costs: ['移動のエネルギー', '厳しい領域では毎ステップ損傷を受ける（熱・圧力の許容範囲の外）', '食べ物が乏しい'] },
    dormancy: { strategies: ['休眠を深くする', '目覚める条件（飢えと危険の見分け）を磨く'], costs: ['休眠中は餌も繁殖もない', '目覚めに時間がかかる'] },
    independence: { strategies: ['防御（耐性・免疫・修復で捕獲と損傷を減らす）', '逃避（文明の影響が弱い領域・深さへ）', '共存の支援に頼らない'], costs: ['警戒・逃避のエネルギー', '厳しい領域の乏しい食べ物', '共存の支援（食料）を受けられない'] },
    competition: { strategies: ['餌の種類をずらして競争を避ける', '多様な領域に分かれて住む', '長く生き残る体をつくる'], costs: ['得意でない餌では効率が落ちる', '分かれて住むと個体群が小さくなる'] },
  };
  const AXIS_TARGET = (ax, l) => (ax.tiers[l - 1] === undefined || ax.tiers[l - 1] === Infinity ? null : ax.tiers[l - 1]);
  function progress(res, m) {
    if (!res || !res.judged) return { judged: false, reason: res ? res.reason : '判定中' };
    const cur = RANKS[res.rankIndex], next = RANKS[res.rankIndex + 1]; if (!next) return { judged: true, from: cur.id, to: null, requirements: [], done: 1, note: '判定できる範囲の最高に達しています。Ωの判定は未実装です。' };
    const reqs = [];
    if (res.C < next.C) { const need = CONTINUITY.tiers[next.C - 1], have = m.continuity || 0; reqs.push({ id: 'continuity', label: CONTINUITY.name, icon: '⏳', have, need, short: Math.max(0, need - have), ratio: Math.min(1, have / need), unit: 'ステップ', met: false, advice: ADVICE.continuity }); }
    else reqs.push({ id: 'continuity', label: CONTINUITY.name, icon: '⏳', have: m.continuity || 0, need: CONTINUITY.tiers[next.C - 1] || 0, short: 0, ratio: 1, unit: 'ステップ', met: true, advice: ADVICE.continuity });
    for (const [l, n] of next.K) {
      const have = res.K[l], met = have >= n, cands = res.axes.filter((a) => !(a.tier !== null && a.tier >= l)).map((a) => {
        const ax = AXES.find((x) => x.id === a.id), target = AXIS_TARGET(ax, l), v = a.value; let short = null;
        if (v !== null && target !== null) short = ax.better === 'high' ? Math.max(0, (target - v) / Math.max(1e-9, Math.abs(target))) : Math.max(0, (v - target) / Math.max(1e-9, Math.abs(target)));
        return { id: a.id, name: a.name, value: v, tier: a.tier, target, better: ax.better, shortRatio: short, why: a.why, advice: ADVICE[a.id], capped: ax.capTier !== undefined && l > ax.capTier };
      }).filter((c) => !c.capped || false).sort((a, b) => (a.shortRatio === null) - (b.shortRatio === null) || (a.shortRatio || 0) - (b.shortRatio || 0));
      reqs.push({ id: 'axes-' + l, label: `段階${l}以上の能力軸 ${n}つ`, icon: '🎯', level: l, haveCount: have, needCount: n, short: Math.max(0, n - have), ratio: Math.min(1, have / n), met, candidates: cands });
    }
    const done = reqs.reduce((a, r) => a + r.ratio, 0) / reqs.length;
    return { judged: true, from: cur.id, to: next.id, requirements: reqs, done, note: '能力の足し算ではなく、連続生存期間と、複数の能力軸が段階に届くかどうかで決まります。どの軸でも構いません。' };
  }
  // ---- Stage 3.1: the same conditions as `progress`, as a short list for the main screen ----
  // One line per condition of the NEXT rank, in plain words: 達成 (met), 惜しい (within a quarter of the target), 不足, or 未計算 (the data does not exist yet).
  // It is read from the same `evaluate` result and the same tier tables, so it can never disagree with the rank actually judged; it makes nothing easier.
  function checklist(res, m) {
    if (!res || !res.judged) return { judged: false, reason: res ? res.reason : '判定中', items: [] };
    const next = RANKS[res.rankIndex + 1]; if (!next) return { judged: true, from: RANKS[res.rankIndex].id, to: null, items: [], note: '判定できる範囲の最高です（Ωは未判定）' };
    const items = [], maxL = Math.max(...next.K.map(([l]) => l)), minL = Math.min(...next.K.map(([l]) => l));
    if (next.C > 0) { const need = CONTINUITY.tiers[next.C - 1], have = m.continuity || 0; items.push({ id: 'continuity', label: '長期生存', icon: '⏱', status: res.C >= next.C ? 'met' : have >= 0.75 * need ? 'near' : 'short', have, need, unit: 'ステップ' }); }
    for (const a of res.axes) {
      const ax = AXES.find((x) => x.id === a.id), shortRatio = (() => { const target = AXIS_TARGET(ax, minL); if (a.value === null || target === null) return null; return ax.better === 'high' ? Math.max(0, (target - a.value) / Math.max(1e-9, Math.abs(target))) : Math.max(0, (a.value - target) / Math.max(1e-9, Math.abs(target))); })();
      const status = a.value === null ? 'na' : a.tier !== null && a.tier >= maxL ? 'met' : a.tier !== null && a.tier >= minL ? 'part' : shortRatio !== null && shortRatio <= 0.25 ? 'near' : 'short';
      items.push({ id: a.id, label: SHORT[a.id], icon: ICON[a.id], status, tier: a.tier, value: a.value, why: a.why, target: AXIS_TARGET(ax, minL), unit: ax.unit });
    }
    const rules = next.K.map(([l, n]) => ({ level: l, need: n, have: res.K[l], met: res.K[l] >= n }));
    const contOk = res.C >= next.C, allMet = contOk && rules.every((r) => r.met);
    return { judged: true, from: RANKS[res.rankIndex].id, to: next.id, items, rules, allMet, note: '段階の高い能力軸の数で決まります（どの軸でも可）。「未計算」は、データがまだ無い軸です。' };
  }
  const SHORT = { aging: '老化に強い', repair: '修復力', efficiency: '省エネ', range: '活動域の広さ', dormancy: '休眠の回復', independence: '自力の生存', competition: '競争への強さ' };
  const ICON = { aging: '⌛', repair: '🩹', efficiency: '🔋', range: '🌐', dormancy: '💤', independence: '🛡', competition: '⚔' };
  return { AXES, CONTINUITY, RANKS, OMEGA, ADVICE, SHORT, ICON, evaluate, progress, checklist, tierOf, contTier, order: RANKS.map((r) => r.id) };
});
