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
    const [pick, setPick] = useState(null);
    const dates = weekPlan ? weekDates(weekPlan.weekStart) : [];
    const selDate = dates.includes(sel) ? sel : today;
    const day = weekPlan?.days[selDate] ?? null;
    const ids = day?.exerciseIds ?? [];
    const drag = useVelocityDrag({
        enabled: edit && !pick,
        onDrop: onMoveDay,
        onPick: (date) => setSel(date),
        labelFor: (date) => `${weekdayName(weekdayOf(date))} ${md(date)} · ${weekPlan?.days[date]?.role ?? '休息'}`,
        targetSelector: '.pb-cell',
        cardSelector: '.pb-card'
    });
    if (!weekPlan)
        return null;
    const sessions = dates.filter((d) => weekPlan.days[d]);
    const openSwap = (index) => setPick({ mode: 'swap', index });
    const togglePick = (id) => {
        if (pick.mode === 'swap') {
            if (id !== ids[pick.index])
                onEditDay(selDate, ids.map((x, i) => (i === pick.index ? id : x)));
            setPick(null);
            return;
        }
        onEditDay(selDate, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    };
    return (<div className={`pb${edit ? ' edit' : ''}`}>
      <div className="pb-rail" role="tablist" aria-label="本周日期">
        {dates.map((date) => {
            const d = weekPlan.days[date];
            return (<button key={date} type="button" data-date={date} role="tab" aria-selected={date === selDate} className={`pb-cell${date === today ? ' today' : ''}${date === selDate ? ' sel' : ''}${d ? '' : ' rest'}${drag.overDate === date ? ' over' : ''}${drag.draggingDate === date ? ' src' : ''}`} onClick={() => setSel(date)}>
                <span className="pb-wd">{weekdayName(weekdayOf(date))}</span>
                <span className="pb-num num">{Number(date.slice(8))}</span>
                <span className="pb-role">{d ? d.role : '休'}</span>
              </button>);
        })}
      </div>

      <div className="pb-sheet">
        <div className="pb-sheet-head">
          <b>{day ? day.focus : '休息'}</b>
          <span className="tag">{weekdayName(weekdayOf(selDate))} {md(selDate)}</span>
          {selDate === today ? <span className="tag accent">今天</span> : null}
          <span className="faint small pb-sheet-tip">点动作可换</span>
        </div>
        <table className="pb-table">
          <thead>
            <tr><th className="pb-th-i">#</th><th>动作</th><th className="pb-th-d">组×次</th></tr>
          </thead>
          <tbody>
            {day ? ids.map((id, i) => {
                const ex = byId(id);
                if (!ex)
                    return null;
                return (<tr className="pb-tr" key={id} role="button" tabIndex={0} aria-label={`换掉 ${ex.name}`} onClick={() => openSwap(i)} onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openSwap(i);
                        }
                    }}>
                    <td className="num pb-i">{i + 1}</td>
                    <td className="pb-name"><b>{ex.name}</b><span>{ex.equipment.join('·')}</span></td>
                    <td className="num pb-dose">{ex.sets}×{ex.reps}</td>
                  </tr>);
            }) : null}
            {day && day.cardioMin > 0 ? (<tr className="pb-tr static">
                <td className="num pb-i">＋</td>
                <td className="pb-name"><b>有氧</b><span>能说话但不能唱歌的强度</span></td>
                <td className="num pb-dose">{day.cardioMin} 分</td>
              </tr>) : null}
            {day && !ids.length ? (<tr className="pb-tr static">
                <td className="num pb-i">·</td>
                <td className="pb-name"><b>还没排动作</b><span>下面「＋加动作」挑几个</span></td>
                <td className="num pb-dose"/>
              </tr>) : null}
            {!day ? (<tr className="pb-tr static">
                <td className="num pb-i">–</td>
                <td className="pb-name"><b>这天不排训练</b><span>睡够比练够重要</span></td>
                <td className="num pb-dose"/>
              </tr>) : null}
          </tbody>
        </table>
        {day ? <div className="pb-sheet-note faint small">{day.headline}</div> : null}
      </div>

      {edit ? (<div className="pb-list">
          <div className="faint small pb-hint">按住卡片 1 秒再拖到上面任意一天 · 点一下看那天</div>
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
          {!sessions.length ? <div className="faint small">这一周还没排训练日：点上面任意一天，再「＋加动作」。</div> : null}
        </div>) : null}

      <div className="btnbar pb-bar">
        {edit ? (<>
            <button className="btn ghost" onClick={() => setPick({ mode: 'add' })}>＋加动作</button>
            <button className="btn primary" onClick={() => { setEdit(false); setPick(null); }}>完成</button>
          </>) : (<>
            <button className="btn primary" onClick={onStart}>{selDate === today ? '开始运动' : '开始今天的运动'}</button>
            <button className="btn ghost" onClick={() => setEdit(true)}>改计划</button>
          </>)}
      </div>

      {pick ? (<div className="pb-pick">
          <MovePick profile={profile} favorites={favorites} picked={pick.mode === 'swap' ? [ids[pick.index]] : ids} onToggle={togglePick} onDone={() => setPick(null)} title={pick.mode === 'swap' ? '换一个动作' : '加动作'} doneLabel="返回计划表" extra={pick.mode === 'swap' ? (<button className="btn ghost pb-pick-del" onClick={() => {
                onEditDay(selDate, ids.filter((_, j) => j !== pick.index));
                setPick(null);
            }}>从这天删掉</button>) : null}/>
        </div>) : null}
    </div>);
}