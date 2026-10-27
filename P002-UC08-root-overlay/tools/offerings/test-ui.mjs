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
    await page.getByRole('heading', { name: 'Review your offerings' }).waitFor();
  }
  const confirmation = page => page.getByRole('checkbox', { name: /I confirm this is my student-reported list/ });
  async function save(page) {
    await review(page); await confirmation(page).check();
    await page.getByRole('button', { name: /^(Confirm and save|Retry save)$/ }).click();
    await page.getByRole('heading', { name: 'Your offerings are saved' }).waitFor();
  }
  async function noOverflow(page) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page must fit viewport');
  }
  async function stored(page) {
    return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), storageKey);
  }

  await check('empty state and provenance are explicit', async page => {
    await open(page);
    await page.getByText('Student-reported offerings — not verified by UTMSPACE', { exact: true }).waitFor();
    await page.getByText('No subjects selected yet', { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
    await noOverflow(page);
    await page.screenshot({ path: resolve(artifacts, 'desktop.png'), fullPage: true });
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
    assert.equal(await page.getByRole('heading', { name: 'Review your offerings' }).evaluate(element => element === document.activeElement), true);
    await confirmation(page).focus(); await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Confirm and save' }).focus(); await page.keyboard.press('Enter');
    await page.getByText('Saved in this browser for demonstration.', { exact: true }).waitFor();
    assert.equal((await stored(page))[semester1].length, 1);
    await page.reload(); await subject(page).waitFor();
    assert.equal(await subject(page).isChecked(), true);
  });
  await check('cancel edit preserves the saved set', async page => {
    await open(page); await subject(page).check(); await save(page);
    await page.getByRole('button', { name: 'Edit offerings' }).click();
    await subject(page, 'DEMO102').check();
    await page.getByRole('button', { name: 'Cancel changes' }).click();
    assert.equal(await subject(page).isChecked(), true);
    assert.equal(await subject(page, 'DEMO102').isChecked(), false);
    assert.equal((await stored(page))[semester1].length, 1);
    await page.reload(); await subject(page).waitFor();
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
    await review(page); await page.getByText('You are saving an empty offering list for this semester.', { exact: true }).waitFor();
    await confirmation(page).check(); await page.getByRole('button', { name: 'Confirm and save' }).click();
    await page.getByRole('heading', { name: 'Your offerings are saved' }).waitFor();
    assert.deepEqual((await stored(page))[semester1], []);
    await page.reload(); await subject(page).waitFor();
    assert.equal(await subject(page).isChecked(), false);
  });
  await check('semesters and years remain separate; short type is correct', async page => {
    await open(page); await subject(page).check(); await save(page);
    await page.getByLabel('Semester', { exact: true }).selectOption(semester3);
    await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), false);
    await page.getByText('Short semester', { exact: true }).waitFor();
    await subject(page, 'DEMO102').check(); await save(page);
    await page.getByLabel('Academic year', { exact: true }).selectOption('2027/2028');
    await subject(page).waitFor(); assert.equal(await subject(page, 'DEMO102').isChecked(), false);
    await page.getByLabel('Academic year', { exact: true }).selectOption('2026/2027');
    await subject(page).waitFor(); assert.equal(await subject(page, 'DEMO102').isChecked(), true);
    await page.getByLabel('Semester', { exact: true }).selectOption(semester1);
    await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), true);
  });
  await check('semester switch asks before discarding unsaved selections', async page => {
    await open(page); await subject(page).check();
    await page.getByLabel('Semester', { exact: true }).selectOption(semester2);
    await page.getByRole('button', { name: 'Keep editing' }).click();
    assert.equal(await subject(page).isChecked(), true);
    await page.getByLabel('Semester', { exact: true }).selectOption(semester2);
    await page.getByRole('button', { name: 'Discard changes and switch' }).click();
    await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), false);
    assert.deepEqual(await stored(page), {});
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
  for (const width of [320, 375, 768, 1024, 1440]) {
    await check('responsive selection and review at ' + width + 'px', async page => {
      await open(page); await noOverflow(page); await subject(page).check(); await review(page); await noOverflow(page);
      if (width === 375) await page.screenshot({ path: resolve(artifacts, 'mobile.png'), fullPage: true });
    }, width);
  }
  await check('200 percent equivalent zoom remains usable', async page => {
    await open(page);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await subject(page).check(); await review(page); await noOverflow(page);
  }, 1280);
  await check('primary actions, provenance and keyboard focus have adequate contrast', async page => {
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
    assert.ok(await contrast(page.locator('.offerings-provenance')) >= 4.5);
    await primary.focus();
    assert.ok(await contrast(primary, 'outlineColor', 'surrounding') >= 3);
    assert.equal(await primary.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
  });
  async function authResponses(page, profileState = 'COMPLETE', appRole = 'STUDENT') {
    let offeringRequests = 0;
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
      const id = new URL(request.url()).searchParams.get('semesterId');
      const context = {
        curriculum: { curriculumId: '401', name: 'Fictional auth integration fixture', programmeName: 'Test programme' },
        subjects: [{ curriculumSubjectId: '101', code: 'DEMO101', name: 'Programming foundations', creditHours: 3 }],
        semesters: [{ semesterId: semester1, academicYear: '2026/2027', semesterNo: 1 }],
        selection: id ? values.get(user + id) ?? { semesterId: id, curriculumSubjectIds: [] } : null,
      };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: context }) });
    });
    return () => offeringRequests;
  }
  await check('production page adapter redirects a signed-out session before offering requests', async page => {
    const count = await authResponses(page); await page.goto(base + '/auth-test?scenario=signed-out');
    await page.waitForURL(base + '/sign-in'); assert.equal(count(), 0);
  });
  await check('production page adapter requires completed profile before offering requests', async page => {
    const count = await authResponses(page, 'SETUP_REQUIRED'); await page.goto(base + '/auth-test?scenario=profile');
    await page.waitForURL(base + '/student/setup'); assert.equal(count(), 0);
  });
  await check('production page adapter denies staff roles without loading offerings', async page => {
    const count = await authResponses(page, 'NOT_APPLICABLE', 'COORDINATOR'); await page.goto(base + '/auth-test?scenario=staff');
    await page.getByRole('alert').waitFor(); assert.equal(count(), 0); assert.equal(await subject(page).count(), 0);
  });
  await check('production page adapter saves and reloads through authenticated client contract', async page => {
    await authResponses(page); await page.goto(base + '/auth-test?scenario=allowed');
    await subject(page).check(); await save(page);
    await page.reload(); await subject(page).waitFor(); assert.equal(await subject(page).isChecked(), true);
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
