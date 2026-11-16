import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 经 cpolar 隧道访问时 Host 是外部域名，需放行，否则返回 403
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    // 预览服务同样放行隧道域名，并代理 /api，让一个端口同时对外提供前后端
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
