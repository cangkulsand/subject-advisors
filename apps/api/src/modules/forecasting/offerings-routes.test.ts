import { describe, expect, it, vi } from 'vitest';
import { interimScopeProvider, type ScopeProvider } from '../../config/interim-scope';
import type { EngineCapacityRule, EngineCurriculum, EngineStudent } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { ConfirmedOfferingAuditEntry, ConfirmedOfferingSet, OfferingPickCountSummary } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import type { ForecastingDependencies, ForecastingRepository, ImportBatchRow } from './contracts';
import { handleForecastingRequest } from './routes';
import { fakeOfferingsRepository } from './offerings-testing';
import type { EngineInputRows } from './runs-contracts';
import { fakeRunsRepository } from './runs-testing';

const COORDINATOR = 'user_coord';
const BASE = 'https://test.invalid/api/coordinator/';
const scope = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
const QUERY = 'programmeId=5&learningCentreId=1&targetSemesterId=2';
const A = 101; const B = 102; const C = 103; const X = 104; const S = 105;
const FUTURE = '2026-11-20T04:00:00.000Z';
const LATER = '2026-11-25T04:00:00.000Z';

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
const semesters = [
  { semesterId: 1, academicYear: '2026/2027', semesterNumber: 1 as const }, { semesterId: 2, academicYear: '2026/2027', semesterNumber: 2 as const },
  { semesterId: 3, academicYear: '2026/2027', semesterNumber: 3 as const },
];
const batch = (importBatchId: number, overrides: Partial<ImportBatchRow> = {}): ImportBatchRow => ({
  importBatchId, ...scope, status: 'ACCEPTED', sourceDate: '2026-10-30', sourceLabel: 'Registry export', providedBy: COORDINATOR, sourceFingerprint: 'f'.repeat(64),
  acceptedAt: '2026-11-01T09:00:00.000Z', acceptedBy: COORDINATOR, summary: { internal: { schemaVersion: 1, csvVersion: 1, dataRows: 46, rejectedRowsByStudent: {} } } as never, ...overrides,
});

function fixture(options: { shortOnly?: boolean; roles?: ('STUDENT' | 'COORDINATOR' | 'SYSTEM_ADMIN')[]; scopes?: ScopeProvider } = {}) {
  const roles = options.roles ?? ['COORDINATOR'];
  const batches = [batch(1), batch(2), batch(3, { learningCentreId: 2 })];
  const catalogue = options.shortOnly ? withShortOnly : curriculum;
  const fakeRuns = fakeRunsRepository({ ...inputs, curricula: [catalogue] });
  const subjects = new Map(catalogue.subjects.map((s) => [s.subjectId, { subjectCode: s.subjectCode, subjectName: s.subjectName, creditHours: s.creditHours, classType: s.classType }]));
  const fakeOfferings = fakeOfferingsRepository(subjects);
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: COORDINATOR, sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository: { getBatch: vi.fn(async (id: number) => batches.find((entry) => entry.importBatchId === id) ?? null), semesters: vi.fn(async () => semesters) } as unknown as ForecastingRepository,
    runs: fakeRuns.repository,
    offerings: fakeOfferings.repository,
    scopes: options.scopes ?? interimScopeProvider,
    now: () => new Date('2026-11-01T12:00:00.000Z'),
  };
  return { deps, fakeRuns, fakeOfferings };
}
type Deps = ForecastingDependencies;

