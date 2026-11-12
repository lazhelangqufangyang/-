const food = (name, k, p, c, f, step, stepName) => ({
    name,
    k,
    p,
    c,
    f,
    step,
    stepName
});
const EGG = food('鸡蛋', 143, 12.6, 0.7, 9.5, 50, '个');
const MILK = food('纯牛奶', 65, 3.3, 4.8, 3.6, 250, '盒');
const VEG = food('蔬菜（炒好含油）', 60, 1.5, 6, 3, 250, '份');
const TOFU = food('豆腐', 100, 12, 2, 4.8, 150, '份');
const FRUIT = food('水果', 45, 0.6, 10, 0.3, 200, '个');
const NUTS = food('坚果', 640, 22, 17, 56, 25, '把');
const RICE = food('米饭（熟）', 116, 2.6, 25.9, 0.2, 150, '小碗');
const OATS = food('燕麦片（干）', 380, 13, 61, 6.7, 40, '碗');
const NOODLE = food('面条（干）', 350, 12, 73, 1.5, 90, '团');
const BREAD = food('全麦面包', 246, 10, 45, 3.5, 40, '片');
const BUN = food('馒头', 223, 7, 47, 1.1, 100, '个');
const POTATO = food('红薯', 90, 1.4, 20, 0.2, 250, '个');
const CHICKEN = food('鸡胸肉（熟）', 165, 31, 0, 4, 120, '块');
const FISH = food('鱼或虾（熟）', 130, 24, 0, 3.5, 150, '份');
const BEEF = food('瘦牛肉（熟）', 190, 28, 0, 8.5, 100, '份');
/** 不动主食就一直吃的那几样：蛋、奶、豆制品、菜、果、坚果 */
const PLATE = [
    { slot: 'breakfast', food: EGG, grams: 100 },
    { slot: 'breakfast', food: MILK, grams: 250 },
    { slot: 'lunch', food: VEG, grams: 250 },
    { slot: 'dinner', food: VEG, grams: 250 },
    { slot: 'dinner', food: TOFU, grams: 150 },
    { slot: 'snack', food: MILK, grams: 250 },
    { slot: 'snack', food: FRUIT, grams: 200 },
    { slot: 'snack', food: NUTS, grams: 15 }
];
const SPECS = [
    {
        key: 'rice',
        title: '米饭',
        staples: [
            { slot: 'breakfast', food: OATS, share: 0.2 },
            { slot: 'lunch', food: RICE, share: 0.45 },
            { slot: 'dinner', food: RICE, share: 0.35 }
        ],
        protein: CHICKEN
    },
    {
        key: 'noodle',
        title: '面条',
        staples: [
            { slot: 'breakfast', food: BREAD, share: 0.2 },
            { slot: 'lunch', food: NOODLE, share: 0.4 },
            { slot: 'dinner', food: NOODLE, share: 0.4 }
        ],
        protein: FISH
    },
    {
        key: 'bun',
        title: '馒头 + 红薯',
        staples: [
            { slot: 'breakfast', food: BUN, share: 0.3 },
            { slot: 'lunch', food: BUN, share: 0.4 },
            { slot: 'dinner', food: POTATO, share: 0.3 }
        ],
        protein: BEEF
    }
];
export const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
function roundGrams(g) {
    if (g >= 600)
        return Math.round(g / 50) * 50;
    if (g >= 200)
        return Math.round(g / 25) * 25;
    return Math.round(g / 5) * 5;
}
function to1(v) {
    return Math.round(v * 10) / 10;
}
function scaleOf(f, grams) {
    if (!f.step || !f.stepName)
        return '';
    const n = grams / f.step;
    if (n < 0.4)
        return '';
    return `≈${n >= 10 ? Math.round(n) : to1(n)} ${f.stepName}`;
}
function mkItem(slot, f, grams) {
    return {
        slot,
        name: f.name,
        grams,
        kcal: Math.round((f.k * grams) / 100),
        protein: to1((f.p * grams) / 100),
        carbs: to1((f.c * grams) / 100),
        fat: to1((f.f * grams) / 100),
        scale: scaleOf(f, grams)
    };
}
/**
 * 先扣掉蛋奶豆蔬果坚果这份固定盘子，剩下的热量在「主食篮子」和肉 / 鱼 / 虾之间解一次：
 * 两条约束是一条热量等式、一条蛋白等式，主食按热量加权折算每 kcal 带多少蛋白。
 * 克数是这么来的，不是查来的。
 */
function build(spec, kcalTarget, proteinTarget) {
    const plate = PLATE.map((row) => mkItem(row.slot, row.food, row.grams));
    const plateKcal = plate.reduce((n, it) => n + it.kcal, 0);
    const plateProtein = plate.reduce((n, it) => n + it.protein, 0);
    const budget = Math.max(0, kcalTarget - plateKcal);
    const blendK = spec.staples.reduce((n, s) => n + s.share * s.food.k, 0);
    const blendP = spec.staples.reduce((n, s) => n + s.share * s.food.p, 0);
    const meatPerKcal = spec.protein.p / spec.protein.k;
    const need = proteinTarget - plateProtein;
    let stapleKcal = budget;
    if (need > 0) {
        stapleKcal = Math.min(budget, Math.max(0, (need - meatPerKcal * budget) / (blendP / blendK - meatPerKcal)));
    }
    const items = [];
    // 肉 / 鱼 / 虾至少给到一掌心，否则解出来的量会薄到不像一份菜；但也不超过解出来的两倍，免得蛋白冲过区间
    const solvedMeat = need > 0 ? ((budget - stapleKcal) * 100) / spec.protein.k : 0;
    const meatFloor = need > 0 ? Math.min(80, solvedMeat * 2) : 0;
    const meatGrams = roundGrams(Math.min(350, Math.max(meatFloor, solvedMeat)));
    if (meatGrams >= 25) {
        items.push(mkItem('lunch', spec.protein, roundGrams(meatGrams * 0.55)));
        items.push(mkItem('dinner', spec.protein, roundGrams(meatGrams * 0.45)));
    }
    const meatKcal = items.filter((it) => it.name === spec.protein.name).reduce((n, it) => n + it.kcal, 0);
    stapleKcal = Math.max(0, budget - meatKcal);
    for (const s of spec.staples) {
        const grams = roundGrams((stapleKcal * s.share * 100) / s.food.k);
        if (!grams)
            continue;
        items.push(mkItem(s.slot, s.food, grams));
    }
    items.push(...plate);
    items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    return {
        key: spec.key,
        title: spec.title,
        items,
        kcal: items.reduce((n, it) => n + it.kcal, 0),
        protein: to1(items.reduce((n, it) => n + it.protein, 0)),
        carbs: to1(items.reduce((n, it) => n + it.carbs, 0)),
        fat: to1(items.reduce((n, it) => n + it.fat, 0))
    };
}
export function mealPlans(t) {
    if (t.target === null || !t.protein)
        return [];
    const kcalTarget = t.target;
    const proteinTarget = Math.round((t.protein[0] + t.protein[1]) / 2);
    return SPECS.map((spec) => build(spec, kcalTarget, proteinTarget));
}
