// Actual application routes with TEST-ONLY Clerk/API fixtures. No credentials or database access.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { fixtureResponse } from './fixtures.mjs';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const output = await build({ entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false, outdir: '.wrangler/admin-review', jsx: 'automatic', loader: { '.png': 'dataurl' }, alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' } });
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const serve = process.argv.includes('--serve');
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
  else if (req.url?.startsWith('/api/')) {
    const data = fixtureResponse(new URL(req.url, 'http://127.0.0.1'));
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    res.statusCode = req.method !== 'GET' ? 405 : data ? 200 : 404;
    res.end(JSON.stringify({ data }));
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Admin preview — fictional data</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body>' + (serve ? '<div style="position:relative;z-index:1;padding:6px 12px;background:#fffbeb;color:#78350f;font:12px system-ui;margin:-2rem -1rem 2rem">LOCAL PREVIEW · Fictional accounts and counts · No live Clerk or database connection</div>' : '') + '<div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  }
});
await new Promise(done => server.listen(serve ? 5175 : 0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
if (serve) console.log('Fictional admin preview: ' + base + '/admin');
else {
  let browser, passed = 0;
  await mkdir('.wrangler/admin-review', { recursive: true });
  await mkdir('.wrangler/staff-menu-review', { recursive: true });
  async function mock(page, state = {}) {
    await page.route(/\/api\//, async route => {
      const url = new URL(route.request().url()); (state.requests ??= []).push({ path: url.pathname, search: url.search, method: route.request().method() });
      if (state.delay && url.pathname.startsWith('/api/admin')) await new Promise(done => setTimeout(done, state.delay));
      const failed = state.fail && url.pathname.startsWith('/api/admin');
      const data = fixtureResponse(url, state);
      await route.fulfill({ status: failed ? 503 : data ? 200 : 404, contentType: 'application/json', body: JSON.stringify(failed ? { error: { code: 'ADMIN_UNAVAILABLE', message: 'Fixture service unavailable. Please retry.' } } : { data }) });
    });
    return state;
  }
  async function check(name, body, width = 1440) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }); const errors = []; page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    try { await body(page); assert.deepEqual(errors, []); passed++; console.log('PASS ' + name); }
    catch (error) { console.error(name, errors, await page.locator('body').innerText()); throw error; }
    finally { await page.close(); }
  }
  try {
    browser = await chromium.launch({ headless: true });
    await check('aggregate overview, clickable planned setup and account filter navigation', async page => {
      const state = await mock(page); await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      assert.ok((await page.locator('.admin-metrics').innerText()).includes('23'));
      assert.equal(await page.getByText('Fictional Administrator', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('link', { name: 'Academic Semesters', exact: true, includeHidden: true }).count(), 2); // Desktop and mobile dialog.
      await page.getByRole('link', { name: 'Academic Semesters', exact: true }).click();
      await page.getByRole('heading', { name: 'Academic Semesters', exact: true }).waitFor();
      await page.getByText('This workspace is planned.', { exact: false }).waitFor();
      assert.deepEqual(state.requests.map(request => request.path), ['/api/me', '/api/admin/overview']);
      assert.ok(state.requests.every(request => request.method === 'GET'));
      await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.screenshot({ path: '.wrangler/admin-review/overview-desktop.png', fullPage: true });
      await page.getByRole('link', { name: /Suspended accounts/ }).click(); await page.getByRole('heading', { name: 'Users & Access', exact: true }).waitFor();
      assert.equal(await page.getByLabel('Access', { exact: true }).inputValue(), 'SUSPENDED');
      await page.getByText('Fictional Account 3', { exact: true }).waitFor();
    });
    await check('all admin planned destinations are navigable and data-free', async page => {
      const state = await mock(page, { roles: ['SYSTEM_ADMIN'] }); await page.goto(base + '/admin');
      await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.screenshot({ path: '.wrangler/staff-menu-review/admin-desktop.png', fullPage: true });
      const navigation = page.getByRole('navigation', { name: 'Administration navigation' });
      for (const [label, title] of [['Academic Semesters', 'Academic Semesters'], ['Curriculum & Prerequisites', 'Curriculum & Prerequisites'], ['Graduation Requirements', 'Graduation Requirements']]) {
        await navigation.getByRole('link', { name: label, exact: true }).click();
        await page.getByRole('heading', { name: title, exact: true }).waitFor();
        await page.getByText('This workspace is planned.', { exact: false }).waitFor();
        assert.equal(await page.locator('form').count(), 0);
        assert.equal(await page.getByRole('button', { name: /save|generate|upload|import|delete|grant/i }).count(), 0);
        assert.ok(!/\b(?:23|22|40)\b/.test(await page.locator('.admin-planned-page').innerText()));
      }
      assert.deepEqual(state.requests.map(request => request.path), ['/api/me', '/api/admin/overview']);
      assert.ok(state.requests.every(request => request.method === 'GET'));
    });
    await check('coordinator quick links and seven planned routes use only account access', async page => {
      const state = await mock(page, { roles: ['COORDINATOR'] }); await page.goto(base + '/coordinator');
      await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
      const destinations = [
        ['Data Imports', 'Data Imports'], ['Data Quality', 'Data Quality'], ['Class Offering Forecast', 'Class Offering Forecast'],
        ['Forecast Versions', 'Forecast Versions'], ['Compare Versions', 'Compare Versions'], ['Offering Decisions', 'Offering Decisions'], ['Decision Audit', 'Decision Audit'],
      ];
      const quicklinks = page.locator('.coordinator-quicklinks');
      assert.equal(await quicklinks.getByRole('link').count(), destinations.length);
      assert.ok(!/\b\d+\b/.test(await quicklinks.innerText()));
      await page.screenshot({ path: '.wrangler/staff-menu-review/coordinator-desktop.png', fullPage: true });
      const navigation = page.getByRole('navigation', { name: 'Coordinator navigation' });
      for (const [label, title] of destinations) {
        await navigation.getByRole('link', { name: label, exact: true }).click();
        await page.getByRole('heading', { name: title, exact: true }).waitFor();
        await page.getByText('This workspace is planned.', { exact: false }).waitFor();
        assert.equal(await page.locator('form').count(), 0);
        assert.equal(await page.getByRole('button', { name: /save|generate|upload|import|delete|grant/i }).count(), 0);
      }
      assert.deepEqual(state.requests.map(request => request.path), ['/api/me']);
      assert.ok(state.requests.every(request => request.method === 'GET'));
    });
    await check('nested admin route keeps Users active and RoleSwitcher matches staff workspace', async page => {
      await mock(page); await page.goto(base + '/admin/users/1'); await page.getByRole('heading', { name: 'Account details', exact: true }).waitFor();
      const navigation = page.getByRole('navigation', { name: 'Administration navigation' });
      assert.equal(await navigation.getByRole('link', { name: 'Users & Access', exact: true }).getAttribute('aria-current'), 'page');
      assert.equal(await navigation.getByRole('link', { name: 'Overview', exact: true }).getAttribute('aria-current'), null);
      const workspace = page.getByRole('combobox', { name: 'Workspace view' });
      assert.equal(await workspace.inputValue(), 'SYSTEM_ADMIN');
      await page.goto(base + '/coordinator/imports'); await page.getByRole('heading', { name: 'Data Imports', exact: true }).waitFor();
      assert.equal(await page.getByRole('combobox', { name: 'Workspace view' }).inputValue(), 'COORDINATOR');
      assert.equal(await page.getByRole('heading', { name: 'Academic profile setup' }).count(), 0);
    });
    await check('guarded staff boundaries deny incompatible roles and unknown nested paths', async page => {
      for (const [role, path, expected] of [
        ['STUDENT', '/admin', 'does not have access'], ['STUDENT', '/coordinator', 'does not have access'],
        ['SYSTEM_ADMIN', '/coordinator', 'does not have access'], ['COORDINATOR', '/admin', 'does not have access'],
      ]) {
        const state = await mock(page, { roles: [role] }); await page.goto(base + path + '?test-session=' + encodeURIComponent(role + path));
        await page.getByRole('alert').filter({ hasText: expected }).waitFor();
        assert.equal(state.requests.filter(request => request.path.startsWith('/api/admin')).length, 0);
        await page.unroute(/\/api\//);
      }
      for (const [role, path, workspace] of [['SYSTEM_ADMIN', '/admin/not-a-page', 'Administration'], ['COORDINATOR', '/coordinator/not-a-page', 'Coordinator']]) {
        await mock(page, { roles: [role] }); await page.goto(base + path + '?test-session=' + encodeURIComponent(role + path));
        await page.getByRole('heading', { name: 'Page not found', exact: true }).waitFor();
        await page.getByRole('navigation', { name: workspace + ' navigation' }).waitFor();
        await page.unroute(/\/api\//);
      }
    });
    await check('signed-out staff routes redirect to sign in', async page => {
      await page.goto(base + '/coordinator/imports?scenario=signed-out'); await page.waitForURL(base + '/sign-in');
      assert.equal(await page.getByRole('heading', { name: 'Data Imports', exact: true }).count(), 0);
    });
    await check('expanded groups preserve collapse choice and reopen the active group through history', async page => {
      await mock(page); await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      const setup = page.locator('.admin-sidebar details').nth(1);
      const summary = setup.locator('summary');
      assert.equal(await setup.evaluate(element => element.open), true);
      await summary.click(); assert.equal(await setup.evaluate(element => element.open), false);
      await page.getByRole('navigation', { name: 'Administration navigation' }).getByRole('link', { name: 'Users & Access' }).click();
      await page.getByRole('heading', { name: 'Users & Access', exact: true }).waitFor();
      assert.equal(await setup.evaluate(element => element.open), false);
      await page.goBack(); await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
      assert.equal(await setup.evaluate(element => element.open), false);
      await page.goForward(); await page.getByRole('heading', { name: 'Users & Access', exact: true }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: 'Administration navigation' }).getByRole('link', { name: 'Users & Access' }).getAttribute('aria-current'), 'page');
      assert.equal(await setup.evaluate(element => element.open), false);
      await page.evaluate(() => { history.pushState({}, '', '/admin/semesters'); dispatchEvent(new PopStateEvent('popstate')); });
      await page.getByRole('heading', { name: 'Academic Semesters', exact: true }).waitFor();
      assert.equal(await setup.evaluate(element => element.open), true);
      const duplicates = await page.locator('[id]').evaluateAll(elements => { const ids = elements.map(element => element.id); return ids.length - new Set(ids).size; });
      assert.equal(duplicates, 0);
    });
    for (const width of [320, 375, 768, 1280]) await check('staff shells have no horizontal overflow at ' + width, async page => {
      await mock(page, { roles: ['COORDINATOR'] }); await page.setViewportSize({ width, height: 600 }); await page.goto(base + '/coordinator');
      await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375) await page.screenshot({ path: '.wrangler/staff-menu-review/coordinator-mobile.png', fullPage: true });
      if (width === 320) {
        const dialog = page.getByRole('button', { name: 'Open navigation' }); await dialog.click();
        const menu = page.getByRole('dialog', { name: 'Coordinator menu' }); await menu.waitFor();
        assert.ok(await menu.evaluate(element => element.scrollHeight > element.clientHeight));
        await menu.evaluate(element => { element.scrollTop = element.scrollHeight; });
        assert.ok(await menu.evaluate(element => element.scrollTop > 0));
      }
      if (width === 1280) {
        const nav = page.locator('.admin-sidebar nav');
        assert.ok(await nav.evaluate(element => element.scrollHeight > element.clientHeight));
        await nav.evaluate(element => { element.scrollTop = element.scrollHeight; });
        assert.ok(await nav.evaluate(element => element.scrollTop > 0));
      }
    });
    await check('admin mobile shell screenshot at 375px', async page => {
      await mock(page, { roles: ['SYSTEM_ADMIN'] }); await page.setViewportSize({ width: 375, height: 844 }); await page.goto(base + '/admin');
      await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.screenshot({ path: '.wrangler/staff-menu-review/admin-mobile.png', fullPage: true });
    }, 375);
    await check('mobile dialog focus cycle, Escape, backdrop and navigation close behavior', async page => {
      await mock(page, { roles: ['COORDINATOR'] }); await page.setViewportSize({ width: 375, height: 600 }); await page.goto(base + '/coordinator');
      await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
      const opener = page.getByRole('button', { name: 'Open navigation' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Coordinator menu' }); await dialog.waitFor();
      const targetHeights = await dialog.locator('.staff-nav-group summary, .staff-nav-group-links .admin-nav-link').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => element.getBoundingClientRect().height));
      assert.ok(targetHeights.length > 0 && targetHeights.every(height => height >= 44));
      const focusables = await dialog.evaluate(element => [...element.querySelectorAll('button:not([disabled]),a[href],summary')].filter(control => control.getClientRects().length).map(control => ({ tag: control.tagName, label: control.getAttribute('aria-label') || control.textContent?.trim() })));
      assert.ok(focusables.length > 4);
      await dialog.getByRole('button', { name: 'Close navigation' }).focus(); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), focusables.at(-1)?.label);
      await page.keyboard.press('Tab'); await dialog.getByRole('button', { name: 'Close navigation' }).waitFor();
      await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), false); assert.equal(await opener.evaluate(element => element === document.activeElement), true);
      await opener.click(); await page.mouse.click(350, 550); assert.equal(await dialog.isVisible(), false);
      await opener.click(); await dialog.getByRole('link', { name: 'Data Imports', exact: true }).click();
      await page.getByRole('heading', { name: 'Data Imports', exact: true }).waitFor(); assert.equal(await dialog.isVisible(), false);
    }, 375);
    await check('search, overlapping roles, pagination, account details and audit', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users'); await page.getByText('Fictional Administrator', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.getByText('Fictional Account 23', { exact: true }).waitFor();
      await page.getByLabel('Search accounts', { exact: true }).fill('fixture1@example.invalid'); await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByText('1 result · Page 1 of 1', { exact: true }).waitFor();
      await page.getByRole('link', { name: /View details for Fictional Administrator/ }).click(); await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.equal(await page.locator('.admin-memberships article').count(), 3);
      await page.getByRole('region', { name: 'Access audit table' }).waitFor();
      assert.equal(await page.evaluate(() => window.untrustedExecuted), undefined);
      assert.ok(state.requests.some(request => request.search.includes('accountId=1')));
      assert.ok(state.requests.every(request => request.method === 'GET'));
      await page.screenshot({ path: '.wrangler/admin-review/account-desktop.png', fullPage: true });
    });
    await check('same-path overview links update role filter', async page => {
      await mock(page); await page.goto(base + '/admin/users?role=SYSTEM_ADMIN'); await page.getByText('1 result · Page 1 of 1').waitFor();
      await page.evaluate(() => { history.pushState({}, '', '/admin/users?role=COORDINATOR'); dispatchEvent(new PopStateEvent('popstate')); });
      await page.getByText('2 results · Page 1 of 1').waitFor(); assert.equal(await page.getByLabel('Role', { exact: true }).inputValue(), 'COORDINATOR');
    });
    await check('audit kind and date filters plus literal untrusted text', async page => {
      const state = await mock(page); await page.goto(base + '/admin/audit'); await page.getByRole('region', { name: 'Access audit table' }).waitFor();
      assert.ok((await page.locator('.admin-reason').first().innerText()).includes('<script>')); assert.equal(await page.evaluate(() => window.untrustedExecuted), undefined);
      await page.getByLabel('Event type', { exact: true }).selectOption('ACCESS'); await page.getByText('1 result · Page 1 of 1').waitFor();
      await page.getByLabel('From', { exact: true }).fill('2026-10-28'); await page.getByLabel('To', { exact: true }).fill('2026-10-28'); await page.getByRole('button', { name: 'Apply filters' }).click();
      await page.getByText('1 result · Page 1 of 1').waitFor(); assert.ok(state.requests.some(request => request.search.includes('from=2026-10-28') && request.search.includes('to=2026-10-28')));
    });
    await check('empty accounts and explicit identity degradation', async page => {
      const state = await mock(page, { empty: true }); await page.goto(base + '/admin/users'); await page.getByRole('heading', { name: 'No accounts found' }).waitFor();
      state.empty = false; state.degraded = true; await page.getByRole('button', { name: 'Reset filters' }).click();
      await page.getByRole('status').filter({ hasText: 'Some Clerk identity' }).waitFor(); assert.equal(await page.getByText('Identity unavailable', { exact: true }).count(), 20);
    });
    await check('loading, service failure and retry', async page => {
      const state = await mock(page, { fail: true, delay: 300 }); await page.goto(base + '/admin'); await page.getByRole('status').filter({ hasText: 'Loading administration' }).waitFor();
      await page.getByRole('alert').filter({ hasText: 'Fixture service unavailable' }).waitFor(); state.fail = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click(); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
    });
    for (const role of ['STUDENT', 'COORDINATOR']) await check(role + ' cannot open admin or read any admin API', async page => {
      const state = await mock(page, { roles: [role] }); await page.goto(base + '/admin/users/1'); await page.getByRole('alert').filter({ hasText: 'does not have access' }).waitFor();
      assert.equal(state.requests.filter(request => request.path.startsWith('/api/admin')).length, 0);
    });
    for (const width of [320, 375, 768, 1280]) await check('responsive navigation and local table scrolling at ' + width, async page => {
      await mock(page); await page.goto(base + '/admin/users'); await page.getByText('Fictional Administrator', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width < 761) {
        const toggle = page.getByRole('button', { name: 'Open navigation' }); await toggle.click(); await page.getByRole('dialog', { name: 'Administration menu' }).waitFor();
        await page.keyboard.press('Shift+Tab'); assert.ok(await page.evaluate(() => !!document.activeElement?.closest('dialog')));
        await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').isVisible(), false); assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
        const table = page.getByRole('region', { name: 'Application accounts table' }); await table.focus(); await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('.admin-table-scroll').scrollLeft > 0);
      }
      if (width === 375 || width === 1280) await page.screenshot({ path: '.wrangler/admin-review/users-' + width + '.png', fullPage: true });
    }, width);
    console.log('PASS ' + passed + ' administration browser checks');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
