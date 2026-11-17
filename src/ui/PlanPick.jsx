import { useMemo, useState } from 'react';
import { AREA_OPTIONS } from '../engine/areas.js';
import './planpick.css';

const AREA_ALIAS = {
    胸: ['胸'],
    背: ['背', '背阔', '斜方'],
    肩: ['肩', '三角', '后束'],
    手臂: ['手臂', '二头', '三头', '肱'],
    腿: ['腿', '股四', '腘绳', '小腿'],
    臀: ['臀'],
    核心: ['核心', '腹']
};
const AREA_EN = {
    胸: 'CHEST',
    背: 'BACK',
    肩: 'SHOULDER',
    手臂: 'ARMS',
    腿: 'LEGS',
    臀: 'GLUTES',
    核心: 'CORE'
};
const PRESETS = [
    { key: 'push', label: '推', hint: '胸 · 肩 · 手臂', areas: ['胸', '肩', '手臂'] },
    { key: 'pull', label: '拉', hint: '背 · 二头', areas: ['背', '手臂'] },
    { key: 'legs', label: '腿', hint: '腿 · 臀', areas: ['腿', '臀'] },
    { key: 'core', label: '核心', hint: '腹部 · 稳定', areas: ['核心'] }
];

function inferAreas(initial, focus) {
    const picked = (initial ?? []).filter((a) => AREA_OPTIONS.includes(a));
    if (picked.length) return [...new Set(picked)];
    const text = focus ?? '';
    return AREA_OPTIONS.filter((area) => (AREA_ALIAS[area] ?? []).some((key) => text.includes(key)));
}

function Icon({ name, size = 18 }) {
    const paths = {
        back: <path d="m14.5 5-7 7 7 7"/>,
        check: <path d="m5 12.5 4.3 4.3L19 7"/>,
        arrow: <><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></>,
        spark: <><path d="m12 2.8 1.8 5.2 5.2 1.8-5.2 1.8L12 16.8l-1.8-5.2L5 9.8l5.2-1.8L12 2.8Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>
    }[name];
    return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>);
}

/** 没有安排时先选练哪里，选完直接出表；按周框架还是自由练也在这一步定 */
export default function PlanPick({ framework, wantAreas, todayFocus, free, onBack, onGenerate }) {
    const initial = useMemo(() => inferAreas(wantAreas, todayFocus), [wantAreas, todayFocus]);
    const [sel, setSel] = useState(initial);
    const [isFree, setIsFree] = useState(free || !framework);
    const toggle = (area) => setSel((cur) => (cur.includes(area) ? cur.filter((x) => x !== area) : [...cur, area]));
    const ready = sel.length > 0;
    return (<div className="adjust-page">
      <header className="adjust-head">
        <button type="button" className="adjust-back" onClick={onBack}>
          <Icon name="back" size={18}/>
          返回
        </button>
        <h1>今天练哪里</h1>
        <span className={`adjust-count${sel.length ? ' on' : ''}`}>已选 {sel.length} 个</span>
      </header>

      <main className="adjust-body">
        <div className="adjust-tabs" role="tablist" aria-label="选择方式">
          <button type="button" role="tab" aria-selected={!isFree} className={!isFree ? 'on' : ''} onClick={() => setIsFree(false)}>
            按周框架
          </button>
          <button type="button" role="tab" aria-selected={isFree} className={isFree ? 'on' : ''} onClick={() => setIsFree(true)}>
            今天自由练
          </button>
        </div>

        <div className="adjust-intro">
          <span className="adjust-eyebrow">TODAY'S FOCUS</span>
          <h2>{isFree ? '今天想练哪里？' : '在周框架上调整'}</h2>
          <p>{isFree ? '不参考周框架，按你选的部位现排一张表。' : '已按本周安排预选，也可以直接改成今天真正想练的部位。'}</p>
        </div>

        <div className="area-grid" aria-label="训练部位">
          {AREA_OPTIONS.map((area) => {
              const on = sel.includes(area);
              return (<button key={area} type="button" className={`area-tile${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(area)}>
                <span className="area-tile-inner">
                  <span className="area-name">{area}</span>
                  <span className="area-en">{AREA_EN[area]}</span>
                </span>
                {on ? <span className="area-check"><Icon name="check" size={13}/></span> : null}
              </button>);
          })}
        </div>

        <div className="adjust-summary">
          <div className="adjust-summary-copy">
            <span className="adjust-summary-label">今天将练</span>
            <b>{ready ? sel.join(' + ') : '还没选择部位'}</b>
          </div>
          <span className="adjust-summary-count num">{sel.length} 个部位</span>
        </div>

        <div className="adjust-tip">
          <span className="adjust-tip-icon" aria-hidden="true">💡</span>
          <p><b>提示：</b>修改部位后，将为你重新生成今天的训练动作，原计划将被覆盖。</p>
        </div>

        <section className="adjust-presets" aria-label="快速组合">
          <div className="adjust-presets-head">
            <b>快速组合</b>
            <span>点一下选中一组常见搭配</span>
          </div>
          <div className="preset-grid">
            {PRESETS.map((p) => {
                const on = p.areas.length === sel.length && p.areas.every((a) => sel.includes(a));
                return (<button key={p.key} type="button" className={`preset${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setSel([...p.areas])}>
                  <span className="preset-main">
                    <b>{p.label}</b>
                    <small>{p.hint}</small>
                  </span>
                  <span className="preset-dot">{on ? <Icon name="check" size={12}/> : null}</span>
                </button>);
            })}
          </div>
        </section>

        {!ready ? <p className="adjust-empty">至少选择一个部位，才能生成今天的清单。</p> : null}
      </main>

      <div className="adjust-foot">
        <button type="button" className="adjust-generate" disabled={!ready} onClick={() => onGenerate(sel, isFree)}>
          <span className="adjust-generate-icon"><Icon name="spark" size={18}/></span>
          <span>生成今天的训练清单</span>
          <span className="adjust-generate-arrow"><Icon name="arrow" size={19}/></span>
        </button>
      </div>
    </div>);
}
