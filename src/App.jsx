import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { loadState, saveState } from './store.js';
import { buildFramework } from './engine/week.js';
import { addPlannedSet, buildSheet, cutPlannedSet, moveSlot, swapSlotExercise, toggleDropSet, wantAreasOf } from './engine/day.js';
import { buildWeekPlan, fwForWeek, mondayOf, planKey } from './engine/weekplan.js';
import { todayIso, weekdayOf } from './engine/time.js';
import Onboarding from './ui/Onboarding.jsx';
import TrainingHome from './ui/TrainingHome.jsx';
import SettingsView from './ui/SettingsView.jsx';
import DietView from './ui/DietView.jsx';
import MovePick from './ui/MovePick.jsx';
import PlanPick from './ui/PlanPick.jsx';
import Welcome from './ui/Welcome.jsx';
import Splash from './ui/Splash.jsx';
import WorkoutPage from './components/WorkoutPage';
import RewardModal from './components/RewardModal';
import RecordPage from './components/RecordPage';
import ProfilePage from './components/ProfilePage';
import ExercisePickerPage from './components/ExercisePickerPage';
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
      {splash ? <Splash onEnter={() => setSplash(false)} /> : null}
      <AppInner />
    </>);
}
function AppInner() {
    const [state, setState] = useState(() => loadState());
    /** 登录过就不再把开头的欢迎页顶出来：换了设备登同一个账号也是直接进运动页 */
    const entered = state.onboardingDone || Boolean(sessionToken());
    const [route, setRoute] = useState(() => normalize(window.location.hash, entered));
    /** 登录/退出都会改 localStorage 里的令牌：路由变化或本地主动通知时重算一次 */
    const [authVersion, setAuthVersion] = useState(0);
    const loggedIn = useMemo(() => Boolean(sessionToken()), [route, authVersion]);
    const tabRef = useRef(tabOfRoute(route));
    /** 记一条运动时，动作要去「动作」页挑；这里存着还没提交的那一条 */
    const [recPick, setRecPick] = useState(null);
    /** 训练完成后由新 WorkoutPage 触发，奖励弹窗挂在 App 根节点 */
    const [rewardOpen, setRewardOpen] = useState(false);
    const [rewardBadge, setRewardBadge] = useState(null);
    useEffect(() => {
        const onHash = () => {
            const next = normalize(window.location.hash, state.onboardingDone || Boolean(sessionToken()));
            const tab = tabOfRoute(next);
            if (tab)
                tabRef.current = tab;
            setRoute(next);
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, [state.onboardingDone]);
    // 支付宝登录回来时令牌挂在 URL 片段上：收进 localStorage、把地址栏洗干净
    useEffect(() => {
        if (pickUpTokenFromHash())
            setRoute(normalize('#/settings', state.onboardingDone || Boolean(sessionToken())));
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
            if (cur && s.setLogs.some((l) => l.sheetId === cur.id))
                return s;
            const next = buildSheet(s.profile, null, { totalMinutes: null, wantArea: null, wantAreas: [], direct: true }, s.setLogs, today, {
                picked: s.pickedDate === today ? s.picked : [],
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
        if (!sheet)
            generateToday({ totalMinutes: null, wantArea: null, wantAreas: [] }, []);
        go('#/session');
    }, [sheet, generateToday, go]);
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
    /** 训练保存成功后打开奖励弹窗；徽章信息由后端保存接口返回 */
    const handleCompleteTraining = useCallback((record) => {
        setRewardBadge(record?.badge ?? null);
        setRewardOpen(true);
    }, []);
    const removeActivity = useCallback((id) => {
        setState((s) => ({ ...s, activityLogs: s.activityLogs.filter((x) => x.id !== id) }));
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
        return <Welcome onDirect={chooseDirect} onPlan={choosePlan}/>;
    }
    if (route === 'setup') {
        return <Onboarding initial={state.profile} settings={state.settings} favorites={state.favorites} editing={false} onDone={finishOnboarding}/>;
    }
    // 「我的档案」搬进设置了，但它本身是整屏的分步表单，跟训练执行页一样不套底部导航
    if (route === 'settings/profile') {
        return (<Onboarding initial={state.profile} settings={state.settings} favorites={state.favorites} editing onExit={() => go('#/settings')} onDone={(profile, _goal, framework) => {
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
      {route === 'session' ? (<WorkoutPage onCompleteTraining={handleCompleteTraining}/>) : route === 'pick' ? (<MovePick profile={state.profile} picked={pickedToday} favorites={state.favorites} onToggle={togglePick} onDone={() => go('#/session')}/>) : route === 'plan' ? (<PlanPick framework={state.framework} wantAreas={wantAreasOf(sheet?.input ?? { totalMinutes: null, wantArea: null })} todayFocus={state.weekPlan?.days?.[today]?.focus ?? sheet?.focus ?? ''} free={sheet?.input.free ?? false} onBack={() => go('#/train')} onGenerate={overrideToday}/>) : (<>
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
            {tab === 'train' ? (<TrainingHome profile={state.profile} sheet={sheet} weekPlan={state.weekPlan} favorites={state.favorites} logs={state.setLogs} picked={pickedToday} onSkip={toggleSkip} onReorder={reorder} onRegenerateFramework={regenerateFramework} onStart={startWorkout} onStartDirect={startDirect} onGoPlan={() => go('#/plan')} onGoSetup={() => go('#/setup')} onGoMoves={() => go('#/moves')} onTogglePick={togglePick}/>) : null}
            {tab === 'moves' ? (<ExercisePickerPage/>) : null}
            {tab === 'log' ? (<RecordPage/>) : null}
            {tab === 'diet' ? (<DietView profile={state.profile} meals={state.mealLogs} onAdd={addMeal} onRemove={removeMeal} onGoToday={() => go('#/train')} onGoProfile={() => go('#/settings/profile')}/>) : null}
            {tab === 'settings' ? (route === 'settings'
                ? <ProfilePage isLoggedIn={loggedIn} onLogin={() => go('#/settings/account')} onLogout={() => setAuthVersion((version) => version + 1)} onOpenModule={(module) => go(`#/settings/${module}`)}/>
                : (<SettingsView state={state} sub={route.split('/')[1]} onGo={go} onSave={saveSettings} onImport={importState}/>)) : null}
          </main>
          <nav className="tabbar">
            {NAV_TABS.map((t) => (<button key={t.href} aria-current={tab === t.href.replace('#/', '') ? 'page' : undefined} onClick={() => go(t.href)}>
                <TabIco name={t.ico}/>
                {t.label}
              </button>))}
          </nav>
        </>)}
      <RewardModal open={rewardOpen} onClose={() => { setRewardOpen(false); setRewardBadge(null); }} badgeId={rewardBadge?.id} badgeName={rewardBadge?.name}/>
    </div>);
}
/** 选了「今天自由练」或「直接开始使用」都不把周框架交给引擎：这一张表现排，框架本身不动 */
function fwForInput(fw, input) {
    return input.free || input.direct ? null : fw;
}
