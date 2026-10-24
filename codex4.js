(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaCodex = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The collection (Stage 4.0): forms, abilities, tolerances, new mechanisms and feats are RECORDED from what the simulation really produced. Nothing here is a fixed
  // list that fills up with time: an entry exists only if some individuals in the arena actually had the property, and the name is composed from the real traits.
  // A discovery is a record. It changes nothing in the simulation, and no ability is ever granted from it.
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  // axes of the form signature: [trait, high word, low word]; dormancy is read as depth (a LOW raw value is a DEEP sleep)
  const AXES = [['tolerance', '高耐性', '低耐性'], ['metabolism', '高代謝', '低代謝'], ['repairRate', '高修復', null], ['dormancyDepth', '深休眠', null], ['predation', '捕食型', null], ['movement', '高機動', '定着型']];
  const bin = (v) => (v < 0.34 ? 0 : v < 0.67 ? 1 : 2);
  // norm: { trait: 0..1 } (dormancyDepth already inverted so that 1 = deep)
  function formSignature(norm) {
    const bins = AXES.map(([t]) => bin(norm[t])), key = bins.join(''), words = [];
    const ext = AXES.map(([t, hi, lo], i) => ({ i, d: Math.abs(norm[t] - 0.5), word: bins[i] === 2 ? hi : bins[i] === 0 ? lo : null })).filter((x) => x.word).sort((a, b) => b.d - a.d);
    for (const e of ext.slice(0, 3)) words.push(e.word);
    return { key, bins, name: words.length ? words.join('・') + '型' : '標準形', extremes: ext.length };
  }
  const tierRarity = (extremes) => [0.1, 0.3, 0.55, 0.8, 0.95, 0.97, 0.99][Math.min(6, extremes)];
  // share = the fraction of all living individuals that have this signature when it is found
  const rarityOf = (extremes, share) => clamp(0.6 * tierRarity(extremes) + 0.4 * (1 - clamp(share, 0, 1)), 0, 1);
  const RARITY_NAME = (r) => (r >= 0.9 ? '極めて希少' : r >= 0.75 ? '希少' : r >= 0.5 ? 'やや珍しい' : 'ふつう');
  // the abilities worth a line of their own: the mean of a lineage crossing a high or low threshold for the first time
  const ABILITY = [['tolerance', 0.8, '耐性が極めて高い'], ['repairRate', 0.85, '修復力が極めて高い'], ['metabolism', 0.25, '代謝が極めて低い', true], ['dormancyDepth', 0.85, '休眠が極めて深い'], ['predation', 0.8, '捕食力が極めて高い'], ['movement', 0.85, '移動力が極めて高い'], ['immune', 0.8, '免疫が極めて高い'], ['fecundity', 0.9, '繁殖力が極めて高い']];
  // tolerance to places: from a lineage's box [Tlo, Thi, Pmin, Pmax] in K and Pa
  const EXTREMES = [
    { id: 'heat', test: (b) => b[1] >= 360, name: (b) => `耐熱 ${Math.round(b[1] - 273.15)}℃まで`, text: '高温の環境にも耐えられる体' },
    { id: 'cold', test: (b) => b[0] <= 245, name: (b) => `耐寒 ${Math.round(b[0] - 273.15)}℃まで`, text: '極低温にも耐えられる体' },
    { id: 'deep', test: (b) => b[3] >= 1e8, name: () => '超高圧への適応', text: '深海・地殻の高圧に耐えられる体' },
    { id: 'thin', test: (b) => b[2] <= 3e3, name: () => '低圧（高空）への適応', text: '空気の薄い高空に耐えられる体' },
  ];
  const FEAT_TIERS = { longevity: [200, 400, 800, 1600], solo: [1500, 5000, 15000], vent: [300, 1000, 3000] };
  return { AXES, ABILITY, EXTREMES, FEAT_TIERS, formSignature, rarityOf, RARITY_NAME, bin };
});
