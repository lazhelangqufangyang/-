import { useEffect, useMemo, useState } from 'react';
import { BROWSE_AREAS, EXERCISES, byId, fitsEquipment } from '../engine/exercises.js';
import { isHomeMode } from '../engine/load.js';
import { weekdayName } from '../engine/goals.js';
import { todayIso, weekdayOf } from '../engine/time.js';
import { mondayOf, weekDates } from '../engine/weekplan.js';
import Timeline from './Timeline.jsx';
import '../training.css';

const MODE_KEY = 'fitplan.trainMode';
const AREA_SHORT = {
    chest: '胸',
    back: '背',
    shoulder: '肩',
    arm: '臂',
    leg: '腿',
    glute: '臀',
    core: '核',
    cardio: '氧'
};
const AREA_TONE = {
    chest: ['#ffe9e3', '#ffb7a4'],
    back: ['#e8efff', '#a9c4ff'],
    shoulder: ['#fff3d9', '#ffd27d'],
    arm: ['#f2e9ff', '#c9aaff'],
    leg: ['#e6f7ee', '#9bdcb8'],
    glute: ['#ffeaf3', '#f6b0cc'],
    core: ['#eef1f5', '#c8d0dd'],
    cardio: ['#e6f8fa', '#96dfe7']
};
const TAG_OF_KIND = {
    main: ['主项', 'main'],
    compound: ['辅助复合', 'compound'],
    accessory: ['辅助', 'accessory'],
    isolation: ['孤立', 'isolation'],
    cardio: ['有氧', 'cardio'],
    ramp: ['递增热身', 'warm'],
    warmupGeneral: ['热身', 'warm'],
    warmupMobility: ['活动度', 'warm'],
    cooldown: ['放松', 'warm']
};
const QUICK_FALLBACK = ['bench-press', 'lat-pulldown', 'leg-press', 'face-pull', 'db-fly', 'plank'];

