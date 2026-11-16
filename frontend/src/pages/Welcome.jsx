import { loginUrl, getToken } from '../lib/api';

const FEATURES = [
  { title: '周框架', desc: '按你一周能练几天排，不套固定课表' },
  { title: '今日清单', desc: '点几个部位就排几个动作，练的时候不计时' },
  { title: '记录', desc: '重量、次数、饮食、体重腰围，一处看完' },
];

export default function Welcome({ go, update }) {
  const loggedIn = Boolean(getToken());

  const freeStart = () => {
    update((state) => ({ ...state, onboardingDone: true }));
    go('/train');
  };

  return (
    <div className="welcome">
      <div className="welcome-brand">练</div>
      <h1 className="welcome-title">
        把「想练成什么样」
        <br />
        翻译成今天练什么
      </h1>
      <p className="welcome-sub">
        今天点几个练的部位就排几个，练的时候不计时、不掐点。记录默认只存在这台设备。
      </p>

      <div className="welcome-actions">
        <button
          className="btn big primary"
          type="button"
          onClick={() => go(loggedIn ? '/setup' : '/settings/account')}
        >
          {loggedIn ? '花两分钟建档' : '登录 / 注册后开始'}
        </button>
        {loggedIn ? (
          <button className="btn big ghost" type="button" onClick={freeStart}>
            先随便练练
          </button>
        ) : null}
      </div>

      <ul className="welcome-feats">
        {FEATURES.map((item) => (
          <li key={item.title}>
            <b>{item.title}</b>
            <span>{item.desc}</span>
          </li>
        ))}
      </ul>

      <div className="welcome-foot">
        {loggedIn ? (
          <button className="btn ghost" type="button" onClick={() => go('/settings/account')}>
            已登录 · 查看账号
          </button>
        ) : (
          <a className="btn ghost" href={loginUrl()}>
            支付宝登录 / 注册
          </a>
        )}
        <div className="faint">
          登录后才能建档、记录训练和查看饮食；记录默认只存在这台设备。
        </div>
      </div>
    </div>
  );
}
