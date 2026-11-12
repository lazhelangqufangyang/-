import { byId, cautionText, EXERCISES, fitsEquipment } from './exercises.js';
import { AREA_PATTERN, hitsAnyArea, hitsArea, isPrimeFor, isPrimeForAny } from './areas.js';
import { injuryAreas, isHomeMode, resolveExercise, roundLoad, suggestWeight, tierOf } from './load.js';
import { weekdayName } from './goals.js';
import { addDaysIso, uid, weekdayOf } from './time.js';
const NO_AREA = '不指定';
/**
 * 「今天练哪里」可以多选：wantAreas 是现在界面上点的那一组，
 * wantArea 是它的第一个（老数据里只有这一个），两边读出来是同一个列表。
 */
export function wantAreasOf(input) {
    const raw = input.wantAreas?.length ? input.wantAreas : input.wantArea ? [input.wantArea] : [];
    return [...new Set(raw.filter((a) => a && a !== NO_AREA))];
}
const SETUP = {
    杠铃: 40,
    哑铃: 22,
    固定器械: 22,
    龙门架: 22,
    自重: 10,
    引体杆: 10,
    双杠: 10,
    有氧区: 20
};
const TRANSITION = 45;
function setupSec(ex) {
    return Math.max(...ex.equipment.map((e) => SETUP[e] ?? 20));
}
function workSec(ex, reps) {
    if (ex.pattern === 'core' && ex.unit === '无')
        return Math.max(25, reps);
    return Math.max(15, reps * 4);
}
function liftDuration(ex, plan) {
    const setup = setupSec(ex);
    const work = plan.reduce((s, p) => s + workSec(ex, p.reps) + setup, 0);
    const rests = plan.slice(0, -1).reduce((s, p) => s + p.restSec, 0);
    return work + rests + TRANSITION;
}
function buildLiftSlot(slotId, kind, ex, plan, prIntent, note, cautionNote) {
    return {
        id: slotId,
        kind,
        exId: ex.id,
        name: ex.name,
        muscles: ex.muscles,
        equipment: ex.equipment.join('·'),
        startSec: 0,
        durationSec: liftDuration(ex, plan),
        sets: plan.length,
        // 用排好的组间休息，而不是动作库里的原始值：主项会被拉到 150–180 秒，两者不一致时表上要说真话
        restSec: plan.find((s) => s.restSec > 0)?.restSec ?? ex.restSec,
        setPlan: plan,
        prIntent,
        note,
        cautionNote,
        unit: ex.unit
    };
}
function timedSlot(slotId, kind, name, seconds, note, ex) {
    return {
        id: slotId,
        kind,
        exId: ex?.id ?? null,
        name,
        muscles: ex?.muscles ?? [],
        equipment: ex ? ex.equipment.join('·') : '',
        startSec: 0,
        durationSec: seconds,
        sets: 0,
        restSec: 0,
        setPlan: [],
        prIntent: false,
        note,
        cautionNote: '',
        unit: ex?.unit
    };
}
function mobilityNote(day) {
    // role 也可能是「今天练哪里」点出来的部位名，不只是周框架的推/拉/腿
    const role = day.role;
    if (/腿|下肢|臀/.test(role)) {
        return {
            name: '动态活动度：髋屈肌 + 踝背屈 + 臀中肌',
            note: '每个方向 8–10 次，做到关节能打开而不是拉到痛'
        };
    }
    if (/推|胸|肩|臂/.test(role)) {
        return {
            name: '动态活动度：胸椎旋转 + 肩绕环 + 前锯肌',
            note: '肩在无痛范围内绕环，随后 10 次肩胛前推'
        };
    }
    if (/拉|上肢|背/.test(role)) {
        return {
            name: '动态活动度：胸椎旋转 + 肩袖外旋 + 背阔拉伸',
            note: '外旋用轻阻力带，每侧 12 次，不憋气'
        };
    }
    return { name: '动态活动度：髋 + 胸椎 + 肩组合', note: '每个方向 8 次，把今天要用到的关节都过一遍' };
}
export function currentWeek(fw, date) {
    // 自由训练没有周框架：给一个固定的中等强度周，不排递进也不排减量周
    if (!fw)
        return { index: 1, theme: '自由训练 · 不递进', intent: '', progression: '', rpeBase: 7 };
    const start = new Date(`${fw.startDate}T00:00:00`).getTime();
    const cur = new Date(`${date}T00:00:00`).getTime();
    const idx = Math.floor((cur - start) / 86400000 / 7) + 1;
    const clamped = Math.min(Math.max(1, idx), Math.max(1, fw.weeks.length));
    return fw.weeks[clamped - 1] ?? { index: 1, theme: '第 1 周 · 摸底', intent: '', progression: '', rpeBase: 6.5 };
}
/**
 * 三档容量换算成引擎内部的工作量上限（秒）。这个数字不出现在任何界面上，
 * 它只决定「这一天塞得下几个动作、要不要收组数」以及砍项顺序。
 */
const CAPACITY_SEC = { small: 32 * 60, medium: 48 * 60, large: 68 * 60 };
/** 档案里写过「每次多少分钟」的老数据折算成一档容量；没写过就是中档 */
function capacityFromMinutes(min) {
    if (min <= 38)
        return 'small';
    if (min >= 60)
        return 'large';
    return 'medium';
}
function resolveInput(p, day, input) {
    const assumed = [];
    let capacity;
    let totalMinutes;
    if (input.totalMinutes != null && Number.isFinite(input.totalMinutes)) {
        // 老数据存过分钟数，或你在「改计划」里说过每次只能练多久：照它排，只是不再显示分钟
        const min = Math.min(240, Math.max(20, input.totalMinutes));
        capacity = capacityFromMinutes(min);
        totalMinutes = min;
    }
    else {
        capacity = input.capacity ?? 'medium';
        const planned = day ? day.warmupMin + day.mainMin + day.cardioMin + day.cooldownMin : 0;
        if (input.capacity) {
            totalMinutes = CAPACITY_SEC[capacity] / 60;
        }
        else if (p.sessionMinutes != null) {
            capacity = capacityFromMinutes(p.sessionMinutes);
            totalMinutes = CAPACITY_SEC[capacity] / 60;
        }
        else if (planned >= 20) {
            // 框架里没填每次时长时这些分块故意是 0（意思是「未定」），不能当成「这天只排了 8 分钟」
            capacity = capacityFromMinutes(planned);
            totalMinutes = CAPACITY_SEC[capacity] / 60;
        }
        else {
            totalMinutes = CAPACITY_SEC[capacity] / 60;
        }
    }
    const reported = input.statusSelf != null || input.sleepHours != null;
    let statusSelf = input.statusSelf;
    if (statusSelf == null || !Number.isFinite(statusSelf))
        statusSelf = 3;
    let sleepHours = input.sleepHours ?? p.sleepHours;
    if (sleepHours == null || !Number.isFinite(sleepHours))
        sleepHours = 7;
    return { totalMinutes, capacity, statusSelf, sleepHours, reported, assumed };
}
/**
 * 界面上要说这张表按哪一档排的：一律从实际用的工作量反推，
 * 这样老数据（只存过分钟数）和「分钟数压过档位」的情况都说得跟表一致。
 */
