import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { todayIso, uid } from '../engine/time.js';
import { buildEntries, monthSquares, partOf } from '../engine/logbook.js';
import { AREA_OPTIONS } from '../engine/areas.js';
import { byId } from '../engine/exercises.js';
import EffortSlider from '../components/EffortSlider.jsx';
import { StackedMetadata } from '../components/标签叠放/StackedMetadata';
import SeasonBackdrop, { seasonOfMonth } from './SeasonBackdrop.jsx';
import './logbook.css';

/**
 * ?demo=1 时用假数据演示「背部 / 手臂」按部位分组。
 * 正常访问仍然只读真实记录；假数据不会写进 localStorage。
 */
const DEMO = new URLSearchParams(window.location.search).get('demo') === '1';
const DEMO_DATE = '2026-11-07';
const MOCK_ACTIONS = [
    { id: 'mock-back-1', part: '背', title: '引体向上', core: '3组 × 12', sets: 3 },
    { id: 'mock-arm-1', part: '手臂', title: '绳索臂屈伸', core: '3组 × 12', sets: 3 },
    { id: 'mock-arm-2', part: '手臂', title: '哑铃弯举', core: '3组 × 10', sets: 3 }
];
const DEMO_ENTRY = {
    date: DEMO_DATE,
    weekday: 6,
    dayName: '周六',
    title: '背部 / 手臂',
    lines: [],
    activities: [],
    parts: ['背', '手臂'],
    setCount: 9,
    plannedSets: 9,
    completion: 100,
    overLogged: false,
    tonnage: 0,
    hasLoadable: false,
    minutes: null,
    cardioMin: 0,
    plannedCardioMin: 0,
    bestCount: 0,
    demo: true
};
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PART_ORDER = [...AREA_OPTIONS, '有氧', '其他'];
const PART_META = {
    胸: { label: '胸部', emoji: '💪', short: '胸', bg: '#fdecef', ink: '#b32c45' },
    背: { label: '背部', emoji: '💪', short: '背', bg: '#e9f0ff', ink: '#315bb5' },
    肩: { label: '肩部', emoji: '🏋️', short: '肩', bg: '#f0ebff', ink: '#6541b8' },
    手臂: { label: '手臂', emoji: '🦾', short: '臂', bg: '#fff2df', ink: '#a66112' },
    腿: { label: '腿部', emoji: '🦵', short: '腿', bg: '#e8f7ed', ink: '#247348' },
    臀: { label: '臀部', emoji: '🍑', short: '臀', bg: '#fff0f4', ink: '#b33c67' },
    核心: { label: '核心', emoji: '🎯', short: '核', bg: '#fbf5d9', ink: '#8a6a10' },
    有氧: { label: '有氧', emoji: '🔥', short: '氧', bg: '#fdecef', ink: '#b32c45' },
    其他: { label: '其他', emoji: '✨', short: '其', bg: '#f1f2f5', ink: '#6b7280' }
};
const metaOf = (part) => PART_META[part] ?? PART_META.其他;
const canonicalPart = (part) => {
    if (!part) return '其他';
    if (part === '二头' || part === '三头' || part === '三头长头' || part === '肱' || part.includes('手臂')) return '手臂';
    if (part === '大腿' || part === '股四' || part === '腘绳' || part === '小腿' || part.includes('腿')) return '腿';
    if (part === '背' || part === '背阔' || part === '斜方' || part === '后背' || part === '背中部' || part === '菱形肌' || part === '后链') return '背';
    if (part === '三角' || part === '三角前束' || part === '三角中束' || part === '三角后束' || part === '后束' || part === '肩袖') return '肩';
    if (part === '胸上部') return '胸';
    if (part === '腹') return '核心';
    return part;
};
const partRank = (part) => {
    const i = PART_ORDER.indexOf(part);
    return i < 0 ? 99 : i;
};
function dayLabel(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return `${m}月${d}日`;
}
function weekdayOfIso(iso) {
    return WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
}
function kindOf(exIds) {
    if (!exIds.length) return 'other';
    return exIds.some((id) => byId(id)?.pattern === 'cardio') ? 'cardio' : 'lift';
}
const exNames = (exIds) => exIds.map((id) => byId(id)?.name ?? '').filter(Boolean).join('、');

