import { INJURY_LABELS } from '../types.js';
import { EXERCISES } from './exercises.js';
export const emptyDirective = {
    noCardio: false,
    yesCardio: false,
    homeOnly: false,
    fullGym: false,
    areas: [],
    okAreas: [],
    avoid: [],
    clearAll: false
};
const NEG = /不要|不想|不用|别排|别给|去掉|删掉|砍掉|免去|取消|不做|不练|少排|不安排/;
const POS_CARDIO = /多来点有氧|加有氧|要有氧|把有氧加上|多一点心肺/;
const RECOVER = /其实没问题|不算伤|已经好了|不痛了|没有不适|消掉了/;
const HURT = /痛|疼|伤|不舒服|不适|麻|弹响|做过手术|受过伤|发炎|无力/;
const GYM_ON = /有健身房|全套器械|健身房可以用|能用杠铃|去健身房|在学校健身房|恢复健身房/;
const GYM_OFF = /没有健身房|没去过健身房|不去健身房|在家练|家里练|只有哑铃|哑铃和自重|宿舍练|自重就行/;
const AREA_WORDS = {
    lowBack: /腰|下背|腰椎/,
    knee: /膝/,
    shoulder: /肩/,
    ankle: /踝|脚踝|脚腕/
};
/** 动作名去掉器械前缀后的常用叫法，用户说的是「卧推」而不是「杠铃卧推」 */
const EQUIP_PREFIX = /^(杠铃|哑铃|器械|固定器械|史密斯|绳索|龙门架|壶铃|弹力带|trx)/;
export function nameKeywords() {
    const set = new Set();
    for (const ex of EXERCISES) {
        set.add(ex.name);
        const stripped = ex.name.replace(EQUIP_PREFIX, '');
        if (stripped !== ex.name && stripped.length >= 2)
            set.add(stripped);
    }
    return [...set].sort((a, b) => b.length - a.length);
}
/** 用户说的是常用叫法，动作库里的名字可能带器械前缀；这几个词多展开几种写法 */
const SYN = {
    深蹲: ['深蹲', '后蹲', '前蹲'],
    硬拉: ['硬拉'],
    卧推: ['卧推'],
    推举: ['推举'],
    划船: ['划船'],
    下拉: ['下拉'],
    引体: ['引体'],
    弯举: ['弯举'],
    飞鸟: ['飞鸟'],
    侧平举: ['侧平举'],
    臀推: ['臀推'],
    腿举: ['腿举'],
    平板支撑: ['平板支撑']
};
export function parseByRule(text) {
    const t = text.trim();
    const d = { ...emptyDirective, areas: [], okAreas: [], avoid: [] };
    if (!t)
        return d;
    if (/改回去|撤销|恢复原来|全部清除|清空设置/.test(t))
        d.clearAll = true;
    // 「不要有氧」里含有「要有氧」这个子串，所以否定必须先判，不能反过来
    const cardioWord = /有氧|心肺|跑步机|椭圆机|动感单车|单车|划船机|cardio/i.test(t);
    const neg = NEG.test(t);
    if (cardioWord && neg)
        d.noCardio = true;
    else if (POS_CARDIO.test(t))
        d.yesCardio = true;
    if (GYM_OFF.test(t))
        d.homeOnly = true;
    if (GYM_ON.test(t))
        d.fullGym = true;
    Object.keys(AREA_WORDS).forEach((a) => {
        if (!AREA_WORDS[a].test(t))
            return;
        if (RECOVER.test(t))
            d.okAreas.push(a);
        else if (HURT.test(t))
            d.areas.push({ area: a, triggers: t });
    });
    for (const k of avoidTokens(t, nameKeywords())) {
        if (neg)
            d.avoid.push(k);
    }
    return d;
}
/**
 * 用户说的是常用叫法（「深蹲」「卧推」），动作库里写的可能是「杠铃后蹲」「哑铃卧推」。
 * 先按库里的名字直配，再用同义词表把口语词展开成几种写法，只保留库里真有的，
 * 免得把「膝盖蹲不下去」里的「蹲」当成一个查无此动作的关键词念给用户。
 */
function avoidTokens(t, names) {
    const hits = new Set();
    for (const k of names)
        if (t.includes(k))
            hits.add(k);
    for (const key of Object.keys(SYN)) {
        if (!t.includes(key))
            continue;
        for (const v of SYN[key]) {
            if (hits.has(v) || !names.some((n) => n.includes(v)))
                continue;
            hits.add(v);
        }
    }
    return [...hits].sort((a, b) => b.length - a.length);
}
/** 把一句话能识别到的东西先念一遍给用户，识别不到的部分要明确说没听懂 */
export function describe(d) {
    const out = [];
    if (d.clearAll)
        out.push('把之前的定制全部撤掉，回到按档案排的默认计划');
    if (d.noCardio)
        out.push('不再排有氧，省下来的分钟全部给力量动作');
    if (d.yesCardio)
        out.push('恢复有氧');
    if (d.homeOnly)
        out.push('按「只有哑铃和自重」重排，健身房才有的器械动作换成同类居家动作');
    if (d.fullGym)
        out.push('恢复健身房器械');
    d.areas.forEach((n) => out.push(`标记${INJURY_LABELS[n.area]}不舒服：会避开让${INJURY_LABELS[n.area]}受压的动作`));
    d.okAreas.forEach((a) => out.push(`取消${INJURY_LABELS[a]}的标记`));
    d.avoid.forEach((k) => out.push(`去掉所有含「${k}」的动作`));
    return out;
}
export function applyDirective(p, d) {
    if (d.clearAll) {
        return { ...p, noCardio: false, homeOnly: false, avoidNames: [], injuries: [] };
    }
    const injuries = [...p.injuries];
    d.okAreas.forEach((a) => {
        const i = injuries.findIndex((x) => x.area === a);
        if (i >= 0)
            injuries.splice(i, 1);
    });
    d.areas.forEach((n) => {
        const i = injuries.findIndex((x) => x.area === n.area);
        if (i >= 0)
            injuries[i] = { ...injuries[i], triggers: n.triggers };
        else
            injuries.push({ area: n.area, side: null, triggers: n.triggers });
    });
    const avoidNames = [...new Set([...p.avoidNames, ...d.avoid])];
    return {
        ...p,
        injuries,
        noCardio: d.noCardio ? true : d.yesCardio ? false : p.noCardio,
        homeOnly: d.homeOnly ? true : d.fullGym ? false : p.homeOnly,
        commercialGym: d.homeOnly ? false : d.fullGym ? true : p.commercialGym,
        avoidNames
    };
}
/** 一句话里到底有没有可执行的东西 */
export function isEmpty(d) {
    return (!d.noCardio &&
        !d.yesCardio &&
        !d.homeOnly &&
        !d.fullGym &&
        !d.clearAll &&
        d.areas.length === 0 &&
        d.okAreas.length === 0 &&
        d.avoid.length === 0);
}