export function capacityOf(sheet) {
    return capacityFromMinutes(sheet.budgetMinutes ?? 48);
}
/**
 * 只给出下调比例和原因，具体下调多少由调用方按合成后的 pct 说明，避免两处数字对不上。
 * 界面上已经不问状态自评了，所以原因里只写真存在的项：低分只能来自老数据，睡眠标清是从档案来的。
 */
function stateAdjust(statusSelf, sleepHours, sleepNote = '') {
    const parts = [];
    if (statusSelf <= 2)
        parts.push(`状态自评 ${statusSelf}`);
    if (sleepHours < 6)
        parts.push(`睡 ${sleepHours} 小时${sleepNote}`);
    if (parts.length === 0)
        return { pct: 1, cause: '' };
    const severe = statusSelf <= 1 || sleepHours < 5;
    return { pct: severe ? 0.9 : 0.95, cause: parts.join(' / ') + (severe ? '，几乎没恢复' : '') };
}
function rpeSeries(base, count, cap, prTop) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
        const bump = i === count - 1 && prTop ? 1 : i >= count - 2 ? 0.5 : 0;
        out.push(Math.min(cap, Number((base + bump).toFixed(1))));
    }
    return out;
}
/** 一条自己记的运动练到了哪些部位：直接点的部位 + 选的动作的肌肉折算 */
function activityAreas(a) {
    const texts = a.exIds.map((id) => byId(id)?.muscles.join(' ') ?? '');
    const fromEx = Object.keys(AREA_PATTERN).filter((area) => texts.some((t) => AREA_PATTERN[area].test(t)));
    return [...new Set([...(a.areas ?? []), ...fromEx])];
}
/**
 * 昨天练过同一部位时收容量，而不是收重量。
 * 界面上已经不问「昨天练了哪里」了，这里直接看你昨天在这台机器上记下的东西。
 */
function areasLoggedYesterday(logs, acts, date) {
    const prev = addDaysIso(date, -1);
    const primeMuscles = logs.filter((l) => l.date === prev).map((l) => byId(l.exId)?.muscles[0] ?? '');
    // 手记的那条：点过的部位和选过的动作都算「昨天练过这个部位」
    const picked = acts.filter((a) => a.date === prev).flatMap(activityAreas);
    return Object.keys(AREA_PATTERN).filter((area) => AREA_PATTERN[area].test(primeMuscles.join(' ')) || picked.includes(area));
}
function overlapsYesterday(day, yesterdayAreas) {
    if (!yesterdayAreas.length)
        return false;
    return day.exerciseIds.some((id) => {
        const muscle = byId(id)?.muscles[0] ?? '';
        return yesterdayAreas.some((a) => AREA_PATTERN[a].test(muscle));
    });
}
/** 重排后行的顺序可能变，只保留还在表上的那些标记 */
function keptSkipped(skipped, slots) {
    const ids = new Set(slots.map((s) => s.id));
    return [...new Set((skipped ?? []).filter((id) => ids.has(id)))];
}
/**
 * 手动点名的动作先过一遍器械条件：家里做不了的不要偷偷换成别的，
 * 也不要排进表让人去够一台没有的机器，直接说明并跳过。
 */
function resolvePicked(p, ids) {
    const home = isHomeMode(p);
    const list = [];
    const notes = [];
    for (const id of ids) {
        const ex = byId(id);
        if (!ex)
            continue;
        if (list.some((x) => x.id === ex.id))
            continue;
        if (!fitsEquipment(ex, home)) {
            notes.push(`你点的 ${ex.name} 要用 ${ex.equipment.join('·')}，${home ? '你现在的条件只有哑铃和自重' : '器械条件不满足'}，这一项没排进表；想做就在档案里改成有健身房，或换成动作页里同类的居家动作`);
            continue;
        }
        list.push(ex);
    }
    return { list, notes };
}
/** 今天不是训练日、但你自己点了动作：就按这些动作现排一张表，周框架照样不动 */
function pickedDayPlan(picked, weekday, tail) {
    const lifts = picked.filter((ex) => ex.pattern !== 'cardio');
    const rank = (ex) => (ex.heavy ? 0 : ex.kind === 'compound' ? 1 : 2);
    const sorted = [...lifts].sort((a, b) => rank(a) - rank(b));
    const head = sorted[0];
    return {
        weekday,
        focus: `自选 · ${picked.length} 个动作`,
        role: '自选',
        headline: `今天不在你选的训练日，这张表完全按你在「动作」页点进来的动作排，${tail}`,
        mainLiftId: head && (head.heavy || head.kind === 'compound') ? head.id : null,
        exerciseIds: sorted.map((e) => e.id),
        substitutions: [],
        warmupMin: 0,
        mainMin: 0,
        cardioMin: 0,
        cooldownMin: 0
    };
}
/**
 * 「今天练哪里」落到当天的动作顺序上：清单把第一行当主项（递增热身组挂在它上面），
 * 所以主动肌匹配上的复合动作顶到第一行，只是顺带练到的不抢；
 * 匹配到的都是孤立动作就不当主项，提到主项后面一位并加组；
 * 一个都不匹配就从动作库里按器械和避让词补，补在主项之后——你点的部位一个都不会漏。
 */
