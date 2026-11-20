import { emptyProfile, exportJson, initialState, loadState, parseImported, saveState } from '../src/store.js';
import { buildEntries, daySquares, exerciseHistory, rangeStats, tonnageCaveat } from '../src/engine/logbook.js';
import { buildDays, dietScopeNote, dietTargets, macroLines, macroTargets, rangeDiet, verdict } from '../src/engine/diet.js';
import { estimateMeal, FOOD_HINTS, searchFoods } from '../src/engine/foodHints.js';
import { mealPlans } from '../src/engine/mealPlan.js';
import { isPrimeFor, isPrimeForAny } from '../src/engine/areas.js';
import { EXERCISES } from '../src/engine/exercises.js';
import { teachCard } from '../src/engine/teach.js';
import { offscreen } from '../src/engine/anim.js';
import { wishToGoal, weekdayName } from '../src/engine/goals.js';
import { buildFramework } from '../src/engine/week.js';
import { addPlannedSet, buildSheet, cutPlannedSet, currentWeek, capacityOf, dropStepPlan, hasDropSet, moveSlot, previewSlot, swapSlotExercise, toggleDropSet, wantAreasOf } from '../src/engine/day.js';
import { addDaysIso, weekdayOf, elapsedMark, todayIso } from '../src/engine/time.js';
import { bodyTrend } from '../src/engine/trends.js';
import { BROWSE_AREAS, browseAreasOf, byId, fitsEquipment } from '../src/engine/exercises.js';
import { loadLabel, roundLoad, suggestWeight } from '../src/engine/load.js';
import { baselineAdvice } from '../src/engine/lifestyle.js';
import { applyDirective, describe, isEmpty, parseByRule } from '../src/engine/tweak.js';
import { RPE_LABELS, RPE_STEPS, RPE_TOP, isRpe, rpeAt, rpeIndex, rpeLabel } from '../src/engine/rpe.js';
import { EFFORT_TONES } from '../src/components/effortMotion.js';
import { buildWeekPlan, fwForWeek, mondayOf, moveDay, setDayExercises, weekDates } from '../src/engine/weekplan.js';
/** 浏览器才有的东西，Node 里给它一个内存版，否则存档那一层的往返测不了 */
if (!('localStorage' in globalThis)) {
    const mem = new Map();
    globalThis.localStorage = {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => void mem.set(k, String(v)),
        removeItem: (k) => void mem.delete(k),
        clear: () => mem.clear(),
        key: () => null,
        length: 0
    };
}
function line(s = '') {
    console.log(s);
}
function head(s) {
    line('\n══════════════════════ ' + s);
}
const base = {
    ...emptyProfile(),
    sex: 'male',
    age: 28,
    heightCm: 178,
    weightKg: 78,
    bodyFatPct: null,
    experienceYears: 2,
    lastSolidBlock: '2024-06',
    injuries: [{ area: 'knee', side: 'right', triggers: '深蹲到最低点时右膝内侧刺痛' }],
    injuriesAnswered: true,
    commercialGym: true,
    extraEquipment: '',
    weekdays: [1, 2, 4, 6],
    sessionMinutes: 90,
    goalWish: '想要穿衣有型一点，肚子上的肉少一点',
    sleepHours: 7,
    dailySteps: 8000,
    dietRestrictions: '无'
};
base.goal = wishToGoal(base);
const fw = buildFramework(base, base.goal);
function nextTrainingDay(from, f = fw) {
    for (let i = 0; i < 14; i += 1) {
        const d = addDaysIso(from, i);
        if (f.days.some((x) => x.weekday === weekdayOf(d)))
            return d;
    }
    return from;
}
function nextRestDay(from) {
    for (let i = 0; i < 14; i += 1) {
        const d = addDaysIso(from, i);
        if (!fw.days.some((x) => x.weekday === weekdayOf(d)))
            return d;
    }
    return from;
}
const pushDay = fw.days.find((d) => d.role === '推') ?? fw.days[0];
function dateForRole(role, f = fw) {
    const day = f.days.find((d) => d.role === role) ?? f.days[0];
    for (let i = 0; i < 14; i += 1) {
        const d = addDaysIso(f.startDate, i);
        if (weekdayOf(d) === day.weekday)
            return d;
    }
    return f.startDate;
}
head('A 目标翻译（无 API Key，走规则）');
line('headline: ' + fw.goal.headline);
line('优先: ' + fw.goal.priorityAreas.join('、') + ' · 周数 ' + fw.goal.weeks + ' · 体脂区间 ' + JSON.stringify(fw.goal.bodyFatBand));
line('检查项 ' + fw.goal.checks.length + ' 条，前 3 条：');
fw.goal.checks.slice(0, 3).forEach((c) => line('  · ' + c));
head('B 周框架：分化与时长占用');
for (const d of fw.days) {
    const sum = d.warmupMin + d.mainMin + d.cardioMin + d.cooldownMin;
    const names = d.exerciseIds.map((i) => byId(i)?.name ?? i);
    line(`  ${['日', '一', '二', '三', '四', '五', '六'][d.weekday]} ${d.role}｜热身${d.warmupMin}+主${d.mainMin}+有氧${d.cardioMin}+放松${d.cooldownMin}=${sum}（档案 90）\n     ${names.join(' → ')}`);
}
line('  周数 ' + fw.weeks.length + '，第 1 周 RPE ' + fw.weeks[0].rpeBase + '，末周：' + fw.weeks.at(-1).theme);
head('C 右膝有伤：深蹲是否被换掉');
const legDay = fw.days.find((d) => d.role === '腿');
line('  腿日主项 = ' + (legDay ? byId(legDay.mainLiftId ?? '')?.name : '无腿日') + '（id=' + (legDay?.mainLiftId ?? '-') + '）');
line('  腿日动作 = ' + (legDay ? legDay.exerciseIds.map((i) => byId(i).name).join('、') : ''));
function planEnd(sh) {
    const last = sh.slots[sh.slots.length - 1];
    return elapsedMark(last ? last.startSec + last.durationSec : 0);
}
function showSheet(label, input, date, logs, overrides = {}, p = base, f = fw) {
    const sheet = buildSheet(p, f, input, logs, date, { overrides });
    line(`\n── ${label} ｜相对计时：记第一组那刻算 0:00｜预算 ${sheet.budgetMinutes} 分（到 ${elapsedMark(sheet.budgetMinutes * 60)}）｜表做到 ${planEnd(sheet)}`);
    if (sheet.assumed.length)
        line('  补的默认: ' + sheet.assumed.join(' ｜ '));
    if (sheet.flags.length)
        sheet.flags.forEach((fl) => line('  ⚑ ' + fl));
    if (sheet.dropped.length)
        line('  砍项: ' + sheet.dropped.join(' / '));
    let cursorOk = true;
    let t = 0;
    for (const s of sheet.slots) {
        if (s.startSec !== t)
            cursorOk = false;
        t += s.durationSec;
        const start = elapsedMark(s.startSec);
        const lastEnd = s.setPlan.length ? s.setPlan.at(-1).startSec + 40 : s.startSec + s.durationSec;
        const end = elapsedMark(lastEnd);
        if (s.setPlan.length) {
            const sets = s.setPlan
                .map((p, i) => `${i + 1}组 ${elapsedMark(p.startSec)} ${p.weightKg ?? '自重'}kg×${p.reps} RPE${p.rpe} 休${p.restSec}s`)
                .join(' | ');
            line(`  ${start}–${end} [${s.kind}] ${s.name} ${s.sets}组`);
            line(`        ${sets}`);
            if (s.note)
                line(`        note: ${s.note.slice(0, 150)}`);
            if (s.cautionNote)
                line(`        ⚠ ${s.cautionNote}`);
        }
        else {
            line(`  ${start}–${end} [${s.kind}] ${s.name}`);
        }
    }
    const totalSec = sheet.slots.reduce((a, s) => a + s.durationSec, 0);
    line(`  时间轴连续=${cursorOk} · 总时长 ${(totalSec / 60).toFixed(0)} 分 vs 预算 ${sheet.budgetMinutes} 分 · 超预算=${totalSec > sheet.budgetMinutes * 60}`);
    const heavyRests = sheet.slots.filter((s) => s.kind === 'main').map((s) => s.restSec);
    const isoRests = sheet.slots.filter((s) => s.kind === 'isolation').map((s) => s.setPlan.at(-2)?.restSec ?? s.setPlan.at(-1)?.restSec ?? 0);
    line(`  主项组间休息=${heavyRests.join(',')} 孤立组间休息=${isoRests.join(',')}`);
    const pr = sheet.slots.filter((s) => s.prIntent).length;
    line(`  可冲组的动作数=${pr} · 降载系数=${sheet.loadAdjustPct}`);
    return sheet;
}
const week2 = nextTrainingDay(addDaysIso(fw.startDate, 8));
const dayRole = fw.days.find((d) => d.weekday === weekdayOf(week2)).role;
head(`D 今日分钟表：${dayRole} 90 分钟，状态 4，睡 7（第 2 周）`);
const normal = showSheet('正常日', { totalMinutes: 90, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: null }, week2, []);
line('  当前周：' + currentWeek(fw, week2).theme + ' RPE ' + currentWeek(fw, week2).rpeBase);
head('E 时长只有 50 分钟：砍项顺序');
showSheet('50 分钟', { totalMinutes: 50, yesterdayFocus: '没练', statusSelf: 3, sleepHours: 7, wantArea: null }, week2, []);
head('F 时长 35 分钟（极端压缩）');
showSheet('35 分钟', { totalMinutes: 35, yesterdayFocus: '没练', statusSelf: 3, sleepHours: 7, wantArea: null }, week2, []);
head('G 状态自评 2 / 睡 5 小时：自动降载');
const low = showSheet('低状态', { totalMinutes: 90, yesterdayFocus: '没练', statusSelf: 2, sleepHours: 5, wantArea: null }, week2, []);
const lowMain = low.slots.find((s) => s.kind === 'main');
const normalMain = normal.slots.find((s) => s.kind === 'main');
line(`  主项重量 正常日=${normalMain.setPlan[0].weightKg}kg → 低状态=${lowMain.setPlan[0].weightKg}kg（比例 ${low.loadAdjustPct}）`);
head('H 昨天练了同一部位：容量收 1 组');
const overlap = showSheet('连练推日', { totalMinutes: 90, yesterdayFocus: dayRole, statusSelf: 4, sleepHours: 7, wantArea: null }, week2, []);
line(`  主项组数：不连练=${normalMain.sets} → 连练=${overlap.slots.find((s) => s.kind === 'main').sets}`);
head('I 减量周（最后一周）');
const deloadDate = nextTrainingDay(addDaysIso(fw.startDate, (fw.weeksTotal - 1) * 7 + 1));
showSheet('减量周', { totalMinutes: 90, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: null }, deloadDate, []);
head('O 减量周又赶上低状态：下调幅度只报一次，且数字要等于实际');
const both = buildSheet(base, fw, { totalMinutes: 90, yesterdayFocus: '没练', statusSelf: 2, sleepHours: 5, wantArea: null }, [], deloadDate);
both.flags.forEach((fl) => line('  ⚑ ' + fl));
const bothMain = both.slots.find((s) => s.kind === 'main');
line(`  主项 ${bothMain.setPlan[0].weightKg}kg vs 正常日 ${normalMain.setPlan[0].weightKg}kg = ${(bothMain.setPlan[0].weightKg / normalMain.setPlan[0].weightKg).toFixed(3)}`);
line('  note: ' + bothMain.note);
head('J 重量推算：有记录 vs 有记录但失败');
const yesterday = addDaysIso(week2, -7);
const goodLogs = [0, 1, 2, 3].map((i) => ({
    slotId: 'lift-0',
    sheetId: 'x',
    exId: 'bench-press',
    date: yesterday,
    setIdx: i,
    weightKg: 60,
    reps: 6,
    targetReps: 6,
    rpe: 7.5,
    toFailure: false,
    ts: ''
}));
const hardLogs = [0, 1, 2, 3].map((i) => ({
    ...goodLogs[i],
    date: addDaysIso(yesterday, 4),
    weightKg: 62.5,
    reps: i === 3 ? 4 : 6,
    rpe: 9.5,
    toFailure: i === 3
}));
line('  无历史 → ' + JSON.stringify(suggestWeight(byId('bench-press'), base, [], week2, 1)));
line('  上次做满且 RPE7.5 → ' + JSON.stringify(suggestWeight(byId('bench-press'), base, goodLogs, week2, 1)));
line('  上次最后一组力竭 → ' + JSON.stringify(suggestWeight(byId('bench-press'), base, [...goodLogs, ...hardLogs], week2, 1)));
const fresh = { ...base, experienceYears: 0, lastSolidBlock: 'never' };
line('  完全新手首次做硬拉 → ' + JSON.stringify(suggestWeight(byId('conventional-deadlift'), fresh, [], week2, 1)));
head('K 换动作后时间轴重排');
const legDate = nextTrainingDay(addDaysIso(fw.startDate, 6));
const legSheet = buildSheet(base, fw, { totalMinutes: 90, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: null }, [], legDate);
line('  换之前主项：' + (legSheet.slots.find((s) => s.kind === 'main')?.name ?? '无') + '，表做到 ' + planEnd(legSheet));
const targetSlot = legSheet.slots.find((s) => s.kind === 'main');
const alt = targetSlot.exId === 'box-squat' ? 'leg-press' : 'box-squat';
const swapped = swapSlotExercise(base, fw, legSheet, targetSlot.id, alt, []);
const newMain = swapped.slots.find((s) => s.kind === 'main');
line(`  换成 ${byId(alt).name} 后：主项=${newMain?.name}，${newMain?.sets}×${newMain?.setPlan[0].reps} @ ${newMain?.setPlan[0].weightKg}kg，表做到 ${planEnd(swapped)}`);
let acc = 0;
let monotonic = true;
for (const s of swapped.slots) {
    if (s.startSec !== acc)
        monotonic = false;
    acc += s.durationSec;
}
line('  重排后时间轴连续=' + monotonic + ' · 仍不超预算=' + (acc <= 90 * 60));
head('L 休息日（档案外的星期）');
const restSheet = buildSheet(base, fw, { totalMinutes: 45, yesterdayFocus: '腿', statusSelf: 3, sleepHours: 7, wantArea: null }, [], nextRestDay(fw.startDate));
line('  focus=' + restSheet.focus + ' 动作数=' + restSheet.slots.length + ' 表做到=' + planEnd(restSheet));
line('  ' + restSheet.slots.map((s) => `${elapsedMark(s.startSec)} ${s.name}`).join('\n  '));
head('M 女性档案 + 只有哑铃：会不会出现健身房才有的器械');
const f = {
    ...base,
    sex: 'female',
    age: 25,
    heightCm: 165,
    weightKg: 58,
    bodyFatPct: 26,
    experienceYears: 0,
    lastSolidBlock: 'never',
    injuries: [],
    commercialGym: false,
    extraEquipment: '一对 12kg 哑铃 + 弹力带 + 小区单杠',
    weekdays: [1, 3, 5],
    sessionMinutes: 60,
    goalWish: '想练臀和背，穿衣服好看'
};
f.goal = wishToGoal(f);
const ff = buildFramework(f, f.goal);
line('  headline: ' + ff.goal.headline);
const eqSet = new Set();
ff.days.forEach((d) => d.exerciseIds.forEach((i) => byId(i).equipment.forEach((e) => eqSet.add(e))));
line('  用到的器械类别: ' +
    [...eqSet].join('、') +
    '（commercialGym=false 按居家过滤，哑铃/自重/引体杆之外不该出现；extraEquipment 的自由文本仍不解析，见待确认项）');
