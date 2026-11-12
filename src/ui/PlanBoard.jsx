import { useState } from 'react';
import { byId } from '../engine/exercises.js';
import { weekdayName } from '../engine/goals.js';
import { weekdayOf } from '../engine/time.js';
import { weekDates } from '../engine/weekplan.js';
import MovePick from './MovePick.jsx';
import { useVelocityDrag } from './velocityDrag.js';

const md = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
const setsOf = (day) => day.exerciseIds.reduce((s, id) => s + (byId(id)?.sets ?? 0), 0);

export default function PlanBoard({ weekPlan, profile, favorites, today, onMoveDay, onEditDay, onStart }) {
    const [edit, setEdit] = useState(false);
    const [sel, setSel] = useState(today);
    const [editor, setEditor] = useState(null);
    const [pick, setPick] = useState(null);
    const dates = weekPlan ? weekDates(weekPlan.weekStart) : [];
    const selDate = dates.includes(sel) ? sel : today;
    const day = weekPlan?.days[selDate] ?? null;
    const editDay = editor ? weekPlan?.days[editor] ?? null : null;
    const editIds = editDay?.exerciseIds ?? [];
    const drag = useVelocityDrag({
        enabled: edit && !editor && !pick,
        onDrop: onMoveDay,
        onPick: (date) => setEditor(date),
        labelFor: (date) => `${weekdayName(weekdayOf(date))} ${md(date)} · ${weekPlan?.days[date]?.role ?? '休息'}`,
        targetSelector: '.pb-cell',
        cardSelector: '.pb-card'
    });
    if (!weekPlan)
        return null;
    const sessions = dates.filter((d) => weekPlan.days[d]);
    const togglePick = (id) => {
        if (pick.mode === 'swap') {
            if (id !== editIds[pick.index])
                onEditDay(editor, editIds.map((x, i) => (i === pick.index ? id : x)));
            setPick(null);
            return;
        }
        onEditDay(editor, editIds.includes(id) ? editIds.filter((x) => x !== id) : [...editIds, id]);
    };
    return (<div className={`pb${edit ? ' edit' : ''}`}>
      <div className="pb-rail" role="tablist" aria-label="本周日期">
        {dates.map((date) => {
            const d = weekPlan.days[date];
            return (<button key={date} type="button" data-date={date} role="tab" aria-selected={!edit && date === selDate} className={`pb-cell${date === today ? ' today' : ''}${!edit && date === selDate ? ' sel' : ''}${d ? '' : ' rest'}${drag.overDate === date ? ' over' : ''}${drag.draggingDate === date ? ' src' : ''}`} onClick={() => {
                    if (edit)
                        setEditor(date);
                    else
                        setSel(date);
                }}>
                <span className="pb-wd">{weekdayName(weekdayOf(date))}</span>
                <span className="pb-num num">{Number(date.slice(8))}</span>
                <span className="pb-role">{d ? d.role : '休'}</span>
              </button>);
        })}
      </div>

      {edit && editor ? (<div className="card pb-editor">
          <div className="pb-editor-head">
            <b>{weekdayName(weekdayOf(editor))} {md(editor)} · 改动作</b>
            <button className="btn ghost" onClick={() => { setEditor(null); setPick(null); }}>完成</button>
          </div>
          {editIds.length ? editIds.map((id, i) => {
                const ex = byId(id);
                if (!ex)
                    return null;
                return (<div className="pb-row" key={id}>
                  <div className="pb-row-main">
                    <b>{ex.name}</b>
                    <span className="num faint">{ex.sets}×{ex.reps}</span>
                  </div>
                  <button className="btn ghost" onClick={() => setPick({ mode: 'swap', index: i })}>换</button>
                  <button className="btn ghost" onClick={() => onEditDay(editor, editIds.filter((_, j) => j !== i))}>删</button>
                </div>);
            }) : <div className="faint small">这天还没有动作，加一个就把这天变成训练日。</div>}
          <button className="btn ghost pb-add" onClick={() => setPick({ mode: 'add' })}>＋加动作</button>
        </div>) : edit ? (<div className="pb-list">
          <div className="faint small pb-hint">拖卡片到上面任意一天 · 点卡片改动作</div>
          {sessions.map((date) => {
                const d = weekPlan.days[date];
                return (<div className="pb-card" data-date={date} key={date} {...drag.bind(date)}>
                  <div className="pb-card-head">
                    <b>{weekdayName(weekdayOf(date))} {md(date)}</b>
                    <span className="tag">{d.role}</span>
                    {date === today ? <span className="tag accent">今天</span> : null}
                    <span className="pb-grip" aria-hidden="true"/>
                  </div>
                  <div className="pb-card-lines">
                    {d.exerciseIds.slice(0, 3).map((id) => byId(id)?.name).filter(Boolean).join('、')}
                    {d.exerciseIds.length > 3 ? ` 等 ${d.exerciseIds.length} 个` : ''}
                  </div>
                  <div className="pb-card-meta num">
                    {d.exerciseIds.length} 个动作 · {setsOf(d)} 组{d.cardioMin > 0 ? ` · 有氧 ${d.cardioMin} 分` : ''}
                  </div>
                </div>);
            })}
          {!sessions.length ? <div className="faint small">这一周还没排训练日：点上面任意一天加动作。</div> : null}
        </div>) : (<div className="card pb-day">
          <div className="pb-day-head">
            <b>{day ? day.focus : '休息'}</b>
            <span className="tag">{weekdayName(weekdayOf(selDate))} {md(selDate)}</span>
            {selDate === today ? <span className="tag accent">今天</span> : null}
          </div>
          {day ? (<>
              <div className="faint small pb-day-note">{day.headline}</div>
              <div className="pb-day-rows">
                {day.exerciseIds.map((id, i) => {
                    const ex = byId(id);
                    if (!ex)
                        return null;
                    return (<div className="pb-day-row" key={id}>
                      <span className="num pb-i">{i + 1}</span>
                      <b>{ex.name}</b>
                      <span className="num faint">{ex.sets}×{ex.reps}</span>
                    </div>);
                })}
                {day.cardioMin > 0 ? <div className="pb-day-row">
                    <span className="num pb-i">＋</span>
                    <b>有氧</b>
                    <span className="num faint">{day.cardioMin} 分</span>
                  </div> : null}
              </div>
            </>) : <div className="faint small pb-day-note">这天不排训练，睡够比练够重要。</div>}
        </div>)}

      <div className="btnbar pb-bar">
        {edit ? (<button className="btn primary" onClick={() => { setEdit(false); setEditor(null); setPick(null); }}>完成</button>) : (<>
            <button className="btn primary" onClick={onStart}>{selDate === today ? '开始运动' : '开始今天的运动'}</button>
            <button className="btn ghost" onClick={() => setEdit(true)}>改计划</button>
          </>)}
      </div>

      {pick ? (<div className="pb-pick">
          <MovePick profile={profile} favorites={favorites} picked={pick.mode === 'swap' ? [editIds[pick.index]] : editIds} onToggle={togglePick} onDone={() => setPick(null)} title={pick.mode === 'swap' ? '换一个动作' : '加动作'} doneLabel="返回改动作"/>
        </div>) : null}
    </div>);
}