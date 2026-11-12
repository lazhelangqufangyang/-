import { useState } from 'react';
import { AREA_OPTIONS } from '../engine/areas.js';
/** 没有安排时先选练哪里，选完直接出表；按周框架还是自由练也在这一步定 */
export default function PlanPick({ framework, wantAreas, free, onBack, onGenerate }) {
    const [sel, setSel] = useState(wantAreas);
    const [isFree, setIsFree] = useState(free);
    const toggle = (a) => setSel((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
    return (<div className="session">
      <div className="head">
        <div className="line">
          <button className="btn ghost" style={{ padding: '6px 10px', minHeight: 36 }} onClick={onBack}>
            ‹ 返回
          </button>
          <b>今天练哪里</b>
          <span className="spacer" style={{ flex: 1 }}/>
          <span className={`tag${sel.length ? ' accent' : ''}`}>{sel.length ? `已选 ${sel.length} 个` : '可多选'}</span>
        </div>
      </div>

      <div className="body">
        <div className="pick-photo" aria-hidden="true"/>
        {framework ? (<div className="tabs">
            <button className="tab" aria-pressed={!isFree} onClick={() => setIsFree(false)}>
              按周框架
            </button>
            <button className="tab" aria-pressed={isFree} onClick={() => setIsFree(true)}>
              今天自由练
            </button>
          </div>) : null}
        <div className="pills">
          {AREA_OPTIONS.map((a) => (<button key={a} className="pill" aria-pressed={sel.includes(a)} onClick={() => toggle(a)}>
                {a}
              </button>))}
        </div>
        <div style={{ height: 90 }}/>
      </div>

      <div className="pick-foot">
        <button className="btn primary big" onClick={() => onGenerate(sel, isFree || !framework)}>
          生成今天的训练清单
        </button>
      </div>
    </div>);
}
