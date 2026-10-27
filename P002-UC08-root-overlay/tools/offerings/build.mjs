import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
await build({
  entryPoints: [resolve(root, 'apps/api/src/modules/offerings/index.ts')], outfile: resolve(root, 'dist-offerings/api.js'),
  bundle: true, format: 'esm', platform: 'browser', conditions: ['worker', 'browser'], target: 'es2022',
});
await build({
  entryPoints: [resolve(root, 'apps/web/src/features/offerings/index.ts')], outfile: resolve(root, 'dist-offerings/web.js'),
  bundle: true, format: 'esm', platform: 'browser', external: ['react', 'react-dom'], jsx: 'automatic', target: 'es2022',
});
await build({
  entryPoints: [resolve(root, 'apps/web/src/features/offerings/StudentOfferingsRoute.tsx')], outfile: resolve(root, 'dist-offerings/integration-web.js'),
  bundle: true, format: 'esm', platform: 'browser', external: ['react', 'react-dom', '@clerk/react'], jsx: 'automatic', target: 'es2022',
});
await viteBuild({ configFile: resolve(root, 'vite.offerings.config.ts'), configLoader: 'native' });
