import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// SPA fallback 会把 /landing/ 目录 URL 吞成应用壳，这里先指到落地页自己的 index
const landingIndex = {
  name: 'landing-dir-index',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/landing' || req.url === '/landing/') req.url = '/landing/index.html';
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/landing' || req.url === '/landing/') req.url = '/landing/index.html';
      next();
    });
  }
};

/** 读 server/.env 里的管理员账号；只在开发服务器进程内使用，不进入前端包 */
function readServerEnv() {
  const out = {};
  try {
    const text = readFileSync(resolve(process.cwd(), 'server/.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    // 没配也能打开控制台，只是管理员那一栏不可用
  }
  return out;
}

const TEST_USER = { login: 'test_user', password: 'Fitplan-Test-2026' };

/**
 * 仅开发环境：/__dev 是一个测试控制台，左边主应用、右边管理端，共用一个 localStorage。
 * 这里不进生产构建，也不会出现在 preview/dist 里。
 */
const devConsole = {
  name: 'fitplan-dev-console',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if ((req.url || '').split('?')[0] !== '/__dev') return next();
      const env = readServerEnv();
      const creds = {
        user: TEST_USER,
        admin: {
          login: env.FITPLAN_ADMIN_LOGIN || '',
          password: env.FITPLAN_ADMIN_PASSWORD || ''
        }
      };
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(devConsoleHtml().replace('__CREDS__', JSON.stringify(creds)));
      });
  }
};

function devConsoleHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>测试控制台 · 仅本地开发</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: flex; flex-direction: column; background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 12px 16px; border-bottom: 1px solid #21262d; }
  .bar h1 { margin: 0; font-size: 16px; }
  .bar p { margin: 4px 0 0; font-size: 11.5px; color: #8b949e; }
  .status { flex: none; font-size: 11.5px; color: #8b949e; max-width: 42vw; text-align: right; }
  .creds { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #21262d; }
  .cred { flex: 1 1 260px; border: 1px solid #21262d; border-radius: 10px; padding: 8px 10px; background: #161b22; }
  .cred .who { font-size: 11px; color: #8b949e; margin-bottom: 4px; }
  .cred code { display: block; font-size: 12px; color: #d2a8ff; margin-bottom: 6px; word-break: break-all; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; }
  .acts button { border: 1px solid #30363d; border-radius: 7px; background: #21262d; color: #e6edf3; font-size: 11.5px; padding: 5px 9px; cursor: pointer; }
  .acts button.primary { background: #e8485c; border-color: #e8485c; color: #fff; }
  .acts button:disabled { opacity: .45; cursor: not-allowed; }
  .panes { flex: 1; min-height: 0; display: flex; gap: 12px; padding: 12px 16px 16px; }
  .pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .user-pane { flex: 0 0 420px; }
  .admin-pane { flex: 1; }
  .pane-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; font-size: 11.5px; color: #8b949e; }
  .pane-head a { color: #58a6ff; text-decoration: none; }
  .phone { flex: 1; min-height: 0; padding: 8px; border-radius: 22px; background: #161b22; border: 1px solid #30363d; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
  .phone iframe { width: 100%; height: 100%; border: 0; border-radius: 16px; background: #fff; }
  .admin-pane iframe { flex: 1; min-height: 0; width: 100%; border: 1px solid #30363d; border-radius: 12px; background: #fff; }
  .warn { padding: 0 16px 12px; font-size: 11px; color: #d29922; }
  @media (max-width: 900px) {
    .panes { flex-direction: column; }
    .user-pane { flex: 0 0 52vh; }
    .admin-pane { flex: 1 1 52vh; }
    .phone { padding: 6px; border-radius: 16px; }
    .status { display: none; }
  }
</style>
</head>
<body>
<header class="bar">
  <div>
    <h1>测试控制台</h1>
    <p>仅本地开发服务器提供。主应用与管理端共用一个 localStorage，用户令牌和管理员令牌分开存，可同时登录。</p>
  </div>
  <div class="status" id="status">就绪</div>
</header>
<section class="creds">
  <div class="cred">
    <div class="who">用户 · 主应用</div>
    <code id="user-cred"></code>
    <div class="acts">
      <button data-act="fill-user">填入登录页</button>
      <button class="primary" data-act="login-user">直接登录</button>
    </div>
  </div>
  <div class="cred">
    <div class="who">管理员 · 管理端</div>
    <code id="admin-cred"></code>
    <div class="acts">
      <button data-act="fill-admin">填入登录页</button>
      <button class="primary" data-act="login-admin">直接登录</button>
    </div>
  </div>
  <div class="cred">
    <div class="who">两边一起</div>
    <code>先清会话，再重新登录</code>
    <div class="acts">
      <button class="primary" data-act="login-both">两边都直接登录</button>
      <button data-act="reset">清除两边登录</button>
    </div>
  </div>
</section>
<main class="panes">
  <section class="pane user-pane">
    <div class="pane-head"><b>主应用</b><a href="/#/login" target="_blank" rel="noreferrer">新窗口打开</a></div>
    <div class="phone"><iframe id="frame-user" src="/#/login" allow="camera; fullscreen; clipboard-write"></iframe></div>
  </section>
  <section class="pane admin-pane">
    <div class="pane-head"><b>管理端</b><a href="/#/admin" target="_blank" rel="noreferrer">新窗口打开</a></div>
    <iframe id="frame-admin" src="/#/admin" allow="camera; fullscreen; clipboard-write"></iframe>
  </section>
</main>
<div class="warn">只在本机使用：不要用 --host 把这个开发服务器开到局域网或公网，页面上有明文测试口令。</div>
<script>
  const CREDS = __CREDS__;
  const API = '/api';
  const userFrame = document.getElementById('frame-user');
  const adminFrame = document.getElementById('frame-admin');
  const statusEl = document.getElementById('status');
  function setStatus(text) { statusEl.textContent = text; }
  document.getElementById('user-cred').textContent = CREDS.user.login + ' / ' + CREDS.user.password;
  const adminReady = Boolean(CREDS.admin.login && CREDS.admin.password);
  document.getElementById('admin-cred').textContent = adminReady
    ? CREDS.admin.login + ' / ' + CREDS.admin.password
    : 'server/.env 未配置管理员';
  if (!adminReady) {
    document.querySelectorAll('[data-act="fill-admin"],[data-act="login-admin"],[data-act="login-both"]').forEach(function (b) { b.disabled = true; });
  }

  async function call(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function seedProfile() {
    try {
      const raw = localStorage.getItem('fitplan.v1');
      const state = raw ? JSON.parse(raw) : {};
      if (state.onboardingDone) return;
      state.version = 1;
      state.onboardingDone = true;
      state.profile = Object.assign({}, state.profile || {}, {
        sex: 'male', age: 28, heightCm: 178, weightKg: 78,
        experienceYears: 1, injuries: [], injuriesAnswered: true,
        commercialGym: true, extraEquipment: '', weekdays: [1, 2, 4, 6],
        sessionMinutes: 60, goalWish: '测试账号', sleepHours: 7,
        dailySteps: 8000, dietRestrictions: '无', noCardio: false,
        homeOnly: false, avoidNames: [], dayAreas: {}
      });
      localStorage.setItem('fitplan.v1', JSON.stringify(state));
    } catch (e) {
      // 存档坏了就不动它，登录本身仍然成立
    }
  }

  async function loginUser() {
    const body = { loginName: CREDS.user.login, password: CREDS.user.password };
    try {
      await call('/auth/register', body);
    } catch (e) {
      if (e.status !== 409) throw e;
    }
    const data = await call('/auth/login', body);
    localStorage.setItem('fitplan.token', data.token);
    seedProfile();
  }

  async function loginAdmin() {
    if (!adminReady) throw new Error('server/.env 里没有管理员账号');
    const data = await call('/admin/auth/login', {
      loginName: CREDS.admin.login,
      password: CREDS.admin.password
    });
    localStorage.setItem('fitplan.admin.token', data.token);
  }

  function reloadUser() { userFrame.src = '/?__dev=' + Date.now() + '#/train'; }
  function reloadAdmin() { adminFrame.src = '/?__dev=' + Date.now() + '#/admin'; }

  function inputsOf(frame) {
    const doc = frame.contentDocument;
    if (!doc) return [];
    return Array.prototype.slice.call(doc.querySelectorAll('input'));
  }

  function setValue(frame, input, value) {
    const win = frame.contentWindow;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  }

  function fillUser() {
    const inputs = inputsOf(userFrame);
    const name = inputs.find(function (i) { return (i.placeholder || '').indexOf('3–32') >= 0; });
    const password = inputs.find(function (i) { return i.type === 'password'; });
    if (!name || !password) {
      setStatus('主应用里没找到账号输入框：可能已经登录，先清除登录再试');
      return;
    }
    setValue(userFrame, name, CREDS.user.login);
    setValue(userFrame, password, CREDS.user.password);
    setStatus('已填入用户账号，点登录页里的「登录」');
  }

  function fillAdmin() {
    const inputs = inputsOf(adminFrame);
    const name = inputs.find(function (i) { return (i.placeholder || '').indexOf('管理员账号') >= 0; });
    const password = inputs.find(function (i) { return i.type === 'password'; });
    if (!name || !password) {
      setStatus('管理端里没找到登录框：可能已经登录，先清除登录再试');
      return;
    }
    setValue(adminFrame, name, CREDS.admin.login);
    setValue(adminFrame, password, CREDS.admin.password);
    setStatus('已填入管理员账号，点登录页里的「登录」');
  }

  async function run(action) {
    try {
      if (action === 'fill-user') return fillUser();
      if (action === 'fill-admin') return fillAdmin();
      if (action === 'reset') {
        localStorage.removeItem('fitplan.token');
        localStorage.removeItem('fitplan.admin.token');
        userFrame.src = '/?__dev=' + Date.now() + '#/login';
        reloadAdmin();
        setStatus('已清除两边登录');
        return;
      }
      if (action === 'login-user') {
        setStatus('用户登录中…');
        await loginUser();
        reloadUser();
        setStatus('用户已登录');
        return;
      }
      if (action === 'login-admin') {
        setStatus('管理员登录中…');
        await loginAdmin();
        reloadAdmin();
        setStatus('管理员已登录');
        return;
      }
      if (action === 'login-both') {
        setStatus('两边登录中…');
        await loginUser();
        await loginAdmin();
        reloadUser();
        reloadAdmin();
        setStatus('两边都已登录');
      }
    } catch (e) {
      setStatus('失败：' + e.message);
    }
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-act]');
    if (btn) run(btn.getAttribute('data-act'));
  });
</script>
</body>
</html>`;
}

export default defineConfig({
  plugins: [landingIndex, devConsole, tailwindcss(), react()],
  server: {
    // 本地开发统一走同源 /api：由 Vite 代理到真实后端，避免跨域和 HTML fallback。
    proxy: {
      '/api': {
        // 项目后端 application.yml 默认端口是 8787；可用 FITPLAN_API_URL/PORT 覆盖。
        target: process.env.FITPLAN_API_URL || `http://localhost:${process.env.FITPLAN_API_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false
  }
});
