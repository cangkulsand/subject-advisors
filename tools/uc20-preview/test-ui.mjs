import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const built = await build({ entryPoints: ['tools/uc20-preview/main.tsx'], bundle: true, write: false, outdir: '.wrangler/uc20-preview', jsx: 'automatic' });
const script = built.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = built.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const host = '127.0.0.1';
const serve = process.argv.includes('--serve');
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
  else if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UC20 local preview</title><link rel="stylesheet" href="/app.css"><style>:root{--color-app-bg:#faf6ee;--color-surface:#fff;--color-surface-subtle:#f0e9da;--color-heading:#1a1a1a;--color-body:#555;--color-muted:#555;--color-outline:#ddd3c3;--color-brand:#6b1d2f;--color-brand-hover:#521624;--color-focus:#6b1d2f;--color-info-text:#1d4ed8;--color-info-bg:#eff6ff;--color-warning-text:#825c1a;--color-warning-bg:#faf2e3;--color-danger-text:#b13b35;--color-danger-bg:#fbeeea}*{box-sizing:border-box}body{margin:0;padding:clamp(14px,3vw,32px);background:var(--color-app-bg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}#root{max-width:1440px;margin:0 auto}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
  } else { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(done => server.listen(serve ? 5176 : 0, host, done));
const base = `http://${host}:${server.address().port}`;
if (serve) {
  console.log(`UC20 disconnected preview: ${base}/`);
  await new Promise(() => {});
} else {
  let browser;
  const unexpected = [];
  try {
    await mkdir('.wrangler/uc20-preview', { recursive: true });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== base || url.pathname.startsWith('/api/')) unexpected.push(request.url());
    });
    page.on('requestfailed', request => unexpected.push(`failed: ${request.url()}`));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('heading', { name: 'Class Offering Forecast' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Forecast preview' }).count(), 0);
    await page.getByRole('button', { name: 'Load demo cohort' }).click();
    await page.getByRole('alert').filter({ hasText: 'Choose a degree' }).waitFor();
    assert.equal(await page.getByLabel('Degree / programme').getAttribute('aria-invalid'), 'true');
    await page.locator('#uc20-file').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not a csv') });
    await page.getByRole('alert').filter({ hasText: '.csv extension' }).waitFor();
    await page.locator('#uc20-file').setInputFiles({ name: 'cohort.csv', mimeType: 'text/csv', buffer: Buffer.from('this file is never opened') });
    await page.getByRole('status').filter({ hasText: 'cohort.csv' }).waitFor();
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['a'], 'first.csv', { type: 'text/csv' }));
      transfer.items.add(new File(['b'], 'second.csv', { type: 'text/csv' }));
      document.querySelector('.uc20-dropzone').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    });
    await page.getByRole('alert').filter({ hasText: 'one CSV file at a time' }).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: 'cohort.csv' }).count(), 0);
    await page.locator('#uc20-file').setInputFiles({ name: 'cohort.csv', mimeType: 'text/csv', buffer: Buffer.from('this file is never opened') });
    await page.getByRole('status').filter({ hasText: 'cohort.csv' }).waitFor();
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['bad'], 'rejected.txt', { type: 'text/plain' }));
      document.querySelector('.uc20-dropzone').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    });
    await page.getByRole('alert').filter({ hasText: '.csv extension' }).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: 'cohort.csv' }).count(), 0);
    await page.locator('#uc20-file').setInputFiles({ name: 'cohort.csv', mimeType: 'text/csv', buffer: Buffer.from('this file is never opened') });
    await page.getByRole('status').filter({ hasText: 'cohort.csv' }).waitFor();
    await page.getByLabel('Degree / programme').selectOption('demo-computing');
    await page.getByLabel('Centre').selectOption('demo-central');
    await page.getByLabel('Target semester').selectOption('demo-2099-1');
    await page.getByLabel('Source date').fill('2099-01-01');
    await page.getByLabel('Source label').fill('Demo test cohort');
    await page.getByRole('button', { name: 'Load demo cohort' }).click();
    await page.getByRole('heading', { name: 'Forecast preview' }).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: 'cohort.csv' }).count(), 0);
    await page.getByText('They are not calculated from the attached file.').waitFor();
    assert.equal(await page.getByRole('row').count(), 4);
    await page.screenshot({ path: '.wrangler/uc20-preview/desktop.png', fullPage: true });
    await page.getByLabel('Centre').selectOption('demo-coastal');
    assert.equal(await page.getByRole('heading', { name: 'Forecast preview' }).count(), 0);
    await page.locator('#uc20-file').setInputFiles({ name: 'another.csv', mimeType: 'text/csv', buffer: Buffer.from('metadata only') });
    await page.getByRole('button', { name: 'Remove file' }).click();
    await page.getByRole('button', { name: 'Load demo cohort' }).click();
    await page.getByRole('heading', { name: 'Forecast preview' }).waitFor();
    await page.getByRole('button', { name: 'Reset' }).click();
    assert.equal(await page.getByRole('heading', { name: 'Forecast preview' }).count(), 0);
    assert.equal(await page.getByLabel('Degree / programme').inputValue(), '');
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement !== document.body && getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    for (const width of [320, 375, 720, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByLabel('Degree / programme').selectOption('demo-computing');
      await page.getByLabel('Centre').selectOption('demo-central');
      await page.getByLabel('Target semester').selectOption('demo-2099-1');
      await page.getByLabel('Source date').fill('2099-01-01');
      await page.getByLabel('Source label').fill('Demo test cohort');
      await page.getByRole('button', { name: 'Load demo cohort' }).click();
      await page.getByRole('heading', { name: 'Forecast preview' }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}px`);
      if (width === 375) await page.screenshot({ path: '.wrangler/uc20-preview/mobile-375.png', fullPage: true });
      await page.getByRole('button', { name: 'Reset' }).click();
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'text scaling overflows page');
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log('PASS disconnected UC20 preview interaction, file metadata, demo reset, keyboard focus, 320/375/720/768/1024/1440px reflow, 200% root text scaling, and zero external/API requests');
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
}
