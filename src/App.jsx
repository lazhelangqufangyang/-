import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { loadState, saveState } from './store.js';
import { buildFramework } from './engine/week.js';
import { addPlannedSet, buildSheet, cutPlannedSet, moveSlot, swapSlotExercise, toggleDropSet, wantAreasOf } from './engine/day.js';
import { buildWeekPlan, fwForWeek, mondayOf, planKey } from './engine/weekplan.js';
import { todayIso, weekdayOf } from './engine/time.js';
import { byId } from './engine/exercises.js';
// 一级页面都在 pages/，可复用组件在 components/，业务引擎在 engine/
import WelcomePage from './pages/WelcomePage.jsx';
import SplashPage from './pages/SplashPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import TrainingPage from './pages/TrainingPage.jsx';
import SessionPage from './pages/SessionPage.jsx';
import RecordPage from './pages/RecordPage.jsx';
import DietPage from './pages/DietPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProfilePage from './pages/ProfilePage';
import MovesPage from './pages/MovesPage';
import PickPage from './pages/PickPage.jsx';
import PlanPage from './pages/PlanPage.jsx';
import { pickUpTokenFromHash, sessionToken } from './api/account.js';
import { weekdayName } from './engine/goals.js';
const NAV_TABS = [
    { href: '#/train', label: '运动', ico: 'dumbbell' },
    { href: '#/moves', label: '动作', ico: 'zeus' },
    { href: '#/log', label: '记录', ico: 'log' },
    { href: '#/diet', label: '饮食', ico: 'rice' },
    { href: '#/settings', label: '个人', ico: 'user' }
];
/**
 * 底部五个板块各占一条历史：手机的返回键按一下就是回到上一个板块。
 * 板块内部的页面（执行、加动作、选部位、设置子页）只改写当前这条，不另占一步。
 */
