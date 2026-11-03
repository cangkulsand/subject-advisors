// Actual application routes with TEST-ONLY Clerk/API fixtures. No credentials or database access.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { assertReadable } from '../ui/readability.mjs';
import { fixtureMutation, fixtureResponse } from './fixtures.mjs';
import { academicUiChecks } from './academic-ui-checks.mjs';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const output = await build({ entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false, outdir: '.wrangler/admin-review', jsx: 'automatic', loader: { '.png': 'dataurl' }, alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' } });
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const serve = process.argv.includes('--serve');
const serveState = {};
const server = createServer(async (req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
  else if (req.url?.startsWith('/api/')) {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const result = serve ? fixtureMutation(req.method, url, JSON.parse(raw || '{}'), serveState) : null;
      res.statusCode = result?.status ?? 405; res.end(JSON.stringify(result?.payload ?? { error: { code: 'METHOD_NOT_ALLOWED', message: 'Not supported.' } }));
    } else {
      const data = fixtureResponse(url, serveState);
      res.statusCode = data !== null || url.pathname === '/api/admin/academic-setup/current-semester' ? 200 : 404; res.end(JSON.stringify({ data }));
    }
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
      if (route.request().method() !== 'GET') {
        (state.bodies ??= []).push({ method: route.request().method(), path: url.pathname, body: route.request().postDataJSON() });
        const result = state.mutationError ? { status: state.mutationError.status, payload: { error: state.mutationError } } : fixtureMutation(route.request().method(), url, route.request().postDataJSON(), state);
        await route.fulfill({ status: result?.status ?? 405, contentType: 'application/json', body: JSON.stringify(result?.payload ?? { error: { code: 'METHOD_NOT_ALLOWED', message: 'Not supported.' } }) });
        return;
      }
      const data = fixtureResponse(url, state);
      await route.fulfill({ status: failed ? 503 : data !== null || url.pathname === '/api/admin/academic-setup/current-semester' ? 200 : 404, contentType: 'application/json', body: JSON.stringify(failed ? { error: { code: 'ADMIN_UNAVAILABLE', message: 'Fixture service unavailable. Please retry.' } } : { data }) });
    });
    return state;
  }
  const tabAccess = (page, name) => page.getByRole('group', { name: 'Access', exact: true }).getByRole('button', { name, exact: true }).click();
  const chooseFilter = async (page, group, option) => { await page.getByRole('search', { name: 'Search and filter users' }).locator('button[aria-haspopup="menu"]').click(); await page.getByRole('group', { name: group, exact: true }).getByRole('menuitemradio', { name: option, exact: true }).click(); };
  async function check(name, body, width = 1440) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }); const errors = []; page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { for (const name of ['alert', 'confirm', 'prompt']) window[name] = () => { throw new Error('window.' + name + ' must not be used'); }; });
    page.on('dialog', async dialog => { errors.push('Unexpected window dialog: ' + dialog.type() + ' ' + dialog.message()); await dialog.dismiss(); });
    try { await body(page); await assertReadable(page, name); assert.deepEqual(errors, []); passed++; console.log('PASS ' + name); }
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
      await page.getByText('Not configured', { exact: true }).waitFor();
      assert.deepEqual(state.requests.map(request => request.path), ['/api/me', '/api/admin/overview', '/api/admin/academic-setup/semesters', '/api/admin/academic-setup/current-semester']);
      assert.ok(state.requests.every(request => request.method === 'GET'));
      await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.screenshot({ path: '.wrangler/admin-review/overview-desktop.png', fullPage: true });
      await page.getByRole('link', { name: /Suspended accounts/ }).click(); await page.getByRole('heading', { name: 'Users & Access', exact: true }).waitFor();
      assert.equal(await page.getByRole('group', { name: 'Access', exact: true }).getByRole('button', { name: 'Suspended', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByText('Fictional Account 3', { exact: true }).waitFor();
    });
    await check('all admin planned destinations are navigable and data-free', async page => {
      const state = await mock(page, { roles: ['SYSTEM_ADMIN'] }); await page.goto(base + '/admin');
      await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.screenshot({ path: '.wrangler/staff-menu-review/admin-desktop.png', fullPage: true });
      const navigation = page.getByRole('navigation', { name: 'Administration navigation' });
      for (const [label, title] of [['Curriculum & Prerequisites', 'Curriculum & Prerequisites'], ['Graduation Requirements', 'Graduation Requirements']]) {
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
    await check('coordinator quick links: five planned routes use only account access', async page => {
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
      for (const [label, title] of destinations.filter((_, index) => ![0, 2, 5].includes(index))) {
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
      await page.goto(base + '/coordinator/decisions'); await page.getByRole('heading', { name: 'Offering Decisions', exact: true }).waitFor();
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
      await page.getByRole('heading', { name: 'Data Imports', exact: true }).first().waitFor(); assert.equal(await dialog.isVisible(), false);
    }, 375);
    await check('search, overlapping roles, pagination, account details and audit', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users'); await page.getByText('Fictional Administrator', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.getByText('Fictional Account 23', { exact: true }).waitFor();
      await page.getByLabel('Search users', { exact: true }).fill('fixture1@example.invalid'); await page.keyboard.press('Enter');
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
      await page.getByText('2 results · Page 1 of 1').waitFor(); assert.equal(await page.getByRole('button', { name: 'Coordinator', exact: true }).getAttribute('aria-haspopup'), 'menu');
    });
    await check('audit kind and date filters plus literal untrusted text', async page => {
      const state = await mock(page); await page.goto(base + '/admin/audit'); await page.getByRole('region', { name: 'Access audit table' }).waitFor();
      assert.ok((await page.locator('.admin-reason').first().innerText()).includes('<script>')); assert.equal(await page.evaluate(() => window.untrustedExecuted), undefined);
      await page.getByRole('group', { name: 'Event type', exact: true }).getByRole('button', { name: 'Account access', exact: true }).click(); await page.getByText('1 result · Page 1 of 1').waitFor();
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
        const table = page.getByRole('region', { name: 'Users and invitations table' }); await table.focus(); await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('[aria-label="Users and invitations table"]').scrollLeft > 0);
      }
      if (width === 375 || width === 1280) await page.screenshot({ path: '.wrangler/admin-review/users-' + width + '.png', fullPage: true });
    }, width);
    const reasonLabel = 'Reason (recorded in the audit log)';
    const usersTable = 'Users and invitations table';
    async function openAddDialog(page) {
      await page.getByRole('region', { name: usersTable }).waitFor();
      assert.equal(await page.locator('.admin-card').count(), 1); // a single card holds filters, invitations and accounts
      await page.getByRole('button', { name: 'Add user', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Add user' }); await dialog.waitFor();
      return dialog;
    }
    async function submitAdd(dialog, { email, role, reason = 'Fictional reason for the audit log.', label }) {
      await dialog.getByLabel('Email address', { exact: true }).fill(email);
      for (const checkbox of await dialog.getByRole('checkbox').all()) if (await checkbox.isChecked()) await checkbox.uncheck();
      await dialog.getByRole('checkbox', { name: role, exact: true }).check();
      await dialog.getByLabel(reasonLabel).fill(reason);
      await dialog.getByRole('button', { name: label, exact: true }).click();
    }
    await check('add user opens a modal: icon button, Escape, client validation, server errors keep it open, success closes it with a link to the new account', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users');
      const opener = page.getByRole('button', { name: 'Add user', exact: true }); await opener.waitFor();
      assert.equal(await opener.locator('svg[aria-hidden="true"]').count(), 1);
      const dialog = await openAddDialog(page);
      assert.equal(await dialog.getByLabel('Email address', { exact: true }).evaluate(element => element === document.activeElement), true);
      assert.equal(await dialog.getByRole('radio', { name: 'Add existing user' }).isChecked(), true);
      await page.screenshot({ path: '.wrangler/admin-review/users-add-dialog-desktop.png', fullPage: true });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await opener.evaluate(element => element === document.activeElement), true);
      await opener.click(); await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await opener.click(); await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Add user', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'A valid email is required.' }).waitFor();
      assert.equal((state.bodies ?? []).length, 0);
      await dialog.getByLabel('Email address', { exact: true }).fill('someone@utm.my');
      await dialog.getByRole('button', { name: 'Add user', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'At least one role is required.' }).waitFor();
      await submitAdd(dialog, { email: 'student@graduate.utm.my', role: 'Coordinator', label: 'Add user' });
      await dialog.getByRole('alert').filter({ hasText: 'The verified email address is not eligible for the requested role.' }).waitFor();
      assert.equal(await dialog.isVisible(), true);
      await dialog.getByText('System Administrator: verified @utm.my, @graduate.utm.my or @gmail.com', { exact: false }).waitFor();
      await submitAdd(dialog, { email: 'friend@gmail.com', role: 'Coordinator', label: 'Add user' });
      await dialog.getByRole('alert').filter({ hasText: 'The verified email address is not eligible for the requested role.' }).waitFor();
      await submitAdd(dialog, { email: 'nobody@utm.my', role: 'Coordinator', label: 'Add user' });
      await dialog.getByRole('alert').filter({ hasText: 'No matching sign-in account was found.' }).waitFor();
      assert.equal(await dialog.isVisible(), true);
      await submitAdd(dialog, { email: '  New.Staff@UTM.my ', role: 'Coordinator', label: 'Add user' });
      await dialog.waitFor({ state: 'hidden' });
      await page.locator('#admin-action-status').getByRole('status').filter({ hasText: 'Account added for new.staff@utm.my.' }).waitFor();
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.equal(await page.locator('.admin-card').count(), 1);
      const posted = state.bodies.filter(item => item.method === 'POST' && item.path === '/api/admin/users').at(-1).body;
      assert.deepEqual(posted, { email: 'new.staff@utm.my', roles: ['COORDINATOR'], reason: 'Fictional reason for the audit log.' });
      await page.screenshot({ path: '.wrangler/admin-review/users-add-desktop.png', fullPage: true });
      await opener.click(); await dialog.waitFor(); assert.equal(await dialog.getByLabel('Email address', { exact: true }).inputValue(), ''); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('link', { name: /View account/ }).click();
      await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.ok(page.url().endsWith('/admin/users/24'));
      await page.getByText('new.staff@utm.my', { exact: true }).first().waitFor();
    });
    await check('one grouped table: invitations display as invites; filters cover both groups', async page => {
      await mock(page); await page.goto(base + '/admin/users');
      const table = page.getByRole('region', { name: usersTable }); await table.getByText('Fictional Administrator', { exact: true }).waitFor();
      assert.equal(await page.locator('.admin-card').count(), 1); assert.equal(await page.locator('table').count(), 1);
      await table.getByText('Invitations (2)', { exact: true }).waitFor(); await table.getByText('Accounts (23)', { exact: true }).waitFor();
      const row = table.getByRole('row').filter({ hasText: 'pending.one@utm.my' });
      assert.ok((await row.innerText()).includes('Invitation')); assert.ok((await row.innerText()).includes('Pending'));
      assert.equal(await table.getByText('accepted@utm.my').count(), 0); // only pending invitations in the combined view
      await page.getByLabel('Search users', { exact: true }).fill('pending.two'); await page.keyboard.press('Enter');
      await table.getByText('Invitations (1)', { exact: true }).waitFor(); assert.equal(await table.getByText('pending.one@utm.my').count(), 0);
      await page.getByLabel('Search users', { exact: true }).fill(''); await page.keyboard.press('Enter');
      await chooseFilter(page, 'Role', 'Student'); await table.getByText('Invitations (1)', { exact: true }).waitFor();
      await chooseFilter(page, 'Role', 'All roles');
      await tabAccess(page, 'Active'); await table.getByText(/^Accounts \(/).waitFor();
      assert.equal(await table.getByText(/^Invitations \(/).count(), 0);
      await tabAccess(page, 'Invited'); await table.getByText('Invitations (2)', { exact: true }).waitFor();
      assert.equal(await table.getByText(/^Accounts \(/).count(), 0);
      await chooseFilter(page, 'Invitation status', 'All statuses');
      await table.getByText('Invitations (4)', { exact: true }).waitFor(); await table.getByText('accepted@utm.my').waitFor();
    });
    await check('send invitation: CLERK_USER_EXISTS, success, then revoke with an in-page reason', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users'); const dialog = await openAddDialog(page);
      await dialog.getByRole('radio', { name: 'Send invitation' }).check();
      await submitAdd(dialog, { email: 'clerk.only@utm.my', role: 'Coordinator', label: 'Send invitation' });
      await dialog.getByRole('alert').filter({ hasText: 'This person already has a sign-in account. Use Add account instead.' }).waitFor();
      assert.equal(await dialog.isVisible(), true);
      await submitAdd(dialog, { email: 'invitee@utm.my', role: 'Coordinator', label: 'Send invitation' });
      await dialog.waitFor({ state: 'hidden' });
      await page.locator('#admin-action-status').getByRole('status').filter({ hasText: 'Invitation sent to invitee@utm.my.' }).waitFor();
      const table = page.getByRole('region', { name: usersTable }); await table.getByText('invitee@utm.my', { exact: true }).waitFor();
      await table.getByText('Invitations (3)', { exact: true }).waitFor(); // invitee + the two seeded pending rows
      assert.equal(await page.locator('.admin-card').count(), 1);
      await page.screenshot({ path: '.wrangler/admin-review/users-invitations-desktop.png', fullPage: true });
      // Escape cancels and returns focus to the control that opened the dialog.
      const opener = page.getByRole('button', { name: 'Revoke invitation for pending.one@utm.my' }); await opener.click();
      const revoke = page.getByRole('dialog', { name: 'Revoke invitation' }); await revoke.waitFor();
      assert.equal(await revoke.getByLabel(reasonLabel).evaluate(element => element === document.activeElement), true);
      assert.equal(await revoke.getByRole('button', { name: 'Revoke invitation' }).isDisabled(), true);
      assert.ok((await revoke.innerText()).includes('0 / 500'));
      await page.keyboard.press('Escape'); await revoke.waitFor({ state: 'hidden' });
      assert.equal(await opener.evaluate(element => element === document.activeElement), true);
      assert.equal(state.bodies.filter(item => item.method === 'DELETE').length, 0);
      await opener.click(); await revoke.getByLabel(reasonLabel).fill('Fictional: sent to the wrong address.');
      await revoke.getByRole('button', { name: 'Revoke invitation' }).click(); await revoke.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Invitation for pending.one@utm.my revoked.' }).waitFor();
      await table.getByText('pending.one@utm.my', { exact: true }).waitFor({ state: 'detached' });
      assert.deepEqual(state.bodies.find(item => item.method === 'DELETE').body, { reason: 'Fictional: sent to the wrong address.' });
      await tabAccess(page, 'Invited');
      await chooseFilter(page, 'Invitation status', 'Revoked');
      await table.getByText('pending.one@utm.my', { exact: true }).waitFor();
    });
    await check('account actions: grant, error, remove with reason, LAST_ROLE, suspend, reactivate and no window dialogs', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users/4'); await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.equal(await page.locator('.admin-memberships article').count(), 1);
      const add = page.getByLabel('Role to add', { exact: true });
      assert.equal(await page.getByRole('button', { name: 'Add role', exact: true }).isDisabled(), true);
      assert.deepEqual(await add.locator('option').allInnerTexts(), ['Choose a role', 'Coordinator', 'System Admin']); // roles already held are not offered
      state.mutationError = { status: 422, code: 'ROLE_NOT_ELIGIBLE', message: 'The verified email address is not eligible for the requested role.' }; // server-side refusal (eligibility itself is covered by unit tests)
      state.mutationError = { status: 422, code: 'ROLE_NOT_ELIGIBLE', message: 'The verified email address is not eligible for the requested role.' }; // server-side refusal; eligibility itself is covered by unit tests
      await add.selectOption('SYSTEM_ADMIN'); await page.getByRole('button', { name: 'Add role', exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.getByRole('heading', { name: 'Add System Admin role' }).waitFor();
      await dialog.getByText('System Administrator: verified @utm.my, @graduate.utm.my or @gmail.com').waitFor();
      await dialog.getByLabel(reasonLabel).fill('Fictional: needs administrator access.'); await dialog.getByRole('button', { name: 'Add role' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'not eligible' }).waitFor();
      assert.equal(await dialog.isVisible(), true);
      await dialog.getByRole('button', { name: 'Cancel' }).click(); await dialog.waitFor({ state: 'hidden' }); delete state.mutationError;
      await add.selectOption('COORDINATOR'); await page.getByRole('button', { name: 'Add role', exact: true }).click();
      await dialog.getByLabel(reasonLabel).fill('x'.repeat(501));
      assert.ok((await dialog.innerText()).includes('501 / 500')); assert.equal(await dialog.getByRole('button', { name: 'Add role' }).isDisabled(), true);
      await page.screenshot({ path: '.wrangler/admin-review/account-dialog-desktop.png', fullPage: true });
      await dialog.getByLabel(reasonLabel).fill('Fictional: coordinates the programme.'); await dialog.getByRole('button', { name: 'Add role' }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Coordinator role added.' }).waitFor();
      assert.equal(await page.locator('.admin-memberships article').count(), 2);
      await page.getByRole('table').getByText('Role granted · Coordinator').first().waitFor(); // audit list refreshed
      assert.deepEqual(state.bodies.filter(item => item.method === 'POST').at(-1).body, { role: 'COORDINATOR', reason: 'Fictional: coordinates the programme.' });
      await page.screenshot({ path: '.wrangler/admin-review/account-controls-desktop.png', fullPage: true });
      // Remove a role (reason required), guarded against double submit.
      await page.getByRole('button', { name: 'Remove role Coordinator' }).click();
      await dialog.getByRole('heading', { name: 'Remove Coordinator role' }).waitFor();
      await dialog.getByLabel(reasonLabel).fill('Fictional: no longer coordinating.'); state.delay = 300;
      await dialog.getByRole('button', { name: 'Remove role' }).dblclick(); await dialog.waitFor({ state: 'hidden' }); state.delay = 0;
      await page.getByRole('status').filter({ hasText: 'Coordinator role removed.' }).waitFor();
      assert.equal(state.bodies.filter(item => item.method === 'DELETE').length, 1);
      assert.equal(await page.locator('.admin-memberships article').count(), 1);
      // The server's LAST_ROLE message is shown inline.
      await page.getByRole('button', { name: 'Remove role Student' }).click();
      await dialog.getByLabel(reasonLabel).fill('Fictional: attempt to remove the last role.'); await dialog.getByRole('button', { name: 'Remove role' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'An account must keep at least one role. Suspend the account instead of removing its last role.' }).waitFor();
      await dialog.getByRole('button', { name: 'Cancel' }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.admin-memberships article').count(), 1);
      // Suspend then reactivate.
      await page.getByRole('button', { name: 'Suspend account', exact: true }).click();
      await dialog.getByLabel(reasonLabel).fill('Fictional: investigation.'); await dialog.getByRole('button', { name: 'Suspend account' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Account suspended.' }).waitFor();
      assert.equal(await page.locator('.admin-account-heading .admin-status-suspended').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Suspend account', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Reactivate account', exact: true }).click();
      await dialog.getByLabel(reasonLabel).fill('Fictional: cleared.'); await dialog.getByRole('button', { name: 'Reactivate account' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Account reactivated.' }).waitFor();
      assert.equal(await page.locator('.admin-account-heading .admin-status-active').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Reactivate account', exact: true }).count(), 0);
      await page.getByRole('table').getByText('Access status changed').first().waitFor();
      assert.ok(state.bodies.every(item => !('status' in item.body) || ['SUSPENDED', 'ACTIVE'].includes(item.body.status)));
    });
    await check('protected owner is locked and self-lockout controls are hidden', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users/1'); await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Remove role System Admin' }).count(), 0);
      assert.equal(await page.getByText('Locked. The protected owner role cannot be changed.').count(), 1);
      assert.equal(await page.getByRole('button', { name: /Suspend account|Reactivate account/ }).count(), 0);
      assert.equal(await page.getByText('Locked. The protected owner account cannot be suspended.').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Remove role Student' }).count(), 1);
      fixtureResponse(new URL(base + '/api/admin/users'), state); state.store.accounts[1].roles.push('SYSTEM_ADMIN');
      state.clerkUserId = 'user_fictional_2';
      await page.goto(base + '/admin/users/2?test-user=user_fictional_2'); await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Remove role System Admin' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Remove role Coordinator' }).count(), 1);
      assert.equal(await page.getByText('You cannot remove your own System Admin role.').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Suspend account', exact: true }).count(), 0);
      assert.equal(await page.getByText('You cannot suspend your own account.').count(), 1);
      // Another account is not self: both controls are offered.
      state.clerkUserId = 'user_someone_else';
      await page.goto(base + '/admin/users/2?test-user=user_someone_else'); await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Remove role System Admin' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Suspend account', exact: true }).count(), 1);
    });
    for (const width of [320, 375, 768]) await check('user management has no horizontal overflow and keeps dialog on screen at ' + width, async page => {
      const state = await mock(page); await page.setViewportSize({ width, height: 844 });
      await page.goto(base + '/admin/users'); const addDialog = await openAddDialog(page);
      { const box = await addDialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844); }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/users-add-mobile.png', fullPage: true });
      await page.keyboard.press('Escape'); await addDialog.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Revoke invitation for pending.one@utm.my' }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/users-dialog-mobile.png' });
      await page.keyboard.press('Escape');
      await page.goto(base + '/admin/users/4'); await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/account-mobile.png', fullPage: true });
      assert.ok(state.requests.length > 0);
    }, width);
    await academicUiChecks({ check, mock, base });
    console.log('PASS ' + passed + ' administration browser checks');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
