const WISHES = [
    {
        key: 'shape',
        match: /穿衣|脱衣|有型|线条|轮廓|撑得起|衣服|显壮|倒三角|v.?字/i,
        headline: () => '穿衣有型：把背和肩练宽，同时把体脂收进一个区间',
        priorityAreas: ['背宽', '肩围', '胸上部'],
        weeks: 12,
        weeklyWeightRate: -0.004,
        bodyFatBand: (s) => (s === 'male' ? [13, 16] : [20, 24]),
        focusNote: '背和肩排在每次训练的前两位，胸肩的容量高于手臂'
    },
    {
        key: 'lean',
        match: /减脂|瘦|掉秤|肚|腰围|赘肉|清爽|轻一点/,
        headline: () => '减脂：体重每周降不超过 1%，同时把力量守住',
        priorityAreas: ['全身保持', '核心'],
        weeks: 12,
        weeklyWeightRate: -0.007,
        bodyFatBand: (s) => (s === 'male' ? [12, 15] : [19, 23]),
        focusNote: '主项重量不降，只降容量；有氧放在训练后而非单独一天'
    },
    {
        key: 'bulk',
        match: /增肌|变壮|大块|围度|长肉|重量上去|肥力/,
        headline: () => '增肌：体重每周涨 0.25–0.5%，力量同步往上走',
        priorityAreas: ['胸', '背', '腿'],
        weeks: 12,
        weeklyWeightRate: 0.0035,
        bodyFatBand: () => null,
        focusNote: '复合动作优先，辅助动作补弱项，容量逐周往上加'
    },
    {
        key: 'strength',
        match: /力量|深蹲|硬拉|卧推|推举|公斤数|pr|突破/i,
        headline: () => '力量：三个主项的次数区间往上爬，体重基本不动',
        priorityAreas: ['整体力量'],
        weeks: 10,
        weeklyWeightRate: 0.001,
        bodyFatBand: () => null,
        focusNote: '主项放在开练后第二组正式开始，组间休息拉满 3 分钟'
    },
    {
        key: 'glute_legs',
        match: /臀|腿|下肢|翘|大腿/,
        headline: () => '下肢优先：一周两次下肢刺激，髋主导动作放在最前',
        priorityAreas: ['臀', '腘绳', '股四头'],
        weeks: 12,
        weeklyWeightRate: 0.001,
        bodyFatBand: () => null,
        focusNote: '臀推与髋铰链的容量高于蹲类，小腿一周两次'
    },
    {
        key: 'chest',
        match: /胸|卧推|中缝|胸肌/,
        headline: () => '胸优先：一周两次胸，平板与上斜分开做',
        priorityAreas: ['胸', '三角前束'],
        weeks: 10,
        weeklyWeightRate: 0.002,
        bodyFatBand: () => null,
        focusNote: '推类总量大于拉类，但每次仍保留一组拉作为肩袖平衡'
    },
    {
        key: 'shoulders',
        match: /肩|三角|斜方|虎头肩/,
        headline: () => '肩优先：中束一周三次小容量，推举做重量',
        priorityAreas: ['三角中束', '三角后束'],
        weeks: 10,
        weeklyWeightRate: 0.001,
        bodyFatBand: () => null,
        focusNote: '侧平举放在推类动作之前，避免被三头先耗尽拖住'
    },
    {
        key: 'endurance',
        match: /耐力|跑步|心肺|马拉松|喘|体能|气/,
        headline: () => '体能：有氧两周合计 100 分钟以上，力量保持 3 次',
        priorityAreas: ['心肺', '核心'],
        weeks: 12,
        weeklyWeightRate: 0,
        bodyFatBand: (s) => (s === 'male' ? [13, 17] : [20, 25]),
        focusNote: '有氧安排在力量训练之后或单独的日期，不挤掉主项'
    },
    {
        key: 'health',
        match: /健康|精神|精力|习惯|动起来|posture|姿势|久坐|腰背舒服/i,
        headline: () => '健康基线：按你选的星期几天数，每次按表做完就算达标',
        priorityAreas: ['全身', '活动度'],
        weeks: 8,
        weeklyWeightRate: 0,
        bodyFatBand: () => null,
        focusNote: '重量停在 RPE 6–7，动作质量与关节活动度优先'
    }
];
const STRENGTH_REFERENCE = {
    male: { squat: 1.0, bench: 0.75, deadlift: 1.25, overhead: 0.5 },
    female: { squat: 0.65, bench: 0.4, deadlift: 0.8, overhead: 0.3 }
};
/** 性别是选填：不猜是哪一边，取两者的中间系数，并在参照里写明 */
const NEUTRAL_REFERENCE = { squat: 0.8, bench: 0.55, deadlift: 1.0, overhead: 0.4 };
export function wishToGoal(p) {
    const sex = p.sex;
    const wish = p.goalWish;
    const hits = WISHES.map((w) => ({ w, at: wish.search(w.match) }))
        .filter((x) => x.at >= 0)
        .sort((a, b) => a.at - b.at)
        .map((x) => x.w);
    const primary = hits[0];
    const GENERIC_AREA = /^(全身|整体力量|活动度|心肺|核心保持)/;
    const extraAreas = hits
        .slice(1)
        .map((w) => w.priorityAreas[0])
        .filter((a) => a && !GENERIC_AREA.test(a) && !(primary?.priorityAreas ?? []).includes(a));
    const picked = primary ?? {
        key: 'unknown',
        match: /.*/,
        headline: () => '目标不明确：先按「规律训练 8 周，动作重量稳步上升」执行',
        priorityAreas: ['全身'],
        weeks: 8,
        weeklyWeightRate: 0,
        bodyFatBand: () => null,
        focusNote: '一周内每个大肌群至少被练到两次，先把连续性建立起来'
    };
    const band = sex ? picked.bodyFatBand(sex) : null;
    const weeks = picked.weeks;
    const weightNow = p.weightKg;
    const hasWeight = typeof weightNow === 'number' && weightNow > 0;
    const ref = sex ? STRENGTH_REFERENCE[sex] : NEUTRAL_REFERENCE;
    const targetAt = (mul, reps) => hasWeight ? `${roundKg(weightNow * mul)} kg × ${reps}` : `体重的 ${mul} 倍 × ${reps}（填了体重才算出公斤数）`;
    const strengthTargets = [
        {
            lift: '杠铃后蹲 5 次',
            target: targetAt(ref.squat, 5),
            basis: sex ? '12 周后的参考线，达不到不算失败' : '性别没填，系数按男女中间值给'
        },
        {
            lift: '杠铃卧推 5 次',
            target: targetAt(ref.bench, 5),
            basis: '同上，取整到 2.5kg'
        },
        {
            lift: '硬拉 5 次',
            target: targetAt(ref.deadlift, 5),
            basis: '同上'
        },
        { lift: '站姿推举 8 次', target: targetAt(ref.overhead, 8), basis: '同上' }
    ];
    const checks = [];
    if (picked.weeklyWeightRate !== 0 && hasWeight) {
        const goalWeight = round1(weightNow * (1 + picked.weeklyWeightRate * weeks));
        checks.push(`${weeks} 周后的平均体重参考值约 ${goalWeight} kg（当前 ${weightNow} kg，按每周 ${(picked.weeklyWeightRate * 100).toFixed(1)}% 推算），落点区间 ${weightBand(picked.weeklyWeightRate, weightNow, weeks).join('–')} kg`);
        checks.push(`每周固定同一天同条件称重（起床排尿后、早饭前），取 7 天平均值而不是单天`);
        checks.push(picked.weeklyWeightRate < 0
            ? `平均体重每周下降 0.5–1% 为正常节奏，超过 1% 就把热量往回加一点`
            : `平均体重每周上涨 0.25–0.5% 为正常节奏，超过就减少盈余`);
    }
    else if (picked.weeklyWeightRate !== 0) {
        checks.push(`方向是每周${picked.weeklyWeightRate < 0 ? '降' : '涨'}不超过 ${Math.abs(picked.weeklyWeightRate * 100).toFixed(1)}%，但体重没填，具体公斤数等你在档案里补上体重`);
    }
    else {
        checks.push('每周固定条件称重一次，只看 7 天平均，目标区间是保持稳定而不是明显涨跌');
    }
    checks.push(`主项重量：连续两次训练都能在目标次数内完成且 RPE ≤ 8，下次加 2.5%`);
    checks.push(`围度：每 4 周同一位置测量一次（肩围最宽处、上臂收缩处、大腿最粗处），记录而不是评判`);
    if (band)
        checks.push(`体脂估计每 4 周记一次，方向是进入 ${band[0]}–${band[1]}% 区间`);
    if (hits.some((h) => h.key === 'shape'))
        checks.push('穿衣对比：第 1 周和第 8 周同一件衬衫同一光线拍照，自己看差别');
    if (hits.some((h) => h.key === 'endurance'))
        checks.push('每 4 周记录一次同一配速下的心率，下降说明有氧在起效');
    const priorityAreas = [...picked.priorityAreas, ...extraAreas].slice(0, 4);
    const headline = extraAreas.length
        ? `${picked.headline()}；你自己还提到${extraAreas.join('、')}，容量排在它后面`
        : picked.headline();
    return {
        source: 'rule',
        kindKey: picked.key,
        headline,
        priorityAreas,
        bodyFatBand: band,
        weeks,
        strengthTargets,
        weeklyTargets: [
            p.weekdays?.length
                ? `练 ${p.weekdays.length} 天（${p.weekdays.map(weekdayName).join('、')}）`
                : '训练日没问过你，先按周一到周四四天排',
            p.sessionMinutes != null ? `每次 ${p.sessionMinutes} 分钟内完成` : '每次能练多久不固定，开练前告诉我要几分钟，我按那个时长排',
            picked.focusNote
        ],
        checks: [...checks, `完成度：一周里按时间表做完预定组数的天数 ÷ 应练天数，低于 70% 连续两周就要减量`]
    };
}
export function weekdayName(d) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d] ?? '?';
}
function round1(v) {
    return Math.round(v * 10) / 10;
}
/** 各类目标自带的每周体重变化预期；goal 对象里没留这个字段，按 key 回查 */
export function weeklyRateFor(kindKey) {
    return WISHES.find((w) => w.key === kindKey)?.weeklyWeightRate ?? 0;
}
/** 目标体重只作为区间提示，不给单点死值 */
export function weightBand(rate, now, weeks) {
    const mid = now * (1 + rate * weeks);
    return [round1(mid - 0.7), round1(mid + 0.7)];
}
export function roundKg(v) {
    return Math.round(v / 2.5) * 2.5;
}
