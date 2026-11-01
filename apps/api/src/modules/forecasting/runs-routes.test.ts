import { describe, expect, it, vi } from 'vitest';
import { interimScopeProvider, type ScopeProvider } from '../../config/interim-scope';
import type { EngineCapacityRule, EngineCurriculum, EngineStudent } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { ForecastRunDetail, ForecastRunSummary } from '../../../../../packages/shared/src/forecasting/runs';
import type { ForecastingDependencies, ForecastingRepository, ImportBatchRow } from './contracts';
import { ForecastingError, mapForecastingDatabaseError } from './errors';
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
    batch(5, 'ACCEPTED', { summary: { source: 'SYSTEM', internal: { schemaVersion: 1, csvVersion: 1, source: 'PORTAL', dataRows: 0, rejectedRowsByStudent: {} } } as never })];
  const fake = fakeRunsRepository({ ...inputs, curricula: [options.shortOnly ? withShortOnly : curriculum] });
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: options.actor ?? COORDINATOR, sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository: { getBatch: vi.fn(async (id: number) => batches.find((entry) => entry.importBatchId === id) ?? null) } as unknown as ForecastingRepository,
    runs: fake.repository,
    offerings: {} as ForecastingDependencies['offerings'],
    scopes: options.scopes ?? interimScopeProvider,
    now: () => new Date('2026-11-01T12:00:00.000Z'),
  };
  return { deps, ...fake };
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
const startReview = (deps: Deps, id: number, revision: string) =>
  post(deps, `forecast-runs/${id}/reviews`, { scope, action: 'START_REVIEW' }, { 'If-Match': `"${revision}"`, 'Idempotency-Key': 'review' });
const decide = (deps: Deps, id: number, revision: string, decisions: unknown[]) =>
  post(deps, `forecast-runs/${id}/decisions`, { scope, decisions }, { 'If-Match': `"${revision}"`, 'Idempotency-Key': 'decide' });
const finalize = (deps: Deps, id: number, revision: string, body: Record<string, unknown> = {}) =>
  post(deps, `forecast-runs/${id}/finalizations`, { scope, ...body }, { 'If-Match': `"${revision}"`, 'Idempotency-Key': 'finalize' });
const reviewing = async (deps: Deps) => {
  const run = await newRun(deps);
  const review = await startReview(deps, run.id, run.revision);
  return { id: run.id, revision: (await readData<{ revision: string }>(review)).revision };
};
const approveAll = (extra: Array<Record<string, unknown>> = []) => [
  { subjectId: A, action: 'APPROVE', reason: 'Within capacity.' }, { subjectId: B, action: 'REVIEW', reason: 'Lab checked.' }, ...extra,
];

