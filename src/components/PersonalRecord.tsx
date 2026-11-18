import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { apiRequest } from '../api/client';

export type PRKey = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs';

export type PRData = {
  name: string;
  weight: number;
  date: string;
  color: string;
  /** public/images 下的肌肉剪影图，例如 /images/chest.png */
  img: string;
};

export const mockPRData: Record<PRKey, PRData> = {
  chest: { name: '胸部卧推', weight: 100, date: '2026-10-15', color: '#E63946', img: '/images/chest.png' },
  back: { name: '背部硬拉', weight: 120, date: '2026-11-01', color: '#3B82F6', img: '/images/back.png' },
  shoulders: { name: '肩部推举', weight: 70, date: '2026-09-28', color: '#F59E0B', img: '/images/shoulders.png' },
  arms: { name: '手臂弯举', weight: 45, date: '2026-10-22', color: '#A855F7', img: '/images/arms.png' },
  legs: { name: '腿部深蹲', weight: 140, date: '2026-10-08', color: '#22C55E', img: '/images/legs.png' },
};

/**
 * 仅用于本地预览的兜底图：如果你已经把 chest.png / back.png 等放进
 * public/images，会优先使用 mockPRData.img；没有时自动退回这些旧图。
 * 正式图片准备好后可以删除这个常量。
 */
const IMAGE_FALLBACKS: Record<PRKey, string> = {
  chest: '/images/part-chest.jpg',
  back: '/images/part-back.jpg',
  shoulders: '/images/part-chest.jpg',
  arms: '/images/part-arm.jpg',
  legs: '/images/part-core.jpg',
};

const PR_TABS: { key: PRKey; label: string }[] = [
  { key: 'chest', label: '胸部' },
  { key: 'back', label: '背部' },
  { key: 'shoulders', label: '肩部' },
  { key: 'arms', label: '手臂' },
  { key: 'legs', label: '腿部' },
];

const PR_KEYS = PR_TABS.map((tab) => tab.key);

function normalizePRData(payload: unknown): Record<PRKey, PRData> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('PR 数据格式不正确');
  }

  const root = (payload as { data?: unknown }).data ?? payload;
  if (!root || typeof root !== 'object') {
    throw new Error('PR 数据格式不正确');
  }

  const merged = { ...mockPRData };
  for (const key of PR_KEYS) {
    const item = (root as Record<string, unknown>)[key];
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<PRData>;

    merged[key] = {
      name: typeof raw.name === 'string' && raw.name ? raw.name : mockPRData[key].name,
      weight: Number.isFinite(Number(raw.weight))
        ? Number(raw.weight)
        : mockPRData[key].weight,
      date: typeof raw.date === 'string' && raw.date ? raw.date : mockPRData[key].date,
      color: typeof raw.color === 'string' && raw.color ? raw.color : mockPRData[key].color,
      img: typeof raw.img === 'string' && raw.img ? raw.img : mockPRData[key].img,
    };
  }

  return merged;
}

