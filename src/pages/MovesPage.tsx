import { useRef, useState } from 'react';
import type { Swiper as SwiperType } from 'swiper';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow } from 'swiper/modules';
import { Check, ChevronRight, Dumbbell, Plus, Search, X } from 'lucide-react';
import { BROWSE_AREAS, EXERCISES } from '../engine/exercises.js';
import 'swiper/css';
import 'swiper/css/effect-coverflow';

type RawExercise = {
  id: string;
  name: string;
  muscles?: string[];
  equipment?: string[];
};

type Exercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
};

type TrainingPart = {
  id: string;
  title: string;
  shortName: string;
  image: string;
  muscles: string;
  actions: Exercise[];
};

type BrowseArea = {
  key: string;
  title: string;
  test: (exercise: RawExercise) => boolean;
};

const AREA_MAP = new Map(
  (BROWSE_AREAS as BrowseArea[]).map((area) => [area.key, area]),
);

const toAction = (exercise: RawExercise): Exercise => {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];
  const equipment = Array.isArray(exercise.equipment) ? exercise.equipment : [];

  return {
    id: String(exercise.id),
    name: exercise.name,
    muscle: muscles.slice(0, 2).join(' · ') || '全身',
    equipment: equipment.join(' / ') || '自重',
  };
};

const actionsFor = (keys: string[] = [], all = false): Exercise[] => {
  const source = all
    ? (EXERCISES as RawExercise[])
    : (EXERCISES as RawExercise[]).filter((exercise) =>
        keys.some((key) => AREA_MAP.get(key)?.test(exercise)),
      );

  return source.map(toAction);
};

const PART_DEFS: Array<{
  id: string;
  title: string;
  shortName: string;
  image: string;
  muscles: string;
  keys?: string[];
  all?: boolean;
}> = [
  {
    id: 'all',
    title: '全部动作',
    shortName: '全部',
    image:
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=80',
    muscles: '完整动作库 · 7 大部位',
    all: true,
  },
  {
    id: 'chest',
    title: '胸部训练',
    shortName: '胸部',
    image:
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=900&q=80',
    muscles: '胸大肌 · 三角肌前束',
    keys: ['chest'],
  },
  {
    id: 'back',
    title: '背部训练',
    shortName: '背部',
    image:
      'https://images.unsplash.com/photo-1603287681836-b174ce5074c2?auto=format&fit=crop&w=900&q=80',
    muscles: '背阔肌 · 斜方肌',
    keys: ['back'],
  },
  {
    id: 'shoulder',
    title: '肩部训练',
    shortName: '肩部',
    image:
      'https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?auto=format&fit=crop&w=900&q=80',
    muscles: '三角肌前中后束',
    keys: ['shoulder'],
  },
  {
    id: 'arms',
    title: '手臂训练',
    shortName: '手臂',
    image:
      'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=900&q=80',
    muscles: '肱二头肌 · 肱三头肌',
    keys: ['arm'],
  },
  {
    id: 'legs',
    title: '腿部训练',
    shortName: '腿部',
    image:
      'https://images.unsplash.com/photo-1434682881908-b43d0467b798?auto=format&fit=crop&w=900&q=80',
    muscles: '股四头肌 · 腘绳肌 · 臀',
    keys: ['leg', 'glute'],
  },
  {
    id: 'abs',
    title: '腹部训练',
    shortName: '腹部',
    image:
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=80',
    muscles: '腹直肌 · 腹斜肌',
    keys: ['core'],
  },
  {
    id: 'cardio',
    title: '有氧训练',
    shortName: '有氧',
    image:
      'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=900&q=80',
    muscles: '心肺耐力 · 全身',
    keys: ['cardio'],
  },
];

const PARTS: TrainingPart[] = PART_DEFS.map((part) => ({
  id: part.id,
  title: part.title,
  shortName: part.shortName,
  image: part.image,
  muscles: part.muscles,
  actions: actionsFor(part.keys, part.all),
}));

