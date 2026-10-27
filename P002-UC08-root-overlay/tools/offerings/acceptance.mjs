// Strict local evidence gate. It never converts a skipped DB suite into acceptance.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const node = process.execPath;
const checks = [
  ['typecheck', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.offerings.json']],
  ['lint', ['node_modules/eslint/bin/eslint.js', 'apps/api/src/modules/offerings', 'apps/web/src/features/offerings', 'packages/shared/src/offerings', 'tools/offerings/demo', 'vite.offerings.config.ts', 'vitest.offerings.config.ts', '--max-warnings', '0']],
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.offerings.config.ts', '--configLoader', 'native']],
  ['browser', ['tools/offerings/test-ui.mjs']],
  ['build', ['tools/offerings/build.mjs']],
];
const report = { owner: 'P002', useCase: 'UC08', timestamp: new Date().toISOString(), checks: [], status: 'IN_PROGRESS', remaining: [] };
for (const [name, args] of checks) {
  console.log('\nChecking ' + name + '...');
  const result = spawnSync(node, args, { cwd: root, stdio: 'inherit', env: process.env });
  report.checks.push({ name, status: result.status === 0 ? 'PASS' : 'FAIL' });
  if (result.status !== 0) break;
}
if (!process.env.OFFERINGS_TEST_DATABASE_URL) {
  report.checks.push({ name: 'real-postgresql', status: 'BLOCKED', reason: 'OFFERINGS_TEST_DATABASE_URL is not configured. No production/local connection fallback is used.' });
} else if (report.checks.every(check => check.status === 'PASS')) {
  // The regular unit run above includes the database suite when explicitly configured.
  report.checks.push({ name: 'real-postgresql', status: 'PASS', note: 'Explicit test connection; session-local temporary fixtures.' });
}
report.remaining = [
  'Mount the provided adapters in FOUNDATION routing using the real P001 ProfileReader and approved reference schema/data.',
  'Complete real-session two-student verification and human acceptance review; this script cannot grant peer approval.',
];
report.status = report.checks.some(check => check.status === 'FAIL') ? 'CHANGES_REQUESTED' :
  report.checks.some(check => check.status === 'BLOCKED') ? 'BLOCKED_EXTERNAL_DEPENDENCY' : 'READY_FOR_REVIEW';
await mkdir(resolve(root, 'dist-offerings/acceptance'), { recursive: true });
await writeFile(resolve(root, 'dist-offerings/acceptance/result.json'), JSON.stringify(report, null, 2) + '\n');
console.log('\nUC08 acceptance evidence: ' + report.status);
for (const check of report.checks) console.log(check.name + ': ' + check.status + (check.reason ? ' — ' + check.reason : ''));
console.log('Report: dist-offerings/acceptance/result.json');
if (report.status !== 'READY_FOR_REVIEW') process.exitCode = 1;
