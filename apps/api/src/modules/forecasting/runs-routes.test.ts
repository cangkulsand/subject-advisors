import { describe, expect, it, vi } from 'vitest';
import type { ScopeProvider } from './scope-provider';
import { testScopeProvider } from './scope-provider.test-support';
import type { EngineCapacityRule, EngineCurriculum, EngineStudent } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { ForecastRunDetail, RunSubjectStudents } from '../../../../../packages/shared/src/forecasting/runs';
import type { ForecastingDependencies, ForecastingRepository, ImportBatchRow } from './contracts';
import { mapForecastingDatabaseError } from './errors';
import { handleForecastingRequest } from './routes';
import type { EngineInputRows } from './runs-contracts';
import { fakeRunsRepository } from './runs-testing';

const COORDINATOR = 'user_coord';
const BASE = 'https://test.invalid/api/coordinator/';
const scope = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
const A = 101; const B = 102; const C = 103; const X = 104; const S = 105;

const subject = (id: number, code: string, classType: 'LECTURE' | 'LAB' | null, include = true) => ({
  curriculumSubjectId: 1000 + id, curriculumId: 10, subjectId: id, subjectCode: code, subjectName: 'Subject ' + code, creditHours: 3, classType,
  includeInOfferingForecast: include, exclusionReason: include ? null : 'Excluded from the offering forecast in the subject catalogue.',
  prerequisiteLinks: [], conditionalPrerequisites: { status: 'UNAVAILABLE' as const, reason: 'none' },
});
const curriculum: EngineCurriculum = {
  curriculumId: 10, curriculumVersion: '2024-DEMO', totalCreditsRequired: 30, catalogueFingerprint: 'fp', requirements: [], subjectSemesterRules: [],
  subjects: [subject(A, 'LEC101', 'LECTURE'), subject(B, 'LAB102', 'LAB'), subject(C, 'NOT103', null), subject(X, 'FYP104', 'LECTURE', false)],
};
/** Same catalogue plus a Short-only subject (semester rule SHORT); the target semester is NORMAL, so it is not offered. */
const withShortOnly: EngineCurriculum = {
  ...curriculum, subjects: [...curriculum.subjects, subject(S, 'SHT105', 'LECTURE')],
  subjectSemesterRules: [{ ruleId: 1, curriculumSubjectId: 1000 + S, semesterType: 'SHORT' }],
};
const students: EngineStudent[] = Array.from({ length: 46 }, (_, index) => ({
  externalReference: 'S' + String(index + 1).padStart(3, '0'), studentName: null, curriculumId: 10, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE' as const, records: [],
}));
const capacityRules: EngineCapacityRule[] = [
  { capacityRuleId: 1, scopeKind: 'GLOBAL', classType: 'LECTURE', minimumEnrollment: 15, breakEvenTarget: 25, normalMaximum: 45, exceptionMaximum: 50, isActive: true },
  { capacityRuleId: 2, scopeKind: 'GLOBAL', classType: 'LAB', minimumEnrollment: 15, breakEvenTarget: 25, normalMaximum: 35, exceptionMaximum: null, isActive: true },
];
const inputs: EngineInputRows = {
  target: { semesterId: 2, semesterType: 'NORMAL', maxSubjects: 6, maxCredits: 20 }, snapshot: { students, rejectedRowsByStudent: {} }, curricula: [curriculum], capacityRules,
};

const batch = (importBatchId: number, status: ImportBatchRow['status'] = 'ACCEPTED', overrides: Partial<ImportBatchRow> = {}): ImportBatchRow => ({
  importBatchId, ...scope, status, sourceDate: '2026-10-30', sourceLabel: 'Registry export', providedBy: COORDINATOR, sourceFingerprint: 'f'.repeat(64),
  acceptedAt: status === 'ACCEPTED' ? '2026-11-01T09:00:00.000Z' : null, acceptedBy: COORDINATOR,
  summary: { internal: { schemaVersion: 1, csvVersion: 1, dataRows: 46, rejectedRowsByStudent: {} } } as never, ...overrides,
});

