import { INJURY_LABELS } from '../types.js';
import { cautionHits, isBlocked, swapCandidates } from './exercises.js';
import { monthsSince } from './time.js';
export function tierOf(p) {
    const yrs = p.experienceYears ?? 0;
    const block = p.lastSolidBlock ?? 'never';
    const recent = /^\d{4}-\d{2}$/.test(block) ? monthsSince(block) : 9999;
    if (yrs >= 2 && recent <= 8)
        return 2;
    if (yrs >= 1 || recent <= 18)
        return 1;
    return 0;
}
export function injuryAreas(p) {
    const seen = new Set();
    for (const i of p.injuries)
        seen.add(i.area);
    return [...seen];
}
/**
 * 「在家只有哑铃和自重」（用户在改计划里说的）和「没有商业健身房」（档案里选的）是同一件事，
 * 两条都要走居家器械过滤，否则没健身房的人还会被排到杠铃和固定器械上。
 */
export function isHomeMode(p) {
    return p.homeOnly || p.commercialGym === false;
}
/**
 * 伤病命中就换动作，而不是让用户忍痛练。
 * 整组动作都不合适时，选该模式下 caution 最少的一个，并把就医提示带回去。
 */
export function resolveExercise(ex, areas) {
    if (!isBlocked(ex, areas))
        return { ex, replaced: '' };
    const words = areaWords((ex.avoid ?? []).filter((a) => areas.includes(a)));
    const pool = swapCandidates(ex, areas);
    const ideal = pool.find((c) => cautionHits(c, areas) === 0);
    if (ideal)
        return { ex: ideal, replaced: `${ex.name} → ${ideal.name}（避开${words}，这个部位没有额外负担）` };
    const softer = pool[0];
    if (softer) {
        return {
            ex: softer,
            replaced: `${ex.name} → ${softer.name}（${words} 没有零负担的同类动作，先用冲击较小的一种；出现刺痛就停在那一组，建议找康复科或运动医学科看过再上重量）`
        };
    }
    return {
        ex,
        replaced: `${ex.name} 与你的${words}冲突，动作库里没有同类替代，今天跳过这一项，建议就医确认`
    };
}
export function areaWords(areas) {
    return areas.map((a) => INJURY_LABELS[a]).join('、');
}
/** 自重与无负荷动作不给重量 */
export function loadless(ex) {
    return ex.unit === '自重' || ex.unit === '无';
}
/** 插片器械现在按配重片的公斤数记，只有老执行表里还留着按片数的行 */
export function loadLabel(unit, weightKg) {
    if (weightKg === null)
        return unit === '无' ? '不计重量' : '自重';
    if (unit === '器械片')
        return `${weightKg} 片`;
    if (unit === '每手kg')
        return `${weightKg}kg / 手`;
    return `${weightKg} kg`;
}
/** 记录面板里重量输入框的标签 */
export function loadInputName(unit) {
    if (unit === '器械片')
        return '实际片数';
    if (unit === '每手kg')
        return '实际重量 kg（单手）';
    return '实际重量 kg';
}
export function roundLoad(ex, raw) {
    // 先按两位小数收一次浮点误差：50×1.025 在浮点里是 51.2499…，会把它从 52.5 抹回 50，做满了也不加
    const v = Math.round(raw * 100) / 100;
    if (ex.unit === 'kg' && ex.equipment.includes('杠铃'))
        return Math.max(ex.heavy ? 20 : 5, Math.round(v / 2.5) * 2.5);
    if (ex.unit === 'kg' && ex.equipment.includes('固定器械'))
        return Math.max(5, Math.round(v / 2.5) * 2.5);
    if (ex.unit === '每手kg')
        return v <= 12 ? Math.round(v * 2) / 2 : Math.round(v);
    return Math.round(v);
}
export function lastPerformance(exId, logs, beforeDate) {
    const mine = logs.filter((l) => l.exId === exId && l.date < beforeDate);
    if (mine.length === 0)
        return null;
    const date = mine.map((l) => l.date).sort().at(-1);
    return { date, sets: mine.filter((l) => l.date === date) };
}
/** 性别是可以跳过的：不猜哪一边，取男女起始值的中间，并在依据里写明 */
function starterFor(ex, tier, sex) {
    const s = ex.starter[tier];
    if (sex === 'male' || sex === 'female')
        return { kg: s[sex], word: '' };
    return { kg: Math.round(((s.male + s.female) / 2) * 2) / 2, word: '（性别没填，起始值取男女中间）' };
}
export function suggestWeight(ex, p, logs, beforeDate, adjustPct, adjustWord = '', freeze = false) {
    if (loadless(ex)) {
        return { weightKg: null, unit: ex.unit, basis: ex.equipment.includes('自重') ? '自重，按次数与停顿控制强度' : '不计重量' };
    }
    const sex = p.sex;
    const last = lastPerformance(ex.id, logs, beforeDate);
    let base;
    let basis;
    if (last) {
        const loaded = last.sets.filter((s) => s.weightKg !== null);
        const top = loaded.length ? Math.max(...loaded.map((s) => s.weightKg)) : 0;
        const allHitTarget = last.sets.every((s) => s.reps >= s.targetReps);
        const struggled = last.sets.some((s) => s.toFailure || (s.rpe ?? 0) >= 9);
        if (top === 0) {
            const st = starterFor(ex, tierOf(p), sex);
            base = st.kg;
            basis = `上次记录里没有重量，回到本动作的保守起始值${st.word}`;
        }
        else if (struggled || !allHitTarget) {
            base = top;
            basis = `${last.date} 最后一组已经到 RPE 9 或次数没做满，今天重量保持 ${top}${ex.unit} 不加`;
        }
        else if (freeze) {
            base = top;
            basis = `${last.date} 全部做满，但这一周重量按周计划不动，先把 ${ex.reps} 次做干净`;
        }
        else {
            base = top * 1.025;
            basis = `${last.date} 全部做满目标次数且 RPE ≤ 8，按 +2.5% 递进（上次 ${top}${ex.unit}）`;
        }
    }
    else {
        const st = starterFor(ex, tierOf(p), sex);
        base = st.kg;
        basis = `本机没有这个动作的记录，用${tierWord(tierOf(p))}的保守起始值${st.word}。第一次做它请再轻一档，先把动作找稳`;
    }
    const adjusted = base * adjustPct;
    const rounded = roundLoad(ex, adjusted);
    if (adjustPct < 1) {
        basis += ` · 已下调 ${Math.round((1 - adjustPct) * 100)}%（${adjustWord || '按今天的情况'}）`;
    }
    return { weightKg: rounded, unit: ex.unit, basis };
}
function tierWord(t) {
    return t === 2 ? '规律训练多年' : t === 1 ? '断续练过' : '几乎没练过';
}