/** 动作行统一成 { part, title, core }，分组时只按 part 过滤，绝不串组 */
function actionsOf(entry, demoActions) {
    if (!entry) return [];
    if (entry.demo) return demoActions.map((a) => ({ ...a, type: 'demo' }));
    const actions = [];
    for (const line of entry.lines) {
        const first = line.perSet?.[0] ?? '';
        const reps = first.match(/×\s*(\d+)(?!\s*组)/)?.[1] ?? '';
        actions.push({
            id: `set:${line.exId}:${line.name}`,
            type: 'set',
            part: line.part ?? '其他',
            title: line.name,
            core: reps ? `${line.sets}组 × ${reps}` : `${line.sets} 组`,
            exId: line.exId
        });
    }
    for (const a of entry.activities) {
        const exIds = (a.exIds ?? []).filter((id) => byId(id));
        // 手记的一条里挑过动作：一个动作一行，部位按它自己的主要肌群算，别糊成一行「记录」
        if (exIds.length) {
            for (const id of exIds) {
                const ex = byId(id);
                actions.push({
                    id: `act:${a.id}:${id}`,
                    type: 'act',
                    part: partOf(ex),
                    title: ex?.name ?? id,
                    core: a.minutes ? `${a.minutes} 分钟` : a.feel ? `RPE ${a.feel}` : '手动记录',
                    actId: a.id
                });
            }
            continue;
        }
        const parts = a.parts?.length ? a.parts : [a.part ?? '其他'];
        for (const part of parts) {
            actions.push({
                id: `act:${a.id}:${part}`,
                type: 'act',
                part,
                title: a.name,
                core: a.minutes ? `${a.minutes} 分钟` : a.feel ? `RPE ${a.feel}` : '手动记录',
                actId: a.id
            });
        }
    }
    return actions;
}

