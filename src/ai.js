import { isHomeMode, tierOf } from './engine/load.js';
/** 安全边界写进每一次模型调用的 system prompt */
export const SAFETY_PROMPT = `你是一个健身计划助手，不是医生，也不是注册营养师。
必须遵守：
1. 不诊断伤病，不判断疼痛的原因。任何动作出现刺痛时，给出同肌群同器械的替代动作，并建议去康复科或运动医学科就诊；绝不建议忍痛继续练。
2. 不安排 1RM 或冲极限的当日计划。深蹲、硬拉、卧推、推举这类动作的重量建议一律保守，宁可低于用户实际能力，也不要给出虚高的数字。
3. 饮食建议的措辞不得成为进食障碍的诱因：不使用「罪恶」「惩罚」「燃烧」「净化」「好食物/坏食物」这类说法，不评价身体外观的优劣，不鼓励用户害怕某类食物。
4. 不给出低于女性 1600 kcal/天、男性 2000 kcal/天的热量建议；不设计超过 24 小时的断食；不提及任何药物或运动营养处方。补剂只引用 GB 24154-2015 表 3 的每日使用量区间，并同时带上该标准要求的不适宜人群警示；不替具体个人算补剂用量或安排服用方案。
5. 体重变化速度上限约每周 1%，超出这个速度的方案一律不要提。
6. 输出严格遵循用户要求的 JSON，不加 markdown 代码块标记，不加解释性文字。所有面向用户的文案用中文，朴实、具体，不喊口号。`;
export class AiError extends Error {
    kind;
    detail;
    constructor(kind, detail) {
        super(detail);
        this.kind = kind;
        this.detail = detail;
    }
}
function endpoint(baseURL) {
    const trimmed = baseURL.trim().replace(/\/+$/, '');
    return `${trimmed}/chat/completions`;
}
async function complete(cfg, system, user, timeoutMs = 25000) {
    if (!cfg.apiKey)
        throw new AiError('noKey', '没有填写 API Key');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(endpoint(cfg.baseURL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({
                model: cfg.model,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ]
            }),
            signal: ctrl.signal
        });
        if (!res.ok) {
            throw new AiError('http', `接口返回 ${res.status}：${(await res.text()).slice(0, 160)}`);
        }
        const json = (await res.json());
        const content = json.choices?.[0]?.message?.content;
        if (!content)
            throw new AiError('shape', '返回里没有内容');
        return content;
    }
    catch (e) {
        if (e instanceof AiError)
            throw e;
        if (e.name === 'AbortError')
            throw new AiError('timeout', `超过 ${Math.round(timeoutMs / 1000)} 秒没有响应`);
        throw new AiError('network', e.message || '请求没有发出去（可能是网络或跨域限制）');
    }
    finally {
        clearTimeout(timer);
    }
}
function extractJson(text) {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last <= first)
        throw new AiError('parse', '模型没有返回 JSON');
    return JSON.parse(cleaned.slice(first, last + 1));
}
const GOAL_KEYS = [
    'shape',
    'lean',
    'bulk',
    'strength',
    'glute_legs',
    'chest',
    'shoulders',
    'endurance',
    'health',
    'unknown'
];
/** 愿望 → 可衡量目标。失败由调用方回退到规则映射，不阻塞流程 */
export async function goalFromWishViaAI(cfg, p) {
    const facts = [
        `性别 ${p.sex === 'male' ? '男' : p.sex === 'female' ? '女' : '未填'}`,
        p.age != null ? `${p.age} 岁` : '年龄未填',
        p.heightCm != null ? `身高 ${p.heightCm}cm` : '身高未填',
        p.weightKg != null ? `体重 ${p.weightKg}kg` : '体重未填',
        p.bodyFatPct ? `体脂估计 ${p.bodyFatPct}%` : '体脂不知道',
        `训练基础：${['几乎没系统练过', '断续练过', '一直规律练'][tierOf(p)] ?? '未填'}`,
        `一周能练 ${(p.weekdays ?? []).length} 天`,
        p.noCardio ? '用户明确不要有氧' : '有氧照常安排',
        isHomeMode(p) ? '器械：在家，只有哑铃和自重' : '器械：健身房全套',
        p.avoidNames.length ? `用户点名不要的动作：${p.avoidNames.join('、')}` : '',
        p.sessionMinutes != null ? `每次 ${p.sessionMinutes} 分钟` : '每次时长不固定，开练前才决定',
        p.sleepHours != null ? `睡 ${p.sleepHours} 小时` : '睡眠时长未填，按 7 小时以上安排',
        p.dailySteps != null ? `日常 ${p.dailySteps} 步` : '日常步数未填'
    ].join('，');
    const user = `我的愿望（原话）：${p.goalWish}

我的情况：${facts}。器械条件：${isHomeMode(p) ? '只有家里的哑铃、自重、引体杆' : '商业健身房全套器械'}${p.extraEquipment ? `，另有 ${p.extraEquipment}` : ''}。${p.injuries.length ? `伤病史：${p.injuries.map((i) => `${i.area}/${i.side}侧，诱发动作 ${i.triggers}`).join('；')}` : p.injuriesAnswered ? '伤病：用户确认过没有' : '伤病：首屏没问过，用户暂时没标记任何部位'}
${p.dietRestrictions ? `饮食禁忌：${p.dietRestrictions}` : '饮食禁忌：未填，按通用建议给'}

把这个愿望翻译成可衡量的目标。只输出这个 JSON 结构：
{
 "kindKey": "shape|lean|bulk|strength|glute_legs|chest|shoulders|endurance|health|unknown 里选一个",
 "headline": "一句话说明这个愿望实际意味着练什么",
 "priorityAreas": ["要优先发展的部位，2-4 个，用中文"],
 "weeks": 8 到 16 之间的整数,
 "bodyFatBand": [下限, 上限] 或 null,
 "strengthTargets": [{"lift":"动作 + 次数区间","target":"具体重量 × 次数","basis":"为什么是这个数"}],
 "weeklyTargets": ["这一周要达成的可执行事项，3-4 条"],
 "checks": ["怎么衡量有没有进展，4-6 条，必须包含称重方式与完成度定义"]
}
要求：力量目标参照同水平训练者的合理值，不要按运动员标准；不给饥饿方案；不推荐补剂。`;
    const raw = extractJson(await complete(cfg, SAFETY_PROMPT + '\n\n' + '你的任务只做目标翻译。', user));
    const kindKey = GOAL_KEYS.includes(raw.kindKey)
        ? raw.kindKey
        : 'unknown';
    if (typeof raw.headline !== 'string' || !Array.isArray(raw.strengthTargets)) {
        throw new AiError('shape', '目标 JSON 结构不完整');
    }
    const band = Array.isArray(raw.bodyFatBand) && raw.bodyFatBand.length === 2
        ? [Number(raw.bodyFatBand[0]), Number(raw.bodyFatBand[1])]
        : null;
    return {
        source: 'ai',
        kindKey: String(kindKey),
        headline: raw.headline,
        priorityAreas: toStringArray(raw.priorityAreas, ['全身']),
        weeks: clampInt(raw.weeks, 6, 16, 12),
        bodyFatBand: band && Number.isFinite(band[0]) && Number.isFinite(band[1]) ? band : null,
        strengthTargets: raw.strengthTargets.slice(0, 6).map((t) => ({
            lift: String(t.lift ?? ''),
            target: String(t.target ?? ''),
            basis: String(t.basis ?? '')
        })),
        weeklyTargets: toStringArray(raw.weeklyTargets, []),
        checks: toStringArray(raw.checks, [])
    };
}
/** 换动作建议：候选列表由本地动作库给出，模型只负责排序和说明 */
export async function swapAdvice(cfg, from, candidates, symptom) {
    const user = `原动作：${from.name}（目标肌群 ${from.muscles.join('、')}，器械 ${from.equipment}）。
换掉它的原因：${symptom || from.why}
${symptom ? '注意：用户报告了这个动作里有不适感，请优先给冲击更小的替代，并提醒如果持续疼痛应就医。' : ''}
候选动作（只能从这些里选，最多 3 个）：
${candidates.map((c) => `- ${c.id} | ${c.name} | ${c.muscles.join('、')} | ${c.equipment.join('、')}`).join('\n')}

只输出 JSON：{"picks":[{"id":"候选的 id","reason":"为什么换它，一句话，包含组间休息与次数怎么跟着调"}]}`;
    const raw = extractJson(await complete(cfg, SAFETY_PROMPT, user, 15000));
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const picks = (raw.picks ?? []).filter((x) => byId.has(x.id)).slice(0, 3);
    if (picks.length === 0)
        throw new AiError('shape', '模型没有给出可用的候选');
    return picks.map((x) => ({ id: x.id, name: byId.get(x.id).name, reason: x.reason }));
}
/** 照着某个公众人物的身材定目标：模型先说清那是什么样的身材，再落到这个人自己的数字上 */
export async function goalFromReferenceViaAI(cfg, p, ref) {
    const facts = [
        `性别 ${p.sex === 'male' ? '男' : p.sex === 'female' ? '女' : '未填'}`,
        p.age != null ? `${p.age} 岁` : '年龄未填',
        p.heightCm != null ? `身高 ${p.heightCm}cm` : '身高未填',
        p.weightKg != null ? `体重 ${p.weightKg}kg` : '体重未填',
        p.bodyFatPct ? `现在体脂估计 ${p.bodyFatPct}%` : '现在体脂不知道',
        `训练基础：${['几乎没系统练过', '断续练过', '一直规律练'][tierOf(p)] ?? '未填'}`,
        `一周能练 ${(p.weekdays ?? []).length} 天`,
        isHomeMode(p) ? '器械：在家，只有哑铃和自重' : '器械：健身房全套'
    ].join('，');
    const user = `我想照着「${ref}」的身材练。

我的情况：${facts}。${p.injuries.length ? `伤病史：${p.injuries.map((i) => `${i.area}/${i.side}侧，诱发动作 ${i.triggers}`).join('；')}` : ''}

分两步：
1. 先用两三句说清这个人的身材到底是什么样（肩腰比例、围度水平、大概体脂区间），只讲公开画面能看出来的，不要编造他的训练计划、用药情况或隐私。
2. 再把这个身材落到我身上：我在这个身高性别下练若干周实际能到的体脂和围度方向，力量参照按我现在的水平定，不要按他的数字。

只输出这个 JSON 结构：
{
 "kindKey": "shape|lean|bulk|strength|glute_legs|chest|shoulders|endurance|health|unknown 里选一个",
 "headline": "一句话：照着这个人练，实际意味着把哪几个部位练成什么样",
 "priorityAreas": ["要优先发展的部位，2-4 个，用中文"],
 "weeks": 8 到 16 之间的整数,
 "bodyFatBand": [下限, 上限] 或 null,
 "strengthTargets": [{"lift":"动作 + 次数区间","target":"具体重量 × 次数","basis":"为什么是这个数，按我的水平"}],
 "weeklyTargets": ["这一周要达成的可执行事项，3-4 条"],
 "checks": ["怎么衡量有没有进展，4-6 条，必须包含称重方式与完成度定义"]
}
要求：力量目标按同身高同性别训练者的合理值给，不要按运动员标准；不要暗示必须练成那个人的样子才算好；不给饥饿方案；不推荐补剂。`;
    const raw = extractJson(await complete(cfg, SAFETY_PROMPT + '\n\n' + '你的任务只做「照着谁练」的目标翻译。', user, 30000));
    if (typeof raw.headline !== 'string' || !Array.isArray(raw.strengthTargets)) {
        throw new AiError('shape', '目标 JSON 结构不完整');
    }
    const kindKey = GOAL_KEYS.includes(raw.kindKey) ? raw.kindKey : 'unknown';
    const band = Array.isArray(raw.bodyFatBand) && raw.bodyFatBand.length === 2
        ? [Number(raw.bodyFatBand[0]), Number(raw.bodyFatBand[1])]
        : null;
    return {
        source: 'ai',
        refPerson: ref,
        kindKey: String(kindKey),
        headline: raw.headline,
        priorityAreas: toStringArray(raw.priorityAreas, ['全身']),
        weeks: clampInt(raw.weeks, 6, 16, 12),
        bodyFatBand: band && Number.isFinite(band[0]) && Number.isFinite(band[1]) ? band : null,
        strengthTargets: raw.strengthTargets.slice(0, 6).map((t) => ({
            lift: String(t.lift ?? ''),
            target: String(t.target ?? ''),
            basis: String(t.basis ?? '')
        })),
        weeklyTargets: toStringArray(raw.weeklyTargets, []),
        checks: toStringArray(raw.checks, [])
    };
}
function toStringArray(v, fallback) {
    if (Array.isArray(v)) {
        const out = v.map((x) => String(x)).filter(Boolean);
        if (out.length)
            return out;
    }
    return fallback;
}
function clampInt(v, lo, hi, dflt) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return dflt;
    return Math.min(hi, Math.max(lo, Math.round(n)));
}
export function sexWord(s) {
    return s === 'male' ? '男' : s === 'female' ? '女' : '未填';
}
