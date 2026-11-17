import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Crown,
  Dumbbell,
  Flame,
  HeartPulse,
  Loader2,
  Lock,
  LogIn,
  Pencil,
  RefreshCw,
  Shield,
  Sunrise,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { apiRequest, getErrorMessage, isUnauthorized } from '../api/client';

type UserProfile = {
  id?: string;
  name?: string;
  goal?: string;
  height?: number | null;
  weight?: number | null;
  avatar?: string;
};

type EarnedBadge = {
  id?: string;
  name?: string;
  awardedAt?: string;
};

type BadgesPayload = (EarnedBadge | string)[] | { badges: (EarnedBadge | string)[] };

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

function normalizeProfile(payload: UserProfile | { profile: UserProfile }): UserProfile {
  const raw = 'profile' in payload ? payload.profile : payload;
  if (!raw || typeof raw !== 'object') throw new Error('用户档案数据格式不正确');
  return {
    ...raw,
    height: raw.height === null || raw.height === undefined ? null : Number(raw.height),
    weight: raw.weight === null || raw.weight === undefined ? null : Number(raw.weight),
  };
}

function normalizeBadges(payload: BadgesPayload): EarnedBadge[] {
  const list = Array.isArray(payload) ? payload : payload.badges;
  if (!Array.isArray(list)) throw new Error('徽章数据格式不正确');
  return list
    .map((item) => (typeof item === 'string' ? { name: item } : { id: item.id, name: item.name, awardedAt: item.awardedAt }))
    .filter((item) => item.id || item.name);}

