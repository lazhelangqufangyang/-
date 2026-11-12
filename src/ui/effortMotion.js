import { RPE_LABELS, RPE_STEPS, RPE_TOP, rpeAt, rpeIndex } from '../engine/rpe.js';

const SPARK_COLORS = ['#12a3a8', '#d6379f', '#6b4fd0', '#4a2fa8', '#d97a12', '#e0356f'];
const FILL_STOPS = [0, 30, 60, 90, 100];
/** 四档底色：越往后越烫，从淡粉一路推到橙红 */
const FILL_PALETTES = [
    [[255, 230, 234], [255, 208, 216], [252, 174, 190], [246, 144, 164], [240, 124, 146]],
    [[255, 226, 230], [255, 199, 209], [252, 155, 172], [246, 116, 138], [240, 92, 116]],
    [[255, 222, 226], [255, 189, 199], [252, 134, 152], [244, 92, 114], [238, 64, 90]],
    [[255, 216, 216], [255, 178, 182], [252, 114, 126], [244, 66, 86], [255, 108, 62]]
];
const THUMB_R = 16;
const CELL = 6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
};
export function mountEffortMotion(host, { onChange }) {
    const control = host.querySelector('.es-control');
    const track = host.querySelector('.es-track');
    const fill = host.querySelector('.es-fill');
    const thumb = host.querySelector('.es-thumb');
    const muscle = host.querySelector('.es-muscle');
    const valueEl = host.querySelector('.es-value');
    const labelEl = host.querySelector('.es-label');
    const pixels = host.querySelector('.es-pixels');
    const sparks = host.querySelector('.es-sparks');
    const fibers = [...muscle.querySelectorAll('.es-fiber-layer')];
    const dots = pixels.getContext('2d');
    const dust = sparks.getContext('2d');
    const cell = typeof dots.roundRect === 'function'
        ? (x, y, s) => { dots.beginPath(); dots.roundRect(x, y, s, s, 1); dots.fill(); }
        : (x, y, s) => dots.fillRect(x, y, s, s);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const state = { position: 0, velocity: 0, target: 0, galaxy: 0, galaxyVelocity: 0 };
    let level = 0;
    let unset = true;
    let frame = 0;
    let last = 0;
    let clock = 0;
    let entered = -100;
    let dragging = false;
    let pointerId = null;
    let startValue = 0;
    let startUnset = true;
    let visible = true;
    let dead = false;
    let trackW = 300;
    let trackH = 28;
    let travel = 268;
    let panelW = 300;
    let panelH = 96;
    let letters = [];
    const emit = (v) => onChange(v);
    function showLevel(index) {
        const text = RPE_LABELS[index];
        host.dataset.level = index === RPE_TOP ? 'galaxy' : String(index);
        control.setAttribute('aria-valuenow', String(RPE_STEPS[index]));
        control.setAttribute('aria-valuetext', `${RPE_STEPS[index]} ${text}`);
        valueEl.textContent = String(RPE_STEPS[index]);
        if (index === level && labelEl.dataset.text === text)
            return;
        level = index;
        labelEl.dataset.text = text;
        letters.forEach((a) => a.cancel());
        letters = [];
        labelEl.replaceChildren(...[...text].map((ch, i) => {
            const span = document.createElement('span');
            span.className = 'es-letter';
            span.textContent = ch;
            if (!media.matches)
                letters.push(span.animate([
                    { opacity: 0, filter: 'blur(4px)', transform: 'translateY(5px)' },
                    { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' }
                ], { duration: 220, delay: i * 22, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
            return span;
        }));
    }
    function showUnset() {
        unset = true;
        level = 0;
        letters.forEach((a) => a.cancel());
        letters = [];
        labelEl.dataset.text = '';
        labelEl.replaceChildren();
        valueEl.textContent = '—';
        host.dataset.level = 'unset';
        host.dataset.unset = 'true';
        control.setAttribute('aria-valuenow', String(RPE_STEPS[0]));
        control.setAttribute('aria-valuetext', '没填');
    }
    function drawPixels(time, strength) {
        dots.clearRect(0, 0, trackW, trackH);
        if (strength <= 0)
            return;
        const cols = Math.max(1, Math.ceil(trackW / CELL));
        const rows = Math.max(1, Math.floor(trackH / CELL));
        for (let row = 0; row < rows; row += 1)
            for (let col = 0; col < cols; col += 1) {
                const n = row * 49 + col;
                const seed = hash(n + 7);
                const wave = 0.5 + 0.5 * Math.sin(time * (2 + seed * 3) + n * 1.618);
                const across = col / Math.max(1, cols - 1);
                const density = 0.14 + 0.78 * Math.pow(across, 1.6);
                if (seed > density + 0.16 * Math.sin(time * 1.8 + col * 0.2))
                    continue;
                dots.globalAlpha = strength * (0.18 + 0.72 * wave) * (0.22 + 0.78 * across);
                dots.fillStyle = SPARK_COLORS[Math.floor(hash(n + 211) * SPARK_COLORS.length)];
                cell(col * CELL + 0.8, row * CELL + 0.4, seed > 0.74 ? 4.3 : 3.8);
            }
        dots.globalAlpha = 1;
    }
    function drawSparks(time, strength) {
        dust.clearRect(0, 0, panelW, panelH);
        if (strength <= 0)
            return;
        const burst = Math.exp(-Math.max(0, time - entered) * 5);
        const cx = control.offsetLeft + track.offsetLeft + THUMB_R + (state.position / RPE_TOP) * travel;
        const cy = control.offsetTop + track.offsetTop + trackH / 2;
        const reach = Math.min(78, panelH * 0.85);
        for (let ray = 0; ray < 26; ray += 1) {
            const angle = ray * 2.399963;
            const seed = hash(ray + 94);
            const speed = 15 + seed * 24;
            for (let dot = 0; dot < 7; dot += 1) {
                const radius = 16 + ((dot * 9 + time * speed + seed * 40) % reach);
                const fade = Math.pow(1 - clamp((radius - 16) / (reach + 16), 0, 1), 1.6);
                const pulse = 0.45 + 0.55 * Math.pow(Math.sin(time * 4 + ray + dot), 2);
                dust.globalAlpha = strength * fade * pulse * (0.4 + burst * 0.35);
                dust.fillStyle = SPARK_COLORS[(ray + dot) % SPARK_COLORS.length];
                const size = seed > 0.65 ? 2.4 : 1.6;
                dust.fillRect(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, size, size);
            }
        }
        dust.globalAlpha = 1;
    }
    function draw() {
        const p = clamp(state.position, 0, RPE_TOP);
        const t = p / RPE_TOP;
        const g = clamp(state.galaxy, 0, 1);
        const age = Math.max(0, clock - entered);
        const burst = Math.exp(-age * 6) * g;
        const norm = t * 5;
        fibers.forEach((layer) => {
            const amount = clamp((norm - Number(layer.dataset.tier) + 0.85) / 0.7, 0, 1);
            const reveal = amount * amount * (3 - 2 * amount);
            layer.style.opacity = String(reveal);
            layer.style.setProperty('--es-fiber-hidden', String(1 - reveal));
        });
        thumb.style.left = `${THUMB_R + t * travel}px`;
        thumb.style.transform = `translate(-50%, -50%) scale(${1 + g * 0.2 + burst * 0.16})`;
        muscle.style.setProperty('--es-muscle-fill', g > 0.01
            ? `rgb(${Math.round(255 - 87 * g)},${Math.round(143 - 11 * g)},${Math.round(163 + 83 * g)})`
            : '#ff8fa3');
        muscle.style.setProperty('--es-muscle-edge', g > 0.01
            ? `rgb(${Math.round(122 - 48 * g)},${Math.round(18 + 24 * g)},${Math.round(38 + 112 * g)})`
            : '#7a1226');
        thumb.style.filter = g > 0.01
            ? `drop-shadow(0 0 ${3 + burst * 7}px rgba(255,77,109,0.9)) drop-shadow(0 0 ${7 + burst * 11}px rgba(131,81,255,0.45))`
            : 'none';
        const at = THUMB_R + t * travel;
        fill.style.width = `${at}px`;
        fill.style.opacity = String((1 - g) * (unset ? 0.35 : 1));
        pixels.style.opacity = String(g);
        const tint = clamp(t * 3.4 - 0.2, 0, 3);
        const pi = Math.min(2, Math.floor(tint));
        const blend = tint - pi;
        fill.style.backgroundImage = `linear-gradient(90deg, ${FILL_PALETTES[pi].map((rgb, i) => `rgb(${rgb.map((c, k) => Math.round(c + (FILL_PALETTES[pi + 1][i][k] - c) * blend)).join(',')}) ${FILL_STOPS[i]}%`).join(', ')})`;
        const shake = media.matches ? 0 : g * (0.2 + Math.exp(-age * 7) * 1.4);
        host.style.transform = shake ? `translate(${Math.sin(clock * 93) * shake}px,${Math.cos(clock * 117) * shake * 0.65}px)` : 'none';
        drawPixels(clock, g);
        drawSparks(clock, media.matches ? 0 : g);
        host.dataset.position = p.toFixed(3);
        host.dataset.galaxy = g.toFixed(3);
        host.dataset.dragging = String(dragging);
    }
    function spring(key, velKey, target, dt, k, damping) {
        state[velKey] += ((target - state[key]) * k - state[velKey] * damping) * dt;
        state[key] += state[velKey] * dt;
        if (Math.abs(state[key] - target) < 0.0002 && Math.abs(state[velKey]) < 0.002) {
            state[key] = target;
            state[velKey] = 0;
        }
        return state[key] !== target || state[velKey] !== 0;
    }
    function settle() {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        state.position = state.target;
        state.velocity = 0;
        state.galaxy = level === RPE_TOP && !unset ? 1 : 0;
        state.galaxyVelocity = 0;
        letters.forEach((a) => a.cancel());
        letters = [];
        draw();
        host.dataset.moving = 'false';
    }
    function tick(time) {
        frame = 0;
        if (dead || !visible || document.hidden)
            return;
        if (media.matches) {
            settle();
            return;
        }
        const dt = Math.min(0.032, (time - (last || time - 16)) / 1000);
        last = time;
        clock += dt;
        let moving = false;
        for (let step = 0; step < 3; step += 1) {
            moving = spring('position', 'velocity', state.target, dt / 3, 420, 32) || moving;
            moving = spring('galaxy', 'galaxyVelocity', level === RPE_TOP && !unset ? 1 : 0, dt / 3, 190, 25) || moving;
        }
        draw();
        host.dataset.moving = String(moving);
        if (moving || state.galaxy > 0.001)
            frame = requestAnimationFrame(tick);
        else
            last = 0;
    }
    function wake() {
        if (dead)
            return;
        if (media.matches) {
            settle();
            return;
        }
        if (visible && !document.hidden && !frame)
            frame = requestAnimationFrame(tick);
    }
    function select(pos, commit = false) {
        const next = clamp(pos, 0, RPE_TOP);
        const index = Math.round(next);
        const wasTop = level === RPE_TOP && !unset;
        unset = false;
        host.dataset.unset = 'false';
        state.target = next;
        showLevel(index);
        if (index === RPE_TOP && !wasTop)
            entered = clock;
        draw();
        wake();
        if (commit)
            emit(rpeAt(index));
    }
    function setValue(v) {
        if (v === null || v === undefined) {
            state.target = 0;
            showUnset();
            draw();
            wake();
            return;
        }
        select(rpeIndex(v));
    }
    function fit() {
        trackW = Math.max(60, track.clientWidth);
        trackH = Math.max(24, track.clientHeight);
        travel = Math.max(1, trackW - THUMB_R * 2);
        panelW = Math.max(1, host.clientWidth);
        panelH = Math.max(1, host.clientHeight);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        pixels.width = Math.round(trackW * dpr);
        pixels.height = Math.round(trackH * dpr);
        dots.setTransform(dpr, 0, 0, dpr, 0, 0);
        sparks.width = Math.round(panelW * dpr);
        sparks.height = Math.round(panelH * dpr);
        dust.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }
    const pointerPos = (e) => {
        const b = track.getBoundingClientRect();
        return clamp(((e.clientX - b.left - THUMB_R) / travel) * RPE_TOP, 0, RPE_TOP);
    };
    const onDown = (e) => {
        if (e.button !== 0 || pointerId !== null)
            return;
        e.preventDefault();
        control.focus();
        pointerId = e.pointerId;
        startValue = unset ? 0 : Math.round(state.target);
        startUnset = unset;
        dragging = true;
        control.setPointerCapture(e.pointerId);
        select(pointerPos(e));
    };
    const onMove = (e) => {
        if (e.pointerId === pointerId)
            select(pointerPos(e));
    };
    const release = (e, cancelled = false) => {
        if (e.pointerId !== pointerId)
            return;
        pointerId = null;
        dragging = false;
        if (control.hasPointerCapture(e.pointerId))
            control.releasePointerCapture(e.pointerId);
        if (cancelled) {
            setValue(startUnset ? null : rpeAt(startValue));
            return;
        }
        select(Math.round(state.target), true);
    };
    const onUp = (e) => release(e);
    const onCancel = (e) => release(e, true);
    const onLost = (e) => {
        if (pointerId !== null)
            release(e, true);
    };
    const onKey = (e) => {
        let next = unset ? 0 : Math.round(state.target);
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
            next += 1;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
            next -= 1;
        else if (e.key === 'Home')
            next = 0;
        else if (e.key === 'End')
            next = RPE_TOP;
        else if (e.key === 'PageUp')
            next += 2;
        else if (e.key === 'PageDown')
            next -= 2;
        else if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            setValue(null);
            emit(null);
            return;
        }
        else
            return;
        e.preventDefault();
        if (pointerId !== null) {
            const id = pointerId;
            pointerId = null;
            dragging = false;
            if (control.hasPointerCapture(id))
                control.releasePointerCapture(id);
        }
        select(next, true);
    };
    const syncMotion = () => (media.matches ? settle() : wake());
    const onVisibility = () => {
        if (document.hidden) {
            cancelAnimationFrame(frame);
            frame = 0;
            last = 0;
        }
        else
            wake();
    };
    control.addEventListener('pointerdown', onDown);
    control.addEventListener('pointermove', onMove);
    control.addEventListener('pointerup', onUp);
    control.addEventListener('pointercancel', onCancel);
    control.addEventListener('lostpointercapture', onLost);
    control.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', syncMotion);
    const resizer = new ResizeObserver(fit);
    resizer.observe(host);
    const watcher = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible)
            wake();
        else {
            cancelAnimationFrame(frame);
            frame = 0;
            last = 0;
        }
    });
    watcher.observe(host);
    function destroy() {
        if (dead)
            return;
        dead = true;
        cancelAnimationFrame(frame);
        frame = 0;
        resizer.disconnect();
        watcher.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        media.removeEventListener('change', syncMotion);
        control.removeEventListener('pointerdown', onDown);
        control.removeEventListener('pointermove', onMove);
        control.removeEventListener('pointerup', onUp);
        control.removeEventListener('pointercancel', onCancel);
        control.removeEventListener('lostpointercapture', onLost);
        control.removeEventListener('keydown', onKey);
        letters.forEach((a) => a.cancel());
        letters = [];
        host.style.transform = 'none';
    }
    showUnset();
    fit();
    return { setValue, destroy };
}