function Icon({ name, size = 18, className = '' }) {
    const p = {
        plus: <path d="M12 5v14M5 12h14"/>,
        arrow: <><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></>,
        chevron: <path d="m9 5 7 7-7 7"/>,
        search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
        clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></>,
        dumbbell: <><path d="M4 9.5v5M7.5 7v10M16.5 7v10M20 9.5v5M7.5 12h9"/></>,
        calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></>,
        heart: <path d="M12 20s-7-4.35-7-9.3A3.9 3.9 0 0 1 12 7.9a3.9 3.9 0 0 1 7 2.8C19 15.65 12 20 12 20Z"/>,
        check: <path d="m5 12.5 4.3 4.3L19 7"/>,
        spark: <><path d="m12 2.8 1.8 5.2 5.2 1.8-5.2 1.8L12 16.8l-1.8-5.2L5 9.8l5.2-1.8L12 2.8Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
        edit: <><path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17 4 20Z"/><path d="m14.8 7.4 2.8 2.8"/></>,
        moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5Z"/>,
        flame: <path d="M13.5 2.8c.5 3.1-2.2 4.4-2.8 7.1-.3-1.7-1.4-2.7-2.5-3.6-.3 1.7-1.1 2.7-2 4.1a5.7 5.7 0 1 0 9.8 4.4c.6-4.6-2.6-7.7-2.5-12Z"/>
    }[name];
    return <svg className={`ticon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>;
}

function areaOf(ex) {
    return BROWSE_AREAS.find((a) => a.test(ex))?.key ?? 'core';
}
function doseText(ex) {
    if (ex.pattern === 'cardio') return '按分钟做';
    return `${ex.sets} × ${ex.reps}`;
}
function recentExercises(logs, limit = 8) {
    const seen = new Set();
    const out = [];
    [...logs]
        .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.ts ?? '').localeCompare(String(a.ts ?? '')))
        .forEach((l) => {
            if (!l?.exId || seen.has(l.exId)) return;
            const ex = byId(l.exId);
            if (!ex) return;
            seen.add(l.exId);
            out.push(ex);
        });
    return out.slice(0, limit);
}
function quickExercises(logs, favorites) {
    const out = [];
    const seen = new Set();
    const add = (ex) => {
        if (!ex || seen.has(ex.id)) return;
        seen.add(ex.id);
        out.push(ex);
    };
    recentExercises(logs, 8).forEach(add);
    favorites.map(byId).filter(Boolean).forEach(add);
    QUICK_FALLBACK.map(byId).filter(Boolean).forEach(add);
    EXERCISES.filter((ex) => ex.heavy).forEach(add);
    return out.slice(0, 8);
}

function ModeTabs({ mode, onChange }) {
    return (<div className="train-seg" role="tablist" aria-label="训练模式">
      <span className={`train-seg-thumb${mode === 'free' ? ' free' : ''}`} aria-hidden="true"/>
      <button type="button" role="tab" aria-selected={mode === 'plan'} className={mode === 'plan' ? 'on' : ''} onClick={() => onChange('plan')}>
        按周计划
      </button>
      <button type="button" role="tab" aria-selected={mode === 'free'} className={mode === 'free' ? 'on' : ''} onClick={() => onChange('free')}>
        自由训练
      </button>
    </div>);
}

function MoveThumb({ ex, large = false }) {
    const key = areaOf(ex);
    const [a, b] = AREA_TONE[key] ?? AREA_TONE.core;
    return (<span className={`move-thumb${large ? ' large' : ''}`} style={{ '--tone-a': a, '--tone-b': b }} aria-hidden="true">
      <span className="move-thumb-word">{AREA_SHORT[key] ?? '练'}</span>
      <Icon name="dumbbell" size={large ? 28 : 21} className="move-thumb-ico"/>
    </span>);
}

function WeekStrip({ weekPlan, today, selected, onSelect }) {
    const dates = weekPlan ? weekDates(weekPlan.weekStart) : weekDates(mondayOf(today));
    return (<div className="week-strip" role="tablist" aria-label="本周日期">
      {dates.map((date) => {
          const d = weekPlan?.days?.[date];
          const role = d?.role || (d ? '训练' : weekPlan ? '休' : '—');
          const cls = ['week-day', date === today ? 'today' : '', date === selected ? 'selected' : '', d ? 'has-plan' : 'rest'].filter(Boolean).join(' ');
          return (<button key={date} type="button" role="tab" aria-selected={date === selected} className={cls} onClick={() => onSelect(date)}>
            <span className="week-day-name">{weekdayName(weekdayOf(date)).slice(1)}</span>
            <span className="week-day-num num">{Number(date.slice(8))}</span>
            <span className="week-day-role">{role}</span>
          </button>);
      })}
    </div>);
}

function RestCard({ today = false }) {
    return (<div className="rest-card">
      <span className="rest-icon"><Icon name="moon" size={22}/></span>
      <div>
        <b>{today ? '今天是休息日' : '这天不排训练'}</b>
        <p>睡够、走走路，让身体把上一次训练变成进步。</p>
      </div>
    </div>);
}

function PreviewList({ day }) {
    const ids = day?.exerciseIds ?? [];
    if (!ids.length) return <RestCard/>;
    return (<div className="preview-list">
      {ids.map((id, i) => {
          const ex = byId(id);
          if (!ex) return null;
          const tag = TAG_OF_KIND[ex.kind] ?? TAG_OF_KIND[ex.pattern] ?? ['动作', 'accessory'];
          return (<div className="preview-card" key={id}>
            <span className={`preview-index${ex.heavy || ex.kind === 'compound' ? ' main' : ''}`}>{i + 1}</span>
            <div className="preview-main">
              <div className="preview-name">
                <b>{ex.name}</b>
                <span className={`slot-role ${tag[1]}`}>{tag[0]}</span>
              </div>
              <span className="preview-meta">{ex.muscles.slice(0, 2).join(' · ')} · {ex.equipment[0]}</span>
            </div>
            <span className="preview-dose num">{doseText(ex)}</span>
          </div>);
      })}
    </div>);
}

function PlanToday({ sheet, weekPlan, selected, today, profile, onSelect, onSkip, onReorder, onGoPlan }) {
    const isToday = selected === today;
    const day = weekPlan?.days?.[selected] ?? null;
    const ids = day?.exerciseIds ?? [];
    const visible = sheet ? sheet.slots.filter((x) => !sheet.skipped.includes(x.id)) : [];
    const count = isToday ? (sheet ? visible.length : ids.length) : ids.length;
    const sets = isToday && sheet
        ? visible.reduce((n, x) => n + x.setPlan.length, 0)
        : ids.reduce((n, id) => n + (byId(id)?.sets ?? 0), 0);
    const focus = (isToday ? sheet?.focus : null) || day?.focus || (isToday ? '自由安排' : '休息日');
    return (<section className="plan-today">
      <div className="plan-heading">
        <div className="plan-title-wrap">
          <span className="train-eyebrow">{isToday ? 'TODAY' : 'PLAN'}</span>
          <h2>
            {isToday ? '今日计划' : `${weekdayName(weekdayOf(selected))}的计划`}
            <span className="plan-focus-inline">{focus}</span>
          </h2>
        </div>
        {isToday ? (<button type="button" className="adjust-link" onClick={onGoPlan}>
            <Icon name="edit" size={14}/>
            调整
          </button>) : null}
      </div>
      <div className="plan-meta-line">
        <span className="plan-count num">{count} 个动作 · {sets} 组</span>
        {isToday ? <span className="mini-chip accent">今天</span> : <button type="button" className="mini-chip" onClick={() => onSelect(today)}>回到今天</button>}
      </div>
      {isToday
        ? (sheet ? <Timeline sheet={sheet} profile={profile} onSkip={onSkip} onReorder={onReorder} minimal/> : <RestCard today/>)
        : (day ? <PreviewList day={day}/> : <RestCard/>)}
    </section>);
}

function EmptyPlan({ profile, onGenerate, onStartDirect }) {
    const ready = Boolean(profile?.goal);
    return (<section className="empty-plan">
      <div className="empty-orb" aria-hidden="true">
        <span className="empty-ring r1"/>
        <span className="empty-ring r2"/>
        <span className="empty-ring r3"/>
        <span className="empty-bar b1"/>
        <span className="empty-bar b2"/>
        <span className="empty-bar b3"/>
        <span className="empty-bar b4"/>
      </div>
      <div className="empty-copy">
        <span className="empty-eyebrow">WEEKLY PLAN</span>
        <h2>你还没有<br/>本周计划</h2>
        <p>{ready ? '用 30 秒排好这一周：练几天、每天练什么、每组多重。' : '先补一句目标，我们再按你的器械和时间排。'}</p>
        <button type="button" className="empty-generate" onClick={onGenerate}>
          <Icon name="spark" size={17}/>
          {ready ? '一键生成周计划' : '完善档案，生成计划'}
        </button>
        <button type="button" className="empty-free" onClick={onStartDirect}>先自由练一次 <Icon name="arrow" size={14}/></button>
      </div>
    </section>);
}

function MoveCarousel({ title, subtitle, items, picked, onToggle, onGoMoves }) {
    return (<section className="home-section">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button type="button" className="text-btn" onClick={onGoMoves}>全部动作 <Icon name="chevron" size={13}/></button>
      </div>
      <div className="move-scroll">
        {items.map((ex) => {
            const on = picked.includes(ex.id);
            return (<button key={ex.id} type="button" className={`move-tile${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onToggle(ex.id)}>
              <MoveThumb ex={ex}/>
              <span className="move-tile-name">{ex.name}</span>
              <span className="move-tile-meta">{ex.muscles[0]} · {doseText(ex)}</span>
              <span className={`move-tile-add${on ? ' on' : ''}`}>{on ? <Icon name="check" size={14}/> : <Icon name="plus" size={14}/>}</span>
            </button>);
        })}
      </div>
    </section>);
}

