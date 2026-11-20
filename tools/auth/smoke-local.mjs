import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin = 'http://127.0.0.1:5173';
const status = await fetch(origin + '/api/auth/local-status');
assert.equal(status.status, 200);
assert.equal(typeof (await status.json()).configured, 'boolean');
for (const [path, method] of [['/api/me', 'GET'], ['/api/me/initialize', 'POST']]) {
  const response = await fetch(origin + path, { method });
  assert.equal(response.status, 401);
}
assert.equal((await fetch(origin + '/api/unimplemented')).status, 404);
for (const path of [
  '/@fs/D:/sharhan/development/subject%20advisors/.env.local',
  '/@fs/D:/sharhan/development/subject%20advisors/.dev.vars',
]) {
  assert.equal((await fetch(origin + path)).status, 403);
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Finish local setup' }).waitFor();
  await page.getByRole('status').filter({ hasText: 'Local API is running' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS local Vite page, real Worker proxy, 401 guards, 404 boundary, secret-file denial and setup screen.');
} finally { await browser.close(); }
