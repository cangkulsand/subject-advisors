import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve(import.meta.dirname, 'tools/offerings/demo'),
  // Fictional demo never loads the shared application's credential files.
  envDir: resolve(import.meta.dirname, 'tools/offerings/demo'),
  cacheDir: resolve(import.meta.dirname, '.cache-offerings/vite'),
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 5174, strictPort: true,
    fs: { allow: [resolve(import.meta.dirname)], deny: ['**/.env*', '**/.dev.vars*', '**/.git/**', '**/docs/**', '**/*.pem', '**/*.key'] } },
  build: { outDir: resolve(import.meta.dirname, 'dist-offerings/demo'), emptyOutDir: true },
});
