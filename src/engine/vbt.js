// 摄像头 VBT：用姿态关键点近似杠铃（双手腕中点）的位移与速度，
// 同时给出髋/膝/躯干角度、逐次速度、速度损失与组间间隔。
// 全部是纯函数，便于单独校验；精度依赖拍摄角度，属于估算值。

// 速度损失的停组阈值：15% 提示临近收组，25% 建议结束这一组。
// 这里和 formCheck 的建议共用同一组数字，避免两处各写一遍。
export const VELOCITY_LOSS = { warn: 15, stop: 25 };

export const POSE = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
};

// 画骨架用的连线（肩、髋、膝、踝、双腕）
export const SKELETON = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];

const MIN_VIS = 0.35;

function usable(landmark) {
  return landmark && (landmark.visibility ?? 1) >= MIN_VIS;
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) };
}

function angleAt(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const norm = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (!norm) return null;
  const cos = Math.max(-1, Math.min(1, dot / norm));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 髋角（肩-髋-膝）、膝角（髋-膝-踝）、躯干前倾（髋→肩 与竖直向上夹角） */
export function postureAngles(landmarks) {
  if (!landmarks) return { hip: null, knee: null, torso: null, hipL: null, hipR: null, kneeL: null, kneeR: null };
  const lShoulder = landmarks[POSE.L_SHOULDER];
  const rShoulder = landmarks[POSE.R_SHOULDER];
  const lHip = landmarks[POSE.L_HIP];
  const rHip = landmarks[POSE.R_HIP];
  const lKnee = landmarks[POSE.L_KNEE];
  const rKnee = landmarks[POSE.R_KNEE];
  const lAnkle = landmarks[POSE.L_ANKLE];
  const rAnkle = landmarks[POSE.R_ANKLE];

  const two = (a, b, c, other) => {
    if (usable(a) && usable(b) && usable(c)) return angleAt(a, b, c);
    if (usable(other[0]) && usable(other[1]) && usable(other[2])) return angleAt(...other);
    return null;
  };

  const hip = two(lShoulder, lHip, lKnee, [rShoulder, rHip, rKnee]);
  const knee = two(lHip, lKnee, lAnkle, [rHip, rKnee, rAnkle]);
  // 左右分开算：两侧差值可以用来判断发力是否对称
  const hipL = usable(lShoulder) && usable(lHip) && usable(lKnee) ? angleAt(lShoulder, lHip, lKnee) : null;
  const hipR = usable(rShoulder) && usable(rHip) && usable(rKnee) ? angleAt(rShoulder, rHip, rKnee) : null;
  const kneeL = usable(lHip) && usable(lKnee) && usable(lAnkle) ? angleAt(lHip, lKnee, lAnkle) : null;
  const kneeR = usable(rHip) && usable(rKnee) && usable(rAnkle) ? angleAt(rHip, rKnee, rAnkle) : null;

  const hipMid = usable(lHip) && usable(rHip) ? mid(lHip, rHip) : null;
  const shoulderMid = usable(lShoulder) && usable(rShoulder) ? mid(lShoulder, rShoulder) : null;
  let torso = null;
  if (hipMid && shoulderMid) {
    const dx = shoulderMid.x - hipMid.x;
    const dy = shoulderMid.y - hipMid.y;
    // 画面里 y 向下增大，向上是 -y
    torso = (Math.atan2(Math.abs(dx), -dy) * 180) / Math.PI;
  }
  return { hip, knee, torso, hipL, hipR, kneeL, kneeR };
}

/** 双手腕中点：拿不到双手就退回可见的那只手 */
export function wristMid(landmarks) {
  if (!landmarks) return null;
  const l = landmarks[POSE.L_WRIST];
  const r = landmarks[POSE.R_WRIST];
  if (usable(l) && usable(r)) return mid(l, r);
  if (usable(l)) return { ...l };
  if (usable(r)) return { ...r };
  return null;
}

function movingAverage(values, window) {
  if (window <= 1) return values.slice();
  const out = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j += 1) {
      if (j >= 0 && j < values.length) {
        sum += values[j];
        count += 1;
      }
    }
    out.push(sum / count);
  }
  return out;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

/**
 * 逐帧数据 → 一次「组」的分析结果。
 * frame: { t, y, x, videoH, noseY, ankleY, hip, knee, torso }
 */
