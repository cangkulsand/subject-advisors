// Real coordinator screens (UC20 imports and the class offering forecast with offering decisions) in the actual application routes with TEST-ONLY Clerk and API fixtures.
// No credentials or database access. Screenshots go to .wrangler/coordinator-review/.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { assertReadable } from '../ui/readability.mjs';
import { createState, handle } from './fixtures.mjs';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const output = await build({ entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false, outdir: '.wrangler/coordinator-review', jsx: 'automatic', loader: { '.png': 'dataurl' }, alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' } });
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const serve = process.argv.includes('--serve');
const serveState = createState({ seed: 'run' });
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
if (serve) console.log('Fictional coordinator preview: ' + base + '/coordinator/forecasts?programmeId=5&learningCentreId=1&snapshot=1');
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
    try { await body(page); await assertReadable(page, name); assert.deepEqual(errors, []); passed++; console.log('PASS ' + name); }
    catch (error) { console.error(name, errors, await page.locator('body').innerText().catch(() => '')); await page.screenshot({ path: shots + 'failure-' + passed + '.png', fullPage: true }).catch(() => {}); throw error; }
    finally { await page.close(); }
  }
  const scoped = '?programmeId=5&learningCentreId=1';
  const csvScoped = scoped + '&source=csv', bothScoped = scoped + '&source=both';
  const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const csv = (marker) => ({ name: 'cohort.csv', mimeType: 'text/csv', buffer: Buffer.from(marker + '\nexternal_reference,curriculum_version\n') });
  async function upload(page, marker, label = 'September cohort') {
    await page.getByLabel('Source label', { exact: true }).fill(label);
    await page.getByLabel('CSV file', { exact: true }).setInputFiles(csv(marker));
    await page.getByRole('button', { name: 'Upload and validate' }).click();
  }
  // Subject action dropdown: open the row's menu and pick a status (labels: Pending, Approved, Removed).
  async function pickAction(page, code, label) {
    await page.getByRole('button', { name: new RegExp(`^Action for ${code}: `) }).click();
    await page.getByRole('menu', { name: `Action for ${code}` }).getByRole('menuitemradio', { name: label, exact: true }).click();
  }
  /** The decisions screen is ready when its subjects table and the decision set are loaded. */
  async function forecastReady(page) {
    await page.getByRole('region', { name: 'Subjects table', exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: /^Selection / }).waitFor();
  }
  const subjectCodes = page => page.locator('[aria-label="Subjects table"] tbody tr').evaluateAll(rows => rows.map(row => row.dataset.subject));
  async function uploadBoth(page, marker, label = 'Combined export') {
    await page.getByLabel('Source label', { exact: true }).fill(label);
    await page.getByLabel('CSV file', { exact: true }).setInputFiles(csv(marker));
    await page.getByRole('button', { name: 'Create combined snapshot' }).click();
  }
  const pickers = [
    { studentId: 31, studentName: 'Aisyah binti Ahmad', matricNo: 'A22EC0051', email: 'aisyah@graduate.utm.my' },
    { studentId: 32, studentName: 'Bakri bin Hassan', matricNo: null, email: 'student052@graduate.utm.my' },
    { studentId: 33, studentName: 'Chong Wei', matricNo: 'A22EC0053', email: 'chong@graduate.utm.my' },
  ];
  const forecastUrl = '/coordinator/forecasts' + scoped;
  const scopeBody = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
  try {
    browser = await chromium.launch({ headless: true });

    await check('imports: scope pickers follow assignments, target semester is read-only, template downloads', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports?source=csv');
      await page.getByRole('heading', { name: 'Data Imports', exact: true }).first().waitFor();
      const programme = page.getByLabel('Programme', { exact: true }), centre = page.getByLabel('Learning centre', { exact: true });
      assert.equal(await centre.isDisabled(), true);
      assert.deepEqual(await programme.locator('option').allInnerTexts(), ['Select a programme', 'SECJ · Bachelor of Computer Science (Software Engineering)', 'SECRH · Bachelor of Computer Science (Computer Networks and Security)']);
      await programme.selectOption('5');
      assert.deepEqual(await centre.locator('option').allInnerTexts(), ['Select a learning centre', 'KL · UTMSPACE Kuala Lumpur', 'JB · UTMSPACE Johor Bahru']);
      await programme.selectOption('7');
      assert.deepEqual(await centre.locator('option').allInnerTexts(), ['Select a learning centre', 'KL · UTMSPACE Kuala Lumpur']);
      assert.equal(await page.getByRole('button', { name: 'Upload and validate' }).count(), 0);
      assert.equal(await page.getByRole('heading', { level: 2 }).filter({ hasText: 'Forecast scope' }).count(), 0, 'one setup card, no separate scope card');
      await centre.selectOption('1');
      await page.getByRole('heading', { name: 'CSV import', exact: true }).waitFor();
      assert.ok(page.url().includes('source=csv'), 'the data source choice survives a scope change');
      const target = page.locator('output.coordinator-readonly-value');
      assert.equal(await target.innerText(), '2026/2027 · Semester 2');
      assert.equal(await page.getByLabel('Target semester').evaluate(element => element.tagName), 'OUTPUT');
      assert.ok(page.url().includes('programmeId=7') && page.url().includes('learningCentreId=1'));
      assert.equal(await page.getByRole('button', { name: /template/ }).count(), 1, 'only the coordinator template is offered');
      const coordinatorDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download template', exact: true }).click();
      assert.equal((await coordinatorDownload).suggestedFilename(), 'uc20-import-template-coordinator.csv');
      assert.ok(state.requests.some(request => request.path === '/api/coordinator/forecast-import-template' && request.search === '?format=coordinator'));
      await page.getByText('CSV up to 5 MiB (maximum 20,000 rows).', { exact: true }).waitFor();
    });

    await check('imports: client validation, valid upload is accepted and listed', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + csvScoped);
      await page.getByRole('button', { name: 'Upload and validate' }).click();
      await page.getByText('Enter a short label for this data source.').waitFor();
      await page.getByText('Choose a CSV file to upload.').waitFor();
      assert.equal(await page.getByLabel('Source label', { exact: true }).evaluate(element => element === document.activeElement), true);
      assert.equal(await page.getByLabel('Source label', { exact: true }).getAttribute('aria-invalid'), 'true');
      await page.getByLabel('CSV file', { exact: true }).setInputFiles({ name: 'cohort.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
      await page.getByText('Choose a file with a .csv extension.').waitFor();
      assert.equal(state.bodies.length, 0);
      await page.getByRole('heading', { name: 'No snapshots yet' }).waitFor();
      await upload(page, 'VALIDFILE');
      await page.getByRole('status').filter({ hasText: 'Import accepted: 55 students from "September cohort".' }).waitFor();
      await page.getByRole('region', { name: 'Student data snapshots table' }).getByText('September cohort').waitFor();
      assert.equal(await page.getByText('No snapshots yet').count(), 0);
      assert.equal(await page.getByLabel('CSV file', { exact: true }).evaluate(element => element.files.length), 0);
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-imports');
      assert.ok(post.headers['idempotency-key']); assert.ok(post.headers['content-type'].startsWith('multipart/form-data'));
      await page.screenshot({ path: shots + 'imports-desktop.png', fullPage: true });
    });

    await check('imports: students in the system is the default, snapshot shows coverage, lists the source and feeds the forecast', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + scoped);
      const system = page.getByRole('heading', { name: 'Students in the system', exact: true }); await system.waitFor();
      assert.equal(await page.getByRole('heading', { name: 'CSV import', exact: true }).count(), 0, 'only the system card is shown by default');
      assert.equal(await page.getByLabel('Snapshot scope').count(), 0, 'the scope is not repeated inside the snapshot section');
      assert.equal(await page.getByLabel('Programme', { exact: true }).inputValue(), '5');
      assert.equal(await page.getByLabel('Learning centre', { exact: true }).inputValue(), '1');
      await page.getByRole('heading', { name: 'No snapshots yet' }).waitFor();
      await page.getByRole('button', { name: 'Create snapshot' }).click();
      await page.getByRole('heading', { name: 'Snapshot created' }).waitFor();
      const coverage = page.getByLabel('Snapshot coverage');
      assert.match(await coverage.innerText(), /Students found\s*52/); assert.match(await coverage.innerText(), /No records \(unknown history\)\s*3/); assert.match(await coverage.innerText(), /Withdrawn, counted as failed\s*4/);
      await page.getByText('Not included: 118 in other programmes, 0 at other learning centres, 6 without active student access.').waitFor();
      await page.getByText('Students are counted under the learning centre saved in their profile').waitFor();
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-imports/system-snapshots');
      assert.deepEqual(post.body, scopeBody); assert.ok(post.headers['idempotency-key']);
      const table = page.getByRole('region', { name: 'Student data snapshots table' });
      await table.getByText('System students', { exact: true }).first().waitFor();
      assert.equal(await table.getByText('System students', { exact: true }).count(), 2); // label and source badge
      await page.screenshot({ path: shots + 'imports-system-desktop.png', fullPage: true });
      const toolbar = page.getByRole('search', { name: 'Filter and sort snapshots' });
      await toolbar.getByRole('button', { name: 'CSV', exact: true }).click();
      await page.getByRole('heading', { name: 'No snapshots match' }).waitFor();
      assert.equal(await table.count(), 0, 'the source filter hides the system snapshot');
      await toolbar.getByRole('button', { name: 'Clear filters' }).click();
      await table.getByText('System students', { exact: true }).first().waitFor();
      await toolbar.getByLabel('Search snapshots').fill('no such snapshot');
      await page.getByRole('heading', { name: 'No snapshots match' }).waitFor();
      await toolbar.getByLabel('Search snapshots').fill('system');
      await table.getByText('System students', { exact: true }).first().waitFor();
      const actions = page.getByRole('button', { name: /^Generate forecast from / }).first();
      assert.equal(await actions.innerText(), '', 'row actions are icon buttons');
      assert.ok((await actions.boundingBox()).height >= 44, 'icon buttons keep the 44px target');
      await page.getByRole('link', { name: /^View roster for / }).first().click();
      await page.getByRole('heading', { name: 'System students', level: 2 }).waitFor();
      await page.getByText('Based on student-entered records.').waitFor();
      await page.getByRole('heading', { name: 'Student roster' }).waitFor();
      await page.getByRole('link', { name: '← Back to snapshots' }).click();
      await page.getByRole('button', { name: 'Create snapshot' }).click();
      await page.getByText('have not changed since this snapshot').waitFor(); // replay (200)
      assert.equal(state.imports.length, 1);
      await page.getByRole('button', { name: 'Generate forecast' }).first().click();
      await page.getByRole('dialog', { name: 'Generate forecast' }).getByRole('button', { name: 'Generate forecast' }).click();
      await forecastReady(page);
      assert.ok(page.url().includes('snapshot=1'));
      assert.match(await page.getByLabel('Student data snapshot', { exact: true }).locator('option:checked').innerText(), /System students · System students/);
      await page.screenshot({ path: shots + 'forecast-system-desktop.png', fullPage: true });
    });

    await check('imports: an empty system snapshot explains itself and CSV upload still works as the fallback', async page => {
      const state = await mock(page, { systemEmpty: true }); await page.goto(base + '/coordinator/imports' + scoped);
      await page.getByRole('button', { name: 'Create snapshot' }).click();
      await page.getByRole('alert').filter({ hasText: 'No students in the system match this programme and learning centre' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Snapshot created' }).count(), 0);
      await page.getByRole('radio', { name: /CSV import/ }).check();
      await page.getByRole('heading', { name: 'CSV import', exact: true }).waitFor();
      await upload(page, 'VALIDFILE');
      await page.getByRole('status').filter({ hasText: 'Import accepted: 55 students from "September cohort".' }).waitFor();
      const table = page.getByRole('region', { name: 'Student data snapshots table' });
      await table.getByText('CSV upload', { exact: true }).waitFor();
      assert.equal(state.imports.length, 1);
    });

    await check('imports: correction report grouped by severity, subset accepted only after acknowledgement, with If-Match', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + csvScoped);
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
      await page.getByRole('region', { name: 'Student data snapshots table' }).getByText('Needs fixes').waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Validation report' }).count(), 0);
      const post = state.bodies.find(item => item.path.endsWith('subset-acceptances'));
      assert.equal(post.headers['if-match'], '"sha256:rev1"');
      assert.deepEqual(post.body, { programmeId: 5, learningCentreId: 1, targetSemesterId: 2, validationRevision: 'sha256:rev1', acknowledgeRejectedRows: true });
    });

    await check('imports: a coordinator export report shows the detected format and skip counts', async page => {
      await mock(page); await page.goto(base + '/coordinator/imports' + csvScoped); await page.getByLabel('Source label', { exact: true }).waitFor();
      await upload(page, 'COORDEXPORT', 'Coordinator export');
      await page.getByRole('heading', { name: 'Validation report' }).waitFor();
      const section = page.getByRole('region', { name: 'Coordinator export' }); await section.waitFor();
      const text = await section.innerText();
      for (const expected of ['Detected format: coordinator export', 'Rows read', '11204', 'Skipped: other programme', '8120', 'Skipped: other learning centre', '2450', 'Skipped: inactive students (status N)', 'Skipped: rows of inactive students', 'Skipped: in progress, not used yet', 'Older attempts dropped', 'Skipped: subject not in curriculum', 'ULRS1022 (120)', 'ULRF2XX2 (67)']) assert.ok(text.includes(expected), 'missing ' + expected);
      assert.ok(!text.includes('@'), 'no e-mail address is shown');
      await page.getByRole('region', { name: 'Warnings table' }).getByText('COORDINATOR_SUBJECTS_SKIPPED').waitFor();
      await page.screenshot({ path: shots + 'imports-coordinator-report-desktop.png', fullPage: true });
    });

    await check('imports: a rejected file shows the report with no subset option', async page => {
      await mock(page); await page.goto(base + '/coordinator/imports' + csvScoped); await page.getByLabel('Source label', { exact: true }).waitFor();
      await upload(page, 'REJECTME', 'Wrong header');
      await page.getByRole('heading', { name: 'Validation report' }).waitFor();
      await page.getByText('File rejected', { exact: true }).waitFor();
      await page.getByText('The header row does not match the template.').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Accept valid subset' }).count(), 0);
      await page.getByRole('button', { name: 'Dismiss report' }).click();
      await page.getByRole('heading', { name: 'Validation report' }).waitFor({ state: 'detached' });
      await page.getByRole('heading', { name: 'No snapshots yet' }).waitFor();
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
      await page.getByRole('link', { name: '← Back to snapshots' }).click();
      await page.getByRole('heading', { name: 'Student data snapshots' }).waitFor();
    });

    await check('generate forecast from an accepted import opens the decisions screen on that snapshot; a repeat opens the same one', async page => {
      const state = await mock(page, { seed: 'import' }); await page.goto(base + '/coordinator/imports' + scoped);
      const opener = page.getByRole('button', { name: 'Generate forecast from September cohort' }); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Generate forecast' }); await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('not student registration'));
      await dialog.getByRole('button', { name: 'Cancel' }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(state.bodies.length, 0);
      await opener.click(); await dialog.getByRole('button', { name: 'Generate forecast' }).click();
      await forecastReady(page);
      assert.ok(page.url().includes('snapshot=1'));
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-runs');
      assert.deepEqual(post.body, { programmeId: 5, learningCentreId: 1, targetSemesterId: 2, importBatchId: 1, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
      assert.ok(post.headers['idempotency-key']);
      await page.goBack(); await page.getByRole('button', { name: 'Generate forecast from September cohort' }).click();
      await page.getByRole('dialog', { name: 'Generate forecast' }).getByRole('button', { name: 'Generate forecast' }).click();
      await forecastReady(page);
      assert.equal(state.runs.size, 1, 'a repeat reuses the same forecast');
    });

    await check('forecast: the newest snapshot is pre-selected, its forecast is generated when missing, and subjects are sorted by eligible students', async page => {
      const state = await mock(page, { seed: 'import' }); await page.goto(base + forecastUrl); await forecastReady(page);
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-runs');
      assert.deepEqual(post.body, { ...scopeBody, importBatchId: 1, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
      assert.deepEqual(await subjectCodes(page), ['SCSJ1013', 'SECJ1013', 'SECD2523', 'SECJ1023']);
      const table = page.getByRole('region', { name: 'Subjects table', exact: true });
      assert.deepEqual(await table.locator('thead th').allInnerTexts(), ['Subject', 'Not taken yet', 'Eligible to take', 'Action']);
      assert.deepEqual(await table.locator('tr[data-subject="SCSJ1013"] .coordinator-number').allInnerTexts(), ['78', '71'], 'not taken yet = in curriculum minus passed; eligible to take');
      assert.deepEqual(await page.locator('tr[data-subject="SECJ1013"] th > *').evaluateAll(items => items.map(item => item.textContent.trim())), ['Programming Technique I', 'SECJ1013', 'Lab · 3 credit hours'], 'name first, then code and class type');
      assert.ok(!(await page.locator('body').innerText()).includes('Potential demand'), 'the potential demand label is gone');
      assert.ok(page.url().includes('snapshot=1'));
      assert.match(await page.getByLabel('Student data snapshot', { exact: true }).locator('option:checked').innerText(), /^September cohort · CSV upload · 2026-10-30$/);
      assert.equal(await page.getByRole('button', { name: /^Action for SECJ1013: Pending$/ }).count(), 1);
      await page.screenshot({ path: shots + 'forecast-decisions-desktop.png', fullPage: true });
    });

    await check('forecast: choosing Approved, Removed and Pending takes effect at once with a toast and an audit row, no dialog, no reason', async page => {
      const state = await mock(page, { seed: 'import' }); await page.goto(base + forecastUrl); await forecastReady(page);
      const posts = () => state.bodies.filter(item => item.path === '/api/coordinator/offering-decisions');
      const subjects = page.getByRole('region', { name: 'Subjects table', exact: true }), removed = page.getByRole('region', { name: 'Removed subjects table' });
      const auditFirst = () => page.getByRole('region', { name: 'Audit history table' }).locator('tbody tr').first();
      await pickAction(page, 'SECJ1013', 'Approved');
      await page.getByText('SECJ1013 approved.').waitFor();
      assert.deepEqual(posts().at(-1).body, { scope: scopeBody, subjectId: 101, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: 1 });
      assert.ok(posts().at(-1).headers['idempotency-key']);
      assert.equal(await page.getByRole('dialog').count(), 0, 'no dialog');
      await page.getByRole('button', { name: /^Action for SECJ1013: Approved$/ }).waitFor();
      await auditFirst().getByText('Pending → Approved').waitFor();
      assert.match(await auditFirst().innerText(), /Programming Technique I\s*SECJ1013[\s\S]*user_test[\s\S]*Snapshot #1/);
      await pickAction(page, 'SECD2523', 'Removed');
      await page.getByText('SECD2523 removed.').waitFor();
      assert.equal(await subjects.locator('tr[data-subject="SECD2523"]').count(), 0, 'a removed subject leaves the main table');
      await removed.locator('tr[data-subject="SECD2523"]').waitFor();
      await auditFirst().getByText('Pending → Removed').waitFor();
      await page.screenshot({ path: shots + 'forecast-decisions-removed-desktop.png', fullPage: true });
      await page.getByRole('button', { name: 'Add back SECD2523' }).click();
      await page.getByText('SECD2523 added back.').waitFor();
      assert.deepEqual(posts().at(-1).body, { scope: scopeBody, subjectId: 104, status: 'PENDING', expectedStatus: 'REMOVED', importBatchId: 1 });
      await subjects.locator('tr[data-subject="SECD2523"]').getByRole('button', { name: /^Action for SECD2523: Pending$/ }).waitFor();
      assert.equal(await removed.count(), 0, 'the Removed subjects table disappears when empty');
      await auditFirst().getByText('Removed → Pending').waitFor();
      await pickAction(page, 'SECJ1013', 'Pending');
      await page.getByText('SECJ1013 set back to pending.').waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0, 'no dialog');
      assert.equal(state.decisions.size, 0, 'Pending removes the stored decision');
      assert.equal(state.decisionAudit.length, 4);
    });

    await check('forecast: the status line counts pending subjects and warns during planning', async page => {
      const state = await mock(page, { seed: 'decided' }); await page.goto(base + forecastUrl); await forecastReady(page);
      assert.equal((await page.getByRole('status').filter({ hasText: /^Selection / }).innerText()).trim(), 'Selection not scheduled · 2 subjects still pending');
      await page.getByText("2 subjects still pending; they won't be shown to students unless approved.").waitFor();
      await pickAction(page, 'SCSJ1013', 'Approved');
      await page.getByText("1 subject still pending; it won't be shown to students unless approved.").waitFor();
      assert.equal((await page.getByRole('status').filter({ hasText: /^Selection / }).innerText()).trim(), 'Selection not scheduled · 1 subject still pending');
      assert.equal(state.decisions.get(103).status, 'APPROVED');
      await pickAction(page, 'SECD2523', 'Approved');
      await page.getByText('SECD2523 approved.').waitFor();
      assert.equal(await page.getByText(/still pending; (it|they) won't be shown/).count(), 0, 'no warning when nothing is pending');
      assert.equal((await page.getByRole('status').filter({ hasText: /^Selection / }).innerText()).trim(), 'Selection not scheduled · 0 subjects still pending');
    });

    await check('forecast: the status line shows when selection opens', async page => {
      await mock(page, { seed: 'decided', scheduled: true }); await page.goto(base + forecastUrl); await forecastReady(page);
      assert.match(await page.getByRole('status').filter({ hasText: /^Selection / }).innerText(), /^Selection opens .+ · 2 subjects still pending$/);
      await page.getByText("2 subjects still pending; they won't be shown to students unless approved.").waitFor();
    });
    await check('forecast: while selection is open there is no planning warning and the dropdown stays enabled', async page => {
      await mock(page, { seed: 'decided', phase: 'open' }); await page.goto(base + forecastUrl); await forecastReady(page);
      assert.match(await page.getByRole('status').filter({ hasText: /^Selection / }).innerText(), /^Selection open until .+ · 2 subjects still pending$/);
      assert.equal(await page.getByText(/still pending; (it|they) won't be shown/).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Action for / }).count(), 4);
    });
    await check('forecast: after selection closes the decisions are read-only', async page => {
      const state = await mock(page, { seed: 'decided', phase: 'closed' }); await page.goto(base + forecastUrl); await forecastReady(page);
      assert.match(await page.getByRole('status').filter({ hasText: /^Selection / }).innerText(), /^Selection closed .+ · 2 subjects still pending$/);
      assert.equal(await page.getByRole('button', { name: /^Action for / }).count(), 0, 'no dropdown');
      assert.equal(await page.getByRole('button', { name: /^Add back / }).count(), 0, 'no add back');
      assert.match(await page.locator('tr[data-subject="SECJ1013"]').innerText(), /Approved/);
      assert.equal(state.bodies.filter(item => item.method === 'POST' && item.path.includes('offering-decisions')).length, 0);
    });

    await check('forecast: while selection is open, removing an approved subject reports the affected students and the change goes live', async page => {
      const state = await mock(page, { seed: 'decided', phase: 'open' }); state.picks.set(101, pickers);
      await page.goto(base + forecastUrl); await forecastReady(page);
      assert.match(await page.getByRole('status').filter({ hasText: /^Selection / }).innerText(), /^Selection open until /);
      await pickAction(page, 'SECJ1013', 'Removed');
      await page.getByText('SECJ1013 withdrawn. 3 students who picked it will see a note.').waitFor();
      assert.equal(await page.getByText('SECJ1013 removed.').count(), 0, 'one toast: the withdrawn one');
      assert.equal(state.picks.has(101), false, 'the picks were withdrawn on the server');
      assert.equal(state.decisions.get(101).status, 'REMOVED');
      await pickAction(page, 'SCSJ1013', 'Approved'); await page.getByText('SCSJ1013 approved.').waitFor();
      await pickAction(page, 'SCSJ1013', 'Removed'); await page.getByText('SCSJ1013 withdrawn.', { exact: true }).waitFor();
      await page.screenshot({ path: shots + 'forecast-open-withdrawn-desktop.png' });
    });
    await check('forecast: removing an approved subject that one student picked says 1 student', async page => {
      const state = await mock(page, { seed: 'decided', phase: 'open' }); state.picks.set(101, pickers.slice(0, 1));
      await page.goto(base + forecastUrl); await forecastReady(page);
      await pickAction(page, 'SECJ1013', 'Pending');
      await page.getByText('SECJ1013 withdrawn. 1 student who picked it will see a note.').waitFor();
    });
    await check('forecast: after selection closes the Picked column shows counts and the pickers dialog lists names, matric numbers and emails', async page => {
      const state = await mock(page, { seed: 'decided', phase: 'closed' }); state.picks.set(101, pickers);
      await page.goto(base + forecastUrl); await forecastReady(page);
      assert.equal(await page.getByRole('button', { name: /^Action for / }).count(), 0, 'no dropdown');
      assert.equal(await page.getByRole('button', { name: /^Add back / }).count(), 0, 'no add back');
      await page.getByRole('columnheader', { name: /^Picked/ }).waitFor();
      assert.equal((await page.locator('tr[data-subject="SECJ1013"] td').nth(3).innerText()).replace(/\s+/g, ' ').trim().startsWith('3'), true, 'approved subject shows its count');
      assert.equal((await page.locator('tr[data-subject="SCSJ1013"] td').nth(3).innerText()).trim(), '—', 'a pending subject shows a dash');
      await page.screenshot({ path: shots + 'forecast-closed-picked-desktop.png' });
      const pickerRequests = () => state.requests.filter(item => /offering-decisions\/101\/pickers/.test(JSON.stringify(item))).length;
      await page.getByRole('button', { name: 'View pickers for SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Picked · SECJ1013' }); await dialog.waitFor();
      await dialog.getByRole('region', { name: 'Pickers table' }).waitFor();
      const rows = dialog.locator('tbody tr');
      assert.equal(await rows.count(), 3);
      assert.match(await rows.nth(0).innerText(), /Aisyah binti Ahmad\s+A22EC0051/);
      assert.match(await rows.nth(1).innerText(), /Bakri bin Hassan\s+student052@graduate\.utm\.my/);
      assert.equal(await dialog.getByRole('columnheader').count(), 1, 'only the Student column');
      await dialog.getByLabel('Search pickers').fill('chong'); assert.equal(await rows.count(), 1);
      await dialog.getByLabel('Search pickers').fill('nobody'); await dialog.getByText('No students match this search.').waitFor();
      await dialog.locator('.tt-clear').click(); assert.equal(await rows.count(), 3);
      await page.screenshot({ path: shots + 'forecast-pickers-dialog-desktop.png' });
      assert.equal(pickerRequests(), 1);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'View pickers for SECJ1013' }).click();
      await page.getByRole('dialog', { name: 'Picked · SECJ1013' }).getByRole('region', { name: 'Pickers table' }).waitFor();
      assert.equal(pickerRequests(), 1, 'reopening uses the page cache');
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Refresh' }).click(); await forecastReady(page);
      await page.getByRole('button', { name: 'View pickers for SECJ1013' }).click();
      await page.getByRole('dialog', { name: 'Picked · SECJ1013' }).getByRole('region', { name: 'Pickers table' }).waitFor();
      assert.equal(pickerRequests(), 2, 'Refresh drops the cache');
      assert.equal(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]).includes('A22EC0051')), false, 'no personal data in browser storage');
    });
    await check('forecast: the pickers dialog says so when nobody picked the subject, and Escape closes it', async page => {
      await mock(page, { seed: 'decided', phase: 'closed' });
      await page.goto(base + forecastUrl); await forecastReady(page);
      await page.getByRole('button', { name: 'View pickers for SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Picked · SECJ1013' });
      await dialog.getByText('No student picked this subject.').waitFor();
      await page.screenshot({ path: shots + 'forecast-pickers-empty-desktop.png' });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    });

    await check('forecast: decisions carry over when another snapshot is chosen and a decided subject missing from it is marked', async page => {
      const state = await mock(page, { seed: 'decided', secondImport: true }); await page.goto(base + forecastUrl); await forecastReady(page);
      assert.equal(await page.getByLabel('Student data snapshot', { exact: true }).inputValue(), '2', 'the newest snapshot is chosen first');
      await page.waitForURL(/snapshot=2/);
      await page.getByLabel('Student data snapshot', { exact: true }).selectOption('1');
      await page.waitForURL(/snapshot=1/); await forecastReady(page);
      assert.equal(state.runs.size, 2, 'the forecast of the other snapshot is created when chosen');
      await page.locator('tr[data-subject="SECJ1013"]').getByRole('button', { name: /^Action for SECJ1013: Approved$/ }).waitFor();
      const missing = page.locator('tr[data-subject="SECJ2203"]');
      assert.ok((await missing.innerText()).includes('not in this snapshot'));
      assert.deepEqual(await missing.locator('.coordinator-number').allInnerTexts(), ['—', '—']);
      assert.equal(await missing.getByRole('button', { name: /View students/ }).count(), 0, 'no student list without a snapshot count');
      await page.getByRole('region', { name: 'Removed subjects table' }).locator('tr[data-subject="SECJ1023"]').waitFor();
      await page.screenshot({ path: shots + 'forecast-decisions-carry-over-desktop.png', fullPage: true });
    });

    await check('forecast: tabs, class type, uncertain filter, sort and search use the shared toolbar', async page => {
      await mock(page, { seed: 'decided' }); await page.goto(base + forecastUrl); await forecastReady(page);
      const bar = page.getByRole('search', { name: 'Filter and sort subjects' }), menu = index => bar.locator('button[aria-haspopup="menu"]').nth(index);
      const choose = async (index, group, option) => { await menu(index).click(); await page.getByRole('group', { name: group, exact: true }).getByRole('menuitemradio', { name: option, exact: true }).click(); };
      const tab = name => bar.getByRole('group', { name: 'Status' }).getByRole('button', { name, exact: true });
      assert.deepEqual(await tab('All').evaluate(item => [...item.parentElement.querySelectorAll('button')].map(button => button.textContent)), ['All', 'Pending', 'Approved']);
      assert.equal(await tab('All').getAttribute('aria-pressed'), 'true');
      assert.equal(await menu(1).innerText(), 'Sort: Eligible to take', 'eligible students is the default sort');
      assert.equal(await bar.getByRole('button', { name: 'Clear filters' }).count(), 0);
      assert.deepEqual(await subjectCodes(page), ['SCSJ1013', 'SECJ1013', 'SECD2523', 'SECJ2203'], 'subjects outside the snapshot come last');
      await tab('Pending').click(); assert.deepEqual(await subjectCodes(page), ['SCSJ1013', 'SECD2523']);
      await tab('Approved').click(); assert.deepEqual(await subjectCodes(page), ['SECJ1013', 'SECJ2203']);
      await tab('All').click();
      await menu(0).click(); await page.getByRole('menu', { name: 'Filter' }).waitFor();
      await page.screenshot({ path: shots + 'forecast-decisions-menu-open-desktop.png' });
      await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({ state: 'detached' });
      await choose(0, 'Class type', 'Lab'); assert.deepEqual(await subjectCodes(page), ['SECJ1013']);
      await choose(0, 'Class type', 'Not set'); assert.deepEqual(await subjectCodes(page), ['SECD2523']);
      await choose(0, 'Class type', 'All'); await choose(0, 'Flags', 'Has uncertain students'); assert.deepEqual(await subjectCodes(page), ['SCSJ1013', 'SECJ1013']);
      await choose(0, 'Flags', 'All');
      await choose(1, 'Sort by', 'Subject name'); assert.deepEqual(await subjectCodes(page), ['SECD2523', 'SCSJ1013', 'SECJ1013', 'SECJ2203']);
      await choose(1, 'Sort by', 'Subject code'); assert.deepEqual(await subjectCodes(page), ['SCSJ1013', 'SECD2523', 'SECJ1013', 'SECJ2203']);
      await bar.getByLabel('Search subjects').fill('SECD'); assert.deepEqual(await subjectCodes(page), ['SECD2523']);
      await bar.getByLabel('Search subjects').fill('zzz-no-match');
      await page.getByText('No subjects match these filters.').waitFor();
      await page.getByRole('status').getByRole('button', { name: 'Clear filters' }).click();
      assert.equal((await subjectCodes(page)).length, 4, 'clearing the filters restores every subject');
      assert.equal(await menu(1).innerText(), 'Sort: Subject code', 'clearing keeps the chosen sort');
    });

    await check('forecast: 409 DECISION_STALE reloads the decisions and says so', async page => {
      const state = await mock(page, { seed: 'import' }); await page.goto(base + forecastUrl); await forecastReady(page);
      const reads = () => state.requests.filter(request => request.method === 'GET' && request.path === '/api/coordinator/offering-decisions').length, before = reads();
      state.staleDecision = true;
      await pickAction(page, 'SECJ1013', 'Approved');
      await page.getByText('This subject was changed by someone else; reloaded.').waitFor();
      await page.getByRole('region', { name: 'Removed subjects table' }).locator('tr[data-subject="SECJ1013"]').waitFor();
      assert.equal(reads(), before + 1, 'the decisions were read again');
      assert.equal(state.decisions.get(101).status, 'REMOVED', 'the other session\'s decision is what is shown');
    });

    await check('forecast: a failed save shows an error toast and keeps the screen', async page => {
      const state = await mock(page, { seed: 'import' }); await page.goto(base + forecastUrl); await forecastReady(page);
      state.failNext = { status: 503, code: 'FORECASTING_UNAVAILABLE', message: 'Forecasting data is unavailable. Please retry.' };
      await pickAction(page, 'SECJ1013', 'Approved');
      await page.getByText('Forecasting data is unavailable. Please retry.').waitFor();
      await page.getByRole('button', { name: /^Action for SECJ1013: Pending$/ }).waitFor();
      assert.equal(state.decisions.size, 0);
    });

    await check('forecast: without a snapshot the screen asks for a data import first', async page => {
      const state = await mock(page, { seed: 'empty' }); await page.goto(base + forecastUrl);
      await page.getByRole('heading', { name: 'No student data snapshots yet' }).waitFor();
      await page.getByRole('link', { name: 'Go to Data Imports' }).waitFor();
      assert.equal(state.bodies.length, 0, 'no forecast is generated without a snapshot');
    });

    await check('forecast: info icons show a popover on hover and focus, inside the viewport, and Escape closes it', async page => {
      await mock(page, { seed: 'run' });
      await page.goto(base + forecastUrl); await forecastReady(page);
      const subjects = page.getByRole('region', { name: 'Subjects table', exact: true });
      const icon = subjects.getByRole('button', { name: 'About Eligible to take' });
      const tip = page.getByRole('tooltip').filter({ hasText: 'This is the number you decide on' });
      assert.equal(await tip.isVisible(), false, 'hidden until hover');
      await icon.hover(); await tip.waitFor();
      assert.ok((await tip.innerText()).startsWith('Eligible to take'), 'popover has a title');
      assert.equal(await icon.getAttribute('aria-describedby'), await tip.getAttribute('id'));
      const box = await tip.boundingBox(), viewport = page.viewportSize();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width, 'popover stays in the viewport');
      await page.screenshot({ path: shots + 'forecast-info-tip-desktop.png' });
      await page.mouse.move(0, 0); await tip.waitFor({ state: 'hidden' });
      await subjects.getByRole('button', { name: 'About Not taken yet' }).focus();
      const demand = page.getByRole('tooltip').filter({ hasText: 'not passed it or been exempted' }); await demand.waitFor();
      await page.keyboard.press('Escape'); await demand.waitFor({ state: 'hidden' });
      await assertReadable(page, 'info tip');
      await page.locator('tr[data-subject="SECJ1013"]').getByRole('button', { name: 'View students for SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Students · SECJ1013' }); await dialog.getByLabel('Student counts').waitFor();
      await dialog.getByRole('button', { name: 'About Student' }).hover();
      await page.getByRole('tooltip').filter({ hasText: 'PORTAL-' }).waitFor();
      await page.screenshot({ path: shots + 'forecast-students-info-tip-desktop.png' });
      await dialog.getByRole('button', { name: 'About Near graduation' }).focus();
      await page.keyboard.press('Escape');
      assert.ok(await dialog.isVisible(), 'the first Escape closes only the popover, not the dialog');
    });

    await check('forecast: View students opens a read-only dialog with filters, search and the saved counts', async page => {
      const state = await mock(page, { seed: 'run' });
      await page.goto(base + forecastUrl); await forecastReady(page);
      const lab = page.locator('tr[data-subject="SECJ1013"]'), button = lab.getByRole('button', { name: 'View students for SECJ1013' });
      await button.click();
      const dialog = page.getByRole('dialog', { name: 'Students · SECJ1013' }); await dialog.waitFor();
      await dialog.getByLabel('Student counts').waitFor();
      assert.deepEqual(await dialog.getByLabel('Student counts').locator('dd').allInnerTexts(), ['46', '3', '4', '5'], 'counted, uncertain, near graduation, not counted');
      await dialog.getByText('Academic history incomplete: 2').waitFor(); await dialog.getByText('Prerequisite not proven: 1').waitFor();
      assert.equal(await dialog.getByText(/recomputed with the current curriculum/).count(), 0, 'no catalogue note when the catalogue is unchanged');
      assert.equal(await dialog.locator('textarea, input[type="checkbox"]').count(), 0, 'read only: no reason form');
      assert.deepEqual(await dialog.getByRole('region', { name: 'Students table' }).locator('thead th').allInnerTexts(), ['Student', 'Status', 'Details']);
      const rows = dialog.getByRole('region', { name: 'Students table' }).locator('tbody tr');
      assert.equal(await rows.count(), 20, 'the list is paged at 20 rows');
      await dialog.getByText('54 students · Page 1 of 3').waitFor();
      const first = dialog.locator('tr[data-student="A22EC001"]');
      assert.deepEqual(await first.locator('th').evaluate(cell => [...cell.children].map(child => child.textContent.trim())), ['SECJ1013 Student 001', 'A22EC001']);
      assert.equal((await first.locator('.admin-pill').innerText()).trim(), 'Counted');
      await dialog.getByLabel('Search students').fill('a22ec9051');
      assert.deepEqual(await rows.locator('th').evaluateAll(cells => cells.map(cell => [...cell.children].map(child => child.textContent.trim()))), [['SECJ1013 Student 051', 'A22EC9051']], 'portal students show their profile matric number, searchable');
      await dialog.getByLabel('Search students').fill('student052@');
      assert.deepEqual(await rows.locator('th').evaluateAll(cells => cells.map(cell => [...cell.children].map(child => child.textContent.trim()))), [['SECJ1013 Student 052', 'student052@graduate.utm.my']], 'no matric number yet: the sign-in email, searchable');
      await dialog.getByLabel('Search students').fill('Student 054');
      assert.equal((await rows.first().locator('.coordinator-subject-code').innerText()).trim(), 'PORTAL-54', 'no known email: the portal reference stays');
      await dialog.getByLabel('Search students').fill('');
      assert.ok((await first.innerText()).includes('Near graduation · 12 credits left'));
      await dialog.getByRole('button', { name: 'Next' }).click(); await dialog.getByText(/Page 2 of 3/).waitFor();
      await dialog.getByRole('button', { name: 'Previous' }).click();
      const filters = dialog.getByRole('group', { name: 'Show' });
      assert.deepEqual(await filters.getByRole('button').allInnerTexts(), ['All', 'Counted', 'Uncertain', 'Near graduation', 'Not counted']);
      await filters.getByRole('button', { name: 'Uncertain' }).click();
      assert.equal(await rows.count(), 3);
      assert.ok((await rows.first().innerText()).includes('Academic history incomplete'));
      await filters.getByRole('button', { name: 'Near graduation' }).click(); assert.equal(await rows.count(), 4);
      await filters.getByRole('button', { name: 'Not counted' }).click(); assert.equal(await rows.count(), 5);
      const texts = (await rows.allInnerTexts()).join('|');
      for (const label of ['Already passed', 'Prerequisite not met', 'Not offered this semester', 'Passed after a repeat attempt']) assert.ok(texts.includes(label), label);
      await filters.getByRole('button', { name: 'All', exact: true }).click();
      const search = dialog.getByLabel('Search students');
      await search.fill('a22ec010'); assert.equal(await rows.count(), 1);
      await search.fill('SECJ1013 student 002'); assert.equal(await rows.count(), 1);
      await search.fill('nobody'); await dialog.getByText('No students match these filters.').waitFor();
      await dialog.getByRole('status').getByRole('button', { name: 'Clear filters' }).click(); assert.equal(await rows.count(), 20);
      await page.screenshot({ path: shots + 'forecast-students-dialog-desktop.png' });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await button.evaluate(element => element === document.activeElement), true, 'Escape returns focus to the View students button');
      await button.click(); await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Close' }).click(); await dialog.waitFor({ state: 'detached' });
      assert.equal(await button.evaluate(element => element === document.activeElement), true, 'Close returns focus to the button');
      assert.equal(state.runs.get(1).subjects.find(item => item.subjectCode === 'SECJ1013').supportedEligibleCount, 46, 'viewing students changes nothing');
    });

    await check('forecast: the students dialog shows an error with retry, the recomputed-catalogue note and an empty reasons list', async page => {
      const state = await mock(page, { seed: 'run', catalogueChanged: true });
      await page.goto(base + forecastUrl); await forecastReady(page);
      state.failNext = { status: 503, code: 'FORECASTING_UNAVAILABLE', message: 'Forecasting data is unavailable. Please retry.' };
      await page.getByRole('button', { name: 'View students for SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Students · SECJ1013' }); await dialog.waitFor();
      await dialog.getByRole('alert').getByText('Forecasting data is unavailable. Please retry.').waitFor();
      await dialog.getByRole('button', { name: 'Retry' }).click();
      await dialog.getByText(/recomputed with the current curriculum/).waitFor();
      assert.equal(await dialog.getByText(/Sign-in emails could not be loaded/).count(), 0);
      await dialog.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: 'View students for SECJ1023' }).click();
      const second = page.getByRole('dialog', { name: 'Students · SECJ1023' }); await second.waitFor();
      await second.getByLabel('Student counts').waitFor();
      assert.deepEqual(await second.getByLabel('Student counts').locator('dd').allInnerTexts(), ['14', '0', '0', '5']);
      assert.equal(await second.getByLabel('Why students are uncertain').count(), 0);
      await second.getByRole('button', { name: 'Close' }).click();
      const listCalls = () => state.requests.filter(r => /\/subjects\/\d+\/students$/.test(r.path)).length, before = listCalls();
      await page.getByRole('button', { name: 'View students for SECJ1013' }).click();
      await page.getByRole('dialog', { name: 'Students · SECJ1013' }).getByLabel('Student counts').waitFor();
      assert.equal(listCalls(), before, 'reopening a subject uses the page cache, no new request');
      await page.getByRole('dialog', { name: 'Students · SECJ1013' }).getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: 'Refresh' }).click(); await page.getByRole('button', { name: 'View students for SECJ1013' }).waitFor();
      await page.getByRole('button', { name: 'View students for SECJ1013' }).click();
      await page.getByRole('dialog', { name: 'Students · SECJ1013' }).getByLabel('Student counts').waitFor();
      assert.equal(listCalls(), before + 1, 'Refresh clears the cache');
    });

    await check('forecast: students show their portal reference when sign-in emails cannot be loaded', async page => {
      const state = await mock(page, { seed: 'run' }); state.emailsUnavailable = true;
      await page.goto(base + forecastUrl); await forecastReady(page);
      await page.getByRole('button', { name: 'View students for SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Students · SECJ1013' }); await dialog.getByLabel('Student counts').waitFor();
      await dialog.getByText('Sign-in emails could not be loaded, so portal students without a matric number show their portal reference.').waitFor();
      await dialog.getByLabel('Search students').fill('Student 052');
      assert.equal((await dialog.locator('tbody tr').first().locator('.coordinator-subject-code').innerText()).trim(), 'PORTAL-52');
      await dialog.getByLabel('Search students').fill('Student 051');
      assert.equal((await dialog.locator('tbody tr').first().locator('.coordinator-subject-code').innerText()).trim(), 'A22EC9051', 'matric numbers come from the database, not the identity provider');
    });

    for (const width of [320, 375]) await check('mobile: the students dialog fits without page overflow at ' + width, async page => {
      await mock(page, { seed: 'run' }); await page.setViewportSize({ width, height: 800 });
      await page.goto(base + forecastUrl); await forecastReady(page);
      await page.getByRole('button', { name: 'View students for SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Students · SECJ1013' }); await dialog.waitFor();
      assert.ok(await noOverflow(page), 'page does not overflow with the dialog open');
      const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 800, 'dialog inside the viewport');
      const bar = dialog.getByRole('search', { name: 'Filter students' }); const barBox = await bar.boundingBox(); assert.ok(barBox.x >= 0 && barBox.x + barBox.width <= width);
      await dialog.getByLabel('Search students').fill('A22EC01'); assert.ok(await noOverflow(page));
      assert.ok(await dialog.getByRole('button', { name: 'Close' }).isVisible());
      if (width === 375) await page.screenshot({ path: shots + 'forecast-students-dialog-mobile.png' });
      await dialog.getByRole('button', { name: 'Close' }).focus(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    });

    for (const width of [320, 375]) await check('mobile: the pickers dialog fits without page overflow at ' + width, async page => {
      const state = await mock(page, { seed: 'decided', phase: 'closed' }); state.picks.set(101, pickers); await page.setViewportSize({ width, height: 800 });
      await page.goto(base + forecastUrl); await forecastReady(page);
      assert.ok(await noOverflow(page), 'the Picked column does not overflow the page');
      if (width === 375) await page.screenshot({ path: shots + 'forecast-closed-picked-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'View pickers for SECJ1013' }).click();
      const dialog = page.getByRole('dialog', { name: 'Picked · SECJ1013' }); await dialog.waitFor();
      await dialog.getByRole('region', { name: 'Pickers table' }).waitFor();
      assert.ok(await noOverflow(page), 'page does not overflow with the dialog open');
      const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 800, 'dialog inside the viewport');
      const bar = dialog.getByRole('search', { name: 'Filter pickers' }); const barBox = await bar.boundingBox(); assert.ok(barBox.x >= 0 && barBox.x + barBox.width <= width);
      await dialog.getByLabel('Search pickers').fill('A22'); assert.ok(await noOverflow(page));
      assert.ok(await dialog.getByRole('button', { name: 'Close' }).isVisible());
      if (width === 375) await page.screenshot({ path: shots + 'forecast-pickers-dialog-mobile.png' });
      await dialog.getByRole('button', { name: 'Close' }).focus(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    });

    for (const width of [320, 375]) await check('mobile: the subjects filter toolbar wraps without horizontal overflow at ' + width, async page => {
      await mock(page, { seed: 'run', manySubjects: true }); await page.setViewportSize({ width, height: 800 });
      await page.goto(base + forecastUrl); await forecastReady(page);
      const bar = page.getByRole('search', { name: 'Filter and sort subjects' }); await bar.waitFor();
      await bar.getByLabel('Search subjects').fill('FILL'); assert.ok(await noOverflow(page));
      await bar.locator('button[aria-haspopup="menu"]').nth(0).click(); await page.getByRole('menu', { name: 'Filter' }).waitFor(); assert.ok(await noOverflow(page), 'open filter menu does not overflow at ' + width);
      const menuBox = await page.getByRole('menu', { name: 'Filter' }).boundingBox(); assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width, 'menu inside viewport');
      await page.screenshot({ path: shots + 'forecast-subjects-menu-open-mobile-' + width + '.png' });
      const box = await bar.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      if (width === 320) await page.screenshot({ path: shots + 'forecast-subjects-filters-mobile-320.png', fullPage: true });
    });

    await check('imports: the data source toggle is a keyboard-accessible radio group and each mode shows only its own card', async page => {
      await mock(page, { seed: 'system' }); await page.goto(base + '/coordinator/imports' + scoped);
      const group = page.getByRole('group', { name: 'Data source' }); await group.waitFor();
      const radios = group.getByRole('radio');
      assert.deepEqual(await radios.evaluateAll(items => items.map(item => item.closest('label').innerText.split('\n')[0])), ['Students in the system', 'CSV import', 'Both']);
      assert.equal(await group.getByRole('radio', { name: /Students in the system/ }).isChecked(), true, 'default is Students in the system');
      const cards = { system: 'Students in the system', csv: 'CSV import', both: 'Students in the system + CSV import' };
      const shown = async () => { const out = []; for (const [key, name] of Object.entries(cards)) if (await page.getByRole('heading', { name, exact: true, level: 3 }).count()) out.push(key); return out; };
      assert.deepEqual(await shown(), ['system']);
      assert.equal(await page.getByRole('region', { name: 'Student data snapshots table' }).count(), 1, 'the accepted imports list is shown in every mode');
      // Keyboard: focus the checked radio and arrow to the next option (native radio group behaviour).
      await group.getByRole('radio', { name: /Students in the system/ }).focus();
      await page.keyboard.press('ArrowRight');
      await page.getByRole('heading', { name: 'CSV import', exact: true }).waitFor();
      assert.deepEqual(await shown(), ['csv']); assert.ok(page.url().includes('source=csv'));
      assert.equal(await group.getByRole('radio', { name: /CSV import/ }).evaluate(element => element === document.activeElement), true, 'focus stays on the radio');
      await page.keyboard.press('ArrowRight');
      await page.getByRole('heading', { name: 'Students in the system + CSV import' }).waitFor();
      assert.deepEqual(await shown(), ['both']); assert.ok(page.url().includes('source=both'));
      assert.equal(await page.getByRole('region', { name: 'Student data snapshots table' }).count(), 1);
      // Remembered in the URL: a reload keeps the choice; the scope picker keeps it too.
      await page.reload(); await page.getByRole('heading', { name: 'Students in the system + CSV import' }).waitFor();
      assert.equal(await group.getByRole('radio', { name: /Both/ }).isChecked(), true);
      await page.getByLabel('Learning centre', { exact: true }).selectOption('2');
      await page.getByRole('heading', { name: 'Students in the system + CSV import' }).waitFor(); assert.ok(page.url().includes('source=both'));
      await page.getByLabel('Learning centre', { exact: true }).selectOption('1');
      await page.getByRole('radio', { name: /Students in the system/ }).check();
      assert.deepEqual(await shown(), ['system']); assert.ok(!page.url().includes('source='), 'the default is not written to the URL');
      await page.screenshot({ path: shots + 'imports-toggle-desktop.png', fullPage: true });
    });

    await check('imports: Both builds one combined snapshot with coverage, a source per student, and feeds the forecast', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + bothScoped);
      await page.getByRole('heading', { name: 'Students in the system + CSV import' }).waitFor();
      await page.getByText('Combines system students with non-duplicate CSV records.', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Create combined snapshot' }).click();
      await page.getByText('Enter a short label for this data source.').waitFor();
      assert.equal(state.bodies.length, 0);
      await uploadBoth(page, 'VALIDFILE');
      await page.getByRole('heading', { name: 'Snapshot created' }).waitFor();
      const post = state.bodies.find(item => item.path === '/api/coordinator/forecast-imports/combined-snapshots');
      assert.ok(post.headers['idempotency-key']); assert.ok(post.headers['content-type'].startsWith('multipart/form-data'));
      assert.equal(state.bodies.filter(item => item.path === '/api/coordinator/forecast-imports').length, 0, 'the CSV endpoint is not used');
      const system = page.getByLabel('Snapshot coverage'); assert.match(await system.innerText(), /Students found\s*52/);
      const combined = page.getByLabel('Combined coverage counts'), text = await combined.innerText();
      assert.match(text, /Students in the snapshot\s*59/); assert.match(text, /CSV skipped, already in system\s*2/); assert.match(text, /Possible duplicates\s*1/);
      await page.getByText('A100234, A100777').waitFor();
      await page.getByText('EXT-0042 ~ PORTAL-17').waitFor();
      const table = page.getByRole('region', { name: 'Student data snapshots table' });
      await table.getByText('Combined', { exact: true }).waitFor();
      await page.screenshot({ path: shots + 'imports-combined-desktop.png', fullPage: true });
      await page.getByRole('link', { name: /^View roster for / }).first().click();
      await page.getByRole('heading', { name: 'Combined export', level: 2 }).waitFor();
      await page.getByText('Combined: student-entered records + CSV import.').first().waitFor();
      await page.getByRole('heading', { name: 'Combined coverage' }).waitFor();
      const roster = page.getByRole('region', { name: 'Student roster table' });
      assert.deepEqual(await roster.locator('thead th').allInnerTexts(), ['Name', 'Reference', 'Curriculum', 'Cohort status', 'History', 'Source']);
      assert.ok(await roster.locator('tbody tr').first().innerText().then(value => value.includes('System students')));
      await page.getByRole('link', { name: '← Back to snapshots' }).click();
      await page.getByRole('heading', { name: 'Students in the system + CSV import' }).waitFor();
      await uploadBoth(page, 'VALIDFILE', 'Again');
      await page.getByText('have not changed since this snapshot').waitFor(); // replay (200)
      assert.equal(state.imports.length, 1);
      await page.getByRole('button', { name: 'Generate forecast' }).first().click();
      await page.getByRole('dialog', { name: 'Generate forecast' }).getByRole('button', { name: 'Generate forecast' }).click();
      await forecastReady(page);
      assert.match(await page.getByLabel('Student data snapshot', { exact: true }).locator('option:checked').innerText(), /· Combined ·/);
      await page.screenshot({ path: shots + 'forecast-combined-desktop.png', fullPage: true });
    });

    await check('imports: Both with rows to correct shows the report with combined coverage and accepts the valid subset with If-Match', async page => {
      const state = await mock(page); await page.goto(base + '/coordinator/imports' + bothScoped);
      await page.getByLabel('Source label', { exact: true }).waitFor();
      await uploadBoth(page, 'BADROWS', 'Needs fixes');
      await page.getByRole('heading', { name: 'Validation report' }).waitFor();
      assert.match(await page.getByLabel('Combined coverage counts').innerText(), /Rejected CSV rows\s*2/);
      await page.getByRole('button', { name: 'Accept valid subset' }).click();
      const dialog = page.getByRole('dialog', { name: 'Accept the valid subset' }); await dialog.waitFor();
      await dialog.getByText('stored as one frozen snapshot').waitFor();
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Accept valid subset' }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('status').filter({ hasText: 'combined snapshot "Needs fixes"' }).waitFor();
      await page.getByRole('heading', { name: 'Snapshot created' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Validation report' }).count(), 0);
      assert.equal(state.bodies.find(item => item.path.endsWith('subset-acceptances')).headers['if-match'], '"sha256:rev1"');
      assert.equal(state.imports[0].source, 'COMBINED');
      // A rejected file is reported without a subset action.
      await page.getByRole('button', { name: 'Dismiss' }).click();
      await uploadBoth(page, 'REJECTME', 'Bad file');
      await page.getByText('File rejected').first().waitFor();
      assert.equal(await page.getByRole('button', { name: 'Accept valid subset' }).count(), 0);
    });

    for (const width of [320, 375]) await check('mobile: the toggle and the combined flow have no horizontal overflow at ' + width, async page => {
      await mock(page, { seed: 'system' }); await page.setViewportSize({ width, height: 800 });
      await page.goto(base + '/coordinator/imports' + bothScoped); await page.getByRole('heading', { name: 'Students in the system + CSV import' }).waitFor();
      assert.ok(await noOverflow(page));
      const group = page.getByRole('group', { name: 'Data source' });
      for (const radio of await group.getByRole('radio').all()) { const box = await radio.locator('xpath=..').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.height >= 44); }
      await uploadBoth(page, 'VALIDFILE'); await page.getByRole('heading', { name: 'Snapshot created' }).waitFor();
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'imports-combined-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Dismiss' }).click();
      await uploadBoth(page, 'BADROWS', 'Needs fixes'); await page.getByRole('heading', { name: 'Validation report' }).waitFor();
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'imports-combined-report-mobile.png', fullPage: true });
    });

    await check('a service error shows a retryable alert', async page => {
      const state = await mock(page, { seed: 'run' }); state.failNext = { status: 503, code: 'FORECASTING_UNAVAILABLE', message: 'Forecasting data is unavailable. Please retry.' };
      await page.goto(base + '/coordinator/forecasts' + scoped);
      await page.getByRole('alert').filter({ hasText: 'Forecasting data is unavailable. Please retry.' }).waitFor();
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await forecastReady(page);
    });

    for (const width of [320, 375]) await check('mobile: imports and the forecast decisions screen have no horizontal overflow at ' + width, async page => {
      await mock(page, { seed: 'run' }); await page.setViewportSize({ width, height: 800 });
      await page.goto(base + '/coordinator/imports' + scoped); await page.getByRole('heading', { name: 'Students in the system', exact: true }).waitFor();
      assert.ok(await noOverflow(page));
      if (width === 320) await page.screenshot({ path: shots + 'imports-toggle-mobile-320.png', fullPage: true });
      await page.getByRole('button', { name: 'Create snapshot' }).click(); await page.getByRole('heading', { name: 'Snapshot created' }).waitFor();
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'imports-system-mobile.png', fullPage: true });
      await page.goto(base + '/coordinator/imports' + csvScoped); await page.getByRole('heading', { name: 'CSV import', exact: true }).waitFor();
      await upload(page, 'BADROWS', 'Needs fixes'); await page.getByRole('heading', { name: 'Validation report' }).waitFor();
      assert.ok(await noOverflow(page));
      if (width === 375) await page.screenshot({ path: shots + 'imports-report-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Accept valid subset' }).click();
      const subset = page.getByRole('dialog', { name: 'Accept the valid subset' }); await subset.waitFor();
      const box = await subset.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 800);
      assert.ok(await noOverflow(page));
      await page.keyboard.press('Escape');
      await page.goto(base + forecastUrl); await forecastReady(page);
      assert.ok(await noOverflow(page));
      const table = page.getByRole('region', { name: 'Subjects table', exact: true });
      assert.ok(await table.evaluate(element => element.scrollWidth >= element.clientWidth)); // local horizontal scrolling only
      if (width === 375) await page.screenshot({ path: shots + 'forecast-mobile.png', fullPage: true });
      await page.getByRole('button', { name: /^Action for SECJ1013: / }).click();
      const menu = page.getByRole('menu', { name: 'Action for SECJ1013' }); await menu.waitFor();
      const menuBox = await menu.boundingBox(); assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width, 'action menu inside the viewport');
      assert.ok(await noOverflow(page));
      await page.keyboard.press('Escape');
    }, width);

    const noAssignmentText = 'You are not assigned to any programme and learning centre yet. Ask a system administrator to assign you in Coordinator Assignments.';
    const noSemesterText = 'No current semester is set. Ask a system administrator to set it in Academic Semesters.';
    for (const [path, heading, shot] of [['/coordinator/imports', 'Data Imports', 'imports'], ['/coordinator/forecasts', 'Class Offering Forecast', 'forecasts']]) {
      await check(`${shot}: a coordinator without assignments sees the empty state and no actions`, async page => {
        const state = await mock(page, { noAssignments: true }); await page.goto(base + path);
        await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
        await page.getByRole('status').filter({ hasText: noAssignmentText }).waitFor();
        assert.deepEqual(await page.getByLabel('Programme', { exact: true }).locator('option').allInnerTexts(), ['Select a programme']);
        assert.equal(await page.getByLabel('Learning centre', { exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: /Upload and validate|Create combined snapshot|Generate forecast/ }).count(), 0);
        assert.ok(!state.requests.some(request => request.path.startsWith('/api/coordinator/forecast-imports') || request.path.includes('forecast-runs') || request.path.includes('offering-decisions')), 'no scoped request without a scope');
        assert.equal(await page.getByText('Choose a scope', { exact: true }).count(), 0, 'no misleading scope prompt');
        assert.equal(await page.getByText(/Select a programme and a learning centre to/).count(), 0);
        await page.screenshot({ path: shots + `${shot}-no-assignments-desktop.png`, fullPage: true });
      });
      await check(`${shot}: no current semester shows the administrator hint and does not crash`, async page => {
        await mock(page, { noCurrentSemester: true }); await page.goto(base + path + scoped);
        await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
        await page.getByRole('status').filter({ hasText: noSemesterText }).waitFor();
        assert.equal(await page.getByRole('status').filter({ hasText: noAssignmentText }).count(), 0);
        assert.equal(await page.locator('output.coordinator-readonly-value').innerText(), 'Not configured');
        await page.screenshot({ path: shots + `${shot}-no-current-semester-desktop.png`, fullPage: true });
      });
    }

    await check('the removed review, versions, comparison and offering decisions pages no longer exist', async page => {
      await mock(page, { seed: 'run' });
      for (const path of ['/coordinator/decisions', '/coordinator/versions', '/coordinator/comparison']) {
        await page.goto(base + path + scoped);
        await page.getByRole('heading', { name: 'Page not found' }).first().waitFor();
      }
      const links = await page.getByRole('navigation', { name: 'Coordinator navigation' }).first().getByRole('link').allInnerTexts();
      assert.deepEqual(links.map(text => text.trim()), ['Overview', 'Data Imports', 'Data Quality', 'Class Offering Forecast', 'Decision Audit']);
    });

    console.log('PASS ' + passed + ' coordinator browser checks');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
