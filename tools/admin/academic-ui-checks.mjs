// Fictional HTTP fixtures exercise real admin pages; database rules are tested separately.
import assert from 'node:assert/strict';
import { academicStore } from './academic-fixtures.mjs';
const reasonLabel = 'Reason (recorded in the audit log)';
const reason = 'Fictional browser verification.';
const routes = [['learning-centres', 'Learning Centres', 'Add learning centre'], ['faculties', 'Faculties', 'Add faculty'], ['departments', 'Departments', 'Add department'], ['semesters', 'Academic Semesters', 'Add semester'], ['coordinator-assignments', 'Coordinator Assignments', 'Add assignment'], ['programmes', 'Programmes', 'Add programme']];
async function save(dialog) { await dialog.getByLabel(reasonLabel).fill(reason); await dialog.getByRole('button', { name: 'Save', exact: true }).click(); }
async function confirm(page, title, action) {
  const dialog = page.getByRole('dialog', { name: title, exact: true }); await dialog.waitFor();
  assert.equal(await dialog.getByRole('button', { name: action, exact: true }).isDisabled(), true);
  await dialog.getByLabel(reasonLabel).fill(reason); await dialog.getByRole('button', { name: action, exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
}
export async function academicUiChecks({ check, mock, base }) {
  for (const [path, title, opener] of routes) {
    await check(title + ': loading, failure/retry, empty and forbidden', async page => {
      const state = await mock(page, { delay: 250, fail: true }); await page.goto(base + '/admin/' + path);
      await page.getByText('Loading academic setup…', { exact: true }).waitFor();
      await page.getByRole('alert').filter({ hasText: 'Fixture service unavailable' }).waitFor();
      assert.equal(await page.getByRole('button', { name: opener, exact: true }).isDisabled(), true);
      state.fail = false; state.empty = true; delete state.academic;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByText(path === 'learning-centres' ? 'No learning centres configured.' : path === 'faculties' ? 'No faculties configured.' : path === 'departments' ? 'No departments configured.' : path === 'semesters' ? 'No semesters configured.' : path === 'programmes' ? 'No programmes configured.' : 'No coordinator assignments configured.', { exact: true }).waitFor();
      assert.equal(await page.locator('.admin-card').count(), 1);
      await page.unroute(/\/api\//); const forbidden = await mock(page, { roles: ['COORDINATOR'] });
      await page.goto(base + '/admin/' + path + '?test-session=forbidden');
      await page.getByRole('alert').filter({ hasText: 'does not have access' }).waitFor();
      assert.equal((forbidden.requests ?? []).filter(r => r.path.startsWith('/api/admin')).length, 0);
    });
  }
  for (const [path, noun, codeLabel, nameLabel] of [['learning-centres', 'learning centre', 'Centre code', 'Centre name'], ['faculties', 'faculty', 'Faculty code', 'Faculty name']]) {
    await check(noun + ': modal focus, reason, create/edit, soft deactivate/reactivate and server failure', async page => {
      const state = await mock(page); await page.goto(base + '/admin/' + path);
      const opener = page.getByRole('button', { name: 'Add ' + noun, exact: true }); await opener.waitFor(); await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Add ' + noun, exact: true }); await dialog.waitFor();
      assert.equal(await dialog.getByLabel(codeLabel).evaluate(el => el === document.activeElement), true);
      assert.equal(await dialog.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); assert.equal(await opener.evaluate(el => el === document.activeElement), true);
      await opener.click(); await dialog.getByLabel(codeLabel).fill('NEW'); await dialog.getByLabel(nameLabel).fill('Fictional new ' + noun);
      await page.screenshot({ path: '.wrangler/admin-review/academic-' + path + '-dialog-desktop.png', fullPage: true });
      await dialog.getByLabel(reasonLabel).fill('   '); assert.equal(await dialog.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
      state.mutationError = { status: 409, code: 'CONFLICT', message: 'Fictional duplicate code.' }; await save(dialog);
      await dialog.getByRole('alert').filter({ hasText: 'Fictional duplicate code.' }).waitFor(); assert.equal(await dialog.isVisible(), true);
      delete state.mutationError; await save(dialog); await dialog.waitFor({ state: 'hidden' }); await page.getByText('Fictional new ' + noun, { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Edit NEW', exact: true }).click();
      const edit = page.getByRole('dialog', { name: 'Edit ' + noun, exact: true }); await edit.getByLabel(nameLabel).fill('Fictional updated ' + noun); await save(edit); await edit.waitFor({ state: 'hidden' });
      const row = page.getByRole('row').filter({ hasText: 'Fictional updated ' + noun }); await row.getByText('Active', { exact: true }).waitFor();
      await row.getByRole('button', { name: 'Deactivate NEW' }).click(); await confirm(page, 'Deactivate ' + noun, 'Deactivate'); await row.getByText('Inactive', { exact: true }).waitFor();
      await row.getByRole('button', { name: 'Reactivate NEW' }).click(); await confirm(page, 'Reactivate ' + noun, 'Reactivate'); await row.getByText('Active', { exact: true }).waitFor();
      assert.ok(state.bodies.every(b => b.body.reason === reason)); assert.ok(state.bodies.every(b => b.method !== 'DELETE'));
      await page.screenshot({ path: '.wrangler/admin-review/academic-' + path + '-desktop.png', fullPage: true });
    });
  }
  await check('department: faculty options, create/edit, move rejected while programmes exist, deactivate/reactivate and duplicate code', async page => {
    const state = await mock(page); const data = academicStore(state); data.faculties.push({ facultyId: 3, facultyCode: 'OLD', facultyName: 'Fictional inactive faculty', isActive: false });
    await page.goto(base + '/admin/departments'); await page.getByText('Fictional department', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Add department', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add department', exact: true }); await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Department code').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await dialog.getByLabel('Faculty', { exact: true }).locator('option').allInnerTexts(), ['Choose…', 'Fictional faculty', 'Fictional other faculty']);
    await dialog.getByLabel('Department code').fill('DEPT'); await dialog.getByLabel('Department name').fill('Fictional duplicate'); await dialog.getByLabel('Faculty', { exact: true }).selectOption('1');
    await page.screenshot({ path: '.wrangler/admin-review/academic-departments-dialog-desktop.png', fullPage: true });
    await save(dialog); await dialog.getByRole('alert').filter({ hasText: 'Code already exists.' }).waitFor();
    await dialog.getByLabel('Department code').fill('NEWD'); await dialog.getByLabel('Department name').fill('Fictional new department'); await save(dialog); await dialog.waitFor({ state: 'hidden' });
    const row = page.getByRole('row').filter({ hasText: 'Fictional new department' }); await row.getByText('Fictional faculty', { exact: true }).waitFor();
    assert.deepEqual(state.bodies.at(-1).body, { departmentCode: 'NEWD', departmentName: 'Fictional new department', facultyId: 1, reason });
    await row.getByRole('button', { name: 'Edit NEWD' }).click(); const edit = page.getByRole('dialog', { name: 'Edit department', exact: true });
    await edit.getByLabel('Faculty', { exact: true }).selectOption('2'); await save(edit); await edit.waitFor({ state: 'hidden' });
    await row.getByText('Fictional other faculty', { exact: true }).waitFor();
    await page.getByRole('row').filter({ hasText: 'Fictional department' }).first().getByRole('button', { name: 'Edit DEPT' }).click();
    const move = page.getByRole('dialog', { name: 'Edit department', exact: true }); await move.getByLabel('Faculty', { exact: true }).selectOption('2'); await save(move);
    await move.getByRole('alert').filter({ hasText: 'cannot move to another faculty' }).waitFor(); await page.keyboard.press('Escape'); await move.waitFor({ state: 'hidden' });
    await row.getByRole('button', { name: 'Deactivate NEWD' }).click(); await confirm(page, 'Deactivate department', 'Deactivate'); await row.getByText('Inactive', { exact: true }).waitFor();
    await row.getByRole('button', { name: 'Reactivate NEWD' }).click(); await confirm(page, 'Reactivate department', 'Reactivate'); await row.getByText('Active', { exact: true }).waitFor();
    assert.ok(state.bodies.every(b => b.body.reason === reason)); assert.ok(state.bodies.every(b => b.method !== 'DELETE'));
    await page.screenshot({ path: '.wrangler/admin-review/academic-departments-desktop.png', fullPage: true });
  });
  await check('programme department: shows derived faculty, active-only alternatives, backend conflict, clear and assign', async page => {
    const state = await mock(page); const data = academicStore(state); data.departments[0].isActive = false;
    data.departments.push({ departmentId: 3, departmentCode: 'OLD', departmentName: 'Fictional unused inactive department', facultyId: 1, isActive: false });
    await page.goto(base + '/admin/programmes');
    const programmeRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Department TEST', exact: true }) }); await programmeRow.getByText('Fictional department (inactive)', { exact: true }).waitFor(); await programmeRow.getByText('Fictional faculty', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Department TEST', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Assign department · TEST' }), select = dialog.getByLabel('Department (None clears the assignment)');
    assert.deepEqual(await select.locator('option').allInnerTexts(), ['None', 'Fictional department · Fictional faculty (inactive)', 'Fictional other department · Fictional other faculty']);
    await select.selectOption('2'); await dialog.getByText('Faculty will be set to Fictional other faculty.').waitFor();
    await save(dialog); await dialog.getByRole('alert').filter({ hasText: 'End active coordinator assignments' }).waitFor();
    data.assignments[0].endedAt = '2026-11-02T00:00:00Z'; await select.selectOption(''); await dialog.getByText('The programme will have no department and no faculty.').waitFor(); await save(dialog); await dialog.waitFor({ state: 'hidden' });
    await programmeRow.getByText('No department', { exact: true }).waitFor(); assert.equal(data.programmes[0].facultyId, null);
    await page.getByRole('button', { name: 'Department TEST', exact: true }).click(); await select.selectOption('2'); await save(dialog); await dialog.waitFor({ state: 'hidden' });
    assert.equal(data.programmes[0].departmentId, 2); assert.equal(data.programmes[0].facultyId, 2); assert.equal(state.bodies.at(-2).body.departmentId, null); assert.equal(state.bodies.at(-1).body.departmentId, 2);
    await programmeRow.getByText('Fictional other faculty', { exact: true }).waitFor();
    await page.screenshot({ path: '.wrangler/admin-review/academic-programme-departments-desktop.png', fullPage: true });
  });
  await check('programmes: create/edit/deactivate programme, legacy row, curriculum create/edit/deactivate, inactive-programme and duplicate errors, subjects link', async page => {
    const state = await mock(page), data = academicStore(state); await page.goto(base + '/admin/programmes');
    await page.getByRole('button', { name: 'Add programme', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add programme', exact: true }); await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Programme code').evaluate(el => el === document.activeElement), true);
    await dialog.getByLabel('Programme code').fill('TEST'); await dialog.getByLabel('Programme name').fill('Fictional duplicate programme'); await dialog.getByLabel('Department', { exact: true }).selectOption('1'); await save(dialog);
    await dialog.getByRole('alert').filter({ hasText: 'The change conflicts with the current state.' }).waitFor();
    assert.equal(await dialog.getByLabel('Programme name').inputValue(), 'Fictional duplicate programme');
    await dialog.getByLabel('Programme code').fill('NEWP'); await dialog.getByLabel('Programme name').fill('Fictional new programme'); await dialog.getByLabel('Level').fill('Diploma'); await save(dialog); await dialog.waitFor({ state: 'hidden' });
    const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit NEWP', exact: true }) });
    await row.getByText('Fictional new programme', { exact: true }).waitFor(); await row.getByText('Diploma', { exact: true }).waitFor(); await row.getByText('Active', { exact: true }).waitFor();
    assert.deepEqual(state.bodies.at(-1).body, { programmeCode: 'NEWP', programmeName: 'Fictional new programme', level: 'Diploma', departmentId: 1, reason });
    const legacy = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit LEGACY', exact: true }) });
    await legacy.getByText('No department', { exact: true }).waitFor(); await legacy.getByText('No faculty', { exact: true }).waitFor();
    await legacy.getByRole('button', { name: 'Edit LEGACY', exact: true }).click(); const edit = page.getByRole('dialog', { name: 'Edit programme', exact: true });
    await edit.getByLabel('Programme name').fill('Fictional legacy renamed'); await save(edit); await edit.waitFor({ state: 'hidden' });
    await legacy.getByText('Fictional legacy renamed', { exact: true }).waitFor(); assert.equal(data.programmes.find(p => p.programmeCode === 'LEGACY').departmentId, null);
    assert.equal('departmentId' in state.bodies.at(-1).body, false);
    await row.getByRole('button', { name: 'Deactivate NEWP', exact: true }).click(); await confirm(page, 'Deactivate programme', 'Deactivate'); await row.getByText('Inactive', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add curriculum', exact: true }).click(); const add = page.getByRole('dialog', { name: 'Add curriculum', exact: true }); await add.waitFor();
    assert.deepEqual(await add.getByLabel('Programme', { exact: true }).locator('option').allInnerTexts(), ['Choose…', 'TEST · Fictional programme', 'LEGACY · Fictional legacy renamed']);
    await add.getByLabel('Programme', { exact: true }).selectOption('1'); await add.getByLabel('Version').fill('2027'); await add.getByLabel('Total credits').fill('130'); await add.getByLabel('Effective year').fill('2027');
    data.programmes.find(p => p.programmeCode === 'TEST').isActive = false; await save(add);
    await add.getByRole('alert').filter({ hasText: 'The selected reference must be active.' }).waitFor();
    data.programmes.find(p => p.programmeCode === 'TEST').isActive = true; await save(add); await add.waitFor({ state: 'hidden' });
    const created = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit TEST 2027', exact: true }) }); await created.getByText('130', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit TEST 2026', exact: true }).click(); const ec = page.getByRole('dialog', { name: 'Edit curriculum', exact: true });
    await ec.getByLabel('Total credits').fill('125'); await save(ec); await ec.waitFor({ state: 'hidden' });
    const first = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit TEST 2026', exact: true }) }); await first.getByText('125', { exact: true }).waitFor();
    assert.deepEqual(state.bodies.at(-1).body, { totalCreditRequired: 125, reason }); assert.equal(state.bodies.at(-1).method, 'PATCH');
    assert.equal(await first.getByRole('link', { name: '3 subjects' }).getAttribute('href'), '/admin/curriculum?curriculum=1');
    await first.getByRole('button', { name: 'Deactivate TEST 2026', exact: true }).click(); await confirm(page, 'Deactivate curriculum', 'Deactivate'); await first.getByText('Inactive', { exact: true }).waitFor();
    await first.getByRole('button', { name: 'Reactivate TEST 2026', exact: true }).click(); await confirm(page, 'Reactivate curriculum', 'Reactivate'); await first.getByText('Active', { exact: true }).waitFor();
    assert.ok(state.bodies.every(b => b.body.reason === reason)); assert.ok(state.bodies.every(b => b.method !== 'DELETE'));
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: '.wrangler/admin-review/academic-programmes-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '.wrangler/admin-review/academic-programmes-mobile.png', fullPage: true });
  });
  await check('semesters: nullable current, validated create/edit dates, set/switch/advance current and inline error', async page => {
    const state = await mock(page); await page.goto(base + '/admin/semesters');
    await page.getByRole('group', { name: 'Current semester', exact: true }).getByText('Not configured', { exact: true }).waitFor(); assert.equal(await page.getByRole('group', { name: 'Current semester' }).getByText('Not configured', { exact: true }).count(), 1); assert.equal(await page.getByRole('group', { name: 'Next semester' }).getByText('Not configured', { exact: true }).count(), 1); assert.equal(await page.getByRole('button', { name: 'Advance to next semester' }).count(), 0);
    await page.getByRole('button', { name: 'Add semester', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Add semester', exact: true });
    await page.screenshot({ path: '.wrangler/admin-review/academic-semesters-dialog-desktop.png', fullPage: true });
    await dialog.getByLabel('Academic year (YYYY/YYYY)', { exact: true }).fill('invalid'); await dialog.getByLabel('Semester number', { exact: true }).selectOption('1');
    await dialog.getByLabel('Maximum subjects', { exact: true }).fill('4'); await dialog.getByLabel('Maximum credits', { exact: true }).fill('12'); await save(dialog);
    await dialog.getByRole('alert').waitFor(); assert.equal((state.bodies ?? []).length, 0);
    await dialog.getByLabel('Academic year (YYYY/YYYY)', { exact: true }).fill('2027/2028'); await save(dialog); await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.bodies.at(-1).body.startDate, null); assert.equal(state.bodies.at(-1).body.endDate, null);
    await page.getByRole('button', { name: 'Edit 2027/2028 · Semester 1', exact: true }).click(); const edit = page.getByRole('dialog', { name: 'Edit semester', exact: true });
    await edit.getByLabel('Start date', { exact: true }).fill('2027-09-01'); await edit.getByLabel('End date', { exact: true }).fill('2027-12-31'); await save(edit); await edit.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Set current 2026/2027 · Semester 1', exact: true }).click();
    const current = page.getByRole('dialog', { name: 'Set current semester', exact: true }); state.mutationError = { status: 409, code: 'CONFLICT', message: 'Fictional current update failed.' };
    await current.getByLabel(reasonLabel).fill(reason); await current.getByRole('button', { name: 'Set current', exact: true }).click(); await current.getByRole('alert').filter({ hasText: 'Fictional current update failed.' }).waitFor();
    delete state.mutationError; await current.getByRole('button', { name: 'Set current', exact: true }).click(); await current.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Advance to next semester' }).click(); await confirm(page, 'Set current semester', 'Set current');
    assert.equal(academicStore(state).semesters.find(s => s.isCurrent).semesterId, 2); assert.equal(academicStore(state).semesters.filter(s => s.isCurrent).length, 1);
    await page.getByRole('button', { name: 'Set current 2027/2028 · Semester 1', exact: true }).click(); await confirm(page, 'Set current semester', 'Set current');
    assert.equal(academicStore(state).semesters.find(s => s.isCurrent).semesterId, 4);
    await page.getByRole('button', { name: 'Set current 2026/2027 · Semester 1', exact: true }).click(); await confirm(page, 'Set current semester', 'Set current');
    const add = page.getByRole('button', { name: 'Add semester', exact: true });
    const advance = page.getByRole('button', { name: 'Advance to next semester', exact: true });
    assert.equal(await add.locator('svg[aria-hidden="true"]').count(), 1);
    assert.equal(await page.locator('.admin-semester-current-row').count(), 1);
    assert.equal(await page.locator('.admin-semester-current-badge').innerText(), 'Current');
    assert.equal(await page.getByRole('button', { name: 'Edit 2026/2027 · Semester 1', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Set current 2026/2027 · Semester 1', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Set current 2026/2027 · Semester 2', exact: true }).count(), 1);
    for (const button of [add, advance, page.getByRole('button', { name: 'Edit 2026/2027 · Semester 1', exact: true }), page.getByRole('button', { name: 'Set current 2026/2027 · Semester 2', exact: true })]) {
      const box = await button.boundingBox(); assert.ok(box && box.height >= 44);
      assert.ok(Number.parseFloat(await button.evaluate(el => getComputedStyle(el).fontSize)) >= 14);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: '.wrangler/admin-review/academic-semesters-desktop.png', fullPage: true });
    for (const width of [375, 800, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page should not overflow at ' + width + 'px');
    }
    await page.setViewportSize({ width: 375, height: 844 });
    const tableRegion = page.getByRole('region', { name: 'Academic semesters', exact: true });
    await tableRegion.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.getByRole('button', { name: 'Set current 2026/2027 · Semester 2', exact: true }).waitFor();
    await page.screenshot({ path: '.wrangler/admin-review/academic-semesters-375.png', fullPage: true });
  });
  await check('coordinator assignments: eligible picker, search/empty, active reference filtering, duplicate, end history and add', async page => {
    const state = await mock(page), data = academicStore(state);
    data.faculties.push({ facultyId: 3, facultyCode: 'OLD', facultyName: 'Fictional inactive faculty', isActive: false });
    data.centres.push({ learningCentreId: 3, centreCode: 'OLD', centreName: 'Fictional inactive centre', isActive: false });
    await page.goto(base + '/admin/coordinator-assignments'); await page.getByRole('button', { name: 'Add assignment', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add coordinator assignment', exact: true }), picker = dialog.getByLabel('Coordinator account', { exact: true }); await picker.waitFor();
    await page.screenshot({ path: '.wrangler/admin-review/academic-assignments-dialog-desktop.png', fullPage: true });
    assert.equal(await picker.locator('option').count(), 3);
    assert.equal(await dialog.getByLabel('Faculty', { exact: true }).locator('option').count(), 3);
    assert.equal(await dialog.getByLabel('Learning centre', { exact: true }).locator('option').count(), 2);
    const search = dialog.getByLabel('Find coordinator by name or email', { exact: true }); await search.fill('no-such-coordinator');
    await dialog.getByText('No eligible coordinators found.', { exact: false }).waitFor(); await search.fill('Account 2');
    await picker.locator('option[value="2"]').waitFor({ state: 'attached' }); await picker.selectOption('2');
    await dialog.getByLabel('Faculty', { exact: true }).selectOption('1'); await dialog.getByLabel('Programme', { exact: true }).selectOption('1'); await dialog.getByLabel('Learning centre', { exact: true }).selectOption('1');
    await save(dialog); await dialog.getByRole('alert').filter({ hasText: 'An active assignment already exists.' }).waitFor();
    assert.equal(state.requests.filter(r => r.path === '/api/admin/users').every(r => r.search.includes('role=COORDINATOR') && r.search.includes('status=ACTIVE')), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'End assignment 1', exact: true }).click(); await confirm(page, 'End coordinator assignment', 'End assignment');
    assert.equal(await page.getByRole('button', { name: 'End assignment 1', exact: true }).count(), 0); assert.ok(data.assignments[0].endedAt);
    await page.getByRole('button', { name: 'Add assignment', exact: true }).click(); await picker.selectOption('2');
    await dialog.getByLabel('Faculty', { exact: true }).selectOption('1'); await dialog.getByLabel('Programme', { exact: true }).selectOption('1'); await dialog.getByLabel('Learning centre', { exact: true }).selectOption('1'); await save(dialog); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'End assignment 2', exact: true }).waitFor(); assert.equal(data.assignments.length, 2); assert.ok(data.assignments[0].endedAt);
    await page.screenshot({ path: '.wrangler/admin-review/academic-assignments-desktop.png', fullPage: true });
  });
  for (const width of [320, 375, 768]) await check('academic pages single card, responsive tables/dialogs and focus at ' + width, async page => {
    await mock(page); await page.setViewportSize({ width, height: 844 });
    for (const [path, title, action] of routes) {
      await page.goto(base + '/admin/' + path); const opener = page.getByRole('button', { name: action, exact: true }); await opener.waitFor();
      await page.getByRole('table').first().waitFor(); assert.equal(await page.locator('.admin-card').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const tableRegion = page.locator('.admin-table-scroll').first();
      assert.equal(await tableRegion.getAttribute('tabindex'), '0');
      if (width < 768) {
        assert.ok(await tableRegion.evaluate(el => el.scrollWidth > el.clientWidth));
        await tableRegion.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        assert.ok(await tableRegion.evaluate(el => el.scrollLeft > 0));
        await tableRegion.evaluate(el => { el.scrollLeft = 0; });
      }
      if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/academic-' + path + '-mobile.png', fullPage: true });
      await opener.click(); const dialog = page.getByRole('dialog'); await dialog.waitFor();
      const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375 || width === 768) await page.screenshot({ path: '.wrangler/admin-review/academic-' + path + '-dialog-' + width + '.png', fullPage: true });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); assert.equal(await opener.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.getByRole('heading', { name: title, exact: true }).count(), 1);
    }
  }, width);
}