line('  assumed: ' + (ff.assumed.join(' ｜ ') || '无（这一份档案伤病史答过、器械也表过态）'));
const fSheet = buildSheet(f, ff, { totalMinutes: 60, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: null }, [], nextTrainingDay(ff.startDate, ff));
line('  女·新手第一天主项 ' + fSheet.slots.find((s) => s.kind === 'main')?.name + ' 重量 ' + fSheet.slots.find((s) => s.kind === 'main')?.setPlan[0].weightKg);
line('  表做到 ' + planEnd(fSheet) + '，行：');
fSheet.slots.forEach((s) => line(`    ${elapsedMark(s.startSec)} [${s.kind}] ${s.name} ${s.setPlan.length ? s.sets + '×' + s.setPlan[0].reps + '@' + (s.setPlan[0].weightKg ?? '自重') + ' 休' + s.setPlan[0].restSec : ''}`));
head('N 腰 + 肩都有伤：推日和拉日的主项换成什么');
const nb = {
    ...base,
    injuries: [
        { area: 'lowBack', side: null, triggers: '俯身划船和硬拉之后腰酸' },
        { area: 'shoulder', side: 'left', triggers: '卧推底部左肩前侧刺痛' }
    ],
    weekdays: [1, 3],
    goalWish: '想把背练宽一点'
};
nb.goal = wishToGoal(nb);
const nfw = buildFramework(nb, nb.goal);
nfw.days.forEach((d) => line(`  ${d.role}｜主项 ${byId(d.mainLiftId ?? '')?.name ?? '无'}｜${d.exerciseIds.map((i) => byId(i).name).join(' → ')}`));
const nSheet = buildSheet(nb, nfw, { totalMinutes: 75, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: null }, [], nextTrainingDay(nfw.startDate, nfw));
nSheet.flags.forEach((fl) => line('  ⚑ ' + fl));
head('P 首屏简化的档案（没问每次时长/睡眠/饮食）能不能出表');
const sp = {
    ...emptyProfile(),
    sex: 'female',
    age: 24,
    heightCm: 165,
    weightKg: 60,
    experienceYears: 0,
    lastSolidBlock: null,
    injuries: [],
    injuriesAnswered: true,
    commercialGym: true,
    weekdays: [1, 3, 5],
    sessionMinutes: null,
    goalWish: '想练出臀腿线条，顺便把体能提上来',
    sleepHours: null,
    dailySteps: null,
    dietRestrictions: null
};
sp.goal = wishToGoal(sp);
line('  目标: ' + sp.goal.headline + ' / ' + sp.goal.weeks + ' 周（来源 ' + sp.goal.source + '）');
sp.goal.weeklyTargets.forEach((t) => line('  · ' + t));
const spFw = buildFramework(sp, sp.goal);
spFw.days.forEach((d) => line(`  ${d.role}｜热身 ${d.warmupMin} 分｜主 ${d.mainMin} 分｜有氧 ${d.cardioMin} 分｜放松 ${d.cooldownMin} 分｜${d.exerciseIds.length} 个动作`));
const pSheet = buildSheet(sp, spFw, { totalMinutes: 45, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 6.5, wantArea: null }, [], nextTrainingDay(spFw.startDate, spFw));
const pMain = pSheet.slots.find((s) => s.kind === 'main');
line(`  当天填 45 分钟：主项 ${pMain.name} ${pMain.setPlan[0].weightKg}kg，${pSheet.slots.length} 行，0:00–${planEnd(pSheet)}`);
line('  砍掉的行: ' + (pSheet.dropped.length ? pSheet.dropped.join('、') : '无'));
pSheet.flags.forEach((fl) => line('  ⚑ ' + fl));
const adv = baselineAdvice(sp);
line('  热量参考: ' + (adv.tdee ? adv.tdee.range.join('–') + ' kcal，底线 ' + adv.floor : '算不出来') + '｜蛋白 ' + (adv.protein ? adv.protein.join('–') + ' g' : '无'));
adv.sleep.slice(0, 2).forEach((s) => line('  睡: ' + s));
adv.diet.slice(0, 3).forEach((s) => line('  吃: ' + s));
const thin = baselineAdvice({ ...sp, weightKg: null, age: null });
line('  数据不全时: ' + thin.diet[2] + '｜tdee ' + (thin.tdee === null ? 'null（不猜）' : '有值'));
// 第三问（星期几）和第四问（愿望）都跳过：只有身体数据也要能出表，并且把替他定的默认念出来
const bare = { ...emptyProfile(), sex: 'male', age: 30, heightCm: 178, weightKg: 80, experienceYears: null, lastSolidBlock: null };
bare.goal = wishToGoal(bare);
const bareFw = buildFramework(bare, bare.goal);
line('  只答两问的目标: ' + bare.goal.headline + ' / ' + bare.goal.weeks + ' 周');
line('  只答两问的排法: ' + bareFw.days.map((d) => `${weekdayName(d.weekday)}·${d.role}`).join('、'));
bareFw.assumed.forEach((a) => line('  默认: ' + a));
const bareSheet = buildSheet(bare, bareFw, { totalMinutes: 40, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: null }, [], nextTrainingDay(bareFw.startDate, bareFw));
line('  只答两问也能出表: ' + bareSheet.slots.length + ' 行，0:00–' + planEnd(bareSheet) + '，主项 ' + (bareSheet.slots.find((s) => s.kind === 'main')?.name ?? '无'));
head('Q 一句话改计划：解析结果 + 重排后的框架');
['不要有氧，把时间都留给力量', '我在家练，只有哑铃和自重', '别排卧推和深蹲', '我膝盖蹲下去刺痛', '腰其实没问题了', '多来点有氧', '全部改回去'].forEach((t) => {
    const d = parseByRule(t);
    line(`  「${t}」→ ${describe(d).join('；') || '没听出能改的项目'}`);
});
const un = parseByRule('我今天心情不错');
line('  「我今天心情不错」→ isEmpty ' + isEmpty(un));
let tp = { ...base, goalWish: base.goalWish };
tp = applyDirective(tp, parseByRule('不要有氧'));
tp = applyDirective(tp, parseByRule('我在家练，只有哑铃和自重'));
tp = applyDirective(tp, parseByRule('别排卧推'));
tp = applyDirective(tp, parseByRule('我膝盖蹲到底刺痛'));
tp.goal = wishToGoal(tp);
const tfw = buildFramework(tp, tp.goal);
const tEq = new Set();
const tNames = [];
tfw.days.forEach((d) => {
    tNames.push(...d.exerciseIds.map((i) => byId(i).name));
    d.exerciseIds.forEach((i) => byId(i).equipment.forEach((e) => tEq.add(e)));
});
line('  有氧分钟: ' + tfw.days.map((d) => d.cardioMin).join('/') + '（应全为 0）');
line('  用到的器械: ' + [...tEq].join('、') + '（在家模式应只有哑铃/自重/引体杆）');
line('  含「卧推」的动作: ' + (tNames.filter((n) => n.includes('卧推')).join('、') || '无'));
line('  伤病标记: ' + tp.injuries.map((i) => i.area + '/' + i.triggers).join('；'));
tfw.days.forEach((d) => d.substitutions.filter((s) => /在家|卧推/.test(s)).slice(0, 2).forEach((s) => line('    ⚑ ' + s)));
const tSheet = buildSheet(tp, tfw, { totalMinutes: 60, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: null }, [], nextTrainingDay(tfw.startDate, tfw));
const tMain = tSheet.slots.find((s) => s.kind === 'main');
line('  今天表 ' + tSheet.slots.length + ' 行，0:00–' + planEnd(tSheet));
line('  主项 ' + (tMain?.name ?? '无') + ' ' + (tMain?.setPlan[0].weightKg ?? '-') + 'kg｜有没有有氧行 ' + (tSheet.slots.some((s) => s.kind === 'cardio') ? '有' : '无'));
line('  每一行: ' + tSheet.slots.map((s) => `${s.kind}:${s.name}`).join(' → '));
line('  框架每天主项: ' + tfw.days.map((d) => `${d.role}=${d.mainLiftId ? byId(d.mainLiftId).name : '无'}`).join('、'));
const kept = buildFramework(tp, tp.goal, { id: tfw.id, startDate: tfw.startDate });
line('  改计划后框架延续: id ' +
    (kept.id === tfw.id ? '同一个' : '换了（错）') +
    ' · 开始日 ' +
    (kept.startDate === tfw.startDate ? kept.startDate : '被重置（错）') +
    ' · 推日第一行 ' +
    (byId(tfw.days[0].exerciseIds[0])?.name ?? '空') +
    '（应等于主项 ' +
    (tfw.days[0].mainLiftId ? byId(tfw.days[0].mainLiftId).name : '无') +
    '）');
head('R 今日表单全部跳过：只点「生成」也要有表');
const allSkip = { totalMinutes: null, yesterdayFocus: '没练', statusSelf: null, sleepHours: null, wantArea: null };
const skipPush = showSheet('全跳过·档案齐全', allSkip, dateForRole('推'), []);
line('  分钟数：档案 sessionMinutes ' + base.sessionMinutes + ' → sheet.budgetMinutes ' + skipPush.budgetMinutes);
line('  状态/睡眠没选：降载系数 ' + skipPush.loadAdjustPct + '（应当 1，不降）、可冲组动作数 ' + skipPush.slots.filter((s) => s.prIntent).length + '（null 状态不该有）');
const skipBare = showSheet('全跳过·空档案', allSkip, nextTrainingDay(bareFw.startDate, bareFw), [], {}, bare, bareFw);
line('  空档案补的默认 ' + skipBare.assumed.length + ' 条 · 行数 ' + skipBare.slots.length + ' · 0:00–' + planEnd(skipBare));
head('S 今天主练部位：换位 / 补动作 / 时间紧也照排不砍你要的');
const wantShoulder = showSheet('推日说主练「肩」', { ...allSkip, totalMinutes: 90, wantArea: '肩' }, dateForRole('推'), []);
line('  第一行动作 = ' + (wantShoulder.slots.find((s) => s.kind === 'main')?.name ?? '无') + '（框架里推日主项是 ' + (byId(pushDay.mainLiftId ?? '')?.name ?? '无') + '）');
line('  顺序: ' + wantShoulder.slots.map((s) => `${s.kind}:${s.name}`).join(' → '));
const wantBack = showSheet('推日说主练「背」（框架里没有背的动作）', { ...allSkip, totalMinutes: 90, wantArea: '背' }, dateForRole('推'), []);
line('  顺序: ' + wantBack.slots.map((s) => `${s.kind}:${s.name}`).join(' → '));
const wantSide = showSheet('推日说主练「核心」（只有孤立动作匹配）', { ...allSkip, totalMinutes: 60, wantArea: '核心' }, dateForRole('推'), []);
line('  顺序: ' + wantSide.slots.map((s) => `${s.kind}:${s.name} ${s.sets}组`).join(' → '));
const tight = showSheet('推日主练「背」但只有 40 分钟', { ...allSkip, totalMinutes: 40, wantArea: '背' }, dateForRole('推'), []);
const backKept = tight.slots.some((s) => /背|菱形|斜方|下拉|划船/.test(`${s.name} ${s.muscles.join(' ')}`));
line('  40 分钟砍完之后背的动作还在不在 = ' + (backKept ? '在' : '没了（错）'));
line('  砍项: ' + (tight.dropped.join(' / ') || '无'));
const restWant = buildSheet(base, fw, { ...allSkip, totalMinutes: 40, wantArea: '胸' }, [], nextRestDay(fw.startDate));
restWant.assumed.concat(restWant.flags).forEach((t) => line('  休息日说主练：' + t));
['胸', '手臂', '腿'].forEach((a) => {
    const s = buildSheet(base, fw, { ...allSkip, totalMinutes: 70, wantArea: a }, [], dateForRole('推'));
    line(`  推日说主练「${a}」→ 第一行 ${s.slots.find((x) => x.kind === 'main')?.name ?? '无'}｜${s.flags.find((f) => f.includes('主练')) ?? '没有相关说明（错）'}`);
});
head('T 身体数据全跳过（性别/体重都没有）：重量不能出现 NaN');
const none = { ...emptyProfile(), sex: null, weightKg: null, heightCm: null, age: null, experienceYears: null, lastSolidBlock: null };
none.goal = wishToGoal(none);
const nFw2 = buildFramework(none, none.goal);
line('  目标: ' + nFw2.goal.headline);
nFw2.goal.strengthTargets.forEach((t) => line('  力量参照: ' + t.lift + ' → ' + t.target + '（' + t.basis + '）'));
['肩', '背', null].forEach((a) => {
    const s = buildSheet(none, nFw2, { ...allSkip, totalMinutes: 60, wantArea: a }, [], nextTrainingDay(nFw2.startDate, nFw2));
    const bad = s.slots.filter((x) => x.setPlan.some((p) => !Number.isFinite(p.weightKg ?? 0) || Number.isNaN(p.weightKg ?? 0)));
    const ramps = s.slots.filter((x) => x.kind === 'ramp');
    line(`  主练${a ?? '不指定'}: ${s.slots.length} 行 · 重量 NaN 的动作=${bad.length ? bad.map((b) => b.name).join('、') : '无'} · 递增热身「${ramps[0]?.note ?? '没有递增热身'}」`);
    line('    每行重量: ' + s.slots.filter((x) => x.setPlan.length && x.kind !== 'ramp').map((x) => `${x.name} ${x.setPlan[0].weightKg ?? '自重'}`).join(' / '));
});
head('U 休息日点名部位：不管今天是不是训练日，直接按部位现排一张表');
['胸', '肩', '手臂', '腿', '臀', '背', '核心'].forEach((a) => {
    const s = buildSheet(base, fw, { ...allSkip, totalMinutes: 60, wantArea: a }, [], nextRestDay(fw.startDate));
    const lifts = s.slots.filter((x) => x.setPlan.length);
    const used = Math.round(s.slots.reduce((t, x) => t + x.durationSec, 0) / 60);
    line(`  主练${a}: focus=${s.focus} · ${s.slots.length} 行 · 用到 ${used} 分/预算 ${s.budgetMinutes} · ` +
        lifts.map((x) => `${x.name}(${x.kind},${x.sets}组,休${x.restSec}s)`).join(' → '));
    line('    补的默认: ' + s.assumed.join(' ｜ '));
    const nan = s.slots.filter((x) => x.setPlan.some((p) => Number.isNaN(p.weightKg ?? 0)));
    if (nan.length)
        line('    ⚑ 重量 NaN: ' + nan.map((n) => n.name).join('、'));
});
const homeRestDay = (() => {
    for (let i = 0; i < 14; i += 1) {
        const d = addDaysIso(ff.startDate, i);
        if (!ff.days.some((x) => x.weekday === weekdayOf(d)))
            return d;
    }
    return ff.startDate;
})();
const homeRest = buildSheet(f, ff, { ...allSkip, totalMinutes: 50, wantArea: '胸' }, [], homeRestDay);
line('  居家档案（' + weekdayName(weekdayOf(homeRestDay)) + '，周框架里没有这天）休息日主练胸: ' + (homeRest.slots.filter((x) => x.setPlan.length).map((x) => `${x.name}[${x.equipment}]`).join(' → ') || '没排出来'));
line('    补的默认: ' + homeRest.assumed.join(' ｜ '));
const noChest = { ...base, avoidNames: ['卧推', '飞鸟', '俯卧撑', '臂屈伸'] };
const avoided = buildSheet(noChest, fw, { ...allSkip, totalMinutes: 60, wantArea: '胸' }, [], nextRestDay(fw.startDate));
line('  点名不要卧推/飞鸟/俯卧撑/臂屈伸后休息日主练胸: ' + (avoided.slots.filter((x) => x.setPlan.length).map((x) => x.name).join(' → ') || '没排出来'));
line('    补的默认: ' + avoided.assumed.join(' ｜ '));
head('V 昨天练了哪里改成按部位问：撞上就收 1 组，不撞不影响');
const mainOf = (s) => s.slots.find((x) => x.kind === 'main');
const yCases = [['胸', '推'], ['腿', '推'], ['背', '拉'], ['肩', '推'], ['没练', '推']];
yCases.forEach(([y, role]) => {
    const s = buildSheet(base, fw, { ...allSkip, totalMinutes: 75, yesterdayFocus: y }, [], dateForRole(role));
    const m = mainOf(s);
    line(`  昨天=${y} · ${role}日主项 ${m?.name ?? '无'} → ${m?.sets ?? 0} 组（${y === '没练' ? '基准' : '与基准比'}）`);
});
head('W 动作详解卡：库里每个动作 + 今日表每一种行都要能出卡，姿态不能出画布');
const inj = {
    ...base,
    injuries: [{ area: 'shoulder', side: 'left', triggers: '推到底时肩前部刺痛' }],
    injuriesAnswered: true
};
const libSlots = EXERCISES.map((ex, i) => ({
    id: `qa-${i}`,
    kind: ex.heavy ? 'main' : ex.kind === 'compound' ? 'compound' : 'accessory',
    exId: ex.id,
    name: ex.name,
    muscles: ex.muscles,
    equipment: ex.equipment.join('·'),
    startSec: 0,
    durationSec: 600,
    sets: 3,
    restSec: ex.restSec,
    setPlan: [1, 2, 3].map((n) => ({
        reps: ex.reps,
        weightKg: ex.starter[0].male,
        rpe: 7,
        restSec: ex.restSec,
        startSec: n * 60
    })),
    prIntent: false,
    note: '',
    cautionNote: '',
    unit: ex.unit
}));
const seenPattern = new Set();
const broken = [];
libSlots.forEach((s) => {
    const c = teachCard(s, inj);
    seenPattern.add(c.pattern);
    const textBad = [c.doseLine, c.restWhy, c.breathing, c.tempo, c.safety, c.primeLine].some((x) => !x || x.includes('undefined') || x.includes('NaN') || x.includes('null'));
    const poseBad = offscreen(c.start, c.rig).length + offscreen(c.end, c.rig).length;
    if (textBad || poseBad > 0 || c.steps.length < 4 || c.mistakes.length < 4) {
        broken.push(`${s.name}${poseBad ? ' 姿态出界' : ''}${textBad ? ' 文案缺' : ''}`);
    }
});
line(`  动作库 ${libSlots.length} 个动作 → 覆盖 ${seenPattern.size} 种动作模式，问题卡 ${broken.length ? broken.join('、') : '0 个'}`);
const sample = teachCard(libSlots.find((s) => s.name.includes('卧推')) ?? libSlots[0], inj);
line(`  举例（${sample.name}）：`);
line('    ' + sample.doseLine);
line('    步骤 ' + sample.steps.length + ' 条 · 常见错 ' + sample.mistakes.length + ' 条 · 可换 ' + (sample.swaps.join('、') || '无'));
line('    伤病提示：' + (sample.caution || '（这个动作没踩到你的伤）'));
const fullSheet = buildSheet(base, fw, { ...allSkip, totalMinutes: 75 }, [], dateForRole('推'));
const rowKinds = fullSheet.slots.map((s) => `${s.kind}(${teachCard(s, base).name})`);
line('  今日表每一行都出卡：' + rowKinds.join(' / '));
const timedBad = fullSheet.slots.filter((s) => {
    const c = teachCard(s, base);
    return c.steps.length < 3 || offscreen(c.start, c.rig).length > 0 || c.doseLine.includes('NaN');
});
line('  有问题的行：' + (timedBad.map((x) => x.kind).join('、') || '无'));
const rampSlot = fullSheet.slots.find((s) => s.kind === 'ramp');
line('  递增热身行的卡：' + (rampSlot ? teachCard(rampSlot, base).doseLine : '这张表没有递增热身'));
head('X 动作库扩容：分类覆盖、id 唯一、动作页的建议剂量');
const dupIds = EXERCISES.map((e) => e.id).filter((v, i, a) => a.indexOf(v) !== i);
const noArea = EXERCISES.filter((e) => browseAreasOf(e).length === 0);
line(`  库里 ${EXERCISES.length} 个动作 · 重复 id ${dupIds.length ? dupIds.join('、') : '无'} · 不属于任何分类的 ${noArea.length ? noArea.map((e) => e.name).join('、') : '0 个'}`);
BROWSE_AREAS.forEach((a) => {
    const list = EXERCISES.filter((e) => a.test(e));
    line(`  ${a.title}：${list.length} 个（居家只有哑铃时能做 ${list.filter((e) => fitsEquipment(e, true)).length} 个）`);
});
const pvBad = [];
EXERCISES.forEach((e) => {
    const s = previewSlot(e, base, [], nextTrainingDay(fw.startDate));
    const c = teachCard(s, base);
    if (!c.doseLine || /NaN|undefined|null/.test(`${c.doseLine} ${s.note} ${c.restWhy}`) || c.steps.length < 4) {
        pvBad.push(`${e.name}(${c.doseLine || '空'})`);
    }
});
line('  动作页每行都能出解读卡、剂量里没 NaN/空值：' + (pvBad.length ? pvBad.join('、') : '全部正常'));
head('Y 「动作」页点进来的动作：并进今天这张表，不是另起一张');
const pushDate = dateForRole('推');
const withPick = buildSheet(base, fw, { ...allSkip, totalMinutes: 75 }, [], pushDate, {
    picked: ['db-fly', 'crunch', 'jump-rope']
});
line('  推日 + 点了哑铃飞鸟/卷腹/跳绳: ' +
    withPick.slots.map((s) => `${s.name}${s.kind === 'main' ? '(主项)' : ''}`).join(' → '));
