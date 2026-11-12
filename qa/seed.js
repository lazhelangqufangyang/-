import { writeFileSync } from 'node:fs';
import { emptyProfile } from '../src/store.js';
import { wishToGoal } from '../src/engine/goals.js';
import { buildFramework } from '../src/engine/week.js';
import { buildSheet } from '../src/engine/day.js';
import { addDaysIso, todayIso, weekdayOf } from '../src/engine/time.js';
/**
 * 给浏览器验证用的一份本机状态：写进 dist/seed.json，页面里 fetch 一下塞进 localStorage，
 * 免得每次都要手点完整套档案表单，也免得「记录」页是空的。只用于本地 8082，发布前会删掉。
 */
const profile = {
    ...emptyProfile(),
    sex: 'male',
    age: 28,
    heightCm: 178,
    weightKg: 78,
    experienceYears: 2,
    lastSolidBlock: '2024-06',
    injuries: [{ area: 'knee', side: 'right', triggers: '深蹲到最低点时右膝内侧刺痛' }],
    injuriesAnswered: true,
    commercialGym: true,
    weekdays: [1, 2, 4, 6],
    sessionMinutes: 75,
    goalWish: '想要穿衣有型一点，肚子上的肉少一点',
    sleepHours: 7,
    dailySteps: 8000,
    dietRestrictions: '无'
};
profile.goal = wishToGoal(profile);
const framework = buildFramework(profile, profile.goal);
const today = todayIso();
const input = { totalMinutes: null, yesterdayFocus: '没练', statusSelf: null, sleepHours: null, wantArea: null };
const sheets = [];
const setLogs = [];
// 过去三周的框架训练日都造一张表和逐组记录，重量让引擎按已有记录推，后面的日子自然出现新高
for (let back = 21; back >= 2; back -= 1) {
    const date = addDaysIso(today, -back);
    if (!framework.days.some((d) => d.weekday === weekdayOf(date)))
        continue;
    const sheet = buildSheet(profile, framework, input, setLogs, date);
    sheets.push(sheet);
    const liftSlots = sheet.slots.filter((s) => s.setPlan.length > 0);
    let clock = 0; // 组的打卡时间按组间 4 分钟往后推，否则记录页的「第一组到最后一组」会算出假数字
    liftSlots.forEach((s, idx) => {
        // 最后一个动作只记一半的组，页面要能看出「计划 4 组只记了 2 组」
        const keep = idx === liftSlots.length - 1 ? Math.max(1, Math.ceil(s.setPlan.length / 2)) : s.setPlan.length;
        s.setPlan.slice(0, keep).forEach((p, k) => {
            clock += 4;
            setLogs.push({
                slotId: s.id,
                sheetId: sheet.id,
                exId: s.exId ?? s.name,
                date,
                setIdx: k,
                weightKg: p.weightKg,
                reps: p.reps,
                targetReps: p.reps,
                rpe: k === s.setPlan.length - 1 ? 8.5 : 7.5,
                toFailure: false,
                ts: `${date}T${String(17 + Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}:00.000Z`
            });
        });
    });
}
const activityLogs = [
    { id: 'act1', date: addDaysIso(today, -8), name: '江边慢跑', minutes: 40, kind: 'cardio', feel: 3, note: '跑走交替', ts: new Date().toISOString() },
    { id: 'act2', date: addDaysIso(today, -3), name: '羽毛球双打', minutes: 75, kind: 'sport', feel: 4, note: '', ts: new Date().toISOString() },
    { id: 'act3', date: addDaysIso(today, -1), name: '拉伸放松', minutes: 15, kind: 'other', feel: null, note: '跟着视频拉了背', ts: new Date().toISOString() }
];
const mealRows = [
    [1, 'breakfast', '燕麦+两个鸡蛋', 410, 21, ''],
    [1, 'lunch', '米饭+清蒸鱼+青菜', 700, 42, ''],
    [1, 'dinner', '鸡胸沙拉', 540, 38, '油醋汁'],
    [1, 'snack', '酸奶+一把坚果', 550, 10, ''],
    [2, 'breakfast', '豆浆+两个包子', 350, 14, ''],
    [2, 'lunch', '食堂套餐（两荤一素）', 850, 45, ''],
    [2, 'snack', '一杯酸奶', 180, 12, ''],
    [2, 'dinner', '牛肉面', 770, 38, ''],
    [3, 'breakfast', '面包+牛奶', 380, 16, ''],
    [3, 'lunch', '开会订的盒饭', null, null, '没看清份量，先记吃了什么'],
    [3, 'snack', '一根香蕉', 105, 1, ''],
    [3, 'dinner', '回家煮了面+青菜+蛋', 905, 35, ''],
    [3, 'snack', '睡前一碗馄饨', 410, 18, ''],
    [4, 'breakfast', '三个鸡蛋+吐司', 460, 26, ''],
    [4, 'lunch', '鸡胸饭', 760, 55, ''],
    [4, 'dinner', '豆腐蔬菜+米饭', 880, 34, ''],
    [6, 'breakfast', '燕麦+鸡蛋+牛奶', 480, 25, ''],
    [6, 'lunch', '麻辣烫（少油，加青菜）', 870, 38, ''],
    [6, 'dinner', '清蒸鱼+米饭+时蔬', 900, 52, ''],
    [8, 'lunch', '外卖黄焖鸡', 820, 42, ''],
    [8, 'dinner', '鸡蛋炒饭', 690, 20, ''],
    [9, 'breakfast', '没吃', 0, 0, '起晚了'],
    [9, 'lunch', '同事给的三明治', 430, 21, ''],
    [9, 'dinner', '火锅', 1480, 68, '和朋友，吃了两小时'],
    [11, 'lunch', '食堂', 650, 38, ''],
    [11, 'dinner', '酸奶+水果', 260, 10, '']
];
const mealLogs = mealRows.map(([back, slot, name, kcal, proteinG, note], i) => ({
    id: `meal${i}`,
    date: addDaysIso(today, -back),
    slot,
    name,
    kcal,
    proteinG,
    note,
    ts: new Date(`${addDaysIso(today, -back)}T12:00:00`).toISOString()
}));
const state = {
    version: 1,
    profile,
    framework,
    sheets,
    setLogs,
    activityLogs,
    mealLogs,
    settings: { baseURL: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat', useAI: false },
    onboardingDone: true,
    picked: [],
    pickedDate: '',
    favorites: ['bench-press', 'db-fly']
};
writeFileSync('dist/seed.json', JSON.stringify(state), 'utf8');
console.log(`seed 写好：表 ${sheets.length} 张 · 逐组记录 ${setLogs.length} 条 · 补记 ${activityLogs.length} 条 · 饮食 ${mealLogs.length} 条 · 今天 ${today}`);
