import { defineConfig } from 'vite';

export default defineConfig({
  base: '/DiscoFlow/',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist'
  }
});
