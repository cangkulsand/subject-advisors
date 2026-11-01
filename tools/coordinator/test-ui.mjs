// Real coordinator screens (UC20 imports, forecasts and offering decisions) in the actual application routes with TEST-ONLY Clerk and API fixtures.
// No credentials or database access. Screenshots go to .wrangler/coordinator-review/.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createState, handle } from './fixtures.mjs';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const output = await build({ entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false, outdir: '.wrangler/coordinator-review', jsx: 'automatic', loader: { '.png': 'dataurl' }, alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' } });
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const serve = process.argv.includes('--serve');
const serveState = createState({ seed: 'review' });
const server = createServer(async (req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); return; }
  if (req.url?.startsWith('/api/')) {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const headers = Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, String(value)]));
    const result = handle(serveState, { method: req.method, url: new URL(req.url, 'http://127.0.0.1'), headers, body: raw });
    res.setHeader('Cache-Control', 'no-store');
    for (const [key, value] of Object.entries(result?.headers ?? {})) res.setHeader(key, value);
    if (result?.text !== undefined) { res.statusCode = result.status; res.end(result.text); return; }
    res.setHeader('Content-Type', 'application/json'); res.statusCode = result?.status ?? 404; res.end(JSON.stringify(result?.payload ?? { error: { code: 'NOT_FOUND', message: 'Not found.' } }));
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Coordinator preview — fictional data</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(done => server.listen(serve ? 5177 : 0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
if (serve) console.log('Fictional coordinator preview: ' + base + '/coordinator/forecasts?programmeId=5&learningCentreId=1&run=1');
else {
  let browser, passed = 0;
  const shots = '.wrangler/coordinator-review/';
  await mkdir(shots, { recursive: true });
  async function mock(page, options = {}) {
    const state = createState(options);
    await page.route(/\/api\//, async route => {
      const request = route.request(), url = new URL(request.url());
      if (state.delay && url.pathname.startsWith('/api/coordinator')) await new Promise(done => setTimeout(done, state.delay));
      const result = handle(state, { method: request.method(), url, headers: request.headers(), body: request.postData() ?? '' });
      if (!result) { await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found.' } }) }); return; }
      if (result.text !== undefined) { await route.fulfill({ status: result.status, headers: result.headers, body: result.text }); return; }
      await route.fulfill({ status: result.status, headers: result.headers, contentType: 'application/json', body: JSON.stringify(result.payload) });
    });
    return state;
  }
  async function check(name, body, width = 1440) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }); const errors = []; page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { for (const fn of ['alert', 'confirm', 'prompt']) window[fn] = () => { throw new Error('window.' + fn + ' must not be used'); }; });
    page.on('dialog', async dialog => { errors.push('Unexpected window dialog: ' + dialog.type() + ' ' + dialog.message()); await dialog.dismiss(); });
    try { await body(page); assert.deepEqual(errors, []); passed++; console.log('PASS ' + name); }
    catch (error) { console.error(name, errors, await page.locator('body').innerText().catch(() => '')); await page.screenshot({ path: shots + 'failure-' + passed + '.png', fullPage: true }).catch(() => {}); throw error; }
    finally { await page.close(); }
  }
  const scoped = '?programmeId=5&learningCentreId=1';
  const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const csv = (marker) => ({ name: 'cohort.csv', mimeType: 'text/csv', buffer: Buffer.from(marker + '\nexternal_reference,curriculum_version\n') });
  async function upload(page, marker, label = 'September cohort') {
    await page.getByLabel('Source label', { exact: true }).fill(label);
    await page.getByLabel('CSV file', { exact: true }).setInputFiles(csv(marker));
    await page.getByRole('button', { name: 'Upload and validate' }).click();
  }
  const reasonLabel = 'Reason (recorded in the audit history)';
  const runUrl = '/coordinator/forecasts' + scoped + '&run=1';
  const decisionsUrl = '/coordinator/decisions' + scoped;
  const scopeBody = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
  /** Local wall-clock value for a datetime-local input, the given number of days from now. */
  const localInput = days => {
    const date = new Date(Date.now() + days * 86400000), pad = value => String(value).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  };
  try {
    browser = await chromium.launch({ headless: true });

    await check('imports: scope pickers follow assignments, target semester is read-only, template downloads', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports');
      await page.getByRole('heading', { name: 'Data Imports', exact: true }).first().waitFor();
      const programme = page.getByLabel('Programme', { exact: true }), centre = page.getByLabel('Learning centre', { exact: true });
      assert.equal(await centre.isDisabled(), true);
      assert.deepEqual(await programme.locator('option').allInnerTexts(), ['Select a programme', 'SECJ · Bachelor of Computer Science (Software Engineering)', 'SECRH · Bachelor of Computer Science (Computer Networks and Security)']);
      await programme.selectOption('5');
      assert.deepEqual(await centre.locator('option').allInnerTexts(), ['Select a learning centre', 'KL · UTMSPACE Kuala Lumpur', 'JB · UTMSPACE Johor Bahru']);
      await programme.selectOption('7');
      assert.deepEqual(await centre.locator('option').allInnerTexts(), ['Select a learning centre', 'KL · UTMSPACE Kuala Lumpur']);
      assert.equal(await page.getByRole('button', { name: 'Upload and validate' }).count(), 0);
      await centre.selectOption('1');
      await page.getByRole('heading', { name: 'Or upload a CSV (fallback)' }).waitFor();
      const target = page.locator('output.coordinator-readonly-value');
      assert.equal(await target.innerText(), '2026/2027 · Semester 2');
      assert.equal(await page.getByLabel('Target semester').evaluate(element => element.tagName), 'OUTPUT');
      assert.ok(page.url().includes('programmeId=7') && page.url().includes('learningCentreId=1'));
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download CSV template' }).click();
      assert.equal((await download).suggestedFilename(), 'uc20-import-template.csv');
      assert.ok(state.requests.some(request => request.path === '/api/coordinator/forecast-import-template'));
    });

    await check('imports: client validation, valid upload is accepted and listed', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + scoped);
      await page.getByRole('button', { name: 'Upload and validate' }).click();
      await page.getByText('Enter a short label for this data source.').waitFor();
      await page.getByText('Choose a CSV file to upload.').waitFor();
      assert.equal(await page.getByLabel('Source label', { exact: true }).evaluate(element => element === document.activeElement), true);
      assert.equal(await page.getByLabel('Source label', { exact: true }).getAttribute('aria-invalid'), 'true');
      await page.getByLabel('CSV file', { exact: true }).setInputFiles({ name: 'cohort.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
      await page.getByText('Choose a file with a .csv extension.').waitFor();
      assert.equal(state.bodies.length, 0);
      await page.getByRole('heading', { name: 'No accepted imports yet' }).waitFor();
      await upload(page, 'VALIDFILE');
      await page.getByRole('status').filter({ hasText: 'Import accepted: 55 students from "September cohort".' }).waitFor();
      await page.getByRole('region', { name: 'Accepted imports table' }).getByText('September cohort').waitFor();
      assert.equal(await page.getByText('No accepted imports yet').count(), 0);
      assert.equal(await page.getByLabel('CSV file', { exact: true }).evaluate(element => element.files.length), 0);
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-imports');
      assert.ok(post.headers['idempotency-key']); assert.ok(post.headers['content-type'].startsWith('multipart/form-data'));
      await page.screenshot({ path: shots + 'imports-desktop.png', fullPage: true });
    });

    await check('imports: students in the system is the main option, snapshot shows coverage, lists the source and feeds the forecast', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + scoped);
      const system = page.getByRole('heading', { name: 'Use students in the system' }); await system.waitFor();
      const csvHeading = page.getByRole('heading', { name: 'Or upload a CSV (fallback)' }); await csvHeading.waitFor();
      assert.ok((await system.boundingBox()).y < (await csvHeading.boundingBox()).y, 'the system card comes first');
      const facts = page.getByLabel('Snapshot scope');
      const factsText = await facts.innerText(); assert.ok(factsText.includes('SECJ') && factsText.includes('KL'));
      await page.getByRole('heading', { name: 'No accepted imports yet' }).waitFor();
      await page.getByRole('button', { name: 'Create snapshot' }).click();
      await page.getByRole('heading', { name: 'Snapshot created' }).waitFor();
      const coverage = page.getByLabel('Snapshot coverage');
      assert.match(await coverage.innerText(), /Students found\s*52/); assert.match(await coverage.innerText(), /No records \(unknown history\)\s*3/); assert.match(await coverage.innerText(), /Withdrawn, counted as failed\s*4/);
      await page.getByText('Not included: 118 in other programmes, 0 at other learning centres, 6 without active student access.').waitFor();
      await page.getByText('Interim: student profiles do not record a learning centre yet').waitFor();
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-imports/system-snapshots');
      assert.deepEqual(post.body, scopeBody); assert.ok(post.headers['idempotency-key']);
      const table = page.getByRole('region', { name: 'Accepted imports table' });
      await table.getByText('System students', { exact: true }).first().waitFor();
      assert.equal(await table.getByText('System students', { exact: true }).count(), 2); // label and source badge
      await page.screenshot({ path: shots + 'imports-system-desktop.png', fullPage: true });
      await page.getByRole('link', { name: 'View roster' }).first().click();
      await page.getByRole('heading', { name: 'System students', level: 2 }).waitFor();
      await page.getByText('Based on student-entered records.').waitFor();
      await page.getByRole('heading', { name: 'Student roster' }).waitFor();
      await page.getByRole('link', { name: '← Back to imports' }).click();
      await page.getByRole('button', { name: 'Create snapshot' }).click();
      await page.getByText('have not changed since this snapshot').waitFor(); // replay (200)
      assert.equal(state.imports.length, 1);
      await page.getByRole('button', { name: 'Generate forecast' }).first().click();
      await page.getByRole('dialog', { name: 'Generate forecast' }).getByRole('button', { name: 'Generate forecast' }).click();
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      await page.getByText('Based on student-entered records.').waitFor();
      await page.screenshot({ path: shots + 'forecast-system-desktop.png', fullPage: true });
    });

    await check('imports: an empty system snapshot explains itself and CSV upload still works as the fallback', async page => {
      const state = await mock(page, { systemEmpty: true }); await page.goto(base + '/coordinator/imports' + scoped);
      await page.getByRole('button', { name: 'Create snapshot' }).click();
      await page.getByRole('alert').filter({ hasText: 'No students in the system match this programme and learning centre' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Snapshot created' }).count(), 0);
      await upload(page, 'VALIDFILE');
      await page.getByRole('status').filter({ hasText: 'Import accepted: 55 students from "September cohort".' }).waitFor();
      const table = page.getByRole('region', { name: 'Accepted imports table' });
      await table.getByText('CSV upload', { exact: true }).waitFor();
      assert.equal(state.imports.length, 1);
    });

    await check('imports: correction report grouped by severity, subset accepted only after acknowledgement, with If-Match', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + scoped);
      await page.getByLabel('Source label', { exact: true }).waitFor();
      await upload(page, 'BADROWS', 'Needs fixes');
      const report = page.getByRole('heading', { name: 'Validation report' }); await report.waitFor();
      assert.equal(await report.evaluate(element => element === document.activeElement), true);
      const summary = page.getByRole('list', { name: 'Validation summary' }).or(page.locator('dl[aria-label="Validation summary"]'));
      assert.ok((await summary.innerText()).includes('Rejected rows'));
      const errors = page.getByRole('region', { name: 'Errors table' }), warnings = page.getByRole('region', { name: 'Warnings table' });
      assert.equal(await errors.locator('tbody tr').count(), 2); assert.equal(await warnings.locator('tbody tr').count(), 1);
      assert.deepEqual(await errors.locator('thead th').allInnerTexts(), ['Row', 'Field', 'Message', 'Corrective action']);
      assert.ok((await errors.locator('tbody tr').first().innerText()).includes('Subject code SECJ9999 is not in the curriculum.'));
      assert.ok((await errors.locator('tbody tr').first().innerText()).includes('Use a subject code from the curriculum, or remove the row.'));
      await page.screenshot({ path: shots + 'imports-report-desktop.png', fullPage: true });
      const opener = page.getByRole('button', { name: 'Accept valid subset' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Accept the valid subset' }); await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Accept valid subset' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'Tick the acknowledgement' }).waitFor();
      assert.equal(state.bodies.filter(item => item.path.endsWith('subset-acceptances')).length, 0);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await opener.evaluate(element => element === document.activeElement), true);
      await opener.click();
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Accept valid subset' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Valid subset accepted' }).waitFor();
      await page.getByRole('region', { name: 'Accepted imports table' }).getByText('Needs fixes').waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Validation report' }).count(), 0);
      const post = state.bodies.find(item => item.path.endsWith('subset-acceptances'));
      assert.equal(post.headers['if-match'], '"sha256:rev1"');
      assert.deepEqual(post.body, { programmeId: 5, learningCentreId: 1, targetSemesterId: 2, validationRevision: 'sha256:rev1', acknowledgeRejectedRows: true });
    });

    await check('imports: a rejected file shows the report with no subset option', async page => {
      await mock(page); await page.goto(base + '/coordinator/imports' + scoped); await page.getByLabel('Source label', { exact: true }).waitFor();
      await upload(page, 'REJECTME', 'Wrong header');
      await page.getByRole('heading', { name: 'Validation report' }).waitFor();
      await page.getByText('File rejected', { exact: true }).waitFor();
      await page.getByText('The header row does not match the template.').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Accept valid subset' }).count(), 0);
      await page.getByRole('button', { name: 'Dismiss report' }).click();
      await page.getByRole('heading', { name: 'Validation report' }).waitFor({ state: 'detached' });
      await page.getByRole('heading', { name: 'No accepted imports yet' }).waitFor();
    });

    await check('imports: roster shows names as text and loads more students', async page => {
      await mock(page, { seed: 'import' }); await page.goto(base + '/coordinator/imports' + scoped);
      await page.getByRole('link', { name: 'View roster for September cohort' }).click();
      await page.getByRole('heading', { name: 'September cohort', exact: true }).waitFor();
      const roster = page.getByRole('region', { name: 'Student roster table' });
      await roster.getByText('Aisyah <b>binti</b> Ahmad', { exact: true }).waitFor();
      assert.equal(await roster.locator('b').count(), 0);
      assert.equal(await roster.locator('tbody tr').count(), 50);
      assert.ok((await roster.locator('tbody tr').nth(2).innerText()).includes('Not provided'));
      await page.getByRole('button', { name: 'Load more students' }).click();
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Student roster table"] tbody tr').length === 55);
      assert.equal(await page.getByRole('button', { name: 'Load more students' }).count(), 0);
      await page.screenshot({ path: shots + 'import-roster-desktop.png', fullPage: true });
      await page.getByRole('link', { name: '← Back to imports' }).click();
      await page.getByRole('heading', { name: 'Accepted imports' }).waitFor();
    });

    await check('generate forecast from an accepted import opens the new draft; a repeat opens the same one', async page => {
      const state = await mock(page, { seed: 'import' }); await page.goto(base + '/coordinator/imports' + scoped);
      const opener = page.getByRole('button', { name: 'Generate forecast from September cohort' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Generate forecast' }); await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('not student registration'));
      await dialog.getByRole('button', { name: 'Cancel' }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(state.bodies.length, 0);
      await opener.click(); await dialog.getByRole('button', { name: 'Generate forecast' }).click();
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      assert.ok(page.url().includes('run=1'));
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-runs');
      assert.deepEqual(post.body, { programmeId: 5, learningCentreId: 1, targetSemesterId: 2, importBatchId: 1, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
      assert.ok(post.headers['idempotency-key']);
      await page.goBack(); await page.getByRole('button', { name: 'Generate forecast from September cohort' }).click();
      await page.getByRole('dialog', { name: 'Generate forecast' }).getByRole('button', { name: 'Generate forecast' }).click();
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
    });

    await check('forecasts: list per scope with status, counts and a newer-forecast badge; detail shows the assumption, subjects and exclusions', async page => {
      const state = await mock(page, { seed: 'run' }); state.newer[1] = { forecastRunId: 2, versionNumber: 2, status: 'DRAFT' };
      await page.goto(base + '/coordinator/forecasts' + scoped);
      const table = page.getByRole('region', { name: 'Forecasts table' }); await table.getByText('Version 1').waitFor();
      const row = table.locator('tbody tr').first(), text = await row.innerText();
      assert.ok(text.includes('Draft') && text.includes('161') && text.includes('Newer forecast available: version 2'));
      await page.screenshot({ path: shots + 'forecasts-list-desktop.png', fullPage: true });
      await page.getByRole('link', { name: 'Open forecast version 1' }).click();
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      assert.ok((await page.getByRole('note').first().innerText()).includes('Potential demand, not registration.'));
      assert.equal(await page.getByText(/registered|enrolled/i).count(), 0);
      const subjects = page.getByRole('region', { name: 'Subjects table' });
      assert.deepEqual(await subjects.locator('thead th').allInnerTexts(), ['Subject', 'Class type', 'Potential demand', 'Uncertain', 'Near graduation', 'Quality', 'Proposed sections', 'Decision']);
      assert.equal(await subjects.locator('tbody tr').count(), 4);
      const lab = subjects.locator('tr[data-subject="SECJ1013"]'), second = subjects.locator('tr[data-subject="SECJ1023"]');
      assert.ok((await lab.innerText()).includes('Section 1: 23 students') && (await lab.innerText()).includes('Below optimal'));
      const text2 = await second.innerText();
      assert.ok(text2.includes('Below minimum') && text2.includes('Below optimal'));
      const toggle = lab.getByRole('button', { name: /3 uncertain students for SECJ1013/ });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await lab.getByText('Academic history incomplete: 2').isVisible(), false);
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await lab.getByText('Academic history incomplete: 2').waitFor(); await lab.getByText('Prerequisite not proven: 1').waitFor();
      assert.ok((await subjects.locator('tr[data-subject="SECD2523"]').innerText()).includes('Configuration required: The subject has no class type.'));
      const excluded = page.getByRole('heading', { name: 'Excluded subjects' }); await excluded.waitFor();
      assert.ok((await page.locator('.coordinator-excluded').innerText()).includes('Final year project is not offered through the forecast.'));
      assert.equal(await subjects.getByText('SECJ4118').count(), 0);
      await page.getByRole('heading', { name: 'Not offered in this semester type' }).waitFor();
      const notOffered = page.locator('.coordinator-not-offered');
      assert.ok((await notOffered.innerText()).includes('SECD3761') && (await notOffered.innerText()).includes('Runs only in Short semesters'));
      assert.equal(await subjects.getByText('SECD3761').count(), 0);
      await page.getByRole('link', { name: /Newer forecast available: version 2/ }).first().waitFor();
      assert.equal(await page.getByRole('button', { name: 'Start review' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /Approve SECJ1013/ }).count(), 0);
      await page.screenshot({ path: shots + 'forecast-draft-desktop.png', fullPage: true });
    });

    await check('forecasts: start review sends the DRAFT revision; a decision needs a reason and records an audit row', async page => {
      const state = await mock(page, { seed: 'run' }); await page.goto(base + runUrl);
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      const opener = page.getByRole('button', { name: 'Start review' }); await opener.click();
      const start = page.getByRole('dialog', { name: 'Start review' }); await start.waitFor();
      await page.keyboard.press('Escape'); await start.waitFor({ state: 'hidden' });
      assert.equal(await opener.evaluate(element => element === document.activeElement), true);
      await opener.click(); await start.getByRole('button', { name: 'Start review' }).click(); await start.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Review started.' }).waitFor();
      await page.getByText('Under review', { exact: true }).first().waitFor();
      const startPost = state.bodies.find(item => item.path.endsWith('/reviews'));
      assert.equal(startPost.headers['if-match'], '"fr1.DRAFT.0"'); assert.equal(startPost.body.action, 'START_REVIEW');
      const approve = page.getByRole('button', { name: 'Approve SECJ1013' }); await approve.click();
      const dialog = page.getByRole('dialog', { name: 'Approve SECJ1013' }); await dialog.waitFor();
      assert.equal(await dialog.getByLabel(reasonLabel).evaluate(element => element === document.activeElement), true);
      await dialog.getByRole('button', { name: 'Approve subject' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'A reason of 1-500 characters is required.' }).waitFor();
      await dialog.getByLabel(reasonLabel).fill('Fits the lab timetable.');
      await dialog.getByRole('button', { name: 'Approve subject' }).dblclick(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Approve: SECJ1013 recorded.' }).waitFor();
      assert.equal(state.bodies.filter(item => item.path.endsWith('/decisions')).length, 1);
      const decision = state.bodies.find(item => item.path.endsWith('/decisions'));
      assert.equal(decision.headers['if-match'], '"fr1.UNDER_REVIEW.1"');
      assert.deepEqual(decision.body.decisions, [{ subjectId: 101, action: 'APPROVE', reason: 'Fits the lab timetable.' }]);
      assert.ok((await page.locator('tr[data-subject="SECJ1013"]').innerText()).includes('Approved'));
      const audit = page.getByRole('region', { name: 'Audit history table' });
      await audit.getByText('Fits the lab timetable.').waitFor();
      assert.ok((await audit.locator('tbody tr').first().innerText()).includes('SECJ1013'));
      assert.equal(await page.getByText('Review started', { exact: false }).count() > 0, true);
    });

    await check('forecasts: change classes validates total and capacity on the client, then shows server errors, then saves', async page => {
      const state = await mock(page, { seed: 'review' }); await page.goto(base + runUrl);
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      const opener = page.getByRole('button', { name: 'Change classes SECJ1013' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Change classes · SECJ1013' }); await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('Normal maximum 35'));
      assert.ok((await dialog.innerText()).includes('Total 46 of 46 students'));
      await page.screenshot({ path: shots + 'allocation-dialog-desktop.png' });
      const first = dialog.getByLabel('Section 1 size', { exact: true });
      await first.fill('30');
      await dialog.getByText('Total 53 of 46 students · 7 too many').waitFor();
      await dialog.getByLabel(reasonLabel).fill('Merge the evening group.');
      await dialog.getByRole('button', { name: 'Save classes' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'The sections add up to 53, but the forecast demand is 46.' }).waitFor();
      await first.fill('40');
      await dialog.getByLabel('Section 2 size', { exact: true }).fill('6');
      await dialog.getByLabel('Section 1 justification (above 35)').waitFor();
      await dialog.getByRole('button', { name: 'Save classes' }).click();
      await dialog.getByRole('alert').filter({ hasText: '40 students is above the capacity limit of 35.' }).waitFor();
      assert.equal(state.bodies.filter(item => item.path.endsWith('/decisions')).length, 0);
      assert.equal(await first.getAttribute('aria-invalid'), 'true');
      await first.fill('30'); await dialog.getByLabel('Section 2 size', { exact: true }).fill('16');
      state.forceAllocationError = { code: 'ALLOCATION_INVALID', message: 'The replacement allocation is not valid.' };
      await dialog.getByRole('button', { name: 'Save classes' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'The replacement allocation is not valid.' }).waitFor();
      assert.equal(await dialog.isVisible(), true);
      await dialog.getByRole('button', { name: 'Add section' }).click();
      await dialog.getByLabel('Section 3 size', { exact: true }).fill('0');
      await dialog.getByRole('button', { name: 'Remove section 3' }).click();
      assert.equal(await dialog.getByLabel('Section 3 size', { exact: true }).count(), 0);
      await dialog.getByRole('button', { name: 'Save classes' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Classes changed for SECJ1013.' }).waitFor();
      const row = page.locator('tr[data-subject="SECJ1013"]');
      await row.getByText('Section 1: 30 students').waitFor(); await row.getByText('Section 2: 16 students').waitFor();
      assert.ok((await row.innerText()).includes('Reviewed'));
      const post = state.bodies.filter(item => item.path.endsWith('/decisions')).at(-1);
      assert.deepEqual(post.body.decisions[0].replacementSections, [{ proposedSectionId: 1, sectionNumber: 1, expectedStudents: 30 }, { proposedSectionId: 2, sectionNumber: 2, expectedStudents: 16 }]);
      assert.equal(post.body.decisions[0].reason, 'Merge the evening group.');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'coordinator-action-status'); // focus moves to the result message
      assert.equal(await opener.count(), 1);
    });

    await check('forecasts: finalize reports incomplete reviews with highlighted subjects, then succeeds and becomes read-only', async page => {
      const state = await mock(page, { seed: 'review' }); await page.goto(base + runUrl);
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      await page.getByRole('button', { name: 'Finalize forecast' }).click();
      const dialog = page.getByRole('dialog', { name: 'Finalize forecast' }); await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('6 sections still pending'));
      await dialog.getByLabel(reasonLabel).fill('Ready for confirmation.');
      await dialog.getByRole('button', { name: 'Finalize forecast' }).click(); await dialog.waitFor({ state: 'hidden' });
      const alert = page.getByRole('alert').filter({ hasText: '3 subjects still need a decision before this forecast can be finalized: SECJ1013, SECJ1023, SCSJ1013.' }); await alert.waitFor();
      assert.equal(await page.locator('.coordinator-row-pending').count(), 3);
      assert.equal(await page.getByText('Decision needed').count(), 3);
      assert.equal(await page.locator('tr[data-subject="SECD2523"]').evaluate(element => element.classList.contains('coordinator-row-pending')), false);
      await page.screenshot({ path: shots + 'forecast-finalize-incomplete-desktop.png', fullPage: true });
      for (const [action, code, label] of [['Approve', 'SECJ1013', 'Approve subject'], ['Defer', 'SECJ1023', 'Defer subject'], ['Mark reviewed', 'SCSJ1013', 'Mark reviewed']]) {
        await page.getByRole('button', { name: `${action} ${code}` }).click();
        const decide = page.getByRole('dialog', { name: `${action} ${code}` }); await decide.getByLabel(reasonLabel).fill('Checked: ' + code);
        await decide.getByRole('button', { name: label }).click(); await decide.waitFor({ state: 'hidden' });
        await page.locator(`tr[data-subject="${code}"]`).getByText(action === 'Approve' ? 'Approved' : action === 'Defer' ? 'Deferred' : 'Reviewed', { exact: true }).waitFor();
      }
      assert.equal(await page.locator('.coordinator-row-pending').count(), 0);
      await page.getByRole('button', { name: 'Finalize forecast' }).click();
      await dialog.getByLabel(reasonLabel).fill('Ready for confirmation.');
      await dialog.getByRole('button', { name: 'Finalize forecast' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Forecast finalized. It is now read-only.' }).waitFor();
      await page.getByText('Finalized', { exact: true }).first().waitFor();
      assert.equal(await page.getByRole('button', { name: /Finalize forecast|Start review|Approve|Defer|Mark reviewed|Change classes/ }).count(), 0);
      await page.getByRole('link', { name: 'Confirm offerings' }).waitFor();
      const post = state.bodies.filter(item => item.path.endsWith('/finalizations')).at(-1);
      assert.deepEqual(post.body, { scope: { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 }, reason: 'Ready for confirmation.' });
      await page.getByRole('region', { name: 'Audit history table' }).getByText('Finalized').first().waitFor();
      await page.screenshot({ path: shots + 'forecast-finalized-desktop.png', fullPage: true });
    });

    await check('forecasts: a finalized run opens read-only', async page => {
      await mock(page, { seed: 'finalized' }); await page.goto(base + runUrl);
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      await page.getByText('This forecast is finalized and read-only.').waitFor();
      assert.equal(await page.getByRole('button', { name: /Finalize forecast|Start review|Approve|Defer|Mark reviewed|Change classes/ }).count(), 0);
    });

    await check('forecasts: 412 RUN_REVISION_MISMATCH reloads the forecast and says so', async page => {
      const state = await mock(page, { seed: 'review' }); await page.goto(base + runUrl);
      await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      await page.getByRole('button', { name: 'Approve SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Approve SECJ1013' }); await dialog.getByLabel(reasonLabel).fill('Fine.');
      state.staleNext = true; const before = state.requests.filter(request => request.path === '/api/coordinator/forecast-runs/1' && request.method === 'GET').length;
      await dialog.getByRole('button', { name: 'Approve subject' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('alert').filter({ hasText: 'This forecast changed; reloaded.' }).waitFor();
      assert.ok(state.requests.filter(request => request.path === '/api/coordinator/forecast-runs/1' && request.method === 'GET').length > before);
      assert.ok((await page.locator('tr[data-subject="SECJ1013"]').innerText()).includes('Pending'));
      await page.getByRole('region', { name: 'Audit history table' }).getByText('Changed by another session.').waitFor();
      await page.getByRole('button', { name: 'Approve SECJ1013' }).click();
      await dialog.getByLabel(reasonLabel).fill('Retry after reload.'); await dialog.getByRole('button', { name: 'Approve subject' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Approve: SECJ1013 recorded.' }).waitFor();
    });

    await check('forecasts: audit history is paged', async page => {
      await mock(page, { seed: 'review' }); await page.goto(base + runUrl);
      const audit = page.getByRole('region', { name: 'Audit history table' }); await audit.waitFor();
      assert.equal(await audit.locator('tbody tr').count(), 20);
      await page.getByRole('button', { name: 'Load older entries' }).click();
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Audit history table"] tbody tr').length === 25);
      assert.equal(await page.getByRole('button', { name: 'Load older entries' }).count(), 0);
      await audit.locator('summary').first().click();
      assert.ok((await audit.locator('pre').first().innerText()).includes('"before"'));
    });

    await check('decisions: no finalized forecast explains why and links to the forecasts', async page => {
      await mock(page, { seed: 'run' }); await page.goto(base + decisionsUrl);
      await page.getByRole('heading', { name: 'Offering Decisions', exact: true }).first().waitFor();
      await page.getByRole('heading', { name: 'No finalized forecast yet' }).waitFor();
      assert.ok((await page.locator('.admin-empty').innerText()).includes('finalized forecast'));
      await page.getByRole('link', { name: 'Go to Class Offering Forecast' }).click();
      await page.getByRole('heading', { name: 'Forecasts', exact: true }).waitFor();
      assert.ok(page.url().includes('/coordinator/forecasts'));
    });

    await check('decisions: scope pickers follow assignments and the target semester is read-only', async page => {
      const state = await mock(page, { seed: 'finalized' }); await page.goto(base + '/coordinator/decisions');
      await page.getByRole('heading', { name: 'Offering Decisions', exact: true }).first().waitFor();
      assert.equal(await page.getByLabel('Learning centre', { exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('heading', { name: 'Choose a scope' }).count(), 1);
      await page.getByLabel('Programme', { exact: true }).selectOption('5');
      await page.getByLabel('Learning centre', { exact: true }).selectOption('1');
      await page.getByRole('heading', { name: 'Confirm offerings for this semester' }).waitFor();
      assert.equal(await page.getByLabel('Target semester').evaluate(element => element.tagName), 'OUTPUT');
      assert.equal(await page.locator('output.coordinator-readonly-value').innerText(), '2026/2027 · Semester 2');
      assert.ok(state.requests.some(request => request.path === '/api/coordinator/confirmed-offerings' && request.search.includes('targetSemesterId=2')));
    });

    await check('decisions: first confirmation from a finalized forecast with forecast numbers, excluded subjects disabled, deadline and reason required', async page => {
      const state = await mock(page, { seed: 'finalized' }); await page.goto(base + decisionsUrl);
      await page.getByRole('heading', { name: 'Confirm offerings for this semester' }).waitFor();
      assert.equal(await page.getByLabel('Finalized forecast').inputValue(), '1');
      const table = page.getByRole('region', { name: 'Subjects to confirm table' }); await table.waitFor();
      assert.deepEqual(await table.locator('thead th').allInnerTexts(), ['Confirm', 'Subject', 'Class type', 'Potential demand', 'Proposed classes', 'Near graduation']);
      assert.equal(await table.locator('tbody tr').count(), 6);
      const lab = await table.locator('tr[data-subject="SECJ1013"]').innerText();
      assert.ok(lab.includes('46') && lab.includes('2 classes (23 + 23)') && lab.includes('4'));
      const excluded = table.locator('tr[data-subject="SECJ4118"]');
      assert.equal(await page.getByLabel('Select SECJ4118').isDisabled(), true);
      assert.ok((await excluded.innerText()).includes('Cannot be confirmed: Final year project is not offered through the forecast.'));
      assert.equal(await page.getByLabel('Select SECD3761').isDisabled(), true);
      assert.ok((await table.locator('tr[data-subject="SECD3761"]').innerText()).includes('Cannot be confirmed: Runs only in Short semesters'));
      assert.ok((await table.locator('tr[data-subject="SECD2523"]').innerText()).includes('No classes proposed: configuration required.'));
      const confirm = page.getByRole('button', { name: 'Select subjects to confirm' }); assert.equal(await confirm.isDisabled(), true);
      await page.getByLabel('Select SECJ1013').check(); await page.getByLabel('Select SCSJ1013').check();
      await page.getByText('2 subjects selected').waitFor();
      await page.getByRole('button', { name: 'Confirm 2 subjects' }).click();
      await page.getByRole('alert').filter({ hasText: 'Choose the date and time students can pick until.' }).waitFor();
      assert.equal(await page.getByLabel('Pick deadline').evaluate(element => element === document.activeElement), true);
      assert.equal(await page.getByLabel('Pick deadline').getAttribute('aria-invalid'), 'true');
      await page.getByLabel('Pick deadline').fill(localInput(-1));
      await page.getByRole('button', { name: 'Confirm 2 subjects' }).click();
      await page.getByRole('alert').filter({ hasText: 'The pick deadline must be in the future.' }).waitFor();
      assert.equal(state.bodies.length, 0);
      await page.getByLabel('Pick deadline').fill(localInput(14));
      await page.screenshot({ path: shots + 'decisions-create-desktop.png', fullPage: true });
      const opener = page.getByRole('button', { name: 'Confirm 2 subjects' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Confirm offerings' }); await dialog.waitFor();
      const text = await dialog.innerText();
      assert.ok(text.includes('SECJ1013') && text.includes('SCSJ1013') && text.includes('not an official registration'));
      await dialog.getByRole('button', { name: 'Confirm 2 subjects' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'A reason of 1-500 characters is required.' }).waitFor();
      assert.equal(state.bodies.length, 0);
      await dialog.getByLabel(reasonLabel).fill('Strong demand for the September intake.');
      await dialog.getByRole('button', { name: 'Confirm 2 subjects' }).dblclick(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: '2 subjects confirmed by coordinator.' }).waitFor();
      const posts = state.bodies.filter(item => item.path === '/api/coordinator/confirmed-offerings');
      assert.equal(posts.length, 1);
      assert.deepEqual(posts[0].body, { scope: scopeBody, forecastRunId: 1, subjectIds: [101, 103], reason: 'Strong demand for the September intake.', baseRevision: null, pickDeadline: new Date(localInput(14)).toISOString() });
      assert.equal(posts[0].headers['if-match'], undefined); assert.ok(posts[0].headers['idempotency-key']);
      await page.getByRole('heading', { name: /Confirmed offerings/ }).waitFor();
      await page.getByText('Pick window open').waitFor();
      const offerings = page.getByRole('region', { name: 'Confirmed offerings table' });
      assert.equal(await offerings.locator('tbody tr').count(), 2);
      assert.equal(await offerings.getByText('No student picks yet').count(), 2);
      await page.screenshot({ path: shots + 'decisions-confirmed-first-desktop.png', fullPage: true });
    });

    await check('decisions: an existing confirmation shows the window state, forecast numbers, student picks placeholder and the newer-forecast notice', async page => {
      const state = await mock(page, { seed: 'confirmed', secondFinalized: true, bulkConfAudit: true }); state.newerConf = { forecastRunId: 2, versionNumber: 2, status: 'FINALIZED' };
      await page.goto(base + decisionsUrl);
      await page.getByRole('heading', { name: /Confirmed offerings/ }).waitFor();
      assert.equal(await page.getByRole('heading', { name: /Confirmed offerings/ }).evaluate(element => element === document.activeElement), true);
      assert.ok((await page.locator('#decisions-summary-heading').locator('..').innerText()).includes('Open until'));
      await page.getByText('Pick window open').waitFor();
      const table = page.getByRole('region', { name: 'Confirmed offerings table' }); await table.waitFor();
      assert.deepEqual(await table.locator('thead th').allInnerTexts(), ['Subject', 'Status', 'Potential demand', 'Proposed classes', 'Near graduation', 'Student picks', 'Last change', 'Actions']);
      assert.equal(await table.locator('tbody tr').count(), 2);
      const row = await table.locator('tr[data-subject="SECJ1013"]').innerText();
      assert.ok(row.includes('Confirmed by coordinator') && row.includes('46') && row.includes('2 classes (23 + 23)') && row.includes('No student picks yet') && row.includes('Demand is clear.'));
      assert.equal(await page.getByText('Student picks arrive with the student offerings page.', { exact: false }).count(), 1);
      const note = page.locator('.coordinator-newer-notice'); await note.waitFor();
      assert.ok((await note.innerText()).includes('Version 2 (finalized)') && (await note.innerText()).includes('not changed'));
      assert.ok((await note.getByRole('link').getAttribute('href')).includes('/coordinator/forecasts?') && (await note.getByRole('link').getAttribute('href')).includes('run=2'));
      assert.equal(await page.getByText(/official registration/i).count() >= 1, true);
      assert.equal(await page.getByRole('region', { name: 'Offering audit history table' }).locator('tbody tr').count(), 20);
      await page.getByRole('button', { name: 'Load older entries' }).click();
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Offering audit history table"] tbody tr').length === 27);
      assert.equal(state.bodies.length, 0);
      await page.screenshot({ path: shots + 'decisions-existing-desktop.png', fullPage: true });
    });

    await check('decisions: withdraw and re-confirm each need a reason, send the revision and are audited', async page => {
      const state = await mock(page, { seed: 'confirmed' }); await page.goto(base + decisionsUrl);
      const table = page.getByRole('region', { name: 'Confirmed offerings table' }); await table.waitFor();
      const opener = page.getByRole('button', { name: 'Withdraw SECJ1013' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Withdraw SECJ1013' }); await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Withdraw subject' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'A reason of 1-500 characters is required.' }).waitFor();
      assert.equal(state.bodies.length, 0);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await opener.evaluate(element => element === document.activeElement), true);
      await opener.click(); await dialog.getByLabel(reasonLabel).fill('Lab room unavailable.'); await dialog.getByRole('button', { name: 'Withdraw subject' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'SECJ1013 withdrawn.' }).waitFor();
      const withdrawal = state.bodies.find(item => item.path.endsWith('/withdrawals'));
      assert.equal(withdrawal.headers['if-match'], '"oc1.3"');
      assert.deepEqual(withdrawal.body, { scope: scopeBody, subjectIds: [101], reason: 'Lab room unavailable.', baseRevision: 'oc1.3' });
      const withdrawn = table.locator('tr[data-subject="SECJ1013"]');
      assert.ok((await withdrawn.innerText()).includes('Withdrawn') && (await withdrawn.innerText()).includes('Lab room unavailable.'));
      assert.equal(await page.getByRole('button', { name: 'Withdraw SECJ1013' }).count(), 0);
      await page.getByRole('region', { name: 'Offering audit history table' }).getByText('Withdrawn').first().waitFor();
      await page.getByRole('button', { name: 'Re-confirm SECJ1013' }).click();
      const again = page.getByRole('dialog', { name: 'Re-confirm SECJ1013' }); await again.waitFor();
      await again.getByLabel(reasonLabel).fill('Demand recovered.'); await again.getByRole('button', { name: 'Re-confirm subject' }).click(); await again.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'SECJ1013 re-confirmed.' }).waitFor();
      const reconfirm = state.bodies.filter(item => item.path === '/api/coordinator/confirmed-offerings').at(-1);
      assert.equal(reconfirm.headers['if-match'], '"oc1.4"');
      assert.deepEqual(reconfirm.body.subjectIds, [101]); assert.equal(reconfirm.body.forecastRunId, 1); assert.equal(reconfirm.body.baseRevision, 'oc1.4');
      assert.ok((await table.locator('tr[data-subject="SECJ1013"]').innerText()).includes('Confirmed by coordinator'));
      const audit = page.getByRole('region', { name: 'Offering audit history table' });
      await audit.getByText('Re-confirmed').waitFor();
      assert.ok((await audit.locator('tbody tr').first().innerText()).includes('Demand recovered.'));
    });

    await check('decisions: add more subjects from the forecast, excluded ones disabled', async page => {
      const state = await mock(page, { seed: 'confirmed' }); await page.goto(base + decisionsUrl);
      const add = page.getByRole('region', { name: 'Subjects to add table' }); await add.waitFor();
      assert.deepEqual(await add.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getAttribute('data-subject'))), ['SECJ1023', 'SECD2523', 'SECJ4118', 'SECD3761']);
      assert.equal(await page.getByLabel('Select SECD3761').isDisabled(), true);
      assert.equal(await page.getByLabel('Select SECJ4118').isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Select subjects to add' }).isDisabled(), true);
      await page.getByLabel('Select SECJ1023').check();
      await page.getByRole('button', { name: 'Add 1 subject' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add subjects' }); await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('SECJ1023 Programming Technique II'));
      await dialog.getByLabel(reasonLabel).fill('Second lab group needed.');
      await dialog.getByRole('button', { name: 'Add 1 subject' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: '1 subject added.' }).waitFor();
      const post = state.bodies.filter(item => item.path === '/api/coordinator/confirmed-offerings').at(-1);
      assert.deepEqual(post.body.subjectIds, [102]); assert.equal(post.headers['if-match'], '"oc1.3"');
      await page.getByRole('region', { name: 'Confirmed offerings table' }).locator('tr[data-subject="SECJ1023"]').waitFor();
      assert.equal(await add.locator('tbody tr').count(), 3);
    });

    await check('decisions: change the deadline with a reason, optionally switching to another finalized forecast', async page => {
      const state = await mock(page, { seed: 'confirmed', secondFinalized: true }); await page.goto(base + decisionsUrl);
      await page.getByRole('region', { name: 'Confirmed offerings table' }).waitFor();
      const opener = page.getByRole('button', { name: 'Change pick deadline' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Change pick deadline' }); await dialog.waitFor();
      await dialog.getByLabel(reasonLabel).fill('No change.'); await dialog.getByRole('button', { name: 'Change deadline' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'Nothing to change' }).waitFor();
      await dialog.getByLabel('New pick deadline').fill(localInput(-3));
      await dialog.getByRole('button', { name: 'Change deadline' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'The pick deadline must be in the future.' }).waitFor();
      assert.equal(state.bodies.length, 0);
      await dialog.getByLabel('New pick deadline').fill(localInput(20));
      await dialog.getByLabel('Forecast this confirmation is based on').selectOption('2');
      await page.screenshot({ path: shots + 'decisions-deadline-dialog-desktop.png' });
      await dialog.getByRole('button', { name: 'Change deadline' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Pick deadline and forecast updated.' }).waitFor();
      const post = state.bodies.find(item => item.path.endsWith('/pick-deadline'));
      assert.equal(post.headers['if-match'], '"oc1.3"');
      assert.deepEqual(post.body, { scope: scopeBody, pickDeadline: new Date(localInput(20)).toISOString(), reason: 'No change.', baseRevision: 'oc1.3', forecastRunId: 2 });
      await page.getByText('based on forecast version 2', { exact: false }).waitFor();
      const audit = page.getByRole('region', { name: 'Offering audit history table' });
      await audit.getByText('Pick deadline changed').waitFor();
      assert.ok((await audit.locator('tbody tr').first().innerText()).includes('forecast #2'));
      assert.equal(await opener.evaluate(element => element === document.activeElement || document.activeElement?.id === 'coordinator-action-status'), true);
    });

    await check('decisions: a deadline-only change sends just the new deadline', async page => {
      const state = await mock(page, { seed: 'confirmed' }); await page.goto(base + decisionsUrl);
      await page.getByRole('button', { name: 'Change pick deadline' }).click();
      const dialog = page.getByRole('dialog', { name: 'Change pick deadline' }); await dialog.waitFor();
      await dialog.getByLabel('New pick deadline').fill(localInput(30)); await dialog.getByLabel(reasonLabel).fill('Registry asked for more time.');
      await dialog.getByRole('button', { name: 'Change deadline' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'Pick deadline changed to' }).waitFor();
      assert.equal('forecastRunId' in state.bodies.find(item => item.path.endsWith('/pick-deadline')).body, false);
    });

    await check('decisions: 412 reloads the confirmation and says so', async page => {
      const state = await mock(page, { seed: 'confirmed' }); await page.goto(base + decisionsUrl);
      await page.getByRole('region', { name: 'Confirmed offerings table' }).waitFor();
      await page.getByRole('button', { name: 'Withdraw SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Withdraw SECJ1013' }); await dialog.getByLabel(reasonLabel).fill('Not needed.');
      state.staleConf = true;
      const before = state.requests.filter(request => request.path === '/api/coordinator/confirmed-offerings' && request.method === 'GET').length;
      await dialog.getByRole('button', { name: 'Withdraw subject' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('alert').filter({ hasText: 'This confirmation changed; reloaded.' }).waitFor();
      assert.ok(state.requests.filter(request => request.path === '/api/coordinator/confirmed-offerings' && request.method === 'GET').length > before);
      await page.getByRole('region', { name: 'Confirmed offerings table' }).locator('tr[data-subject="SECJ1023"]').waitFor();
      assert.ok((await page.locator('tr[data-subject="SECJ1013"]').innerText()).includes('Confirmed by coordinator'));
      await page.getByRole('button', { name: 'Withdraw SECJ1013' }).click();
      await dialog.getByLabel(reasonLabel).fill('Retry after reload.'); await dialog.getByRole('button', { name: 'Withdraw subject' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'SECJ1013 withdrawn.' }).waitFor();
    });

    await check('decisions: server errors stay inside the dialog; a closed window is shown as closed', async page => {
      const state = await mock(page, { seed: 'finalized' }); await page.goto(base + decisionsUrl);
      await page.getByLabel('Select SECJ1013').check(); await page.getByLabel('Pick deadline').fill(localInput(5));
      state.forceConfirmError = { code: 'SUBJECT_EXCLUDED', message: 'Subjects excluded from the offering forecast cannot be confirmed.' };
      await page.getByRole('button', { name: 'Confirm 1 subject' }).click();
      const dialog = page.getByRole('dialog', { name: 'Confirm offerings' }); await dialog.getByLabel(reasonLabel).fill('Try.');
      await dialog.getByRole('button', { name: 'Confirm 1 subject' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'Subjects excluded from the offering forecast cannot be confirmed.' }).waitFor();
      assert.equal(await dialog.isVisible(), true);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      const closed = await browser.newPage({ viewport: { width: 1440, height: 960 } }); await mock(closed, { seed: 'confirmed', closedWindow: true });
      await closed.goto(base + decisionsUrl); await closed.getByText('Pick window closed').waitFor();
      assert.ok((await closed.locator('#decisions-summary-heading').locator('..').innerText()).includes('Closed on'));
      await closed.close();
    });

    await check('decisions: a service error shows a retryable alert', async page => {
      const state = await mock(page, { seed: 'confirmed' }); await page.goto(base + decisionsUrl);
      await page.getByRole('region', { name: 'Confirmed offerings table' }).waitFor();
      state.failNext = { status: 503, code: 'FORECASTING_UNAVAILABLE', message: 'Forecasting data is unavailable. Please retry.' };
      await page.getByRole('button', { name: 'Refresh' }).click();
      await page.getByRole('alert').filter({ hasText: 'Forecasting data is unavailable. Please retry.' }).waitFor();
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('region', { name: 'Confirmed offerings table' }).waitFor();
    });

    await check('a service error shows a retryable alert', async page => {
      const state = await mock(page, { seed: 'run' }); state.failNext = { status: 503, code: 'FORECASTING_UNAVAILABLE', message: 'Forecasting data is unavailable. Please retry.' };
      await page.goto(base + '/coordinator/forecasts' + scoped);
      await page.getByRole('alert').filter({ hasText: 'Forecasting data is unavailable. Please retry.' }).waitFor();
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('heading', { name: 'Forecasts', exact: true }).waitFor();
    });

    for (const width of [320, 375]) await check('mobile: imports and forecasts have no horizontal overflow at ' + width, async page => {
      await mock(page, { seed: 'review' }); await page.setViewportSize({ width, height: 800 });
      await page.goto(base + '/coordinator/imports' + scoped); await page.getByRole('heading', { name: 'Or upload a CSV (fallback)' }).waitFor();
      assert.ok(await noOverflow(page));
      await page.getByRole('button', { name: 'Create snapshot' }).click(); await page.getByRole('heading', { name: 'Snapshot created' }).waitFor();
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'imports-system-mobile.png', fullPage: true });
      await page.goto(base + '/coordinator/forecasts' + scoped); await page.getByRole('region', { name: 'Forecasts table' }).waitFor();
      await page.goto(base + '/coordinator/imports' + scoped); await page.getByRole('heading', { name: 'Or upload a CSV (fallback)' }).waitFor();
      await upload(page, 'BADROWS', 'Needs fixes'); await page.getByRole('heading', { name: 'Validation report' }).waitFor();
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'imports-report-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Accept valid subset' }).click();
      const subset = page.getByRole('dialog', { name: 'Accept the valid subset' }); await subset.waitFor();
      const box = await subset.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 800);
      assert.ok(await noOverflow(page));
      await page.keyboard.press('Escape');
      await page.goto(base + '/coordinator/forecasts' + scoped); await page.getByRole('region', { name: 'Forecasts table' }).waitFor();
      assert.ok(await noOverflow(page));
      await page.goto(base + runUrl); await page.getByRole('heading', { name: /Forecast version 1/ }).waitFor();
      assert.ok(await noOverflow(page));
      const table = page.getByRole('region', { name: 'Subjects table' });
      assert.ok(await table.evaluate(element => element.scrollWidth > element.clientWidth)); // local horizontal scrolling only
      await table.focus(); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[aria-label="Subjects table"]').scrollLeft > 0);
      if (width === 375) await page.screenshot({ path: shots + 'forecast-detail-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Change classes SECJ1013' }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'Change classes SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Change classes · SECJ1013' }); await dialog.waitFor();
      await dialog.getByLabel('Section 1 size', { exact: true }).fill('40');
      await dialog.getByLabel('Section 1 justification (above 35)').waitFor();
      const dialogBox = await dialog.boundingBox(); assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= width);
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'allocation-dialog-mobile.png' });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Finalize forecast' }).click();
      const finalize = page.getByRole('dialog', { name: 'Finalize forecast' }); await finalize.waitFor();
      const finalizeBox = await finalize.boundingBox(); assert.ok(finalizeBox.x >= 0 && finalizeBox.x + finalizeBox.width <= width);
      await page.keyboard.press('Escape');
    }, width);

    for (const width of [320, 375]) await check('mobile: offering decisions have no horizontal overflow at ' + width, async page => {
      const state = await mock(page, { seed: 'finalized', secondFinalized: true }); await page.setViewportSize({ width, height: 800 });
      await page.goto(base + decisionsUrl); await page.getByRole('heading', { name: 'Confirm offerings for this semester' }).waitFor();
      assert.ok(await noOverflow(page));
      const table = page.getByRole('region', { name: 'Subjects to confirm table' });
      assert.ok(await table.evaluate(element => element.scrollWidth > element.clientWidth));
      await page.getByLabel('Select SECJ1013').check();
      await page.getByLabel('Pick deadline').fill(localInput(14));
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'decisions-create-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Confirm 1 subject' }).click();
      const dialog = page.getByRole('dialog', { name: 'Confirm offerings' }); await dialog.waitFor();
      let box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 800);
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'decisions-confirm-dialog-mobile.png' });
      await dialog.getByLabel(reasonLabel).fill('Demand is clear.'); await dialog.getByRole('button', { name: 'Confirm 1 subject' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('heading', { name: /Confirmed offerings/ }).waitFor();
      state.newerConf = { forecastRunId: 2, versionNumber: 2, status: 'FINALIZED' };
      await page.getByRole('button', { name: 'Refresh' }).click(); await page.locator('.coordinator-newer-notice').waitFor();
      assert.ok(await noOverflow(page));
      const offerings = page.getByRole('region', { name: 'Confirmed offerings table' });
      assert.ok(await offerings.evaluate(element => element.scrollWidth > element.clientWidth));
      await offerings.focus(); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[aria-label="Confirmed offerings table"]').scrollLeft > 0);
      if (width === 375) await page.screenshot({ path: shots + 'decisions-existing-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Change pick deadline' }).click();
      const change = page.getByRole('dialog', { name: 'Change pick deadline' }); await change.waitFor();
      box = await change.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'decisions-deadline-dialog-mobile.png' });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Withdraw SECJ1013' }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'Withdraw SECJ1013' }).click();
      const withdraw = page.getByRole('dialog', { name: 'Withdraw SECJ1013' }); await withdraw.waitFor();
      box = await withdraw.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.keyboard.press('Escape');
    }, width);

    console.log('PASS ' + passed + ' coordinator browser checks');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
