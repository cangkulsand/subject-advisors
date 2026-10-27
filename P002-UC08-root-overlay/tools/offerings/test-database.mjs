import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (!process.env.OFFERINGS_TEST_DATABASE_URL) {
  console.error('BLOCKED: Set OFFERINGS_TEST_DATABASE_URL to an explicit unpooled Neon development/test connection. No database tests were run.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.offerings.config.ts', '--configLoader', 'native', 'apps/api/src/modules/offerings/database.test.ts'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
