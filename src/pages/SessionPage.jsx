import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { byId, swapCandidates } from '../engine/exercises.js';
import { dropStepPlan, hasDropSet } from '../engine/day.js';
import { injuryAreas, loadInputName, loadLabel } from '../engine/load.js';
import { swapAdvice } from '../ai.js';
import EffortSlider from '../components/EffortSlider.jsx';
import { MatchaPowderReveal } from '../components/MatchaPowderReveal';
import './session.css';
import './matcha-reward.css';

/** 自重与不计重量的动作只报次数，负重动作按单位写清（片数、单手 kg 不能混成 kg） */
function loadPrefix(unit, weight) {
    if (unit === '无' || unit === '自重' || unit === undefined) return '';
    return loadLabel(unit, weight);
}
/** 组间休息写成一句建议，不给倒计时：练的时候不用看表也不用掐点 */
function restAdvice(sec) {
    if (sec >= 150) return '组间休息 2–3 分钟';
    if (sec >= 120) return '组间休息约 2 分钟';
    if (sec >= 90) return '组间休息 90 秒左右';
    return `组间休息约 ${Math.round(sec / 10) * 10} 秒`;
}
function setKey(slotId, setIdx) {
    return `${slotId}-${setIdx}`;
}
function splitSetKey(key) {
    const cut = key.lastIndexOf('-');
    return [key.slice(0, cut), Number(key.slice(cut + 1))];
}
function summaryOf(slot) {
    const head = slot.setPlan[0];
    if (!head) return slot.note ?? '';
    const weight = loadPrefix(slot.unit, head.weightKg ?? null);
    const rest = slot.restSec > 0 && slot.kind !== 'ramp' ? restAdvice(slot.restSec) : '';
    return [weight, `${slot.setPlan.length}组 × ${head.reps}次`, rest].filter(Boolean).join(' · ');
}
function setData(slot, p, rec) {
    if (p.drop) {
        if (rec?.dropSteps?.length) return rec.dropSteps.map((s) => `${s.weightKg === null ? '自重' : loadLabel(slot.unit, s.weightKg)}×${Math.max(1, s.sets)}组`).join(' ');
        return '递减组';
    }
    const weight = rec ? rec.weightKg : p.weightKg;
    const reps = rec ? rec.reps : p.reps;
    const rpe = rec ? rec.rpe : p.rpe;
    return { weight: slot.unit === '无' ? '' : loadLabel(slot.unit, weight ?? null), reps, rpe };
}

