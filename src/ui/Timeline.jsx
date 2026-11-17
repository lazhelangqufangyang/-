import { useRef, useState } from 'react';
import { wantAreasOf } from '../engine/day.js';
import { loadLabel } from '../engine/load.js';
import MoveDetail from './MoveDetail.jsx';

const KIND_LABEL = {
    warmupGeneral: '热身',
    warmupMobility: '活动度',
    ramp: '递增热身',
    main: '主项',
    compound: '辅助复合',
    accessory: '辅助',
    isolation: '孤立',
    cardio: '有氧',
    cooldown: '放松'
};
const KIND_TAG = {
    main: 'main',
    compound: 'compound',
    accessory: 'accessory',
    isolation: 'isolation',
    cardio: 'cardio',
    ramp: 'warm',
    warmupGeneral: 'warm',
    warmupMobility: 'warm',
    cooldown: 'warm'
};

/** 组间休息是建议，不是倒计时：写成人话，让他自己掌握 */
function restAdvice(sec) {
    if (sec >= 150) return '组间休息 2–3 分钟';
    if (sec >= 120) return '组间休息约 2 分钟';
    if (sec >= 90) return '组间休息 90 秒左右';
    return `组间休息约 ${Math.round(sec / 10) * 10} 秒`;
}

function ClockIco() {
    return (<svg className="micro-ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>
    </svg>);
}

export function SlotRow({ slot, order, dragging, dropTarget, dy, onOpen, onToggleSkip, onHandleDown, onHandleMove, onHandleUp }) {
    const isLift = slot.setPlan.length > 0;
    const isRamp = slot.kind === 'ramp';
    const first = slot.setPlan[0];
    const weightText = !isRamp && first?.weightKg != null ? loadLabel(slot.unit, first.weightKg) : null;
    const last = slot.setPlan[slot.setPlan.length - 1];
    const rpe = last?.rpe || first?.rpe;
    const tone = KIND_TAG[slot.kind] ?? 'accessory';
    // 热身/放松的主语往往很长（器械 + 时长），卡片上只留冒号前的动作名，完整说明在详解里
    const title = !isLift && tone === 'warm' && slot.name.includes('：') ? slot.name.split('：')[0] : slot.name;
    return (<article data-slot={slot.id} className={`slot slot-card tappable ${tone}${dragging ? ' dragging' : ''}${dropTarget && !dragging ? ' dropover' : ''}`} style={dragging ? { transform: `translateY(${dy}px)` } : undefined} role="button" tabIndex={0} aria-label={`看 ${slot.name} 的动作详解`} onClick={() => onOpen(slot)} onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(slot);
            }
        }}>
      <div className="slot-top">
        <span className={`slot-index num${tone === 'main' ? ' main' : tone === 'compound' ? ' compound' : ''}`}>{order}</span>
        <span className="drag-handle" aria-hidden="true" title="拖动排序" onPointerDown={(e) => onHandleDown(e, slot.id)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} onClick={(e) => e.stopPropagation()}>
          <i/><i/><i/><i/><i/><i/>
        </span>
        <div className="slot-title-wrap">
          <div className="slot-title-row">
            <h3>{title}</h3>
            <span className={`slot-role ${tone}`}>{KIND_LABEL[slot.kind] ?? slot.kind}</span>
          </div>
          <div className="slot-meta-line">
            {slot.muscles.length ? <span>目标 {slot.muscles.slice(0, 2).join(' · ')}</span> : null}
            {slot.equipment ? <><span className="dot"/><span>{slot.equipment}</span></> : null}
          </div>
        </div>
        <div className="slot-actions">
          <button type="button" className="slot-remove" aria-label={`今天不练 ${slot.name}`} onClick={(e) => {
                e.stopPropagation();
                onToggleSkip(slot.id);
            }}>
            ×
          </button>
          <span className="slot-more">详解 <span aria-hidden="true">›</span></span>
        </div>
      </div>

      {isLift ? (<>
        <div className="slot-stats">
          <span className="slot-main-dose num">
            <b>{slot.setPlan.length} × {first?.reps}</b>
            {weightText ? <b className="slot-weight">{weightText}</b> : null}
            {isRamp ? <b className="slot-weight">逐组加重</b> : null}
          </span>
          <span className="slot-substats">
            {slot.restSec > 0 && !isRamp ? <span>{restAdvice(slot.restSec)}</span> : null}
            {!isRamp && rpe ? <span className="slot-rpe">RPE {rpe}</span> : null}
          </span>
        </div>
        <div className="set-pills num">
          {slot.setPlan.map((s, i) => (<span className="set-pill" key={i}>
            <span className="set-no">第{i + 1}组{s.drop ? ' · 递减' : ''}</span>
            {slot.unit === '无' ? null : <b>{loadLabel(slot.unit, s.weightKg)}</b>}
            <span className="set-x">×</span>
            <span>{s.reps}</span>
            {s.rpe > 0 ? <span className="set-rpe">RPE{s.rpe}</span> : null}
            {s.restSec > 0 ? <span className="set-rest"><ClockIco/>{s.restSec}s</span> : null}
          </span>))}
        </div>
      </>) : (<div className="slot-timed">
        <span className="slot-main-dose">约 {Math.round(slot.durationSec / 60)} 分钟</span>
        <span className="slot-substats">按时间做</span>
        {slot.note ? <p>{slot.note}</p> : null}
      </div>)}

      {slot.note && isLift ? <div className="slot-note">{slot.note}</div> : null}
      {slot.cautionNote ? <div className="slot-caution">⚠ {slot.cautionNote}（刺痛就停在这组，换动作或减小幅度）</div> : null}
    </article>);
}

