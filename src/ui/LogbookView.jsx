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
    // 一天一格的行宽是七的倍数，选中之后保证它落在视野里就够了，不用自己滚
    useEffect(() => {
        document.getElementById('lb-sel')?.scrollIntoView({ block: 'nearest' });
    }, [sel]);
    return (<div>
      <div className="card summary">
        <h3>近 7 天</h3>
        <div className="kv">
          <span>练过的次数</span>
          <span className="num">
            {thisWeek.sessions} 次
            <span className="faint small">{` （上一周 ${lastWeek.sessions}）`}</span>
          </span>
        </div>
        <div className="kv">
          <span>记下的组数</span>
          <span className="num">
            {thisWeek.sets} 组
            <span className="faint small">{` （上一周 ${lastWeek.sets}）`}</span>
          </span>
        </div>
        <div className="kv">
          <span>自己记的活动</span>
          <span className="num">
            {thisWeek.acts} 条
            <span className="faint small">{` （上一周 ${lastWeek.acts}）`}</span>
          </span>
        </div>
        <div className="kv">
          <span>负重总量</span>
          <span className="num">
            {thisWeek.tonnage.toLocaleString('zh-CN')} kg
            {lastWeek.tonnage ? (<span className="faint small">{` · 比上一周 ${thisWeek.tonnage >= lastWeek.tonnage ? '+' : ''}${Math.round((thisWeek.tonnage / lastWeek.tonnage - 1) * 100)}%`}</span>) : null}
          </span>
        </div>
      </div>

      <div className="card">
        <h3>日历</h3>
        <div className="lb-range">
          <span className="faint small">
            {squares[0]?.date.slice(5).replace('-', '/')} 到 {squares.at(-1)?.date.slice(5).replace('-', '/')}
          </span>
          <button className="btn ghost lb-range-btn" onClick={toggleAll}>
            {allOpen ? '只看三周' : '全部'}
          </button>
        </div>
        <div className="lb-week-row">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (<span key={w}>{w}</span>))}
        </div>
        <div className="lb-grid">
          {squares.map((s) => (<button key={s.date} id={sel === s.date ? 'lb-sel' : undefined} className={`lb-sq ${s.tone}${s.future ? ' future' : ''}${sel === s.date ? ' on' : ''}${floodDay === s.date ? ' flood' : ''}`} aria-pressed={sel === s.date} disabled={s.future} onClick={() => setSel(s.date)} title={`${s.date} ${s.dayName}`}>
              <span className="lb-sq-d num">{s.day}</span>
              <span className="lb-sq-t">
                {s.parts.length
                ? s.parts.map((p) => (<i key={p}>{p}</i>))
                : s.cardioMin
                    ? <i>有氧</i>
                    : null}
              </span>
            </button>))}
        </div>
        <div className="lb-legend">
          <span>
            <i className="lb-dot done"/>
            记了
          </span>
          <span>
            <i className="lb-dot none"/>
            没记
          </span>
          <span>
            <i className="lb-dot future"/>
            还没到
          </span>
        </div>
        <div className="lb-nav" style={{ marginTop: 6 }}>
          <button className="btn ghost" onClick={() => shift(-7)} disabled={selIdx <= 0}>
            ‹ 早一周
          </button>
          <button className="btn ghost" onClick={() => shift(7)} disabled={selIdx >= todayIdx}>
            晚一周 ›
          </button>
        </div>

        <div className="lb-done-head">
          <b>已完成</b>
          <span className="faint small lb-done-when">
            {entry ? `${sel.slice(5).replace('-', '/')} ${entry.dayName} · ${entry.title}` : `${sel.slice(5).replace('-', '/')} 没记录`}
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
            <b>这天还没记录</b>
            <span className="faint small">在运动页练完记组，或者下面手动加一条</span>
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
    return [
        ...entry.lines.map((l) => ({
            key: `set:${l.name}`,
            part: l.part ?? '其他',
            left: `${l.sets} 组`,
            sets: l.sets,
            title: l.name,
            meta: l.perSet.join(' / '),
            best: l.best
        })),
        ...entry.activities.map((a) => ({
            key: `act:${a.id}`,
            part: a.part ?? '其他',
            left: a.minutes ? `${a.minutes} 分钟` : '记录',
            sets: 0,
            title: a.name,
            meta: actExtra(a)
                .split(' · ')
                .filter((x) => x && x !== a.part)
                .join(' · '),
            act: a
        }))
    ];
}
function DayDone({ entry, confirmId, onAskDelete, onDelete }) {
    const head = [
        entry.setCount ? `${entry.setCount} 组` : '',
        entry.completion !== null ? (entry.overLogged ? '计划组数都做完了' : `完成 ${entry.completion}%`) : '',
        entry.cardioMin ? `有氧 ${entry.cardioMin} 分钟` : '',
        entry.tonnage ? `${entry.tonnage.toLocaleString('zh-CN')} kg` : entry.setCount ? '没能折成 kg 的组' : '',
        entry.bestCount ? `${entry.bestCount} 个新高` : ''
    ].filter(Boolean);
    const rows = doneRows(entry);
    const grouped = new Map();
    for (const r of rows)
        grouped.set(r.part, [...(grouped.get(r.part) ?? []), r]);
    const groups = [...grouped.entries()].sort((a, b) => partRank(a[0]) - partRank(b[0]));
    return (<div>
      <div className="lb-head-line">
        {head.length ? head.join(' · ') : entry.fromSheet ? '这天有表，但一组都没记' : '只记了运动，没在执行表上记组'}
      </div>

      {groups.map(([part, items]) => {
            const sets = items.reduce((n, r) => n + r.sets, 0);
            return (<div className="lb-part" key={part}>
              <div className="lb-part-head">
                <b>{part}</b>
                <span className="faint small">
                  {items.length} 个动作{sets ? ` · ${sets} 组` : ''}
                </span>
              </div>
              {items.map((r) => (<div className="lb-done" key={r.key}>
                  <span className="lb-done-sets num">{r.left}</span>
                  <span className="lb-done-badge" aria-hidden="true">
                    {part.slice(0, 1)}
                  </span>
                  <span className="lb-done-body">
                    <b>{r.title}</b>
                    <span className="lb-done-meta num">{r.meta}</span>
                  </span>
                  {r.best ? <span className="tag accent">新高</span> : null}
                  {r.act ? (<button className={`lb-del${confirmId === r.act.id ? ' on' : ''}`} onClick={() => (confirmId === r.act.id ? onDelete(r.act.id) : onAskDelete(r.act.id))}>
                      {confirmId === r.act.id ? '确认删' : '删'}
                    </button>) : null}
                  <span className="lb-done-ok" aria-hidden="true">
                    ✓
                  </span>
                </div>))}
            </div>);
        })}
    </div>);
}