const call = (deps: Deps, path: string, init?: RequestInit) => handleForecastingRequest(new Request(BASE + path, init), deps) as Promise<Response>;
const get = (deps: Deps, path: string) => call(deps, path);
const post = (deps: Deps, path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(deps, path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const readData = async <T>(response: Response) => (await response.json() as { data: T }).data;
const errorOf = async (response: Response) => (await response.json() as { error: { code: string; details?: Record<string, unknown> } }).error;

/** A FINALIZED run through the real run routes. */
async function finalizedRun(deps: Deps, importBatchId = 1, runScope = scope) {
  const created = await post(deps, 'forecast-runs', { ...runScope, importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' }, { 'Idempotency-Key': 'g' + importBatchId });
  const { resourceId: id, revision: r0 } = await readData<{ resourceId: number; revision: string }>(created);
  const reviewed = await readData<{ revision: string }>(await post(deps, `forecast-runs/${id}/reviews`, { scope: runScope, action: 'START_REVIEW' }, { 'If-Match': `"${r0}"` }));
  const decided = await readData<{ revision: string }>(await post(deps, `forecast-runs/${id}/decisions`, {
    scope: runScope, decisions: [{ subjectId: A, action: 'APPROVE', reason: 'ok' }, { subjectId: B, action: 'REVIEW', reason: 'ok' }],
  }, { 'If-Match': `"${reviewed.revision}"` }));
  const done = await post(deps, `forecast-runs/${id}/finalizations`, { scope: runScope }, { 'If-Match': `"${decided.revision}"` });
  expect(done.status).toBe(200);
  return id;
}
const draftRun = async (deps: Deps, importBatchId = 2) => (await readData<{ resourceId: number }>(await post(deps, 'forecast-runs', { ...scope, importBatchId, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' }))).resourceId;

const confirmBody = (forecastRunId: number, overrides: Record<string, unknown> = {}) =>
  ({ scope, forecastRunId, subjectIds: [A, B], reason: 'Offered next semester.', baseRevision: null, pickDeadline: FUTURE, ...overrides });
const confirm = (deps: Deps, body: unknown, ifMatch?: string) => post(deps, 'confirmed-offerings', body, ifMatch ? { 'If-Match': `"${ifMatch}"` } : {});
const read = async (deps: Deps) => readData<ConfirmedOfferingSet>(await get(deps, 'confirmed-offerings?' + QUERY));
const withdraw = (deps: Deps, revision: string, subjectIds: number[], reason = 'Not enough demand.', body: Record<string, unknown> = {}) =>
  post(deps, 'confirmed-offerings/withdrawals', { scope, subjectIds, reason, baseRevision: revision, ...body }, { 'If-Match': `"${revision}"` });
const setDeadline = (deps: Deps, revision: string, body: Record<string, unknown> = {}, ifMatch = revision) =>
  post(deps, 'confirmed-offerings/pick-deadline', { scope, pickDeadline: LATER, reason: 'Registry asked for more time.', baseRevision: revision, ...body }, { 'If-Match': `"${ifMatch}"` });
async function confirmed(deps: Deps) {
  const run = await finalizedRun(deps);
  const created = await confirm(deps, confirmBody(run));
  expect(created.status).toBe(201);
  return { run, revision: (await readData<{ revision: string }>(created)).revision };
}

describe('coordinator offering confirmation API', () => {
  describe('access', () => {
    it('is coordinator only and respects the scope provider', async () => {
      expect((await get(fixture({ roles: ['STUDENT'] }).deps, 'confirmed-offerings?' + QUERY)).status).toBe(403);
      expect((await get(fixture({ roles: ['SYSTEM_ADMIN'] }).deps, 'offering-pick-counts?' + QUERY)).status).toBe(403);
      const closed: ScopeProvider = { ...interimScopeProvider, isScopeAssigned: async () => false };
      const { deps } = fixture({ scopes: closed });
      for (const path of ['confirmed-offerings?' + QUERY, 'confirmed-offerings/audit?' + QUERY, 'offering-pick-counts?' + QUERY]) {
        expect(await errorOf(await get(deps, path))).toMatchObject({ code: 'SCOPE_NOT_ASSIGNED' });
      }
      expect(await errorOf(await confirm(deps, confirmBody(1)))).toMatchObject({ code: 'SCOPE_NOT_ASSIGNED' });
      expect(await errorOf(await withdraw(deps, 'oc1.1', [A]))).toMatchObject({ code: 'SCOPE_NOT_ASSIGNED' });
      expect(await errorOf(await setDeadline(deps, 'oc1.1'))).toMatchObject({ code: 'SCOPE_NOT_ASSIGNED' });
    });

    it('answers no-store and rejects unsupported methods', async () => {
      const { deps } = fixture();
      const response = await get(deps, 'confirmed-offerings?' + QUERY);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect((await call(deps, 'confirmed-offerings', { method: 'DELETE' })).status).toBe(405);
      expect((await call(deps, 'confirmed-offerings/withdrawals')).status).toBe(405);
      expect((await call(deps, 'confirmed-offerings/audit', { method: 'POST' })).status).toBe(405);
      expect((await call(deps, 'offering-pick-counts', { method: 'POST' })).status).toBe(405);
      expect((await get(deps, 'confirmed-offerings?' + QUERY + '&extra=1')).status).toBe(400);
    });
  });

  describe('reading', () => {
    it('returns an empty set before the first confirmation', async () => {
      const { deps } = fixture();
      expect(await read(deps)).toMatchObject({ scope, pickDeadline: null, revision: null, forecastRunId: null, pickWindow: null, offerings: [] });
    });
  });

  describe('confirming', () => {
    it('creates the header and subjects from a FINALIZED run, with an ETag and the provenance run', async () => {
      const { deps, fakeOfferings } = fixture();
      const run = await finalizedRun(deps);
      const created = await confirm(deps, confirmBody(run));
      expect(created.status).toBe(201);
      const receipt = await readData<{ resourceId: number; revision: string; programmeId: number }>(created);
      expect(receipt).toMatchObject({ resourceId: 1, programmeId: 5, revision: 'oc1.3' });
      expect(created.headers.get('ETag')).toBe('"oc1.3"');
      const set = await read(deps);
      expect(set).toMatchObject({ pickDeadline: FUTURE, revision: 'oc1.3', forecastRunId: run, pickWindow: 'OPEN', createdBy: COORDINATOR, newerForecastAvailable: null });
      expect(set.offerings.map((o) => [o.subjectCode, o.status, o.classType, o.forecastRunId, o.reason])).toEqual([
        ['LAB102', 'CONFIRMED', 'LAB', run, 'Offered next semester.'], ['LEC101', 'CONFIRMED', 'LECTURE', run, 'Offered next semester.'],
      ]);
      expect(fakeOfferings.audit.map((entry) => entry.action)).toEqual(['SET_DEADLINE', 'CONFIRM', 'CONFIRM']);
    });

    it('rejects a run that is not FINALIZED or belongs to another scope', async () => {
      const { deps } = fixture();
      const draft = await draftRun(deps);
      expect(await errorOf(await confirm(deps, confirmBody(draft)))).toMatchObject({ code: 'RUN_NOT_FINALIZED' });
      const otherScope = { ...scope, learningCentreId: 2 };
      const other = await finalizedRun(deps, 3, otherScope);
      expect(await errorOf(await confirm(deps, confirmBody(other)))).toMatchObject({ code: 'RUN_SCOPE_MISMATCH' });
      expect(await errorOf(await confirm(deps, confirmBody(999)))).toMatchObject({ code: 'RUN_NOT_FOUND' });
      expect((await read(deps)).revision).toBeNull();
    });

    it('rejects a subject that does not run in the semester type with a stable code, ahead of other rejections', async () => {
      const { deps } = fixture({ shortOnly: true });
      const run = await finalizedRun(deps);
      const detail = await deps.runs.getDetail(run);
      expect(detail!.subjects.find((s) => s.subjectId === S)).toMatchObject({ configurationStatus: 'EXCLUDED', forecastCount: null });
      const rejected = await confirm(deps, confirmBody(run, { subjectIds: [A, S, X] }));
      expect(rejected.status).toBe(422);
      expect(await errorOf(rejected)).toMatchObject({ code: 'SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE', details: { subjectIds: [S] } });
      expect((await read(deps)).offerings).toEqual([]);
      expect((await confirm(deps, confirmBody(run, { subjectIds: [A] }))).status).toBe(201);
    });

    it('rejects excluded subjects and subjects outside the run, naming them', async () => {
      const { deps } = fixture();
      const run = await finalizedRun(deps);
      const excluded = await confirm(deps, confirmBody(run, { subjectIds: [A, X] }));
      expect(excluded.status).toBe(422);
      expect(await errorOf(excluded)).toMatchObject({ code: 'SUBJECT_EXCLUDED', details: { subjectIds: [X] } });
      expect(await errorOf(await confirm(deps, confirmBody(run, { subjectIds: [A, 999] })))).toMatchObject({ code: 'SUBJECT_NOT_IN_RUN', details: { subjectIds: [999] } });
      expect((await read(deps)).offerings).toEqual([]);
    });

    it('validates the deadline, reason, target semester and body shape', async () => {
      const { deps } = fixture();
      const run = await finalizedRun(deps);
      expect(await errorOf(await confirm(deps, confirmBody(run, { pickDeadline: '2026-11-01T11:00:00.000Z' })))).toMatchObject({ code: 'PICK_DEADLINE_INVALID' });
      expect(await errorOf(await confirm(deps, confirmBody(run, { pickDeadline: 'soon' })))).toMatchObject({ code: 'PICK_DEADLINE_INVALID' });
      expect(await errorOf(await confirm(deps, confirmBody(run, { reason: '   ' })))).toMatchObject({ code: 'CONFIRMATION_REASON_REQUIRED' });
      expect(await errorOf(await confirm(deps, confirmBody(run, { reason: 'x'.repeat(501) })))).toMatchObject({ code: 'CONFIRMATION_REASON_REQUIRED' });
      expect(await errorOf(await confirm(deps, confirmBody(run, { scope: { ...scope, targetSemesterId: 3 } })))).toMatchObject({ code: 'TARGET_SEMESTER_NOT_ALLOWED' });
      for (const bad of [{ subjectIds: [] }, { subjectIds: [A, A] }, { subjectIds: ['1'] }, { extra: true }, { forecastRunId: 'x' }, { scope: { programmeId: 5 } }]) {
        expect((await confirm(deps, confirmBody(run, bad))).status).toBe(400);
      }
      const noJson = await call(deps, 'confirmed-offerings', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
      expect(noJson.status).toBe(415);
    });

    it('adds subjects and re-confirms withdrawn ones on later calls; already confirmed subjects change nothing', async () => {
      const { deps, fakeOfferings } = fixture();
      const { run, revision } = await confirmed(deps);
      const added = await confirm(deps, confirmBody(run, { subjectIds: [C], baseRevision: revision, reason: 'Add the elective.' }), revision);
      expect(added.status).toBe(200);
      const afterAdd = (await readData<{ revision: string }>(added)).revision;
      expect(afterAdd).toBe('oc1.4');
      const noop = await confirm(deps, confirmBody(run, { subjectIds: [A, C], baseRevision: afterAdd }), afterAdd);
      expect(noop.status).toBe(200);
      expect((await readData<{ revision: string }>(noop)).revision).toBe(afterAdd);
      const withdrawn = await readData<{ revision: string }>(await withdraw(deps, afterAdd, [A]));
      const back = await confirm(deps, confirmBody(run, { subjectIds: [A], baseRevision: withdrawn.revision, reason: 'Demand recovered.' }), withdrawn.revision);
      expect(back.status).toBe(200);
      const set = await read(deps);
      expect(set.offerings.find((o) => o.subjectId === A)).toMatchObject({ status: 'CONFIRMED', reason: 'Demand recovered.', withdrawnAt: null });
      expect(fakeOfferings.audit.filter((e) => e.subjectId === A).map((e) => [e.action, e.beforeStatus, e.afterStatus])).toEqual([
        ['CONFIRM', null, 'CONFIRMED'], ['WITHDRAW', 'CONFIRMED', 'WITHDRAWN'], ['CONFIRM', 'WITHDRAWN', 'CONFIRMED'],
      ]);
    });

    it('requires the same deadline and the same run on later calls', async () => {
      const { deps } = fixture();
      const { run, revision } = await confirmed(deps);
      expect(await errorOf(await confirm(deps, confirmBody(run, { subjectIds: [C], baseRevision: revision, pickDeadline: LATER }), revision))).toMatchObject({ code: 'PICK_DEADLINE_MISMATCH' });
      const other = await finalizedRun(deps, 2);
      expect(await errorOf(await confirm(deps, confirmBody(other, { subjectIds: [C], baseRevision: revision }), revision))).toMatchObject({ code: 'CONFIRMATION_RUN_MISMATCH' });
    });

    it('returns 412 for stale or inconsistent revisions and 400 without If-Match', async () => {
      const { deps } = fixture();
      const { run, revision } = await confirmed(deps);
      expect(await errorOf(await confirm(deps, confirmBody(run, { subjectIds: [C], baseRevision: 'oc1.1' }), 'oc1.1'))).toMatchObject({ code: 'CONFIRMATION_REVISION_MISMATCH' });
      expect(await errorOf(await confirm(deps, confirmBody(run, { subjectIds: [C], baseRevision: revision }), 'oc1.1'))).toMatchObject({ code: 'CONFIRMATION_REVISION_MISMATCH' });
      expect(await errorOf(await confirm(deps, confirmBody(run, { subjectIds: [C], baseRevision: revision })))).toMatchObject({ code: 'IF_MATCH_REQUIRED' });
      // A client that believes nothing exists yet while a confirmation does.
      expect((await confirm(deps, confirmBody(run, { subjectIds: [C] }))).status).toBe(412);
      expect((await confirm(deps, confirmBody(run, { subjectIds: [C], baseRevision: null }), revision)).status).toBe(412);
      expect((await read(deps)).offerings).toHaveLength(2);
    });
  });

  describe('withdrawing', () => {
    it('withdraws with a reason, keeps the row as WITHDRAWN and bumps the revision', async () => {
      const { deps } = fixture();
      const { revision } = await confirmed(deps);
      const response = await withdraw(deps, revision, [B], 'Lab room unavailable.');
      expect(response.status).toBe(200);
      expect(response.headers.get('ETag')).toBe('"oc1.4"');
      const set = await read(deps);
      expect(set.offerings.find((o) => o.subjectId === B)).toMatchObject({ status: 'WITHDRAWN', reason: 'Lab room unavailable.', withdrawnBy: COORDINATOR });
      expect(set.offerings.find((o) => o.subjectId === A)?.status).toBe('CONFIRMED');
    });

    it('needs a reason, a confirmation, a current revision and currently confirmed subjects', async () => {
      const { deps } = fixture();
      expect(await errorOf(await withdraw(deps, 'oc1.1', [A]))).toMatchObject({ code: 'CONFIRMATION_NOT_FOUND' });
      const { revision } = await confirmed(deps);
      expect(await errorOf(await withdraw(deps, revision, [A], '  '))).toMatchObject({ code: 'CONFIRMATION_REASON_REQUIRED' });
      expect(await errorOf(await withdraw(deps, 'oc1.1', [A]))).toMatchObject({ code: 'CONFIRMATION_REVISION_MISMATCH' });
      expect(await errorOf(await withdraw(deps, revision, [C]))).toMatchObject({ code: 'OFFERING_NOT_CONFIRMED', details: { subjectIds: [C] } });
      const done = await readData<{ revision: string }>(await withdraw(deps, revision, [A]));
      expect(await errorOf(await withdraw(deps, done.revision, [A]))).toMatchObject({ code: 'OFFERING_NOT_CONFIRMED' });
      const noHeader = await post(deps, 'confirmed-offerings/withdrawals', { scope, subjectIds: [B], reason: 'x', baseRevision: done.revision });
      expect(await errorOf(noHeader)).toMatchObject({ code: 'IF_MATCH_REQUIRED' });
    });
  });

  describe('pick deadline', () => {
    it('changes the deadline with a reason and audits it as SET_DEADLINE', async () => {
      const { deps } = fixture();
      const { revision } = await confirmed(deps);
      const response = await setDeadline(deps, revision);
      expect(response.status).toBe(200);
      const set = await read(deps);
      expect(set).toMatchObject({ pickDeadline: LATER, pickWindow: 'OPEN' });
      const audit = await readData<{ items: ConfirmedOfferingAuditEntry[] }>(await get(deps, 'confirmed-offerings/audit?' + QUERY));
      expect(audit.items[0]).toMatchObject({ action: 'SET_DEADLINE', subjectId: null, beforeDeadline: FUTURE, afterDeadline: LATER, reason: 'Registry asked for more time.', recordedBy: COORDINATOR });
    });

    it('can switch the source run to another FINALIZED run of the scope', async () => {
      const { deps } = fixture();
      const { run, revision } = await confirmed(deps);
      const newer = await finalizedRun(deps, 2);
      expect((await read(deps)).newerForecastAvailable).toMatchObject({ forecastRunId: newer, versionNumber: 2, status: 'FINALIZED' });
      const response = await setDeadline(deps, revision, { pickDeadline: FUTURE, forecastRunId: newer, reason: 'Re-based on version 2.' });
      expect(response.status).toBe(200);
      const set = await read(deps);
      expect(set.forecastRunId).toBe(newer);
      expect(set.forecastRunId).not.toBe(run);
      expect(set.newerForecastAvailable).toBeNull();
      expect(set.offerings.every((o) => o.status === 'CONFIRMED')).toBe(true);
    });

    it('refuses past deadlines, missing reasons, no-op changes, non-final runs and stale revisions', async () => {
      const { deps } = fixture();
      const { revision } = await confirmed(deps);
      expect(await errorOf(await setDeadline(deps, revision, { pickDeadline: '2026-11-01T11:59:00.000Z' }))).toMatchObject({ code: 'PICK_DEADLINE_INVALID' });
      expect(await errorOf(await setDeadline(deps, revision, { reason: '' }))).toMatchObject({ code: 'CONFIRMATION_REASON_REQUIRED' });
      expect(await errorOf(await setDeadline(deps, revision, { pickDeadline: FUTURE }))).toMatchObject({ code: 'CONFIRMATION_UNCHANGED' });
      const draft = await draftRun(deps);
      expect(await errorOf(await setDeadline(deps, revision, { forecastRunId: draft }))).toMatchObject({ code: 'RUN_NOT_FINALIZED' });
      expect(await errorOf(await setDeadline(deps, 'oc1.1'))).toMatchObject({ code: 'CONFIRMATION_REVISION_MISMATCH' });
      expect(await errorOf(await setDeadline(deps, revision, {}, 'oc1.9'))).toMatchObject({ code: 'CONFIRMATION_REVISION_MISMATCH' });
      expect((await setDeadline(deps, revision, { pickDeadline: LATER, reason: 'ok' })).status).toBe(200);
    });

    it('reports a CLOSED window after the deadline', async () => {
      const { deps } = fixture();
      await confirmed(deps);
      const later = { ...deps, now: () => new Date('2026-11-21T00:00:00.000Z') };
      expect((await readData<ConfirmedOfferingSet>(await get(later, 'confirmed-offerings?' + QUERY))).pickWindow).toBe('CLOSED');
    });
  });

  describe('newer forecast notice (OP1)', () => {
    it('is informational: a new draft forecast changes neither the confirmations nor the revision', async () => {
      const { deps } = fixture();
      const { run, revision } = await confirmed(deps);
      const before = await read(deps);
      const draft = await draftRun(deps);
      const after = await read(deps);
      expect(after.newerForecastAvailable).toEqual({ forecastRunId: draft, versionNumber: 2, status: 'DRAFT' });
      expect({ ...after, newerForecastAvailable: null }).toEqual(before);
      expect(after.revision).toBe(revision);
      expect(after.forecastRunId).toBe(run);
    });
  });

  describe('audit and pick counts', () => {
    it('pages the audit newest first', async () => {
      const { deps } = fixture();
      const { revision } = await confirmed(deps);
      await withdraw(deps, revision, [A]);
      const first = await readData<{ items: ConfirmedOfferingAuditEntry[]; nextCursor?: string }>(await get(deps, 'confirmed-offerings/audit?' + QUERY + '&limit=2'));
      expect(first.items.map((e) => e.action)).toEqual(['WITHDRAW', 'CONFIRM']);
      expect(first.nextCursor).toBeTruthy();
      const second = await readData<{ items: ConfirmedOfferingAuditEntry[]; nextCursor?: string }>(await get(deps, 'confirmed-offerings/audit?' + QUERY + '&limit=2&cursor=' + first.nextCursor));
      expect(second.items.map((e) => e.action)).toEqual(['CONFIRM', 'SET_DEADLINE']);
      expect(second.nextCursor).toBeUndefined();
      expect((await get(deps, 'confirmed-offerings/audit?' + QUERY + '&limit=101')).status).toBe(400);
      const empty = await readData<{ items: unknown[] }>(await get(fixture().deps, 'confirmed-offerings/audit?' + QUERY));
      expect(empty.items).toEqual([]);
    });

    it('answers pick counts honestly: zero picks, no pickers, picksAvailable false, withdrawn subjects left out', async () => {
      const { deps } = fixture();
      const { revision } = await confirmed(deps);
      await withdraw(deps, revision, [B]);
      const response = await get(deps, 'offering-pick-counts?' + QUERY + '&sort=name');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const summary = await readData<OfferingPickCountSummary>(response);
      expect(summary).toMatchObject({ scope, pickDeadline: FUTURE, picksAvailable: false });
      expect(summary.counts).toEqual([expect.objectContaining({ subjectId: A, pickCount: 0, pickers: [] })]);
      expect((await get(deps, 'offering-pick-counts?' + QUERY + '&sort=other')).status).toBe(400);
    });
  });

  describe('database errors', () => {
    it('maps trigger messages to stable codes without leaking text', async () => {
      const { mapForecastingDatabaseError } = await import('./errors');
      const map = (code: string, message: string) => mapForecastingDatabaseError({ code, message }, 'confirmation');
      expect(map('23514', 'Subject is excluded from offering confirmation').code).toBe('SUBJECT_EXCLUDED');
      expect(map('23514', 'Subject is not part of the source forecast run').code).toBe('SUBJECT_NOT_IN_RUN');
      expect(map('23514', 'Confirmation requires a FINALIZED forecast run for the same programme, centre and semester').code).toBe('RUN_NOT_FINALIZED');
      expect(map('23514', 'Confirmation source run is not finalized').code).toBe('RUN_NOT_FINALIZED');
      expect(map('23514', 'Offering confirmation change requires trusted actor and reason context').code).toBe('CONFIRMATION_REASON_REQUIRED');
      expect(map('22P02', 'invalid input syntax for type integer: "GUARD_CONFIRMATION_REVISION3"').code).toBe('CONFIRMATION_REVISION_MISMATCH');
      expect(map('23505', 'duplicate key value violates unique constraint "offering_confirmation_scope_key"').code).toBe('CONFIRMATION_REVISION_MISMATCH');
      expect(map('23503', 'insert or update on table violates foreign key').code).toBe('SCOPE_NOT_FOUND');
      const unknown = map('XX000', 'password authentication failed for user secret');
      expect(unknown.code).toBe('CONFIRMATION_FAILED');
      expect(unknown.message).not.toContain('secret');
    });
  });
});
