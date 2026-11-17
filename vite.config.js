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
    // 前端默认打同源的 /api：开发时由这里转给本地后端
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.FITPLAN_API_PORT || 8787}`, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false
  }
});
