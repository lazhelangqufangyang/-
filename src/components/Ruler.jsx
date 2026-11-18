import { useEffect, useRef } from 'react';
const TICK = 18;
/**
 * 刻度尺选数值：中间那条红线指着哪个刻度就是哪个数。
 * 值存字符串，空串是「这一项没答」—— 跳过整问时靠它区分 0 和没填。
 */
export default function Ruler({ label, unit, min, max, step = 1, every = 5, value, onChange }) {
    const track = useRef(null);
    const hold = useRef(0);
    const count = Math.round((max - min) / step) + 1;
    const shown = value.trim() === '' ? null : Number(value);
    const current = shown !== null && Number.isFinite(shown) ? shown : null;
    const place = (i) => {
        const el = track.current;
        if (!el)
            return;
        // 这次赋值会触发一个 scroll 事件，hold 让它不被当成用户改过
        hold.current = Date.now();
        el.scrollLeft = i * TICK;
    };
    useEffect(() => {
        place(current === null ? Math.round((count - 1) / 2) : Math.round((current - min) / step) || 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // 「跳过这问」把值清空后，尺子回到中间，别让指针停在原来那个数上
    useEffect(() => {
        if (value.trim() !== '')
            return;
        place(Math.round((count - 1) / 2));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, count]);
    const onScroll = () => {
        const el = track.current;
        if (!el)
            return;
        if (Date.now() - hold.current < 160)
            return;
        const i = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / TICK)));
        const v = Math.round((min + i * step) * 10) / 10;
        if (v !== current)
            onChange(String(v));
    };
    return (<div className="ruler">
      <div className="ruler-top">
        <span className="ruler-label">{label}</span>
        <span className="ruler-val">{current === null ? `没选 ${unit}` : `${current} ${unit}`}</span>
      </div>
      <div className="ruler-body">
        <div className="ruler-track" ref={track} onScroll={onScroll} tabIndex={0} role="group" aria-label={`${label}，当前 ${current === null ? '没选' : current + ' ' + unit}`}>
          <div className="ruler-ticks">
            {Array.from({ length: count }, (_, i) => {
            const v = Math.round((min + i * step) * 10) / 10;
            const major = Math.round(v) % every === 0;
            return (<span key={i} className={`ruler-tick${major ? ' major' : ''}`}>
                  {major ? <em>{v}</em> : null}
                </span>);
        })}
          </div>
        </div>
        <span className="ruler-mark"/>
      </div>
    </div>);
}
