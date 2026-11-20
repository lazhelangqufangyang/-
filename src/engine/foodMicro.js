/**
 * 常见食物的微量元素粗值（每「一份」按食物表里的份量）。
 * 来源：参考项目的同一份食物表（43/65 种有值）；
 * 只用于给出「今天吃没吃够」的参考带，不是营养测算，也不是处方。
 */
export const MICRO_NUTRIENTS = [
    { key: 'fiberG', label: '膳食纤维', unit: 'g', target: 25, digits: 1 },
    { key: 'calciumMg', label: '钙', unit: 'mg', target: 800, digits: 0 },
    { key: 'ironMg', label: '铁', unit: 'mg', target: 12, digits: 1, femaleTarget: 18 },
    { key: 'potassiumMg', label: '钾', unit: 'mg', target: 2000, digits: 0 },
    { key: 'vitaminDMcg', label: '维生素 D', unit: 'µg', target: 10, digits: 1 },
    { key: 'vitaminB12Mcg', label: '维生素 B12', unit: 'µg', target: 2.4, digits: 1 },
    { key: 'magnesiumMg', label: '镁', unit: 'mg', target: 330, digits: 0 }
];
export const MICRO_KEYS = MICRO_NUTRIENTS.map((item) => item.key);
/** 成年人的每日参考量；铁按性别区分，其余一项一个值 */
export function microTargets(profile) {
    const female = profile?.sex === 'female';
    return Object.fromEntries(MICRO_NUTRIENTS.map((item) => [item.key, female && item.femaleTarget ? item.femaleTarget : item.target]));
}
/** 把几条食物命中项的微量元素加起来；没有数据的项不出现在结果里 */
export function sumMicro(labels) {
    const out = {};
    for (const meta of MICRO_NUTRIENTS) {
        let has = false;
        let total = 0;
        for (const label of labels) {
            const micro = FOOD_MICRO[label];
            if (!micro || typeof micro[meta.key] !== 'number')
                continue;
            has = true;
            total += micro[meta.key];
        }
        if (has)
            out[meta.key] = Math.round(total * 10) / 10;
    }
    return out;
}
export const FOOD_MICRO = {
    "米饭": {
        "fiberG": 0.5,
        "calciumMg": 5,
        "ironMg": 0.3,
        "potassiumMg": 50,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 12
    },
    "炒青菜": {
        "fiberG": 2.5,
        "calciumMg": 80,
        "ironMg": 1.5,
        "potassiumMg": 380,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 35
    },
    "面条": {
        "fiberG": 1.5,
        "calciumMg": 10,
        "ironMg": 1,
        "potassiumMg": 60,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0.1,
        "magnesiumMg": 15
    },
    "饺子": {
        "fiberG": 1.5,
        "calciumMg": 20,
        "ironMg": 1,
        "potassiumMg": 150,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0.2,
        "magnesiumMg": 15
    },
    "包子": {
        "fiberG": 1.2,
        "calciumMg": 20,
        "ironMg": 0.8,
        "potassiumMg": 120,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0.2,
        "magnesiumMg": 12
    },
    "白粥": {
        "fiberG": 0.2,
        "calciumMg": 3,
        "ironMg": 0.1,
        "potassiumMg": 20,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 4
    },
    "皮蛋瘦肉粥": {
        "fiberG": 0.4,
        "calciumMg": 25,
        "ironMg": 0.6,
        "potassiumMg": 120,
        "vitaminDMcg": 0.1,
        "vitaminB12Mcg": 0.2,
        "magnesiumMg": 12
    },
    "燕麦": {
        "fiberG": 4,
        "calciumMg": 20,
        "ironMg": 1.8,
        "potassiumMg": 140,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 55
    },
    "全麦面包": {
        "fiberG": 3,
        "calciumMg": 30,
        "ironMg": 1.2,
        "potassiumMg": 90,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 30
    },
    "鸡胸肉": {
        "fiberG": 0,
        "calciumMg": 10,
        "ironMg": 0.6,
        "potassiumMg": 380,
        "vitaminDMcg": 0.1,
        "vitaminB12Mcg": 0.5,
        "magnesiumMg": 40
    },
    "鸡腿": {
        "fiberG": 0,
        "calciumMg": 12,
        "ironMg": 0.9,
        "potassiumMg": 300,
        "vitaminDMcg": 0.2,
        "vitaminB12Mcg": 0.6,
        "magnesiumMg": 28
    },
    "牛肉": {
        "fiberG": 0,
        "calciumMg": 12,
        "ironMg": 2.8,
        "potassiumMg": 480,
        "vitaminDMcg": 0.1,
        "vitaminB12Mcg": 2,
        "magnesiumMg": 32
    },
    "猪肉/排骨": {
        "fiberG": 0,
        "calciumMg": 12,
        "ironMg": 1.2,
        "potassiumMg": 400,
        "vitaminDMcg": 0.4,
        "vitaminB12Mcg": 0.6,
        "magnesiumMg": 25
    },
    "鱼": {
        "fiberG": 0,
        "calciumMg": 60,
        "ironMg": 1,
        "potassiumMg": 450,
        "vitaminDMcg": 8,
        "vitaminB12Mcg": 2.5,
        "magnesiumMg": 40
    },
    "虾": {
        "fiberG": 0,
        "calciumMg": 90,
        "ironMg": 1.5,
        "potassiumMg": 350,
        "vitaminDMcg": 1,
        "vitaminB12Mcg": 1.5,
        "magnesiumMg": 45
    },
    "豆腐": {
        "fiberG": 0.5,
        "calciumMg": 200,
        "ironMg": 2.5,
        "potassiumMg": 200,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 60
    },
    "鸡蛋": {
        "fiberG": 0,
        "calciumMg": 25,
        "ironMg": 0.9,
        "potassiumMg": 70,
        "vitaminDMcg": 1.1,
        "vitaminB12Mcg": 0.5,
        "magnesiumMg": 6
    },
    "煎蛋": {
        "fiberG": 0,
        "calciumMg": 25,
        "ironMg": 0.9,
        "potassiumMg": 70,
        "vitaminDMcg": 1.1,
        "vitaminB12Mcg": 0.5,
        "magnesiumMg": 6
    },
    "纯牛奶": {
        "fiberG": 0,
        "calciumMg": 300,
        "ironMg": 0.1,
        "potassiumMg": 380,
        "vitaminDMcg": 2.5,
        "vitaminB12Mcg": 1.2,
        "magnesiumMg": 28
    },
    "酸奶": {
        "fiberG": 0,
        "calciumMg": 180,
        "ironMg": 0.1,
        "potassiumMg": 220,
        "vitaminDMcg": 1.5,
        "vitaminB12Mcg": 0.6,
        "magnesiumMg": 18
    },
    "豆浆": {
        "fiberG": 1,
        "calciumMg": 30,
        "ironMg": 1.5,
        "potassiumMg": 300,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 20
    },
    "奶酪片": {
        "fiberG": 0,
        "calciumMg": 200,
        "ironMg": 0.2,
        "potassiumMg": 50,
        "vitaminDMcg": 0.5,
        "vitaminB12Mcg": 0.3,
        "magnesiumMg": 8
    },
    "苹果": {
        "fiberG": 2.6,
        "calciumMg": 8,
        "ironMg": 0.2,
        "potassiumMg": 170,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 8
    },
    "香蕉": {
        "fiberG": 2.6,
        "calciumMg": 8,
        "ironMg": 0.3,
        "potassiumMg": 400,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 32
    },
    "橙子/橘子": {
        "fiberG": 2.3,
        "calciumMg": 40,
        "ironMg": 0.2,
        "potassiumMg": 180,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 12
    },
    "水果": {
        "fiberG": 2.5,
        "calciumMg": 20,
        "ironMg": 0.3,
        "potassiumMg": 200,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 15
    },
    "玉米": {
        "fiberG": 3,
        "calciumMg": 5,
        "ironMg": 0.8,
        "potassiumMg": 300,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 45
    },
    "红薯/紫薯": {
        "fiberG": 3,
        "calciumMg": 30,
        "ironMg": 0.6,
        "potassiumMg": 400,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 25
    },
    "土豆": {
        "fiberG": 2.5,
        "calciumMg": 12,
        "ironMg": 0.8,
        "potassiumMg": 500,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 30
    },
    "蔬菜沙拉": {
        "fiberG": 3,
        "calciumMg": 60,
        "ironMg": 1.5,
        "potassiumMg": 400,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 35
    },
    "坚果": {
        "fiberG": 2.5,
        "calciumMg": 30,
        "ironMg": 1.2,
        "potassiumMg": 180,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 70
    },
    "花生酱": {
        "fiberG": 1,
        "calciumMg": 8,
        "ironMg": 0.3,
        "potassiumMg": 100,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 25
    },
    "牛油果": {
        "fiberG": 5,
        "calciumMg": 15,
        "ironMg": 0.5,
        "potassiumMg": 450,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 30
    },
    "巧克力": {
        "fiberG": 1.5,
        "calciumMg": 30,
        "ironMg": 1.5,
        "potassiumMg": 120,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 35
    },
    "冰淇淋": {
        "fiberG": 0.5,
        "calciumMg": 80,
        "ironMg": 0.1,
        "potassiumMg": 100,
        "vitaminDMcg": 0.3,
        "vitaminB12Mcg": 0.3,
        "magnesiumMg": 10
    },
    "美式咖啡": {
        "fiberG": 0,
        "calciumMg": 3,
        "ironMg": 0.1,
        "potassiumMg": 100,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 5
    },
    "拿铁/生椰拿铁": {
        "fiberG": 0,
        "calciumMg": 250,
        "ironMg": 0.1,
        "potassiumMg": 350,
        "vitaminDMcg": 2,
        "vitaminB12Mcg": 0.8,
        "magnesiumMg": 25
    },
    "奶茶": {
        "fiberG": 0,
        "calciumMg": 100,
        "ironMg": 0.1,
        "potassiumMg": 150,
        "vitaminDMcg": 0.6,
        "vitaminB12Mcg": 0.3,
        "magnesiumMg": 12
    },
    "可乐/汽水": {
        "fiberG": 0,
        "calciumMg": 5,
        "ironMg": 0,
        "potassiumMg": 10,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 2
    },
    "果汁/含糖饮料": {
        "fiberG": 0.2,
        "calciumMg": 10,
        "ironMg": 0.1,
        "potassiumMg": 150,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 8
    },
    "啤酒": {
        "fiberG": 0,
        "calciumMg": 10,
        "ironMg": 0.1,
        "potassiumMg": 60,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0.1,
        "magnesiumMg": 10
    },
    "酒": {
        "fiberG": 0,
        "calciumMg": 2,
        "ironMg": 0.1,
        "potassiumMg": 15,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0,
        "magnesiumMg": 3
    },
    "火腿肠": {
        "fiberG": 0,
        "calciumMg": 10,
        "ironMg": 0.5,
        "potassiumMg": 150,
        "vitaminDMcg": 0,
        "vitaminB12Mcg": 0.3,
        "magnesiumMg": 8
    }
};
