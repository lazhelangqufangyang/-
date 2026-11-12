/**
 * 账号这一层只碰后端那几张表，身体数据一个字段都不发出去。
 * base 的优先级：localStorage 里的临时地址 > 打包时的 VITE_API_BASE > 同源 /api。
 * 开发时同源 /api 由 vite 转给本地后端；后端有了域名就 VITE_API_BASE 打一次，
 * 联调阶段想在浏览器里临时换地址，直接写 fitplan.api 这一项。
 */
const BASE_KEY = 'fitplan.api';
const TOKEN_KEY = 'fitplan.token';
export function apiBase() {
    const raw = (localStorage.getItem(BASE_KEY) ?? '').trim().replace(/\/+$/, '');
    return raw || import.meta.env.VITE_API_BASE || '/api';
}
export function sessionToken() {
    return localStorage.getItem(TOKEN_KEY);
}
/** 本机手动填过的那个地址；没填过就是空串 */
export function apiBaseCustom() {
    return (localStorage.getItem(BASE_KEY) ?? '').trim();
}
/** 当前生效的后端地址：没手动改过就是同源 /api */
export function apiBaseLabel() {
    return apiBaseCustom() || '同源 /api';
}
/** 联调和演示时后端地址是会变的（内网穿透每次换一个域名），这里存一次就够全站用 */
export function setApiBase(value) {
    const raw = (value ?? '').trim().replace(/\/+$/, '');
    if (!raw) {
        localStorage.removeItem(BASE_KEY);
        return '';
    }
    if (!/^https?:\/\/[^ ]+\/api$/.test(raw)) {
        throw new Error('要填到 /api 这一层为止，例：https://xxxx.trycloudflare.com/api');
    }
    localStorage.setItem(BASE_KEY, raw);
    return raw;
}
export function setSessionToken(token) {
    if (token)
        localStorage.setItem(TOKEN_KEY, token);
    else
        localStorage.removeItem(TOKEN_KEY);
}
/** 支付宝回调会把令牌放进 URL 片段带回来，读一次就抹掉地址栏 */
export function pickUpTokenFromHash() {
    const m = /#token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    if (!m)
        return false;
    setSessionToken(m[1]);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/settings`);
    return true;
}
function target(path) {
    const base = apiBase();
    return base.startsWith('/') ? `${window.location.origin}${base}${path}` : `${base}${path}`;
}
export async function requestJson(path, init) {
    const token = sessionToken();
    const headers = { ...init?.headers };
    if (token)
        headers.Authorization = `Bearer ${token}`;
    let res;
    try {
        res = await fetch(target(path), { ...init, headers });
    }
    catch (e) {
        throw new Error(`连不上后端（${apiBase()}）：${e.message}`);
    }
    const body = (await res.json().catch(() => null));
    if (!res.ok) {
        const err = new Error(body?.error ?? `后端返回 ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return body;
}
export function checkHealth() {
    return requestJson('/health');
}
export function readPlan() {
    return requestJson('/plan');
}
/** 下单拿到收银台跳转地址；价格、天数、订单号都由后端定，前端只负责跳过去 */
export function createProOrder() {
    return requestJson('/pay/order', { method: 'POST' });
}
export function orderStatus(outTradeNo) {
    return requestJson(`/pay/order?out_trade_no=${encodeURIComponent(outTradeNo)}`);
}
export function readSession() {
    return requestJson('/session');
}
/** 账号密码登录：注册和登录都直接把令牌换回来存本机，不经过跳转 */
export async function signInWithPassword(path, loginName, password) {
    const res = await requestJson(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ loginName, password })
    });
    setSessionToken(res.token);
    return res;
}
/** 设置页那一行要写登录状态：本机没存令牌就不发请求（离线时也不该发） */
export async function loginBadge() {
    if (!sessionToken())
        return '没登录';
    try {
        const a = await readSession();
        return a.kind === 'password' ? `已登录 · ${a.handle}` : `已登录 · uid 尾号 ${a.handle}`;
    }
    catch {
        return '登录已过期';
    }
}
export function logOut() {
    return requestJson('/session', { method: 'DELETE' });
}
export function closeAccount() {
    return requestJson('/account', { method: 'DELETE' });
}
export function signInHref() {
    return target('/auth/alipay/start');
}