const TAB_HREFS = NAV_TABS.map((t) => t.href);
function tabOfRoute(r) {
    if (r === 'settings' || String(r).startsWith('settings/'))
        return '#/settings';
    return TAB_HREFS.find((h) => h === `#/${r}`) ?? '';
}
/** 底部导航的图形标：stroke 走 currentColor，选中态跟着变红 */
function TabIco({ name }) {
    if (name === 'user') {
        return <User className="ico" strokeWidth={1.7} aria-hidden="true"/>;
    }
    const paths = {
        dumbbell: (<>
        <path d="M3.5 9.5v5M6.5 7.5v9M17.5 7.5v9M20.5 9.5v5"/>
        <path d="M6.5 12h11"/>
      </>),
        zeus: (<>
        <path d="M2.5 4.5v4M5.5 6.5h13M21.5 4.5v4"/>
        <path d="M5.5 6.5 9 9M18.5 6.5 15 9"/>
        <circle cx="12" cy="11.4" r="2"/>
        <path d="M12 13.4V17.5M12 17.5l-2.4 4M12 17.5l2.4 4"/>
      </>),
        log: (<>
        <rect x="3.5" y="5" width="17" height="15" rx="3"/>
        <path d="M8 3v4M16 3v4M3.5 10h17"/>
        <path d="M8 14.5h4"/>
      </>),
        rice: (<>
        <path d="M3 12.5h18a9 8 0 0 1-18 0z"/>
        <path d="M5.5 12.5a6.5 4 0 0 1 13 0"/>
        <path d="M8.5 8.5c-.6-1.4-.2-2.4.6-3.2M12.5 8c-.7-1.6-.2-2.8.7-3.7M16 8.7c-.5-1.2-.2-2.1.5-2.8"/>
      </>)
    };
    return (<svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      {paths[name]}
    </svg>);
}
/** 可以路由到的第一级；session、pick、plan 和 setup 不在底部导航里 */
const ROUTES = ['train', 'moves', 'log', 'diet', 'settings', 'session', 'pick', 'plan'];
/** 设置里的模块，每个都是一个子页面 */
const SETTINGS_MODULES = ['profile', 'account', 'data', 'safety'];
const TITLES = {
    train: '我的运动',
    moves: '动作选择',
    log: '运动记录',
    diet: '饮食记录',
    settings: '个人',
    'settings/account': '账号',
    'settings/data': '数据与备份',
    'settings/safety': '安全边界'
};
function normalize(hash, onboarded) {
    const segs = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    const head = segs[0] ?? '';
    // 分步表单要能自己走进去：首屏点了「自动生成训练清单」就是这儿
    if (head === 'setup')
        return 'setup';
    if (!onboarded)
        return 'welcome';
    // 老的「今天」「周框架」两个标签合成一个「运动」，「档案」搬进设置，「问」这一页整个删了
    if (head === 'today' || head === 'framework' || head === 'ask')
        return 'train';
    if (head === 'profile')
        return 'settings/profile';
    if (head === 'settings') {
        const sub = segs[1] ?? '';
        return SETTINGS_MODULES.includes(sub) ? `settings/${sub}` : 'settings';
    }
    return ROUTES.includes(head) ? head : 'train';
}
export default function App() {
    const [splash, setSplash] = useState(true);
    return (<>
      {splash ? <SplashPage onEnter={() => setSplash(false)} /> : null}
      <AppInner />
    </>);
}
function AppInner() {
    const [state, setState] = useState(() => loadState());
    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        try {
            return Boolean(sessionToken()) || localStorage.getItem('fitplan.mockAuth') === '1';
        }
        catch {
            return false;
        }
    });
    /** 登录过就不再把开头的欢迎页顶出来：换了设备登同一个账号也是直接进运动页 */
    const entered = state.onboardingDone || isLoggedIn;
    const [route, setRoute] = useState(() => normalize(window.location.hash, entered));
    const tabRef = useRef(tabOfRoute(route));
    /** 记一条运动时，动作要去「动作」页挑；这里存着还没提交的那一条 */
    const [recPick, setRecPick] = useState(null);
    useEffect(() => {
        const onHash = () => {
            const next = normalize(window.location.hash, state.onboardingDone || isLoggedIn);
            const tab = tabOfRoute(next);
            if (tab)
                tabRef.current = tab;
            setRoute(next);
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, [state.onboardingDone, isLoggedIn]);
    // 设置页拿到真实令牌后，同步成登录态；Mock 登录则直接写本地标记。
    useEffect(() => {
        if (sessionToken())
            setIsLoggedIn(true);
    }, [route]);
    // 支付宝登录回来时令牌挂在 URL 片段上：收进 localStorage、把地址栏洗干净
    useEffect(() => {
        if (pickUpTokenFromHash()) {
            setIsLoggedIn(true);
            setRoute(normalize('#/settings', true));
        }
    }, [state.onboardingDone]);
    useEffect(() => {
        saveState(state);
    }, [state]);
    const go = useCallback((href) => {
        const tab = TAB_HREFS.includes(href) ? href : '';
        // 只有跨板块才留一条历史，板块内部怎么跳都改写当前这条：手机的返回键按一下就是上一个板块
        if (tab && tab !== tabRef.current) window.location.hash = href;
        else history.replaceState(null, '', href);
        if (tab)
            tabRef.current = tab;
        setRoute(normalize(href, true));
    }, []);
    const today = todayIso();
    const sheet = useMemo(() => state.sheets.find((s) => s.date === today) ?? null, [state.sheets, today]);
    // 自选动作只管一天：昨天点的不会跑到今天来
    const pickedToday = useMemo(() => (state.pickedDate === today ? state.picked : []), [state.picked, state.pickedDate, today]);
    const patch = useCallback((p) => setState((s) => ({ ...s, ...p })), []);
    const weekStart = mondayOf(today);
    // 周计划层跟着框架走：框架重排或换周就重铺日期，拖拽和改动作只动这一层
    useEffect(() => {
        setState((s) => {
            if (!s.framework)
                return s.weekPlan ? { ...s, weekPlan: null } : s;
            if (s.weekPlan && s.weekPlan.weekStart === weekStart && s.weekPlan.key === planKey(s.framework))
                return s;
            return { ...s, weekPlan: buildWeekPlan(s.framework, weekStart) };
        });
    }, [state.framework, weekStart]);
    // 进运动页就直接看到计划：今天还没有表就按周计划层自动排一张，不用先点生成
    useEffect(() => {
        if (route.split('/')[0] !== 'train' || !state.onboardingDone)
            return;
        setState((s) => {
            if (!s.framework || !s.weekPlan || s.sheets.some((x) => x.date === today))
                return s;
            const next = buildSheet(s.profile, fwForWeek(s.framework, s.weekPlan), { totalMinutes: null, wantArea: null, wantAreas: [] }, s.setLogs, today, {
                picked: s.pickedDate === today ? s.picked : [],
                acts: s.activityLogs,
                skipped: []
            });
            return { ...s, sheets: [...s.sheets, next].sort((a, b) => (a.date < b.date ? -1 : 1)) };
        });
    }, [route, state.onboardingDone, state.framework, state.weekPlan, today]);
    const finishOnboarding = useCallback((profile, _goal, framework) => {
        setState((s) => ({
            ...s,
            profile,
            // 从设置里的「我的档案」进来改数据时，沿用原来框架的开始日期，不然第几周会被清零
            framework: s.framework && framework ? { ...framework, id: s.framework.id, startDate: s.framework.startDate } : framework,
            onboardingDone: true
        }));
        go('#/train');
    }, [go]);
    /** 首屏选「直接开始使用」：一个问题都不问，进运动页就能开始 */
    const chooseDirect = useCallback(() => {
        setState((s) => ({ ...s, onboardingDone: true }));
        go('#/train');
    }, [go]);
    /** 首屏选「自动生成训练清单」：先把那两问答了（每问都能跳过），答完才排框架 */
    const choosePlan = useCallback(() => go('#/setup'), [go]);
    const regenerateFramework = useCallback(() => {
        setState((s) => {
            if (!s.profile.goal)
                return s;
            return {
                ...s,
                framework: buildFramework(s.profile, s.profile.goal, { id: s.framework?.id, startDate: s.framework?.startDate }, s.favorites)
            };
        });
    }, []);
    const upsertSheet = useCallback((next, logs) => {
        setState((s) => {
            const others = s.sheets.filter((x) => x.date !== next.date);
            return {
                ...s,
                sheets: [...others, next].sort((a, b) => (a.date < b.date ? -1 : 1)),
                setLogs: logs ?? s.setLogs
            };
        });
    }, []);
    const generateToday = useCallback((input, keepSkipped = []) => {
        // 自由训练：framework 为 null、或者你选了「今天自由练」，都按点的部位/动作现排
        const base = fwForInput(state.framework, input);
        const next = buildSheet(state.profile, base ? fwForWeek(state.framework, state.weekPlan) : null, input, state.setLogs, today, {
            picked: pickedToday,
            acts: state.activityLogs,
            skipped: keepSkipped
        });
        upsertSheet(next);
        return next;
    }, [state.framework, state.weekPlan, state.profile, state.setLogs, state.activityLogs, today, pickedToday, upsertSheet]);
    /**
     * 覆盖式训练：从「今天练哪里」回来后，今天这张表和周历上今天的主题都以新选择为准。
     * 这里故意不把周框架交给 buildSheet —— 用户明确改过的部位，不能被原来的训练日安排稀释。
     */
    const overrideToday = useCallback((areas, free) => {
        const clean = [...new Set((areas ?? []).filter(Boolean))];
        setState((s) => {
            const input = { totalMinutes: null, wantArea: clean[0] ?? null, wantAreas: clean, free: Boolean(free), direct: false, override: true };
            const built = buildSheet(s.profile, null, input, s.setLogs, today, {
                picked: s.pickedDate === today ? s.picked : [],
                acts: s.activityLogs,
                skipped: []
            });
            const focus = clean.length ? clean.join(' / ') : '自由安排';
            const next = { ...built, focus };
            const actionIds = [...new Set(next.slots
                    .filter((x) => x.exId && x.kind !== 'warmupGeneral' && x.kind !== 'warmupMobility' && x.kind !== 'cooldown')
                    .map((x) => x.exId))];
            const weekStart = mondayOf(today);
            const baseWeek = s.weekPlan ?? buildWeekPlan(s.framework, weekStart);
            const day = {
                ...(baseWeek.days?.[today] ?? {}),
                weekday: weekdayOf(today),
                role: clean.length ? clean.join('+') : '自选',
                focus,
                headline: `今天按你的选择：${focus}`,
                mainLiftId: next.slots.find((x) => x.kind === 'main')?.exId ?? actionIds[0] ?? null,
                exerciseIds: actionIds,
                substitutions: [],
                warmupMin: 0,
                mainMin: 0,
                cardioMin: Math.round(next.slots.filter((x) => x.kind === 'cardio').reduce((n, x) => n + x.durationSec, 0) / 60),
                cooldownMin: 0
            };
            return {
                ...s,
                sheets: [...s.sheets.filter((x) => x.date !== today), next].sort((a, b) => (a.date < b.date ? -1 : 1)),
                weekPlan: {
                    ...baseWeek,
                    weekStart: baseWeek.weekStart ?? weekStart,
                    key: baseWeek.key ?? planKey(s.framework),
                    days: { ...baseWeek.days, [today]: day }
                }
            };
        });
        go('#/train');
    }, [today, go]);
    /**
     * 自由训练：表上只有你自己点过的动作，一个都没点就是一张空表。
     * 今天的表已经记过组就不重建 —— 换一张表等于换 sheetId，上午记的组就找不到家了。
     */
    const startDirect = useCallback(() => {
        setState((s) => {
            const cur = s.sheets.find((x) => x.date === today) ?? null;
            const picks = s.pickedDate === today ? s.picked : [];
            const logged = cur ? s.setLogs.some((l) => l.sheetId === cur.id) : false;
            // 已经记过组的表不重建（重建会换 sheetId，上午记的组就找不到家了），只把新点的动作接在表尾
            if (cur && logged) {
                const merged = withPickedExtras(cur, picks, s.profile, s.setLogs, s.activityLogs, today);
                return merged === cur ? s : { ...s, sheets: s.sheets.map((x) => (x.date === today ? merged : x)) };
            }
            const next = buildSheet(s.profile, null, { totalMinutes: null, wantArea: null, wantAreas: [], direct: true }, s.setLogs, today, {
                picked: picks,
                acts: s.activityLogs,
                skipped: []
            });
            const merged = cur ? { ...next, id: cur.id } : next;
            return { ...s, sheets: [...s.sheets.filter((x) => x.date !== today), merged].sort((a, b) => (a.date < b.date ? -1 : 1)) };
        });
        go('#/session');
    }, [today, go]);
    /** 加动作：在这一屏里挑，挑完直接回训练，不去「动作」标签页 */
    const openPick = useCallback(() => {
        if (!sheet) {
            generateToday({ totalMinutes: null, wantArea: null, wantAreas: [], direct: true }, []);
        }
        go('#/pick');
    }, [sheet, generateToday, go]);
    /** 某一行今天不练：这一行直接从今天的清单里去掉，组数不再算进分母 */
    const toggleSkip = useCallback((slotId) => {
        setState((s) => ({
            ...s,
            sheets: s.sheets.map((x) => x.date === today
                ? { ...x, skipped: x.skipped.includes(slotId) ? x.skipped.filter((i) => i !== slotId) : [...x.skipped, slotId] }
                : x)
        }));
    }, [today]);
    const addSet = useCallback((slotId) => {
        if (!sheet)
            return;
        upsertSheet(addPlannedSet(sheet, slotId));
    }, [sheet, upsertSheet]);
    const cutSet = useCallback((slotId, setIdx) => {
        if (!sheet)
            return;
        const next = cutPlannedSet(sheet, slotId, setIdx, state.setLogs);
        upsertSheet(next.sheet, next.logs);
    }, [sheet, state.setLogs, upsertSheet]);
    const dropSet = useCallback((slotId) => {
        if (!sheet)
            return;
        const next = toggleDropSet(sheet, slotId, state.setLogs);
        upsertSheet(next.sheet, next.logs);
    }, [sheet, state.setLogs, upsertSheet]);
    /** 拖卡片改这一天的动作顺序 */
    const reorder = useCallback((dragId, overId) => {
        if (!sheet)
            return;
        upsertSheet(moveSlot(sheet, dragId, overId));
    }, [sheet, upsertSheet]);
    const swap = useCallback((slotId, newExId) => {
        if (!sheet)
            return;
        const base = fwForInput(state.framework, sheet.input);
        const next = swapSlotExercise(state.profile, base ? fwForWeek(state.framework, state.weekPlan) : null, sheet, slotId, newExId, state.setLogs, pickedToday, state.activityLogs, sheet.skipped);
        upsertSheet(next);
    }, [sheet, state.framework, state.weekPlan, state.profile, state.setLogs, state.activityLogs, pickedToday, upsertSheet]);
    const startWorkout = useCallback(() => {
        setState((s) => {
            const cur = s.sheets.find((x) => x.date === today) ?? null;
            if (!cur)
                return s;
            // 表上还是原来的框架动作时，把「本次训练」点进来的动作补进去，开始训练就能看到
            const merged = withPickedExtras(cur, s.pickedDate === today ? s.picked : [], s.profile, s.setLogs, s.activityLogs, today);
            return merged === cur ? s : { ...s, sheets: s.sheets.map((x) => (x.date === today ? merged : x)) };
        });
        if (!sheet)
            generateToday({ totalMinutes: null, wantArea: null, wantAreas: [] }, []);
        go('#/session');
    }, [sheet, generateToday, go, today]);
    /**
     * 「动作」页点「＋今天」：只改今天，换天自动作废。已有的表如果没有记录就立刻重排，
     * 已经有记录就不动它，免得你标过的组被新的 slotId 冲掉。
     */
    const togglePick = useCallback((exId) => {
        setState((s) => {
            const base = s.pickedDate === today ? s.picked : [];
            const next = base.includes(exId) ? base.filter((x) => x !== exId) : [...base, exId];
            const todaySheet = s.sheets.find((x) => x.date === today) ?? null;
            const logged = todaySheet ? s.setLogs.some((l) => l.sheetId === todaySheet.id) : false;
            const sheets = todaySheet && !logged
                ? s.sheets.map((x) => x.date === today
                    ? buildSheet(s.profile, fwForInput(s.framework, x.input) ? fwForWeek(s.framework, s.weekPlan) : null, x.input, s.setLogs, x.date, {
                        overrides: x.overrides,
                        picked: next,
                        acts: s.activityLogs,
                        skipped: x.skipped
                    })
                    : x)
                : todaySheet
                    ? s.sheets.map((x) => (x.date === today
                        ? withPickedExtras(withoutUnpickedExtras(x, next), next, s.profile, s.setLogs, s.activityLogs, today)
                        : x))
                    : s.sheets;
            return { ...s, picked: next, pickedDate: today, sheets };
        });
    }, [today]);
    /**
     * 收藏就立刻影响本周计划：重排一遍框架，收藏的动作优先顶掉同主动肌的默认动作。
     * 动作一个都没变时保留原框架，免得白冲掉本周在计划表里拖过的顺序。
     */
    const toggleFavorite = useCallback((exId) => {
        setState((s) => {
            const favorites = s.favorites.includes(exId) ? s.favorites.filter((x) => x !== exId) : [...s.favorites, exId];
            const goal = s.profile.goal ?? null;
            if (!goal || !s.framework)
                return { ...s, favorites };
            const framework = buildFramework(s.profile, goal, { id: s.framework.id, startDate: s.framework.startDate }, favorites);
            const same = framework.days.length === s.framework.days.length
                && framework.days.every((d, i) => d.exerciseIds.join('|') === s.framework.days[i].exerciseIds.join('|'));
            return { ...s, favorites, framework: same ? s.framework : framework };
        });
    }, []);
    const addLogs = useCallback((logs) => {
        setState((s) => ({ ...s, setLogs: [...s.setLogs, ...logs] }));
    }, []);
    const addActivity = useCallback((a) => {
        setState((s) => ({ ...s, activityLogs: [...s.activityLogs, a] }));
    }, []);
    /** 从记录页跳到「动作」页挑动作：先记住是给哪天挑 */
    const startRecPick = useCallback((date) => {
        setRecPick((r) => r ?? { date, exIds: [] });
        go('#/moves');
    }, [go]);
    const toggleRecPick = useCallback((exId) => {
        setRecPick((r) => (r ? { ...r, exIds: r.exIds.includes(exId) ? r.exIds.filter((x) => x !== exId) : [...r.exIds, exId] } : r));
    }, []);
    /** 挑完回记录页；清空是提交那条记录之后做的 */
    const endRecPick = useCallback(() => go('#/log'), [go]);
    const clearRecPick = useCallback(() => setRecPick(null), []);
    /** 记录页里「记下」一条：先落库，再把这次挑选清干净，下次进来自动回到日历而不是添加入口 */
    const addActivityFromLog = useCallback((a) => {
        addActivity(a);
        clearRecPick();
    }, [addActivity, clearRecPick]);
    /** 没有真实登录接口时，用本地标记模拟登录，便于测试游客/登录两种状态 */
    const mockLogin = useCallback(() => {
        try {
            localStorage.setItem('fitplan.mockAuth', '1');
        }
        catch {
            /* 隐私模式下仍允许本次会话登录 */
        }
        setIsLoggedIn(true);
    }, []);
    const handleLogout = useCallback(() => {
        try {
            localStorage.removeItem('fitplan.mockAuth');
        }
        catch {
            /* ignore */
        }
        setIsLoggedIn(false);
    }, []);
    const removeActivity = useCallback((id) => {
        setState((s) => ({ ...s, activityLogs: s.activityLogs.filter((x) => x.id !== id) }));
    }, []);
    /** 记录页左滑删掉一条按组记录：只清这一天这个动作的组，不动别的 */
    const removeExercise = useCallback((date, exId) => {
        setState((s) => ({ ...s, setLogs: s.setLogs.filter((l) => !(l.date === date && l.exId === exId)) }));
    }, []);
    /** 删掉这天的记录：按组记的组和自己记的运动一起清掉，那张表本身留着 */
    const removeDayLogs = useCallback((date) => {
        setState((s) => ({
            ...s,
            setLogs: s.setLogs.filter((l) => l.date !== date),
            activityLogs: s.activityLogs.filter((a) => a.date !== date)
        }));
    }, []);
    const addMeal = useCallback((m) => {
        setState((s) => ({ ...s, mealLogs: [...s.mealLogs, m] }));
    }, []);
    const removeMeal = useCallback((id) => {
        setState((s) => ({ ...s, mealLogs: s.mealLogs.filter((x) => x.id !== id) }));
    }, []);
    const saveSettings = useCallback((settings) => patch({ settings }), [patch]);
    const importState = useCallback((next) => {
        setState(next);
        const target = next.onboardingDone ? '#/train' : '#/welcome';
        setRoute(normalize(target, next.onboardingDone));
        window.location.hash = target;
    }, []);
    if (route === 'welcome') {
        return <WelcomePage onDirect={chooseDirect} onPlan={choosePlan}/>;
    }
    if (route === 'setup') {
        return <OnboardingPage initial={state.profile} settings={state.settings} favorites={state.favorites} editing={false} onDone={finishOnboarding}/>;
    }
    // 「我的档案」搬进设置了，但它本身是整屏的分步表单，跟训练执行页一样不套底部导航
    if (route === 'settings/profile') {
        return (<OnboardingPage initial={state.profile} settings={state.settings} favorites={state.favorites} editing onExit={() => go('#/settings')} onDone={(profile, _goal, framework) => {
                setState((s) => ({ ...s, profile, framework: framework ?? null }));
                go('#/settings');
            }}/>);
    }
    const tab = route.split('/')[0];
    const isTrain = tab === 'train';
    const isBarePage = route === 'log' || route === 'settings' || route === 'moves';
    const weekNo = state.framework
        ? Math.min(state.framework.weeksTotal, Math.floor((Date.now() - new Date(`${state.framework.startDate}T00:00:00`).getTime()) / 86400000 / 7) + 1)
        : null;
    return (<div className="app">
      {route === 'session' ? (<SessionPage sheet={sheet} profile={state.profile} settings={state.settings} logs={state.setLogs} onSwap={swap} onSkip={toggleSkip} onAddSet={addSet} onCutSet={cutSet} onDropSet={dropSet} onAddLogs={addLogs} onExit={() => go('#/train')} onGoPick={openPick}/>) : route === 'pick' ? (<PickPage profile={state.profile} picked={pickedToday} favorites={state.favorites} onToggle={togglePick} onDone={() => go('#/session')}/>) : route === 'plan' ? (<PlanPage framework={state.framework} wantAreas={wantAreasOf(sheet?.input ?? { totalMinutes: null, wantArea: null })} todayFocus={state.weekPlan?.days?.[today]?.focus ?? sheet?.focus ?? ''} free={sheet?.input.free ?? false} onBack={() => go('#/train')} onGenerate={overrideToday}/>) : (<>
          {!isBarePage && (<header className={`topbar${isTrain ? ' train-head' : ''}`}>
            <div>
              <h1>{TITLES[route] ?? TITLES[tab] ?? '运动'}</h1>
              <div className="sub num">
                {todayIso()} {weekdayName(weekdayOf(today))}
                {!isTrain && (state.framework
                ? ` · 第 ${weekNo} 周`
                : ' · 自由训练')}
              </div>
            </div>
          </header>)}
          <main className="screen" style={isBarePage ? { padding: 0, maxWidth: 'none' } : undefined}>
            {tab === 'train' ? (<TrainingPage profile={state.profile} sheet={sheet} weekPlan={state.weekPlan} favorites={state.favorites} logs={state.setLogs} picked={pickedToday} onSkip={toggleSkip} onReorder={reorder} onRegenerateFramework={regenerateFramework} onStart={startWorkout} onStartDirect={startDirect} onGoPlan={() => go('#/plan')} onGoSetup={() => go('#/setup')} onGoMoves={() => go('#/moves')} onTogglePick={togglePick}/>) : null}
            {tab === 'moves' ? (<MovesPage picked={pickedToday} onTogglePick={togglePick}/>) : null}
            {tab === 'log' ? (<RecordPage sheets={state.sheets} logs={state.setLogs} activities={state.activityLogs} recPick={recPick} onStartPick={startRecPick} onToggleRecPick={toggleRecPick} onPickDone={endRecPick} onAdd={addActivityFromLog} onRemove={removeActivity} onRemoveExercise={removeExercise} onGoToday={() => go('#/train')}/>) : null}
            {tab === 'diet' ? (<DietPage profile={state.profile} meals={state.mealLogs} onAdd={addMeal} onRemove={removeMeal} onGoToday={() => go('#/train')} onGoProfile={() => go('#/settings/profile')}/>) : null}
            {tab === 'settings' ? (route === 'settings'
                ? <ProfilePage key={isLoggedIn ? 'auth' : 'guest'} isLoggedIn={isLoggedIn} onLogin={mockLogin} onLogout={handleLogout} onOpenModule={(module) => go(`#/settings/${module}`)}/>
                : (<SettingsPage state={state} sub={route.split('/')[1]} onGo={go} onSave={saveSettings} onImport={importState}/>)) : null}
          </main>
          <nav className="tabbar">
            {NAV_TABS.map((t) => (<button key={t.href} aria-current={tab === t.href.replace('#/', '') ? 'page' : undefined} onClick={() => go(t.href)}>
                <TabIco name={t.ico}/>
                {t.label}
              </button>))}
          </nav>
        </>)}
    </div>);
}
/** 选了「今天自由练」或「直接开始使用」都不把周框架交给引擎：这一张表现排，框架本身不动 */
function fwForInput(fw, input) {
    return input.free || input.direct ? null : fw;
}
/**
 * 把「本次训练」里点了、但今天这张表上还没有的动作接在表尾。
 * 只加行、不重建：重建会换 slotId，已经记过的组就找不到家了。
 */
function withPickedExtras(sheet, pickedIds, profile, logs, acts, today) {
    if (!sheet || !pickedIds?.length)
        return sheet;
    const have = new Set(sheet.slots.map((s) => s.exId).filter(Boolean));
    const missing = [...new Set(pickedIds)].filter((id) => !have.has(id) && byId(id));
    if (!missing.length)
        return sheet;
    const filler = buildSheet(profile, null, { totalMinutes: null, wantArea: null, wantAreas: [], direct: true }, logs, today, {
        picked: missing,
        acts,
        skipped: []
    });
    const extras = filler.slots
        .filter((s) => s.exId && s.kind !== 'warmupGeneral' && s.kind !== 'warmupMobility' && s.kind !== 'cooldown')
        .map((s) => ({ ...s, id: `extra-${s.exId}` }));
    if (!extras.length)
        return sheet;
    // 插在「放松」前面：拉伸还是留在最后一行
    const cool = sheet.slots.findIndex((s) => s.kind === 'cooldown');
    const slots = cool < 0
        ? [...sheet.slots, ...extras]
        : [...sheet.slots.slice(0, cool), ...extras, ...sheet.slots.slice(cool)];
    // 有氧/器械不符这类「为什么没排进来」的说明也带上，执行页能点开看
    const flags = [...new Set([...(sheet.flags ?? []), ...(filler.flags ?? [])])];
    return { ...sheet, slots, flags };
}
/** 取消勾选的动作：只撤掉它自己补进来的那几行，框架原有的行不动 */
function withoutUnpickedExtras(sheet, pickedIds) {
    const keep = new Set(pickedIds);
    const slots = sheet.slots.filter((s) => !String(s.id).startsWith('extra-') || keep.has(s.exId));
    return slots.length === sheet.slots.length ? sheet : { ...sheet, slots };
}
