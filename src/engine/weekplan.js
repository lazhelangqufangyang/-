import { byId } from './exercises.js';
import { addDaysIso, weekdayOf } from './time.js';

export function mondayOf(iso) {
    return addDaysIso(iso, -((weekdayOf(iso) + 6) % 7));
}
export function weekDates(weekStart) {
    return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}
export function planKey(framework) {
    return framework ? `${framework.id}@${framework.createdAt}` : '';
}
export function buildWeekPlan(framework, weekStart) {
    const days = {};
    for (const date of weekDates(weekStart)) {
        const d = framework?.days.find((x) => x.weekday === weekdayOf(date)) ?? null;
        days[date] = d ? { ...d, exerciseIds: [...d.exerciseIds], substitutions: [...(d.substitutions ?? [])] } : null;
    }
    return { weekStart, key: planKey(framework), days };
}
/** 日期层改完 remap 回 weekday 喂给排表引擎：引擎只认星期几，不认日期 */
export function fwForWeek(framework, weekPlan) {
    if (!framework || !weekPlan)
        return framework;
    const days = weekDates(weekPlan.weekStart)
        .filter((date) => weekPlan.days[date])
        .map((date) => ({ ...weekPlan.days[date], weekday: weekdayOf(date) }));
    return { ...framework, days };
}
/** 拖到已有安排的那天就互换，拖到休息日就把这天腾出来 */
export function moveDay(weekPlan, from, to) {
    if (!weekPlan || from === to || !(from in weekPlan.days) || !(to in weekPlan.days))
        return weekPlan;
    const days = { ...weekPlan.days };
    const a = days[from];
    days[from] = days[to];
    days[to] = a;
    return { ...weekPlan, days };
}
export function setDayExercises(weekPlan, date, ids) {
    if (!weekPlan || !(date in weekPlan.days))
        return weekPlan;
    const clean = [...new Set(ids)].filter((id) => byId(id));
    const main = clean.map((id) => byId(id)).find((ex) => ex.heavy || ex.kind === 'compound') ?? null;
    const cur = weekPlan.days[date] ?? {
        weekday: weekdayOf(date),
        role: '自选',
        focus: '自选',
        headline: '这天是你自己加的动作',
        substitutions: [],
        warmupMin: 0,
        mainMin: 0,
        cardioMin: 0,
        cooldownMin: 0
    };
    const next = clean.length
        ? { ...cur, exerciseIds: clean, mainLiftId: main ? main.id : null, focus: cur.role === '自选' ? `自选 · ${clean.length} 个动作` : cur.focus }
        : null;
    return { ...weekPlan, days: { ...weekPlan.days, [date]: next } };
}