type Particle = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
  seed: number;
  gold: boolean;
};

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) || 230,
    g: parseInt(full.slice(2, 4), 16) || 57,
    b: parseInt(full.slice(4, 6), 16) || 70,
  };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function easeInCubic(t: number) {
  return t * t * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function ParticleField({ color, burstKey }: { color: string; burstKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorRef = useRef(color);
  const burstRef = useRef<{ startedAt: number } | null>(null);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    burstRef.current = { startedAt: performance.now() };
  }, [burstKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !parent || !ctx) return undefined;

    let width = 0;
    let height = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particles: Particle[] = [];
    const startedAt = performance.now();

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(rect.width, 300);
      height = Math.max(rect.height, 260);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const count = Math.max(72, Math.min(124, Math.floor(width * 0.29)));
    for (let i = 0; i < count; i += 1) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 8 + Math.pow(Math.random(), 1.45) * Math.min(width, height) * 0.18,
        speed: 0.06 + Math.random() * 0.2,
        size: 0.7 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.58,
        seed: Math.random() * 10,
        gold: i % 10 === 0,
      });
    }

    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    const draw = (now: number) => {
      const t = (now - startedAt) / 1000;
      // 中心固定在肌肉剪影的胸腔位置，只做极轻微游走。
      const cx = width / 2 + Math.sin(t * 0.42) * 4;
      const cy = height * 0.43 + Math.cos(t * 0.36) * 3;
      // 心跳 / 能量呼吸：所有粒子围绕中心一起收缩、扩散。
      const breath = 1 + Math.sin(t * 2.15) * 0.075 + Math.sin(t * 0.78) * 0.025;

      let burstScale = 1;
      const burst = burstRef.current;
      if (burst) {
        const progress = Math.min((now - burst.startedAt) / 900, 1);
        if (progress >= 1) {
          burstRef.current = null;
        } else if (progress < 0.3) {
          burstScale = 1 - easeInCubic(progress / 0.3) * 0.94;
        } else if (progress < 0.7) {
          burstScale = 0.06 + easeOutCubic((progress - 0.3) / 0.4) * 1.42;
        } else {
          burstScale = 1.48 - easeOutCubic((progress - 0.7) / 0.3) * 0.48;
        }
      }

      const pulse = breath * burstScale;
      const activeColor = colorRef.current;
      ctx.clearRect(0, 0, width, height);

      // 中心能量光晕，范围收紧到肌肉剪影中央。
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.3);
      glow.addColorStop(0, rgba(activeColor, 0.22));
      glow.addColorStop(0.38, rgba(activeColor, 0.07));
      glow.addColorStop(1, rgba(activeColor, 0));

      ctx.save();
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      // 心跳扩散环
      for (let ring = 0; ring < 3; ring += 1) {
        const phase = (t * 0.32 + ring / 3) % 1;
        const ringRadius = (22 + phase * 68) * pulse;
        ctx.beginPath();
        ctx.ellipse(cx, cy, ringRadius, ringRadius * 0.72, 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(activeColor, 0.13 * (1 - phase));
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 中心核心，随呼吸一起脉动。
      const coreRadius = (5.5 + Math.sin(t * 2.15) * 1.6) * pulse;
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 72 * pulse);
      coreGlow.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
      coreGlow.addColorStop(0.09, rgba(activeColor, 0.88));
      coreGlow.addColorStop(0.42, rgba(activeColor, 0.16));
      coreGlow.addColorStop(1, rgba(activeColor, 0));
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, 72 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.shadowBlur = 18;
      ctx.shadowColor = activeColor;
      ctx.fill();

      // 粒子向中心聚拢做能量呼吸，只保留很慢的环绕。
      particles.forEach((particle, index) => {
        const angle = particle.angle + t * particle.speed;
        const radius =
          particle.radius *
          pulse *
          (1 + Math.sin(t * 1.55 + particle.seed) * 0.12);
        const x =
          cx +
          Math.cos(angle) * radius * 1.05 +
          Math.sin(t * 0.65 + particle.seed) * 2.5;
        const y =
          cy +
          Math.sin(angle) * radius * 0.72 +
          Math.cos(t * 0.58 + particle.seed) * 2;
        const twinkle = 0.55 + 0.45 * Math.sin(t * 1.35 + particle.seed);
        const particleColor = particle.gold ? '#F5C451' : activeColor;

        // 少量能量丝线把粒子拉回中心，形成“流转”而不是星空。
        if (index % 6 === 0) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(x, y);
          ctx.strokeStyle = rgba(particleColor, 0.08 * twinkle);
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = rgba(particleColor, Math.min(1, particle.alpha * twinkle));
        ctx.shadowBlur = particle.gold ? 12 : 8;
        ctx.shadowColor = particleColor;
        ctx.fill();
      });

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}

function PRSkeleton({ className = '' }: { className?: string }) {
  return (
    <section
      className={`relative h-[380px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_28px_80px_rgba(0,0,0,0.42)] ${className}`}
      aria-busy="true"
      aria-label="正在加载个人最好成绩"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(230,57,70,0.12),transparent_60%)]" />
      <div className="relative z-20 animate-pulse px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="h-2.5 w-28 rounded bg-white/10" />
          <div className="h-2.5 w-14 rounded bg-white/10" />
        </div>
        <div className="mt-3 flex gap-6">
          {[28, 28, 28, 28, 28].map((width, index) => (
            <div key={index} className="h-3 rounded bg-white/10" style={{ width }} />
          ))}
        </div>
      </div>
      <div className="absolute left-1/2 top-[42%] h-20 w-20 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border border-white/10 bg-white/5" />
      <div className="absolute inset-x-4 bottom-4 animate-pulse rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
        <div className="h-2.5 w-24 rounded bg-white/10" />
        <div className="mt-2 h-3 w-20 rounded bg-white/10" />
        <div className="mt-3 h-10 w-28 rounded bg-white/10" />
        <div className="absolute bottom-4 right-4 h-3 w-20 rounded bg-white/10" />
      </div>
    </section>
  );
}

