import { byId, cautionText, swapCandidates } from './exercises.js';
import { injuryAreas, isHomeMode, loadLabel } from './load.js';
export const PATTERN_TEACH = {
    squat: {
        rig: 'side',
        start: { shank: -2, thigh: 4, torso: 10, arm: 178, fore: 178, base: 'stand' },
        end: { shank: -46, thigh: 40, torso: 46, arm: 178, fore: 178, base: 'stand', hipDx: -6, hipDy: 26 },
        prop: 'bar',
        steps: [
            '全脚掌踩实，重心压在足中线上，脚尖朝外 10–20 度',
            '先吸气把肚子绷紧，髋和膝同时打开往下坐，不是先折腰',
            '蹲到今天能控制的最低点（髋略低于膝是理想，做不到就用箱高或幅度封顶）',
            '脚跟和脚掌一起蹬起，回到站姿时膝盖伸直但不砸锁'
        ],
        mistakes: ['膝盖往内扣', '脚跟离地、重心跑到脚尖', '下蹲先弯腰，变成早安式', '为了追深度把背弓起来'],
        breathing: '下蹲前吸气绷紧，起身过最难那一段之后再吐气；不要憋气到发晕',
        tempo: '下放 2–3 秒，底部不停顿，起 1 秒'
    },
    hinge: {
        rig: 'side',
        start: { shank: -3, thigh: 5, torso: 6, arm: 178, fore: 178, base: 'stand' },
        end: { shank: -12, thigh: 14, torso: 78, arm: 180, fore: 180, base: 'stand', hipDx: -22, hipDy: 6 },
        prop: 'bar',
        steps: [
            '站位髋宽，杠铃或哑铃贴住小腿，手在肩的正下方',
            '膝盖弯到 15–25 度就固定住，之后只让髋往后推',
            '背保持中立，重物沿腿往下滑，滑到还能保持背直的位置（一般在膝下）',
            '髋往前顶回站直，顶峰夹臀，腰不要往后仰'
        ],
        mistakes: ['弯腰圆背把重量吊在腰上', '重物离开小腿，力臂变长', '用后仰腰来「锁定」重量', '把它做成蹲（膝往前跑太多）'],
        breathing: '拉起前吸气绷紧，站直后吐气，下放途中不换气',
        tempo: '下放 2–3 秒，触地不弹，拉起 1 秒'
    },
    lunge: {
        rig: 'side',
        start: { shank: -4, thigh: 6, torso: 6, arm: 178, fore: 178, base: 'stand' },
        end: { shank: -50, thigh: 44, torso: 12, arm: 178, fore: 178, base: 'stand', hipDy: 30 },
        prop: 'dumbbell',
        steps: [
            '前脚全掌踩稳，后脚搭凳（保加利亚）或向后迈一大步（箭步走）',
            '躯干略前倾但不左右晃，骨盆摆正',
            '垂直下蹲，后膝接近地面但不碰，前膝方向跟脚尖一致',
            '前脚跟和后脚掌一起蹬起，站稳再做下一次'
        ],
        mistakes: ['步幅太窄导致左右晃', '前膝内扣', '躯干侧倾代偿', '后脚落地弹起来省功'],
        breathing: '下蹲时吸气，蹬起时吐气，节奏乱了就停下重开',
        tempo: '下放 2 秒，蹬起 1 秒'
    },
    hipThrust: {
        rig: 'side',
        start: { shank: 0, thigh: 80, torso: -84, arm: 95, fore: 90, base: 'supine' },
        end: { shank: 4, thigh: 62, torso: -101, arm: 100, fore: 92, base: 'supine' },
        prop: 'bar',
        steps: [
            '上背靠稳凳边，杠铃或垫放在髋部正上方，双手扶稳',
            '下巴微收、肋骨下压，脚踩实让胫骨接近竖直',
            '髋向上顶到肩—髋—膝成一条线，顶峰停 1 秒',
            '下放时髋往后而不是往下，到臀部还有张力就起'
        ],
        mistakes: ['腰椎后仰代替髋伸展（顶完腰疼就是它）', '仰头带动上半身', '只做半程，顶峰不夹臀', '脚放太远，变成腿后侧抽筋式发力'],
        breathing: '顶起时吐气，下放时吸气，全程别憋',
        tempo: '上顶 1 秒，顶峰停 1 秒，下放 2 秒'
    },
    horizontalPush: {
        rig: 'side',
        start: { shank: 0, thigh: 80, torso: -90, arm: 104, fore: -30, base: 'supine' },
        end: { shank: 0, thigh: 76, torso: -90, arm: 13, fore: 13, base: 'supine' },
        prop: 'bar',
        steps: [
            '肩胛往后往下收稳，全程不让它们散开，这是卧推不伤肩的第一条',
            '双手比肩略宽，小臂在最低点要竖直，肘在身侧约 45–70 度，不要平摊成 90 度',
            '杠铃落到乳头连线稍上方，触胸即起，不弹不砸',
            '推起到肘伸直但不砸锁，把杠铃往回压到起点正上方'
        ],
        mistakes: ['肩胛没收住，推的时候肩膀前送', '肘完全打开成一条线', '杠铃落点偏高压到肩前部', '为了起桥把腰抬离凳面失控'],
        breathing: '下放吸气绷紧，推过黏滞点后吐气',
        tempo: '下放 2–3 秒，触胸不停顿，推起 1 秒'
    },
    verticalPush: {
        rig: 'front',
        start: { shank: -3, thigh: 4, torso: 4, arm: 155, fore: -12, base: 'stand' },
        end: { shank: -3, thigh: 4, torso: 0, arm: 8, fore: 4, base: 'stand' },
        prop: 'dumbbell',
        steps: [
            '肋骨下压、别把腰反出去，坐姿背贴稳靠垫',
            '下放到大臂接近水平、手在耳侧，肘不要往前跑',
            '往上推到肘接近伸直，起点在耳的正上方而不是脑门前方',
            '全程核心绷紧，不要靠蹬腿借力'
        ],
        mistakes: ['推到一半头往前伸，腰椎代偿', '下放太靠前，肩前部受力', '手肘往前摊开变成侧平举', '起重量时小腿蹬凳'],
        breathing: '推起时吐气，下放时吸气',
        tempo: '下放 2 秒，推起 1 秒，顶端不停顿'
    },
    horizontalPull: {
        rig: 'side',
        start: { shank: -60, thigh: 78, torso: 22, arm: 110, fore: 105, base: 'sit' },
        end: { shank: -58, thigh: 78, torso: 12, arm: 155, fore: 60, base: 'sit' },
        prop: 'cable',
        steps: [
            '坐稳，胸口挺住但不要把腰反出去，手柄在腹部高度',
            '先动肩胛（往后收），再弯肘，感觉是背把肘拉走',
            '拉到手贴近身体两侧、肘在身后，停半秒',
            '放回时让肩胛跟着往前送一点，但全程背不松不圆'
        ],
        mistakes: ['靠身体前后晃借力', '拉到胸前、肘抬高变成耸肩', '含胸圆背，负荷全压在肩前部', '放太短，背阔肌没有拉长'],
        breathing: '拉起时吐气，放回时吸气',
        tempo: '拉 1 秒，顶峰停半秒，放回 2 秒'
    },
    verticalPull: {
        rig: 'front',
        start: { shank: -20, thigh: 60, torso: 4, arm: 20, fore: 20, base: 'sit' },
        end: { shank: -18, thigh: 62, torso: 8, arm: 115, fore: -118, base: 'sit' },
        prop: 'machine',
        steps: [
            '握比肩略宽，把身体挂稳，先沉肩再开始拉',
            '肘沿着身侧往下往后走，朝髋部的方向拉',
            '下巴留在杆前面，用颈后上方/前上方迎杆，不要头往前探',
            '放回时控制着把肩胛送上去，不要在悬挂里松掉'
        ],
        mistakes: ['只用手臂拉，肩胛完全不参与', '身体大幅摆动借力', '拉到颈后（肩前部压力大，不建议）', '放到一半就急着起，失去拉长'],
        breathing: '拉起时吐气，放回时吸气',
        tempo: '拉 1 秒，放回 2–3 秒'
    },
    chestIso: {
        rig: 'front',
        start: { shank: -10, thigh: 70, torso: 0, arm: 118, fore: 118, base: 'supine' },
        end: { shank: -10, thigh: 70, torso: 0, arm: -8, fore: -22, base: 'supine' },
        prop: 'dumbbell',
        steps: [
            '肩胛收稳贴凳，手肘保持一点弯度，全程当它是「抱一棵大树」的弧度',
            '往两侧打开，大臂到与肩同高就停，追求胸部被拉开的感觉而不是压到底',
            '用胸部把两手夹回中线，顶峰停一秒',
            '幅度由肩关节决定，出现肩前部刺痛就立刻减小范围或换动作'
        ],
        mistakes: ['肘越弯越直，变成哑铃卧推', '打开得太低，肩前部被扯', '靠甩手臂起落', '两手在中线相撞借力'],
        breathing: '打开时吸气，夹回时吐气',
        tempo: '打开 2–3 秒，夹回 1 秒，顶峰停 1 秒'
    },
    shoulderIso: {
        rig: 'front',
        start: { shank: -2, thigh: 3, torso: 0, arm: 178, fore: 178, base: 'stand' },
        end: { shank: -2, thigh: 3, torso: 0, arm: 96, fore: 96, base: 'stand' },
        prop: 'dumbbell',
        steps: [
            '站直，肘留一点弯，起手时小拇指侧略低（像往下倒水），肩不耸',
            '抬到大臂与肩同高就够了，超过水平只会让肩峰更挤',
            '慢慢放回去，放到还有张力就下一次',
            '重量小到能完全控制，宁可轻也别晃'
        ],
        mistakes: ['耸肩、斜方肌抢活', '身体往后仰借力', '抬得比肩高', '下放自由落体'],
        breathing: '抬起时吐气，下放时吸气',
        tempo: '抬 1 秒，下放 2–3 秒'
    },
    triceps: {
        rig: 'side',
        start: { shank: -10, thigh: 12, torso: 14, arm: 176, fore: 25, base: 'brace' },
        end: { shank: -10, thigh: 12, torso: 14, arm: 176, fore: 176, base: 'brace' },
        prop: 'cable',
        steps: [
            '大臂夹紧在身侧固定不动，只有肘在开合',
            '身体略前倾、核心绷紧，别让肩往后缩',
            '往下压到肘伸直，停半秒感受三头收紧',
            '放回时控制到肘约 90 度，不要甩起来'
        ],
        mistakes: ['大臂跟着前后跑，变成推', '肩膀耸起来借力', '放回太快失去张力', '重量大到腰在晃'],
        breathing: '压下时吐气，放回时吸气',
        tempo: '压 1 秒，放回 2 秒'
    },
    biceps: {
        rig: 'side',
        start: { shank: -3, thigh: 4, torso: 6, arm: 182, fore: 178, base: 'stand' },
        end: { shank: -3, thigh: 4, torso: 6, arm: 182, fore: 60, base: 'stand' },
        prop: 'dumbbell',
        steps: [
            '大臂贴在身侧不动，肘作为唯一转动的关节',
            '往上弯到能收紧的位置就够，不用怼到肩',
            '慢慢放回，放到手臂接近伸直还留一点张力',
            '手腕保持中立，别往里旋把负荷丢给腕'
        ],
        mistakes: ['肘往前顶、肩膀晃着借力', '身体前后摆', '下放只放一半', '手腕甩动'],
        breathing: '弯起时吐气，放回时吸气',
        tempo: '弯起 1 秒，顶端停半秒，放回 2–3 秒'
    },
    legIso: {
        rig: 'side',
        start: { shank: -20, thigh: 80, torso: 8, arm: 170, fore: 160, base: 'sit' },
        end: { shank: 72, thigh: 84, torso: 4, arm: 175, fore: 168, base: 'sit' },
        prop: 'machine',
        steps: [
            '坐稳，把膝盖轴对准器械的转轴，靠背贴实',
            '只靠小腿/大腿伸展发力，动作途中髋不抬离垫子',
            '伸到位停一秒，感受目标肌肉收紧',
            '放回时留一点角度，不要把配重砸到底'
        ],
        mistakes: ['配重片撞击放松张力', '髋部离开座椅借力', '为了完成行程把腰反出去', '速度太快变成甩'],
        breathing: '伸展时吐气，放回时吸气',
        tempo: '伸展 1 秒，停 1 秒，放回 2–3 秒'
    },
    calfRaise: {
        rig: 'side',
        start: { shank: -3, thigh: 2, torso: 0, arm: 176, fore: 176, base: 'stand', footPitch: 30 },
        end: { shank: 5, thigh: 1, torso: 0, arm: 176, fore: 176, base: 'stand', hipDy: -11, footPitch: 68 },
        prop: 'none',
        steps: [
            '前脚掌踩稳，脚跟悬在台阶边或器械踏板上，膝保持微屈不锁死',
            '脚跟垂直向上顶到最高，整个身体像被拎起来，不要内外翻',
            '在最高点停 1 秒，小腿部是绷紧的而不是抖着撑',
            '慢放回，脚跟降到略低于水平位置就够，别砸到底'
        ],
        mistakes: ['弹着脚跟借力', '顶太高时踝往外翻', '下放过快失去张力', '靠腰后仰把身体立起来'],
        breathing: '抬起时吐气，下放时吸气',
        tempo: '上 1 秒，停 1 秒，下 3 秒'
    },
    core: {
        rig: 'side',
        start: { shank: 84, thigh: 86, torso: -86, arm: 100, fore: 100, base: 'supine' },
        end: { shank: 86, thigh: 88, torso: -100, arm: 100, fore: 100, base: 'supine' },
        prop: 'none',
        steps: [
            '先建立「肋骨下压、腰保持自然一点点空隙」的姿势，再开始动',
            '发力时腹部是绷紧的，腰不代偿拱起、不憋气',
            '慢到能看出自己在控制，一旦腰开始拱或抖就缩短幅度',
            '结束时回到中立位，别靠甩或塌腰收尾'
        ],
        mistakes: ['双手抱头把颈椎往前拉', '全程憋气', '腰离开垫子拱起来', '幅度太大变成借腰'],
        breathing: '保持正常呼吸，发力那一段吐气，绝不一口气憋到底',
        tempo: '按秒控制，一边 2–3 秒，宁可时间短也别变形'
    },
    cardio: {
        rig: 'side',
        start: { shank: -35, thigh: 25, torso: 8, arm: 155, fore: 150, base: 'stand' },
        end: { shank: 12, thigh: -18, torso: 10, arm: 205, fore: 210, base: 'stand' },
        prop: 'none',
        steps: [
            '强度用「还能说短句，但不能唱歌」来定，不需要盯心率',
            '关节压力大的选项优先：坡度走、椭圆、划船、单车',
            '前 3–5 分钟从低一档起步，再升到目标强度',
            '结束时降 3–5 分钟收尾，不要突然停下站着'
        ],
        mistakes: ['一上来就冲最高档', '靠扶手把体重挂上去，实际消耗大打折扣', '膝盖内扣、含胸塌腰', '练到头晕恶心还硬撑'],
        breathing: '保持能说短句的节奏，喘到说不出话就是过量了',
        tempo: '稳定节奏，不做冲刺间歇（除非计划里明确写了）'
    }
};
/** 组间休息为什么是这几分钟：按动作类型给理由，不是随便凑数 */
const REST_WHY = {
    heavy: '大重量复合动作组间留 2–3 分钟。磷酸原系统和神经募集大概要 2–3 分钟才回到接近满状态，休息不到就变成「带着上组的疲劳再做一组」，重量和动作质量一起垮，受伤风险也上来。',
    accessory: '辅助复合动作组间 90 秒到 2.5 分钟。负荷比主项小，不需要完全恢复，留着一点疲劳感正好把代谢压力堆上去。',
    isolation: '单关节孤立动作组间 60–90 秒。目标肌肉小、恢复快，休息过长反而失张力；喘匀了就下一组。'
};
const SAFETY = '我不是医生，也不判断伤病。做到某个角度如果出现刺痛、发麻或突然无力，就停在这一组，把幅度减小或者换动作；持续两三次都这样，去找康复科或运动医学科看过再上重量。';
function restClass(ex, isMain) {
    if (ex.kind === 'isolation' && !ex.heavy)
        return 'isolation';
    if (isMain || ex.heavy)
        return 'heavy';
    return 'accessory';
}
function doseLineOf(slot, ex) {
    const unit = slot.unit ?? ex.unit;
    if (slot.kind === 'ramp') {
        const ws = slot.setPlan.map((s) => loadLabel(unit, s.weightKg));
        return `递增热身 ${slot.sets} 组：${ws.join(' → ')}，每组 ${slot.setPlan[0]?.reps ?? ex.reps} 次。轻重量是为了练动作模式、把关节液和体温推上去，不是为了累。`;
    }
    const first = slot.setPlan[0];
    const w = first?.weightKg;
    const load = unit === '无' || unit === '自重' ? loadLabel(unit, w) : loadLabel(unit, w ?? null);
    const rpe = first?.rpe ? `，目标 RPE ${first.rpe}` : '';
    const rest = slot.restSec > 0 ? `组间休息 ${slot.restSec} 秒` : '无组间休息';
    return `今天排的是 ${slot.sets} 组 × ${first?.reps ?? ex.reps} 次 · ${load}${rpe}；${rest}。`;
}
/** 热身、活动度、有氧、放松这几行没有动作库条目，也给一份能点开的说明 */
const TIMED_TEACH = {
    warmupGeneral: {
        rig: 'side',
        start: PATTERN_TEACH.cardio.start,
        end: PATTERN_TEACH.cardio.end,
        why: '升温只干一件事：把体温、心率、关节滑液推上来。它不算训练量，做到微微出汗就够，别在这里把自己练累，否则主项的重量就废了。',
        steps: [
            '从最低档开始，2 分钟内升到「能说短句、不能唱歌」',
            '跑步机就带点坡度，单车先低阻力，都不做冲刺',
            '结束标准是手心微潮、额头微汗，不是喘到说不出话'
        ],
        mistakes: ['一上来就最高档，主项没力气了', '把它当成有氧训练硬撑 15 分钟', '直接跳过升温就上杠铃'],
        breathing: '保持能说话的节奏',
        tempo: '2–5 分钟，强度从低到中'
    },
    warmupMobility: {
        rig: 'front',
        start: { shank: -3, thigh: 4, torso: 0, arm: 150, fore: 150, base: 'stand' },
        end: { shank: -3, thigh: 4, torso: 0, arm: 22, fore: 20, base: 'stand' },
        why: '动态活动度是把今天要用到的关节角度「走一遍」，不是压柔韧性。每个方向慢慢做到你能控制的幅度就够了，拉到痛会让肌肉反射性收紧，反而更僵。',
        steps: [
            '按今天要练的部位选：腿日走髋和踝，推日走肩和胸椎',
            '每个方向 8–10 次，动作到底停 1 秒再回来',
            '全程主动发力到位，不用手硬压'
        ],
        mistakes: ['做成静态拉伸并长时间按住', '只转腰不活动胸椎', '幅度追求「看着舒服」而不是可控'],
        breathing: '随动作自然呼吸，到末端不憋气',
        tempo: '每个方向 2–3 秒，共 2–4 分钟'
    },
    cardio: {
        rig: PATTERN_TEACH.cardio.rig,
        start: PATTERN_TEACH.cardio.start,
        end: PATTERN_TEACH.cardio.end,
        why: '有氧是这一天里最容易被高估的一块：它服务的是热量缺口和心肺，不是「练到虚脱」。能说话但不能唱歌的强度，做完还能正常吃下饭，就对了。',
        steps: PATTERN_TEACH.cardio.steps,
        mistakes: PATTERN_TEACH.cardio.mistakes,
        breathing: PATTERN_TEACH.cardio.breathing,
        tempo: PATTERN_TEACH.cardio.tempo
    },
    cooldown: {
        rig: 'side',
        start: { shank: -6, thigh: 8, torso: 16, arm: 178, fore: 176, base: 'stand' },
        end: { shank: -14, thigh: 20, torso: 80, arm: 170, fore: 175, base: 'stand' },
        why: '放松不是仪式：慢走把心率降下来，静态拉伸帮今天被缩短过的肌肉回到长度。每个位置 30 秒、拉到「有感觉但不痛」，不追求压下去。',
        steps: [
            '先慢走 1–2 分钟，让心率降回接近平时',
            '只拉今天用到的肌群，每个位置 30 秒、2 轮',
            '呼吸放慢，拉到紧绷感就停，不弹振'
        ],
        mistakes: ['练完立刻坐下就走', '弹振式拉伸', '拉到刺痛还继续压'],
        breathing: '每个位置吐气 4–6 秒',
        tempo: '3–5 分钟，全程低强度'
    }
};
/**
 * 一张表的某一行 → 这个动作的详细解读。没有动作库条目的行（升温、活动度、有氧、放松）走通用说明。
 */
