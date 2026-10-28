import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('apps/web'),
  envDir: process.cwd(),
  cacheDir: resolve('node_modules/.vite-cloudflare'),
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: resolve('dist-cloudflare/web'), emptyOutDir: true },
});