function planOrder(p, day, wants, flags, budgetMinutes) {
    const entries = day.exerciseIds.map((exId, i) => ({ exId, key: `lift-${i}` }));
    if (!wants.length)
        return entries;
    const area = wants.join('、');
    const hit = (ex) => hitsAnyArea(ex, wants);
    const prime = (ex) => isPrimeForAny(ex, wants);
    const head = entries[0];
    const liftish = (e) => {
        const ex = byId(e.exId);
        return Boolean(ex && (ex.heavy || ex.kind === 'compound'));
    };
    const matched = entries.filter((e) => hit(byId(e.exId)));
    let ordered = entries;
    if (matched.length) {
        const headPrime = head ? prime(byId(head.exId)) : false;
        // 主项位置只给「主动肌就是它」的复合动作；顺带练到的（卧推带三角前束）不抢主项
        const promotable = headPrime
            ? undefined
            : matched.find((e) => liftish(e) && e.key !== head?.key && prime(byId(e.exId)));
        if (promotable) {
            const ex = byId(promotable.exId);
            const old = head ? byId(head.exId).name : '';
            flags.push(`今天你说练「${area}」：${ex.name} 顶到第一行按主项对待${ex.ramp ? '（递增热身组也挂在它上面）' : ''}，${old} 顺延一位但还是照做`);
            ordered = [promotable, ...entries.filter((e) => e.key !== promotable.key)];
        }
        else if (head && headPrime) {
            flags.push(`今天你说练「${area}」：这一天的主项 ${byId(head.exId).name} 主要练的就是${byId(head.exId).muscles[0]}，顺序不动，组数照主项给`);
        }
        else {
            const rest = matched.filter((m) => m.key !== head?.key);
            const primeRest = rest.filter((m) => prime(byId(m.exId)));
            const lifted = primeRest.length ? primeRest : rest;
            if (head && lifted.length) {
                const names = lifted.map((m) => byId(m.exId).name).join('、');
                const onlyBorrowed = !primeRest.length && `（这些动作主要练的是 ${lifted.map((m) => byId(m.exId).muscles[0]).join('、')}，只是顺带练到${area}）`;
                flags.push(`今天你说练「${area}」，可这一天${primeRest.length ? '没有主要练它的复合动作' : `没有主要练它的动作${onlyBorrowed}`}：主项仍是 ${byId(head.exId).name}，把 ${names} 提到第二位${budgetMinutes >= 55 ? '、各加 1 组' : ''}，你点的部位都在表上`);
                ordered = [head, ...lifted, ...entries.filter((e) => e.key !== head.key && !lifted.some((l) => l.key === e.key))];
            }
            else if (head) {
                flags.push(`今天你说练「${area}」：这一天只有 ${byId(head.exId).name} 顺带练到它（主要练的是 ${byId(head.exId).muscles[0]}），没有能顶上去的动作。想真的补量就在「运动」页下面的「这周怎么练」里把${area}单独排一天`);
            }
        }
    }
    // 多选里没被主要练到的部位，一个部位补一个动作：只排了胸没排背的话，背那点量不算练到
    const missing = wants.filter((a) => !ordered.some((e) => isPrimeFor(byId(e.exId), a)));
    if (!missing.length)
        return ordered;
    const home = isHomeMode(p);
    const added = [];
    const skipped = [];
    for (const a of missing) {
        const pool = EXERCISES.filter((ex) => hitsArea(ex, a) &&
            isPrimeFor(ex, a) &&
            fitsEquipment(ex, home) &&
            !ordered.some((e) => e.exId === ex.id) &&
            !p.avoidNames.some((k) => k.length > 1 && ex.name.includes(k)));
        if (!pool.length) {
            skipped.push(a);
            continue;
        }
        const compounds = pool.filter((ex) => ex.heavy || ex.kind === 'compound');
        const pick = compounds[0] ?? pool[0];
        if (pick)
            added.push(pick);
    }
    const names = added.map((e) => e.name).join('、');
    const who = missing.filter((a) => added.some((ex) => isPrimeFor(ex, a))).join('、');
    if (names) {
        flags.push(`今天你说练「${area}」，框架给 ${day.role} 排的动作里没有主要练「${who}」的：补了 ${names}，排在主项之后，重量按本机记录推（没记录就保守起步）`);
    }
    if (skipped.length) {
        flags.push(`今天点的「${skipped.join('、')}」在你的器械条件（${home ? '只有哑铃和自重' : '健身房'}）和避让要求里没有一个主要练它的动作，这张表按框架原样排`);
    }
    if (!added.length)
        return ordered;
    const inserted = added.map((ex, n) => ({ exId: ex.id, key: `lift-add-${n}` }));
    return ordered.length ? [ordered[0], ...inserted, ...ordered.slice(1)] : inserted;
}
/**
 * 点了「今天练哪里」就不管今天是不是训练日：直接从动作库按这些部位现排一天。
 * 周框架不动，所以这张表只属于今天；排不出来（器械条件、避让词）就回落到恢复日表。
 */
