function round5(v) {
    return Math.round(v / 5) * 5;
}
/**
 * 档案里没有睡眠和饮食数据时也要把建议给出去，所以这里只用性别、身高、体重、年龄，
 * 缺项就直说算不出来，不编一个数字冒充估算结果。
 */
export function baselineAdvice(p) {
    const sex = p.sex;
    const weight = p.weightKg;
    const height = p.heightCm;
    const age = p.age;
    const floor = sex === 'female' ? 1600 : 2000;
    const sleep = [
        '训练日按 7 小时以上安排，一周里最少有四天睡到 7 小时；这不是意志问题，恢复不到就是下一天主项重量要降',
        '起床时间固定在 ±1 小时内，比早睡更容易做到；周末补觉不超过 2 小时',
        '开练前 30 分钟内别空腹硬撑：一根香蕉、一片面包这类就行，练完两小时内吃上有蛋白质的那一餐',
        '生成当天分钟表时我会问你昨晚睡了几小时，睡不够 6 小时那天自动降主项重量并标成「保容量不冲 PR」'
    ];
    if (sex === null || weight == null || height == null || age == null) {
        return {
            sleep,
            diet: [
                '每餐都有一个掌心大小的蛋白质来源（肉、蛋、鱼、豆制品、奶），一天三到四次',
                '主食不用戒，练得多就多吃，练得少就少吃半碗',
                '现在身体数据不全，热量参考值先不算；把年龄、身高、体重补上我就能给你区间'
            ],
            tdee: null,
            protein: null,
            floor
        };
    }
    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
    const low = round5(bmr * 1.3);
    const high = round5(bmr * 1.55);
    const diet = [
        `每天的热量参考区间 ${low}–${high} kcal（Mifflin-St Jeor 推出的基础代谢 ${round5(bmr)} kcal 乘以日常活动倍数，这个估算本身有 ±10–15% 的误差，所以是区间不是指标）`,
        `蛋白质按体重算：每天 ${Math.round(weight * 1.2)}–${Math.round(weight * 1.6)} g（每公斤 1.2–1.6 g），分到三餐里，不用一顿补满`,
        `底线：不论什么目标，女性不低于 1600 kcal/天、男性不低于 2000 kcal/天。低于这个数身体会先掉肌肉和状态，接着是暴食回弹`,
        '如果目标是减脂：从上面的区间往下减，一周最多让体重掉当前体重的 1%（例如 70kg 掉 0.7kg），掉得更快说明吃少了或秤抖了，往回加一点',
        '如果目标是增肌：一周最多让体重涨 0.5%，多出来的是脂肪不是肌肉',
        '看一周平均，不看你某一天吃了什么。某一天多吃了不叫破戒，第二天按平常吃就行'
    ];
    return { sleep, diet, tdee: { bmr: round5(bmr), range: [low, high] }, protein: [Math.round(weight * 1.2), Math.round(weight * 1.6)], floor };
}
