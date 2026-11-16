import { useEffect, useRef, useState } from 'react';

const LERP = 0.45;
const TILT = 0.8;
const TILT_Z = 0.08;
const TILT_MAX = 25;
const TILT_Z_MAX = 8;
const EASE = 0.2;
const DROP_FORCE = 0.35;
const DROP_FRICTION = 0.58;
const SETTLE_DIST = 0.5;
const SETTLE_SPEED = 0.5;
const SLOP = 6;
/** 按住不动满一秒才允许拖：卡片大半屏，滑一下就跟着跑会误触 */
const HOLD_MS = 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 拖卡片换日期：先按住 1 秒，卡片亮起来之后才跟手 —— ghost 带速度倾斜，
 * 悬停到哪一天就变身显示那一天，松手弹簧落进目标卡片；一秒内的点按仍是「看那天」。
 */
export function useVelocityDrag({ enabled, onDrop, onPick, labelFor, targetSelector, cardSelector }) {
    const [draggingDate, setDraggingDate] = useState(null);
    const [overDate, setOverDate] = useState(null);
    const st = useRef(null);
    const raf = useRef(0);
    const cb = useRef(null);
    cb.current = { onDrop, onPick, labelFor, targetSelector, cardSelector };

    const stop = () => {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
        const s = st.current;
        if (s) {
            clearTimeout(s.holdTimer);
            s.ghost.remove();
            s.cardEl.classList.remove('vd-src', 'vd-arm');
        }
        st.current = null;
        setDraggingDate(null);
        setOverDate(null);
    };

    const tick = () => {
        const s = st.current;
        if (!s)
            return;
        let trx = 0, tryy = 0, trz = 0, tsc = 1;
        if (s.mode === 'drag') {
            const ox = s.px, oy = s.py;
            if (s.reduced) {
                s.px = s.tx;
                s.py = s.ty;
            }
            else {
                s.px += (s.tx - s.px) * LERP;
                s.py += (s.ty - s.py) * LERP;
            }
            s.vx = s.px - ox;
            s.vy = s.py - oy;
            tryy = clamp(s.vx * TILT, -TILT_MAX, TILT_MAX);
            trx = clamp(-s.vy * TILT, -TILT_MAX, TILT_MAX);
            trz = clamp(s.vx * TILT_Z, -TILT_Z_MAX, TILT_Z_MAX);
            tsc = 1.02;
        }
        else if (s.mode === 'drop') {
            const el = document.querySelector(`${cb.current.cardSelector}[data-date="${s.dropDate}"]`);
            if (el) {
                const r = el.getBoundingClientRect();
                s.dx = r.left + s.grabX;
                s.dy = r.top + s.grabY;
            }
            s.vx = (s.vx + (s.dx - s.px) * DROP_FORCE) * DROP_FRICTION;
            s.vy = (s.vy + (s.dy - s.py) * DROP_FORCE) * DROP_FRICTION;
            s.px += s.vx;
            s.py += s.vy;
            if (Math.abs(s.dx - s.px) + Math.abs(s.dy - s.py) < SETTLE_DIST && Math.abs(s.vx) + Math.abs(s.vy) < SETTLE_SPEED) {
                stop();
                return;
            }
        }
        s.rx += (trx - s.rx) * EASE;
        s.ry += (tryy - s.ry) * EASE;
        s.rz += (trz - s.rz) * EASE;
        s.sc += (tsc - s.sc) * EASE;
        s.ghost.style.transform = `translate(${s.px}px, ${s.py}px) translate(${-s.grabX}px, ${-s.grabY}px) perspective(1200px) rotateX(${s.rx}deg) rotateY(${s.ry}deg) rotateZ(${s.rz}deg) scale(${s.sc})`;
        raf.current = requestAnimationFrame(tick);
    };

    const move = (e) => {
        const s = st.current;
        if (!s)
            return;
        s.tx = e.clientX;
        s.ty = e.clientY;
        if (s.mode === 'hold') {
            // 一秒没到就动了：当这次没按，不拖也不算点按
            if (Math.abs(e.clientX - s.sx) + Math.abs(e.clientY - s.sy) < SLOP)
                return;
            stop();
            return;
        }
        if (s.mode === 'maybe') {
            if (Math.abs(e.clientX - s.sx) + Math.abs(e.clientY - s.sy) < SLOP)
                return;
            s.mode = 'drag';
            s.cardEl.classList.remove('vd-arm');
            s.cardEl.classList.add('vd-src');
            s.ghost.classList.add('on', 'is-morphing');
            setDraggingDate(s.date);
        }
        if (s.mode !== 'drag')
            return;
        const hit = [...document.querySelectorAll(cb.current.targetSelector)].find((c) => {
            const r = c.getBoundingClientRect();
            return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        });
        const date = hit?.dataset.date ?? null;
        if (date !== s.over) {
            s.over = date;
            setOverDate(date);
            if (date)
                s.nw.textContent = cb.current.labelFor(date);
        }
    };

    const release = (commit) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        const s = st.current;
        if (!s)
            return;
        if (s.mode === 'hold') {
            // 还没按满一秒：松手就是普通的点一下，选那天看
            const date = s.date;
            stop();
            if (commit)
                cb.current.onPick(date);
            return;
        }
        if (s.mode === 'maybe') {
            const date = s.date;
            stop();
            cb.current.onPick(date);
            return;
        }
        const to = commit && s.over && s.over !== s.date ? s.over : null;
        if (to)
            cb.current.onDrop(s.date, to);
        s.dropDate = to ?? s.date;
        const el = document.querySelector(`${cb.current.cardSelector}[data-date="${s.dropDate}"]`);
        const r = (el ?? s.cardEl).getBoundingClientRect();
        s.dx = r.left + s.grabX;
        s.dy = r.top + s.grabY;
        s.mode = 'drop';
        s.ghost.classList.remove('is-morphing');
        setOverDate(null);
    };
    const up = () => release(true);
    const cancel = () => release(false);

    const bind = (date) => ({
        onPointerDown: (e) => {
            if (!enabled || (e.pointerType === 'mouse' && e.button !== 0))
                return;
            if (st.current)
                stop();
            const cardEl = e.currentTarget;
            const rect = cardEl.getBoundingClientRect();
            const ghost = document.createElement('div');
            ghost.className = 'vd-ghost';
            ghost.style.width = `${rect.width}px`;
            ghost.style.height = `${rect.height}px`;
            const orig = document.createElement('div');
            orig.className = 'vd-orig';
            orig.innerHTML = cardEl.innerHTML;
            const nw = document.createElement('div');
            nw.className = 'vd-new';
            ghost.append(orig, nw);
            document.body.appendChild(ghost);
            st.current = {
                date, cardEl, ghost, nw,
                grabX: e.clientX - rect.left, grabY: e.clientY - rect.top,
                sx: e.clientX, sy: e.clientY, tx: e.clientX, ty: e.clientY,
                px: e.clientX, py: e.clientY, vx: 0, vy: 0,
                rx: 0, ry: 0, rz: 0, sc: 1,
                dx: e.clientX, dy: e.clientY,
                mode: 'hold', over: null,
                holdTimer: 0,
                reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            };
            // 一秒内没挪动才解锁拖动，卡片亮一圈告诉他已经可以拽了
            const s = st.current;
            s.holdTimer = setTimeout(() => {
                if (st.current !== s || s.mode !== 'hold')
                    return;
                s.mode = 'maybe';
                cardEl.classList.add('vd-arm');
            }, HOLD_MS);
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', cancel);
            if (!raf.current)
                raf.current = requestAnimationFrame(tick);
        }
    });

    useEffect(() => () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        stop();
    }, []);

    return { bind, draggingDate, overDate };
}