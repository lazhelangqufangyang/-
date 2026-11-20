import { useCallback, useEffect, useState } from 'react';
import { adminLogin, adminLogout, adminMe, adminToken, changePlan, getOrder, listAudit, listOrders, listUsers, refundOrder, refundQuery, setAdminToken, syncOrder } from '../api/admin.js';
import './admin.css';

const TABS = [
    { key: 'orders', label: '订单' },
    { key: 'users', label: '用户' },
    { key: 'audit', label: '审计' }
];
const STATUS_LABEL = { created: '待支付', paid: '已支付', closed: '已关闭' };
const ACTION_LABEL = { sync_deliver: '查单发货', refund: '退款', grant: '补发', revoke: '撤销' };
const PAGE = 20;

function fmt(value) {
    if (!value)
        return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('zh-CN', { hour12: false });
}
function yuan(cent) {
    return cent == null ? '—' : `¥${(cent / 100).toFixed(2)}`;
}
function statusOf(order) {
    if (order.refundStatus === 'refunded')
        return '已退款';
    return STATUS_LABEL[order.status] ?? order.status;
}
function badgeClass(order) {
    if (order.refundStatus === 'refunded')
        return 'refunded';
    return order.status;
}
export default function AdminPage() {
    const [me, setMe] = useState(null);
    const [ready, setReady] = useState(!adminToken());
    useEffect(() => {
        if (!adminToken()) {
            setReady(true);
            return;
        }
        adminMe()
            .then(setMe)
            .catch(() => setAdminToken(null))
            .finally(() => setReady(true));
    }, []);
    if (!ready) {
        return (<div className="admin-page admin-center">
        <div className="admin-faint">检查管理会话…</div>
      </div>);
    }
    if (!me) {
        return <LoginView onDone={setMe}/>;
    }
    return <AdminShell me={me} onLoggedOut={() => setMe(null)}/>;
}
function LoginView({ onDone }) {
    const [loginName, setLoginName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await adminLogin(loginName.trim(), password);
            onDone(await adminMe());
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setBusy(false);
        }
    };
    return (<div className="admin-page admin-center">
      <form className="admin-login" onSubmit={submit}>
        <h1>管理后台</h1>
        <p className="admin-faint">独立账号；查单、退款、补发都会写审计。</p>
        <label>
          账号
          <input value={loginName} onChange={(e) => setLoginName(e.target.value)} autoComplete="username" placeholder="管理员账号"/>
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="至少 12 位"/>
        </label>
        {error ? <div className="admin-error">{error}</div> : null}
        <button className="admin-btn primary" disabled={busy || !loginName.trim() || !password}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>);
}
function AdminShell({ me, onLoggedOut }) {
    const [tab, setTab] = useState('orders');
    const [busy, setBusy] = useState(false);
    const out = async () => {
        setBusy(true);
        try {
            await adminLogout();
        }
        finally {
            onLoggedOut();
            setBusy(false);
        }
    };
    return (<div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>管理后台</h1>
          <span className="admin-faint">所有权益变更都会留审计</span>
        </div>
        <div className="admin-head-right">
          <span className="admin-faint">{me.loginName}</span>
          <button className="admin-btn" onClick={() => void out()} disabled={busy}>退出</button>
        </div>
      </header>
      <nav className="admin-tabs">
        {TABS.map((t) => (<button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>))}
      </nav>
      <main className="admin-body">
        {tab === 'orders' ? <OrdersView/> : tab === 'users' ? <UsersView/> : <AuditView/>}
      </main>
    </div>);
}
function OrdersView() {
    const [status, setStatus] = useState('');
    const [q, setQ] = useState('');
    const [applied, setApplied] = useState({ status: '', q: '' });
    const [reloadKey, setReloadKey] = useState(0);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [selected, setSelected] = useState(null);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [refundTarget, setRefundTarget] = useState(null);
    const load = useCallback(async (nextOffset = 0) => {
        setBusy(true);
        setError('');
        try {
            const r = await listOrders({ ...applied, limit: PAGE, offset: nextOffset });
            setItems(r.items);
            setTotal(r.total);
            setOffset(nextOffset);
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    }, [applied, reloadKey]);
    useEffect(() => {
        void load(0);
    }, [load]);
    const openOrder = async (outTradeNo) => {
        setBusy(true);
        setError('');
        setMsg('');
        try {
            setSelected(await getOrder(outTradeNo));
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const refreshDetail = async () => {
        if (selected)
            setSelected(await getOrder(selected.outTradeNo));
        await load(offset);
    };
    const doSync = async () => {
        if (!selected)
            return;
        setBusy(true);
        setError('');
        setMsg('');
        try {
            const r = await syncOrder(selected.outTradeNo);
            setMsg(`查单结果：${r.verdict}`);
            await refreshDetail();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const doRefund = async (reason) => {
        if (!refundTarget)
            return;
        setRefundTarget(null);
        setBusy(true);
        setError('');
        setMsg('');
        try {
            const r = await refundOrder(refundTarget.outTradeNo, reason);
            setMsg(`已退款 ${yuan(r.refundCent)}，Pro 权益已按本单天数收回。`);
            await refreshDetail();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const doQueryRefund = async () => {
        if (!selected)
            return;
        setBusy(true);
        setError('');
        setMsg('');
        try {
            const r = await refundQuery(selected.outTradeNo);
            setMsg(r.refundSuccess
                ? `支付宝退款状态 ${r.alipayRefundStatus}，本地${r.changed ? '已补账' : '无变化'}。`
                : `支付宝退款状态 ${r.alipayRefundStatus || '未知'}，本地未变更。`);
            await refreshDetail();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    return (<section className="admin-section">
      <form className="admin-filters" onSubmit={(e) => { e.preventDefault(); setApplied({ status, q: q.trim() }); setReloadKey((n) => n + 1); }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="created">待支付</option>
          <option value="paid">已支付</option>
          <option value="closed">已关闭</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="订单号 / 交易号 / 账号 / uid 尾号"/>
        <button className="admin-btn primary" disabled={busy}>查询</button>
        <button type="button" className="admin-btn" onClick={() => void load(offset)} disabled={busy}>刷新</button>
        <span className="admin-faint">共 {total} 单</span>
      </form>
      {msg ? <div className="admin-notice">{msg}</div> : null}
      {error ? <div className="admin-error">{error}</div> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>订单号</th><th>用户</th><th>金额</th><th>天数</th><th>状态</th><th>创建时间</th></tr>
          </thead>
          <tbody>
            {items.map((o) => (<tr key={o.outTradeNo} className={selected?.outTradeNo === o.outTradeNo ? 'active' : ''} onClick={() => void openOrder(o.outTradeNo)}>
                <td className="mono">{o.outTradeNo}</td>
                <td>{o.loginName || (o.uidTail ? `uid …${o.uidTail}` : `#${o.userId}`)}</td>
                <td>{o.amountYuan}</td>
                <td>{o.days}</td>
                <td><span className={`admin-badge ${badgeClass(o)}`}>{statusOf(o)}</span></td>
                <td className="admin-faint">{fmt(o.createdAt)}</td>
              </tr>))}
            {!items.length ? <tr><td colSpan={6} className="admin-empty">没有订单</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager total={total} offset={offset} limit={PAGE} onPage={(next) => void load(next)} busy={busy}/>
      {selected ? (<div className="admin-card">
          <div className="admin-card-head">
            <h2>订单 {selected.outTradeNo}</h2>
            <button className="admin-btn" onClick={() => setSelected(null)}>收起</button>
          </div>
          <dl className="admin-kv">
            <div><dt>用户</dt><dd>{selected.loginName || `uid …${selected.uidTail}`}（#{selected.userId}）</dd></div>
            <div><dt>金额</dt><dd>{selected.amountYuan} / {selected.days} 天</dd></div>
            <div><dt>支付状态</dt><dd>{statusOf(selected)}</dd></div>
            <div><dt>交易号</dt><dd className="mono">{selected.tradeNo || '—'}</dd></div>
            <div><dt>buyer_id</dt><dd className="mono">{selected.buyerId || '—'}</dd></div>
            <div><dt>创建 / 支付</dt><dd>{fmt(selected.createdAt)} / {fmt(selected.paidAt)}</dd></div>
            <div><dt>退款</dt><dd>{selected.refundStatus === 'refunded' ? `${yuan(selected.refundCent)} @ ${fmt(selected.refundedAt)}` : '未退款'}</dd></div>
            <div><dt>用户当前权益</dt><dd>{selected.userPlan === 'pro' ? `Pro 到 ${fmt(selected.planExpiresAt)}` : '免费版'}</dd></div>
          </dl>
          <div className="admin-actions">
            <button className="admin-btn" onClick={() => void doSync()} disabled={busy}>主动查单</button>
            <button className="admin-btn danger" onClick={() => setRefundTarget(selected)} disabled={busy || selected.status !== 'paid' || selected.refundStatus !== 'none'}>全额退款</button>
            <button className="admin-btn" onClick={() => void doQueryRefund()} disabled={busy || selected.status !== 'paid'}>退款查询</button>
          </div>
          <h3>这单的审计</h3>
          <AuditList items={selected.audits ?? []} compact/>
        </div>) : null}
      {refundTarget ? (<ReasonDialog title={`退款 ${refundTarget.outTradeNo}（${refundTarget.amountYuan}）`} hint="退款原因必填，2–200 字；确认后会调支付宝退款并收回本单天数。" confirmLabel="确认退款" danger onCancel={() => setRefundTarget(null)} onConfirm={(reason) => void doRefund(reason)}/>) : null}
    </section>);
}
function UsersView() {
    const [q, setQ] = useState('');
    const [applied, setApplied] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [planTarget, setPlanTarget] = useState(null);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async (nextOffset = 0) => {
        setBusy(true);
        setError('');
        try {
            const r = await listUsers({ q: applied, limit: PAGE, offset: nextOffset });
            setItems(r.items);
            setTotal(r.total);
            setOffset(nextOffset);
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    }, [applied, reloadKey]);
    useEffect(() => {
        void load(0);
    }, [load]);
    const doPlan = async (action, days, reason) => {
        if (!planTarget)
            return;
        setPlanTarget(null);
        setBusy(true);
        setError('');
        setMsg('');
        try {
            const r = await changePlan(planTarget.id, action, days, reason);
            setMsg(`${action === 'grant' ? '已补发' : '已撤销'} ${days} 天，当前：${r.plan === 'pro' ? `Pro 到 ${fmt(r.expiresAt)}` : '免费版'}`);
            await load(offset);
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    return (<section className="admin-section">
      <form className="admin-filters" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); setReloadKey((n) => n + 1); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="账号名 / uid 尾号"/>
        <button className="admin-btn primary" disabled={busy}>查询</button>
        <span className="admin-faint">共 {total} 人；这里只返回账号元数据，不读训练和饮食内容</span>
      </form>
      {msg ? <div className="admin-notice">{msg}</div> : null}
      {error ? <div className="admin-error">{error}</div> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>#</th><th>账号</th><th>权益</th><th>到期</th><th>已付订单</th><th>最近登录</th><th>操作</th></tr>
          </thead>
          <tbody>
            {items.map((u) => (<tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.loginName || `uid …${u.uidTail}`}</td>
                <td><span className={`admin-badge ${u.plan}`}>{u.plan === 'pro' ? 'Pro' : '免费版'}</span></td>
                <td>{u.plan === 'pro' ? fmt(u.expiresAt) : '—'}</td>
                <td>{u.paidOrders}</td>
                <td className="admin-faint">{fmt(u.lastLoginAt)}</td>
                <td className="admin-row-actions">
                  <button className="admin-btn small" onClick={() => setPlanTarget({ ...u, action: 'grant' })} disabled={busy}>补发</button>
                  <button className="admin-btn small danger" onClick={() => setPlanTarget({ ...u, action: 'revoke' })} disabled={busy}>撤销</button>
                </td>
              </tr>))}
            {!items.length ? <tr><td colSpan={7} className="admin-empty">没有用户</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager total={total} offset={offset} limit={PAGE} onPage={(next) => void load(next)} busy={busy}/>
      <p className="admin-faint">补发优先用订单「主动查单」；这里的补发只用于订单缺失的线下补偿，会写审计。</p>
      {planTarget ? (<PlanDialog user={planTarget} onCancel={() => setPlanTarget(null)} onConfirm={(days, reason) => void doPlan(planTarget.action, days, reason)}/>) : null}
    </section>);
}
function AuditView() {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async (nextOffset = 0) => {
        setBusy(true);
        setError('');
        try {
            const r = await listAudit({ limit: PAGE, offset: nextOffset });
            setItems(r.items);
            setTotal(r.total);
            setOffset(nextOffset);
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    }, []);
    useEffect(() => {
        void load(0);
    }, [load]);
    return (<section className="admin-section">
      <div className="admin-filters">
        <span className="admin-faint">共 {total} 条，按时间倒序</span>
        <button className="admin-btn" onClick={() => void load(offset)} disabled={busy}>刷新</button>
      </div>
      {error ? <div className="admin-error">{error}</div> : null}
      <AuditList items={items}/>
      <Pager total={total} offset={offset} limit={PAGE} onPage={(next) => void load(next)} busy={busy}/>
    </section>);
}
function AuditList({ items, compact = false }) {
    if (!items.length) {
        return <div className="admin-empty">还没有审计记录</div>;
    }
    return (<div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>{!compact && <th>时间</th>}<th>管理员</th><th>动作</th>{!compact && <th>订单 / 用户</th>}<th>原因</th><th>变更</th></tr>
        </thead>
        <tbody>
          {items.map((a) => (<tr key={a.id}>
              {!compact && <td className="admin-faint">{fmt(a.createdAt)}</td>}
              <td>{a.adminLogin}</td>
              <td>{ACTION_LABEL[a.action] ?? a.action}</td>
              {!compact && <td className="mono">{a.outTradeNo || `user #${a.targetUserId}`}</td>}
              <td>{a.reason}</td>
              <td>
                <details>
                  <summary>查看</summary>
                  <pre>{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>
                </details>
              </td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}
function Pager({ total, offset, limit, onPage, busy }) {
    if (total <= limit)
        return null;
    const page = Math.floor(offset / limit) + 1;
    const pages = Math.ceil(total / limit);
    return (<div className="admin-pager">
      <button className="admin-btn" disabled={busy || offset <= 0} onClick={() => onPage(Math.max(0, offset - limit))}>上一页</button>
      <span className="admin-faint">第 {page} / {pages} 页</span>
      <button className="admin-btn" disabled={busy || offset + limit >= total} onClick={() => onPage(offset + limit)}>下一页</button>
    </div>);
}
function ReasonDialog({ title, hint, confirmLabel = '确认', danger = false, onCancel, onConfirm }) {
    const [reason, setReason] = useState('');
    const ok = reason.trim().length >= 2 && reason.trim().length <= 200;
    return (<div className="admin-mask">
      <form className="admin-dialog" onSubmit={(e) => { e.preventDefault(); if (ok)
        onConfirm(reason.trim()); }}>
        <h2>{title}</h2>
        {hint ? <p className="admin-faint">{hint}</p> : null}
        <label>
          原因（2–200 字）
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus/>
        </label>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onCancel}>取消</button>
          <button className={`admin-btn ${danger ? 'danger' : 'primary'}`} disabled={!ok}>{confirmLabel}</button>
        </div>
      </form>
    </div>);
}
function PlanDialog({ user, onCancel, onConfirm }) {
    const [days, setDays] = useState(30);
    const [reason, setReason] = useState('');
    const grant = user.action === 'grant';
    const ok = reason.trim().length >= 2 && reason.trim().length <= 200 && days >= 1 && days <= 365;
    return (<div className="admin-mask">
      <form className="admin-dialog" onSubmit={(e) => { e.preventDefault(); if (ok)
        onConfirm(Number(days), reason.trim()); }}>
        <h2>{grant ? '补发' : '撤销'} {user.loginName || `uid …${user.uidTail}`} 的 Pro</h2>
        <p className="admin-faint">{grant ? '补发优先走订单「主动查单」；这里用于订单缺失的线下补偿。' : '从当前到期日往前扣，扣到当天就降免费。'}</p>
        <label>
          天数（1–365）
          <input type="number" min="1" max="365" value={days} onChange={(e) => setDays(Number(e.target.value))}/>
        </label>
        <label>
          原因（2–200 字）
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus/>
        </label>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onCancel}>取消</button>
          <button className={`admin-btn ${grant ? 'primary' : 'danger'}`} disabled={!ok}>{grant ? '确认补发' : '确认撤销'}</button>
        </div>
      </form>
    </div>);
}