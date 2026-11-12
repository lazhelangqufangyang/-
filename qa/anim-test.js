import { PATTERN_TEACH } from '../src/engine/teach.js';
import { asciiPose, lerpPose, offscreen } from '../src/engine/anim.js';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const entries = Object.entries(PATTERN_TEACH).filter(([name]) => !only || only.includes(name));
let bad = 0;
// 中间帧也要在画布里：动画是插值出来的，端点对了半路甩出去一样不能用
for (const [name, t2] of entries) {
    [0.25, 0.5, 0.75].forEach((k) => {
        const problems = offscreen(lerpPose(t2.start, t2.end, k), t2.rig);
        if (problems.length) {
            bad += 1;
            console.log(`!! ${name} 第 ${k} 帧出界: ${problems.join(', ')}`);
        }
    });
}
console.log(`中间帧出界数：${bad}`);
if (!only)
    process.exit(0);
for (const [name, t] of entries) {
    for (const which of ['start', 'end']) {
        const pose = t[which];
        const problems = offscreen(pose, t.rig);
        if (problems.length) {
            bad += 1;
            console.log(`!! ${name}.${which} 跑出画布: ${problems.join(', ')}`);
        }
        console.log(`\n―― ${name}.${which} (${t.rig}/${pose.base ?? 'stand'})`);
        console.log(asciiPose(pose, t.rig));
    }
}
console.log(`\n越界姿态数：${bad} / ${entries.length * 2}`);
