/**
 * 「部位」这件事的唯一口径：中文选项 → 动作库里肌肉名称的匹配词。
 * 周框架按你点的部位排一天、今日表按你点的主练调顺序，两边都得用同一套词，
 * 否则会出现「框架说这天练背、今日表说没有背的动作」这种自相矛盾。
 */
export const AREA_PATTERN = {
    胸: /胸/,
    背: /背|菱形|后链|斜方/,
    肩: /三角|肩/,
    手臂: /二头|三头|臂/,
    腿: /股四|腘绳|小腿|臀/,
    臀: /臀|腘绳|后链/,
    核心: /核心|腹/
};
/** 说不出「主动肌是它」的日子：全身和有氧直接套现成的角色模板 */
export const ROLE_ONLY_AREAS = {
    全身: '全身 A',
    有氧: '有氧与活动度'
};
/** UI 上「这天练什么」的选项，顺序就是展示顺序 */
export const AREA_CHOICES = ['胸', '背', '肩', '手臂', '腿', '臀', '核心', '全身', '有氧'];
/** 「今天练哪里」和记录页「这天练了哪里」的选项：有氧不是一种部位，靠类型就能说清 */
export const AREA_OPTIONS = ['胸', '背', '肩', '手臂', '腿', '臀', '核心'];
export function hitsArea(ex, area) {
    if (!ex || !area)
        return false;
    const re = AREA_PATTERN[area];
    if (!re)
        return false;
    return re.test(`${ex.muscles.join(' ')} ${ex.name}`);
}
/** muscles[0] 是主动肌：只有它匹配才算「主要练这个部位」，用来决定谁能顶到主项位置 */
export function isPrimeFor(ex, area) {
    if (!ex || !area)
        return false;
    const re = AREA_PATTERN[area];
    return Boolean(re && re.test(ex.muscles[0] ?? ''));
}
/** 「今天练哪里」可以多选：任一部位被练到就算命中 */
export function hitsAnyArea(ex, areas) {
    return areas.some((a) => hitsArea(ex, a));
}
/** 多选里只要有一个部位是它的主动肌，就按主要练那个部位对待 */
export function isPrimeForAny(ex, areas) {
    return areas.some((a) => isPrimeFor(ex, a));
}
