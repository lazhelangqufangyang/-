// 动作检查的判定依据：阈值、证据等级、文献出处都集中在这里。
// 这些文本随包下发，界面直接展示；不联网、不请求任何外部内容。

export const EVIDENCE_LEVELS = {
  research: '研究支持',
  consensus: '生物力学共识',
  heuristic: '应用经验阈值',
};

export const SOURCES = {
  hickmott2022: {
    label: 'Hickmott 等 · Sports Med Open · 2022',
    note: '系统综述与元分析：速度损失 ≤25% 对力量增长更有利；>20–25% 对增肌更有利；约 20–30% 速度损失相当于一组最大次数的 50%。',
    url: 'https://doi.org/10.1186/s40798-021-00404-9',
  },
  jukic2023: {
    label: 'Jukic 等 · Sports Med · 2023',
    note: '速度损失阈值的系统综述与元分析：不同阈值对急性疲劳和长期适应的影响。',
    url: 'https://pubmed.ncbi.nlm.nih.gov/36178597/',
  },
  pareja2017: {
    label: 'Pareja-Blanco 等 · Scand J Med Sci Sports · 2017',
    note: '随机对照试验：每组允许 20% 或 40% 速度损失，比较力量与肌肉结构适应。',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27038416/',
  },
  straub2024: {
    label: 'Straub & Powers · Int J Sports Phys Ther · 2024',
    note: '深蹲生物力学综述：浅蹲为 0–90° 膝屈曲，中蹲 90–110°（大腿平行），深蹲 110–135°；躯干角度会重新分配髋/膝力矩，没有统一的安全角度。',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10987311/',
  },
  hartmann2013: {
    label: 'Hartmann 等 · Sports Medicine · 2013',
    note: '深蹲深度与负荷综述：没有证据表明深蹲本身更伤膝，关键是随深度调整重量。',
    url: 'https://doi.org/10.1007/s40279-013-0073-6',
  },
  mayo: {
    label: 'Mayo Clinic · 深蹲动作示范',
    note: '健康科普口径：下蹲到膝关节约 90° 再起身。',
    url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/squat/vid-20084663',
  },
  ipf2026: {
    label: 'IPF Technical Rule Book · 2026',
    note: '力量举深蹲深度标准：髋褶低于膝盖顶端。',
    url: 'https://www.powerlifting.sport/rules/codes/info/technical-rules',
  },
  squatReview2024: {
    label: 'Frontiers in Sports and Active Living · 2024',
    note: '深蹲与膝关节结构范围综述：深蹲是安全且可能有保护作用的动作。',
    url: 'https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1477796/full',
  },
};

/** 每条规则对应的证据等级和可展示的出处 */
export const FORM_EVIDENCE = {
  velocityStrength: { level: 'research', sources: ['hickmott2022', 'pareja2017'] },
  velocityHypertrophy: { level: 'research', sources: ['hickmott2022', 'jukic2023'] },
  squatDepth: { level: 'research', sources: ['straub2024', 'mayo', 'ipf2026', 'hartmann2013'] },
  trunkLean: { level: 'consensus', sources: ['straub2024'] },
  trunkSwing: { level: 'heuristic', sources: [] },
  hipLockout: { level: 'heuristic', sources: [] },
  barDrift: { level: 'heuristic', sources: [] },
  wristAsymmetry: { level: 'heuristic', sources: [] },
  kneeAsymmetry: { level: 'heuristic', sources: [] },
  tempo: { level: 'heuristic', sources: [] },
  tempoVariance: { level: 'heuristic', sources: [] },
};

// 计算和界面上的「依据」读同一份数字。
export const LIMITS = {
  kneeTarget: 90,
  kneeWarn: 110,
  leanTarget: 45,
  leanWarn: 50,
  leanBad: 65,
  swingTarget: 15,
  swingWarn: 18,
  hipTarget: 168,
  hipBad: 155,
  hingeDrift: 15,
  pushTorsoWarn: 12,
  pushTorsoTarget: 10,
  pushDrift: 18,
  wristAsym: 7,
  wristTarget: 3,
  generalTorsoWarn: 25,
  generalTorsoTarget: 20,
  tempoCv: 0.35,
  kneeAsymWarn: 18,
  kneeAsymTarget: 10,
};

// 增肌导向的目标允许更高的速度损失；其余按力量导向的保守口径。
const HYPERTROPHY_GOALS = new Set(['bulk', 'glute_legs', 'chest', 'shoulders']);

export function velocityLossFor(goalKey) {
  return HYPERTROPHY_GOALS.has(goalKey)
    ? { warn: 25, stop: 40, evidenceKey: 'velocityHypertrophy', label: '增肌' }
    : { warn: 15, stop: 25, evidenceKey: 'velocityStrength', label: '力量' };
}