function areaDayPlan(p, wants, weekday, budgetMinutes) {
    const home = isHomeMode(p);
    const area = wants.join('、');
    const usable = (ex) => fitsEquipment(ex, home) && !p.avoidNames.some((k) => k.length > 1 && ex.name.includes(k));
    const rank = (ex) => (ex.heavy ? 0 : ex.kind === 'compound' ? 1 : 2);
    // 只排主动肌是这个部位的动作；深蹲那种「顺带练到核心」的不算这个部位的量，不拿来凑数
    // 每个点的部位各自一个池子：多选时轮流取，不然最重的那个部位会把整张表占满，另一个部位一个动作都排不上
    const pools = wants
        .map((a) => EXERCISES.filter((ex) => usable(ex) && isPrimeFor(ex, a)).sort((x, y) => rank(x) - rank(y)))
        .filter((pl) => pl.length);
    if (!pools.length)
        return null;
    const head = pools.map((pl) => pl[0]).sort((x, y) => rank(x) - rank(y))[0];
    const headPool = pools.findIndex((pl) => pl[0]?.id === head.id);
    pools.forEach((pl) => {
        const at = pl.findIndex((ex) => ex.id === head.id);
        if (at >= 0)
            pl.splice(at, 1);
    });
    // 先按这一档的量把动作数算出来：现排的一天没有框架给的现成动作数，不按容量挑就一定排太多
    const warm = (budgetMinutes >= 70 ? 6 : budgetMinutes >= 50 ? 5 : 4) * 60;
    const mob = budgetMinutes >= 55 ? 240 : 150;
    const cool = budgetMinutes >= 50 ? 300 : 180;
    const ramp = head.heavy && head.ramp && head.equipment.includes('杠铃') && budgetMinutes >= 22 ? 320 : 0;
    const estSec = (ex) => {
        const setup = setupSec(ex);
        const work = ex.sets * (workSec(ex, ex.reps) + setup);
        return work + (ex.sets - 1) * restFor(ex, ex.heavy ? 'compound' : 'accessory', false) + TRANSITION;
    };
    let room = budgetMinutes * 60 - warm - mob - cool - ramp;
    const list = [head];
    // 你点的每个部位至少留一个动作：时间不够也照排，表长一点没关系，别把你要练的部位弄没了
    const covered = new Set(headPool >= 0 ? [headPool] : []);
    const maxRows = Math.max(7, pools.length + 2);
    for (let round = 0; round < 8 && list.length < maxRows; round += 1) {
        pools.forEach((pl, pi) => {
            const ex = pl.shift();
            if (!ex)
                return;
            if (list.some((x) => x.id === ex.id))
                return;
            const cost = estSec(ex);
            // 已经排到动作的部位，再往后就只装时间放得下的；这个部位还没有动作就硬排第一个
            if (room - cost < 0 && covered.has(pi))
                return;
            list.push(ex);
            room -= cost;
            covered.add(pi);
        });
    }
    return {
        weekday,
        focus: `按${area}现排`,
        role: area,
        headline: `按你点的「${area}」现排一张表，周框架没动`,
        // 第一行没有大重量复合动作就当没有主项：核心、手臂这种一天不该按主项给 3 分钟组间休息
        mainLiftId: head.heavy || head.kind === 'compound' ? head.id : null,
        exerciseIds: list.map((e) => e.id),
        substitutions: [],
        warmupMin: 0,
        mainMin: 0,
        cardioMin: 0,
        cooldownMin: 0
    };
}
export function buildSheet(p, 
/** null = 自由训练：没有训练目标也没有周框架，表只按你点的部位/动作现排 */
fw, input, logs, date, opts = {}) {
    const weekday = weekdayOf(date);
    const wants = wantAreasOf(input);
    const area = wants.join('、');
    // 「直接开始使用」：不排框架、不按部位现排、也不塞热身放松，表上只有你自己点进来的动作
    const direct = input.direct === true;
    const kindKey = fw?.goal?.kindKey ?? 'health';
    const priorities = fw?.goal?.priorityAreas ?? [];
    const freeNote = fw ? '周框架没动' : p.goal ? '这次是自由训练，没按你的周框架排，框架本身没动' : '你还没设训练目标，这是自由训练的一张表';
    const scheduled = direct ? null : (fw?.days.find((d) => d.weekday === weekday) ?? null);
    const extraAssumed = [];
    // 不是训练日但点了部位，就按这些部位现排一天；排不出来（器械、避让）才回落恢复日表
    const made = direct || scheduled || !wants.length ? null : areaDayPlan(p, wants, weekday, resolveInput(p, null, input).totalMinutes);
    if (made) {
        if (fw) {
            const picked = fw.days.map((d) => weekdayName(d.weekday)).join('、') || '还没排训练日';
            extraAssumed.push(`今天（${weekdayName(weekday)}）不在你选的训练日（${picked}）里，但你点了「${area}」：这张表按${area}现排，${freeNote}`);
        }
        else {
            extraAssumed.push(`自由练的一张表：按你点的「${area}」现排，${freeNote}`);
        }
        if (made.exerciseIds.length < 3) {
            const names = made.exerciseIds.map((id) => byId(id)?.name ?? '').filter(Boolean).join('、');
            extraAssumed.push(`动作库里主要练「${area}」的动作只有 ${names}，我没有拿「顺带练到它」的动作凑数：这张表会比框架给这一天留的量还空，空出来的部分不用补量`);
        }
    }
    const picks = resolvePicked(p, opts.picked ?? []);
    const pickedLifts = picks.list.filter((ex) => ex.pattern !== 'cardio');
    const pickedCardio = picks.list.filter((ex) => ex.pattern === 'cardio');
    const pickNotes = [...picks.notes];
    let day = scheduled ?? made;
    if (!day) {
        // 不是训练日、也没点名部位，但你在「动作」页挑了动作：就按你挑的现排一张，不落到恢复日表
        if (!picks.list.length) {
            return direct
                ? buildDirectSheet(p, input, date, weekday, pickNotes, opts.skipped ?? [])
                : buildRestDaySheet(p, fw, input, logs, date, weekday, pickNotes, opts.skipped ?? []);
        }
        day = pickedDayPlan(picks.list, weekday, freeNote);
        const pickedNames = picks.list.map((ex) => ex.name).join('、');
        if (!direct && fw) {
            const planned = fw.days.map((d) => weekdayName(d.weekday)).join('、') || '还没排训练日';
            extraAssumed.push(`今天（${weekdayName(weekday)}）不在你选的训练日（${planned}）里，你在「动作」页点了 ${pickedNames}：这张表完全按你挑的动作现排，${freeNote}`);
        }
        else if (!direct) {
            extraAssumed.push(`自由练的一张表：完全按你在「动作」页点的 ${pickedNames} 现排，${freeNote}`);
        }
        if (!direct && !pickedLifts.length) {
            extraAssumed.push('你点的都是有氧动作，所以这张表没有力量行，只有升温、活动度、有氧和放松');
        }
    }
    else if (pickedLifts.length) {
        const existing = new Set(day.exerciseIds);
        const added = [];
        for (const ex of pickedLifts) {
            if (existing.has(ex.id)) {
                pickNotes.push(`你点的 ${ex.name} 今天这张表里本来就有，没有再排一遍`);
                continue;
            }
            existing.add(ex.id);
            added.push(ex.id);
        }
        if (added.length) {
            // 接在框架原有动作后面：主项位置和组间休息都不动，砍的是框架里顺带排的那些
            day = { ...day, exerciseIds: [...day.exerciseIds, ...added] };
        }
    }
    const improvised = !scheduled;
    const overrides = opts.overrides ?? {};
    const areas = injuryAreas(p);
    const week = currentWeek(fw, date);
    const deload = week.theme.includes('减量');
    // 没系统练过的人一律走小剂量：一个动作最多 3 组，次数落在 10–15，前两周重量按周计划冻住
    const novice = tierOf(p) === 0;
    const freeze = Boolean(week.freeze);
    const res = resolveInput(p, day, input);
    // 睡眠只从档案来（界面上已经不问昨晚睡几小时了），说原因时标清是哪来的
    const sleepNote = input.sleepHours == null && p.sleepHours != null ? '（档案里的平常值）' : '';
    const adjust = stateAdjust(res.statusSelf, res.sleepHours, sleepNote);
    const pct = deload ? Number((adjust.pct * 0.9).toFixed(3)) : adjust.pct;
    const adjustWord = [deload ? '减量周' : '', adjust.cause ? '恢复不够' : ''].filter(Boolean).join('叠加');
    const totalSec = res.totalMinutes * 60;
    const prAllowed = res.statusSelf >= 4 && res.sleepHours >= 7 && !deload && adjust.pct === 1;
    // 昨天在这台机器上记过同一部位的组、或者手记时点过这个部位：今天主项少一组，重量不动（收容量不收重量）
    const yesterdayAreas = areasLoggedYesterday(logs, opts.acts ?? [], date);
    const overlap = overlapsYesterday(day, yesterdayAreas);
    const dropped = new Map();
    const seen = new Set();
    const flags = [];
    if (deload)
        flags.push(`第 ${week.index} 周是减量周：每个动作减 1 组，做满次数就停`);
    if (pct < 1) {
        const why = [adjust.cause, deload ? '减量周' : ''].filter(Boolean).join('叠加');
        flags.push(`${why}：主项重量共下调约 ${Math.round((1 - pct) * 100)}%（按最小片取整，看下面表格里的实际值），今天保容量，不冲 PR`);
    }
    else if (!prAllowed && res.reported) {
        flags.push(`状态自评 ${res.statusSelf} / 睡 ${res.sleepHours} 小时，没到能冲组的标准：不冲 PR，最后一次组留 2 次余力`);
    }
    if (overlap)
        flags.push(`昨天你记过今天这些部位：主项少 1 组，重量不动——连着练同一部位先收容量，不收重量`);
    for (const n of day.substitutions ?? []) {
        if (!flags.includes(n))
            flags.push(n);
    }
    for (const n of pickNotes) {
        if (!flags.includes(n))
            flags.push(n);
    }
    const slots = [];
    const warmMin = res.totalMinutes >= 70 ? 6 : res.totalMinutes >= 50 ? 5 : 4;
    if (!direct) {
        slots.push(timedSlot('warmupGeneral', 'warmupGeneral', `有氧升温：${isHomeMode(p) ? '原地踏步或开合跳' : '跑步机坡度走或单车'} ${warmMin} 分钟`, warmMin * 60, '目标是身体微微出汗、体温上来，不是累'));
        const mob = mobilityNote(day);
        slots.push(timedSlot('warmupMobility', 'warmupMobility', mob.name, res.totalMinutes >= 55 ? 240 : 150, mob.note));
    }
    // 现排的那天本来就是按这个部位挑的动作，不用再重排顺序
    const entries = improvised
        ? day.exerciseIds.map((exId, i) => ({ exId, key: `lift-${i}` }))
        : planOrder(p, day, wants, flags, res.totalMinutes);
    entries.forEach(({ exId, key }, i) => {
        const base = byId(exId);
        if (!base)
            return;
        const overrideId = overrides[key];
        const wanted = overrideId ? byId(overrideId) : undefined;
        let ex = base;
        let note = '';
        if (wanted) {
            ex = wanted;
            note = `手动替换：原计划 ${base.name}`;
        }
        else {
            const r = resolveExercise(base, areas);
            ex = r.ex;
            if (r.replaced) {
                note = r.replaced;
                flags.push(r.replaced);
            }
        }
        // 伤病替换可能把两个不同的模板动作换成同一个（杠铃后蹲 / 前蹲 → 箱式深蹲），同一动作不在一天的表里出现两遍
        if (seen.has(ex.id))
            return;
        seen.add(ex.id);
        const isMain = i === 0 && day.mainLiftId !== null;
        const kind = isMain ? 'main' : ex.kind === 'isolation' ? 'isolation' : ex.heavy ? 'compound' : 'accessory';
        let sets = novice ? Math.min(3, ex.sets) : ex.sets;
        if (!novice && isMain && ex.heavy)
            sets = 4;
        if (deload)
            sets = Math.max(2, sets - 1);
        if (overlap && isMain)
            sets = Math.max(2, sets - 1);
        // 加组（优先部位 / 你点名要练它）只适用于框架日：现排的一天动作数是我按这一天装得下的量自己挑的，再加就一定太多
        const wantBoost = hitsAnyArea(ex, wants) && res.totalMinutes >= 55;
        if (!novice && i > 0 && !improvised && (matchesPriority(ex, priorities) || wantBoost))
            sets = Math.min(5, sets + 1);
        const rest = restFor(ex, kind, isMain);
        const cap = prAllowed && isMain ? 8.5 : kind === 'isolation' ? Math.min(9, week.rpeBase + 1) : 8;
        const rpes = rpeSeries(week.rpeBase, sets, cap, prAllowed && isMain);
        const load = suggestWeight(ex, p, logs, date, isMain || ex.heavy ? pct : 1, adjustWord, freeze);
        const targetReps = novice ? Math.max(10, Math.min(15, ex.reps)) : ex.reps;
        const plan = Array.from({ length: sets }, (_, s) => ({
            reps: targetReps,
            weightKg: load.weightKg,
            rpe: rpes[s] ?? week.rpeBase,
            restSec: s === sets - 1 ? 0 : rest,
            startSec: 0
        }));
        if (!direct && isMain && ex.ramp && ex.equipment.includes('杠铃') && totalSec >= 22 * 60) {
            const working = Number.isFinite(load.weightKg ?? NaN) ? load.weightKg : 20;
            const steps = totalSec >= 60 * 60 ? 4 : totalSec >= 40 * 60 ? 3 : 2;
            slots.push(rampSlot(ex, working, steps));
        }
        slots.push(buildLiftSlot(key, kind, ex, plan, Boolean(isMain && prAllowed), [note, load.basis, ex.form].filter(Boolean).join(' · '), cautionText(ex, areas)));
    });
    // 你点的有氧动作一个一行：第一个占掉框架给这一天的有氧时长，其余按今天的档位另起一行
    const fillMin = res.totalMinutes >= 50 ? 20 : 15;
    const cardioRows = pickedCardio.map((ex, i) => ({
        ex,
        min: i === 0 && day.cardioMin > 0 ? day.cardioMin : fillMin,
        why: i === 0 && day.cardioMin > 0
            ? `你在「动作」页点了 ${ex.name}：这一行有氧换成它，时长还是 ${day.cardioMin} 分钟`
            : `你在「动作」页点了 ${ex.name}：按 ${i === 0 && day.cardioMin > 0 ? day.cardioMin : fillMin} 分钟单独排一行`
    }));
    if (!pickedCardio.length && day.cardioMin > 0) {
        cardioRows.push({ min: day.cardioMin, why: '能说话但不能唱歌的强度，做完再去拉伸' });
    }
    cardioRows.forEach((row, i) => {
        slots.push(timedSlot(i === 0 ? 'cardio' : `cardio-${row.ex?.id ?? i}`, 'cardio', `有氧：${row.ex ? row.ex.name : cardioChoice(kindKey, day, isHomeMode(p))} ${row.min} 分钟`, row.min * 60, row.ex ? `${row.ex.form} · ${row.why}` : row.why, row.ex));
    });
    if (!direct) {
        slots.push(timedSlot('cooldown', 'cooldown', '放松：今天用到的肌群静态拉伸 + 慢走', res.totalMinutes >= 50 ? 300 : 180, '每个位置 30 秒，呼吸放慢，不拉到痛'));
    }
    // 你点进来的动作、你选的部位一律留在表上：要腾时间只收框架顺带的孤立、辅助动作，
    // 收完还是超就让它超——表长一点，比少了你要练的那一行有用
    const pickedIds = new Set(picks.list.map((ex) => ex.id));
    const protect = (s) => improvised ? Boolean(s.exId) : pickedIds.has(s.exId ?? '') || hitsAnyArea(byId(s.exId ?? ''), wants);
    const fitted = fitToTotal(slots, totalSec, dropped, protect);
    const laid = layout(fitted);
    return {
        id: uid('sheet'),
        createdAt: new Date().toISOString(),
        date,
        weekday,
        focus: day.focus,
        input,
        budgetMinutes: res.totalMinutes,
        assumed: extraAssumed.length ? [...res.assumed, ...extraAssumed] : res.assumed,
        slots: laid,
        overrides,
        skipped: keptSkipped(opts.skipped, laid),
        loadAdjustPct: pct,
        flags,
        dropped: [...dropped.values()]
    };
}
function restFor(ex, kind, isMain) {
    if (kind === 'isolation')
        return Math.min(90, Math.max(60, ex.restSec));
    if (isMain || ex.heavy)
        return Math.max(150, Math.min(180, ex.restSec));
    return Math.max(90, Math.min(150, ex.restSec));
}
function matchesPriority(ex, areas) {
    const text = `${ex.muscles.join(' ')} ${ex.name}`;
    return areas.some((a) => {
        if (a.includes('背') && /背|背阔|菱形|后链/.test(text))
            return true;
        if (a.includes('肩') && /三角|肩/.test(text))
            return true;
        if (a.includes('胸') && /胸/.test(text))
            return true;
        if (a.includes('臀') && /臀/.test(text))
            return true;
        if (a.includes('腿') && /股四|腘绳|臀|小腿/.test(text))
            return true;
        return false;
    });
}
function cardioChoice(kindKey, day, homeOnly) {
    if (homeOnly) {
        if (/腿|下肢/.test(day.role))
            return '快走或上下楼（低冲击，不抢腿部恢复）';
        if (kindKey === 'endurance')
            return '开合跳与高抬腿交替';
        return '快走、上下楼或开合跳';
    }
    if (/腿|下肢/.test(day.role))
        return '椭圆机或单车（低冲击，不抢腿部恢复）';
    if (kindKey === 'endurance')
        return '划船机与跑步机交替';
    if (kindKey === 'lean')
        return '跑步机坡度走';
    return '跑步机坡度走或椭圆机';
}
const RAMP_STEPS = [
    { label: '空杠', pct: 0, reps: 8, rest: 60 },
    { label: '50%', pct: 0.5, reps: 5, rest: 60 },
    { label: '70%', pct: 0.7, reps: 3, rest: 75 },
    { label: '85%', pct: 0.85, reps: 2, rest: 90 }
];
/** 时长不够时从中间抽档，空杠和 85% 这两头保留 */
function rampDefs(steps) {
    if (steps >= 4)
        return RAMP_STEPS;
    if (steps === 3)
        return [RAMP_STEPS[0], RAMP_STEPS[2], RAMP_STEPS[3]];
    return [RAMP_STEPS[0], RAMP_STEPS[3]];
}
function rampSlot(ex, workingKg, steps) {
    const bar = 20;
    const defs = rampDefs(steps);
    const withKg = defs.map((d) => ({
        ...d,
        kg: d.pct === 0 ? bar : Math.max(bar, Math.round((workingKg * d.pct) / 2.5) * 2.5)
    }));
    // 杠铃最小是空杠，算不满一档的相邻档合并，避免出现「空杠 20kg → 50% 20kg」
    const chosen = withKg.filter((d, i) => i === 0 || d.kg !== withKg[i - 1].kg);
    const plan = chosen.map((d, i) => ({
        reps: d.reps,
        weightKg: d.kg,
        rpe: 0,
        restSec: i === chosen.length - 1 ? 0 : d.rest,
        startSec: 0
    }));
    return buildLiftSlot('ramp', 'ramp', ex, plan, false, `${ex.name} 递增热身组：${plan.map((p, i) => `${chosen[i]?.label} ${p.weightKg}kg×${p.reps}`).join(' → ')}，然后进入正式组`, '');
}
function fitToTotal(input, limitSec, dropped, keep = () => false) {
    const slots = input.map((s) => ({ ...s }));
    let guard = 0;
    while (total(slots) > limitSec && guard < 40) {
        guard += 1;
        const cardio = slots.find((s) => s.kind === 'cardio' && !keep(s));
        if (cardio && cardio.durationSec - 180 >= 240) {
            cardio.durationSec -= 180;
            cardio.name = cardio.name.replace(/\d+ 分钟/, `${Math.round(cardio.durationSec / 60)} 分钟`);
            dropped.set(cardio.id, `有氧减到 ${Math.round(cardio.durationSec / 60)} 分钟`);
            continue;
        }
        if (cardio) {
            drop(slots, cardio, dropped, `有氧 ${Math.round(cardio.durationSec / 60)} 分钟全部砍掉`);
            continue;
        }
        const isolations = slots.filter((s) => s.kind === 'isolation' && !keep(s));
        const lastIso = isolations.at(-1);
        if (lastIso && lastIso.sets > 2) {
            cutSet(lastIso, dropped);
            continue;
        }
        if (lastIso) {
            drop(slots, lastIso, dropped, '孤立动作，量装不下时先砍它');
            continue;
        }
        const secondaries = slots.filter((s) => s.kind === 'accessory' && s.sets > 2 && !isHeavy(s) && !keep(s));
        const sec = secondaries.at(-1);
        if (sec) {
            cutSet(sec, dropped);
            continue;
        }
        const droppable = slots.filter((s) => s.kind === 'accessory' && !isHeavy(s) && !keep(s));
        if (droppable.length > 1) {
            const victim = droppable.at(-1);
            drop(slots, victim, dropped, '今天装不下，砍掉一个辅助动作');
            continue;
        }
        const ramp = slots.find((s) => s.kind === 'ramp' && s.sets > 2);
        if (ramp) {
            shrinkRamp(slots, ramp, dropped);
            continue;
        }
        const mob = slots.find((s) => s.kind === 'warmupMobility' && s.durationSec > 120);
        if (mob) {
            mob.durationSec -= 60;
            dropped.set(mob.id, '动态活动度减 1 分钟');
            continue;
        }
        const gen = slots.find((s) => s.kind === 'warmupGeneral' && s.durationSec > 180);
        if (gen) {
            gen.durationSec -= 60;
            gen.name = gen.name.replace(/\d+ 分钟/, `${Math.round(gen.durationSec / 60)} 分钟`);
            dropped.set(gen.id, '升温有氧减 1 分钟');
            continue;
        }
        // 能收的都收完了还是超：到这儿为止表上没有一行是可以偷偷删掉的（被你保住的都是你自己加的），
        // 就让它比预算长，交出去的那张表一行不少
        break;
    }
    return slots;
}
/** 热身递增组只抽中间档位，空杠和 85% 一直在；主项和大重量复合动作不参与砍 */
function shrinkRamp(slots, ramp, dropped) {
    const ex = byId(ramp.exId ?? '');
    if (!ex)
        return;
    const top = ramp.setPlan.at(-1)?.weightKg ?? 20;
    const next = rampSlot(ex, top / 0.85, ramp.sets >= 4 ? 3 : 2);
    const i = slots.findIndex((s) => s.id === ramp.id);
    if (i >= 0)
        slots[i] = next;
    dropped.set(ramp.id, next.note);
}
function isHeavy(slot) {
    if (slot.kind === 'main' || slot.kind === 'compound' || slot.kind === 'ramp')
        return true;
    const ex = byId(slot.exId ?? '');
    return slot.kind === 'cardio' || slot.kind === 'cooldown' ? false : Boolean(ex?.heavy);
}
function cutSet(slot, dropped) {
    slot.sets = Math.max(2, slot.sets - 1);
    slot.setPlan = slot.setPlan.slice(0, slot.sets);
    slot.setPlan = slot.setPlan.map((s, i) => ({ ...s, restSec: i === slot.setPlan.length - 1 ? 0 : s.restSec }));
    const ex = byId(slot.exId ?? '');
    if (ex)
        slot.durationSec = liftDuration(ex, slot.setPlan);
    dropped.set(slot.id, `${slot.name} 减到 ${slot.sets} 组`);
}
function drop(slots, victim, dropped, why) {
    const i = slots.findIndex((s) => s.id === victim.id);
    if (i >= 0)
        slots.splice(i, 1);
    dropped.set(victim.id, `${victim.name} 被砍掉（${why}）`);
}
function total(slots) {
    return slots.reduce((s, x) => s + x.durationSec, 0);
}
/** 顺序排时间轴，并给每一组填上绝对开始秒 */
export function layout(slots) {
    let cursor = 0;
    return slots.map((slot) => {
        const ex = byId(slot.exId ?? '');
        const startSec = cursor;
        if (ex && slot.setPlan.length) {
            const setup = setupSec(ex);
            let inner = 0;
            const plan = slot.setPlan.map((p, i) => {
                const withStart = { ...p, startSec: startSec + inner };
                inner += workSec(ex, p.reps) + setup;
                if (i < slot.setPlan.length - 1)
                    inner += p.restSec;
                return withStart;
            });
            cursor = startSec + slot.durationSec;
            return { ...slot, startSec, setPlan: plan };
        }
        cursor = startSec + slot.durationSec;
        return { ...slot, startSec };
    });
}
/**
 * 「直接开始使用」还没点动作时的那张空表：一行都没有，
 * 执行页靠它把「加动作」这个入口摆出来，点了动作就长出行来。
 */
