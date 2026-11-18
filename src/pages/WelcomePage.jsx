import { useEffect, useState } from 'react';
import { checkHealth, signInHref } from '../api/account.js';
/**
 * 第一次进来的那一屏：两条路自己选，选完就不再问。
 * 登录和注册是同一个入口 —— 支付宝认出来的是谁，库里那行就是谁，没有单独注册这一步。
 */
export default function Welcome({ onDirect, onPlan }) {
    const [login, setLogin] = useState('off');
    useEffect(() => {
        void checkHealth()
            .then((h) => setLogin(h.alipay === 'configured' ? 'ready' : 'off'))
            .catch(() => setLogin('off'));
    }, []);
    return (<div className="welcome">
      <div className="welcome-brand">练</div>
      <h1 className="welcome-title">
        这一周
        <br />
        练成看得见的东西
      </h1>
      <div className="welcome-sub">重量、组数、吃了多少，都只存在这台设备的浏览器里。</div>

      <div className="welcome-actions">
        <button className="btn primary big" onClick={onDirect}>
          直接开始使用
        </button>
        <button className="btn sheet" onClick={onPlan}>
          自动生成训练清单
        </button>
      </div>

      <div className="welcome-foot">
        {login === 'ready' ? (<a className="welcome-login" href={signInHref()}>
            支付宝登录 / 注册
          </a>) : (<span className="welcome-login off">支付宝登录 / 注册</span>)}
        <span className="welcome-privacy">数据只存在这台设备</span>
      </div>
    </div>);
}
