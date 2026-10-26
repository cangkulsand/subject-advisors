import { build } from 'esbuild';
import { prepareIntegration } from '../integration/prepare.mjs';
await prepareIntegration();
await build({
  entryPoints: ['tools/auth/local/api.ts'],
  outfile: 'dist-auth/api.js', bundle: true, format: 'esm', platform: 'browser',
  conditions: ['worker', 'browser'], target: 'es2022',
});
await build({
  entryPoints: ['apps/web/src/features/auth/index.ts'],
  outfile: 'dist-auth/web.js', bundle: true, format: 'esm', platform: 'browser',
  external: ['react', 'react-dom', '@clerk/react', 'react-router-dom'],
  jsx: 'automatic', target: 'es2022',
});
