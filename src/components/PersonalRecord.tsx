import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Trophy } from 'lucide-react';
import { partBests } from '../engine/logbook.js';

export type PRKey = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs';

type PROption = {
  label: string;
  color: string;
  /** public/images/pr 下的部位特写 */
  img: string;
  /** 特写图还没就位时的兜底 */
  fallback: string;
};

const PR_PARTS: Record<PRKey, PROption> = {
  chest: { label: '胸部', color: '#E63946', img: '/images/pr/chest.jpg', fallback: '/images/part-chest.jpg' },
  back: { label: '背部', color: '#3B82F6', img: '/images/pr/back.jpg', fallback: '/images/part-back.jpg' },
  shoulders: { label: '肩部', color: '#F59E0B', img: '/images/pr/shoulders.jpg', fallback: '/images/part-chest.jpg' },
  arms: { label: '手臂', color: '#A855F7', img: '/images/pr/arms.jpg', fallback: '/images/part-arm.jpg' },
  legs: { label: '腿部', color: '#22C55E', img: '/images/pr/legs.jpg', fallback: '/images/part-core.jpg' },
};

const PR_KEYS = Object.keys(PR_PARTS) as PRKey[];

type LogRow = { exId: string; name: string; unit: string; weight: number | null; reps: number; date: string; maxReps: number; maxRepsDate: string; sets: number };

const VISIBLE_ROWS = 3;

function fmtDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(5) : '';
}

function fmtUnit(unit: string) {
  return unit === '每手kg' ? 'kg/手' : unit === 'kg' ? 'kg' : '';
}

