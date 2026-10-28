import { prepareIntegration } from '../integration/prepare.mjs';
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const buildEnv = loadEnv('production', process.cwd(), '');
const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || buildEnv.VITE_CLERK_PUBLISHABLE_KEY?.trim();
if (!publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY. Set the Clerk publishable key as a Workers Builds build variable.');
}

await prepareIntegration();
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.cloudflare.config.ts'], {
  stdio: 'inherit', env: { ...process.env, VITE_CLERK_PUBLISHABLE_KEY: publishableKey },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
