import { addDaysIso, weekdayOf } from './time.js';
import { weekdayName, weeklyRateFor, weightBand } from './goals.js';
/**
 * 体重和腰围这一层只看走势不下结论：单天的 1–2kg 波动是水分和食物，
 * 所以判断一律走「最近 7 天平均 vs 上一个 7 天平均」，凑不齐两周平均才回落到首尾两点。
 */
function round1(v) {
    return Math.round(v * 10) / 10;
}
function pct(v) {
    return `${(v * 100).toFixed(1)}%`;
}
function num(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
/** 同一天打卡多次只认最后那一次，前面的当草稿 */
export function measureByDay(measures) {
    const sorted = (measures ?? [])
        .filter((m) => m && typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date))
        .slice()
        .sort((a, b) => (a.date === b.date ? String(a.ts ?? '').localeCompare(String(b.ts ?? '')) : a.date < b.date ? -1 : 1));
    const byDate = new Map();
    for (const m of sorted) {
        byDate.set(m.date, {
            date: m.date,
            dayName: weekdayName(weekdayOf(m.date)),
            weightKg: num(m.weightKg),
            waistCm: num(m.waistCm)
        });
    }
    return [...byDate.values()];
}
function mean(values) {
    const list = values.filter((v) => v !== null);
    if (!list.length)
        return { avg: null, days: 0 };
    return { avg: round1(list.reduce((n, v) => n + v, 0) / list.length), days: list.length };
}
/** 窗口里按天取值：空白天不进平均，也不在折线上连点 */
function windowValues(entries, from, to, key) {
    return entries
        .filter((e) => e.date >= from && e.date <= to)
        .map((e) => e[key]);
}
/**
 * 周变化：优先用两个 7 天平均相减，这样一次聚餐不会把整条结论带走。
 * 记录不够两周才退回首尾两点，并在 basis 里说清是按哪两种点算的。
 */