function buildDirectSheet(p, input, date, weekday, notes, skipped) {
    const res = resolveInput(p, null, input);
    return {
        id: uid('sheet'),
        createdAt: new Date().toISOString(),
        date,
        weekday,
        focus: '直接开始',
        input,
        budgetMinutes: res.totalMinutes,
        assumed: [],
        slots: [],
        overrides: {},
        skipped: keptSkipped(skipped, []),
        loadAdjustPct: 1,
        // 器械条件不符这类「为什么少了」还是要说，不然点了没动静没人知道去哪改
        flags: [...notes],
        dropped: []
    };
}
function buildRestDaySheet(p, fw, input, _logs, date, weekday, extraNotes = [], skipped = []) {
    const res = resolveInput(p, null, input);
    const kindKey = fw?.goal?.kindKey ?? 'health';
    const wants = wantAreasOf(input);
    const area = wants.join('、');
    const warmMin = Math.max(4, Math.min(10, res.totalMinutes - 18));
    const cardioMin = Math.max(8, res.totalMinutes - warmMin - 8 - 10 - 5);
    const coreEx = resolveExercise(byId('dead-bug'), injuryAreas(p)).ex;
    const plan = [0, 1, 2].map((i) => ({
        reps: coreEx.reps,
        weightKg: null,
        rpe: 6,
        restSec: i === 2 ? 0 : 45,
        startSec: 0
    }));
    const coreSlot = buildLiftSlot('lift-0', 'isolation', coreEx, plan, false, coreEx.form, cautionText(coreEx, injuryAreas(p)));
    const slots = fitToTotal([
        timedSlot('warmupGeneral', 'warmupGeneral', `有氧升温：${isHomeMode(p) ? '原地踏步或开合跳' : '单车或坡度走'} ${warmMin} 分钟`, warmMin * 60, '今天不在训练日，只做低强度有氧和活动度'),
        timedSlot('warmupMobility', 'warmupMobility', '全身动态活动度：髋 + 胸椎 + 肩', 480, '每个方向 10 次，把久坐锁住的位置打开'),
        timedSlot('cardio', 'cardio', `有氧：${isHomeMode(p) ? (kindKey === 'endurance' ? '开合跳与高抬腿交替' : '快走或上下楼') : kindKey === 'endurance' ? '跑步机或划船机' : '椭圆机'} ${cardioMin} 分钟`, cardioMin * 60, '心率维持在能正常说话的区间'),
        coreSlot,
        timedSlot('cooldown', 'cooldown', '放松：静态拉伸', 300, '呼吸放慢，每个位置 30 秒')
    ], res.totalMinutes * 60, new Map());
    const laid = layout(slots);
    return {
        id: uid('sheet'),
        createdAt: new Date().toISOString(),
        date,
        weekday,
        focus: '恢复日',
        input,
        budgetMinutes: res.totalMinutes,
        assumed: [
            ...res.assumed,
            ...(wants.length
                ? [
                    `今天不在训练日，而且按你的器械条件（${isHomeMode(p) ? '只有哑铃和自重' : '能用健身房'}）和避让要求排不出主要练「${area}」的动作：这张表只做低强度有氧、核心与活动度`
                ]
                : []),
            ...extraNotes
        ],
        slots: laid,
        overrides: {},
        skipped: keptSkipped(skipped, laid),
        loadAdjustPct: 1,
        flags: [
            fw
                ? '今天不在你选的训练日里，这张表只做低强度有氧、核心与活动度'
                : p.goal
                    ? '这次自由训练没选练哪里也没挑动作，只做低强度有氧、核心与活动度：想练力量就点一个或几个部位，或者去「动作」页挑几个'
                    : '你没设训练目标、又没选练哪里或动作，这张表只做低强度有氧、核心与活动度：想练力量就点一个或几个部位，或者去「动作」页挑几个'
        ],
        dropped: []
    };
}
export function swapSlotExercise(p, fw, sheet, slotId, newExId, logs, picked = [], acts = [], skipped = []) {
    const overrides = { ...sheet.overrides, [slotId]: newExId };
    // 重排要把「动作」页点进来的动作一起带上，否则换一次动作就把用户自己挑的那几行弄丢了
    const next = buildSheet(p, fw, sheet.input, logs, sheet.date, { overrides, picked, acts, skipped });
    return { ...next, id: sheet.id, overrides };
}
/**
 * 「动作选择」页只看不练，也要给一份真数字：按本机记录和当前档案算建议剂量，不落进任何一张表。
 * 伤病冲突在这里就先换成替换后的动作，看到的解读和真排进表时一致。
 */
