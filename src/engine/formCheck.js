// 动作质量检查：把测速过程中采集到的角度/轨迹统计翻译成具体、可执行的调整量。
// 单目摄像头只能看到二维投影，结论按「参考」处理，不作为医学或教练级判断。
// 每条建议都带 basis（指标 / 实测值 / 目标 / 原因 / 机位 / 证据），界面直接展示这份依据，不请求外部内容。
import { EVIDENCE_LEVELS, FORM_EVIDENCE, LIMITS, SOURCES, velocityLossFor } from './formEvidence.js';

const FAMILY = {
  squat: 'squat',
  lunge: 'squat',
  hinge: 'hinge',
  hipThrust: 'hinge',
  horizontalPush: 'push',
  verticalPush: 'push',
  horizontalPull: 'pull',
  verticalPull: 'pull',
};

// 同一个指标在五类动作里用同一份依据，按指标名归口，避免每条建议重复传证据键
const EVIDENCE_BY_METRIC = {
  最深膝角: 'squatDepth',
  底部躯干前倾: 'trunkLean',
  躯干摆动幅度: 'trunkSwing',
  最大髋角: 'hipLockout',
  水平漂移: 'barDrift',
  左右手腕高度差: 'wristAsymmetry',
  左右膝角差: 'kneeAsymmetry',
  单次用时: 'tempo',
  每次用时波动: 'tempoVariance',
};

function ruleBasis(metric, observed, target, why, camera = '侧面机位', evidenceKey = null) {
  const key = evidenceKey ?? EVIDENCE_BY_METRIC[metric] ?? 'trunkSwing';
  const evidence = FORM_EVIDENCE[key] ?? FORM_EVIDENCE.trunkSwing;
  return {
    metric,
    observed,
    target,
    why,
    camera,
    evidence: {
      level: evidence.level,
      label: EVIDENCE_LEVELS[evidence.level],
      sources: evidence.sources.map((id) => SOURCES[id]).filter(Boolean),
    },
  };
}

function item(tone, title, detail, basis = null) {
  return { tone, title, detail, basis };
}

function round(value) {
  return value === null || value === undefined ? null : Math.round(value);
}

/** 只看数值够不够用，避免机位不对时硬给结论 */
function has(analysis) {
  const form = analysis?.form;
  return Boolean(form) && (analysis?.repCount ?? 0) > 0;
}

function lossItems(analysis, goalKey) {
  const measured = (analysis.reps ?? []).filter((rep) => rep.meanVel !== null);
  if (analysis.lossPct === null || analysis.lossPct === undefined || measured.length < 2) return [];
  const first = measured[0].meanVel;
  const last = measured[measured.length - 1].meanVel;
  const rate = velocityLossFor(goalKey);
  const why = rate.label === '增肌'
    ? '增肌目标：约 25% 速度损失接近有效容量的收益边界，40% 以上继续做动作容易变形；依据见 Hickmott 2022 与 Jukic 2023。'
    : '力量目标：约 15% 速度损失提示接近力竭，25% 以上继续做会明显拖慢恢复；依据见 Hickmott 2022 与 Pareja-Blanco 2017。';
  if (analysis.lossPct >= rate.stop) {
    return [
      item(
        'bad',
        '这组可以收了',
        `速度已掉 ${analysis.lossPct}%（${first} → ${last} m/s）。下次同重量先保证首组 ≥${first} m/s，掉 ${rate.warn}% 就停`,
        ruleBasis('速度损失', `${analysis.lossPct}%`, `≥${rate.stop}% 建议结束`, why, '任意机位（全身入镜）', rate.evidenceKey),
      ),
    ];
  }
  if (analysis.lossPct >= rate.warn) {
    return [
      item(
        'warn',
        '再做 1–2 次就收',
        `速度已掉 ${analysis.lossPct}%（${first} → ${last} m/s），再练下去动作容易变形`,
        ruleBasis('速度损失', `${analysis.lossPct}%`, `≥${rate.warn}% 提示收组`, why, '任意机位（全身入镜）', rate.evidenceKey),
      ),
    ];
  }
  return [];
}

function tempoItem(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const why = '经验口径：向心快过 0.5s 多是借力，慢过 3.5s 容易憋气；推荐区间 1–2s。';
  if (seconds < 0.5) {
    return item(
      'warn',
      `把向心放慢约 ${(1 - seconds).toFixed(1)}s`,
      `现在每次 ${seconds}s，目标 1s 左右，先把动作做满再提速`,
      ruleBasis('单次用时', `${seconds}s`, '0.5–3.5s（目标 1–2s）', why, '任意机位（全身入镜）'),
    );
  }
  if (seconds > 3.5) {
    return item(
      'warn',
      `每次再加快约 ${(seconds - 2).toFixed(1)}s`,
      `现在每次 ${seconds}s，目标 2s 左右，别长时间憋气`,
      ruleBasis('单次用时', `${seconds}s`, '0.5–3.5s（目标 1–2s）', why, '任意机位（全身入镜）'),
    );
  }
  return item('good', '节奏合适', `平均每次 ${seconds}s，接近推荐区间`);
}

