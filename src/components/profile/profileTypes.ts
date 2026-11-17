/** 个人中心与设置面板共用的数据形状 */

export type UserProfile = {
  id?: string;
  name?: string;
  goal?: string;
  height?: number | null;
  weight?: number | null;
  avatar?: string;
};

export type EarnedBadge = {
  id?: string;
  name?: string;
  awardedAt?: string;
};

export type BadgesPayload = (EarnedBadge | string)[] | { badges: (EarnedBadge | string)[] };

/** 设置面板里数据同步的四种可展示状态 */
export type SyncPhase = 'idle' | 'syncing' | 'ok' | 'error' | 'off';

/** 设置面板能跳转的既有子页面 */
export type SettingsModule = 'account' | 'data' | 'safety';
