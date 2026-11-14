// Integrated UC24 browser checks: real AppRoutes (/admin/curriculum) with Clerk and API fixtures.
// Fictional data only; no live Clerk or database connection.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { assertReadable } from '../ui/readability.mjs';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const output = await build({ entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false, outdir: '.wrangler/uc24-horizontal-review', jsx: 'automatic', loader: { '.png': 'dataurl' }, alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' } });
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>UC24 review — fictional data</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
const rev = 'a'.repeat(32);
const subjects = [
  { mappingId: 11, subjectId: 1, code: 'DEMO101', name: 'Fictional Foundations', credits: 3, category: 'CORE', compulsory: true, semesterTypes: ['NORMAL'] },
  { mappingId: 12, subjectId: 2, code: 'DEMO102', name: 'Fictional Analysis', credits: 3, category: 'CORE', compulsory: true, semesterTypes: ['NORMAL'] },
  { mappingId: 13, subjectId: 3, code: 'DEMO103', name: 'Fictional Writing', credits: 2, category: 'ELECTIVE', compulsory: false, semesterTypes: ['SHORT'] },
  ...Array.from({ length: 57 }, (_, i) => ({ mappingId: 100 + i, subjectId: 100 + i, code: 'DEMO' + (200 + i), name: 'Fictional elective ' + (i + 1), credits: 3, category: 'ELECTIVE', compulsory: false, semesterTypes: ['NORMAL'] })),
];
const baseLinks = Array.from({ length: 24 }, (_, i) => ({ id: 30 + i, from: 101 + i, required: 100 + i, kind: 'MANDATORY' }));
const snapshot = (links = baseLinks, extra = []) => ({ revision: rev, data: { curriculumId: 1, programme: 'DEMO NOT OFFICIAL — Fictional programme', version: 'DEMO', totalCredits: 12, subjects: [...subjects, ...extra], links } });
const catalogue = { curricula: [{ curriculumId: 1, programme: 'DEMO NOT OFFICIAL — Fictional programme', version: 'DEMO' }, { curriculumId: 2, programme: 'DEMO NOT OFFICIAL — Fictional programme', version: 'OTHER' }], subjects: subjects.map(s => ({ subjectId: s.subjectId, code: s.code, name: s.name, credits: s.credits })).concat([{ subjectId: 8, code: 'DUP1', name: 'Fictional duplicate code', credits: 3 }]) };
await mkdir('.wrangler/uc24-horizontal-review', { recursive: true });
let browser, passed = 0;
async function mock(page, state = {}) {
  await page.route(/\/api\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
    (state.requests ??= []).push({ path, method });
    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === '/api/me') return json(200, { data: { clerkUserId: 'user_test', appRole: 'SYSTEM_ADMIN', roles: ['SYSTEM_ADMIN'], availableRoles: ['SYSTEM_ADMIN'], accessStatus: 'ACTIVE', studentProfileState: 'NOT_APPLICABLE', profileState: 'NOT_APPLICABLE', landingPath: '/admin' } });
    if (path === '/api/p001-sprint2/curricula' && method === 'GET') return json(200, { data: catalogue });
    const one = /^\/api\/p001-sprint2\/curricula\/(\d+)$/.exec(path);
    if (one && method === 'GET') return json(200, { data: one[1] === '2' ? { revision: rev, data: { curriculumId: 2, programme: 'DEMO NOT OFFICIAL — Fictional programme', version: 'OTHER', totalCredits: 12, subjects: [{ mappingId: 21, subjectId: 4, code: 'OTHER1', name: 'Fictional other', credits: 3, category: 'CORE', compulsory: true, semesterTypes: ['NORMAL'] }], links: [] } } : snapshot() });
    const create = /^\/api\/p001-sprint2\/curricula\/1\/subjects$/.exec(path);
    if (create && method === 'POST') {
      const body = route.request().postDataJSON(); (state.bodies ??= []).push(body);
      if (state.createError) return json(state.createError.status ?? 409, { error: { code: state.createError.code ?? 'CURRICULUM_CONFLICT', message: state.createError.message ?? 'The change conflicts with saved curriculum data.' } });
      for (const p of body.prerequisites ?? []) { const s = subjects.find(x => x.mappingId === p.mappingId); if (!s || s.code !== p.code) return json(400, { error: { code: 'INVALID_INPUT', message: 'Every prerequisite must be a subject in this curriculum.' } }); }
      const added = { mappingId: 99, subjectId: 9, code: body.code, name: body.name, credits: body.credits, category: body.category, compulsory: body.compulsory, semesterTypes: body.semesterTypes };
      return json(201, { data: snapshot([...baseLinks, ...(body.prerequisites ?? []).map((p, i) => ({ id: 1000 + i, from: 99, required: p.mappingId, kind: 'MANDATORY' }))], [added]) });
    }
    const dep = /^\/api\/p001-sprint2\/curricula\/1\/dependencies(?:\/(\d+))?$/.exec(path);
    if (dep && method !== 'GET') {
      const body = route.request().postDataJSON(); (state.depBodies ??= []).push({ ...body, _method: method });
      let links = [...baseLinks];
      if (method === 'POST') links.push({ id: 99, from: body.from, required: body.required, kind: body.kind });
      if (method === 'PUT') links = links.map(l => l.id === Number(dep[1]) ? { ...l, from: body.from, required: body.required, kind: body.kind } : l);
      if (method === 'DELETE') links = links.filter(l => l.id !== Number(dep[1]));
      return json(method === 'POST' ? 201 : 200, { data: snapshot(links) });
    }
    if (path.startsWith('/api/admin') || path.startsWith('/api/profile')) return json(200, { data: null });
    return json(404, { error: { code: 'NOT_FOUND', message: 'Fixture route not found.' } });
  });
  return state;
}
async function check(name, body, width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 960 } }); const errors = []; page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__confirmResult = true; window.confirm = () => window.__confirmResult; });
  try { await body(page); await assertReadable(page, name); assert.deepEqual(errors, []); passed++; console.log('PASS ' + name); }
  catch (error) { console.error(name, errors, await page.locator('body').innerText()); await page.screenshot({ path: '.wrangler/uc24-horizontal-review/failed-' + name.replace(/\W+/g, '_') + '.png' }); throw error; }
  finally { await page.close(); }
}
const SECTION_LABELS = { subjects: 'Subject List', create: 'Create Subject', relationships: 'Prerequisite List', prerequisites: 'Manage Prerequisites' };
async function chooseSection(page, action) {
  await page.getByRole('tab', { name: SECTION_LABELS[action], exact: true }).click();
}
const currentSection = async page => (await page.getByRole('tab', { selected: true }).getAttribute('id')).replace('s2-tab-', '');
async function open(page, action = 'subjects') {
  await page.goto(base + '/admin/curriculum');
  await page.getByRole('heading', { name: 'Subjects and prerequisites', exact: true }).waitFor();
  await page.getByLabel('Curriculum', { exact: true }).selectOption('1');
  await page.getByRole('heading', { name: /Fictional programme/ }).waitFor();
  assert.equal(await currentSection(page), 'subjects'); // default is Subject List
  await page.getByRole('heading', { name: 'Curriculum subjects', exact: true }).waitFor();
  if (action !== 'subjects') await chooseSection(page, action);
}
const fillDraft = async (page, code = 'DEMO900') => {
  await page.getByLabel('Subject code', { exact: true }).fill(code);
  await page.getByLabel('Subject name', { exact: true }).fill('Fictional new subject');
  await page.getByLabel('Credit hours', { exact: true }).fill('3');
  await page.getByLabel('Classification', { exact: true }).fill('CORE');
  await page.getByRole('checkbox', { name: 'Normal semester (1 or 2)' }).check();
};
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  await check('UC24 integrated: code and name search, multi-select and removal, review and atomic save', async page => {
    const state = await mock(page); await open(page, 'create');
    await page.getByRole('heading', { name: 'Create subject (UC24)', exact: true }).waitFor();
    await page.getByLabel('Search prerequisites').fill('demo101'); // case-insensitive code search
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    await page.getByLabel('Search prerequisites').fill('demo101'); // already-selected subject is not offered again
    assert.equal(await page.getByRole('button', { name: 'Add prerequisite', exact: true }).count(), 0);
    await page.getByLabel('Search prerequisites').fill('writing'); // case-insensitive name search
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).getByRole('listitem').count(), 2);
    await page.getByRole('button', { name: 'Remove prerequisite DEMO103' }).click();
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).getByRole('listitem').count(), 1);
    await page.getByLabel('Search prerequisites').fill('writing');
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).getByRole('listitem').count(), 2);
    await fillDraft(page);
    await page.getByRole('button', { name: 'Review subject change' }).click();
    const review = page.getByRole('region', { name: 'Review change' });
    await review.getByRole('heading', { name: 'Review change' }).waitFor();
    const text = await review.innerText();
    assert.ok(text.includes('Fictional new subject (DEMO900)')); assert.ok(text.includes('3 credit hours'));
    assert.ok(text.includes('Fictional Foundations (DEMO101)')); assert.ok(text.includes('Fictional Writing (DEMO103)'));
    await review.getByRole('button', { name: 'Confirm save' }).click();
    await page.getByText(/Subject created and saved/).waitFor();
    assert.equal(state.bodies.length, 1);
    assert.deepEqual(state.bodies[0].prerequisites, [{ mappingId: 11, code: 'DEMO101' }, { mappingId: 13, code: 'DEMO103' }]);
    await page.screenshot({ path: '.wrangler/uc24-horizontal-review/uc24-created.png', fullPage: true });
  });
  await check('UC24 horizontal workspace: four independent panes, horizontal tabs, dirty-switch guard, edit redirects', async page => {
    await mock(page); await open(page);
    const tabs = page.getByRole('tablist', { name: 'Curriculum actions' });
    assert.equal(await tabs.getAttribute('aria-orientation'), 'horizontal');
    const subjectsTab = page.getByRole('tab', { name: 'Subject List', exact: true });
    const createTab = page.getByRole('tab', { name: 'Create Subject', exact: true });
    const relListTab = page.getByRole('tab', { name: 'Prerequisite List', exact: true });
    const manageTab = page.getByRole('tab', { name: 'Manage Prerequisites', exact: true });
    // Horizontal strip: shared top edge, strictly increasing x, 44px controls; all four tabs visible.
    const boxes = [];
    for (const tab of [subjectsTab, createTab, relListTab, manageTab]) { const b = await tab.boundingBox(); assert.ok(b.height >= 44, 'tab shorter than 44px'); boxes.push(b); }
    for (let i = 1; i < boxes.length; i++) { assert.equal(boxes[i].y, boxes[0].y); assert.ok(boxes[i].x > boxes[i - 1].x); }
    // Subject List default: list only, forms and relationship list hidden.
    assert.equal(await subjectsTab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('heading', { name: 'Curriculum subjects' }).isVisible(), true);
    assert.equal(await page.getByLabel('Subject code', { exact: true }).isVisible(), false);
    assert.equal(await page.getByRole('heading', { name: 'Saved relationships' }).isVisible(), false);
    assert.equal(await page.getByLabel('Dependent subject', { exact: true }).isVisible(), false);
    await assertReadable(page, 'subject list pane');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.wrangler/uc24-horizontal-review/subjects-top-1440.png' });
    // Sticky sidebar stays in the viewport at the bottom of the 60-subject list.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = await subjectsTab.boundingBox();
    assert.ok(sticky.y >= 0 && sticky.y < page.viewportSize().height, 'sidebar scrolled out of view');
    await page.screenshot({ path: '.wrangler/uc24-horizontal-review/subjects-viewport-1440.png' });
    // Regression: switching from the bottom of the long list must land on the new pane
    // and keep focus on the activated tab, with no manual scrolling.
    await createTab.click();
    const createHeading = page.getByRole('heading', { name: 'Create subject (UC24)' });
    await createHeading.waitFor();
    const chBox = await createHeading.boundingBox();
    const whBox = await page.getByRole('heading', { name: /Fictional programme/ }).boundingBox();
    assert.ok(whBox.y >= -1 && whBox.y < page.viewportSize().height, 'workspace heading not in viewport after sticky switch, y=' + whBox.y);
    assert.ok(chBox.y >= 0 && chBox.y + chBox.height <= page.viewportSize().height, 'create heading not in viewport after sticky switch');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-create');
    // Back to Subject List for keyboard navigation (accepted switch, draft is clean).
    await subjectsTab.click();
    await page.getByRole('heading', { name: 'Curriculum subjects' }).waitFor();
    // Keyboard: Right/Left wrap on the focused tab; selection unchanged until Enter; Home/End.
    await subjectsTab.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-create');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-prerequisites');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-subjects');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-relationships');
    assert.equal(await subjectsTab.getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-prerequisites');
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-subjects');
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    assert.equal(await manageTab.getAttribute('aria-selected'), 'true');
    // Manage pane: relationship form only, no lists.
    await page.getByRole('heading', { name: 'Add relationship' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Saved relationships' }).isVisible(), false);
    assert.equal(await page.getByRole('heading', { name: 'Curriculum subjects' }).isVisible(), false);
    await assertReadable(page, 'manage pane');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.wrangler/uc24-horizontal-review/manage-viewport-1440.png' });
    // Prerequisite List pane: saved relationships only.
    await relListTab.click();
    await page.getByRole('heading', { name: 'Saved relationships' }).waitFor();
    assert.equal(await page.getByLabel('Dependent subject', { exact: true }).isVisible(), false);
    await assertReadable(page, 'prerequisite list pane');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.wrangler/uc24-horizontal-review/relationships-viewport-1440.png' });
    // Create pane: subject form only.
    await createTab.click();
    await page.getByRole('heading', { name: 'Create subject (UC24)' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Curriculum subjects' }).isVisible(), false);
    await assertReadable(page, 'create pane');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.wrangler/uc24-horizontal-review/create-viewport-1440.png' });
    // Same-section selection is a no-op.
    await createTab.click();
    assert.equal(await createTab.getAttribute('aria-selected'), 'true');
    // Dirty switch declined keeps the pane, draft and controlled selection.
    await page.getByLabel('Subject code', { exact: true }).fill('DEMO950');
    await page.evaluate(() => { window.__confirmResult = false; });
    await manageTab.click();
    assert.equal(await createTab.getAttribute('aria-selected'), 'true');
    assert.equal(await currentSection(page), 'create');
    assert.equal(await page.getByLabel('Subject code', { exact: true }).inputValue(), 'DEMO950');
    // Accepted clears and switches.
    await page.evaluate(() => { window.__confirmResult = true; });
    await manageTab.click();
    assert.equal(await manageTab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByLabel('Dependent subject', { exact: true }).inputValue(), '');
    // Editing a subject from the list opens the populated create pane; editing a relationship opens manage.
    await chooseSection(page, 'subjects');
    await page.getByRole('button', { name: 'Edit subject DEMO256' }).click();
    assert.ok((await page.evaluate(() => document.activeElement?.textContent)).includes('· DEMO'));
    await page.getByRole('heading', { name: 'Edit existing subject (UC06)', exact: true }).waitFor();
    assert.equal(await currentSection(page), 'create');
    await page.getByRole('button', { name: 'Cancel changes', visible: true }).click();
    await chooseSection(page, 'relationships');
    await page.getByRole('button', { name: 'Edit relationship 30' }).click();
    assert.ok((await page.evaluate(() => document.activeElement?.textContent)).includes('· DEMO'));
    await page.getByRole('heading', { name: 'Edit relationship', exact: true }).waitFor();
    assert.equal(await currentSection(page), 'prerequisites');
    // Same landing from the bottom of the relationship list.
    await chooseSection(page, 'relationships');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await manageTab.click();
    const relHeading = page.getByRole('heading', { name: 'Add relationship' });
    await relHeading.waitFor();
    const rhBox = await relHeading.boundingBox();
    const whBox2 = await page.getByRole('heading', { name: /Fictional programme/ }).boundingBox();
    assert.ok(whBox2.y >= -1 && whBox2.y < page.viewportSize().height, 'workspace heading not in viewport after sticky switch, y=' + whBox2.y);
    assert.ok(rhBox.y >= 0 && rhBox.y + rhBox.height <= page.viewportSize().height, 'manage heading not in viewport after sticky switch');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 's2-tab-prerequisites');
  });
  await check('UC24 navigation disabled during review; manage relationship saves in place', async page => {
    const state = await mock(page); await open(page, 'create');
    await fillDraft(page);
    await page.getByRole('button', { name: 'Review subject change' }).click();
    await page.getByRole('region', { name: 'Review change' }).waitFor();
    for (const label of Object.values(SECTION_LABELS)) assert.equal(await page.getByRole('tab', { name: label, exact: true }).isDisabled(), true);
    await page.getByRole('region', { name: 'Review change' }).getByRole('button', { name: 'Back to editing' }).click();
    assert.equal(await page.getByRole('tab', { name: 'Manage Prerequisites', exact: true }).isDisabled(), false);
    await page.getByRole('button', { name: 'Cancel changes', visible: true }).click();
    // Add a mandatory relationship and stay on the manage pane after saving.
    await chooseSection(page, 'prerequisites');
    await page.getByLabel('Dependent subject', { exact: true }).selectOption('12');
    await page.getByLabel('Required or related subject', { exact: true }).selectOption('11');
    await page.getByRole('button', { name: 'Review relationship change' }).click();
    const review = page.getByRole('region', { name: 'Review change' });
    await review.getByRole('heading', { name: 'Review change' }).waitFor();
    assert.ok((await review.innerText()).includes('Fictional Analysis (DEMO102) requires Fictional Foundations (DEMO101)'));
    await review.getByRole('button', { name: 'Confirm save' }).click();
    await page.getByText('Curriculum change saved.').waitFor();
    assert.equal(state.depBodies.length, 1);
    assert.deepEqual([state.depBodies[0].from, state.depBodies[0].required, state.depBodies[0].kind], [12, 11, 'MANDATORY']);
    assert.equal(await page.getByRole('tab', { name: 'Manage Prerequisites', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('region', { name: 'Review change' }).count(), 0);
  });
  await check('UC24: relationship removal is reviewed and persisted from the list pane; stale create keeps pane and draft', async page => {
    const state = await mock(page); await open(page, 'relationships');
    await page.getByRole('heading', { name: 'Saved relationships' }).waitFor();
    await page.getByRole('button', { name: 'Remove relationship 30' }).click();
    const review = page.getByRole('region', { name: 'Review change' });
    await review.getByRole('heading', { name: 'Review change' }).waitFor();
    assert.deepEqual(state.depBodies ?? [], []); // no write until Confirm
    for (const label of Object.values(SECTION_LABELS)) assert.equal(await page.getByRole('tab', { name: label, exact: true }).isDisabled(), true);
    await review.getByRole('button', { name: 'Confirm save' }).click();
    await page.getByText('Curriculum change saved.').waitFor();
    assert.equal(state.depBodies.length, 1);
    assert.equal(state.depBodies[0]._method, 'DELETE');
    assert.equal(await currentSection(page), 'relationships');
    assert.equal(await page.getByRole('button', { name: 'Remove relationship 30' }).count(), 0);
    assert.ok(await page.getByRole('button', { name: 'Remove relationship 31' }).isVisible());
    // A stale-create failure keeps the create pane and the draft.
    state.createError = { status: 409, code: 'STALE_CURRICULUM', message: 'The curriculum changed since you opened it. Reload before saving.' };
    await chooseSection(page, 'create');
    await fillDraft(page, 'DEMO903');
    await page.getByRole('button', { name: 'Review subject change' }).click();
    await page.getByRole('region', { name: 'Review change' }).getByRole('button', { name: 'Confirm save' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await currentSection(page), 'create');
    assert.equal(await page.getByLabel('Subject code', { exact: true }).inputValue(), 'DEMO903');
  });
  await check('UC24: outstanding prerequisite search alone counts as dirty', async page => {
    await mock(page); await open(page, 'create');
    const subjectsTab = page.getByRole('tab', { name: 'Subject List', exact: true });
    const createTab = page.getByRole('tab', { name: 'Create Subject', exact: true });
    await page.getByLabel('Search prerequisites').fill('analysis');
    await page.evaluate(() => { window.__confirmResult = false; });
    await subjectsTab.click();
    assert.equal(await createTab.getAttribute('aria-selected'), 'true');
    assert.equal(await currentSection(page), 'create');
    assert.equal(await page.getByLabel('Search prerequisites').inputValue(), 'analysis');
    await page.evaluate(() => { window.__confirmResult = true; });
    await subjectsTab.click();
    assert.equal(await subjectsTab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByLabel('Search prerequisites').inputValue(), '');
  });
  await check('UC24: zero prerequisites allowed and review says so', async page => {
    const state = await mock(page); await open(page, 'create');
    await page.getByText('No prerequisites selected.').waitFor();
    await fillDraft(page, 'DEMO901');
    await page.getByRole('button', { name: 'Review subject change' }).click();
    const review = page.getByRole('region', { name: 'Review change' });
    await review.getByRole('heading', { name: 'Review change' }).waitFor();
    assert.ok((await review.innerText()).includes('No initial prerequisites'));
    await review.getByRole('button', { name: 'Confirm save' }).click();
    await page.getByText(/Subject created and saved/).waitFor();
    assert.deepEqual(state.bodies[0].prerequisites, []);
  });
  await check('UC24: unresolved search and cancel never write; stale failure preserves the draft', async page => {
    const state = await mock(page); await open(page, 'create');
    await fillDraft(page, 'DEMO902');
    await page.getByLabel('Search prerequisites').fill('analysis');
    await page.getByRole('button', { name: 'Review subject change' }).click();
    await page.getByRole('alert').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes('never saved'));
    assert.deepEqual(state.bodies ?? [], []);
    // Real cancel clears the draft and selection without writing.
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel changes', visible: true }).click();
    assert.equal(await page.getByLabel('Subject code', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).count(), 0);
    assert.equal((state.bodies ?? []).length, 0);
    // Re-fill, review, then back out without writing.
    await fillDraft(page, 'DEMO902');
    await page.getByLabel('Search prerequisites').fill('analysis');
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    await page.getByRole('button', { name: 'Review subject change' }).click();
    const review = page.getByRole('region', { name: 'Review change' });
    await review.getByRole('heading', { name: 'Review change' }).waitFor();
    await review.getByRole('button', { name: 'Back to editing' }).click();
    assert.equal((state.bodies ?? []).length, 0);
    // A stale-curriculum failure keeps the draft and selection.
    state.createError = { status: 409, code: 'STALE_CURRICULUM', message: 'The curriculum changed since you opened it. Reload before saving.' };
    await page.getByRole('button', { name: 'Review subject change' }).click();
    await page.getByRole('region', { name: 'Review change' }).getByRole('button', { name: 'Confirm save' }).click();
    await page.getByRole('alert').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes('changed'));
    assert.equal(await page.getByLabel('Subject code', { exact: true }).inputValue(), 'DEMO902');
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).getByRole('listitem').count(), 1);
  });
  await check('UC24: duplicate catalogue code and curriculum switch safeguards', async page => {
    const state = await mock(page); await open(page, 'create');
    await page.getByLabel('Search prerequisites').fill('DEMO101');
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    await fillDraft(page, 'dup1');
    await page.getByRole('button', { name: 'Review subject change' }).click();
    await page.getByRole('alert').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes('already exists'));
    assert.deepEqual(state.bodies ?? [], []);
    // Switching curricula discards the draft and selection (confirm auto-accepted).
    await page.getByLabel('Curriculum', { exact: true }).selectOption('2');
    await page.getByRole('heading', { name: /OTHER/ }).waitFor();
    assert.equal(await currentSection(page), 'subjects');
    await page.getByRole('heading', { name: 'Curriculum subjects', exact: true }).waitFor();
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).count(), 0);
    assert.equal(await page.getByLabel('Subject code', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Search prerequisites').inputValue(), '');
  });
  await check('UC24: keyboard selection and edit mode excludes initial prerequisites', async page => {
    await mock(page); await open(page, 'create');
    const search = page.getByLabel('Search prerequisites');
    await search.focus(); await page.keyboard.type('DEMO102'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).getByRole('listitem').count(), 1);
    await chooseSection(page, 'subjects');
    await page.getByRole('button', { name: 'Edit subject DEMO101' }).click();
    await page.getByRole('heading', { name: 'Edit existing subject (UC06)', exact: true }).waitFor();
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).count(), 0);
    assert.equal(await page.getByLabel('Search prerequisites').count(), 0);
    await page.getByRole('checkbox', { name: /every curriculum using this subject/ }).check();
    await page.getByRole('button', { name: 'Review subject change' }).click();
    const review = page.getByRole('region', { name: 'Review change' });
    await review.getByRole('heading', { name: 'Review change' }).waitFor();
    assert.ok(!(await review.innerText()).includes('prerequisite'));
  });
  await check('UC24: incomplete drafts never reach review', async page => {
    const state = await mock(page); await open(page, 'create');
    await fillDraft(page);
    await page.getByRole('checkbox', { name: 'Normal semester (1 or 2)' }).uncheck();
    await page.getByRole('button', { name: 'Review subject change' }).click();
    await page.getByRole('alert').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes('semester'));
    assert.equal(await page.getByRole('region', { name: 'Review change' }).count(), 0);
    await page.getByRole('checkbox', { name: 'Normal semester (1 or 2)' }).check();
    await page.getByLabel('Subject name', { exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Review subject change' }).click();
    assert.ok((await page.getByRole('alert').innerText()).includes('required'));
    assert.equal(await page.getByRole('region', { name: 'Review change' }).count(), 0);
    assert.deepEqual(state.bodies ?? [], []);
  });
  await check('UC24 workspace at the 768px breakpoint: horizontal tabs, all four panes, no overflow', async page => {
    await mock(page); await open(page);
    assert.equal(await page.getByRole('tablist', { name: 'Curriculum actions' }).isVisible(), true);
    for (const action of Object.keys(SECTION_LABELS)) {
      await chooseSection(page, action);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal overflow on ' + action);
    }
  }, 768);
  await check('UC24 workspace at 1024px with 200% zoom stays usable', async page => {
    await mock(page); await open(page, 'create');
    await page.evaluate(() => { document.body.style.zoom = '2'; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '200% zoom overflow');
    // Viewport media still selects the tabs; they stack above the pane and stay usable.
    assert.equal(await page.getByRole('tablist', { name: 'Curriculum actions' }).isVisible(), true);
    for (const tab of await page.getByRole('tab').all()) assert.ok((await tab.boundingBox()).height >= 44, 'tab shorter than 44px at 200% zoom');
  }, 1024);
  for (const width of [320, 390]) await check(`UC24 mobile ${width}: stacked picks, no overflow`, async page => {
    await mock(page); await open(page, 'create');
    await fillDraft(page);
    await page.getByLabel('Search prerequisites').fill('demo');
    const row = page.locator('.s2-picks li').first();
    const box = await row.getByRole('button', { name: 'Add prerequisite' }).boundingBox();
    const nameBox = await row.locator('strong').boundingBox();
    assert.ok(nameBox.width >= 120, 'subject name column is too narrow: ' + nameBox.width);
    assert.ok(box.y > nameBox.y + nameBox.height - 1, 'button should stack below the subject text at this width');
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).first().click();
    assert.equal(await page.getByRole('list', { name: 'Selected prerequisites' }).getByRole('listitem').count(), 1);
    await page.screenshot({ path: `.wrangler/uc24-horizontal-review/uc24-mobile-${width}.png`, fullPage: true });
    // Horizontal tab strip stays usable at this width: two equal columns, all tabs >=44px.
    const tabList = page.getByRole('tablist', { name: 'Curriculum actions' });
    assert.equal(await tabList.isVisible(), true);
    const tabBoxes = [];
    for (const tab of await page.getByRole('tab').all()) {
      const b = await tab.boundingBox();
      assert.ok(b.height >= 44, 'tab shorter than 44px');
      assert.ok(b.x >= -1 && b.x + b.width <= width + 1, 'tab overflows viewport');
      tabBoxes.push(b);
    }
    assert.equal(new Set(tabBoxes.map(b => b.y)).size, 2, 'tabs should wrap into two rows of two at ' + width);
    const colW = tabBoxes[0].width;
    for (const b of tabBoxes) assert.ok(Math.abs(b.width - colW) <= 1, 'tab columns not equal');
    // Longest label word must fit inside each tab's content box (no broken single letters).
    const wordFits = await page.evaluate(() => {
      const ctx = document.createElement('canvas').getContext('2d');
      return [...document.querySelectorAll('.s2-nav [role=tab]')].map(tab => {
        const style = getComputedStyle(tab);
        ctx.font = style.font;
        const content = tab.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return Math.max(...tab.textContent.trim().split(/\s+/).map(word => ctx.measureText(word).width)) <= content + 1;
      });
    });
    assert.deepEqual(wordFits, [true, true, true, true]);
    // Top-of-page action workspace screenshot of the create pane.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.wrangler/uc24-horizontal-review/create-viewport-${width}.png` });
    await assertReadable(page, 'create pane ' + width);
    // Dirty draft switch declined keeps the create tab and draft.
    await page.evaluate(() => { window.__confirmResult = false; });
    await chooseSection(page, 'prerequisites');
    assert.equal(await currentSection(page), 'create');
    assert.equal(await page.getByLabel('Subject code', { exact: true }).inputValue(), 'DEMO900');
    // Accepted clears and switches to the manage pane.
    await page.evaluate(() => { window.__confirmResult = true; });
    await chooseSection(page, 'prerequisites');
    assert.equal(await currentSection(page), 'prerequisites');
    const relBox = await page.getByRole('heading', { name: 'Add relationship' }).boundingBox();
    assert.ok(relBox.y < page.viewportSize().height, 'relationship form requires scrolling at ' + width);
    await assertReadable(page, 'manage pane ' + width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.wrangler/uc24-horizontal-review/manage-viewport-${width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }, width);
  console.log(JSON.stringify({ passed, harness: 'Integrated AppRoutes /admin/curriculum, Clerk + API fixtures', live: 'No real Clerk, Neon or database touched' }));
} finally { await browser?.close(); server.close(); }