export function previewSlot(ex, p, logs, date) {
    if (ex.pattern === 'cardio') {
        return timedSlot('preview', 'cardio', `${ex.name} 20 分钟`, 1200, ex.form, ex);
    }
    const areas = injuryAreas(p);
    const target = resolveExercise(ex, areas).ex;
    const kind = target.kind === 'isolation' ? 'isolation' : target.heavy ? 'compound' : 'accessory';
    const load = suggestWeight(target, p, logs, date, 1, '');
    const rest = restFor(target, kind, false);
    const plan = Array.from({ length: target.sets }, (_, i) => ({
        reps: target.reps,
        weightKg: load.weightKg,
        rpe: 7,
        restSec: i === target.sets - 1 ? 0 : rest,
        startSec: 0
    }));
    return buildLiftSlot('preview', kind, target, plan, false, load.basis, cautionText(target, areas));
}
/** 组数变了就重排组间休息：末尾一组不休息，接递减组的那一组只留换片的工夫 */
function resequence(slot) {
    const plan = slot.setPlan.map((s, i) => {
        const nxt = slot.setPlan[i + 1];
        return { ...s, restSec: nxt ? (nxt.drop ? 15 : s.restSec || slot.restSec) : 0 };
    });
    const ex = byId(slot.exId ?? '');
    return { ...slot, sets: plan.length, setPlan: plan, durationSec: ex ? liftDuration(ex, plan) : slot.durationSec };
}
function withSlot(sheet, slotId, fn) {
    return { ...sheet, slots: sheet.slots.map((s) => (s.id === slotId ? fn(s) : s)) };
}
/** 手动加一组：照最后一组的剂量再排一组 */
export function addPlannedSet(sheet, slotId) {
    return withSlot(sheet, slotId, (slot) => {
        const last = slot.setPlan.at(-1);
        if (!last)
            return slot;
        return resequence({ ...slot, setPlan: [...slot.setPlan, { ...last, drop: false }] });
    });
}
/**
 * 删掉一组。这一组记下的数跟着删，后面的组往前挪一位 ——
 * 不挪的话第 3 组记的重量会显示在第 2 组上。
 */
