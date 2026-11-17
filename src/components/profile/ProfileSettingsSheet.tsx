import { ChevronRight, Database, RefreshCw, ShieldCheck, User } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ToggleSwitch from './ToggleSwitch';
import { formatSyncedAt } from './profileStorage';
import type { SettingsModule, SyncPhase } from './profileTypes';

type ProfileSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  loggedIn: boolean;
  syncEnabled: boolean;
  syncPhase: SyncPhase;
  lastSyncedAt: string | null;
  onToggleSync: (next: boolean) => void;
  onRetrySync: () => void;
  onOpenModule?: (module: SettingsModule) => void;
};

const MODULES: Array<{
  key: SettingsModule;
  title: string;
  desc: string;
  Icon: typeof User;
}> = [
  { key: 'account', title: '账号与安全', desc: '登录方式、订阅与当前设备', Icon: User },
  { key: 'data', title: '数据与备份', desc: '导出、导入与云端整份备份', Icon: Database },
  { key: 'safety', title: '安全边界', desc: '这个应用不做什么', Icon: ShieldCheck },
];

function statusOf({
  loggedIn,
  syncEnabled,
  syncPhase,
  lastSyncedAt,
}: Pick<
  ProfileSettingsSheetProps,
  'loggedIn' | 'syncEnabled' | 'syncPhase' | 'lastSyncedAt'
>) {
  if (!loggedIn) {
    return { text: '登录后可同步云端档案与徽章', dot: 'bg-gray-300', tone: 'text-gray-400' };
  }
  if (!syncEnabled) {
    return {
      text: lastSyncedAt
        ? `同步已关闭 · 上次成功 ${formatSyncedAt(lastSyncedAt)}`
        : '同步已关闭 · 档案只保存在本机',
      dot: 'bg-gray-300',
      tone: 'text-gray-400',
    };
  }
  if (syncPhase === 'syncing') {
    return { text: '正在重新获取云端档案…', dot: 'bg-amber-400 animate-pulse', tone: 'text-gray-500' };
  }
  if (syncPhase === 'error') {
    return { text: '同步失败，请检查网络后重试', dot: 'bg-red-400', tone: 'text-red-500' };
  }
  if (lastSyncedAt) {
    return { text: `已同步 · ${formatSyncedAt(lastSyncedAt)}`, dot: 'bg-emerald-500', tone: 'text-gray-500' };
  }
  return { text: '等待同步', dot: 'bg-gray-300', tone: 'text-gray-400' };
}

export default function ProfileSettingsSheet({
  open,
  onClose,
  loggedIn,
  syncEnabled,
  syncPhase,
  lastSyncedAt,
  onToggleSync,
  onRetrySync,
  onOpenModule,
}: ProfileSettingsSheetProps) {
  const status = statusOf({ loggedIn, syncEnabled, syncPhase, lastSyncedAt });
  const syncing = syncPhase === 'syncing';
  const canRetry = loggedIn && syncEnabled && !syncing && (syncPhase === 'error' || syncPhase === 'idle');

  const openModule = (module: SettingsModule) => {
    onClose();
    onOpenModule?.(module);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="设置" subtitle="同步、账号与数据">
      <section className="mt-5" aria-labelledby="sync-section-title">
        <h3
          id="sync-section-title"
          className="px-1 text-[11px] font-bold tracking-wide text-gray-400"
        >
          数据与同步
        </h3>

        <div className="mt-2 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                syncEnabled && loggedIn
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-white text-gray-400'
              }`}
            >
              <RefreshCw size={18} strokeWidth={1.9} className={syncing ? 'animate-spin' : ''} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-gray-900">数据同步</h4>
                {!loggedIn && (
                  <span className="rounded-full bg-gray-200/70 px-2 py-0.5 text-[9px] font-bold text-gray-500">
                    需登录
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-gray-400">
                开启后立即重新获取云端档案与徽章
              </p>
            </div>

            <ToggleSwitch
              checked={syncEnabled && loggedIn}
              onChange={onToggleSync}
              disabled={!loggedIn || syncing}
              label="数据同步"
            />
          </div>

          <div className="mt-3 flex items-center gap-1.5 border-t border-gray-200/70 pt-3">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
            <span
              role="status"
              aria-live="polite"
              className={`min-w-0 flex-1 truncate text-[10px] font-medium ${status.tone}`}
            >
              {status.text}
            </span>

            {!loggedIn && onOpenModule && (
              <button
                type="button"
                onClick={() => openModule('account')}
                className="shrink-0 bg-transparent p-0 text-[10px] font-bold text-[#E63946] active:opacity-60"
              >
                去登录
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                onClick={onRetrySync}
                className="shrink-0 bg-transparent p-0 text-[10px] font-bold text-[#E63946] active:opacity-60"
              >
                重试
              </button>
            )}
          </div>
        </div>
      </section>

      {onOpenModule && (
        <section className="mt-6" aria-labelledby="more-section-title">
          <h3
            id="more-section-title"
            className="mb-2 px-1 text-[11px] font-bold tracking-wide text-gray-400"
          >
            更多设置
          </h3>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
            {MODULES.map(({ key, title, desc, Icon }, index) => (
              <button
                key={key}
                type="button"
                onClick={() => openModule(key)}
                className={`flex w-full items-center gap-3 bg-white px-4 py-3.5 text-left transition-colors active:bg-gray-50 ${
                  index > 0 ? 'border-t border-gray-100' : ''
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-gray-800">{title}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-gray-400">{desc}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="mt-5 px-2 text-center text-[10px] leading-relaxed text-gray-400">
        开启同步后，身体档案与荣誉会保存到你的账号
        <br />
        训练记录默认只留在这台设备
      </p>
    </BottomSheet>
  );
}
