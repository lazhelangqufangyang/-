import { AREA_CHOICES } from './engine/areas.js';
import { byId } from './engine/exercises.js';
export const STORAGE_KEY = 'fitplan.v1';
export function emptyProfile() {
    return {
        sex: null,
        age: null,
        heightCm: null,
        weightKg: null,
        bodyFatPct: null,
        experienceYears: null,
        lastSolidBlock: null,
        injuries: [],
        injuriesAnswered: false,
        commercialGym: null,
        extraEquipment: null,
        weekdays: null,
        sessionMinutes: null,
        goalWish: '',
        goal: null,
        sleepHours: null,
        dailySteps: null,
        dietRestrictions: null,
        noCardio: false,
        homeOnly: false,
        avoidNames: [],
        dayAreas: {}
    };
}
export function defaultSettings() {
    return {
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: '',
        model: 'deepseek-chat',
        useAI: false
    };
}
export function initialState() {
    return {
        version: 1,
        profile: emptyProfile(),
        framework: null,
        sheets: [],
        setLogs: [],
        settings: defaultSettings(),
        onboardingDone: false,
        picked: [],
        pickedDate: '',
        favorites: [],
        activityLogs: [],
        mealLogs: [],
        measureLogs: []
    };
}
const ACTIVITY_KINDS = ['cardio', 'sport', 'lift', 'walk', 'other'];
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
/** 老数据没有这些字段，导入和本机读取都要补成数组，不能让 UI 拿到 undefined */
function withLists(parsed) {
    return {
        picked: Array.isArray(parsed.picked) ? parsed.picked.filter((x) => typeof x === 'string') : [],
        pickedDate: typeof parsed.pickedDate === 'string' ? parsed.pickedDate : '',
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((x) => typeof x === 'string') : [],
        activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs.filter(isActivityLog).map(cleanActivity) : [],
        mealLogs: Array.isArray(parsed.mealLogs) ? parsed.mealLogs.filter(isMealLog).map(cleanMeal) : [],
        measureLogs: Array.isArray(parsed.measureLogs) ? parsed.measureLogs.filter(isMeasureLog) : []
    };
}
/** 老数据没有 dayAreas，导入的 JSON 里它也可能被手改成别的东西：一律回落到空对象，UI 才敢直接取键 */
function cleanProfile(p) {
    const merged = { ...emptyProfile(), ...(p ?? {}) };
    const areas = merged.dayAreas;
    merged.dayAreas =
        areas && typeof areas === 'object' && !Array.isArray(areas)
            ? Object.fromEntries(Object.entries(areas).filter(([, v]) => typeof v === 'string'))
            : {};
    return merged;
}
export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return initialState();
        const parsed = JSON.parse(raw);
        const framework = parsed.framework ?? null;
        return {
            ...initialState(),
            onboardingDone: parsed.onboardingDone === true,
            framework,
            ...withLists(parsed),
            version: 1,
            profile: cleanProfile(parsed.profile),
            settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
            sheets: (parsed.sheets ?? []).map(cleanSheet),
            setLogs: parsed.setLogs ?? []
        };
    }
    catch {
        return initialState();
    }
}
/** 只写当前版本认得的字段：删掉的页面（「问」的对话历史）不该一直挤在存档里 */
function slim(state) {
    return {
        version: state.version,
        profile: state.profile,
        framework: state.framework,
        sheets: state.sheets,
        setLogs: state.setLogs,
        settings: state.settings,
        onboardingDone: state.onboardingDone,
        picked: state.picked,
        pickedDate: state.pickedDate,
        favorites: state.favorites,
        activityLogs: state.activityLogs,
        mealLogs: state.mealLogs,
        measureLogs: state.measureLogs
    };
}
export function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim(state)));
}
export function exportJson(state) {
    return JSON.stringify({ ...slim(state), exportedAt: new Date().toISOString() }, null, 2);
}
/** 导入时只接受已知字段，未知结构直接拒绝而不是塞进状态 */
export function parseImported(json) {
    const raw = JSON.parse(json);
    if (typeof raw !== 'object' || raw === null || !raw.profile) {
        throw new Error('文件里没有档案数据，可能不是本应用导出的 JSON');
    }
    const framework = raw.framework ?? null;
    const merged = {
        ...initialState(),
        onboardingDone: raw.onboardingDone === true,
        framework,
        ...withLists(raw),
        version: 1,
        profile: cleanProfile(raw.profile),
        settings: { ...defaultSettings(), ...(raw.settings ?? {}), apiKey: raw.settings?.apiKey ?? '' },
        sheets: Array.isArray(raw.sheets) ? raw.sheets.map(cleanSheet) : [],
        setLogs: Array.isArray(raw.setLogs) ? raw.setLogs.filter(isSetLog).map(cleanSetLog) : []
    };
    return merged;
}
function isSetLog(v) {
    const s = v;
    return !!s && typeof s.slotId === 'string' && typeof s.exId === 'string' && typeof s.reps === 'number';
}
/** 递减组那一行的档位：手改的 JSON 里塞了不成形的档就整条丢掉这个字段 */
function cleanSetLog(l) {
    if (l.dropSteps === undefined)
        return l;
    const steps = Array.isArray(l.dropSteps)
        ? l.dropSteps
            .filter((s) => !!s && (s.weightKg === null || typeof s.weightKg === 'number') && typeof s.sets === 'number')
            .slice(0, 3)
        : [];
    return { ...l, dropSteps: steps.length ? steps : undefined };
}
/** 老存档的表没有 skipped 这个字段；里面的 id 不在表上了就当作没标 */
function cleanSheet(s) {
    const ids = new Set((s.slots ?? []).map((x) => x.id));
    return { ...s, skipped: Array.isArray(s.skipped) ? s.skipped.filter((id) => ids.has(id)) : [] };
}
/** 老记录没有 areas / exIds 这两个字段；手改的 JSON 里塞了词表以外的东西就丢掉 */
function cleanActivity(a) {
    return {
        ...a,
        areas: Array.isArray(a.areas) ? [...new Set(a.areas.filter((x) => AREA_CHOICES.includes(x)))] : [],
        exIds: Array.isArray(a.exIds) ? [...new Set(a.exIds.filter((x) => Boolean(byId(x))))] : []
    };
}
/** 导入的文件里混进奇怪结构的活动记录就丢掉这一条，不塞进状态 */
function isActivityLog(v) {
    const a = v;
    return (!!a &&
        typeof a.id === 'string' &&
        typeof a.date === 'string' &&
        typeof a.name === 'string' &&
        typeof a.minutes === 'number' &&
        a.minutes >= 0 &&
        typeof a.note === 'string' &&
        ACTIVITY_KINDS.includes(a.kind));
}
/** 热量允许空着（只记吃了什么）；填了就得是个非负数，0 在聚合里当作没估 */
function isMealLog(v) {
    const m = v;
    const num = (x) => x === null || x === undefined || (typeof x === 'number' && x >= 0);
    return (!!m &&
        typeof m.id === 'string' &&
        typeof m.date === 'string' &&
        typeof m.name === 'string' &&
        typeof m.note === 'string' &&
        MEAL_SLOTS.includes(m.slot) &&
        num(m.kcal) &&
        num(m.proteinG) &&
        num(m.carbsG) &&
        num(m.fatG) &&
        num(m.sugarG) &&
        num(m.sodiumMg));
}
/** 老存档只到蛋白质为止，碳水/脂肪/糖/钠一律补成 null，UI 才敢直接读 */
function cleanMeal(m) {
    const num = (x) => (typeof x === 'number' && x >= 0 ? x : null);
    return {
        ...m,
        kcal: num(m.kcal),
        proteinG: num(m.proteinG),
        carbsG: num(m.carbsG),
        fatG: num(m.fatG),
        sugarG: num(m.sugarG),
        sodiumMg: num(m.sodiumMg)
    };
}
/** 体重和腰围都可以只填一边；两边都空的那种条目没意义，丢掉 */
function isMeasureLog(v) {
    const m = v;
    const num = (x) => x === null || x === undefined || (typeof x === 'number' && x > 0 && x < 500);
    return (!!m &&
        typeof m.id === 'string' &&
        typeof m.date === 'string' &&
        (m.note === undefined || typeof m.note === 'string') &&
        num(m.weightKg) &&
        num(m.waistCm) &&
        ((m.weightKg ?? null) !== null || (m.waistCm ?? null) !== null));
}
