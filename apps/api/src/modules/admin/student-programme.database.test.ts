import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAdminRepository, type AdminStatement } from './repository';
import type { AdminRepository } from './contracts';

// EXPLICIT TEST CONNECTION ONLY (disposable database already migrated through 0011). Never falls back to DATABASE_URL.
// Same harness as repository.database.test.ts: the repository's exact statements run through `pg` inside an outer
// transaction that is rolled back, each repository transaction wrapped in a SAVEPOINT, so nothing is committed.
const databaseUrl = process.env.ADMIN_TEST_DATABASE_URL;
interface PgClient { connect(): Promise<void>; end(): Promise<void>; query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }

describe.skipIf(!databaseUrl)('admin student programme change on PostgreSQL (disposable database, rolled back)', () => {
  let client: PgClient;
  let repository: AdminRepository;
  let n = 0;
  const id = (label: string) => `user_${label}_${Date.now().toString(36)}_${n++}`;
  const num = async (text: string, values: unknown[] = []) => Number((await client.query(text, values)).rows[0]!.value);

  beforeAll(async () => {
    const moduleName = 'pg';
    const pg = await import(/* @vite-ignore */ moduleName) as { default?: { Client: new (config: unknown) => PgClient }; Client?: new (config: unknown) => PgClient };
    const Client = pg.Client ?? pg.default!.Client;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const ready = (await client.query("SELECT to_regprocedure('public.db_change_student_programme(integer,integer)') AS fn")).rows[0]!;
    if (!ready.fn) throw new Error('The test database must be migrated through 0011.');
  });
  afterAll(async () => { await client?.end(); });
  beforeEach(async () => {
    await client.query('BEGIN');
    let savepoints = 0;
    repository = createAdminRepository(
      async (text, values) => (await client.query(text, values)).rows,
      async (statements: AdminStatement[]) => {
        const name = 'programme_tx_' + savepoints++;
        await client.query('SAVEPOINT ' + name);
        try {
          const results: Record<string, unknown>[][] = [];
          for (const statement of statements) results.push((await client.query(statement.text, statement.values)).rows);
          await client.query('RELEASE SAVEPOINT ' + name);
          await client.query("SELECT set_config('app.access_actor','',true), set_config('app.access_reason','',true)");
          return results;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT ' + name);
          throw error;
        }
      },
    );
  });
  afterEach(async () => { await client.query('ROLLBACK'); });

  /** Two programmes (old/new), a future semester with an open window, the current semester, a closed future semester, and one student with picks. */
  async function seed() {
    const tag = Date.now().toString(36) + n++;
    const programme = async (code: string) => num('INSERT INTO public.programme(programme_code,programme_name) VALUES ($1,$2) RETURNING programme_id AS value', [code, 'Fictional ' + code]);
    const curriculum = async (programmeId: number, status: string | null) => num('INSERT INTO public.curriculum(curriculum_version,total_credit_required,status,programme_id) VALUES ($1,$2,$3,$4) RETURNING curriculum_id AS value', ['V' + tag, 120, status, programmeId]);
    const subject = async (code: string) => num('INSERT INTO public.subject(subject_code,subject_name,credit_hours) VALUES ($1,$2,3) RETURNING subject_id AS value', [code + tag, 'Fictional ' + code]);
    const mapping = async (curriculumId: number, subjectId: number) => num("INSERT INTO public.curriculum_subject(is_compulsory,subject_category,curriculum_id,subject_id) VALUES (1,'Core',$1,$2) RETURNING curriculum_subject_id AS value", [curriculumId, subjectId]);
    const semester = async (year: string, no: number, current: boolean, closes: string | null) => {
      await client.query("SELECT set_config('app.access_actor','seed',true), set_config('app.access_reason','seed',true)");
      const semesterId = await num(`INSERT INTO public.academic_semester(academic_year,semester_no,semester_type,max_subjects,max_credits,is_current,selection_opens_at,selection_closes_at)
        VALUES ($1,$2,'NORMAL',6,18,false,CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE now() - interval '40 days' END,$3::timestamptz) RETURNING semester_id AS value`, [year, no, closes]);
      if (current) await client.query('SELECT public.db_set_current_semester($1)', [semesterId]);
      return semesterId;
    };
    const oldProgramme = await programme('OLD' + tag), newProgramme = await programme('NEW' + tag), inactiveProgramme = await programme('OFF' + tag);
    const oldCurriculum = await curriculum(oldProgramme, null), newCurriculum = await curriculum(newProgramme, 'ACTIVE'), inactiveCurriculum = await curriculum(inactiveProgramme, 'INACTIVE');
    const subjectA = await subject('A'), subjectB = await subject('B'), subjectC = await subject('C');
    const oldA = await mapping(oldCurriculum, subjectA), oldB = await mapping(oldCurriculum, subjectB), oldC = await mapping(oldCurriculum, subjectC);
    await mapping(newCurriculum, subjectA);
    const currentSemester = await semester('2090/2091', 1, true, null);
    const openSemester = await semester('2090/2091', 2, false, null);
    const closedSemester = await semester('2090/2091', 3, false, new Date(Date.now() - 86_400_000).toISOString());
    const account = await repository.createAccount(id('student'), ['STUDENT'], id('admin'), 'Add student');
    const student = await num(`INSERT INTO public.student_profile(clerk_user_id,matric_no,student_name,weekly_working_hours,available_study_hours,curriculum_id,current_semester_id)
      VALUES ($1,'A22EC0001','Fictional Student',5,10,$2,$3) RETURNING student_id AS value`, [account.clerkUserId, oldCurriculum, currentSemester]);
    for (const [semesterId, mappingId] of [[openSemester, oldA], [openSemester, oldB], [closedSemester, oldC], [currentSemester, oldC]])
      await client.query('INSERT INTO public.semester_offering(student_id,semester_id,curriculum_subject_id) VALUES ($1,$2,$3)', [student, semesterId, mappingId]);
    await client.query("INSERT INTO public.academic_record(status,recognized_credits,student_id,subject_id) VALUES ('COMPLETED',3,$1,$2)", [student, subjectA]);
    return { account, student, oldCurriculum, newCurriculum, inactiveCurriculum, currentSemester, openSemester, closedSemester, subjectA };
  }

  it('moves the student, removes only the picks of not-yet-closed future semesters, keeps records and writes the audit row', async () => {
    const s = await seed();
    const actor = id('admin');
    const result = await repository.changeStudentProgramme(s.account.accountId, s.newCurriculum, actor, 'Registered on the wrong programme');
    expect(result.removedPicks).toBe(2);
    expect(result.programme).toMatchObject({ studentId: s.student, curriculumId: s.newCurriculum });
    const profile = (await client.query('SELECT curriculum_id, current_semester_id, matric_no, weekly_working_hours FROM public.student_profile WHERE student_id=$1', [s.student])).rows[0]!;
    expect(profile).toMatchObject({ curriculum_id: s.newCurriculum, current_semester_id: s.currentSemester, matric_no: 'A22EC0001', weekly_working_hours: 5 });
    const picks = (await client.query('SELECT semester_id FROM public.semester_offering WHERE student_id=$1 ORDER BY semester_id', [s.student])).rows.map(row => row.semester_id);
    expect(picks).toEqual([s.currentSemester, s.closedSemester]);
    expect(await num('SELECT count(*) AS value FROM public.academic_record WHERE student_id=$1', [s.student])).toBe(1);
    const audit = (await client.query("SELECT actor, reason, action, before_data, after_data FROM public.academic_setup_audit_log WHERE entity_type='student_programme' AND entity_id=$1", [s.student])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor, reason: 'Registered on the wrong programme', action: 'CHANGE_PROGRAMME' });
    expect(audit[0]!.before_data).toMatchObject({ curriculumId: s.oldCurriculum });
    expect(audit[0]!.after_data).toMatchObject({ curriculumId: s.newCurriculum, removedPicks: 2 });
  });

  it('rejects an unchanged, unavailable or missing target and rolls everything back', async () => {
    const s = await seed();
    await expect(repository.changeStudentProgramme(s.account.accountId, s.oldCurriculum, id('admin'), 'Same')).rejects.toMatchObject({ code: 'PROGRAMME_UNCHANGED' });
    await expect(repository.changeStudentProgramme(s.account.accountId, s.inactiveCurriculum, id('admin'), 'Inactive')).rejects.toMatchObject({ code: 'CURRICULUM_UNAVAILABLE' });
    await expect(repository.changeStudentProgramme(s.account.accountId, 2147483000, id('admin'), 'Missing')).rejects.toMatchObject({ code: 'CURRICULUM_UNAVAILABLE' });
    await expect(repository.changeStudentProgramme(2147483000, s.newCurriculum, id('admin'), 'No account')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const staff = await repository.createAccount(id('coord'), ['COORDINATOR'], id('admin'), 'Add coordinator');
    await expect(repository.changeStudentProgramme(staff.accountId, s.newCurriculum, id('admin'), 'No profile')).rejects.toMatchObject({ code: 'STUDENT_PROFILE_NOT_FOUND' });
    expect(await num('SELECT curriculum_id AS value FROM public.student_profile WHERE student_id=$1', [s.student])).toBe(s.oldCurriculum);
    expect(await num('SELECT count(*) AS value FROM public.semester_offering WHERE student_id=$1', [s.student])).toBe(4);
  });

  it('keeps direct curriculum updates blocked outside the controlled function', async () => {
    const s = await seed();
    await expect(client.query('UPDATE public.student_profile SET curriculum_id=$2 WHERE student_id=$1', [s.student, s.newCurriculum])).rejects.toMatchObject({ code: '23514' });
  });

  it('reads the student programme and lists only active curricula', async () => {
    const s = await seed();
    expect(await repository.studentProgramme(s.account.accountId)).toMatchObject({ studentId: s.student, curriculumId: s.oldCurriculum, matricNo: 'A22EC0001' });
    const staff = await repository.createAccount(id('coord'), ['COORDINATOR'], id('admin'), 'Add coordinator');
    expect(await repository.studentProgramme(staff.accountId)).toBeNull();
    const ids = (await repository.curriculumOptions()).map(option => option.curriculumId);
    expect(ids).toContain(s.newCurriculum);
    expect(ids).not.toContain(s.inactiveCurriculum);
  });

  it('keeps the audit log append-only', async () => {
    const s = await seed();
    await repository.changeStudentProgramme(s.account.accountId, s.newCurriculum, id('admin'), 'Audit me');
    await expect(client.query("UPDATE public.academic_setup_audit_log SET reason='x' WHERE entity_type='student_programme'")).rejects.toMatchObject({ code: '23514' });
  });
});