function fixture(options: { shortOnly?: boolean; roles?: ('STUDENT' | 'COORDINATOR' | 'SYSTEM_ADMIN')[]; scopes?: ScopeProvider; actor?: string } = {}) {
  const roles = options.roles ?? ['COORDINATOR'];
  const batches = [batch(1), batch(2), batch(3, 'VALIDATED'), batch(4, 'ACCEPTED', { learningCentreId: 2 }),
    batch(5, 'ACCEPTED', { summary: { source: 'SYSTEM', internal: { schemaVersion: 1, csvVersion: 1, source: 'PORTAL', dataRows: 0, rejectedRowsByStudent: {} } } as never }),
    batch(6, 'ACCEPTED', { summary: { source: 'COMBINED', internal: { schemaVersion: 1, csvVersion: 1, source: 'COMBINED', dataRows: 3, rejectedRowsByStudent: {}, sourceByReference: {} } } as never })];
  const liveInputs: EngineInputRows = { ...inputs, curricula: [options.shortOnly ? withShortOnly : curriculum] };
  const fake = fakeRunsRepository(liveInputs);
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: options.actor ?? COORDINATOR, sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository: { getBatch: vi.fn(async (id: number) => batches.find((entry) => entry.importBatchId === id) ?? null) } as unknown as ForecastingRepository,
    runs: fake.repository,
    decisions: {} as ForecastingDependencies['decisions'],
    scopes: options.scopes ?? testScopeProvider,
    now: () => new Date('2026-11-01T12:00:00.000Z'),
  };
  return { deps, liveInputs, ...fake };
}
type Deps = ForecastingDependencies;

