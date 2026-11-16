import { useEffect, useState } from 'react';
import { wishToGoal } from '../engine/goals.js';
import { buildFramework } from '../engine/week.js';
import { goalFromWishViaAI, goalFromReferenceViaAI } from '../ai.js';
import Ruler from './Ruler.jsx';
const STEPS = ['身体数据', '想练成什么样'];
function num(v) {
    if (v.trim() === '')
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function toDraft(p) {
    return {
        sex: p.sex ?? '',
        age: p.age != null ? String(p.age) : '',
        height: p.heightCm != null ? String(p.heightCm) : '',
        weight: p.weightKg != null ? String(p.weightKg) : '',
        bodyfat: p.bodyFatPct != null ? String(p.bodyFatPct) : '',
        bodyfatUnknown: p.bodyFatPct == null,
        wish: p.goalWish ?? ''
    };
}
/** 愿望里点了人名（想像某人那样）就把这个名字单独交给模型去查 */
function refOf(wish) {
    const m = /想像\s*(.{2,12}?)\s*(?:那样|那种|的样子)/.exec(wish ?? '');
    return m ? m[1].trim() : '';
}
/**
 * 练过没有、伤病、器械、睡眠、饮食都不在首屏问：档案里留原值（可能是用户在「改计划」里说出来的），
 * 没说过就继续留 null，引擎会把「没问过」写进框架的 assumed 里，不假装是用户选的。
 * 训练日也不问：档案里有就留着，没有就交给引擎的默认（周一到周四）。
 */
function toProfile(d, base) {
    return {
        ...base,
        sex: d.sex === 'male' || d.sex === 'female' ? d.sex : null,
        age: num(d.age),
        heightCm: num(d.height),
        weightKg: num(d.weight),
        bodyFatPct: d.bodyfatUnknown ? null : num(d.bodyfat),
        goalWish: d.wish.trim(),
        goal: null
    };
}
/** 跳过这问 = 这一问就是不答：清空它的草稿，让引擎用默认，并在 assumed 里写明是我替你定的 */
const CLEAR_FOR = {
    1: { sex: '', age: '', height: '', weight: '', bodyfat: '', bodyfatUnknown: true },
    2: { wish: '' }
};
export default function Onboarding({ initial, settings, favorites = [], editing, onDone, onExit }) {
    const [step, setStep] = useState(1);
    const [d, setD] = useState(() => toDraft(initial));
    const [goal, setGoal] = useState(initial.goal);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const [autoT, setAutoT] = useState('');
    const set = (patch) => setD((x) => ({ ...x, ...patch }));
    const lastStep = step === STEPS.length;
    const translate = async (forceRule = false) => {
        setBusy(true);
        setNote('');
        const p = toProfile(d, initial);
        const ref = refOf(p.goalWish);
        if (!forceRule && settings.useAI && settings.apiKey) {
            try {
                const g = ref ? await goalFromReferenceViaAI(settings, p, ref) : await goalFromWishViaAI(settings, p);
                setGoal(g);
                setBusy(false);
                return;
            }
            catch (e) {
                const err = e;
                setNote(`这次没用上模型（${err.kind === 'noKey' ? '没填 Key' : err.detail || '接口不通'}），改成按本机规则翻。`);
            }
        }
        setGoal(wishToGoal(p));
        setBusy(false);
    };
    /** 停手就去翻，不用点；同一句话只翻一次 */
    useEffect(() => {
        if (step !== 2)
            return;
        const wish = d.wish.trim();
        if (wish.length < 3 || wish === autoT)
            return;
        let live = true;
        const t = setTimeout(() => {
            if (!live)
                return;
            setAutoT(wish);
            void translate();
        }, 800);
        return () => {
            live = false;
            clearTimeout(t);
        };
    }, [d.wish, step]);
    // setD 是异步的，跳过时要用清过之后的草稿往下走，否则「下一步」会把刚跳掉的答案又写回去
    const advance = (patch, dropGoal = false) => {
        const nd = { ...d, ...patch };
        setD(nd);
        if (lastStep) {
            const p = toProfile(nd, initial);
            // 写了愿望但没点翻译：按本机规则翻一次，不背着他自己排一版目标；跳过这一问就丢掉旧翻译
            const g = dropGoal ? wishToGoal(p) : goal ?? wishToGoal(p);
            const fw = buildFramework(p, g, undefined, favorites);
            onDone({ ...p, goal: g }, g, fw);
            return;
        }
        setStep(step + 1);
        window.scrollTo(0, 0);
    };
    const goNext = () => advance({});
    const skip = () => advance(CLEAR_FOR[step] ?? {}, step === 2);
    /** 自由训练：这一问就是不答，goal 与框架都留 null，运动页按你点的部位/动作现排 */
    const freeTrain = () => {
        if (initial.goal && !window.confirm('清掉训练目标和周框架，改成自由训练？历史训练记录不动，随时能回来重新设目标。'))
            return;
        const p = toProfile({ ...d, wish: '' }, initial);
        onDone(p, null, null);
    };
    return (<div className="app">
      <header className="topbar">
        <div>
          <h1>{editing ? '我的档案' : `先答 ${STEPS.length} 个问题`}</h1>
          {editing ? <div className="sub">改完会按新档案重排周框架，历史训练记录保留</div> : null}
        </div>
        <div className="spacer"/>
        {editing && onExit ? (<button className="btn ghost" style={{ padding: '6px 10px', minHeight: 36, fontSize: 13 }} onClick={onExit}>
            ‹ 返回设置
          </button>) : null}
      </header>

      <div className="stepnav">
        <button className="btn ghost" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
          ‹ 上一步
        </button>
        <div className="navright">
          <button className="btn link" onClick={skip}>
            {lastStep ? '跳过，用默认目标' : '跳过这问'}
          </button>
          <button className="btn primary nextq" onClick={goNext} disabled={busy}>
            {busy ? '翻译中…' : lastStep ? (editing ? '保存并重排' : '生成周框架') : '下一步'} ›
          </button>
        </div>
      </div>

      <main className="screen">
        <div className="progress">
          {STEPS.map((_, i) => (<span key={i} className={i + 1 <= step ? 'done' : ''}/>))}
        </div>

        <div className="qhead">
          <div className="qstep">
            第 {step} 问
            <span className="of">共 {STEPS.length} 问</span>
          </div>
          <h2 className="qtitle">{STEPS[step - 1]}</h2>
        </div>

        {step === 1 ? (<Card>
            <Field label="性别">
              <Chips value={d.sex} options={[
                { v: 'male', t: '男' },
                { v: 'female', t: '女' }
            ]} onChange={(v) => set({ sex: v })}/>
            </Field>
            <Ruler label="年龄" unit="岁" min={14} max={90} every={10} value={d.age} onChange={(v) => set({ age: v })}/>
            <Ruler label="身高" unit="cm" min={140} max={200} every={5} value={d.height} onChange={(v) => set({ height: v })}/>
            <Ruler label="体重" unit="kg" min={35} max={150} every={10} value={d.weight} onChange={(v) => set({ weight: v })}/>
            <Field label="体脂估计 %（可选）">
              <div className="chips" style={{ marginBottom: 8 }}>
                <button className="chip" aria-pressed={d.bodyfatUnknown} onClick={() => set({ bodyfatUnknown: !d.bodyfatUnknown })}>
                  不知道 / 不提供
                </button>
              </div>
              {!d.bodyfatUnknown ? (<input type="number" inputMode="decimal" value={d.bodyfat} onChange={(e) => set({ bodyfat: e.target.value })} min={5} max={50}/>) : null}
            </Field>
            <div className="notice privacy">
              这些东西默认全部留在本机浏览器里：计划、身体数据、训练记录、大模型 Key。登录是可选的，登了也只多存一个账号名或支付宝 uid 和订阅状态；训练和饮食的记录要你自己在「数据与备份」里点「传到云端」才上去，不点就一个字节都不离开这台设备。任何时候都能在设置页导出成 JSON 自己留底。
            </div>
          </Card>) : null}

        {step === 2 ? (<Card>
            <Field label="用你自己的话说">
              <textarea value={d.wish} onChange={(e) => {
                set({ wish: e.target.value });
                setGoal(null);
            }} placeholder="想练成什么样，写一句就行"/>
            </Field>
            <div className="btnbar">
              <button className="btn ghost" onClick={freeTrain}>
                先不设目标，自由练
              </button>
            </div>
            {note ? <div className="missing">{note}</div> : null}
            {goal ? (<div className="card" style={{ marginTop: 14 }}>
                <h3>{goal.headline}</h3>
                <div style={{ marginBottom: 8 }}>
                  {goal.priorityAreas.map((a) => (<span className="tag accent" key={a}>
                      {a}
                    </span>))}
                  <span className="tag">{goal.weeks} 周</span>
                  {goal.bodyFatBand ? <span className="tag">体脂区间 {goal.bodyFatBand[0]}–{goal.bodyFatBand[1]}%</span> : null}
                </div>
                <div className="small muted" style={{ marginBottom: 8 }}>力量参照：</div>
                {goal.strengthTargets.map((t) => (<div className="kv" key={t.lift} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span>{t.lift}</span>
                    <span className="num">{t.target}</span>
                  </div>))}
                <div className="small muted" style={{ marginTop: 12 }}>怎么衡量有没有进展：</div>
                <ul className="small" style={{ paddingLeft: 18, marginTop: 4 }}>
                  {goal.checks.map((c) => (<li key={c}>{c}</li>))}
                </ul>
                {settings.useAI && settings.apiKey ? (<div className="chips" style={{ marginTop: 12 }}>
                    <button className="chip" onClick={() => void translate(true)}>
                      翻得不准，按本机规则重翻
                    </button>
                  </div>) : null}
              </div>) : null}
          </Card>) : null}
      </main>
    </div>);
}
function Card({ children }) {
    return <div className="card">{children}</div>;
}
function Field({ label, children }) {
    return (<div className="field">
      <label>{label}</label>
      {children}
    </div>);
}
function Chips({ value, options, onChange }) {
    return (<div className="chips">
      {options.map((o) => (<button key={o.v} className="chip" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.t}
        </button>))}
    </div>);
}
