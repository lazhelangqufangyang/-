import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  Crown,
  Dumbbell,
  Flame,
  HeartPulse,
  LogIn,
  LogOut,
  Pencil,
  Settings,
  Shield,
  Sunrise,
  Target,
  Trophy,
} from 'lucide-react';
import { logOut, readSession, sessionToken, setSessionToken } from '../api/account.js';
import PersonalRecord from '../components/PersonalRecord';
import LogoutConfirmDialog from '../components/profile/LogoutConfirmDialog';
import ProfileSettingsSheet from '../components/profile/ProfileSettingsSheet';
import type { SettingsModule } from '../components/profile/profileTypes';

/** 训练、饮食、姿态检查共用的那一份档案（store 里的 state.profile） */
export type BodyProfile = {
  sex?: 'male' | 'female' | null;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  goalWish?: string;
  goal?: { kindKey?: string } | null;
};

type ProfilePageProps = {
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  onOpenModule?: (module: SettingsModule) => void;
  logs?: { exId?: string; weightKg?: number | null; date?: string }[];
  bodyProfile?: BodyProfile;
};

const GOAL_LABELS: Record<string, string> = {
  shape: '穿衣有型',
  lean: '减脂',
  bulk: '增肌',
  strength: '力量',
  glute_legs: '臀腿',
  chest: '胸',
  shoulders: '肩',
  endurance: '体能',
  health: '健康',
};

const BADGE_CATALOG = [
  { id: 'first', name: '初次训练', desc: '完成第一次训练', icon: Dumbbell, colors: ['#fff1f2', '#fecdd3'], ink: '#be123c' },
  { id: 'iron', name: '钢铁意志', desc: '完成一次完整训练', icon: Shield, colors: ['#fff7d6', '#fde68a'], ink: '#a16207' },
  { id: 'streak', name: '连续7天', desc: '连续训练七天', icon: Flame, colors: ['#fff1e6', '#fed7aa'], ink: '#c2410c' },
  { id: 'pr', name: 'PR突破', desc: '刷新个人最佳记录', icon: Trophy, colors: ['#fef9c3', '#fde047'], ink: '#a16207' },
  { id: 'volume', name: '容量王者', desc: '单日训练容量破纪录', icon: Crown, colors: ['#ede9fe', '#c4b5fd'], ink: '#6d28d9' },
  { id: 'cardio', name: '有氧达人', desc: '完成有氧训练挑战', icon: HeartPulse, colors: ['#fce7f3', '#f9a8d4'], ink: '#be185d' },
  { id: 'core', name: '核心稳定', desc: '完成核心专项训练', icon: Target, colors: ['#dcfce7', '#86efac'], ink: '#15803d' },
  { id: 'morning', name: '晨练先锋', desc: '在清晨完成训练', icon: Sunrise, colors: ['#e0f2fe', '#7dd3fc'], ink: '#0369a1' },
];

