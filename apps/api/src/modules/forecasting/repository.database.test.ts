import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_CSV_HEADER } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ScopeProvider } from './scope-provider';
import { csvLine } from './csv';
import type { ForecastingDependencies } from './contracts';
import { createForecastingRepository, type ForecastingStatement } from './repository';
import { createOfferingsRepository } from './offerings-repository';
import { createForecastRunsRepository } from './runs-repository';
import { handleForecastingRequest } from './routes';

// EXPLICIT TEST CONNECTION ONLY (disposable database already migrated through 0007). Never falls back to DATABASE_URL.
// The neon HTTP driver cannot talk to plain PostgreSQL, so this test runs the repository's exact statements through `pg`
// with the same semantics as sql.transaction (all statements atomically, rolled back on error). Every test runs inside an
// outer transaction that is rolled back, with each repository transaction wrapped in a SAVEPOINT, so nothing is committed.
const databaseUrl = process.env.FORECASTING_TEST_DATABASE_URL;
interface PgClient { connect(): Promise<void>; end(): Promise<void>; query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }

const header = IMPORT_CSV_HEADER.join(',');
const row = (...values: string[]) => csvLine([...values, ...Array(10 - values.length).fill('')]);

describe.skipIf(!databaseUrl)('UC20 import repository on PostgreSQL (disposable database, rolled back)', () => {
  let client: PgClient;
  let deps: ForecastingDependencies;
  let ids: { programme: number; centre: number; current: number; target: number; later: number; curriculum: number; s101: number; s102: number };
  const actor = 'user_db_coordinator';
  const fields = () => ({ programmeId: String(ids.programme), learningCentreId: String(ids.centre), targetSemesterId: String(ids.target), sourceDate: '2026-10-30', sourceLabel: 'DB test' });
  const upload = async (csv: string, actingAs = actor) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields())) data.append(key, value);
    data.append('file', new File([csv], 'import.csv', { type: 'text/csv' }));
    deps.auth.verify = vi.fn(async () => ({ clerkUserId: actingAs, sessionId: 's', primaryEmail: { address: 'c@utm.my', verified: true } }));
    return await handleForecastingRequest(new Request('https://test.invalid/api/coordinator/forecast-imports', { method: 'POST', body: data }), deps) as Response;
  };
  const scalar = async (text: string, values: unknown[] = []) => (await client.query(text, values)).rows[0]!;

  beforeAll(async () => {
    const moduleName = 'pg';
    const pg = await import(/* @vite-ignore */ moduleName) as { default?: { Client: new (config: unknown) => PgClient }; Client?: new (config: unknown) => PgClient };
    const Client = pg.Client ?? pg.default!.Client;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const version = (await client.query("SELECT to_regclass('public.offering_confirmation') AS table_name")).rows[0]!;
    if (!version.table_name) throw new Error('The test database must be migrated through 0007.');
  });
  afterAll(async () => { await client?.end(); });
  beforeEach(async () => {
    await client.query('BEGIN');
    // 0008 audits reference-data writes (learning_centre, academic_semester) and needs a transaction-local actor/reason.
    await client.query("SELECT set_config('app.access_actor','db-seed',true), set_config('app.access_reason','seed',true)");
    const programme = Number((await scalar("INSERT INTO public.programme(programme_code, programme_name) VALUES ('T' || substr(md5(random()::text),1,8), 'DB test programme') RETURNING programme_id")).programme_id);
    const centre = Number((await scalar("INSERT INTO public.learning_centre(centre_code, centre_name) VALUES (substr(md5(random()::text),1,8), 'DB test centre') RETURNING learning_centre_id")).learning_centre_id);
    const year = '20' + (50 + Math.floor(Math.random() * 40)) + '/20' + (51 + Math.floor(Math.random() * 40));
    const semesters: number[] = [];
    for (const [no, type] of [[1, 'NORMAL'], [2, 'NORMAL'], [3, 'SHORT']] as const) {
      semesters.push(Number((await scalar('INSERT INTO public.academic_semester(academic_year, semester_no, semester_type, max_subjects, max_credits) VALUES ($1,$2,$3,6,20) RETURNING semester_id', [year, no, type])).semester_id));
    }
    const curriculum = Number((await scalar("INSERT INTO public.curriculum(curriculum_version, total_credit_required, programme_id) VALUES ('2024-DB', 120, $1) RETURNING curriculum_id", [programme])).curriculum_id);
    const subject = async (suffix: string) => {
      const subjectId = Number((await scalar("INSERT INTO public.subject(subject_code, subject_name, credit_hours) VALUES ('DB' || substr(md5(random()::text),1,6) || $1, 'DB subject', 3) RETURNING subject_id", [suffix])).subject_id);
      await client.query("INSERT INTO public.curriculum_subject(is_compulsory, subject_category, curriculum_id, subject_id) VALUES (1,'CORE',$1,$2)", [curriculum, subjectId]);
      return { subjectId, code: String((await scalar('SELECT subject_code FROM public.subject WHERE subject_id=$1', [subjectId])).subject_code) };
    };
    const a = await subject('A'); const b = await subject('B');
    codes = { a: a.code, b: b.code };
    ids = { programme, centre, current: semesters[0]!, target: semesters[1]!, later: semesters[2]!, curriculum, s101: a.subjectId, s102: b.subjectId };
    const scopes: ScopeProvider = {
      listScopes: async () => [], isScopeAssigned: async (_user, p, c) => p === programme && c === centre,
      currentSemesterId: async () => ids.current, studentLearningCentreId: async () => null, importAliases: async () => ({ programmes: {}, centres: {} }),
    };
    let savepoints = 0;
    const query = async (text: string, values: unknown[]) => (await client.query(text, values)).rows;
    const transaction = async (statements: ForecastingStatement[]) => {
      const name = 'repo_tx_' + savepoints++;
      await client.query('SAVEPOINT ' + name);
      try {
        const results: Record<string, unknown>[][] = [];
        for (const statement of statements) results.push((await client.query(statement.text, statement.values)).rows);
        await client.query('RELEASE SAVEPOINT ' + name);
        return results;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT ' + name);
        throw error;
      }
    };
    deps = {
      auth: {
        verify: vi.fn(async () => ({ clerkUserId: actor, sessionId: 's', primaryEmail: { address: 'c@utm.my', verified: true } })),
        access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: 'COORDINATOR' as const, roles: ['COORDINATOR' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
      },
      scopes,
      repository: createForecastingRepository(query, transaction),
      runs: createForecastRunsRepository(query, transaction),
      offerings: createOfferingsRepository(query, transaction),
      now: () => new Date('2026-11-01T12:00:00.000Z'),
    };
  });
  afterEach(async () => { await client.query('ROLLBACK'); });
  let codes: { a: string; b: string };
  const validCsv = () => [header,
    row('R1', '', 'ACTIVE', 'COMPLETE', codes.a, 'COMPLETED', String(ids.current), '3', 'false', 'Rina Test'),
    row('R1', '', 'ACTIVE', 'COMPLETE', codes.b, 'FAILED', '', '', 'true', 'Rina Test'),
    row('R2', '2024-DB', 'ACTIVE', 'UNKNOWN')].join('\n');

  it('stores a fully valid upload as an ACCEPTED, frozen snapshot with students and records', async () => {
    const response = await upload(validCsv());
    expect(response.status).toBe(201);
    const { data } = await response.json();
    const batch = await scalar('SELECT * FROM public.academic_import_batch WHERE import_batch_id=$1', [data.importBatchId]);
    expect(batch).toMatchObject({ import_status: 'ACCEPTED', programme_id: ids.programme, learning_centre_id: ids.centre, target_semester_id: ids.target, provided_by: actor, accepted_by: actor, source_label: 'DB test' });
    expect(batch.source_fingerprint).toBe(data.sourceFingerprint);
    expect(batch.accepted_at).toBeInstanceOf(Date);
    expect(batch.validation_summary).toMatchObject({ status: 'VALID', counts: { uniqueStudents: 2, validAttempts: 2 }, internal: { schemaVersion: 1, dataRows: 3 } });
    const students = (await client.query('SELECT external_reference, cohort_status, history_completeness, curriculum_id, student_name FROM public.imported_student WHERE import_batch_id=$1 ORDER BY external_reference', [data.importBatchId])).rows;
    expect(students).toEqual([
      { external_reference: 'R1', cohort_status: 'ACTIVE', history_completeness: 'COMPLETE', curriculum_id: ids.curriculum, student_name: 'Rina Test' },
      { external_reference: 'R2', cohort_status: 'ACTIVE', history_completeness: 'UNKNOWN', curriculum_id: ids.curriculum, student_name: null },
    ]);
    const records = (await client.query(`SELECT r.subject_id, r.subject_status, r.semester_id, r.is_synthetic, r.recognized_credits FROM public.imported_subject_record r
      JOIN public.imported_student s USING (imported_student_id) WHERE s.import_batch_id=$1 ORDER BY r.subject_id`, [data.importBatchId])).rows;
    expect(records).toEqual([
      { subject_id: ids.s101, subject_status: 'COMPLETED', semester_id: ids.current, is_synthetic: false, recognized_credits: 3 },
      { subject_id: ids.s102, subject_status: 'FAILED', semester_id: null, is_synthetic: true, recognized_credits: null },
    ]);
    const roster = await (await handleForecastingRequest(new Request('https://test.invalid/api/coordinator/forecast-imports/' + data.importBatchId + '/students'), deps) as Response).json();
    expect(roster.data.items).toMatchObject([{ externalReference: 'R1', studentName: 'Rina Test', curriculumVersion: '2024-DB' }, { externalReference: 'R2', studentName: null }]);
    // The 0007 triggers freeze the snapshot (including the student name).
    await client.query('SAVEPOINT frozen_name');
    await expect(client.query("UPDATE public.imported_student SET student_name='Changed' WHERE import_batch_id=$1", [data.importBatchId])).rejects.toThrow(/immutable/i);
    await client.query('ROLLBACK TO SAVEPOINT frozen_name');
    await client.query('SAVEPOINT frozen_check');
    await expect(client.query("UPDATE public.academic_import_batch SET source_label='changed' WHERE import_batch_id=$1", [data.importBatchId])).rejects.toThrow(/immutable/i);
    await client.query('ROLLBACK TO SAVEPOINT frozen_check');
    await expect(client.query("INSERT INTO public.imported_student(import_batch_id, curriculum_id, external_reference, cohort_status) VALUES ($1,$2,'LATE','ACTIVE')", [data.importBatchId, ids.curriculum])).rejects.toThrow(/immutable/i);
  });

  it('keeps an upload with row errors VALIDATED and unfrozen until the uploader acknowledges the subset', async () => {
    const csv = [header, row('R1', '', 'ACTIVE', 'COMPLETE', codes.a, 'COMPLETED', '', '3', 'false'), row('R1', '', 'ACTIVE', 'COMPLETE', 'NOPE', 'COMPLETED', '', '', 'false')].join('\n');
    const response = await upload(csv);
    expect(response.status).toBe(422);
    const report = (await response.json()).error.report;
    const batch = await scalar("SELECT import_batch_id, import_status, accepted_at FROM public.academic_import_batch WHERE validation_summary->>'validationId'=$1", [report.validationId]);
    expect(batch).toMatchObject({ import_status: 'VALIDATED', accepted_at: null });
    expect(Number((await scalar('SELECT count(*) AS n FROM public.imported_student WHERE import_batch_id=$1', [batch.import_batch_id])).n)).toBe(1);
    expect((await scalar('SELECT history_completeness FROM public.imported_student WHERE import_batch_id=$1', [batch.import_batch_id])).history_completeness).toBe('PARTIAL');

    const body = JSON.stringify({ ...Object.fromEntries(Object.entries(fields()).filter(([k]) => k.endsWith('Id')).map(([k, v]) => [k, Number(v)])), validationRevision: report.validationRevision, acknowledgeRejectedRows: true });
    const acceptUrl = `https://test.invalid/api/coordinator/forecast-imports/${report.validationId}/subset-acceptances`;
    const request = (as: string) => {
      deps.auth.verify = vi.fn(async () => ({ clerkUserId: as, sessionId: 's', primaryEmail: { address: 'c@utm.my', verified: true } }));
      return handleForecastingRequest(new Request(acceptUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': '"' + report.validationRevision + '"' }, body }), deps) as Promise<Response>;
    };
    expect((await request('user_somebody_else')).status).toBe(404);
    const accepted = await request(actor);
    expect(accepted.status).toBe(201);
    const after = await scalar('SELECT import_status, accepted_by, accepted_at, validation_summary FROM public.academic_import_batch WHERE import_batch_id=$1', [batch.import_batch_id]);
    expect(after).toMatchObject({ import_status: 'ACCEPTED', accepted_by: actor });
    expect(after.accepted_at).toBeInstanceOf(Date);
    expect((after.validation_summary as { internal: { subsetAcknowledgedBy: string } }).internal.subsetAcknowledgedBy).toBe(actor);
    // Frozen now, and the repeat is a safe replay.
    await client.query('SAVEPOINT frozen_two');
    await expect(client.query("INSERT INTO public.imported_student(import_batch_id, curriculum_id, external_reference, cohort_status) VALUES ($1,$2,'LATE','ACTIVE')", [batch.import_batch_id, ids.curriculum])).rejects.toThrow(/immutable/i);
    await client.query('ROLLBACK TO SAVEPOINT frozen_two');
    expect((await request(actor)).status).toBe(201);
  });

  it('records a rejected file as REJECTED with no students, and refuses to accept it', async () => {
    const response = await upload('bad,header\n1,2');
    expect(response.status).toBe(422);
    const report = (await response.json()).error.report;
    const batch = await scalar("SELECT import_batch_id, import_status FROM public.academic_import_batch WHERE validation_summary->>'validationId'=$1", [report.validationId]);
    expect(batch.import_status).toBe('REJECTED');
    expect(Number((await scalar('SELECT count(*) AS n FROM public.imported_student WHERE import_batch_id=$1', [batch.import_batch_id])).n)).toBe(0);
  });

  it('replays an identical accepted file, lists and gets the snapshot, and scopes list results', async () => {
    const first = await (await upload(validCsv())).json();
    const second = await upload(validCsv());
    expect(second.status).toBe(200);
    expect((await second.json()).data.importBatchId).toBe(first.data.importBatchId);
    expect(Number((await scalar('SELECT count(*) AS n FROM public.academic_import_batch WHERE programme_id=$1', [ids.programme])).n)).toBe(1);
    const query = new URLSearchParams(fields());
    query.delete('sourceDate'); query.delete('sourceLabel');
    const list = await (await handleForecastingRequest(new Request('https://test.invalid/api/coordinator/forecast-imports?' + query.toString()), deps) as Response).json();
    expect(list.data.items).toHaveLength(1);
    expect(list.data.items[0]).toMatchObject({ importBatchId: first.data.importBatchId, snapshotStatus: 'ACCEPTED_IMMUTABLE' });
    const detail = await (await handleForecastingRequest(new Request('https://test.invalid/api/coordinator/forecast-imports/' + first.data.importBatchId), deps) as Response).json();
    expect(detail.data.validationReport.acceptedSnapshot.importBatchId).toBe(first.data.importBatchId);
  });

  it('rolls the whole import back when the database refuses it and maps the error without leaking text', async () => {
    deps.scopes = { ...deps.scopes, isScopeAssigned: async () => true };
    const data = new FormData();
    for (const [k, v] of Object.entries({ ...fields(), learningCentreId: '2147483000' })) data.append(k, v);
    data.append('file', new File([validCsv()], 'a.csv'));
    const response = await handleForecastingRequest(new Request('https://test.invalid/api/coordinator/forecast-imports', { method: 'POST', body: data }), deps) as Response;
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: 'SCOPE_NOT_FOUND' } });
    expect(JSON.stringify(body)).not.toMatch(/violates|constraint|public\./);
    expect(Number((await scalar('SELECT count(*) AS n FROM public.academic_import_batch WHERE programme_id=$1', [ids.programme])).n)).toBe(0);
  });

  it('rejects a student whose curriculum belongs to another programme at the database level', async () => {
    const otherProgramme = Number((await scalar("INSERT INTO public.programme(programme_code, programme_name) VALUES ('X' || substr(md5(random()::text),1,8), 'Other') RETURNING programme_id")).programme_id);
    const otherCurriculum = Number((await scalar("INSERT INTO public.curriculum(curriculum_version, total_credit_required, programme_id) VALUES ('OTHER', 100, $1) RETURNING curriculum_id", [otherProgramme])).curriculum_id);
    const original = deps.repository.storeImport;
    const response = await handleForecastingRequest(new Request('https://test.invalid/api/coordinator/forecast-imports', { method: 'POST', body: (() => { const d = new FormData(); for (const [k, v] of Object.entries(fields())) d.append(k, v); d.append('file', new File([validCsv()], 'a.csv')); return d; })() }),
      { ...deps, repository: { ...deps.repository, storeImport: (input) => original({ ...input, students: input.students.map((s) => ({ ...s, curriculumId: otherCurriculum })) }) } }) as Response;
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'IMPORT_CURRICULUM_MISMATCH' } });
  });

  it('never touches student profiles or academic records', async () => {
    const before = await scalar('SELECT (SELECT count(*) FROM public.student_profile) AS profiles, (SELECT count(*) FROM public.academic_record) AS records');
    await upload(validCsv());
    expect(await scalar('SELECT (SELECT count(*) FROM public.student_profile) AS profiles, (SELECT count(*) FROM public.academic_record) AS records')).toEqual(before);
  });

  describe('forecast runs (generate, review, decide, finalize, frozen)', () => {
    const base = 'https://test.invalid/api/coordinator/';
    const call = async (path: string, init?: RequestInit) => await handleForecastingRequest(new Request(base + path, init), deps) as Response;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const runScope = () => ({ programmeId: ids.programme, learningCentreId: ids.centre, targetSemesterId: ids.target });
    const cohortCsv = (count: number) => [header, ...Array.from({ length: count }, (_, i) => row('Q' + String(i + 1).padStart(3, '0'), '', 'ACTIVE', 'COMPLETE'))].join('\n');
    const importCohort = async (count: number) => (await (await upload(cohortCsv(count))).json()).data.importBatchId as number;
    const generate = async (importBatchId: number) => await post('forecast-runs', { ...runScope(), importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
    const revisionOf = async (response: Response) => (await response.json()).data.revision as string;
    const mutate = (id: number, leaf: string, revision: string, body: Record<string, unknown>) =>
      post('forecast-runs/' + id + '/' + leaf, { scope: runScope(), ...body }, { 'If-Match': '"' + revision + '"' });
    const rejects = async (sql: string, values: unknown[], pattern: RegExp) => {
      await client.query('SAVEPOINT probe');
      await expect(client.query(sql, values)).rejects.toThrow(pattern);
      await client.query('ROLLBACK TO SAVEPOINT probe');
    };
    let lectureId: number; let labId: number;
    beforeEach(async () => {
      lectureId = Number((await scalar("INSERT INTO public.class_capacity_rule(class_type, minimum_enrollment, break_even_target, normal_maximum, exception_maximum, is_active) VALUES ('LECTURE',15,25,45,50,true) RETURNING capacity_rule_id")).capacity_rule_id);
      labId = Number((await scalar("INSERT INTO public.class_capacity_rule(class_type, minimum_enrollment, break_even_target, normal_maximum, exception_maximum, is_active) VALUES ('LAB',15,25,35,NULL,true) RETURNING capacity_rule_id")).capacity_rule_id);
      await client.query("UPDATE public.subject SET class_type='LECTURE' WHERE subject_id=$1", [ids.s101]);
      await client.query("UPDATE public.subject SET class_type='LAB' WHERE subject_id=$1", [ids.s102]);
    });

    it('generates a DRAFT forecast with demand and sections, replays the same snapshot and numbers a newer snapshot as version 2', async () => {
      const batchId = await importCohort(30);
      const created = await generate(batchId);
      expect(created.status).toBe(201);
      const receipt = (await created.json()).data;
      const runRow = await scalar('SELECT * FROM public.forecast_run WHERE forecast_run_id=$1', [receipt.resourceId]);
      expect(runRow).toMatchObject({ status: 'DRAFT', programme_id: ids.programme, learning_centre_id: ids.centre, target_semester_id: ids.target, version_number: 1, parent_forecast_run_id: null, generated_by: actor, engine_version: 'uc20-engine-1.1.0', import_batch_id: batchId });
      expect(runRow.rule_snapshot).toMatchObject({ engineVersion: 'uc20-engine-1.1.0', demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
      expect((runRow.scenario_assumptions as { subjects: Record<string, unknown> }).subjects[String(ids.s101)]).toMatchObject({ nearGraduationCount: 0, capacityRuleId: lectureId });
      expect(runRow.original_recommendations).toHaveLength(2);
      const demands = (await client.query('SELECT subject_id, eligible_count, forecast_count, uncertain_count, data_quality_status, configuration_status FROM public.forecast_subject_demand WHERE forecast_run_id=$1 ORDER BY subject_id', [receipt.resourceId])).rows;
      expect(demands).toEqual([
        { subject_id: ids.s101, eligible_count: 30, forecast_count: 30, uncertain_count: 0, data_quality_status: 'SUPPORTED', configuration_status: 'CONFIGURED' },
        { subject_id: ids.s102, eligible_count: 30, forecast_count: 30, uncertain_count: 0, data_quality_status: 'SUPPORTED', configuration_status: 'CONFIGURED' },
      ]);
      const sections = (await client.query('SELECT d.subject_id, s.section_number, s.expected_students, s.review_status, s.capacity_rule_id FROM public.proposed_class_section s JOIN public.forecast_subject_demand d USING (demand_id) WHERE d.forecast_run_id=$1 ORDER BY d.subject_id, s.section_number', [receipt.resourceId])).rows;
      expect(sections).toEqual([
        { subject_id: ids.s101, section_number: 1, expected_students: 30, review_status: 'PENDING', capacity_rule_id: lectureId },
        { subject_id: ids.s102, section_number: 1, expected_students: 30, review_status: 'PENDING', capacity_rule_id: labId },
      ]);
      const detail = (await (await call('forecast-runs/' + receipt.resourceId)).json()).data;
      expect(detail.subjects.find((s: { subjectId: number }) => s.subjectId === ids.s101).sections[0]).toMatchObject({ expectedStudents: 30, minimumEnrollment: 15, normalMaximum: 45, flags: [] });

      const again = await generate(batchId);
      expect(again.status).toBe(200);
      expect((await again.json()).data.resourceId).toBe(receipt.resourceId);
      expect(Number((await scalar('SELECT count(*) AS n FROM public.forecast_run WHERE import_batch_id=$1', [batchId])).n)).toBe(1);
      // the database guard also stops a racing creation for the same snapshot
      await expect(deps.runs.createRun({ scope: runScope(), importBatchId: batchId, actor, engineVersion: 'x', ruleSnapshot: runRow.rule_snapshot as never, originalRecommendations: [], scenarioAssumptions: {}, demands: [], sections: [] }))
        .rejects.toMatchObject({ code: 'RUN_ALREADY_EXISTS' });

      const second = await importCohort(31);
      const v2 = await generate(second);
      expect(v2.status).toBe(201);
      const v2Id = (await v2.json()).data.resourceId;
      expect(await scalar('SELECT version_number, parent_forecast_run_id FROM public.forecast_run WHERE forecast_run_id=$1', [v2Id])).toEqual({ version_number: 2, parent_forecast_run_id: receipt.resourceId });
      expect((await (await call('forecast-runs/' + receipt.resourceId)).json()).data.newerForecastAvailable).toEqual({ forecastRunId: v2Id, versionNumber: 2, status: 'DRAFT' });
      const list = (await (await call(`forecast-runs?programmeId=${ids.programme}&learningCentreId=${ids.centre}&targetSemesterId=${ids.target}`)).json()).data;
      expect(list.items.map((i: { versionNumber: number; summary: { totalSections: number; pendingSections: number } }) => [i.versionNumber, i.summary.totalSections, i.summary.pendingSections])).toEqual([[2, 2, 2], [1, 2, 2]]);
    });

    it('builds the forecast from the students in the system (portal snapshot): selection, mapping, replay, unchanged student tables, then review, finalize and confirm', async () => {
      await client.query("SELECT set_config('app.access_actor','db-seed',true), set_config('app.access_reason','seed',true)");
      const person = async (name: string, access: 'ACTIVE' | 'SUSPENDED', role: 'STUDENT' | 'COORDINATOR', curriculum = ids.curriculum) => {
        const clerk = 'user_sys_' + Math.random().toString(36).slice(2, 10);
        // Legacy creation can only initialise STUDENT (0004); a staff-only account then swaps its role explicitly.
        await client.query("INSERT INTO public.user_access_assignment(clerk_user_id, app_role, access_status) VALUES ($1,'STUDENT',$2)", [clerk, access]);
        if (role === 'COORDINATOR') {
          const assignment = Number((await scalar('SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id=$1', [clerk])).access_assignment_id);
          await client.query("INSERT INTO public.user_role_assignment(access_assignment_id, app_role, email_policy, grant_source, granted_by_clerk_user_id, grant_reason) VALUES ($1,'COORDINATOR','ROLE_DOMAIN','OPERATOR','db-seed','seed')", [assignment]);
          await client.query("DELETE FROM public.user_role_assignment WHERE access_assignment_id=$1 AND app_role='STUDENT'", [assignment]);
        }
        return Number((await scalar('INSERT INTO public.student_profile(clerk_user_id, matric_no, student_name, curriculum_id) VALUES ($1,$2,$3,$4) RETURNING student_id', [clerk, 'M' + Math.random().toString(36).slice(2, 8), name, curriculum])).student_id);
      };
      const record = (student: number, subject: number, status: string, semester: number | null, credits: number) =>
        client.query('INSERT INTO public.academic_record(student_id, subject_id, status, recognized_credits, semester_id) VALUES ($1,$2,$3,$4,$5)', [student, subject, status, credits, semester]);
      const alya = await person('Alya Entered', 'ACTIVE', 'STUDENT');
      const bob = await person('Bob No Records', 'ACTIVE', 'STUDENT');
      const suspended = await person('Sam Suspended', 'SUSPENDED', 'STUDENT');
      const staffOnly = await person('Cora Coordinator', 'ACTIVE', 'COORDINATOR');
      const otherProgramme = Number((await scalar("INSERT INTO public.programme(programme_code, programme_name) VALUES ('O' || substr(md5(random()::text),1,8), 'Other programme') RETURNING programme_id")).programme_id);
      const otherCurriculum = Number((await scalar("INSERT INTO public.curriculum(curriculum_version, total_credit_required, programme_id) VALUES ('2024-OTHER', 120, $1) RETURNING curriculum_id", [otherProgramme])).curriculum_id);
      await person('Olly Other', 'ACTIVE', 'STUDENT', otherCurriculum);
      await record(alya, ids.s101, 'COMPLETED', ids.current, 3);
      await record(alya, ids.s102, 'WITHDRAWN', null, 0);
      await record(suspended, ids.s101, 'COMPLETED', ids.current, 3);
      await record(staffOnly, ids.s101, 'COMPLETED', ids.current, 3);
      const studentTables = () => scalar(`SELECT (SELECT md5(string_agg(p::text, ',' ORDER BY student_id)) FROM public.student_profile p) AS profiles,
        (SELECT md5(string_agg(r::text, ',' ORDER BY record_id)) FROM public.academic_record r) AS records`);
      const before = await studentTables();
      const inCentre = { ...deps, scopes: { ...deps.scopes, studentLearningCentreId: async () => ids.centre } };
      const snapshot = (target: typeof inCentre = inCentre) => handleForecastingRequest(new Request(base + 'forecast-imports/system-snapshots', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...runScope(), sourceLabel: 'System test' }),
      }), target) as Promise<Response>;

      const created = await snapshot();
      expect(created.status).toBe(201);
      const accepted = (await created.json()).data;
      expect(accepted).toMatchObject({ source: 'SYSTEM', sourceLabel: 'System test', counts: { uniqueStudents: 2, validAttempts: 2, unknownHistoryStudents: 1 }, snapshotStatus: 'ACCEPTED_IMMUTABLE' });
      expect(accepted.validationReport.coverage).toMatchObject({ studentsFound: 2, studentsWithRecords: 1, studentsWithoutRecords: 1, recordsMapped: 2, recordsUnmapped: 0, withdrawnStoredAsFailed: 1, excluded: { inactiveAccess: 2, otherCentre: 0 } });
      expect(accepted.validationReport.coverage.excluded.otherProgramme).toBeGreaterThanOrEqual(1);
      expect(await scalar('SELECT import_status, provided_by, accepted_by, source_label, snapshot_date::text AS snapshot_date FROM public.academic_import_batch WHERE import_batch_id=$1', [accepted.importBatchId]))
        .toEqual({ import_status: 'ACCEPTED', provided_by: actor, accepted_by: actor, source_label: 'System test', snapshot_date: '2026-11-01' });
      const stored = (await client.query('SELECT external_reference, student_name, cohort_status, history_completeness, curriculum_id FROM public.imported_student WHERE import_batch_id=$1 ORDER BY external_reference', [accepted.importBatchId])).rows;
      expect(stored).toEqual([
        { external_reference: 'PORTAL-' + alya, student_name: 'Alya Entered', cohort_status: 'ACTIVE', history_completeness: 'COMPLETE', curriculum_id: ids.curriculum },
        { external_reference: 'PORTAL-' + bob, student_name: 'Bob No Records', cohort_status: 'ACTIVE', history_completeness: 'UNKNOWN', curriculum_id: ids.curriculum },
      ].sort((a, b) => a.external_reference < b.external_reference ? -1 : 1));
      const records = (await client.query(`SELECT r.subject_id, r.subject_status, r.semester_id, r.is_synthetic, r.recognized_credits FROM public.imported_subject_record r
        JOIN public.imported_student s USING (imported_student_id) WHERE s.import_batch_id=$1 ORDER BY r.subject_id`, [accepted.importBatchId])).rows;
      expect(records).toEqual([
        { subject_id: ids.s101, subject_status: 'COMPLETED', semester_id: ids.current, is_synthetic: false, recognized_credits: 3 },
        { subject_id: ids.s102, subject_status: 'FAILED', semester_id: null, is_synthetic: false, recognized_credits: 0 },
      ]);
      // The snapshot is frozen like a CSV snapshot, lists with its source, and the roster shows the names.
      await rejects("UPDATE public.academic_import_batch SET source_label='changed' WHERE import_batch_id=$1", [accepted.importBatchId], /immutable/i);
      const list = (await (await call(`forecast-imports?programmeId=${ids.programme}&learningCentreId=${ids.centre}&targetSemesterId=${ids.target}`)).json()).data.items;
      expect(list.map((item: { source: string }) => item.source)).toEqual(['SYSTEM']);
      const roster = (await (await call('forecast-imports/' + accepted.importBatchId + '/students')).json()).data.items;
      expect(roster.map((item: { studentName: string; historyCompleteness: string }) => [item.studentName, item.historyCompleteness]).sort()).toEqual([['Alya Entered', 'COMPLETE'], ['Bob No Records', 'UNKNOWN']]);

      // Replay with identical data; changed data creates a new snapshot.
      const replay = await snapshot();
      expect(replay.status).toBe(200);
      expect((await replay.json()).data.importBatchId).toBe(accepted.importBatchId);
      expect(Number((await scalar('SELECT count(*) AS n FROM public.academic_import_batch WHERE programme_id=$1', [ids.programme])).n)).toBe(1);
      // A centre nobody belongs to finds nobody.
      expect((await snapshot({ ...inCentre, scopes: { ...inCentre.scopes, studentLearningCentreId: async () => ids.centre + 1000 } })).status).toBe(422);
      await record(bob, ids.s101, 'COMPLETED', ids.current, 3);
      const changed = await snapshot();
      expect(changed.status).toBe(201);
      const secondId = (await changed.json()).data.importBatchId as number;
      expect(secondId).not.toBe(accepted.importBatchId);
      await client.query('DELETE FROM public.academic_record WHERE student_id=$1', [bob]); // restore for the unchanged-tables check below

      // Generate, review, finalize and confirm work unchanged on the snapshot.
      const run = await generate(accepted.importBatchId);
      expect(run.status).toBe(201);
      const receipt = (await run.json()).data;
      const detail = (await (await call('forecast-runs/' + receipt.resourceId)).json()).data;
      expect(detail.dataSource).toBe('SYSTEM');
      const lecture = detail.subjects.find((s: { subjectId: number }) => s.subjectId === ids.s101);
      const lab = detail.subjects.find((s: { subjectId: number }) => s.subjectId === ids.s102);
      // Alya passed the lecture (not eligible again); Bob's history is unknown, so he is uncertain for both subjects; Alya's WITHDRAWN-as-FAILED lab attempt keeps her eligible.
      expect([lecture.supportedEligibleCount, lecture.uncertainStudentCount]).toEqual([0, 1]);
      expect(lecture.uncertaintyReasons).toContain('HISTORY_UNKNOWN');
      expect([lab.supportedEligibleCount, lab.uncertainStudentCount]).toEqual([1, 1]);
      let revision = receipt.revision as string;
      revision = await revisionOf(await mutate(receipt.resourceId, 'reviews', revision, { action: 'START_REVIEW' }));
      const withSections = detail.subjects.filter((s: { sections: unknown[] }) => s.sections.length).map((s: { subjectId: number }) => ({ subjectId: s.subjectId, action: 'APPROVE', reason: 'ok' }));
      revision = await revisionOf(await mutate(receipt.resourceId, 'decisions', revision, { decisions: withSections }));
      const done = await mutate(receipt.resourceId, 'finalizations', revision, {});
      expect(done.status).toBe(200);
      const confirm = await post('confirmed-offerings', { scope: runScope(), forecastRunId: receipt.resourceId, subjectIds: [ids.s102], reason: 'Offered.', baseRevision: null, pickDeadline: '2026-12-01T04:00:00.000Z' });
      expect(confirm.status).toBe(201);

      // The student tables were never written.
      expect(await studentTables()).toEqual(before);
    });

    it('builds ONE combined snapshot (system + CSV): system wins on a matric match, name-only matches are kept, per-student source, replay, then generate-run works', async () => {
      await client.query("SELECT set_config('app.access_actor','db-seed',true), set_config('app.access_reason','seed',true)");
      const person = async (name: string, matric: string | null) => {
        const clerk = 'user_cmb_' + Math.random().toString(36).slice(2, 10);
        await client.query("INSERT INTO public.user_access_assignment(clerk_user_id, app_role, access_status) VALUES ($1,'STUDENT','ACTIVE')", [clerk]);
        return Number((await scalar('INSERT INTO public.student_profile(clerk_user_id, matric_no, student_name, curriculum_id) VALUES ($1,$2,$3,$4) RETURNING student_id', [clerk, matric, name, ids.curriculum])).student_id);
      };
      const alya = await person('Alya Entered', 'A1000001');
      const bob = await person('Bob No Records', 'B2000002');
      await client.query('INSERT INTO public.academic_record(student_id, subject_id, status, recognized_credits, semester_id) VALUES ($1,$2,$3,$4,$5)', [alya, ids.s101, 'COMPLETED', 3, ids.current]);
      const studentTables = () => scalar(`SELECT (SELECT md5(string_agg(p::text, ',' ORDER BY student_id)) FROM public.student_profile p) AS profiles,
        (SELECT md5(string_agg(r::text, ',' ORDER BY record_id)) FROM public.academic_record r) AS records`);
      const before = await studentTables();
      const inCentre = { ...deps, scopes: { ...deps.scopes, studentLearningCentreId: async () => ids.centre } };
      // a1000001 (lower case) is Alya's matric: skipped. CSV-NEW is new. CSV-NAME has Bob's name but another reference: kept with a warning.
      const csv = [header,
        row('a1000001', '', 'ACTIVE', 'COMPLETE', codes.b, 'COMPLETED', String(ids.current), '3', 'false', 'Alya From Csv'),
        row('CSV-NEW', '', 'ACTIVE', 'COMPLETE', codes.a, 'COMPLETED', String(ids.current), '3', 'false', 'Nina New'),
        row('CSV-NAME', '', 'ACTIVE', 'PARTIAL', '', '', '', '', '', ' bob   NO records ')].join('\n');
      const combined = async (text: string) => {
        const data = new FormData();
        for (const [key, value] of Object.entries(fields())) data.append(key, value);
        data.append('file', new File([text], 'both.csv', { type: 'text/csv' }));
        return await handleForecastingRequest(new Request(base + 'forecast-imports/combined-snapshots', { method: 'POST', body: data }), inCentre) as Response;
      };
      const created = await combined(csv);
      expect(created.status).toBe(201);
      const accepted = (await created.json()).data;
      expect(accepted).toMatchObject({ source: 'COMBINED', snapshotStatus: 'ACCEPTED_IMMUTABLE', counts: { uniqueStudents: 4 } });
      expect(accepted.validationReport.combined).toMatchObject({ students: 4, csvSkippedAlreadyInSystem: ['a1000001'], csv: { rows: 3, students: 3 },
        possibleDuplicates: [{ csvReference: 'CSV-NAME', systemReferences: ['PORTAL-' + bob] }] });
      expect(accepted.validationReport.coverage).toMatchObject({ studentsFound: 2, studentsWithRecords: 1, studentsWithoutRecords: 1 });
      expect(await scalar('SELECT import_status, validation_summary->>\'source\' AS source, validation_summary->\'internal\'->>\'source\' AS internal_source FROM public.academic_import_batch WHERE import_batch_id=$1', [accepted.importBatchId]))
        .toEqual({ import_status: 'ACCEPTED', source: 'COMBINED', internal_source: 'COMBINED' });
      const stored = (await client.query('SELECT external_reference, history_completeness FROM public.imported_student WHERE import_batch_id=$1 ORDER BY external_reference', [accepted.importBatchId])).rows;
      expect(stored).toEqual([
        { external_reference: 'CSV-NAME', history_completeness: 'PARTIAL' }, { external_reference: 'CSV-NEW', history_completeness: 'COMPLETE' },
        { external_reference: 'PORTAL-' + alya, history_completeness: 'COMPLETE' }, { external_reference: 'PORTAL-' + bob, history_completeness: 'UNKNOWN' },
      ].sort((a, b) => a.external_reference < b.external_reference ? -1 : 1));
      // The skipped CSV student's record (codes.b) was dropped: only Alya's system record and Nina's record exist.
      expect(Number((await scalar('SELECT count(*) AS n FROM public.imported_subject_record r JOIN public.imported_student s USING (imported_student_id) WHERE s.import_batch_id=$1', [accepted.importBatchId])).n)).toBe(2);
      expect(JSON.stringify(await scalar('SELECT validation_summary FROM public.academic_import_batch WHERE import_batch_id=$1', [accepted.importBatchId]))).not.toContain('A1000001');
      const summary = (await scalar('SELECT validation_summary->\'internal\'->\'sourceByReference\' AS map FROM public.academic_import_batch WHERE import_batch_id=$1', [accepted.importBatchId])).map;
      expect(summary).toEqual({ ['PORTAL-' + alya]: 'SYSTEM', ['PORTAL-' + bob]: 'SYSTEM', 'CSV-NEW': 'CSV', 'CSV-NAME': 'CSV' });
      const roster = (await (await call('forecast-imports/' + accepted.importBatchId + '/students')).json()).data.items;
      expect(Object.fromEntries(roster.map((item: { externalReference: string; source: string }) => [item.externalReference, item.source]))).toEqual(summary);
      const list = (await (await call(`forecast-imports?programmeId=${ids.programme}&learningCentreId=${ids.centre}&targetSemesterId=${ids.target}`)).json()).data.items;
      expect(list.map((item: { source: string }) => item.source)).toEqual(['COMBINED']);
      // Frozen; replay returns the same batch.
      await rejects("UPDATE public.academic_import_batch SET source_label='changed' WHERE import_batch_id=$1", [accepted.importBatchId], /immutable/i);
      const replay = await combined(csv);
      expect(replay.status).toBe(200);
      expect((await replay.json()).data.importBatchId).toBe(accepted.importBatchId);
      // Rows to correct: 422, VALIDATED with the combined students, then the existing subset acceptance.
      const bad = await combined(csv + '\n' + row('CSV-BAD', '', 'ACTIVE', 'COMPLETE', 'NOPE', 'COMPLETED', '', '', 'false', 'Bad'));
      expect(bad.status).toBe(422);
      const etag = bad.headers.get('ETag')!;
      const report = (await bad.json()).error.report;
      expect(await scalar('SELECT import_status FROM public.academic_import_batch WHERE validation_summary->>\'validationId\'=$1', [report.validationId])).toEqual({ import_status: 'VALIDATED' });
      const subset = await post('forecast-imports/' + report.validationId + '/subset-acceptances', { ...runScope(), validationRevision: report.validationRevision, acknowledgeRejectedRows: true }, { 'If-Match': etag });
      expect(subset.status).toBe(201);
      expect((await subset.json()).data).toMatchObject({ source: 'COMBINED', counts: { uniqueStudents: 5 } });
      // Generate, review, finalize and confirm work unchanged on the combined snapshot.
      const run = await generate(accepted.importBatchId);
      expect(run.status).toBe(201);
      const receipt = (await run.json()).data;
      const detail = (await (await call('forecast-runs/' + receipt.resourceId)).json()).data;
      expect(detail.dataSource).toBe('COMBINED');
      expect(detail.subjects.length).toBeGreaterThan(0);
      expect(await studentTables()).toEqual(before);
    });

    it('reviews, decides with before/after audit, finalizes, and the frozen forecast rejects every change', async () => {
      const batchId = await importCohort(30);
      const created = await generate(batchId);
      const id = (await created.json()).data.resourceId as number;
      let revision = 'fr' + id + '.DRAFT.0';
      expect((await mutate(id, 'reviews', 'fr' + id + '.DRAFT.5', { action: 'START_REVIEW' })).status).toBe(412);
      expect(Number((await scalar('SELECT count(*) AS n FROM public.forecast_adjustment_audit WHERE forecast_run_id=$1', [id])).n)).toBe(0);
      const started = await mutate(id, 'reviews', revision, { action: 'START_REVIEW' });
      expect(started.status).toBe(200);
      revision = await revisionOf(started);
      expect(revision).toBe('fr' + id + '.UNDER_REVIEW.1');
      expect(await scalar("SELECT demand_id, recorded_by, reason, before_state, after_state FROM public.forecast_adjustment_audit WHERE forecast_run_id=$1 AND action='START_REVIEW'", [id]))
        .toEqual({ demand_id: null, recorded_by: actor, reason: 'Review started.', before_state: { status: 'DRAFT' }, after_state: { status: 'UNDER_REVIEW' } });
      expect((await scalar('SELECT status FROM public.forecast_run WHERE forecast_run_id=$1', [id])).status).toBe('UNDER_REVIEW');

      const detailBefore = (await (await call('forecast-runs/' + id)).json()).data;
      const lectureBefore = detailBefore.subjects.find((s: { subjectId: number }) => s.subjectId === ids.s101);
      const first = lectureBefore.sections[0].proposedSectionId as number;
      const decided = await mutate(id, 'decisions', revision, { decisions: [
        { subjectId: ids.s102, action: 'APPROVE', reason: 'Lab is booked.', approvalReference: 'LAB/1' },
        { subjectId: ids.s101, action: 'REPLACE_ALLOCATION', reason: 'Split for the timetable.', replacementSections: [
          { proposedSectionId: first, sectionNumber: 1, expectedStudents: 15 }, { sectionNumber: 2, expectedStudents: 15 }] },
      ] });
      expect(decided.status).toBe(200);
      revision = await revisionOf(decided);
      expect(revision).toBe('fr' + id + '.UNDER_REVIEW.3');
      const lecture = (await (await call('forecast-runs/' + id)).json()).data.subjects.find((s: { subjectId: number }) => s.subjectId === ids.s101);
      expect(lecture.sections.map((s: { sectionNumber: number; expectedStudents: number; reviewStatus: string }) => [s.sectionNumber, s.expectedStudents, s.reviewStatus])).toEqual([[1, 15, 'REVIEWED'], [2, 15, 'REVIEWED']]);
      expect(lecture.sections[0].proposedSectionId).toBe(first);
      expect(lecture.allocatedStudents).toBe(lecture.forecastCount);

      const audit = (await client.query('SELECT a.action, a.reason, a.recorded_by, a.before_state, a.after_state, d.subject_id FROM public.forecast_adjustment_audit a JOIN public.forecast_subject_demand d USING (demand_id) WHERE a.forecast_run_id=$1 ORDER BY a.adjustment_audit_id', [id])).rows;
      expect(audit.map((entry) => [entry.action, entry.subject_id, entry.recorded_by])).toEqual([['APPROVE', ids.s102, actor], ['REPLACE_ALLOCATION', ids.s101, actor]]);
      expect(audit[1]!.before_state).toMatchObject({ sections: [{ proposedSectionId: first, expectedStudents: 30, reviewStatus: 'PENDING' }] });
      expect((audit[1]!.after_state as { sections: unknown[] }).sections).toHaveLength(2);
      expect(audit[0]!.after_state).toMatchObject({ approvalReference: 'LAB/1', sections: [{ reviewStatus: 'APPROVED' }] });

      // concurrency: a stale expectation is refused atomically by the database guard, and nothing is written
      await expect(deps.runs.applyDecisions(id, { status: 'UNDER_REVIEW', auditCount: 2 }, actor, [])).rejects.toMatchObject({ code: 'RUN_REVISION_MISMATCH' });
      // the total is preserved, then retiring a section (the replacement keeps one section: the other is retired)
      const tooMany = await mutate(id, 'decisions', revision, { decisions: [{ subjectId: ids.s101, action: 'REPLACE_ALLOCATION', reason: 'Bad total.', replacementSections: [{ sectionNumber: 1, expectedStudents: 31 }] }] });
      expect((await tooMany.json()).error.code).toBe('ALLOCATION_TOTAL_MISMATCH');
      const merged = await mutate(id, 'decisions', revision, { decisions: [{ subjectId: ids.s101, action: 'REPLACE_ALLOCATION', reason: 'Merge back.', replacementSections: [{ proposedSectionId: first, sectionNumber: 1, expectedStudents: 30 }] }] });
      expect(merged.status).toBe(200);
      revision = await revisionOf(merged);
      expect(Number((await scalar('SELECT count(*) AS n FROM public.proposed_class_section s JOIN public.forecast_subject_demand d USING (demand_id) WHERE d.forecast_run_id=$1 AND d.subject_id=$2', [id, ids.s101])).n)).toBe(1);

      const done = await mutate(id, 'finalizations', revision, { reason: 'Board approved.', approvalReference: 'BOARD/1' });
      expect(done.status).toBe(200);
      const finalRevision = await revisionOf(done);
      expect(finalRevision).toBe('fr' + id + '.FINALIZED.5');
      expect(await scalar('SELECT status, finalized_by, finalized_at IS NOT NULL AS stamped FROM public.forecast_run WHERE forecast_run_id=$1', [id])).toEqual({ status: 'FINALIZED', finalized_by: actor, stamped: true });
      const finalAudit = await scalar("SELECT reason, recorded_by, demand_id, after_state FROM public.forecast_adjustment_audit WHERE forecast_run_id=$1 AND action='FINALIZE'", [id]);
      expect(finalAudit).toMatchObject({ reason: 'Board approved.', recorded_by: actor, demand_id: null, after_state: { status: 'FINALIZED', approvalReference: 'BOARD/1' } });

      // API path
      const late = await mutate(id, 'decisions', finalRevision, { decisions: [{ subjectId: ids.s101, action: 'REVIEW', reason: 'late' }] });
      expect(late.status).toBe(409);
      expect((await late.json()).error.code).toBe('RUN_FINALIZED');
      // repository path with a matching expectation reaches the database, which refuses it
      const demandId = Number((await scalar('SELECT demand_id FROM public.forecast_subject_demand WHERE forecast_run_id=$1 AND subject_id=$2', [id, ids.s101])).demand_id);
      const plan = { demandId, subjectId: ids.s101, action: 'REVIEW' as const, reason: 'bypass', approvalReference: null, sectionStatus: 'REVIEWED' as const, before: [], replace: null };
      await expect(deps.runs.applyDecisions(id, { status: 'FINALIZED', auditCount: 5 }, actor, [plan])).rejects.toMatchObject({ code: 'RUN_FINALIZED' });
      // raw SQL paths
      await rejects('UPDATE public.proposed_class_section SET expected_students=expected_students', [], /read-only/i);
      await rejects('DELETE FROM public.forecast_subject_demand WHERE forecast_run_id=$1', [id], /read-only/i);
      await rejects('DELETE FROM public.forecast_run WHERE forecast_run_id=$1', [id], /cannot be deleted|read-only/i);
      await rejects("UPDATE public.forecast_run SET scenario_assumptions='{}'::jsonb WHERE forecast_run_id=$1", [id], /read-only/i);
      await rejects("INSERT INTO public.forecast_adjustment_audit(forecast_run_id, demand_id, action, before_state, after_state, reason, recorded_by) SELECT forecast_run_id, demand_id, 'REVIEW', '{}', '{}', 'x', 'y' FROM public.forecast_subject_demand WHERE forecast_run_id=$1 LIMIT 1", [id], /read-only/i);
      const frozenGet = (await (await call('forecast-runs/' + id)).json()).data;
      expect(frozenGet).toMatchObject({ status: 'FINALIZED', revision: finalRevision, finalizedBy: actor });
      expect(frozenGet.audit[0].actionType).toBe('FINALIZE');
    });

    it('refuses to finalize while sections are pending, reports the pending subjects and hides runs from unassigned coordinators', async () => {
      const batchId = await importCohort(30);
      const id = (await (await generate(batchId)).json()).data.resourceId as number;
      const started = await revisionOf(await mutate(id, 'reviews', 'fr' + id + '.DRAFT.0', { action: 'START_REVIEW' }));
      const blocked = await mutate(id, 'finalizations', started, {});
      expect(blocked.status).toBe(422);
      expect((await blocked.json()).error).toMatchObject({ code: 'REVIEWS_INCOMPLETE', details: { pendingSubjectIds: [ids.s101, ids.s102].sort((x, y) => x - y) } });
      const other = await handleForecastingRequest(new Request(base + 'forecast-runs/' + id), { ...deps, scopes: { ...deps.scopes, isScopeAssigned: async () => false } }) as Response;
      expect(other.status).toBe(404);
    });
  });
  describe('offering confirmation (finalized run, audit, append-only)', () => {
    const base = 'https://test.invalid/api/coordinator/';
    const deadline = '2026-12-01T04:00:00.000Z';
    const later = '2026-12-08T04:00:00.000Z';
    const call = async (path: string, init?: RequestInit) => await handleForecastingRequest(new Request(base + path, init), deps) as Response;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const scope = () => ({ programmeId: ids.programme, learningCentreId: ids.centre, targetSemesterId: ids.target });
    const query = () => `programmeId=${ids.programme}&learningCentreId=${ids.centre}&targetSemesterId=${ids.target}`;
    const rejects = async (sql: string, values: unknown[], pattern: RegExp) => {
      await client.query('SAVEPOINT probe');
      await expect(client.query(sql, values)).rejects.toThrow(pattern);
      await client.query('ROLLBACK TO SAVEPOINT probe');
    };
    let excludedId: number; let strayId: number;
    beforeEach(async () => {
      await client.query("INSERT INTO public.class_capacity_rule(class_type, minimum_enrollment, break_even_target, normal_maximum, exception_maximum, is_active) VALUES ('LECTURE',15,25,45,50,true)");
      await client.query("INSERT INTO public.class_capacity_rule(class_type, minimum_enrollment, break_even_target, normal_maximum, exception_maximum, is_active) VALUES ('LAB',15,25,35,NULL,true)");
      await client.query("UPDATE public.subject SET class_type='LECTURE' WHERE subject_id=$1", [ids.s101]);
      await client.query("UPDATE public.subject SET class_type='LAB' WHERE subject_id=$1", [ids.s102]);
      excludedId = Number((await scalar("INSERT INTO public.subject(subject_code, subject_name, credit_hours, include_in_offering_forecast) VALUES ('EX' || substr(md5(random()::text),1,6), 'Excluded subject', 6, false) RETURNING subject_id")).subject_id);
      await client.query("INSERT INTO public.curriculum_subject(is_compulsory, subject_category, curriculum_id, subject_id) VALUES (1,'CORE',$1,$2)", [ids.curriculum, excludedId]);
      strayId = Number((await scalar("INSERT INTO public.subject(subject_code, subject_name, credit_hours) VALUES ('ST' || substr(md5(random()::text),1,6), 'Not in curriculum', 3) RETURNING subject_id")).subject_id);
    });

    const newRun = async (students: number) => {
      const csv = [header, ...Array.from({ length: students }, (_, i) => row('Q' + String(i + 1).padStart(3, '0'), '', 'ACTIVE', 'COMPLETE'))].join('\n');
      const data = new FormData();
      for (const [key, value] of Object.entries(fields())) data.append(key, value);
      data.append('file', new File([csv], 'import.csv', { type: 'text/csv' }));
      const imported = await handleForecastingRequest(new Request(base + 'forecast-imports', { method: 'POST', body: data }), deps) as Response;
      const importBatchId = (await imported.json()).data.importBatchId as number;
      const created = await post('forecast-runs', { ...scope(), importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' });
      return (await created.json()).data as { resourceId: number; revision: string };
    };
    const finalized = async (students: number) => {
      const run = await newRun(students);
      const step = async (leaf: string, revision: string, body: Record<string, unknown>) => (await (await post(`forecast-runs/${run.resourceId}/${leaf}`, { scope: scope(), ...body }, { 'If-Match': '"' + revision + '"' })).json()).data.revision as string;
      let revision = await step('reviews', run.revision, { action: 'START_REVIEW' });
      revision = await step('decisions', revision, { decisions: [{ subjectId: ids.s101, action: 'APPROVE', reason: 'ok' }, { subjectId: ids.s102, action: 'APPROVE', reason: 'ok' }] });
      await step('finalizations', revision, {});
      return run.resourceId;
    };
    const confirmBody = (forecastRunId: number, subjectIds: number[], extra: Record<string, unknown> = {}) =>
      ({ scope: scope(), forecastRunId, subjectIds, reason: 'Offered next semester.', baseRevision: null, pickDeadline: deadline, ...extra });
    const send = (path: string, body: unknown, revision: string | null) => post(path, body, revision ? { 'If-Match': '"' + revision + '"' } : {});
    const readSet = async () => (await (await call('confirmed-offerings?' + query())).json()).data;
    const errorCode = async (response: Response) => (await response.json()).error.code as string;

    it('confirms from a FINALIZED run, writes the header, offerings and audit rows through the triggers', async () => {
      const run = await finalized(30);
      const created = await send('confirmed-offerings', confirmBody(run, [ids.s101, ids.s102]), null);
      expect(created.status).toBe(201);
      const receipt = (await created.json()).data;
      expect(await scalar('SELECT forecast_run_id, revision, created_by, updated_by FROM public.offering_confirmation WHERE confirmation_id=$1', [receipt.resourceId]))
        .toMatchObject({ forecast_run_id: run, revision: 3, created_by: actor, updated_by: actor });
      expect(receipt.revision).toBe('oc' + receipt.resourceId + '.3');
      const audit = (await client.query('SELECT action, subject_id, before_state, after_state, reason, recorded_by FROM public.confirmed_offering_audit WHERE confirmation_id=$1 ORDER BY audit_id', [receipt.resourceId])).rows;
      expect(audit.map((entry) => [entry.action, entry.subject_id, entry.recorded_by, entry.reason])).toEqual([
        ['SET_DEADLINE', null, actor, 'Offered next semester.'], ['CONFIRM', ids.s101, actor, 'Offered next semester.'], ['CONFIRM', ids.s102, actor, 'Offered next semester.'],
      ]);
      expect(audit[0]!.after_state).toMatchObject({ forecastRunId: run });
      const set = await readSet();
      expect(set).toMatchObject({ revision: receipt.revision, forecastRunId: run, pickWindow: 'OPEN', newerForecastAvailable: null });
      expect(set.pickDeadline).toBe(deadline);
      expect(set.offerings.map((o: { subjectId: number; status: string; classType: string; forecastRunId: number }) => [o.subjectId, o.status, o.classType, o.forecastRunId]).sort())
        .toEqual([[ids.s101, 'CONFIRMED', 'LECTURE', run], [ids.s102, 'CONFIRMED', 'LAB', run]].sort());
    });

    it('rejects a DRAFT run, an excluded subject and a subject outside the run, and writes nothing', async () => {
      const draft = await newRun(30);
      expect(await errorCode(await send('confirmed-offerings', confirmBody(draft.resourceId, [ids.s101]), null))).toBe('RUN_NOT_FINALIZED');
      const run = await finalized(31);
      const excluded = await send('confirmed-offerings', confirmBody(run, [ids.s101, excludedId]), null);
      expect(excluded.status).toBe(422);
      expect(await errorCode(excluded)).toBe('SUBJECT_EXCLUDED');
      expect(await errorCode(await send('confirmed-offerings', confirmBody(run, [strayId]), null))).toBe('SUBJECT_NOT_IN_RUN');
      expect(Number((await scalar('SELECT count(*) AS n FROM public.offering_confirmation WHERE programme_id=$1', [ids.programme])).n)).toBe(0);
      // the database enforces the same rules when the API is bypassed
      await client.query("SELECT set_config('app.offering_actor','sql',true), set_config('app.offering_reason','sql test',true)");
      await rejects("INSERT INTO public.offering_confirmation(programme_id, learning_centre_id, semester_id, forecast_run_id, pick_deadline, created_by, updated_by) VALUES ($1,$2,$3,$4,now(),'x','x')",
        [ids.programme, ids.centre, ids.target, draft.resourceId], /FINALIZED forecast run/i);
      await rejects("INSERT INTO public.offering_confirmation(programme_id, learning_centre_id, semester_id, forecast_run_id, pick_deadline, created_by, updated_by) VALUES ($1,$2,$3,$4,now(),'x','x')",
        [ids.programme, ids.centre, ids.later, run], /FINALIZED forecast run/i);
    });

    it('stores a Short-only subject as EXCLUDED for a Normal target and refuses to confirm it with a stable code', async () => {
      const shortId = Number((await scalar("INSERT INTO public.subject(subject_code, subject_name, credit_hours, class_type) VALUES ('SH' || substr(md5(random()::text),1,6), 'Short-only subject', 2, 'LECTURE') RETURNING subject_id")).subject_id);
      const curriculumSubjectId = Number((await scalar("INSERT INTO public.curriculum_subject(is_compulsory, subject_category, curriculum_id, subject_id) VALUES (1,'CORE',$1,$2) RETURNING curriculum_subject_id", [ids.curriculum, shortId])).curriculum_subject_id);
      await client.query("INSERT INTO public.subject_semester_rule(semester_type, curriculum_subject_id) VALUES ('SHORT',$1)", [curriculumSubjectId]);
      const run = await finalized(30);
      expect(await scalar('SELECT configuration_status, forecast_count, eligible_count FROM public.forecast_subject_demand WHERE forecast_run_id=$1 AND subject_id=$2', [run, shortId]))
        .toEqual({ configuration_status: 'EXCLUDED', forecast_count: null, eligible_count: 0 });
      const detail = (await (await call('forecast-runs/' + run)).json()).data;
      expect(detail.subjects.find((x: { subjectId: number }) => x.subjectId === shortId)).toMatchObject({ excluded: false, semesterTypeExcluded: true, semesterTypeExclusionReason: 'Runs only in Short semesters', sections: [] });
      expect(detail.summary).toMatchObject({ excludedSubjects: 1, notOfferedInSemesterTypeSubjects: 1 });
      const rejected = await send('confirmed-offerings', confirmBody(run, [ids.s101, shortId]), null);
      expect(rejected.status).toBe(422);
      expect(await errorCode(rejected)).toBe('SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE');
      expect(Number((await scalar('SELECT count(*) AS n FROM public.offering_confirmation WHERE programme_id=$1', [ids.programme])).n)).toBe(0);
    });

    it('withdraws, re-confirms and adds subjects with revisions, 412 on stale ones, and audits every transition', async () => {
      const run = await finalized(30);
      const created = (await (await send('confirmed-offerings', confirmBody(run, [ids.s101]), null)).json()).data;
      const withdrawn = await send('confirmed-offerings/withdrawals', { scope: scope(), subjectIds: [ids.s101], reason: 'Not enough demand.', baseRevision: created.revision }, created.revision);
      expect(withdrawn.status).toBe(200);
      const afterWithdraw = (await withdrawn.json()).data.revision as string;
      expect(await scalar('SELECT status, withdrawn_by, withdrawn_at IS NOT NULL AS stamped FROM public.confirmed_offering WHERE subject_id=$1', [ids.s101])).toEqual({ status: 'WITHDRAWN', withdrawn_by: actor, stamped: true });
      const stale = await send('confirmed-offerings', confirmBody(run, [ids.s101], { baseRevision: created.revision }), created.revision);
      expect(stale.status).toBe(412);
      expect(await errorCode(stale)).toBe('CONFIRMATION_REVISION_MISMATCH');
      const again = await send('confirmed-offerings', confirmBody(run, [ids.s101, ids.s102], { baseRevision: afterWithdraw, reason: 'Demand recovered.' }), afterWithdraw);
      expect(again.status).toBe(200);
      expect(await scalar('SELECT status, withdrawn_by FROM public.confirmed_offering WHERE subject_id=$1', [ids.s101])).toEqual({ status: 'CONFIRMED', withdrawn_by: null });
      const set = await readSet();
      expect(set.offerings.map((o: { subjectId: number; status: string; reason: string }) => [o.subjectId, o.status, o.reason]).sort())
        .toEqual([[ids.s101, 'CONFIRMED', 'Demand recovered.'], [ids.s102, 'CONFIRMED', 'Demand recovered.']].sort());
      const audit = (await client.query("SELECT action, before_state->>'status' AS b, after_state->>'status' AS a, reason FROM public.confirmed_offering_audit WHERE subject_id=$1 ORDER BY audit_id", [ids.s101])).rows;
      expect(audit).toEqual([
        { action: 'CONFIRM', b: null, a: 'CONFIRMED', reason: 'Offered next semester.' }, { action: 'WITHDRAW', b: 'CONFIRMED', a: 'WITHDRAWN', reason: 'Not enough demand.' },
        { action: 'CONFIRM', b: 'WITHDRAWN', a: 'CONFIRMED', reason: 'Demand recovered.' },
      ]);
      // atomic stale-expectation guard at the repository level: nothing is written
      const header = (await deps.offerings.get(scope()))!.header;
      const before = Number((await scalar('SELECT count(*) AS n FROM public.confirmed_offering_audit')).n);
      await expect(deps.offerings.withdraw({ confirmationId: header.confirmationId, expectedRevision: header.revision - 1, subjectIds: [ids.s101], reason: 'racing', actor })).rejects.toMatchObject({ code: 'CONFIRMATION_REVISION_MISMATCH' });
      expect(Number((await scalar('SELECT count(*) AS n FROM public.confirmed_offering_audit')).n)).toBe(before);
    });

    it('audits a deadline change and a source-run switch as SET_DEADLINE with before and after, and shows a newer forecast without changing anything', async () => {
      const run = await finalized(30);
      const created = (await (await send('confirmed-offerings', confirmBody(run, [ids.s101]), null)).json()).data;
      const newer = await finalized(31);
      const draft = await newRun(32);
      expect((await readSet()).newerForecastAvailable).toEqual({ forecastRunId: draft.resourceId, versionNumber: 3, status: 'DRAFT' });
      expect((await readSet()).revision).toBe(created.revision);
      const changed = await send('confirmed-offerings/pick-deadline', { scope: scope(), pickDeadline: later, reason: 'Registry asked for more time.', baseRevision: created.revision, forecastRunId: newer }, created.revision);
      expect(changed.status).toBe(200);
      expect(await scalar('SELECT forecast_run_id FROM public.offering_confirmation WHERE confirmation_id=$1', [created.resourceId])).toMatchObject({ forecast_run_id: newer });
      const entry = await scalar("SELECT before_state, after_state, reason, recorded_by, subject_id FROM public.confirmed_offering_audit WHERE confirmation_id=$1 AND action='SET_DEADLINE' ORDER BY audit_id DESC LIMIT 1", [created.resourceId]);
      expect(entry).toMatchObject({ reason: 'Registry asked for more time.', recorded_by: actor, subject_id: null, before_state: { forecastRunId: run }, after_state: { forecastRunId: newer } });
      const page = (await (await call('confirmed-offerings/audit?' + query() + '&limit=2')).json()).data;
      expect(page.items[0]).toMatchObject({ action: 'SET_DEADLINE', beforeDeadline: deadline, afterDeadline: later, forecastRunId: newer, reason: 'Registry asked for more time.' });
      expect(page.items[1]).toMatchObject({ action: 'CONFIRM', subjectId: ids.s101, forecastRunId: run });
      expect(page.nextCursor).toBeTruthy();
      expect(await errorCode(await send('confirmed-offerings/pick-deadline', { scope: scope(), pickDeadline: deadline, reason: 'again', baseRevision: created.revision }, created.revision))).toBe('CONFIRMATION_REVISION_MISMATCH');
    });

    it('keeps the audit append-only and refuses mutations without trusted actor and reason', async () => {
      const run = await finalized(30);
      const created = (await (await send('confirmed-offerings', confirmBody(run, [ids.s101]), null)).json()).data;
      await rejects('UPDATE public.confirmed_offering_audit SET reason=reason', [], /immutable/i);
      await rejects('DELETE FROM public.confirmed_offering_audit', [], /immutable/i);
      await rejects('TRUNCATE public.confirmed_offering_audit', [], /immutable/i);
      await rejects('DELETE FROM public.confirmed_offering', [], /immutable/i);
      await rejects('DELETE FROM public.offering_confirmation', [], /immutable/i);
      await client.query("SELECT set_config('app.offering_actor','',true), set_config('app.offering_reason','',true)");
      await rejects("UPDATE public.confirmed_offering SET status='WITHDRAWN' WHERE subject_id=$1", [ids.s101], /trusted actor and reason/i);
      await rejects('UPDATE public.offering_confirmation SET pick_deadline = now() WHERE confirmation_id=$1', [created.resourceId], /trusted actor and reason/i);
      await rejects("INSERT INTO public.confirmed_offering_audit(confirmation_id, subject_id, action, before_state, after_state, reason, recorded_by) VALUES ($1,NULL,'SET_DEADLINE',NULL,'{}','x','y')", [created.resourceId], /trusted actor and reason/i);
    });

    it('hides the confirmation from unassigned coordinators', async () => {
      const closed = { ...deps, scopes: { ...deps.scopes, isScopeAssigned: async () => false } };
      const response = await handleForecastingRequest(new Request(base + 'confirmed-offerings?' + query()), closed) as Response;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('SCOPE_NOT_ASSIGNED');
    });
  });
});
