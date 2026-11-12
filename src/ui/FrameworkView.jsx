import { useState } from 'react';
import { INJURY_LABELS } from '../types.js';
import { weekdayName } from '../engine/goals.js';
import { AREA_CHOICES } from '../engine/areas.js';
import { isHomeMode } from '../engine/load.js';
import { byId } from '../engine/exercises.js';
import { baselineAdvice } from '../engine/lifestyle.js';
import { applyDirective, describe, isEmpty, parseByRule } from '../engine/tweak.js';
/** 一句话快捷指令：点下去就等于把这句话告诉了引擎 */
const QUICK = [
    { t: '不要有氧，把量都留给力量', label: '不要有氧' },
    { t: '我没有健身房，在家练，只有哑铃和自重', label: '在家只有哑铃' },
    { t: '我有健身房全套器械可以用', label: '能用健身房' },
    { t: '我膝盖不舒服', label: '膝不舒服' },
    { t: '我腰不舒服', label: '腰不舒服' },
    { t: '我肩不舒服', label: '肩不舒服' },
    { t: '我踝不舒服', label: '踝不舒服' },
    { t: '把之前的定制全部改回去', label: '全部改回去' }
];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
/** 这天照分化轮转排（不点部位） */
const ROTATE = '按轮转';
export default function FrameworkView({ framework, profile, onApplyProfile }) {
    if (!framework) {
        // 自由训练：没有周计划可排，但伤病、器械、要不要有氧照样要说
        return <ConditionsCard profile={profile} onApplyProfile={onApplyProfile}/>;
    }
    const g = framework.goal;
    const advice = baselineAdvice(profile);
    return (<div>
      <div className="card">
        <h3>{g.headline}</h3>
        <div style={{ marginBottom: 6 }}>
          {g.priorityAreas.map((a) => (<span className="tag accent" key={a}>
              {a}
            </span>))}
          <span className="tag">{framework.weeksTotal} 周</span>
          <span className="tag">{g.source === 'ai' ? 'AI 翻译' : '本机规则翻译'}</span>
        </div>
        <div className="faint">
          开始于 {framework.startDate} · 档案：{profile.weightKg} kg / {profile.heightCm} cm · 每周 {framework.days.length} 天
        </div>
      </div>

      <div className="card">
        <h3>这周怎么练：你自己点</h3>
        <div className="field">
          <label>能练的星期几（现在 {framework.days.length} 天）</label>
          <div className="chips">
            {WEEKDAYS.map((w) => {
            // 以框架实际排出来的天为准：档案里 weekdays 可能是 null（我替你补的默认），照样要点得动
            const on = framework.days.some((d) => d.weekday === w);
            return (<button key={w} className="chip" aria-pressed={on} onClick={() => {
                    const next = on
                        ? framework.days.filter((d) => d.weekday !== w).map((d) => d.weekday)
                        : [...framework.days.map((d) => d.weekday), w].sort((a, b) => a - b);
                    const areas = { ...profile.dayAreas };
                    // 不练了就把这天的部位一起删掉：再点回来时它回到「按轮转」，不是悄悄留着旧部位
                    if (on)
                        delete areas[String(w)];
                    onApplyProfile({ ...profile, weekdays: next, dayAreas: areas });
                }}>
                  {weekdayName(w)}
                </button>);
        })}
          </div>
          {framework.days.length === 0 ? (<div className="missing">一天都没选：这一周没有排定的日子。</div>) : null}
        </div>
        {framework.days.map((d) => {
            const cur = profile.dayAreas[String(d.weekday)] ?? '';
            return (<div className="arearow" key={d.weekday}>
              <div className="arearow-head">
                <b>{weekdayName(d.weekday)}</b>
                <span className="faint small">{cur ? '你点的部位' : '照分化轮转'}</span>
              </div>
              <div className="chips">
                {[ROTATE, ...AREA_CHOICES].map((a) => (<button key={a} className="chip" aria-pressed={a === ROTATE ? !cur : cur === a} onClick={() => {
                        const areas = { ...profile.dayAreas };
                        if (a === ROTATE)
                            delete areas[String(d.weekday)];
                        else
                            areas[String(d.weekday)] = a;
                        onApplyProfile({ ...profile, dayAreas: areas });
                    }}>
                    {a}
                  </button>))}
              </div>
            </div>);
        })}
      </div>

      <ConditionsCard profile={profile} onApplyProfile={onApplyProfile}/>

      {framework.assumed?.length ? (<div className="card">
          <h3>下面这些是我替你定的默认</h3>
          {framework.assumed.map((a) => (<div className="small muted" key={a} style={{ marginBottom: 6 }}>
              · {a}
            </div>))}
        </div>) : null}

      <div className="card">
        <h3>分化安排与每天练什么</h3>
        {framework.days.map((d) => (<div key={d.weekday} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b>{weekdayName(d.weekday)}</b>
              <span className="tag">{d.role}</span>
              <span className="muted small">{d.focus}</span>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {d.headline}
            </div>
            <div className="num small" style={{ marginTop: 6 }}>
              {d.cardioMin > 0 ? '这天带一段有氧' : '这天没有有氧'}
            </div>
            <div className="sets" style={{ marginTop: 6 }}>
              {d.exerciseIds.map((id, i) => {
                const ex = byId(id);
                if (!ex)
                    return null;
                return (<span className="s" key={id}>
                    {i + 1}. {ex.name}
                    <span style={{ color: 'var(--text-faint)' }}> {ex.sets}×{ex.reps}</span>
                  </span>);
            })}
            </div>
            {d.substitutions?.length ? (<div className="faint" style={{ marginTop: 6 }}>
                {d.substitutions.map((s) => (<div key={s}>⚑ {s}</div>))}
              </div>) : null}
          </div>))}
      </div>

      <div className="card">
        <h3>{framework.weeksTotal} 周的递进逻辑</h3>
        {framework.weeks.map((w) => (<div className="weekrow" key={w.index}>
            <div className="wk num">W{w.index}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 620 }}>
                {w.theme} <span className="tag">RPE {w.rpeBase}</span>
              </div>
              <div className="small muted">{w.intent}</div>
              <div className="faint" style={{ marginTop: 3 }}>
                {w.progression}
              </div>
            </div>
          </div>))}
      </div>

      <div className="card">
        <h3>渐进超负荷与减量触发</h3>
        {framework.rules.map((r, i) => (<div className="small muted" key={i} style={{ marginBottom: 7 }}>
            · {r}
          </div>))}
      </div>

      <div className="card">
        <h3>睡眠和吃饭</h3>
        <div className="small muted" style={{ marginBottom: 6 }}>睡眠</div>
        <ul className="small" style={{ paddingLeft: 18, marginTop: 0 }}>
          {advice.sleep.map((s) => (<li key={s}>{s}</li>))}
        </ul>
        <div className="small muted" style={{ margin: '10px 0 6px' }}>吃饭</div>
        <ul className="small" style={{ paddingLeft: 18, marginTop: 0 }}>
          {advice.diet.map((s) => (<li key={s}>{s}</li>))}
        </ul>
      </div>
    </div>);
}
/** 伤病、器械、要不要有氧：首屏不问这些，都在这里说 */
function ConditionsCard({ profile, onApplyProfile }) {
    const [text, setText] = useState('');
    const [log, setLog] = useState(null);
    const run = (raw) => {
        const t = raw.trim();
        if (t.length < 2)
            return;
        const d = parseByRule(t);
        if (isEmpty(d))
            setLog({ lines: [], missed: true });
        else {
            onApplyProfile(applyDirective(profile, d));
            setLog({ lines: describe(d), missed: false });
        }
        setText('');
    };
    const prefs = [];
    if (profile.noCardio)
        prefs.push('不要有氧');
    if (isHomeMode(profile))
        prefs.push(profile.homeOnly ? '在家：只有哑铃和自重' : '没有商业健身房：只排家里做得出来的动作');
    profile.avoidNames.forEach((k) => prefs.push(`去掉「${k}」`));
    profile.injuries.forEach((i) => prefs.push(`${INJURY_LABELS[i.area]}不舒服`));
    return (<div className="card">
      <h3>训练条件：伤病、器械、要不要有氧</h3>
      <div className="chips" style={{ marginBottom: 10 }}>
        {QUICK.map((q) => (<button key={q.label} className="chip" onClick={() => run(q.t)}>
            {q.label}
          </button>))}
      </div>
      <div className="field">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="说一下要怎么改，例：我不去健身房，只有哑铃，不要有氧"/>
      </div>
      <button className="btn primary" onClick={() => run(text)} disabled={text.trim().length < 2}>
        照这句改计划
      </button>
      {log ? (<div className={log.missed ? 'missing' : 'notice'} style={{ marginTop: 10 }}>
          {log.missed
                ? '这句话里我没听出能改的项目。能改的就这几类：要不要有氧、有没有健身房器械、哪个部位不舒服、点名去掉哪个动作。哪天练什么部位在上面直接点。'
                : log.lines.map((l) => <div key={l}>· {l}</div>)}
        </div>) : null}
      {prefs.length ? (<div className="faint" style={{ marginTop: 10 }}>
          现在生效的定制：{prefs.join(' / ')}
        </div>) : null}
    </div>);
}
