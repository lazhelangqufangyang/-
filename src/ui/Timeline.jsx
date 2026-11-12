import { useRef, useState } from 'react';
import { wantAreasOf } from '../engine/day.js';
import { loadLabel } from '../engine/load.js';
import MoveDetail from './MoveDetail.jsx';
const KIND_LABEL = {
    warmupGeneral: '升温',
    warmupMobility: '活动度',
    ramp: '递增热身',
    main: '主项',
    compound: '大重量复合',
    accessory: '辅助复合',
    isolation: '孤立',
    cardio: '有氧',
    cooldown: '放松'
};
/** 组间休息是建议，不是倒计时：写成人话，让他自己掌握 */
function restAdvice(sec) {
    if (sec >= 150)
        return '组间休息 2–3 分钟';
    if (sec >= 120)
        return '组间休息约 2 分钟';
    if (sec >= 90)
        return '组间休息 90 秒左右';
    return `组间休息约 ${Math.round(sec / 10) * 10} 秒`;
}
export function SlotRow({ slot, order, dragging, dropTarget, dy, onOpen, onToggleSkip, onHandleDown, onHandleMove, onHandleUp }) {
    const isLift = slot.setPlan.length > 0;
    const isRamp = slot.kind === 'ramp';
    const first = slot.setPlan[0];
    const weightText = !isRamp && first?.weightKg != null ? loadLabel(slot.unit, first.weightKg) : null;
    return (<div data-slot={slot.id} className={`slot tappable${dragging ? ' dragging' : ''}${dropTarget && !dragging ? ' dropover' : ''}${slot.kind === 'main' ? ' main' : slot.kind.startsWith('warmup') || slot.kind === 'ramp' ? ' warm' : ''}`} style={dragging ? { transform: `translateY(${dy}px)` } : undefined} role="button" tabIndex={0} aria-label={`看 ${slot.name} 的动作详解`} onClick={() => onOpen(slot)} onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(slot);
            }
        }}>
      <div className="when num">
        {order}
        {!isLift ? <span className="dur">约 {Math.round(slot.durationSec / 60)} 分</span> : null}
      </div>
      <div className="body">
        <div className="name">
          <span className="drag-handle" aria-hidden="true" onPointerDown={(e) => onHandleDown(e, slot.id)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} onClick={(e) => e.stopPropagation()}>
            ⠿
          </span>
          {slot.name}
          <span className="pres">{KIND_LABEL[slot.kind] ?? slot.kind}</span>
          <button className="skip-link" onClick={(e) => {
            e.stopPropagation();
            onToggleSkip(slot.id);
        }}>
            今天不练
          </button>
          <span className="more">详解 ›</span>
        </div>
        {isLift ? (<div className="dose num">
            <b>
              {slot.sets} × {first?.reps}
            </b>
            {weightText ? <> · <b>{weightText}</b></> : null}
            {isRamp ? <> · <b>逐组加重</b></> : null}
            {slot.restSec > 0 && !isRamp ? <> · {restAdvice(slot.restSec)}</> : null}
            {!isRamp && slot.setPlan.length ? <> · RPE 目标 <b>{slot.setPlan[slot.setPlan.length - 1].rpe || slot.setPlan[0].rpe}</b></> : null}
          </div>) : (<div className="dose">{slot.note}</div>)}
        {slot.muscles.length > 0 ? <div className="meta">目标肌群 {slot.muscles.join(' · ')} · {slot.equipment}</div> : null}
        {isLift ? (<div className="sets num">
            {slot.setPlan.map((s, i) => (<span className="s" key={i}>
                第{i + 1}组{s.drop ? ' 递减' : ''}{' '}
                {slot.unit === '无' ? null : <b>{loadLabel(slot.unit, s.weightKg)}</b>} × {s.reps}
                {s.rpe > 0 ? ` RPE${s.rpe}` : ''}
                {s.restSec > 0 ? ` 休${s.restSec}s` : ''}
              </span>))}
          </div>) : null}
        {isLift && slot.note ? <div className="note">{slot.note}</div> : null}
        {slot.cautionNote ? <div className="caution">⚠ {slot.cautionNote}（刺痛就停在这组，换动作或减小幅度）</div> : null}
      </div>
    </div>);
}
/**
 * 训练清单：不按时间轴排，只按做的顺序列出来。
 * 引擎内部仍然按一个工作量上限决定塞几个动作、砍谁，但界面上不出现分钟、档位和倒计时。
 */
export default function Timeline({ sheet, profile, onSkip, onReorder }) {
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
        if (!node)
            return;
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
        if (!d)
            return;
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
        if (d && drag && drag.over !== d.id)
            onReorder(d.id, drag.over);
        dragRef.current = null;
        setDrag(null);
    };
    return (<div>
      <div className="card tight">
        <div className="sheetmeta">
          <span>{sheet.date}</span>
          <span>{sheet.focus}</span>
          {sheet.skipped.length ? <span>今天不练 {sheet.skipped.length} 行</span> : null}
          {wants.length ? <span>今天练：{wants.join('、')}</span> : null}
        </div>
      </div>
      {sheet.flags.map((f, i) => (<div className="notice" key={i}>
          {f}
        </div>))}
      <div className="timeline" ref={listRef}>
        {doing.map((s, i) => (<SlotRow key={s.id} slot={s} order={i + 1} dragging={drag?.id === s.id} dropTarget={drag?.over === s.id} dy={drag?.dy ?? 0} onOpen={setOpen} onToggleSkip={onSkip} onHandleDown={handleDown} onHandleMove={handleMove} onHandleUp={handleUp}/>))}
      </div>
      {off.length ? (<div className="card tight">
          <div className="picked-row">
            <span className="picked-label">今天不练 {off.length} 行 · 点名字练回来</span>
            {off.map((s) => (<button key={s.id} className="chip" onClick={() => onSkip(s.id)}>
                ＋ {s.name}
              </button>))}
          </div>
        </div>) : null}
      {sheet.dropped.length > 0 ? (<div className="card">
          <h3>今天压缩了这些</h3>
          {sheet.dropped.map((d, i) => (<div className="small muted" key={i}>
              · {d}
            </div>))}
        </div>) : null}
      {assumed.length ? (<div className="card">
          <button className="lb-day" onClick={() => setAssumedOpen(!assumedOpen)} aria-expanded={assumedOpen}>
            <span className="lb-title">这些是我替你补的默认（{assumed.length} 项）</span>
            <span className="lb-caret">{assumedOpen ? '▾' : '▸'}</span>
          </button>
          {assumedOpen ? (<div style={{ marginTop: 8 }}>
              {assumed.map((a, i) => (<div className="small muted" key={i}>
                  · {a}
                </div>))}
            </div>) : (<div className="faint small">
              {assumed[0]}
              {assumed.length > 1 ? ` 等 ${assumed.length} 项` : ''}
            </div>)}
        </div>) : null}
      {open ? <MoveDetail slot={open} profile={profile} onClose={() => setOpen(null)}/> : null}
    </div>);
}
