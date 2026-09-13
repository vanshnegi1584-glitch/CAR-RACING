import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  publicDir: '../public',
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
  server: { host: '0.0.0.0' },
});