line(`    用了 ${Math.round(withPick.slots.reduce((a, s) => a + s.durationSec, 0) / 60)} 分 / 预算 75 · 主项 ${mainOf(withPick)?.name ?? '无'} · 有氧行 ${withPick.slots.find((s) => s.kind === 'cardio')?.name ?? '无'}`);
line('    你点的都在表上: ' +
    ['db-fly', 'crunch', 'jump-rope'].filter((id) => withPick.slots.some((s) => s.exId === id)).length +
    '/3 · 不再解释: ' +
    (withPick.flags.some((f) => f.includes('动作」页点了')) ? '有（错）' : '没有'));
const dupPick = buildSheet(base, fw, { ...allSkip, totalMinutes: 75 }, [], pushDate, { picked: [pushDay.exerciseIds[0]] });
line('  点了今天本来就有的动作: ' + (dupPick.flags.find((f) => f.includes('本来就有')) ?? '没说明（有问题）'));
const homeProfile = { ...base, homeOnly: true, commercialGym: false };
const homePick = buildSheet(homeProfile, fw, { ...allSkip, totalMinutes: 60 }, [], pushDate, {
    picked: ['hack-squat', 'db-fly']
});
line('  居家档案点了哈克深蹲+哑铃飞鸟: ' +
    homePick.slots.filter((s) => s.setPlan.length).map((s) => s.name).join(' → '));
line('    器械不满足的怎么说: ' + (homePick.flags.find((f) => f.includes('你点的 哈克深蹲')) ?? '没说明（有问题）'));
const restPick = buildSheet(base, fw, { ...allSkip, totalMinutes: 45 }, [], nextRestDay(fw.startDate), {
    picked: ['jump-rope']
});
line('  休息日只点了一个有氧: ' +
    restPick.slots.map((s) => s.name).join(' → ') +
    ' ｜ ' +
    (restPick.assumed.find((a) => a.includes('动作」页')) ?? '没说明（有问题）'));
const restPick2 = buildSheet(base, fw, { ...allSkip, totalMinutes: 60 }, [], nextRestDay(fw.startDate), {
    picked: ['db-fly', 'crunch']
});
line('  休息日点了两个力量动作: ' +
    restPick2.slots.filter((s) => s.setPlan.length).map((s) => `${s.name}[${s.kind}]`).join(' → ') +
    ' ｜ ' +
    (restPick2.assumed.find((a) => a.includes('动作」页')) ?? '没说明（有问题）'));
const tightPick = buildSheet(base, fw, { ...allSkip, totalMinutes: 40 }, [], pushDate, {
    picked: ['db-fly', 'crunch', 'reverse-lunge', 'hip-bridge', 'arnold-press', 'preacher-curl']
});
line('  只有 40 分钟又点 6 个: ' +
    tightPick.slots.map((s) => s.name).join(' → '));
line('    主项 ' + (mainOf(tightPick)?.name ?? '无') + ' 保住了；砍掉的: ' + (tightPick.dropped.join(' ｜ ') || '没砍任何东西'));
line('    超了也不废话: ' +
    (tightPick.flags.some((f) => f.includes('分钟长') || f.includes('还有空')) ? '还在说（错）' : '没有一句时长说明'));
head('Z 运动记录：按天聚合、吨位口径、新高判定、老数据兼容');
function mkLog(exId, date, setIdx, weightKg, reps, rpe, min, slotId = '') {
    return {
        slotId: slotId || `lift-${setIdx}`,
        sheetId: `sheet-${date}`,
        exId,
        date,
        setIdx,
        weightKg,
        reps,
        targetReps: 8,
        rpe,
        toFailure: false,
        ts: `${date}T09:${String(min).padStart(2, '0')}:00.000Z`
    };
}
const empty = buildEntries([], [], []);
const emptyStats = rangeStats(empty, '2026-01-01', '2026-12-31');
line('  没有任何记录: 天数 ' + empty.length + ' · 次数 ' + emptyStats.sessions + ' · 组数 ' + emptyStats.sets +
    ' · 有氧 ' + emptyStats.cardioMin + ' 分钟');
const d1 = '2026-10-12';
const d2 = '2026-10-15';
const mkSheet = (date, planned) => ({
    id: `sheet-${date}`,
    createdAt: date + 'T08:00:00.000Z',
    date,
    weekday: weekdayOf(date),
    focus: '推 · 胸肩三头',
    input: allSkip,
    budgetMinutes: 70,
    assumed: [],
    slots: [{ id: 'lift-0', kind: 'main', exId: 'bench-press', name: '杠铃卧推', muscles: [], equipment: '', startSec: 600, durationSec: 120, sets: planned, restSec: 180, setPlan: Array.from({ length: planned }, (_, i) => ({ reps: 8, weightKg: 60, rpe: 8, restSec: 180, startSec: 600 + i * 300 })), prIntent: true, note: '', cautionNote: '' }],
    overrides: {},
    skipped: [],
    loadAdjustPct: 1,
    flags: [],
    dropped: []
});
const recLogs = [
    mkLog('bench-press', d1, 0, 20, 8, null, 0, 'ramp'),
    mkLog('bench-press', d1, 1, 40, 8, null, 2, 'ramp'),
    mkLog('bench-press', d1, 0, 60, 8, 8, 5),
    mkLog('bench-press', d1, 1, 60, 8, 8, 12),
    mkLog('db-fly', d1, 0, 10, 12, 7, 20),
    mkLog('hack-squat', d1, 1, 6, 10, 7, 28),
    mkLog('crunch', d1, 2, null, 20, null, 35),
    mkLog('bench-press', d2, 0, 40, 8, null, 0, 'ramp'),
    mkLog('bench-press', d2, 0, 62.5, 8, 8, 4),
    mkLog('bench-press', d2, 1, 62.5, 6, 9, 11),
    mkLog('push-up', d2, 2, null, 14, 8, 18)
];
const recActs = [
    { id: 'a1', date: d2, name: '江边慢跑', minutes: 40, kind: 'cardio', feel: 3, areas: [], exIds: [], note: '心率偏高', ts: d2 + 'T18:00:00.000Z' },
    { id: 'a2', date: d1, name: '羽毛球双打', minutes: 60, kind: 'sport', feel: null, areas: ['腿'], exIds: [], note: '', ts: d1 + 'T20:00:00.000Z' },
    { id: 'a3', date: d1, name: '拉伸', minutes: 15, kind: 'other', feel: 4, areas: [], exIds: [], note: '', ts: d1 + 'T21:00:00.000Z' }
];
const entries = buildEntries([mkSheet(d1, 2), mkSheet(d2, 2)], recLogs, recActs);
line('  倒序按天: ' + entries.map((e) => `${e.date}(${e.dayName}/${e.title})`).join(' → '));
const e1 = entries.find((e) => e.date === d1);
line('  ' + d1 + ': 记了 ' + e1.setCount + ' 组 / 表上计划 ' + e1.plannedSets + ' 组 → 完成度 ' + e1.completion + '%（要贴在 100，不能出 250%） · overLogged=' + e1.overLogged);
line('    杠铃正式组 + 哑铃每手 + 插片器械 6 kg×10 + 自重 → 吨位 ' + e1.tonnage + ' kg（应当 = 60×8×2 + 10×12×2 + 热身 20×8+40×8 + 器械 60 = 1740）');
line('    有氧与球类 ' + e1.cardioMin + ' 分钟（其他类型 ' + e1.activities.filter((a) => a.kind === 'other').length + ' 条不计） · 第一组到最后一组 ' + e1.minutes + ' 分钟（晚上补记的球不该并进这个跨度）');
line('    每行动作: ' + e1.lines.map((l) => `${l.name}[${l.perSet.join('/')}]${l.best ? '★' : ''}`).join(' '));
const e2 = entries.find((e) => e.date === d2);
line('  ' + d2 + ': ' + e2.lines.map((l) => `${l.name} 最高 ${l.top}${l.best ? ' ★新高' : ''}`).join(' · '));
line('    热身单独成行 ' + e2.lines.filter((l) => l.name.includes('递增热身')).length + ' 行（应当 1）· 新高只标在正式组行: ' +
    e2.lines.filter((l) => l.best).every((l) => !l.name.includes('热身')) +
    ' · 组数 ' + e2.setCount + ' · 吨位 ' + e2.tonnage + '（62.5×8+62.5×6+40×8=1195，俯卧撑自重不计）');
line('    新高个数 ' + e2.bestCount + '（只算正式组） · 补记 ' + e2.activities.map((a) => a.name + a.minutes + '分').join('、'));
line('    口径说明: ' + tonnageCaveat(entries));
const wk = rangeStats(entries, '2026-10-12', '2026-10-19');
line('  近 8 天合计: 次数 ' + wk.sessions + ' · 组数 ' + wk.sets + ' · 有氧 ' + wk.cardioMin + ' 分 · 吨位 ' + wk.tonnage);
line('  单动作历史 bench-press: ' + exerciseHistory('bench-press', recLogs).map((h) => `${h.date} ${h.top}${h.best ? '★' : ''}`).join(' → '));
line('  自重动作历史 push-up: ' + exerciseHistory('push-up', recLogs).map((h) => `${h.date} ${h.top}${h.best ? '★' : ''}`).join(' → ') + '（只练过一次，没有可比的前次，不该标新高）');
const legacy = parseImported(JSON.stringify({ profile: base, sheets: [], setLogs: [recLogs[0]] }));
line('  老版本导出的 JSON 没有 activityLogs: 补成数组 ' + Array.isArray(legacy.activityLogs) + ' · 长度 ' + legacy.activityLogs.length);
const junk = parseImported(JSON.stringify({
    profile: base,
    activityLogs: [
        { id: 'ok', date: d1, name: '跑步', minutes: 30, kind: 'cardio', feel: null, note: '', ts: d1 + 'T07:00:00.000Z' },
        { id: 'bad0', date: d1, name: '', minutes: 0, kind: 'cardio', feel: null, note: '', ts: '' },
        { id: 'bad1', date: d1, name: '怪', minutes: 5, kind: 'teleport', feel: null, note: '', ts: '' },
        null
    ]
}));
line('  导入时结构不对的补记条目被丢掉: 留下 ' + junk.activityLogs.map((a) => a.id).join('、') + '（只剩合法的那条）');
line('  老记录没有 areas → 补成空数组: ' + JSON.stringify(junk.activityLogs[0].areas) +
    ' · 那条球类手记点的部位: ' + JSON.stringify(recActs[1].areas));