const call = (deps: Deps, path: string, init?: RequestInit) => handleForecastingRequest(new Request(BASE + path, init), deps) as Promise<Response>;
const get = (deps: Deps, path: string) => call(deps, path);
const post = (deps: Deps, path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(deps, path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const generate = (deps: Deps, importBatchId = 1) =>
  post(deps, 'forecast-runs', { ...scope, importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' }, { 'Idempotency-Key': 'k-' + importBatchId });
const etag = (response: Response) => response.headers.get('ETag')!;
const readData = async <T>(response: Response) => (await response.json() as { data: T }).data;
const errorOf = async (response: Response) => (await response.json() as { error: { code: string; details?: Record<string, unknown> } }).error;

async function newRun(deps: Deps, importBatchId = 1) {
  const created = await generate(deps, importBatchId);
  const receipt = await readData<{ resourceId: number; revision: string }>(created);
  return { id: receipt.resourceId, revision: receipt.revision, created };
}
const detailOf = async (deps: Deps, id: number) => readData<ForecastRunDetail>(await get(deps, 'forecast-runs/' + id));
describe('UC20 forecast run API', () => {
  it('reports the data source of the import in the run detail (student-entered records for system snapshots)', async () => {
    const { deps } = fixture();
    const fromCsv = await newRun(deps, 1), fromSystem = await newRun(deps, 5), fromBoth = await newRun(deps, 6);
    expect(fromSystem.created.status).toBe(201);
    expect((await detailOf(deps, fromBoth.id)).dataSource).toBe('COMBINED');
    expect((await detailOf(deps, fromCsv.id)).dataSource).toBe('CSV');
    expect((await detailOf(deps, fromSystem.id)).dataSource).toBe('SYSTEM');
  });

  describe('students behind a subject', () => {
    const studentsOf = async (deps: Deps, id: number, subjectId: number) => readData<RunSubjectStudents>(await get(deps, `forecast-runs/${id}/subjects/${subjectId}/students`));

    it('lists the students of a subject and its tallies match the stored counts', async () => {
      const { deps } = fixture();
      const { id } = await newRun(deps);
      const detail = await detailOf(deps, id);
      for (const stored of detail.subjects as unknown as Array<{ subjectId: number; supportedEligibleCount: number; uncertainStudentCount: number; nearGraduationCount: number; breakdown: Record<string, number> }>) {
        const response = await get(deps, `forecast-runs/${id}/subjects/${stored.subjectId}/students`);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const view = await readData<RunSubjectStudents>(response);
        expect(view).toMatchObject({ forecastRunId: id, subjectId: stored.subjectId, catalogueMatchesRun: true });
        expect(view.summary).toMatchObject({ counted: stored.supportedEligibleCount, uncertain: stored.uncertainStudentCount, nearGraduation: stored.nearGraduationCount });
        expect(view.summary.breakdown).toEqual(stored.breakdown);
        expect(view.students).toHaveLength(stored.breakdown.inCurriculum!);
        expect(view.students.filter((row) => row.outcome === 'SUPPORTED')).toHaveLength(stored.supportedEligibleCount);
        expect(view.students.filter((row) => row.nearGraduation)).toHaveLength(stored.nearGraduationCount);
      }
      const view = await studentsOf(deps, id, A);
      expect(view.students[0]).toMatchObject({ externalReference: 'S001', studentName: null, outcome: 'SUPPORTED', nearGraduation: true, remainingCredits: 30 });
      expect(view.students.map((row) => row.externalReference)).toEqual([...view.students.map((row) => row.externalReference)].sort());
    });

    it('is hidden outside the assigned scope and answers 404 for unknown runs and subjects', async () => {
      const open = fixture();
      const { id } = await newRun(open.deps);
      const closed = { ...open.deps, scopes: { ...testScopeProvider, isScopeAssigned: async () => false } };
      expect(await errorOf(await get(closed, `forecast-runs/${id}/subjects/${A}/students`))).toMatchObject({ code: 'RUN_NOT_FOUND' });
      expect(await errorOf(await get(open.deps, `forecast-runs/999/subjects/${A}/students`))).toMatchObject({ code: 'RUN_NOT_FOUND' });
      const unknown = await get(open.deps, `forecast-runs/${id}/subjects/9999/students`);
      expect(unknown.status).toBe(404);
      expect(await errorOf(unknown)).toMatchObject({ code: 'RUN_SUBJECT_NOT_FOUND' });
      expect((await get(fixture({ roles: ['STUDENT'] }).deps, `forecast-runs/${id}/subjects/${A}/students`)).status).toBe(403);
    });

    it('rejects other methods and query parameters', async () => {
      const { deps } = fixture();
      const { id } = await newRun(deps);
      expect((await call(deps, `forecast-runs/${id}/subjects/${A}/students`, { method: 'POST' })).status).toBe(405);
      expect((await get(deps, `forecast-runs/${id}/subjects/${A}/students?x=1`)).status).toBe(400);
    });

    it('adds the matric number and sign-in email of portal students and keeps the list when the lookup fails', async () => {
      const { deps, liveInputs } = fixture();
      const { id } = await newRun(deps);
      liveInputs.snapshot = { ...liveInputs.snapshot, students: liveInputs.snapshot.students.map((student, index) => index < 2 ? { ...student, externalReference: 'PORTAL-' + (index + 1) } : student) };
      const lookup = vi.fn(async (ids: number[]) => ({ emailsAvailable: true, contacts: new Map(ids.filter((id) => id === 1).map((id) => [id, { matricNo: 'A22EC0013', email: 'harraz@graduate.utm.my' }])) }));
      const view = await studentsOf({ ...deps, portalContacts: lookup }, id, A);
      expect(lookup).toHaveBeenCalledWith([1, 2]);
      expect(view.emailsAvailable).toBe(true);
      const byRef = new Map(view.students.map((row) => [row.externalReference, [row.matricNo, row.email]]));
      expect([byRef.get('PORTAL-1'), byRef.get('PORTAL-2'), byRef.get('S003')]).toEqual([['A22EC0013', 'harraz@graduate.utm.my'], [null, null], [null, null]]);
      const noEmails = await studentsOf({ ...deps, portalContacts: async () => ({ emailsAvailable: false, contacts: new Map([[1, { matricNo: 'A22EC0013', email: null }]]) }) }, id, A);
      expect(noEmails.emailsAvailable).toBe(false);
      expect(noEmails.students.find((row) => row.externalReference === 'PORTAL-1')).toMatchObject({ matricNo: 'A22EC0013', email: null });
      const failed = await studentsOf({ ...deps, portalContacts: async () => { throw new Error('Database unavailable'); } }, id, A);
      expect(failed.emailsAvailable).toBe(false);
      expect(failed.students.every((row) => row.email === null && row.matricNo === null)).toBe(true);
      expect(failed.students).toHaveLength(view.students.length);
    });

    it('flags a catalogue that changed after the forecast was generated', async () => {
      const { deps, liveInputs } = fixture();
      const { id } = await newRun(deps);
      liveInputs.curricula = [{ ...curriculum, subjects: curriculum.subjects.map((entry) => entry.subjectId === A ? { ...entry, creditHours: 4 } : entry) }];
      const view = await studentsOf(deps, id, A);
      expect(view.catalogueMatchesRun).toBe(false);
      expect(view.students).toHaveLength(46);
    });
  });

  describe('access', () => {
    it('is coordinator only', async () => {
      const { deps } = fixture({ roles: ['STUDENT'] });
      expect((await get(deps, 'forecast-runs/1')).status).toBe(403);
      expect((await generate(deps)).status).toBe(403);
      expect(fixture({ roles: ['SYSTEM_ADMIN'] }).deps.auth.access.find).toBeDefined();
      expect((await generate(fixture({ roles: ['SYSTEM_ADMIN'] }).deps)).status).toBe(403);
    });

    it('uses the scope provider: unassigned scopes are forbidden for generation and hidden for runs', async () => {
      const open = fixture();
      const { id } = await newRun(open.deps);
      const closed: ScopeProvider = { ...testScopeProvider, isScopeAssigned: async () => false };
      const deps = { ...open.deps, scopes: closed };
      expect(await errorOf(await generate(deps))).toMatchObject({ code: 'SCOPE_NOT_ASSIGNED' });
      expect(await errorOf(await get(deps, `forecast-runs/${id}`))).toMatchObject({ code: 'RUN_NOT_FOUND' });
    });

    it('answers every response with no-store and rejects unsupported methods', async () => {
      const { deps } = fixture();
      const { id, created } = await newRun(deps);
      expect(created.headers.get('Cache-Control')).toBe('no-store');
      const read = await get(deps, 'forecast-runs/' + id);
      expect(read.headers.get('Cache-Control')).toBe('no-store');
      expect((await call(deps, 'forecast-runs/' + id, { method: 'DELETE' })).status).toBe(405);
      expect((await call(deps, 'forecast-runs', { method: 'PUT' })).status).toBe(405);
      expect((await get(deps, 'forecast-runs')).status).toBe(405);
    });

    it('no longer serves the review, decision, finalization, audit and list routes of the removed flow', async () => {
      const { deps } = fixture();
      const { id, revision } = await newRun(deps);
      for (const leaf of ['reviews', 'decisions', 'finalizations']) {
        expect(await handleForecastingRequest(new Request(`${BASE}forecast-runs/${id}/${leaf}`, { method: 'POST', headers: { 'content-type': 'application/json', 'If-Match': `"${revision}"` }, body: JSON.stringify({ scope }) }), deps)).toBeNull();
      }
      expect(await handleForecastingRequest(new Request(`${BASE}forecast-runs/${id}/audit`), deps)).toBeNull();
    });
  });

  describe('Normal/Short offering rule', () => {
    it('stores a Short-only subject as EXCLUDED with no demand, shows it separately, and keeps totals unchanged', async () => {
      const { deps, runs } = fixture({ shortOnly: true });
      const response = await generate(deps);
      expect(response.status).toBe(201);
      expect(runs[0]!.detail.subjects.find((s) => s.subjectId === S)).toMatchObject({ configurationStatus: 'EXCLUDED', forecastCount: null, eligibleCount: 0 });
      const run = await detailOf(deps, 1);
      expect(run.subjects.find((s) => s.subjectId === S)).toMatchObject({
        excluded: false, semesterTypeExcluded: true, semesterTypeExclusionReason: 'Runs only in Short semesters', forecastCount: null, sections: [], configurationStatus: 'EXCLUDED',
      });
      expect(run.subjects.find((s) => s.subjectId === X)).toMatchObject({ excluded: true, semesterTypeExcluded: false, semesterTypeExclusionReason: null });
      expect(run.summary).toMatchObject({ subjects: 5, excludedSubjects: 1, notOfferedInSemesterTypeSubjects: 1, totalSections: 4, totalSupportedDemand: 46 * 3 });
      expect(run.ruleSnapshot.semesterTypeExclusions).toEqual([{ subjectId: S, offeredIn: ['SHORT'], reason: 'Runs only in Short semesters' }]);
    });
  });

  describe('generation', () => {
    it('generates a DRAFT forecast from an accepted import and returns a receipt with the revision as ETag', async () => {
      const { deps, runs } = fixture();
      const response = await generate(deps);
      expect(response.status).toBe(201);
      const receipt = await readData<Record<string, unknown>>(response);
      expect(receipt).toMatchObject({ resourceId: 1, ...scope, revision: 'fr1.DRAFT.0' });
      expect(etag(response)).toBe('"fr1.DRAFT.0"');
      const stored = runs[0]!;
      expect(stored.record).toMatchObject({ status: 'DRAFT', versionNumber: 1, parentForecastRunId: null, generatedBy: COORDINATOR, importBatchId: 1, engineVersion: 'uc20-engine-1.1.0' });
      expect(stored.detail.subjects.map((s) => [s.subjectId, s.configurationStatus, s.eligibleCount])).toEqual([[A, 'CONFIGURED', 46], [B, 'CONFIGURED', 46], [C, 'CONFIGURATION_REQUIRED', 46], [X, 'EXCLUDED', 46]]);
      expect(stored.detail.sections.filter((s) => s.demandId === 1).map((s) => s.expectedStudents)).toEqual([23, 23]);
      expect(stored.detail.sections.every((s) => s.reviewStatus === 'PENDING')).toBe(true);
      const assumptions = (stored.detail.scenarioAssumptions.subjects as Record<string, { nearGraduationCount: number; breakdown: { supported: number }; uncertaintyReasonCounts: unknown[] }>)[String(A)]!;
      expect(assumptions.nearGraduationCount).toBe(46);
      expect(assumptions.breakdown.supported).toBe(46);
      expect(stored.detail.ruleSnapshot.capacityRules).toHaveLength(2);
      expect(stored.detail.originalRecommendations.map((entry) => entry.subjectId)).toEqual([A, B]);
    });

    it('replays the same import snapshot instead of creating another forecast', async () => {
      const { deps, runs } = fixture();
      const first = await generate(deps);
      const again = await generate(deps);
      expect(again.status).toBe(200);
      expect((await readData<{ resourceId: number }>(again)).resourceId).toBe((await readData<{ resourceId: number }>(first)).resourceId);
      expect(runs).toHaveLength(1);
    });

    it('creates the next version for a newer snapshot of the same scope, parented to the previous one', async () => {
      const { deps } = fixture();
      const first = await newRun(deps, 1);
      const second = await newRun(deps, 2);
      expect(await detailOf(deps, second.id)).toMatchObject({ versionNumber: 2, parentForecastRunId: first.id, newerForecastAvailable: null });
      expect(await detailOf(deps, first.id)).toMatchObject({ versionNumber: 1, newerForecastAvailable: null });
    });

    it('refuses imports that are not accepted, not in scope or unknown, and malformed requests', async () => {
      const { deps, runs } = fixture();
      for (const importBatchId of [3, 4, 99]) expect(await errorOf(await generate(deps, importBatchId))).toMatchObject({ code: 'IMPORT_NOT_FOUND' });
      const body = { ...scope, importBatchId: 1, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' };
      expect((await post(deps, 'forecast-runs', { ...body, demandAssumption: 'ALL' })).status).toBe(400);
      expect((await post(deps, 'forecast-runs', { ...body, extra: 1 })).status).toBe(400);
      expect((await post(deps, 'forecast-runs', { ...body, importBatchId: '1' })).status).toBe(400);
      expect((await post(deps, 'forecast-runs', body, { 'Idempotency-Key': 'x'.repeat(129) })).status).toBe(400);
      expect((await call(deps, 'forecast-runs', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415);
      expect(runs).toHaveLength(0);
    });
  });

  describe('reads', () => {
    it('returns subjects with demand, uncertainty, near graduation, configuration and sections', async () => {
      const { deps } = fixture();
      const { id } = await newRun(deps);
      const response = await get(deps, 'forecast-runs/' + id);
      expect(etag(response)).toBe('"fr1.DRAFT.0"');
      const run = await readData<ForecastRunDetail>(response);
      expect(run).toMatchObject({ forecastRunId: id, status: 'DRAFT', revision: 'fr1.DRAFT.0', demandAssumption: 'SUPPORTED_ELIGIBLE_POOL', audit: [], auditTruncated: false });
      expect(run.assumptionNote).toContain('Potential demand');
      const lecture = run.subjects.find((s) => s.subjectId === A)!;
      expect(lecture).toMatchObject({ supportedEligibleCount: 46, forecastCount: 46, uncertainStudentCount: 0, nearGraduationCount: 46, qualityStatus: 'SUPPORTED', configurationStatus: 'CONFIGURED', decisionStatus: 'PENDING', allocatedStudents: 46 });
      expect(lecture.sections.map((s) => [s.sectionNumber, s.expectedStudents, s.flags])).toEqual([[1, 23, ['BELOW_OPTIMAL']], [2, 23, ['BELOW_OPTIMAL']]]);
      expect(lecture.sections[0]).toMatchObject({ minimumEnrollment: 15, breakEvenTarget: 25, normalMaximum: 45, exceptionMaximum: 50, reviewStatus: 'PENDING' });
      expect(run.subjects.find((s) => s.subjectId === C)).toMatchObject({ configurationStatus: 'CONFIGURATION_REQUIRED', configurationIssue: 'CLASS_TYPE_MISSING', sections: [], decisionStatus: 'NONE' });
      expect(run.subjects.find((s) => s.subjectId === X)).toMatchObject({ excluded: true, forecastCount: null, configurationStatus: 'EXCLUDED', sections: [] });
      expect(run.summary).toMatchObject({ subjects: 4, excludedSubjects: 1, notOfferedInSemesterTypeSubjects: 0, configurationRequiredSubjects: 1, totalSections: 4, pendingSections: 4, sectionsBelowOptimal: 4, sectionsBelowMinimum: 0, pendingSubjects: 2, subjectsBelowMinimum: 0 });
      expect(run.ruleSnapshot.engineVersion).toBe('uc20-engine-1.1.0');
      expect(run.originalRecommendations).toHaveLength(2);
    });

    it('answers 404 for an unknown forecast', async () => {
      const { deps } = fixture();
      expect(await errorOf(await get(deps, 'forecast-runs/999'))).toMatchObject({ code: 'RUN_NOT_FOUND' });
    });
  });

  describe('database error mapping', () => {
    const run = (code: string, message: string) => mapForecastingDatabaseError({ code, message }, 'run');
    it('maps guard and constraint errors to stable codes without leaking text', () => {
      expect(run('22P02', 'invalid input syntax for type integer: "GUARD_RUN_EXISTSACCEPTED"').code).toBe('RUN_ALREADY_EXISTS');
      expect(run('23514', 'Forecast requires an ACCEPTED import snapshot').code).toBe('IMPORT_NOT_FOUND');
      expect(run('23514', 'something else').code).toBe('RUN_CONFLICT');
      expect(run('23505', 'duplicate key value violates unique constraint "forecast_run_programme_scope_version_key"').code).toBe('RUN_CONFLICT');
      expect(run('23503', 'Forecast missing').code).toBe('RUN_NOT_FOUND');
      const unknown = run('XX000', 'password=secret host=db.internal');
      expect(unknown.code).toBe('RUN_FAILED');
      expect(unknown.message).not.toContain('secret');
      expect(mapForecastingDatabaseError({ code: '23514', message: 'x' }).code).toBe('IMPORT_CONFLICT');
    });

    it('returns a mapped error response when the repository fails', async () => {
      const { deps } = fixture();
      deps.runs.createRun = vi.fn(async () => { throw mapForecastingDatabaseError({ code: '23505', message: 'duplicate key ... secret' }, 'run'); });
      const response = await generate(deps);
      expect(response.status).toBe(409);
      expect(JSON.stringify(await response.json())).not.toContain('secret');
      deps.runs.findByImportBatch = vi.fn(async () => { throw new Error('connection string postgres://user:pw@host'); });
      const failed = await generate(deps);
      expect(failed.status).toBe(503);
      expect(JSON.stringify(await failed.json())).not.toContain('postgres://');
    });
  });
});
