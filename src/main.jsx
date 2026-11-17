import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
createRoot(document.getElementById('root')).render(<StrictMode>
    <App />
  </StrictMode>);
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            /* 离线能力不可用时应用照常工作 */
        });
    });
}