function formatMeasure(value: number | null | undefined) {
  if (value === null || value === undefined) return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

type AccountSummary = { kind?: string; handle?: string; plan?: string };

export default function ProfilePage({
  isLoggedIn,
  onLogin,
  onLogout,
  onOpenModule,
  logs = [],
  bodyProfile,
}: ProfilePageProps) {
  const token = sessionToken();
  const loggedIn = Boolean(isLoggedIn) && Boolean(token);

  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [accountError, setAccountError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const onLogoutRef = useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  });

  const showToast = (text: string) => setToast({ id: Date.now(), text });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 账号页负责登录/退出；这里只读一次会话，用来显示当前是哪种账号
  useEffect(() => {
    if (!loggedIn) {
      setAccount(null);
      setAccountError(false);
      return undefined;
    }
    let alive = true;
    setAccountError(false);
    readSession()
      .then((session) => {
        if (alive) setAccount(session as AccountSummary);
      })
      .catch(() => {
        if (alive) {
          setAccount(null);
          setAccountError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [loggedIn, token]);

  const height = bodyProfile?.heightCm ?? null;
  const weight = bodyProfile?.weightKg ?? null;
  const goalText =
    GOAL_LABELS[bodyProfile?.goal?.kindKey ?? ''] || bodyProfile?.goalWish?.trim() || '';

  const missing = useMemo(() => {
    const out: string[] = [];
    if (bodyProfile?.sex == null) out.push('性别');
    if (bodyProfile?.age == null) out.push('年龄');
    if (height == null) out.push('身高');
    if (weight == null) out.push('体重');
    return out;
  }, [bodyProfile?.sex, bodyProfile?.age, height, weight]);

  const displayName = account?.kind === 'password' && account.handle ? account.handle : '训练者';
  const initial = displayName.trim().slice(0, 1) || '?';
  const statusHint = !loggedIn
    ? '登录后同步订阅，云端备份整份数据'
    : account
      ? account.kind === 'password'
        ? `账号密码登录 · ${account.handle ?? ''}`
        : `支付宝登录 · 尾号 ${account.handle ?? ''}`
      : accountError
        ? '账号服务暂时连不上，本机功能照常'
        : '正在读取账号…';

  const earnedCount = 0;

  const confirmLogout = () => {
    if (sessionToken()) void logOut().catch(() => {});
    setSessionToken(null);
    setLogoutOpen(false);
    showToast('已退出登录');
    onLogoutRef.current?.();
  };

  return (
    <>
      <style>{`.badge-scroll::-webkit-scrollbar{display:none}.badge-scroll{scrollbar-width:none}`}</style>
      <div
        className="min-h-screen bg-gray-50 pb-24 text-gray-900"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
      >
        <div className="screen-safe-top mx-auto max-w-md px-4">
          <header className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E63946]">MY PROFILE</div>
              <h1 className="mt-2 text-2xl font-black tracking-tight">个人中心</h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${loggedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                {loggedIn ? '已登录' : '未登录'}
              </span>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="打开设置"
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-500 shadow-sm transition-all hover:text-gray-900 active:scale-95"
              >
                <Settings size={17} strokeWidth={1.9} />
              </button>
            </div>
          </header>

          {/* 用户身份卡：游客态直接引导登录，登录态展示账号 */}
          <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            {!loggedIn ? (
              <button
                type="button"
                onClick={onLogin}
                style={{ background: 'transparent', border: 0 }}
                className="flex w-full appearance-none items-center gap-4 p-0 text-left active:scale-[0.99]"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E63946] to-rose-300 text-white ring-4 ring-[#E63946]/10">
                  <LogIn size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black tracking-tight text-gray-900">点击登录</h2>
                  <p className="mt-1 truncate text-xs text-gray-400">账号密码或支付宝授权；订阅和云端备份都在账号里</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-gray-300" />
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E63946] to-rose-300 text-xl font-black text-white ring-4 ring-[#E63946]/10">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-black tracking-tight">{displayName}</h2>
                  <p className="mt-1 truncate text-xs text-gray-400">{statusHint}</p>
                </div>
              </div>
            )}
          </section>

          {/* 我的身体档案：与训练、饮食、姿态检查共用 store 里的同一份数据 */}
          <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black tracking-tight">我的身体档案</h2>
                <p className="mt-1 text-[10px] text-gray-400">训练强度、热量参考、姿态检查都读这一份</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenModule?.('profile')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all hover:border-[#E63946]/30 hover:text-[#E63946] active:scale-95"
                aria-label="编辑身体档案"
              >
                <Pencil size={14} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100">
              <div className="min-w-0 pr-2">
                <div className="text-[10px] font-semibold text-gray-400">身高</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <b className="text-xl font-black">{formatMeasure(height)}</b>
                  <span className="text-[10px] font-semibold text-gray-400">cm</span>
                </div>
              </div>
              <div className="min-w-0 px-3">
                <div className="text-[10px] font-semibold text-gray-400">体重</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <b className="text-xl font-black">{formatMeasure(weight)}</b>
                  <span className="text-[10px] font-semibold text-gray-400">kg</span>
                </div>
              </div>
              <div className="min-w-0 pl-3">
                <div className="text-[10px] font-semibold text-gray-400">目标</div>
                <div className="mt-1 truncate text-base font-black">{goalText || '--'}</div>
              </div>
            </div>

            {missing.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenModule?.('profile')}
                className="mt-3 flex w-full items-start gap-2 rounded-xl bg-amber-50 p-3 text-left"
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700">!</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-amber-700">档案还缺：{missing.join('、')}</span>
                  <span className="mt-0.5 block text-[10px] text-amber-600/90">补全后，饮食页才会按你的数据算热量与微量元素参考</span>
                </span>
                <ChevronRight size={14} className="mt-0.5 shrink-0 text-amber-500" />
              </button>
            )}
          </section>

          {/* 我的极限重量 (PR) */}
          <PersonalRecord className="mt-4 w-full" logs={logs} />

          {/* 荣誉墙 */}
          <section className="mt-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-lg font-black tracking-tight">荣誉墙</h2>
                <p className="mt-1 text-[11px] text-gray-400">已获得 {earnedCount} / {BADGE_CATALOG.length} 枚徽章</p>
              </div>
              <Trophy size={18} className="mb-1 text-gray-300" />
            </div>

            <div className="badge-scroll mt-3 flex gap-3 overflow-x-auto pb-1">
              {BADGE_CATALOG.map((badge) => {
                const Icon = badge.icon;
                return (
                  <div key={badge.id} className="w-[104px] shrink-0 snap-start rounded-2xl border border-gray-100 bg-white p-3 text-center opacity-60 shadow-sm">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-300">
                      <Icon size={25} strokeWidth={1.8} />
                    </div>
                    <div className="mt-2 truncate text-[11px] font-black text-gray-800">{badge.name}</div>
                    <div className="mt-1 truncate text-[8px] text-gray-400">{badge.desc}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 退出登录 */}
          {loggedIn && (
            <section className="mt-5" aria-label="退出登录">
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 text-sm font-bold text-red-500 transition-all hover:bg-red-100/70 active:scale-[0.99]"
              >
                <LogOut size={16} strokeWidth={2} />
                退出登录
              </button>
              <p className="mt-2.5 text-center text-[10px] text-gray-400">
                本机训练记录会保留，下次登录可继续同步
              </p>
            </section>
          )}
        </div>
      </div>

      <ProfileSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        loggedIn={loggedIn}
        onOpenModule={onOpenModule}
      />

      <LogoutConfirmDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed inset-x-0 z-[95] flex justify-center px-6"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 74px)' }}
          >
            <div
              role="status"
              aria-live="polite"
              className="rounded-full bg-gray-900/95 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
            >
              {toast.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
