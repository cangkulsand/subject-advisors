import { describe, expect, it, vi } from 'vitest';
import type { ScopeProvider } from './scope-provider';
import { testScopeProvider } from './scope-provider.test-support';
import type { ForecastingDependencies, ForecastingRepository, ImportBatchRow, PortalStudentSelection, ProgrammeCatalogue, StoreImportInput } from './contracts';
import { handleForecastingRequest } from './routes';

const COORDINATOR = 'user_coord';
const BASE = 'https://test.invalid/api/coordinator/';
const catalogue: ProgrammeCatalogue = {
  programmeId: 5,
  curricula: [{ curriculumId: 10, curriculumVersion: '2024-DEMO', effectiveYear: 2024, subjects: [
    { curriculumSubjectId: 1101, subjectId: 101, subjectCode: 'DEMO101', subjectName: 'Demo', creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true },
    { curriculumSubjectId: 1102, subjectId: 102, subjectCode: 'DEMO102', subjectName: 'Demo two', creditHours: 3, classType: null, includeInOfferingForecast: true },
  ] }],
  prerequisites: [], knownSubjectCodes: new Set(['DEMO101', 'DEMO102']), semesterIds: new Set([1, 2, 3]),
};
const semesters = [1, 2, 3].map((n) => ({ semesterId: n, academicYear: '2026/2027', semesterNumber: n as 1 | 2 | 3 }));

const baseSelection = (): PortalStudentSelection => ({
  students: [
    { studentId: 1, studentName: 'Alya', curriculumId: 10, eligible: true },
    { studentId: 2, studentName: 'Suspended Sam', curriculumId: 10, eligible: false },
    { studentId: 3, studentName: 'Nora (no records)', curriculumId: 10, eligible: true },
    { studentId: 4, studentName: 'Johor Jay', curriculumId: 10, eligible: true },
  ],
  records: [
    { studentId: 1, subjectId: 101, status: 'COMPLETED', semesterId: 1, recognizedCredits: 3 },
    { studentId: 1, subjectId: 102, status: 'WITHDRAWN', semesterId: null, recognizedCredits: 0 },
    { studentId: 1, subjectId: 999, status: 'COMPLETED', semesterId: 1, recognizedCredits: 3 },
    { studentId: 1, subjectId: 101, status: 'EXEMPTED', semesterId: 2, recognizedCredits: 9 },
    { studentId: 4, subjectId: 101, status: 'FAILED', semesterId: 1, recognizedCredits: 0 },
  ],
  otherProgrammeStudents: 7,
});

function fixture(options: { roles?: ('STUDENT' | 'COORDINATOR' | 'SYSTEM_ADMIN')[]; scopes?: ScopeProvider; selection?: PortalStudentSelection } = {}) {
  const roles = options.roles ?? ['COORDINATOR'];
  const batches: ImportBatchRow[] = [];
  const stored: StoreImportInput[] = [];
  let selection = options.selection ?? baseSelection();
  const repository = {
    semesters: vi.fn(async () => semesters),
    catalogue: vi.fn(async (programmeId: number) => programmeId === 5 ? catalogue : null),
    systemStudents: vi.fn(async () => selection),
    findAcceptedByFingerprint: vi.fn(async (scope, fingerprint) => batches.find((b) => b.status === 'ACCEPTED' && b.programmeId === scope.programmeId && b.learningCentreId === scope.learningCentreId && b.targetSemesterId === scope.targetSemesterId && b.sourceFingerprint === fingerprint) ?? null),
    storeImport: vi.fn(async (input: StoreImportInput) => {
      stored.push(input);
      const batch: ImportBatchRow = {
        importBatchId: batches.length + 1, programmeId: input.programmeId, learningCentreId: input.learningCentreId, targetSemesterId: input.targetSemesterId,
        status: input.outcome, sourceDate: input.sourceDate, sourceLabel: input.sourceLabel, providedBy: input.actor, sourceFingerprint: input.sourceFingerprint,
        acceptedAt: '2026-11-02T10:00:00.000Z', acceptedBy: input.actor, summary: input.summary,
      };
      batches.push(batch);
      return batch;
    }),
    listAccepted: vi.fn(async () => [...batches].reverse()),
  } as unknown as ForecastingRepository;
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: COORDINATOR, sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository, runs: {} as ForecastingDependencies['runs'], offerings: {} as ForecastingDependencies['offerings'],
    scopes: options.scopes ?? testScopeProvider, now: () => new Date('2026-11-02T12:00:00.000Z'),
  };
  return { deps, repository, batches, stored, setSelection: (next: PortalStudentSelection) => { selection = next; } };
}
const body = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
const post = (deps: ForecastingDependencies, payload: unknown = body, headers: Record<string, string> = {}) =>
  handleForecastingRequest(new Request(BASE + 'forecast-imports/system-snapshots', {
    method: 'POST', headers: { Authorization: 'Bearer test-only', 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload),
  }), deps) as Promise<Response>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data = async (response: Response) => (await response.json() as { data: Record<string, any> }).data;