function FreeHero({ onStart }) {
    return (<section className="free-hero">
      <div className="free-hero-glow" aria-hidden="true"/>
      <div className="free-hero-head">
        <span className="train-eyebrow">FREESTYLE</span>
        <span className="free-tag">无计划</span>
      </div>
      <h2>今天想练什么，<br/>就练什么。</h2>
      <p>不排周计划，直接开一张空表。动作可以边练边加，记下的每一组都会留在历史里。</p>
      <button type="button" className="free-start" onClick={onStart}>
        <span className="free-plus"><Icon name="plus" size={20}/></span>
        <span className="free-start-copy">
          <b>快速开始空训练</b>
          <small>不挑动作，先动起来</small>
        </span>
        <span className="free-start-arrow"><Icon name="arrow" size={18}/></span>
      </button>
    </section>);
}

function FreeMode({ profile, logs, favorites, picked, onTogglePick, onStartDirect, onGoMoves }) {
    const [query, setQuery] = useState('');
    const [area, setArea] = useState('all');
    const [showAll, setShowAll] = useState(false);
    const home = isHomeMode(profile);
    const quick = useMemo(() => quickExercises(logs, favorites), [logs, favorites]);
    const recent = useMemo(() => recentExercises(logs, 8), [logs]);
    const title = recent.length ? '经常练的动作' : favorites.length ? '收藏的动作' : '推荐动作';
    const subtitle = recent.length ? '最近练过的，一点就加进今天' : favorites.length ? '你喜欢练的，一点就加进今天' : '从全身复合动作开始，比较不容易白练';

    const tabs = [{ key: 'all', label: '全部' }, ...BROWSE_AREAS.map((a) => ({ key: a.key, label: a.title.replace('训练', '') }))];
    const list = useMemo(() => {
        const q = query.trim();
        const hit = (ex) => !q || `${ex.name} ${ex.muscles.join('')} ${ex.equipment.join('')}`.includes(q);
        return EXERCISES.filter((ex) => (area === 'all' || areaOf(ex) === area) && hit(ex));
    }, [query, area]);
    const shown = query.trim() ? list.slice(0, 40) : list.slice(0, showAll ? 200 : 14);

    return (<div className="free-mode">
      <FreeHero onStart={onStartDirect}/>

      {picked.length ? (<div className="current-picks">
        <div className="current-picks-head">
          <b>本次训练</b>
          <span className="num">{picked.length} 个动作</span>
        </div>
        <div className="picked-chips">
          {picked.map((id) => {
              const ex = byId(id);
              if (!ex) return null;
              return (<button key={id} type="button" className="picked-chip" onClick={() => onTogglePick(id)} aria-label={`从本次训练去掉 ${ex.name}`}>
                {ex.name}<Icon name="plus" size={12} className="picked-x"/>
              </button>);
          })}
        </div>
      </div>) : null}

      <MoveCarousel title={title} subtitle={subtitle} items={quick} picked={picked} onToggle={onTogglePick} onGoMoves={onGoMoves}/>

      <section className="home-section library">
        <div className="section-heading">
          <div>
            <h2>全部动作库</h2>
            <p>按部位找，点一下加入本次训练</p>
          </div>
          <span className="lib-total num">{EXERCISES.length} 个</span>
        </div>
        <div className="lib-search">
          <Icon name="search" size={18}/>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜动作、肌肉或器械" aria-label="搜索动作"/>
          {query ? <button type="button" className="lib-clear" aria-label="清空搜索" onClick={() => setQuery('')}>×</button> : null}
        </div>
        <div className="lib-tabs" role="tablist" aria-label="动作部位">
          {tabs.map((t) => (<button key={t.key} type="button" role="tab" aria-selected={area === t.key} className={area === t.key ? 'on' : ''} onClick={() => { setArea(t.key); setShowAll(false); }}>
            {t.label}
          </button>))}
        </div>
        <div className="lib-list">
          {shown.map((ex) => {
              const usable = fitsEquipment(ex, home);
              const on = picked.includes(ex.id);
              return (<button key={ex.id} type="button" className={`lib-row${on ? ' on' : ''}${usable ? '' : ' off'}`} disabled={!usable} aria-pressed={on} onClick={() => onTogglePick(ex.id)}>
                <MoveThumb ex={ex}/>
                <span className="lib-main">
                  <span className="lib-name">
                    {ex.name}
                    {favorites.includes(ex.id) ? <Icon name="heart" size={12} className="lib-heart"/> : null}
                  </span>
                  <span className="lib-sub">{ex.muscles.slice(0, 2).join(' · ')} · {ex.equipment.join(' / ')}{usable ? '' : ' · 器械条件不符'}</span>
                </span>
                <span className="lib-dose num">{doseText(ex)}</span>
                <span className={`lib-add${on ? ' on' : ''}`}>{on ? <Icon name="check" size={15}/> : <Icon name="plus" size={15}/>}</span>
              </button>);
          })}
          {!list.length ? <div className="lib-empty">没搜到这个动作，换个词试试。</div> : null}
        </div>
        {!query.trim() && list.length > shown.length && !showAll ? (<button type="button" className="lib-more" onClick={() => setShowAll(true)}>
          展开全部 {list.length} 个动作 <Icon name="chevron" size={14}/>
        </button>) : null}
      </section>
    </div>);
}