export function measureStats(measures, to) {
    // 手滑填到明天以后的打卡不进统计：表单会贴回今天，导入的 JSON 未必
    const entries = measureByDay(measures).filter((e) => e.date <= to);
    const weights = entries.filter((e) => e.weightKg !== null);
    const waists = entries.filter((e) => e.waistCm !== null);
    const latest = entries.at(-1) ?? null;
    const cur = windowValues(entries, addDaysIso(to, -6), to, 'weightKg');
    const prev = windowValues(entries, addDaysIso(to, -13), addDaysIso(to, -7), 'weightKg');
    const a7 = mean(cur);
    const p7 = mean(prev);
    let weeklyKg = null;
    let weeklyPct = null;
    let basis = null;
    if (a7.avg !== null && p7.avg !== null && a7.days >= 2 && p7.days >= 2) {
        weeklyKg = round1(a7.avg - p7.avg);
        weeklyPct = (a7.avg - p7.avg) / p7.avg;
        basis = '两个 7 天平均';
    }
    else if (weights.length >= 2) {
        const first = weights[0];
        const last = weights.at(-1);
        const days = Math.max(1, Math.round((Date.parse(`${last.date}T00:00:00`) - Date.parse(`${first.date}T00:00:00`)) / 86400000));
        weeklyKg = round1(((last.weightKg - first.weightKg) / days) * 7);
        weeklyPct = ((last.weightKg - first.weightKg) / first.weightKg) * (7 / days);
        basis = `首尾两点（间隔 ${days} 天）`;
    }
    const waistDelta = waists.length >= 2
        ? round1(waists.at(-1).waistCm - waists[0].waistCm)
        : null;
    return {
        count: entries.length,
        latest,
        first: weights[0] ?? waists[0] ?? null,
        weightDays: weights.length,
        waistDays: waists.length,
        avg7: a7,
        avgPrev7: p7,
        weeklyKg,
        weeklyPct,
        basis,
        waistDelta
    };
}
/** 走势那句话：只报数字和自己的节奏区间，不评价外观 */
export function measureVerdict(stats, goal) {
    if (!stats.count) {
        return { tone: 'info', text: '还没打卡。固定条件称（起床排尿后、早饭前）才折得出来，一天之内波动 1–2 kg 是水分和食物。' };
    }
    if (!stats.latest || stats.weightDays < 2 || stats.weeklyKg === null) {
        return {
            tone: 'info',
            text: stats.weightDays === 1
                ? '只有一次体重记录，折不出走势。再称一次，隔一周以上最有得看。'
                : '记下来的都是腰围，体重再记一次才能算周变化。'
        };
    }
    const rate = weeklyRateFor(goal?.kindKey ?? 'unknown');
    const w = stats.weeklyPct;
    const shown = `${stats.weeklyKg > 0 ? '+' : ''}${stats.weeklyKg} kg/周 · ${w > 0 ? '+' : ''}${pct(w)}/周`;
    if (stats.basis !== '两个 7 天平均') {
        return { tone: 'info', text: `${shown}。这是按首尾两点算的，凑够两个 7 天平均再判节奏。` };
    }
    if (rate <= -0.002) {
        if (w <= -0.01) {
            return { tone: 'warn', text: `${shown}，超过一周 1% 了。再快掉的先不是脂肪，把热量往回加一点。` };
        }
        if (w <= -0.005) {
            return { tone: 'ok', text: `${shown}，在一周 0.5–1% 的正常节奏里，力量没掉就不用改。` };
        }
        if (w < 0) {
            return { tone: 'info', text: `${shown}，比 0.5% 慢一档。不用急着减热量，先看这两周训练量有没有掉下来。` };
        }
        return { tone: 'info', text: `${shown}，两个 7 天平均没降。体重不动的时候腰围和衣服更准，看下面那行。` };
    }
    if (rate >= 0.002) {
        if (w > 0.005) {
            return { tone: 'warn', text: `${shown}，涨过一周 0.5% 了。多出来的部分存的是脂肪，把盈余收一收。` };
        }
        if (w >= 0.0025) {
            return { tone: 'ok', text: `${shown}，一周 0.25–0.5% 的增重节奏正好。` };
        }
        return { tone: 'info', text: `${shown}，体重没往上走。想涨就得吃够，先看这一周热量有没有真达到参考值。` };
    }
    if (Math.abs(w) <= 0.003) {
        return { tone: 'ok', text: `${shown}，基本没动。你这个目标要的就是体重稳住，变化排在力量和有氧上。` };
    }
    return {
        tone: 'info',
        text: `${shown}。这个目标不靠体重差推动${w < 0 ? '，掉体重会让力量一起掉，把热量补回去' : '，多出来的重量对主项没帮助，看是不是吃多了'}。`
    };
}
/** 按目标节奏推的参考落点，只有体重凑够两天且目标带方向才给 */
export function measureTargetBand(stats, goal, weeks = 4) {
    const rate = weeklyRateFor(goal?.kindKey ?? 'unknown');
    const base = stats.avg7.days >= 2 ? stats.avg7.avg : stats.latest?.weightKg ?? null;
    if (!rate || base === null)
        return null;
    return weightBand(rate, base, weeks);
}
/**
 * 折线：横轴等分天数，纵轴留 8% 余量。空白天跳过不连线是错的，
 * 所以这里按「有数的点」连，缺的日子只出现在横轴刻度上。
 * 横轴从这条线上第一个有数的日子起算，不固定铺满 84 天：
 * 打卡刚攒两周的时候还按 84 天铺，点会全挤在最右边成一条竖线。
 */
export function sparkLine(measures, key, to, days = 84) {
    const entries = measureByDay(measures);
    const floor = addDaysIso(to, -(days - 1));
    const inRange = entries.filter((e) => e.date >= floor && e.date <= to && e[key] !== null);
    const values = inRange.map((e) => e[key]);
    if (values.length < 2) {
        return { empty: true, points: [], polyline: '', min: null, max: null, count: values.length, from: null, to: null };
    }
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max(0.4, (hi - lo) * 0.12);
    const low = lo - pad;
    const high = hi + pad;
    const from = inRange[0].date;
    const span = Math.max(1, Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000));
    const points = inRange.map((e) => {
        const offset = Math.round((Date.parse(`${e.date}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000);
        return {
            x: (Math.min(span, Math.max(0, offset)) / span) * 100,
            y: 100 - ((e[key] - low) / (high - low)) * 100,
            date: e.date,
            value: e[key]
        };
    });
    return {
        empty: false,
        points,
        polyline: points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
        min: round1(lo),
        max: round1(hi),
        count: values.length,
        from,
        to
    };
}