head('AA 饮食记录：参考值、一周平均、底线判定、老数据兼容');
const dt = dietTargets(base);
line('  男 28/178/78: bmr ' + dt.bmr + ' · 维持 ' + (dt.maintain ? dt.maintain.join('–') : '无') + ' · 建议 ' + dt.target + ' · 底线 ' + dt.floor + ' · 蛋白 ' + (dt.protein ? dt.protein.join('–') : '无'));
line('    目标口径: ' + dt.basis);
const dtF = dietTargets({ ...base, sex: 'female', weightKg: 60, heightCm: 165 });
line('  女 60/165: 底线 ' + dtF.floor + '（应当 1600） · 建议 ' + dtF.target);
const dtThin = dietTargets({ ...base, weightKg: null, age: null });
line('  数据不全: target ' + dtThin.target + '（应当 null，不编数） · 文案: ' + dtThin.basis.slice(0, 24) + '…');
const mkMeal = (id, date, slot, name, kcal, proteinG, note = '', extra = {}) => ({
    id,
    date,
    slot,
    name,
    kcal,
    proteinG,
    carbsG: null,
    fatG: null,
    sugarG: null,
    sodiumMg: null,
    note,
    ts: `${date}T12:00:00.000Z`,
    ...extra
});
const dietMeals = [
    mkMeal('m1', '2026-10-13', 'breakfast', '两个鸡蛋+豆浆', 320, 24, '', { carbsG: 8, fatG: 18, sugarG: 2, sodiumMg: 320 }),
    mkMeal('m2', '2026-10-13', 'lunch', '食堂米饭+鸡腿+青菜', 780, 45, '', { carbsG: 82, fatG: 26, sugarG: 6, sodiumMg: 1400 }),
    mkMeal('m3', '2026-10-13', 'dinner', '一碗面', 620, 22, '', { carbsG: 78, fatG: 14, sugarG: 3, sodiumMg: 1800 }),
    mkMeal('m4', '2026-10-14', 'breakfast', '包子', 250, 9, '', { carbsG: 30, fatG: 10, sugarG: 3, sodiumMg: 550 }),
    mkMeal('m5', '2026-10-14', 'lunch', '牛肉面', 700, 32, '', { carbsG: 74, fatG: 20, sugarG: 3, sodiumMg: 1900 }),
    mkMeal('m6', '2026-10-14', 'snack', '奶茶', 480, 3, '', { carbsG: 62, fatG: 12, sugarG: 48, sodiumMg: 200 }),
    mkMeal('m7', '2026-10-15', 'lunch', '开会订的盒饭', null, null, '没看清份量'),
    mkMeal('m8', '2026-10-16', 'dinner', '健身餐', 520, 40, '', { carbsG: 45, fatG: 12, sugarG: 4, sodiumMg: 700 }),
    mkMeal('m9', '2026-10-18', 'lunch', '火锅', 1450, 60, '', { carbsG: 45, fatG: 70, sugarG: 6, sodiumMg: 4800 }),
    mkMeal('m10', '2026-10-18', 'dinner', '没吃', 0, null),
    mkMeal('m11', '2026-10-19', 'breakfast', '燕麦+鸡蛋', 410, 21, '', { carbsG: 30, fatG: 16, sugarG: 3, sodiumMg: 260 }),
    mkMeal('m12', '2026-10-19', 'lunch', '米饭+鱼', 690, 48, '', { carbsG: 70, fatG: 14, sugarG: 2, sodiumMg: 620 })
];
const days = buildDays(dietMeals);
line('  倒序按天: ' + days.map((d) => `${d.date.slice(5)}(${d.meals.length}条/${d.kcal}kcal/蛋白${d.proteinG}g)`).join(' → '));
line('    m10 写的是 0 kcal：0 当作没估，只算条数不加数字（10-18 总数 ' + days.find((d) => d.date === '2026-10-18').kcal + '，应当只等于火锅 1450）· 那天带数字 ' + days.find((d) => d.date === '2026-10-18').counted + ' 条 / 没估 ' + days.find((d) => d.date === '2026-10-18').uncounted + ' 条');
line('    10-15 只记名字没估数: ' + JSON.stringify(days.find((d) => d.date === '2026-10-15').counted) + ' 条带数字 / ' + days.find((d) => d.date === '2026-10-15').uncounted + ' 条没估数 · 总数 ' + days.find((d) => d.date === '2026-10-15').kcal);
line('    只记了一条的天标 partial: ' + days.filter((d) => d.partial).map((d) => `${d.date.slice(5)}(${d.kcal})`).join('、') + '（应当是 10-16 的 520 和 10-18 的 1450）');
const w = rangeDiet(days, '2026-10-13', '2026-10-19');
line('  一周: 有记录天数 ' + w.days + ' · 进平均天数 ' + w.kcalDays + ' · 只记一条 ' + w.partialDays + ' 天 · 天空着 ' + w.emptyDays + ' · 平均 ' + w.avgKcal + ' kcal（应当只按 10-13/10-14/10-19 三天 =(1720+1430+1100)/3=1417，那两条单记的 520/1450 不进平均） · 蛋白 ' + w.avgProtein + ' g');
line('  逐日列表（吃页按天倒序排，不再画柱子）: ' + days.map((d) => `${d.date.slice(5)}(${d.meals.length}条/${d.kcal}kcal)`).join(' → '));
line('  口径: ' + dietScopeNote(w, '2026-10-13', '2026-10-19'));
const vJudge = verdict(w, dt);
line('  判定 tone=' + vJudge.tone + ': ' + vJudge.text);
const dtMacros = macroTargets(dt);
line('  参考: 碳水 ' + JSON.stringify(dtMacros.carbs) + ' · 脂肪 ' + JSON.stringify(dtMacros.fat) + ' · 糖 ≤' + dtMacros.sugarMax + ' · 钠 ≤' + dtMacros.sodiumMax);
line('  各项一行: ' + macroLines(w, dtMacros, dt.protein).map((l) => `${l.label} ${l.avg ?? '没记'}${l.unit} / ${l.ref}${l.flag ? ' [' + l.flag + ']' : ''}`).join(' · '));
const week0 = { avgCarbs: null, avgFat: null, avgSugar: null, avgSodium: null };
const floorWeek = { ...week0, avgKcal: 1500, avgProtein: 60, kcalDays: 4, partialDays: 1, days: 4, emptyDays: 3 };
const okWeek = { ...week0, avgKcal: dt.target ?? 2500, avgProtein: 110, kcalDays: 7, partialDays: 0, days: 7, emptyDays: 0 };
const highWeek = { ...week0, avgKcal: (dt.target ?? 2500) + 900, avgProtein: 150, kcalDays: 7, partialDays: 0, days: 7, emptyDays: 0 };
const noneWeek = { ...week0, avgKcal: null, avgProtein: null, kcalDays: 0, partialDays: 3, days: 3, emptyDays: 4 };
for (const [label, cw] of [['低于底线', floorWeek], ['刚好参考值', okWeek], ['明显偏高', highWeek], ['一条没记', noneWeek]]) {
    const j = verdict(cw, dt);
    line(`  ${label}: tone=${j.tone} · ${j.text.slice(0, 40)}…`);
}
line('  底线那条不提「惩罚/补回来」: ' + (/惩罚|补偿|罪|戒掉/.test(verdict(floorWeek, dt).text) ? '出现了，要改' : '没有'));
const legacyDiet = parseImported(JSON.stringify({ profile: base, sheets: [], setLogs: [] }));
line('  老 JSON 没有 mealLogs: 补成数组 ' + Array.isArray(legacyDiet.mealLogs) + ' · 长度 ' + legacyDiet.mealLogs.length);
const junkDiet = parseImported(JSON.stringify({
    profile: base,
    mealLogs: [
        mkMeal('keep1', '2026-10-19', 'lunch', '盒饭', null, null),
        { ...mkMeal('badSlot', '2026-10-19', 'lunch', 'x', 500, null), slot: 'midnight' },
        { ...mkMeal('badKcal', '2026-10-19', 'lunch', 'x', -5, null) },
        { ...mkMeal('badName', '2026-10-19', 'lunch', 123, 500, null) },
        null
    ]
}));
line('  结构不对的饮食条目被丢掉: 留下 ' + junkDiet.mealLogs.map((m) => m.id).join('、') + '（只剩合法的那条）');
function nut(e, key) {
    const x = e.nutrients.find((n) => n.key === key);
    return x ? `${x.low}–${x.high} ${x.unit}` : '无';
}
head('AB 本机食物参照表：对词给区间、命不上不给数、长词不重复计数');
{
    const one = estimateMeal('食堂二两米饭 + 鸡腿 + 炒青菜');
    line('  三样都命中: ' + (one ? one.items.map((h) => h.label).join(' + ') : 'null') + ' · 合计 ' + (one ? one.low + '–' + one.high + ' kcal' : '—') + '（170+150+70=390 到 210+240+150=600）· 蛋白 ' + (one ? nut(one, 'protein') : '无'));
    const bread = estimateMeal('两片全麦面包');
    line('  只算长词: ' + (bread ? bread.items.map((h) => `${h.label} ${h.low}–${h.high}`).join(' / ') : 'null') + '（不能再多出一条「面包」） · 条数 ' + (bread?.items.length ?? 0));
    const egg = estimateMeal('一个鸡蛋一个煎蛋');
    line('  鸡蛋/煎蛋各自一条: ' + (egg ? egg.items.map((h) => h.label).join(' + ') : 'null') + ' · 合计 ' + (egg ? egg.low + '–' + egg.high : '—') + '（65+95=160 到 95+140=235）');
    const coffee = estimateMeal('瑞幸生椰拿铁大杯');
    line('  「拿铁」「生椰」同一条不重复: 条数 ' + (coffee?.items.length ?? 0) + ' · ' + (coffee ? coffee.items[0].label + ' ' + coffee.low + '–' + coffee.high + ' kcal' : 'null'));
    const twice = estimateMeal('米饭米饭米饭');
    line('  同一样写了三遍: 条数 ' + (twice?.items.length ?? 0) + ' · 还是 ' + (twice ? twice.low + '–' + twice.high : 'null') + '（一条只按一份算，两份得自己乘）');
    const miss = estimateMeal('三楼那个不知道叫啥的');
    line('  表里没有: ' + miss + '（应当 null，不编一个数冒充估算）');
    line('  空名字: ' + estimateMeal('   ') + '（应当 null）');
    const hot = estimateMeal('火锅');
    line('  火锅一顿: ' + (hot ? hot.low + '–' + hot.high + ' kcal · 蛋白 ' + (hot ? nut(hot, 'protein') : '无') : 'null') + '（给区间不评判，页面措辞不看这个数下结论）');
    const bad = FOOD_HINTS.filter((h) => !(h.low > 0 && h.low < h.high && h.high <= 2000) || !h.keys.length || !h.portion);
    line('  表里区间不合法或没份量说明的条数: ' + bad.length + (bad.length ? ' → ' + bad.map((h) => h.label).join('、') : ''));
    const dupKey = FOOD_HINTS.flatMap((h) => h.keys).filter((k, i, arr) => arr.indexOf(k) !== i);
    line('  重复关键词: ' + (dupKey.length ? dupKey.join('、') : '没有'));
    line('  表一共 ' + FOOD_HINTS.length + ' 条，全部写死在本机 bundle 里，不联网');
}
head('AC 周框架：自己点哪天练、每天主练什么部位');
{
    const areaProfile = { ...base, weekdays: [1, 3, 5], dayAreas: { 3: '背' } };
    areaProfile.goal = wishToGoal(areaProfile);
    const af = buildFramework(areaProfile, areaProfile.goal);
    const backDay = af.days.find((d) => d.weekday === 3);
    const names = backDay.exerciseIds.map((i) => byId(i).name);
    const offArea = backDay.exerciseIds.filter((i) => !isPrimeFor(byId(i), '背')).map((i) => byId(i).name);
    line('  点了周三=背：role ' + backDay.role + ' · focus ' + backDay.focus + ' · 主项 ' + (byId(backDay.mainLiftId ?? '')?.name ?? '无'));
    line('  动作 ' + names.join('、') + '（主动肌不是背的：' + (offArea.join('、') || '没有，顺带练到的不算数') + '）');
    const wholeDay = af.days.find((d) => d.weekday === 5);
    line('  没点的日子照旧轮转：周五 role=' + wholeDay.role + '（' + wholeDay.focus + '）');
    const sheetDay = buildSheet(areaProfile, af, { totalMinutes: 70, yesterdayFocus: '没练', statusSelf: 3, sleepHours: 7, wantArea: null }, [], dateForRole('背', af));
    line('  这天开表：' + sheetDay.focus + '，第一行 ' + sheetDay.slots.find((s) => s.kind === 'main' || s.kind === 'compound')?.name);
    const rota = { ...base, weekdays: [1, 3, 5], dayAreas: { 1: '有氧', 3: '全身' } };
    rota.goal = wishToGoal(rota);
    const rf = buildFramework(rota, rota.goal);
    line('  有氧/全身走现成模板：' + rf.days.map((d) => `${weekdayName(d.weekday)}=${d.role}/有氧${d.cardioMin}分/主项${d.mainLiftId ? byId(d.mainLiftId).name : '无'}`).join(' · '));
    const homeArea = { ...base, homeOnly: true, commercialGym: false, weekdays: [2], dayAreas: { 2: '腿' } };
    homeArea.goal = wishToGoal(homeArea);
    const hf = buildFramework(homeArea, homeArea.goal);
    const eqs = [...new Set(hf.days[0].exerciseIds.map((i) => byId(i).equipment.join('/')))];
    line('  在家点「腿」：' + hf.days[0].exerciseIds.map((i) => byId(i).name).join('、') + ' ｜器械 ' + eqs.join('、') + '（不能有杠铃、固定器械）');
    const avoidArea = { ...base, weekdays: [1], dayAreas: { 1: '背' }, avoidNames: ['划船', '下拉', '引体', '硬拉', '飞鸟'] };
    avoidArea.goal = wishToGoal(avoidArea);
    const vf = buildFramework(avoidArea, avoidArea.goal);
    line('  把背的动作点名去掉大半：这天还是 ' + vf.days[0].role + '，剩下 ' + vf.days[0].exerciseIds.map((i) => byId(i).name).join('、'));
    const oddArea = { ...base, weekdays: [1, 3], dayAreas: { 3: '小腿' } };
    oddArea.goal = wishToGoal(oddArea);
    const of = buildFramework(oddArea, oddArea.goal);
    line('  点了库里没有的部位词（小腿，导入改过的 JSON 才会有）：这天照 ' + of.days[1].role + ' 排 · assumed 写明：' + (of.assumed.find((a) => a.includes('你点了「小腿」')) ?? '没有，要补'));
    const legacy = JSON.parse(JSON.stringify({ ...base, dayAreas: undefined }));
    const lf = buildFramework(legacy, legacy.goal ?? wishToGoal(legacy));
    line('  老档案没有 dayAreas：不报错，周一照 ' + lf.days[0].role + ' 排（' + lf.days[0].focus + '）');
    const empty = { ...base, weekdays: [], dayAreas: {} };
    const ef = buildFramework(empty, empty.goal ?? wishToGoal(empty));
    line('  一天都不点：days=' + ef.days.length + '（应当 0，不能被默认三天盖回去）· assumed 提默认星期的那条：' + (ef.assumed.some((a) => a.includes('你没选星期几')) ? '还在，错了' : '没有，符合'));
    const imported = parseImported(JSON.stringify({ profile: { ...base, dayAreas: { 1: '胸' } }, sheets: [], setLogs: [] }));
    line('  导入带 dayAreas：' + JSON.stringify(imported.profile.dayAreas));
    const junkImport = parseImported(JSON.stringify({ profile: { ...base, dayAreas: 'x' }, sheets: [], setLogs: [] }));
    line('  导入把它改成字符串：回落 ' + JSON.stringify(junkImport.profile.dayAreas) + '（空对象，UI 不会崩）');
}
head('AD 记录页的每天一格：空格也留位、口径分色');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const sqLogs = [
        { slotId: 'a', sheetId: 's', exId: 'bench-press', date: '2026-10-19', setIdx: 0, weightKg: 60, reps: 8, targetReps: 8, rpe: 8, toFailure: false, ts: '2026-10-19T10:00:00.000Z' },
        { slotId: 'a', sheetId: 's', exId: 'bench-press', date: '2026-10-19', setIdx: 1, weightKg: 60, reps: 6, targetReps: 8, rpe: 9, toFailure: false, ts: '2026-10-19T10:05:00.000Z' }
    ];
    const sqActs = [{ id: 'x1', date: '2026-10-17', name: '爬山', minutes: 90, kind: 'sport', feel: 4, areas: ['腿'], exIds: [], note: '', ts: '2026-10-17T09:00:00.000Z' }];
    const entries = buildEntries([], sqLogs, sqActs);
    const squares = daySquares(entries, '2026-10-21', 2);
    line('  14 格：' + squares.map((s) => `${s.day}/${s.tone}${s.sets ? `(${s.sets}组)` : ''}${s.cardioMin ? `(${s.cardioMin}分)` : ''}${s.future ? '(未到)' : ''}[${s.parts.join('+') || '-'}]`).join(' '));
    want('两周整 14 格，空格也留着', String(squares.length), '14');
    want('一格一周：首格是周一', squares[0].dayName + '/' + String(squares[0].col), '周一/0');
    want('末格排到本周日', squares.at(-1).date + '/' + squares.at(-1).dayName, '2026-10-25/周日');
    want('列号就是周一到周日的第几列', squares.map((s) => s.col).join(''), '01234560123456');
    want('今天之前的一格都不算没到', String(squares.filter((s) => !s.future).length), '10');
    want('10-22 到 10-25 这四天标成还没到', squares.filter((s) => s.future).map((s) => s.day).join('+'), '22+23+24+25');
    want('没到的日子照样占位、不变成有记录', squares.filter((s) => s.future && s.tone === 'none').length + '/' + squares.filter((s) => s.future && s.hasRecord).length, '4/0');
    line('  天数 ' + squares.length + '（含 10-18/20/21 这种真没记的空格）· 有记录 ' + squares.filter((s) => s.hasRecord).length + ' 格');
    const empty2 = daySquares(buildEntries([], [], []), '2026-10-21', 1);
    line('  一条记录都没有：' + empty2.map((s) => s.tone).join(',') + '（全 none，格子不消失）');
    want('整整一周从周一排到周日', empty2[0].dayName + '→' + empty2.at(-1).dayName + '/' + String(empty2.length), '周一→周日/7');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AG 每天一格上的部位名：折成大类、只留两个 · 空格和纯有氧不许硬凑');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const agLogs = [
        mkLog('bench-press', '2026-10-19', 0, 60, 8, 8, 0),
        mkLog('bench-press', '2026-10-19', 1, 60, 6, 9, 5),
        mkLog('back-squat', '2026-10-18', 0, 100, 5, 8, 0),
        mkLog('back-squat', '2026-10-18', 1, 100, 5, 8, 6),
        mkLog('back-squat', '2026-10-18', 2, 100, 4, 9, 12)
    ];
    const agActs = [
        { id: 'ag1', date: '2026-10-17', name: '江边慢跑', minutes: 40, kind: 'cardio', feel: 3, areas: [], exIds: [], note: '', ts: '2026-10-17T18:00:00.000Z' },
        { id: 'ag2', date: '2026-10-16', name: '哑铃自己练了半小时', minutes: 30, kind: 'lift', feel: null, areas: ['肩', '核心'], exIds: [], note: '', ts: '2026-10-16T20:00:00.000Z' },
        { id: 'ag3', date: '2026-10-15', name: '打球', minutes: 60, kind: 'sport', feel: null, areas: [], exIds: [], note: '', ts: '2026-10-15T09:00:00.000Z' }
    ];
    const agEntries = buildEntries([], agLogs, agActs);
    const push = agEntries.find((e) => e.date === '2026-10-19');
    const squat = agEntries.find((e) => e.date === '2026-10-18');
    want('卧推那天折成 胸 + 肩（三角前束归肩，核心不进格子）', push.parts.join('/'), '胸/肩');
    want('深蹲那天折成 大腿 + 臀（股四头、腘绳都算大腿）', squat.parts.join('/'), '大腿/臀');
    want('一天最多两个部位，格子才写得下', String(push.parts.length), '2');
    const manual = agEntries.find((e) => e.date === '2026-10-16');
    want('手记时点了部位 → 格子上写的就是那两个', manual.parts.join('/'), '肩/核心');
    want('手记自己点的核心不会被词表当成顺带练的丢掉', String(manual.parts.includes('核心')), 'true');
    const agSquares = daySquares(agEntries, '2026-10-19', 2);
    want('没记的日子 parts 是空数组', JSON.stringify(agSquares.find((s) => s.tone === 'none').parts), '[]');
    const cardioSq = agSquares.find((s) => s.date === '2026-10-17');
    want('纯有氧的日子不硬凑部位', cardioSq.parts.length + '/' + cardioSq.tone, '0/done');
    want('格子上直接写出手记时点的那两个部位', agSquares.find((s) => s.date === '2026-10-16').parts.join('+'), '肩+核心');
    line('  格子内容：' + agSquares.map((s) => `${Number(s.day)}日 ${s.tone} [${s.parts.join('+') || '-'}] ${s.sets}组/${s.cardioMin}分`).join(' · '));
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AH 容量三档留在引擎里 + 自由训练（不选目标）：界面不问分钟、不问档位、不问状态');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const d = dateForRole('推');
    const cap = (c) => buildSheet(base, fw, { ...allSkip, capacity: c, wantArea: null }, [], d);
    const sSmall = cap('small');
    const sMed = cap('medium');
    const sLarge = cap('large');
    want('小这一档的内部工作量', String(sSmall.budgetMinutes), '32');
    want('中这一档', String(sMed.budgetMinutes), '48');
    want('大这一档', String(sLarge.budgetMinutes), '68');
    want('小档读回来的档位', capacityOf(sSmall), 'small');
    want('大档读回来的档位', capacityOf(sLarge), 'large');
    const nSmall = sSmall.slots.filter((x) => x.setPlan.length).length;
    const nLarge = sLarge.slots.filter((x) => x.setPlan.length).length;
    want('小档塞的力量行数不超过大档', nSmall <= nLarge ? 'ok' : 'no', 'ok');
    line(`  力量行数：小 ${nSmall} / 中 ${sMed.slots.filter((x) => x.setPlan.length).length} / 大 ${nLarge}`);
    line('  小档砍项：' + (sSmall.dropped.join(' / ') || '无'));
    const legacy = buildSheet(base, fw, { ...allSkip, totalMinutes: 30, capacity: 'large' }, [], d);
    want('老数据里的 30 分钟优先于新选的大档', String(legacy.budgetMinutes), '30');
    want('30 分钟折回档位', capacityOf(legacy), 'small');
    const fromProfile = buildSheet(base, fw, { ...allSkip, totalMinutes: null, capacity: null }, [], d);
    want('没选档位时按档案 sessionMinutes 90 折成大档', capacityOf(fromProfile), 'large');
    want('档位是内部算的，不再写成一条「我补的默认」', fromProfile.assumed.some((a) => a.includes('练多大量')) ? 'yes' : 'no', 'no');
    want('自由训练的周主题', currentWeek(null, d).theme, '自由训练 · 不递进');
    const freeChest = buildSheet(base, null, { ...allSkip, capacity: 'medium', wantArea: '胸' }, [], d);
    const freeMain = freeChest.slots.find((x) => x.kind === 'main');
    want('自由训练点名胸：主项练的是胸', freeMain && /胸/.test(freeMain.muscles.join('')) ? 'chest' : 'no', 'chest');
    want('自由训练的表里没有减量周说明', freeChest.flags.some((f) => f.includes('减量')) ? 'yes' : 'no', 'no');
    want('自由训练会写明没有周框架', freeChest.assumed.some((a) => a.includes('自由训练') || a.includes('训练日')) ? 'yes' : 'no', 'yes');
    line('  自由训练·胸 顺序：' + freeChest.slots.map((x) => `${x.kind}:${x.name}`).join(' → '));
    freeChest.assumed.forEach((a) => line('  补的默认：' + a));
    const freeBare = buildSheet(base, null, allSkip, [], nextRestDay(fw.startDate));
    want('自由训练什么都没点 → 恢复日表', freeBare.focus, '恢复日');
    want('并且告诉你怎么才有力量行', freeBare.flags.some((f) => f.includes('想练力量就点一个或几个部位')) ? 'yes' : 'no', 'yes');
    line('  恢复日旗标：' + freeBare.flags.join(' / '));
    const freeHome = { ...base, commercialGym: false, homeOnly: true };
    const sHome = buildSheet(freeHome, null, { ...allSkip, capacity: 'small', wantArea: '腿' }, [], d);
    const badWeight = sHome.slots.filter((x) => x.setPlan.some((p) => !Number.isFinite(p.weightKg ?? 0)));
    want('自由训练 + 只在家：重量不出现 NaN', badWeight.length ? badWeight.map((x) => x.name).join('、') : 'none', 'none');
    const withLogs = [mkLog(freeChest.slots.find((x) => x.setPlan.length).exId, '2026-10-01', 0, 60, 8, 8, 0)];
    const swappedFree = swapSlotExercise(base, null, freeChest, freeChest.slots[0].id, 'incline-dumbbell-press', withLogs, []);
    want('自由训练里换动作不炸、记录还在', String(swappedFree.slots.length > 0 && withLogs.length), '1');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AJ 今天练哪里可以多选 · 档位/状态/睡眠/昨天四个老问题不再问 · 手记点的部位算昨天练过');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    want('多选原样读出来', wantAreasOf({ ...allSkip, wantArea: '胸', wantAreas: ['胸', '背', '腿'] }).join('/'), '胸/背/腿');
    want('老数据只有 wantArea，也读成一个', wantAreasOf({ ...allSkip, wantArea: '背' }).join('/'), '背');
    want('重复点的只算一次', wantAreasOf({ ...allSkip, wantArea: '胸', wantAreas: ['胸', '胸', '背'] }).join('/'), '胸/背');
    want('「不指定」不算选中', String(wantAreasOf({ ...allSkip, wantArea: '不指定', wantAreas: ['不指定'] }).length), '0');
    want('界面上不传的那几项，读出来是空', String(wantAreasOf({ ...allSkip }).length), '0');
    const d = dateForRole('推');
    const covered = (sh, areas) => areas.filter((a) => sh.slots.some((s) => s.exId && isPrimeForAny(byId(s.exId), [a]))).join('/');
    const two = buildSheet(base, fw, { ...allSkip, capacity: 'large', wantArea: '胸', wantAreas: ['胸', '背'] }, [], d);
    want('多选的两个部位一起写进旗标', two.flags.some((f) => f.includes('今天你说练「胸、背」')) ? 'yes' : 'no', 'yes');
    want('两个部位都真的排进了表', covered(two, ['胸', '背']), '胸/背');
    want('说的部位名和点的顺序一致', two.flags.find((f) => f.includes('今天你说练「'))?.split('「')[1].split('」')[0] ?? '无', '胸、背');
    const restDay = nextRestDay(fw.startDate);
    const madeTwo = buildSheet(base, fw, { ...allSkip, capacity: 'medium', wantArea: '腿', wantAreas: ['肩', '核心'] }, [], restDay);
    want('休息日点两个部位 → 按这两个现排，框架没动', madeTwo.focus, '按肩、核心现排');
    want('现排这张表两个部位都有', String(covered(madeTwo, ['肩', '核心']).split('/').length), '2');
    const bare = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], d);
    want('什么都不填：不再写「没选练多大量」这种补的默认', bare.assumed.some((a) => /练多大量|状态自评|昨晚睡|睡眠/.test(a)) ? 'yes' : 'no', 'no');
    want('什么都不填：不说你没到冲组标准', bare.flags.some((f) => f.includes('没到能冲组的标准')) ? 'yes' : 'no', 'no');
    want('什么都不填：主项照样按档案重量推', String(bare.slots.filter((s) => s.setPlan.length).length > 0 ? 'ok' : 'no'), 'ok');
    const lowSleep = buildSheet({ ...base, sleepHours: 5 }, fw, { ...allSkip, capacity: 'medium' }, [], d);
    want('档案平常睡 5 小时 → 主项自动降，并说清是按档案', lowSleep.flags.some((f) => f.includes('睡 5 小时（档案里的平常值）') && f.includes('下调')) ? 'yes' : 'no', 'yes');
    want('降载原因里不再出现「状态自评」', lowSleep.flags.some((f) => f.includes('状态自评')) ? 'yes' : 'no', 'no');
    const legacyState = buildSheet(base, fw, { ...allSkip, capacity: 'medium', statusSelf: 2, sleepHours: 5 }, [], d);
    want('老数据里填过自评 2 / 睡 5，这条判照旧生效', legacyState.flags.some((f) => f.includes('状态自评 2 / 睡 5 小时')) ? 'yes' : 'no', 'yes');
    const mainSets = (sh) => String(sh.slots.find((s) => s.kind === 'main')?.setPlan.length ?? 0);
    const yesterday = addDaysIso(d, -1);
    const withYday = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [mkLog('bench-press', yesterday, 0, 60, 8, 8, 0)], d);
    want('昨天记过胸的组 → 今天主项少一组', mainSets(withYday), String(Number(mainSets(bare)) - 1));
    want('并且说清是根据你昨天的记录', withYday.flags.some((f) => f.includes('昨天你记过今天这些部位')) ? 'yes' : 'no', 'yes');
    want('昨天没记 → 不多这一句', bare.flags.some((f) => f.includes('昨天你记过')) ? 'yes' : 'no', 'no');
    const ydayAct = {
        id: 'aj-act', date: yesterday, name: '哑铃自己练了半小时', minutes: 30, kind: 'lift', feel: null, areas: ['胸'], exIds: [], note: '', ts: yesterday + 'T20:00:00.000Z'
    };
    const withYdayAct = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], d, { acts: [ydayAct] });
    want('昨天只是手记一条并点了胸 → 今天主项同样少一组', mainSets(withYdayAct), String(Number(mainSets(bare)) - 1));
    want('手记那条也走同一句旗标', withYdayAct.flags.some((f) => f.includes('昨天你记过今天这些部位')) ? 'yes' : 'no', 'yes');
    const ydayLegAct = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], d, { acts: [{ ...ydayAct, areas: ['腿'] }] });
    want('昨天手记点的是腿 → 练胸这天不少组', mainSets(ydayLegAct), mainSets(bare));
    const swapFromAct = swapSlotExercise(base, fw, withYdayAct, withYdayAct.slots.find((s) => s.kind === 'main').id, 'incline-db-press', [], [], [ydayAct]);
    want('换一次动作后这句话还在，部位没丢', swapFromAct.flags.some((f) => f.includes('昨天你记过今天这些部位')) ? 'yes' : 'no', 'yes');
    const homeTwo = buildSheet({ ...base, commercialGym: false, homeOnly: true }, null, { ...allSkip, capacity: 'medium', wantArea: '腿', wantAreas: ['腿', '臀'] }, [], d);
    const bad = homeTwo.slots.filter((s) => s.setPlan.some((p) => !Number.isFinite(p.weightKg ?? 0)));
    want('在家多选两个部位也不出 NaN 重量', bad.length ? bad.map((s) => s.name).join('、') : 'none', 'none');
    line('  多选·胸背 顺序：' + two.slots.map((x) => `${x.kind}:${x.name}×${x.setPlan.length}`).join(' → '));
    line('  昨天连练旗标：' + (withYday.flags.find((f) => f.includes('昨天你记过')) ?? '无'));
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AI 今天自由练（有目标也能切）+ 手动记的运动和普通记录一个色：自由练不动框架');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const d = dateForRole('推');
    const byFw = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], d);
    const freeToday = buildSheet(base, null, { ...allSkip, capacity: 'medium', wantArea: '胸', free: true }, [], d);
    want('选了自由练：说的是「没按周框架排」而不是「没设目标」', freeToday.assumed.some((a) => a.includes('这次是自由训练，没按你的周框架排')) ? 'yes' : 'no', 'yes');
    want('自由练这张表不写没设目标', freeToday.assumed.concat(freeToday.flags).some((a) => a.includes('没设训练目标')) ? 'yes' : 'no', 'no');
    want('自由练不排减量周', freeToday.flags.some((f) => f.includes('减量')) ? 'yes' : 'no', 'no');
    want('按周框架那张不写自由训练', byFw.assumed.some((a) => a.includes('自由训练')) ? 'yes' : 'no', 'no');
    want('两张表的工作量一样（自由练不偷改量）', String(freeToday.budgetMinutes), String(byFw.budgetMinutes));
    line('  框架表主项：' + (byFw.slots.find((x) => x.kind === 'main')?.name ?? '无') + ' / 自由练主项：' + (freeToday.slots.find((x) => x.kind === 'main')?.name ?? '无'));
    const freeRest = buildSheet(base, null, allSkip, [], nextRestDay(fw.startDate));
    want('自由练什么都没点：旗标不再说没设目标', freeRest.flags.some((f) => f.includes('这次自由训练没选练哪里也没挑动作')) ? 'yes' : 'no', 'yes');
    const dayIso = '2026-10-18';
    const liftAct = { id: 'ai1', date: dayIso, name: '哑铃自己练了半小时', minutes: 30, kind: 'lift', feel: null, areas: ['胸', '手臂'], exIds: [], note: '', ts: dayIso + 'T20:00:00.000Z' };
    const onlyLift = daySquares(buildEntries([], [], [liftAct]), '2026-10-19', 3).find((s) => s.date === dayIso);
    want('手动记的一条自己练也能让格子变色，和不手动记的同一个色', onlyLift.tone, 'done');
    want('格子上写得出自己点的部位', onlyLift.parts.join('+'), '胸+手臂');
    want('格子数得出手动记的条数（分钟不再上格子）', String(onlyLift.actCount) + '/' + String(onlyLift.cardioMin), '1/0');
    const bothActs = [
        liftAct,
        { id: 'ai2', date: '2026-10-16', name: '江边慢跑', minutes: 45, kind: 'cardio', feel: null, areas: [], exIds: [], note: '', ts: '2026-10-16T07:00:00.000Z' }
    ];
    const sq = daySquares(buildEntries([], [mkLog('bench-press', '2026-10-18', 0, 60, 8, 8, 0)], bothActs), '2026-10-19', 7);
    want('记了组又手动加一条 → 还是同一个色，不区分', sq.find((s) => s.date === '2026-10-18').tone, 'done');
    want('纯有氧的手动记还是带得出分钟', String(sq.find((s) => s.date === '2026-10-16').cardioMin), '45');
    want('手动记 30 分钟算一次练过', String(rangeStats(buildEntries([], [], [liftAct]), '2026-10-12', '2026-10-19').sessions), '1');
    want('只记 8 分钟也算练过：这条现在根本不问时长', String(rangeStats(buildEntries([], [], [{ ...liftAct, minutes: 8 }]), '2026-10-12', '2026-10-19').sessions), '1');
    want('一分钟都没记的那条照样算练过一次', String(rangeStats(buildEntries([], [], [{ ...liftAct, minutes: 0 }]), '2026-10-12', '2026-10-19').sessions), '1');
    want('近 7 天统计给条数（分钟不再是主口径）', String(rangeStats(buildEntries([], [], bothActs), '2026-10-12', '2026-10-19').acts), '2');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AK 记录里选动作：部位按动作折、有氧看动作、老记录照旧、库外的名字留着');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const mkAct = (id, date, name, minutes, over = {}) => ({
        id,
        date,
        name,
        minutes,
        kind: 'other',
        feel: null,
        areas: [],
        exIds: [],
        note: '',
        ts: `${date}T10:00:00.000Z`,
        ...over
    });
    const squatDay = buildEntries([], [], [mkAct('k1', '2026-10-20', '杠铃后蹲', 40, { exIds: ['back-squat'], kind: 'lift' })])[0];
    want('只选了动作、没点部位 → 部位按动作的肌肉折', squatDay.parts.join('/'), '大腿/臀');
    want('力量动作不进攻氧分钟', String(squatDay.cardioMin), '0');
    const rowDay = buildEntries([], [], [mkAct('k2', '2026-10-20', '椭圆机', 30, { exIds: ['elliptical'], kind: 'cardio' })])[0];
    want('选了有氧动作 → 算进有氧分钟', String(rowDay.cardioMin), '30');
    want('有氧动作的「心肺」不硬凑部位，格子照样变色', rowDay.parts.length + '/' + daySquares([rowDay], '2026-10-20', 1).find((s) => s.date === '2026-10-20').tone, '0/done');
    const oldDay = buildEntries([], [], [mkAct('k3', '2026-10-19', '江边慢跑', 50, { kind: 'cardio' })])[0];
    want('老记录没选动作，还是按 kind 判有氧', oldDay.cardioMin + '/' + oldDay.parts.length, '50/0');
    const ballDay = buildEntries([], [], [mkAct('k4', '2026-10-18', '羽毛球双打', 60, { areas: ['腿'] })])[0];
    want('库里没有的照样写名字，部位用点的', ballDay.title + '/' + ballDay.parts.join('/'), '羽毛球双打/腿');
    const kd = dateForRole('推');
    const mainSets = (sh) => String(sh.slots.find((s) => s.kind === 'main')?.setPlan.length ?? 0);
    const bareHere = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], kd);
    const actBench = mkAct('k5', addDaysIso(kd, -1), '杠铃卧推', 30, { exIds: ['bench-press'], kind: 'lift' });
    const withAct = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], kd, { acts: [actBench] });
    want('昨天只选了练胸的动作（没点部位）→ 今天主项少一组', mainSets(withAct), String(Number(mainSets(bareHere)) - 1));
    want('旗标还是那一句', withAct.flags.some((f) => f.includes('昨天你记过今天这些部位')) ? 'yes' : 'no', 'yes');
    const actSquat = mkAct('k6', addDaysIso(kd, -1), '杠铃后蹲', 30, { exIds: ['back-squat'], kind: 'lift' });
    want('昨天选的是腿的动作 → 练胸这天不少组', mainSets(buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], kd, { acts: [actSquat] })), mainSets(bareHere));
    const dirty = parseImported(JSON.stringify({
        profile: base,
        activityLogs: [
            mkAct('k7', '2026-10-10', '自己练的', 20, { areas: ['胸', '腰'], exIds: ['bench-press', 'nope-999'] })
        ]
    }));
    want('词表外的部位丢掉、库里没有的动作 id 丢掉', JSON.stringify(dirty.activityLogs[0].areas) + '/' + JSON.stringify(dirty.activityLogs[0].exIds), '["胸"]/["bench-press"]');
    const legacy = parseImported(JSON.stringify({ profile: base, activityLogs: [mkAct('k8', '2026-10-10', '走路', 20)] }));
    want('老存档缺 areas/exIds 一律补成空数组', JSON.stringify(legacy.activityLogs[0].areas) + JSON.stringify(legacy.activityLogs[0].exIds), '[][]');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AL 一次训练里每一行都可练可不练：标记留得住、不进分母');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const sd = dateForRole('推');
    const made = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], sd);
    const head0 = made.slots[0].id;
    const marked = buildSheet(base, fw, { ...allSkip, capacity: 'medium' }, [], sd, { skipped: [head0, 'nope-not-here'] });
    want('标了的行留在表上，表上已经没有的 id 丢掉', JSON.stringify(marked.skipped), JSON.stringify([head0]));
    want('不练不改变排出来的动作和组数（行还在，只是不记）', String(marked.slots.length), String(made.slots.length));
    const swapped = swapSlotExercise(base, fw, marked, marked.slots[1].id, 'incline-db-press', [], [], [], [head0]);
    want('换一次动作后标记还在', JSON.stringify(swapped.skipped), JSON.stringify([head0]));
    const cardioSlot = {
        id: 'cardio-0', kind: 'cardio', exId: null, name: '有氧', muscles: [], equipment: '', startSec: 900,
        durationSec: 1200, sets: 0, restSec: 0, setPlan: [], prIntent: false, note: '踩 20 分钟单车', cautionNote: ''
    };
    const skipSheet = (skipped) => {
        const s = mkSheet('2026-10-19', 3);
        return { ...s, slots: [...s.slots, cardioSlot], skipped };
    };
    const twoSets = [mkLog('bench-press', '2026-10-19', 0, 60, 8, 8, 0), mkLog('bench-press', '2026-10-19', 1, 60, 8, 8, 5)];
    const plain = buildEntries([skipSheet([])], twoSets, [])[0];
    const offMain = buildEntries([skipSheet(['lift-0'])], twoSets, [])[0];
    const offCardio = buildEntries([skipSheet(['cardio-0'])], twoSets, [])[0];
    want('没标不练：分母是表上全部组数', `${plain.plannedSets}/${plain.completion}`, '3/67');
    want('标了不练：那行的组不进分母，别硬判你做不完', `${offMain.plannedSets}/${offMain.completion}`, '0/null');
    want('不练的有氧行不再算成「表上排了有氧」', `${offCardio.plannedCardioMin}/${offCardio.completion}`, '0/67');
    want('不练的行的组照样能记（不误删已有记录）', String(offMain.setCount), '2');
    const legacy = parseImported(JSON.stringify({ profile: base, sheets: [{ ...skipSheet([]), skipped: undefined }] }));
    want('老存档的表没有 skipped → 补成空数组', JSON.stringify(legacy.sheets[0].skipped), '[]');
    const bogus = parseImported(JSON.stringify({ profile: base, sheets: [{ ...skipSheet(['ghost-1', 'lift-0']), skipped: ['ghost-1', 'lift-0'] }] }));
    want('手改的表里标了不在表上的行 → 丢掉', JSON.stringify(bogus.sheets[0].skipped), '["lift-0"]');
    line('  表上的行：' + made.slots.map((x) => `${x.id}:${x.name}`).join(' · '));
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AN 你加的必定排进去：点的动作一个不少、点的部位都有、有氧一个一行、超了也不解释');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const yes = (label, on, exp) => want(label, on ? 'yes' : 'no', exp);
    const d = dateForRole('推');
    const rd = nextRestDay(fw.startDate);
    const onSheet = (sh, id) => sh.slots.some((s) => s.exId === id);
    const allText = (sh) => sh.flags.concat(sh.assumed, sh.dropped).join(' ');
    const usedMin = (sh) => Math.round(sh.slots.reduce((a, s) => a + s.durationSec, 0) / 60);
    const hasPrime = (sh, a) => sh.slots.some((s) => s.exId && isPrimeFor(byId(s.exId), a));
    // 最小的一档 + 点 5 个力量动作：以前会砍到你点的这些，现在一行不少
    const many = ['db-fly', 'crunch', 'reverse-lunge', 'hip-bridge', 'preacher-curl'];
    const small = buildSheet(base, fw, { ...allSkip, capacity: 'small' }, [], d, { picked: many });
    want('小档点 5 个：5 个都在表上', String(many.filter((id) => onSheet(small, id)).length), '5');
    const smallNames = many.map((id) => byId(id).name);
    yes('砍项里找不到你点的那几个动作', smallNames.some((n) => small.dropped.some((t) => t.includes(n))), 'no');
    yes('也没有「你点的动作…先减到 2 组」这种兜底', small.dropped.some((t) => t.includes('你点的动作')), 'no');
    yes('超了也不报时长、不说「还有空」', small.flags.some((f) => f.includes('分钟长') || f.includes('还有空')), 'no');
    yes('也不解释你点的动作是怎么排进来的', small.flags.some((f) => f.includes('动作」页点了')), 'no');
    line(`  小档：预算 ${small.budgetMinutes} 分 · 表做到 ${usedMin(small)} 分 · 砍项 ${small.dropped.length} 条 · 旗标 ${small.flags.length} 条`);
    yes('不再让你「撤掉几个自己点的动作」', allText(small).includes('撤掉几个自己点的动作'), 'no');
    yes('不再出现「别硬塞」', allText(small).includes('别硬塞'), 'no');
    yes('不再出现「装不下这张表的最小结构」', allText(small).includes('装不下这张表的最小结构'), 'no');
    // 多选部位：框架日 40 分钟点三个部位，每个部位都得有主要练它的动作
    const areas = ['胸', '背', '手臂'];
    const three = buildSheet(base, fw, { ...allSkip, totalMinutes: 40, wantAreas: areas }, [], d);
    want('40 分钟的推日点胸/背/手臂：三个部位都排到了动作', areas.filter((a) => hasPrime(three, a)).join('/'), '胸/背/手臂');
    yes('这句话不再让你少选部位', allText(three).includes('少选一个练的部位'), 'no');
    yes('补动作时不再说「只补这一个」', allText(three).includes('只补这一个'), 'no');
    // 休息日（不是训练日）点四个部位：现排的这张表也要覆盖到每个部位
    const fourAreas = ['胸', '背', '腿', '肩'];
    const four = buildSheet(base, fw, { ...allSkip, totalMinutes: 40, wantAreas: fourAreas }, [], rd);
    want('休息日 40 分钟点四个部位：都有动作', fourAreas.filter((a) => hasPrime(four, a)).join('/'), '胸/背/腿/肩');
    line('  休息日这张表：' + four.slots.filter((s) => s.setPlan.length).map((s) => `${s.name}[${s.kind}]`).join(' → '));
    // 点的有氧：一个动作一行，不再「一张表只有一行有氧，其余自己换」
    const twoCardio = buildSheet(base, fw, { ...allSkip, totalMinutes: 60 }, [], d, { picked: ['jump-rope', 'rower'] });
    want('点两个有氧 → 表上有两行有氧', String(twoCardio.slots.filter((s) => s.kind === 'cardio').length), '2');
    want('两个有氧都在表上', ['jump-rope', 'rower'].filter((id) => onSheet(twoCardio, id)).join('/'), 'jump-rope/rower');
    yes('两行有氧都没被砍掉或减分钟', twoCardio.dropped.some((t) => /跳绳|划船机/.test(t)), 'no');
    yes('不再说「一张表只有一行有氧」', allText(twoCardio).includes('一张表只有一行有氧'), 'no');
    line('  两行有氧：' + twoCardio.slots.filter((s) => s.kind === 'cardio').map((s) => s.name).join(' ｜ '));
    // 重排路径（换动作、标不练）也要把你点的带着
    const swapped = swapSlotExercise(base, fw, small, 'lift-0', 'incline-db-press', [], many);
    want('换一次动作后你点的 5 个还在', String(many.filter((id) => onSheet(swapped, id)).length), '5');
    const reskipped = buildSheet(base, fw, small.input, [], small.date, { picked: many, skipped: ['warmupGeneral'] });
    want('标了不练之后点的一样不缺', String(many.filter((id) => onSheet(reskipped, id)).length), '5');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AM 记一条运动不再问时长：0 分钟合法、格子照样变色、记录里不带 RPE 后缀');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const T2 = '2026-10-21';
    const ago2 = (n) => addDaysIso(T2, -n);
    const bareRec = (id, date, over = {}) => ({
        id, date, name: '练了一场', minutes: 0, kind: 'other', feel: null, areas: [], exIds: [], note: '', ts: `${date}T09:00:00.000Z`, ...over
    });
    const imported = parseImported(JSON.stringify({ profile: base, activityLogs: [bareRec('m1', ago2(2)), bareRec('m2', ago2(3), { minutes: -5 })] }));
    want('0 分钟的一条收得下（记这条不问多久了）', String(imported.activityLogs.length), '1');
    want('负数分钟仍然不收', String(imported.activityLogs.some((a) => a.minutes < 0)), 'false');
    const sq = daySquares(buildEntries([], [], [bareRec('m3', T2)]), T2, 2).find((s) => s.date === T2);
    want('只有 0 分钟的记录也让格子变色，并算一条', sq.tone + '/' + sq.actCount, 'done/1');
    want('名字没填就用「练了一场」，格子上不硬凑部位', sq.parts.length + '·', '0·');
    const rpeRow = buildEntries([], [mkLog('bench-press', '2026-10-12', 0, 60, 8, 7, 0)], [])[0].lines[0];
    want('记录里每组只写重量×次数，不再冒出 @7 那种后缀', rpeRow.perSet.join(','), '60kg×8');
    const stale = parseImported(JSON.stringify({ profile: base, onboardingDone: true, askTurns: [{ id: 'x', question: '腰围没变，问题在哪' }] }));
    want('「问」删了：老存档里那坨对话历史不再被读进状态', String(JSON.stringify(stale).includes('askTurns')), 'false');
    want('删字段没把有用的弄丢（onboardingDone 还认）', String(stale.onboardingDone), 'true');
    want('导出的 JSON 里也没有 askTurns', String(exportJson({ ...initialState(), ...stale }).includes('askTurns')), 'false');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AO 直接开始使用：不生成清单，表上只有你自己点的动作');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const d = dateForRole('推');
    const input = { ...allSkip, direct: true };
    const empty = buildSheet(base, fw, input, [], d, { picked: [] });
    want('没点动作：一行都没有', String(empty.slots.length), '0');
    want('focus 是直接开始', empty.focus, '直接开始');
    want('不写「不在训练日」「补的默认」那一堆', String(empty.assumed.length), '0');
    want('也不给一张恢复日表（有氧 + 核心）', empty.slots.some((s) => s.kind === 'cardio') ? 'yes' : 'no', 'no');
    const some = buildSheet(base, fw, input, [], d, { picked: ['db-fly', 'crunch', 'jump-rope'] });
    want('点了三个：就这三行', some.slots.map((s) => s.kind).join('/'), 'isolation/isolation/cardio');
    want('没有热身、活动度、放松', some.slots.some((s) => /warmup|cooldown/.test(s.kind)) ? 'yes' : 'no', 'no');
    want('有周框架也不排框架那天的动作', some.slots.some((s) => s.exId === 'bench-press') ? 'yes' : 'no', 'no');
    want('direct 写在 input 上', String(some.input.direct), 'true');
    const swapped = swapSlotExercise(base, fw, some, some.slots[0].id, 'incline-db-press', [], ['db-fly', 'crunch', 'jump-rope']);
    want('换动作后还是 direct、还是三行', `${swapped.input.direct}/${swapped.slots.length}`, 'true/3');
    want('换完表上仍只有你点的那几个', swapped.slots.map((s) => s.exId).join('/'), 'incline-db-press/crunch/jump-rope');
    const home = { ...base, homeOnly: true, commercialGym: false };
    const blocked = buildSheet(home, fw, input, [], d, { picked: ['hack-squat'] });
    want('器械不符的点选照样不排进来', String(blocked.slots.length), '0');
    want('但要说清为什么少了这一项', blocked.flags.some((f) => f.includes('没排进表')) ? 'yes' : 'no', 'yes');
    const withArea = buildSheet(base, fw, { ...input, wantArea: '胸', wantAreas: ['胸'] }, [], d, { picked: [] });
    want('直接开始不替你按部位现排', String(withArea.slots.length), '0');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AP 吃页的食物营养表：搜得到名字也搜得到别名、每条都写清一份');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    want('空输入给整表', String(searchFoods('').length), String(FOOD_HINTS.length));
    want('搜「米饭」出米饭和自热米饭', searchFoods('米饭').map((h) => h.label).join('/'), '米饭/自热米饭');
    want('搜「鸡胸」出鸡胸肉那条', searchFoods('鸡胸')[0]?.label ?? '无', '鸡胸肉');
    want('搜别名也命中：泡面 → 方便面', searchFoods('泡面').map((h) => h.label).join('/'), '方便面');
    want('搜一个词命中多条：面', String(searchFoods('面').length > 1), 'true');
    line('  「面」命中：' + searchFoods('面').map((h) => h.label).join('、'));
    const odd = searchFoods('螺蛳粉汤底');
    line('  「螺蛳粉汤底」命中：' + odd.map((h) => h.label).join('、'));
    want('表里没有的东西不给假条目', String(searchFoods('维生素泡腾片').length), '0');
    want('每条都有份量说明', String(FOOD_HINTS.every((h) => h.portion.length > 0)), 'true');
    want('每条都是 low ≤ high', String(FOOD_HINTS.every((h) => h.low <= h.high)), 'true');
    want('带蛋白的都写在区间里', String(FOOD_HINTS.every((h) => !h.protein || h.protein[0] <= h.protein[1])), 'true');
    want('名字不重复', String(new Set(FOOD_HINTS.map((h) => h.label)).size), String(FOOD_HINTS.length));
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AQ 三份「一天吃这么多」：热量对得上参考值、蛋白进区间、克数不为负');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const t = dietTargets(base);
    const plans = mealPlans(t);
    const show = (label, p) => line(`  ${label} ${p.title}：${p.kcal} kcal / 蛋白 ${p.protein} g —— ` + p.items.map((it) => `${it.slot[0]}${it.name}${it.grams}g`).join(' '));
    plans.forEach((p) => show('方案', p));
    want('正好三份', String(plans.length), '3');
    want('三份主食不一样', plans.map((p) => p.title).join('/'), '米饭/面条/馒头 + 红薯');
    want('方案一的主食用米饭', String(plans[0].items.some((it) => it.name === '米饭（熟）' && it.grams > 0)), 'true');
    want('方案二的主食用面条', String(plans[1].items.some((it) => it.name === '面条（干）' && it.grams > 0)), 'true');
    want('每份都有早餐和午餐和晚餐', plans.map((p) => ['breakfast', 'lunch', 'dinner'].every((s) => p.items.some((it) => it.slot === s)) + '').join(','), 'true,true,true');
    for (const p of plans) {
        want(`${p.title}：热量落在参考值 ±60 kcal`, String(Math.abs(p.kcal - t.target) <= 60), 'true');
        want(`${p.title}：蛋白进 1.2–1.6 g/kg 再加 10 g 余量`, String(p.protein >= t.protein[0] - 10 && p.protein <= t.protein[1] + 10), 'true');
        want(`${p.title}：克数全是正数、没有 NaN`, String(p.items.every((it) => Number.isFinite(it.grams) && it.grams > 0)), 'true');
        want(`${p.title}：条目热量加起来等于总热量`, String(p.items.reduce((n, it) => n + it.kcal, 0)), String(p.kcal));
    }
    want('顿数里的主食加米饭碗数说得出来', String(plans[0].items.filter((it) => it.name === '米饭（熟）')[0].scale.startsWith('≈')), 'true');
    const small = { ...base, sex: 'female', age: 24, heightCm: 160, weightKg: 52, goal: wishToGoal({ ...base, sex: 'female', weightKg: 52, heightCm: 160, goalWish: '减脂' }) };
    const ts = dietTargets(small);
    const ps = mealPlans(ts);
    line('  52kg 女 / 减脂：参考 ' + ts.target + ' kcal · 蛋白 ' + ts.protein?.join('–') + ' g');
    ps.forEach((p) => show('小档案', p));
    want('小档案照样三份', String(ps.length), '3');
    want('小档案不吃穿底线', String(ps.every((p) => p.kcal >= ts.floor - 60)), 'true');
    want('小档案的主食不会被算成负数', String(ps.every((p) => p.items.every((it) => it.grams > 0))), 'true');
    want('小档案的蛋白不冲过区间上限', String(ps.every((p) => p.protein <= ts.protein[1] + 10)), 'true');
    want('肉至少给到一掌心，不会出现 20 g 那种不像一份菜的数', String(plans.every((p) => p.items.filter((it) => it.name === '鸡胸肉（熟）' || it.name === '鱼或虾（熟）' || it.name === '瘦牛肉（熟）').every((it) => it.grams >= 20))), 'true');
    const blank = mealPlans(dietTargets(emptyProfile()));
    want('档案不全时不给方案（不编数）', String(blank.length), '0');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AR 碳水脂肪糖钠：参考值、按天汇总、缺项不当成 0、老存档补字段');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const t = dietTargets(base);
    const m = macroTargets(t);
    line('  78kg 男参考 ' + t.target + ' kcal → 碳水 ' + m.carbs?.join('–') + ' g · 脂肪 ' + m.fat?.join('–') + ' g · 糖 ≤' + m.sugarMax + ' g · 钠 ≤' + m.sodiumMax + ' mg');
    want('碳水按 45–55% 热量 ÷4', String(m.carbs?.[0]), String(Math.round((t.target * 0.45) / 4 / 5) * 5));
    want('脂肪按 25–35% 热量 ÷9', String(m.fat?.[1]), String(Math.round((t.target * 0.35) / 9 / 5) * 5));
    want('糖只给上限（10% 热量 ÷4）', String(m.sugarMax), String(Math.round((t.target * 0.1) / 4 / 5) * 5));
    want('钠上限 2000 mg', String(m.sodiumMax), '2000');
    want('碳水区间两端都低于热量数（不是把 kcal 当克）', String(m.carbs?.[1] < t.target), 'true');
    const thin = macroTargets(dietTargets(emptyProfile()));
    want('档案不全时四项都是 null', JSON.stringify([thin.carbs, thin.fat, thin.sugarMax, thin.sodiumMax]), '[null,null,null,null]');
    const d13 = buildDays(dietMeals).find((d) => d.date === '2026-10-13');
    want('这天碳水 = 8+82+78', String(d13.carbsG), '168');
    want('这天脂肪 = 18+26+14', String(d13.fatG), '58');
    want('这天糖 = 2+6+3', String(d13.sugarG), '11');
    want('这天钠 = 320+1400+1800', String(d13.sodiumMg), '3520');
    const d15 = buildDays(dietMeals).find((d) => d.date === '2026-10-15');
    want('只记名字没填数的那天：碳水是 0 不是 NaN', String(d15.carbsG), '0');
    const rw = rangeDiet(buildDays(dietMeals), '2026-10-13', '2026-10-19');
    want('一周碳水平均只按记了碳水的那三天（10-13/14/19）', String(rw.avgCarbs), String(Math.round((168 + 166 + 100) / 3)));
    const onlyKcal = [
        mkMeal('ok1', '2026-10-13', 'lunch', '盒饭', 800, 30, '', { carbsG: 90 }),
        mkMeal('ok2', '2026-10-13', 'dinner', '面', 600, 20, '', { carbsG: 70 }),
        mkMeal('ok3', '2026-10-14', 'lunch', '盒饭', 800, 30, '', { carbsG: 80 }),
        mkMeal('ok4', '2026-10-14', 'dinner', '面', 600, 20, '', { carbsG: 60 })
    ];
    const noSodium = rangeDiet(buildDays(onlyKcal), '2026-10-13', '2026-10-19');
    want('没人填钠 → 钠的平均是 null，不是 0', String(noSodium.avgSodium), 'null');
    want('填了碳水照样有碳水平均', String(noSodium.avgCarbs), '150');
    const lines = macroLines(rw, m, t.protein);
    want('五项一行都不少', lines.map((l) => l.label).join('/'), '蛋白质/碳水/脂肪/糖/钠');
    const sodiumLine = lines.find((l) => l.key === 'sodium');
    want('钠超上限标 over', sodiumLine.flag + '/' + sodiumLine.avg, 'over/' + String(rw.avgSodium));
    want('糖那行写的是上限不是区间', sodiumLine.ref, '≤ 2000 mg');
    want('没记的那一项标 none', macroLines({ ...rw, avgFat: null }, m, t.protein).find((l) => l.key === 'fat').flag, 'none');
    const lowCarbs = macroLines({ ...rw, avgCarbs: 120 }, m, t.protein).find((l) => l.key === 'carbs');
    want('碳水低于区间标 low', lowCarbs.flag, 'low');
    const est = estimateMeal('一杯奶茶 + 一个鸡蛋');
    want('命中的每一条都带五项', String(est?.nutrients.length), '5');
    want('奶茶的糖被算进来了（奶茶 35–60 + 鸡蛋 0–1）', nut(est, 'sugar'), '35–61 g');
    want('钠按 mg 聚合（奶茶 100–300 + 鸡蛋 60–80）', nut(est, 'salt'), '160–380 mg');
    want('表里 65 条都填满五项', String(FOOD_HINTS.every((h) => ['protein', 'carbs', 'fat', 'sugar', 'salt'].every((k) => h.nut[k]))), 'true');
    want('每一项都是 low ≤ high', String(FOOD_HINTS.every((h) => Object.values(h.nut).every((r) => !!r && r[0] <= r[1]))), 'true');
    const legacy = parseImported(JSON.stringify({ profile: base, mealLogs: [{ id: 'old1', date: '2026-10-13', slot: 'lunch', name: '盒饭', kcal: 700, proteinG: 30, note: '', ts: '2026-10-13T12:00:00.000Z' }] }));
    const old1 = legacy.mealLogs[0];
    want('老存档缺四个字段照样收得下', String(legacy.mealLogs.length), '1');
    want('缺的字段补成 null', JSON.stringify([old1.carbsG, old1.fatG, old1.sugarG, old1.sodiumMg]), '[null,null,null,null]');
    want('写进存档再读回来字段不丢', (() => { saveState({ ...initialState(), mealLogs: [mkMeal('n1', '2026-10-13', 'lunch', '面', 600, 20, '', { carbsG: 70, sodiumMg: 1800 })] }); const back = loadState(); return String(back.mealLogs[0].carbsG) + '/' + String(back.mealLogs[0].sodiumMg); })(), '70/1800');
    const planCarbs = mealPlans(t).map((p) => p.carbs);
    line('  三份吃法的碳水：' + planCarbs.join(' / ') + ' g · 脂肪 ' + mealPlans(t).map((p) => p.fat).join(' / ') + ' g（参考 ' + m.carbs?.join('–') + ' g 碳水）');
    want('三份都有碳水数', String(planCarbs.every((x) => x > 0 && Number.isFinite(x))), 'true');
    want('碳水落在参考区间上下 25% 里', String(planCarbs.every((x) => x >= m.carbs?.[0] * 0.75 && x <= m.carbs?.[1] * 1.25)), 'true');
    want('脂肪同理', String(mealPlans(t).every((p) => p.fat >= m.fat?.[0] * 0.75 && p.fat <= m.fat?.[1] * 1.25)), 'true');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AS 手动加一组 / 删一组、递减组、插片器械按 kg、21响礼炮');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const d = dateForRole('推');
    const sheet0 = buildSheet(base, fw, allSkip, [], d, { picked: ['lateral-raise'] });
    const lr = sheet0.slots.find((s) => s.exId === 'lateral-raise');
    const sets0 = lr.setPlan.length;
    line(`  哑铃侧平举：${sets0} 组 × ${lr.setPlan[0].reps} · ${loadLabel(lr.unit, lr.setPlan[0].weightKg)}`);
    const plus = addPlannedSet(sheet0, lr.id);
    const p1 = plus.slots.find((s) => s.id === lr.id);
    want('加一组：组数和 sets 一起 +1', `${p1.setPlan.length}/${p1.sets}`, `${sets0 + 1}/${sets0 + 1}`);
    want('新的末尾一组不写休息', String(p1.setPlan[p1.setPlan.length - 1].restSec), '0');
    want('原本末尾那组把组间休息补回来', String(p1.setPlan[p1.setPlan.length - 2].restSec), String(lr.restSec));
    want('加一组只动这一行', String(plus.slots.length), String(sheet0.slots.length));
    const minus = cutPlannedSet(plus, lr.id, p1.setPlan.length - 1, []);
    want('删掉刚加的那组：回到原组数', String(minus.sheet.slots.find((s) => s.id === lr.id).setPlan.length), String(sets0));
    const mk = (setIdx, sheetId = sheet0.id) => ({
        slotId: lr.id,
        sheetId,
        exId: 'lateral-raise',
        date: d,
        setIdx,
        weightKg: 10 + setIdx,
        reps: 15,
        targetReps: 15,
        rpe: 8,
        toFailure: false,
        ts: `${d}T10:00:00.000Z`
    });
    const cut = cutPlannedSet(sheet0, lr.id, 0, [mk(0), mk(1), mk(2), mk(1, 'sheet-别天')]);
    want('删掉第 1 组：这组的记录跟着删，后面的往前挪一位', cut.logs
        .filter((l) => l.sheetId === sheet0.id)
        .map((l) => `${l.setIdx}:${l.weightKg}`)
        .join(' '), '0:11 1:12');
    want('同 slotId 但别的表的记录不受牵连', String(cut.logs.filter((l) => l.sheetId !== sheet0.id).length), '1');
    const oneSet = { ...sheet0, slots: [{ ...lr, sets: 1, setPlan: [lr.setPlan[0]] }] };
    want('只剩一组时不再往下删', String(cutPlannedSet(oneSet, lr.id, 0, []).sheet === oneSet), 'true');
    const drop = toggleDropSet(sheet0, lr.id, []);
    const dl = drop.sheet.slots.find((s) => s.id === lr.id);
    const lastSet = dl.setPlan[dl.setPlan.length - 1];
    const prevSet = dl.setPlan[dl.setPlan.length - 2];
    want('递减组挂在末尾一行、标到 RPE 10', `${hasDropSet(dl)}/${lastSet.rpe}`, 'true/10');
    want('那一行的重量还是上一组的重量（第一档不凭空减）', String(lastSet.weightKg), String(prevSet.weightKg));
    want('上一组只留换片的 15 秒', String(prevSet.restSec), '15');
    want('挂递减组也算多一行', String(dl.setPlan.length), String(sets0 + 1));
    const s3 = dropStepPlan(dl, 3);
    const s2 = dropStepPlan(dl, 2);
    want('三档是一档比一档轻', `${s3.length}/${s3[0].weightKg > s3[1].weightKg}/${s3[1].weightKg > s3[2].weightKg}`, '3/true/true');
    want('两档就是工作重量再加一档减重', `${s2.length}/${s2[0].weightKg}/${s2[1].weightKg < s2[0].weightKg}`, `2/${prevSet.weightKg}/true`);
    line(`  三档建议：${s3.map((s) => loadLabel(dl.unit, s.weightKg)).join(' → ')}，每档先给 1 组`);
    const undrop = toggleDropSet(drop.sheet, lr.id, []);
    want('再点一次：递减组整个撤掉', String(undrop.sheet.slots.find((s) => s.id === lr.id).setPlan.length), String(sets0));
    want('库里没有一个动作还按片数记', String(EXERCISES.every((e) => e.unit !== '器械片')), 'true');
    const leg = byId('leg-press');
    want('腿举按 kg，起始值折成公斤', `${leg.unit}/${leg.starter[1].male}`, 'kg/20');
    want('哈克深蹲按 kg', `${byId('hack-squat').unit}/${byId('hack-squat').starter[2].male}`, 'kg/25');
    want('器械的建议重量说 kg', suggestWeight(leg, base, [], d, 1).unit, 'kg');
    want('器械重量往 2.5 的倍数取', String(roundLoad(leg, 17.4)), '17.5');
    want('器械不会算出比最小一档还轻', String(roundLoad(leg, 3)), '5');
    const c21 = byId('curl-21');
    want('手臂里有 21响礼炮', `${c21.name}/${c21.muscles[0]}/${c21.reps}`, '21响礼炮/二头/21');
    want('它落在动作页的手臂分区', browseAreasOf(c21).join(','), 'arm');
    const slot21 = previewSlot(c21, base, [], d);
    want('一次 21 下、排三组', `${slot21.setPlan.length}/${slot21.setPlan[0].reps}`, '3/21');
    want('重量写 kg', loadLabel(slot21.unit, slot21.setPlan[0].weightKg), '15 kg');
    want('轻的杠铃孤立动作不再被 20 公斤的空杠顶住', loadLabel(byId('bb-curl').unit, previewSlot(byId('bb-curl'), base, [], d).setPlan[0].weightKg), '22.5 kg');
    want('大重量杠铃主项还是从空杠起', String(roundLoad(byId('back-squat'), 12)), '20');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
