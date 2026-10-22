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
  // Not scored, because the engine cannot tell the difference yet: independence from groups or technology (every individual here is
  // independent already), temperature-pressure range (the map's ranges are dummies), and anything beyond the four realms.
  // Omega is never awarded: its formal test needs abilities that are not implemented.
  const AXES = [
    { id: 'aging', name: '老化・損傷への抵抗', unit: '75ステップ以上の死亡率÷25〜49ステップの死亡率（低いほど良い。年齢の区切りはステップ数）', better: 'low', tiers: [2.5, 1.8, 1.25, 1.05], need: { young: 300, old: 300 } },
    { id: 'repair', name: '修復・身体更新', unit: '入ってきた損傷のうち修復・更新で取り除いた割合', better: 'high', tiers: [0.92, 0.96, 0.985, 0.997] },
    { id: 'efficiency', name: '資源効率・低代謝', unit: '1個体・1ステップの消費エネルギー（低いほど低代謝）', better: 'low', tiers: [0.24, 0.17, 0.11, 0.07], intakeRatio: 0.9 },
    { id: 'range', name: '活動できる環境の広さ', unit: '個体群が定着している領域の数（4領域まで。温度・圧力の範囲は未計算）', better: 'high', tiers: [3, 4, Infinity, Infinity], capTier: 2 },
    { id: 'dormancy', name: '休眠からの回復', unit: '休眠のうち、目覚めで終わった割合（死亡で終わらなかった割合）', better: 'high', tiers: [0.6, 0.75, 0.88, 0.96], need: { episodes: 30 } },
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
  return { AXES, CONTINUITY, RANKS, OMEGA, evaluate, tierOf, contTier, order: RANKS.map((r) => r.id) };
});
