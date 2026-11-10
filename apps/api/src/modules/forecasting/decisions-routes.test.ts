import { describe, expect, it, vi } from 'vitest';
import type { ScopeProvider } from './scope-provider';
import { assignedTo, testScopeProvider } from './scope-provider.test-support';
import type { OfferingDecisionAuditEntry, OfferingDecisionSet, DecideOfferingResult, DecisionPickers } from '../../../../../packages/shared/src/forecasting/offering-decisions';
import type { ForecastingDependencies, ForecastingRepository, ImportBatchRow, ProgrammeCatalogue } from './contracts';
import { handleForecastingRequest } from './routes';
import { fakeDecisionsRepository } from './decisions-testing';

const COORDINATOR = 'user_coord';
const BASE = 'https://test.invalid/api/coordinator/';
const scope = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
const QUERY = 'programmeId=5&learningCentreId=1&targetSemesterId=2';
const A = 101; const B = 102; const C = 103; const X = 104;

const subject = (subjectId: number, subjectCode: string, includeInOfferingForecast = true) => ({
  curriculumSubjectId: 1000 + subjectId, subjectId, subjectCode, subjectName: 'Subject ' + subjectCode, creditHours: 3, classType: 'LECTURE' as const, includeInOfferingForecast,
});
const subjects = [subject(A, 'LEC101'), subject(B, 'LAB102'), subject(C, 'NOT103'), subject(X, 'FYP104', false)];
const catalogue = { programmeId: 5, curricula: [{ curriculumId: 10, curriculumVersion: '2024-DEMO', effectiveYear: 2024, subjects }], prerequisites: [] } as unknown as ProgrammeCatalogue;
const baseSemesters = [
  { semesterId: 1, academicYear: '2026/2027', semesterNumber: 1 as const }, { semesterId: 2, academicYear: '2026/2027', semesterNumber: 2 as const },
  { semesterId: 3, academicYear: '2026/2027', semesterNumber: 3 as const },
];
const batch = (importBatchId: number, overrides: Partial<ImportBatchRow> = {}): ImportBatchRow => ({
  importBatchId, ...scope, status: 'ACCEPTED', sourceDate: '2026-10-30', sourceLabel: 'Registry export', providedBy: COORDINATOR, sourceFingerprint: 'f'.repeat(64),
  acceptedAt: '2026-11-01T09:00:00.000Z', acceptedBy: COORDINATOR, summary: {} as never, ...overrides,
});

function fixture(options: { window?: { selectionOpensAt: string | null; selectionClosesAt: string | null }; scopes?: ScopeProvider; portalContacts?: ForecastingDependencies['portalContacts'] } = {}) {
  const batches = [batch(1), batch(2, { status: 'VALIDATED' }), batch(3, { learningCentreId: 2 })];
  const semesters = baseSemesters.map((semester) => semester.semesterId === 2 && options.window ? { ...semester, ...options.window } : semester);
  const fake = fakeDecisionsRepository(new Map(subjects.map((s) => [s.subjectId, { subjectCode: s.subjectCode, subjectName: s.subjectName, creditHours: s.creditHours, classType: s.classType }])));
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: COORDINATOR, sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: 'COORDINATOR' as const, roles: ['COORDINATOR' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository: {
      semesters: vi.fn(async () => semesters), catalogue: vi.fn(async () => catalogue), getBatch: vi.fn(async (id: number) => batches.find((entry) => entry.importBatchId === id) ?? null),
    } as unknown as ForecastingRepository,
    runs: {} as ForecastingDependencies['runs'],
    decisions: fake.repository,
    scopes: options.scopes ?? testScopeProvider,
    ...(options.portalContacts ? { portalContacts: options.portalContacts } : {}),
    now: () => new Date('2026-11-01T12:00:00.000Z'),
  };
  return { deps, fake };
}
type Deps = ForecastingDependencies;

