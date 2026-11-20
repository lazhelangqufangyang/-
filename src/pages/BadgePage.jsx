import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import './badge.css';

const STORAGE_KEY = 'fitplan.badge.v1';

/** 卡片里要显示的徽章：本地开练用的固定一套，后端返回就以返回的为准 */
const LOCAL_BADGES = [
  { id: 'first', name: '初次训练', icon: '🌱', desc: '完成第一次训练' },
  { id: 'iron', name: '钢铁意志', icon: '🛡️', desc: '完成一次完整训练' },
  { id: 'streak', name: '连续七天', icon: '🔥', desc: '连续七天都有记录' },
  { id: 'volume', name: '负重突破', icon: '🏋️', desc: '单次训练总容量创新高' },
  { id: 'early', name: '清晨练者', icon: '🌅', desc: '早上八点前开始训练' },
  { id: 'night', name: '夜练者', icon: '🌙', desc: '晚上十点后开始训练' }
];

function readBadge() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export default function BadgePage({ logs = [], onBack }) {
  const [picked, setPicked] = useState(null);
  const [saved, setSaved] = useState(() => readBadge());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const timer = useRef(0);

  const total = logs.length;
  const trained = logs.filter((l) => l.weightKg !== null).length;
  const days = new Set(logs.map((l) => l.date)).size;
  const hourOf = (log) => {
    const stamp = new Date(log.ts ?? `${log.date}T12:00:00`);
    return Number.isNaN(stamp.getTime()) ? 12 : stamp.getHours();
  };
  const earned = {
    first: total > 0,
    iron: total >= 10,
    streak: days >= 7,
    volume: trained > 0,
    early: logs.some((l) => hourOf(l) < 8),
    night: logs.some((l) => hourOf(l) >= 22)
  };
  const earnedCount = LOCAL_BADGES.filter((badge) => earned[badge.id]).length;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const save = async (badge) => {
    if (saving)
      return;
    setPicked(badge.id);
    setSaved(badge);
    setError('');
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(badge));
      // 登录后后端会把它记到账号上；没登录/没后端时本地保存就够了，不打断用户
      if (total > 0)
        await apiRequest('/users/me/badges', { method: 'POST', body: JSON.stringify({ badgeId: badge.id, badgeName: badge.name }) }).catch(() => {});
      setToast(`已把这个徽章设成你的展示徽章`);
    } catch {
      setError('本机没存上：浏览器可能禁用了本地存储');
    } finally {
      setSaving(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(''), 2400);
    }
  };

  return (<div className="badge-page">
      <header className="badge-head">
        <button type="button" className="badge-back" onClick={onBack} aria-label="返回个人页">‹</button>
        <div className="badge-head-copy">
          <span className="badge-eyebrow">BADGE CABINET</span>
          <h1>我的徽章</h1>
        </div>
      </header>

      <section className="badge-hero" aria-label="当前展示的徽章">
        <div className="badge-hero-glow" aria-hidden="true"/>
        {saved ? (<>
          <span className="badge-hero-icon" aria-hidden="true">{saved.icon ?? '🎖️'}</span>
          <p className="badge-hero-label">正在展示</p>
          <b className="badge-hero-name">{saved.name}</b>
          <p className="badge-hero-desc">{saved.desc ?? ''}</p>
        </>) : (<>
          <span className="badge-hero-icon" aria-hidden="true">🎖️</span>
          <p className="badge-hero-label">还没选</p>
          <b className="badge-hero-name">挑一个戴在身上</b>
          <p className="badge-hero-desc">点下面任意一个徽章，它就会显示在这里</p>
        </>)}
        <div className="badge-hero-stats">
          <span><b>{earnedCount}</b>/6 已解锁</span>
          <i aria-hidden="true"/>
          <span><b>{days}</b>天有记录</span>
          <i aria-hidden="true"/>
          <span><b>{total}</b>组</span>
          <i aria-hidden="true"/>
          <span><b>{trained}</b>组带重量</span>
        </div>
      </section>

      <section className="badge-grid" aria-label="徽章列表">
        {LOCAL_BADGES.map((badge) => {
          const active = saved?.id === badge.id;
          const locked = !earned[badge.id];
          return (<button
            key={badge.id}
            type="button"
            className={`badge-card${active ? ' on' : ''}${locked ? ' locked' : ''}`}
            aria-pressed={active}
            disabled={locked || (saving && picked === badge.id)}
            onClick={() => void save(badge)}>
            <span className="badge-card-icon" aria-hidden="true">{badge.icon}</span>
            <span className="badge-card-name">{badge.name}</span>
            <span className="badge-card-desc">{locked ? '还没解锁' : badge.desc}</span>
            {active ? <span className="badge-card-flag">展示中</span> : null}
            {locked ? <span className="badge-card-lock" aria-hidden="true">🔒</span> : null}
          </button>);
        })}
      </section>

      {error ? <p className="badge-error">{error}</p> : null}
      <p className="badge-hint">徽章只是标一下自己练得怎么样，换个徽章不影响记录和计划。</p>

      {toast ? <div className="badge-toast" role="status">{toast}</div> : null}
    </div>);
}
