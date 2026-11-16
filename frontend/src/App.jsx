import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { captureTokenFromHash, getToken } from './lib/api';
import { loadState, saveState } from './lib/storage';
import { Icon, TopBar } from './components/ui';
import Welcome from './pages/Welcome';

// 首屏只带欢迎页，其余页面按需加载，避免把动作库、食物库全塞进首包
const Setup = lazy(() => import('./pages/Setup'));
const Train = lazy(() => import('./pages/Train'));
const Plan = lazy(() => import('./pages/Plan'));
const Pick = lazy(() => import('./pages/Pick'));
const Session = lazy(() => import('./pages/Session'));
const Moves = lazy(() => import('./pages/Moves'));
const Log = lazy(() => import('./pages/Log'));
const Diet = lazy(() => import('./pages/Diet'));
const Legal = lazy(() => import('./pages/Legal'));
const Admin = lazy(() => import('./pages/Admin'));
const SettingsIndex = lazy(() => import('./pages/settings/SettingsIndex'));
const ProfileSettings = lazy(() => import('./pages/settings/ProfileSettings'));
const ModelSettings = lazy(() => import('./pages/settings/ModelSettings'));
const AccountSettings = lazy(() => import('./pages/settings/AccountSettings'));
const DataSettings = lazy(() => import('./pages/settings/DataSettings'));
const OfflineSettings = lazy(() =>
  import('./pages/settings/InfoSettings').then((mod) => ({ default: mod.OfflineSettings })),
);
const SafetySettings = lazy(() =>
  import('./pages/settings/InfoSettings').then((mod) => ({ default: mod.SafetySettings })),
);

const TABS = [
  { href: '/train', label: '运动', icon: 'dumbbell' },
  { href: '/moves', label: '动作', icon: 'moves' },
  { href: '/log', label: '记录', icon: 'log' },
  { href: '/diet', label: '吃', icon: 'diet' },
  { href: '/settings', label: '设置', icon: 'settings' },
];

const META = {
  '/train': { title: '我的运动', sub: '今天练什么' },
  '/moves': { title: '动作选择', sub: '按部位看动作' },
  '/log': { title: '运动记录', sub: '逐组、其他运动、体重腰围' },
  '/diet': { title: '饮食记录', sub: '吃了什么，比吃多少更重要' },
  '/settings': { title: '设置', sub: '档案、模型、账号与数据' },
  '/plan': { title: '周框架', back: '/train' },
  '/pick': { title: '今天练哪里', back: '/train' },
  '/session': { title: '训练中', back: '/train' },
  '/setup': { title: '建档', back: '/welcome' },
  '/settings/profile': { title: '我的档案', back: '/settings' },
  '/settings/model': { title: '链接大模型', back: '/settings' },
  '/settings/account': { title: '账号', back: '/settings' },
  '/settings/data': { title: '数据与备份', back: '/settings' },
  '/settings/offline': { title: '离线与安装', back: '/settings' },
  '/settings/safety': { title: '安全边界', back: '/settings' },
  '/privacy': { title: '隐私政策', back: '/settings/account' },
  '/terms': { title: '服务条款', back: '/settings/account' },
  '/admin': { title: '管理后台', back: '/settings' },
};

function getRoute() {
  captureTokenFromHash();
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash || hash === '/') return '/train';
  return hash;
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((path) => {
    const next = path.startsWith('#') ? path.slice(1) : path;
    if (window.location.hash === `#${next}`) {
      setRoute(next);
      return;
    }
    window.location.hash = next;
  }, []);

  const update = useCallback((patch) => {
    setState((current) => (typeof patch === 'function' ? patch(current) : { ...current, ...patch }));
  }, []);

  // 未登录只放行欢迎页、登录注册和法务页；建档、训练、饮食都必须先登录
  const authed = Boolean(getToken());

  useEffect(() => {
    if (authed) return;
    const open = ['/welcome', '/settings/account', '/privacy', '/terms'];
    if (!open.includes(route)) go('/welcome');
  }, [authed, route, go]);

  useEffect(() => {
    if (!authed || state.onboardingDone) return;
    const allowed =
      route === '/welcome' ||
      route === '/setup' ||
      route === '/privacy' ||
      route === '/terms' ||
      route === '/admin' ||
      route.startsWith('/settings');
    if (!allowed) go('/welcome');
  }, [authed, state.onboardingDone, route, go]);

  const meta = META[route] ?? META['/train'];

  const content = useMemo(() => {
    switch (route) {
      case '/welcome':
        return <Welcome go={go} update={update} />;
      case '/setup':
        return <Setup state={state} update={update} go={go} />;
      case '/train':
        return <Train state={state} update={update} go={go} />;
      case '/plan':
        return <Plan state={state} update={update} go={go} />;
      case '/pick':
        return <Pick state={state} update={update} go={go} />;
      case '/session':
        return <Session state={state} update={update} go={go} />;
      case '/moves':
        return <Moves state={state} update={update} go={go} />;
      case '/log':
        return <Log state={state} update={update} go={go} />;
      case '/diet':
        return <Diet state={state} update={update} go={go} />;
      case '/settings':
        return <SettingsIndex go={go} />;
      case '/settings/profile':
        return <ProfileSettings state={state} update={update} go={go} />;
      case '/settings/model':
        return <ModelSettings state={state} update={update} go={go} />;
      case '/settings/account':
        return (
          <AccountSettings
            go={go}
            onAuthed={() => {
              if (!state.onboardingDone) go('/setup');
            }}
          />
        );
      case '/settings/data':
        return <DataSettings state={state} update={update} go={go} />;
      case '/settings/offline':
        return <OfflineSettings go={go} />;
      case '/settings/safety':
        return <SafetySettings go={go} />;
      case '/privacy':
        return <Legal kind="privacy" />;
      case '/terms':
        return <Legal kind="terms" />;
      case '/admin':
        return <Admin go={go} />;
      default:
        return <Train state={state} update={update} go={go} />;
    }
  }, [route, state, go, update]);

  const hideTopbar = ['/welcome', '/setup', '/session'].includes(route);
  const hideTabbar = hideTopbar || ['/privacy', '/terms', '/admin'].includes(route);
  const activeTab = route.startsWith('/settings')
    ? '/settings'
    : ['/plan', '/pick', '/session'].includes(route)
      ? '/train'
      : route;

  return (
    <div className="app">
      {hideTopbar ? null : (
        <TopBar
          title={meta.title}
          sub={meta.sub}
          back={Boolean(meta.back)}
          onBack={() => go(meta.back ?? '/train')}
        />
      )}
      <main className="screen">
        <Suspense fallback={<div className="empty">加载中…</div>}>{content}</Suspense>
      </main>
      {hideTabbar ? null : (
        <nav className="tabbar">
          {TABS.map((tab) => (
            <button
              key={tab.href}
              type="button"
              aria-current={activeTab === tab.href ? 'page' : undefined}
              onClick={() => go(tab.href)}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
