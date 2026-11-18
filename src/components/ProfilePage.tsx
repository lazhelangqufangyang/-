import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Crown,
  Dumbbell,
  Flame,
  HeartPulse,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  Settings,
  Shield,
  Sunrise,
  Target,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { apiRequest, isBackendUnavailable, isUnauthorized } from '../api/client';
import { logOut, setSessionToken } from '../api/account.js';
import BottomSheet from './profile/BottomSheet';
import LogoutConfirmDialog from './profile/LogoutConfirmDialog';
import ProfileSettingsSheet from './profile/ProfileSettingsSheet';
import {
  clearOverviewCache,
  formatSyncedAt,
  readOverviewCache,
  readSyncPreference,
  writeOverviewCache,
  writeSyncPreference,
} from './profile/profileStorage';
import type {
  BadgesPayload,
  EarnedBadge,
  SettingsModule,
  SyncPhase,
  UserProfile,
} from './profile/profileTypes';

type ProfilePageProps = {
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  onSaveProfile?: (profile: UserProfile) => void;
  onOpenModule?: (module: SettingsModule) => void;
};

const EMPTY_PROFILE: UserProfile = {
  name: '',
  goal: '',
  height: null,
  weight: null,
  avatar: '',
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

function normalizeProfile(payload: unknown): UserProfile {
  if (!payload || typeof payload !== 'object') {
    throw new Error('用户档案数据格式不正确');
  }
  const data = payload as UserProfile | { profile: UserProfile };
  const raw = 'profile' in data ? data.profile : data;
  if (!raw || typeof raw !== 'object') throw new Error('用户档案数据格式不正确');
  return {
    ...raw,
    height: raw.height === null || raw.height === undefined ? null : Number(raw.height),
    weight: raw.weight === null || raw.weight === undefined ? null : Number(raw.weight),
  };
}

function normalizeBadges(payload: unknown): EarnedBadge[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('徽章数据格式不正确');
  }
  const data = payload as BadgesPayload;
  const list = Array.isArray(data) ? data : data.badges;
  if (!Array.isArray(list)) throw new Error('徽章数据格式不正确');
  return list
    .map((item) => (typeof item === 'string' ? { name: item } : { id: item.id, name: item.name, awardedAt: item.awardedAt }))
    .filter((item) => item.id || item.name);
}

function settleProfile(
  result: PromiseSettledResult<UserProfile | { profile: UserProfile }>,
): UserProfile | null {
  if (result.status !== 'fulfilled') return null;
  try {
    return normalizeProfile(result.value);
  } catch {
    return null;
  }
}

function settleBadges(result: PromiseSettledResult<BadgesPayload>): EarnedBadge[] | null {
  if (result.status !== 'fulfilled') return null;
  try {
    return normalizeBadges(result.value);
  } catch {
    return null;
  }
}

function formatMeasure(value: number | null | undefined) {
  if (value === null || value === undefined) return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function ValueSkeleton() {
  return <span className="inline-block h-5 w-12 animate-pulse rounded bg-gray-100 align-middle" />;
}

function EditProfileSheet({
  open,
  profile,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: UserProfile;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (height: number, weight: number, goal: string) => Promise<void>;
}) {
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState('');

  useEffect(() => {
    if (!open) return;
    setHeight(profile.height === null || profile.height === undefined ? '' : String(profile.height));
    setWeight(profile.weight === null || profile.weight === undefined ? '' : String(profile.weight));
    setGoal(profile.goal ?? '');
  }, [open, profile]);

  const numericHeight = Number(height);
  const numericWeight = Number(weight);
  const canSave =
    Number.isFinite(numericHeight) &&
    numericHeight > 0 &&
    Number.isFinite(numericWeight) &&
    numericWeight > 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="编辑身体档案"
      subtitle="更新身高、体重与目标"
      closeDisabled={saving}
    >
      <div className="mt-6 grid grid-cols-2 gap-3">
        <label className="rounded-2xl bg-gray-50 p-3">
          <span className="text-[11px] font-semibold text-gray-500">身高</span>
          <span className="mt-2 flex items-baseline gap-1">
            <input type="number" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} className="min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-2xl font-black text-gray-900 shadow-none outline-none focus:outline-none" />
            <span className="text-xs font-semibold text-gray-400">cm</span>
          </span>
        </label>
        <label className="rounded-2xl bg-gray-50 p-3">
          <span className="text-[11px] font-semibold text-gray-500">体重</span>
          <span className="mt-2 flex items-baseline gap-1">
            <input type="number" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} className="min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-2xl font-black text-gray-900 shadow-none outline-none focus:outline-none" />
            <span className="text-xs font-semibold text-gray-400">kg</span>
          </span>
        </label>
      </div>

      <label className="mt-3 block rounded-2xl bg-gray-50 p-3">
        <span className="text-[11px] font-semibold text-gray-500">目标</span>
        <input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="例如：增肌塑形"
          className="mt-2 w-full rounded-none border-0 bg-transparent p-0 text-base font-bold text-gray-900 shadow-none outline-none placeholder:font-medium placeholder:text-gray-300 focus:outline-none"
        />
      </label>

      {error && <p className="mt-4 text-center text-[11px] font-medium text-[#E63946]">{error}</p>}

      <button type="button" disabled={!canSave || saving} onClick={() => void onSave(numericHeight, numericWeight, goal.trim())} className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#E63946] text-sm font-black text-white shadow-[0_8px_20px_rgba(230,57,70,0.25)] transition-all disabled:cursor-not-allowed disabled:opacity-35 active:scale-[0.98]">
        {saving && <Loader2 size={17} className="animate-spin" />}
        {saving ? '保存中...' : '保存'}
      </button>
    </BottomSheet>
  );
}

