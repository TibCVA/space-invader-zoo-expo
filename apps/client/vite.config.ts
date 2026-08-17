import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@auvergne/engine': r('../../packages/engine/src/index.ts'),
      '@auvergne/game': r('../../packages/game/src/index.ts'),
      '@auvergne/content': r('../../packages/content/src/index.ts'),
      '@auvergne/map': r('../../packages/map/src/index.ts'),
      '@auvergne/bots': r('../../packages/bots/src/index.ts'),
      '@auvergne/protocol': r('../../packages/protocol/src/index.ts'),
      '@auvergne/ui': r('../../packages/ui/src/index.ts'),
      '@': r('./src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: ['es2022', 'safari16.4'],
    sourcemap: false,
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'pixi', test: /node_modules[\\/]pixi/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
});
