import { useMemo, useState } from 'react';
import { BROWSE_AREAS, EXERCISES, byId, fitsEquipment } from '../engine/exercises.js';
import { isHomeMode } from '../engine/load.js';
import { previewSlot } from '../engine/day.js';
import { exerciseHistory } from '../engine/logbook.js';
import MoveDetail from './MoveDetail.jsx';
/** 行上的小标签：让人一眼看出这个动作在今天表里会按哪一档对待 */
function roleTag(ex) {
    if (ex.pattern === 'cardio')
        return '有氧';
    if (ex.heavy)
        return '大重量复合';
    if (ex.kind === 'compound')
        return '辅助复合';
    if (ex.pattern === 'core')
        return '核心';
    return '孤立';
}
/** 有照片的那几个分区 */
const SECTION_PHOTO = {
    chest: '/part-chest.jpg',
    back: '/part-back.jpg',
    arm: '/part-arm.jpg',
    core: '/part-core.jpg'
};
export default function ExerciseView({ profile, favorites, picked, logs, date, onToggleFavorite, onTogglePick, pickFor, recordPicks, onToggleRecordPick, onFinishRecordPick }) {
    const [query, setQuery] = useState('');
    const [section, setSection] = useState('');
    const [openId, setOpenId] = useState(null);
    const home = isHomeMode(profile);
    const groups = useMemo(() => {
        const q = query.trim();
        // 中文按整串包含来搜最直观，拆成单字会把所有动作都捞出来
        const hit = (ex) => !q || `${ex.name} ${ex.muscles.join('')} ${ex.equipment.join('')}`.includes(q);
        const fav = EXERCISES.filter((ex) => favorites.includes(ex.id) && hit(ex));
        const byArea = BROWSE_AREAS.map((area) => ({
            key: area.key,
            title: area.title,
            list: EXERCISES.filter((ex) => area.test(ex) && hit(ex))
        })).filter((g) => g.list.length > 0);
        return { fav, byArea };
    }, [query, favorites]);
    const searching = query.trim() !== '';
    const open = openId ? byId(openId) : null;
    const detail = open ? previewSlot(open, profile, logs, date) : null;
    const renderRow = (ex) => {
        const usable = fitsEquipment(ex, home);
        const isPicked = pickFor ? recordPicks.includes(ex.id) : picked.includes(ex.id);
        const isFav = favorites.includes(ex.id);
        return (<div className={`mv-row${isPicked ? ' picked' : ''}`} key={ex.id} role="button" tabIndex={0} aria-label={`看 ${ex.name} 的动作详解`} onClick={() => setOpenId(ex.id)} onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenId(ex.id);
                }
            }}>
        <div className="mv-main">
          <div className="mv-name">
            {ex.name}
            <span className="pres">{roleTag(ex)}</span>
          </div>
          <div className="mv-meta">
            {ex.muscles.slice(0, 3).join(' · ')} · {ex.equipment.join('·')} ·{' '}
            {ex.pattern === 'cardio' ? '按分钟做' : `${ex.sets} 组 × ${ex.reps} 次`}
            {usable ? '' : ` · 需要${ex.equipment.join('或')}，你的条件里没有`}
          </div>
        </div>
        <button className={`mv-fav${isFav ? ' on' : ''}`} aria-pressed={isFav} aria-label={isFav ? `把 ${ex.name} 移出喜欢动作` : `把 ${ex.name} 加入喜欢动作`} onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(ex.id);
            }}>
          {isFav ? '♥' : '♡'}
        </button>
        <button className={`mv-add${isPicked ? ' on' : ''}`} aria-pressed={isPicked} disabled={pickFor ? false : !usable} title={pickFor
                ? isPicked
                    ? `把 ${ex.name} 从这条记录里去掉`
                    : `把 ${ex.name} 选进这条记录`
                : usable
                    ? ''
                    : '这个动作要用你没有的器械，先在档案里改成有健身房，或者在详解里看替代动作'} onClick={(e) => {
                e.stopPropagation();
                if (pickFor)
                    onToggleRecordPick(ex.id);
                else
                    onTogglePick(ex.id);
            }}>
          {isPicked ? (pickFor ? '已选' : '已加') : pickFor ? '＋选上' : '＋今天'}
        </button>
      </div>);
    };
    const sectionHead = (key, title, count, hint) => {
        const open = searching || section === key;
        const toggle = () => setSection(section === key && !searching ? '' : key);
        const photo = SECTION_PHOTO[key];
        if (photo) {
            return (<button className="sec-photo" style={{ ['--img']: `url('${photo}')` }} aria-expanded={open} onClick={toggle}>
          <b>{title}</b>
          <span className="sec-n num">{count}</span>
          <span className="mv-caret">{open ? '▾' : '▸'}</span>
        </button>);
        }
        return (<button className="mv-head" aria-expanded={open} onClick={toggle}>
        <span>{title}</span>
        <span className="mv-count num">{count}</span>
        <span className="mv-hint">{hint}</span>
        <span className="mv-caret">{open ? '▾' : '▸'}</span>
      </button>);
    };
    return (<div>
      <div className="card tight">
        {pickFor ? (<div className="picked-row">
            <span className="picked-label">给 {pickFor} 这条记录挑动作</span>
            <button className="btn primary" onClick={onFinishRecordPick}>
              回记录{recordPicks.length ? ` · 已选 ${recordPicks.length} 个` : ''}
            </button>
          </div>) : null}
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜动作或肌肉，比如 腿后侧、三角、哑铃" aria-label="搜索动作"/>
        </div>
      </div>

      <div className="sec">
        {sectionHead('fav', '喜欢动作', groups.fav.length, favorites.length ? '' : '还没收藏')}
        {searching || section === 'fav' ? (favorites.length ? groups.fav.map(renderRow) : null) : null}
      </div>

      {groups.byArea.map((g) => (<div className="sec" key={g.key}>
          {sectionHead(g.key, g.title, g.list.length, '')}
          {searching || section === g.key ? g.list.map(renderRow) : null}
        </div>))}

      {/* 让最后一条不被底部导航压住 */}
      <div style={{ height: 70 }}/>

      {detail && open ? (<MoveDetail slot={detail} profile={profile} library 
        // 有氧按分钟做、没有组，折不出「最高那组」，所以不给它看记录
        history={open.pattern === 'cardio' ? null : exerciseHistory(open.id, logs)} onClose={() => setOpenId(null)}/>) : null}
    </div>);
}
