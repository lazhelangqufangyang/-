import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
