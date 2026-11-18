import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

export type PRKey = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs';

export type PRData = {
  name: string;
  weight: number;
  date: string;
  color: string;
};

export const mockPRData: Record<PRKey, PRData> = {
  chest: { name: '胸部卧推', weight: 100, date: '2026-10-15', color: '#E63946' },
  back: { name: '背部硬拉', weight: 120, date: '2026-11-01', color: '#3B82F6' },
  shoulders: { name: '肩部推举', weight: 70, date: '2026-09-28', color: '#F59E0B' },
  arms: { name: '手臂弯举', weight: 45, date: '2026-10-22', color: '#A855F7' },
  legs: { name: '腿部深蹲', weight: 140, date: '2026-10-08', color: '#22C55E' },
};

const PR_TABS: { key: PRKey; label: string }[] = [
  { key: 'chest', label: '胸部' },
  { key: 'back', label: '背部' },
  { key: 'shoulders', label: '肩部' },
  { key: 'arms', label: '手臂' },
  { key: 'legs', label: '腿部' },
];

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

    const count = Math.max(64, Math.min(132, Math.floor(width * 0.3)));
    for (let i = 0; i < count; i += 1) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 16 + Math.pow(Math.random(), 0.6) * Math.min(width, height) * 0.34,
        speed: 0.12 + Math.random() * 0.42,
        size: 0.7 + Math.random() * 2.2,
        alpha: 0.25 + Math.random() * 0.65,
        seed: Math.random() * 10,
        gold: i % 9 === 0,
      });
    }

    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    const draw = (now: number) => {
      const t = (now - startedAt) / 1000;
      const cx = width / 2 + Math.sin(t * 0.48) * 16;
      const cy = height * 0.46 + Math.cos(t * 0.4) * 9;

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

      const activeColor = colorRef.current;
      ctx.clearRect(0, 0, width, height);

      // 中心能量光晕
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.48);
      glow.addColorStop(0, rgba(activeColor, 0.2));
      glow.addColorStop(0.35, rgba(activeColor, 0.08));
      glow.addColorStop(1, rgba(activeColor, 0));

      ctx.save();
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      // 旋转轨道
      for (let ring = 0; ring < 3; ring += 1) {
        const ringRadius = (42 + ring * 27) * burstScale;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          ringRadius,
          ringRadius * 0.56,
          t * 0.22 + ring * 0.5,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = rgba(activeColor, 0.08 - ring * 0.018);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 核心亮点
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 76 * burstScale);
      coreGlow.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      coreGlow.addColorStop(0.08, rgba(activeColor, 0.85));
      coreGlow.addColorStop(0.35, rgba(activeColor, 0.18));
      coreGlow.addColorStop(1, rgba(activeColor, 0));
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, 76 * burstScale, 0, Math.PI * 2);
      ctx.fill();

      // 粒子星云
      for (const particle of particles) {
        const angle = particle.angle + t * particle.speed;
        const radius = particle.radius * burstScale;
        const x =
          cx +
          Math.cos(angle) * radius * 1.16 +
          Math.sin(t * 0.8 + particle.seed) * 5;
        const y =
          cy +
          Math.sin(angle) * radius * 0.62 +
          Math.cos(t * 0.66 + particle.seed) * 4;
        const twinkle = 0.55 + 0.45 * Math.sin(t * 1.5 + particle.seed);
        const particleColor = particle.gold ? '#F5C451' : activeColor;

        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = rgba(particleColor, Math.min(1, particle.alpha * twinkle));
        ctx.shadowBlur = particle.gold ? 12 : 8;
        ctx.shadowColor = particleColor;
        ctx.fill();
      }

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

export default function PersonalRecord({
  data = mockPRData,
  className = '',
}: {
  data?: Record<PRKey, PRData>;
  className?: string;
}) {
  const [activeKey, setActiveKey] = useState<PRKey>('chest');
  const [burstKey, setBurstKey] = useState(0);

  const activeData = data[activeKey] ?? mockPRData[activeKey];

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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(230,57,70,0.14),transparent_58%)]" />
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
          <span className="font-mono text-[9px] tracking-[0.12em] text-white/25">PR / MAX</span>
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
