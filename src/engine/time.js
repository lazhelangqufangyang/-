/** 表里不再排钟点：每行只写开练后的 mm:ss，记第一组那一刻就是 0:00 */
export function elapsedMark(sec) {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDaysIso(iso, days) {
    const [y, m, d] = iso.split('-').map((v) => Number(v));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export function weekdayOf(iso) {
    const [y, m, d] = iso.split('-').map((v) => Number(v));
    return new Date(y, m - 1, d).getDay();
}
export function monthsSince(yyyyMm) {
    const [y, m] = yyyyMm.split('-').map((v) => Number(v));
    const now = new Date();
    return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}
export function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
