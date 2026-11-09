// LOCAL FICTIONAL PREVIEW + real-route UI checks. No credentials, external requests or DB writes.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { assertReadable } from '../ui/readability.mjs';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const demoBundle = await build({ stdin: { contents: "export { demoData } from './tools/p002/demo-data.ts';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { demoData } = await import('data:text/javascript;base64,' + Buffer.from(demoBundle.outputFiles[0].text).toString('base64'));
const demo = demoData();
const conditionalDemo = demoData({ conditionalPair: true });
const closedDemo = demoData({ deadline: '2000-01-01T00:00:00.000Z' });
const selectionRouteBundle = await build({ stdin: { contents: "export { handleSemesterSelectionRequest } from './apps/api/src/modules/student-eligibility/selection-routes.ts';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { handleSemesterSelectionRequest } = await import('data:text/javascript;base64,' + Buffer.from(selectionRouteBundle.outputFiles[0].text).toString('base64'));
assert.equal(demo.initial.studentsInCohort, 50);
assert.deepEqual(demo.initial.qualifiedSubjectIds, demo.expected.qualifiedIds);
for (const [id, expected] of [[2, 30], [3, 29], [4, 31]]) assert.equal(demo.initial.subjects.find(row => row.subjectId === id).eligibleDistinctCount, expected);
const output = await build({ entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false, outdir: '.wrangler/p002-review', jsx: 'automatic', loader: { '.png': 'dataurl' }, alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' } });
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text, css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const scopeQuery = '?programmeId=5&learningCentreId=1&import=1';
const paths = { coordinator: '/coordinator/initial-demand' + scopeQuery, imports: '/coordinator/imports?programmeId=5&learningCentreId=1', student: '/student/eligibility' };
const ok = data => ({ status: 200, data });
async function fixture(path, role, state, method = 'GET', body = null) {
  const activeDemo = state.conditionalPair ? conditionalDemo : state.closedSelection ? closedDemo : demo;
  const saved = state.savedSelection ??= { revision: 0, subjectIds: [], updatedAt: null };
  const changedSource = Boolean(state.withdrawn || state.changedSource);
  const selectionPage = activeDemo.selection.pageData(saved, changedSource);
  if (path === '/api/me') return ok({ clerkUserId: 'user_test', appRole: role, roles: [role], availableRoles: [role], accessStatus: 'ACTIVE', studentProfileState: role === 'STUDENT' ? 'COMPLETE' : 'NOT_APPLICABLE', profileState: role === 'STUDENT' ? 'COMPLETE' : 'NOT_APPLICABLE', landingPath: role === 'STUDENT' ? '/student' : '/coordinator' });
  if (path === '/api/coordinator/forecast-context') return ok({ programmes: state.noAssignments ? [] : [{ programmeId: 5, programmeCode: 'DEMO', programmeName: 'Fictional Software Engineering Programme' }], learningCentres: [{ learningCentreId: 1, centreCode: 'KL', centreName: 'Kuala Lumpur' }], assignedScopes: state.noAssignments ? [] : [{ programmeId: 5, learningCentreId: 1 }], targetSemesters: [{ semesterId: 2, academicYear: '2026/2027', semesterNumber: 2 }], currentSemesterId: state.noCurrent ? null : 1, targetSemesterId: state.noCurrent ? null : 2, curricula: [], subjects: [] });
  if (path === '/api/coordinator/forecast-imports') return ok({ items: state.noSnapshots ? [] : [{ importBatchId: 1, ...demo.initial.scope, sourceLabel: 'Fictional 50-student snapshot', sourceDate: '2026-11-07', acceptedAt: '2026-11-07T08:00:00Z', source: 'SYSTEM', counts: { uniqueStudents: 50 } }] });
  if (path === '/api/coordinator/initial-demand') {
    if (state.failDemand) { state.failDemand = false; return { status: 503, error: { code: 'FORECASTING_UNAVAILABLE', message: 'Academic snapshot temporarily unavailable. Retry.' } }; }
    return ok(demo.initial);
  }
  if (path === '/api/student/eligible-offerings') {
    if (state.failStudent) { state.failStudent = false; return { status: 503, error: { code: 'ELIGIBILITY_UNAVAILABLE', message: 'Eligibility temporarily unavailable. Retry.' } }; }
    if (state.noNext) return { status: 409, error: { code: 'NO_NEXT_SEMESTER', message: 'The next academic semester has not been configured yet.' } };
    if (state.noConfirmation) return ok({ ...activeDemo.student, state: 'NO_ACTIVE_CONFIRMATION', confirmationId: null, confirmationRevision: null, confirmedAt: null, results: [] });
    return ok({ ...selectionPage.eligibility, centreBasis: activeDemo.student.centreBasis, scopeLabels: activeDemo.student.scopeLabels,
      confirmationRevision: changedSource ? 2 : 1, results: state.emptyConfirmed ? [] : selectionPage.eligibility.results });
  }
  if (path === '/api/student/semester-selection') {
    if (method === 'GET' && state.failSelectionLoad) { state.failSelectionLoad = false; return { status: 503, error: { code: 'SELECTION_UNAVAILABLE', message: 'Semester selection is temporarily unavailable. Please retry.' } }; }
    if (method === 'PUT' && state.failSelectionSave) { state.failSelectionSave = false; return { status: 503, error: { code: 'SELECTION_UNAVAILABLE', message: 'Semester selection is temporarily unavailable. Please retry.' } }; }
    const input = changedSource ? { ...activeDemo.studentInput, confirmationRevision: 2, confirmedSubjects: activeDemo.studentInput.confirmedSubjects.filter(item => item.subjectId !== 2) } : activeDemo.studentInput;
    const sourceRevision = selectionPage.sourceRevision;
    const request = new Request('http://127.0.0.1' + path, { method, headers: { Authorization: 'Bearer fictional-demo-session', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body } : {}) });
    const response = await handleSemesterSelectionRequest(request, {
      auth: {
        verify: async () => ({ clerkUserId: 'demo_student', sessionId: 'fictional-demo', primaryEmail: { address: 'student@graduate.utm.my', verified: true } }),
        access: { find: async clerkUserId => ({ clerkUserId, appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' }), initializeStudent: async clerkUserId => ({ clerkUserId, appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' }) },
        profiles: { stateFor: async () => 'COMPLETE' },
      },
      reader: { readOwnEligibility: async () => ({ input, centreBasis: activeDemo.student.centreBasis, scopeLabels: activeDemo.student.scopeLabels, internal: { studentId: 20, sourceRevision, sourceSnapshot: { fictionalSourceRevision: sourceRevision } } }) },
      selections: {
        readOwnPlan: async () => ({ ...saved, subjectIds: [...saved.subjectIds] }),
        save: async context => {
          if (context.sourceRevision !== sourceRevision || context.planRevision !== saved.revision) throw new Error('P002_SELECTION_STALE');
          saved.revision += 1; saved.subjectIds = [...context.subjectIds].sort((a, b) => a - b); saved.updatedAt = new Date('2026-11-09T12:00:00.000Z').toISOString();
          return { ...saved, subjectIds: [...saved.subjectIds] };
        },
      },
    });
    const envelope = await response.json(); return { status: response.status, ...(response.ok ? { data: envelope.data } : { error: envelope.error }) };
  }
  return { status: 404, error: { code: 'NOT_FOUND', message: 'Only the P002 demo pages and read APIs are available in this fictional preview.' } };
}
const serve = process.argv.includes('--serve'), servedState = {};
const server = createServer(async (req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); return; }
  if (req.url?.startsWith('/api/')) {
    const url = new URL(req.url, 'http://127.0.0.1'), ref = new URL(req.headers.referer ?? '/', 'http://127.0.0.1');
    const role = ref.pathname.startsWith('/student') ? 'STUDENT' : 'COORDINATOR';
    const result = await fixture(url.pathname, role, servedState, req.method ?? 'GET', req.method === 'PUT' ? await new Promise(resolveBody => { let value = ''; req.setEncoding('utf8'); req.on('data', chunk => value += chunk); req.on('end', () => resolveBody(value)); }) : null);
    res.statusCode = result.status; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result.error ? { error: result.error } : { data: result.data })); return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>P002 fictional sprint demo</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(done => server.listen(serve ? Number(process.env.P002_PREVIEW_PORT ?? 5182) : 0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
if (serve) {
  console.log('FICTIONAL P002 DEMO ONLY — no real accounts or database.');
  console.log(base + paths.coordinator); console.log(base + paths.student);
} else {
  let browser, passed = 0;
  const shots = '.wrangler/p002-review'; await mkdir(shots, { recursive: true });
  async function check(name, body, { width = 1440, role = 'COORDINATOR', state = {} } = {}) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.route(/\/api\//, async route => {
      const url = new URL(route.request().url());
      if (state.delay && url.pathname !== '/api/me') await new Promise(done => setTimeout(done, state.delay));
      const result = await fixture(url.pathname, role, state, route.request().method(), route.request().postData());
      await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.error ? { error: result.error } : { data: result.data }) });
    });
    try {
      await body(page, state); await assertReadable(page, name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ': page overflow');
      assert.deepEqual(errors, []); passed++; console.log('PASS ' + name);
    } catch (error) { await page.screenshot({ path: shots + '/failure.png', fullPage: true }); console.error(await page.locator('body').innerText()); throw error; }
    finally { await page.close(); }
  }
  const demandReady = page => page.getByRole('heading', { name: 'Initial subject consideration list' }).waitFor();
  const studentReady = page => page.getByRole('heading', { name: 'Coordinator-confirmed offerings', exact: true }).waitFor();
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.P002_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.P002_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] } : {}) });
    await check('coordinator boundary counts, filters, export and handoff', async page => {
      await page.goto(base + paths.coordinator); await demandReady(page);
      assert.match(await page.getByRole('row').filter({ hasText: 'Software Design' }).innerText(), /30/);
      assert.match(await page.getByRole('row').filter({ hasText: 'Computer Networks' }).innerText(), /29/);
      await page.getByRole('button', { name: 'Qualified', exact: true }).click(); assert.equal(await page.locator('tbody tr').count(), 2);
      await page.getByLabel('Search demand subjects').fill('Software'); assert.equal(await page.locator('tbody tr').count(), 1);
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await page.getByRole('button', { name: 'Sort: Highest demand' }).click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
      const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download handoff JSON' }).click();
      const artifact = await downloaded, json = JSON.parse(await readFile(await artifact.path(), 'utf8'));
      assert.equal(json.threshold, 30); assert.deepEqual(json.qualifiedSubjectIds, [2, 4]); assert.ok(!JSON.stringify(json).includes('Demo Student'));
      assert.equal(await page.getByRole('link', { name: /resource refinement/ }).getAttribute('href'), '/coordinator/forecasts?programmeId=5&learningCentreId=1&import=1');
      await page.getByText('Source and handoff provenance', { exact: true }).click(); await page.screenshot({ path: shots + '/coordinator-desktop.png', fullPage: true });
    });
    await check('coordinator loading and retry', async page => {
      await page.goto(base + paths.coordinator); await page.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor();
      await page.getByRole('button', { name: 'Retry', exact: true }).click(); await demandReady(page);
    }, { state: { failDemand: true } });
    await check('accepted snapshot links to initial eligible demand', async page => {
      await page.goto(base + paths.imports);
      const link = page.getByRole('link', { name: 'View initial eligible demand' }); await link.waitFor();
      assert.equal(await link.getAttribute('href'), '/coordinator/initial-demand?programmeId=5&learningCentreId=1&import=1');
    });
    for (const [name, state, text] of [['no assignments', { noAssignments: true }, 'You are not assigned'], ['no current semester', { noCurrent: true }, 'No current semester is set'], ['no accepted snapshots', { noSnapshots: true }, 'No accepted snapshots']]) {
      await check('coordinator ' + name, async page => { await page.goto(base + '/coordinator/initial-demand?programmeId=5&learningCentreId=1'); await page.getByText(text, { exact: false }).waitFor(); }, { state });
    }
    await check('student confirmed eligibility explanations and filters', async page => {
      await page.goto(base + paths.student); await studentReady(page); assert.equal(await page.locator('tbody tr').count(), 6);
      await page.getByRole('button', { name: 'Eligible', exact: true }).click(); assert.equal(await page.locator('tbody tr').count(), 3);
      assert.match(await page.locator('tbody').innerText(), /Software Design/);
      await page.getByRole('button', { name: 'Review', exact: true }).click(); assert.match(await page.locator('tbody').innerText(), /CGPA.*2.0/);
      await page.getByLabel('Find a subject').fill('not found'); await page.getByRole('heading', { name: 'No matching subjects' }).waitFor();
      await page.getByRole('button', { name: 'Clear filters' }).click();
      assert.match(await page.locator('body').innerText(), /2026\/2027.*Semester 2/); await page.screenshot({ path: shots + '/student-desktop.png', fullPage: true });
    }, { role: 'STUDENT' });
    await check('student semester selection saves, reloads, edits, cancels and clears', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      await panel.getByText('2026/2027 · Semester 2 (Normal semester)').waitFor();
      const design = panel.getByRole('checkbox', { name: /Software Design/ }), networks = panel.getByRole('checkbox', { name: /Computer Networks/ });
      await design.check(); await panel.getByRole('button', { name: 'Save selection' }).click(); await panel.getByRole('status').filter({ hasText: 'Selection saved.' }).waitFor();
      await panel.getByRole('button', { name: 'Reload', exact: true }).click(); await panel.getByText(/revision 1/i).waitFor(); assert.equal(await design.isChecked(), true);
      await networks.check(); await panel.getByRole('button', { name: 'Cancel changes' }).click(); assert.equal(await design.isChecked(), true); assert.equal(await networks.isChecked(), false);
      await panel.getByRole('button', { name: 'Clear selection' }).click(); await panel.getByRole('button', { name: 'Save selection' }).click(); await panel.getByRole('status').filter({ hasText: 'Selection saved.' }).waitFor();
      await panel.getByRole('button', { name: 'Reload', exact: true }).click(); assert.equal(await design.isChecked(), false);
    }, { role: 'STUDENT' });
    await check('student selection normal reload offers keep or discard', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      const design = panel.getByRole('checkbox', { name: /Software Design/ }); await design.check();
      await panel.getByRole('button', { name: 'Reload', exact: true }).click();
      const confirm = panel.getByRole('alertdialog', { name: 'Discard draft before reload' }); await confirm.waitFor();
      await confirm.getByRole('button', { name: 'Keep draft' }).click(); assert.equal(await design.isChecked(), true);
      await panel.getByRole('button', { name: 'Reload', exact: true }).click();
      await panel.getByRole('alertdialog', { name: 'Discard draft before reload' }).getByRole('button', { name: 'Reload and discard draft' }).click();
      await panel.getByRole('button', { name: 'Save selection' }).waitFor(); assert.equal(await panel.getByRole('checkbox', { name: /Software Design/ }).isChecked(), false);
    }, { role: 'STUDENT' });
    await check('student top refresh offers keep editing or discard draft', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      const design = panel.getByRole('checkbox', { name: /Software Design/ }); await design.check();
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Discard selection draft before refreshing' }); await confirm.waitFor();
      await confirm.getByRole('button', { name: 'Keep editing' }).click(); assert.equal(await design.isChecked(), true);
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Discard selection draft before refreshing' }).getByRole('button', { name: 'Refresh and discard draft' }).click();
      await panel.getByRole('button', { name: 'Save selection' }).waitFor(); assert.equal(await panel.getByRole('checkbox', { name: /Software Design/ }).isChecked(), false);
    }, { role: 'STUDENT' });
    await check('student concurrent subjects require and accept the complete pair', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      const studio = panel.getByRole('checkbox', { name: /Concurrent Project Studio/ }), lab = panel.getByRole('checkbox', { name: /Concurrent Project Lab/ });
      await studio.check(); await panel.getByText(/must be selected with every required co-requisite/).waitFor(); assert.equal(await panel.getByRole('button', { name: 'Save selection' }).isDisabled(), true);
      await lab.check(); assert.equal(await panel.getByRole('button', { name: 'Save selection' }).isDisabled(), false);
      await panel.getByRole('button', { name: 'Save selection' }).click(); await panel.getByRole('status').filter({ hasText: 'Selection saved.' }).waitFor();
    }, { role: 'STUDENT', state: { conditionalPair: true } });
    await check('student selection enforces configured subject and credit maxima', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      for (const name of [/Software Design/, /Computer Networks/, /Database Systems/, /Concurrent Project Studio/, /Concurrent Project Lab/]) await panel.getByRole('checkbox', { name }).check();
      await panel.getByText(/maximum of 3 subjects/).waitFor(); await panel.getByText(/maximum of 10 credits/).waitFor();
      assert.equal(await panel.getByRole('button', { name: 'Save selection' }).isDisabled(), true);
    }, { role: 'STUDENT', state: { conditionalPair: true } });
    await check('student closed selection is read only', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      await panel.getByText('Picking is closed. Your saved selection is read-only.').waitFor();
      assert.equal(await panel.getByRole('checkbox').first().isDisabled(), true); assert.equal(await panel.getByRole('button', { name: 'Save selection' }).isDisabled(), true);
    }, { role: 'STUDENT', state: { closedSelection: true } });
    await check('student selection initial GET failure retries', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('alert').filter({ hasText: 'Semester selection is temporarily unavailable' }).waitFor();
      await panel.getByRole('button', { name: 'Retry loading' }).click(); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
    }, { role: 'STUDENT', state: { failSelectionLoad: true } });
    await check('student selection save failure retains draft for retry', async page => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      const design = panel.getByRole('checkbox', { name: /Software Design/ }), networks = panel.getByRole('checkbox', { name: /Computer Networks/ });
      assert.equal(await design.isChecked(), true); await networks.check(); await panel.getByRole('button', { name: 'Save selection' }).click();
      await panel.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor(); assert.equal(await design.isChecked(), true); assert.equal(await networks.isChecked(), true); await panel.getByText(/revision 1/i).waitFor();
      await panel.getByRole('button', { name: 'Retry save' }).click(); await panel.getByRole('status').filter({ hasText: 'Selection saved.' }).waitFor();
    }, { role: 'STUDENT', state: { failSelectionSave: true, savedSelection: { revision: 1, subjectIds: [2], updatedAt: '2026-11-09T11:00:00.000Z' } } });
    await check('student stale selection requires explicit reload confirmation', async (page, state) => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      const design = panel.getByRole('checkbox', { name: /Software Design/ }); await design.check(); state.changedSource = true;
      await panel.getByRole('button', { name: 'Save selection' }).click(); await panel.getByText(/changed. Reload before saving/).waitFor();
      await panel.getByRole('button', { name: 'Review reload' }).click(); await panel.getByRole('button', { name: 'Keep draft' }).click(); assert.equal(await design.isChecked(), true);
      await panel.getByRole('button', { name: 'Review reload' }).click(); await panel.getByRole('button', { name: 'Reload and discard draft' }).click();
      await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor(); assert.equal(await panel.getByRole('checkbox', { name: /Software Design/ }).count(), 0);
    }, { role: 'STUDENT' });
    await check('student saved option withdrawn by source becomes invalid and disappears', async (page, state) => {
      await page.goto(base + paths.student); await studentReady(page);
      const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
      await panel.getByRole('checkbox', { name: /Software Design/ }).check(); await panel.getByRole('button', { name: 'Save selection' }).click(); await panel.getByRole('status').filter({ hasText: 'Selection saved.' }).waitFor();
      state.withdrawn = true; await panel.getByRole('button', { name: 'Reload', exact: true }).click();
      await panel.getByText(/Some saved subjects are no longer in the confirmed list/).waitFor();
      await panel.getByText(/No longer in the current confirmed offering/).waitFor(); assert.equal(await panel.getByRole('checkbox', { name: /Software Design/ }).count(), 0);
    }, { role: 'STUDENT' });
    await check('student refresh observes withdrawn subject and confirmation revision', async (page, state) => {
      await page.goto(base + '/student/offerings'); await studentReady(page); state.withdrawn = true;
      await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await page.getByText(/Revision 2/).waitFor();
      assert.equal(await page.getByRole('row').filter({ hasText: 'Software Design' }).count(), 0);
    }, { role: 'STUDENT' });
    for (const [name, state, text] of [['not confirmed', { noConfirmation: true }, 'Offerings are not confirmed yet'], ['empty confirmed', { emptyConfirmed: true }, 'No confirmed subjects match your curriculum'], ['no next semester', { noNext: true }, 'The next academic semester has not been configured yet.']]) {
      await check('student ' + name, async page => { await page.goto(base + paths.student); await page.getByText(text, { exact: true }).waitFor(); }, { role: 'STUDENT', state });
    }
    await check('student loading and failure retry', async page => {
      await page.goto(base + paths.student); await page.getByRole('status').filter({ hasText: 'Loading confirmed' }).waitFor();
      await page.getByRole('heading', { name: 'Eligibility is unavailable' }).waitFor(); await page.getByRole('button', { name: 'Retry loading' }).click(); await studentReady(page);
    }, { role: 'STUDENT', state: { failStudent: true, delay: 200 } });
    for (const width of [320, 375, 768, 1440]) for (const role of ['COORDINATOR', 'STUDENT']) {
      await check(role.toLowerCase() + ' readable at ' + width, async page => {
        await page.goto(base + (role === 'COORDINATOR' ? paths.coordinator : paths.student));
        await (role === 'COORDINATOR' ? demandReady(page) : studentReady(page));
        if (role === 'STUDENT') {
          const panel = page.locator('.semester-selection'); await panel.getByRole('heading', { name: 'Proposed semester selection' }).waitFor();
          await panel.getByRole('button', { name: 'Save selection' }).waitFor(); await panel.getByRole('checkbox').first().waitFor();
        }
        await page.screenshot({ path: `${shots}/${role.toLowerCase()}-${width}.png`, fullPage: true });
      }, { width, role });
    }
    console.log(`P002 UI checks passed: ${passed}`);
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
