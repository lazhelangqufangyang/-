import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadState, saveState } from './store.js';
import { buildFramework } from './engine/week.js';
import { addPlannedSet, buildSheet, cutPlannedSet, moveSlot, swapSlotExercise, toggleDropSet, wantAreasOf } from './engine/day.js';
import { buildWeekPlan, fwForWeek, mondayOf, moveDay, planKey, setDayExercises } from './engine/weekplan.js';
import { todayIso, weekdayOf } from './engine/time.js';
import Onboarding from './ui/Onboarding.jsx';
import Timeline from './ui/Timeline.jsx';
import FrameworkView from './ui/FrameworkView.jsx';
import SessionView from './ui/SessionView.jsx';
import SettingsView from './ui/SettingsView.jsx';
import ExerciseView from './ui/ExerciseView.jsx';
import LogbookView from './ui/LogbookView.jsx';
import DietView from './ui/DietView.jsx';
import MovePick from './ui/MovePick.jsx';
import PlanPick from './ui/PlanPick.jsx';
import PlanBoard from './ui/PlanBoard.jsx';
import Welcome from './ui/Welcome.jsx';
import Splash from './ui/Splash.jsx';
import { pickUpTokenFromHash } from './api/account.js';
import { weekdayName } from './engine/goals.js';
const NAV_TABS = [
    { href: '#/train', label: '运动', ico: 'dumbbell' },
    { href: '#/moves', label: '动作', ico: 'zeus' },
    { href: '#/log', label: '记录', ico: 'log' },
    { href: '#/diet', label: '饮食', ico: 'rice' },
    { href: '#/settings', label: '设置', ico: 'gear' }
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
      </>),
        gear: (<>
        <circle cx="12" cy="12" r="3.2"/>
        <path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/>
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
    settings: '设置',
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
    const [route, setRoute] = useState(() => normalize(window.location.hash, state.onboardingDone));
    const tabRef = useRef(tabOfRoute(route));
    /** 记一条运动时，动作要去「动作」页挑；这里存着还没提交的那一条 */
    const [recPick, setRecPick] = useState(null);
    useEffect(() => {
        const onHash = () => {
            const next = normalize(window.location.hash, state.onboardingDone);
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
            setRoute(normalize('#/settings', state.onboardingDone));
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
                framework: buildFramework(s.profile, s.profile.goal, { id: s.framework?.id, startDate: s.framework?.startDate })
            };
        });
    }, []);
    /**
     * 「改计划」把一句话落到档案后重建框架。今天的表如果已经有记录就不动它，
     * 免得组数标记被重建后的新 slotId 冲掉；没有记录就直接重排，所见即所得。
     * 自由训练（没有目标）不凭空造目标：只换档案，框架保持空。
     */
    const applyTweak = useCallback((nextProfile) => {
        setState((s) => {
            const goal = s.profile.goal ?? null;
            const framework = goal
                ? buildFramework({ ...nextProfile, goal }, goal, { id: s.framework?.id, startDate: s.framework?.startDate })
                : null;
            const todaySheet = s.sheets.find((x) => x.date === today) ?? null;
            const logged = todaySheet ? s.setLogs.some((l) => l.sheetId === todaySheet.id) : false;
            const sheets = todaySheet && !logged
                ? s.sheets.map((x) => x.date === today
                    ? buildSheet({ ...nextProfile, goal }, fwForInput(framework, x.input), x.input, s.setLogs, x.date, {
                        overrides: x.overrides,
                        picked: s.pickedDate === today ? s.picked : [],
                        acts: s.activityLogs,
                        skipped: x.skipped
                    })
                    : x)
                : s.sheets;
            return { ...s, profile: { ...nextProfile, goal }, framework, sheets };
        });
    }, [today]);
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
     * 直接开始使用：不生成清单，表上只有你自己点过的动作，一个都没点就是一张空表。
     * 今天的表已经存在就一定不重建 —— 换一张表等于换 sheetId，上午记的组就找不到家了。
     */
    const startDirect = useCallback(() => {
        if (!sheet) {
            generateToday({ totalMinutes: null, wantArea: null, wantAreas: [], direct: true }, []);
        }
        go('#/session');
    }, [sheet, generateToday, go]);
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
    /** 拖卡片换日期：只动周计划层，今天的表没记过组就跟着重排 */
    const movePlanDay = useCallback((from, to) => {
        setState((s) => {
            const weekPlan = moveDay(s.weekPlan, from, to);
            if (weekPlan === s.weekPlan)
                return s;
            return { ...s, weekPlan, sheets: withTodaySheet(s, weekPlan, today) };
        });
    }, [today]);
    /** 点进某一天改动作：加、删、换都落在周计划层上 */
    const editPlanDay = useCallback((date, ids) => {
        setState((s) => {
            const weekPlan = setDayExercises(s.weekPlan, date, ids);
            if (weekPlan === s.weekPlan)
                return s;
            return { ...s, weekPlan, sheets: withTodaySheet(s, weekPlan, today) };
        });
    }, [today]);
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
    const toggleFavorite = useCallback((exId) => {
        setState((s) => ({
            ...s,
            favorites: s.favorites.includes(exId) ? s.favorites.filter((x) => x !== exId) : [...s.favorites, exId]
        }));
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
    const addMeasure = useCallback((m) => {
        setState((s) => ({ ...s, measureLogs: [...s.measureLogs, m] }));
    }, []);
    const removeMeasureDay = useCallback((date) => {
        setState((s) => ({ ...s, measureLogs: s.measureLogs.filter((x) => x.date !== date) }));
    }, []);
    /** 打卡的体重写进档案：热量参考立刻跟着走，力量参照等下一次重排框架时带上 */
    const syncProfileWeight = useCallback((kg) => {
        setState((s) => ({ ...s, profile: { ...s.profile, weightKg: kg } }));
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
        return <Onboarding initial={state.profile} settings={state.settings} editing={false} onDone={finishOnboarding}/>;
    }
    // 「我的档案」搬进设置了，但它本身是整屏的分步表单，跟训练执行页一样不套底部导航
    if (route === 'settings/profile') {
        return (<Onboarding initial={state.profile} settings={state.settings} editing onExit={() => go('#/settings')} onDone={(profile, _goal, framework) => {
                setState((s) => ({ ...s, profile, framework: framework ?? null }));
                go('#/settings');
            }}/>);
    }
    const tab = route.split('/')[0];
    return (<div className="app">
      {route === 'session' ? (<SessionView sheet={sheet} profile={state.profile} settings={state.settings} logs={state.setLogs} onSwap={swap} onSkip={toggleSkip} onAddSet={addSet} onCutSet={cutSet} onDropSet={dropSet} onAddLogs={addLogs} onExit={() => go('#/train')} onGoLog={() => go('#/log')} onGoPick={openPick}/>) : route === 'pick' ? (<MovePick profile={state.profile} picked={pickedToday} favorites={state.favorites} onToggle={togglePick} onDone={() => go('#/session')}/>) : route === 'plan' ? (<PlanPick framework={state.framework} wantAreas={wantAreasOf(sheet?.input ?? { totalMinutes: null, wantArea: null })} free={sheet?.input.free ?? false} onBack={() => go('#/train')} onGenerate={(areas, free) => { generateToday({ totalMinutes: sheet?.input.totalMinutes ?? null, wantArea: areas[0] ?? null, wantAreas: areas, free, direct: false }, sheet?.skipped ?? []); go('#/train'); }}/>) : (<>
          <header className="topbar">
            <div>
              <h1>{TITLES[route] ?? TITLES[tab] ?? '运动'}</h1>
              <div className="sub num">
                {todayIso()} {weekdayName(weekdayOf(today))}
                {state.framework
                ? ` · 第 ${Math.min(state.framework.weeksTotal, Math.floor((Date.now() - new Date(`${state.framework.startDate}T00:00:00`).getTime()) / 86400000 / 7) + 1)} 周`
                : ' · 自由训练'}
              </div>
            </div>
          </header>
          <main className="screen">
            {tab === 'train' ? (<TrainView profile={state.profile} framework={state.framework} sheet={sheet} weekPlan={state.weekPlan} favorites={state.favorites} onGenerate={generateToday} onSkip={toggleSkip} onReorder={reorder} onRegenerateFramework={regenerateFramework} onStart={startWorkout} onStartDirect={startDirect} onGoPlan={() => go('#/plan')} onMoveDay={movePlanDay} onEditDay={editPlanDay} onApplyProfile={applyTweak} onGoProfile={() => go('#/settings/profile')}/>) : null}
            {tab === 'moves' ? (<ExerciseView profile={state.profile} favorites={state.favorites} picked={pickedToday} logs={state.setLogs} date={today} onToggleFavorite={toggleFavorite} onTogglePick={togglePick} pickFor={recPick?.date ?? null} recordPicks={recPick?.exIds ?? []} onToggleRecordPick={toggleRecPick} onFinishRecordPick={endRecPick}/>) : null}
            {tab === 'log' ? (<LogbookView sheets={state.sheets} logs={state.setLogs} activities={state.activityLogs} measures={state.measureLogs} goal={state.profile.goal} profileWeight={state.profile.weightKg} recPick={recPick} onStartPick={startRecPick} onToggleRecPick={toggleRecPick} onPickDone={clearRecPick} onAdd={addActivity} onRemove={removeActivity} onRemoveDay={removeDayLogs} onAddMeasure={addMeasure} onRemoveMeasureDay={removeMeasureDay} onSyncProfileWeight={syncProfileWeight} onGoToday={() => go('#/train')}/>) : null}
            {tab === 'diet' ? (<DietView profile={state.profile} meals={state.mealLogs} onAdd={addMeal} onRemove={removeMeal} onGoToday={() => go('#/train')} onGoProfile={() => go('#/settings/profile')}/>) : null}
            {tab === 'settings' ? (<SettingsView state={state} sub={route === 'settings' ? '' : route.split('/')[1]} onGo={go} onSave={saveSettings} onImport={importState}/>) : null}
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
/** 周计划层改完今天的表跟着重排；已经记过组的表不动，组数标记不能丢 */
function withTodaySheet(s, weekPlan, today) {
    const cur = s.sheets.find((x) => x.date === today);
    if (!cur || s.setLogs.some((l) => l.sheetId === cur.id))
        return s.sheets;
    const next = buildSheet(s.profile, fwForWeek(s.framework, weekPlan), cur.input, s.setLogs, today, {
        overrides: cur.overrides,
        picked: s.pickedDate === today ? s.picked : [],
        acts: s.activityLogs,
        skipped: cur.skipped
    });
    return s.sheets.map((x) => (x.date === today ? { ...next, id: cur.id } : x));
}
function TrainView({ profile, framework, sheet, weekPlan, favorites, onGenerate, onSkip, onReorder, onRegenerateFramework, onStart, onStartDirect, onGoPlan, onMoveDay, onEditDay, onApplyProfile, onGoProfile }) {
    const weekday = weekdayOf(todayIso());
    const [weekOpen, setWeekOpen] = useState(false);
    const [contentOpen, setContentOpen] = useState(() => localStorage.getItem('fitplan.contentOpen') !== '0');
    useEffect(() => {
        localStorage.setItem('fitplan.contentOpen', contentOpen ? '1' : '0');
    }, [contentOpen]);
    const rowsOf = (s) => s.slots.filter((x) => !s.skipped.includes(x.id)).length;
    const setsOf = (s) => (s ? s.slots.filter((x) => !s.skipped.includes(x.id)).reduce((n, x) => n + x.setPlan.length, 0) : 0);
    const weekNo = framework
        ? Math.min(framework.weeksTotal, Math.floor((Date.now() - new Date(`${framework.startDate}T00:00:00`).getTime()) / 86400000 / 7) + 1)
        : null;
    const tag = `${weekdayName(weekday)}${weekNo ? ` · 第 ${weekNo} 周` : ''}`;
    const planSheet = sheet && !sheet.input.direct ? sheet : null;
    const directSheet = sheet?.input.direct ? sheet : null;
    const directRows = directSheet ? rowsOf(directSheet) : 0;
    const direct = {
        title: directRows ? `自选 ${directRows} 个动作` : '选择动作进行训练',
        meta: [directRows ? `${directRows} 行 · ${setsOf(directSheet)} 组` : '一行都还没加'],
        cta: planSheet ? '开始记录' : directSheet ? '继续今天的运动' : '开始运动',
        on: onStartDirect
    };
    return (<div>
      <div className="block-head">本周计划</div>
      <PlanBoard weekPlan={weekPlan} profile={profile} favorites={favorites} today={todayIso()} onMoveDay={onMoveDay} onEditDay={onEditDay} onStart={onStart}/>

      {!framework && profile.goal ? (<div className="card">
          <h3>周框架不在了</h3>
          <div className="btnbar">
            <button className="btn primary" onClick={onRegenerateFramework}>
              按现在的档案生成
            </button>
            <button className="btn ghost" onClick={onGoProfile}>
              先改档案
            </button>
          </div>
        </div>) : null}

      <div className="block-head">直接开始</div>
      <div className="hero-card right" style={{ ['--img']: "url('/direct.jpg')", ['--pos']: 'center 26%' }}>
        <div className="hero-tag">{tag}</div>
        <h2 className="hero-title">{direct.title}</h2>
        <div className="hero-meta">
          {direct.meta.map((x) => (<span key={x}>{x}</span>))}
        </div>
        <button className="hero-btn" onClick={direct.on}>
          {direct.cta}
        </button>
      </div>

      {sheet ? (<div>
          <button className="fold-head" onClick={() => setContentOpen(!contentOpen)} aria-expanded={contentOpen}>
            <span className="lb-title">训练内容 · {rowsOf(sheet)} 行 · {setsOf(sheet)} 组</span>
            <span className="lb-caret">{contentOpen ? '▾' : '▸'}</span>
          </button>
          {contentOpen ? (<>
              <Timeline sheet={sheet} profile={profile} onSkip={onSkip} onReorder={onReorder}/>
              <div className="btnbar" style={{ marginTop: 12 }}>
                <button className="btn ghost" onClick={() => onGenerate(sheet.input, sheet.skipped)}>
                  按同样条件重排
                </button>
                <button className="btn ghost" onClick={onGoPlan}>
                  改今天练哪里
                </button>
                <button className="btn ghost" onClick={onGoProfile}>
                  改档案
                </button>
              </div>
            </>) : (<div className="fold-lines">
              {sheet.slots
                    .filter((x) => !sheet.skipped.includes(x.id))
                    .slice(0, 3)
                    .map((x) => (<div className="fold-line" key={x.id}>
                    <b>{x.name}</b>
                    <span className="num">
                      {x.setPlan.length ? `${x.setPlan.length} × ${x.setPlan[0].reps}` : `约 ${Math.round(x.durationSec / 60)} 分`}
                    </span>
                  </div>))}
              {rowsOf(sheet) > 3 ? <div className="faint small">还有 {rowsOf(sheet) - 3} 行</div> : null}
            </div>)}
        </div>) : null}

      <div className="card tight" style={{ marginTop: 12 }}>
        <button className="lb-day" onClick={() => setWeekOpen(!weekOpen)} aria-expanded={weekOpen}>
          <span className="lb-title">{framework ? '这周怎么练 · 周框架与训练条件' : '训练条件 · 伤病、器械、要不要有氧'}</span>
          <span className="lb-caret">{weekOpen ? '▾' : '▸'}</span>
        </button>
        {!weekOpen && framework ? (<div className="faint small">
            {`每周 ${framework.days.length} 天 · ${framework.days.map((d) => weekdayName(d.weekday)).join('、')}`}
          </div>) : null}
      </div>
      {weekOpen ? (<div style={{ marginTop: 10 }}>
          <FrameworkView framework={framework} profile={profile} onApplyProfile={onApplyProfile}/>
        </div>) : null}
    </div>);
}
