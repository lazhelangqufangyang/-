import { useEffect, useMemo, useRef, useState } from 'react';
import { readPlan, sessionToken } from '../api/account.js';
import { addDaysIso, todayIso, uid } from '../engine/time.js';
import { buildEntries } from '../engine/logbook.js';
import {
    bodyTrend,
    bucketStats,
    dailyBuckets,
    strengthTrends,
    weeklyBuckets,
    weeklyReport
} from '../engine/trends.js';
import './trends.css';

function md(iso) {
    return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}
function fmtTonnage(v) {
    if (!v)
        return '—';
    return v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;
}
function signed(v, unit = '') {
    if (v === null || v === undefined)
        return '—';
    return `${v >= 0 ? '+' : ''}${v}${unit}`;
}

function BarChart({ data, metric, caption }) {
    const pick = metric === 'tonnage' ? (d) => d.tonnage : (d) => d.sessions;
    const max = Math.max(1, ...data.map(pick));
    return (<>
      <div className="tr-bars" role="img" aria-label={caption}>
        {data.map((d, i) => {
            const value = pick(d);
            const showLabel = data.length <= 7 || i % 2 === 0 || i === data.length - 1;
            return (<div key={d.start} className="tr-bar-col" title={`${d.start} 到 ${d.end} · ${d.sessions} 天 · ${d.tonnage} kg`}>
              <span className="tr-bar-val">{value ? (metric === 'tonnage' ? fmtTonnage(value) : value) : ''}</span>
              <span className="tr-bar-track"><i style={{ height: `${Math.max(3, (value / max) * 100)}%` }}/></span>
              <span className="tr-bar-lab">{showLabel ? d.label : ''}</span>
            </div>);
        })}
      </div>
      <div className="tr-chart-cap">{caption}</div>
    </>);
}

function LineChart({ points, name }) {
    if (points.length < 2)
        return <div className="tr-line-empty">至少要有两个点才能画出走势。</div>;
    const width = 320;
    const height = 108;
    const pad = 12;
    const values = points.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max - min < 1) {
        min -= 1;
        max += 1;
    }
    const x = (i) => pad + (i * (width - pad * 2)) / (points.length - 1);
    const y = (v) => pad + ((max - v) / (max - min)) * (height - pad * 2);
    const path = points
        .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
        .join(' ');
    return (<svg className="tr-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${name}趋势`}>
      {[0, 0.5, 1].map((t) => (<line key={t} className="tr-line-grid" x1={pad} x2={width - pad} y1={pad + t * (height - pad * 2)} y2={pad + t * (height - pad * 2)}/>))}
      <path className="tr-line-path" d={path}/>
      {points.map((p, i) => (<circle key={p.start} className="tr-line-dot" cx={x(i)} cy={y(p.value)} r="3.2"/>))}
      <text className="tr-line-text" x={pad} y={height - 1}>{points[0].label}</text>
      <text className="tr-line-text" x={width - pad} y={height - 1} textAnchor="end">{points[points.length - 1].label}</text>
    </svg>);
}

