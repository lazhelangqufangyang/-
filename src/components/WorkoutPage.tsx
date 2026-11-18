import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Dumbbell,
  HelpCircle,
  Loader2,
  Plus,
  WifiOff,
} from 'lucide-react';
import { apiRequest } from '../api/client';

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const DEFAULT_SET_COUNT = 4;

const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type WorkoutSet = {
  id: string;
  weight: number;
  reps: number;
  rpe: number;
  done: boolean;
};

type WorkoutExercise = {
  id: string;
  name: string;
  part: string;
  restSec: number;
  sets: WorkoutSet[];
};

type Workout = {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
};

type WorkoutRecord = {
  id: string;
  date: string;
  tag: string;
  actions: { id: string; part: string; title: string; core: string }[];
  exercises: WorkoutExercise[];
  totalSets: number;
  completedSets: number;
  progress: number;
  createdAt: string;
  /** 后端可在保存训练时直接返回本次奖励，供奖励弹窗使用 */
  badge?: { id?: string; name?: string };
};

type ApiSet = {
  id?: string;
  weight?: number;
  reps?: number;
  rpe?: number;
  done?: boolean;
};

type ApiExercise = {
  id: string;
  name: string;
  part?: string;
  restSec?: number;
  rest_sec?: number;
  sets?: ApiSet[];
};

type ApiWorkout = {
  id: string;
  name?: string;
  exercises?: ApiExercise[];
};

const makeSet = (
  weight: number,
  reps: number,
  rpe: number,
  done = false,
  id = uid('set'),
): WorkoutSet => ({ id, weight, reps, rpe, done });

const LOCAL_FALLBACK_WORKOUT: Workout = {
  id: 'local-fallback',
  name: '通用训练计划',
  exercises: [
    {
      id: 'local-lat-pulldown',
      name: '高位下拉',
      part: '背',
      restSec: 90,
      sets: [
        makeSet(37.5, 10, 7),
        makeSet(37.5, 10, 7.5),
        makeSet(37.5, 10, 7.5),
        makeSet(37.5, 10, 8),
      ],
    },
    {
      id: 'local-seated-row',
      name: '坐姿绳索划船',
      part: '背',
      restSec: 90,
      sets: [
        makeSet(45, 12, 7),
        makeSet(45, 12, 7.5),
        makeSet(45, 12, 7.5),
        makeSet(45, 12, 8),
      ],
    },
    {
      id: 'local-bench-press',
      name: '杠铃卧推',
      part: '胸',
      restSec: 120,
      sets: [
        makeSet(52.5, 8, 7.5),
        makeSet(52.5, 8, 8),
        makeSet(52.5, 8, 8),
        makeSet(52.5, 8, 8.5),
      ],
    },
    {
      id: 'local-db-curl',
      name: '哑铃弯举',
      part: '手臂',
      restSec: 75,
      sets: [
        makeSet(12.5, 12, 7),
        makeSet(12.5, 12, 7.5),
        makeSet(12.5, 12, 7.5),
        makeSet(12.5, 12, 8),
      ],
    },
  ],
};

const DRAFT_KEY = 'fitplan.activeWorkout';
const RECORDS_KEY = 'trainingRecords';

function readGuestDraft(): Workout | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.exercises) || !parsed.exercises.length) return null;
    return {
      id: typeof parsed.id === 'string' ? parsed.id : 'guest-draft',
      name: typeof parsed.name === 'string' ? parsed.name : '通用训练计划',
      exercises: parsed.exercises,
    };
  } catch {
    return null;
  }
}

function persistLocalRecord(record: WorkoutRecord) {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const records = Array.isArray(parsed) ? parsed : [];
    const index = records.findIndex(
      (item) => item.date === record.date && Array.isArray(item.actions),
    );
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* localStorage 不可用时仍允许本次训练完成 */
  }
}

function WorkoutSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden="true">
      {[0, 1].map((card) => (
        <div key={card} className="animate-pulse rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 rounded bg-gray-100" />
              <div className="h-3 w-44 rounded bg-gray-100" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3">
                <div className="h-6 w-6 rounded-full bg-gray-100" />
                <div className="h-3 flex-1 rounded bg-gray-100" />
                <div className="h-6 w-14 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function normalizeWorkout(payload: unknown): Workout {
  // 防止后端/代理返回 HTML 字符串时，对字符串使用 in 运算符。
  if (!payload || typeof payload !== 'object') {
    throw new Error('训练计划数据格式不正确');
  }

  const data = payload as ApiWorkout | { workout: ApiWorkout };
  const raw = 'workout' in data ? data.workout : data;

  if (!raw || typeof raw !== 'object' || !raw.id || !Array.isArray(raw.exercises)) {
    throw new Error('训练计划数据格式不正确');
  }

  return {
    id: String(raw.id),
    name: raw.name ?? '今日训练',
    exercises: raw.exercises.map((exercise) => {
      // 后端未下发组数据时，默认展示 4 个可编辑的空组。
      const rawSets: ApiSet[] = exercise.sets?.length
        ? exercise.sets
        : Array.from({ length: DEFAULT_SET_COUNT }, () => ({}));

      return {
        id: String(exercise.id),
        name: exercise.name,
        part: exercise.part ?? '其他',
        restSec: Number(exercise.restSec ?? exercise.rest_sec ?? 0),
        sets: rawSets.map((set) =>
          makeSet(
            Number(set.weight ?? 0),
            Number(set.reps ?? 0),
            Number(set.rpe ?? 7),
            Boolean(set.done),
            set.id ? String(set.id) : undefined,
          ),
        ),
      };
    }),
  };
}

function RpeSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const percent = ((value - 6) / 4) * 100;
  return (
    <div className="mt-3">
      <div className="mb-2 flex items-end justify-between">
        <span className="text-[11px] font-medium text-gray-400">轻松</span>
        <span className="text-3xl font-black leading-none tracking-tight text-[#E63946]">{value}</span>
        <span className="text-[11px] font-medium text-gray-400">极限</span>
      </div>
      <input
        type="range"
        min="6"
        max="10"
        step="0.5"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rpe-slider w-full"
        aria-label="训练强度 RPE，6 到 10"
        style={{
          background: `linear-gradient(to right, #E63946 0%, #E63946 ${percent}%, #E5E7EB ${percent}%, #E5E7EB 100%)`,
        }}
      />
      <div className="mt-2 flex justify-between text-[10px] font-medium text-gray-400">
        {[6, 7, 8, 9, 10].map((mark) => (
          <span key={mark} className={value === mark ? 'text-[#E63946]' : ''}>{mark}</span>
        ))}
      </div>
    </div>
  );
}

function RpePanel({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm font-bold text-gray-900">训练强度 (RPE)</h4>
          <div className="group relative inline-flex">
            <HelpCircle size={14} className="cursor-help text-gray-400" />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 translate-y-1 rounded-xl bg-gray-900 px-3 py-2 text-[11px] leading-5 text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
              10代表拼尽全力，8代表还能做2次
            </div>
          </div>
          <span className="ml-auto text-sm font-black text-[#E63946]">{value}</span>
        </div>
        <RpeSlider value={value} onChange={onChange} />
      </div>
    </motion.div>
  );
}

function SetRow({
  exercise,
  set,
  index,
  isOpen,
  onToggleOpen,
  onToggleDone,
  onRpeChange,
}: {
  exercise: WorkoutExercise;
  set: WorkoutSet;
  index: number;
  isOpen: boolean;
  onToggleOpen: (exerciseId: string, setId: string) => void;
  onToggleDone: (exerciseId: string, setId: string) => void;
  onRpeChange: (exerciseId: string, setId: string, rpe: number) => void;
}) {
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onToggleDone(exercise.id, set.id)}
          aria-label={set.done ? `第${index + 1}组已完成` : `标记第${index + 1}组完成`}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 ${
            set.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-200 bg-white text-transparent'
          }`}
        >
          <Check size={13} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium text-gray-400">第{index + 1}组</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-black leading-none tracking-tight text-gray-900">{set.weight}kg</span>
            <span className="text-xs text-gray-400">×</span>
            <span className="text-sm font-bold text-gray-700">{set.reps}次</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleOpen(exercise.id, set.id)}
          aria-expanded={isOpen}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#E63946] transition-colors active:scale-95"
        >
          RPE {set.rpe}
          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && <RpePanel value={set.rpe} onChange={(value) => onRpeChange(exercise.id, set.id, value)} />}
      </AnimatePresence>
    </div>
  );
}

function ExerciseCard({
  exercise,
  index,
  openRpe,
  onToggleRpe,
  onToggleDone,
  onRpeChange,
  onAddSet,
}: {
  exercise: WorkoutExercise;
  index: number;
  openRpe: string | null;
  onToggleRpe: (exerciseId: string, setId: string) => void;
  onToggleDone: (exerciseId: string, setId: string) => void;
  onRpeChange: (exerciseId: string, setId: string, rpe: number) => void;
  onAddSet: (exerciseId: string) => void;
}) {
  const first = exercise.sets[0] ?? { weight: 0, reps: 0 };
  return (
    <motion.section layout className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E63946]/10 text-xs font-black text-[#E63946]">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-black leading-tight tracking-tight text-gray-900">{exercise.name}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {first.weight > 0 ? `${first.weight}kg · ` : '自重 · '}
            {exercise.sets.length}组 × {first.reps}次 · 组间休息 {exercise.restSec}秒
          </p>
        </div>
        <Dumbbell size={18} className="mt-1 shrink-0 text-gray-300" />
      </div>
      <div className="rounded-xl bg-gray-50/70">
        <AnimatePresence initial={false}>
          {exercise.sets.map((set, setIndex) => (
            <motion.div key={set.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
              <SetRow exercise={exercise} set={set} index={setIndex} isOpen={openRpe === `${exercise.id}:${set.id}`} onToggleOpen={onToggleRpe} onToggleDone={onToggleDone} onRpeChange={onRpeChange} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="px-4 py-3">
        <button type="button" disabled={!exercise.sets.length} onClick={() => onAddSet(exercise.id)} className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#E63946]/35 bg-[#E63946]/[0.03] px-3.5 py-2.5 text-xs font-bold text-[#E63946] transition-all hover:bg-[#E63946]/[0.07] disabled:cursor-not-allowed disabled:opacity-40 active:scale-95">
          <Plus size={15} strokeWidth={2.5} />加一组
        </button>
      </div>
    </motion.section>
  );
}

export default function WorkoutPage({
  isLoggedIn = false,
  onCompleteTraining,
}: {
  isLoggedIn?: boolean;
  onCompleteTraining?: (record: WorkoutRecord) => void;
}) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [openRpe, setOpenRpe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setUsingFallback(false);
    setWorkout(null);

    // 游客直接使用通用计划，不请求后端。
    if (!isLoggedIn) {
      setWorkout(readGuestDraft() ?? LOCAL_FALLBACK_WORKOUT);
      setUsingFallback(true);
      setLoading(false);
      return () => controller.abort();
    }

    apiRequest<ApiWorkout | { workout: ApiWorkout } | undefined>('/users/me/workouts/active', {
      signal: controller.signal,
    })
      .then((data) => {
        const next = data ? normalizeWorkout(data) : null;
        // 后端没有返回计划时仍保证用户可以开始训练。
        if (!next || !next.exercises.length) {
          setWorkout(LOCAL_FALLBACK_WORKOUT);
          setUsingFallback(true);
          return;
        }
        setWorkout(next);
        setUsingFallback(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // 502 / 401 / 后端断开：自动降级为通用计划，保留训练入口。
        setWorkout(LOCAL_FALLBACK_WORKOUT);
        setUsingFallback(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isLoggedIn]);

  // 游客的训练进度只保存在本机，刷新后还能接着练。
  useEffect(() => {
    if (isLoggedIn || !workout) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(workout));
    } catch {
      /* ignore */
    }
  }, [isLoggedIn, workout]);

  const exercises = workout?.exercises ?? [];
  const totalSets = useMemo(() => exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0), [exercises]);
  const completedSets = useMemo(() => exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.done).length, 0), [exercises]);
  const progress = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;

  const toggleRpe = (exerciseId: string, setId: string) => {
    const key = `${exerciseId}:${setId}`;
    setOpenRpe((current) => (current === key ? null : key));
  };

  const toggleDone = (exerciseId: string, setId: string) => {
    setWorkout((current) => current ? {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : {
        ...exercise,
        sets: exercise.sets.map((set) => set.id !== setId ? set : { ...set, done: !set.done }),
      }),
    } : current);
  };

  const changeRpe = (exerciseId: string, setId: string, rpe: number) => {
    setWorkout((current) => current ? {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : {
        ...exercise,
        sets: exercise.sets.map((set) => set.id !== setId ? set : { ...set, rpe }),
      }),
    } : current);
  };

  const addSet = (exerciseId: string) => {
    setWorkout((current) => current ? {
      ...current,
      exercises: current.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const last = exercise.sets[exercise.sets.length - 1];
        if (!last) return exercise;
        return { ...exercise, sets: [...exercise.sets, makeSet(last.weight, last.reps, last.rpe)] };
      }),
    } : current);
  };

  const completeTraining = async () => {
    if (!workout || submitting || !totalSets) return;
    setSubmitting(true);

    const actions = exercises.filter((exercise) => exercise.sets.length > 0).map((exercise) => ({
      id: uid('action'),
      part: exercise.part,
      title: exercise.name,
      core: `${exercise.sets.length}组 × ${exercise.sets[0]?.reps ?? 0}`,
    }));

    const payload = {
      workoutId: workout.id,
      date: dateKey(),
      tag: '仅记录',
      actions,
      exercises,
      totalSets,
      completedSets,
      progress,
    };

    const localRecord: WorkoutRecord = {
      ...payload,
      id: uid('training'),
      createdAt: new Date().toISOString(),
    };

    // 未登录：只写 localStorage，不请求后端。
    if (!isLoggedIn) {
      persistLocalRecord(localRecord);
      onCompleteTraining?.(localRecord);
      setSubmitting(false);
      return;
    }

    try {
      const savedPayload = await apiRequest<WorkoutRecord | { record: WorkoutRecord } | undefined>(
        '/users/me/training-records',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      const saved =
        savedPayload && typeof savedPayload === 'object' && 'record' in savedPayload
          ? savedPayload.record
          : savedPayload;

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }

      onCompleteTraining?.({
        ...payload,
        ...saved,
        id: saved?.id ?? uid('training'),
        createdAt: saved?.createdAt ?? new Date().toISOString(),
      });
    } catch {
      // 登录用户遇到 502/断网时也先落本机，训练不丢。
      persistLocalRecord(localRecord);
      onCompleteTraining?.(localRecord);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        .rpe-slider { -webkit-appearance: none; appearance: none; height: 7px; border-radius: 999px; outline: none; cursor: pointer; }
        .rpe-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 3px solid #E63946; box-shadow: 0 4px 14px rgba(230,57,70,.28); cursor: grab; }
        .rpe-slider::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 3px solid #E63946; box-shadow: 0 4px 14px rgba(230,57,70,.28); cursor: grab; }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-40 text-gray-900">
        <div className="screen-safe-top mx-auto max-w-md px-4">
          <header>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#E63946]">
              <Dumbbell size={14} />WORKOUT IN PROGRESS
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight">训练进行中</h1>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="font-medium text-gray-500">组进度 <b className="font-black text-[#E63946]">{completedSets}/{totalSets}</b></span>
              <span className="text-xs font-medium text-gray-400">{exercises.length} 个动作</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
              <motion.div className="h-full rounded-full bg-[#E63946]" animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
            </div>
          </header>

          {loading && <WorkoutSkeleton />}

          {!loading && usingFallback && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-700">
              {isLoggedIn ? <WifiOff size={12} /> : <Dumbbell size={12} />}
              {isLoggedIn
                ? '网络异常 · 已切换通用训练计划'
                : '游客模式 · 通用训练计划，进度保存在本机'}
            </div>
          )}

          {!loading && (!workout || !exercises.length) && (
            <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
              <Dumbbell size={24} className="mx-auto text-gray-300" />
              <p className="mt-2 text-sm font-bold text-gray-700">今天没有训练安排</p>
            </div>
          )}

          {!loading && exercises.length > 0 && (
            <section className="mt-6 space-y-3">
              {exercises.map((exercise, index) => (
                <ExerciseCard key={exercise.id} exercise={exercise} index={index} openRpe={openRpe} onToggleRpe={toggleRpe} onToggleDone={toggleDone} onRpeChange={changeRpe} onAddSet={addSet} />
              ))}
            </section>
          )}
        </div>

        {!loading && exercises.length > 0 && (
          <div className="sticky bottom-[60px] z-40 mx-auto mt-6 w-full max-w-md border-t border-gray-100 bg-white/95 px-4 pb-3 pt-3 shadow-[0_-8px_24px_rgba(17,24,39,0.06)] backdrop-blur">
            <button type="button" disabled={submitting || !totalSets} onClick={completeTraining} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#E63946] text-base font-black tracking-wide text-white shadow-[0_10px_24px_rgba(230,57,70,0.28)] transition-all hover:bg-[#d92b3a] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]">
              {submitting && <Loader2 size={19} className="animate-spin" />}
              {submitting ? '保存中...' : '完成今日训练'}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
