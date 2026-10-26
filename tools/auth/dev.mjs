import { spawn } from 'node:child_process';
import { copyFile, constants } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareIntegration } from '../integration/prepare.mjs';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
await prepareIntegration();
for (const [template, target] of [['.env.example', '.env.local'], ['.dev.vars.example', '.dev.vars']]) {
  try { await copyFile(template, target, constants.COPYFILE_EXCL); console.log('Created ' + target + ' from template.'); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
for (const args of [
  ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'wrangler.auth.jsonc', '--local', '--log-level', 'warn'],
  ['node_modules/vite/bin/vite.js', '--config', 'vite.auth.config.ts'],
]) {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs', WRANGLER_REGISTRY_PATH: '.wrangler/registry', BROWSER: 'none' },
  });
  children.push(child);
  child.on('error', error => { console.error('Local server failed to start: ' + error.code); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('Open http://127.0.0.1:5173 in your browser. Press Ctrl+C to stop both servers.');