/**
 * 训练清单：不按时间轴排，只按做的顺序列出来。
 * 引擎内部仍然按一个工作量上限决定塞几个动作、砍谁，但界面上不出现分钟、档位和倒计时。
 */
export default function Timeline({ sheet, profile, onSkip, onReorder, minimal = false }) {
    const [open, setOpen] = useState(null);
    const [assumedOpen, setAssumedOpen] = useState(false);
    const [drag, setDrag] = useState(null);
    const dragRef = useRef(null);
    const listRef = useRef(null);
    const wants = wantAreasOf(sheet.input);
    const assumed = sheet.assumed ?? [];
    const doing = sheet.slots.filter((s) => !sheet.skipped.includes(s.id));
    const off = sheet.slots.filter((s) => sheet.skipped.includes(s.id));
    const handleDown = (e, id) => {
        const node = listRef.current?.querySelector(`[data-slot="${id}"]`);
        if (!node) return;
        const r = node.getBoundingClientRect();
        const rects = doing.map((s) => {
            const n = listRef.current?.querySelector(`[data-slot="${s.id}"]`);
            const rr = n?.getBoundingClientRect();
            return { id: s.id, center: rr ? rr.top + rr.height / 2 : 0 };
        });
        dragRef.current = { id, startY: e.clientY, center: r.top + r.height / 2, rects };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ id, dy: 0, over: id });
    };
    const handleMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const dy = e.clientY - d.startY;
        const center = d.center + dy;
        let over = d.id;
        let best = Number.POSITIVE_INFINITY;
        for (const r of d.rects) {
            const dist = Math.abs(r.center - center);
            if (dist < best) {
                best = dist;
                over = r.id;
            }
        }
        setDrag({ id: d.id, dy, over });
    };
    const handleUp = () => {
        const d = dragRef.current;
        if (d && drag && drag.over !== d.id) onReorder(d.id, drag.over);
        dragRef.current = null;
        setDrag(null);
    };
    return (<div className={minimal ? 'timeline-wrap minimal' : 'timeline-wrap'}>
      {!minimal ? (<div className="card tight">
          <div className="sheetmeta">
            <span>{sheet.date}</span>
            <span>{sheet.focus}</span>
            {sheet.skipped.length ? <span>今天不练 {sheet.skipped.length} 行</span> : null}
            {wants.length ? <span>今天练：{wants.join('、')}</span> : null}
          </div>
        </div>) : null}
      {sheet.flags.map((f, i) => (<div className="notice" key={i}>{f}</div>))}
      <div className={`timeline${minimal ? ' cards' : ''}`} ref={listRef}>
        {doing.map((s, i) => (<SlotRow key={s.id} slot={s} order={i + 1} dragging={drag?.id === s.id} dropTarget={drag?.over === s.id} dy={drag?.dy ?? 0} onOpen={setOpen} onToggleSkip={onSkip} onHandleDown={handleDown} onHandleMove={handleMove} onHandleUp={handleUp}/>))}
        {!doing.length ? (<div className="timeline-empty">
          <b>今天还没有动作</b>
          <span>点右上角「调整」，或者去自由训练挑几个。</span>
        </div>) : null}
      </div>
      {off.length ? (<div className="skipped-card">
          <div className="picked-row">
            <span className="picked-label">今天不练 {off.length} 行 · 点名字加回来</span>
            {off.map((s) => (<button key={s.id} type="button" className="chip" onClick={() => onSkip(s.id)}>＋ {s.name}</button>))}
          </div>
        </div>) : null}
      {!minimal && sheet.dropped.length > 0 ? (<div className="card">
          <h3>今天压缩了这些</h3>
          {sheet.dropped.map((d, i) => (<div className="small muted" key={i}>· {d}</div>))}
        </div>) : null}
      {!minimal && assumed.length ? (<div className="card">
          <button className="lb-day" onClick={() => setAssumedOpen(!assumedOpen)} aria-expanded={assumedOpen}>
            <span className="lb-title">这些是我替你补的默认（{assumed.length} 项）</span>
            <span className="lb-caret">{assumedOpen ? '▾' : '▸'}</span>
          </button>
          {assumedOpen ? (<div style={{ marginTop: 8 }}>
              {assumed.map((a, i) => (<div className="small muted" key={i}>· {a}</div>))}
            </div>) : (<div className="faint small">{assumed[0]}{assumed.length > 1 ? ` 等 ${assumed.length} 项` : ''}</div>)}
        </div>) : null}
      {open ? <MoveDetail slot={open} profile={profile} onClose={() => setOpen(null)}/> : null}
    </div>);
}
