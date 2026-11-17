import { useRef, useState } from 'react';
import type { Swiper as SwiperType } from 'swiper';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow } from 'swiper/modules';
import { ChevronRight, Dumbbell, Search, X } from 'lucide-react';
import 'swiper/css';
import 'swiper/css/effect-coverflow';

type Exercise = {
  id: string;
  name: string;
  muscle: string;
};

type TrainingPart = {
  id: string;
  title: string;
  shortName: string;
  image: string;
  muscles: string;
  actions: Exercise[];
};

const makeActions = (partId: string, items: [string, string][]): Exercise[] =>
  items.map(([name, muscle], index) => ({
    id: `${partId}-${index}`,
    name,
    muscle,
  }));

const PARTS: TrainingPart[] = [
  {
    id: 'chest',
    title: '胸部训练',
    shortName: '胸部',
    image: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=900&q=80',
    muscles: '胸大肌 · 三角肌前束',
    actions: makeActions('chest', [
      ['杠铃卧推', '胸大肌'],
      ['上斜哑铃卧推', '上胸'],
      ['哑铃飞鸟', '胸大肌'],
      ['双杠臂屈伸', '下胸'],
      ['绳索夹胸', '胸内侧'],
      ['俯卧撑', '胸大肌'],
      ['器械推胸', '胸大肌'],
      ['下斜卧推', '下胸'],
    ]),
  },
  {
    id: 'back',
    title: '背部训练',
    shortName: '背部',
    image: 'https://images.unsplash.com/photo-1603287681836-b174ce5074c2?auto=format&fit=crop&w=900&q=80',
    muscles: '背阔肌 · 斜方肌',
    actions: makeActions('back', [
      ['引体向上', '背阔肌'],
      ['高位下拉', '背阔肌'],
      ['杠铃划船', '中背'],
      ['单臂哑铃划船', '背阔肌'],
      ['坐姿绳索划船', '中背'],
      ['直臂下压', '背阔肌'],
      ['面拉', '三角后束'],
      ['硬拉', '后链'],
    ]),
  },
  {
    id: 'shoulder',
    title: '肩部训练',
    shortName: '肩部',
    image: 'https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?auto=format&fit=crop&w=900&q=80',
    muscles: '三角肌前中后束',
    actions: makeActions('shoulder', [
      ['站姿推举', '三角前束'],
      ['哑铃侧平举', '三角中束'],
      ['俯身飞鸟', '三角后束'],
      ['阿诺德推举', '三角前中束'],
      ['绳索侧平举', '三角中束'],
      ['面拉', '三角后束'],
      ['杠铃提拉', '三角中束'],
      ['反向蝴蝶机', '三角后束'],
    ]),
  },
  {
    id: 'arms',
    title: '手臂训练',
    shortName: '手臂',
    image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=900&q=80',
    muscles: '肱二头肌 · 肱三头肌',
    actions: makeActions('arms', [
      ['杠铃弯举', '肱二头肌'],
      ['哑铃弯举', '肱二头肌'],
      ['锤式弯举', '肱桡肌'],
      ['绳索下压', '肱三头肌'],
      ['仰卧臂屈伸', '肱三头肌'],
      ['双杠臂屈伸', '肱三头肌'],
      ['牧师凳弯举', '肱二头肌'],
      ['窄距卧推', '肱三头肌'],
    ]),
  },
  {
    id: 'legs',
    title: '腿部训练',
    shortName: '腿部',
    image: 'https://images.unsplash.com/photo-1434682881908-b43d0467b798?auto=format&fit=crop&w=900&q=80',
    muscles: '股四头肌 · 腘绳肌',
    actions: makeActions('legs', [
      ['杠铃后蹲', '股四头肌'],
      ['罗马尼亚硬拉', '腘绳肌'],
      ['腿举', '股四头肌'],
      ['保加利亚分腿蹲', '臀腿'],
      ['腿屈伸', '股四头肌'],
      ['腿弯举', '腘绳肌'],
      ['箭步蹲', '臀腿'],
      ['站姿提踵', '小腿'],
    ]),
  },
  {
    id: 'abs',
    title: '腹部训练',
    shortName: '腹部',
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=80',
    muscles: '腹直肌 · 腹斜肌',
    actions: makeActions('abs', [
      ['卷腹', '腹直肌'],
      ['平板支撑', '核心'],
      ['悬垂举腿', '下腹'],
      ['俄罗斯转体', '腹斜肌'],
      ['登山跑', '核心'],
      ['死虫式', '核心'],
      ['绳索卷腹', '腹直肌'],
      ['侧平板', '腹斜肌'],
    ]),
  },
  {
    id: 'cardio',
    title: '有氧训练',
    shortName: '有氧',
    image: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=900&q=80',
    muscles: '心肺耐力 · 全身',
    actions: makeActions('cardio', [
      ['跑步机', '有氧'],
      ['划船机', '全身'],
      ['动感单车', '下肢'],
      ['椭圆机', '全身'],
      ['跳绳', '全身'],
      ['战绳', '全身'],
      ['爬楼机', '下肢'],
      ['开合跳', '全身'],
    ]),
  },
];

export default function ExercisePickerPage({
  onSelectExercise,
}: {
  onSelectExercise?: (exercise: Exercise) => void;
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
      action.muscle.toLowerCase().includes(keyword),
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
                placeholder="搜索动作或目标肌群"
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
              {filteredActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onSelectExercise?.(action)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-[#E63946]/20 hover:shadow-md active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-800">{action.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-gray-400">
                      {action.muscle}
                    </span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-gray-300" />
                </button>
              ))}
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
