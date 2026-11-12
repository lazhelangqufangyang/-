import { byId, EXERCISES, fitsEquipment, homeSwap } from './exercises.js';
import { isPrimeFor, ROLE_ONLY_AREAS } from './areas.js';
import { injuryAreas, isHomeMode, resolveExercise, tierOf } from './load.js';
import { weekdayName } from './goals.js';
import { uid } from './time.js';
import { todayIso } from './time.js';
const TEMPLATES = {
    '全身 A': {
        role: '全身 A',
        focus: '下肢蹲类 + 全身',
        headline: '杠铃蹲为主项，推和拉各留一个，把一周的动作模式都过一遍',
        mainLiftId: 'back-squat',
        exerciseIds: ['back-squat', 'bench-press', 'lat-pulldown', 'leg-curl', 'plank'],
        cardioMin: 8
    },
    '全身 B': {
        role: '全身 B',
        focus: '髋铰链 + 上肢',
        headline: '硬拉类为主项，配推举与划船，和全身 A 交替',
        mainLiftId: 'conventional-deadlift',
        exerciseIds: ['conventional-deadlift', 'overhead-press', 'chest-supported-row', 'bulgarian-split-squat', 'db-curl'],
        cardioMin: 8
    },
    推: {
        role: '推',
        focus: '胸 / 肩 / 三头',
        headline: '卧推为主项，推举与上斜跟上，侧平举收尾',
        mainLiftId: 'bench-press',
        exerciseIds: ['bench-press', 'db-shoulder-press', 'incline-db-press', 'lateral-raise', 'cable-triceps-pushdown'],
        cardioMin: 8
    },
    拉: {
        role: '拉',
        focus: '背 / 二头 / 后束',
        headline: '划船为主项，下拉与面拉保证背宽和肩袖',
        mainLiftId: 'bb-row',
        exerciseIds: ['bb-row', 'lat-pulldown', 'seated-cable-row', 'face-pull', 'db-curl'],
        cardioMin: 8
    },
    腿: {
        role: '腿',
        focus: '股四 / 臀 / 腘绳',
        headline: '深蹲为主项，铰链与单腿跟上，小腿和核心放在最后',
        mainLiftId: 'back-squat',
        exerciseIds: ['back-squat', 'rdl', 'bulgarian-split-squat', 'leg-curl', 'standing-calf-raise', 'plank'],
        cardioMin: 0
    },
    上肢弱项: {
        role: '上肢弱项',
        focus: '背宽与肩围补量',
        headline: '第二个上肢日，专门把背和肩的容量补上来',
        mainLiftId: 'overhead-press',
        exerciseIds: [
            'overhead-press',
            'chest-supported-row',
            'incline-db-press',
            'lateral-raise',
            'rear-del-fly',
            'hammer-curl'
        ],
        cardioMin: 10
    },
    '下肢与有氧': {
        role: '下肢与有氧',
        focus: '臀腿第二次 + 心肺',
        headline: '髋主导为主项，器械补量，有氧时间给足',
        mainLiftId: 'hip-thrust',
        exerciseIds: ['hip-thrust', 'leg-press', 'leg-extension', 'standing-calf-raise', 'dead-bug'],
        cardioMin: 18
    },
    有氧与活动度: {
        role: '有氧与活动度',
        focus: '心肺 + 恢复',
        headline: '没有大重量，把心肺和活动度做完就算完成',
        mainLiftId: null,
        exerciseIds: ['treadmill-incline', 'rower', 'dead-bug'],
        cardioMin: 30
    },
    '胸+三头': {
        role: '胸+三头',
        focus: '胸 / 三头',
        headline: '坐姿推胸器为主项，上斜和夹胸各一个，三头放最后，四个动作做完就走',
        mainLiftId: 'machine-chest-press',
        exerciseIds: ['machine-chest-press', 'incline-db-press', 'cable-fly', 'cable-triceps-pushdown'],
        cardioMin: 8
    },
    '背+二头': {
        role: '背+二头',
        focus: '背 / 二头',
        headline: '高位下拉为主项，配一个划船，二头和肩袖收尾',
        mainLiftId: 'lat-pulldown',
        exerciseIds: ['lat-pulldown', 'seated-cable-row', 'face-pull', 'db-curl'],
        cardioMin: 8
    },
    '腿+臀': {
        role: '腿+臀',
        focus: '腿 / 臀 / 小腿',
        headline: '腿举为主项，高脚杯蹲和腿弯举跟上，小腿放在最后',
        mainLiftId: 'leg-press',
        exerciseIds: ['leg-press', 'goblet-squat', 'seated-leg-curl', 'standing-calf-raise'],
        cardioMin: 6
    },
    '肩+手臂': {
        role: '肩+手臂',
        focus: '肩 / 二头 / 三头',
        headline: '器械推肩为主项，侧平举和后束把肩补齐，手臂这一周练第二次',
        mainLiftId: 'machine-shoulder-press',
        exerciseIds: ['machine-shoulder-press', 'lateral-raise', 'rear-del-fly', 'hammer-curl'],
        cardioMin: 8
    }
};
const SPLITS = {
    1: ['全身 A'],
    2: ['全身 A', '全身 B'],
    3: ['推', '拉', '腿'],
    4: ['推', '拉', '腿', '上肢弱项'],
    5: ['推', '拉', '腿', '上肢弱项', '下肢与有氧'],
    6: ['推', '拉', '腿', '推', '拉', '腿'],
    7: ['推', '拉', '腿', '上肢弱项', '下肢与有氧', '全身 B', '有氧与活动度']
};
const NOVICE_CYCLE = ['胸+三头', '背+二头', '腿+臀', '肩+手臂'];
export function splitFor(days, novice = false) {
    const n = Math.min(7, Math.max(1, days));
    if (novice)
        return Array.from({ length: n }, (_, i) => NOVICE_CYCLE[i % NOVICE_CYCLE.length]);
    return SPLITS[n] ?? SPLITS[3];
}
/**
 * 你点了「这天练什么部位」就不套分化模板：只排主动肌就是这个部位的动作。
 * 深蹲那种顺带练到核心的不算，宁可一天少两个动作也不拿它凑数。
 */
