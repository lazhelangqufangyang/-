import { useEffect, useRef, useState } from 'react';
import { exportJson, parseImported, STORAGE_KEY } from '../store.js';
import { apiBaseCustom, apiBaseLabel, loginBadge, sessionToken, setApiBase } from '../api/account.js';
import { clearCloudRecords, countLines, pullRecords, pushRecords, receiptText } from '../api/records.js';
import AccountCard from '../components/AccountCard.jsx';
/** 设置里的模块：一个模块一个按钮，点进去是一个子页面 */
const MODULES = [
    { key: 'profile', href: '#/settings/profile', title: '我的档案', desc: '身体数据、一周练哪几天、想练成什么样；也可以不设目标自由练', ico: '☺' },
    { key: 'account', href: '#/settings/account', title: '账号', desc: '账号密码或支付宝授权登录；云端只认账号和订阅，记录要你自己点上传', ico: '◎' },
    { key: 'data', href: '#/settings/data', title: '数据与备份', desc: '导出 JSON、导入 JSON、云端整份备份和拉回、清空本机数据', ico: '≣' },
    { key: 'safety', href: '#/settings/safety', title: '安全边界', desc: '这个应用不做什么：不诊断、不冲极限、不断食', ico: '⚠' }
];
export default function SettingsPage({ state, sub, onGo, onSave, onImport }) {
    const [badge, setBadge] = useState('');
    // 只在模块列表页问一次登录状态；子页面里 AccountCard 自己会读
    useEffect(() => {
        if (sub !== '')
            return;
        let alive = true;
        void loginBadge().then((b) => {
            if (alive)
                setBadge(b);
        });
        return () => {
            alive = false;
        };
    }, [sub]);
    if (sub === 'account')
        return (<Sub title="账号" onGo={onGo}>
        <AccountCard />
      </Sub>);
    if (sub === 'data')
        return (<Sub title="数据与备份" onGo={onGo}>
        <BaseRow />
        <DataPanel state={state} onImport={onImport}/>
        <CloudPanel state={state} onImport={onImport}/>
      </Sub>);
    if (sub === 'safety')
        return (<Sub title="这个应用的边界" onGo={onGo}>
        <div className="card">
          <div className="small muted">不诊断伤病：动作刺痛就停在那一组，换同肌群的动作，去看康复科或运动医学科。</div>
          <div className="small muted" style={{ marginTop: 6 }}>不安排 1RM 和冲极限，重量建议一律偏保守。</div>
          <div className="small muted" style={{ marginTop: 6 }}>
            不断食超过 24 小时、不提药物；补剂只按国标 GB 24154 的每日使用量区间说，不替个人算用量；热量不低于女 1600 / 男 2000 kcal，体重一周最多降 1%。
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>饮食措辞不用「罪恶」「惩罚」这类说法，不评价外观。</div>
          <div className="small muted" style={{ marginTop: 6 }}>
            记录默认只存在这台设备的浏览器里。登录并在「数据与备份」点一次「传到云端」，上传的是那一刻的全部记录，存在你这个账号名下；不点就没有任何东西离开设备。
            云端那份随时能删，注销账号会连着一起删掉。大模型 Key 不上传。
          </div>
        </div>
      </Sub>);
    return (<div className="modlist">
      {MODULES.map((m) => (<button key={m.key} className="modbtn" onClick={() => onGo(m.href)}>
            <span className="modico">{m.ico}</span>
            <span className="modtext">
              <b>{m.title}</b>
              <span className="moddesc">{m.key === 'account' && badge ? badge : m.desc}</span>
            </span>
            <span className="modarrow">›</span>
          </button>))}
    </div>);
}
function Sub({ title, onGo, children }) {
    return (<div>
      <button className="btn ghost backbtn" onClick={() => onGo('#/settings')}>
        ‹ 返回设置
      </button>
      <div className="faint small" style={{ margin: '6px 0 10px' }}>
        {title}
      </div>
      {children}
    </div>);
}
/** 后端地址：内网穿透每起一次换一个域名，改这里一次全站跟着走 */
function BaseRow() {
    const [value, setValue] = useState(() => apiBaseCustom());
    const [msg, setMsg] = useState('');
    const apply = (raw) => {
        try {
            const saved = setApiBase(raw);
            setValue(saved);
            setMsg(saved ? `已指到 ${saved}` : '改回同源 /api：后端没跑着也能照常练，只是登录和云端备份用不了。');
        }
        catch (e) {
            setMsg(e.message);
        }
    };
    return (<div className="card tight">
      <h3>后端地址</h3>
      <div className="small muted">
        现在用的是 <b className="num">{apiBaseLabel()}</b>。
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>换一个后端地址</label>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://xxxx.trycloudflare.com/api"/>
      </div>
      <div className="btnbar">
        <button className="btn primary" onClick={() => apply(value)}>
          保存
        </button>
        <button className="btn ghost" onClick={() => apply('')}>
          用同源
        </button>
      </div>
      {msg ? <div className="notice" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>);
}
function DataPanel({ state, onImport }) {
    const [msg, setMsg] = useState('');
    const fileRef = useRef(null);
    const download = () => {
        const blob = new Blob([exportJson(state)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fitplan-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    const readFile = (file) => {
        const fr = new FileReader();
        fr.onload = () => {
            try {
                onImport(parseImported(String(fr.result)));
                setMsg('导入完成，训练记录与档案已覆盖本机数据');
            }
            catch (e) {
                setMsg(`导入失败：${e.message}`);
            }
        };
        fr.readAsText(file);
    };
    const wipe = () => {
        if (!window.confirm('清空本机所有数据（档案、周框架、训练记录、Key）？这一步不能撤销，先导出一份 JSON 再清。'))
            return;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.clear();
        window.location.hash = '#/setup';
        window.location.reload();
    };
    return (<div className="card">
      <h3>导出、导入、清空</h3>
      <div className="btnbar">
        <button className="btn" onClick={download}>
          导出 JSON
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          导入 JSON
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
                readFile(f);
            e.target.value = '';
        }}/>
      <div className="btnbar" style={{ marginTop: 10 }}>
        <button className="btn danger" onClick={wipe}>
          清空本机数据
        </button>
      </div>
      {msg ? <div className="notice" style={{ marginTop: 10 }}>{msg}</div> : null}
    </div>);
}
/** 云端那一份是整份覆盖：传之前和拉回来之前都确认一次 */
function CloudPanel({ state, onImport }) {
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [conflict, setConflict] = useState('');
    if (!sessionToken())
        return (<div className="card" style={{ marginTop: 12 }}>
        <h3>云端备份</h3>
        <div className="small muted">先在「账号」里登录，云端才知道这些记录是谁的。没登录时所有记录都只在这台设备上。</div>
      </div>);
    const run = async (fn) => {
        setBusy(true);
        setMsg('');
        setConflict('');
        try {
            setMsg(await fn());
        }
        catch (e) {
            // 409 = 后端认出这台设备拿的是旧的一份，别把人家刚传上去的盖掉
            if (e.status === 409)
                setConflict(e.message);
            else
                setMsg(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const upload = () => {
        if (!window.confirm(`云端这一份会被整份换成此刻本机的记录（${countLines(state)}）。继续？`))
            return;
        void run(async () => `已传到云端：${receiptText(await pushRecords(state))}`);
    };
    const forceUpload = () => {
        void run(async () => `已覆盖云端那一份：${receiptText(await pushRecords(state, true))}`);
    };
    const download = () => {
        if (!window.confirm('这会问云端要一份回来覆盖本机记录。本机这份建议先导出 JSON 留底。继续？'))
            return;
        void run(async () => {
            const next = await pullRecords(state);
            onImport(next);
            return `从云端拉回：${countLines(next)}`;
        });
    };
    const erase = () => {
        if (!window.confirm('只删云端那一份，本机记录不动。继续？'))
            return;
        void run(async () => {
            await clearCloudRecords();
            return '云端那一份删了。本机的还在。';
        });
    };
    return (<div className="card" style={{ marginTop: 12 }}>
      <h3>云端备份</h3>
      <div className="small muted">这台设备现在攒了：{countLines(state)}。传上去是按账号分开的整份记录，换设备或清了浏览器数据之后能从云端拉回来。</div>
      <div className="btnbar" style={{ marginTop: 10 }}>
        <button className="btn" onClick={upload} disabled={busy}>
          传到云端
        </button>
        <button className="btn" onClick={download} disabled={busy}>
          从云端拉回
        </button>
        <button className="btn ghost" onClick={erase} disabled={busy}>
          删云端那一份
        </button>
      </div>
      {conflict ? (<div className="conflict">
          <div className="missing">{conflict}</div>
          <div className="btnbar">
            <button className="btn" onClick={forceUpload} disabled={busy}>
              就用本机这份覆盖
            </button>
            <button className="btn ghost" onClick={download} disabled={busy}>
              先把云端那份拉回来
            </button>
          </div>
        </div>) : null}
      {msg ? (<div className="notice" style={{ marginTop: 10 }}>
          {msg}
        </div>) : null}
    </div>);
}