export default function TrainingHome({
    profile,
    sheet,
    weekPlan,
    favorites,
    logs,
    picked,
    onSkip,
    onReorder,
    onRegenerateFramework,
    onStart,
    onStartDirect,
    onGoPlan,
    onGoSetup,
    onGoMoves,
    onTogglePick
}) {
    const today = todayIso();
    const [mode, setMode] = useState(() => {
        try {
            return localStorage.getItem(MODE_KEY) === 'free' ? 'free' : 'plan';
        }
        catch {
            return 'plan';
        }
    });
    const [selected, setSelected] = useState(today);
    useEffect(() => {
        try {
            localStorage.setItem(MODE_KEY, mode);
        }
        catch {
            /* 本地存储不可用时模式照常切换 */
        }
    }, [mode]);
    useEffect(() => {
        const dates = weekPlan ? weekDates(weekPlan.weekStart) : [];
        if (dates.length && !dates.includes(selected)) setSelected(today);
    }, [weekPlan, selected, today]);

    const hasPlan = Boolean(weekPlan && weekPlan.days && Object.values(weekPlan.days).some((d) => d?.exerciseIds?.length));
    const todayDay = weekPlan?.days?.[today] ?? null;
    const quick = useMemo(() => quickExercises(logs, favorites), [logs, favorites]);
    const recent = useMemo(() => recentExercises(logs, 8), [logs]);
    const planSticky = mode === 'plan' && hasPlan && (Boolean(sheet) || Boolean(todayDay?.exerciseIds?.length));
    const freeLike = mode === 'free' || (!hasPlan && picked.length > 0);
    const freeSticky = freeLike && picked.length > 0;
    const sticky = planSticky || freeSticky;
    const canStartToday = Boolean(sheet) || Boolean(todayDay?.exerciseIds?.length);
    const handleGenerate = () => {
        if (profile?.goal) onRegenerateFramework();
        else onGoSetup();
    };
    const quickTitle = recent.length ? '最近练过' : favorites.length ? '收藏动作' : '推荐动作';
    const quickSubtitle = recent.length ? '上次练过的，点一下加进今天' : favorites.length ? '你喜欢练的，点一下加进今天' : '从复合动作开始，比较不容易白练';

    return (<div className={`training-home${sticky ? ' has-sticky' : ''}`}>
      <ModeTabs mode={mode} onChange={setMode}/>

      <div className="train-panel" key={mode}>
        {mode === 'plan' ? (<>
          <WeekStrip weekPlan={weekPlan} today={today} selected={selected} onSelect={setSelected}/>
          {hasPlan ? (<>
            <PlanToday sheet={sheet} weekPlan={weekPlan} selected={selected} today={today} profile={profile} onSelect={setSelected} onSkip={onSkip} onReorder={onReorder} onGoPlan={onGoPlan}/>
            <MoveCarousel title={quickTitle} subtitle={quickSubtitle} items={quick} picked={picked} onToggle={onTogglePick} onGoMoves={onGoMoves}/>
          </>) : (<>
            <EmptyPlan profile={profile} onGenerate={handleGenerate} onStartDirect={onStartDirect}/>
            <MoveCarousel title={quickTitle} subtitle={quickSubtitle} items={quick} picked={picked} onToggle={onTogglePick} onGoMoves={onGoMoves}/>
            <div className="empty-footnote">
              <Icon name="flame" size={15}/>
              先练起来也可以：生成的计划随时能在「改计划」里重排。
            </div>
          </>)}
        </>) : (<FreeMode profile={profile} logs={logs} favorites={favorites} picked={picked} onTogglePick={onTogglePick} onStartDirect={onStartDirect} onGoMoves={onGoMoves}/>)}
      </div>

      {sticky ? (<div className="cta-dock">
        <button type="button" className="cta-main" onClick={freeLike ? onStartDirect : onStart} disabled={!freeLike && !canStartToday}>
          <span className="cta-main-copy">
            <b>
              {freeLike ? '开始自由训练' : '开始今日训练'}
              {!freeLike && sheet ? <span className="cta-count"> ({sheet.slots.filter((x) => !sheet.skipped.includes(x.id)).length} 个动作)</span> : null}
            </b>
            <small>{freeLike
                ? `${picked.length} 个动作 · 练到哪算哪`
                : (sheet ? `${sheet.slots.filter((x) => !sheet.skipped.includes(x.id)).reduce((n, x) => n + x.setPlan.length, 0)} 组 · 今天` : '按今天的计划开始')}</small>
          </span>
          <span className="cta-main-arrow"><Icon name="arrow" size={20}/></span>
        </button>
      </div>) : null}
      {sticky ? <div className="cta-spacer" aria-hidden="true"/> : null}
    </div>);
}
