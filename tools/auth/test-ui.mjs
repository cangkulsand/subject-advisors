// Local browser tests using explicitly mocked Clerk and API responses; no real login.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const result = await build({
  entryPoints: ['apps/web/src/features/auth/testing/ui-harness.tsx'],
  bundle: true, write: false, outdir: 'dist-auth/ui-test', jsx: 'automatic',
  alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const script = result.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const server = createServer((req, res) => {
  if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
  else if (req.url?.startsWith('/test?')) {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css +
      '</style></head><body><div id="root"></div><script type="module" src="/test.js"></script></body></html>');
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<p>Test route destination</p>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
let passed = 0;
try {
  browser = await chromium.launch({ headless: true });
  async function check(name, body) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try { await body(page); passed++; console.log('PASS ' + name); }
    finally { await page.close(); }
  }
  const apiRoute = /\/api\/me(?:\/initialize)?$/;
  const account = { clerkUserId: 'user_test', appRole: 'STUDENT', accessStatus: 'ACTIVE', profileState: 'COMPLETE', landingPath: '/student' };
  async function respond(page, data = account, status = 200) {
    await page.route(apiRoute, route => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { data } : { error: data }),
    }));
  }
  await check('missing Clerk key blocks private content', async page => {
    await page.goto(base + '/test?scenario=missing-key');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Private content', { exact: true }).count(), 0);
  });
  await check('Clerk loading state blocks private content', async page => {
    await page.goto(base + '/test?scenario=loading');
    await page.getByRole('status').waitFor();
    assert.equal(await page.getByText('Private content', { exact: true }).count(), 0);
  });
  await check('signed out redirects to login', async page => {
    await page.goto(base + '/test?scenario=signed-out');
    await page.waitForURL(base + '/sign-in');
  });
  await check('approved account renders private child', async page => {
    await respond(page); await page.goto(base + '/test?scenario=allowed');
    await page.getByText('Private content', { exact: true }).waitFor();
  });
  await check('student cannot render administrator child', async page => {
    await respond(page); await page.goto(base + '/test?scenario=wrong-role');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Private content', { exact: true }).count(), 0);
  });
  await check('missing profile routes to setup', async page => {
    await respond(page, { ...account, profileState: 'UNAVAILABLE', landingPath: '/student/setup' });
    await page.goto(base + '/test?scenario=setup');
    await page.waitForURL(base + '/student/setup');
  });
  await check('auth completion uses approved role destination', async page => {
    await respond(page); await page.goto(base + '/test?scenario=complete');
    await page.waitForURL(base + '/student');
  });
  await check('expired API session displays recovery', async page => {
    await respond(page, { code: 'SESSION_INVALID', message: 'Your session has expired.' }, 401);
    await page.goto(base + '/test?scenario=expired');
    await page.getByRole('alert').waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    assert.equal(await page.getByText('Private content', { exact: true }).count(), 0);
  });
  await check('service failure supports retry and keyboard use', async page => {
    await respond(page, { code: 'AUTH_UNAVAILABLE', message: 'Please retry.' }, 503);
    await page.goto(base + '/test?scenario=offline');
    await page.getByRole('button', { name: 'Retry', exact: true }).focus();
    await page.unroute(apiRoute);
    await respond(page);
    await page.keyboard.press('Enter');
    await page.getByText('Private content', { exact: true }).waitFor();
  });
  await check('logout failure is visible and retryable', async page => {
    await page.goto(base + '/test?scenario=logout-failure');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).isEnabled(), true);
  });
  await check('logout calls Clerk signOut', async page => {
    await page.goto(base + '/test?scenario=logout-success');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.signedOut === 'true');
  });
  console.log(passed + ' UI checks passed (mock Clerk/API).');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
