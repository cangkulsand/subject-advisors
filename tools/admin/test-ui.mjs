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
      res.statusCode = data !== null || url.pathname === '/api/admin/academic-setup/current-semester' || /^\/api\/admin\/users\/\d+\/programme$/.test(url.pathname) ? 200 : 404; res.end(JSON.stringify({ data }));
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
      await route.fulfill({ status: failed ? 503 : data !== null || url.pathname === '/api/admin/academic-setup/current-semester' || /^\/api\/admin\/users\/\d+\/programme$/.test(url.pathname) ? 200 : 404, contentType: 'application/json', body: JSON.stringify(failed ? { error: { code: 'ADMIN_UNAVAILABLE', message: 'Fixture service unavailable. Please retry.' } } : { data }) });
    });
    return state;
  }
  const tabAccess = (page, name) => page.getByRole('group', { name: 'Access', exact: true }).getByRole('button', { name, exact: true }).click();
  const chooseFilter = async (page, group, option) => { await page.getByRole('search', { name: 'Search and filter users' }).locator('button[aria-haspopup="menu"]').click(); await page.getByRole('group', { name: group, exact: true }).getByRole('menuitemradio', { name: option, exact: true }).click(); };
  async function check(name, body, width = 1440) {
    if (process.env.ADMIN_CHECK && !name.includes(process.env.ADMIN_CHECK)) return;
    const page = await browser.newPage({ viewport: { width, height: 960 } }); const errors = []; page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { for (const name of ['alert', 'confirm', 'prompt']) window[name] = () => { throw new Error('window.' + name + ' must not be used'); }; });
    page.on('dialog', async dialog => { errors.push('Unexpected window dialog: ' + dialog.type() + ' ' + dialog.message()); await dialog.dismiss(); });
    try { await body(page); await assertReadable(page, name); assert.deepEqual(errors, []); passed++; console.log('PASS ' + name); }
    catch (error) { console.error(name, errors, await page.locator('body').innerText()); throw error; }
    finally { await page.close(); }
  }
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    await check('aggregate overview, clickable planned setup and account filter navigation', async page => {
      const state = await mock(page); await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: 'Breadcrumb' }).count(), 0, 'no breadcrumb on staff pages');
      assert.equal(await page.getByText('ADMIN WORKSPACE', { exact: true }).count(), 0, 'no workspace eyebrow');
      assert.equal(await page.locator('.admin-topbar-title .admin-admin-badge').innerText(), 'System administrator', 'the role badge is the top-bar title');
      assert.equal(await page.locator('.admin-topbar-actions .admin-admin-badge').count(), 0, 'the badge is not repeated');
      assert.deepEqual(await page.locator('.admin-sidebar summary').allInnerTexts().then(list => list.map(text => text.replace(/[^A-Za-z ]/g, '').trim())), ['Academic setup'], 'only Academic setup keeps a group heading; no Workspace heading');
      assert.equal(await page.locator('.admin-sidebar').getByText('WORKSPACE', { exact: true }).count(), 0, 'no WORKSPACE caption');
      assert.ok((await page.locator('.admin-metrics').innerText()).includes('23'));
      assert.equal(await page.getByText('Fictional Administrator', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('link', { name: 'Academic Semesters', exact: true, includeHidden: true }).count(), 2); // Desktop and mobile dialog.
      await page.getByRole('link', { name: 'Academic Semesters', exact: true }).click();
      await page.getByRole('heading', { name: 'Academic Semesters', exact: true }).waitFor();
      await page.getByRole('group', { name: 'Current semester', exact: true }).getByText('Not configured', { exact: true }).waitFor();
      assert.deepEqual(state.requests.map(request => request.path), ['/api/me', '/api/admin/overview', '/api/admin/academic-setup/semesters', '/api/admin/academic-setup/current-semester']);
      assert.ok(state.requests.every(request => request.method === 'GET'));
      await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.screenshot({ path: '.wrangler/admin-review/overview-desktop.png', fullPage: true });
      await page.getByRole('link', { name: /Suspended accounts/ }).click(); await page.getByRole('heading', { name: 'Users & Access', exact: true }).waitFor();
      assert.equal(await page.getByRole('group', { name: 'Access', exact: true }).getByRole('button', { name: 'Suspended', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByText('Fictional Account 3', { exact: true }).waitFor();
    });
    await check('admin curriculum destination is navigable and uses only GET requests', async page => {
      const state = await mock(page, { roles: ['SYSTEM_ADMIN'] }); await page.goto(base + '/admin');
      await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.screenshot({ path: '.wrangler/staff-menu-review/admin-desktop.png', fullPage: true });
      const navigation = page.getByRole('navigation', { name: 'Administration navigation' });
      // S3-P004-025: every menu label fits on one line, menu text is readable on the slate gradient, and a card heading that opens its card has no top gap.
      for (const width of [1440, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        const lines = await navigation.locator('.admin-nav-link > span').evaluateAll(spans => spans.map(span => { const range = document.createRange(); range.selectNodeContents(span); return [span.textContent, range.getClientRects().length]; }));
        for (const [text, count] of lines) assert.equal(count, 1, text + ' wraps at ' + width + 'px');
      }
      const menuColours = await navigation.evaluate(nav => [getComputedStyle(nav.querySelector('.admin-nav-link:not([aria-current])')).color, getComputedStyle(nav.querySelector('summary')).color, getComputedStyle(nav.querySelector('summary')).fontSize]);
      assert.deepEqual(menuColours, ['rgb(235, 224, 227)', 'rgb(212, 181, 190)', '13px']);
      assert.equal(await page.getByRole('heading', { name: 'Academic setup', exact: true }).evaluate(h => getComputedStyle(h).marginTop), '0px');
      await page.setViewportSize({ width: 1280, height: 900 });
      await navigation.getByRole('link', { name: 'Subjects & Prerequisites', exact: true }).click();
      await page.getByRole('heading', { name: 'Subjects and prerequisites', exact: true }).waitFor();
      await page.getByLabel('Curriculum', { exact: true }).waitFor();
      assert.deepEqual(state.requests.map(request => request.path), ['/api/me', '/api/admin/overview', '/api/p001-sprint2/curricula']);
      assert.ok(state.requests.every(request => request.method === 'GET'));
    });
    await check('coordinator quick links: every link opens a built workspace; Data Quality and Decision Audit are gone', async page => {
      const state = await mock(page, { roles: ['COORDINATOR'] }); await page.goto(base + '/coordinator');
      await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
      const quicklinks = page.locator('.coordinator-quicklinks');
      assert.deepEqual((await quicklinks.getByRole('link').locator('strong').allInnerTexts()).map(text => text.trim()), ['Offering Forecast', 'Offering History']);
      assert.equal(await quicklinks.getByText('Planned workspace').count(), 0);
      const overviewText = await page.locator('main').innerText();
      assert.ok(!/snapshot/i.test(overviewText), 'the Overview no longer talks about importing snapshots (S3-P004-032)');
      assert.ok(!overviewText.includes('separate from student academic records'), 'the live forecast reads student records');
      assert.ok(!/\b\d+\b/.test(await quicklinks.innerText()));
      await page.screenshot({ path: '.wrangler/staff-menu-review/coordinator-desktop.png', fullPage: true });
      const navigation = page.getByRole('navigation', { name: 'Coordinator navigation' });
      for (const label of ['Data Quality', 'Decision Audit']) assert.equal(await navigation.getByRole('link', { name: label, exact: true }).count(), 0);
      for (const path of ['/coordinator/data-quality', '/coordinator/audit']) {
        await page.goto(base + path); await page.getByRole('heading', { name: 'Page not found' }).first().waitFor();
        assert.equal(await page.getByText('This workspace is planned.', { exact: false }).count(), 0);
      }
      assert.ok(state.requests.every(request => request.path === '/api/me' && request.method === 'GET'));
    });
    await check('nested admin route keeps Users active and RoleSwitcher matches staff workspace', async page => {
      await mock(page); await page.goto(base + '/admin/users/1'); await page.getByRole('heading', { name: 'Account details', exact: true }).waitFor();
      const navigation = page.getByRole('navigation', { name: 'Administration navigation' });
      assert.equal(await navigation.getByRole('link', { name: 'Users & Access', exact: true }).getAttribute('aria-current'), 'page');
      assert.equal(await navigation.getByRole('link', { name: 'Overview', exact: true }).getAttribute('aria-current'), null);
      const workspace = page.getByRole('combobox', { name: 'Workspace view' });
      assert.equal(await page.getByText('Workspace view', { exact: true }).count(), 0, 'no visible Workspace view text above the role selector');
      assert.equal(await workspace.inputValue(), 'SYSTEM_ADMIN');
      await page.goto(base + '/coordinator'); await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
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
      // The redirect is a full navigation; let the sign-in page settle so the readability scan does not run mid-navigation.
      await page.goto(base + '/coordinator/imports?scenario=signed-out'); await page.waitForURL(base + '/sign-in'); await page.waitForLoadState('networkidle');
      assert.equal(await page.getByRole('heading', { name: 'Data Imports', exact: true }).count(), 0);
    });
    await check('expanded groups preserve collapse choice and reopen the active group through history', async page => {
      await mock(page); await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      const setup = page.locator('.admin-sidebar details').first();
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
      await mock(page, { roles: ['COORDINATOR'] }); await page.setViewportSize({ width, height: [320, 1280].includes(width) ? 300 : 600 }); await page.goto(base + '/coordinator'); // short viewport: the shorter coordinator menu must still scroll inside itself
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
    await check('semesters: selection opens/closes are editable, shown in the table and sent as ISO', async page => {
      const state = await mock(page); await page.goto(base + '/admin/semesters');
      await page.getByRole('button', { name: 'Edit 2026/2027 · Semester 2' }).click();
      await page.getByLabel('Selection opens').fill('2026-11-20T09:00');
      await page.getByLabel('Selection closes').fill('2026-12-01T17:00');
      await page.getByLabel('Reason (recorded in the audit log)').fill('Open picking for semester 2');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByText('Semester configuration saved.').waitFor();
      const patch = state.bodies.find(item => item.method === 'PATCH' && item.path.endsWith('/semesters/2'));
      assert.equal(patch.body.selectionOpensAt, new Date('2026-11-20T09:00').toISOString());
      assert.equal(patch.body.selectionClosesAt, new Date('2026-12-01T17:00').toISOString());
      assert.match(await page.getByRole('region', { name: 'Academic semesters' }).innerText(), /Selection/);
      assert.match(await page.getByRole('region', { name: 'Academic semesters' }).innerText(), /Not scheduled/);
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
      const targetHeights = await dialog.locator('.staff-nav-group summary, .staff-nav-group .admin-nav-link').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => element.getBoundingClientRect().height));
      assert.ok(targetHeights.length > 0 && targetHeights.every(height => height >= 44));
      const focusables = await dialog.evaluate(element => [...element.querySelectorAll('button:not([disabled]),a[href],summary')].filter(control => control.getClientRects().length).map(control => ({ tag: control.tagName, label: control.getAttribute('aria-label') || control.textContent?.trim() })));
      assert.ok(focusables.length > 4);
      await dialog.getByRole('button', { name: 'Close navigation' }).focus(); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), focusables.at(-1)?.label);
      await page.keyboard.press('Tab'); await dialog.getByRole('button', { name: 'Close navigation' }).waitFor();
      await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), false); assert.equal(await opener.evaluate(element => element === document.activeElement), true);
      await opener.click(); await page.mouse.click(350, 550); assert.equal(await dialog.isVisible(), false);
      await opener.click(); await dialog.getByRole('link', { name: 'Offering History', exact: true }).click();
      await page.getByRole('heading', { name: 'Offering History', exact: true }).first().waitFor(); assert.equal(await dialog.isVisible(), false);
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
      // S3-P004-025: audit values read in words, not database codes; the first heading in a card has no top gap.
      const auditText = await page.getByRole('region', { name: 'Access audit table' }).innerText();
      assert.match(auditText, /Role eligibility policy/); assert.doesNotMatch(auditText, /ROLE_DOMAIN/);
      assert.equal(await page.getByRole('heading', { name: 'Role memberships' }).evaluate(h => getComputedStyle(h).marginTop), '0px');
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
        const table = page.getByRole('region', { name: 'Users and invitations table' });
        if (width <= 600) {
          // S3-P004-025: rows stack on phones, so status and actions show without a sideways scroll; the top bar stays on one row.
          assert.ok(await table.evaluate(el => el.scrollWidth <= el.clientWidth));
          for (const action of [page.getByRole('button', { name: /^Revoke/ }).first(), page.getByRole('link', { name: /^View details/ }).first(), page.getByText('Pending', { exact: true }).first()]) { const b = await action.boundingBox(); assert.ok(b && b.x >= 0 && b.x + b.width <= width); }
          for (const tab of await page.getByRole('group', { name: 'Access', exact: true }).getByRole('button').all()) assert.ok(await tab.evaluate(el => el.scrollWidth <= el.clientWidth), 'tab label cut off');
          // Review fix (S3-P004-026): a cell with several values keeps them all in the value column; rows and cells keep their table roles.
          const dates = table.locator('.admin-invite-dates').first();
          const [invitedX, expiresX] = await dates.locator('span').evaluateAll(spans => spans.map(span => Math.round(span.getBoundingClientRect().left)));
          assert.equal(invitedX, expiresX, 'Expires sits under Invited, not in the label column');
          assert.match(await dates.innerText(), /Expires .*\d{1,2}:\d{2}/);
          assert.ok(await table.getByRole('row').count() > 2); assert.ok(await table.getByRole('cell').count() > 8); assert.equal(await table.getByRole('columnheader').count(), 5);
          const bar = await page.locator('.admin-topbar').boundingBox(); assert.ok(bar && bar.height <= 84, 'top bar is ' + bar?.height + 'px tall');
        } else {
          // Closing the menu returns focus to its toggle, sometimes a moment after Escape; that can take focus back from the
          // table. Refocus the table on each attempt so the arrow key reaches it.
          let scrolled = false;
          for (let attempt = 0; attempt < 5 && !scrolled; attempt++) { await table.focus(); await page.keyboard.press('ArrowRight'); scrolled = await page.waitForFunction(() => document.querySelector('[aria-label="Users and invitations table"]').scrollLeft > 0, null, { timeout: 2000 }).then(() => true, () => false); }
          assert.ok(scrolled, 'keyboard ArrowRight scrolls the focused users table');
        }
      }
      if (width === 375 || width === 1280) await page.screenshot({ path: '.wrangler/admin-review/users-' + width + '.png', fullPage: true });
    }, width);
    await check('tables fit the content area at 1024px with no sideways scroll (S3-P004-025)', async page => {
      await mock(page); await page.setViewportSize({ width: 1024, height: 800 });
      for (const path of ['users', 'users/1', 'learning-centres', 'faculties', 'faculties/1', 'faculties/1/departments/1', 'faculties/1/departments/1/programmes/1', 'coordinator-assignments', 'semesters']) {
        await page.goto(base + '/admin/' + path); await page.locator('.admin-table-scroll table').first().waitFor();
        await page.waitForLoadState('networkidle');
        for (const region of await page.locator('.admin-table-scroll').all()) assert.ok(await region.evaluate(el => el.scrollWidth <= el.clientWidth), path + ' table scrolls sideways at 1024px');
      }
      await page.goto(base + '/admin/faculties/1/departments/1/programmes/1'); await page.locator('table').first().waitFor(); await page.screenshot({ path: '.wrangler/admin-review/programmes-1024.png', fullPage: true });
    });
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
      await dialog.getByText('System Administrator: verified @gmail.com', { exact: false }).waitFor();
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
    await check('waiting staff sign-ups: listed in All, filtered, Assign role prefills Add user and removes the row (S3-P004-036)', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users');
      const table = page.getByRole('region', { name: usersTable }); await table.getByText('Waiting for a role (2)', { exact: true }).waitFor();
      const row = table.getByRole('row').filter({ hasText: 'lecturer.new@utm.my' });
      assert.ok((await row.innerText()).includes('Fictional Lecturer')); assert.ok((await row.innerText()).includes('Waiting'));
      await chooseFilter(page, 'Role', 'System Admin'); await table.getByText('Waiting for a role (1)', { exact: true }).waitFor();
      assert.equal(await table.getByText('lecturer.new@utm.my').count(), 0);
      await chooseFilter(page, 'Role', 'All roles'); await tabAccess(page, 'Active'); await table.getByText(/^Accounts \(/).waitFor();
      assert.equal(await table.getByText(/^Waiting for a role/).count(), 0);
      await tabAccess(page, 'All'); await table.getByText('Waiting for a role (2)', { exact: true }).waitFor();
      await table.getByRole('button', { name: 'Assign role to lecturer.new@utm.my' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add user' }); await dialog.waitFor();
      assert.equal(await dialog.getByRole('radio', { name: 'Add existing user' }).isChecked(), true);
      assert.equal(await dialog.getByLabel('Email address').inputValue(), 'lecturer.new@utm.my');
      assert.equal(await dialog.getByRole('checkbox', { name: 'Coordinator' }).isChecked(), true);
      assert.equal(await dialog.getByRole('checkbox', { name: 'Student' }).isChecked(), false);
      await dialog.getByLabel('Reason (recorded in the audit log)').fill('Lecturer for Computing');
      await dialog.getByRole('button', { name: 'Add user', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Account added for lecturer.new@utm.my.' }).waitFor();
      await table.getByText('Waiting for a role (1)', { exact: true }).waitFor();
      assert.deepEqual(state.bodies.at(-1), { method: 'POST', path: '/api/admin/users', body: { email: 'lecturer.new@utm.my', roles: ['COORDINATOR'], reason: 'Lecturer for Computing' } });
      await page.setViewportSize({ width: 375, height: 800 }); await table.getByText('Waiting for a role (1)', { exact: true }).waitFor();
      await page.screenshot({ path: '.wrangler/admin-review/waiting-users-375.png', fullPage: true });
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
      await dialog.getByText('System Administrator: verified @gmail.com').waitFor();
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
    await check('student programme: shown for student profiles, hidden otherwise, changed with a reason and the removed pick count', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users/6'); await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Student programme' }).count(), 0); // account 6 has no student profile
      await page.goto(base + '/admin/users/4'); const card = page.getByLabel('Student programme', { exact: true }); await card.waitFor();
      await card.getByText('DEMO — DEMO Not official', { exact: true }).waitFor(); await card.getByText('Fictional Account 4 (A22EC0004)', { exact: true }).waitFor();
      await page.screenshot({ path: '.wrangler/admin-review/student-programme-desktop.png', fullPage: true });
      await card.getByRole('button', { name: 'Change programme', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Change programme' }); await dialog.waitFor();
      const choose = dialog.getByLabel('New programme', { exact: true });
      await choose.locator('option', { hasText: 'OTHER' }).waitFor({ state: 'attached' });
      assert.deepEqual(await choose.locator('option').allInnerTexts(), ['Choose a programme', 'OTHER — DEMO Other programme (version DEMO_B)']); // the current programme is not offered
      const confirm = dialog.getByRole('button', { name: 'Change programme', exact: true });
      assert.equal(await confirm.isDisabled(), true);
      await choose.selectOption('2'); assert.equal(await confirm.isDisabled(), true); // a reason is required too
      await dialog.getByLabel(reasonLabel).fill('Fictional: registered on the wrong programme.'); assert.equal(await confirm.isDisabled(), false);
      await page.screenshot({ path: '.wrangler/admin-review/student-programme-dialog-desktop.png', fullPage: true });
      state.mutationError = { status: 409, code: 'CURRICULUM_UNAVAILABLE', message: 'The selected programme is not available. Choose an active programme.' };
      await confirm.click(); await dialog.getByRole('alert').filter({ hasText: 'not available' }).waitFor(); assert.equal(await dialog.isVisible(), true);
      delete state.mutationError; await confirm.click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Programme changed; 3 subject picks removed.' }).waitFor();
      await card.getByText('OTHER — DEMO Other programme', { exact: true }).waitFor();
      assert.deepEqual(state.bodies.filter(item => item.method === 'PATCH').at(-1).body, { curriculumId: 2, reason: 'Fictional: registered on the wrong programme.' });
      // A second student with no saved picks.
      await page.goto(base + '/admin/users/5'); await card.waitFor();
      await card.getByRole('button', { name: 'Change programme', exact: true }).click();
      await dialog.getByLabel('New programme', { exact: true }).locator('option', { hasText: 'DEMO_A' }).waitFor({ state: 'attached' });
      await dialog.getByLabel('New programme', { exact: true }).selectOption('1'); await dialog.getByLabel(reasonLabel).fill('Fictional: correction.');
      await dialog.getByRole('button', { name: 'Change programme', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Programme changed; 0 subject picks removed.' }).waitFor();
    });
    await check('student intake year: shown on the card, corrected with a reason, unchanged rejected in the dialog, success notice (S3-P004-037)', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users/4'); const card = page.getByLabel('Student programme', { exact: true }); await card.waitFor();
      const intake = card.locator('.admin-account-facts div').filter({ has: page.getByText('Intake year', { exact: true }) });
      assert.equal(await intake.locator('dd').innerText(), '2022');
      await card.getByRole('button', { name: 'Change intake year', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Change intake year' }); await dialog.waitFor();
      const year = dialog.getByLabel('New intake year', { exact: true }); assert.equal(await year.inputValue(), '2022');
      await dialog.getByText('Current: 2022. Enter a year from 1990 to 2200.', { exact: true }).waitFor();
      const confirm = dialog.getByRole('button', { name: 'Change intake year', exact: true });
      await dialog.getByLabel(reasonLabel).fill('Fictional: admitted a year later.');
      assert.equal(await confirm.isDisabled(), true, 'same year cannot be submitted');
      await year.fill('1989'); assert.equal(await confirm.isDisabled(), true, 'out of range');
      await year.fill('2023'); assert.equal(await confirm.isDisabled(), false);
      await dialog.getByLabel(reasonLabel).fill(''); assert.equal(await confirm.isDisabled(), true, 'reason required');
      await dialog.getByLabel(reasonLabel).fill('Fictional: admitted a year later.');
      state.mutationError = { status: 409, code: 'UNCHANGED', message: 'The intake year is already set to this year.' };
      await confirm.click(); await dialog.getByRole('alert').filter({ hasText: 'The intake year is already set to this year.' }).waitFor(); assert.equal(await dialog.isVisible(), true);
      delete state.mutationError; await confirm.click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Intake year changed to 2023.' }).waitFor();
      assert.equal(await intake.locator('dd').innerText(), '2023');
      const patch = state.bodies.filter(item => item.method === 'PATCH').at(-1);
      assert.deepEqual(patch, { method: 'PATCH', path: '/api/admin/users/4/intake', body: { intakeYear: 2023, reason: 'Fictional: admitted a year later.' } });
      await card.getByText('DEMO — DEMO Not official', { exact: true }).waitFor(); // the programme is unchanged
      // A student with no intake year recorded.
      await page.goto(base + '/admin/users/5'); await card.waitFor();
      assert.equal(await intake.locator('dd').innerText(), 'Not set');
      for (const width of [375, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await card.getByRole('button', { name: 'Change intake year', exact: true }).click(); await dialog.waitFor();
        assert.equal(await year.inputValue(), '');
        const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width, 'dialog fits at ' + width);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at ' + width);
        if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/student-intake-dialog-375.png', fullPage: true });
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at ' + width);
        if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/student-intake-card-375.png', fullPage: true });
      }
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
    // Dummy users (S3-P004-029).
    async function openDummyDialog(page) {
      await page.getByRole('region', { name: usersTable }).waitFor();
      await page.getByRole('button', { name: 'Create dummy user', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Create dummy user' }); await dialog.waitFor();
      await dialog.getByText('Clerk users: 52 of 100', { exact: true }).waitFor();
      return dialog;
    }
    for (const width of [1440, 375]) await check('create dummy student: shows Clerk usage, posts the form, shows the password once, then lists the account with a Dummy badge at ' + width, async page => {
      const state = await mock(page); await page.goto(base + '/admin/users');
      assert.equal(await page.locator('.admin-dummy-pill').count(), 0);
      const dialog = await openDummyDialog(page);
      assert.equal(await dialog.getByRole('radio', { name: 'Student', exact: true }).isChecked(), true);
      await dialog.getByLabel('Name', { exact: true }).fill('Aina Test');
      await dialog.getByLabel('Programme', { exact: true }).selectOption({ label: 'DEMO Not official (DEMO_A)' });
      await dialog.getByLabel('Learning centre', { exact: true }).selectOption({ label: 'Fictional learning centre' });
      await dialog.getByLabel(reasonLabel).fill('Testing the plan page.');
      await dialog.getByRole('button', { name: 'Create dummy user', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Dummy user created', exact: true }).waitFor();
      await dialog.getByText('This password is shown only once. Copy it now.', { exact: true }).waitFor();
      await dialog.getByText('aina-test-0a1b+clerk_test@graduate.utm.my', { exact: true }).waitFor();
      await dialog.getByText('Fixture-Pass-123456', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Copy email', exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Copy password', exact: true }).waitFor();
      assert.deepEqual(state.bodies.at(-1), { method: 'POST', path: '/api/admin/dummy-users', body: { role: 'STUDENT', name: 'Aina Test', curriculumId: 1, learningCentreId: 1, reason: 'Testing the plan page.' } });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/dummy-created-mobile.png', fullPage: true });
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.getByText('Fixture-Pass-123456').count(), 0);
      await page.getByRole('link', { name: 'View account →' }).waitFor();
      // The new account is number 24, on page 2; search for it.
      await page.getByLabel('Search users', { exact: true }).fill('Aina Test'); await page.getByLabel('Search users', { exact: true }).press('Enter');
      await page.locator('.admin-dummy-pill').first().waitFor();
      assert.equal(await page.locator('.admin-dummy-pill').count(), 1);
    }, width);
    await check('create dummy coordinator lists programmes, not curricula, and posts programmeId', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users');
      const dialog = await openDummyDialog(page);
      await dialog.getByRole('radio', { name: 'Coordinator', exact: true }).check();
      await dialog.getByLabel('Name', { exact: true }).fill('Lim');
      await dialog.getByLabel('Programme', { exact: true }).selectOption({ label: 'TEST — Fictional programme' });
      await dialog.getByLabel('Learning centre', { exact: true }).selectOption({ label: 'Fictional learning centre' });
      await dialog.getByLabel(reasonLabel).fill('Coordinator test.');
      await dialog.getByRole('button', { name: 'Create dummy user', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Dummy user created', exact: true }).waitFor();
      assert.deepEqual(state.bodies.at(-1).body, { role: 'COORDINATOR', name: 'Lim', programmeId: 1, learningCentreId: 1, reason: 'Coordinator test.' });
    });
    for (const code of ['DUMMY_LIMIT_REACHED', 'ACADEMIC_SEMESTER_UNAVAILABLE']) await check('create dummy user keeps the dialog open and shows ' + code + ' inline', async page => {
      await mock(page, { dummyError: code }); await page.goto(base + '/admin/users');
      const dialog = await openDummyDialog(page);
      await dialog.getByLabel('Name', { exact: true }).fill('Aina');
      await dialog.getByLabel('Programme', { exact: true }).selectOption({ label: 'DEMO Not official (DEMO_A)' });
      await dialog.getByLabel('Learning centre', { exact: true }).selectOption({ label: 'Fictional learning centre' });
      await dialog.getByLabel(reasonLabel).fill('Testing.');
      await dialog.getByRole('button', { name: 'Create dummy user', exact: true }).click();
      await dialog.getByRole('alert').getByText('Fixture message for ' + code, { exact: true }).waitFor();
      assert.equal(await dialog.getByRole('heading', { name: 'Dummy user created' }).count(), 0);
    });
    await check('reset password is offered only on a dummy account and shows the new password once', async page => {
      const state = await mock(page); await page.goto(base + '/admin/users/4');
      await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Reset password' }).count(), 0);
      await page.goto(base + '/admin/users');
      const dialog = await openDummyDialog(page);
      await dialog.getByLabel('Name', { exact: true }).fill('Aina');
      await dialog.getByLabel('Programme', { exact: true }).selectOption({ label: 'DEMO Not official (DEMO_A)' });
      await dialog.getByLabel('Learning centre', { exact: true }).selectOption({ label: 'Fictional learning centre' });
      await dialog.getByLabel(reasonLabel).fill('Testing.');
      await dialog.getByRole('button', { name: 'Create dummy user', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Dummy user created', exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('link', { name: 'View account →' }).click();
      await page.getByRole('heading', { name: 'Role memberships' }).waitFor();
      await page.locator('.admin-dummy-pill').first().waitFor();
      await page.getByRole('button', { name: 'Reset password', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Reset password' }); await confirm.waitFor();
      await confirm.getByRole('button', { name: 'Reset password', exact: true }).click();
      await confirm.getByText('Fixture-New-Pass-12', { exact: true }).waitFor();
      await confirm.getByText('This password is shown only once. Copy it now.', { exact: true }).waitFor();
      assert.deepEqual(state.bodies.at(-1), { method: 'POST', path: '/api/admin/users/24/dummy-password', body: {} });
      await confirm.getByRole('button', { name: 'Done', exact: true }).click();
      await confirm.waitFor({ state: 'hidden' });
    });
    // View as (S3-P004-033).
    const viewAsStored = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('sa.viewAs') ?? 'null'));
    for (const width of [1440, 375]) await check('View as Coordinator: choose a programme and centre, start the view at ' + width, async page => {
      await mock(page); await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      if (width < 761) { await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('dialog', { name: 'Administration menu' }).getByRole('button', { name: 'View as', exact: true }).click(); }
      else await page.getByRole('button', { name: 'View as', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'View as' }); await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Start view' }).click();
      await dialog.getByText('Choose a programme and a learning centre.').waitFor();
      await dialog.getByLabel('Programme').selectOption({ label: 'TEST — Fictional programme' });
      await dialog.getByLabel('Learning centre').selectOption({ label: 'Fictional learning centre' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
      if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/view-as-mobile.png' });
      await dialog.getByRole('button', { name: 'Start view' }).click();
      await page.waitForURL(/\/coordinator$/);
      assert.deepEqual(await viewAsStored(page), { role: 'COORDINATOR', programmeId: 1, learningCentreId: 1, label: 'TEST, Fictional learning centre' });
    }, width);
    await check('View as Student: search, a student without a profile cannot be viewed, one with a profile starts a read-only view', async page => {
      const state = await mock(page); await page.goto(base + '/admin'); await page.getByRole('heading', { name: 'Assigned roles' }).waitFor();
      await page.getByRole('button', { name: 'View as', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'View as' }); await dialog.waitFor();
      await dialog.getByRole('radio', { name: 'Student' }).check();
      await dialog.getByLabel('Find a student').fill('Fictional Account');
      await dialog.getByRole('button', { name: 'Search', exact: true }).click();
      const list = dialog.getByRole('list', { name: 'Students' }); await list.waitFor();
      const search = state.requests.find(request => request.path === '/api/admin/users' && request.search.includes('q='));
      assert.match(search.search, /role=STUDENT/); assert.match(search.search, /status=ACTIVE/);
      await list.getByRole('button', { name: 'View as Fictional Account 6', exact: true }).click();
      await list.getByText('Profile not set up yet').waitFor();
      assert.equal(await viewAsStored(page), null, 'no view without a profile');
      await list.getByRole('button', { name: 'View as Fictional Account 4', exact: true }).click();
      await page.waitForURL(/\/student$/);
      assert.deepEqual(await viewAsStored(page), { role: 'STUDENT', studentId: 14, label: 'Fictional Account 4' });
    });
    await check('View as banner: shows the view on admin pages and Exit view returns to admin without it', async page => {
      await page.addInitScript(() => sessionStorage.setItem('sa.viewAs', JSON.stringify({ role: 'COORDINATOR', programmeId: 1, learningCentreId: 1, label: 'TEST, Fictional learning centre' })));
      const state = await mock(page); await page.goto(base + '/admin/users');
      const banner = page.locator('.view-as-banner'); await banner.waitFor();
      assert.equal((await banner.innerText()).replace(/\s+/g, ' ').trim(), 'Viewing as coordinator — TEST, Fictional learning centre Exit view');
      assert.ok(state.requests.filter(request => request.path.startsWith('/api/admin')).length > 0);
      await page.evaluate(() => sessionStorage.removeItem('sa.viewAs'));
      await page.addInitScript(() => sessionStorage.removeItem('sa.viewAs'));
      await page.goto(base + '/admin/users');
      await page.getByRole('heading', { name: 'Users & Access' }).first().waitFor();
      assert.equal(await page.locator('.view-as-banner').count(), 0);
    });
    await check('View as banner: Exit view clears the view and opens the admin overview', async page => {
      await page.evaluate(() => 0);
      await mock(page); await page.goto(base + '/admin/users');
      await page.evaluate(() => sessionStorage.setItem('sa.viewAs', JSON.stringify({ role: 'STUDENT', studentId: 14, label: 'Fictional Account 4' })));
      await page.goto(base + '/admin/users');
      const banner = page.locator('.view-as-banner'); await banner.waitFor();
      assert.match(await banner.innerText(), /Viewing as student — Fictional Account 4 \(read only\)/);
      await banner.getByRole('button', { name: 'Exit view' }).click();
      await page.waitForURL(/\/admin$/);
      assert.equal(await viewAsStored(page), null);
      assert.equal(await page.locator('.view-as-banner').count(), 0);
    });
    await academicUiChecks({ check, mock, base });
    console.log('PASS ' + passed + ' administration browser checks');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
