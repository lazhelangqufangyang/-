import { apiBase } from './account.js';

/** 管理端令牌和用户令牌分开存，退出管理端不影响用户登录 */
const TOKEN_KEY = 'fitplan.admin.token';

export function adminToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token) {
    if (token)
        localStorage.setItem(TOKEN_KEY, token);
    else
        localStorage.removeItem(TOKEN_KEY);
}

function target(path) {
    const base = apiBase();
    return base.startsWith('/') ? `${window.location.origin}${base}${path}` : `${base}${path}`;
}

async function request(path, init) {
    const token = adminToken();
    const headers = { ...init?.headers };
    if (init?.body && !headers['Content-Type'])
        headers['Content-Type'] = 'application/json; charset=utf-8';
    if (token)
        headers.Authorization = `Bearer ${token}`;
    let res;
    try {
        res = await fetch(target(path), { ...init, headers });
    }
    catch (e) {
        throw new Error(`连不上后端（${apiBase()}）：${e.message}`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const err = new Error(body?.error ?? `后端返回 ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return body;
}

export function adminLogin(loginName, password) {
    return request('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ loginName, password })
    }).then((res) => {
        setAdminToken(res.token);
        return res;
    });
}

export function adminLogout() {
    return request('/admin/auth/logout', { method: 'POST' })
        .finally(() => setAdminToken(null));
}

export function adminMe() {
    return request('/admin/me');
}

function pageQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined)
            search.set(key, String(value));
    });
    return search.toString();
}

export function listOrders(params) {
    return request(`/admin/orders?${pageQuery(params)}`);
}

export function getOrder(outTradeNo) {
    return request(`/admin/orders/${encodeURIComponent(outTradeNo)}`);
}

export function syncOrder(outTradeNo) {
    return request(`/admin/orders/${encodeURIComponent(outTradeNo)}/sync`, {
        method: 'POST',
        body: JSON.stringify({})
    });
}

export function refundOrder(outTradeNo, reason) {
    return request(`/admin/orders/${encodeURIComponent(outTradeNo)}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export function refundQuery(outTradeNo) {
    return request(`/admin/orders/${encodeURIComponent(outTradeNo)}/refund-query`, { method: 'POST' });
}

export function listUsers(params) {
    return request(`/admin/users?${pageQuery(params)}`);
}

export function changePlan(userId, action, days, reason) {
    return request(`/admin/users/${userId}/plan`, {
        method: 'POST',
        body: JSON.stringify({ action, days, reason })
    });
}

export function listAudit(params) {
    return request(`/admin/audit?${pageQuery(params)}`);
}