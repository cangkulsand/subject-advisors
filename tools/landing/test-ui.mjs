// Public landing page checks using the real AppRoutes/local shell with test-only Clerk.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
await mkdir('.wrangler/landing-review', { recursive: true });
const output = await build({
  entryPoints: ['tools/auth/local/main.tsx'], bundle: true, write: false,
  outdir: '.wrangler/landing-review', jsx: 'automatic', loader: { '.png': 'dataurl' },
  alias: { '@clerk/react': resolve('apps/web/src/features/auth/testing/clerk-mock.tsx') },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '"TEST_ONLY_PUBLIC_KEY"' },
});
const script = output.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    res.statusCode = 500;
    res.end('Unexpected public page API request');
  } else if (req.url === '/app.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(script);
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [300, 320, 375, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
    await page.goto(base + '/');
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('heading', { name: 'Make your next step clear.' }).waitFor();
    await page.locator('.landing-visual img').evaluate(image => image.decode());
    const measurements = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      naturalImageWidth: document.querySelector('.landing-visual img')?.naturalWidth,
      intrinsicWidth: document.querySelector('.landing-visual img')?.getAttribute('width'),
      imageBottom: document.querySelector('.landing-visual img')?.getBoundingClientRect().bottom,
      footerTop: document.querySelector('.landing-footer')?.getBoundingClientRect().top,
      aboutSection: !!document.querySelector('.landing-about'),
      workspaceSection: !!document.querySelector('.landing-workspace'),
      footerVisible: document.querySelector('.landing-footer')?.getBoundingClientRect().width,
      anchorTargets: [...document.querySelectorAll('.landing-nav a')].map(link => !!document.querySelector(link.getAttribute('href'))),
    }));
    assert.ok(measurements.scrollWidth <= measurements.clientWidth, `horizontal overflow at ${width}px`);
    assert.ok(measurements.naturalImageWidth > 0, `hero image did not load at ${width}px`);
    assert.equal(measurements.intrinsicWidth, '1452');
    assert.ok(measurements.imageBottom <= measurements.footerTop, `hero image overlaps footer at ${width}px`);
    assert.ok(measurements.footerVisible > 0, `footer missing at ${width}px`);
    assert.equal(measurements.workspaceSection, false);
    assert.equal(measurements.aboutSection, false);
    assert.deepEqual(measurements.anchorTargets, [true]);
    assert.deepEqual(apiRequests, [], `public landing made API requests at ${width}px`);
    if (width === 300) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.closest('.landing-page') !== null), true);
      assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
      assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineColor), await page.evaluate(() => { const probe = document.createElement('span'); probe.style.color = document.activeElement.closest('.landing-header') ? 'var(--color-nav-active-indicator)' : 'var(--color-focus)'; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; }));
      assert.equal(await page.getByRole('link', { name: 'Create your account' }).getAttribute('href'), '/sign-up');
      assert.equal(await page.getByRole('link', { name: 'Sign in to continue' }).getAttribute('href'), '/sign-in');
      assert.equal(await page.getByRole('link', { name: /Already signed in\?/ }).getAttribute('href'), '/auth/complete');
    }
    if ([320, 375, 768, 1440].includes(width)) await page.screenshot({ path: '.wrangler/landing-review/landing-' + width + '.png', fullPage: true });
    assert.deepEqual(errors, [], `page errors at ${width}px`);
    console.log(`PASS landing public route at ${width}px`);
    await page.close();
  }

  const authPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await authPage.goto(base + '/sign-in?scenario=signed-out');
  await authPage.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(await authPage.locator('.landing-page').count(), 0);
  assert.equal(await authPage.locator('.auth-panel').evaluate(element => getComputedStyle(element).width), '512px');
  assert.equal(await authPage.evaluate(() => getComputedStyle(document.body).paddingLeft), '16px');
  await authPage.getByText('Test sign-in widget', { exact: true }).waitFor();
  console.log('PASS landing CSS remains scoped on sign-in route');
  await authPage.close();
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