export default function MovesPage({
  picked = [],
  onTogglePick,
}: {
  picked?: string[];
  onTogglePick?: (exerciseId: string) => void;
}) {
  const swiperRef = useRef<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState('');

  const activePart = PARTS[activeIndex] ?? PARTS[0];
  const keyword = query.trim().toLowerCase();
  const filteredActions = activePart.actions.filter(
    (action) =>
      !keyword ||
      action.name.toLowerCase().includes(keyword) ||
      action.muscle.toLowerCase().includes(keyword) ||
      action.equipment.toLowerCase().includes(keyword),
  );

  return (
    <>
      <style>{`
        .exercise-swiper {
          overflow: visible;
          padding: 12px 0 20px;
        }
        .exercise-swiper .swiper-slide {
          height: auto;
          opacity: .5;
          transition: opacity .35s ease;
        }
        .exercise-swiper .swiper-slide-active {
          opacity: 1;
        }
        .exercise-swiper .part-card {
          transform: scale(.86);
          transition: transform .45s cubic-bezier(.22,.61,.36,1), box-shadow .45s ease;
        }
        .exercise-swiper .swiper-slide-active .part-card {
          transform: scale(1);
          box-shadow: 0 24px 50px rgba(230, 57, 70, .24);
        }
        .exercise-swiper .swiper-slide-shadow-left,
        .exercise-swiper .swiper-slide-shadow-right {
          border-radius: 1rem;
        }
      `}</style>

      <main className="min-h-screen bg-gray-50 pb-28 text-gray-900">
        <div className="screen-safe-top mx-auto max-w-md px-4">
          <header>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#E63946]">
              <Dumbbell size={14} />
              EXERCISE LIBRARY
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">动作选择</h1>
            <p className="mt-1 text-xs font-medium text-gray-400">2026-11-17 周二 · 第 1 周</p>

            <div className="mt-5 flex h-12 items-center gap-2 rounded-xl bg-gray-100 px-4">
              <Search size={17} className="shrink-0 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索动作、目标肌群或器械"
                className="w-full appearance-none border-0 bg-transparent p-0 text-sm text-gray-800 shadow-none outline-none ring-0 placeholder:text-gray-400 focus:ring-0"
                style={{ background: 'transparent', border: 0, boxShadow: 'none', outline: 'none' }}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="shrink-0 text-gray-400 active:scale-90" aria-label="清除搜索">
                  <X size={15} />
                </button>
              )}
            </div>
          </header>

          {/* 3D 部位轮播 */}
          <div className="relative -mx-4 mt-5 overflow-hidden">
            <div className="pointer-events-none absolute left-1/2 top-8 h-36 w-72 -translate-x-1/2 rounded-full bg-[#E63946]/10 blur-3xl" />
            <Swiper
              modules={[EffectCoverflow]}
              effect="coverflow"
              grabCursor
              centeredSlides
              slidesPerView="auto"
              spaceBetween={8}
              speed={650}
              resistanceRatio={0.65}
              watchSlidesProgress
              slideToClickedSlide
              coverflowEffect={{
                rotate: 22,
                stretch: 0,
                depth: 130,
                modifier: 1.15,
                slideShadows: false,
              }}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
              onSlideChange={(swiper) => {
                setActiveIndex(swiper.activeIndex);
                setQuery('');
              }}
              className="exercise-swiper"
            >
              {PARTS.map((part, index) => {
                const active = index === activeIndex;
                return (
                  <SwiperSlide key={part.id} className="!w-[280px] sm:!w-[300px]">
                    <button
                      type="button"
                      onClick={() => swiperRef.current?.slideTo(index)}
                      className={`part-card relative block aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-gray-900 text-left shadow-2xl ${
                        active ? 'ring-1 ring-white/20' : ''
                      }`}
                      aria-label={`查看${part.title}`}
                    >
                      <img
                        src={part.image}
                        alt={part.title}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                      <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-[9px] font-bold text-white backdrop-blur">
                        {part.actions.length} 个动作
                      </span>

                      <span
                        className={`absolute left-4 top-3 h-1 w-8 rounded-full transition-colors ${
                          active ? 'bg-[#E63946]' : 'bg-white/30'
                        }`}
                      />

                      <span className="absolute inset-x-0 bottom-0 block p-4">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-white/60">
                          TARGET AREA
                        </span>
                        <span className="mt-0.5 block text-2xl font-black tracking-tight text-white">
                          {part.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] font-medium text-white/60">
                          {part.muscles}
                        </span>
                      </span>
                    </button>
                  </SwiperSlide>
                );
              })}
            </Swiper>
            <p className="mt-1 text-center text-[10px] font-medium text-gray-400">左右滑动切换训练部位</p>
          </div>

          {/* 联动动作列表 */}
          <section className="mt-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">ACTIONS</div>
                <h2 className="mt-1 text-lg font-black tracking-tight">
                  {activePart.title} · {filteredActions.length} 个动作
                </h2>
              </div>
              <span className="rounded-full bg-[#E63946]/10 px-2.5 py-1 text-[10px] font-bold text-[#E63946]">
                {activePart.shortName}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {filteredActions.map((action) => {
                const on = picked.includes(action.id);
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onTogglePick?.(action.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left shadow-sm transition-all active:scale-[0.99] ${
                      on
                        ? 'border-[#E63946]/40 bg-[#E63946]/[0.04]'
                        : 'border-gray-100 bg-white hover:border-[#E63946]/20 hover:shadow-md'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-gray-800">{action.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-medium text-gray-400">
                        {action.muscle} · {action.equipment}
                      </span>
                    </span>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${
                        on ? 'bg-[#E63946] text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {on ? <Check size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={3} />}
                      {on ? '已加入' : '加进今天'}
                    </span>
                  </button>
                );
              })}
            </div>

            {!filteredActions.length && (
              <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
                <Search size={20} className="mx-auto text-gray-300" />
                <p className="mt-2 text-xs font-medium text-gray-400">没有找到相关动作</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