export default function SessionPage({ sheet, profile, settings, logs, onSwap, onSkip, onAddSet, onCutSet, onDropSet, onAddLogs, onExit, onGoPick }) {
    const [openKey, setOpenKey] = useState(null);
    const [draftWeight, setDraftWeight] = useState('');
    const [draftReps, setDraftReps] = useState('');
    const [draftRpe, setDraftRpe] = useState(null);
    const [dropSteps, setDropSteps] = useState([]);
    const [swapOpen, setSwapOpen] = useState(null);
    const [cutArmed, setCutArmed] = useState(null);
    const [symptom, setSymptom] = useState('');
    const [aiReasons, setAiReasons] = useState({});
    const [aiBusy, setAiBusy] = useState(false);
    const [aiNote, setAiNote] = useState('');
    const [showReward, setShowReward] = useState(false);
    const [showBadge, setShowBadge] = useState(false);
    /** 翻面卡片的背面高度：量出来再给外层，整张卡才能像纸一样翻过去 */
    const backRefs = useRef({});
    const [flipHeights, setFlipHeights] = useState({});
    useLayoutEffect(() => {
        if (!openKey)
            return undefined;
        const measure = () => {
            const el = backRefs.current[openKey];
            if (!el)
                return;
            const height = el.offsetHeight;
            if (height > 0)
                setFlipHeights((m) => (m[openKey] === height ? m : { ...m, [openKey]: height }));
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [openKey, dropSteps, draftRpe, draftReps, draftWeight]);
    const blockKey = sheet ? `fitplan.blocks.${sheet.id}` : '';
    const [blocksDone, setBlocksDone] = useState(() => {
        if (!blockKey) return [];
        try {
            const raw = localStorage.getItem(blockKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
        } catch {
            return [];
        }
    });
    useEffect(() => {
        if (blockKey) localStorage.setItem(blockKey, JSON.stringify(blocksDone));
    }, [blocksDone, blockKey]);
    useEffect(() => {
        if (!showReward) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [showReward]);
    /** 某个位置的组记过没有：按这一天认，重排换了 sheetId 也不会把记过的组看成没记 */
    const logMap = useMemo(() => {
        const m = new Map();
        if (!sheet) return m;
        const exOf = new Map(sheet.slots.map((s) => [s.id, s.exId]));
        for (const l of logs) {
            if (l.date !== sheet.date) continue;
            if (exOf.get(l.slotId) !== l.exId) continue;
            m.set(setKey(l.slotId, l.setIdx), l);
        }
        return m;
    }, [logs, sheet]);
    const activeSlots = useMemo(() => (sheet ? sheet.slots.filter((x) => !sheet.skipped.includes(x.id)) : []), [sheet]);
    const totalSets = useMemo(() => activeSlots.reduce((s, x) => s + x.setPlan.length, 0), [activeSlots]);
    const loggedSets = useMemo(() => activeSlots.reduce((s, x) => s + x.setPlan.filter((_, i) => logMap.has(setKey(x.id, i))).length, 0), [activeSlots, logMap]);
    if (!sheet) {
        return (<div className="sess-page">
        <div className="sess-empty">
          <h2>今天还没排动作</h2>
          <button className="sess-primary" onClick={onExit}>回到训练</button>
        </div>
      </div>);
    }
    if (!sheet.slots.length) {
        return (<div className="sess-page">
        <header className="sess-head">
          <button className="sess-exit" onClick={onExit}>‹ 退出</button>
        </header>
        <div className="sess-empty">
          <h2>今天还没挑动作</h2>
          <button className="sess-primary" onClick={onGoPick}>去挑动作</button>
        </div>
      </div>);
    }
    const finished = totalSets > 0 && loggedSets >= totalSets;
    const liftCount = activeSlots.filter((s) => s.setPlan.length > 0).length;
    const actionCount = liftCount || activeSlots.length;
    const progress = totalSets ? Math.round((loggedSets / totalSets) * 100) : 0;
    const nextOpenKey = (after) => {
        const keys = [];
        for (const s of activeSlots) s.setPlan.forEach((_, i) => keys.push(setKey(s.id, i)));
        const idx = keys.indexOf(after);
        for (let n = idx + 1; n < keys.length; n += 1) if (!logMap.has(keys[n])) return keys[n];
        for (let n = 0; n < idx; n += 1) if (!logMap.has(keys[n])) return keys[n];
        return null;
    };
    const openLog = (slot, setIdx) => {
        const p = slot.setPlan[setIdx];
        const prev = logMap.get(setKey(slot.id, setIdx));
        setCutArmed(null);
        setDraftWeight(p.weightKg != null ? String(p.weightKg) : '');
        setDraftReps(String(prev?.reps ?? p.reps));
        setDraftRpe(prev?.rpe ?? null);
        setDropSteps(p.drop
            ? (prev?.dropSteps?.length ? prev.dropSteps : dropStepPlan(slot, 3)).map((s) => ({
                weight: s.weightKg === null ? '' : String(s.weightKg),
                sets: String(Math.max(1, s.sets))
            }))
            : []);
        setOpenKey(setKey(slot.id, setIdx));
    };
    const resizeSteps = (slot, n) => {
        setDropSteps((cur) => dropStepPlan(slot, n).map((s, i) => cur[i] ?? { weight: s.weightKg === null ? '' : String(s.weightKg), sets: String(s.sets) }));
    };
    const saveLog = (slot, setIdx) => {
        const p = slot.setPlan[setIdx];
        const prev = logMap.get(setKey(slot.id, setIdx));
        const w = draftWeight === '' ? null : Number(draftWeight);
        const r = Number(draftReps);
        const steps = dropSteps
            .map((s) => ({ weightKg: s.weight.trim() === '' ? null : Number(s.weight), sets: Math.max(1, Math.round(Number(s.sets) || 1)) }))
            .filter((s) => s.weightKg === null || Number.isFinite(s.weightKg));
        const log = {
            slotId: slot.id,
            sheetId: sheet.id,
            exId: slot.exId ?? slot.name,
            date: sheet.date,
            setIdx,
            weightKg: p.drop ? (steps[0]?.weightKg ?? null) : Number.isFinite(w) ? w : null,
            reps: Number.isFinite(r) ? r : p.reps,
            targetReps: p.reps,
            rpe: draftRpe,
            toFailure: prev?.toFailure ?? false,
            ts: new Date().toISOString(),
            ...(p.drop && steps.length ? { dropSteps: steps } : {})
        };
        onAddLogs([log]);
        setOpenKey(nextOpenKey(setKey(slot.id, setIdx)));
    };
    const goNext = () => {
        const key = nextOpenKey(openKey ?? '');
        if (!key) return;
        const [slotId, setIdx] = splitSetKey(key);
        const slot = sheet.slots.find((s) => s.id === slotId);
        if (!slot) return;
        openLog(slot, setIdx);
        window.setTimeout(() => document.getElementById(`srow-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
    };
    const toggleBlock = (slotId) => setBlocksDone((v) => (v.includes(slotId) ? v.filter((x) => x !== slotId) : [...v, slotId]));
    const swapEx = swapOpen ? byId(sheet.slots.find((s) => s.id === swapOpen)?.exId ?? '') : undefined;
    const areas = injuryAreas(profile);
    const candidates = swapEx ? swapCandidates(swapEx, areas).slice(0, 6) : [];
    const askAi = async () => {
        if (!swapEx) return;
        setAiBusy(true);
        setAiNote('');
        try {
            const picks = await swapAdvice(settings, { name: swapEx.name, muscles: swapEx.muscles, equipment: swapEx.equipment.join('·'), why: '换个同类动作' }, candidates.map((c) => ({ id: c.id, name: c.name, muscles: c.muscles, equipment: c.equipment })), symptom);
            setAiReasons(Object.fromEntries(picks.map((p) => [p.id, p.reason])));
        } catch (e) {
            setAiNote(`AI 没帮上（${e.detail || '接口不通'}），下面按本机规则给的同肌群同器械候选选`);
        }
        setAiBusy(false);
    };
    const title = `${sheet.input.direct ? '自选' : sheet.focus} · ${actionCount} 个动作`;
    return (<div className="sess-page">
      <header className="sess-head">
        <div className="sess-head-line">
          <button type="button" className="sess-exit" onClick={onExit}>‹ 退出</button>
          <span className="sess-live"><i/>训练中</span>
        </div>
        <h1>{title}</h1>
        <div className="sess-head-meta num">
          <span>组进度 <b>{loggedSets}/{totalSets}</b></span>
          <span>{liftCount} 个动作{activeSlots.length > liftCount ? ` · ${activeSlots.length - liftCount} 项热身放松` : ''}</span>
        </div>
      </header>

      <main className="sess-body">
        {activeSlots.map((slot, order) => {
            const isLift = slot.setPlan.length > 0;
            const doneCount = isLift ? slot.setPlan.filter((_, i) => logMap.has(setKey(slot.id, i))).length : 0;
            const finishedThis = isLift && doneCount >= slot.setPlan.length;
            return (<article className={`sess-card${finishedThis ? ' finished' : ''}${isLift ? '' : ' sess-card-lite'}`} key={slot.id}>
              <div className="sess-card-head">
                <span className="sess-card-index num">{finishedThis ? '✓' : order + 1}</span>
                <div className="sess-card-title">
                  <h2>{slot.name}</h2>
                  <p className="num">
                    {isLift ? summaryOf(slot) : `约 ${Math.round(slot.durationSec / 60)} 分钟`}
                    {isLift && doneCount ? <em className="sess-card-done">已做 {doneCount}/{slot.setPlan.length} 组</em> : null}
                  </p>
                </div>
                <button type="button" className="sess-remove" onClick={() => onSkip(slot.id)} aria-label="今天不练这个动作">×</button>
              </div>

              {!isLift ? (<div className="sess-block">
                <p>{slot.note}</p>
                <button type="button" className={`sess-block-done${blocksDone.includes(slot.id) ? ' on' : ''}`} aria-pressed={blocksDone.includes(slot.id)} onClick={() => toggleBlock(slot.id)}>
                  {blocksDone.includes(slot.id) ? '✓ 做过了' : '标记做过'}
                </button>
              </div>) : (<>
                <div className="sess-sets">
                  {slot.setPlan.map((p, i) => {
                      const key = setKey(slot.id, i);
                      const rec = logMap.get(key);
                      const isOpen = openKey === key;
                      const data = setData(slot, p, rec);
                      const isObject = data && typeof data === 'object';
                      return (<div
                        className={`sess-set${rec ? ' done' : ''}${isOpen ? ' open' : ''}`}
                        key={key}
                        id={`srow-${key}`}
                        style={{ '--flip-h': `${flipHeights[key] ?? 240}px` }}>
                        <div className={`sess-flip${isOpen ? ' open' : ''}`}>
                        <div className="sess-face sess-face-front">
                        <div className="sess-set-row" role="button" tabIndex={0} onClick={() => (isOpen ? setOpenKey(null) : openLog(slot, i))} onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                if (isOpen)
                                    setOpenKey(null);
                                else
                                    openLog(slot, i);
                            }
                        }}>
                          <span className={`sess-set-check${rec ? ' on' : ''}`} aria-hidden="true">{rec ? '✓' : ''}</span>
                          <span className="sess-set-idx num">第{i + 1}组{p.drop ? '｜递减' : ''}</span>
                          <span className="sess-set-data num">
                            {isObject ? (<>
                              {data.weight ? <b>{data.weight}</b> : null}
                              <span className="sess-x">×</span>
                              <b>{data.reps}</b>
                              {data.rpe ? <em>RPE {data.rpe}</em> : null}
                            </>) : (<b>{data}</b>)}
                          </span>
                          <button type="button" className="sess-set-action" onClick={(e) => {
                              e.stopPropagation();
                              if (isOpen)
                                  setOpenKey(null);
                              else
                                  openLog(slot, i);
                          }} aria-expanded={isOpen}>
                            {rec ? '改这组' : '点这里记这组'} <span aria-hidden="true">›</span>
                          </button>
                        </div>
                        </div>
                        <div className="sess-face sess-face-back">
                        <div className="sess-face-back-inner" ref={(el) => { backRefs.current[key] = el; }}>
                        <div className="sess-face-back-head">
                          <b>第 {i + 1} 组</b>
                          <span className="num">目标 {p.reps} 次{p.drop ? ' · 递减组' : ''}</span>
                        </div>
                        <div className="sess-log-panel">
                          {p.drop ? (<div className="sess-dropbox">
                            <div className="sess-drop-head">
                              <span>递减组做几档</span>
                              <button type="button" className="sess-chip" aria-pressed={dropSteps.length === 2} onClick={() => resizeSteps(slot, 2)}>两档</button>
                              <button type="button" className="sess-chip" aria-pressed={dropSteps.length === 3} onClick={() => resizeSteps(slot, 3)}>三档</button>
                            </div>
                            <div className="sess-drop-row sess-drop-labels">
                              <span>档</span><span>{loadInputName(slot.unit)}</span><span>组数</span>
                            </div>
                            {dropSteps.map((s, si) => (<div className="sess-drop-row num" key={si}>
                              <span>第 {si + 1} 档</span>
                              <input value={s.weight} onChange={(e) => setDropSteps((cur) => cur.map((x, i) => (i === si ? { ...x, weight: e.target.value } : x)))} inputMode="decimal"/>
                              <input value={s.sets} onChange={(e) => setDropSteps((cur) => cur.map((x, i) => (i === si ? { ...x, sets: e.target.value } : x)))} inputMode="numeric"/>
                            </div>))}
                            <div className="sess-field">
                              <label>每档次数</label>
                              <input value={draftReps} onChange={(e) => setDraftReps(e.target.value)} inputMode="numeric"/>
                            </div>
                          </div>) : (<div className="sess-logrow">
                            <div className="sess-field">
                              <label>{loadInputName(slot.unit)}</label>
                              <input value={draftWeight} onChange={(e) => setDraftWeight(e.target.value)} inputMode="decimal" placeholder="没加重就留空"/>
                            </div>
                            <div className="sess-field">
                              <label>实际次数</label>
                              <input value={draftReps} onChange={(e) => setDraftReps(e.target.value)} inputMode="numeric"/>
                            </div>
                          </div>)}
                          <EffortSlider value={draftRpe} onChange={setDraftRpe}/>
                          {!slot.prIntent && (draftRpe ?? 0) >= 9 ? (<div className="sess-warning">今天不冲 PR，下一组减一档重量</div>) : null}
                          <div className="sess-log-foot">
                            {slot.setPlan.length > 1 ? (<button type="button" className={`sess-cut${cutArmed === key && rec ? ' on' : ''}`} onClick={() => {
                                if (!rec) {
                                    onCutSet(slot.id, i);
                                    setOpenKey(null);
                                    return;
                                }
                                if (cutArmed === key) {
                                    onCutSet(slot.id, i);
                                    setCutArmed(null);
                                    setOpenKey(null);
                                } else {
                                    setCutArmed(key);
                                }
                            }}>
                              {cutArmed === key && rec ? '确认删掉这组' : '删掉这组'}
                            </button>) : <span/>}
                            <div className="sess-log-actions">
                              <button type="button" className="sess-ghost" onClick={() => setOpenKey(null)}>取消</button>
                              <button type="button" className="sess-save" onClick={() => saveLog(slot, i)}>记下</button>
                            </div>
                          </div>
                        </div>
                        </div>
                        </div>
                      </div>
                      </div>);
                  })}
                </div>
                {slot.kind !== 'ramp' ? (<div className="sess-card-foot">
                  <button type="button" className="sess-add-set" onClick={() => onAddSet(slot.id)}><span aria-hidden="true">＋</span>加一组</button>
                  <div className="sess-card-tools">
                    {slot.exId === 'lateral-raise' ? (<button type="button" className={`sess-tool${hasDropSet(slot) ? ' on' : ''}`} onClick={() => onDropSet(slot.id)}>递减组</button>) : null}
                    <button type="button" className="sess-tool" onClick={() => {
                        if (swapOpen === slot.id) {
                            setSwapOpen(null);
                            return;
                        }
                        setSwapOpen(slot.id);
                        setSymptom('');
                        setAiReasons({});
                        setAiNote('');
                    }}>换动作</button>
                    <button type="button" className="sess-tool danger" onClick={() => {
                        if (swapOpen === slot.id) {
                            setSwapOpen(null);
                            return;
                        }
                        setSwapOpen(slot.id);
                        setSymptom('做这个动作时有不适感');
                    }}>刺痛</button>
                  </div>
                </div>) : null}
              </>)}

              {swapOpen === slot.id && swapEx ? (<div className="sess-swap">
                <h3>推荐动作</h3>
                {settings.useAI && settings.apiKey ? (<>
                  <button type="button" className="sess-ghost wide" onClick={() => void askAi()} disabled={aiBusy}>{aiBusy ? 'AI 正在挑…' : '让 AI 按原因排序'}</button>
                  {aiNote ? <div className="sess-warning">{aiNote}</div> : null}
                </>) : null}
                {candidates.length === 0 ? <p className="sess-empty-line">这个动作模式没有合适替代，今天跳过它</p> : null}
                {candidates.map((c) => (<div className="sess-candidate" key={c.id}>
                  <div className="sess-candidate-head">
                    <b>{c.name}</b>
                    <button type="button" className="sess-save small" onClick={() => {
                        onSwap(slot.id, c.id);
                        setSwapOpen(null);
                    }}>用它</button>
                  </div>
                  <p>{c.muscles.join(' · ')} · {c.equipment.join('·')} · {restAdvice(c.restSec)}</p>
                  {aiReasons[c.id] ? <em>{aiReasons[c.id]}</em> : null}
                </div>))}
                <button type="button" className="sess-ghost wide" onClick={() => setSwapOpen(null)}>不换，返回</button>
              </div>) : null}
            </article>);
        })}

        {sheet.input.direct ? (<button type="button" className="sess-add-move" onClick={onGoPick}>＋ 再加一个动作</button>) : null}
        <div className="sess-bottom-space" aria-hidden="true"/>
      </main>

      <div className={`sess-dock${finished ? ' done' : ''}`}>
        {finished ? (<button type="button" className="sess-finish" onClick={() => { setShowBadge(false); setShowReward(true); }}>
          <span>完成今日训练</span>
          <span className="sess-finish-arrow" aria-hidden="true">→</span>
        </button>) : (<div className="sess-live-dock">
          <div className="sess-live-progress">
            <div className="sess-live-line">
              <span>组进度 <b>{loggedSets}/{totalSets}</b></span>
              <span>{progress}%</span>
            </div>
            <div className="sess-bar"><i style={{ width: `${progress}%` }}/></div>
          </div>
          <button type="button" className="sess-continue" onClick={goNext}>继续训练 <span aria-hidden="true">→</span></button>
        </div>)}
      </div>

      {showReward && (<div className="matcha-reward-overlay" role="dialog" aria-modal="true" aria-label="训练完成奖励">
        <button type="button" className="matcha-reward-close" aria-label="关掉奖励" onClick={() => { setShowReward(false); setShowBadge(false); onExit(); }}>×</button>
        <div className="matcha-reward-stage">
          <MatchaPowderReveal
            className="matcha-reward-motion"
            minimal
            height={700}
            onProgress={(progress) => {
              if (progress >= 0.99) setShowBadge(true);
            }}/>
        </div>

        <AnimatePresence>
          {showBadge && (<motion.div
            className="matcha-badge-overlay"
            initial={{ scale: 0, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}>
            <div className="matcha-badge-medal" aria-hidden="true">🏆</div>
            <h2>训练完成！</h2>
            <p>获得新徽章：钢铁意志</p>
            <button type="button" onClick={() => { setShowReward(false); setShowBadge(false); onExit(); }}>
              收下徽章
            </button>
          </motion.div>)}
        </AnimatePresence>

        {!showBadge && (<div className="matcha-reward-hint-bar">
          <p>向左滑动撕开包装获取奖励...</p>
        </div>)}
      </div>)}
    </div>);
}
