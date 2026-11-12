/** RPE 6 还能再做四次以上，10 一次都做不动；半档一格，null 是这组没填 */
export const RPE_MIN = 6;
export const RPE_MAX = 10;
export const RPE_STEP = 0.5;
export const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const RPE_LABELS = ['很轻松', '轻松', '留 3 次', '留 2–3 次', '留 2 次', '留 1–2 次', '留 1 次', '几乎力竭', '力竭'];
export const RPE_TOP = RPE_STEPS.length - 1;
export function isRpe(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= RPE_MIN && v <= RPE_MAX;
}
export function rpeIndex(v) {
    if (typeof v !== 'number' || !Number.isFinite(v))
        return 0;
    return Math.max(0, Math.min(RPE_TOP, Math.round((v - RPE_MIN) / RPE_STEP)));
}
export function rpeAt(index) {
    const i = Number.isFinite(index) ? Math.round(index) : 0;
    return RPE_STEPS[Math.max(0, Math.min(RPE_TOP, i))];
}
export function rpeLabel(v) {
    return isRpe(v) ? RPE_LABELS[rpeIndex(v)] : '';
}
