import { useEffect, useRef, useState } from 'react';
import { teachCard } from '../engine/teach.js';
import { dropVideo, setVideo, videoFor } from '../videoLinks.js';
import MoveAnim from './MoveAnim.jsx';
const KIND_TITLE = {
    warmupGeneral: '升温',
    warmupMobility: '动态活动度',
    ramp: '递增热身',
    main: '主项',
    compound: '大重量复合',
    accessory: '辅助复合',
    isolation: '孤立动作',
    cardio: '有氧',
    cooldown: '放松'
};
export default function MoveDetail({ slot, profile, onClose, library = false, history = null }) {
    const card = teachCard(slot, profile);
    const [vmap, setVmap] = useState(() => videoFor(slot.exId));
    useEffect(() => setVmap(videoFor(slot.exId)), [slot.exId]);
    const addVideo = () => {
        const url = window.prompt('贴原作者的视频页地址（B站 / YouTube / 优酷 / 腾讯视频 / 西瓜 / 抖音）', '');
        if (url === null)
            return;
        if (!setVideo(slot.exId, url)) {
            window.alert('这个地址收不下，只认视频站的公开页面链接。');
            return;
        }
        setVmap(videoFor(slot.exId));
    };
    const delVideo = () => {
        dropVideo(slot.exId);
        setVmap(videoFor(slot.exId));
    };
    // 开这层时占一条同地址的历史：手机的返回键先把它关掉，而不是把整个板块退掉
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const heldRef = useRef(false);
    useEffect(() => {
        window.history.pushState(null, '', window.location.href);
        heldRef.current = true;
        const onPop = () => closeRef.current();
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    const dismiss = () => {
        if (!heldRef.current) {
            closeRef.current();
            return;
        }
        heldRef.current = false;
        window.history.back();
    };
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape')
                dismiss();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    return (<div className="mask" onClick={dismiss}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={`${card.name} 动作详解`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="crumb">
              {KIND_TITLE[slot.kind] ?? slot.kind}
              {library ? '' : ` · 第 ${(slot.startSec / 60).toFixed(0)} 分那一行`}
            </div>
            <h2>{card.name}</h2>
          </div>
          <button className="drawer-close" onClick={dismiss} aria-label="关闭详解">
            关闭
          </button>
        </div>
        <MoveAnim rig={card.rig} start={card.start} end={card.end} prop={card.prop} pattern={card.pattern}/>
        {slot.exId ? (<div className="vid-line">
            {vmap ? (<a className="vid-go" href={vmap.url} target="_blank" rel="noreferrer noopener">
                看示范 · {vmap.by ? `${vmap.by} · ${vmap.host}` : vmap.host} ↗
              </a>) : (<button className="vid-add" onClick={addVideo}>
                ＋示范视频
              </button>)}
            {vmap ? (<button className="vid-del" onClick={delVideo} aria-label="撤掉这个示范链接">
                撤
              </button>) : null}
          </div>) : null}
        <div className="drawer-body">
          <p className="dose-line">{card.doseLine}</p>
          {card.musclesLine ? <p className="small">{card.musclesLine}</p> : null}
          <p className="small muted">{card.primeLine}</p>
          <p className="small muted">{card.equipmentLine}</p>

          <h3>怎么做（按顺序）</h3>
          <ol className="steplist">
            {card.steps.map((s, i) => (<li key={i}>{s}</li>))}
          </ol>

          <h3>呼吸 · 节奏</h3>
          <p className="line">{card.breathing}</p>
          <p className="line">{card.tempo}</p>

          <h3>最常见的错</h3>
          <ul className="crosslist">
            {card.mistakes.map((m, i) => (<li key={i}>{m}</li>))}
          </ul>

          {slot.restSec > 0 ? (<>
              <h3>为什么组间休息 {slot.restSec} 秒</h3>
              <p className="line">{card.restWhy}</p>
            </>) : null}

          {card.caution ? <div className="notice danger">⚠ {card.caution}</div> : null}
          {slot.cautionNote ? <div className="notice danger">⚠ {slot.cautionNote}</div> : null}

          {history && history.length ? (<>
              <h3>本机记录</h3>
              <div className="lb-lines">
                {history.map((h) => (<div className="lb-line" key={h.date}>
                    <span className="lb-date num">{h.date.slice(5)}</span>
                    <span className="lb-lsets num">{h.sets} 组</span>
                    <span className="lb-ltop">
                      最高 {h.top}
                      {h.best ? <span className="tag accent">新高</span> : null}
                    </span>
                  </div>))}
              </div>
            </>) : null}

          {card.swaps.length ? (<>
              <h3>这个动作做不了就换</h3>
              <ul className="swaplist">
                {card.swaps.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </>) : null}

          <p className="faint safety">{card.safety}</p>
        </div>
      </div>
    </div>);
}