head('AU 拖卡片改顺序、递减组按档记账、档位数据进得来');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const d = dateForRole('推');
    const sheet0 = buildSheet(base, fw, allSkip, [], d, { picked: ['lateral-raise', 'db-fly'] });
    const ids = sheet0.slots.map((s) => s.id);
    const first = sheet0.slots[0];
    const last = sheet0.slots[sheet0.slots.length - 1];
    const up = moveSlot(sheet0, last.id, first.id);
    want('往上拖到第一行前面：它成了第一行', up.slots[0].id, last.id);
    want('拖一次行数不变', String(up.slots.length), String(sheet0.slots.length));
    want('其余各行相对顺序没乱', up.slots.slice(1).map((s) => s.id).join(','), ids.slice(0, ids.length - 1).join(','));
    const down = moveSlot(sheet0, first.id, sheet0.slots[2].id);
    want('往下拖落到那一行后面', down.slots[2].id, first.id);
    want('拖到自己身上什么都不改', String(moveSlot(sheet0, first.id, first.id) === sheet0), 'true');
    want('拖到表上没有的行不动', String(moveSlot(sheet0, first.id, 'nope').slots.length), String(sheet0.slots.length));
    const lr = sheet0.slots.find((s) => s.exId === 'lateral-raise');
    const dropLog = {
        slotId: lr.id,
        sheetId: sheet0.id,
        exId: 'lateral-raise',
        date: d,
        setIdx: lr.setPlan.length,
        weightKg: 7,
        reps: 15,
        targetReps: 15,
        rpe: null,
        toFailure: false,
        dropSteps: [{ weightKg: 7, sets: 2 }, { weightKg: 5, sets: 1 }, { weightKg: 4, sets: 1 }],
        ts: `${d}T10:00:00.000Z`
    };
    const e = buildEntries([], [dropLog], [])[0];
    want('每档按自己的重量和组数进总量（哑铃两手合计）', String(e.tonnage), String((7 * 2 + 5 + 4) * 15 * 2));
    want('那一行写得出一档一档的数', e.lines[0].perSet[0], '7kg/手×2组 5kg/手×1组 4kg/手×1组');
    want('没记档的普通组照旧', buildEntries([], [mkLog('bench-press', d, 0, 60, 8, 8, 0)], [])[0].lines[0].perSet[0], '60kg×8');
    const mkSteps = (list) => parseImported(JSON.stringify({
        profile: base,
        setLogs: [
            { slotId: 'a', exId: 'lateral-raise', date: d, setIdx: 0, weightKg: 7, reps: 15, targetReps: 15, rpe: null, toFailure: false, ts: 'x', dropSteps: list }
        ]
    })).setLogs[0];
    want('手改 JSON 里不成形的档位丢掉', String(mkSteps([{ weightKg: 7, sets: 1 }, { weightKg: 'x', sets: 1 }, { weightKg: 5, sets: 1 }]).dropSteps?.length), '2');
    want('档位最多留三档', String(mkSteps([{ weightKg: 7, sets: 1 }, { weightKg: 5, sets: 1 }, { weightKg: 4, sets: 1 }, { weightKg: 3, sets: 1 }]).dropSteps?.length), '3');
    want('档位写成别的形状也不塞进状态', String(Array.isArray(mkSteps('不是数组').dropSteps)), 'false');
    want('老记录没这个字段照样收得下', String(mkLog('bench-press', d, 0, 60, 8, 8, 0).dropSteps), 'undefined');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}

