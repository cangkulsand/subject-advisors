import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAcademicSetupRepository } from './academic-repository';
import { createAdminRepository, type AdminStatement, type AdminTransaction } from './repository';
import type { AdminRepository } from './contracts';

// No fallback to application credentials. This suite accepts only an explicitly named disposable loopback DB.
const databaseUrl = process.env.ACADEMIC_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || !/^\/utm_db_foundation_[a-z0-9_]+_test$/.test(target.pathname) || target.search || target.hash) throw new Error('Academic repository tests require an explicit disposable loopback database.');
}
interface PgClient { connect(): Promise<void>; end(): Promise<void>; query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
describe.skipIf(!databaseUrl)('academic repository on disposable PostgreSQL', () => {
  let client: PgClient;
  let repository: ReturnType<typeof createAcademicSetupRepository>;
  let accounts: AdminRepository;
  const actor = 'user_academic_test_admin';
  const reason = 'Reviewed test change';
  const input = { academicYear: '2080/2081', semesterNo: 1 as const, semesterType: 'NORMAL' as const, maxSubjects: 4, maxCredits: 12, startDate: '2080-01-01', endDate: '2080-05-01', selectionOpensAt: null, selectionClosesAt: null, reason };
  beforeAll(async () => {
    const moduleName = 'pg';
    const pg = await import(/* @vite-ignore */ moduleName) as { default?: { Client: new (config: unknown) => PgClient }; Client?: new (config: unknown) => PgClient };
    const Client = pg.Client ?? pg.default!.Client;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    if (!(await client.query("SELECT to_regclass('public.academic_setup_audit_log') AS installed")).rows[0]?.installed) throw new Error('Migration 0008 is required.');
    if (!(await client.query("SELECT to_regclass('public.department') AS installed")).rows[0]?.installed) throw new Error('Migration 0010 is required.');
  });
  afterAll(async () => { await client?.end(); });
  beforeEach(async () => {
    await client.query('BEGIN');
    let serial = 0;
    const transaction: AdminTransaction = async (statements: AdminStatement[]) => {
      const name = 'academic_repo_' + serial++;
      await client.query('SAVEPOINT ' + name);
      try {
        const results = [];
        for (const statement of statements) results.push((await client.query(statement.text, statement.values)).rows);
        await client.query('RELEASE SAVEPOINT ' + name);
        await client.query("SELECT set_config('app.access_actor','',true), set_config('app.access_reason','',true)");
        return results;
      } catch (error) { await client.query('ROLLBACK TO SAVEPOINT ' + name); throw error; }
    };
    const query = async (text: string, values: unknown[]) => (await client.query(text, values)).rows;
    repository = createAcademicSetupRepository(query, transaction);
    accounts = createAdminRepository(query, transaction);
  });
  afterEach(async () => { await client.query('ROLLBACK'); });
  async function seed() {
    const faculty = await repository.createFaculty({ facultyCode: 'TEST_F', facultyName: 'Test faculty', reason }, actor);
    const centre = await repository.createLearningCentre({ centreCode: 'TEST_C', centreName: 'Test centre', reason }, actor);
    const department = await repository.createDepartment({ departmentCode: 'TEST_D', departmentName: 'Test department', facultyId: faculty.facultyId, reason }, actor);
    const programmeId = Number((await client.query("INSERT INTO public.programme(programme_code,programme_name) VALUES ('TEST_P','Test programme') RETURNING programme_id")).rows[0]!.programme_id);
    await repository.setProgrammeDepartment(programmeId, { departmentId: department.departmentId, reason }, actor);
    const account = await accounts.createAccount('user_academic_coordinator', ['COORDINATOR'], actor, reason);
    return { faculty, department, centre, account, programmeId, assignment: { accountId: account.accountId, facultyId: faculty.facultyId, programmeId, learningCentreId: centre.learningCentreId, reason } };
  }
  it('creates and sparsely updates references, lists inactive rows deliberately and records normalized audit context', async () => {
    const centre = await repository.createLearningCentre({ centreCode: 'QA', centreName: 'QA centre', reason: '  Reviewed test change  ' }, actor);
    const updated = await repository.updateLearningCentre(centre.learningCentreId, { centreName: 'Renamed', reason }, actor);
    expect(updated).toEqual({ ...centre, centreName: 'Renamed' });
    await repository.updateLearningCentre(centre.learningCentreId, { isActive: false, reason }, actor);
    expect(await repository.listLearningCentres(false)).not.toContainEqual(expect.objectContaining({ learningCentreId: centre.learningCentreId }));
    expect(await repository.listActiveLearningCentres()).not.toContainEqual(expect.objectContaining({ learningCentreId: centre.learningCentreId }));
    expect(await repository.listLearningCentres(true)).toContainEqual({ ...updated, isActive: false });
    const faculty = await repository.createFaculty({ facultyCode: 'QF', facultyName: 'QA faculty', reason }, actor);
    expect(await repository.updateFaculty(faculty.facultyId, { facultyName: 'Renamed', isActive: false, reason }, actor)).toEqual({ ...faculty, facultyName: 'Renamed', isActive: false });
    expect(await repository.listFaculties(false)).not.toContainEqual(expect.objectContaining({ facultyId: faculty.facultyId }));
    expect(await repository.listFaculties(true)).toContainEqual(expect.objectContaining({ facultyId: faculty.facultyId, isActive: false }));
    const audits = (await client.query('SELECT actor,reason FROM public.academic_setup_audit_log WHERE entity_type=$1 AND entity_id=$2', ['learning_centre', centre.learningCentreId])).rows;
    expect(audits).toHaveLength(3);
    expect(audits.every(row => row.actor === actor && row.reason === reason)).toBe(true);
    expect((await client.query("SELECT current_setting('app.access_actor',true) AS actor,current_setting('app.access_reason',true) AS reason")).rows[0]).toEqual({ actor: '', reason: '' });
  });
  it('assigns a department, derives the faculty, clears both and rejects inactive departments', async () => {
    const data = await seed();
    expect(await repository.listProgrammeFaculties()).toContainEqual({ programmeId: data.programmeId, programmeCode: 'TEST_P', programmeName: 'Test programme', level: null, isActive: true, facultyId: data.faculty.facultyId, faculty: data.faculty, departmentId: data.department.departmentId, department: data.department });
    expect(await repository.setProgrammeDepartment(data.programmeId, { departmentId: null, reason }, actor)).toMatchObject({ facultyId: null, faculty: null, departmentId: null, department: null });
    await repository.updateDepartment(data.department.departmentId, { isActive: false, reason }, actor);
    await expect(repository.setProgrammeDepartment(data.programmeId, { departmentId: data.department.departmentId, reason }, actor)).rejects.toMatchObject({ code: 'REFERENCE_INACTIVE' });
  });
  it('creates, deactivates and audits programmes and guards curricula under an inactive programme', async () => {
    const data = await seed();
    const created = await repository.createProgramme({ programmeCode: 'NEW_P', programmeName: 'New programme', level: 'Degree', departmentId: data.department.departmentId, reason }, actor);
    expect(created).toMatchObject({ programmeCode: 'NEW_P', level: 'Degree', isActive: true, facultyId: data.faculty.facultyId, departmentId: data.department.departmentId });
    await repository.createCoordinatorAssignment({ ...data.assignment, programmeId: created.programmeId }, actor);
    expect(await repository.listScopes(data.account.clerkUserId)).toContainEqual(expect.objectContaining({ programmeId: created.programmeId }));
    const deactivated = await repository.updateProgramme(created.programmeId, { isActive: false, reason }, actor);
    expect(deactivated.isActive).toBe(false);
    expect(await repository.listScopes(data.account.clerkUserId)).not.toContainEqual(expect.objectContaining({ programmeId: created.programmeId }));
    const audits = (await client.query('SELECT action FROM public.academic_setup_audit_log WHERE entity_type=$1 AND entity_id=$2 ORDER BY audit_id', ['programme', created.programmeId])).rows;
    expect(audits.map(row => row.action)).toEqual(['INSERT', 'UPDATE']);
    await expect(repository.createCurriculum({ programmeId: created.programmeId, curriculumVersion: '2080', totalCreditRequired: 120, effectiveYear: null, reason }, actor)).rejects.toMatchObject({ code: 'REFERENCE_INACTIVE' });
    await expect(repository.createProgramme({ programmeCode: 'GONE_P', programmeName: 'Gone', level: null, departmentId: 2147483647, reason }, actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('creates, lists and edits curricula and writes no audit row for a raw insert without actor context', async () => {
    const data = await seed();
    const created = await repository.createCurriculum({ programmeId: data.programmeId, curriculumVersion: '2080', totalCreditRequired: 120, effectiveYear: 2080, reason }, actor);
    expect(created).toMatchObject({ programmeId: data.programmeId, curriculumVersion: '2080', isActive: true, subjectCount: 0 });
    await expect(repository.createCurriculum({ programmeId: data.programmeId, curriculumVersion: '2080', totalCreditRequired: 90, effectiveYear: null, reason }, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await repository.updateCurriculum(created.curriculumId, { totalCreditRequired: 0, isActive: false, reason }, actor)).toEqual({ ...created, totalCreditRequired: 0, isActive: false });
    expect(await repository.listCurricula()).toContainEqual(expect.objectContaining({ curriculumId: created.curriculumId, isActive: false }));
    const raw = await client.query("INSERT INTO public.curriculum(programme_id,curriculum_version,total_credit_required) VALUES ($1,'RAW',10) RETURNING curriculum_id", [data.programmeId]);
    const audits = await client.query("SELECT 1 FROM public.academic_setup_audit_log WHERE entity_type='curriculum' AND entity_id=$1", [raw.rows[0]!.curriculum_id]);
    expect(audits.rows).toHaveLength(0);
  });
  it('keeps the legacy faculty of a programme without a department when the department is left empty', async () => {
    const faculty = await repository.createFaculty({ facultyCode: 'LEG_F', facultyName: 'Legacy faculty', reason }, actor);
    const programmeId = Number((await client.query("INSERT INTO public.programme(programme_code,programme_name) VALUES ('LEG_P','Legacy programme') RETURNING programme_id")).rows[0]!.programme_id);
    await client.query("SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)", [actor, reason]);
    await client.query('UPDATE public.programme SET faculty_id=$2 WHERE programme_id=$1', [programmeId, faculty.facultyId]);
    await client.query("SELECT set_config('app.access_actor','',true), set_config('app.access_reason','',true)");
    expect(await repository.setProgrammeDepartment(programmeId, { departmentId: null, reason }, actor)).toMatchObject({ facultyId: faculty.facultyId, departmentId: null });
  });
  it('creates, updates and deactivates departments with audit and refuses to move a department that has programmes', async () => {
    const data = await seed();
    const other = await repository.createFaculty({ facultyCode: 'DEP_F2', facultyName: 'Second faculty', reason }, actor);
    const renamed = await repository.updateDepartment(data.department.departmentId, { departmentName: 'Renamed', reason }, actor);
    expect(renamed).toEqual({ ...data.department, departmentName: 'Renamed' });
    await expect(repository.updateDepartment(data.department.departmentId, { facultyId: other.facultyId, reason }, actor)).rejects.toMatchObject({ code: 'DEPARTMENT_HAS_PROGRAMMES' });
    await expect(repository.createDepartment({ departmentCode: 'TEST_D', departmentName: 'Duplicate', facultyId: data.faculty.facultyId, reason }, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    const empty = await repository.createDepartment({ departmentCode: 'EMPTY_D', departmentName: 'Empty', facultyId: data.faculty.facultyId, reason }, actor);
    expect(await repository.updateDepartment(empty.departmentId, { facultyId: other.facultyId, isActive: false, reason }, actor)).toEqual({ ...empty, facultyId: other.facultyId, isActive: false });
    expect(await repository.listDepartments(false)).not.toContainEqual(expect.objectContaining({ departmentId: empty.departmentId }));
    expect(await repository.listDepartments(true)).toContainEqual(expect.objectContaining({ departmentId: empty.departmentId, isActive: false }));
    await repository.updateFaculty(other.facultyId, { isActive: false, reason }, actor);
    await expect(repository.createDepartment({ departmentCode: 'LATE_D', departmentName: 'Late', facultyId: other.facultyId, reason }, actor)).rejects.toMatchObject({ code: 'REFERENCE_INACTIVE' });
    const audits = (await client.query('SELECT action FROM public.academic_setup_audit_log WHERE entity_type=$1 AND entity_id=$2 ORDER BY audit_id', ['department', empty.departmentId])).rows;
    expect(audits.map(row => row.action)).toEqual(['INSERT', 'UPDATE']);
    const programmeAudits = (await client.query('SELECT after_data FROM public.academic_setup_audit_log WHERE entity_type=$1 AND entity_id=$2', ['programme', data.programmeId])).rows;
    expect(programmeAudits).toHaveLength(1);
    expect(programmeAudits[0]!.after_data).toMatchObject({ department_id: data.department.departmentId, faculty_id: data.faculty.facultyId });
  });
  it('rejects a programme faculty that differs from its department faculty', async () => {
    const data = await seed();
    const other = await repository.createFaculty({ facultyCode: 'MIS_F', facultyName: 'Mismatch faculty', reason }, actor);
    await client.query("SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)", [actor, reason]);
    await expect(client.query('UPDATE public.programme SET faculty_id=$2 WHERE programme_id=$1', [data.programmeId, other.facultyId])).rejects.toMatchObject({ code: '23514', message: 'ACADEMIC_SETUP:PROGRAMME_FACULTY_MISMATCH' });
  });
  it('keeps no-current explicit, atomically switches, no-ops repeated selection and preserves marker on failure', async () => {
    expect(await repository.getCurrentAcademicSemester()).toBeNull();
    expect(await repository.currentSemesterId()).toBeNull();
    const first = await repository.createAcademicSemester(input, actor);
    const second = await repository.createAcademicSemester({ ...input, semesterNo: 2 }, actor);
    expect(first).toMatchObject({ academicYear: input.academicYear, semesterNo: 1, startDate: input.startDate, isCurrent: false });
    expect(await repository.setCurrentAcademicSemester({ semesterId: first.semesterId, reason }, actor)).toEqual({ ...first, isCurrent: true });
    await repository.setCurrentAcademicSemester({ semesterId: second.semesterId, reason }, actor);
    await repository.setCurrentAcademicSemester({ semesterId: second.semesterId, reason }, actor);
    await expect(repository.setCurrentAcademicSemester({ semesterId: 2147483647, reason }, actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await repository.getCurrentAcademicSemester()).toEqual({ ...second, isCurrent: true });
    expect(await repository.currentSemesterId()).toBe(second.semesterId);
    expect((await repository.listAcademicSemesters()).filter(row => row.isCurrent)).toHaveLength(1);
    expect((await client.query("SELECT count(*) AS total FROM public.academic_setup_audit_log WHERE action='SET_CURRENT'")).rows[0]!.total).toBe('2');
  });
  it('applies only supplied semester fields and checks merged date/type invariants inside PostgreSQL', async () => {
    const row = await repository.createAcademicSemester(input, actor);
    expect(await repository.updateAcademicSemester(row.semesterId, { maxSubjects: 0, startDate: null, reason }, actor)).toEqual({ ...row, maxSubjects: 0, startDate: null });
    await expect(repository.updateAcademicSemester(row.semesterId, { semesterNo: 3, reason }, actor)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.updateAcademicSemester(row.semesterId, { startDate: '2080-06-01', reason }, actor)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(await repository.updateAcademicSemester(row.semesterId, { semesterNo: 3, semesterType: 'SHORT', reason }, actor)).toMatchObject({ semesterNo: 3, semesterType: 'SHORT', maxSubjects: 0, startDate: null });
  });
  it('stores and returns selection dates as UTC ISO text and rejects a closing time before the opening time', async () => {
    const row = await repository.createAcademicSemester({ ...input, semesterNo: 2, selectionOpensAt: '2080-01-10T02:00:00.000Z', selectionClosesAt: '2080-02-10T02:00:00.000Z' }, actor);
    expect(row).toMatchObject({ selectionOpensAt: '2080-01-10T02:00:00.000Z', selectionClosesAt: '2080-02-10T02:00:00.000Z' });
    await expect(repository.updateAcademicSemester(row.semesterId, { selectionClosesAt: '2080-01-01T00:00:00.000Z', reason }, actor)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
  it('creates, filters and ends assignment history, with direct missing and duplicate codes', async () => {
    const data = await seed();
    const created = await repository.createCoordinatorAssignment(data.assignment, actor);
    expect(created).toMatchObject({ accountId: data.account.accountId, facultyId: data.faculty.facultyId, programmeId: data.programmeId, learningCentreId: data.centre.learningCentreId, endedAt: null });
    expect(created.startedAt).toMatch(/Z$/);
    await expect(repository.createCoordinatorAssignment(data.assignment, actor)).rejects.toMatchObject({ code: 'ASSIGNMENT_ACTIVE' });
    expect(await repository.listCoordinatorAssignments({ accountId: data.account.accountId, programmeId: data.programmeId, learningCentreId: data.centre.learningCentreId })).toEqual([created]);
    expect(await repository.listCoordinatorAssignments({ accountId: 2147483647 })).toEqual([]);
    const ended = await repository.endCoordinatorAssignment(created.assignmentId, { reason }, actor);
    expect(ended.endedAt).toMatch(/Z$/);
    await expect(repository.endCoordinatorAssignment(created.assignmentId, { reason }, actor)).rejects.toMatchObject({ code: 'ASSIGNMENT_ENDED' });
    expect(await repository.listCoordinatorAssignments({})).toContainEqual(ended);
    expect(await repository.listScopes(data.account.clerkUserId)).toEqual([]);
    expect((await repository.createCoordinatorAssignment(data.assignment, actor)).assignmentId).not.toBe(created.assignmentId);
  });
  it.each(['centre', 'faculty', 'programme', 'account', 'role'] as const)('rechecks live %s state on every scope read', async kind => {
    const data = await seed();
    await repository.createCoordinatorAssignment(data.assignment, actor);
    const expected = { facultyId: data.faculty.facultyId, programmeId: data.programmeId, learningCentreId: data.centre.learningCentreId };
    expect(await repository.listScopes(data.account.clerkUserId)).toEqual([expected]);
    expect(await repository.isScopeAssigned(data.account.clerkUserId, data.programmeId, data.centre.learningCentreId)).toBe(true);
    expect(await repository.isScopeAssigned('user_someone_else', data.programmeId, data.centre.learningCentreId)).toBe(false);
    if (kind === 'centre') await repository.updateLearningCentre(data.centre.learningCentreId, { isActive: false, reason }, actor);
    if (kind === 'faculty') await repository.updateFaculty(data.faculty.facultyId, { isActive: false, reason }, actor);
    if (kind === 'programme') await client.query("UPDATE public.programme SET status='INACTIVE' WHERE programme_id=$1", [data.programmeId]);
    if (kind === 'account') await accounts.setAccessStatus(data.account.accountId, 'SUSPENDED', actor, reason);
    if (kind === 'role') { await accounts.grantRole(data.account.accountId, 'STUDENT', actor, reason); await accounts.revokeRole(data.account.accountId, 'COORDINATOR', actor, reason); }
    expect(await repository.listScopes(data.account.clerkUserId)).toEqual([]);
    expect(await repository.isScopeAssigned(data.account.clerkUserId, data.programmeId, data.centre.learningCentreId)).toBe(false);
    // Admin history survives deactivation and role/access changes.
    expect(await repository.listCoordinatorAssignments({ accountId: data.account.accountId })).toHaveLength(1);
  });
  it('allows NULL and mixed-case active programme status and excludes inconsistent faculty data', async () => {
    const data = await seed();
    await repository.createCoordinatorAssignment(data.assignment, actor);
    await client.query("UPDATE public.programme SET status='aCtIvE' WHERE programme_id=$1", [data.programmeId]);
    expect(await repository.listScopes(data.account.clerkUserId)).toHaveLength(1);
    // Corrupt legacy fixture only: prove scope reads fail closed even if stored references disagree.
    await client.query('ALTER TABLE public.programme DISABLE TRIGGER academic_programme_context');
    await client.query('ALTER TABLE public.programme DISABLE TRIGGER academic_programme_audit');
    await client.query('UPDATE public.programme SET faculty_id=NULL WHERE programme_id=$1', [data.programmeId]);
    await client.query('ALTER TABLE public.programme ENABLE TRIGGER academic_programme_context');
    await client.query('ALTER TABLE public.programme ENABLE TRIGGER academic_programme_audit');
    expect(await repository.listScopes(data.account.clerkUserId)).toEqual([]);
    expect(await repository.isScopeAssigned(data.account.clerkUserId, data.programmeId, data.centre.learningCentreId)).toBe(false);
  });
  it('maps invalid references, roles, access, programme mismatch and active reassignment safely', async () => {
    const data = await seed();
    const other = await repository.createFaculty({ facultyCode: 'OTHER', facultyName: 'Other', reason }, actor);
    await expect(repository.createCoordinatorAssignment({ ...data.assignment, facultyId: other.facultyId }, actor)).rejects.toMatchObject({ code: 'PROGRAMME_FACULTY_MISMATCH' });
    await repository.createCoordinatorAssignment(data.assignment, actor);
    const otherDepartment = await repository.createDepartment({ departmentCode: 'OTHER_D', departmentName: 'Other department', facultyId: other.facultyId, reason }, actor);
    await expect(repository.setProgrammeDepartment(data.programmeId, { departmentId: otherDepartment.departmentId, reason }, actor)).rejects.toMatchObject({ code: 'ASSIGNMENT_ACTIVE' });
    await accounts.grantRole(data.account.accountId, 'STUDENT', actor, reason);
    await accounts.revokeRole(data.account.accountId, 'COORDINATOR', actor, reason);
    await expect(repository.createCoordinatorAssignment(data.assignment, actor)).rejects.toMatchObject({ code: 'COORDINATOR_ROLE_REQUIRED' });
    await accounts.setAccessStatus(data.account.accountId, 'SUSPENDED', actor, reason);
    await expect(repository.createCoordinatorAssignment(data.assignment, actor)).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    await accounts.setAccessStatus(data.account.accountId, 'ACTIVE', actor, reason);
    await accounts.grantRole(data.account.accountId, 'COORDINATOR', actor, reason);
    await repository.updateLearningCentre(data.centre.learningCentreId, { isActive: false, reason }, actor);
    await expect(repository.createCoordinatorAssignment(data.assignment, actor)).rejects.toMatchObject({ code: 'REFERENCE_INACTIVE' });
  });
  it('returns NOT_FOUND for every missing direct mutation and keeps driver text private', async () => {
    const id = 2147483647;
    for (const operation of [() => repository.updateLearningCentre(id, { isActive: false, reason }, actor), () => repository.updateFaculty(id, { isActive: false, reason }, actor),
      () => repository.setProgrammeDepartment(id, { departmentId: null, reason }, actor), () => repository.updateDepartment(id, { isActive: false, reason }, actor), () => repository.updateAcademicSemester(id, { maxCredits: 0, reason }, actor),
      () => repository.endCoordinatorAssignment(id, { reason }, actor)]) await expect(operation()).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await repository.createAcademicSemester(input, actor);
    await expect(repository.createAcademicSemester(input, actor)).rejects.toMatchObject({ code: 'CONFLICT', message: 'The change conflicts with the current state. Reload and retry.' });
    await expect(repository.createFaculty({ facultyCode: 'BAD', facultyName: 'Bad', reason: ' ' }, actor)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.createFaculty({ facultyCode: 'BAD', facultyName: 'Bad', reason }, ' ')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(await repository.listFaculties(true)).toEqual([]);
  });
});
