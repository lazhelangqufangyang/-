import { byId } from './exercises.js';
import { weekdayName } from './goals.js';
import { addDaysIso, todayIso, weekdayOf } from './time.js';
/**
 * 运动记录的聚合层：把执行表上按组记的东西和手动记的运动合成按天看的记录。
 * 这里只读不算计划——任何一步都不写状态，UI 爱怎么摆怎么摆。
 */
/** 只有带公斤负荷的组才进总量，自重和不计重量的动作折不成 kg */
function loadable(ex) {
    return !!ex && (ex.unit === 'kg' || ex.unit === '每手kg');
}
function setTonnage(l, ex) {
    if (!ex || !loadable(ex))
        return 0;
    const perRep = l.reps * (ex.unit === '每手kg' ? 2 : 1);
    // 递减组那一行是 2–3 档重量，每档还能做几组，总量按档算
    if (l.dropSteps?.length)
        return l.dropSteps.reduce((n, s) => n + (s.weightKg ?? 0) * Math.max(1, s.sets) * perRep, 0);
    if (l.weightKg === null)
        return 0;
    return l.weightKg * perRep;
}
/** 一行记下来的数：递减组写成「7kg×2组 5kg×1组」，普通组还是「重量×次数」 */
function setLabel(l, unit) {
    if (l.dropSteps?.length) {
        return l.dropSteps.map((s) => `${s.weightKg === null ? '自重' : fmtLoad(s.weightKg, unit)}×${Math.max(1, s.sets)}组`).join(' ');
    }
    return `${l.weightKg === null ? '自重' : fmtLoad(l.weightKg, unit)}×${l.reps}`;
}
/** 格子里写不下全称，也没必要：稳定肌和心肺每天都被大项带到，列出来反而看不出这天真正练的是什么 */
const PART_SHORT = {
    股四头: '大腿',
    腘绳: '大腿',
    背阔: '背',
    上背: '背',
    后背: '背',
    背中部: '背',
    菱形肌: '背',
    后链: '背',
    三角: '肩',
    三角前束: '肩',
    三角中束: '肩',
    三角后束: '肩',
    肩袖: '肩',
    胸上部: '胸',
    三头长头: '三头'
};
const PART_SKIP = new Set(['核心', '心肺']);
/** 这天手记的是有氧还是力量：现在看选的动作，老记录只剩 kind 可看 */
function isAerobic(a) {
    if (a.exIds.length)
        return a.exIds.some((id) => byId(id)?.pattern === 'cardio');
    return a.kind === 'cardio' || a.kind === 'walk' || a.kind === 'sport';
}
/** 这天练的部位，折成两个名字够格子用；要细看是点格子进详情 */
function partsOf(dayLogs, dayActs) {
    const tally = new Map();
    const add = (key) => tally.set(key, (tally.get(key) ?? 0) + 1);
    const musclesOf = (id) => byId(id)?.muscles ?? [];
    for (const l of dayLogs) {
        for (const raw of musclesOf(l.exId)) {
            if (PART_SKIP.has(raw))
                continue;
            add(PART_SHORT[raw] ?? raw);
        }
    }
    // 手记的那条：选的动作按肌肉折（和按组记的一样跳过心肺/核心），直接点的部位则照原样留着（点核心就写核心）
    for (const a of dayActs) {
        for (const id of a.exIds) {
            for (const raw of musclesOf(id)) {
                if (PART_SKIP.has(raw))
                    continue;
                add(PART_SHORT[raw] ?? raw);
            }
        }
        for (const raw of a.areas)
            add(PART_SHORT[raw] ?? raw);
    }
    return [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k]) => k);
}
function topLog(logs) {
    const loaded = logs.filter((l) => l.weightKg !== null);
    if (loaded.length)
        return loaded.reduce((a, b) => (b.weightKg > a.weightKg ? b : a));
    if (!logs.length)
        return null;
    return logs.reduce((a, b) => (b.reps > a.reps ? b : a));
}
/** 这一天这个动作的最高重量（或次数）是不是本机到目前为止最好的 */
function isNewBest(logs, exId, date) {
    const mine = logs.filter((l) => l.exId === exId);
    const now = topLog(mine.filter((l) => l.date === date));
    if (!now)
        return false;
    const earlier = mine.filter((l) => l.date < date);
    if (!earlier.length)
        return false;
    const prev = topLog(earlier);
    if (!prev)
        return false;
    if (now.weightKg !== null && prev.weightKg !== null)
        return now.weightKg > prev.weightKg;
    return prev.weightKg === null && now.reps > prev.reps;
}
export function buildEntries(sheets, logs, acts) {
    const dates = new Set();
    logs.forEach((l) => dates.add(l.date));
    acts.forEach((a) => dates.add(a.date));
    const out = [];
    for (const date of [...dates].sort().reverse()) {
        const dayLogs = logs.filter((l) => l.date === date);
        const dayActs = acts.filter((a) => a.date === date).sort((a, b) => a.ts.localeCompare(b.ts));
        const sheet = sheets.find((s) => s.date === date) ?? null;
        const lines = [];
        // 同一个动作的递增热身和正式组分两行：混在一行里会看到「20kg×8 / 35kg×6 / 25kg×3」这种顺序错乱的东西，
        // 也会让热身组看起来像在做新低重量的正式组
        const groups = new Map();
        for (const l of dayLogs) {
            const key = `${l.exId}|${l.slotId === 'ramp' ? 'ramp' : 'work'}`;
            groups.set(key, [...(groups.get(key) ?? []), l]);
        }
        let tonnage = 0;
        let hasLoadable = false;
        for (const [key, mine0] of groups) {
            const [exId, lane] = key.split('|');
            const mine = [...mine0].sort((a, b) => a.setIdx - b.setIdx);
            const ex = byId(exId);
            const unit = ex?.unit ?? 'kg';
            if (mine.some((l) => l.weightKg !== null && loadable(ex)))
                hasLoadable = true;
            tonnage += mine.reduce((sum, l) => sum + setTonnage(l, ex), 0);
            const top = topLog(mine);
            lines.push({
                name: `${ex?.name ?? exId}${lane === 'ramp' ? ' · 递增热身' : ''}`,
                unit,
                sets: mine.length,
                perSet: mine.map((l) => setLabel(l, unit)),
                top: top ? `${top.weightKg === null ? '自重' : fmtLoad(top.weightKg, unit)} × ${top.reps}` : '—',
                best: lane === 'work' && isNewBest(logs, exId, date)
            });
        }
        // 只有执行表上的组才参与这个跨度：手动记的可能是晚上打的球，和早上的训练拼在一起会变成无意义的几百分钟
        const stamps = dayLogs.map((l) => Date.parse(l.ts)).filter(Number.isFinite);
        const minutes = stamps.length > 1 ? Math.round((Math.max(...stamps) - Math.min(...stamps)) / 60000) : null;
        // 标了「今天不练」的行不进分母：那是他自己决定不做的，不是做不完
        const doing = sheet ? sheet.slots.filter((s) => !sheet.skipped.includes(s.id)) : [];
        const planned = doing.reduce((n, s) => n + s.setPlan.length, 0);
        out.push({
            date,
            weekday: weekdayOf(date),
            dayName: weekdayName(weekdayOf(date)),
            title: sheet ? sheet.focus : dayActs.map((a) => a.name).join('、') || '运动',
            lines,
            parts: partsOf(dayLogs, dayActs),
            setCount: dayLogs.length,
            plannedSets: planned,
            completion: planned > 0 ? Math.min(100, Math.round((dayLogs.length / planned) * 100)) : null,
            overLogged: planned > 0 && dayLogs.length > planned,
            tonnage: Math.round(tonnage),
            hasLoadable,
            minutes,
            cardioMin: dayActs.reduce((n, a) => n + (isAerobic(a) ? a.minutes : 0), 0),
            plannedCardioMin: Math.round(doing.filter((s) => s.kind === 'cardio').reduce((n, s) => n + s.durationSec, 0) / 60),
            activities: dayActs,
            bestCount: lines.filter((l) => l.best).length,
            fromSheet: !!sheet
        });
    }
    return out;
}
function fmtLoad(kg, unit) {
    if (unit === '每手kg')
        return `${kg}kg/手`;
    return `${kg}kg`;
}
export function rangeStats(entries, from, to) {
    const inRange = entries.filter((e) => e.date >= from && e.date <= to);
    return {
        // 记了一条就算练过：现在记这条不问多久了，没有分钟可卡
        sessions: inRange.filter((e) => e.setCount > 0 || e.activities.length > 0).length,
        sets: inRange.reduce((n, e) => n + e.setCount, 0),
        tonnage: inRange.reduce((n, e) => n + e.tonnage, 0),
        cardioMin: inRange.reduce((n, e) => n + e.cardioMin, 0),
        acts: inRange.reduce((n, e) => n + e.activities.length, 0)
    };
}
/** 周一当第一列 */
function colOf(iso) {
    return (weekdayOf(iso) + 6) % 7;
}
/**
 * weeks 个整周，最后一格是「今天所在那周的周日」，所以行首恒为周一、行尾恒为周日，
 * 今天之后的日子占位并标 future。跳过空白天会让形状骗人——
 * 一周只练三天看起来像天天练，这是记录页最不能出的错。
 */
