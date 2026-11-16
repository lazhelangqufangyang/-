import { useEffect, useMemo, useState } from 'react';
import { addDaysIso, todayIso, uid } from '../engine/time.js';
import { buildEntries, daySquares, rangeStats, weeksToCover } from '../engine/logbook.js';
import { AREA_OPTIONS } from '../engine/areas.js';
import { byId } from '../engine/exercises.js';
import { loadLabel } from '../engine/load.js';
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
            {adding ? '收起' : '＋ 给这天加一条运动'}
          </button>
          {entry ? (<button className="btn ghost big" onClick={onGoToday}>
              回运动
            </button>) : null}
        </div>
        {entry && (entry.setCount || entry.activities.length) ? (<button className={`btn big${confirmDay === sel ? ' danger' : ' ghost'}`} style={{ marginTop: 8 }} onClick={() => {
                if (confirmDay !== sel) {
                    setConfirmDay(sel);
                    return;
                }
                onRemoveDay(sel);
                setConfirmDay('');
                setAdding(false);
            }}>
            {confirmDay === sel
                ? `确认删掉 ${sel} 的记录（${entry.setCount} 组 · ${entry.activities.length} 条）`
                : '删掉这天的记录'}
          </button>) : null}
        {adding ? (<AddForm date={sel} today={today} recPicks={recPick?.exIds ?? []} onGoPick={onStartPick} onTogglePick={onToggleRecPick} onAdd={addAndFlood} onDone={() => {
                setAdding(false);
                onPickDone();
            }}/>) : null}
      </div>
    </div>);
}
function AddForm({ date, today, recPicks, onGoPick, onTogglePick, onAdd, onDone }) {
    const [d, setD] = useState(date);
    const [freeName, setFreeName] = useState('');
    const [feel, setFeel] = useState(null);
    const [areas, setAreas] = useState([]);
    const [note, setNote] = useState('');
    const toggleArea = (a) => setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
    const day = d > today || !/^\d{4}-\d{2}-\d{2}$/.test(d) ? today : d;
    const save = () => {
        // 动作、部位、名字都能空着：这条记录要的就是「这天动过」
        const name = freeName.trim() || exNames(recPicks) || (areas.length ? areas.join('、') : '练了一场');
        onAdd({
            id: uid('act'),
            date: day,
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
        <label>哪天练的</label>
        <input type="date" value={d} max={today} onChange={(e) => setD(e.target.value)}/>
      </div>
      <div className="field">
        <label>练了哪里（可以不选）</label>
        <div className="chips">
          {AREA_OPTIONS.map((a) => (<button key={a} className="chip" aria-pressed={areas.includes(a)} onClick={() => toggleArea(a)}>
              {a}
            </button>))}
        </div>
      </div>
      <div className="field">
        <label>做了什么动作（可以不选）</label>
        {recPicks.length ? (<div className="chips">
            {recPicks.map((id) => (<button key={id} className="chip" aria-pressed onClick={() => onTogglePick(id)}>
                {byId(id)?.name ?? id} ×
              </button>))}
          </div>) : null}
        <button className="btn ghost" onClick={() => onGoPick(day)}>
          去「动作」页选{recPicks.length ? ` · 已选 ${recPicks.length} 个` : ''}
        </button>
        <input value={freeName} onChange={(e) => setFreeName(e.target.value)} placeholder="也可以直接写做了什么，例：羽毛球双打 / 江边慢跑"/>
      </div>
      <div className="field">
        <label>状态（可空）</label>
        <div className="chips">
          {[1, 2, 3, 4, 5].map((n) => (<button key={n} className="chip" aria-pressed={feel === n} onClick={() => setFeel(feel === n ? null : n)}>
              {n}
            </button>))}
        </div>
        <div className="faint small">{feel === null ? '1 是很累很差，5 是好。' : `状态 ${feel}/5。`}</div>
      </div>
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
/** 部位的分组顺序跟「动作」页一致，有氧和其他运动排在最后 */
const PART_ORDER = [...AREA_OPTIONS, '有氧', '其他'];
function groupLines(lines) {
    const map = new Map();
    for (const l of lines) {
        const key = l.part ?? '其他';
        map.set(key, [...(map.get(key) ?? []), l]);
    }
    const rank = (k) => {
        const i = PART_ORDER.indexOf(k);
        return i < 0 ? 99 : i;
    };
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}
/** 记录里每一组的写法跟当时练的那一行完全一致：自重只写次数，递减组按档列 */
function setText(unit, r) {
    if (r.dropSteps?.length)
        return r.dropSteps.map((s) => `${s.weightKg === null ? '自重' : loadLabel(unit, s.weightKg)}×${Math.max(1, s.sets)}组`).join(' ');
    return `${unit === '无' ? '' : `${loadLabel(unit, r.weightKg)} `}× ${r.reps}${r.rpe ? ` RPE${r.rpe}` : ''}${r.fail ? ' 力竭' : ''}`;
}
function DayDone({ entry, confirmId, onAskDelete, onDelete }) {
    const head = [
        entry.setCount ? `${entry.setCount} 组` : '',
        entry.completion !== null ? (entry.overLogged ? '计划组数都做完了' : `完成 ${entry.completion}%`) : '',
        entry.cardioMin ? `有氧 ${entry.cardioMin} 分钟` : '',
        entry.tonnage ? `${entry.tonnage.toLocaleString('zh-CN')} kg` : entry.setCount ? '没能折成 kg 的组' : '',
        entry.bestCount ? `${entry.bestCount} 个新高` : ''
    ].filter(Boolean);
    return (<div>
      <div className="lb-head-line">
        {head.length ? head.join(' · ') : entry.fromSheet ? '这天有表，但一组都没记' : '只记了运动，没在执行表上记组'}
      </div>

      {groupLines(entry.lines).map(([part, items]) => (<div className="lb-part" key={part}>
          <div className="lb-part-head">
            <b>{part}</b>
            <span className="faint small">
              {items.length} 个动作 · {items.reduce((n, l) => n + l.sets, 0)} 组
            </span>
          </div>
          {items.map((l, i) => (<div className="lb-ex" key={l.name}>
              <div className="srow-head">
                <span className="tag num">{i + 1}</span> {l.name}
                {l.best ? <span className="tag accent">新高</span> : null}
              </div>
              <div className="setlist">
                {l.rows.map((r) => (<div className="setrow" key={r.idx}>
                    <div className="setline">
                      <div className="setbtn done lb-set">
                        <span className="idx num">
                          第 {r.idx + 1} 组{r.dropSteps?.length ? '｜递减' : ''}
                        </span>
                        <span className="want num">{setText(l.unit, r)}</span>
                      </div>
                    </div>
                  </div>))}
              </div>
            </div>))}
        </div>))}

      {entry.activities.length ? (<div className="lb-part">
          <div className="lb-part-head">
            <b>其他运动</b>
            <span className="faint small">{entry.activities.length} 条</span>
          </div>
          <div className="lb-lines">
            {entry.activities.map((a) => (<div className="lb-line" key={a.id}>
                <span className="lb-lname">{a.name}</span>
                {a.minutes ? <span className="lb-lsets num">{a.minutes} 分钟</span> : null}
                <span className="lb-ltop">{actExtra(a)}</span>
                <button className={`lb-del${confirmId === a.id ? ' on' : ''}`} onClick={() => (confirmId === a.id ? onDelete(a.id) : onAskDelete(a.id))}>
                  {confirmId === a.id ? '确认删' : '删'}
                </button>
              </div>))}
          </div>
        </div>) : null}
    </div>);
}
