import { useEffect, useRef } from 'react';
import { RPE_MAX, RPE_MIN, RPE_TOP } from '../engine/rpe.js';
import { mountEffortMotion } from './effortMotion.js';

const MUSCLE = 'M14 8C20 4.5 28 7 29 15C30 20 29 23 25 26L27 34C28 37 31 37 34 33C38 27 45 25 50 29C55 32 58 39 56 46C54 52 47 56 39 55L23 54C15 53 10 48 10 41L10 22C10 15 9 11 14 8Z';
const LINES = ['M15 14C19 11 24 12 26 16', 'M28 37C31 40 34 39 36 35'];
const FIBERS = [
    { tier: 1, w: '2.8', d: ['M35 35C40 31 46 30 50 33'] },
    { tier: 2, w: '2.6', d: ['M33 41C39 37 46 36 52 39'] },
    { tier: 3, w: '2.4', d: ['M33 47C39 44 46 43 53 46'] },
    { tier: 4, w: '2.2', d: ['M50 30C47 35 47 41 50 46'] },
    { tier: 5, w: '1.9', d: ['M17 29C19 34 19 40 17 45', 'M23 31C25 36 25 41 23 46'] }
];
const MARKS = [6, 7, 8, 9, 10];
const at = (t) => `calc(16px + (100% - 32px) * ${t})`;
export default function EffortSlider({ value, onChange }) {
    const hostRef = useRef(null);
    const motion = useRef(null);
    const change = useRef(onChange);
    change.current = onChange;
    useEffect(() => {
        const m = mountEffortMotion(hostRef.current, { onChange: (v) => change.current(v) });
        motion.current = m;
        return () => {
            m.destroy();
            motion.current = null;
        };
    }, []);
    useEffect(() => {
        motion.current?.setValue(value ?? null);
    }, [value]);
    return (<div className="es" ref={hostRef} data-unset="true">
      <canvas className="es-sparks" aria-hidden="true"/>
      <div className="es-head">
        <span className="es-cap">这组多累</span>
        <button type="button" className="es-clear" onClick={() => onChange(null)}>
          不填
        </button>
        <b className="es-value num"/>
        <span className="es-label"/>
      </div>
      <div className="es-control" role="slider" tabIndex={0} aria-label="这组多累 RPE" aria-valuemin={RPE_MIN} aria-valuemax={RPE_MAX} aria-orientation="horizontal">
        <div className="es-track" aria-hidden="true">
          <div className="es-fill"/>
          <canvas className="es-pixels"/>
          {Array.from({ length: RPE_TOP + 1 }, (_, i) => (<i key={i} className="es-tick" data-major={i % 2 === 0 ? '' : undefined} style={{ left: at(i / RPE_TOP) }}/>))}
        </div>
        <div className="es-thumb">
          <svg className="es-muscle" viewBox="0 0 64 64" aria-hidden="true">
            <path d={MUSCLE}/>
            {LINES.map((d) => (<path key={d} className="es-muscle-line" d={d}/>))}
            {FIBERS.map((f) => (<g key={f.tier} className="es-fiber-layer" data-tier={f.tier} style={{ '--es-fiber-width': f.w }}>
                {f.d.map((d) => (<path key={d} className="es-fiber" pathLength="1" d={d}/>))}
              </g>))}
          </svg>
        </div>
      </div>
      <div className="es-scale num" aria-hidden="true">
        {MARKS.map((n, i) => (<span key={n} style={{ left: at(i / (MARKS.length - 1)) }}>
            {n}
          </span>))}
      </div>
    </div>);
}
