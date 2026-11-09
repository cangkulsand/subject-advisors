#!/usr/bin/env node
/**
 * Disposable PostgreSQL WASM database and synthetic UC10 fixture.
 * This file never reads DATABASE_URL (or any connection setting) and opens no network socket.
 * Until the route writer is reviewed, `--setup-only` validates migrations and fixture only.
 */
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrations, applyMigrations } from '../db/migrations.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '../..');

async function createPGlite() {
  const moduleName = process.env.P002_PGLITE_MODULE || '@electric-sql/pglite';
  const moduleUrl = moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName;
  const { PGlite } = await import(moduleUrl);
  return new PGlite();
}

function migrationClient(db, entries) {
  const migrationSql = new Set(entries.map(entry => entry.sql));
  return {
    query(sql, params) {
      // PGlite's query path is a prepared single statement; migration files are trusted
      // multi-statement SQL and are run with exec, while all runner queries use query.
      if (migrationSql.has(sql)) return db.exec(sql).then(() => ({ rows: [] }));
      return db.query(sql, params);
    },
  };
}

async function applyProjectMigrations(db) {
  const entries = await loadMigrations(PROJECT);
  await applyMigrations(migrationClient(db, entries), entries);
}

/** Seed pre-existing institutional-style data for isolated tests, never through API writers. */
async function seedFixture(db) {
  await db.query("SET session_replication_role = 'replica'");
  try {
    await db.exec(`
      INSERT INTO public.programme(programme_id,programme_code,programme_name,status)
        VALUES (1,'DEMO-CS','Synthetic Computing Programme','ACTIVE');
      INSERT INTO public.curriculum(curriculum_id,curriculum_version,total_credit_required,effective_year,status,programme_id)
        VALUES (1,'TEST-1',120,2026,'ACTIVE',1);
      INSERT INTO public.learning_centre(learning_centre_id,centre_code,centre_name)
        VALUES (1,'TST','Synthetic Test Centre');
      INSERT INTO public.subject(subject_id,subject_code,subject_name,credit_hours,subject_category,status)
        VALUES
          (1,'TEST101','Sequential Foundation',3,'CORE','ACTIVE'),
          (2,'TEST102','Sequential Follow-up',3,'CORE','ACTIVE'),
          (3,'TEST201','Concurrent Pair A',2,'ELECTIVE','ACTIVE'),
          (4,'TEST202','Concurrent Pair B',2,'ELECTIVE','ACTIVE'),
          (5,'TEST301','Ordinary Eligible Subject',3,'CORE','ACTIVE');
      INSERT INTO public.curriculum_subject(curriculum_subject_id,is_compulsory,subject_category,curriculum_id,subject_id)
        VALUES
          (101,1,'CORE',1,1),(102,1,'CORE',1,2),(103,0,'ELECTIVE',1,3),
          (104,0,'ELECTIVE',1,4),(105,1,'CORE',1,5);
      INSERT INTO public.subject_prerequisite(prerequisite_id,requirement_type,curriculum_subject_id,required_curriculum_subject_id)
        VALUES (1,'MANDATORY',102,101),(2,'COREQUISITE',103,104);
      INSERT INTO public.subject_semester_rule(rule_id,semester_type,curriculum_subject_id)
        VALUES (1,'NORMAL',103),(2,'NORMAL',104);
      INSERT INTO public.academic_semester(semester_id,academic_year,semester_no,semester_type,max_subjects,max_credits,is_current)
        VALUES
          (1,'2026/2027',1,'NORMAL',3,10,true),
          (2,'2026/2027',2,'NORMAL',3,10,false),
          (3,'2026/2027',3,'SHORT',3,6,false);
      INSERT INTO public.student_profile(student_id,clerk_user_id,matric_no,student_name,curriculum_id)
        VALUES
          (1,'p002-db-demo-own','DEMO001','Synthetic Own Student',1),
          (2,'p002-db-demo-other','DEMO002','Synthetic Other Student',1);
      INSERT INTO public.academic_record(record_id,status,grade,recognized_credits,student_id,subject_id,semester_id)
        VALUES (1,'COMPLETED','A',3,1,1,1),(2,'FAILED','F',0,2,1,1);
      INSERT INTO public.academic_import_batch(
        import_batch_id,learning_centre_id,snapshot_date,provided_by,source_label,import_status,
        programme_id,target_semester_id,source_fingerprint,validation_summary,accepted_at,accepted_by
      ) VALUES (
        1,1,'2026-11-01','synthetic-fixture','p002-db-test','ACCEPTED',1,2,
        repeat('a',64),'{}'::jsonb,now(),'synthetic-fixture'
      );
      INSERT INTO public.forecast_run(
        forecast_run_id,import_batch_id,target_semester_id,scenario_assumptions,generated_by,status,
        learning_centre_id,version_number,finalized_by,finalized_at
      ) VALUES (1,1,2,'{}'::jsonb,'synthetic-fixture','FINALIZED',1,1,'synthetic-fixture',now());
      INSERT INTO public.offering_confirmation(
        confirmation_id,programme_id,learning_centre_id,semester_id,forecast_run_id,pick_deadline,
        created_by,updated_by
      ) VALUES (1,1,1,2,1,now()+interval '30 days','synthetic-fixture','synthetic-fixture');
      INSERT INTO public.confirmed_offering(confirmed_offering_id,confirmation_id,subject_id,status,confirmed_by)
        VALUES (1,1,1,'CONFIRMED','synthetic-fixture'),(2,1,2,'CONFIRMED','synthetic-fixture'),
          (3,1,3,'CONFIRMED','synthetic-fixture'),(4,1,4,'CONFIRMED','synthetic-fixture'),
          (5,1,5,'CONFIRMED','synthetic-fixture');
    `);
  } finally {
    await db.query("SET session_replication_role = 'origin'");
  }

  const result = await db.query(`
    SELECT s.clerk_user_id, count(DISTINCT co.subject_id)::int AS confirmed_subjects,
           count(DISTINCT r.record_id)::int AS academic_records,
           count(DISTINCT p.curriculum_subject_id)::int AS sequential_edges
      FROM public.student_profile s
      JOIN public.offering_confirmation oc ON oc.semester_id=2 AND oc.programme_id=1
      JOIN public.confirmed_offering co ON co.confirmation_id=oc.confirmation_id AND co.status='CONFIRMED'
      LEFT JOIN public.academic_record r ON r.student_id=s.student_id
      LEFT JOIN public.subject_prerequisite p ON p.requirement_type='MANDATORY'
     WHERE s.student_id=1
     GROUP BY s.clerk_user_id
  `);
  if (result.rows[0]?.confirmed_subjects !== 5 || result.rows[0]?.academic_records !== 1 || result.rows[0]?.sequential_edges !== 1) {
    throw new Error('Synthetic UC10 fixture failed its post-seed integrity assertions');
  }
  return { ownStudentId: 1, otherStudentId: 2, semesterId: 2, confirmationId: 1 };
}