export function daySquares(entries, to, weeks = 6) {
    const byDate = new Map(entries.map((e) => [e.date, e]));
    const last = addDaysIso(to, 6 - colOf(to));
    const out = [];
    for (let i = weeks * 7 - 1; i >= 0; i -= 1) {
        const date = addDaysIso(last, -i);
        const e = byDate.get(date) ?? null;
        const sets = e?.setCount ?? 0;
        const actCount = e?.activities.length ?? 0;
        out.push({
            date,
            dayName: weekdayName(weekdayOf(date)),
            day: date.slice(8),
            col: colOf(date),
            hasRecord: !!e,
            sets,
            cardioMin: e?.cardioMin ?? 0,
            actCount,
            parts: e?.parts ?? [],
            tone: sets || actCount ? 'done' : 'none',
            future: date > to
        });
    }
    return out;
}
/** 单个动作在本机的最近 n 次记录，动作详解抽屉里用 */
export function exerciseHistory(exId, logs, n = 5) {
    const mine = logs.filter((l) => l.exId === exId);
    const dates = [...new Set(mine.map((l) => l.date))].sort().reverse().slice(0, n);
    const ex = byId(exId);
    return dates.map((date) => {
        const daySets = mine.filter((l) => l.date === date);
        const top = topLog(daySets);
        return {
            date,
            top: top ? `${top.weightKg === null ? '自重' : fmtLoad(top.weightKg, ex?.unit ?? 'kg')} × ${top.reps}` : '—',
            sets: daySets.length,
            best: isNewBest(logs, exId, date)
        };
    });
}
/** 记录页顶部的口径说明：只有真出现过折不成 kg 的组才提 */
export function tonnageCaveat(entries) {
    const uncounted = entries.some((e) => e.lines.some((l) => l.unit === '自重' || l.unit === '无'));
    return uncounted
        ? '负重总量只累计带公斤数的组（杠铃、哑铃、插片器械）。自重和不计重量的动作折不成 kg，没算进这个数，所以它一定比真实做的总量小。'
        : '负重总量 = 每组「重量 × 次数」相加，哑铃按两手合计。';
}
export function lastNDays(from, n) {
    const today = from || todayIso();
    return [addDaysIso(today, -(n - 1)), today];
}
