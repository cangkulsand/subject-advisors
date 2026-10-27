import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve('tools/p001/local'), envDir: process.cwd(), cacheDir: resolve('node_modules/.vite-p001'),
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
    fs: { allow: [process.cwd()], deny: ['**/.env*','**/.dev.vars*','**/.git/**','**/.wrangler/**','**/docs/**','**/*.pem','**/*.key'] },
  }, build: { outDir: resolve('.wrangler/p001-build/web'), emptyOutDir: true },
});