export default function PersonalRecord({
  className = '',
}: {
  className?: string;
}) {
  const [prData, setPrData] = useState<Record<PRKey, PRData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [activeKey, setActiveKey] = useState<PRKey>('chest');
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const payload = await apiRequest<unknown>('/api/user/pr_data', {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setPrData(normalizePRData(payload));
        setUsingFallback(false);
      } catch {
        if (controller.signal.aborted) return;
        // 后端未启动或数据异常时，用组件内 mockPRData 兜底，不让卡片白屏。
        setPrData(mockPRData);
        setUsingFallback(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  if (loading || !prData) return <PRSkeleton className={className} />;

  const activeData = prData[activeKey] ?? mockPRData[activeKey];

  const selectPart = (key: PRKey) => {
    if (key === activeKey) return;
    setActiveKey(key);
    setBurstKey((value) => value + 1);
  };

  return (
    <section
      className={`relative h-[380px] select-none overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_28px_80px_rgba(0,0,0,0.42)] ${className}`}
      aria-label="个人最好成绩"
    >
      {/* 边框微光与暗色网格 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 42%, ${activeData.color}26, transparent 60%)` }}
      />

      {/* 底层肌肉剪影：图片在 Canvas 下面，切换部位时淡入淡出 */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img
            key={activeKey}
            src={activeData.img}
            alt={`${activeData.name}肌肉剪影`}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 0.48, scale: 1.02 }}
            exit={{ opacity: 0, scale: 1.08 }}
            transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover object-center"
            style={{ filter: 'grayscale(1) contrast(1.15) brightness(0.62)' }}
            onError={(event) => {
              const image = event.currentTarget;
              // 新图片还没就位时，优先退回项目里已有的部位图，避免整张卡片空掉。
              if (!image.dataset.fallback) {
                image.dataset.fallback = '1';
                image.src = IMAGE_FALLBACKS[activeKey];
                return;
              }
              image.style.visibility = 'hidden';
            }}
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-slate-950/70" />
        <div
          className="absolute inset-0 opacity-25 mix-blend-color"
          style={{ background: `radial-gradient(circle at 50% 42%, ${activeData.color}, transparent 64%)` }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.55) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
          maskImage: 'radial-gradient(circle at center, black, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 78%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-10 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${activeData.color}aa, transparent)` }}
      />

      <ParticleField color={activeData.color} burstKey={burstKey} />

      <div className="relative z-20 px-4 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
            PERSONAL RECORD
          </span>
          <span className={`font-mono text-[9px] tracking-[0.12em] ${usingFallback ? 'text-amber-300/60' : 'text-white/25'}`}>
            {usingFallback ? 'LOCAL FALLBACK' : 'PR / MAX'}
          </span>
        </div>

        <div className="no-scrollbar mt-3 flex gap-6 overflow-x-auto" role="tablist" aria-label="选择训练部位">
          {PR_TABS.map((tab) => {
            const selected = activeKey === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectPart(tab.key)}
                style={{ background: 'transparent', border: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}
                className={`relative shrink-0 appearance-none pb-2 text-xs font-bold transition-colors ${
                  selected ? 'text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {tab.label}
                {selected && (
                  <motion.span
                    layoutId="personal-record-tab"
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
                    style={{ backgroundColor: activeData.color }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-x-4 bottom-4 z-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeKey}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md"
            style={{ borderColor: `${activeData.color}33` }}
            aria-live="polite"
          >
            <div
              className="absolute left-0 top-4 h-8 w-0.5 rounded-r-full"
              style={{ backgroundColor: activeData.color }}
            />
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
                  <Trophy size={11} style={{ color: activeData.color }} />
                  PERSONAL BEST
                </div>
                <p className="mt-1 truncate text-xs font-medium text-white/55">{activeData.name}</p>
                <p
                  className="mt-0.5 text-5xl font-black leading-none tracking-tight"
                  style={{
                    color: activeData.color,
                    textShadow: `0 0 22px ${activeData.color}88, 0 0 52px ${activeData.color}44`,
                  }}
                >
                  {activeData.weight}
                  <span className="ml-1 text-sm font-bold tracking-normal text-white/45">kg</span>
                </p>
              </div>

              <div className="shrink-0 pb-0.5 text-right">
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">突破于</p>
                <p className="mt-1 font-mono text-[11px] font-medium text-white/55">{activeData.date}</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
