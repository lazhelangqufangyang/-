/**
 * 记录的进出云端。整份传、整份回：云端这一份就是按下「传到云端」那一刻这台设备上的全部。
 * 大模型 Key 不下设备，picked / pickedDate 是当天的界面状态，两者都不进云端。
 */
import { parseImported } from '../store.js';
import { requestJson } from './account.js';
const TABLE_LABEL = {
    profiles: '档案',
    frameworks: '周框架',
    day_sheets: '今日表',
    set_logs: '逐组记录',
    activity_logs: '运动记录',
    meal_logs: '饮食记录',
    measure_logs: '体重腰围打卡'
};
function payloadOf(state) {
    return {
        profile: state.profile,
        framework: state.framework,
        sheets: state.sheets,
        setLogs: state.setLogs,
        activityLogs: state.activityLogs,
        mealLogs: state.mealLogs,
        measureLogs: state.measureLogs,
        onboarded: state.onboardingDone,
        favorites: state.favorites
    };
}
/** 「传到云端」这一行后面的小字：本机此刻攒了多少条 */
export function countLines(state) {
    const n = (v) => (Array.isArray(v) ? v.length : 0);
    return [
        `${n(state.sheets)} 张今日表`,
        `${n(state.setLogs)} 组`,
        `${n(state.mealLogs)} 餐`,
        `${n(state.activityLogs)} 次其他运动`,
        `${n(state.measureLogs)} 次打卡`
    ].join(' · ');
}
export function receiptText(receipt) {
    return Object.entries(receipt.saved)
        .filter(([, c]) => c > 0)
        .map(([table, count]) => `${TABLE_LABEL[table] ?? table} ${count}`)
        .join(' / ');
}
/** 拉回来的一套直接覆盖本机；大模型 Key 是本机的，不跟着云端走 */
export function cloudToState(cloud, local) {
    return parseImported(JSON.stringify({ ...cloud, version: 1, onboardingDone: cloud.onboarded, settings: local.settings }));
}
export function pushRecords(state) {
    return requestJson('/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payloadOf(state))
    });
}
export async function pullRecords(local) {
    const cloud = await requestJson('/data');
    return cloudToState(cloud, local);
}
export function clearCloudRecords() {
    return requestJson('/data', { method: 'DELETE' });
}
