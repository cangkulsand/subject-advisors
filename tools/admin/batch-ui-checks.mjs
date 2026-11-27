// Batch correction page (S3-P004-039): fictional fixtures; the all-or-nothing SQL is covered by repository tests and a rolled-back Neon dry run.
import assert from 'node:assert/strict';
const reasonLabel = 'Reason (recorded in the audit log)';

async function paste(page, text) { await page.getByLabel('Matric numbers', { exact: true }).fill(text); }

export async function batchUiChecks({ check, mock, base }) {
  await check('batch correction: paste, check, remove problems, from matric, apply (S3-P004-039)', async page => {
    const state = await mock(page); await page.goto(base + '/admin/users');
    await page.getByRole('link', { name: 'Batch correction', exact: true }).click(); await page.waitForURL('**/admin/users/batch');
    await page.getByRole('heading', { name: 'Batch correction', exact: true }).first().waitFor();
    await paste(page, 'SX232315ECJHF04\r\n\tSX999999ECJHF04, sx230001ecjhf04\n\nSX232315ECJHF04');
    await page.getByText('3 numbers · 1 repeated number ignored', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    const table = page.getByRole('table', { name: 'Students to correct' }); await table.waitFor();
    const first = table.locator('tbody tr').first();
    assert.match(await first.innerText(), /SX999999ECJHF04[\s\S]*Not found/);
    assert.equal(await page.getByRole('button', { name: 'Apply correction', exact: true }).isDisabled(), true, 'problems block the apply');
    await page.getByRole('button', { name: 'Remove problem numbers', exact: true }).click();
    await table.locator('tbody tr').nth(2).waitFor({ state: 'detached' }); assert.equal(await table.locator('tbody tr').count(), 2);
    assert.equal(await page.getByLabel('Matric numbers', { exact: true }).inputValue(), 'SX232315ECJHF04\nSX230001ECJHF04');
    await page.getByLabel("From each student's matric number", { exact: true }).check();
    await page.getByText('Applies to 2 students: 1 intake year changes, 0 programmes change, 1 already correct.', { exact: true }).waitFor();
    assert.match(await table.locator('tbody tr').first().innerText(), /2020[\s\S]*2023/);
    await page.getByText('Matric says ECJH, programme is DEMO', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Apply correction', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Apply batch correction' }); await dialog.waitFor();
    await dialog.getByLabel(reasonLabel).fill('Fictional: backfill used the curriculum year.');
    await dialog.getByRole('button', { name: 'Apply correction', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('status').filter({ hasText: 'Corrected 1 student: 1 intake year, 0 programmes; 0 subject picks removed.' }).waitFor();
    const post = state.bodies.filter(item => item.path === '/api/admin/students/batch').at(-1);
    assert.equal(post.body.intake.mode, 'matric'); assert.equal(post.body.expected.length, 2); assert.equal(post.body.curriculumId, null);
    assert.deepEqual(post.body.matricNos, ['SX232315ECJHF04', 'SX230001ECJHF04']);
    await page.getByRole('button', { name: 'Start another batch', exact: true }).click();
    assert.equal(await page.getByLabel('Matric numbers', { exact: true }).inputValue(), '');
  });
  await check('batch correction: a stale preview asks to check again (S3-P004-039)', async page => {
    const state = await mock(page); await page.goto(base + '/admin/users/batch');
    await paste(page, 'SX232315ECJHF04'); await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.getByRole('table', { name: 'Students to correct' }).waitFor();
    await page.getByLabel('Set all to', { exact: true }).check(); await page.getByLabel('Intake year for all', { exact: true }).fill('2024');
    await page.getByRole('button', { name: 'Apply correction', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Apply batch correction' }); await dialog.getByLabel(reasonLabel).fill('Fictional: stale.');
    state.mutationError = { status: 409, code: 'BATCH_STALE', message: 'Some students changed since you checked. Check again.' };
    await dialog.getByRole('button', { name: 'Apply correction', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('alert').filter({ hasText: 'Some students changed since you checked. Check again.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Apply correction', exact: true }).count(), 0, 'a refused preview cannot be applied again');
    delete state.mutationError;
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    await page.getByRole('table', { name: 'Students to correct' }).waitFor();
  });
  await check('batch correction: an unavailable programme reloads the list, and a later success clears the error (S3-P004-039 review)', async page => {
    const state = await mock(page); await page.goto(base + '/admin/users/batch');
    await paste(page, 'SX232315ECJHF04'); await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.getByRole('table', { name: 'Students to correct' }).waitFor();
    await page.getByLabel('Programme', { exact: true }).selectOption('2');
    await page.getByRole('button', { name: 'Apply correction', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Apply batch correction' }); await dialog.getByLabel(reasonLabel).fill('Fictional: move.');
    state.mutationError = { status: 409, code: 'CURRICULUM_UNAVAILABLE', message: 'The selected programme is not available. Choose an active programme.' };
    const before = state.requests.filter(item => item.path === '/api/admin/curriculum-options').length;
    await dialog.getByRole('button', { name: 'Apply correction', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('alert').filter({ hasText: 'The selected programme is not available.' }).waitFor();
    await page.waitForFunction(() => true); await page.waitForLoadState('networkidle');
    assert.ok(state.requests.filter(item => item.path === '/api/admin/curriculum-options').length > before, 'the programme list is reloaded');
    delete state.mutationError;
    await page.getByRole('button', { name: 'Check again', exact: true }).click(); await page.getByRole('table', { name: 'Students to correct' }).waitFor();
    await page.getByLabel('Programme', { exact: true }).selectOption('2');
    await page.getByRole('button', { name: 'Apply correction', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Apply batch correction' }); await dialog.getByLabel(reasonLabel).fill('Fictional: move.');
    await dialog.getByRole('button', { name: 'Apply correction', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('status').filter({ hasText: /^Corrected 1 student/ }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0, 'no stale error after a success');
    assert.equal(await page.getByRole('button', { name: 'Check again', exact: true }).count(), 0);
  });
  await check('batch correction: more than 500 numbers disables Check (S3-P004-039)', async page => {
    await mock(page); await page.goto(base + '/admin/users/batch');
    await paste(page, Array.from({ length: 501 }, (_, i) => 'SX23' + String(i).padStart(4, '0')).join('\n'));
    await page.getByText('Paste at most 500 matric numbers.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Check', exact: true }).isDisabled(), true);
  });
  for (const width of [320, 375, 768]) await check('batch correction: preview fits at ' + width + 'px (S3-P004-039)', async page => {
    await mock(page); await page.goto(base + '/admin/users/batch');
    await paste(page, 'SX232315ECJHF04\nSX999999ECJHF04'); await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.getByRole('table', { name: 'Students to correct' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways page scroll at ' + width);
  }, width);
}
