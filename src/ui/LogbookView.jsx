import { useEffect, useMemo, useState } from 'react';
import { addDaysIso, todayIso, uid } from '../engine/time.js';
import { buildEntries, daySquares, rangeStats, weeksToCover } from '../engine/logbook.js';
import { AREA_OPTIONS } from '../engine/areas.js';
import { byId } from '../engine/exercises.js';
import EffortSlider from './EffortSlider.jsx';
/** 挑了什么动作就倒推出这是什么运动：有氧动作进「有氧」，力量动作进「力量」 */
function kindOf(exIds) {
    if (!exIds.length)
        return 'other';
    return exIds.some((id) => byId(id)?.pattern === 'cardio') ? 'cardio' : 'lift';
}
const exNames = (exIds) => exIds.map((id) => byId(id)?.name ?? '').filter(Boolean).join('、');
/** 详情行右边那一串：挑的动作（和名字不重复时）、点的部位、状态、备注 */
const actExtra = (a) => {
    const names = exNames(a.exIds);
    return [
        names && names !== a.name ? names : '',
        a.areas.length ? a.areas.join('、') : '',
        a.feel !== null ? `状态 ${a.feel}/5` : '',
        a.note
    ]
        .filter(Boolean)
        .join(' · ');
};
export default function LogbookView({ sheets, logs, activities, recPick, onStartPick, onToggleRecPick, onPickDone, onAdd, onRemove, onRemoveDay, onGoToday }) {
    const today = todayIso();
    const entries = useMemo(() => buildEntries(sheets, logs, activities), [sheets, logs, activities]);
    const thisWeek = rangeStats(entries, addDaysIso(today, -6), today);
    const lastWeek = rangeStats(entries, addDaysIso(today, -13), addDaysIso(today, -7));
    const weekDelta = (cur, prev) => {
        if (!prev) return null;
        const pct = Math.round((cur / prev - 1) * 100);
        return { pct, up: pct >= 0 };
    };
    const stats = [
        { label: '练过次数', value: thisWeek.sessions, suffix: '次', delta: weekDelta(thisWeek.sessions, lastWeek.sessions) },
        { label: '记下组数', value: thisWeek.sets, suffix: '组', delta: weekDelta(thisWeek.sets, lastWeek.sets) },
        { label: '自己记的活动', value: thisWeek.acts, suffix: '条', delta: weekDelta(thisWeek.acts, lastWeek.acts) },
        { label: '负重总量', value: thisWeek.tonnage.toLocaleString('zh-CN'), suffix: 'kg', delta: weekDelta(thisWeek.tonnage, lastWeek.tonnage) }
    ];
    // 日历默认只铺三周，更早的记录点「全部」一次摊开
    const [allOpen, setAllOpen] = useState(false);
    const weeks = allOpen ? weeksToCover(entries, today) : 3;
    const squares = useMemo(() => daySquares(entries, today, weeks), [entries, today, weeks]);
    // 从「动作」页挑完回来：接着摊开表单、选中那天的日期
    const [sel, setSel] = useState(recPick?.date ?? today);
    const toggleAll = () => {
        if (allOpen)
            setSel(today);
        setAllOpen(!allOpen);
    };
    const [adding, setAdding] = useState(!!recPick);
    const [confirmId, setConfirmId] = useState('');
    const [confirmDay, setConfirmDay] = useState('');
    /** 刚记上那条的那天：格子演一次灌水，演完就摘掉，不留在类名上 */
    const [floodDay, setFloodDay] = useState('');
    useEffect(() => {
        if (!floodDay)
            return undefined;
        const t = setTimeout(() => setFloodDay(''), 700);
        return () => clearTimeout(t);
    }, [floodDay]);
    const addAndFlood = (a) => {
        onAdd(a);
        setFloodDay(a.date);
    };
    const entry = entries.find((e) => e.date === sel) ?? null;
    const selIdx = squares.findIndex((s) => s.date === sel);
    const todayIdx = squares.findIndex((s) => s.date === today);
    // 更早/更新按周翻页：整块最多摊成三行，一次挪一周还留在同一张图里
    const shift = (by) => {
        const i = Math.min(Math.max(0, todayIdx), Math.max(0, selIdx + by));
        setSel(squares[i].date);
    };
    // 月份显示
    const selMonth = Number(sel.slice(5, 7));
    const selYear = sel.slice(0, 4);
    // 一天一格的行宽是七的倍数，选中之后保证它落在视野里就够了，不用自己滚
    useEffect(() => {
        document.getElementById('lb-sel')?.scrollIntoView({ block: 'nearest' });
    }, [sel]);
    return (<div>
      <div className="card lb-cards-gap">
        <div className="lb-stats-grid">
          {stats.map((s) => (<div className="lb-stat" key={s.label}>
            <div className="lb-stat-label">{s.label}</div>
            <div className="lb-stat-value num">
              {s.value}
              <span className="lb-stat-suffix">{s.suffix}</span>
            </div>
            {s.delta ? (<div className={`lb-stat-delta${s.delta.up ? ' up' : ' down'}`}>
                {s.delta.up ? '↑' : '↓'} {Math.abs(s.delta.pct)}%
              </div>) : (<div className="lb-stat-delta faint small">—</div>)}
          </div>))}
        </div>
      </div>

      <div className="card">
        <div className="lb-cal-head">
          <button className="lb-nav-arrow" onClick={() => shift(-7)} disabled={selIdx <= 0} aria-label="早一周">‹</button>
          <div className="lb-month-title">{selYear}年 {selMonth}月</div>
          <button className="lb-nav-arrow" onClick={() => shift(7)} disabled={selIdx >= todayIdx} aria-label="晚一周">›</button>
        </div>
        <div className="lb-cal-sub">
          <span className="faint small">
            {squares[0]?.date.slice(5).replace('-', '/')}–{squares.at(-1)?.date.slice(5).replace('-', '/')}
          </span>
          <button className="lb-filter-toggle" onClick={toggleAll}>
            {allOpen ? '只看三周' : '全部记录 ▾'}
          </button>
        </div>
        <div className="lb-week-row">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (<span key={w}>{w}</span>))}
        </div>
        <div className="lb-grid">
          {squares.map((s) => (<button key={s.date} id={sel === s.date ? 'lb-sel' : undefined} className={`lb-sq${s.tone === 'done' ? ' done' : ''}${s.future ? ' future' : ''}${sel === s.date ? ' on' : ''}${floodDay === s.date ? ' flood' : ''}${s.date === today ? ' today' : ''}`} aria-pressed={sel === s.date} disabled={s.future} onClick={() => setSel(s.date)} title={`${s.date} ${s.dayName}${s.parts.length ? ' · ' + s.parts.join('、') : ''}`}>
              <span className="lb-sq-d num">{s.day}</span>
              {s.parts.length ? (<span className="lb-sq-tags">
                  {s.parts.slice(0, 3).map((p) => (<i key={p} className="lb-sq-tag">{p.slice(0, 1)}</i>))}
                  {s.parts.length > 3 ? <i className="lb-sq-tag more">+{s.parts.length - 3}</i> : null}
                </span>) : s.cardioMin ? (<span className="lb-sq-tags"><i className="lb-sq-tag cardio">有氧</i></span>) : (<span className="lb-sq-tags">
                  <span className="lb-sq-dot"/>
                </span>)}
            </button>))}
        </div>
        <div className="lb-legend">
          <span><i className="lb-leg done"/>已记录</span>
          <span><i className="lb-leg none"/>未记录</span>
          <span><i className="lb-leg future"/>未来</span>
        </div>

        <div className="lb-done-head">
          <b>{selMonth}月{Number(sel.slice(8))}日 {['周日','周一','周二','周三','周四','周五','周六'][new Date(sel + 'T00:00:00').getDay()]}</b>
          <span className="faint small lb-done-when">
            {entry ? `${entry.title} · ${entry.setCount}组${entry.activities.length ? ` · ${entry.activities.length}条活动` : ''}` : '这天还没练'}
          </span>
          {entry && (entry.setCount || entry.activities.length) ? (<button className={`lb-day-del${confirmDay === sel ? ' on' : ''}`} title={confirmDay === sel ? '再点一次确认删掉这天所有记录' : '删掉这天所有记录'} onClick={() => {
                    if (confirmDay !== sel) {
                        setConfirmDay(sel);
                        return;
                    }
                    onRemoveDay(sel);
                    setConfirmDay('');
                    setAdding(false);
                }}>
              {confirmDay === sel ? '确认✕' : '✕'}
            </button>) : null}
        </div>
        {entry ? (<DayDone entry={entry} confirmId={confirmId} onAskDelete={(id) => setConfirmId(confirmId === id ? '' : id)} onDelete={(id) => {
                onRemove(id);
                setConfirmId('');
            }}/>) : (<div className="lb-empty">
            <div className="lb-empty-ico" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="56" height="56" fill="none">
                <circle cx="24" cy="38" r="3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M24 34V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M24 26l6-4M24 26l-6-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M24 34l7-7M24 34l-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="24" cy="14" r="4" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <b>这一天还是一片空白</b>
            <span className="faint small">动起来吧，在运动页练完记组，或者下面手动加一条</span>
          </div>)}

        <div className="btnbar" style={{ marginTop: 10 }}>
          <button className={`btn big addact${adding ? ' ghost' : ' primary'}`} onClick={() => {
                setAdding(!adding);
                if (adding)
                    onPickDone();
            }}>
            {adding ? '收起' : '＋ 加运动'}
          </button>
          {entry ? (<button className="btn ghost big" onClick={onGoToday}>
              回运动
            </button>) : null}
        </div>
        {adding ? (<AddForm date={sel} recPicks={recPick?.exIds ?? []} onGoPick={onStartPick} onTogglePick={onToggleRecPick} onAdd={addAndFlood} onDone={() => {
                setAdding(false);
                onPickDone();
            }}/>) : null}
      </div>
    </div>);
}
function AddForm({ date, recPicks, onGoPick, onTogglePick, onAdd, onDone }) {
    const [areas, setAreas] = useState([]);
    const [feel, setFeel] = useState(null);
    const [note, setNote] = useState('');
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
    return (<div style={{ marginTop: 10 }}>
      <div className="field">
        <label>做了什么动作（可以不选）</label>
        {recPicks.length ? (<div className="chips">
            {recPicks.map((id) => (<button key={id} className="chip" aria-pressed onClick={() => onTogglePick(id)}>
                {byId(id)?.name ?? id} ×
              </button>))}
          </div>) : null}
        <button className="btn ghost" style={{ width: '100%' }} onClick={() => onGoPick(date)}>
          去「动作」页挑{recPicks.length ? ` · 已选 ${recPicks.length} 个` : ''}
        </button>
      </div>
      <div className="field">
        <label>练了哪里（可以不选）</label>
        <div className="chips">
          {AREA_OPTIONS.map((a) => (<button key={a} className="chip" aria-pressed={areas.includes(a)} onClick={() => toggleArea(a)}>
              {a}
            </button>))}
        </div>
      </div>
      <EffortSlider value={feel} onChange={setFeel}/>
      <div className="field">
        <label>备注（可空）</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：心率很高，跑走交替"/>
      </div>
      <div className="btnbar">
        <button className="btn primary" onClick={save}>
          记下
        </button>
        <button className="btn ghost" onClick={onDone}>
          返回
        </button>
      </div>
    </div>);
}
/** 部位的分组顺序跟「动作」页一致，有氧和其他排在最后 */
const PART_ORDER = [...AREA_OPTIONS, '有氧', '其他'];
const partRank = (k) => {
    const i = PART_ORDER.indexOf(k);
    return i < 0 ? 99 : i;
};
/** 按组记的动作和手记的运动合成同一张清单：都是做完的运动，一律带对勾，不再分两栏 */
function doneRows(entry) {
    const setRows = entry.lines.map((l) => ({
        key: `set:${l.name}`,
        part: l.part ?? '其他',
        left: `${l.sets} 组`,
        sets: l.sets,
        title: l.name,
        meta: l.perSet.join(' / '),
        best: l.best
    }));
    // activity 可能涉及多个部位（用户点了多个 areas、或挑了多个不同部位的动作），
    // 拆成多行分别归入对应分组，而不是全归第一个部位
    const actRows = [];
    for (const a of entry.activities) {
        const parts = a.parts?.length ? a.parts : [a.part ?? '其他'];
        for (const p of parts) {
            actRows.push({
                key: `act:${a.id}:${p}`,
                part: p,
                left: a.minutes ? `${a.minutes} 分钟` : '记录',
                sets: 0,
                title: a.name,
                meta: actExtra(a)
                    .split(' · ')
                    .filter((x) => x && x !== a.part && x !== p)
                    .join(' · '),
                act: a
            });
        }
    }
    return [...setRows, ...actRows];
}
/** 部位 → Emoji 图标 */
const PART_EMOJI = {
  胸: '💪',
  背: '🦾',
  肩: '🏋️',
  手臂: '💪',
  腿: '🦵',
  臀: '🍑',
  核心: '🎯',
  有氧: '🔥',
  其他: '✨'
};
/** 部位 → 柔和背景色 */
const PART_TINT = {
  胸: '#fdecef',
  背: '#e8f1ff',
  肩: '#f0ebff',
  手臂: '#fef3e2',
  腿: '#e6f7ed',
  臀: '#fff0f4',
  核心: '#fef9e2',
  有氧: '#fdecef',
  其他: '#f4f5f9'
};
function DayDone({ entry, confirmId, onAskDelete, onDelete }) {
    const rows = doneRows(entry);
    const grouped = new Map();
    for (const r of rows)
        grouped.set(r.part, [...(grouped.get(r.part) ?? []), r]);
    const groups = [...grouped.entries()].sort((a, b) => partRank(a[0]) - partRank(b[0]));
    const onlyActivity = !entry.setCount && entry.activities.length > 0 && entry.lines.length === 0;
    // feel 汇总：取 activity 的 feel 中位数（0 表示没记状态）
    const feels = entry.activities.map((a) => a.feel).filter((f) => f !== null && f !== undefined);
    const medianFeel = feels.length ? feels.sort((a, b) => a - b)[Math.floor(feels.length / 2)] : null;
    return (<div className="lb-detail">
      <div className="lb-detail-meta">
        {entry.cardioMin ? <span className="lb-tag cardio">有氧 {entry.cardioMin}分</span> : null}
        {entry.tonnage ? <span className="lb-tag tonnage">{entry.tonnage.toLocaleString('zh-CN')} kg</span> : null}
        {entry.bestCount ? <span className="lb-tag best">{entry.bestCount}个新高</span> : null}
        {medianFeel !== null ? <span className={`lb-tag feel feel-${medianFeel}`}>状态 {medianFeel}/5</span> : null}
        {onlyActivity ? <span className="lb-tag plain">仅记录</span> : null}
        {entry.completion !== null && entry.lines.length > 0 ? <span className="lb-tag done">完成 {entry.completion}%</span> : null}
      </div>

      {groups.map(([part, items]) => {
            const sets = items.reduce((n, r) => n + r.sets, 0);
            const tint = PART_TINT[part] ?? 'var(--bg-sunken)';
            return (<div className="lb-grp" key={part}>
              <div className="lb-grp-head" style={{ background: tint }}>
                <span className="lb-grp-emoji" aria-hidden="true">{PART_EMOJI[part] ?? '✨'}</span>
                <b>{part}</b>
                <span className="lb-grp-count num">{items.length}</span>
                {sets ? <span className="lb-grp-sets num">· {sets}组</span> : null}
              </div>
              <div className="lb-chips">
                {items.map((r) => {
                    const chipConfirm = r.act && confirmId === r.act.id;
                    return (<div key={r.key} className={`lb-chip${chipConfirm ? ' on' : ''}`}>
                        <span className="lb-chip-name">{r.title}</span>
                        {r.sets > 0 ? <span className="lb-chip-sub num">{r.sets}组×{r.meta?.match(/\d+/)?.[0] ?? ''}</span> : null}
                        {!r.sets && r.left ? <span className="lb-chip-sub num">{r.left}</span> : null}
                        {r.meta && r.meta !== r.title ? <span className="lb-chip-meta">{r.meta}</span> : null}
                        {r.act ? (chipConfirm ? (<button className="lb-chip-confirm" onClick={() => {
                                        onDelete(r.act.id);
                                    }}>确认删除</button>) : (<button className="lb-chip-del" title="删除这条手记" onClick={() => onAskDelete(r.act.id)}>✕</button>)) : null}
                      </div>);
                })}
              </div>
            </div>);
        })}
    </div>);
}
