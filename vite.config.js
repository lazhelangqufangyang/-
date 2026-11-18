import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// SPA fallback 会把 /landing/ 目录 URL 吞成应用壳，这里先指到落地页自己的 index
const landingIndex = {
  name: 'landing-dir-index',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/landing' || req.url === '/landing/') req.url = '/landing/index.html';
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/landing' || req.url === '/landing/') req.url = '/landing/index.html';
      next();
    });
  }
};

export default defineConfig({
  plugins: [landingIndex, tailwindcss(), react()],
  server: {
    // 本地开发统一走同源 /api：由 Vite 代理到真实后端，避免跨域和 HTML fallback。
    proxy: {
      '/api': {
        target: process.env.FITPLAN_API_URL || `http://localhost:${process.env.FITPLAN_API_PORT || 8080}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false
  }
});