function MeasureForm({ today, existing, onSave }) {
    const [weight, setWeight] = useState(existing?.weightKg ?? '');
    const [waist, setWaist] = useState(existing?.waistCm ?? '');
    const [msg, setMsg] = useState('');
    const lastDate = useRef(existing?.date ?? null);
    useEffect(() => {
        // 同一天保存后 existing 也会变；这时保留输入和确认文案，不要清空
        if (lastDate.current === existing?.date)
            return;
        lastDate.current = existing?.date ?? null;
        setWeight(existing?.weightKg ?? '');
        setWaist(existing?.waistCm ?? '');
        setMsg('');
    }, [existing?.date, existing?.weightKg, existing?.waistCm]);
    const save = () => {
        const w = weight === '' ? null : Number(weight);
        const c = waist === '' ? null : Number(waist);
        if (w === null && c === null) {
            setMsg('至少填体重或腰围其中一项。');
            return;
        }
        if ((w !== null && (!Number.isFinite(w) || w <= 0 || w > 400))
            || (c !== null && (!Number.isFinite(c) || c <= 0 || c > 300))) {
            setMsg('数值看起来不对，检查一下再存。');
            return;
        }
        onSave({ id: uid('measure'), date: today, weightKg: w, waistCm: c, note: '' });
        setMsg('已记下今天这次。');
    };
    return (<div className="card tr-measure">
      <div className="tr-sec-head">
        <h3>今天的体重 / 腰围</h3>
        <span className="faint small">同一天再存会覆盖今天这条</span>
      </div>
      <div className="tr-measure-row">
        <label>
          <span>体重 kg</span>
          <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="例如 72.5"/>
        </label>
        <label>
          <span>腰围 cm（可选）</span>
          <input type="number" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="例如 82"/>
        </label>
        <button type="button" className="btn primary" onClick={save}>记下</button>
      </div>
      {msg ? <div className="notice" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>);
}

function ProLock({ loggedIn, price, onGoAccount }) {
    return (<div className="card tr-lock">
      <div className="tr-lock-top">
        <span className="tr-lock-tag">PRO</span>
        <b>长期趋势与每周报告</b>
      </div>
      <p className="small muted">
        免费版保留最近 7 天。升级 Pro 后能看近 12 周的容量、力量与体重趋势，以及每 7 天自动生成的报告。
      </p>
      <div className="tr-lock-row">
        <span className="tr-lock-price">¥{price?.yuan ?? 8} / {price?.days ?? 30} 天</span>
        <button type="button" className="btn primary" onClick={onGoAccount}>
          {loggedIn ? '去升级 Pro' : '登录后升级 Pro'}
        </button>
      </div>
      <p className="tr-lock-hint">数据一直留在本机；Pro 只解锁查看和云端备份。</p>
    </div>);
}

function ReportCard({ report, offset, onOffsetChange }) {
    const labels = ['最近 7 天', '上一个 7 天', '两周前', '三周前'];
    return (<section className="card tr-report">
      <div className="tr-report-head">
        <div>
          <small>WEEKLY REVIEW</small>
          <h2>周报</h2>
          <span className="faint small">{md(report.from)}–{md(report.to)}</span>
        </div>
        <span className="tr-report-mark">7D</span>
      </div>

      <div className="tr-report-tabs" role="tablist" aria-label="选择周报区间">
        {labels.map((label, i) => (<button
          key={label}
          type="button"
          role="tab"
          aria-selected={offset === i}
          className={offset === i ? 'on' : ''}
          onClick={() => onOffsetChange(i)}>
          {label}
        </button>))}
      </div>

      <div className="tr-report-sec">
        <h3>训练</h3>
        <p>{report.training.text}</p>
      </div>

      {report.strength.length ? (<div className="tr-report-sec">
        <h3>力量</h3>
        {report.strength.map((s) => (<p key={s.name}>
          {s.name}：本周最佳估算 1RM {s.cur === null ? '没有数据' : `${s.cur} ${s.unit === '每手kg' ? 'kg/手' : 'kg'}`}
          {s.delta === null ? '（上一个 7 天没有可比数据）' : `（${signed(s.delta, ' kg')}）`}。
        </p>))}
      </div>) : null}

      <div className="tr-report-sec">
        <h3>饮食</h3>
        <p>{report.diet.text}</p>
      </div>

      <div className="tr-report-sec">
        <h3>体重</h3>
        <p>{report.body.text}</p>
      </div>

      {report.notes.length ? (<div className="tr-report-notes">
        <h3>这周值得注意</h3>
        <ul>
          {report.notes.map((n) => (<li key={n}>{n}</li>))}
        </ul>
      </div>) : null}

      <p className="tr-report-foot">报告只根据本机记录生成，不是医学诊断；不舒服就看医生。</p>
    </section>);
}

export default function TrendsPage({ state, onBack, onSaveMeasure }) {
    const today = todayIso();
    const [plan, setPlan] = useState(() => (sessionToken() ? null : { plan: 'free' }));
    const [reportOffset, setReportOffset] = useState(0);

    useEffect(() => {
        if (!sessionToken()) {
            setPlan({ plan: 'free' });
            return undefined;
        }
        let alive = true;
        readPlan()
            .then((p) => { if (alive)
            setPlan(p); })
            .catch(() => { if (alive)
            setPlan({ plan: 'free', unknown: true }); });
        return () => {
            alive = false;
        };
    }, []);

    const loading = plan === null;
    const isPro = plan?.plan === 'pro';
    const loggedIn = Boolean(sessionToken());
    const price = plan?.price ?? { yuan: 8, days: 30 };
    const buckets = useMemo(() => (isPro ? weeklyBuckets(today, 12) : dailyBuckets(today, 7)), [isPro, today]);
    const entries = useMemo(
        () => buildEntries(state.sheets, state.setLogs, state.activityLogs),
        [state.sheets, state.setLogs, state.activityLogs]
    );
    const stats = useMemo(() => bucketStats(entries, buckets), [entries, buckets]);
    const from = buckets[0]?.start ?? addDaysIso(today, -6);

    const summary = useMemo(() => {
        const inRange = entries.filter((e) => e.date >= from && e.date <= today);
        const dietDays = new Set(
            state.mealLogs
                .filter((m) => m.date >= from && m.date <= today && (m.kcal ?? 0) > 0)
                .map((m) => m.date)
        );
        const latestWeight = [...state.measureLogs]
            .filter((m) => typeof m.weightKg === 'number' && m.weightKg > 0)
            .sort((a, b) => a.date.localeCompare(b.date))
            .pop() ?? null;
        return {
            sessions: inRange.filter((e) => e.setCount > 0 || e.activities.length > 0).length,
            sets: inRange.reduce((n, e) => n + e.setCount, 0),
            tonnage: inRange.reduce((n, e) => n + e.tonnage, 0),
            dietDays: dietDays.size,
            latestWeight
        };
    }, [entries, state.mealLogs, state.measureLogs, from, today]);

    const strength = useMemo(
        () => (isPro ? strengthTrends(state.setLogs, buckets) : []),
        [isPro, state.setLogs, buckets]
    );
    const body = useMemo(
        () => bodyTrend(state.measureLogs, isPro ? from : addDaysIso(today, -6), today),
        [state.measureLogs, isPro, from, today]
    );
    const report = useMemo(
        () => (isPro
            ? weeklyReport({
                profile: state.profile,
                sheets: state.sheets,
                setLogs: state.setLogs,
                activityLogs: state.activityLogs,
                mealLogs: state.mealLogs,
                measureLogs: state.measureLogs,
                today: addDaysIso(today, -reportOffset * 7)
            })
            : null),
        [isPro, reportOffset, state.profile, state.sheets, state.setLogs, state.activityLogs, state.mealLogs, state.measureLogs, today]
    );

    const todayMeasure = [...state.measureLogs]
        .filter((m) => m.date === today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .pop() ?? null;
    const weightPoints = body.points
        .filter((p) => typeof p.weightKg === 'number' && p.weightKg > 0)
        .map((p) => ({ start: p.date, label: md(p.date), value: p.weightKg }));
    const metric = summary.tonnage > 0 ? 'tonnage' : 'sessions';
    const rangeText = isPro
        ? `近 12 周 · ${md(from)}–${md(today)}`
        : `近 7 天 · ${md(from)}–${md(today)}`;

    return (<div className="trends-page">
      <header className="tr-head">
        <button type="button" className="tr-back" onClick={onBack} aria-label="返回记录">‹</button>
        <div className="tr-title">
          <small>TRENDS & REVIEW</small>
          <h1>趋势与周报</h1>
        </div>
        <span className={`tr-plan${isPro ? ' pro' : ''}`}>
          {loading ? '读取中' : isPro ? 'Pro' : '免费版'}
        </span>
      </header>

      <main className="tr-body">
        <section className="card tr-summary">
          <div className="tr-summary-head">
            <h3>这段记录</h3>
            <span className="faint small num">{rangeText}</span>
          </div>
          <div className="tr-stats">
            <div><b className="num">{summary.sessions}</b><small>训练天数</small></div>
            <div><b className="num">{fmtTonnage(summary.tonnage)}</b><small>总容量</small></div>
            <div><b className="num">{summary.dietDays}</b><small>饮食记录天</small></div>
            <div><b className="num">{summary.latestWeight ? summary.latestWeight.weightKg : '—'}</b><small>最新体重 kg</small></div>
          </div>
          {!summary.sessions && !summary.dietDays ? (<div className="tr-empty">
              {isPro
                ? '这段时间还没有训练或饮食记录。先照常练、照常记，趋势会自己长出来。'
                : '最近 7 天还没有训练或饮食记录。先记两天饮食、练一次，这里就有东西看了。'}
            </div>) : null}
        </section>

        <section className="card">
          <div className="tr-sec-head">
            <h3>训练节奏</h3>
            <span className="faint small">{isPro ? '按周' : '按天'}</span>
          </div>
          <BarChart
            data={stats}
            metric={metric}
            caption={metric === 'tonnage' ? '柱高 = 训练容量；数字是每周/每天总量' : '柱高 = 训练天数；这段时间还没有带公斤数的记录'}/>
        </section>

        {isPro ? (<section className="card">
          <div className="tr-sec-head">
            <h3>力量趋势</h3>
            <span className="faint small">最佳估算 1RM</span>
          </div>
          {strength.length ? strength.map((s) => (<div key={s.exId} className="tr-lift">
            <div className="tr-lift-head">
              <b>{s.name}</b>
              <span className="num">
                {s.last === null ? '—' : `${s.last} ${s.unit === '每手kg' ? 'kg/手' : 'kg'}`}
                {s.changeKg !== null ? <em className={s.changeKg >= 0 ? 'up' : 'down'}>{signed(s.changeKg, ' kg')}</em> : null}
              </span>
            </div>
            <LineChart points={s.points} name={s.name}/>
          </div>)) : (<div className="tr-empty">这 12 周没有带公斤数的记录。自重动作也能记，但力量趋势需要有重量。</div>)}
        </section>) : null}

        <section className="card">
          <div className="tr-sec-head">
            <h3>体重与腰围</h3>
            <span className="faint small">{isPro ? '近 12 周' : '近 7 天'}</span>
          </div>
          {body.latest ? (<div className="tr-body-now">
            <b className="num">{body.latest.weightKg ?? '—'}</b><span>kg</span>
            {body.changeKg !== null ? <em className={body.changeKg <= 0 ? 'down' : 'up'}>{signed(body.changeKg, ' kg')}</em> : null}
            <span className="faint small">{md(body.latest.date)} 最近一次</span>
          </div>) : null}
          <LineChart
            points={weightPoints.map((p) => ({ ...p, value: p.value }))}
            name="体重"/>
        </section>

        <MeasureForm today={today} existing={todayMeasure} onSave={onSaveMeasure}/>

        {isPro && report ? (<ReportCard report={report} offset={reportOffset} onOffsetChange={setReportOffset}/>) : null}
        {!isPro ? (<ProLock
          loggedIn={loggedIn}
          price={price}
          onGoAccount={() => { window.location.hash = '#/settings/account'; }}/>) : null}

        <p className="tr-foot">
          趋势和报告只读本机记录；不会上传，也不会替你下诊断。
        </p>
      </main>
    </div>);
}