head('AV 没设训练目标也能排出一张表：goal 为空不炸、部位照排');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const noGoal = { ...base, goal: null, dayAreas: { 1: '胸' } };
    const gfw = buildFramework(noGoal, null);
    want('没目标也排得出训练日', String(gfw.days.length > 0), 'true');
    want('框架里不假装有个目标', String(gfw.goal), 'null');
    want('没目标按八周一轮排', String(gfw.weeksTotal), '8');
    const gsheet = buildSheet(noGoal, gfw, { totalMinutes: null, wantArea: '胸', wantAreas: ['胸'], free: false }, [], noGoal.date ?? '2026-11-06', { picked: [], acts: [], skipped: [] });
    want('按框架排出行来了', String(gsheet.slots.length > 0), 'true');
    const fwsheet = buildSheet(noGoal, gfw, { totalMinutes: null, wantArea: null, wantAreas: [], free: true }, [], '2026-11-06', { picked: [], acts: [], skipped: [] });
    want('选了今天自由练也不炸', String(fwsheet.slots.length > 0), 'true');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}

head('AX 新手第一张表：不问星期就周一到周四、四练三分化、3 组 10–15 次、前两周不加重量');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const zero = { ...base, experienceYears: 0, lastSolidBlock: 'never', weekdays: null, injuries: [], injuriesAnswered: true, sessionMinutes: null, goalWish: '先把训练建立起来' };
    zero.goal = wishToGoal(zero);
    const nfw = buildFramework(zero, zero.goal);
    const liftRows = (sh) => sh.slots.filter((s) => s.setPlan.length && s.kind !== 'ramp');
    const d1 = '2026-11-09';
    const n1 = buildSheet(zero, nfw, { totalMinutes: null, wantArea: null, wantAreas: [] }, [], d1, {});
    want('默认四天', String(nfw.days.length), '4');
    want('落在周一到周四', nfw.days.map((d) => weekdayName(d.weekday)).join('/'), '周一/周二/周三/周四');
    want('新手走四练三分化', nfw.days.map((d) => d.role).join('/'), '胸+三头/背+二头/腿+臀/肩+手臂');
    want('框架里说清是替你定的', String(nfw.assumed.some((a) => a.includes('训练日没问过你'))), 'true');
    want('一天最多五个动作', String(liftRows(n1).length <= 5), 'true');
    want('每个动作最多三组', String(liftRows(n1).every((s) => s.sets <= 3)), 'true');
    want('次数都在 10–15', String(liftRows(n1).every((s) => s.setPlan.every((p) => p.reps >= 10 && p.reps <= 15))), 'true');
    want('第一天主项是坐姿推胸器', byId(n1.slots.find((s) => s.kind === 'main')?.exId ?? '')?.name ?? '无', '坐姿推胸器');
    want('新手第一天的重量不离谱', String(liftRows(n1).every((s) => (s.setPlan[0].weightKg ?? 0) <= 80)), 'true');
    want('第一周不加重', String(nfw.weeks[0].freeze), 'true');
    want('第二周也不加重', String(nfw.weeks[1].freeze), 'true');
    want('第三周起才加', String(Boolean(nfw.weeks[2].freeze)), 'false');
    want('规则里写明前两周不加', String(nfw.rules[0].includes('前两周')), 'true');
    const bench = 'machine-chest-press';
    const made = [0, 1, 2].map((i) => ({ slotId: 'lift-0', sheetId: 'x', exId: bench, date: addDaysIso(d1, -7 * 3), setIdx: i, weightKg: 50, reps: 12, targetReps: 12, rpe: 7, toFailure: false, ts: '' }));
    const go = suggestWeight(byId(bench), zero, made, addDaysIso(d1, 1), 1);
    const hold = suggestWeight(byId(bench), zero, made, addDaysIso(d1, 1), 1, '', true);
    want('做满了就往上推一档', String(go.weightKg), '52.5');
    want('冻住的那周不动', String(hold.weightKg), '50');
    const vet = { ...base };
    const vfw = buildFramework(vet, vet.goal);
    const vs = buildSheet(vet, vfw, { totalMinutes: 90, wantArea: null, wantAreas: [] }, [], d1, {});
    want('练过的人分化不变', vfw.days.map((d) => d.role).join('/'), '推/拉/腿/上肢弱项');
    want('练过的人第一周还是摸底', vfw.weeks[0].theme, '第 1 周 · 摸底');
    want('练过的人该有四组的主项', String(liftRows(vs).some((s) => s.sets >= 4)), 'true');
    line('  新手第一天：' + liftRows(n1).map((s) => `${s.name} ${s.sets}×${s.setPlan[0].reps}@${s.setPlan[0].weightKg}`).join(' ｜ '));
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}

