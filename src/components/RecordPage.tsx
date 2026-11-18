import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Loader2,
  Plus,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react';
import { apiRequest, getErrorMessage } from '../api/client';

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const pad = (value: number) => String(value).padStart(2, '0');
const toKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];
const PART_ORDER = ['背', '胸', '肩', '手臂', '腿', '臀', '核心', '其他'];

const PART_META: Record<string, { label: string; short: string; emoji: string; bg: string; ink: string }> = {
  背: { label: '背部', short: '背', emoji: '💪', bg: '#e9f0ff', ink: '#315bb5' },
  胸: { label: '胸部', short: '胸', emoji: '💪', bg: '#fdecef', ink: '#b32c45' },
  肩: { label: '肩部', short: '肩', emoji: '🏋️', bg: '#f0ebff', ink: '#6541b8' },
  手臂: { label: '手臂', short: '臂', emoji: '🦾', bg: '#fff2df', ink: '#a66112' },
  腿: { label: '腿部', short: '腿', emoji: '🦵', bg: '#e8f7ed', ink: '#247348' },
  臀: { label: '臀部', short: '臀', emoji: '🍑', bg: '#fff0f4', ink: '#b33c67' },
  核心: { label: '核心', short: '核', emoji: '🎯', bg: '#fbf5d9', ink: '#8a6a10' },
  其他: { label: '其他', short: '他', emoji: '🏋️', bg: '#f3f4f6', ink: '#4b5563' },
};

const partMeta = (part: string) => PART_META[part] ?? PART_META.其他;

type Action = { id: string; part: string; title: string; core: string };
type RecordEntry = { id?: string; date: string; tag: string; actions: Action[] };
type ApiAction = {
  id?: string;
  part?: string;
  title?: string;
  name?: string;
  core?: string;
  sets?: number;
  reps?: number;
};
type ApiRecord = {
  id?: string;
  date: string;
  tag?: string;
  actions?: ApiAction[];
};

const ACTION_LIBRARY = [
  { id: 'pull-up', name: '引体向上', part: '背', core: '3组 × 12' },
  { id: 'lat-pulldown', name: '高位下拉', part: '背', core: '4组 × 10' },
  { id: 'pushdown', name: '绳索臂屈伸', part: '手臂', core: '3组 × 12' },
  { id: 'db-curl', name: '哑铃弯举', part: '手臂', core: '3组 × 10' },
  { id: 'bench-press', name: '杠铃卧推', part: '胸', core: '4组 × 8' },
  { id: 'squat', name: '杠铃深蹲', part: '腿', core: '4组 × 8' },
];

function normalizeAction(action: unknown): Action {
  if (!action || typeof action !== 'object') {
    throw new Error('训练记录动作格式不正确');
  }
  const item = action as ApiAction;
  return {
    id: item.id ? String(item.id) : uid('action'),
    part: item.part ?? '其他',
    title: item.title ?? item.name ?? '训练动作',
    core:
      item.core ??
      (item.sets !== undefined
        ? `${item.sets}组${item.reps ? ` × ${item.reps}` : ''}`
        : '记录'),
  };
}

function normalizeRecord(record: unknown): RecordEntry {
  if (!record || typeof record !== 'object') {
    throw new Error('训练记录数据格式不正确');
  }
  const item = record as ApiRecord;
  return {
    id: item.id ? String(item.id) : undefined,
    date: item.date,
    tag: item.tag ?? '仅记录',
    actions: (item.actions ?? []).map(normalizeAction),
  };
}

function normalizeRecordList(payload: unknown): RecordEntry[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('训练记录数据格式不正确');
  }
  const list = Array.isArray(payload)
    ? payload
    : (payload as { records?: unknown }).records;
  if (!Array.isArray(list)) throw new Error('训练记录数据格式不正确');
  return list.map(normalizeRecord);
}