export function teachCard(slot, p) {
    const ex = byId(slot.exId);
    // 有氧行现在也能挂上动作库里的动作（用户在「动作」页点了跳绳），但它按分钟做、没有组，
    // 只有 setPlan 为空才走通用说明，否则剂量那行会算出「undefined kg」
    if (!ex || slot.setPlan.length === 0)
        return timedCard(slot);
    const t = PATTERN_TEACH[ex.pattern];
    const areas = injuryAreas(p);
    const isMain = slot.kind === 'main' || slot.kind === 'compound';
    const swaps = swapCandidates(ex, areas)
        .filter((s) => s.id !== ex.id)
        .slice(0, 3)
        .map((s) => `${s.name}（${s.equipment.join('/')}）`);
    const prime = ex.muscles[0] ?? ex.muscles.join('、');
    const home = isHomeMode(p) ? '（你家器械条件）' : '';
    return {
        exId: ex.id,
        name: slot.name,
        pattern: ex.pattern,
        rig: t.rig,
        prop: t.prop,
        start: t.start,
        end: t.end,
        musclesLine: `练到的肌肉：${ex.muscles.join(' · ')}`,
        primeLine: `主动肌是${prime}，其余是帮着稳定的协同肌。看动画里高亮的那块就是它。`,
        equipmentLine: `器械：${slot.equipment || ex.equipment.join('/')} ${home}· 重量单位 ${slot.unit ?? ex.unit}`,
        doseLine: doseLineOf(slot, ex),
        steps: [...t.steps, `这个动作最关键的一句：${ex.form}`],
        mistakes: t.mistakes,
        breathing: t.breathing,
        tempo: t.tempo,
        restWhy: REST_WHY[restClass(ex, isMain)],
        cue: ex.form,
        caution: cautionText(ex, areas),
        safety: SAFETY,
        swaps
    };
}
const GENERIC = TIMED_TEACH.warmupGeneral;
function timedCard(slot) {
    const t = TIMED_TEACH[slot.kind] ?? GENERIC;
    const min = Math.max(1, Math.round(slot.durationSec / 60));
    return {
        exId: slot.exId ?? `timed-${slot.kind}`,
        name: slot.name,
        pattern: 'cardio',
        rig: t.rig,
        prop: 'none',
        start: t.start,
        end: t.end,
        musclesLine: '',
        primeLine: t.why,
        equipmentLine: '这一行不指定器械，做到能控制的范围就行',
        doseLine: `今天排的是约 ${min} 分钟，强度稳在这一档做完就行。`,
        steps: slot.note ? [...t.steps, `表上给你写的一句：${slot.note}`] : t.steps,
        mistakes: t.mistakes,
        breathing: t.breathing,
        tempo: t.tempo,
        restWhy: '这一行没有组间休息，连着做。中途喘不过来了就降一档强度，不要硬撑。',
        cue: slot.note,
        caution: '',
        safety: SAFETY,
        swaps: []
    };
}
