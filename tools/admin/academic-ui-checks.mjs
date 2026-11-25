// Fictional HTTP fixtures exercise real admin pages; database rules are tested separately.
import assert from 'node:assert/strict';
import { academicStore } from './academic-fixtures.mjs';
const reasonLabel = 'Reason (recorded in the audit log)';
const reason = 'Fictional browser verification.';
const routes = [['learning-centres', 'Learning Centres', 'Add learning centre'], ['faculties', 'Academic Structure', 'Add faculty'], ['semesters', 'Academic Semesters', 'Add semester'], ['coordinator-assignments', 'Coordinator Assignments', 'Add assignment']];
// S3-P004-038: the drill-down levels below the Faculties root, checked for layout with the pages above.
const levels = [['faculties/1', 'Academic Structure', 'Add department'], ['faculties/1/departments/1', 'Academic Structure', 'Add programme'], ['faculties/1/departments/1/programmes/1', 'Academic Structure', 'Add curriculum']];
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
  // S3-P004-038: one Academic Structure drill-down replaces the Faculties, Departments and Programmes pages.
  const structure = page => ({
    crumbs: page.getByRole('navigation', { name: 'Academic structure path', exact: true }),
    region: name => page.getByRole('region', { name, exact: true }),
  });
  await check('academic structure: drill down shows only each parent\'s children, breadcrumb and history keep the place (S3-P004-038)', async page => {
    await mock(page); const { crumbs, region } = structure(page); await page.goto(base + '/admin/faculties');
    const faculties = region('Faculties'); await faculties.waitFor();
    await faculties.getByRole('row').filter({ has: page.getByRole('link', { name: 'TEST', exact: true }) }).getByText('1 department', { exact: true }).waitFor();
    await faculties.getByRole('link', { name: 'OTHER', exact: true }).waitFor();
    await faculties.getByRole('link', { name: 'TEST', exact: true }).click(); await page.waitForURL(base + '/admin/faculties/1');
    const departments = region('Departments'); await departments.getByRole('link', { name: 'DEPT', exact: true }).waitFor();
    assert.equal(await departments.getByText('DOTHER').count(), 0);
    await departments.getByRole('link', { name: 'DEPT', exact: true }).click(); await page.waitForURL(base + '/admin/faculties/1/departments/1');
    const programmes = region('Programmes'); await programmes.getByRole('link', { name: 'TEST', exact: true }).waitFor();
    assert.equal(await programmes.getByText('LEGACY').count(), 0);
    await programmes.getByRole('link', { name: 'TEST', exact: true }).click(); await page.waitForURL(base + '/admin/faculties/1/departments/1/programmes/1');
    const curricula = region('Curriculums'); await curricula.getByRole('button', { name: 'Edit TEST 2026', exact: true }).waitFor();
    assert.equal(await curricula.locator('tbody tr').count(), 1);
    assert.deepEqual(await crumbs.locator('li').allInnerTexts(), ['Faculties', 'TEST', 'DEPT', 'TEST']);
    assert.equal(await crumbs.locator('[aria-current="page"]').innerText(), 'TEST');
    await page.goBack(); await page.waitForURL(base + '/admin/faculties/1/departments/1'); await programmes.waitFor();
    await page.goForward(); await page.waitForURL(base + '/admin/faculties/1/departments/1/programmes/1');
    await page.reload(); await curricula.getByRole('button', { name: 'Edit TEST 2026', exact: true }).waitFor();
    await page.screenshot({ path: '.wrangler/admin-review/academic-structure-programme-desktop.png', fullPage: true });
    await crumbs.getByRole('link', { name: 'Faculties', exact: true }).click(); await page.waitForURL(base + '/admin/faculties'); await faculties.waitFor();
  });
  await check('academic structure: add at each level sends the parent without asking; summary edit and deactivate (S3-P004-038)', async page => {
    const state = await mock(page); const { region } = structure(page); await page.goto(base + '/admin/faculties/1');
    await page.getByRole('button', { name: 'Add department', exact: true }).click();
    const department = page.getByRole('dialog', { name: 'Add department', exact: true }); await department.waitFor();
    assert.equal(await department.getByLabel('Faculty', { exact: true }).count(), 0);
    await department.getByLabel('Department code').fill('NEWD'); await department.getByLabel('Department name').fill('Fictional new department'); await save(department); await department.waitFor({ state: 'hidden' });
    assert.deepEqual(state.bodies.at(-1).body, { departmentCode: 'NEWD', departmentName: 'Fictional new department', facultyId: 1, reason });
    await region('Departments').getByRole('link', { name: 'NEWD', exact: true }).waitFor();
    await page.goto(base + '/admin/faculties/1/departments/1');
    await page.getByRole('button', { name: 'Add programme', exact: true }).click();
    const programme = page.getByRole('dialog', { name: 'Add programme', exact: true }); await programme.waitFor();
    assert.equal(await programme.getByLabel('Department', { exact: true }).count(), 0); assert.equal(await programme.getByLabel('Level', { exact: true }).count(), 0);
    await programme.getByLabel('Programme code').fill('NEWP'); await programme.getByLabel('Programme name').fill('Fictional new programme'); await save(programme); await programme.waitFor({ state: 'hidden' });
    assert.deepEqual(state.bodies.at(-1).body, { programmeCode: 'NEWP', programmeName: 'Fictional new programme', level: null, departmentId: 1, reason });
    await region('Programmes').getByRole('link', { name: 'NEWP', exact: true }).waitFor();
    await page.goto(base + '/admin/faculties/1/departments/1/programmes/1');
    await page.getByRole('button', { name: 'Add curriculum', exact: true }).click();
    const curriculum = page.getByRole('dialog', { name: 'Add curriculum', exact: true }); await curriculum.waitFor();
    assert.equal(await curriculum.getByLabel('Programme', { exact: true }).count(), 0);
    await curriculum.getByLabel('Version').fill('2027'); await curriculum.getByLabel('Total credits').fill('130'); await curriculum.getByLabel('Effective year').fill('2027'); await save(curriculum); await curriculum.waitFor({ state: 'hidden' });
    assert.equal(state.bodies.at(-1).body.programmeId, 1); assert.equal(state.bodies.at(-1).body.curriculumVersion, '2027');
    const created = region('Curriculums').getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit TEST 2027', exact: true }) }); await created.getByText('130', { exact: true }).waitFor();
    // Summary actions act on the record whose level is open.
    await page.getByRole('button', { name: 'Edit TEST', exact: true }).click(); const edit = page.getByRole('dialog', { name: 'Edit programme', exact: true });
    await edit.getByLabel('Programme name').fill('Fictional renamed programme'); await save(edit); await edit.waitFor({ state: 'hidden' });
    assert.deepEqual(state.bodies.at(-1).body, { programmeName: 'Fictional renamed programme', reason });
    await page.locator('.admin-structure-summary').getByText('Fictional renamed programme', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Deactivate TEST', exact: true }).click(); await confirm(page, 'Deactivate programme', 'Deactivate');
    await page.locator('.admin-structure-summary').getByText('Inactive', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add curriculum', exact: true }).isDisabled(), true);
    await page.getByText('Reactivate this programme to add curricula.', { exact: true }).waitFor();
    assert.ok(state.bodies.every(b => b.body.reason === reason)); assert.ok(state.bodies.every(b => b.method !== 'DELETE'));
  });
  await check('academic structure: inactive parent disables add with a note; children still open (S3-P004-038)', async page => {
    const state = await mock(page); academicStore(state).faculties[0].isActive = false; const { region } = structure(page);
    await page.goto(base + '/admin/faculties/1'); await region('Departments').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add department', exact: true }).isDisabled(), true);
    await page.getByText('Reactivate this faculty to add departments.', { exact: true }).waitFor();
    await region('Departments').getByRole('link', { name: 'DEPT', exact: true }).click(); await page.waitForURL(base + '/admin/faculties/1/departments/1');
    await region('Programmes').waitFor(); assert.equal(await page.getByRole('button', { name: 'Add programme', exact: true }).isDisabled(), false);
  });
  await check('academic structure: department moved to another faculty from its page follows it; mismatched and unknown addresses show not found (S3-P004-038)', async page => {
    const state = await mock(page); academicStore(state).departments.push({ departmentId: 3, departmentCode: 'NEWD', departmentName: 'Fictional movable department', facultyId: 1, isActive: true });
    const { crumbs } = structure(page); await page.goto(base + '/admin/faculties/1/departments/3');
    await page.getByRole('button', { name: 'Edit NEWD', exact: true }).click(); const edit = page.getByRole('dialog', { name: 'Edit department', exact: true });
    await edit.getByLabel('Faculty', { exact: true }).selectOption('2'); await save(edit); await edit.waitFor({ state: 'hidden' });
    await page.waitForURL(base + '/admin/faculties/2/departments/3');
    await page.waitForFunction(() => document.querySelector('nav[aria-label="Academic structure path"]')?.textContent?.includes('OTHER'));
    assert.deepEqual(await crumbs.locator('li').allInnerTexts(), ['Faculties', 'OTHER', 'NEWD']);
    for (const stale of ['/admin/faculties/1/departments/2', '/admin/faculties/99', '/admin/faculties/1/departments/1/programmes/2']) {
      await page.goto(base + stale); await page.getByRole('alert').filter({ hasText: 'This record is not here any more.' }).waitFor();
      assert.equal(await page.getByText('Fictional other department').count(), 0); assert.equal(await page.getByText('Fictional legacy programme').count(), 0);
    }
    await page.getByRole('link', { name: 'Back to Faculties', exact: true }).click(); await page.waitForURL(base + '/admin/faculties');
  });
  await check('academic structure: old addresses redirect and the menu has one Academic Structure link (S3-P004-038)', async page => {
    await mock(page); const { region } = structure(page);
    for (const old of ['departments', 'programmes']) { await page.goto(base + '/admin/' + old); await page.waitForURL(base + '/admin/faculties'); await region('Faculties').waitFor(); }
    const nav = page.getByRole('navigation', { name: 'Administration navigation' });
    await nav.getByRole('link', { name: 'Academic Structure', exact: true }).waitFor();
    for (const gone of ['Faculties', 'Departments', 'Programmes']) assert.equal(await nav.getByRole('link', { name: gone, exact: true }).count(), 0);
    await page.goto(base + '/admin/faculties/1/departments/1'); await region('Programmes').waitFor();
    assert.equal(await nav.getByRole('link', { name: 'Academic Structure', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('heading', { name: 'Academic Structure', exact: true, level: 1 }).count(), 1);
  });
  for (const width of [1440, 375]) await check('programmes: Students by intake column lists each intake year, not set and no students at ' + width + ' (S3-P004-037)', async page => {
    const state = await mock(page); await page.setViewportSize({ width, height: 900 }); await page.goto(base + '/admin/faculties/1/departments/1/programmes/1');
    const table = page.getByRole('region', { name: 'Curriculums', exact: true }); await table.waitFor();
    if (width === 1440) assert.ok((await table.getByRole('columnheader').allInnerTexts()).includes('Students by intake'));
    const first = table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit TEST 2026', exact: true }) });
    assert.deepEqual(await first.locator('.admin-intakes li').allInnerTexts(), ['2027 intake: 12', '2026 intake: 225', 'Not set: 3']);
    assert.equal(await first.locator('td[data-label="Students by intake"]').count(), 1);
    // A new curriculum has no students yet.
    await page.getByRole('button', { name: 'Add curriculum', exact: true }).click(); const add = page.getByRole('dialog', { name: 'Add curriculum', exact: true }); await add.waitFor();
    await add.getByLabel('Version').fill('2028'); await add.getByLabel('Total credits').fill('130');
    await save(add); await add.waitFor({ state: 'hidden' });
    const created = table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit TEST 2028', exact: true }) });
    assert.deepEqual(await created.locator('.admin-intakes li').allInnerTexts(), ['No students']);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll at ' + width);
    assert.ok(state.requests.some(request => request.path === '/api/admin/academic-setup/curricula'));
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.wrangler/admin-review/academic-programmes-intakes-' + width + '.png', fullPage: true });
  }, width);
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
    // Saving refreshes the list, which briefly unmounts the table; wait for the reloaded state before counting.
    await page.getByRole('button', { name: 'Set current 2026/2027 · Semester 2', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Set current 2026/2027 · Semester 1', exact: true }).waitFor({ state: 'detached' });
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
    // S3-P004-025: semester types and dates read in words, not database codes or ISO dates.
    const semesterText = await page.getByRole('region', { name: 'Academic semesters', exact: true }).innerText();
    assert.match(semesterText, /Regular/); assert.match(semesterText, /Short/); assert.doesNotMatch(semesterText, /NORMAL|SHORT|2027-09-01|— to —/);
    assert.match(semesterText, /Not set/); assert.match(semesterText, /Sept? 2027 to .*Dec 2027/);
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
    // S3-P004-025: the account shows its name and email, not "Account 2"; the end button names who and where, and times have no seconds.
    const assignmentsTable = page.getByRole('region', { name: 'Coordinator assignments', exact: true });
    await assignmentsTable.getByRole('link', { name: 'Fictional Account 2', exact: true }).waitFor(); await assignmentsTable.getByText('fixture2@example.invalid', { exact: true }).waitFor();
    const assignmentsText = await assignmentsTable.innerText(); assert.doesNotMatch(assignmentsText, /Account #|\d\d:\d\d:\d\d/);
    assert.equal(await page.getByRole('button', { name: 'End assignment for Fictional Account 2, TEST at Fictional learning centre', exact: true }).innerText(), 'End assignment');
    await page.getByRole('button', { name: 'End assignment for Fictional Account 2, TEST at Fictional learning centre', exact: true }).click();
    await page.getByRole('dialog', { name: 'End coordinator assignment', exact: true }).getByText('End Fictional Account 2’s assignment to TEST at Fictional learning centre. Its history is retained.').waitFor();
    await confirm(page, 'End coordinator assignment', 'End assignment');
    assert.equal(await page.getByRole('button', { name: 'End assignment for Fictional Account 2, TEST at Fictional learning centre', exact: true }).count(), 0); assert.ok(data.assignments[0].endedAt);
    await page.getByRole('button', { name: 'Add assignment', exact: true }).click(); await picker.selectOption('2');
    await dialog.getByLabel('Faculty', { exact: true }).selectOption('1'); await dialog.getByLabel('Programme', { exact: true }).selectOption('1'); await dialog.getByLabel('Learning centre', { exact: true }).selectOption('1'); await save(dialog); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'End assignment for Fictional Account 2, TEST at Fictional learning centre', exact: true }).waitFor(); assert.equal(data.assignments.length, 2); assert.ok(data.assignments[0].endedAt);
    await page.screenshot({ path: '.wrangler/admin-review/academic-assignments-desktop.png', fullPage: true });
  });
  for (const width of [320, 375, 768]) await check('academic pages single card, responsive tables/dialogs and focus at ' + width, async page => {
    await mock(page); await page.setViewportSize({ width, height: 844 });
    for (const [path, title, action] of [...routes, ...levels]) {
      await page.goto(base + '/admin/' + path); const opener = page.getByRole('button', { name: action, exact: true }); await opener.waitFor();
      await page.getByRole('table').first().waitFor(); assert.equal(await page.locator('.admin-card').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const tableRegion = page.locator('.admin-table-scroll').first();
      assert.equal(await tableRegion.getAttribute('tabindex'), '0');
      if (width <= 600) {
        // S3-P004-025: rows stack with a label per value, so nothing needs a sideways scroll and every row button is on screen.
        assert.ok(await tableRegion.evaluate(el => el.scrollWidth <= el.clientWidth));
        assert.ok(await tableRegion.locator('td[data-label]').count() > 0);
        for (const button of await tableRegion.locator('tbody button').all()) { const b = await button.boundingBox(); assert.ok(b && b.x >= 0 && b.x + b.width <= width, 'row button off screen at ' + width); }
      } else {
        assert.ok(await tableRegion.evaluate(el => el.scrollWidth > el.clientWidth));
        await tableRegion.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        assert.ok(await tableRegion.evaluate(el => el.scrollLeft > 0));
        await tableRegion.evaluate(el => { el.scrollLeft = 0; });
      }
      if (width === 375) await page.screenshot({ path: '.wrangler/admin-review/academic-' + path.replaceAll('/', '-') + '-mobile.png', fullPage: true });
      await opener.click(); const dialog = page.getByRole('dialog'); await dialog.waitFor();
      const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375 || width === 768) await page.screenshot({ path: '.wrangler/admin-review/academic-' + path.replaceAll('/', '-') + '-dialog-' + width + '.png', fullPage: true });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); assert.equal(await opener.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.getByRole('heading', { name: title, exact: true }).count(), 1);
    }
  }, width);
}