function persistLocalRecord(record: RecordEntry) {
  try {
    const raw = localStorage.getItem('trainingRecords');
    const parsed = raw ? JSON.parse(raw) : [];
    const records = Array.isArray(parsed) ? parsed : [];
    const index = records.findIndex((item) => item?.date === record.date);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    localStorage.setItem('trainingRecords', JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

function AddRecordModal({
  open,
  date,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  date: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (record: RecordEntry) => Promise<void>;
}) {
  const [showActions, setShowActions] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setShowActions(false);
    setSelectedActionIds([]);
    setSelectedAreas([]);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const toggleAction = (action: typeof ACTION_LIBRARY[number]) => {
    setSelectedActionIds((current) => {
      if (current.includes(action.id)) return current.filter((id) => id !== action.id);
      setSelectedAreas((areas) => (areas.includes(action.part) ? areas : [...areas, action.part]));
      return [...current, action.id];
    });
  };

  const toggleArea = (area: string) => {
    setSelectedAreas((current) =>
      current.includes(area) ? current.filter((item) => item !== area) : [...current, area],
    );
  };

  const save = () => {
    if (!selectedActionIds.length && !selectedAreas.length) return;
    const picked = ACTION_LIBRARY.filter((action) => selectedActionIds.includes(action.id)).map((action) => ({
      id: uid('action'),
      part: action.part,
      title: action.name,
      core: action.core,
    }));
    const areaActions = selectedAreas
      .filter((area) => !picked.some((action) => action.part === area))
      .map((area) => ({ id: uid('action'), part: area, title: '自由训练', core: '记录' }));

    void onSave({ date, tag: '仅记录', actions: [...picked, ...areaActions] });
  };

  const dateObject = new Date(`${date}T00:00:00`);
  const dateLabel = `${dateObject.getMonth() + 1}月${dateObject.getDate()}日 ${WEEKDAYS[dateObject.getDay()]}`;
  const canSave = selectedActionIds.length > 0 || selectedAreas.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 backdrop-blur-sm"
          onClick={saving ? undefined : onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pb-6 pt-5 shadow-2xl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
            role="dialog"
            aria-modal="true"
            aria-label="添加运动记录"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-gray-900">添加记录</h2>
                <p className="mt-1 text-xs text-gray-400">{dateLabel}</p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 disabled:opacity-40 active:scale-95"
                aria-label="关闭"
              >
                <X size={17} />
              </button>
            </div>

            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">做了什么动作</h3>
                {selectedActionIds.length > 0 && (
                  <span className="text-[11px] font-semibold text-[#E63946]">{selectedActionIds.length} 个</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowActions((value) => !value)}
                className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-[#E63946]/35 bg-[#E63946]/[0.03] px-4 py-3.5 text-sm font-bold text-[#E63946] active:scale-[0.99]"
              >
                <Plus size={17} strokeWidth={2.5} />
                做了什么动作
                {selectedActionIds.length > 0 && (
                  <span className="ml-auto text-[11px] font-semibold">已选 {selectedActionIds.length} 个</span>
                )}
              </button>
              <AnimatePresence initial={false}>
                {showActions && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-2 pt-3">
                      {ACTION_LIBRARY.map((action) => {
                        const selected = selectedActionIds.includes(action.id);
                        return (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => toggleAction(action)}
                            className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${
                              selected
                                ? 'border-[#E63946] bg-[#E63946] text-white'
                                : 'border-gray-100 bg-gray-50 text-gray-700'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-bold">{action.name}</span>
                              <span className={`block text-[9px] ${selected ? 'text-white/70' : 'text-gray-400'}`}>
                                {partMeta(action.part).label}
                              </span>
                            </span>
                            {selected ? <Check size={15} className="shrink-0" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section className="mt-6">
              <h3 className="mb-2 text-sm font-bold text-gray-900">练了哪里</h3>
              <div className="flex flex-wrap gap-2">
                {PART_ORDER.map((part) => {
                  const selected = selectedAreas.includes(part);
                  return (
                    <button
                      key={part}
                      type="button"
                      onClick={() => toggleArea(part)}
                      className={`rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95 ${
                        selected
                          ? 'bg-[#E63946] text-white shadow-[0_4px_12px_rgba(230,57,70,0.22)]'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {part}
                    </button>
                  );
                })}
              </div>
            </section>

            {error && <p className="mt-4 text-center text-[11px] font-medium text-red-500">{error}</p>}

            <button
              type="button"
              disabled={!canSave || saving}
              onClick={save}
              className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#E63946] text-sm font-black text-white shadow-[0_8px_20px_rgba(230,57,70,0.25)] transition-all disabled:cursor-not-allowed disabled:opacity-35 active:scale-[0.98]"
            >
              {saving && <Loader2 size={17} className="animate-spin" />}
              {saving ? '保存中...' : '记下'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function RecordPage({
  isLoggedIn = true,
  onAddRecord,
}: {
  isLoggedIn?: boolean;
  onAddRecord?: (record: RecordEntry) => void;
}) {
  const today = toKey(new Date());
  const [records, setRecords] = useState<Record<string, RecordEntry>>({});
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)) - 1);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedRecord = records[selectedDate] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const from = `${viewYear}-${pad(viewMonth + 1)}-01`;
    const to = `${viewYear}-${pad(viewMonth + 1)}-${pad(lastDay)}`;

    setLoading(true);
    setLoadError('');
    setRecords({});

    // 游客记录只在本机，不请求后端。
    if (!isLoggedIn) {
      try {
        const raw = localStorage.getItem('trainingRecords');
        const parsed = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(parsed)
          ? parsed
              .filter((item) => item?.date >= from && item?.date <= to)
              .map(normalizeRecord)
          : [];
        setRecords(Object.fromEntries(list.map((record) => [record.date, record])));
      } catch {
        setRecords({});
      } finally {
        setLoading(false);
      }
      return () => controller.abort();
    }

    apiRequest<ApiRecord[] | { records: ApiRecord[] }>(
      `/users/me/training-records?from=${from}&to=${to}`,
      { signal: controller.signal },
    )
      .then((data) => {
        const list = normalizeRecordList(data);
        setRecords(Object.fromEntries(list.map((record) => [record.date, record])));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(getErrorMessage(error) || '训练记录加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [viewYear, viewMonth, refreshKey, isLoggedIn]);

  const calendar = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
  }, [viewYear, viewMonth]);

  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const selectedDateLabel = `${selectedDateObject.getMonth() + 1}月${selectedDateObject.getDate()}日 ${WEEKDAYS[selectedDateObject.getDay()]}`;

  const groups = useMemo(() => {
    if (!selectedRecord) return [];
    const actions = selectedRecord.actions ?? [];
    const partNames = [...new Set(actions.map((action) => action.part))].sort(
      (a, b) => PART_ORDER.indexOf(a) - PART_ORDER.indexOf(b),
    );
    return partNames.map((partName) => ({
      partName,
      // 严格按部位分组：动作属于哪个 part，就只出现在哪个分组
      items: actions.filter((action) => action.part === partName),
    }));
  }, [selectedRecord]);

  const changeMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDate(toKey(next));
  };

  const addRecord = async (record: RecordEntry) => {
    setSaving(true);
    setSaveError('');

    const existing = records[record.date];
    const localRecord: RecordEntry = {
      ...record,
      id: existing?.id ?? uid('record'),
      actions: [...(existing?.actions ?? []), ...record.actions],
    };

    if (!isLoggedIn) {
      persistLocalRecord(localRecord);
      setRecords((current) => ({ ...current, [record.date]: localRecord }));
      setSelectedDate(record.date);
      setModalOpen(false);
      onAddRecord?.(localRecord);
      setSaving(false);
      return;
    }

    try {
      const saved = await apiRequest<ApiRecord | { record: ApiRecord } | undefined>('/users/me/training-records', {
        method: 'POST',
        body: JSON.stringify({
          date: record.date,
          tag: record.tag,
          actions: record.actions,
        }),
      });
      const rawRecord =
        saved && typeof saved === 'object' && 'record' in saved
          ? saved.record
          : saved;
      const nextRecord = normalizeRecord(rawRecord ?? localRecord);
      setRecords((current) => ({ ...current, [nextRecord.date]: nextRecord }));
      setSelectedDate(nextRecord.date);
      setModalOpen(false);
      onAddRecord?.(nextRecord);
    } catch {
      // 后端断开时保留本机记录，用户仍可继续使用。
      persistLocalRecord(localRecord);
      setRecords((current) => ({ ...current, [record.date]: localRecord }));
      setSelectedDate(record.date);
      setModalOpen(false);
      onAddRecord?.(localRecord);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <main className="min-h-screen bg-gray-50 pb-28 text-gray-900">
        <div className="screen-safe-top mx-auto max-w-md px-4">
          <header className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#E63946]">
                <CalendarDays size={14} />TRAINING LOG
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight">运动记录</h1>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#E63946] px-4 py-2.5 text-xs font-bold text-white shadow-[0_6px_16px_rgba(230,57,70,0.25)] active:scale-95"
            >
              <Plus size={15} strokeWidth={2.5} />添加
            </button>
          </header>

          <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black tracking-tight">{viewYear}年{viewMonth + 1}月</h2>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => changeMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-100 text-gray-500 active:scale-95" aria-label="上个月">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={() => changeMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-100 text-gray-500 active:scale-95" aria-label="下个月">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {loadError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-gray-50 p-3">
                <WifiOff size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-gray-700">网络异常</p>
                  <p className="mt-0.5 text-[10px] text-gray-500">{loadError}</p>
                </div>
                <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#E63946]">
                  <RefreshCw size={12} />重试
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-medium text-gray-400">
              {WEEK_HEAD.map((day) => <span key={day} className="py-1">{day}</span>)}
            </div>
            <div className={`mt-1 grid grid-cols-7 gap-1 ${loading ? 'opacity-50' : ''}`}>
              {calendar.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} className="h-14 bg-white" />;
                const date = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
                const record = records[date];
                const selected = selectedDate === date;
                const isToday = date === today;
                const parts = record
                  ? [...new Set(record.actions.map((action) => action.part))]
                  : [];
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    title={`${date}${parts.length ? ` · ${parts.map((part) => partMeta(part).label).join('、')}` : ''}`}
                    className={`relative flex h-14 flex-col items-center justify-center rounded-xl py-1.5 transition-all active:scale-95 ${
                      selected
                        ? 'bg-[#E63946] text-white shadow-[0_7px_16px_rgba(230,57,70,0.28)]'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    } ${isToday && !selected ? 'ring-1 ring-[#E63946]/40' : ''}`}
                  >
                    <span className={`text-xs font-bold ${selected ? 'text-white' : isToday ? 'text-[#E63946]' : ''}`}>{day}</span>
                    {parts.length > 0 && (
                      <span className="mt-1 flex max-w-full items-center justify-center gap-0.5 overflow-hidden px-0.5">
                        {parts.slice(0, 2).map((part) => {
                          const meta = partMeta(part);
                          return (
                            <span
                              key={part}
                              className={`rounded px-1 py-0.5 text-[7px] font-black leading-none ${
                                selected ? 'bg-white/20 text-white' : ''
                              }`}
                              style={selected ? undefined : { backgroundColor: meta.bg, color: meta.ink }}
                            >
                              {meta.short}
                            </span>
                          );
                        })}
                        {parts.length > 2 && (
                          <span className={`text-[7px] font-bold ${selected ? 'text-white/70' : 'text-gray-400'}`}>
                            +{parts.length - 2}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {loading && <p className="mt-2 text-center text-[10px] text-gray-400">加载记录中...</p>}
          </section>

          <motion.section key={selectedDate} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mt-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black tracking-tight">{selectedDateLabel}</h2>
              {selectedRecord && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[9px] font-bold text-gray-500">{selectedRecord.tag ?? '仅记录'}</span>}
            </div>

            {loading || loadError ? (
              <div className="mt-4 space-y-2">
                <div className="h-10 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
              </div>
            ) : selectedRecord ? (
              <div className="mt-4 space-y-4">
                {groups.map(({ partName, items }) => {
                  const meta = partMeta(partName);
                  return (
                    <div key={partName}>
                      <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ backgroundColor: meta.bg, color: meta.ink }}>
                        <span className="text-sm" aria-hidden="true">{meta.emoji}</span>
                        <b className="text-xs font-black">{meta.label}</b>
                        <span className="text-[10px] font-semibold opacity-60">({items.length})</span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {items.map((action) => (
                          <div key={action.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                            <span className="text-sm font-bold text-gray-800">{action.title}</span>
                            <span className="shrink-0 text-xs font-black text-gray-600">{action.core}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-9">
                <Dumbbell size={22} className="text-gray-300" />
                <p className="mt-2 text-xs font-medium text-gray-400">这天没有记录</p>
              </div>
            )}
          </motion.section>
        </div>
      </main>

      <AddRecordModal
        open={modalOpen}
        date={selectedDate}
        saving={saving}
        error={saveError}
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
            setSaveError('');
          }
        }}
        onSave={addRecord}
      />
    </>
  );
}
