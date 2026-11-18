import { useCallback, useEffect, useState } from 'react';
import { checkHealth, closeAccount, createProOrder, logOut, orderStatus, readPlan, readSession, sessionToken, signInHref, signInWithPassword } from '../api/account.js';
/** 跳去收银台之前记下这一单，回来时用它查一次到账 */
const ORDER_KEY = 'fitplan.order';
function when(v) {
    if (!v)
        return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN', { hour12: false });
}
function day(v) {
    if (!v)
        return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('zh-CN');
}
export default function AccountCard() {
    const [health, setHealth] = useState(null);
    const [acct, setAcct] = useState(null);
    const [plan, setPlan] = useState(null);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [authMsg, setAuthMsg] = useState('');
    /** 注册和登录回的是同一个形状，差别只在后端那一条 INSERT 还是那条 SELECT */
    const signIn = async (path) => {
        setBusy(true);
        setAuthMsg('');
        try {
            await signInWithPassword(path, name.trim(), password);
            setPassword('');
            await refresh();
        }
        catch (e) {
            setAuthMsg(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const refresh = useCallback(async () => {
        setMsg('');
        let hc = null;
        try {
            hc = await checkHealth();
        }
        catch {
            setHealth(null);
            setAcct(null);
            setPlan(null);
            setMsg('连不上登录服务。这台设备上的记录不受影响，照常练照常记。');
            return;
        }
        setHealth(hc);
        if (hc.db !== 'up') {
            setAcct(null);
            setPlan(null);
            setMsg('登录服务在，但它的数据库没通，现在登不上。');
            return;
        }
        if (!sessionToken()) {
            setAcct(null);
            setPlan(null);
            return;
        }
        try {
            setAcct(await readSession());
            setPlan(await readPlan());
        }
        catch {
            // 会话过期或本机清过：令牌留着没意义，直接当没登录
            setAcct(null);
            setPlan(null);
        }
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    // 从收银台回来：发货只认支付宝的异步通知，这里问一句让它早点看得见
    useEffect(() => {
        const no = localStorage.getItem(ORDER_KEY);
        if (!no)
            return;
        void orderStatus(no)
            .then((s) => {
            if (s.status !== 'paid')
                return;
            localStorage.removeItem(ORDER_KEY);
            setMsg('这一单到账了。');
            void refresh();
        })
            .catch(() => {
            /* 离线或后端没起：下次进来再问 */
        });
    }, [refresh]);
    const buy = async () => {
        setBusy(true);
        setMsg('');
        try {
            const o = await createProOrder();
            localStorage.setItem(ORDER_KEY, o.outTradeNo);
            window.location.href = o.url;
        }
        catch (e) {
            setMsg(e.message);
            setBusy(false);
        }
    };
    const out = async () => {
        setBusy(true);
        let failed = '';
        try {
            await logOut();
        }
        catch (e) {
            failed = `退出没成：${e.message}`;
        }
        setAcct(null);
        setPlan(null);
        setBusy(false);
        setMsg(failed || '退出了。云端那一行还留着，要彻底删就点注销。');
    };
    const close = () => {
        if (!window.confirm('注销会删掉云端关于你的那一行（uid、订阅状态、会话）。本机记录不受影响，要留底先导出 JSON。继续？'))
            return;
        setBusy(true);
        closeAccount()
            .then(() => {
            setAcct(null);
            setPlan(null);
            setMsg('云端那一行已经删了。');
        })
            .catch((e) => setMsg(`注销没成：${e.message}`))
            .finally(() => setBusy(false));
    };
    const alipayReady = health?.alipay === 'configured';
    return (<div className="card">
      {acct ? (<div className="acct-line">
          <span className="acct-on">已登录</span>
          <span>{acct.kind === 'password' ? `账号 ${acct.handle}` : `支付宝 uid 尾号 ${acct.handle}`}</span>
          <span>{acct.plan === 'pro' ? 'Pro' : '免费版'}</span>
          <span>注册 {when(acct.createdAt)}</span>
          <span>最近登录 {when(acct.lastLoginAt)}</span>
        </div>) : null}

      {acct && plan ? (<div className="pro-box">
          <div>
            <div className="pro-name">{plan.plan === 'pro' ? 'Pro' : '免费版'}</div>
            <div className="faint small">
              {plan.plan === 'pro' ? `到 ${day(plan.expiresAt)}` : `¥${plan.price.yuan} 用 ${plan.price.days} 天`}
            </div>
          </div>
          {plan.payReady ? (<button className="btn primary" onClick={() => void buy()} disabled={busy}>
              {plan.plan === 'pro' ? `续 ${plan.price.days} 天` : '升级 Pro'}
            </button>) : (<span className="faint small">收款还没开通</span>)}
        </div>) : null}

      <div className="btnbar" style={{ marginTop: 12 }}>
        {acct ? (<>
            <button className="btn ghost" onClick={() => void out()} disabled={busy}>
              退出这台设备
            </button>
            <button className="btn danger" onClick={close} disabled={busy}>
              注销云端那一行
            </button>
          </>) : (<a className={`btn primary${alipayReady ? '' : ' off'}`} href={alipayReady ? signInHref() : undefined} aria-disabled={!alipayReady}>
            用支付宝登录
          </a>)}
        <button className="btn ghost" onClick={() => void refresh()} disabled={busy}>
          重新读一遍
        </button>
      </div>

      {!acct ? (<div className="pw-box">
          <div className="faint small">
            没配支付宝应用也能用：起一个账号密码，换设备登录同一个账号就能把云端那份拉回来。
          </div>
          <div className="field">
            <label>账号名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="3–32 个字符，例：lin_01"/>
          </div>
          <div className="field">
            <label>口令</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位，不能全是数字"/>
          </div>
          <div className="btnbar">
            <button className="btn primary" onClick={() => void signIn('/auth/login')} disabled={busy}>
              登录
            </button>
            <button className="btn ghost" onClick={() => void signIn('/auth/register')} disabled={busy}>
              注册一个新账号
            </button>
          </div>
          {authMsg ? <div className="missing">{authMsg}</div> : null}
          <div className="faint small">
            库里存的是口令的散列，明文不落库，忘了找不回来 —— 本机的 JSON 导出永远是保底。
          </div>
        </div>) : null}

      {msg ? <div className="notice" style={{ marginTop: 10 }}>{msg}</div> : null}
    </div>);
}