describe('UC20 forecast run API', () => {
  it('reports the data source of the import in the run detail (student-entered records for system snapshots)', async () => {
    const { deps } = fixture();
    const fromCsv = await newRun(deps, 1), fromSystem = await newRun(deps, 5);
    expect(fromSystem.created.status).toBe(201);
    expect((await detailOf(deps, fromCsv.id)).dataSource).toBe('CSV');
    expect((await detailOf(deps, fromSystem.id)).dataSource).toBe('SYSTEM');
  });

  describe('access', () => {
    it('is coordinator only', async () => {
      const { deps } = fixture({ roles: ['STUDENT'] });
      expect((await get(deps, 'forecast-runs?programmeId=5&learningCentreId=1&targetSemesterId=2')).status).toBe(403);
      expect((await generate(deps)).status).toBe(403);
      expect(fixture({ roles: ['SYSTEM_ADMIN'] }).deps.auth.access.find).toBeDefined();
      expect((await generate(fixture({ roles: ['SYSTEM_ADMIN'] }).deps)).status).toBe(403);
    });

    it('uses the scope provider: unassigned scopes are forbidden for lists and generation and hidden for runs', async () => {
      const open = fixture();
      const { id } = await newRun(open.deps);
      const closed: ScopeProvider = { ...interimScopeProvider, isScopeAssigned: async () => false };
      const deps = { ...open.deps, scopes: closed };
      expect(await errorOf(await get(deps, 'forecast-runs?programmeId=5&learningCentreId=1&targetSemesterId=2'))).toMatchObject({ code: 'SCOPE_NOT_ASSIGNED' });
      expect(await errorOf(await generate(deps))).toMatchObject({ code: 'SCOPE_NOT_ASSIGNED' });
      for (const path of [`forecast-runs/${id}`, `forecast-runs/${id}/audit`]) expect(await errorOf(await get(deps, path))).toMatchObject({ code: 'RUN_NOT_FOUND' });
      expect((await startReview(deps, id, 'whatever')).status).toBe(404);
    });

    it('answers every response with no-store and rejects unsupported methods', async () => {
      const { deps } = fixture();
      const { id, created } = await newRun(deps);
      expect(created.headers.get('Cache-Control')).toBe('no-store');
      const read = await get(deps, 'forecast-runs/' + id);
      expect(read.headers.get('Cache-Control')).toBe('no-store');
      expect((await call(deps, 'forecast-runs/' + id, { method: 'DELETE' })).status).toBe(405);
      expect((await call(deps, `forecast-runs/${id}/decisions`, { method: 'GET' })).status).toBe(405);
      expect((await call(deps, 'forecast-runs', { method: 'PUT' })).status).toBe(405);
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

    it('creates the next version for a newer snapshot of the same scope, parented to the previous one, and flags the older as superseded by a newer forecast', async () => {
      const { deps } = fixture();
      const first = await newRun(deps, 1);
      const second = await newRun(deps, 2);
      const v2 = await detailOf(deps, second.id);
      expect(v2).toMatchObject({ versionNumber: 2, parentForecastRunId: first.id, newerForecastAvailable: null });
      expect((await detailOf(deps, first.id)).newerForecastAvailable).toEqual({ forecastRunId: second.id, versionNumber: 2, status: 'DRAFT' });
      const list = await readData<{ items: ForecastRunSummary[] }>(await get(deps, 'forecast-runs?programmeId=5&learningCentreId=1&targetSemesterId=2'));
      expect(list.items.map((item) => [item.versionNumber, item.newerForecastAvailable?.versionNumber ?? null])).toEqual([[2, null], [1, 2]]);
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
    it('returns subjects with demand, uncertainty, near graduation, configuration, sections, flags and audit history', async () => {
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
      expect(run.summary).toMatchObject({ subjects: 4, excludedSubjects: 1, notOfferedInSemesterTypeSubjects: 0, configurationRequiredSubjects: 1, totalSections: 4, pendingSections: 4, sectionsBelowOptimal: 4, sectionsBelowMinimum: 0 });
      expect(run.ruleSnapshot.engineVersion).toBe('uc20-engine-1.1.0');
      expect(run.originalRecommendations).toHaveLength(2);
    });

    it('lists runs per scope with a summary and pages with a cursor', async () => {
      const { deps } = fixture();
      await newRun(deps, 1); await newRun(deps, 2);
      const first = await readData<{ items: ForecastRunSummary[]; nextCursor?: string }>(await get(deps, 'forecast-runs?programmeId=5&learningCentreId=1&targetSemesterId=2&limit=1'));
      expect(first.items).toHaveLength(1);
      expect(first.items[0]).toMatchObject({ versionNumber: 2, status: 'DRAFT', summary: { pendingSections: 4 } });
      const next = await readData<{ items: ForecastRunSummary[]; nextCursor?: string }>(await get(deps, `forecast-runs?programmeId=5&learningCentreId=1&targetSemesterId=2&limit=1&cursor=${first.nextCursor}`));
      expect(next.items.map((item) => item.versionNumber)).toEqual([1]);
      expect(next.nextCursor).toBeUndefined();
      expect((await get(deps, 'forecast-runs?programmeId=5&learningCentreId=1')).status).toBe(400);
      expect((await get(deps, 'forecast-runs?programmeId=5&learningCentreId=1&targetSemesterId=2&limit=101')).status).toBe(400);
      expect((await get(deps, 'forecast-runs?programmeId=5&learningCentreId=1&targetSemesterId=2&extra=1')).status).toBe(400);
      expect(await errorOf(await get(deps, 'forecast-runs/999'))).toMatchObject({ code: 'RUN_NOT_FOUND' });
    });
  });

  describe('review lifecycle', () => {
    it('starts review once: DRAFT to UNDER_REVIEW, with If-Match required and stale revisions refused', async () => {
      const { deps } = fixture();
      const { id, revision } = await newRun(deps);
      const body = { scope, action: 'START_REVIEW' };
      expect(await errorOf(await post(deps, `forecast-runs/${id}/reviews`, body, {}))).toMatchObject({ code: 'IF_MATCH_REQUIRED' });
      expect(await errorOf(await startReview(deps, id, 'fr1.DRAFT.9'))).toMatchObject({ code: 'RUN_REVISION_MISMATCH' });
      expect((await startReview(deps, id, 'fr1.DRAFT.9')).status).toBe(412);
      expect((await post(deps, `forecast-runs/${id}/reviews`, { scope, action: 'NOPE' }, { 'If-Match': `"${revision}"` })).status).toBe(400);
      expect((await post(deps, `forecast-runs/${id}/reviews`, { scope: { ...scope, learningCentreId: 2 }, action: 'START_REVIEW' }, { 'If-Match': `"${revision}"` })).status).toBe(404);
      const started = await startReview(deps, id, revision);
      expect(started.status).toBe(200);
      expect(etag(started)).toBe('"fr1.UNDER_REVIEW.1"');
      expect((await detailOf(deps, id)).status).toBe('UNDER_REVIEW');
      expect(await errorOf(await startReview(deps, id, 'fr1.UNDER_REVIEW.1'))).toMatchObject({ code: 'RUN_STATE_CONFLICT' });
      const start = (await detailOf(deps, id)).audit.at(-1)!;
      expect(start).toMatchObject({ actionType: 'START_REVIEW', subjectId: null, recordedBy: COORDINATOR, reason: 'Review started.', before: { status: 'DRAFT' }, after: { status: 'UNDER_REVIEW' } });
    });
  });

  describe('decisions', () => {
    it('records REVIEW, APPROVE and DEFER with before/after audit entries and moves the revision', async () => {
      const { deps } = fixture();
      const { id, revision } = await reviewing(deps);
      const response = await decide(deps, id, revision, [
        { subjectId: A, action: 'APPROVE', reason: 'Within normal capacity.', approvalReference: 'FAC/2026/11' },
        { subjectId: B, action: 'DEFER', reason: 'Wait for the lab booking.' },
      ]);
      expect(response.status).toBe(200);
      expect(etag(response)).toBe('"fr1.UNDER_REVIEW.3"');
      const run = await detailOf(deps, id);
      expect(run.subjects.find((s) => s.subjectId === A)).toMatchObject({ decisionStatus: 'APPROVED' });
      expect(run.subjects.find((s) => s.subjectId === B)).toMatchObject({ decisionStatus: 'DEFERRED' });
      expect(run.subjects.find((s) => s.subjectId === A)!.sections[0]).toMatchObject({ reviewStatus: 'APPROVED', reviewedBy: COORDINATOR });
      expect(run.summary.pendingSections).toBe(0);
      const approve = run.audit.find((entry) => entry.subjectId === A)!;
      expect(approve).toMatchObject({ actionType: 'APPROVE', recordedBy: COORDINATOR, reason: 'Within normal capacity.', approvalReference: 'FAC/2026/11' });
      expect(approve.before).toMatchObject({ sections: [{ reviewStatus: 'PENDING' }, { reviewStatus: 'PENDING' }] });
      expect(approve.after).toMatchObject({ sections: [{ reviewStatus: 'APPROVED' }, { reviewStatus: 'APPROVED' }] });
      const page = await readData<{ items: Array<{ actionType: string }> }>(await get(deps, `forecast-runs/${id}/audit?limit=1`));
      expect(page.items).toHaveLength(1);
    });

    it('refuses a stale revision with 412 and applies nothing', async () => {
      const { deps, runs } = fixture();
      const { id, revision } = await reviewing(deps);
      await decide(deps, id, revision, [{ subjectId: A, action: 'REVIEW', reason: 'First reviewer.' }]);
      const stale = await decide(deps, id, revision, [{ subjectId: B, action: 'APPROVE', reason: 'Second reviewer.' }]);
      expect(stale.status).toBe(412);
      expect(await errorOf(stale)).toMatchObject({ code: 'RUN_REVISION_MISMATCH' });
      expect(runs[0]!.audit).toHaveLength(2);
      expect(runs[0]!.detail.sections.filter((s) => s.demandId === 2).every((s) => s.reviewStatus === 'PENDING')).toBe(true);
    });

    it('maps a concurrent change caught by the repository guard to 412', async () => {
      const { deps } = fixture();
      const { id, revision } = await reviewing(deps);
      deps.runs.applyDecisions = vi.fn(async () => { throw new ForecastingError('RUN_REVISION_MISMATCH'); });
      expect((await decide(deps, id, revision, [{ subjectId: A, action: 'REVIEW', reason: 'Racing.' }])).status).toBe(412);
    });

    it('validates decisions strictly and atomically', async () => {
      const { deps, runs } = fixture();
      const { id, revision } = await reviewing(deps);
      const reasonless = await decide(deps, id, revision, [{ subjectId: A, action: 'APPROVE', reason: '  ' }]);
      expect(reasonless.status).toBe(422);
      expect(await errorOf(reasonless)).toMatchObject({ code: 'DECISION_REASON_REQUIRED' });
      expect(await errorOf(await decide(deps, id, revision, [{ subjectId: A, action: 'APPROVE' }]))).toMatchObject({ code: 'DECISION_REASON_REQUIRED' });
      expect(await errorOf(await decide(deps, id, revision, [{ subjectId: A, action: 'APPROVE', reason: 'x'.repeat(501) }]))).toMatchObject({ code: 'DECISION_REASON_REQUIRED' });
      expect(await errorOf(await decide(deps, id, revision, [{ subjectId: 999, action: 'APPROVE', reason: 'ok' }]))).toMatchObject({ code: 'DECISION_SUBJECT_NOT_FOUND' });
      expect(await errorOf(await decide(deps, id, revision, [{ subjectId: A, action: 'APPROVE', reason: 'ok' }, { subjectId: A, action: 'DEFER', reason: 'ok' }]))).toMatchObject({ code: 'DECISION_DUPLICATE_SUBJECT' });
      for (const excluded of [C, X]) expect(await errorOf(await decide(deps, id, revision, [{ subjectId: excluded, action: 'APPROVE', reason: 'ok' }]))).toMatchObject({ code: 'DECISION_NO_SECTIONS' });
      // a valid decision followed by an invalid one rejects the whole batch
      expect(await errorOf(await decide(deps, id, revision, [{ subjectId: A, action: 'APPROVE', reason: 'ok' }, { subjectId: 999, action: 'APPROVE', reason: 'ok' }]))).toMatchObject({ code: 'DECISION_SUBJECT_NOT_FOUND' });
      expect(runs[0]!.audit.map((entry) => entry.actionType)).toEqual(['START_REVIEW']);
      expect((await decide(deps, id, revision, [])).status).toBe(400);
      expect((await decide(deps, id, revision, [{ subjectId: A, action: 'CANCEL', reason: 'ok' }])).status).toBe(400);
      expect((await decide(deps, id, revision, [{ subjectId: A, action: 'APPROVE', reason: 'ok', replacementSections: [] }])).status).toBe(400);
      expect((await decide(deps, id, revision, [{ subjectId: A, action: 'APPROVE', reason: 'ok', note: 'x' }])).status).toBe(400);
    });

    it('allows decisions in DRAFT and requires the scope in the body to match the run', async () => {
      const { deps } = fixture();
      const { id, revision } = await newRun(deps);
      expect((await decide(deps, id, revision, [{ subjectId: A, action: 'REVIEW', reason: 'Early look.' }])).status).toBe(200);
      const mismatch = await post(deps, `forecast-runs/${id}/decisions`, { scope: { ...scope, programmeId: 7 }, decisions: [{ subjectId: A, action: 'REVIEW', reason: 'ok' }] }, { 'If-Match': '"fr1.DRAFT.1"' });
      expect(mismatch.status).toBe(404);
    });

    describe('REPLACE_ALLOCATION', () => {
      const replace = (sections: unknown[], extra: Record<string, unknown> = {}, subjectId = A) => ({ subjectId, action: 'REPLACE_ALLOCATION', reason: 'Resize for the timetable.', replacementSections: sections, ...extra });

      it('redistributes the demand into a different number of sections, retiring omitted ones and keeping the demand total', async () => {
        const { deps, runs } = fixture();
        const { id, revision } = await reviewing(deps);
        const [first] = runs[0]!.detail.sections;
        const response = await decide(deps, id, revision, [replace([
          { proposedSectionId: first!.proposedSectionId, sectionNumber: 1, expectedStudents: 16 },
          { sectionNumber: 2, expectedStudents: 15 },
          { sectionNumber: 3, expectedStudents: 15 },
        ])]);
        expect(response.status).toBe(200);
        const lecture = (await detailOf(deps, id)).subjects.find((s) => s.subjectId === A)!;
        expect(lecture.sections.map((s) => [s.sectionNumber, s.expectedStudents, s.reviewStatus])).toEqual([[1, 16, 'REVIEWED'], [2, 15, 'REVIEWED'], [3, 15, 'REVIEWED']]);
        expect(lecture.sections[0]!.proposedSectionId).toBe(first!.proposedSectionId);
        expect(lecture).toMatchObject({ forecastCount: 46, allocatedStudents: 46 });
        expect(lecture.sections.every((s) => s.flags.includes('BELOW_OPTIMAL') && !s.flags.includes('BELOW_MINIMUM'))).toBe(true);
        const audit = (await detailOf(deps, id)).audit[0]!;
        expect(audit.actionType).toBe('REPLACE_ALLOCATION');
        expect(audit.before).toMatchObject({ sections: [{ expectedStudents: 23 }, { expectedStudents: 23 }] });
        expect(audit.after).toMatchObject({ sections: [{ expectedStudents: 16 }, { expectedStudents: 15 }, { expectedStudents: 15 }] });
        // the engine's original recommendation is untouched
        expect((await detailOf(deps, id)).originalRecommendations.find((entry) => entry.subjectId === A)!.sections.map((s) => s.expectedStudents)).toEqual([23, 23]);
      });

      it('keeps the section justification above the normal maximum and stores the exception, never above the exception maximum', async () => {
        const { deps } = fixture();
        const { id, revision } = await reviewing(deps);
        const exception = await decide(deps, id, revision, [replace([{ sectionNumber: 1, expectedStudents: 46, justification: 'Lecture hall seats 50.' }])]);
        expect(exception.status).toBe(200);
        const section = (await detailOf(deps, id)).subjects.find((s) => s.subjectId === A)!.sections[0]!;
        expect(section).toMatchObject({ expectedStudents: 46, justification: 'Lecture hall seats 50.', exceptionMaximum: 50 });
        expect(section.flags).toEqual(['ABOVE_NORMAL_MAXIMUM']);
      });

      it('rejects allocations that change the total, exceed capacity, are malformed or target unconfigured subjects', async () => {
        const { deps, runs } = fixture();
        const { id, revision } = await reviewing(deps);
        const code = async (decision: unknown) => (await errorOf(await decide(deps, id, revision, [decision]))).code;
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 20 }, { sectionNumber: 2, expectedStudents: 20 }]))).toBe('ALLOCATION_TOTAL_MISMATCH');
        expect(await code(replace([]))).toBe('ALLOCATION_TOTAL_MISMATCH');
        // LAB: normal maximum 35, no exception maximum configured
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 46 }], {}, B))).toBe('ALLOCATION_EXCEEDS_CAPACITY');
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 51 }, { sectionNumber: 2, expectedStudents: -5 }]))).toBe('INVALID_REQUEST');
        expect(await code(replace([{ sectionNumber: 2, expectedStudents: 23 }, { sectionNumber: 3, expectedStudents: 23 }]))).toBe('ALLOCATION_INVALID');
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 23 }, { sectionNumber: 1, expectedStudents: 23 }]))).toBe('ALLOCATION_INVALID');
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 46 }, { sectionNumber: 2, expectedStudents: 0 }]))).toBe('ALLOCATION_INVALID');
        expect(await code(replace([{ proposedSectionId: 9999, sectionNumber: 1, expectedStudents: 46 }]))).toBe('ALLOCATION_INVALID');
        const own = runs[0]!.detail.sections[0]!.proposedSectionId;
        expect(await code(replace([{ proposedSectionId: own, sectionNumber: 1, expectedStudents: 23 }, { proposedSectionId: own, sectionNumber: 2, expectedStudents: 23 }]))).toBe('ALLOCATION_INVALID');
        // a section id that belongs to another subject
        const foreign = runs[0]!.detail.sections.find((s) => s.demandId === 2)!.proposedSectionId;
        expect(await code(replace([{ proposedSectionId: foreign, sectionNumber: 1, expectedStudents: 46 }]))).toBe('ALLOCATION_INVALID');
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 46 }], {}, C))).toBe('SUBJECT_NOT_CONFIGURED');
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 46 }], {}, X))).toBe('SUBJECT_NOT_CONFIGURED');
        expect(await code(replace([{ sectionNumber: 1, expectedStudents: 46 }], { reason: '' }))).toBe('DECISION_REASON_REQUIRED');
        expect(runs[0]!.audit.map((entry) => entry.actionType)).toEqual(['START_REVIEW']);
      });
    });
  });

  describe('finalization', () => {
    it('refuses to finalize a DRAFT, and while sections are still pending', async () => {
      const { deps } = fixture();
      const draft = await newRun(deps);
      expect(await errorOf(await finalize(deps, draft.id, draft.revision))).toMatchObject({ code: 'RUN_STATE_CONFLICT' });
      const started = await startReview(deps, draft.id, draft.revision);
      const current = (await readData<{ revision: string }>(started)).revision;
      const pending = await finalize(deps, draft.id, current);
      expect(pending.status).toBe(422);
      expect(await errorOf(pending)).toMatchObject({ code: 'REVIEWS_INCOMPLETE', details: { pendingSubjectIds: [A, B] } });
      const partial = await decide(deps, draft.id, current, [{ subjectId: A, action: 'APPROVE', reason: 'ok' }]);
      const afterPartial = (await readData<{ revision: string }>(partial)).revision;
      expect(await errorOf(await finalize(deps, draft.id, afterPartial))).toMatchObject({ code: 'REVIEWS_INCOMPLETE', details: { pendingSubjectIds: [B] } });
    });

    it('finalizes an UNDER_REVIEW forecast with a FINALIZE audit entry and then refuses every change', async () => {
      const { deps, runs } = fixture();
      const { id, revision } = await reviewing(deps);
      const decided = await decide(deps, id, revision, approveAll());
      const current = (await readData<{ revision: string }>(decided)).revision;
      expect(current).toBe('fr1.UNDER_REVIEW.3');
      expect(await errorOf(await finalize(deps, id, 'fr1.UNDER_REVIEW.0'))).toMatchObject({ code: 'RUN_REVISION_MISMATCH' });
      const done = await finalize(deps, id, current, { reason: 'Faculty board approved.', approvalReference: 'BOARD/2026/7' });
      expect(done.status).toBe(200);
      expect(etag(done)).toBe('"fr1.FINALIZED.4"');
      const run = await detailOf(deps, id);
      expect(run).toMatchObject({ status: 'FINALIZED', finalizedBy: COORDINATOR, finalizedAt: '2026-11-01T10:00:00.000Z' });
      expect(run.audit[0]).toMatchObject({ actionType: 'FINALIZE', subjectId: null, recordedBy: COORDINATOR, reason: 'Faculty board approved.', approvalReference: 'BOARD/2026/7' });
      expect(run.audit[0]!.before).toEqual({ status: 'UNDER_REVIEW' });
      expect(runs[0]!.record.status).toBe('FINALIZED');
      const final = 'fr1.FINALIZED.4';
      expect(await errorOf(await decide(deps, id, final, [{ subjectId: A, action: 'REVIEW', reason: 'late' }]))).toMatchObject({ code: 'RUN_FINALIZED' });
      expect(await errorOf(await startReview(deps, id, final))).toMatchObject({ code: 'RUN_FINALIZED' });
      expect(await errorOf(await finalize(deps, id, final))).toMatchObject({ code: 'RUN_FINALIZED' });
      expect((await decide(deps, id, final, [{ subjectId: A, action: 'REVIEW', reason: 'late' }])).status).toBe(409);
      expect(runs[0]!.audit).toHaveLength(4);
    });

    it('uses a default reason when none is given and validates optional text', async () => {
      const { deps, runs } = fixture();
      const { id, revision } = await reviewing(deps);
      const current = (await readData<{ revision: string }>(await decide(deps, id, revision, approveAll()))).revision;
      expect((await finalize(deps, id, current, { reason: 'x'.repeat(501) })).status).toBe(400);
      expect((await finalize(deps, id, current, { unknown: true })).status).toBe(400);
      expect((await finalize(deps, id, current)).status).toBe(200);
      expect(runs[0]!.audit.at(-1)!.reason).toBe('Forecast finalized.');
    });
  });

  describe('database error mapping', () => {
    const run = (code: string, message: string) => mapForecastingDatabaseError({ code, message }, 'run');
    it('maps guard, frozen-run and constraint errors to stable codes without leaking text', () => {
      expect(run('22P02', 'invalid input syntax for type integer: "GUARD_REVISION_MISMATCHDRAFT"').code).toBe('RUN_REVISION_MISMATCH');
      expect(run('22P02', 'invalid input syntax for type integer: "GUARD_RUN_EXISTSACCEPTED"').code).toBe('RUN_ALREADY_EXISTS');
      expect(run('23514', 'Finalized forecast results and decisions are read-only').code).toBe('RUN_FINALIZED');
      expect(run('23514', 'Forecast requires an ACCEPTED import snapshot').code).toBe('IMPORT_NOT_FOUND');
      expect(run('23514', 'Expected enrollment exceeds configured capacity').code).toBe('ALLOCATION_EXCEEDS_CAPACITY');
      expect(run('23514', 'Capacity exception requires justification').code).toBe('ALLOCATION_JUSTIFICATION_REQUIRED');
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
