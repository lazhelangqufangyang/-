import { ChevronRight, Database, ShieldCheck, User, UserRound } from 'lucide-react';
import BottomSheet from './BottomSheet';
import type { SettingsModule } from './profileTypes';

type ProfileSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  loggedIn: boolean;
  onOpenModule?: (module: SettingsModule) => void;
};

const MODULES: Array<{
  key: SettingsModule;
  title: string;
  desc: string;
  Icon: typeof User;
}> = [
  { key: 'profile', title: '身体档案', desc: '性别、年龄、身高、体重与训练目标', Icon: UserRound },
  { key: 'account', title: '账号与安全', desc: '登录方式、订阅与当前设备', Icon: User },
  { key: 'data', title: '数据与备份', desc: '导出、导入与 Pro 云端整份备份', Icon: Database },
  { key: 'safety', title: '安全边界', desc: '这个应用不做什么', Icon: ShieldCheck },
];

export default function ProfileSettingsSheet({
  open,
  onClose,
  loggedIn,
  onOpenModule,
}: ProfileSettingsSheetProps) {
  const openModule = (module: SettingsModule) => {
    onClose();
    onOpenModule?.(module);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="设置" subtitle="档案、账号与数据">
      <section className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
        <p className="text-[11px] font-medium leading-relaxed text-gray-600">
          身体档案和训练记录默认只保存在这台设备。
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
          {loggedIn
            ? '登录后可在「数据与备份」把整份数据传到云端，Pro 才能上传和拉回。'
            : '登录后可开通 Pro，把自己的整份数据备份到账号里。'}
        </p>
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
        大模型 Key 与密码不会进入训练记录
        <br />
        云端只存你主动上传的那一份
      </p>
    </BottomSheet>
  );
}
