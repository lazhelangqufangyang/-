import { useEffect, useMemo, useRef, useState } from 'react';
import { highlightFor, lerpPose, skeleton, VIEW_H, VIEW_W } from '../engine/anim.js';
const CYCLE_MS = 3200;
function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const on = (e) => setReduced(e.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return reduced;
}
/** easeInOut，让动作在两端有停顿而不是匀速摆 */
function ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function cableAnchor(pattern) {
    if (pattern === 'horizontalPull')
        return { x: 234, y: 150 };
    return { x: 200, y: 10 };
}
const NO_HOT = new Set();
function Stick({ s, hot, ghost }) {
    const segs = [
        [s.hip, s.shoulder, 'torso'],
        [s.hip, s.knee, 'thigh'],
        [s.knee, s.ankle, 'shank'],
        [s.shoulder, s.elbow, 'arm'],
        [s.elbow, s.hand, 'fore']
    ];
    if (s.knee2 && s.ankle2 && s.elbow2 && s.hand2 && s.toe2) {
        segs.push([s.hip, s.knee2, 'thigh'], [s.knee2, s.ankle2, 'shank'], [s.shoulder, s.elbow2, 'arm'], [s.elbow2, s.hand2, 'fore']);
    }
    return (<g opacity={ghost ? 0.22 : 1}>
      <line x1={s.pad[0].x} y1={s.pad[0].y} x2={s.pad[1].x} y2={s.pad[1].y} className="anim-pad"/>
      {segs.map(([a, b, k], i) => (<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={hot.has(k) && !ghost ? 'anim-seg hot' : 'anim-seg'}/>))}
      <line x1={s.ankle.x} y1={s.ankle.y} x2={s.toe.x} y2={s.toe.y} className="anim-seg"/>
      {s.toe2 ? <line x1={s.ankle2.x} y1={s.ankle2.y} x2={s.toe2.x} y2={s.toe2.y} className="anim-seg"/> : null}
      <line x1={s.shoulder.x} y1={s.shoulder.y} x2={s.head.x} y2={s.head.y} className="anim-seg"/>
      <circle cx={s.head.x} cy={s.head.y} r={11} className="anim-head"/>
      {ghost ? null : (<g className="anim-joint">
          {[s.hip, s.knee, s.ankle, s.shoulder, s.elbow, s.hand].map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r={2.6}/>))}
        </g>)}
    </g>);
}
/** 手上的负重：杠铃在侧视里就是端面对着你的两个圆片 */
function HandWeight({ at, rig, prop }) {
    if (prop === 'none' || prop === 'cable')
        return null;
    if (prop === 'dumbbell') {
        return (<g className="anim-prop">
        <line x1={at.x - 6} y1={at.y} x2={at.x + 6} y2={at.y}/>
        <circle cx={at.x - 8} cy={at.y} r={5}/>
        <circle cx={at.x + 8} cy={at.y} r={5}/>
      </g>);
    }
    if (rig === 'side') {
        return (<g className="anim-prop">
        <circle cx={at.x} cy={at.y} r={9}/>
        <circle cx={at.x} cy={at.y} r={3.5}/>
      </g>);
    }
    return (<g className="anim-prop">
      <circle cx={at.x} cy={at.y} r={6}/>
    </g>);
}
export default function MoveAnim({ rig, start, end, prop, pattern }) {
    const reduced = useReducedMotion();
    const [t, setT] = useState(0);
    const raf = useRef(0);
    useEffect(() => {
        if (reduced)
            return;
        let from = 0;
        const step = (now) => {
            if (!from)
                from = now;
            const phase = ((now - from) % CYCLE_MS) / CYCLE_MS;
            // 前 42% 是向心（起），后面慢慢放回，两端各留一点停顿
            const raw = phase < 0.42 ? phase / 0.42 : 1 - (phase - 0.42) / 0.58;
            setT(ease(Math.max(0, Math.min(1, raw))));
            raf.current = requestAnimationFrame(step);
        };
        raf.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf.current);
    }, [reduced]);
    const hot = useMemo(() => new Set(highlightFor(pattern)), [pattern]);
    const s = skeleton(reduced ? start : lerpPose(start, end, t), rig);
    const range = skeleton(end, rig);
    const anchor = cableAnchor(pattern);
    const grip = pattern === 'squat' ? s.shoulder : pattern === 'hipThrust' ? s.hip : s.hand;
    return (<div className="moveanimwrap">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="moveanim" role="img" aria-label="动作关节示意图">
        <Stick s={range} hot={NO_HOT} ghost/>
        {prop === 'cable' ? (<g className="anim-prop">
            <line x1={s.hand.x} y1={s.hand.y} x2={anchor.x} y2={anchor.y}/>
            <line x1={s.hand.x - 6} y1={s.hand.y - 4} x2={s.hand.x + 6} y2={s.hand.y + 4}/>
          </g>) : null}
        {prop === 'machine' ? (<g className="anim-prop">
            <rect x={204} y={26} width={24} height={122} rx={3}/>
            {[0, 1, 2, 3, 4].map((i) => (<line key={i} x1={206} y1={42 + i * 22} x2={226} y2={42 + i * 22}/>))}
          </g>) : null}
        {rig === 'front' && prop === 'bar' ? (<g className="anim-prop">
            <line x1={(s.hand2?.x ?? s.hand.x) - 20} y1={s.hand.y} x2={s.hand.x + 20} y2={s.hand.y}/>
            <circle cx={(s.hand2?.x ?? s.hand.x) - 22} cy={s.hand.y} r={6}/>
            <circle cx={s.hand.x + 22} cy={s.hand.y} r={6}/>
          </g>) : null}
        {rig === 'front' && prop !== 'bar' ? (<>
            <HandWeight at={s.hand} rig={rig} prop={prop}/>
            {s.hand2 ? <HandWeight at={s.hand2} rig={rig} prop={prop}/> : null}
          </>) : null}
        {rig === 'side' ? <HandWeight at={grip} rig={rig} prop={prop}/> : null}
        <Stick s={s} hot={hot} ghost={false}/>
      </svg>
    </div>);
}
