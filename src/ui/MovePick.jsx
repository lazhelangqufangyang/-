import { useMemo, useState } from 'react';
import { BROWSE_AREAS, EXERCISES, fitsEquipment } from '../engine/exercises.js';
import { isHomeMode } from '../engine/load.js';
/** 给今天挑动作的一屏：点一下就是选上，再点一下撤掉，重量与组数不在这里定 */
export default function MovePick({ profile, picked, favorites, onToggle, onDone }) {
    const [query, setQuery] = useState('');
    const [section, setSection] = useState('chest');
    const home = isHomeMode(profile);
    const searching = query.trim() !== '';
    const groups = useMemo(() => {
        const q = query.trim();
        const hit = (ex) => !q || `${ex.name} ${ex.muscles.join('')} ${ex.equipment.join('')}`.includes(q);
        const fav = EXERCISES.filter((ex) => favorites.includes(ex.id) && hit(ex));
        const byArea = BROWSE_AREAS.map((area) => ({
            key: area.key,
            title: area.title,
            list: EXERCISES.filter((ex) => area.test(ex) && hit(ex))
        })).filter((g) => g.list.length > 0);
        return fav.length ? [{ key: 'fav', title: '喜欢动作', list: fav }, ...byArea] : byArea;
    }, [query, favorites]);
    const renderRow = (ex) => {
        const usable = fitsEquipment(ex, home);
        const on = picked.includes(ex.id);
        const toggle = () => {
            if (usable)
                onToggle(ex.id);
        };
        return (<div className={`mv-row${on ? ' picked' : ''}${usable ? '' : ' off'}`} key={ex.id} role="button" tabIndex={0} aria-pressed={on} onClick={toggle} onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            }}>
        <div className="mv-main">
          <div className="mv-name">{ex.name}</div>
          <div className="mv-meta">
            {ex.muscles.slice(0, 3).join(' · ')} · {ex.equipment.join('·')}
            {usable ? '' : ` · 需要${ex.equipment.join('或')}，你的条件里没有`}
          </div>
        </div>
        <button className={`mv-add${on ? ' on' : ''}`} aria-pressed={on} disabled={!usable} onClick={(e) => {
                e.stopPropagation();
                toggle();
            }}>
          {on ? '已选' : '＋选上'}
        </button>
      </div>);
    };
    return (<div className="session">
      <div className="head">
        <div className="line">
          <button className="btn ghost" style={{ padding: '6px 10px', minHeight: 36 }} onClick={onDone}>
            ‹ 返回开始训练
          </button>
          <b>加动作</b>
          <span className="spacer" style={{ flex: 1 }}/>
          <span className={`tag${picked.length ? ' accent' : ''}`}>{picked.length ? `已选 ${picked.length} 个` : '还没选'}</span>
        </div>
        <div className="field" style={{ margin: '8px 0 0' }}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜动作或肌肉，比如 腿后侧、三角、哑铃" aria-label="搜索动作"/>
        </div>
      </div>

      <div className="body">
        <div className="pick-photo" aria-hidden="true"/>
        {groups.map((g) => (<div className="sec" key={g.key}>
            <button className="mv-head" aria-expanded={searching || section === g.key} onClick={() => setSection(section === g.key && !searching ? '' : g.key)}>
              <span>{g.title}</span>
              <span className="mv-count num">{g.list.length}</span>
              <span className="mv-caret">{searching || section === g.key ? '▾' : '▸'}</span>
            </button>
            {searching || section === g.key ? g.list.map(renderRow) : null}
          </div>))}
        <div style={{ height: 80 }}/>
      </div>

      <div className="pick-foot">
        <button className="btn primary big" onClick={onDone}>
          返回开始训练{picked.length ? ` · 已选 ${picked.length} 个` : ''}
        </button>
      </div>
    </div>);
}