function areaTemplate(p, area) {
    const home = isHomeMode(p);
    const rank = (ex) => (ex.heavy ? 0 : ex.kind === 'compound' ? 1 : 2);
    const prime = EXERCISES.filter((ex) => isPrimeFor(ex, area) && fitsEquipment(ex, home) && !p.avoidNames.some((k) => k.length > 1 && ex.name.includes(k))).sort((a, b) => rank(a) - rank(b));
    if (!prime.length)
        return null;
    const head = prime[0];
    const canMain = head.heavy || head.kind === 'compound';
    const short = prime.length < 4 ? `，库里主要练${area}的只有 ${prime.length} 个动作，没拿顺带练到的凑数` : '';
    return {
        role: area,
        focus: `你点的 ${area}`,
        headline: `这天你点了「${area}」：${canMain ? `主项 ${head.name}，重量照常按递增热身组往上推` : '没有够格当主项的大重量动作，组间休息全按辅助动作给'}${short}`,
        mainLiftId: canMain ? head.id : null,
        exerciseIds: prime.slice(0, 6).map((ex) => ex.id),
        cardioMin: area === '腿' || area === '臀' ? 0 : 8
    };
}
function applyPriority(t, goal) {
    if (!goal)
        return t;
    const copy = { ...t, exerciseIds: [...t.exerciseIds] };
    const areas = goal.priorityAreas.join(' ');
    if (/背宽|背/.test(areas) && copy.role.match(/拉|上肢|全身/)) {
        const idx = copy.exerciseIds.indexOf('lat-pulldown');
        if (idx > 0 && !copy.mainLiftId?.includes('pull')) {
            copy.exerciseIds.splice(idx, 1);
            copy.exerciseIds.splice(1, 0, 'lat-pulldown');
        }
    }
    if (/肩/.test(areas) && copy.role.match(/推|上肢/)) {
        const idx = copy.exerciseIds.indexOf('lateral-raise');
        if (idx > 1) {
            copy.exerciseIds.splice(idx, 1);
            copy.exerciseIds.splice(1, 0, 'lateral-raise');
        }
    }
    if (/臀/.test(areas) && copy.role.match(/腿|下肢/)) {
        if (!copy.exerciseIds.includes('hip-thrust'))
            copy.exerciseIds.splice(1, 0, 'hip-thrust');
    }
    if (goal.kindKey === 'endurance')
        copy.cardioMin = copy.cardioMin + 8;
    if (goal.kindKey === 'lean')
        copy.cardioMin = copy.cardioMin + 6;
    if (goal.kindKey === 'bulk')
        copy.cardioMin = Math.max(0, copy.cardioMin - 5);
    if (goal.kindKey === 'strength')
        copy.cardioMin = Math.min(copy.cardioMin, 8);
    return copy;
}
/** 档案里没填每次时长时不猜一个数：返回 0 表示「未定」，分钟占用留给每天的表按实际时长算 */
function allocation(total, cardio) {
    if (total === null)
        return { warmup: 0, cooldown: 0, cardioMin: cardio, main: 0 };
    const warmup = total >= 80 ? 16 : total >= 65 ? 14 : total >= 50 ? 12 : 9;
    const cooldown = total >= 50 ? 5 : 3;
    const cardioMin = Math.max(0, Math.min(cardio, Math.max(0, total - warmup - cooldown - 22)));
    return { warmup, cooldown, cardioMin, main: Math.max(15, total - warmup - cooldown - cardioMin) };
}
/**
 * 一个模板动作在三重约束下的落位：伤病换动作 → 器械够不够 → 用户点名不要。
 * 返回 null 表示这一项彻底没了替代品，调用方要把它记进 substitutions 里说明。
 */