const call = (deps: Deps, path: string, init?: RequestInit) => handleForecastingRequest(new Request(BASE + path, init), deps) as Promise<Response>;
const get = (deps: Deps, path: string) => call(deps, path);
const post = (deps: Deps, body: unknown, headers: Record<string, string> = {}) =>
  call(deps, 'offering-decisions', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const readData = async <T>(response: Response) => (await response.json() as { data: T }).data;
const errorCode = async (response: Response) => (await response.json() as { error: { code: string } }).error.code;
const decide = (deps: Deps, subjectId: number, status: string, expectedStatus: string, overrides: Record<string, unknown> = {}) =>
  post(deps, { scope, subjectId, status, expectedStatus, importBatchId: 1, ...overrides });
const readSet = async (deps: Deps) => readData<OfferingDecisionSet>(await get(deps, 'offering-decisions?' + QUERY));

describe('offering decisions', () => {
  it('GET returns an empty set in PLANNING with editable true for the next semester', async () => {
    const { deps } = fixture();
    const response = await get(deps, 'offering-decisions?' + QUERY);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await readData<OfferingDecisionSet>(response)).toMatchObject({
      scope, phase: 'PLANNING', editable: true, decisions: [], pickCounts: [], asOf: '2026-11-01T12:00:00.000Z',
      semester: { semesterId: 2, selectionOpensAt: null, selectionClosesAt: null },
    });
  });

  it('POST approve writes a decision and an audit row; same status again is a no-op', async () => {
    const { deps, fake } = fixture();
    const approved = await decide(deps, A, 'APPROVED', 'PENDING');
    expect(approved.status).toBe(200);
    expect(await readData<DecideOfferingResult>(approved)).toEqual({ subjectId: A, beforeStatus: 'PENDING', afterStatus: 'APPROVED', affectedPicks: 0, phase: 'PLANNING' });
    expect((await readSet(deps)).decisions).toMatchObject([{ subjectId: A, subjectCode: 'LEC101', status: 'APPROVED', decidedBy: COORDINATOR }]);
    const audit = await readData<{ items: OfferingDecisionAuditEntry[] }>(await get(deps, 'offering-decisions/audit?' + QUERY));
    expect(audit.items).toMatchObject([{ subjectCode: 'LEC101', beforeStatus: 'PENDING', afterStatus: 'APPROVED', importBatchId: 1, recordedBy: COORDINATOR, affectedPicks: 0 }]);

    const again = await decide(deps, A, 'APPROVED', 'APPROVED');
    expect(again.status).toBe(200);
    expect(await readData<DecideOfferingResult>(again)).toMatchObject({ beforeStatus: 'APPROVED', afterStatus: 'APPROVED', affectedPicks: 0 });
    expect(fake.audit).toHaveLength(1);
  });

  it('POST with a stale expectedStatus is 409 DECISION_STALE', async () => {
    const { deps, fake } = fixture();
    await decide(deps, A, 'APPROVED', 'PENDING');
    const stale = await decide(deps, A, 'REMOVED', 'PENDING');
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe('DECISION_STALE');
    expect(fake.audit).toHaveLength(1);
    expect((await readSet(deps)).decisions[0]!.status).toBe('APPROVED');
  });

  it('POST PENDING (add back) deletes the row and audits REMOVED -> PENDING', async () => {
    const { deps, fake } = fixture();
    await decide(deps, B, 'REMOVED', 'PENDING');
    expect((await readSet(deps)).decisions).toMatchObject([{ subjectId: B, status: 'REMOVED' }]);
    expect((await decide(deps, B, 'PENDING', 'REMOVED')).status).toBe(200);
    expect((await readSet(deps)).decisions).toEqual([]);
    expect(fake.audit.map((entry) => [entry.beforeStatus, entry.afterStatus])).toEqual([['PENDING', 'REMOVED'], ['REMOVED', 'PENDING']]);
  });

  it('POST rejects an unknown subject', async () => {
    const { deps, fake } = fixture();
    const unknown = await decide(deps, 999, 'APPROVED', 'PENDING');
    expect(unknown.status).toBe(422);
    expect(await errorCode(unknown)).toBe('DECISION_SUBJECT_NOT_FOUND');
    expect(fake.audit).toEqual([]);
  });

  it('an excluded subject cannot be approved but an earlier approval can be removed', async () => {
    const { deps, fake } = fixture();
    await fake.repository.decide({ scope, subjectId: X, expectedStatus: 'PENDING', status: 'APPROVED', actor: COORDINATOR, importBatchId: null });
    const approve = await decide(deps, X, 'APPROVED', 'PENDING');
    expect(approve.status).toBe(422);
    expect(await errorCode(approve)).toBe('SUBJECT_EXCLUDED');
    const removed = await decide(deps, X, 'REMOVED', 'APPROVED');
    expect(removed.status).toBe(200);
    expect(await readData<DecideOfferingResult>(removed)).toMatchObject({ beforeStatus: 'APPROVED', afterStatus: 'REMOVED' });
    expect((await decide(deps, X, 'PENDING', 'REMOVED')).status).toBe(200);
  });

  it('POST rejects a snapshot that is not an accepted import of the scope', async () => {
    const { deps } = fixture();
    for (const importBatchId of [2, 3, 404]) {
      const response = await decide(deps, A, 'APPROVED', 'PENDING', { importBatchId });
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe('IMPORT_NOT_FOUND');
    }
    expect((await decide(deps, A, 'APPROVED', 'PENDING', { importBatchId: null })).status).toBe(200);
  });

  it('POST rejects malformed bodies', async () => {
    const { deps, fake } = fixture();
    const bodies = [
      { scope, subjectId: A, status: 'APPROVED', expectedStatus: 'PENDING' },
      { scope, subjectId: A, status: 'DONE', expectedStatus: 'PENDING', importBatchId: 1 },
      { scope, subjectId: 'A', status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: 1 },
      { scope, subjectId: A, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: 1, reason: 'x' },
      { scope: { ...scope, extra: 1 }, subjectId: A, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: 1 },
    ];
    for (const body of bodies) expect((await post(deps, body)).status).toBe(400);
    expect((await post(deps, { scope, subjectId: A, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: 1 }, { 'Idempotency-Key': '' })).status).toBe(400);
    expect(fake.audit).toEqual([]);
  });

  it('past semester is read-only', async () => {
    const { deps, fake } = fixture();
    const past = { ...scope, targetSemesterId: 1 };
    const set = await readData<OfferingDecisionSet>(await get(deps, 'offering-decisions?programmeId=5&learningCentreId=1&targetSemesterId=1'));
    expect(set.editable).toBe(false);
    const response = await post(deps, { scope: past, subjectId: A, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: null });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('SEMESTER_READ_ONLY');
    expect(fake.audit).toEqual([]);
    // A semester after the next one is not plannable yet either, and an unknown semester is not found.
    const later = await post(deps, { scope: { ...scope, targetSemesterId: 3 }, subjectId: A, status: 'APPROVED', expectedStatus: 'PENDING', importBatchId: null });
    expect(await errorCode(later)).toBe('SEMESTER_READ_ONLY');
    const missing = await get(deps, 'offering-decisions?programmeId=5&learningCentreId=1&targetSemesterId=99');
    expect(missing.status).toBe(404);
  });

  it('closed selection locks decisions', async () => {
    const { deps, fake } = fixture({ window: { selectionOpensAt: '2026-10-01T00:00:00.000Z', selectionClosesAt: '2026-10-31T00:00:00.000Z' } });
    const set = await readSet(deps);
    expect(set).toMatchObject({ phase: 'CLOSED', editable: false });
    const response = await decide(deps, A, 'APPROVED', 'PENDING');
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('SELECTION_CLOSED');
    expect(fake.audit).toEqual([]);
  });

  it('open selection stays editable and reports the phase', async () => {
    const { deps } = fixture({ window: { selectionOpensAt: '2026-10-01T00:00:00.000Z', selectionClosesAt: null } });
    expect(await readSet(deps)).toMatchObject({ phase: 'OPEN', editable: true });
    expect(await readData<DecideOfferingResult>(await decide(deps, A, 'APPROVED', 'PENDING'))).toMatchObject({ phase: 'OPEN' });
  });

  it('audit is paged newest first', async () => {
    const { deps } = fixture();
    await decide(deps, A, 'APPROVED', 'PENDING');
    await decide(deps, B, 'REMOVED', 'PENDING');
    await decide(deps, C, 'APPROVED', 'PENDING');
    const first = await readData<{ items: OfferingDecisionAuditEntry[]; nextCursor?: string }>(await get(deps, 'offering-decisions/audit?' + QUERY + '&limit=2'));
    expect(first.items.map((entry) => entry.subjectId)).toEqual([C, B]);
    expect(first.nextCursor).toBeTruthy();
    const second = await readData<{ items: OfferingDecisionAuditEntry[]; nextCursor?: string }>(await get(deps, 'offering-decisions/audit?' + QUERY + '&limit=2&cursor=' + first.nextCursor));
    expect(second.items.map((entry) => entry.subjectId)).toEqual([A]);
    expect(second.nextCursor).toBeUndefined();
  });

  it('unassigned scope is 403 on every route', async () => {
    const { deps, fake } = fixture({ scopes: assignedTo([5, 2]) });
    for (const path of ['offering-decisions?' + QUERY, 'offering-decisions/audit?' + QUERY]) {
      const response = await get(deps, path);
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe('SCOPE_NOT_ASSIGNED');
    }
    const posted = await decide(deps, A, 'APPROVED', 'PENDING');
    expect(posted.status).toBe(403);
    expect(await errorCode(posted)).toBe('SCOPE_NOT_ASSIGNED');
    expect(fake.audit).toEqual([]);
  });

  it('only coordinators may call it and unsupported methods are 405', async () => {
    const { deps } = fixture();
    deps.auth.access.find = vi.fn(async (id: string) => ({ clerkUserId: id, appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'ACTIVE' as const }));
    expect((await get(deps, 'offering-decisions?' + QUERY)).status).toBe(403);
    const coordinator = fixture().deps;
    expect((await call(coordinator, 'offering-decisions', { method: 'DELETE' })).status).toBe(405);
    expect((await call(coordinator, 'offering-decisions/audit', { method: 'POST' })).status).toBe(405);
  });
});

