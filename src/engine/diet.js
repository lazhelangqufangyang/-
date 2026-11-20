import { baselineAdvice } from './lifestyle.js';
import { weekdayName } from './goals.js';
import { todayIso, weekdayOf } from './time.js';
import { MICRO_NUTRIENTS } from './foodMicro.js';
/**
 * 吃的这一层只做得两件算得出的事：按档案给一个带误差说明的热量参考区间和底线，
 * 以及把你手记的估算按周平均起来。热量是你自己估的，这里不当营养测算用，
 * 也不按某一天下了结论——判断只看一周平均。
 */
function round5(v) {
    return Math.round(v / 5) * 5;
}
export function dietTargets(p) {
    const advice = baselineAdvice(p);
    const floor = advice.floor;
    if (!advice.tdee) {
        const missing = [];
        if (p.sex == null) missing.push('性别');
        if (p.age == null) missing.push('年龄');
        if (p.heightCm == null) missing.push('身高');
        if (p.weightKg == null) missing.push('体重');
        return {
            bmr: null,
            maintain: null,
            target: null,
            floor,
            protein: null,
            basis: missing.length
                ? `档案里还缺：${missing.join('、')} — 这四项都填上才能算出你的参考热量`
                : '档案齐了但算不出热量，请去档案页检查'
        };
    }
    const [low, high] = advice.tdee.range;
    const mid = round5((low + high) / 2);
    const head = `Mifflin-St Jeor 推出基础代谢 ${advice.tdee.bmr} kcal，乘日常活动 1.3–1.55 得到维持区间 ${low}–${high} kcal。这个估算本身有 ±10–15% 的误差，所以它是参考带，不是指标`;
    const kind = p.goal?.kindKey ?? 'unknown';
    if (kind === 'lean' || kind === 'shape') {
        const target = Math.max(floor, round5(mid * 0.88));
        return {
            bmr: advice.tdee.bmr,
            maintain: [low, high],
            target,
            floor,
            protein: advice.protein,
            basis: `${head}。想让体重往下走就在维持值上减 12% 左右，得到 ${target} kcal；再低不会减得更快，只会先掉肌肉和状态。底线 ${floor} kcal 不穿透，一周体重降幅控制在当前体重的 1% 以内`
        };
    }
    if (kind === 'bulk') {
        const target = round5(mid * 1.08);
        return {
            bmr: advice.tdee.bmr,
            maintain: [low, high],
            target,
            floor,
            protein: advice.protein,
            basis: `${head}。想涨力量和质量就在维持值上加 8% 左右，得到 ${target} kcal；一周体重涨过 0.5% 就是吃多了，多出来的是脂肪不是肌肉`
        };
    }
    return {
        bmr: advice.tdee.bmr,
        maintain: [low, high],
        target: mid,
        floor,
        protein: advice.protein,
        basis: `${head}。你的目标不靠热量差来推动，所以建议值取维持区间中间 ${mid} kcal，不用刻意减`
    };
}
export function buildDays(meals) {
    const dates = [...new Set(meals.map((m) => m.date))].sort().reverse();
    return dates.map((date) => {
        const list = meals.filter((m) => m.date === date).sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')));
        // 0 当成「没估」：记了一句话「没吃」不该被算成一个有数字的样本
        const counted = list.filter((m) => (m.kcal ?? 0) > 0);
        const sum = (pick) => Math.round(list.reduce((x, m) => x + (pick(m) ?? 0), 0));
        return {
            date,
            dayName: weekdayName(weekdayOf(date)),
            meals: list,
            kcal: Math.round(counted.reduce((n, m) => n + (m.kcal ?? 0), 0)),
            proteinG: sum((m) => m.proteinG),
            carbsG: sum((m) => m.carbsG),
            fatG: sum((m) => m.fatG),
            sugarG: sum((m) => m.sugarG),
            sodiumMg: sum((m) => m.sodiumMg),
            // 微量元素只加真的记过数的那几条，保留一位小数
            micro: Object.fromEntries(MICRO_NUTRIENTS.map((meta) => [
                meta.key,
                Math.round(list.reduce((total, m) => total + (m[meta.key] ?? 0), 0) * 10) / 10
            ])),
            counted: counted.length,
            uncounted: list.length - counted.length,
            partial: counted.length === 1
        };
    });
}
/** 某一项只有真记过数的天才进这一项的平均，别把没填的当 0 */
function avgOf(days, pick) {
    const full = days.filter((d) => !d.partial && pick(d) > 0);
    if (!full.length)
        return null;
    return Math.round(full.reduce((n, d) => n + pick(d), 0) / full.length);
}
export function rangeDiet(days, from, to) {
    const inRange = days.filter((d) => d.date >= from && d.date <= to);
    const full = inRange.filter((d) => d.counted > 0 && !d.partial);
    const spanDays = Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000) + 1;
    return {
        avgKcal: full.length ? Math.round(full.reduce((n, d) => n + d.kcal, 0) / full.length) : null,
        avgProtein: avgOf(inRange, (d) => d.proteinG),
        avgCarbs: avgOf(inRange, (d) => d.carbsG),
        avgFat: avgOf(inRange, (d) => d.fatG),
        avgSugar: avgOf(inRange, (d) => d.sugarG),
        avgSodium: avgOf(inRange, (d) => d.sodiumMg),
        kcalDays: full.length,
        partialDays: inRange.filter((d) => d.partial).length,
        days: inRange.length,
        emptyDays: Math.max(0, spanDays - inRange.length)
    };
}
export function macroTargets(t) {
    if (t.target === null)
        return { carbs: null, fat: null, sugarMax: null, sodiumMax: null };
    const kcal = t.target;
    return {
        carbs: [round5((kcal * 0.45) / 4), round5((kcal * 0.55) / 4)],
        fat: [round5((kcal * 0.25) / 9), round5((kcal * 0.35) / 9)],
        sugarMax: round5((kcal * 0.1) / 4),
        sodiumMax: 2000
    };
}
export function macroLines(r, m, protein) {
    const row = (key, label, unit, avg, ref, max) => {
        const text = ref ? `${ref[0]}–${ref[1]} ${unit}` : max !== null ? `≤ ${max} ${unit}` : '档案不全';
        let flag = '';
        if (avg === null)
            flag = 'none';
        else if (ref && avg < ref[0])
            flag = 'low';
        else if (ref && avg > ref[1])
            flag = 'over';
        else if (max !== null && avg > max)
            flag = 'over';
        return { key, label, unit, avg, ref: text, flag };
    };
    return [
        row('protein', '蛋白质', 'g', r.avgProtein, protein, null),
        row('carbs', '碳水', 'g', r.avgCarbs, m.carbs, null),
        row('fat', '脂肪', 'g', r.avgFat, m.fat, null),
        row('sugar', '糖', 'g', r.avgSugar, null, m.sugarMax),
        row('sodium', '钠', 'mg', r.avgSodium, null, m.sodiumMax)
    ];
}
/** 一周平均对着参考值说话：只有明显偏离才说，偏一点当作正常波动 */
export function verdict(r, t) {
    if (t.target === null)
        return { tone: 'none', text: t.basis };
    if (r.avgKcal === null) {
        return {
            tone: 'none',
            text: r.partialDays > 0
                ? `这段时间只有 ${r.partialDays} 天各记了一条。一天只记一顿没法当成一整天来平均，补到两条以上我就给判断。`
                : '这段时间没有带热量数字的记录，我不给判断。记一次吃的时候就顺手估个数，哪怕估得不准也比空着有用。'
        };
    }
    const avg = r.avgKcal;
    if (avg < t.floor) {
        return {
            tone: 'floor',
            text: `一周平均 ${avg} kcal，低于底线 ${t.floor} kcal。底线不是可以讨价还价的目标：吃穿它先掉的是肌肉、状态和睡眠，后面往往跟着一轮控制不住的多吃。把这 ${t.floor} 之上的量吃回去，别用「少吃」推动体重。要是你并没有刻意少吃却吃到这个数，去挂营养科或运动医学科看一眼。`
        };
    }
    if (avg < t.target * 0.93) {
        return {
            tone: 'low',
            text: `一周平均 ${avg} kcal，比参考值 ${t.target} 低 ${Math.round((1 - avg / t.target) * 100)}%。还在底线之上，但如果一周体重降幅超过了当前体重的 1%，就是这个减法太急，往回加一点。平均只按你记了数的 ${r.kcalDays} 天算，记得少的时候这个数字偏高偏低都正常。`
        };
    }
    if (avg <= t.target * 1.07) {
        return {
            tone: 'ok',
            text: `一周平均 ${avg} kcal，在参考值 ${t.target} 附近，属于正常波动。不用调整，继续按平常吃。`
        };
    }
    return {
        tone: 'high',
        text: `一周平均 ${avg} kcal，比参考值 ${t.target} 高 ${Math.round((avg / t.target - 1) * 100)}%。多半是份量比记的大，或者估算本身偏高——这是估算，不是结论。下一周按平常吃就行，不需要用什么方式补回来。`
    };
}
export function dietScopeNote(r, from, to) {
    const span = Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000) + 1;
    if (r.days === 0)
        return `${from} 到 ${to} 这 ${span} 天一条吃的都没记。`;
    const partial = r.partialDays > 0 ? `，还有 ${r.partialDays} 天只记了一条，这种天没进平均` : '';
    return `这 ${span} 天里你有 ${r.days} 天记了吃食，其中 ${r.kcalDays} 天记了两条以上、进了平均${partial}${r.emptyDays > 0 ? `，${r.emptyDays} 天空着` : ''}。`;
}
export function todayDiet(meals) {
    const t = todayIso();
    const list = meals.filter((m) => m.date === t);
    return list.length ? buildDays(list)[0] : null;
}
