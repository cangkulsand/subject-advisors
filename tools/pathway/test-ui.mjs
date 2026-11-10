// Real shared app with fictional, read-only Clerk/API fixtures. No live services.
import assert from 'node:assert/strict';
import { assertReadable } from '../ui/readability.mjs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { prepareIntegration } from '../integration/prepare.mjs';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
await prepareIntegration();
const output = await build({
  entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false,
  outdir: 'dist-auth/pathway-ui', jsx: 'automatic', loader: { '.png': 'dataurl' },
  alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' },
});
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const names = ['Foundations', 'Programming Techniques', 'Data Structures and Algorithms for Academic Applications', 'Advanced Computing',
  'Object Oriented Programming', 'Software Design', 'Network Foundations', 'Network Communications', 'Network Security', 'Applied Security',
  'Database Foundations', 'Database Applications'];
const statuses = ['COMPLETED', 'COMPLETED', 'LOCKED', 'LOCKED', 'REMAINING', 'LOCKED', 'EXEMPTED'];
const graph = {
  curriculumId: 900, curriculumVersion: 'FICTIONAL', programmeName: 'Fictional flowchart test programme', demo: true,
  nodes: Array.from({ length: 26 }, (_, index) => ({
    id: String(index), subjectCode: `DEMO${100 + index}`, subjectName: names[index] ?? `Fictional subject ${index + 1}`,
    creditHours: 3, isCompulsory: index < 14,
    subjectCategory: index < 14 ? 'CORE' : index < 18 ? 'ELECTIVE E1' : index < 22 ? 'UNIVERSITY' : index < 24 ? 'INDUSTRIAL TRAINING' : 'PROJECT',
    status: statuses[index] ?? 'REMAINING', grade: index < 2 ? 'A' : null, recognizedCredits: index < 2 ? 3 : null,
  })),
  edges: [[0, 1], [1, 2], [2, 3], [0, 3], [1, 4], [4, 5], [6, 7], [7, 8], [8, 9], [6, 9], [10, 11], [24, 25]].map(([source, target], index) => ({
    id: `e${index}`, source: String(source), target: String(target),
    requirementType: index === 4 ? 'RECOMMENDED' : index === 10 ? 'COREQUISITE' : 'MANDATORY',
  })),
};
const profile = {
  studentId: 1, studentName: 'FICTIONAL PATHWAY TEST', matricNo: null, learningCentreId: null, learningCentreLocked: false, curriculumId: 900,
  currentSemesterId: 1, weeklyWorkingHours: 0, availableStudyHours: 8,
  programmeCode: 'DEMO', programmeName: graph.programmeName, curriculumVersion: 'FICTIONAL',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
function fixture(path) {
  if (path === '/api/me' || path === '/api/auth/initialize') return {
    clerkUserId: 'user_test', appRole: 'STUDENT', roles: ['STUDENT'], availableRoles: ['STUDENT'],
    studentProfileState: 'COMPLETE', accessStatus: 'ACTIVE', profileState: 'COMPLETE', landingPath: '/student',
  };
  if (path === '/api/profile') return profile;
  if (path === '/api/profile/options') return { curricula: [], subjects: [], semesters: [], learningCentres: [] };
  if (path === '/api/academic-records') return [];
  if (path === '/api/pathway/graph') return graph;
  return {};
}
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(script);
  } else if (path.startsWith('/api/')) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: fixture(path) }));
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional Pathway Preview</title><style>${css}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
  }
});
const serve = process.argv.includes('--serve');
await new Promise(resolve => server.listen(serve ? 5183 : 0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
if (serve) {
  console.log(`Fictional pathway preview (no live data): ${base}/student/pathway`);
} else {
  let browser;
  let passed = 0;
  async function check(name, body, width = 1440) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/api\/(pathway|academic-records|profile)/.test(request.url()) && request.method() !== 'GET') writes.push(request.url());
    });
    await page.route('https://**/*', route => route.abort());
    try {
      await body(page);
      await assertReadable(page, name);
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      await page.screenshot({ path: 'dist-auth/pathway-ui/failure.png', fullPage: true });
      console.error(await page.evaluate(() => ({
        width: innerWidth, documentWidth: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('.pathway-page, .pathway-page *, .student-main-column')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(element => ({
          className: element.getAttribute('class'), width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right,
        })),
      })));
      throw error;
    } finally {
      await page.close();
    }
  }
  async function open(page) {
    await page.goto(`${base}/student/pathway`);
    await page.getByRole('group', { name: 'Prerequisite talent tree', exact: true }).waitFor();
    await page.waitForFunction(() => Number.parseInt(document.querySelector('output[aria-label="Zoom level"]')?.textContent ?? '0') > 5);
  }
  async function fitted(page) {
    await page.waitForFunction(() => innerWidth >= 1280 || Number.parseFloat(getComputedStyle(document.querySelector('.student-main-column')).marginLeft) === 0);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.pathway-canvas');
      return canvas && canvas.scrollWidth <= canvas.clientWidth + 1 && canvas.scrollHeight <= canvas.clientHeight + 1;
    });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(await page.locator('.pathway-map-legend').evaluate(element =>
      element.getBoundingClientRect().bottom <= document.querySelector('.pathway-canvas').getBoundingClientRect().top));
  }
  async function edgeAppearance(page, id) {
    return page.locator(`[data-edge-id="${id}"] .pathway-edge`).evaluate(element => {
      const style = getComputedStyle(element);
      const marker = element.getAttribute('marker-end');
      const markerId = marker.match(/#(.+)\)/)[1];
      return {
        colour: style.stroke, width: Number.parseFloat(style.strokeWidth), dash: style.strokeDasharray, marker,
        headColour: getComputedStyle(document.getElementById(markerId).querySelector('path')).fill,
      };
    });
  }
  try {
    await mkdir('dist-auth/pathway-ui', { recursive: true });
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    await check('desktop fits with top legends and groups only disconnected core/elective subjects', async page => {
      await open(page);
      await fitted(page);
      assert.equal(await page.locator('.pathway-node').count(), 26);
      assert.equal(await page.locator('.pathway-category-panel').count(), 3);
      const members = await page.locator('.pathway-category-panel').evaluateAll(panels => Object.fromEntries(panels.map(panel => {
        const box = panel.querySelector('rect');
        const x = box.x.baseVal.value, y = box.y.baseVal.value;
        const right = x + box.width.baseVal.value, bottom = y + box.height.baseVal.value;
        const codes = [...document.querySelectorAll('.pathway-node')].filter(node => {
          const matrix = node.transform.baseVal.consolidate().matrix;
          const rect = node.querySelector('rect');
          const cx = matrix.e + rect.width.baseVal.value / 2;
          const cy = matrix.f + rect.height.baseVal.value / 2;
          return cx > x && cx < right && cy > y && cy < bottom;
        }).map(node => node.querySelector('.pathway-node-code').textContent);
        return [panel.getAttribute('data-subject-group'), codes];
      })));
      assert.deepEqual(members, {
        CORE: ['DEMO112', 'DEMO113'],
        ELECTIVE: ['DEMO114', 'DEMO115', 'DEMO116', 'DEMO117'],
        OTHER: ['DEMO118', 'DEMO119', 'DEMO120', 'DEMO121', 'DEMO122', 'DEMO123'],
      });
      assert.equal(await page.locator('.pathway-edge.pathway-edge-corequisite').count(), 1);
      assert.equal(await page.locator('.pathway-edge.pathway-edge-recommended').count(), 1);
      await page.screenshot({ path: 'dist-auth/pathway-ui/desktop.png', fullPage: true });
    });
    await check('highlighting preserves original blue mandatory arrows and green completed paths', async page => {
      await open(page);
      const original = Object.fromEntries(await Promise.all(['e0', 'e1', 'e2', 'e3'].map(async id => [id, await edgeAppearance(page, id)])));
      const node = page.getByRole('button', { name: /^DEMO103 / });
      await node.focus();
      await page.keyboard.press('Enter');
      for (const id of ['e1', 'e2', 'e3']) {
        const edge = page.locator(`[data-edge-id="${id}"] .pathway-edge`);
        assert.ok((await edge.getAttribute('class')).includes('is-highlighted'));
        const highlighted = await edgeAppearance(page, id);
        assert.equal(highlighted.colour, original[id].colour);
        assert.equal(highlighted.colour, 'rgb(83, 110, 150)');
        assert.equal(highlighted.headColour, highlighted.colour);
        assert.equal(highlighted.marker, original[id].marker);
        assert.equal(highlighted.dash, original[id].dash);
        assert.ok(highlighted.width > original[id].width);
      }
      const completed = await edgeAppearance(page, 'e0');
      const completedColour = completed.colour;
      assert.equal(completedColour, 'rgb(46, 125, 50)');
      assert.equal(completedColour, original.e0.colour);
      assert.equal(completed.headColour, completedColour);
      assert.equal(completed.marker, original.e0.marker);
      assert.ok(completed.width > original.e0.width);
      await page.getByText('Completed path', { exact: true }).waitFor();
      assert.equal(await page.locator('.pathway-link-sample.is-completed').evaluate(element => getComputedStyle(element).borderTopColor), completedColour);
      assert.equal(await page.locator('.pathway-edge-halo').count(), graph.edges.length);
      await page.screenshot({ path: 'dist-auth/pathway-ui/highlighted.png', fullPage: true });
    });
    await check('recommended and corequisite paths keep their original colours and dash patterns when selected', async page => {
      await open(page);
      for (const [id, code] of [['e4', 'DEMO105'], ['e10', 'DEMO111']]) {
        const original = await edgeAppearance(page, id);
        assert.notEqual(original.dash, 'none');
        await page.getByRole('button', { name: new RegExp(`^${code} `) }).focus();
        await page.keyboard.press('Enter');
        const highlighted = await edgeAppearance(page, id);
        assert.equal(highlighted.colour, original.colour);
        assert.equal(highlighted.headColour, original.headColour);
        assert.equal(highlighted.marker, original.marker);
        assert.equal(highlighted.dash, original.dash);
        assert.ok(highlighted.width > original.width);
      }
    });
    await check('actual size, zoom, keyboard panning and fit work on a dense graph', async page => {
      await open(page);
      const canvas = page.getByRole('region', { name: 'Interactive academic pathway graph' });
      await page.getByRole('button', { name: 'Actual size', exact: true }).click();
      assert.equal(await page.getByLabel('Zoom level').textContent(), '100%');
      await canvas.focus();
      await page.keyboard.press('ArrowDown');
      assert.ok(await canvas.evaluate(element => element.scrollTop > 0));
      await page.keyboard.press('+');
      assert.equal(await page.getByLabel('Zoom level').textContent(), '115%');
      await page.keyboard.press('Home');
      await fitted(page);
      assert.equal(await canvas.evaluate(element => element.scrollTop), 0);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await page.getByRole('button', { name: 'Fit to view', exact: true }).click();
      await fitted(page);
    });
    await check('dragging the background pans without selecting a subject', async page => {
      await open(page);
      await page.getByRole('button', { name: 'Actual size', exact: true }).click();
      const canvas = page.locator('.pathway-canvas');
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + 8, box.y + 160);
      await page.mouse.down();
      await page.mouse.move(box.x + 8, box.y + 40, { steps: 5 });
      await page.mouse.up();
      assert.ok(await canvas.evaluate(element => element.scrollTop > 0));
      assert.equal(await page.locator('.pathway-node.is-selected').count(), 0);
    });
    await check('keyboard selection shows full names and prerequisite status; Escape clears selection', async page => {
      await open(page);
      const node = page.getByRole('button', { name: /^DEMO102 / });
      await node.focus();
      await page.keyboard.press('Enter');
      const details = page.getByRole('complementary', { name: 'Selected subject details' });
      await details.getByRole('heading', { name: `DEMO102 \u2014 ${names[2]}` }).waitFor();
      await details.getByText('Mandatory prerequisite \u00b7 Completed', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await details.count(), 0);
    });
    await check('mobile fits on load and resize, retains an accessible list and resets demo selection', async page => {
      await open(page);
      await fitted(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await fitted(page);
      await page.screenshot({ path: 'dist-auth/pathway-ui/mobile.png', fullPage: true });
      const node = page.getByRole('button', { name: /^DEMO100 / });
      await node.focus();
      await page.keyboard.press('Space');
      await page.getByRole('complementary', { name: 'Selected subject details' }).waitFor();
      await page.getByRole('button', { name: 'Preview demo', exact: true }).click();
      assert.equal(await page.locator('.pathway-node.is-selected').count(), 0);
      await page.getByRole('button', { name: 'Show my real pathway', exact: true }).click();
      await page.getByRole('button', { name: 'Switch to list view', exact: true }).click();
      const list = page.getByRole('list', { name: 'Curriculum subjects' });
      await list.getByText('Corequisite: DEMO110 Database Foundations', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });
    await check('narrow mobile loads the graph directly and can zoom from overview to readable size', async page => {
      await open(page);
      await fitted(page);
      await page.getByRole('button', { name: 'Actual size', exact: true }).click();
      assert.equal(await page.getByLabel('Zoom level').textContent(), '100%');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('button', { name: 'Fit to view', exact: true }).click();
      await fitted(page);
    }, 320);
    await check('empty curriculum and retryable API errors remain honest; demo is available offline', async page => {
      await page.route('**/api/pathway/graph', route => route.fulfill({
        contentType: 'application/json', body: JSON.stringify({ data: { ...graph, nodes: [], edges: [] } }),
      }));
      await page.goto(`${base}/student/pathway`);
      await page.getByRole('heading', { name: 'No subjects in your curriculum yet' }).waitFor();
      await page.unroute('**/api/pathway/graph');
      await page.route('**/api/pathway/graph', route => route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Test pathway unavailable.' } }),
      }));
      await page.reload();
      await page.getByRole('alert').getByText('Test pathway unavailable.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Preview demo', exact: true }).click();
      await page.getByText(/Demonstration data only/).waitFor();
      await page.getByRole('button', { name: 'Show my real pathway', exact: true }).click();
      await page.unroute('**/api/pathway/graph');
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('group', { name: 'Prerequisite talent tree', exact: true }).waitFor();
    }, 390);
    console.log(`${passed} pathway browser checks passed; screenshots in dist-auth/pathway-ui/.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
