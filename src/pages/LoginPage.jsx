import AccountCard from '../components/AccountCard.jsx';

/**
 * 登录页：桌面是左右分栏（品牌视觉 + 表单），手机保持单列。
 * 训练记录不依赖登录，所以始终留一条「先不登录」的退路。
 */
export default function LoginPage({ onBack, onLoggedIn }) {
    return (<div className="login-page">
      <aside className="login-visual" aria-hidden="true">
        <div className="login-visual-bg"/>
        <div className="login-visual-copy">
          <span className="login-kicker">LIAN · FITPLAN</span>
          <h1>把「想练成什么样」<br/>翻成今天做哪几组</h1>
          <p>周框架、逐组记录、动作检查都留在这台设备上。登录只用来同步订阅和云端备份。</p>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <div className="login-mobile-brand">
            <span>LIAN · FITPLAN</span>
            <b>练</b>
          </div>
          <header className="login-head">
            <h2>登录</h2>
            <p>登录是可选的；不登录也能照常训练和记录。</p>
          </header>
          <AccountCard onLoggedIn={onLoggedIn}/>
          <button className="btn ghost" style={{ marginTop: 12, width: '100%' }} onClick={onBack}>
            先不登录，返回
          </button>
        </div>
      </main>
    </div>);
}
