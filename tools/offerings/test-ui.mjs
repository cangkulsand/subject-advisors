import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = resolve(root, 'dist-offerings/review');
await mkdir(artifacts, { recursive: true });
const result = await build({
  entryPoints: { demo: resolve(root, 'tools/offerings/demo/main.tsx'), test: resolve(root, 'apps/web/src/features/offerings/testing/ui-harness.tsx'), auth: resolve(root, 'apps/web/src/features/offerings/testing/integration-harness.tsx') },
  outdir: resolve(root, 'dist-offerings/ui-test'), bundle: true, write: false, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  alias: { '@clerk/react': resolve(root, 'apps/web/src/features/offerings/testing/clerk-mock.tsx') },
});
function asset(name) {
  return result.outputFiles.find(file => file.path.endsWith(name))?.text ?? '';
}
const server = createServer((req, res) => {
  if (['/demo.js', '/test.js', '/auth.js'].includes(req.url)) { res.setHeader('Content-Type', 'text/javascript'); res.end(asset(req.url.slice(1))); return; }
  const entry = req.url?.startsWith('/auth-test?') ? 'auth' : req.url?.startsWith('/test?') ? 'test' : 'demo';
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>UC08 browser test</title><style>' + asset(entry + '.css') +
    '</style></head><body><div id="root"></div><script type="module" src="/' + entry + '.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const storageKey = 'p002.uc08.fictional-demo.v2';
const semester1 = '201';
const semester2 = '202';
const semester3 = '203';
let browser;
let passed = 0;
const consoleErrors = [];
try {
  browser = await chromium.launch({ headless: true });
  async function check(name, body, width = 1280) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => consoleErrors.push(name + ': ' + error.message));
    try { await body(page); passed++; console.log('PASS ' + name); }
    catch (error) { await page.screenshot({ path: resolve(artifacts, 'failure.png'), fullPage: true }); throw error; }
    finally { await context.close(); }
  }
  const subject = (page, code = 'DEMO101') => page.getByRole('checkbox', { name: new RegExp('^' + code + ' ') });
  async function open(page, path = '/student/offerings') {
    await page.goto(base + path);
    await subject(page).waitFor();
  }
  async function review(page) {
    await page.getByRole('button', { name: 'Review offerings' }).click();
    await page.getByRole('checkbox', { name: /I confirm this is my student-reported list/ }).waitFor();
    assert.equal(await page.locator('.offerings-review-help').count(), 0);
  }
  const confirmation = page => page.getByRole('checkbox', { name: /I confirm this is my student-reported list/ });
  async function save(page) {
    await review(page); await confirmation(page).check();
    await page.getByRole('button', { name: /^(Confirm and save|Retry save)$/ }).click();
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    assert.equal(await page.locator('.offerings-review-help').count(), 0);
  }
  async function noOverflow(page) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page must fit viewport');
  }
  async function stored(page) {
    return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), storageKey);
  }

  await check('empty offerings state remains explicit', async page => {
    await open(page);
    await page.getByText('No subjects selected yet', { exact: true }).waitFor();
    assert.equal(await page.locator('.offerings-save-state').innerText(), 'No saved offerings for this semester');
    assert.equal(await subject(page).isChecked(), false);
    await noOverflow(page);
    await page.screenshot({ path: resolve(artifacts, 'desktop.png'), fullPage: true });
  });
  await check('academic history, distinct IDs, ambiguity and category metadata are explicit', async page => {
    await page.goto(base + '/test?scenario=rich');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    assert.equal(await page.locator('.offerings-save-state').innerText(), '✓ Saved');
    const normalSummary = await page.locator('.offerings-category-summary').innerText();
    assert.match(normalSummary, /Core\s+4 \/ 7 · 1 unclear/);
    assert.match(normalSummary, /E1\s+1 \/ 2/);
    assert.match(normalSummary, /E2\s+0 \/ 1/);
    assert.equal(await page.getByRole('columnheader', { name: 'History' }).count(), 0, 'History is not a catalogue table column');
    assert.equal(await subject(page).count(), 0, 'saved list opens in summary mode');
    assert.equal(await page.locator('.offerings-selected-list').getByText('DEMO204', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await page.getByLabel('Find a subject').waitFor();
    assert.equal(await page.locator('.offerings-degree-progress').count(), 0);
    assert.equal(await page.getByRole('progressbar', { name: 'Recorded credit progress' }).count(), 0, 'ambiguous history cannot claim complete progress');
    assert.equal(await subject(page, 'DEMO101').count(), 0, 'known Taken subject leaves the default remaining list');
    assert.equal(await subject(page, 'DEMO102').count(), 0, 'known Exempted subject leaves the default remaining list');
    assert.equal(await subject(page, 'DEMO201').count(), 1, 'Failed remains available');
    assert.equal(await subject(page, 'DEMO202').count(), 1, 'Withdrawn remains available');
    assert.equal(await subject(page, 'DEMO204').count(), 0, 'saved Taken selection is hidden from the default list');
    await page.getByRole('button', { name: 'Remove DEMO204' }).waitFor();
    assert.equal(await subject(page, 'DEMO206').count(), 1, 'unknown category remains selectable as Other / unknown');
    assert.match(normalSummary, /Some history is ambiguous and is not included in the recorded counts/);
    assert.match(await subject(page, 'DEMO206').evaluate(input => input.closest('tr').innerText), /History ambiguous/);
    assert.deepEqual(await page.locator('.offerings-subject-table th:visible').allTextContents(), ['Select', 'Subject', 'Prerequisites', 'Category', 'Credits'], 'desktop catalogue adds a dedicated prerequisite column and no History column');
    const categoryRanks = await page.locator('.offerings-subject-table tbody tr').evaluateAll(rows => rows.map(row => {
      const category = [...row.querySelector('.offerings-category-pill').classList].find(name => name.startsWith('offerings-category-pill-'))?.slice('offerings-category-pill-'.length);
      const rank = ['core', 'e1', 'e2', 'u1', 'u2'].indexOf(category ?? '');
      return rank < 0 ? 5 : rank;
    }));
    assert.deepEqual(categoryRanks, [...categoryRanks].sort((left, right) => left - right), 'remaining rows are grouped by category before code');
    const e1Color = await page.locator('.offerings-category-pill-e1').first().evaluate(element => getComputedStyle(element).backgroundColor);
    const e2Color = await page.locator('.offerings-category-pill-e2').first().evaluate(element => getComputedStyle(element).backgroundColor);
    assert.notEqual(e1Color, e2Color, 'category pills use distinct colors');
    await page.screenshot({ path: resolve(artifacts, 'desktop-guided.png'), fullPage: true });
    await page.getByLabel('Find a subject').fill('unknown category');
    await subject(page, 'DEMO207').waitFor();
    assert.equal(await subject(page, 'DEMO204').count(), 0, 'search hides rows without changing saved selection');
    assert.match(await page.locator('.offerings-category-summary').innerText(), /Core\s+4 \/ 7 · 1 unclear/, 'category summary is independent of search');
    await page.getByRole('button', { name: 'Review offerings' }).click();
    await page.getByText(/selected subjects? are hidden by the current search/).waitFor();
    assert.equal(await page.locator('.offerings-review-list').getByText('DEMO204', { exact: true }).count(), 1);
    await page.getByRole('checkbox', { name: /I confirm this is my student-reported list/ }).check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    const calls = await page.evaluate(() => window.__offeringSaveCalls);
    assert.deepEqual(calls[0], { semesterId: '201', curriculumSubjectIds: ['507', '509'] }, 'PUT retains curriculumSubjectId values');
  });
  await check('configured prerequisite metadata uses the full catalogue in selection and review', async page => {
    await page.goto(base + '/test?scenario=rich');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    const source = page.locator('.offerings-subject-table tbody tr').filter({ has: subject(page, 'DEMO201') });
    assert.deepEqual(await page.locator('.offerings-subject-table th:visible').allTextContents(), ['Select', 'Subject', 'Prerequisites', 'Category', 'Credits']);
    const desktopMetadata = source.locator('td.offerings-prerequisites-column:visible .offerings-prerequisites');
    assert.deepEqual(await desktopMetadata.locator('.offerings-prerequisite-label').allTextContents(), ['Prerequisites', 'Corequisites', 'Recommended preparation']);
    assert.equal(await source.locator('.offerings-prerequisite-inline:visible').count(), 0, 'inline duplicate is removed from desktop layout and accessibility tree');
    assert.deepEqual((await desktopMetadata.locator('.offerings-prerequisite-group').first().locator('li').allTextContents()).map(text => text.trim()), [
      'DEMO207Unknown category', 'DEMO209Unclassified two-credit elective',
    ], 'hidden semester target resolves from the full catalogue and targets sort by subject code');
    const checkbox = subject(page, 'DEMO201');
    await checkbox.focus(); await checkbox.press('Space');
    assert.equal(await checkbox.isChecked(), true, 'the original keyboard checkbox control remains usable');
    await noOverflow(page);
    await page.screenshot({ path: resolve(artifacts, 'prerequisites-desktop.png'), fullPage: true });
    await page.getByLabel('Find a subject').fill('data structures');
    assert.equal(await subject(page, 'DEMO207').count(), 0, 'search hides unrelated prerequisite target rows');
    assert.equal(await subject(page, 'DEMO209').count(), 0, 'semester filter target stays hidden from selectable catalogue');
    assert.match(await desktopMetadata.innerText(), /DEMO207[\s\S]*DEMO209/, 'full-catalogue relationship labels remain available when target rows are filtered');
    await page.getByRole('button', { name: 'Clear search' }).click();
    await review(page);
    const selected = page.locator('.offerings-review-list > li').filter({ hasText: 'DEMO204' });
    assert.match(await selected.locator('.offerings-prerequisites').innerText(), /Prerequisites[\s\S]*DEMO102[\s\S]*Corequisites[\s\S]*DEMO209[\s\S]*Recommended preparation[\s\S]*DEMO201/);
    const unavailable = page.locator('.offerings-review-list > li').filter({ has: page.locator('strong').filter({ hasText: 'DEMO206' }) });
    assert.match(await unavailable.locator('.offerings-prerequisites').innerText(), /Prerequisite information unavailable/);
    await confirmation(page).check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    assert.match(await page.locator('.offerings-save-state').innerText(), /Saved$/, 'unavailable metadata does not block save');
    await page.reload();
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    const reloadedSavedSource = page.locator('.offerings-review-list > li').filter({ has: page.locator('strong').filter({ hasText: 'DEMO204' }) });
    assert.match(await reloadedSavedSource.locator('.offerings-prerequisites').innerText(), /DEMO102[\s\S]*DEMO209[\s\S]*DEMO201/, 'saved selection revisit retains the source subject metadata');
  });
  await check('known-empty metadata is distinct from unavailable in narrow catalogue layout', async page => {
    await page.goto(base + '/test?scenario=rich-short');
    await page.getByLabel('Find a subject').waitFor();
    const row = page.locator('.offerings-subject-table tbody tr').filter({ has: subject(page, 'DEMO209') });
    await row.locator('.offerings-prerequisite-inline:visible').getByText('-', { exact: true }).waitFor();
    assert.equal(await subject(page, 'DEMO209').getAttribute('aria-label'), 'DEMO209 Unclassified two-credit elective');
    await noOverflow(page);
    await page.screenshot({ path: resolve(artifacts, 'prerequisites-mobile.png'), fullPage: true });
  }, 360);
  await check('saved mobile review displays configured metadata and keeps edit controls', async page => {
    await page.goto(base + '/test?scenario=rich');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    const saved = page.locator('.offerings-review-list > li').filter({ hasText: 'DEMO204' });
    await saved.locator('.offerings-prerequisite-label').first().waitFor();
    assert.match(await saved.locator('.offerings-prerequisites').innerText(), /Recommended preparation[\s\S]*DEMO201/);
    assert.equal(await page.getByRole('button', { name: 'Edit offerings' }).isVisible(), true);
    await noOverflow(page);
    await page.screenshot({ path: resolve(artifacts, 'prerequisites-saved-mobile.png'), fullPage: true });
  }, 360);
  await check('nonempty prerequisite groups wrap in a 320px saved view', async page => {
    await page.goto(base + '/test?scenario=rich');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    const saved = page.locator('.offerings-review-list > li').filter({ has: page.locator('strong').filter({ hasText: 'DEMO204' }) });
    assert.match(await saved.locator('.offerings-prerequisites').innerText(), /Prerequisites[\s\S]*Recommended preparation/);
    await noOverflow(page);
    await page.screenshot({ path: resolve(artifacts, 'prerequisites-saved-mobile-320.png'), fullPage: true });
  }, 320);
  await check('responsive prerequisite column switches at 900px with one visible rendering', async page => {
    await page.goto(base + '/test?scenario=rich');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    const source = page.locator('.offerings-subject-table tbody tr').filter({ has: subject(page, 'DEMO201') });
    for (const width of [1280, 1024, 901, 900, 360, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const headers = page.locator('.offerings-subject-table th:visible');
      if (width > 900) {
        assert.deepEqual(await headers.allTextContents(), ['Select', 'Subject', 'Prerequisites', 'Category', 'Credits'], `${width}px uses five table columns`);
        assert.equal(await source.locator('td.offerings-prerequisites-column:visible .offerings-prerequisites').count(), 1, `${width}px shows prerequisites in the dedicated column`);
        assert.equal(await source.locator('.offerings-prerequisite-inline:visible').count(), 0, `${width}px hides the inline duplicate accessibly`);
      } else {
        assert.deepEqual(await headers.allTextContents(), ['Select', 'Subject', 'Category', 'Credits'], `${width}px keeps four visible table columns`);
        assert.equal(await source.locator('td.offerings-prerequisites-column:visible').count(), 0, `${width}px hides the dedicated column accessibly`);
        assert.equal(await source.locator('.offerings-prerequisite-inline:visible .offerings-prerequisites').count(), 1, `${width}px shows prerequisites beneath the name`);
      }
      await noOverflow(page);
      if (width === 1280) await page.screenshot({ path: resolve(artifacts, 'prerequisites-column-desktop.png'), fullPage: true });
      if (width === 1024) await page.screenshot({ path: resolve(artifacts, 'prerequisites-column-1024.png'), fullPage: true });
      if (width === 360) await page.screenshot({ path: resolve(artifacts, 'prerequisites-column-mobile.png'), fullPage: true });
    }
  });
  await check('Normal and Short semester predicates preserve SECJ3032 exception', async page => {
    await page.goto(base + '/test?scenario=rich');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await page.getByLabel('Find a subject').waitFor();
    assert.equal(await subject(page, 'SECJ3032').count(), 1);
    assert.equal(await subject(page, 'DEMO208').count(), 0, 'two-credit subject uses the configured Normal display predicate');
    assert.equal(await subject(page, 'DEMO209').count(), 0, 'two-credit category-missing subject still follows the definite Normal rule');
    assert.equal(await page.getByLabel('Academic year').count(), 0, 'period controls are moved to the profile');
    assert.equal(await page.getByLabel('Semester', { exact: true }).count(), 0, 'offerings uses the saved profile semester');
    assert.equal(await page.getByRole('link', { name: 'Edit academic profile' }).getAttribute('href'), '/student/profile');
    await page.goto(base + '/test?scenario=rich-short');
    await page.getByLabel('Find a subject').waitFor();
    const shortSummary = await page.locator('.offerings-category-summary').innerText();
    assert.match(shortSummary, /U1\s+0 \/ 1/);
    assert.match(shortSummary, /U2\s+1 \/ 1/);
    assert.doesNotMatch(shortSummary, /Core|E1|E2/);
    assert.equal(await subject(page, 'SECJ3032').count(), 0, 'SECJ3032 is the explicit Short exception');
    assert.equal(await subject(page, 'DEMO208').count(), 1);
    assert.equal(await subject(page, 'DEMO209').count(), 1, 'two-credit category-missing subject follows the definite Short rule');
    assert.equal(await subject(page, 'DEMO203').count(), 1, 'Elective Umum U1 uses curriculum metadata');
    assert.equal(await subject(page, 'DEMO101').count(), 0, 'history remains excluded by default in Short');
  });
  await check('unavailable history is labeled unknown without suppressing records', async page => {
    await page.goto(base + '/test?scenario=history-unavailable');
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    assert.match(await page.locator('.offerings-category-summary').innerText(), /Core\s+History unavailable/);
    assert.doesNotMatch(await page.locator('.offerings-category-summary').innerText(), /Core\s+0 \/ 7/);
    await page.getByText('Academic history is unavailable. Subjects with a recorded completed or exempted status cannot be identified.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('progressbar', { name: 'Recorded credit progress' }).count(), 0);
    await subject(page, 'DEMO101').waitFor();
    assert.equal(await page.getByRole('columnheader', { name: 'History' }).count(), 0);
    assert.equal(await subject(page, 'DEMO101').count(), 1, 'unavailable history does not hide catalogue rows');
  });
  await check('degree progress is displayed on Subject Records, while Offerings keeps history and saved-selection context', async page => {
    await page.goto(base + '/test?scenario=progress');
    assert.equal(await page.getByRole('heading', { name: 'Degree Progress' }).count(), 0);
    assert.equal(await page.locator('.offerings-degree-progress').count(), 0);
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
  });
  await check('failed rich save preserves hidden saved identifiers in review and retry', async page => {
    await page.goto(base + '/test?scenario=rich-save-fail');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await page.getByLabel('Find a subject').waitFor();
    await page.getByLabel('Find a subject').fill('DEMO207');
    await page.getByRole('button', { name: 'Review offerings' }).click();
    await page.getByText(/selected subjects? are hidden by the current search/).waitFor();
    await page.getByRole('checkbox', { name: /I confirm this is my student-reported list/ }).check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Your draft is still here.', { exact: false }).count(), 1);
    await page.getByRole('button', { name: 'Retry save' }).click();
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    const calls = await page.evaluate(() => window.__offeringSaveCalls);
    assert.deepEqual(calls[0], { semesterId: '201', curriculumSubjectIds: ['507', '509'] });
  });
  await check('search keeps selection; keyboard selects and removes subjects', async page => {
    await open(page);
    await subject(page).focus(); await page.keyboard.press('Space');
    assert.equal(await subject(page).isChecked(), true);
    assert.equal(await subject(page).evaluate(input => input.matches(':focus-visible')), true);
    await page.getByLabel('Find a subject').fill('data structures');
    assert.equal(await subject(page).count(), 0);
    await subject(page, 'DEMO201').check();
    await page.getByRole('button', { name: 'Remove DEMO101' }).click();
    await page.getByRole('button', { name: 'Clear search' }).click();
    assert.equal(await subject(page).isChecked(), false);
    assert.equal(await subject(page, 'DEMO201').isChecked(), true);
    await page.getByLabel('Find a subject').fill('unfindable');
    await page.getByRole('heading', { name: 'No matching subjects' }).waitFor();
  });
  await check('confirmation required, keyboard save and persistence after reload', async page => {
    await open(page); await subject(page).check(); await review(page);
    assert.equal(await page.getByRole('button', { name: 'Confirm and save' }).isDisabled(), true);
    await confirmation(page).focus(); await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Confirm and save' }).focus(); await page.keyboard.press('Enter');
    await page.getByText('Saved in this browser for demonstration.', { exact: true }).waitFor();
    assert.equal((await stored(page))[semester1].length, 1);
    await page.reload(); await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    assert.equal(await page.locator('.offerings-save-state').innerText(), '✓ Saved');
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), true);
  });
  await check('cancel edit returns to the saved view and preserves the saved set', async page => {
    await open(page); await subject(page).check(); await save(page);
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await subject(page, 'DEMO102').check();
    await page.getByRole('button', { name: 'Cancel changes' }).click();
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    assert.equal(await page.locator('.offerings-selected-list').getByText('DEMO101', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    assert.equal(await subject(page).isChecked(), true);
    assert.equal(await subject(page, 'DEMO102').isChecked(), false);
    assert.equal((await stored(page))[semester1].length, 1);
    await page.reload(); await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await subject(page).waitFor();
    assert.equal(await subject(page, 'DEMO102').isChecked(), false);
  });
  await check('failed save retains prior storage and draft, then retry works', async page => {
    await open(page); await subject(page).check(); await save(page);
    await page.getByRole('button', { name: 'Edit offerings' }).click(); await subject(page, 'DEMO102').check();
    await page.getByText('Prototype tools', { exact: true }).click();
    await page.getByRole('button', { name: 'Fail next save' }).click();
    await review(page); await confirmation(page).check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal((await stored(page))[semester1].length, 1);
    await page.getByRole('button', { name: 'Back to selection' }).click();
    assert.equal(await subject(page, 'DEMO102').isChecked(), true);
    await save(page);
    assert.equal((await stored(page))[semester1].length, 2);
  });
  await check('empty confirmed replacement removes every saved offering', async page => {
    await open(page); await subject(page).check(); await save(page);
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await review(page); await page.getByText('No reported offerings. Future recommendations need subject offerings to work from.', { exact: true }).waitFor();
    await confirmation(page).check(); await page.getByRole('button', { name: 'Confirm and save' }).click();
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    assert.equal(await page.locator('.offerings-save-state').innerText(), '✓ Saved');
    assert.equal(await page.locator('.offerings-review-help').count(), 0);
    assert.deepEqual((await stored(page))[semester1], []);
    await page.reload(); await subject(page).waitFor();
    assert.equal(await subject(page).isChecked(), false);
  });
  await check('offerings period is pinned to profile and does not expose period selectors', async page => {
    await open(page); await subject(page).check(); await save(page);
    assert.equal(await page.getByLabel('Academic year').count(), 0);
    assert.equal(await page.getByLabel('Semester', { exact: true }).count(), 0);
    assert.equal((await stored(page))[semester1].length, 1);
    const editProfile = page.getByRole('link', { name: 'Edit academic profile' });
    await editProfile.waitFor();
    assert.equal((await page.locator('.offerings-current-semester').textContent()).trim(), 'Edit academic profile');
  });
  await check('simulated loading failure has a successful recovery path', async page => {
    await open(page); await page.getByText('Prototype tools', { exact: true }).click();
    await page.getByRole('button', { name: 'Simulate loading error' }).click();
    await page.getByRole('alert').waitFor();
    await page.getByRole('button', { name: 'Retry loading' }).click();
    await subject(page).waitFor();
  });
  for (const [scenario, link] of [['forbidden', null], ['profile', 'Complete academic profile'], ['session', 'Sign in']]) {
    await check(scenario + ' renders safe recovery without private catalogue', async page => {
      await page.goto(base + '/test?scenario=' + scenario);
      await page.getByRole('alert').waitFor();
      assert.equal(await subject(page).count(), 0);
      if (link) await page.getByRole('link', { name: link, exact: true }).waitFor();
    });
  }
  await check('loading, missing catalogue and missing semesters have explicit states', async page => {
    await page.goto(base + '/test?scenario=loading');
    await page.getByRole('status').filter({ hasText: 'Loading your curriculum' }).waitFor();
    await page.goto(base + '/test?scenario=empty-catalogue');
    await page.getByRole('heading', { name: 'No curriculum subjects available' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Review offerings' }).isDisabled(), true);
    await page.goto(base + '/test?scenario=empty-semesters');
    await page.getByRole('heading', { name: 'No semesters configured' }).waitFor();
  });
  for (const width of [320, 375, 768, 800, 1024, 1440]) {
    await check('responsive selection and review at ' + width + 'px', async page => {
      await open(page); await noOverflow(page);
      if (width === 800) assert.equal(await page.locator('.offerings-table-scroll').evaluate(element => element.scrollWidth > element.clientWidth), true, 'tablet table scroll stays inside its labeled region');
      await subject(page).check(); await review(page); await noOverflow(page);
      if (width === 375) await page.screenshot({ path: resolve(artifacts, 'mobile.png'), fullPage: true });
    }, width);
  }
  await check('category summary and table fit mobile 375px without page overflow', async page => {
    await page.goto(base + '/test?scenario=rich');
    await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await page.getByLabel('Find a subject').waitFor();
    await noOverflow(page);
    assert.equal(await page.locator('.offerings-category-summary').isVisible(), true);
    assert.equal(await page.getByRole('columnheader', { name: 'History' }).count(), 0);
    const tableScroller = page.locator('.offerings-table-scroll');
    assert.equal(await tableScroller.evaluate(element => element.scrollWidth > element.clientWidth), true, 'table uses a local horizontal scroller');
    assert.equal(await tableScroller.getAttribute('tabindex'), '0', 'table scroller is keyboard focusable');
    await page.screenshot({ path: resolve(artifacts, 'mobile-guided-375.png'), fullPage: true });
    await page.getByLabel('Find a subject').fill('programming');
    await noOverflow(page);
    await page.getByRole('button', { name: 'Review offerings' }).click();
    await noOverflow(page);
  }, 375);
  await check('200 percent equivalent zoom remains usable', async page => {
    await open(page);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await subject(page).check(); await review(page); await noOverflow(page);
  }, 1280);
  await check('primary actions and keyboard focus have adequate contrast', async page => {
    await open(page);
    const primary = page.getByRole('button', { name: 'Review offerings' });
    async function contrast(locator, foreground = 'color', background = 'backgroundColor') {
      return locator.evaluate((element, props) => {
        const style = getComputedStyle(element);
        const luminance = color => {
          const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
            .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const backgroundColor = props.background === 'surrounding'
          ? getComputedStyle(element.closest('.offerings-card')).backgroundColor : style[props.background];
        const a = luminance(style[props.foreground]); const b = luminance(backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      }, { foreground, background });
    }
    assert.ok(await contrast(primary) >= 4.5);
    await primary.hover(); assert.ok(await contrast(primary) >= 4.5);
    await primary.focus();
    assert.ok(await contrast(primary, 'outlineColor', 'surrounding') >= 3);
    assert.equal(await primary.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
  });
  async function authResponses(page, profileState = 'COMPLETE', appRole = 'STUDENT') {
    let offeringRequests = 0;
    let currentSemester = semester1;
    const values = new Map();
    await page.route('**/api/me', route => {
      const user = route.request().headers().authorization?.includes('test_student_b') ? 'test_student_b' : 'test_student_a';
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: {
        clerkUserId: user, appRole, accessStatus: 'ACTIVE', profileState, landingPath: profileState === 'COMPLETE' ? '/student' : '/student/setup',
      } }) });
    });
    await page.route('**/api/semester-offerings*', async route => {
      offeringRequests++;
      const request = route.request();
      const user = request.headers().authorization?.includes('test_student_b') ? 'test_student_b' : 'test_student_a';
      assert.ok(request.headers().authorization?.startsWith('Bearer test-only-'));
      if (request.method() === 'PUT') {
        const input = request.postDataJSON(); values.set(user + input.semesterId, input);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: input }) });
      }
      const id = new URL(request.url()).searchParams.get('semesterId') ?? currentSemester;
      const context = {
        curriculum: { curriculumId: '401', name: 'Fictional auth integration fixture', programmeName: 'Test programme' },
        subjects: [{ curriculumSubjectId: '101', code: 'DEMO101', name: 'Programming foundations', creditHours: 3 }],
        currentSemesterId: currentSemester,
        semesters: [{ semesterId: semester1, academicYear: '2026/2027', semesterNo: 1 }, { semesterId: semester2, academicYear: '2026/2027', semesterNo: 2 }],
        selection: values.get(user + id) ?? { semesterId: id, curriculumSubjectIds: [] },
      };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: context }) });
    });
    return { count: () => offeringRequests, setSemester: async id => {
      currentSemester = id;
      // A successful profile PUT clears these academic snapshots in the real profile client.
      await page.evaluate(() => { for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key?.startsWith('subject-advisors.academic.v1:')) sessionStorage.removeItem(key); } });
    }, state: () => ({ currentSemester, selections: [...values.entries()] }) };
  }
  await check('production page adapter redirects a signed-out session before offering requests', async page => {
    const fixture = await authResponses(page); await page.goto(base + '/auth-test?scenario=signed-out');
    await page.waitForURL(base + '/sign-in'); assert.equal(fixture.count(), 0);
  });
  await check('production page adapter requires completed profile before offering requests', async page => {
    const fixture = await authResponses(page, 'SETUP_REQUIRED'); await page.goto(base + '/auth-test?scenario=profile');
    await page.waitForURL(base + '/student/setup'); assert.equal(fixture.count(), 0);
  });
  await check('production page adapter denies staff roles without loading offerings', async page => {
    const fixture = await authResponses(page, 'NOT_APPLICABLE', 'COORDINATOR'); await page.goto(base + '/auth-test?scenario=staff');
    await page.getByRole('alert').waitFor(); assert.equal(fixture.count(), 0); assert.equal(await subject(page).count(), 0);
  });
  await check('production page adapter saves and reloads through authenticated client contract', async page => {
    const fixture = await authResponses(page); await page.goto(base + '/auth-test?scenario=allowed');
    await subject(page).check(); await save(page);
    await page.reload(); await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), true, JSON.stringify(fixture.state()));
  });
  await check('production page adapter retains prior semester offerings when the profile period changes', async page => {
    const fixture = await authResponses(page); await page.goto(base + '/auth-test?scenario=allowed');
    await subject(page).check(); await save(page);
    await fixture.setSemester(semester2); await page.reload(); await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), false);
    await fixture.setSemester(semester1); await page.reload(); await page.getByRole('button', { name: 'Edit offerings' }).waitFor();
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), true, JSON.stringify(fixture.state()));
  });
  await check('production page adapter removes the previous student draft on session change', async page => {
    await authResponses(page); await page.goto(base + '/auth-test?scenario=session-switch');
    await subject(page).check(); await page.getByRole('button', { name: 'Switch test student' }).click();
    await page.getByText('No subjects selected yet', { exact: true }).waitFor();
    assert.equal(await subject(page).isChecked(), false);
  });
  assert.deepEqual(consoleErrors, []);
  console.log(`${passed} browser checks passed. Screenshots: dist-offerings/review/. Fictional fixtures only.`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