function formatMeasure(value: number | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
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
  profile: UserProfile | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (height: number, weight: number) => Promise<void>;
}) {
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  useEffect(() => {
    if (!open || !profile) return;
    setHeight(profile.height === null || profile.height === undefined ? '' : String(profile.height));
    setWeight(profile.weight === null || profile.weight === undefined ? '' : String(profile.weight));
  }, [open, profile]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const numericHeight = Number(height);
  const numericWeight = Number(weight);
  const canSave = Number.isFinite(numericHeight) && numericHeight > 0 && Number.isFinite(numericWeight) && numericWeight > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={saving ? undefined : onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-6 pt-3 shadow-2xl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
            role="dialog"
            aria-modal="true"
            aria-label="编辑档案"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-200" />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-gray-900">编辑档案</h2>
                <p className="mt-1 text-xs text-gray-400">更新身高与体重</p>
              </div>
              <button type="button" disabled={saving} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 disabled:opacity-40 active:scale-95" aria-label="关闭">
                <X size={17} />
              </button>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <label className="rounded-2xl bg-gray-50 p-3">
                <span className="text-[11px] font-semibold text-gray-500">身高</span>
                <span className="mt-2 flex items-baseline gap-1">
                  <input type="number" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} className="min-w-0 flex-1 bg-transparent text-2xl font-black text-gray-900 outline-none" />
                  <span className="text-xs font-semibold text-gray-400">cm</span>
                </span>
              </label>
              <label className="rounded-2xl bg-gray-50 p-3">
                <span className="text-[11px] font-semibold text-gray-500">体重</span>
                <span className="mt-2 flex items-baseline gap-1">
                  <input type="number" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} className="min-w-0 flex-1 bg-transparent text-2xl font-black text-gray-900 outline-none" />
                  <span className="text-xs font-semibold text-gray-400">kg</span>
                </span>
              </label>
            </div>
            {error && <p className="mt-4 text-center text-[11px] font-medium text-red-500">{error}</p>}
            <button type="button" disabled={!canSave || saving} onClick={() => void onSave(numericHeight, numericWeight)} className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#E63946] text-sm font-black text-white shadow-[0_8px_20px_rgba(230,57,70,0.25)] transition-all disabled:cursor-not-allowed disabled:opacity-35 active:scale-[0.98]">
              {saving && <Loader2 size={17} className="animate-spin" />}
              {saving ? '保存中...' : '保存'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function ProfilePage({
  isLoggedIn,
  onLogin,
  onSaveProfile,
}: {
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onSaveProfile?: (profile: UserProfile) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn === false ? false : true);
  const [loading, setLoading] = useState(isLoggedIn !== false);
  const [loadError, setLoadError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (isLoggedIn === false) {
      setLoggedIn(false);
      setLoading(false);
      setProfile(null);
      setEarnedBadges([]);
      setLoadError('');
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setLoggedIn(true);

    Promise.allSettled([
      apiRequest<UserProfile | { profile: UserProfile }>('/users/me/profile', { signal: controller.signal }),
      apiRequest<BadgesPayload>('/users/me/badges', { signal: controller.signal }),
    ])
      .then(([profileResult, badgesResult]) => {
        if (controller.signal.aborted) return;

        const unauthorized =
          (profileResult.status === 'rejected' && isUnauthorized(profileResult.reason)) ||
          (badgesResult.status === 'rejected' && isUnauthorized(badgesResult.reason));

        if (unauthorized) {
          setLoggedIn(false);
          setProfile(null);
          setEarnedBadges([]);
          setLoadError('');
          return;
        }

        if (profileResult.status === 'fulfilled') {
          setProfile(normalizeProfile(profileResult.value));
        } else {
          setLoadError(getErrorMessage(profileResult.reason) || '个人档案加载失败');
        }

        if (badgesResult.status === 'fulfilled') {
          setEarnedBadges(normalizeBadges(badgesResult.value));
        } else {
          setLoadError((current) => current || getErrorMessage(badgesResult.reason) || '徽章数据加载失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isLoggedIn, refreshKey]);

  useEffect(() => {
    if (isLoggedIn !== undefined) setLoggedIn(Boolean(isLoggedIn));
  }, [isLoggedIn]);

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

  const saveProfile = async (height: number, weight: number) => {
    setSaving(true);
    setSaveError('');
    try {
      const payload = await apiRequest<UserProfile | { profile: UserProfile } | undefined>('/users/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ height, weight }),
      });
      const updated = payload ? normalizeProfile(payload) : { ...(profile ?? {}), height, weight };
      setProfile((current) => ({ ...current, ...updated }));
      setEditOpen(false);
      onSaveProfile?.(updated);
    } catch (error) {
      setSaveError(getErrorMessage(error) || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleLogin = () => {
    onLogin?.();
  };

  const initial = profile?.name?.trim()?.slice(0, 1) || '?';

  return (
    <>
      <style>{`.badge-scroll::-webkit-scrollbar{display:none}.badge-scroll{scrollbar-width:none}`}</style>
      <main className="min-h-screen bg-gray-50 pb-24 text-gray-900">
        <div className="mx-auto max-w-md px-4 pt-6">
          <header className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E63946]">MY PROFILE</div>
              <h1 className="mt-2 text-2xl font-black tracking-tight">个人中心</h1>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${loggedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
              {loggedIn ? '已登录' : '游客模式'}
            </span>
          </header>

          {loadError && (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2">
              <span className="text-[11px] font-medium text-red-500">{loadError}</span>
              <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#E63946]">
                <RefreshCw size={12} />重试
              </button>
            </div>
          )}

          <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            {loading ? (
              <div className="animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-gray-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 rounded bg-gray-100" />
                    <div className="h-3 w-20 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="h-20 rounded-xl bg-gray-100" />
                  <div className="h-20 rounded-xl bg-gray-100" />
                </div>
              </div>
            ) : profile ? (
              <>
                <div className="flex items-center gap-4">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt={profile.name ?? '用户头像'} className="h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-[#E63946]/10" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E63946] to-rose-300 text-2xl font-black text-white ring-4 ring-[#E63946]/10">{initial}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-xl font-black tracking-tight">{profile.name || '—'}</h2>
                    <p className="mt-1 truncate text-xs font-medium text-gray-400">{profile.goal || '—'}</p>
                  </div>
                  <button type="button" onClick={() => { setSaveError(''); setEditOpen(true); }} className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-600 transition-all hover:border-[#E63946]/30 hover:text-[#E63946] active:scale-95">
                    <Pencil size={12} />编辑
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <div className="text-[10px] font-semibold text-gray-400">身高</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <b className="text-xl font-black">{formatMeasure(profile.height)}</b>
                      <span className="text-[10px] font-semibold text-gray-400">cm</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <div className="text-[10px] font-semibold text-gray-400">体重</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <b className="text-xl font-black">{formatMeasure(profile.weight)}</b>
                      <span className="text-[10px] font-semibold text-gray-400">kg</span>
                    </div>
                  </div>
                </div>
              </>
            ) : !loggedIn ? (
              <div className="py-6 text-center">
                <p className="text-sm font-bold text-gray-700">登录后查看个人档案</p>
                <p className="mt-1 text-xs text-gray-400">身高、体重与训练目标会同步到你的账号</p>
                <button type="button" onClick={handleLogin} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#E63946] px-5 py-2.5 text-[11px] font-bold text-white">
                  <LogIn size={13} />去登录
                </button>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm font-bold text-gray-700">档案暂时无法加载</p>
                <p className="mt-1 text-xs text-gray-400">请检查网络后重试</p>
                <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#E63946] px-5 py-2.5 text-[11px] font-bold text-white">
                  <RefreshCw size={13} />重新加载
                </button>
              </div>
            )}
          </section>

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
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/55 px-6 text-center backdrop-blur-md">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white"><Lock size={16} /></div>
                  <p className="mt-2 text-xs font-bold text-gray-800">登录后保存荣誉</p>
                  <button type="button" onClick={handleLogin} className="mt-3 flex items-center gap-1.5 rounded-full bg-[#E63946] px-5 py-2.5 text-[11px] font-bold text-white shadow-[0_6px_16px_rgba(230,57,70,0.25)] active:scale-95">
                    <LogIn size={13} />去登录
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

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
    </>
  );
}
