import { useMemo, useRef, useState } from 'react';
import { MEAL_LABELS } from '../types.js';
import { addDaysIso, todayIso, uid } from '../engine/time.js';
import { buildDays, dietScopeNote, dietTargets, macroLines, macroTargets, rangeDiet, verdict } from '../engine/diet.js';
import { estimateMeal, NUTRIENTS, searchFoods } from '../engine/foodHints.js';
import { mealPlans, SLOT_ORDER } from '../engine/mealPlan.js';
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export default function DietView({ profile, meals, onAdd, onRemove, onGoToday, onGoProfile }) {
    const today = todayIso();
    const targets = useMemo(() => dietTargets(profile), [profile]);
    const macros = useMemo(() => macroTargets(targets), [targets]);
    const days = useMemo(() => buildDays(meals), [meals]);
    const [start, end] = [addDaysIso(today, -6), today];
    const week = rangeDiet(days, start, end);
    const judge = verdict(week, targets);
    const lines = macroLines(week, macros, targets.protein);
    const todayEntry = days.find((d) => d.date === today) ?? null;
    const past = days.filter((d) => d.date !== today);
    const [adding, setAdding] = useState(false);
    const [openDay, setOpenDay] = useState('');
    const [confirmId, setConfirmId] = useState('');
    return (<div>
      <div className="card">
        <h3>你的热量参考</h3>
        {targets.target === null ? (<p className="muted small">{targets.basis}</p>) : (<div className="dt-target">
            <div className="dt-big num">
              {targets.target.toLocaleString('zh-CN')}
              <span className="dt-unit">kcal / 天</span>
            </div>
            <div className="dt-aside">
              <div className="small muted">
                维持区间 {targets.maintain?.[0]}–{targets.maintain?.[1]} · 底线 {targets.floor} kcal
              </div>
              {targets.protein ? <div className="small muted">蛋白质 {targets.protein[0]}–{targets.protein[1]} g</div> : null}
            </div>
          </div>)}
        <div className="dt-macros">
          <span>碳水 <b className="num">{macros.carbs ? `${macros.carbs[0]}–${macros.carbs[1]} g` : '—'}</b></span>
          <span>脂肪 <b className="num">{macros.fat ? `${macros.fat[0]}–${macros.fat[1]} g` : '—'}</b></span>
          <span>糖 <b className="num">{macros.sugarMax !== null ? `≤ ${macros.sugarMax} g` : '—'}</b></span>
          <span>钠 <b className="num">{macros.sodiumMax !== null ? `≤ ${macros.sodiumMax} mg` : '—'}</b></span>
        </div>
      </div>

      <PlanCards targets={targets} onGoProfile={onGoProfile}/>

      <FoodLookup />

      <div className="card">
        <div className="lb-head">
          <h3 style={{ margin: 0 }}>今天 · {today.slice(5)}</h3>
          <button className="btn ghost" style={{ padding: '8px 12px', minHeight: 40, fontSize: 14 }} onClick={() => setAdding(!adding)}>
            {adding ? '收起' : '记一餐'}
          </button>
        </div>
        <div className="lb-head-line">{todayEntry ? dayHead(todayEntry) : '今天还没记。'}</div>
        {adding ? <MealForm today={today} onAdd={onAdd} onDone={() => setAdding(false)}/> : null}
        {todayEntry ? (<div style={{ marginTop: 8 }}>
            <MealRows entry={todayEntry} confirmId={confirmId} onAskDelete={(id) => setConfirmId(confirmId === id ? '' : id)} onDelete={(id) => { onRemove(id); setConfirmId(''); }}/>
          </div>) : null}
      </div>

      <div className="card">
        <h3>一周平均</h3>
        <div className="kv">
          <span>热量</span>
          <span className="num">
            {week.avgKcal !== null ? `${week.avgKcal.toLocaleString('zh-CN')} kcal` : '没带数字的记录'}
            {targets.target !== null && week.avgKcal !== null ? (<span className="faint small">{` （参考 ${targets.target.toLocaleString('zh-CN')}）`}</span>) : null}
          </span>
        </div>
        <div className="dt-macro-rows">
          {lines.map((l) => (<div className="dt-macro-row" key={l.key}>
              <span>{l.label}</span>
              <span className="num">
                {l.avg === null ? '没记' : `${l.avg.toLocaleString('zh-CN')} ${l.unit}`}
              </span>
              <span className="faint small">{l.ref}</span>
              <span className={`dt-flag${l.flag ? ' ' + l.flag : ''}`}>
                {l.flag === 'over' ? '超了' : l.flag === 'low' ? '偏低' : ''}
              </span>
            </div>))}
        </div>
        <div className={`dt-verdict${judge.tone === 'floor' ? ' warn' : judge.tone === 'ok' ? ' good' : ''}`}>{judge.text}</div>
        <p className="faint small">{dietScopeNote(week, start, end)}</p>
      </div>

      {past.map((d) => (<MealDayCard key={d.date} entry={d} open={openDay === d.date} onToggle={() => setOpenDay(openDay === d.date ? '' : d.date)} confirmId={confirmId} onAskDelete={(id) => setConfirmId(confirmId === id ? '' : id)} onDelete={(id) => {
                onRemove(id);
                setConfirmId('');
            }}/>))}

      {days.length === 0 ? (<div className="card">
          <h3>还没有吃的记录</h3>
          <button className="btn primary" onClick={onGoToday}>
            回运动
          </button>
        </div>) : null}
    </div>);
}
function dayHead(entry) {
    return [
        entry.meals.length ? `${entry.meals.length} 条` : '',
        entry.kcal ? `${entry.kcal.toLocaleString('zh-CN')} kcal（你估的）` : entry.counted === 0 ? '都没估热量，折不出总数' : '',
        entry.proteinG ? `蛋白 ${entry.proteinG} g` : '',
        entry.carbsG ? `碳水 ${entry.carbsG} g` : '',
        entry.fatG ? `脂肪 ${entry.fatG} g` : '',
        entry.sugarG ? `糖 ${entry.sugarG} g` : '',
        entry.sodiumMg ? `钠 ${entry.sodiumMg.toLocaleString('zh-CN')} mg` : '',
        entry.uncounted ? `其中 ${entry.uncounted} 条没估数` : '',
        entry.partial ? '只记了一条，这天不进一周平均' : ''
    ]
        .filter(Boolean)
        .join(' · ');
}
function PlanCards({ targets, onGoProfile }) {
    const plans = useMemo(() => mealPlans(targets), [targets]);
    const [page, setPage] = useState(0);
    const track = useRef(null);
    const anchor = useRef(0);
    if (!plans.length) {
        return (<div className="card">
        <h3>一天吃这么多</h3>
        <div className="missing">填上身高体重、性别和年龄，这里就按你的档案算出一天吃多少克米饭、多少克面。</div>
        <button className="btn primary" onClick={onGoProfile}>
          去填档案
        </button>
      </div>);
    }
    const proteinTarget = targets.protein ? Math.round((targets.protein[0] + targets.protein[1]) / 2) : 0;
    const go = (i) => {
        anchor.current = i;
        setPage(i);
        const el = track.current;
        if (el)
            el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    };
    return (<div className="card">
      <h3>
        一天吃这么多 · {targets.target?.toLocaleString('zh-CN')} kcal · 蛋白 {proteinTarget} g
      </h3>
      <div className="mp-track" ref={track} onScroll={(e) => {
            // 一次手势只走一页：划一小下就翻两份是这卡带最烦的地方
            const el = e.currentTarget;
            const w = Math.max(1, el.clientWidth);
            const i = Math.round(el.scrollLeft / w);
            const lo = anchor.current - 1;
            const hi = anchor.current + 1;
            if (i < lo || i > hi) {
                const to = i < lo ? lo : hi;
                el.scrollLeft = to * w;
                anchor.current = to;
                setPage(to);
                return;
            }
            if (i !== page) {
                anchor.current = i;
                setPage(i);
            }
        }}>
        {plans.map((plan) => (<div className="mp-page" key={plan.key}>
            <PlanCard plan={plan}/>
          </div>))}
      </div>
      <div className="mp-dots">
        {plans.map((plan, i) => (<button key={plan.key} className={i === page ? 'on' : ''} aria-label={plan.title} aria-pressed={i === page} onClick={() => go(i)}/>))}
      </div>
    </div>);
}
function PlanCard({ plan }) {
    return (<div className="mp">
      <div className="mp-head">
        <b>{plan.title}</b>
        <span className="num">
          {plan.kcal.toLocaleString('zh-CN')} kcal · 蛋白 {plan.protein} · 碳水 {plan.carbs} · 脂肪 {plan.fat} g
        </span>
      </div>
      {SLOT_ORDER.map((slot) => {
            const rows = plan.items.filter((it) => it.slot === slot);
            if (!rows.length)
                return null;
            return (<div className="mp-slot" key={slot}>
            <span className="mp-tag">{MEAL_LABELS[slot]}</span>
            <span className="mp-items">
              {rows.map((it) => (<span className="mp-item" key={slot + it.name}>
                  {it.name} <b className="num">{it.grams} g</b>
                  {it.scale ? <em>{it.scale}</em> : null}
                </span>))}
            </span>
            <span className="mp-kcal num">{Math.round(rows.reduce((n, it) => n + it.kcal, 0))}</span>
          </div>);
        })}
    </div>);
}
function FoodLookup() {
    const [q, setQ] = useState('');
    const [all, setAll] = useState(false);
    const [nut, setNut] = useState('protein');
    const list = useMemo(() => searchFoods(q), [q]);
    const shown = q.trim() || all ? list : list.slice(0, 16);
    const meta = NUTRIENTS.find((x) => x.key === nut);
    return (<div className="card">
      <h3>常见食物营养</h3>
      <input value={q} onChange={(e) => {
            setQ(e.target.value);
            setAll(false);
        }} placeholder="搜食物，例：米饭 / 鸡胸 / 奶茶"/>
      <div className="chips ft-tabs">
        {NUTRIENTS.map((x) => (<button key={x.key} className="chip" aria-pressed={nut === x.key} onClick={() => setNut(x.key)}>
            {x.label}
          </button>))}
      </div>
      <div className="ft-head">
        <span>一份</span>
        <span className="num">kcal</span>
        <span className="num">
          {meta.label} {meta.unit}
        </span>
      </div>
      {shown.map((h) => {
            const range = h.nut[nut];
            return (<div className="ft-row" key={h.label}>
            <span className="ft-l">
              <b>{h.label}</b>
              <em>{h.portion}</em>
            </span>
            <span className="num">
              {h.low}–{h.high}
            </span>
            <span className="num">{range ? `${range[0]}–${range[1]}` : '—'}</span>
          </div>);
        })}
      {!list.length ? <div className="faint small">表里没有「{q}」这一条。</div> : null}
      {!q && list.length > shown.length ? (<button className="btn ghost" onClick={() => setAll(true)}>
          显示全部 {list.length} 条
        </button>) : null}
      {!q && all ? (<button className="btn ghost" onClick={() => setAll(false)}>
          收起
        </button>) : null}
    </div>);
}
const EMPTY_NUMS = { kcal: '', protein: '', carbs: '', fat: '', sugar: '', sodium: '' };
/** 表里的区间中点 → 表单里该填哪一格 */
const NUT_FIELD = { protein: 'protein', carbs: 'carbs', fat: 'fat', sugar: 'sugar', salt: 'sodium' };
const NUT_MAX = { kcal: 6000, protein: 600, carbs: 900, fat: 400, sugar: 400, sodium: 8000 };
function MealForm({ today, onAdd, onDone }) {
    const [date, setDate] = useState(today);
    const [slot, setSlot] = useState(() => {
        const h = new Date().getHours();
        return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
    });
    const [name, setName] = useState('');
    const [nums, setNums] = useState(EMPTY_NUMS);
    const [note, setNote] = useState('');
    const est = useMemo(() => estimateMeal(name), [name]);
    const mid = est ? Math.round((est.low + est.high) / 2) : 0;
    const applyMid = () => {
        if (!est)
            return;
        const next = { ...nums, kcal: String(mid) };
        for (const x of est.nutrients)
            next[NUT_FIELD[x.key]] = String(Math.round((x.low + x.high) / 2));
        setNums(next);
    };
    const save = () => {
        const read = (key, allowZero) => {
            const raw = nums[key].trim();
            if (raw === '')
                return null;
            const v = Number(raw);
            if (!Number.isFinite(v) || v < 0)
                return null;
            if (!allowZero && v === 0)
                return null;
            return Math.min(NUT_MAX[key], Math.round(v));
        };
        onAdd({
            id: uid('meal'),
            // 未来的日期贴回今天，免得平均被不存在的天数拉走
            date: date > today || !/^\d{4}-\d{2}-\d{2}$/.test(date) ? today : date,
            slot,
            name: name.trim() || MEAL_LABELS[slot],
            kcal: read('kcal', false),
            proteinG: read('protein', true),
            carbsG: read('carbs', true),
            fatG: read('fat', true),
            sugarG: read('sugar', true),
            sodiumMg: read('sodium', true),
            note: note.trim(),
            ts: new Date().toISOString()
        });
        setName('');
        setNums(EMPTY_NUMS);
        setNote('');
        onDone();
    };
    const numField = (key, label, placeholder) => (<div className="field">
      <label>{label}（可空）</label>
      <input type="number" value={nums[key]} onChange={(e) => setNums((cur) => ({ ...cur, [key]: e.target.value }))} min={0} max={NUT_MAX[key]} inputMode="decimal" placeholder={placeholder}/>
    </div>);
    return (<div style={{ marginTop: 10 }}>
      <div className="logrow">
        <div className="field">
          <label>哪天吃的</label>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)}/>
        </div>
        <div className="field">
          <label>哪一餐</label>
          <div className="chips">
            {SLOTS.map((s) => (<button key={s} className="chip" aria-pressed={slot === s} onClick={() => setSlot(s)}>
                {MEAL_LABELS[s]}
              </button>))}
          </div>
        </div>
      </div>
      <div className="field">
        <label>吃了什么</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：食堂二两米饭 + 鸡腿 + 炒青菜"/>
        {est ? (<div className="dt-hint">
            <div className="small">
              名字对上了本机表里的 {est.items.length} 条，每条按<b>一份</b>算：
            </div>
            <div className="dt-hint-list">
              {est.items.map((h) => (<span className="dt-hint-item" key={h.label}>
                  {h.label}
                  <em>{h.portion}</em>
                  <b className="num">
                    {h.low}–{h.high}
                  </b>
                </span>))}
            </div>
            <div className="dt-hint-nuts">
              <span>
                合起来 <b className="num">{est.low}–{est.high}</b> kcal
              </span>
              {est.nutrients.map((x) => (<span key={x.key}>
                  {x.label} <b className="num">{x.low}–{x.high}</b> {x.unit}
                </span>))}
            </div>
            <button className="btn ghost dt-hint-btn" onClick={applyMid}>
              把中间值填到下面（{mid} kcal）
            </button>
          </div>) : null}
      </div>
      <div className="logrow">
        {numField('kcal', '大概多少 kcal', '估不出来就空着')}
        {numField('protein', '蛋白质 g', '例：30')}
      </div>
      <div className="logrow">
        {numField('carbs', '碳水 g', '例：60')}
        {numField('fat', '脂肪 g', '例：18')}
      </div>
      <div className="logrow">
        {numField('sugar', '糖 g', '例：12')}
        {numField('sodium', '钠 mg', '例：1200')}
      </div>
      <div className="field">
        <label>备注（可空）</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：油很大 / 喝了一杯奶茶"/>
      </div>
      <div className="btnbar">
        <button className="btn primary" onClick={save}>
          记下这一餐
        </button>
        <button className="btn ghost" onClick={onDone}>
          返回
        </button>
      </div>
    </div>);
}
/** 一条记录里填了哪几样就写哪几样，没填的不占位 */
function mealNut(m) {
    return [
        m.proteinG ? `蛋白 ${m.proteinG} g` : '',
        m.carbsG ? `碳水 ${m.carbsG} g` : '',
        m.fatG ? `脂肪 ${m.fatG} g` : '',
        m.sugarG ? `糖 ${m.sugarG} g` : '',
        m.sodiumMg ? `钠 ${m.sodiumMg} mg` : ''
    ]
        .filter(Boolean)
        .join(' · ');
}
function MealRows({ entry, confirmId, onAskDelete, onDelete }) {
    return (<div className="lb-lines">
      {entry.meals.map((m) => (<div className="lb-line" key={m.id}>
          <span className="lb-lname">
            {MEAL_LABELS[m.slot]} · {m.name}
          </span>
          <span className="lb-lsets num">{m.kcal && m.kcal > 0 ? `${m.kcal} kcal` : '没估'}</span>
          <span className="lb-ltop">
            {mealNut(m)} {m.note}
          </span>
          <button className={`lb-del${confirmId === m.id ? ' on' : ''}`} onClick={() => (confirmId === m.id ? onDelete(m.id) : onAskDelete(m.id))}>
            {confirmId === m.id ? '确认删' : '删'}
          </button>
        </div>))}
    </div>);
}
function MealDayCard({ entry, open, onToggle, confirmId, onAskDelete, onDelete }) {
    return (<div className="card">
      <button className="lb-day" onClick={onToggle} aria-expanded={open}>
        <span className="lb-date num">{entry.date.slice(5)}</span>
        <span className="lb-week">{entry.dayName}</span>
        <span className="lb-title">{entry.meals.map((m) => m.name).join('、')}</span>
        <span className="lb-caret">{open ? '▾' : '▸'}</span>
      </button>
      <div className="lb-head-line">{dayHead(entry)}</div>
      {open ? (<div style={{ marginTop: 8 }}>
          <MealRows entry={entry} confirmId={confirmId} onAskDelete={onAskDelete} onDelete={onDelete}/>
        </div>) : null}
    </div>);
}
