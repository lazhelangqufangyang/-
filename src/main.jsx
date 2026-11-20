import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
createRoot(document.getElementById('root')).render(<StrictMode>
    <App />
  </StrictMode>);
if ('serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {
                /* 离线能力不可用时应用照常工作 */
            });
        });
    }
    else {
        // 开发时让 Service Worker 退场，避免本地一直拿到旧缓存
        navigator.serviceWorker.getRegistrations()
            .then((regs) => regs.forEach((reg) => reg.unregister()))
            .catch(() => undefined);
    }
}