function SwipeAction({ onDelete, children }) {
    const [dx, setDx] = useState(0);
    const [open, setOpen] = useState(false);
    const start = useRef(null);
    const moved = useRef(false);
    const dxRef = useRef(0);
    const suppressClick = useRef(false);
    const down = (e) => {
        start.current = { x: e.clientX, y: e.clientY, base: open ? -74 : 0 };
        moved.current = false;
        suppressClick.current = false;
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
        if (!start.current) return;
        const mx = e.clientX - start.current.x;
        const my = e.clientY - start.current.y;
        if (!moved.current) {
            if (Math.abs(mx) < 6 || Math.abs(my) > Math.abs(mx)) return;
            moved.current = true;
        }
        const next = Math.max(-88, Math.min(0, start.current.base + mx));
        dxRef.current = next;
        setDx(next);
    };
    const up = () => {
        if (!start.current) return;
        if (moved.current) {
            suppressClick.current = true;
            if (dxRef.current <= -62) {
                onDelete();
                setDx(0);
                setOpen(false);
            } else if (dxRef.current <= -22) {
                setDx(-74);
                setOpen(true);
            } else {
                setDx(0);
                setOpen(false);
            }
        }
        start.current = null;
        moved.current = false;
    };
    const close = () => {
        if (suppressClick.current) {
            suppressClick.current = false;
            return;
        }
        if (!open) return;
        setDx(0);
        setOpen(false);
    };
    return (<div className="rec-swipe">
      <button type="button" className="rec-swipe-del" onClick={onDelete} aria-label="删除这条记录">
        删除
      </button>
      <div className="rec-action-card" style={{ transform: `translateX(${dx}px)` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={close}>
        {children}
      </div>
    </div>);
}

function RecordGroups({ actions, onDelete }) {
    const partNames = [...new Set(actions.map((a) => a.part))].sort((a, b) => partRank(a) - partRank(b));
    return (<div className="rec-groups">
      {partNames.map((partName) => {
          // 严格按部位分组：动作属于哪个 part，就只会出现在哪个分组里
          const groupItems = actions.filter(action => action.part === partName);
          const meta = metaOf(partName);
          return (<section className="rec-group" key={partName}>
            <div className="rec-group-head" style={{ background: meta.bg, color: meta.ink }}>
              <span className="rec-group-emoji" aria-hidden="true">{meta.emoji}</span>
              <b>{meta.label}</b>
              <span className="rec-group-count">({groupItems.length})</span>
            </div>
            <div className="rec-group-list">
              {groupItems.map((action) => (<SwipeAction key={action.id} onDelete={() => onDelete(action)}>
                <div className="rec-action-main">
                  <b>{action.title}</b>
                </div>
                <span className="rec-action-core num">{action.core}</span>
              </SwipeAction>))}
            </div>
          </section>);
      })}
    </div>);
}

function EmptyDay() {
    return (<div className="rec-day-empty">
      <span className="rec-day-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 9.5v5M7 7v10M17 7v10M20 9.5v5M7 12h10"/>
        </svg>
      </span>
      <b>这天没有记录</b>
    </div>);
}

function AddRecordPage({ date, recPicks, onGoPick, onTogglePick, onAdd, onDone }) {
    const [areas, setAreas] = useState([]);
    const [feel, setFeel] = useState(null);
    const [note, setNote] = useState('');
    const [effortOpen, setEffortOpen] = useState(false);
    const toggleArea = (a) => setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
    const save = () => {
        const name = exNames(recPicks) || (areas.length ? areas.join('、') : '练了一场');
        onAdd({
            id: uid('act'),
            date,
            name,
            minutes: 0,
            kind: kindOf(recPicks),
            feel,
            areas,
            exIds: recPicks,
            note: note.trim(),
            ts: new Date().toISOString()
        });
        onDone();
    };
    return (<div className="rec-add-page">
      <header className="rec-add-head">
        <button type="button" className="rec-add-back" onClick={onDone}>
          <span aria-hidden="true">‹</span> 返回
        </button>
        <h1>记一次训练</h1>
        <span className="rec-add-date num">{dayLabel(date)}</span>
      </header>

      <main className="rec-add-body">
        <div className="rec-add-section">
          <div className="rec-add-label">
            <span>练了什么动作</span>
            {recPicks.length ? <em>{recPicks.length} 个</em> : null}
          </div>
          {recPicks.length ? (<div className="rec-picked-chips">
            {recPicks.map((id) => (<button key={id} type="button" className="rec-picked-chip" onClick={() => onTogglePick(id)}>
              {byId(id)?.name ?? id}<span aria-hidden="true">×</span>
            </button>))}
          </div>) : (<div className="rec-add-empty">
            <span className="rec-add-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M4 9.5v5M7 7v10M17 7v10M20 9.5v5M7 12h10"/>
              </svg>
            </span>
            <span>还没挑动作</span>
          </div>)}
          <button type="button" className="rec-pick-btn" onClick={() => onGoPick(date)}>
            <span className="rec-pick-plus">＋</span>
            从动作库里挑动作
            {recPicks.length ? <span className="rec-pick-count">已挑 {recPicks.length} 个</span> : null}
          </button>
        </div>

        <div className="rec-add-section">
          <div className="rec-add-label"><span>今天练了哪里</span></div>
          <div className="rec-area-chips">
            {AREA_OPTIONS.map((a) => (<button key={a} type="button" className={`rec-area-chip${areas.includes(a) ? ' on' : ''}`} aria-pressed={areas.includes(a)} onClick={() => toggleArea(a)}>
              {a}
            </button>))}
          </div>
        </div>

        <section className={`rec-acc${effortOpen ? ' open' : ''}`}>
          <button type="button" className="rec-acc-head" aria-expanded={effortOpen} onClick={() => setEffortOpen((v) => !v)}>
            <span className="rec-acc-caret" aria-hidden="true">▶</span>
            <span>这次有多累（RPE）</span>
            <b className="rec-acc-value num">{feel === null ? '未填' : `RPE ${feel}`}</b>
          </button>
          {effortOpen ? (<div className="rec-acc-panel">
            <EffortSlider value={feel} onChange={setFeel}/>
          </div>) : null}
        </section>

        <label className="rec-add-note">
          <span>备注</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" aria-label="备注"/>
        </label>
      </main>

      <div className="rec-add-foot">
        <button type="button" className="rec-add-save" onClick={save}>保存</button>
        <button type="button" className="rec-add-cancel" onClick={onDone}>取消</button>
      </div>
    </div>);
}

export default function RecordPage({ sheets, logs, activities, recPick, onStartPick, onToggleRecPick, onPickDone, onDismissPick, onAdd, onRemove, onRemoveExercise, onGoToday, onOpenTrends }) {
    const today = todayIso();
    const realEntries = useMemo(() => buildEntries(sheets, logs, activities), [sheets, logs, activities]);
    const [demoActions, setDemoActions] = useState(MOCK_ACTIONS);
    const demoEntry = useMemo(() => ({
        ...DEMO_ENTRY,
        parts: [...new Set(demoActions.map((a) => a.part))],
        setCount: demoActions.reduce((n, a) => n + (a.sets ?? 0), 0)
    }), [demoActions]);
    const entries = useMemo(() => (DEMO
        ? [demoEntry, ...realEntries.filter((e) => e.date !== DEMO_DATE)]
        : realEntries), [demoEntry, realEntries]);
    const [sel, setSel] = useState(recPick?.date ?? (DEMO ? DEMO_DATE : today));
    const [view, setView] = useState(() => (recPick?.date ?? (DEMO ? DEMO_DATE : today)).slice(0, 7));
    // 按自然月翻：窗外的季节跟着这个月走
    const squares = useMemo(() => monthSquares(entries, view, today), [entries, view, today]);
    const [adding, setAdding] = useState(!!recPick);
    const entry = entries.find((e) => e.date === sel) ?? null;
    // 必须记住引用：每次 render 新建一个数组，会让下面的叠放列表被反复重建（点一下卡一次）
    const actions = useMemo(() => actionsOf(entry, demoActions), [entry, demoActions]);
    const [expandedRow, setExpandedRow] = useState(-1);
    useEffect(() => { setExpandedRow(-1); }, [sel]);
    /** 叠放标签的一行 = 一个动作：重量 / 组数×次数 / RPE */
    const stackedItems = useMemo(() => {
        if (!entry)
            return [];
        const dayLogs = logs.filter((l) => l.date === sel);
        return actions.map((action) => {
            if (action.type === 'set') {
                const mine = dayLogs.filter((l) => l.exId === action.exId);
                const ex = byId(action.exId);
                const weights = mine.map((l) => l.weightKg).filter((v) => v != null);
                const rpes = mine.map((l) => l.rpe).filter((v) => typeof v === 'number');
                const sets = Number((action.core.match(/(\d+)\s*组/) ?? [])[1] ?? 0);
                const reps = Number((action.core.match(/×\s*(\d+)/) ?? [])[1] ?? 0);
                const unit = ex?.unit === '每手kg' ? 'kg/手' : 'kg';
                return {
                    title: action.title,
                    priority: weights.length ? `${Math.max(...weights)}${unit}` : '自重',
                    date: reps ? `${sets}×${reps}` : `${sets} 组`,
                    assignee: rpes.length ? `RPE ${Math.max(...rpes)}` : 'RPE —'
                };
            }
            const act = entry.activities.find((a) => a.id === action.actId);
            const minutes = act?.minutes ?? 0;
            return {
                title: action.title,
                priority: minutes > 0 ? `${minutes} 分钟` : '手动',
                date: (act?.parts ?? []).join('/') || '—',
                assignee: act?.feel ? `RPE ${act.feel}` : 'RPE —'
            };
        });
    }, [actions, entry, logs, sel]);
    const rowHeight = typeof window !== 'undefined' && window.innerWidth < 600 ? 64 : 80;
    const stackedHeight = Math.max(180, stackedItems.length * rowHeight + 96);
    const handleExpandRow = useCallback((index) => setExpandedRow(index), []);
    // 注意：不要把 expanded 回传给组件。回传会让组件的 update() 重建整列 DOM，
    // 展开动画每帧都在重建，就会「卡一下」。展开状态只在 React 这边用来显示删除按钮。
    const stackedOptions = useMemo(() => ({
        heading: `${dayLabel(sel)} · ${stackedItems.length} 个动作`,
        items: stackedItems,
        theme: 'light',
        height: stackedHeight,
        onExpandChange: handleExpandRow
    }), [stackedItems, stackedHeight, sel, handleExpandRow]);
    const dateName = entry?.dayName ?? weekdayOfIso(sel);
    const onlyRecord = Boolean(entry && (entry.demo || (!entry.setCount && entry.activities.length > 0)));
    const isThisMonth = view === today.slice(0, 7);
    const shiftMonth = (by) => {
        const [year, month] = view.split('-').map(Number);
        const next = new Date(year, month - 1 + by, 1);
        const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
        setView(key);
        setSel(key === today.slice(0, 7) ? today : `${key}-01`);
    };
    const backToToday = () => {
        setView(today.slice(0, 7));
        setSel(DEMO ? DEMO_DATE : today);
    };
    useEffect(() => {
        if (!adding) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [adding]);
    const removeAction = (action) => {
        if (action.type === 'demo') {
            setDemoActions((cur) => cur.filter((a) => a.id !== action.id));
            return;
        }
        if (action.type === 'set') {
            onRemoveExercise?.(sel, action.exId);
            return;
        }
        if (action.type === 'act') onRemove(action.actId);
    };
    const closeAdd = () => {
        setAdding(false);
        onPickDone();
        onDismissPick?.();
    };
    // 季节跟着日历当前看的月份走（12/1/2 冬、3–5 春、6–8 夏、9–11 秋）
    const viewMonthNo = Number(view.slice(5, 7));
    const season = seasonOfMonth(viewMonthNo);
    return (<div className="logbook-page seasoned">
      <div className="season-window">
        <SeasonBackdrop month={viewMonthNo}/>
        <section className="rec-cal">
        <div className="rec-cal-head">
          <div className="rec-cal-month num">
            {view.replace('-', '年')}月
            <span className="rec-season">{season.label}</span>
          </div>
          <div className="rec-cal-tools">
            <button type="button" className="rec-cal-all" onClick={backToToday} disabled={isThisMonth}>今天</button>
            <button type="button" className="rec-cal-arrow" onClick={() => shiftMonth(-1)} aria-label="上个月">‹</button>
            <button type="button" className="rec-cal-arrow" onClick={() => shiftMonth(1)} disabled={isThisMonth} aria-label="下个月">›</button>
          </div>
        </div>
        <div className="rec-week-row">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="rec-grid">
          {squares.map((s, index) => {
              if (!s)
                  return <span className="rec-day-blank" key={`blank-${index}`} aria-hidden="true"/>;
              const normalized = [...new Set(s.parts.map(canonicalPart))].filter((p) => p !== '其他').sort((a, b) => partRank(a) - partRank(b));
              const tags = (normalized.length ? normalized : s.parts).slice(0, 2);
              return (<button key={s.date} type="button" className={`rec-day${s.date === sel ? ' selected' : ''}${s.date === today ? ' today' : ''}${s.future ? ' future' : ''}${s.tone === 'done' ? ' done' : ''}`} disabled={s.future} aria-pressed={s.date === sel} onClick={() => setSel(s.date)} title={`${s.date} ${s.dayName}${tags.length ? ' · ' + tags.map((p) => metaOf(p).label).join('、') : ''}`}>
                <span className="rec-day-num num">{Number(s.day)}</span>
                <span className="rec-day-tags">
                  {tags.map((p) => {
                      const m = metaOf(p);
                      return <i key={p} className="rec-day-tag" style={{ background: m.bg, color: m.ink }}>{m.short}</i>;
                  })}
                  {!tags.length && s.cardioMin ? <i className="rec-day-tag" style={{ background: '#fdecef', color: '#b32c45' }}>氧</i> : null}
                  {!tags.length && !s.cardioMin && s.tone === 'done' ? <i className="rec-day-dot"/> : null}
                </span>
              </button>);
          })}
        </div>
      </section>
      </div>

      <button type="button" className="rec-trends-entry" onClick={onOpenTrends}>
        <span className="rec-trends-badge" aria-hidden="true">↗</span>
        <span className="rec-trends-text">
          <b>趋势与周报</b>
          <small>容量、力量、体重、饮食，按周看趋势</small>
        </span>
        <span className="rec-trends-arrow" aria-hidden="true">›</span>
      </button>

      <section className="rec-detail">
        <div className="rec-detail-head">
          <h2>{dayLabel(sel)} <span>{dateName}</span></h2>
          {entry && actions.length ? <span className="rec-detail-tag">{onlyRecord ? '仅记录' : '训练'}</span> : null}
        </div>
        {entry && actions.length ? (<>
          <StackedMetadata
            className="rec-stacked"
            options={stackedOptions}/>
          {expandedRow >= 0 && actions[expandedRow] ? (<button type="button" className="rec-stacked-del" onClick={() => {
                removeAction(actions[expandedRow]);
                setExpandedRow(-1);
            }}>
              删除「{actions[expandedRow].title}」
            </button>) : (<p className="rec-stacked-hint">点一行，展开重量 / 组数 / RPE</p>)}
        </>) : <EmptyDay/>}
      </section>

      <div className="rec-bottom-space" aria-hidden="true"/>
      <div className="rec-dock">
        <button type="button" className="rec-dock-add" onClick={() => setAdding(true)}>
          <span aria-hidden="true">＋</span>记一笔
        </button>
        <button type="button" className="rec-dock-back" onClick={onGoToday}>回到训练</button>
      </div>

      {adding ? (<AddRecordPage date={sel} recPicks={recPick?.exIds ?? []} onGoPick={onStartPick} onTogglePick={onToggleRecPick} onAdd={onAdd} onDone={closeAdd}/>) : null}
    </div>);
}