describe('POST forecast-imports/system-snapshots', () => {
  it.each([['STUDENT'], ['SYSTEM_ADMIN']] as const)('denies %s before reading any student data', async (role) => {
    const { deps, repository } = fixture({ roles: [role] });
    const response = await post(deps);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'ROLE_DENIED' } });
    expect(repository.systemStudents).not.toHaveBeenCalled();
  });

  it('only allows POST and rejects unknown fields and wrong content types', async () => {
    const { deps } = fixture();
    const get = await handleForecastingRequest(new Request(BASE + 'forecast-imports/system-snapshots', { headers: { Authorization: 'Bearer test-only' } }), deps) as Response;
    expect(get.status).toBe(405);
    expect((await post(deps, { ...body, extra: 1 })).status).toBe(400);
    expect((await post(deps, { programmeId: 5, learningCentreId: 1 })).status).toBe(400);
    expect((await post(deps, { ...body, sourceLabel: '' })).status).toBe(400);
    expect((await post(deps, { ...body, programmeId: '5' })).status).toBe(400);
    const text = await handleForecastingRequest(new Request(BASE + 'forecast-imports/system-snapshots', { method: 'POST', headers: { Authorization: 'Bearer test-only', 'content-type': 'text/plain' }, body: '{}' }), deps) as Response;
    expect(text.status).toBe(415);
  });

  it('uses the scope provider for assignment and the target semester (next after current)', async () => {
    const closed = fixture({ scopes: { ...testScopeProvider, isScopeAssigned: vi.fn(async () => false) } });
    expect((await post(closed.deps)).status).toBe(403);
    expect(closed.repository.systemStudents).not.toHaveBeenCalled();
    const { deps, repository } = fixture();
    const wrong = await post(deps, { ...body, targetSemesterId: 3 });
    expect(wrong.status).toBe(422);
    expect(await wrong.json()).toMatchObject({ error: { code: 'TARGET_SEMESTER_NOT_ALLOWED' } });
    expect(repository.systemStudents).not.toHaveBeenCalled();
    const none = fixture({ scopes: { ...testScopeProvider, currentSemesterId: async () => null } });
    expect((await post(none.deps)).status).toBe(409);
  });

  it('selects ACTIVE student-role students of the programme and centre, with a coverage report and the source marker', async () => {
    const scopes: ScopeProvider = { ...testScopeProvider, studentLearningCentreId: vi.fn(async (id: number) => id === 4 ? 2 : 1) };
    const { deps, stored } = fixture({ scopes });
    const response = await post(deps);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const snapshot = await data(response);
    expect(snapshot).toMatchObject({ source: 'SYSTEM', sourceLabel: 'System students', sourceDate: '2026-11-02', snapshotStatus: 'ACCEPTED_IMMUTABLE', counts: { uniqueStudents: 2, validAttempts: 3, rejectedRows: 0, unknownHistoryStudents: 1 } });
    expect(snapshot.validationReport).toMatchObject({
      status: 'VALID', source: 'SYSTEM', subsetAcknowledgementRequired: false,
      coverage: { studentsFound: 2, studentsWithRecords: 1, studentsWithoutRecords: 1, recordsMapped: 3, recordsUnmapped: 1, withdrawnStoredAsFailed: 1, excluded: { otherProgramme: 7, otherCentre: 1, inactiveAccess: 1 } },
    });
    expect(snapshot.validationReport.coverage.centreNote).toContain('Interim');
    expect(snapshot.validationReport.issues).toEqual([expect.objectContaining({ severity: 'WARNING', code: 'HISTORY_UNKNOWN' })]);
    expect(snapshot.validationReport).not.toHaveProperty('internal');
    expect(JSON.stringify(snapshot)).not.toContain('PORTAL-4');
    // The public response never carries the private marker, the stored summary does.
    expect(stored[0]!.summary.internal.source).toBe('PORTAL');
    expect(stored[0]).toMatchObject({ outcome: 'ACCEPTED', actor: COORDINATOR, programmeId: 5, learningCentreId: 1, targetSemesterId: 2 });
  });

  it('stores PORTAL-<id> references, COMPLETE or UNKNOWN history, and maps WITHDRAWN to FAILED', async () => {
    const { deps, stored } = fixture();
    await post(deps);
    const input = stored[0]!;
    expect(input.students).toEqual([
      { externalReference: 'PORTAL-1', curriculumId: 10, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE', studentName: 'Alya' },
      { externalReference: 'PORTAL-3', curriculumId: 10, cohortStatus: 'ACTIVE', historyCompleteness: 'UNKNOWN', studentName: 'Nora (no records)' },
      { externalReference: 'PORTAL-4', curriculumId: 10, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE', studentName: 'Johor Jay' },
    ]);
    expect(input.records).toEqual([
      { externalReference: 'PORTAL-1', subjectId: 101, subjectStatus: 'COMPLETED', semesterId: 1, recognizedCredits: 3, isSynthetic: false },
      { externalReference: 'PORTAL-1', subjectId: 102, subjectStatus: 'FAILED', semesterId: null, recognizedCredits: 0, isSynthetic: false },
      // 9 recognized credits exceed the subject's 3: not trusted, stored as unknown evidence
      { externalReference: 'PORTAL-1', subjectId: 101, subjectStatus: 'EXEMPTED', semesterId: 2, recognizedCredits: null, isSynthetic: false },
      { externalReference: 'PORTAL-4', subjectId: 101, subjectStatus: 'FAILED', semesterId: 1, recognizedCredits: 0, isSynthetic: false },
    ]);
  });

  it('uses the requested centre: with everyone in KL (interim) another centre finds nobody', async () => {
    const { deps } = fixture();
    const response = await post(deps, { ...body, learningCentreId: 2 });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'SYSTEM_SNAPSHOT_EMPTY' } });
  });

  it('uses a custom source label when given', async () => {
    const { deps } = fixture();
    expect(await data(await post(deps, { ...body, sourceLabel: '  Semester 2 intake ' }))).toMatchObject({ sourceLabel: 'Semester 2 intake', source: 'SYSTEM' });
  });

  it('replays the same data in the same scope (200, no second snapshot) and creates a new snapshot when the data changes', async () => {
    const { deps, repository, batches, setSelection } = fixture();
    const first = await post(deps);
    const again = await post(deps, body, { 'Idempotency-Key': 'retry-1' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    const firstId = (await data(first)).importBatchId;
    expect((await data(again)).importBatchId).toBe(firstId);
    expect(repository.storeImport).toHaveBeenCalledTimes(1);
    const changed = baseSelection();
    changed.records.push({ studentId: 3, subjectId: 102, status: 'COMPLETED', semesterId: 1, recognizedCredits: 3 });
    setSelection(changed);
    const third = await post(deps);
    expect(third.status).toBe(201);
    expect((await data(third)).importBatchId).not.toBe(firstId);
    expect(batches).toHaveLength(2);
    expect(batches[1]!.summary.coverage!.studentsWithoutRecords).toBe(0);
    expect(batches[1]!.summary.issues).toEqual([]);
  });

  it('refuses to create an empty snapshot', async () => {
    const { deps, repository } = fixture({ selection: { students: [], records: [], otherProgrammeStudents: 3 } });
    const response = await post(deps);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'SYSTEM_SNAPSHOT_EMPTY' } });
    expect(repository.storeImport).not.toHaveBeenCalled();
  });

  it('shows the source on import lists and details', async () => {
    const { deps, batches } = fixture();
    await post(deps);
    const list = await handleForecastingRequest(new Request(BASE + 'forecast-imports?programmeId=5&learningCentreId=1&targetSemesterId=2', { headers: { Authorization: 'Bearer test-only' } }), deps) as Response;
    expect((await data(list)).items[0]).toMatchObject({ source: 'SYSTEM', sourceLabel: 'System students' });
    const csv = { ...batches[0]!, importBatchId: 2, summary: { ...batches[0]!.summary, source: undefined, internal: { ...batches[0]!.summary.internal, source: undefined } } };
    batches.push(csv as ImportBatchRow);
    const both = await handleForecastingRequest(new Request(BASE + 'forecast-imports?programmeId=5&learningCentreId=1&targetSemesterId=2', { headers: { Authorization: 'Bearer test-only' } }), deps) as Response;
    expect((await data(both)).items.map((item: { source: string }) => item.source)).toEqual(['CSV', 'SYSTEM']);
  });
});