export function analyzeFrames(frames, { heightCm } = {}) {
  const empty = {
    repCount: 0,
    meanVel: null,
    peakVel: null,
    lossPct: null,
    reps: [],
    angles: { hip: null, knee: null, torso: null },
    scaleCmPerPx: null,
    bodyPx: null,
    form: null,
  };
  if (!Array.isArray(frames) || frames.length < 10) return empty;

  const clean = frames.filter((frame) => Number.isFinite(frame.y));
  if (clean.length < 10) return empty;

  const times = clean.map((frame) => frame.t);
  const totalMs = times[times.length - 1] - times[0];
  if (totalMs <= 0) return empty;
  const fps = (clean.length - 1) / (totalMs / 1000);
  const window = Math.max(3, Math.min(9, Math.round(fps * 0.1) | 1));

  const raw = clean.map((frame) => frame.y);
  const ys = movingAverage(raw, window);

  // 用鼻尖到脚踝的竖直距离当身高像素，取 90 分位，避免下蹲时被低估
  const spans = clean
    .filter((frame) => Number.isFinite(frame.noseY) && Number.isFinite(frame.ankleY))
    .map((frame) => frame.ankleY - frame.noseY)
    .filter((span) => span > 0);
  const videoH = clean[clean.length - 1].videoH || 0;
  const bodyPx = spans.length ? percentile(spans, 0.9) : videoH * 0.8;
  const scaleCmPerPx = heightCm > 0 && bodyPx > 0 ? (heightCm * 0.94) / bodyPx : null;

  // 局部极值：y 大 = 杠铃低（向心起点），y 小 = 杠铃高；边界也参与，起手第一下不会被漏掉
  const candidates = [];
  const half = Math.max(2, Math.round(fps * 0.08));
  for (let i = 0; i < ys.length; i += 1) {
    let isBottom = true;
    let isTop = true;
    const lo = Math.max(0, i - half);
    const hi = Math.min(ys.length - 1, i + half);
    for (let j = lo; j <= hi; j += 1) {
      if (j === i) continue;
      if (ys[j] > ys[i]) isBottom = false;
      if (ys[j] < ys[i]) isTop = false;
    }
    if (isBottom) candidates.push({ i, type: 'bottom' });
    else if (isTop) candidates.push({ i, type: 'top' });
  }

  // 压掉同类相邻点，只留更极端的那个
  const extremes = [];
  for (const point of candidates) {
    const last = extremes[extremes.length - 1];
    if (last && last.type === point.type) {
      if (point.type === 'bottom' ? ys[point.i] > ys[last.i] : ys[point.i] < ys[last.i]) {
        extremes[extremes.length - 1] = point;
      }
      continue;
    }
    extremes.push(point);
  }

  const minAmpPx = scaleCmPerPx ? 5 / scaleCmPerPx : (videoH || 720) * 0.05;
  const minDurMs = 150;
  const reps = [];
  let lastTopTime = null;
  let firstVel = null;
  let lastVel = null;

  for (let k = 0; k < extremes.length - 1; k += 1) {
    const bottom = extremes[k];
    const top = extremes[k + 1];
    if (bottom.type !== 'bottom' || top.type !== 'top') continue;
    const ampPx = ys[bottom.i] - ys[top.i];
    const durMs = clean[top.i].t - clean[bottom.i].t;
    if (ampPx < minAmpPx || durMs < minDurMs) continue;

    let peakPx = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = bottom.i + 1; i <= top.i; i += 1) {
      const dt = (clean[i].t - clean[i - 1].t) / 1000;
      if (dt <= 0) continue;
      const v = (ys[i - 1] - ys[i]) / dt;
      if (v > peakPx) peakPx = v;
      if (Number.isFinite(clean[i].x)) {
        if (clean[i].x < minX) minX = clean[i].x;
        if (clean[i].x > maxX) maxX = clean[i].x;
      }
    }
    const driftPx = Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : null;

    const meanVel = scaleCmPerPx ? (ampPx * scaleCmPerPx) / 100 / (durMs / 1000) : null;
    const peakVel = scaleCmPerPx ? (peakPx * scaleCmPerPx) / 100 : null;
    const restSec = lastTopTime === null ? null : Math.max(0, Math.round((clean[bottom.i].t - lastTopTime) / 100) / 10);
    lastTopTime = clean[top.i].t;

    reps.push({
      index: reps.length + 1,
      meanVel: meanVel === null ? null : Math.round(meanVel * 100) / 100,
      peakVel: peakVel === null ? null : Math.round(peakVel * 100) / 100,
      ampCm: scaleCmPerPx ? Math.round(ampPx * scaleCmPerPx * 10) / 10 : null,
      driftCm: scaleCmPerPx && driftPx !== null ? Math.round(driftPx * scaleCmPerPx * 10) / 10 : null,
      durMs: Math.round(durMs),
      restSec,
      bottomMs: Math.round(clean[bottom.i].t - clean[0].t),
    });
    if (meanVel !== null) {
      if (firstVel === null) firstVel = meanVel;
      lastVel = meanVel;
    }
  }

  // 角度取每次向心底部的值，再取中位数
  const bottoms = reps.map((rep) => clean.find((frame) => Math.round(frame.t - clean[0].t) >= rep.bottomMs));
  const pick = (key) => {
    const values = bottoms
      .map((frame) => (frame ? frame[key] : null))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return Math.round(percentile(values, 0.5));
  };

  const measured = reps.filter((rep) => rep.meanVel !== null);
  const meanVel = measured.length
    ? measured.reduce((sum, rep) => sum + rep.meanVel, 0) / measured.length
    : null;
  const peakVel = measured.length ? Math.max(...measured.map((rep) => rep.peakVel ?? 0)) : null;
  const lossPct = firstVel && lastVel && measured.length >= 2
    ? (() => {
        const raw = ((firstVel - lastVel) / firstVel) * 100;
        // 平滑带来的零点几个百分点的抖动不算速度损失
        if (raw < 1) return 0;
        return Math.round(raw * 10) / 10;
      })()
    : null;

  // 姿态质量用的统计：左右不对称、躯干晃动、杠铃前后漂移、行程与锁定
  const numbers = (key) => clean.map((frame) => frame[key]).filter((value) => Number.isFinite(value));
  const kneeL = numbers('kneeL');
  const kneeR = numbers('kneeR');
  const asym = [];
  const framesWithBoth = clean.filter(
    (frame) => Number.isFinite(frame.kneeL) && Number.isFinite(frame.kneeR),
  );
  for (const frame of framesWithBoth) asym.push(Math.abs(frame.kneeL - frame.kneeR));
  const wristL = numbers('wristLY');
  const wristR = numbers('wristRY');
  const wristAsym = [];
  for (const frame of clean) {
    if (Number.isFinite(frame.wristLY) && Number.isFinite(frame.wristRY)) {
      wristAsym.push(Math.abs(frame.wristLY - frame.wristRY));
    }
  }
  const torsos = numbers('torso');
  const kneeAngles = numbers('knee');
  const hipAngles = numbers('hip');
  const drifts = reps.map((rep) => rep.driftCm).filter((value) => Number.isFinite(value));
  const amps = reps.map((rep) => rep.ampCm).filter((value) => Number.isFinite(value));
  const durations = reps.map((rep) => rep.durMs).filter((value) => Number.isFinite(value));
  const tempoAvgMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
  const driftMaxCm = drifts.length ? Math.max(...drifts) : null;
  const ampMaxCm = amps.length ? Math.max(...amps) : null;
  const ampAvgCm = amps.length ? Math.round((amps.reduce((sum, value) => sum + value, 0) / amps.length) * 10) / 10 : null;
  const driftPct = driftMaxCm !== null && ampMaxCm ? Math.round((driftMaxCm / ampMaxCm) * 1000) / 10 : null;
  const tempoCv = tempoAvgMs && durations.length >= 2
    ? Math.round((Math.sqrt(durations.reduce((sum, value) => sum + (value - tempoAvgMs) ** 2, 0) / durations.length) / tempoAvgMs) * 100) / 100
    : null;

  const form = {
    kneeAsymMax: asym.length ? Math.round(Math.max(...asym)) : null,
    wristAsymMaxCm: wristAsym.length && scaleCmPerPx
      ? Math.round(Math.max(...wristAsym) * scaleCmPerPx * 10) / 10
      : null,
    torsoRange: torsos.length >= 2 ? Math.round((Math.max(...torsos) - Math.min(...torsos)) * 10) / 10 : null,
    maxHip: hipAngles.length ? Math.round(Math.max(...hipAngles)) : null,
    driftMaxCm,
    driftPct,
    ampAvgCm,
    ampMaxCm,
    tempoAvgSec: tempoAvgMs ? Math.round((tempoAvgMs / 1000) * 10) / 10 : null,
    tempoCv,
    kneeL: kneeL.length ? Math.round(percentile(kneeL, 0.5)) : null,
    kneeR: kneeR.length ? Math.round(percentile(kneeR, 0.5)) : null,
    wristLY: wristL.length ? Math.round(percentile(wristL, 0.5)) : null,
    wristRY: wristR.length ? Math.round(percentile(wristR, 0.5)) : null,
  };

  // 最深膝角取全程 5 分位：比单帧最小值稳，面板和文字建议都读这一个数
  const kneeDepth = kneeAngles.length ? Math.round(percentile(kneeAngles, 0.05)) : null;

  return {
    repCount: reps.length,
    meanVel: meanVel === null ? null : Math.round(meanVel * 100) / 100,
    peakVel: peakVel === null ? null : Math.round(peakVel * 100) / 100,
    lossPct,
    reps,
    angles: { hip: pick('hip'), knee: kneeDepth, torso: pick('torso') },
    scaleCmPerPx: scaleCmPerPx ? Math.round(scaleCmPerPx * 1000) / 1000 : null,
    bodyPx: Math.round(bodyPx),
    form,
  };
}

/** 速度损失对应的建议；阈值允许按训练目标覆盖（力量 15/25，增肌 25/40） */
export function lossVerdict(lossPct, thresholds = VELOCITY_LOSS) {
  if (lossPct === null || lossPct === undefined) return '';
  if (lossPct >= thresholds.stop) return '速度损失偏大，建议结束这一组';
  if (lossPct >= thresholds.warn) return `速度损失已到收组提示线（${thresholds.warn}%–${thresholds.stop}%）`;
  return '速度保持得不错';
}
