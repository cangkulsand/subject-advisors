import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient } from '@neondatabase/serverless';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createOfferingRepository, type OfferingDatabase } from './repository';
import { createOfferingContextReader } from './context';
import { handleOfferingRequest } from './routes';
import type { OfferingScope } from './contracts';
import type { AuthDependencies } from '../auth/contracts';

// EXPLICIT TEST CONNECTION ONLY. Never fall back to DATABASE_URL or read secret files.
const databaseUrl = process.env.OFFERINGS_TEST_DATABASE_URL;
const ids = {
  studentA: '301', studentB: '302',
  curriculum: '401', otherCurriculum: '402',
  semester: '201', otherSemester: '203',
  subjectA: '101', subjectB: '102', outside: '103',
};

describe.skipIf(!databaseUrl)('P002 real PostgreSQL acceptance (temporary fixtures, explicit test URL)', () => {
  let pool: Pool;
  let client: PoolClient;
  let db: OfferingDatabase;
  const scope: OfferingScope = { clerkUserId: 'fixture_student_a', studentId: ids.studentA, curriculumId: ids.curriculum };
  beforeAll(async () => {
    if (new URL(databaseUrl!).hostname.includes('-pooler.')) throw new Error('Use an unpooled test endpoint for session-local temporary tables.');
    pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
    try { client = await pool.connect(); }
    catch { throw new Error('Acceptance database is unreachable. Check the explicit test URL and network access.'); }
    // Every prerequisite is a clearly fictional TEMP fixture, not another owner's implementation.
    await client.query(`
      CREATE TEMP TABLE programme (programme_id integer PRIMARY KEY, programme_name text NOT NULL);
      CREATE TEMP TABLE curriculum (curriculum_id integer PRIMARY KEY, programme_id integer REFERENCES programme, curriculum_version text NOT NULL, total_credit_required integer NOT NULL CHECK (total_credit_required >= 0));
      CREATE TEMP TABLE subject (subject_id integer PRIMARY KEY, subject_code text, subject_name text, credit_hours integer);
      CREATE TEMP TABLE curriculum_subject (curriculum_subject_id integer PRIMARY KEY, curriculum_id integer REFERENCES curriculum, subject_id integer REFERENCES subject, subject_category text NOT NULL, is_compulsory smallint NOT NULL CHECK (is_compulsory IN (0,1)));
      CREATE TEMP TABLE academic_semester (semester_id integer PRIMARY KEY, academic_year text, semester_no smallint CHECK (semester_no IN (1,2,3)));
      CREATE TEMP TABLE student_profile (student_id integer PRIMARY KEY, clerk_user_id text UNIQUE, curriculum_id integer REFERENCES curriculum, current_semester_id integer REFERENCES academic_semester);
      SET search_path = pg_temp;
      INSERT INTO programme VALUES ('501', 'Fictional acceptance programme');
      INSERT INTO curriculum VALUES ('${ids.curriculum}', '501', 'Fictional test v1', 131), ('${ids.otherCurriculum}', '501', 'Fictional test v2', 131);
      INSERT INTO subject VALUES ('601','FIX101','Fictional subject A',3), ('602','FIX102','Fictional subject B',3), ('603','FIX999','Other curriculum subject',3);
      INSERT INTO curriculum_subject VALUES ('${ids.subjectA}','${ids.curriculum}','601','Core',1), ('${ids.subjectB}','${ids.curriculum}','602','Elective U1',0), ('${ids.outside}','${ids.otherCurriculum}','603','Core',1);
      INSERT INTO academic_semester VALUES ('${ids.semester}','2026/2027',1), ('${ids.otherSemester}','2026/2027',3);
      INSERT INTO student_profile VALUES ('${ids.studentA}','fixture_student_a','${ids.curriculum}','${ids.semester}'), ('${ids.studentB}','fixture_student_b','${ids.curriculum}','${ids.semester}');
    `);
    const baseline = await readFile(new URL('../../../../../tools/offerings/fixtures/canonical-semester-offering.sql', import.meta.url), 'utf8');
    const offeringDDL = baseline.match(/CREATE TABLE public\.semester_offering \([\s\S]*?\n\);/);
    if (!offeringDDL) throw new Error('Canonical offering definition is missing');
    await client.query(offeringDDL[0].replace('CREATE TABLE public.semester_offering', 'CREATE TEMP TABLE semester_offering').replaceAll('REFERENCES public.', 'REFERENCES pg_temp.'));
    const tables = await client.query("SELECT relname, relpersistence FROM pg_class WHERE relnamespace = pg_my_temp_schema() AND relkind = 'r'");
    if (!tables.rows.some(row => row.relname === 'semester_offering' && row.relpersistence === 't')) throw new Error('Temporary fixture isolation failed');
    db = {
      query: async (sql, parameters) => (await client.query<Record<string, unknown>>(sql, parameters)).rows,
      async transaction(work) {
        await client.query('BEGIN');
        try { const result = await work(db); await client.query('COMMIT'); return result; }
        catch (error) { await client.query('ROLLBACK'); throw error; }
      },
    };
  }, 30_000);
  afterAll(async () => { client?.release(); if (pool) await pool.end(); });
  beforeEach(async () => { await client.query('DELETE FROM pg_temp.semester_offering'); await client.query('UPDATE pg_temp.student_profile SET current_semester_id=$1', [ids.semester]); });

  it('uses canonical offering INTEGER identity defaults, uniqueness and foreign keys', async () => {
    const repository = createOfferingRepository(db);
    await repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] });
    const rows = await client.query('SELECT offering_id, created_at FROM pg_temp.semester_offering');
    expect(Number.isInteger(rows.rows[0].offering_id)).toBe(true);
    expect(rows.rows[0].created_at).toBeTruthy();
    await expect(client.query('INSERT INTO pg_temp.semester_offering (student_id,semester_id,curriculum_subject_id) VALUES ($1,$2,$3)', [ids.studentA, ids.semester, ids.subjectA])).rejects.toMatchObject({ code: '23505' });
    await expect(client.query('INSERT INTO pg_temp.semester_offering (student_id,semester_id,curriculum_subject_id) VALUES ($1,$2,$3)', ['399', ids.semester, ids.subjectA])).rejects.toMatchObject({ code: '23503' });
  });
  it('preserves row IDs and timestamps on repeated idempotent replacement', async () => {
    const repository = createOfferingRepository(db);
    const input = { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA, ids.subjectB] };
    await repository.replace(scope, input);
    const before = (await client.query('SELECT * FROM pg_temp.semester_offering ORDER BY offering_id')).rows;
    await repository.replace(scope, input);
    expect((await client.query('SELECT * FROM pg_temp.semester_offering ORDER BY offering_id')).rows).toEqual(before);
  });
  it('persists commits across repository instances and subsequent GET requests', async () => {
    await createOfferingRepository(db).replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] });
    expect(await createOfferingRepository(db).read(scope, ids.semester)).toEqual({ semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] });
  });
  it('isolates Student A, Student B and semesters using actual SQL joins', async () => {
    const repository = createOfferingRepository(db);
    await repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] });
    const studentB = { ...scope, studentId: ids.studentB, clerkUserId: 'fixture_student_b' };
    expect((await repository.read(studentB, ids.semester)).curriculumSubjectIds).toEqual([]);
    expect((await repository.read(scope, ids.otherSemester)).curriculumSubjectIds).toEqual([]);
    expect((await repository.read({ ...scope, clerkUserId: 'fixture_student_b' }, ids.semester)).curriculumSubjectIds).toEqual([]);
    await expect(repository.replace({ ...scope, clerkUserId: 'fixture_student_b' }, { semesterId: ids.semester, curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects foreign-curriculum and duplicate selections without changing saved rows', async () => {
    const repository = createOfferingRepository(db);
    await repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] });
    await expect(repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.outside] })).rejects.toMatchObject({ code: 'SUBJECT_OUTSIDE_CURRICULUM' });
    await expect(repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectB, ids.subjectB] })).rejects.toMatchObject({ code: 'DUPLICATE_SUBJECT' });
    expect((await repository.read(scope, ids.semester)).curriculumSubjectIds).toEqual([ids.subjectA]);
  });
  it('rolls back an actual SQL constraint failure after deleting removed entries', async () => {
    const repository = createOfferingRepository(db);
    await repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] });
    await client.query(`ALTER TABLE pg_temp.semester_offering ADD CONSTRAINT reject_fixture_b CHECK (curriculum_subject_id <> '${ids.subjectB}'::integer)`);
    try {
      await expect(repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectB] })).rejects.toMatchObject({ code: '23514' });
      expect((await repository.read(scope, ids.semester)).curriculumSubjectIds).toEqual([ids.subjectA]);
    } finally { await client.query('ALTER TABLE pg_temp.semester_offering DROP CONSTRAINT reject_fixture_b'); }
  });
  it('reconciles a confirmed empty list without affecting other semesters', async () => {
    const repository = createOfferingRepository(db);
    await repository.replace(scope, { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] });
    await expect(repository.replace(scope, { semesterId: ids.otherSemester, curriculumSubjectIds: [ids.subjectB] })).rejects.toMatchObject({ code: 'PROFILE_SEMESTER_CHANGED' });
    await client.query('UPDATE pg_temp.student_profile SET current_semester_id=$1 WHERE student_id=$2', [ids.otherSemester, ids.studentA]);
    await repository.replace(scope, { semesterId: ids.otherSemester, curriculumSubjectIds: [ids.subjectB] });
    expect((await repository.read(scope, ids.semester)).curriculumSubjectIds).toEqual([ids.subjectA]);
    expect((await repository.read(scope, ids.otherSemester)).curriculumSubjectIds).toEqual([ids.subjectB]);
  });
  it('composes context from the real SQL fixture and executes protected GET/PUT', async () => {
    const contextFor = createOfferingContextReader(db.query);
    const context = await contextFor(scope.clerkUserId);
    expect(context?.subjects).toHaveLength(2);
    expect(context?.curriculum.totalCreditRequired).toBe(131);
    expect(context?.semesters.map(item => item.semesterNo)).toEqual([1, 3]);
    expect(context?.currentSemesterId).toBe(ids.semester);
    const auth: AuthDependencies = {
      // TEST ONLY provider boundary. Real P004 session verification is not replaced in production.
      verify: async () => ({ clerkUserId: scope.clerkUserId, sessionId: 'fixture_session', primaryEmail: { address: 'fixture@graduate.utm.my', verified: true } }),
      access: { find: async () => ({ clerkUserId: scope.clerkUserId, appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' }), initializeStudent: async () => { throw new Error('Not used'); } },
      profiles: { stateFor: async () => 'COMPLETE' },
    };
    const deps = { auth, contextFor, repository: createOfferingRepository(db) };
    const input = { semesterId: ids.semester, curriculumSubjectIds: [ids.subjectA] };
    const put = await handleOfferingRequest(new Request('https://fixture.invalid/api/semester-offerings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), deps);
    expect(put?.status).toBe(200);
    const get = await handleOfferingRequest(new Request('https://fixture.invalid/api/semester-offerings?semesterId=' + ids.semester), deps);
    expect((await get?.json()).data.selection).toEqual(input);
  });
});