describe('offering picks', () => {
  const students = [
    { studentId: 7, studentName: 'Siti Aminah', matricNo: 'A22EC0007' },
    { studentId: 3, studentName: 'Ali Hassan', matricNo: null },
    { studentId: 9, studentName: 'Ali Hassan', matricNo: 'A22EC0009' },
  ];
  const openWindow = { selectionOpensAt: '2026-10-01T00:00:00.000Z', selectionClosesAt: null };
  const pickersPath = (subjectId: number, query = QUERY) => `offering-decisions/${subjectId}/pickers?${query}`;

  it('GET set includes pick counts per subject', async () => {
    const { deps, fake } = fixture({ window: openWindow });
    await decide(deps, A, 'APPROVED', 'PENDING');
    fake.seedPicks(scope, A, students.slice(0, 2));
    expect((await readSet(deps)).pickCounts).toEqual([{ subjectId: A, pickCount: 2 }]);
  });

  it('pickers lists names and matric numbers sorted by name then id, no-store', async () => {
    const { deps, fake } = fixture({
      window: openWindow,
      portalContacts: async () => ({ emailsAvailable: true, contacts: new Map([[3, { matricNo: 'A22EC0003', email: 'ali@graduate.utm.my' }]]) }),
    });
    await decide(deps, A, 'APPROVED', 'PENDING');
    fake.seedPicks(scope, A, students);
    const response = await get(deps, pickersPath(A));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await readData<DecisionPickers>(response);
    expect(data).toMatchObject({ scope, subjectId: A, subjectCode: 'LEC101', subjectName: 'Subject LEC101', pickCount: 3, emailsAvailable: true });
    expect(data.pickers).toEqual([
      { studentId: 3, studentName: 'Ali Hassan', matricNo: 'A22EC0003', email: 'ali@graduate.utm.my' },
      { studentId: 9, studentName: 'Ali Hassan', matricNo: 'A22EC0009', email: null },
      { studentId: 7, studentName: 'Siti Aminah', matricNo: 'A22EC0007', email: null },
    ]);
  });

  it('pickers keeps working when the email lookup fails', async () => {
    const { deps, fake } = fixture({ window: openWindow, portalContacts: async () => { throw new Error('Identity provider down'); } });
    await decide(deps, A, 'APPROVED', 'PENDING');
    fake.seedPicks(scope, A, students.slice(0, 1));
    const data = await readData<DecisionPickers>(await get(deps, pickersPath(A)));
    expect(data).toMatchObject({ emailsAvailable: false, pickCount: 1, pickers: [{ studentId: 7, matricNo: 'A22EC0007', email: null }] });
  });

  it('pickers of a subject without a decision is 404 OFFERING_DECISION_NOT_FOUND', async () => {
    const { deps } = fixture({ window: openWindow });
    const response = await get(deps, pickersPath(A));
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('OFFERING_DECISION_NOT_FOUND');
  });

  it('pickers is coordinator-scoped, GET only and rejects bad parameters', async () => {
    const { deps } = fixture({ scopes: assignedTo([5, 2]) });
    const forbidden = await get(deps, pickersPath(A));
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe('SCOPE_NOT_ASSIGNED');
    const open = fixture().deps;
    expect((await call(open, pickersPath(A), { method: 'POST' })).status).toBe(405);
    expect((await get(open, pickersPath(A, QUERY + '&extra=1'))).status).toBe(400);
    expect((await get(open, pickersPath(A, 'programmeId=5&learningCentreId=1'))).status).toBe(400);
  });

  it('removing an approved subject while open withdraws its picks and reports how many', async () => {
    const { deps, fake } = fixture({ window: openWindow });
    await decide(deps, A, 'APPROVED', 'PENDING');
    fake.seedPicks(scope, A, students);
    fake.seedPicks(scope, B, students.slice(0, 1));
    const removed = await decide(deps, A, 'REMOVED', 'APPROVED');
    expect(removed.status).toBe(200);
    expect(await readData<DecideOfferingResult>(removed)).toMatchObject({ beforeStatus: 'APPROVED', afterStatus: 'REMOVED', affectedPicks: 3, phase: 'OPEN' });
    // Only subject A's picks went; B (another subject) keeps its pick.
    expect((await readSet(deps)).pickCounts).toEqual([{ subjectId: B, pickCount: 1 }]);
    expect(fake.withdrawals.map((w) => [w.studentId, w.subjectId, w.auditId]).sort()).toEqual([[3, A, 2], [7, A, 2], [9, A, 2]]);
    const audit = await readData<{ items: OfferingDecisionAuditEntry[] }>(await get(deps, 'offering-decisions/audit?' + QUERY));
    expect(audit.items[0]).toMatchObject({ subjectId: A, beforeStatus: 'APPROVED', afterStatus: 'REMOVED', affectedPicks: 3 });
  });

  it('moving an approved subject back to pending also withdraws its picks', async () => {
    const { deps, fake } = fixture({ window: openWindow });
    await decide(deps, A, 'APPROVED', 'PENDING');
    fake.seedPicks(scope, A, students.slice(0, 2));
    expect(await readData<DecideOfferingResult>(await decide(deps, A, 'PENDING', 'APPROVED'))).toMatchObject({ affectedPicks: 2 });
    expect(fake.withdrawals).toHaveLength(2);
  });

  it('removing a subject nobody picked reports zero and writes no withdrawal', async () => {
    const { deps, fake } = fixture({ window: openWindow });
    await decide(deps, A, 'APPROVED', 'PENDING');
    expect(await readData<DecideOfferingResult>(await decide(deps, A, 'REMOVED', 'APPROVED'))).toMatchObject({ affectedPicks: 0 });
    expect(fake.withdrawals).toEqual([]);
  });

  it('a stale removal withdraws nothing', async () => {
    const { deps, fake } = fixture({ window: openWindow });
    await decide(deps, A, 'REMOVED', 'PENDING');
    fake.seedPicks(scope, A, students);
    expect((await decide(deps, A, 'REMOVED', 'APPROVED')).status).toBe(409);
    expect(fake.withdrawals).toEqual([]);
    expect((await readSet(deps)).pickCounts).toEqual([{ subjectId: A, pickCount: 3 }]);
  });
});
