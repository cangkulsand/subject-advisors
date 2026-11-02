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
  const input = { academicYear: '2080/2081', semesterNo: 1 as const, semesterType: 'NORMAL' as const, maxSubjects: 4, maxCredits: 12, startDate: '2080-01-01', endDate: '2080-05-01', reason };
  beforeAll(async () => {
    const moduleName = 'pg';
    const pg = await import(/* @vite-ignore */ moduleName) as { default?: { Client: new (config: unknown) => PgClient }; Client?: new (config: unknown) => PgClient };
    const Client = pg.Client ?? pg.default!.Client;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    if (!(await client.query("SELECT to_regclass('public.academic_setup_audit_log') AS installed")).rows[0]?.installed) throw new Error('Migration 0008 is required.');
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
    const programmeId = Number((await client.query("INSERT INTO public.programme(programme_code,programme_name) VALUES ('TEST_P','Test programme') RETURNING programme_id")).rows[0]!.programme_id);
    await repository.setProgrammeFaculty(programmeId, { facultyId: faculty.facultyId, reason }, actor);
    const account = await accounts.createAccount('user_academic_coordinator', ['COORDINATOR'], actor, reason);
    return { faculty, centre, account, programmeId, assignment: { accountId: account.accountId, facultyId: faculty.facultyId, programmeId, learningCentreId: centre.learningCentreId, reason } };
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
  it('links, reads and clears programme faculty without inferring a mapping', async () => {
    const data = await seed();
    expect(await repository.listProgrammeFaculties()).toContainEqual({ programmeId: data.programmeId, programmeCode: 'TEST_P', programmeName: 'Test programme', facultyId: data.faculty.facultyId, faculty: data.faculty });
    expect(await repository.setProgrammeFaculty(data.programmeId, { facultyId: null, reason }, actor)).toMatchObject({ facultyId: null, faculty: null });
    await repository.updateFaculty(data.faculty.facultyId, { isActive: false, reason }, actor);
    await expect(repository.setProgrammeFaculty(data.programmeId, { facultyId: data.faculty.facultyId, reason }, actor)).rejects.toMatchObject({ code: 'REFERENCE_INACTIVE' });
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
    await expect(repository.setProgrammeFaculty(data.programmeId, { facultyId: other.facultyId, reason }, actor)).rejects.toMatchObject({ code: 'ASSIGNMENT_ACTIVE' });
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
      () => repository.setProgrammeFaculty(id, { facultyId: null, reason }, actor), () => repository.updateAcademicSemester(id, { maxCredits: 0, reason }, actor),
      () => repository.endCoordinatorAssignment(id, { reason }, actor)]) await expect(operation()).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await repository.createAcademicSemester(input, actor);
    await expect(repository.createAcademicSemester(input, actor)).rejects.toMatchObject({ code: 'CONFLICT', message: 'The change conflicts with the current state. Reload and retry.' });
    await expect(repository.createFaculty({ facultyCode: 'BAD', facultyName: 'Bad', reason: ' ' }, actor)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.createFaculty({ facultyCode: 'BAD', facultyName: 'Bad', reason }, ' ')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(await repository.listFaculties(true)).toEqual([]);
  });
});
