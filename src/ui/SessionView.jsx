import { useEffect, useMemo, useState } from 'react';
import { byId, swapCandidates } from '../engine/exercises.js';
import { dropStepPlan, hasDropSet } from '../engine/day.js';
import { injuryAreas, loadInputName, loadLabel } from '../engine/load.js';
import { swapAdvice } from '../ai.js';
import EffortSlider from './EffortSlider.jsx';
/** 自重与不计重量的动作只报次数，负重动作按单位写清（片数、单手 kg 不能混成 kg） */
function loadPrefix(unit, weight) {
    if (unit === '无' || unit === '自重' || unit === undefined)
        return '';
    return `${loadLabel(unit, weight)} · `;
}
/** 组间休息写成一句建议，不给倒计时：练的时候不用看表也不用掐点 */
function restAdvice(sec) {
    if (sec >= 150)
        return '组间休息 2–3 分钟';
    if (sec >= 120)
        return '组间休息约 2 分钟';
    if (sec >= 90)
        return '组间休息 90 秒左右';
    return `组间休息约 ${Math.round(sec / 10) * 10} 秒`;
}
function setKey(slotId, setIdx) {
    return `${slotId}-${setIdx}`;
}
function doseLine(slot) {
    const head = slot.setPlan[0];
    if (slot.kind === 'ramp')
        return `${slot.sets} 组递增热身，逐组加重`;
    return `${loadPrefix(slot.unit, head?.weightKg ?? null)}${slot.sets} 组 × ${head?.reps ?? 0} 次`;
}
export default function SessionView({ sheet, profile, settings, logs, onSwap, onSkip, onAddSet, onCutSet, onDropSet, onAddLogs, onExit, onGoLog, onGoPick }) {
    const [openKey, setOpenKey] = useState(null);
    const [draftWeight, setDraftWeight] = useState('');
    const [draftReps, setDraftReps] = useState('');
    const [draftRpe, setDraftRpe] = useState(null);
    /** 递减组那一行的档位：2–3 档，每档一个重量、做几组 */
    const [dropSteps, setDropSteps] = useState([]);
    const [swapOpen, setSwapOpen] = useState(null);
    /** 删一组要点两次：这一组记下的次数会跟着没，原生 confirm 在全屏 PWA 里又丑又容易被忽略 */
    const [cutArmed, setCutArmed] = useState(null);
    const [symptom, setSymptom] = useState('');
    const [aiReasons, setAiReasons] = useState({});
    const [aiBusy, setAiBusy] = useState(false);
    const [aiNote, setAiNote] = useState('');
    // 升温、活动度、有氧、放松这几行没有组可记，用一个勾表示做过了，只存在本机
    const blockKey = sheet ? `fitplan.blocks.${sheet.id}` : '';
    const [blocksDone, setBlocksDone] = useState(() => {
        if (!blockKey)
            return [];
        try {
            const raw = localStorage.getItem(blockKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
        }
        catch {
            return [];
        }
    });
    useEffect(() => {
        if (blockKey)
            localStorage.setItem(blockKey, JSON.stringify(blocksDone));
    }, [blocksDone, blockKey]);
    /** 某个位置的组记过没有：按这一天认，重排换了 sheetId 也不会把记过的组看成没记 */
    const logMap = useMemo(() => {
        const m = new Map();
        if (!sheet)
            return m;
        const exOf = new Map(sheet.slots.map((s) => [s.id, s.exId]));
        for (const l of logs) {
            if (l.date !== sheet.date)
                continue;
            // 同一个位置换了动作（改了练哪里又重排），那条记录不该挂在新动作上
            if (exOf.get(l.slotId) !== l.exId)
                continue;
            m.set(setKey(l.slotId, l.setIdx), l);
        }
        return m;
    }, [logs, sheet]);
    // 标了「今天不练」的行不进组进度：不练是自己决定的，不算没做完
    const activeSlots = useMemo(() => (sheet ? sheet.slots.filter((x) => !sheet.skipped.includes(x.id)) : []), [sheet]);
    const totalSets = useMemo(() => activeSlots.reduce((s, x) => s + x.setPlan.length, 0), [activeSlots]);
    const loggedSets = useMemo(() => activeSlots.reduce((s, x) => s + x.setPlan.filter((_, i) => logMap.has(setKey(x.id, i))).length, 0), [activeSlots, logMap]);
    if (!sheet) {
        return (<div className="session">
        <div className="body">
          <div className="card">
            <h3>今天还没有训练清单</h3>
            <button className="btn primary" onClick={onExit}>
              回运动页
            </button>
          </div>
        </div>
      </div>);
    }
    // 直接开始使用：进来时一行都没有，动作是在这一屏一边练一边加上去的
    if (!sheet.slots.length) {
        return (<div className="session">
        <div className="head">
          <div className="line">
            <button className="btn ghost" style={{ padding: '6px 10px', minHeight: 36 }} onClick={onExit}>
              ‹ 退出
            </button>
          </div>
        </div>
        <div className="body">
          <div className="card">
            <h3>今天还没有选动作</h3>
            <div className="btnbar">
              <button className="btn primary big" onClick={onGoPick}>
                加动作
              </button>
            </div>
          </div>
        </div>
      </div>);
    }
    const todayLogs = logs.filter((l) => l.date === sheet.date);
    const finished = totalSets > 0 && loggedSets >= totalSets;
    /** 记完这一组就跳到下一个还没记的组，一屏一屏往下走，不用自己找 */
    const nextOpenKey = (after) => {
        const keys = [];
        for (const s of activeSlots)
            s.setPlan.forEach((_, i) => keys.push(setKey(s.id, i)));
        const idx = keys.indexOf(after);
        for (let n = idx + 1; n < keys.length; n += 1)
            if (!logMap.has(keys[n]))
                return keys[n];
        for (let n = 0; n < idx; n += 1)
            if (!logMap.has(keys[n]))
                return keys[n];
        return null;
    };
    const openLog = (slot, setIdx) => {
        const p = slot.setPlan[setIdx];
        const prev = logMap.get(setKey(slot.id, setIdx));
        setCutArmed(null);
        setDraftWeight(p.weightKg != null ? String(p.weightKg) : '');
        setDraftReps(String(prev?.reps ?? p.reps));
        // RPE 是这一组做完之后的感觉，没记过就空着，不拿计划里的目标值冒充
        setDraftRpe(prev?.rpe ?? null);
        setDropSteps(p.drop
            ? (prev?.dropSteps?.length ? prev.dropSteps : dropStepPlan(slot, 3)).map((s) => ({
                weight: s.weightKg === null ? '' : String(s.weightKg),
                sets: String(Math.max(1, s.sets))
            }))
            : []);
        setOpenKey(setKey(slot.id, setIdx));
    };
    /** 两档 ↔ 三档：填过的档原样留着，多出来的那档给建议重量 */
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
    const toggleBlock = (slotId) => {
        setBlocksDone((v) => (v.includes(slotId) ? v.filter((x) => x !== slotId) : [...v, slotId]));
    };
    const swapEx = swapOpen ? byId(sheet.slots.find((s) => s.id === swapOpen)?.exId ?? '') : undefined;
    const areas = injuryAreas(profile);
    const candidates = swapEx ? swapCandidates(swapEx, areas).slice(0, 6) : [];
    const askAi = async () => {
        if (!swapEx)
            return;
        setAiBusy(true);
        setAiNote('');
        try {
            const picks = await swapAdvice(settings, { name: swapEx.name, muscles: swapEx.muscles, equipment: swapEx.equipment.join('·'), why: '换个同类动作' }, candidates.map((c) => ({ id: c.id, name: c.name, muscles: c.muscles, equipment: c.equipment })), symptom);
            setAiReasons(Object.fromEntries(picks.map((p) => [p.id, p.reason])));
        }
        catch (e) {
            setAiNote(`AI 没帮上（${e.detail || '接口不通'}），下面按本机规则给的同肌群同器械候选选`);
        }
        setAiBusy(false);
    };
    return (<div className="session">
      <div className="head">
        <div className="line">
          <button className="btn ghost" style={{ padding: '6px 10px', minHeight: 36 }} onClick={onExit}>
            ‹ 退出
          </button>
          <b>{sheet.focus}</b>
          <span className="spacer" style={{ flex: 1 }}/>
          {finished ? <span className="tag accent">记完了</span> : null}
        </div>
        <div className="line num" style={{ marginTop: 8 }}>
          <span>
            组进度 {loggedSets}/{totalSets}
          </span>
          <span>
            共 {activeSlots.length} 行{sheet.skipped.length ? ` · 不练 ${sheet.skipped.length} 行` : ''} · 按顺序往下做
          </span>
        </div>
      </div>

      <div className="body">
        {activeSlots.map((slot, order) => {
            const isLift = slot.setPlan.length > 0;
            return (<div className="card tight" key={slot.id}>
              <div className="srow-head">
                <span className="tag num">{order + 1}</span> {slot.name}
                <button className="skip-link" onClick={() => onSkip(slot.id)}>
                  今天不练
                </button>
              </div>
              {!isLift ? (<>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {slot.note}
                  </div>
                  <div className="chips" style={{ marginTop: 8 }}>
                    <button className="chip" aria-pressed={blocksDone.includes(slot.id)} onClick={() => toggleBlock(slot.id)}>
                      {blocksDone.includes(slot.id) ? '✓ 做过了' : '这一行做完了'}
                    </button>
                  </div>
                </>) : (<>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {doseLine(slot)}
                    {slot.kind !== 'ramp' && slot.restSec > 0 ? ` · ${restAdvice(slot.restSec)}` : ''}
                    {slot.prIntent ? ' · 这一组可以冲' : ''}
                  </div>
                  {slot.cautionNote ? <div className="caution" style={{ marginTop: 6 }}>⚠ {slot.cautionNote}</div> : null}
                  <div className="setlist">
                    {slot.setPlan.map((p, i) => {
                        const key = setKey(slot.id, i);
                        const rec = logMap.get(key);
                        const isOpen = openKey === key;
                        // 记过的组：左边直接换成记下来的那组，不再在旁边重复一遍
                        const shown = rec
                            ? { weightKg: rec.weightKg, reps: rec.reps, rpe: rec.rpe, fail: rec.toFailure }
                            : { weightKg: p.weightKg, reps: p.reps, rpe: p.rpe, fail: false };
                        return (<div className="setrow" key={key}>
                          <div className="setline">
                            <button className={`setbtn ${rec ? 'done' : ''}`} onClick={() => (isOpen ? setOpenKey(null) : openLog(slot, i))} aria-expanded={isOpen}>
                              <span className="idx num">
                                第 {i + 1} 组{p.drop ? '｜递减' : ''}
                              </span>
                              {p.drop && rec?.dropSteps?.length ? (<span className="want num">
                                  {rec.dropSteps
                                    .map((s) => `${s.weightKg === null ? '自重' : loadLabel(slot.unit, s.weightKg)}×${Math.max(1, s.sets)}组`)
                                    .join(' ')}
                                </span>) : (<span className="want num">
                                  {slot.unit === '无' ? '' : `${loadLabel(slot.unit, shown.weightKg)} `}× {shown.reps}
                                  {shown.rpe ? ` RPE${shown.rpe}` : ''}
                                  {shown.fail ? ' 力竭' : ''}
                                </span>)}
                              <span className="got num">{rec ? '改这组 ›' : p.drop ? '记这几档 ›' : '点这里记这组 ›'}</span>
                            </button>
                            {slot.setPlan.length > 1 ? (cutArmed === key && rec ? (<button className="set-cut on" onClick={() => {
                                        onCutSet(slot.id, i);
                                        setCutArmed(null);
                                    }}>
                                      确认删
                                    </button>) : (<button className="set-cut" title={rec ? `这一组记下的 ${rec.reps} 次会一起删` : ''} onClick={() => {
                                        if (!rec) {
                                            onCutSet(slot.id, i);
                                            return;
                                        }
                                        setCutArmed(key);
                                    }}>
                                    ✕
                                  </button>)) : null}
                          </div>
                          {isOpen ? (<div className="logpanel">
                              {p.drop ? (<div className="dropbox">
                                  <div className="drop-bar">
                                    <span>递减组做几档</span>
                                    <button className="chip" aria-pressed={dropSteps.length === 2} onClick={() => resizeSteps(slot, 2)}>
                                      两档
                                    </button>
                                    <button className="chip" aria-pressed={dropSteps.length === 3} onClick={() => resizeSteps(slot, 3)}>
                                      三档
                                    </button>
                                  </div>
                                  <div className="drop-row drop-head">
                                    <span>档</span>
                                    <span>{loadInputName(slot.unit)}</span>
                                    <span>组数</span>
                                  </div>
                                  {dropSteps.map((s, si) => (<div className="drop-row num" key={si}>
                                      <span>第 {si + 1} 档</span>
                                      <input value={s.weight} onChange={(e) => setDropSteps((cur) => cur.map((x, i) => (i === si ? { ...x, weight: e.target.value } : x)))} inputMode="decimal"/>
                                      <input value={s.sets} onChange={(e) => setDropSteps((cur) => cur.map((x, i) => (i === si ? { ...x, sets: e.target.value } : x)))} inputMode="numeric"/>
                                    </div>))}
                                  <div className="field" style={{ marginBottom: 2, marginTop: 8 }}>
                                    <label>每档次数</label>
                                    <input value={draftReps} onChange={(e) => setDraftReps(e.target.value)} inputMode="numeric"/>
                                  </div>
                                </div>) : (<div className="logrow">
                                  <div className="field" style={{ marginBottom: 8 }}>
                                    <label>{loadInputName(slot.unit)}</label>
                                    <input value={draftWeight} onChange={(e) => setDraftWeight(e.target.value)} inputMode="decimal" placeholder="没加重就留空"/>
                                  </div>
                                  <div className="field" style={{ marginBottom: 8 }}>
                                    <label>实际次数</label>
                                    <input value={draftReps} onChange={(e) => setDraftReps(e.target.value)} inputMode="numeric"/>
                                  </div>
                                </div>)}
                              <EffortSlider value={draftRpe} onChange={setDraftRpe}/>
                              {!slot.prIntent && (draftRpe ?? 0) >= 9 ? (<div className="missing" style={{ marginBottom: 10 }}>
                                  今天不冲 PR，下一组减一档重量
                                </div>) : null}
                              <div className="btnbar">
                                <button className="btn primary" onClick={() => saveLog(slot, i)}>
                                  记下
                                </button>
                                <button className="btn ghost" onClick={() => setOpenKey(null)}>
                                  取消
                                </button>
                              </div>
                            </div>) : null}
                        </div>);
                    })}
                  </div>
                  {slot.note ? <div className="faint" style={{ marginTop: 6 }}>{slot.note}</div> : null}
                  {slot.kind !== 'ramp' ? (<div className="chips" style={{ marginTop: 8 }}>
                      <button className="chip" onClick={() => {
                            setCutArmed(null);
                            onAddSet(slot.id);
                        }}>
                        ＋加一组
                      </button>
                      {slot.exId === 'lateral-raise' ? (<button className="chip" aria-pressed={hasDropSet(slot)} onClick={() => onDropSet(slot.id)}>
                          递减组
                        </button>) : null}
                      <button className="btn ghost" style={{ padding: '6px 10px', minHeight: 36, fontSize: 13 }} onClick={() => {
                            if (swapOpen === slot.id) {
                                setSwapOpen(null);
                                return;
                            }
                            setSwapOpen(slot.id);
                            setSymptom('');
                            setAiReasons({});
                            setAiNote('');
                        }}>
                        换个动作
                      </button>
                      <button className="btn ghost danger" style={{ padding: '6px 10px', minHeight: 36, fontSize: 13 }} onClick={() => {
                            if (swapOpen === slot.id) {
                                setSwapOpen(null);
                                return;
                            }
                            setSwapOpen(slot.id);
                            setSymptom('做这个动作时有不适感');
                        }}>
                        这个动作刺痛
                      </button>
                    </div>) : null}
                </>)}
              {swapOpen === slot.id && swapEx ? (<div className="card">
                  <h3>推荐动作</h3>
                  {settings.useAI && settings.apiKey ? (<>
                      <button className="btn ghost" onClick={() => void askAi()} disabled={aiBusy}>
                        {aiBusy ? 'AI 正在挑…' : '让 AI 按原因排序'}
                      </button>
                      {aiNote ? <div className="missing">{aiNote}</div> : null}
                    </>) : null}
                  <div className="chips" style={{ marginTop: 6 }}>
                    {candidates.length === 0 ? <div className="faint">这个动作模式没有合适替代，今天跳过它</div> : null}
                    {candidates.map((c) => (<div key={c.id} style={{ width: '100%', borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <b>{c.name}</b>
                          <span className="spacer" style={{ flex: 1 }}/>
                          <button className="btn primary" style={{ padding: '8px 12px', minHeight: 40, fontSize: 14 }} onClick={() => {
                            onSwap(slot.id, c.id);
                            setSwapOpen(null);
                        }}>
                            用它
                          </button>
                        </div>
                        <div className="faint">
                          {c.muscles.join(' · ')} · {c.equipment.join('·')} · {restAdvice(c.restSec)}
                        </div>
                        {aiReasons[c.id] ? <div className="small" style={{ color: 'var(--ok)', marginTop: 4 }}>{aiReasons[c.id]}</div> : null}
                      </div>))}
                  </div>
                  <button className="btn ghost" onClick={() => setSwapOpen(null)}>
                    不换，返回
                  </button>
                </div>) : null}
            </div>);
        })}

        {sheet.input.direct ? (<button className="btn ghost add-move" onClick={onGoPick}>
            ＋再加一个动作
          </button>) : null}

        {finished ? (<div className="card summary">
            <h3>今天做完了</h3>
            <div className="kv">
              <span>记录组数</span>
              <span className="num">{todayLogs.length}</span>
            </div>
            <div className="kv">
              <span>计划组数</span>
              <span className="num">{totalSets}</span>
            </div>
            <div className="kv">
              <span>完成度</span>
              <span className="num">{totalSets ? Math.round((todayLogs.length / totalSets) * 100) : 0}%</span>
            </div>
            <div className="btnbar">
              <button className="btn primary" onClick={onExit}>
                回运动页
              </button>
              <button className="btn ghost" onClick={onGoLog}>
                看记录
              </button>
            </div>
          </div>) : null}
      </div>
    </div>);
}