async function loadApiModules() {
  const esbuild = await import('esbuild');
  const entry = `
    export { createStudentEligibilityReader } from ${JSON.stringify(resolve(HERE, '../../apps/api/src/modules/student-eligibility/repository.ts') )};
    export { createSemesterSelectionRepository } from ${JSON.stringify(resolve(HERE, '../../apps/api/src/modules/student-eligibility/selection-repository.ts'))};
    export { handleSemesterSelectionRequest, STUDENT_SEMESTER_SELECTION_PATH } from ${JSON.stringify(resolve(HERE, '../../apps/api/src/modules/student-eligibility/selection-routes.ts'))};
  `;
  const built = await esbuild.build({ stdin: { contents: entry, resolveDir: PROJECT, sourcefile: 'p002-db-entry.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, target: 'node22' });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
}

function createDatabaseAdapter(db) {
  return {
    async query(text, params = []) {
      return (await db.query(text, params)).rows;
    },
    async transaction(commands) {
      return db.transaction(async tx => {
        const results = [];
        for (const command of commands) results.push((await tx.query(command.text, command.params)).rows);
        return results;
      });
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function requestRoute(handler, path, deps, { method = 'GET', body } = {}) {
  return handler(new Request(`https://local.test${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), deps);
}

async function requestData(handler, path, deps) {
  const response = await requestRoute(handler, path, deps);
  const json = await response.json();
  assert(response.status === 200, `GET returned ${response.status}: ${JSON.stringify(json)}`);
  return json.data;
}

async function putSelection(handler, path, deps, plan, expectedStatus = 200) {
  const response = await requestRoute(handler, path, deps, { method: 'PUT', body: plan });
  const json = await response.json();
  assert(response.status === expectedStatus, `PUT expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(json)}`);
  return { response, json };
}

async function storedPlan(db, studentId = 1) {
  return (await db.query(`SELECT m.plan_id,m.revision,m.source_revision,
      coalesce(jsonb_agg(s.subject_id ORDER BY s.subject_id) FILTER (WHERE s.subject_id IS NOT NULL),'[]'::jsonb) AS subject_ids
    FROM public.p002_semester_selection m
    LEFT JOIN public.plan_subject ps ON ps.plan_id=m.plan_id
    LEFT JOIN public.curriculum_subject cs USING (curriculum_subject_id)
    LEFT JOIN public.subject s USING (subject_id)
    WHERE m.student_id=$1 AND m.semester_id=2 GROUP BY m.plan_id,m.revision,m.source_revision`, [studentId])).rows[0] ?? null;
}

async function setDeadline(db, value) {
  await db.query("SET session_replication_role = 'replica'");
  try { await db.query('UPDATE public.offering_confirmation SET pick_deadline=$1 WHERE confirmation_id=1', [value]); }
  finally { await db.query("SET session_replication_role = 'origin'"); }
}

async function changeSourceAfterRead(db) {
  await db.query("SET session_replication_role = 'replica'");
  try { await db.query("INSERT INTO public.subject_semester_rule(rule_id,semester_type,curriculum_subject_id) VALUES (3,'SHORT',105)"); }
  finally { await db.query("SET session_replication_role = 'origin'"); }
}

async function runWriterCases(db, fixture) {
  const { createStudentEligibilityReader, createSemesterSelectionRepository, handleSemesterSelectionRequest, STUDENT_SEMESTER_SELECTION_PATH } = await loadApiModules();
  const adapter = createDatabaseAdapter(db);
  const reader = createStudentEligibilityReader(adapter.query);
  const actualRepository = createSemesterSelectionRepository(adapter);
  const authFor = clerkUserId => ({
    verify: async () => ({ clerkUserId, sessionId: `sess-${clerkUserId}`, primaryEmail: { address: 'student@graduate.utm.my', verified: true } }),
    access: { find: async id => ({ clerkUserId: id, appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' }), initializeStudent: async () => { throw new Error('unexpected initialize'); } },
    profiles: { stateFor: async () => 'COMPLETE' },
  });
  const makeDeps = (clerkUserId, selections = actualRepository) => ({ auth: authFor(clerkUserId), reader, selections });
  const ownDeps = makeDeps('p002-db-demo-own');
  const path = STUDENT_SEMESTER_SELECTION_PATH;
  const beforeRecords = (await db.query('SELECT student_id,subject_id,status,recognized_credits FROM public.academic_record ORDER BY student_id,subject_id')).rows;

  let page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
  assert(page.plan.revision === 0 && page.plan.subjectIds.length === 0, 'initial plan is empty at revision 0');
  const first = await putSelection(handleSemesterSelectionRequest, path, ownDeps,
    { subjectIds: [3,4,5], sourceRevision: page.sourceRevision, planRevision: page.plan.revision });
  assert(first.json.data.plan.revision === 1, 'first persisted plan advances revision to 1');
  let stored = await storedPlan(db);
  assert(stored?.plan_id && JSON.stringify(stored.subject_ids) === '[3,4,5]', 'actual academic_plan/plan_subject rows persist valid corequisite pair');

  page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
  const edit = await putSelection(handleSemesterSelectionRequest, path, ownDeps,
    { subjectIds: [3,4], sourceRevision: page.sourceRevision, planRevision: page.plan.revision });
  assert(edit.json.data.plan.revision === 2, 'edit advances metadata revision to 2');
  stored = await storedPlan(db);
  assert(JSON.stringify(stored.subject_ids) === '[3,4]' && Number(stored.revision) === 2, 'edited subjects and metadata revision persist');

  page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
  await putSelection(handleSemesterSelectionRequest, path, ownDeps,
    { subjectIds: [1], sourceRevision: page.sourceRevision, planRevision: page.plan.revision }, 422);
  stored = await storedPlan(db);
  assert(JSON.stringify(stored.subject_ids) === '[3,4]' && Number(stored.revision) === 2, 'invalid plan leaves prior persisted rows and revision intact');

  // Race the source after the request has read it but before the actual repository writer runs.
  page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
  const sourceRaceRepo = { readOwnPlan: (...args) => actualRepository.readOwnPlan(...args), save: async context => {
    await changeSourceAfterRead(db);
    return actualRepository.save(context);
  } };
  await putSelection(handleSemesterSelectionRequest, path, makeDeps('p002-db-demo-own', sourceRaceRepo),
    { subjectIds: [3,4], sourceRevision: page.sourceRevision, planRevision: page.plan.revision }, 409);
  stored = await storedPlan(db);
  assert(JSON.stringify(stored.subject_ids) === '[3,4]' && Number(stored.revision) === 2, 'source race is rejected by SQL guard without writes');

  // Simulate a competing revision update between route read and writer guard; PGlite is single-connection,
  // so this proves the SQL compare-and-swap branch, not multi-connection serializable concurrency.
  page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
  const planRaceRepo = { readOwnPlan: (...args) => actualRepository.readOwnPlan(...args), save: async context => {
    await db.query('UPDATE public.p002_semester_selection SET revision=revision+1 WHERE student_id=1 AND semester_id=2');
    return actualRepository.save(context);
  } };
  await putSelection(handleSemesterSelectionRequest, path, makeDeps('p002-db-demo-own', planRaceRepo),
    { subjectIds: [3,4], sourceRevision: page.sourceRevision, planRevision: page.plan.revision }, 409);
  stored = await storedPlan(db);
  assert(JSON.stringify(stored.subject_ids) === '[3,4]' && Number(stored.revision) === 3, 'plan revision race leaves prior subject rows and competing revision intact');

  const otherDeps = makeDeps('p002-db-demo-other');
  page = await requestData(handleSemesterSelectionRequest, path, otherDeps);
  assert(page.plan.revision === 0 && page.plan.subjectIds.length === 0, 'other student sees only their own empty plan');
  const sequential = await putSelection(handleSemesterSelectionRequest, path, otherDeps,
    { subjectIds: [1,2], sourceRevision: page.sourceRevision, planRevision: page.plan.revision }, 422);
  assert(sequential.json.error.code === 'SELECTION_INVALID', 'mandatory sequential prerequisite cannot be satisfied by co-selection after a failed attempt');
  const otherStored = await storedPlan(db, fixture.otherStudentId);
  assert(otherStored === null, 'other student invalid selection creates no plan');

  await setDeadline(db, new Date(Date.now() - 60_000).toISOString());
  page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
  assert(page.editingOpen === false, 'reader exposes expired deadline as closed');
  await putSelection(handleSemesterSelectionRequest, path, ownDeps,
    { subjectIds: [3,4], sourceRevision: page.sourceRevision, planRevision: page.plan.revision }, 409);
  await setDeadline(db, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

  // Force a database failure only after the writer's delete statement. Transaction rollback must restore rows.
  await db.exec(`CREATE FUNCTION public.p002_test_fail_plan_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic insert failure'; END $$;
    CREATE TRIGGER p002_test_fail_plan_insert BEFORE INSERT ON public.plan_subject
      FOR EACH ROW EXECUTE FUNCTION public.p002_test_fail_plan_insert();`);
  try {
    page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
    await putSelection(handleSemesterSelectionRequest, path, ownDeps,
      { subjectIds: [4,3], sourceRevision: page.sourceRevision, planRevision: page.plan.revision }, 503);
  } finally {
    await db.exec('DROP TRIGGER IF EXISTS p002_test_fail_plan_insert ON public.plan_subject; DROP FUNCTION IF EXISTS public.p002_test_fail_plan_insert();');
  }
  stored = await storedPlan(db);
  assert(JSON.stringify(stored.subject_ids) === '[3,4]' && Number(stored.revision) === 3, 'transaction failure after deletion rolls back prior plan subjects and revision');

  page = await requestData(handleSemesterSelectionRequest, path, ownDeps);
  const clear = await putSelection(handleSemesterSelectionRequest, path, ownDeps,
    { subjectIds: [], sourceRevision: page.sourceRevision, planRevision: page.plan.revision });
  assert(clear.json.data.plan.revision === 4 && clear.json.data.plan.subjectIds.length === 0, 'clear persists as next plan revision');
  stored = await storedPlan(db);
  assert(JSON.stringify(stored.subject_ids) === '[]' && Number(stored.revision) === 4, 'clear removes plan_subject rows but retains metadata/plan identity');

  const count = await db.query('SELECT count(*)::int AS n FROM public.p002_semester_selection WHERE student_id=1 AND semester_id=2');
  assert(count.rows[0].n === 1, 'exactly one metadata row exists per student/semester');
  const afterRecords = (await db.query('SELECT student_id,subject_id,status,recognized_credits FROM public.academic_record ORDER BY student_id,subject_id')).rows;
  assert(JSON.stringify(afterRecords) === JSON.stringify(beforeRecords), 'academic history is unchanged throughout selection writes');

  return { cases: ['save/reload/edit/clear', 'eligible configured corequisite pair', 'invalid 422 preserves prior rows',
    'source race 409', 'plan revision race 409', 'other-student isolation', 'sequential prerequisite co-selection rejection',
    'expired deadline', 'post-delete transaction rollback', 'unique metadata row', 'academic records unchanged'] };
}

async function main() {
  const db = await createPGlite();
  try {
    await applyProjectMigrations(db);
    const fixture = await seedFixture(db);
    const writer = await runWriterCases(db, fixture);
    console.log(JSON.stringify({ status: 'WRITER_PASS', postgres: (await db.query('select version() as v')).rows[0].v.split('\n')[0], fixture, writer }, null, 2));
  } finally {
    await db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
