import { useMemo, useRef, useState } from 'react';
import { MEAL_LABELS } from '../types.js';
import { addDaysIso, todayIso, uid } from '../engine/time.js';
import { buildDays, dietScopeNote, dietTargets, macroLines, macroTargets, rangeDiet, verdict } from '../engine/diet.js';
import { estimateMeal, NUTRIENTS, searchFoods } from '../engine/foodHints.js';
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
/** 小环形缺口图：已吃 vs 目标 */
function RingGauge({ value, target, label, unit }) {
    const size = 88;
    const stroke = 8;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const ratio = target && target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
    const offset = c * (1 - ratio);
    const over = value > target && target > 0;
    return (<div className="ring">
      <svg width={size} height={size}>
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} fill="none"/>
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? 'var(--warn)' : 'var(--accent)'} strokeDasharray={c} strokeDashoffset={offset}/>
      </svg>
      <div className="ring-text">
        <span className="num">
          {value?.toLocaleString('zh-CN') ?? '—'}
        </span>
        <small>{unit ?? label}</small>
      </div>
    </div>);
}
/** 胶囊进度条 */
function CapBar({ label, value, target, unit }) {
    if (target == null)
        return null;
    const pct = value != null && target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
    const over = value != null && value > target;
    const displayVal = value != null ? value.toLocaleString('zh-CN') : '—';
    const displayTarget = target.toLocaleString('zh-CN');
    return (<div className="cap-row">
      <span className="cap-label">{label}</span>
      <div className="cap-track">
        <div className={`cap-fill${over ? ' over' : ''}`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="cap-num">
        {displayVal} / {displayTarget} {unit}
      </span>
    </div>);
}
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
    // 今天已摄入
    const todayKcal = todayEntry?.kcal ?? null;
    const todayProtein = todayEntry?.proteinG ?? null;
    const todayCarbs = todayEntry?.carbsG ?? null;
    const todayFat = todayEntry?.fatG ?? null;
    const todaySugar = todayEntry?.sugarG ?? null;
    const todaySodium = todayEntry?.sodiumMg ?? null;
    const proteinTarget = targets.protein ? Math.round((targets.protein[0] + targets.protein[1]) / 2) : null;
    const carbsTarget = macros.carbs ? Math.round((macros.carbs[0] + macros.carbs[1]) / 2) : null;
    const fatTarget = macros.fat ? Math.round((macros.fat[0] + macros.fat[1]) / 2) : null;
    return (<div>
      <div className="card">
        <h3>你的热量参考</h3>
        {targets.target === null ? (<>
          <div className="sk" style={{ height: 34, width: 160 }}/>
          <div className="sk" style={{ height: 14, width: 220, marginTop: 8 }}/>
          <div className="sk" style={{ height: 14, width: 180, marginTop: 4 }}/>
          <div className="dt-bubble" onClick={onGoProfile}>
            <span className="dt-bubble-ico">✎</span>
            <span className="dt-bubble-text">
              <b>立即完善档案</b>
              <small>{targets.basis ?? '填上身高体重、性别和年龄，算出你的专属热量参考。'}</small>
            </span>
            <span style={{ color: 'var(--accent-deep)', fontSize: 18 }}>›</span>
          </div>
        </>) : (<>
          <div className="dt-target">
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
          </div>
          <div className="ring-wrap">
            <RingGauge value={todayKcal} target={targets.target} unit="kcal"/>
            <div className="ring-info">
              {todayKcal != null ? (<>
                今天已吃 <b>{todayKcal.toLocaleString('zh-CN')}</b> kcal
                <br/>
                {todayKcal > targets.target
                  ? `超了 ${(todayKcal - targets.target).toLocaleString('zh-CN')} kcal`
                  : `还差 ${(targets.target - todayKcal).toLocaleString('zh-CN')} kcal`}
              </>) : (<>
                今天还没记热量，
                <br/>
                目标 <b>{targets.target.toLocaleString('zh-CN')}</b> kcal / 天
              </>)}
            </div>
          </div>
        </>)}
        {targets.target !== null ? (<div style={{ marginTop: 8 }}>
          <CapBar label="蛋白" value={todayProtein} target={proteinTarget} unit="g"/>
          <CapBar label="碳水" value={todayCarbs} target={carbsTarget} unit="g"/>
          <CapBar label="脂肪" value={todayFat} target={fatTarget} unit="g"/>
          <CapBar label="糖" value={todaySugar} target={macros.sugarMax} unit="g"/>
          <CapBar label="钠" value={todaySodium} target={macros.sodiumMax} unit="mg"/>
        </div>) : null}
      </div>

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
      <div className="ft-cards">
        {shown.map((h) => {
            const range = h.nut[nut];
            return (<div className="ft-card" key={h.label}>
              <div className="ft-card-l">
                <b>{h.label}</b>
                <em>{h.portion}</em>
              </div>
              <div className="ft-card-r">
                <span className="ft-card-kcal num">{h.low}–{h.high}<small>kcal</small></span>
                <span className="ft-card-nut num">{range ? `${range[0]}–${range[1]}` : '—'}<small>{meta.label}</small></span>
              </div>
            </div>);
        })}
      </div>
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
