import { useEffect, useState } from 'react';

/**
 * 主屏安装入口：Android Chrome 拿到 beforeinstallprompt 就显示按钮；
 * 已经在独立窗口里运行时只显示状态，不再打扰。
 */
export default function InstallPwa() {
    // 开发阶段不显示主屏安装入口
    if (import.meta.env.DEV)
        return null;
    const [prompt, setPrompt] = useState(null);
    const [installed, setInstalled] = useState(() => {
        if (typeof window === 'undefined')
            return false;
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    });
    const [msg, setMsg] = useState('');

    useEffect(() => {
        const onPrompt = (event) => {
            event.preventDefault();
            setPrompt(event);
        };
        const onInstalled = () => {
            setInstalled(true);
            setPrompt(null);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const install = async () => {
        if (!prompt)
            return;
        prompt.prompt();
        const choice = await prompt.userChoice.catch(() => null);
        if (choice?.outcome === 'accepted') {
            setInstalled(true);
            setPrompt(null);
        }
        else {
            setMsg('已取消。也可以从浏览器菜单选择「安装应用 / 添加到主屏幕」。');
        }
    };

    return (<div className="card" style={{ marginBottom: 12 }}>
      <h3>安装到主屏</h3>
      {installed ? (<div className="small muted">已作为独立 App 运行（主屏图标）。动作检查会全屏打开摄像头。</div>) : (<>
          <div className="small muted">装到主屏后从图标启动，没有地址栏；动作检查会全屏打开摄像头。</div>
          {prompt ? (<button className="btn primary" style={{ marginTop: 8 }} onClick={() => void install()}>
              安装到主屏
            </button>) : (<div className="faint small" style={{ marginTop: 6 }}>
              Android Chrome：右上角菜单 →「安装应用」或「添加到主屏幕」；iPhone Safari：分享 →「添加到主屏幕」。
            </div>)}
          {msg ? <div className="notice" style={{ marginTop: 8 }}>{msg}</div> : null}
        </>)}
    </div>);
}