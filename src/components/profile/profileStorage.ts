import type { EarnedBadge, UserProfile } from './profileTypes';

/**
 * 个人中心在本机留两样东西：
 * 1. 同步开关的偏好（fitplan.profile.sync）
 * 2. 上一次同步成功时的档案与徽章（fitplan.profile.cache.v1）
 *
 * 有缓存时先渲染缓存，再在后台刷新，弱网下页面不会只剩骨架屏。
 */

const SYNC_KEY = 'fitplan.profile.sync';
const CACHE_KEY = 'fitplan.profile.cache.v1';

export type OverviewCache = {
  profile: UserProfile;
  badges: EarnedBadge[];
  syncedAt: string;
};

export function readSyncPreference(): boolean {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    // 没设置过默认开启：档案卡需要云端数据才完整
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function writeSyncPreference(enabled: boolean) {
  try {
    localStorage.setItem(SYNC_KEY, enabled ? '1' : '0');
  } catch {
    /* 隐私模式下写不了，按本次会话生效即可 */
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanBadge(item: unknown): EarnedBadge | null {
  if (typeof item === 'string') return item ? { name: item } : null;
  if (!item || typeof item !== 'object') return null;
  const badge = item as Record<string, unknown>;
  const id = text(badge.id);
  const name = text(badge.name);
  if (!id && !name) return null;
  return {
    id: id || undefined,
    name: name || undefined,
    awardedAt: text(badge.awardedAt) || undefined,
  };
}

export function readOverviewCache(): OverviewCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { profile?: unknown; badges?: unknown; syncedAt?: unknown };
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.profile || typeof parsed.profile !== 'object') return null;

    const profile = parsed.profile as Record<string, unknown>;
    return {
      profile: {
        id: text(profile.id) || undefined,
        name: text(profile.name),
        goal: text(profile.goal),
        height: numberOrNull(profile.height),
        weight: numberOrNull(profile.weight),
        avatar: text(profile.avatar),
      },
      badges: Array.isArray(parsed.badges)
        ? parsed.badges
            .map(cleanBadge)
            .filter((badge): badge is EarnedBadge => badge !== null)
        : [],
      syncedAt: text(parsed.syncedAt),
    };
  } catch {
    return null;
  }
}

export function writeOverviewCache(cache: OverviewCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* 缓存写不进去不影响本次展示 */
  }
}

export function clearOverviewCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** 设置面板里「已同步 · 刚刚 / 12 分钟前 / 11 月 17 日 21:40」 */
export function formatSyncedAt(iso: string | null): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '';

  const diff = Date.now() - time;
  if (diff < 0) return '刚刚';
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;

  const date = new Date(time);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month} 月 ${day} 日 ${hour}:${minute}`;
}
