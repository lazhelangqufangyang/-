import { useMemo, useState } from 'react';
import { measureByDay, measureStats, measureTargetBand, measureVerdict, sparkLine } from '../engine/measure.js';
import { todayIso, uid } from '../engine/time.js';
const KG_MIN = 20;
const KG_MAX = 400;
const CM_MIN = 30;
const CM_MAX = 250;
const METRICS = [
    { key: 'weightKg', label: '体重', unit: 'kg' },
    { key: 'waistCm', label: '腰围', unit: 'cm' }
];
/** 折线画在 0..100 的盒子里，靠 CSS 拉宽，不管真实像素 */
function Spark({ line, label, unit }) {
    if (line.empty) {
        return (<div className="ms-empty">
        {label}记够两次才有线：单一次看不出门道。
      </div>);
    }
    const last = line.points.at(-1);
    return (<div>
      <div className="ms-spark">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={line.polyline} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
        </svg>
        <span className="ms-edge top num">
          {line.max} {unit}
        </span>
        <span className="ms-edge bottom num">
          {line.min} {unit}
        </span>
        <span className="ms-last num">
          最近 {last.value} {unit}
        </span>
      </div>
      <div className="ms-axis num">
        <span>{line.from.slice(5)} 起</span>
        <span>{line.to.slice(5)}</span>
      </div>
    </div>);
}
export default function MeasureCard({ measures, goal, profileWeight, onAdd, onRemoveDay, onSyncWeight }) {
    const today = todayIso();
    const stats = useMemo(() => measureStats(measures, today), [measures, today]);
    const judge = useMemo(() => measureVerdict(stats, goal), [stats, goal]);
    const band = measureTargetBand(stats, goal);
    const recent = useMemo(() => measureByDay(measures).slice().reverse().slice(0, 5), [measures]);
    const [metric, setMetric] = useState('weightKg');
    const line = useMemo(() => sparkLine(measures, metric, today), [measures, metric, today]);
    const active = METRICS.find((m) => m.key === metric);
    const [date, setDate] = useState(today);
    const [w, setW] = useState('');
    const [cm, setCm] = useState('');
    const [err, setErr] = useState('');
    const [confirmDay, setConfirmDay] = useState('');
    const inRange = (raw, lo, hi) => {
        if (raw.trim() === '')
            return { v: null, bad: false };
        const n = Number(raw);
        if (!Number.isFinite(n))
            return { v: null, bad: true };
        const v = Math.round(n * 10) / 10;
        return { v, bad: v < lo || v > hi };
    };
    const save = () => {
        const kg = inRange(w, KG_MIN, KG_MAX);
        const waist = inRange(cm, CM_MIN, CM_MAX);
        if (kg.bad || waist.bad) {
            setErr(`体重填 ${KG_MIN}–${KG_MAX} 之间的公斤数，腰围填 ${CM_MIN}–${CM_MAX} 之间的厘米数。`);
            return;
        }
        if (kg.v === null && waist.v === null) {
            setErr('体重和腰围至少填一个。');
            return;
        }
        onAdd({
            id: uid('mea'),
            // 手滑选到明天以后就贴回今天，别让未来的数先进平均
            date: date > today || !/^\d{4}-\d{2}-\d{2}$/.test(date) ? today : date,
            weightKg: kg.v,
            waistCm: waist.v,
            ts: new Date().toISOString()
        });
        setW('');
        setCm('');
        setErr('');
    };
    const shown = [
        stats.avg7.avg !== null ? `近 7 天平均 ${stats.avg7.avg} kg` : '',
        stats.avgPrev7.avg !== null ? `上一个 7 天 ${stats.avgPrev7.avg} kg` : '',
        stats.weeklyKg !== null ? `一周 ${stats.weeklyKg > 0 ? '+' : ''}${stats.weeklyKg} kg` : '',
        stats.waistDelta !== null ? `腰围比最早那次 ${stats.waistDelta > 0 ? '+' : ''}${stats.waistDelta} cm` : '',
        stats.basis ? `按${stats.basis}算` : ''
    ].filter(Boolean);
    const latestKg = stats.latest?.weightKg ?? null;
    return (<div className="card">
      <div className="lb-head">
        <h3 style={{ margin: 0 }}>身体数据</h3>
        <span className="faint small num">
          {stats.count ? `已打卡 ${stats.count} 天` : '一次都还没记'}
        </span>
      </div>

      {stats.latest ? (<div className="ms-now">
          <span className="ms-big num">
            {latestKg ?? '—'}
            <em>kg</em>
          </span>
          <span className="ms-big num">
            {stats.latest.waistCm ?? '—'}
            <em>cm</em>
          </span>
          <span className="ms-when">
            {stats.latest.date.slice(5)} {stats.latest.dayName}
          </span>
        </div>) : null}

      <div className={`ms-verdict${judge.tone === 'warn' ? ' warn' : judge.tone === 'ok' ? ' good' : ''}`}>
        {judge.text}
      </div>
      {shown.length ? (<div className="ms-shown">
          {shown.map((s) => (<span key={s} className="ms-chip num">
              {s}
            </span>))}
        </div>) : null}
      {band ? (<div className="faint small" style={{ marginTop: 6 }}>
          按你这个目标的节奏，4 周后的平均体重参考落点 {band[0]}–{band[1]} kg。没落到不算失败，水分一周里就能差两公斤。
        </div>) : null}

      <div className="chips" style={{ marginTop: 10 }}>
        {METRICS.map((m) => (<button key={m.key} className="chip" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
            {m.label}
          </button>))}
      </div>
      <Spark line={line} label={active.label} unit={active.unit}/>

      <div className="ms-form">
        <div className="field">
          <label>哪天称的</label>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)}/>
        </div>
        <div className="field">
          <label>体重 kg（可空）</label>
          <input value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" placeholder="例：76.4"/>
        </div>
        <div className="field">
          <label>腰围 cm（可空）</label>
          <input value={cm} onChange={(e) => setCm(e.target.value)} inputMode="decimal" placeholder="肚脐一圈，例：88"/>
        </div>
        <div className="btnbar">
          <button className="btn primary" onClick={save}>
            记下这次
          </button>
          {latestKg !== null && profileWeight !== latestKg ? (<button className="btn ghost" onClick={() => onSyncWeight(latestKg)}>
              把档案体重改成 {latestKg} kg
            </button>) : null}
        </div>
        {err ? <div className="missing">{err}</div> : null}
      </div>

      {recent.length ? (<div className="lb-lines">
          {recent.map((r) => (<div className="lb-line" key={r.date}>
              <span className="lb-lname num">
                {r.date.slice(5)} {r.dayName}
              </span>
              <span className="lb-lsets num">
                {r.weightKg !== null ? `${r.weightKg} kg` : '体重没填'}
              </span>
              <span className="lb-ltop">
                {r.waistCm !== null ? `腰围 ${r.waistCm} cm` : ''}
              </span>
              <button className={`lb-del${confirmDay === r.date ? ' on' : ''}`} onClick={() => setConfirmDay(confirmDay === r.date ? '' : r.date)}>
                {confirmDay === r.date ? '确认删' : '删'}
              </button>
            </div>))}
        </div>) : null}
      {confirmDay ? (<div className="btnbar" style={{ marginTop: 8 }}>
          <button className="btn danger" onClick={() => {
                onRemoveDay(confirmDay);
                setConfirmDay('');
            }}>
            删掉 {confirmDay.slice(5)} 的打卡
          </button>
          <button className="btn ghost" onClick={() => setConfirmDay('')}>
            不删
          </button>
        </div>) : null}
    </div>);
}