/** 有重量写「30 kg/手 × 12」，自重只写「自重 × 15」 */
function fmtBest(row: LogRow) {
  if (row.weight === null) return `自重 × ${row.maxReps}`;
  return `${row.weight} ${fmtUnit(row.unit)} × ${row.reps}`;
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

export default function PersonalRecord({
  className = '',
  logs = [],
}: {
  className?: string;
  logs?: { exId?: string; weightKg?: number | null; reps?: number; date?: string; slotId?: string }[];
}) {
  const [activeKey, setActiveKey] = useState<PRKey>('chest');
  const [burstKey, setBurstKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // 榜单完全由本机记录算出：每个动作一行，取正式组里最重的一组和单组最高次数
  const bests = useMemo(() => partBests(logs) as Record<PRKey, LogRow[]>, [logs]);
  const rows = bests[activeKey];
  const part = PR_PARTS[activeKey];
  const hasAny = PR_KEYS.some((key) => bests[key].length > 0);
  const top = rows[0] ?? null;
  const rest = rows.slice(1, expanded ? rows.length : VISIBLE_ROWS);
  const topDate = top ? fmtDate(top.weight === null ? top.maxRepsDate : top.date) : '';

  const selectPart = (key: PRKey) => {
    if (key === activeKey) return;
    setActiveKey(key);
    setExpanded(false);
    setBurstKey((value) => value + 1);
  };

  return (
    <section
      className={`relative select-none overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_28px_80px_rgba(0,0,0,0.42)] ${className}`}
      aria-label="个人最好成绩"
    >
      <div className="relative h-[300px] overflow-hidden">
        {/* 边框微光与暗色网格 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 42%, ${part.color}26, transparent 60%)` }}
        />

        {/* 该部位的特写：切换时淡入，并在 7 秒里缓慢推近 */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.img
              key={activeKey}
              src={part.img}
              alt={`${part.label}训练特写`}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: 0.55, scale: 1.1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ opacity: { duration: 0.45 }, scale: { duration: 7, ease: 'linear' } }}
              className="absolute inset-0 h-full w-full object-cover object-center"
              style={{ filter: 'saturate(0.92) contrast(1.06) brightness(0.72)' }}
              onError={(event) => {
                const image = event.currentTarget;
                // 特写图还没就位时退回项目里已有的部位图，避免整块空掉
                if (!image.dataset.fallback) {
                  image.dataset.fallback = '1';
                  image.src = part.fallback;
                  return;
                }
                image.style.visibility = 'hidden';
              }}
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/70" />
          <div
            className="absolute inset-0 opacity-25 mix-blend-color"
            style={{ background: `radial-gradient(circle at 50% 42%, ${part.color}, transparent 64%)` }}
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
          style={{ background: `linear-gradient(90deg, transparent, ${part.color}aa, transparent)` }}
        />

        <ParticleField color={part.color} burstKey={burstKey} />

        <div className="relative z-20 px-4 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
              PERSONAL RECORD
            </span>
            <span className="font-mono text-[9px] tracking-[0.12em] text-amber-300/60">
              {hasAny ? '本地记录' : '还没有记录'}
            </span>
          </div>

          <div className="no-scrollbar mt-3 flex gap-6 overflow-x-auto" role="tablist" aria-label="选择训练部位">
            {PR_KEYS.map((key) => {
              const selected = activeKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectPart(key)}
                  style={{ background: 'transparent', border: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}
                  className={`relative shrink-0 appearance-none pb-2 text-xs font-bold transition-colors ${
                    selected ? 'text-white' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {PR_PARTS[key].label}
                  {selected && (
                    <motion.span
                      layoutId="personal-record-tab"
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
                      style={{ backgroundColor: part.color }}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[9px] font-medium leading-relaxed text-white/30">
            按主动肌归到五个部位，只算正式组；自重动作只看次数
          </p>
        </div>
      </div>

      <div className="relative z-20 px-4 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeKey}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md"
            style={{ borderColor: `${part.color}33` }}
            aria-live="polite"
          >
            <div
              className="absolute left-0 top-4 h-8 w-0.5 rounded-r-full"
              style={{ backgroundColor: part.color }}
            />

            {!top ? (
              <>
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
                  <Trophy size={11} style={{ color: part.color }} />
                  PERSONAL BEST
                </div>
                <p className="mt-1 text-sm font-bold text-white/75">{part.label}还没有记录</p>
                <p className="mt-1 text-[10px] font-medium leading-relaxed text-white/40">
                  练完一次训练，这个部位的每个动作都会留下最好成绩
                </p>
              </>
            ) : (
              <>
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
                      <Trophy size={11} style={{ color: part.color }} />
                      {part.label} · 最重一次
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-white/55">{top.name}</p>
                    <p
                      className="mt-0.5 text-4xl font-black leading-none tracking-tight"
                      style={{
                        color: part.color,
                        textShadow: `0 0 22px ${part.color}88, 0 0 52px ${part.color}44`,
                      }}
                    >
                      {top.weight === null ? top.maxReps : top.weight}
                      <span className="ml-1 text-sm font-bold tracking-normal text-white/45">
                        {top.weight === null ? '次' : fmtUnit(top.unit)}
                      </span>
                    </p>
                    <p className="mt-1.5 text-[10px] font-medium text-white/40">
                      {top.weight === null ? '自重动作' : `× ${top.reps} 次`} · 单组最高 {top.maxReps} 次
                    </p>
                  </div>

                  {topDate && (
                    <div className="shrink-0 pb-0.5 text-right">
                      <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">突破于</p>
                      <p className="mt-1 font-mono text-[11px] font-medium text-white/55">{topDate}</p>
                    </div>
                  )}
                </div>

                {rest.length > 0 && (
                  <div className="mt-3 border-t border-white/10">
                    {rest.map((row) => (
                      <div
                        key={row.exId}
                        className="flex items-center gap-3 border-b border-white/[0.06] py-2.5 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-bold text-white/80">{row.name}</p>
                          <p className="mt-0.5 text-[9px] text-white/35">
                            单组最高 {row.maxReps} 次
                            {fmtDate(row.date) ? ` · ${fmtDate(row.date)}` : ''}
                          </p>
                        </div>
                        <p className="shrink-0 text-xs font-black" style={{ color: part.color }}>
                          {fmtBest(row)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {rows.length > VISIBLE_ROWS && (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-bold text-white/45 transition-colors hover:text-white/75"
                  >
                    {expanded ? '收起' : `展开全部 ${rows.length} 个动作`}
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