function placeExercise(ex, p, areas, note, home) {
    const first = resolveExercise(ex, areas);
    let cur = first.ex;
    if (first.replaced && !note.includes(first.replaced))
        note.push(first.replaced);
    if (home && !fitsEquipment(cur, true)) {
        const alt = homeSwap(cur, areas);
        if (!alt) {
            const msg = `${cur.name} 需要${cur.equipment.join('/')}，在家做不了，同类动作里也没有能替代的，这一项去掉`;
            if (!note.includes(msg))
                note.push(msg);
            return null;
        }
        const msg = `${cur.name} → ${alt.name}（在家只有哑铃和自重，换成做得出来的同类动作）`;
        if (!note.includes(msg))
            note.push(msg);
        cur = alt;
    }
    const hit = p.avoidNames.find((k) => k.length > 1 && cur.name.includes(k));
    if (hit) {
        const msg = `按你说的去掉了「${hit}」：${cur.name} 不再排进计划`;
        if (!note.includes(msg))
            note.push(msg);
        return null;
    }
    return cur;
}
export function buildFramework(p, goal, keep) {
    const weeks = goal?.weeks ?? 8;
    const novice = tierOf(p) === 0;
    const given = p.weekdays ?? null;
    const assumed = [];
    // 空数组是「你一天都没点」，跟没问过（null）不一样，不能拿默认四天盖掉它
    let weekdays = given ? [...given].sort((a, b) => a - b) : [];
    if (given === null) {
        weekdays = [1, 2, 3, 4];
        assumed.push('训练日没问过你，先按周一到周四四天排，「运动」页下面的「这周怎么练」可以改');
    }
    if (!p.goalWish.trim()) {
        assumed.push('你没写想练成什么样，这一轮按「八周把训练建立起来，重量稳步上升」排');
    }
    const roles = splitFor(weekdays.length, novice);
    const areas = injuryAreas(p);
    const home = isHomeMode(p);
    const total = p.sessionMinutes;
    if (!p.injuries.length && !p.injuriesAnswered) {
        assumed.push('没问过伤病史：计划里默认按无伤排，任何动作做的时候刺痛就停在那一组，在「训练条件」里说一句「我膝盖不舒服」我就换动作');
    }
    if (p.commercialGym === null && !p.homeOnly) {
        assumed.push('没问过器械条件：默认按能用健身房排。只有哑铃和自重就在「训练条件」里说「我在家练」，杠铃和固定器械的动作会全部换成家里做得出来的');
    }
    if (p.sex === null || p.weightKg === null) {
        assumed.push(`身体数据跳过了${p.sex === null ? '（性别没填，力量参照按男女中间系数，体脂区间也不给）' : '（体重没填，热量参考和体重变化算不出来）'}：动作重量照常按你每组的记录往上推，不受影响`);
    }
    if (p.experienceYears === null && p.lastSolidBlock === null) {
        assumed.push('没问你有没有练过：起始重量一律按最保守的一档给，前两次以把动作找稳为主，之后按你记录的组往上加');
    }
    const days = weekdays.map((weekday, i) => {
        const area = p.dayAreas?.[String(weekday)] ?? '';
        const fallback = TEMPLATES[roles[i]] ?? TEMPLATES['推'];
        let raw = fallback;
        if (area && ROLE_ONLY_AREAS[area])
            raw = TEMPLATES[ROLE_ONLY_AREAS[area]] ?? fallback;
        else if (area) {
            const t = areaTemplate(p, area);
            if (t)
                raw = t;
            else
                assumed.push(`${weekdayName(weekday)} 你点了「${area}」，但在你的器械条件（${home ? '只有哑铃和自重' : '健身房'}）和避让要求里没有一个主要练它的动作，这一天照原来的 ${fallback.role} 排`);
        }
        const tuned0 = applyPriority(raw, goal);
        const tuned = area ? { ...tuned0, focus: `${area}（你点的）` } : tuned0;
        const resolved = [];
        const substitutions = [];
        for (const id of tuned.exerciseIds) {
            const ex = byId(id);
            if (!ex)
                continue;
            const placed = placeExercise(ex, p, areas, substitutions, home);
            if (placed && !resolved.includes(placed.id))
                resolved.push(placed.id);
        }
        const alloc = allocation(total, p.noCardio ? 0 : tuned.cardioMin);
        const mainLift = tuned.mainLiftId ? byId(tuned.mainLiftId) : null;
        const main = mainLift ? placeExercise(mainLift, p, areas, substitutions, home) : null;
        let mainId = main ? main.id : null;
        let headline = tuned.headline;
        if (mainLift && !main) {
            const promoteId = resolved.find((id) => byId(id)?.heavy) ?? resolved.find((id) => byId(id)?.kind === 'compound');
            if (promoteId) {
                mainId = promoteId;
                const promoteName = byId(promoteId).name;
                headline = `${mainLift.name} 按你说的去掉了，这一天的主项换成 ${promoteName}，重量照常按递增热身组推`;
                if (!substitutions.includes(headline))
                    substitutions.push(headline);
            }
        }
        if (mainId) {
            // 分钟表把第一行动作当主项（递增热身组也挂在它上面），所以主项必须排在最前
            const idx = resolved.indexOf(mainId);
            if (idx > 0) {
                resolved.splice(idx, 1);
                resolved.unshift(mainId);
            }
        }
        return {
            weekday,
            focus: tuned.focus,
            role: tuned.role,
            headline,
            mainLiftId: mainId,
            exerciseIds: resolved,
            substitutions,
            warmupMin: alloc.warmup,
            mainMin: alloc.main,
            cardioMin: alloc.cardioMin,
            cooldownMin: alloc.cooldown
        };
    });
    return {
        // 改计划是重建同一个框架，不是开新一轮：起始日期一动，第几周和重量推算就全断了
        id: keep?.id ?? uid('fw'),
        createdAt: new Date().toISOString(),
        startDate: keep?.startDate ?? todayIso(),
        weeksTotal: weeks,
        days,
        weeks: buildWeeks(weeks, novice),
        rules: progressionRules(days.length, novice),
        goal,
        assumed
    };
}
function buildWeeks(n, novice = false) {
    const out = [];
    for (let i = 1; i <= n; i += 1) {
        if (n >= 6 && i === n) {
            out.push({
                index: i,
                theme: `第 ${i} 周 · 减量周`,
                intent: '把关节和腰背的累积负担放掉，为下一轮递增腾出空间',
                progression: '主项重量 −10%，每个动作减 1 组，所有组 RPE 不超过 6，次数做满也不加重量',
                rpeBase: 6
            });
            continue;
        }
        if (novice && i <= 2) {
            out.push({
                index: i,
                theme: i === 1 ? '第 1 周 · 学动作' : '第 2 周 · 稳住动作',
                intent: i === 1
                    ? '每个动作先用能把次数做满的重量，把动作顺序和呼吸练熟，同时把实际重量记下来'
                    : '这一周重量照旧，把每个动作都做到位，记录连续了，后面才谈加重',
                progression: '本周不加重量，次数做满也不加；从第 3 周起做满才加',
                rpeBase: i === 1 ? 6 : 6.5,
                freeze: true
            });
            continue;
        }
        if (i === 1) {
            out.push({
                index: i,
                theme: '第 1 周 · 摸底',
                intent: '按表做完，把每个动作的实际重量和次数记下来，之后所有重量推算都依赖这一周',
                progression: '所有重量按「能标准做完且还剩 3 次」来定，不确定就轻一档，本周不加重量',
                rpeBase: 6.5,
                freeze: true
            });
            continue;
        }
        const phase = i <= Math.ceil(n * 0.33) ? 'base' : i <= Math.ceil(n * 0.66) ? 'build' : 'peak';
        if (phase === 'base') {
            out.push({
                index: i,
                theme: `第 ${i} 周 · 打基础`,
                intent: '把动作模式和记录习惯建立起来，重量不是这一阶段的目标',
                progression: '主项做满次数且 RPE ≤ 7 就 +2.5%；没做满就原重量再来一次',
                rpeBase: 7
            });
        }
        else if (phase === 'build') {
            out.push({
                index: i,
                theme: `第 ${i} 周 · 加容量`,
                intent: '在同样时长内多完成 1 组有效组，或把主项次数推到区间上限',
                progression: '主项每周 +2.5%；辅助动作优先加次数，次数到上限再加重',
                rpeBase: 7.5
            });
        }
        else {
            out.push({
                index: i,
                theme: `第 ${i} 周 · 冲峰值`,
                intent: '这一周的最后一次组允许接近力竭，但当天不测极限',
                progression: '维持重量把次数推到最后 1–2 次的能力余量，RPE 到 8 为止',
                rpeBase: 8
            });
        }
    }
    return out;
}
function progressionRules(dayCount, novice = false) {
    return [
        novice
            ? '渐进超负荷：前两周只把动作做稳、次数做满，重量一律不加；从第 3 周起，主项在一次全部做满目标次数且 RPE ≤ 8 时才加 2.5%（杠铃最小片 2.5kg），辅助动作先加次数，加到区间上限再加重'
            : `渐进超负荷：主项在上一次全部做满目标次数且 RPE ≤ 8 时，本周加 2.5%（杠铃最小片 2.5kg）；辅助动作先加次数，达到次数区间上限再加重`,
        `一周练 ${dayCount} 天，同一肌群两次刺激之间的间隔尽量保持 48 小时以上`,
        '减量周触发条件：连续 2 周完成度低于 70%，或同一主项重量停滞 3 周',
        '触发减量后的做法：主项重量 −10%、每个动作减 1 组、有氧时长减半，一周后恢复正常递增',
        '单日降载：档案里的平常睡眠不足 6 小时，主项重量自动下调 5–10%，并标记为「保容量，不冲 PR」',
        '本表所有重量都是推算值，不是考核值。任何动作出现刺痛就停在那一组，换替代动作或减小幅度，持续疼痛请就医'
    ];
}