export function checkForm(exercise, analysis, goal) {
  if (!has(analysis)) return null;
  const form = analysis.form;
  const family = FAMILY[exercise?.pattern] ?? 'general';
  const items = [...lossItems(analysis, goal?.kindKey)];

  if (family === 'squat') {
    const depth = analysis.angles?.knee;
    if (Number.isFinite(depth)) {
      const knee = round(depth);
      const gap = Math.max(1, knee - LIMITS.kneeTarget);
      const depthWhy = '平行蹲对应膝屈曲约 90–110°（换算成本应用的膝角约 70–90°）；膝角大于 90° 基本是半蹲。深蹲本身没有证据表明更伤膝，但负重应随深度调整。';
      if (knee <= LIMITS.kneeTarget) {
        items.push(item('good', '蹲得够深', `最深膝角 ${knee}°，已经到位`));
      } else if (knee <= LIMITS.kneeWarn) {
        items.push(
          item(
            'warn',
            `膝盖再往下压约 ${gap}°`,
            `最深膝角 ${knee}°，目标 ≤${LIMITS.kneeTarget}°`,
            ruleBasis(
              '最深膝角',
              `${knee}°`,
              `≤${LIMITS.kneeTarget}°`,
              depthWhy,
              '侧面机位（正面会低估膝角）',
            ),
          ),
        );
      } else {
        items.push(
          item(
            'bad',
            `膝盖还差约 ${gap}° 才蹲到位`,
            `最深膝角 ${knee}°。先把重量退到能蹲深的档，目标 ≤${LIMITS.kneeTarget}°`,
            ruleBasis(
              '最深膝角',
              `${knee}°`,
              `≤${LIMITS.kneeTarget}°`,
              depthWhy,
              '侧面机位（正面会低估膝角）',
            ),
          ),
        );
      }
    }
    const lean = analysis.angles?.torso;
    if (Number.isFinite(lean)) {
      const gap = Math.max(1, Math.round(lean - LIMITS.leanTarget));
      const basis = ruleBasis(
        '底部躯干前倾',
        `${Math.round(lean)}°`,
        `≤${LIMITS.leanTarget}°`,
        '生物力学综述只说明躯干角度会重新分配髋/膝力矩，没有统一安全角度；45° 是本应用结合深蹲教学给的提示线，受站距、杠位和腿长影响。',
        '侧面机位',
      );
      if (lean > LIMITS.leanBad) {
        items.push(
          item('bad', `降一点重量，胸口再抬约 ${gap}°`, `底部躯干 ${Math.round(lean)}°，目标 ≤${LIMITS.leanTarget}°，否则起身容易变成腰先发力`, basis),
        );
      } else if (lean > LIMITS.leanWarn) {
        items.push(item('warn', `起身时胸口再抬约 ${gap}°`, `底部躯干 ${Math.round(lean)}°，目标 ≤${LIMITS.leanTarget}°`, basis));
      }
    }
    if (Number.isFinite(form.torsoRange) && form.torsoRange > LIMITS.swingWarn) {
      items.push(
        item(
          'warn',
          `起身时把躯干摆动收小约 ${Math.round(form.torsoRange - LIMITS.swingTarget)}°`,
          `躯干角度变化 ${form.torsoRange}°，目标 ≤${LIMITS.swingTarget}°，核心先绷住再起`,
          ruleBasis(
            '躯干摆动幅度',
            `${form.torsoRange}°`,
            `≤${LIMITS.swingTarget}°`,
            '经验阈值：深蹲全程躯干角度变化控制在 15° 内，核心更容易稳住、起身更可重复。',
            '侧面机位',
          ),
        ),
      );
    }
  }

  if (family === 'hinge') {
    if (Number.isFinite(form.maxHip) && form.maxHip < LIMITS.hipTarget) {
      const hip = round(form.maxHip);
      const gap = Math.max(1, LIMITS.hipTarget - hip);
      items.push(
        item(
          hip < LIMITS.hipBad ? 'bad' : 'warn',
          `站直时髋再伸约 ${gap}°`,
          `最大髋角 ${hip}°，目标 ≥${LIMITS.hipTarget}°${hip < LIMITS.hipBad ? '；必要时先降重量把伸髋做完整' : ''}`,
          ruleBasis(
            '最大髋角',
            `${hip}°`,
            `≥${LIMITS.hipTarget}°`,
            '应用经验阈值：站直时髋应接近完全伸展；不足 168° 说明伸髋没做完整，常见于重量偏大或收尾太早。',
            '侧面机位',
          ),
        ),
      );
    }
    if (Number.isFinite(form.torsoRange) && form.torsoRange > LIMITS.generalTorsoWarn) {
      items.push(
        item(
          'warn',
          `起身时把躯干角度变化收小约 ${Math.round(form.torsoRange - LIMITS.swingTarget)}°`,
          `躯干角度变化 ${form.torsoRange}°，目标 ≤${LIMITS.swingTarget}°：先伸膝再伸髋，别先抬臀弓背`,
          ruleBasis(
            '躯干摆动幅度',
            `${form.torsoRange}°`,
            `≤${LIMITS.swingTarget}°`,
            '经验阈值：硬拉起身应先伸膝再伸髋，躯干角度变化控制在 15° 内。',
            '侧面机位',
          ),
        ),
      );
    }
    if (Number.isFinite(form.driftMaxCm) && Number.isFinite(form.driftPct) && form.driftPct > LIMITS.hingeDrift) {
      const targetCm = (form.ampAvgCm ?? 0) * (LIMITS.hingeDrift / 100);
      const back = Math.max(1, Math.round(form.driftMaxCm - targetCm));
      items.push(
        item(
          'warn',
          `杠铃往回带约 ${back}cm`,
          `水平漂移 ${form.driftMaxCm}cm（行程约 ${form.ampAvgCm}cm，占 ${form.driftPct}%），目标 ≤${LIMITS.hingeDrift}%，让杠铃贴着小腿和大腿走`,
          ruleBasis(
            '水平漂移',
            `${form.driftMaxCm}cm（占行程 ${form.driftPct}%）`,
            `≤${LIMITS.hingeDrift}% 行程`,
            '应用经验阈值：杠铃水平漂移不超过行程 15%，否则力线前后跑，腰的负担会变大。',
            '侧面机位',
          ),
        ),
      );
    }
  }

  if (family === 'push') {
    if (Number.isFinite(form.wristAsymMaxCm) && form.wristAsymMaxCm > LIMITS.wristAsym) {
      items.push(
        item(
          'warn',
          `低的那侧手腕再抬高约 ${Math.round(form.wristAsymMaxCm - LIMITS.wristTarget)}cm`,
          `左右高度差 ${form.wristAsymMaxCm}cm（需正面或斜前机位），目标 ≤${LIMITS.wristTarget}cm，先把重量降一点让两侧同步`,
          ruleBasis(
            '左右手腕高度差',
            `${form.wristAsymMaxCm}cm`,
            `≤${LIMITS.wristTarget}cm`,
            '经验阈值：两侧手腕高度差控制在 3cm 内，说明两侧同步发力；超过 7cm 通常一侧在代偿。',
            '正面或斜前机位',
          ),
        ),
      );
    }
    if (Number.isFinite(form.torsoRange) && form.torsoRange > LIMITS.pushTorsoWarn) {
      items.push(
        item(
          'warn',
          `推起时把后仰收小约 ${Math.round(form.torsoRange - LIMITS.pushTorsoTarget)}°`,
          `躯干角度变化 ${form.torsoRange}°，目标 ≤${LIMITS.pushTorsoTarget}°，收紧核心别用后仰借力`,
          ruleBasis(
            '躯干后仰幅度',
            `${form.torsoRange}°`,
            `≤${LIMITS.pushTorsoTarget}°`,
            '经验阈值：推起时躯干后仰变化控制在 10° 内，超过 12° 基本是在用后仰借力。',
            '侧面机位',
          ),
        ),
      );
    }
    if (Number.isFinite(form.driftMaxCm) && Number.isFinite(form.driftPct) && form.driftPct > LIMITS.pushDrift) {
      const targetCm = (form.ampAvgCm ?? 0) * (LIMITS.pushDrift / 100);
      const back = Math.max(1, Math.round(form.driftMaxCm - targetCm));
      items.push(
        item(
          'warn',
          `杠铃往回带约 ${back}cm`,
          `水平漂移 ${form.driftMaxCm}cm（占行程 ${form.driftPct}%），目标 ≤${LIMITS.pushDrift}%，保持同一推起轨迹`,
          ruleBasis(
            '水平漂移',
            `${form.driftMaxCm}cm（占行程 ${form.driftPct}%）`,
            `≤${LIMITS.pushDrift}% 行程`,
            '应用经验阈值：推举轨迹前后漂移不超过行程 18%，轨迹越稳定越省力。',
            '侧面机位',
          ),
        ),
      );
    }
  }

  if (family === 'pull') {
    if (Number.isFinite(form.torsoRange) && form.torsoRange > LIMITS.swingWarn) {
      items.push(
        item(
          'warn',
          `把身体摆动收小约 ${Math.round(form.torsoRange - LIMITS.swingTarget)}°`,
          `躯干角度变化 ${form.torsoRange}°，目标 ≤${LIMITS.swingTarget}°，离心阶段控制住，别靠摆动借力`,
          ruleBasis(
            '躯干摆动幅度',
            `${form.torsoRange}°`,
            `≤${LIMITS.swingTarget}°`,
            '经验阈值：拉的全程躯干摆动控制在 15° 内，离心阶段才练得到目标肌群。',
            '侧面机位',
          ),
        ),
      );
    }
    if (Number.isFinite(form.wristAsymMaxCm) && form.wristAsymMaxCm > LIMITS.wristAsym) {
      items.push(
        item(
          'warn',
          `低的那侧多拉约 ${Math.round(form.wristAsymMaxCm - LIMITS.wristTarget)}cm`,
          `左右手腕高度差 ${form.wristAsymMaxCm}cm，目标 ≤${LIMITS.wristTarget}cm，想象两侧同时往下拉`,
          ruleBasis(
            '左右手腕高度差',
            `${form.wristAsymMaxCm}cm`,
            `≤${LIMITS.wristTarget}cm`,
            '经验阈值：两侧手腕高度差控制在 3cm 内，说明两侧同步发力；超过 7cm 通常一侧在代偿。',
            '正面或斜前机位',
          ),
        ),
      );
    }
  }

  if (family === 'general') {
    if (Number.isFinite(form.torsoRange) && form.torsoRange > LIMITS.generalTorsoWarn) {
      items.push(
        item(
          'warn',
          `把身体晃动收小约 ${Math.round(form.torsoRange - LIMITS.generalTorsoTarget)}°`,
          `躯干角度变化 ${form.torsoRange}°，目标 ≤${LIMITS.generalTorsoTarget}°，固定住躯干再发力`,
          ruleBasis(
            '躯干摆动幅度',
            `${form.torsoRange}°`,
            `≤${LIMITS.generalTorsoTarget}°`,
            '经验阈值：没有明确动作族时，先把躯干晃动控制在 20° 内，动作更容易重复。',
            '侧面机位',
          ),
        ),
      );
    }
    if (Number.isFinite(form.tempoCv) && form.tempoCv > LIMITS.tempoCv) {
      items.push(
        item(
          'warn',
          `把每次用时稳定在 ${form.tempoAvgSec}s 附近`,
          `现在每次相差 ${Math.round(form.tempoCv * 100)}%，忽快忽慢会让次数和重量都不好判断`,
          ruleBasis(
            '每次用时波动',
            `${Math.round(form.tempoCv * 100)}%`,
            `≤${Math.round(LIMITS.tempoCv * 100)}%`,
            '经验口径：同一组里每次用时的波动控制在 35% 内，次数和重量才方便比较。',
            '任意机位（全身入镜）',
          ),
        ),
      );
    }
  }

  // 左右不对称只在正面/斜前机位有意义，侧拍时不做结论
  if (family !== 'push' && Number.isFinite(form.kneeAsymMax) && form.kneeAsymMax > LIMITS.kneeAsymWarn) {
    items.push(
      item(
        'warn',
        `弱侧腿再屈膝约 ${Math.round(form.kneeAsymMax - LIMITS.kneeAsymTarget)}°（或降一点重量）`,
        `左右膝角最大差 ${form.kneeAsymMax}°（需正面机位），目标 ≤${LIMITS.kneeAsymTarget}°；也可以加单侧练习补齐`,
        ruleBasis(
          '左右膝角差',
          `${form.kneeAsymMax}°`,
          `≤${LIMITS.kneeAsymTarget}°`,
          '经验阈值：两侧膝角差控制在 10° 内；这个指标只有在正面或斜前机位下才有意义。',
          '正面或斜前机位',
        ),
      ),
    );
  }

  const tempo = tempoItem(form.tempoAvgSec);
  if (tempo) items.push(tempo);

  if (!items.length) {
    items.push(item('good', '没有发现明显问题', '保持当前动作与节奏'));
  }

  // 需要改的放前面，正面的放最后，看完一眼就知道先调什么
  const order = { bad: 0, warn: 1, good: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone]);

  // 灯色只看需要调整的条目：全绿 = 绿灯，有提醒 = 黄灯，有严重问题 = 红灯
  const status = items.some((entry) => entry.tone === 'bad')
    ? 'red'
    : items.some((entry) => entry.tone === 'warn')
      ? 'yellow'
      : 'green';

  return { items, status, pattern: exercise?.pattern ?? 'general', family };
}
