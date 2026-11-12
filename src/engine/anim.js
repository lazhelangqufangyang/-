export const VIEW_W = 240;
export const VIEW_H = 190;
const L = {
    thigh: 38,
    shank: 36,
    torso: 44,
    neck: 9,
    headR: 11,
    arm: 26,
    fore: 24,
    foot: 13,
    shoulderHalf: 17,
    hipHalf: 9
};
const GROUND = 174;
const rad = (d) => (d * Math.PI) / 180;
/** 从垂直向上出发的单位向量 */
const up = (r) => ({ x: Math.sin(r), y: -Math.cos(r) });
/** 从垂直向下出发的单位向量 */
const dn = (r) => ({ x: Math.sin(r), y: Math.cos(r) });
const go = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const shift = (p, dx = 0, dy = 0) => ({ x: p.x + dx, y: p.y + dy });
/** 躯干/头的位置左右共用，只有四肢按 mirror 翻一次 */
function joints(pose, rig, mirror) {
    const s = mirror ? -1 : 1;
    const base = pose.base ?? 'stand';
    const supine = base === 'supine';
    const torsoUp = up(rad(pose.torso));
    let hip;
    let shoulder;
    if (rig === 'side') {
        if (supine) {
            shoulder = { x: 66, y: 126 };
            hip = go(shoulder, torsoUp, -L.torso);
        }
        else {
            hip = shift(base === 'sit' ? { x: 86, y: 116 } : { x: 100, y: 94 }, pose.hipDx, pose.hipDy);
            shoulder = go(hip, torsoUp, L.torso);
        }
    }
    else {
        hip = shift({ x: 120, y: base === 'sit' ? 122 : base === 'supine' ? 116 : 104 }, pose.hipDx, pose.hipDy);
        shoulder = go(hip, torsoUp, L.torso);
    }
    const head = go(shoulder, torsoUp, L.neck);
    const shrink = rig === 'front' && supine ? 0.55 : 1;
    const knee = go(hip, dn(rad(pose.thigh * s)), L.thigh * shrink);
    const ankle = go(knee, dn(rad(pose.shank * s)), L.shank * shrink);
    // 脚永远大致朝前伸，站姿里就是脚尖；footPitch 让它能单独转（提踵）
    const pitch = rad(pose.footPitch ?? 30);
    const toe = go(ankle, { x: s * Math.cos(pitch), y: Math.sin(pitch) }, L.foot);
    const anchor = rig === 'front' ? { x: shoulder.x + L.shoulderHalf * s, y: shoulder.y } : shoulder;
    const elbow = go(anchor, up(rad(pose.arm * s)), L.arm);
    const hand = go(elbow, up(rad(pose.fore * s)), L.fore);
    return { hip, knee, ankle, toe, shoulder: anchor, head, elbow, hand, torsoUp };
}
export function skeleton(pose, rig) {
    const a = joints(pose, rig, false);
    const base = pose.base ?? 'stand';
    const pad = rig === 'side'
        ? base === 'supine'
            ? [{ x: 24, y: a.shoulder.y + L.headR * 0.8 }, { x: 104, y: a.shoulder.y + L.headR * 0.8 }]
            : base === 'sit'
                ? [{ x: 58, y: 152 }, { x: 116, y: 152 }]
                : [{ x: 16, y: GROUND }, { x: 224, y: GROUND }]
        : [{ x: 38, y: 158 }, { x: 202, y: 158 }];
    if (rig === 'side') {
        return {
            hip: a.hip,
            knee: a.knee,
            ankle: a.ankle,
            toe: a.toe,
            shoulder: a.shoulder,
            head: { x: a.head.x, y: a.head.y },
            elbow: a.elbow,
            hand: a.hand,
            pad
        };
    }
    const b = joints(pose, rig, true);
    return {
        hip: { x: a.hip.x, y: a.hip.y },
        knee: a.knee,
        ankle: a.ankle,
        toe: a.toe,
        shoulder: { x: a.shoulder.x - L.shoulderHalf, y: a.shoulder.y },
        head: { x: a.head.x, y: a.head.y },
        elbow: a.elbow,
        hand: a.hand,
        knee2: b.knee,
        ankle2: b.ankle,
        toe2: b.toe,
        elbow2: b.elbow,
        hand2: b.hand,
        pad
    };
}
/** 主动肌落在骨架的哪几段上，动画里高亮这几段 */
export function highlightFor(pattern) {
    switch (pattern) {
        case 'squat':
        case 'lunge':
        case 'cardio':
            return ['thigh', 'shank'];
        case 'hinge':
        case 'hipThrust':
        case 'legIso':
            return ['thigh', 'shank', 'torso'];
        case 'calfRaise':
            return ['shank'];
        case 'horizontalPush':
        case 'chestIso':
            return ['torso', 'arm', 'fore'];
        case 'verticalPush':
        case 'shoulderIso':
            return ['arm', 'fore'];
        case 'horizontalPull':
        case 'verticalPull':
            return ['torso', 'arm', 'fore'];
        case 'triceps':
        case 'biceps':
            return ['fore', 'arm'];
        case 'core':
            return ['torso'];
        default:
            return ['torso'];
    }
}
/** 把姿态插值出来：t=0 是起始姿态，t=1 是终点姿态 */
export function lerpPose(a, b, t) {
    const m = (x, y) => x + (y - x) * t;
    return {
        shank: m(a.shank, b.shank),
        thigh: m(a.thigh, b.thigh),
        torso: m(a.torso, b.torso),
        arm: m(a.arm, b.arm),
        fore: m(a.fore, b.fore),
        hipDx: m(a.hipDx ?? 0, b.hipDx ?? 0),
        hipDy: m(a.hipDy ?? 0, b.hipDy ?? 0),
        footPitch: m(a.footPitch ?? 30, b.footPitch ?? 30),
        base: a.base ?? b.base
    };
}
const W = 58;
const H = 26;
/** 调试用：把骨架画成字符画，用来核对姿态有没有跑到画面外或者反关节 */
export function asciiPose(pose, rig) {
    const s = skeleton(pose, rig);
    const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => ' '));
    const put = (p, ch) => {
        const x = Math.round((p.x / VIEW_W) * (W - 1));
        const y = Math.round((p.y / VIEW_H) * (H - 1));
        if (x < 0 || y < 0 || x >= W || y >= H)
            return;
        if (grid[y][x] === ' ' || ch !== '.')
            grid[y][x] = ch;
    };
    const line = (from, to, ch) => {
        const steps = 48;
        for (let i = 0; i <= steps; i += 1) {
            const k = i / steps;
            put({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, ch);
        }
    };
    const segs = [
        [s.hip, s.knee, '-'],
        [s.knee, s.ankle, '-'],
        [s.ankle, s.toe, '.'],
        [s.hip, s.shoulder, '|'],
        [s.shoulder, s.elbow, '-'],
        [s.elbow, s.hand, '-']
    ];
    if (s.knee2 && s.ankle2 && s.elbow2 && s.hand2 && s.toe2) {
        segs.push([s.hip, s.knee2, '-'], [s.knee2, s.ankle2, '-'], [s.ankle2, s.toe2, '.'], [s.shoulder, s.elbow2, '-'], [s.elbow2, s.hand2, '-']);
    }
    for (const [a, b, ch] of segs)
        line(a, b, ch);
    put(s.hip, 'O');
    put(s.knee, 'o');
    put(s.ankle, 'o');
    put(s.shoulder, 'O');
    put(s.elbow, 'o');
    put(s.hand, '#');
    put(s.head, '@');
    return grid.map((r) => r.join('')).join('\n');
}
/** 所有关节都必须落在画布内，否则动画会被裁掉 */
export function offscreen(pose, rig) {
    const s = skeleton(pose, rig);
    const bad = [];
    const check = (name, p) => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
            bad.push(`${name}=NaN`);
        else if (p.x < 2 || p.x > VIEW_W - 2 || p.y < 2 || p.y > VIEW_H - 2)
            bad.push(`${name}=(${p.x.toFixed(0)},${p.y.toFixed(0)})`);
    };
    check('hip', s.hip);
    check('knee', s.knee);
    check('ankle', s.ankle);
    check('toe', s.toe);
    check('shoulder', s.shoulder);
    check('head', s.head);
    check('elbow', s.elbow);
    check('hand', s.hand);
    check('knee2', s.knee2 ?? s.knee);
    check('hand2', s.hand2 ?? s.hand);
    return bad;
}