export function cutPlannedSet(sheet, slotId, setIdx, logs) {
    const slot = sheet.slots.find((s) => s.id === slotId);
    if (!slot || slot.setPlan.length <= 1)
        return { sheet, logs };
    const next = withSlot(sheet, slotId, (s) => resequence({ ...s, setPlan: s.setPlan.filter((_, i) => i !== setIdx) }));
    const kept = logs.flatMap((l) => {
        if (l.slotId !== slotId || l.sheetId !== sheet.id || l.setIdx < setIdx)
            return [l];
        if (l.setIdx === setIdx)
            return [];
        return [{ ...l, setIdx: l.setIdx - 1 }];
    });
    return { sheet: next, logs: kept };
}
export function hasDropSet(slot) {
    return slot.setPlan.at(-1)?.drop === true;
}
/**
 * 递减组的建议档位：第一档就是这一行的工作重量，后面逐档减三成、再减一半。
 * 记的时候每档的重量和做几组都由人改。
 */
export function dropStepPlan(slot, count) {
    const base = slot.setPlan.at(-1)?.weightKg ?? null;
    const ex = byId(slot.exId ?? '');
    if (base === null)
        return Array.from({ length: count }, () => ({ weightKg: null, sets: 1 }));
    return (count === 2 ? [1, 0.7] : [1, 0.7, 0.5]).map((k) => ({
        weightKg: ex ? roundLoad(ex, base * k) : Math.max(1, Math.round(base * k)),
        sets: 1
    }));
}
/** 递减组：末尾挂一行，那一行记的是 2–3 档；再点一次连它记下的档一起撤掉 */
export function toggleDropSet(sheet, slotId, logs) {
    const slot = sheet.slots.find((s) => s.id === slotId);
    if (!slot)
        return { sheet, logs };
    if (hasDropSet(slot))
        return cutPlannedSet(sheet, slotId, slot.setPlan.length - 1, logs);
    const last = slot.setPlan.at(-1);
    if (!last)
        return { sheet, logs };
    const next = withSlot(sheet, slotId, (s) => resequence({ ...s, setPlan: [...s.setPlan, { ...last, rpe: 10, drop: true }] }));
    return { sheet: next, logs };
}
/** 拖卡片改顺序：往下拖落到那一行后面，往上拖落到它前面 */
export function moveSlot(sheet, dragId, overId) {
    if (dragId === overId)
        return sheet;
    const from = sheet.slots.findIndex((s) => s.id === dragId);
    const to = sheet.slots.findIndex((s) => s.id === overId);
    if (from < 0 || to < 0)
        return sheet;
    const slots = [...sheet.slots];
    const [moved] = slots.splice(from, 1);
    const target = slots.findIndex((s) => s.id === overId);
    slots.splice(from < to ? target + 1 : target, 0, moved);
    return { ...sheet, slots };
}