head('AW 身体数据打卡：区间内的体重/腰围点，最新一次单独给');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const today = todayIso();
    const from = addDaysIso(today, -13);
    let n = 0;
    const mk = (back, weightKg, waistCm = null) => ({
        id: `mea${(n += 1)}`,
        date: addDaysIso(today, -back),
        weightKg,
        waistCm,
        note: '',
        ts: ''
    });
    const empty = bodyTrend([], from, today);
    want('一条都没有时 latest 是 null', String(empty.latest), 'null');
    want('一条都没有时不炸', String(empty.changeKg), 'null');
    want('一条都没有时点为空', String(empty.points.length), '0');

    const downSlow = [mk(12, 78.8), mk(9, 78.8), mk(5, 78.2), mk(2, 78.2)];
    const trend = bodyTrend(downSlow, from, today);
    want('区间内的点都保留', String(trend.points.length), '4');
    want('点按日期从早到晚', trend.points.map((p) => p.date).join(','), [...downSlow].map((m) => m.date).sort().join(','));
    want('最新一次是最后一条体重', String(trend.latest.weightKg), '78.2');
    want('区间变化按首尾差算', String(trend.changeKg), '-0.6');

    const waistOnly = [mk(12, null, 90), mk(2, null, 88)];
    const waist = bodyTrend(waistOnly, from, today);
    want('只记腰围也算点', String(waist.points.length), '2');
    want('只记腰围时没有体重变化', String(waist.changeKg), 'null');
    want('只记腰围时 latest 是 null', String(waist.latest), 'null');

    const outside = bodyTrend([mk(40, 80), mk(2, 78.2)], from, today);
    want('区间外的老打卡不进点', String(outside.points.length), '1');
    want('区间内只有一次时不给变化', String(outside.changeKg), 'null');

    const future = bodyTrend([mk(-1, 79), mk(2, 78.4)], from, today);
    want('未来的打卡不进区间点', String(future.points.length), '1');

    const noNote = parseImported(JSON.stringify({
        profile: emptyProfile(),
        measureLogs: [{ id: 'nn', date: today, weightKg: 78.1, waistCm: null, ts: '' }]
    }));
    want('打卡不写称的条件也存得住', String(noNote.measureLogs.length), '1');
    const bad = parseImported(JSON.stringify({
        profile: emptyProfile(),
        measureLogs: [mk(2, 0, 88), mk(5, 78, null)]
    }));
    want('体重填 0 的打卡被丢掉', String(bad.measureLogs.length), '1');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}

