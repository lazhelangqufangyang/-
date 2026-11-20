import { addDaysIso, todayIso, weekdayOf } from './time.js';
import { buildEntries, rangeStats } from './logbook.js';
import { buildDays, dietTargets, rangeDiet } from './diet.js';
import { byId } from './exercises.js';

/**
 * 趋势层只做两件事：把本机记录按天/周折成可画图的形状，以及生成一份
 * 只根据这些记录说话的周报。这里不写状态，也不碰云端。
 */

const MAIN_LIFTS = ['back-squat', 'bench-press', 'conventional-deadlift', 'overhead-press'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function mondayOf(iso) {
    return addDaysIso(iso, -((weekdayOf(iso) + 6) % 7));
}
function md(iso) {
    return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}
function fmtInt(n) {
    return Math.round(n).toLocaleString('zh-CN');
}
function round1(v) {
    return Math.round(v * 10) / 10;
}
function e1rm(weightKg, reps) {
    return Math.round(weightKg * (1 + reps / 30) * 2) / 2;
}

/** 免费版：最近 7 天，一天一根柱 */
export function dailyBuckets(today, days = 7) {
    const out = [];
    for (let i = days - 1; i >= 0; i -= 1) {
        const date = addDaysIso(today, -i);
        out.push({ start: date, end: date, label: WEEKDAYS[weekdayOf(date)], date });
    }
    return out;
}

/** Pro：最近 N 周，周一开始 */
export function weeklyBuckets(today, weeks = 12) {
    const thisMonday = mondayOf(today);
    const out = [];
    for (let i = weeks - 1; i >= 0; i -= 1) {
        const start = addDaysIso(thisMonday, -i * 7);
        out.push({ start, end: addDaysIso(start, 6), label: md(start), date: start });
    }
    return out;
}

/** 每个时间桶里的训练天数、组数、容量、有氧 */
export function bucketStats(entries, buckets) {
    return buckets.map((b) => {
        const inRange = entries.filter((e) => e.date >= b.start && e.date <= b.end);
        return {
            ...b,
            sessions: inRange.filter((e) => e.setCount > 0 || e.activities.length > 0).length,
            sets: inRange.reduce((n, e) => n + e.setCount, 0),
            tonnage: Math.round(inRange.reduce((n, e) => n + e.tonnage, 0)),
            cardioMin: inRange.reduce((n, e) => n + e.cardioMin, 0)
        };
    });
}

/** 按周取每个动作最好的一组估算 1RM；主项优先，最多 3 个动作 */
export function strengthTrends(logs, buckets) {
    if (!buckets.length)
        return [];
    const from = buckets[0].start;
    const to = buckets[buckets.length - 1].end;
    const inRange = logs.filter((l) => l
        && l.date >= from
        && l.date <= to
        && typeof l.weightKg === 'number'
        && l.weightKg > 0
        && typeof l.reps === 'number'
        && l.reps > 0);
    if (!inRange.length)
        return [];
    const tally = new Map();
    for (const l of inRange) {
        const bucket = buckets.find((b) => l.date >= b.start && l.date <= b.end);
        if (!bucket)
            continue;
        const value = e1rm(l.weightKg, l.reps);
        const row = tally.get(l.exId) ?? { exId: l.exId, best: 0, sets: 0, byWeek: new Map() };
        row.best = Math.max(row.best, value);
        row.sets += 1;
        row.byWeek.set(bucket.start, Math.max(row.byWeek.get(bucket.start) ?? 0, value));
        tally.set(l.exId, row);
    }
    const rank = (id) => {
        const i = MAIN_LIFTS.indexOf(id);
        return i < 0 ? 99 : i;
    };
    const picked = [...tally.values()]
        .sort((a, b) => {
            const ra = rank(a.exId);
            const rb = rank(b.exId);
            if (ra !== rb)
                return ra - rb;
            return b.best - a.best;
        })
        .slice(0, 3)
        .map((row) => {
            const points = buckets
                .map((b) => ({ start: b.start, label: b.label, value: row.byWeek.get(b.start) ?? null }))
                .filter((p) => p.value !== null);
            const first = points[0]?.value ?? null;
            const last = points[points.length - 1]?.value ?? null;
            return {
                exId: row.exId,
                name: byId(row.exId)?.name ?? row.exId,
                unit: byId(row.exId)?.unit ?? 'kg',
                points,
                first,
                last,
                changeKg: first !== null && last !== null && points.length > 1 ? round1(last - first) : null
            };
        });
    return picked;
}

/** 体重/腰围的打卡点；只返回区间内的点，最新一次单独给 */
export function bodyTrend(measureLogs, from, to) {
    const sorted = [...measureLogs]
        .filter((m) => m && typeof m.date === 'string')
        .sort((a, b) => a.date.localeCompare(b.date));
    const points = sorted.filter((m) => m.date >= from && m.date <= to && (m.weightKg != null || m.waistCm != null));
    const weightPoints = points.filter((m) => typeof m.weightKg === 'number' && m.weightKg > 0);
    const withWeight = sorted.filter((m) => typeof m.weightKg === 'number' && m.weightKg > 0);
    // 历史周报不能拿今天的体重冒充那一周的数据
    const latest = withWeight.filter((m) => m.date <= to).pop() ?? null;
    const first = weightPoints[0] ?? null;
    const last = weightPoints[weightPoints.length - 1] ?? null;
    const changeKg =
        first && last && first.date !== last.date ? round1(last.weightKg - first.weightKg) : null;
    return { points, latest, changeKg };
}

function summaryOf(entries, from, to) {
    const inRange = entries.filter((e) => e.date >= from && e.date <= to);
    return {
        ...rangeStats(entries, from, to),
        prs: inRange.reduce((n, e) => n + (e.bestCount ?? 0), 0)
    };
}

function liftBests(logs, from, to) {
    const map = new Map();
    for (const l of logs) {
        if (!l || l.date < from || l.date > to)
            continue;
        if (typeof l.weightKg !== 'number' || l.weightKg <= 0)
            continue;
        if (typeof l.reps !== 'number' || l.reps <= 0)
            continue;
        const value = e1rm(l.weightKg, l.reps);
        const row = map.get(l.exId);
        if (!row || value > row.e1rm)
            map.set(l.exId, { exId: l.exId, e1rm: value, weightKg: l.weightKg, reps: l.reps });
    }
    return map;
}

/**
 * 最近 7 天的周报。所有数字都来自本机记录，措辞只描述趋势，不做诊断。
 */
export function weeklyReport({ profile, sheets, setLogs, activityLogs, mealLogs, measureLogs, today = todayIso() }) {
    const entries = buildEntries(sheets, setLogs, activityLogs);
    const from = addDaysIso(today, -6);
    const prevFrom = addDaysIso(today, -13);
    const prevTo = addDaysIso(today, -7);
    const cur = summaryOf(entries, from, today);
    const prev = summaryOf(entries, prevFrom, prevTo);
    const plannedDays = Array.isArray(profile?.weekdays) ? profile.weekdays.length : 0;

    // 训练
    const trainingBits = [
        `这 7 天练了 ${cur.sessions} 天${plannedDays ? `（档案里排了 ${plannedDays} 天）` : ''}，共 ${cur.sets} 组、总容量 ${fmtInt(cur.tonnage)} kg`
    ];
    if (cur.cardioMin)
        trainingBits.push(`有氧 ${Math.round(cur.cardioMin)} 分钟`);
    let trainingText = `${trainingBits.join('，')}。`;
    if (prev.sessions > 0 || prev.tonnage > 0) {
        const dSessions = cur.sessions - prev.sessions;
        const dTonnage = prev.tonnage > 0 ? Math.round((cur.tonnage / prev.tonnage - 1) * 100) : null;
        trainingText += ` 与上一个 7 天相比：训练天数 ${dSessions >= 0 ? '+' : ''}${dSessions}${dTonnage === null ? '' : `，总容量 ${dTonnage >= 0 ? '+' : ''}${dTonnage}%`}。`;
    }

    // 力量：只对比上周和这周都有数据的动作
    const curLifts = liftBests(setLogs, from, today);
    const prevLifts = liftBests(setLogs, prevFrom, prevTo);
    const liftIds = [...new Set([...curLifts.keys(), ...prevLifts.keys()])].sort((a, b) => {
        const ia = MAIN_LIFTS.indexOf(a);
        const ib = MAIN_LIFTS.indexOf(b);
        if (ia !== ib)
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return (curLifts.get(b)?.e1rm ?? 0) - (curLifts.get(a)?.e1rm ?? 0);
    });
    const strength = liftIds.slice(0, 2).map((id) => {
        const c = curLifts.get(id) ?? null;
        const p = prevLifts.get(id) ?? null;
        return {
            name: byId(id)?.name ?? id,
            unit: byId(id)?.unit ?? 'kg',
            cur: c ? c.e1rm : null,
            prev: p ? p.e1rm : null,
            delta: c && p ? round1(c.e1rm - p.e1rm) : null
        };
    });

    // 饮食
    const dietDays = buildDays(mealLogs);
    const diet = rangeDiet(dietDays, from, today);
    const targets = dietTargets(profile ?? {});
    let dietText;
    if (diet.avgKcal === null) {
        dietText = '这 7 天没有形成整天的饮食记录（一天至少两条），平均热量先不算。';
    }
    else {
        let cmp;
        if (targets.target === null)
            cmp = '档案还没补全，没有参考值';
        else if (diet.avgKcal < targets.floor)
            cmp = `低于底线 ${targets.floor} kcal`;
        else if (diet.avgKcal < targets.target * 0.93)
            cmp = `比参考值 ${targets.target} kcal 低 ${Math.round((1 - diet.avgKcal / targets.target) * 100)}%`;
        else if (diet.avgKcal <= targets.target * 1.07)
            cmp = `在参考值 ${targets.target} kcal 附近`;
        else
            cmp = `比参考值 ${targets.target} kcal 高 ${Math.round((diet.avgKcal / targets.target - 1) * 100)}%`;
        dietText = `有 ${diet.kcalDays} 天记了两条以上，平均 ${fmtInt(diet.avgKcal)} kcal（${cmp}）；蛋白质平均 ${diet.avgProtein ?? '—'} g${targets.protein ? `，参考 ${targets.protein[0]}–${targets.protein[1]} g` : ''}。`;
    }

    // 体重
    const body = bodyTrend(measureLogs, from, today);
    const bodyBits = [];
    if (body.latest && body.latest.date >= from)
        bodyBits.push(`最近一次体重 ${body.latest.weightKg} kg（${md(body.latest.date)}）`);
    else if (body.latest)
        bodyBits.push(`这段时间没有体重打卡；最近一次是 ${md(body.latest.date)} 的 ${body.latest.weightKg} kg`);
    else if (profile?.weightKg)
        bodyBits.push(`这 7 天没有体重打卡；档案里的体重是 ${profile.weightKg} kg`);
    else
        bodyBits.push('这 7 天没有体重打卡');
    if (body.changeKg !== null)
        bodyBits.push(`这 7 天变化 ${body.changeKg >= 0 ? '+' : ''}${body.changeKg} kg`);
    const bodyText = `${bodyBits.join('，')}。`;

    // 提醒：只写能从记录里验证的东西
    const notes = [];
    if (cur.sessions === 0)
        notes.push('这 7 天没有训练记录。先把下一次训练排上，不用补之前的。');
    if (plannedDays && cur.sessions < plannedDays * 0.7) {
        const rate = Math.round((cur.sessions / plannedDays) * 100);
        const alsoLow = prev.sessions < plannedDays * 0.7;
        notes.push(`这 7 天完成 ${rate}%（${cur.sessions}/${plannedDays} 天），低于 70%${alsoLow ? '，而且上一个 7 天也偏低；按应用的原则先减量，不要加课' : ''}。`);
    }
    if (cur.tonnage > 0 && prev.tonnage > 0 && cur.tonnage < prev.tonnage * 0.8)
        notes.push(`总容量比上一个 7 天低 ${Math.round((1 - cur.tonnage / prev.tonnage) * 100)}%。先看睡眠和恢复，不急着补容量。`);
    if (cur.prs > 0)
        notes.push(`这 7 天有 ${cur.prs} 个动作刷新了本机最好成绩。`);
    if (diet.avgKcal !== null && targets.target !== null) {
        if (diet.avgKcal < targets.floor)
            notes.push(`平均热量 ${fmtInt(diet.avgKcal)} kcal 低于底线 ${targets.floor} kcal；底线不是可以讨价还价的目标。`);
        else if (diet.avgKcal > targets.target * 1.15)
            notes.push('平均热量比参考值高 15% 以上，先检查份量估算，第二天按平常吃，不用补回来。');
    }
    if (body.changeKg !== null && body.latest && body.latest.date >= from && body.latest.weightKg > 0) {
        const pct = Math.abs(body.changeKg) / body.latest.weightKg;
        if (pct > 0.01)
            notes.push(`这 7 天体重变化 ${body.changeKg >= 0 ? '+' : ''}${body.changeKg} kg，超过每周 1% 的节奏；先看是水分、钠摄入还是吃少了。`);
    }

    return {
        from,
        to: today,
        training: {
            sessions: cur.sessions,
            sets: cur.sets,
            tonnage: cur.tonnage,
            cardioMin: cur.cardioMin,
            prs: cur.prs,
            plannedDays,
            prevSessions: prev.sessions,
            prevTonnage: prev.tonnage,
            text: trainingText
        },
        strength,
        diet: {
            days: diet.kcalDays,
            avgKcal: diet.avgKcal,
            avgProtein: diet.avgProtein,
            target: targets.target,
            floor: targets.floor,
            protein: targets.protein,
            text: dietText
        },
        body: {
            latest: body.latest,
            changeKg: body.changeKg,
            text: bodyText
        },
        notes
    };
}