export default function ProfilePage({
  isLoggedIn,
  onLogin,
  onLogout,
  onSaveProfile,
  onOpenModule,
}: ProfilePageProps) {
  const [initialCache] = useState(() => (isLoggedIn === false ? null : readOverviewCache()));
  const [profile, setProfile] = useState<UserProfile>(() => initialCache?.profile ?? EMPTY_PROFILE);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>(() => initialCache?.badges ?? []);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn !== false);
  const [syncEnabled, setSyncEnabled] = useState<boolean>(readSyncPreference);
  const [phase, setPhase] = useState<SyncPhase>(() => (isLoggedIn !== false && syncEnabled ? 'syncing' : 'off'));
  const [loading, setLoading] = useState(() => isLoggedIn !== false && syncEnabled);
  const [syncError, setSyncError] = useState(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => initialCache?.syncedAt || null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  /** 只有用户主动重试/开启同步才提示「档案已同步」，首次进页静默刷新 */
  const manualSync = useRef(false);
  const onLogoutRef = useRef(onLogout);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  });

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** 令牌失效或退出时统一收拾页面状态，避免把上一个账号的缓存继续展示 */
  const expireSession = useCallback(
    (message: string) => {
      setSessionToken(null);
      setLoggedIn(false);
      setProfile(EMPTY_PROFILE);
      setEarnedBadges([]);
      setLastSyncedAt(null);
      setSyncError(false);
      setSyncErrorMessage('');
      setLoading(false);
      setPhase('off');
      setEditOpen(false);
      setSaveError('');
      clearOverviewCache();
      manualSync.current = false;
      showToast(message);
      onLogoutRef.current?.();
    },
    [showToast],
  );

  useEffect(() => {
    if (isLoggedIn === undefined) return;

    setLoggedIn(Boolean(isLoggedIn));
    // 没有令牌就不该继续展示上一个账号的缓存，哪怕是退出过程中短暂的一帧
    if (isLoggedIn) return;

    setProfile(EMPTY_PROFILE);
    setEarnedBadges([]);
    setLastSyncedAt(null);
    setSyncError(false);
    setSyncErrorMessage('');
    setLoading(false);
    setPhase('off');
    clearOverviewCache();
    manualSync.current = false;
  }, [isLoggedIn]);

  useEffect(() => {
    if (!loggedIn) {
      setLoading(false);
      setSyncError(false);
      setSyncErrorMessage('');
      setPhase('off');
      return undefined;
    }

    if (!syncEnabled) {
      setLoading(false);
      setSyncError(false);
      setSyncErrorMessage('');
      setPhase('off');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setSyncError(false);
    setSyncErrorMessage('');
    setPhase('syncing');

    const load = async () => {
      try {
        const [profileResult, badgesResult] = await Promise.allSettled([
          apiRequest<UserProfile | { profile: UserProfile }>('/users/me/profile', {
            signal: controller.signal,
          }),
          apiRequest<BadgesPayload>('/users/me/badges', {
            signal: controller.signal,
          }),
        ]);

        if (cancelled || controller.signal.aborted) return;

        const unauthorized =
          (profileResult.status === 'rejected' && isUnauthorized(profileResult.reason)) ||
          (badgesResult.status === 'rejected' && isUnauthorized(badgesResult.reason));

        if (unauthorized) {
          expireSession('登录已过期，请重新登录');
          return;
        }

        const nextProfile = settleProfile(profileResult);
        const nextBadges = settleBadges(badgesResult);

        if (nextProfile) setProfile(nextProfile);
        if (nextBadges) setEarnedBadges(nextBadges);

        // 两份都拿到了才算一次完整同步；只到一半时保留上一次的缓存
        if (nextProfile && nextBadges) {
          const syncedAt = new Date().toISOString();
          setLastSyncedAt(syncedAt);
          writeOverviewCache({ profile: nextProfile, badges: nextBadges, syncedAt });
          setSyncError(false);
          setSyncErrorMessage('');
          setPhase('ok');
          if (manualSync.current) {
            manualSync.current = false;
            showToast('档案已同步');
          }
        } else {
          const reason =
            profileResult.status === 'rejected'
              ? profileResult.reason
              : badgesResult.status === 'rejected'
                ? badgesResult.reason
                : null;
          manualSync.current = false;
          setSyncError(true);
          setSyncErrorMessage(
            isBackendUnavailable(reason)
              ? '网络异常，请检查后端是否启动'
              : '档案暂时无法同步',
          );
          setPhase('error');
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          manualSync.current = false;
          setSyncError(true);
          setSyncErrorMessage(
            isBackendUnavailable(error)
              ? '网络异常，请检查后端是否启动'
              : '档案暂时无法同步',
          );
          setPhase('error');
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loggedIn, syncEnabled, refreshKey, expireSession, showToast]);

  const showSkeleton =
    loading && !profile.name && !profile.goal && profile.height == null && profile.weight == null;

  const earnedKeys = useMemo(() => {
    const keys = new Set<string>();
    earnedBadges.forEach((badge) => {
      if (badge.id) keys.add(badge.id);
      if (badge.name) keys.add(badge.name);
    });
    return keys;
  }, [earnedBadges]);

  const earnedCount = useMemo(
    () => BADGE_CATALOG.filter((badge) => earnedKeys.has(badge.id) || earnedKeys.has(badge.name)).length,
    [earnedKeys],
  );

  /** 用户主动重试：开关已关时先打开设置，而不是在背后偷偷发请求 */
  const requestSync = useCallback(() => {
    if (!loggedIn) {
      setSettingsOpen(true);
      return;
    }
    manualSync.current = true;
    setRefreshKey((key) => key + 1);
  }, [loggedIn]);

  const toggleSync = useCallback(
    (next: boolean) => {
      writeSyncPreference(next);
      setSyncEnabled(next);

      if (!next) {
        manualSync.current = false;
        setLoading(false);
        setSyncError(false);
        setSyncErrorMessage('');
        setPhase('off');
        return;
      }

      if (!loggedIn) return;
      manualSync.current = true;
      setPhase('syncing');
      setRefreshKey((key) => key + 1);
    },
    [loggedIn],
  );

  const openSettings = () => {
    setEditOpen(false);
    setSaveError('');
    setSettingsOpen(true);
  };

  const openEdit = () => {
    setSettingsOpen(false);
    setSaveError('');
    setEditOpen(true);
  };

  const openModule = (module: SettingsModule) => {
    setSettingsOpen(false);
    onOpenModule?.(module);
  };

  const saveProfile = async (height: number, weight: number, goal: string) => {
    setSaving(true);
    setSaveError('');
    try {
      const payload = await apiRequest<UserProfile | { profile: UserProfile } | undefined>('/users/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ height, weight, goal }),
      });
      const updated = payload
        ? normalizeProfile(payload)
        : { ...profile, height, weight, goal };
      const syncedAt = lastSyncedAt || new Date().toISOString();

      setProfile(updated);
      setLastSyncedAt(syncedAt);
      setEditOpen(false);
      writeOverviewCache({ profile: updated, badges: earnedBadges, syncedAt });
      showToast('档案已更新');
      onSaveProfile?.(updated);
    } catch (error) {
      if (isUnauthorized(error)) {
        expireSession('登录已过期，请重新登录');
        return;
      }
      setSaveError(
        isBackendUnavailable(error)
          ? '网络异常，请检查后端是否启动'
          : '保存失败，请检查网络后重试',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    // 先发请求（requestJson 仍能读到旧令牌），本地立刻退出，不拿网络当退出的前提
    void logOut().catch(() => {});
    setSessionToken(null);
    setLoggedIn(false);
    setProfile(EMPTY_PROFILE);
    setEarnedBadges([]);
    setLastSyncedAt(null);
    setSyncError(false);
    setSyncErrorMessage('');
    setLoading(false);
    setPhase('off');
    setEditOpen(false);
    setSettingsOpen(false);
    setSaveError('');
    clearOverviewCache();
    manualSync.current = false;
    setLogoutOpen(false);
    showToast('已退出登录');
    onLogoutRef.current?.();
  };

  const handleLogin = () => {
    onLogin?.();
  };

  const statusHint = (() => {
    if (!loggedIn) return '登录后查看个人档案';
    if (!syncEnabled) return '同步已暂停 · 档案仅保存在本机';
    if (loading) return '正在同步训练档案…';
    if (syncError) return syncErrorMessage || '档案暂时无法同步';
    if (lastSyncedAt) return `训练档案已同步 · ${formatSyncedAt(lastSyncedAt)}`;
    return '训练档案已同步';
  })();

  const initial = profile.name?.trim()?.slice(0, 1) || '?';

  return (
    <>
      <style>{`.badge-scroll::-webkit-scrollbar{display:none}.badge-scroll{scrollbar-width:none}`}</style>
      <div
        className="min-h-screen bg-gray-50 text-gray-900"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
      >
        <div className="screen-safe-top mx-auto max-w-md px-4">
          <header className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E63946]">MY PROFILE</div>
              <h1 className="mt-2 text-2xl font-black tracking-tight">个人中心</h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${loading ? 'bg-gray-100 text-gray-400' : loggedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                {loading ? '同步中' : loggedIn ? '已登录' : '游客模式'}
              </span>
              <button
                type="button"
                onClick={openSettings}
                aria-label="打开设置"
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-500 shadow-sm transition-all hover:text-gray-900 active:scale-95"
              >
                <Settings size={17} strokeWidth={1.9} />
              </button>
            </div>
          </header>

          {/* 用户身份卡：即使接口失败也保留结构 */}
          <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-4">
              {showSkeleton ? (
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-gray-100" />
              ) : profile.avatar ? (
                <img src={profile.avatar} alt={profile.name ?? '用户头像'} className="h-14 w-14 shrink-0 rounded-full object-cover ring-4 ring-[#E63946]/10" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E63946] to-rose-300 text-xl font-black text-white ring-4 ring-[#E63946]/10">
                  {initial}
                </div>
              )}

              <div className="min-w-0 flex-1">
                {showSkeleton ? (
                  <div className="space-y-2">
                    <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
                    <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
                  </div>
                ) : (
                  <>
                    <h2 className="truncate text-lg font-black tracking-tight">
                      {profile.name || '训练者'}
                    </h2>
                    <p className="mt-1 truncate text-xs text-gray-400">{statusHint}</p>
                  </>
                )}
              </div>

              {!loggedIn && !showSkeleton && (
                <button type="button" onClick={handleLogin} className="flex shrink-0 items-center gap-1 rounded-full bg-[#E63946] px-3 py-2 text-[11px] font-bold text-white active:scale-95">
                  <LogIn size={12} />登录
                </button>
              )}
            </div>
          </section>

          {/* 我的身体档案：始终渲染，失败时显示占位 */}
          <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black tracking-tight">我的身体档案</h2>
                <p className="mt-1 text-[10px] text-gray-400">用于计算训练强度与计划</p>
              </div>
              <button
                type="button"
                onClick={openEdit}
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
                  <b className="text-xl font-black">{showSkeleton ? <ValueSkeleton /> : formatMeasure(profile.height)}</b>
                  <span className="text-[10px] font-semibold text-gray-400">cm</span>
                </div>
              </div>
              <div className="min-w-0 px-3">
                <div className="text-[10px] font-semibold text-gray-400">体重</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <b className="text-xl font-black">{showSkeleton ? <ValueSkeleton /> : formatMeasure(profile.weight)}</b>
                  <span className="text-[10px] font-semibold text-gray-400">kg</span>
                </div>
              </div>
              <div className="min-w-0 pl-3">
                <div className="text-[10px] font-semibold text-gray-400">目标</div>
                <div className="mt-1 truncate text-base font-black">
                  {showSkeleton ? <ValueSkeleton /> : profile.goal || '--'}
                </div>
              </div>
            </div>

            {syncError && !loading && loggedIn && syncEnabled && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-gray-50 p-3">
                <WifiOff size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-gray-600">
                    {syncErrorMessage || '档案暂时无法同步'}
                  </p>
                  <button
                    type="button"
                    onClick={requestSync}
                    className="mt-1 flex items-center gap-1 bg-transparent p-0 text-[10px] font-bold text-[#E63946] hover:text-[#b8253a]"
                  >
                    <RefreshCw size={11} />重新同步
                  </button>
                </div>
              </div>
            )}

            {!syncEnabled && loggedIn && !loading && (
              <button
                type="button"
                onClick={openSettings}
                className="mt-3 flex items-center gap-1 bg-transparent p-0 text-[10px] font-medium text-gray-400 hover:text-gray-600"
              >
                <RefreshCw size={11} />同步已暂停，去设置里开启
              </button>
            )}
          </section>

          {/* 荣誉墙 */}
          <section className="mt-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-lg font-black tracking-tight">荣誉墙</h2>
                <p className="mt-1 text-[11px] text-gray-400">已获得 {earnedCount} / {BADGE_CATALOG.length} 枚徽章</p>
              </div>
              <Trophy size={18} className="mb-1 text-gray-300" />
            </div>

            <div className="relative mt-3 min-h-[142px] overflow-hidden rounded-2xl">
              <div className={`badge-scroll flex gap-3 overflow-x-auto pb-1 ${!loggedIn || loading ? 'pointer-events-none select-none opacity-55 blur-[3px]' : ''}`}>
                {BADGE_CATALOG.map((badge) => {
                  const earned = earnedKeys.has(badge.id) || earnedKeys.has(badge.name);
                  const Icon = badge.icon;
                  return (
                    <div key={badge.id} className={`w-[104px] shrink-0 snap-start rounded-2xl border bg-white p-3 text-center shadow-sm ${earned ? 'border-[#E63946]/15' : 'border-gray-100 opacity-60'}`}>
                      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${earned ? 'text-white' : 'bg-gray-100 text-gray-300'}`} style={earned ? { backgroundImage: `linear-gradient(135deg, ${badge.colors[0]}, ${badge.colors[1]})`, color: badge.ink, boxShadow: `0 8px 20px ${badge.colors[1]}55` } : undefined}>
                        <Icon size={25} strokeWidth={1.8} />
                      </div>
                      <div className="mt-2 truncate text-[11px] font-black text-gray-800">{badge.name}</div>
                      <div className="mt-1 truncate text-[8px] text-gray-400">{badge.desc}</div>
                    </div>
                  );
                })}
              </div>

              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/40 backdrop-blur-[2px]">
                  <Loader2 size={20} className="animate-spin text-[#E63946]" />
                </div>
              )}

              {!loading && !loggedIn && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/60 px-6 text-center backdrop-blur-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white">
                    <Lock size={16} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-gray-800">登录后保存你的荣誉</p>
                  <button type="button" onClick={handleLogin} className="mt-3 flex items-center gap-1.5 rounded-full bg-[#E63946] px-5 py-2.5 text-[11px] font-bold text-white shadow-[0_6px_16px_rgba(230,57,70,0.25)] active:scale-95">
                    <LogIn size={13} />去登录
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 退出登录：荣誉墙下方、底部导航上方，克制的淡红底 */}
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
        syncEnabled={syncEnabled}
        syncPhase={phase}
        lastSyncedAt={lastSyncedAt}
        onToggleSync={toggleSync}
        onRetrySync={requestSync}
        onOpenModule={onOpenModule ? openModule : undefined}
      />

      <EditProfileSheet
        open={editOpen}
        profile={profile}
        saving={saving}
        error={saveError}
        onClose={() => {
          if (!saving) {
            setEditOpen(false);
            setSaveError('');
          }
        }}
        onSave={saveProfile}
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