head('AY 这组多累：6–10 半档九级、拖到哪儿就吸到哪儿、没填就是没填');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const today = todayIso();
    want('一共九档', String(RPE_STEPS.length), '9');
    want('一档差半级', String(RPE_STEPS.every((v, i) => i === 0 || v - RPE_STEPS[i - 1] === 0.5)), 'true');
    want('两头是 6 和 10', `${RPE_STEPS[0]}/${RPE_STEPS[RPE_TOP]}`, '6/10');
    want('每一档来回都对得上', String(RPE_STEPS.every((v) => rpeAt(rpeIndex(v)) === v)), 'true');
    want('9.7 吸到 9.5', String(rpeAt(rpeIndex(9.7))), '9.5');
    want('6.2 吸到 6', String(rpeAt(rpeIndex(6.2))), '6');
    want('拖过头钳在 10', String(rpeAt(rpeIndex(99))), '10');
    want('拖过左边钳在 6', String(rpeAt(rpeIndex(-3))), '6');
    want('档位号越界也不炸', `${rpeAt(99)}/${rpeAt(-9)}`, '10/6');
    want('没填就是没填', rpeLabel(null), '');
    want('没填时停在第一档', String(rpeIndex(null)), '0');
    want('NaN 也停在第一档', String(rpeIndex(NaN)), '0');
    want('只有最右那档叫力竭', rpeLabel(10), '力竭');
    want('9.5 还不算力竭', String(rpeLabel(9.5) === '力竭'), 'false');
    want('老记录里的 8 还认得', `${isRpe(8)}/${rpeLabel(8)}`, 'true/留 2 次');
    want('九条说法不重样', String(new Set(RPE_LABELS).size), '9');
    const onScale = (sh) => sh.slots.filter((s) => s.setPlan.length && s.kind !== 'ramp').every((s) => s.setPlan.every((p) => RPE_STEPS.includes(p.rpe)));
    want('老手表上的目标 RPE 都在档上', String(onScale(both)), 'true');
    want('递增热身不标 RPE', String(both.slots.filter((s) => s.kind === 'ramp').every((s) => s.setPlan.every((p) => p.rpe === 0))), 'true');
    const zero = { ...base, experienceYears: 0, lastSolidBlock: 'never', weekdays: null, injuries: [], injuriesAnswered: true, sessionMinutes: null, goalWish: '先把训练建立起来' };
    zero.goal = wishToGoal(zero);
    const nfw = buildFramework(zero, zero.goal);
    const n1 = buildSheet(zero, nfw, { totalMinutes: null, wantArea: null, wantAreas: [] }, [], '2026-11-09', {});
    want('新手表上的目标 RPE 也都在档上', String(onScale(n1)), 'true');
    const shoulder = buildSheet(base, fw, { totalMinutes: 60, yesterdayFocus: '没练', statusSelf: 4, sleepHours: 7, wantArea: '肩' }, [], nextTrainingDay(fw.startDate), { picked: ['lateral-raise'] });
    const lr = shoulder.slots.find((s) => s.exId === 'lateral-raise');
    const dropped = lr ? toggleDropSet(shoulder, lr.id, []) : null;
    const lastDrop = dropped?.sheet.slots.find((s) => s.id === lr.id)?.setPlan.at(-1);
    want('递减组那一档也在档上', String(lastDrop ? RPE_STEPS.includes(lastDrop.rpe) : false), 'true');
    want('递减组顶到力竭那一档', String(lastDrop?.rpe), '10');
    const back = parseImported(JSON.stringify({
        profile: emptyProfile(),
        setLogs: [{ slotId: 'lift-0', sheetId: 'x', exId: 'machine-chest-press', date: today, setIdx: 0, weightKg: 50, reps: 12, targetReps: 12, rpe: 9.5, toFailure: false, ts: '' }]
    }));
    want('半档 9.5 导出再导入还在', String(back.setLogs[0]?.rpe), '9.5');
    line('  九档：' + RPE_STEPS.map((v, i) => `${v} ${RPE_LABELS[i]}`).join(' ｜ '));
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}

head('AZ 力度条配色：6、7 走绿，8、9 走橙红，四个色族不撞车');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const hue = ([r, g, b]) => {
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        if (!d)
            return 0;
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    };
    const gap = (a, b) => {
        const d = Math.abs(a - b) % 360;
        return Math.min(d, 360 - d);
    };
    const lin = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const end = (i) => EFFORT_TONES[i].stops[4];
    want('一档一色，九档九条', String(EFFORT_TONES.length), '9');
    want('每条五个色标', String(EFFORT_TONES.every((t) => t.stops.length === 5)), 'true');
    want('6–7.5 全在松石绿那一段', String([0, 1, 2, 3].every((i) => hue(end(i)) >= 150 && hue(end(i)) <= 190)), 'true');
    want('8–8.5 全在琥珀那一段', String([4, 5].every((i) => hue(end(i)) >= 25 && hue(end(i)) <= 50)), 'true');
    want('9–9.5 全在真红那一段', String([6, 7].every((i) => hue(end(i)) >= 335 && hue(end(i)) <= 360)), 'true');
    want('10 还是紫的', String(hue(end(8)) >= 245 && hue(end(8)) <= 275), 'true');
    const pairs = [0, 2].flatMap((c) => [4, 6].map((w) => Math.round(gap(hue(end(c)), hue(end(w))))));
    want('6、7 对 8、9 的色相差都过 90 度', String(pairs.every((d) => d >= 90)), 'true');
    want('四个色族的字色不重样', String(new Set(EFFORT_TONES.map((t) => t.ink)).size), '4');
    want('四个色族的边框不重样', String(new Set(EFFORT_TONES.map((t) => t.border)).size), '4');
    want('7 和 8 的肌肉差得远', String(dist(EFFORT_TONES[2].body, EFFORT_TONES[4].body) >= 100), 'true');
    want('6 和 9 的肌肉差得远', String(dist(EFFORT_TONES[0].body, EFFORT_TONES[6].body) >= 100), 'true');
    want('字色压在白底上都读得清', String(EFFORT_TONES.every((t) => 1.05 / (lum(hex(t.ink)) + 0.05) >= 4.5)), 'true');
    want('描边比肌肉本身深', String(EFFORT_TONES.every((t) => lum(t.edge) < lum(t.body))), 'true');
    want('肌肉比它压住的那截底色浅', String(EFFORT_TONES.every((t, i) => lum(t.body) > lum(end(i)))), 'true');
    want('绿色那四档越走越深', String([1, 2, 3].every((i) => lum(end(i)) < lum(end(i - 1)))), 'true');
    want('刻度上五个数各认各的色族', [0, 2, 4, 6, 8].map((i) => EFFORT_TONES[i].ink).join('/'), '#0a6b5b/#0a6b5b/#8a4b06/#b8253a/#6b3fd0');
    line('  色相：' + EFFORT_TONES.map((t, i) => `${RPE_STEPS[i]}→${Math.round(hue(end(i)))}°`).join(' ｜ '));
    line('  6/7 对 8/9 的色相差：' + pairs.join('、') + ' 度');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}

head('BA 周计划层：日期铺排、拖拽换天、点进去改动作');
{
    const miss = [];
    const want = (label, got, exp) => {
        if (got !== exp)
            miss.push(`${label}: 实际 ${got} / 期望 ${exp}`);
        line(`  ${got === exp ? '✔' : '✘'} ${label} = ${got}（期望 ${exp}）`);
    };
    const p = { ...base, weekdays: [1, 3, 5], dayAreas: {} };
    p.goal = wishToGoal(p);
    const fw = buildFramework(p, p.goal);
    const ws = mondayOf('2026-11-12');
    want('周四归到本周一', ws, '2026-11-09');
    const dates = weekDates(ws);
    want('一周七格', String(dates.length), '7');
    want('七格连着', String(dates.every((d, i) => i === 0 || addDaysIso(dates[i - 1], 1) === d)), 'true');
    const wp = buildWeekPlan(fw, ws);
    want('框架三天铺到三个日期', String(dates.filter((d) => wp.days[d]).length), '3');
    want('周一那格就是框架周一', wp.days['2026-11-09']?.role, fw.days.find((d) => d.weekday === 1)?.role);
    want('周二休息', String(wp.days['2026-11-10']), 'null');
    const moved = moveDay(wp, '2026-11-09', '2026-11-10');
    want('拖到休息日：那天变训练日', String(Boolean(moved.days['2026-11-10'])), 'true');
    want('拖走的那天变休息', String(moved.days['2026-11-09']), 'null');
    const swapped = moveDay(wp, '2026-11-09', '2026-11-11');
    want('拖到已有安排：互换', swapped.days['2026-11-11']?.role, wp.days['2026-11-09'].role);
    want('互换另一头也对', swapped.days['2026-11-09']?.role, wp.days['2026-11-11'].role);
    want('原地拖不动', String(moveDay(wp, '2026-11-09', '2026-11-09') === wp), 'true');
    const remap = fwForWeek(fw, moved);
    want('remap 回星期几喂引擎', remap.days.find((d) => d.weekday === 2)?.role, wp.days['2026-11-09'].role);
    const edited = setDayExercises(wp, '2026-11-09', ['bench-press', 'bench-press', 'db-curl', 'not-an-ex']);
    want('改动作去重去野 id', edited.days['2026-11-09'].exerciseIds.join(','), 'bench-press,db-curl');
    want('主项跟着换', edited.days['2026-11-09'].mainLiftId, 'bench-press');
    const cleared = setDayExercises(wp, '2026-11-09', []);
    want('删光变休息日', String(cleared.days['2026-11-09']), 'null');
    const created = setDayExercises(wp, '2026-11-10', ['back-squat']);
    want('休息日加动作变训练日', created.days['2026-11-10']?.role, '自选');
    want('加出来的主项是深蹲', created.days['2026-11-10']?.mainLiftId, 'back-squat');
    const sheet = buildSheet(p, fwForWeek(fw, moved), { totalMinutes: null, wantArea: null, wantAreas: [] }, [], '2026-11-10', {});
    want('换天之后引擎真按新日期排', String(sheet.slots.some((s) => s.exId === wp.days['2026-11-09'].exerciseIds[0])), 'true');
    saveState({ ...initialState(), weekPlan: wp });
    want('周计划层落盘再读还在', loadState().weekPlan?.weekStart, ws);
    want('手改坏的周计划整层丢掉', String(parseImported(JSON.stringify({ profile: emptyProfile(), weekPlan: { weekStart: 3, days: [] } })).weekPlan), 'null');
    line('  判据不符的项：' + (miss.length ? '\n    · ' + miss.join('\n    · ') : '没有'));
}
