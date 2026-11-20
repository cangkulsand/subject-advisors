import { describe, expect, it, vi } from 'vitest';
import { IMPORT_CSV_HEADER, IMPORT_LIMITS } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ScopeProvider } from './scope-provider';
import { assignedTo, testScopeProvider } from './scope-provider.test-support';
import { csvLine } from './csv';
import type { ForecastingDependencies, ForecastingRepository, ImportBatchRow, ProgrammeCatalogue, StoreImportInput } from './contracts';
import { ForecastingError } from './errors';
import { handleForecastingRequest, sha256Hex } from './routes';

const COORDINATOR = 'user_coord';
const header = IMPORT_CSV_HEADER.join(',');
const row = (...values: string[]) => csvLine([...values, ...Array(10 - values.length).fill('')]);
const validCsv = [header, row('S1', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'DEMO101', 'COMPLETED', '1', '3', 'false', 'Alya'), row('S2', '2024-DEMO', 'ACTIVE', 'UNKNOWN')].join('\n');
const errorCsv = [header, row('S1', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'DEMO101', 'COMPLETED', '1', '3', 'false'), row('S1', '2024-DEMO', 'ACTIVE', 'COMPLETE', 'NOPE', 'COMPLETED', '1', '3', 'false')].join('\n');

const catalogue: ProgrammeCatalogue = {
  programmeId: 5,
  curricula: [{ curriculumId: 10, curriculumVersion: '2024-DEMO', effectiveYear: 2024, subjects: [
    { curriculumSubjectId: 1101, subjectId: 101, subjectCode: 'DEMO101', subjectName: 'Demo', creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true },
    { curriculumSubjectId: 1102, subjectId: 102, subjectCode: 'DEMO102', subjectName: 'Skip', creditHours: 3, classType: null, includeInOfferingForecast: false },
  ] }],
  prerequisites: [{ prerequisiteId: 1, curriculumSubjectId: 1102, requiredCurriculumSubjectId: 1101, requirementType: 'MANDATORY' }],
  knownSubjectCodes: new Set(['DEMO101', 'DEMO102']),
  semesterIds: new Set([1, 2, 3]),
};
const semesters = [
  { semesterId: 1, academicYear: '2026/2027', semesterNumber: 1 as const }, { semesterId: 2, academicYear: '2026/2027', semesterNumber: 2 as const },
  { semesterId: 3, academicYear: '2026/2027', semesterNumber: 3 as const },
];

/** Stateful in-memory stand-in for the repository: mirrors the lifecycle the database triggers enforce. */
function fakeRepository() {
  const batches: ImportBatchRow[] = [];
  const stored: StoreImportInput[] = [];
  const repository: ForecastingRepository = {
    semesters: vi.fn(async () => semesters),
    catalogue: vi.fn(async (programmeId: number) => programmeId === 5 ? catalogue : null),
    systemStudents: vi.fn(async () => ({ students: [], records: [], otherProgrammeStudents: 0 })),
    findAcceptedByFingerprint: vi.fn(async (scope, fingerprint) => batches.find((b) => b.status === 'ACCEPTED' && b.programmeId === scope.programmeId && b.learningCentreId === scope.learningCentreId && b.targetSemesterId === scope.targetSemesterId && b.sourceFingerprint === fingerprint) ?? null),
    storeImport: vi.fn(async (input: StoreImportInput) => {
      stored.push(input);
      const batch: ImportBatchRow = {
        importBatchId: batches.length + 1, programmeId: input.programmeId, learningCentreId: input.learningCentreId, targetSemesterId: input.targetSemesterId,
        status: input.outcome, sourceDate: input.sourceDate, sourceLabel: input.sourceLabel, providedBy: input.actor, sourceFingerprint: input.sourceFingerprint,
        acceptedAt: input.outcome === 'ACCEPTED' ? '2026-11-01T10:00:00.000Z' : null, acceptedBy: input.outcome === 'ACCEPTED' ? input.actor : null, summary: input.summary,
      };
      batches.push(batch);
      return batch;
    }),
    getBatch: vi.fn(async (id: number) => batches.find((b) => b.importBatchId === id) ?? null),
    findByValidationId: vi.fn(async (id: string) => batches.find((b) => b.summary.validationId === id) ?? null),
    listAccepted: vi.fn(async (scope, limit, before) => batches.filter((b) => b.status === 'ACCEPTED' && b.programmeId === scope.programmeId && b.learningCentreId === scope.learningCentreId && b.targetSemesterId === scope.targetSemesterId && (before === null || b.importBatchId < before)).sort((a, b) => b.importBatchId - a.importBatchId).slice(0, limit)),
    listStudents: vi.fn(async (_id: number, limit: number, after: number | null) => [1, 2, 3].filter((n) => after === null || n > after).slice(0, limit)
      .map((n) => ({ importedStudentId: n, externalReference: 'S' + n, studentName: n === 2 ? null : 'Student ' + n, curriculumVersion: '2024-DEMO', cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE' as const }))),
    acceptValidated: vi.fn(async (id: number, actor: string) => {
      const batch = batches.find((b) => b.importBatchId === id);
      if (!batch || batch.status !== 'VALIDATED') return null;
      batch.status = 'ACCEPTED'; batch.acceptedAt = '2026-11-01T11:00:00.000Z'; batch.acceptedBy = actor;
      batch.summary = { ...batch.summary, internal: { ...batch.summary.internal, subsetAcknowledgedBy: actor } };
      return batch;
    }),
  };
  return { repository, batches, stored };
}

function fixture(options: { roles?: ('STUDENT' | 'COORDINATOR' | 'SYSTEM_ADMIN')[]; scopes?: ScopeProvider; actor?: string } = {}) {
  const roles = options.roles ?? ['COORDINATOR'];
  const actor = options.actor ?? COORDINATOR;
  const fake = fakeRepository();
  const deps: ForecastingDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: actor, sessionId: 'session_test', primaryEmail: { address: 'coord@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => ({ clerkUserId: id, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    },
    repository: fake.repository,
    runs: {} as ForecastingDependencies["runs"],
    offerings: {} as ForecastingDependencies["offerings"],
    scopes: options.scopes ?? testScopeProvider,
    now: () => new Date('2026-11-01T12:00:00.000Z'),
  };
  return { deps, ...fake };
}
const URL_BASE = 'https://test.invalid/api/coordinator/';
const fields = { programmeId: '5', learningCentreId: '1', targetSemesterId: '2', sourceDate: '2026-10-30', sourceLabel: 'Registry export' };
function form(csv: string | Uint8Array, overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...fields, ...overrides })) if (value !== undefined) data.append(key, value);
  data.append('file', new File([csv as BlobPart], 'import.csv', { type: 'text/csv' }));
  return data;
}
const send = (deps: ForecastingDependencies, path: string, init: RequestInit = {}) =>
  handleForecastingRequest(new Request(URL_BASE + path, { headers: { Authorization: 'Bearer test-only', ...(init.headers as Record<string, string>) }, ...init }), deps) as Promise<Response>;
const upload = (deps: ForecastingDependencies, csv: string | Uint8Array, overrides?: Record<string, string | undefined>) =>
  send(deps, 'forecast-imports', { method: 'POST', body: form(csv, overrides) });
const accept = (deps: ForecastingDependencies, validationId: string, revision: string, bodyOverrides: Record<string, unknown> = {}, ifMatch: string | null = '"' + revision + '"') =>
  send(deps, `forecast-imports/${validationId}/subset-acceptances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ifMatch === null ? {} : { 'If-Match': ifMatch }) },
    body: JSON.stringify({ programmeId: 5, learningCentreId: 1, targetSemesterId: 2, validationRevision: revision, acknowledgeRejectedRows: true, ...bodyOverrides }),
  });
const denyScope: ScopeProvider = { ...assignedTo(), isScopeAssigned: vi.fn(async () => false) };

describe('role and ownership checks', () => {
  it.each([['STUDENT'], ['SYSTEM_ADMIN']] as const)('denies %s on every route before touching data', async (role) => {
    const { deps, repository } = fixture({ roles: [role] });
    for (const [path, method] of [['forecast-context', 'GET'], ['forecast-import-template', 'GET'], ['forecast-imports?programmeId=5&learningCentreId=1&targetSemesterId=2', 'GET'], ['forecast-imports/1', 'GET'], ['forecast-imports', 'POST']] as const) {
      const response = await send(deps, path, { method });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'ROLE_DENIED' } });
    }
    expect(repository.semesters).not.toHaveBeenCalled();
    expect(repository.storeImport).not.toHaveBeenCalled();
  });
  it('propagates unauthenticated sessions as 401', async () => {
    const { deps } = fixture();
    deps.auth.verify = vi.fn(async () => { const { AuthError } = await import('../auth/errors'); throw new AuthError(401, 'SESSION_INVALID', 'Sign in.'); });
    expect((await send(deps, 'forecast-context', { method: 'GET' })).status).toBe(401);
  });
  it('ignores unrelated paths so other coordinator modules can claim them', async () => {
    const { deps } = fixture();
    expect(await send(deps, 'something-else', { method: 'GET' })).toBeNull();
    expect(await handleForecastingRequest(new Request('https://test.invalid/api/admin/users'), deps)).toBeNull();
  });
  it('rejects unsupported methods', async () => {
    const { deps } = fixture();
    const response = await send(deps, 'forecast-imports', { method: 'DELETE' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, POST');
  });
});

describe('template and context', () => {
  it('downloads the exact template header as no-store CSV', async () => {
    const response = await send(fixture().deps, 'forecast-import-template', { method: 'GET' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.text()).trim()).toBe(header);
  });
  it('lists only assigned scopes and the target semester after the current one', async () => {
    const scopes: ScopeProvider = assignedTo([5, 2]);
    const { deps } = fixture({ scopes });
    const body = await (await send(deps, 'forecast-context', { method: 'GET' })).json();
    expect(body.data.programmes.map((p: { programmeId: number }) => p.programmeId)).toEqual([5]);
    expect(body.data.learningCentres.map((c: { learningCentreId: number }) => c.learningCentreId)).toEqual([2]);
    expect(body.data).toMatchObject({ currentSemesterId: 1, targetSemesterId: 2, assignedScopes: [{ programmeId: 5, learningCentreId: 2 }] });
    expect(body.data.targetSemesters).toEqual([{ semesterId: 2, academicYear: '2026/2027', semesterNumber: 2 }]);
    expect(body.data.subjects).toEqual([]);
  });
  it('adds curricula, subjects and prerequisite links for an assigned programme', async () => {
    const body = await (await send(fixture().deps, 'forecast-context?programmeId=5', { method: 'GET' })).json();
    expect(body.data.curricula).toEqual([{ curriculumId: 10, programmeId: 5, curriculumVersion: '2024-DEMO', effectiveYear: 2024 }]);
    const skip = body.data.subjects.find((s: { subjectCode: string }) => s.subjectCode === 'DEMO102');
    expect(skip).toMatchObject({ includeInOfferingForecast: false, exclusionReason: expect.any(String), prerequisiteLinks: [{ requirementType: 'MANDATORY' }], conditionalPrerequisites: { status: 'UNAVAILABLE' } });
  });
  it('denies a programme outside the assignment and reports an unconfigured one as not found', async () => {
    expect((await send(fixture({ scopes: denyScope }).deps, 'forecast-context?programmeId=5', { method: 'GET' })).status).toBe(403);
    const { deps } = fixture();
    deps.repository.catalogue = vi.fn(async () => null);
    expect((await send(deps, 'forecast-context?programmeId=5', { method: 'GET' })).status).toBe(404);
  });
  it('rejects bad or duplicate query parameters', async () => {
    const { deps } = fixture();
    for (const query of ['programmeId=0', 'programmeId=abc', 'programmeId=1&programmeId=2', 'other=1']) expect((await send(deps, 'forecast-context?' + query, { method: 'GET' })).status).toBe(400);
  });
  it('returns no scopes for a coordinator without assignments and still reports the semesters', async () => {
    const { deps } = fixture({ scopes: assignedTo() });
    const body = await (await send(deps, 'forecast-context', { method: 'GET' })).json();
    expect(body.data).toMatchObject({ programmes: [], learningCentres: [], assignedScopes: [], currentSemesterId: 1, targetSemesterId: 2 });
    expect((await send(deps, 'forecast-context?programmeId=5', { method: 'GET' })).status).toBe(403);
  });
  it('lists scopes for the verified actor only and applies a revocation on the very next request', async () => {
    let live = assignedTo([5, 1]);
    const scopes: ScopeProvider = { ...live, listScopes: (user) => live.listScopes(user), isScopeAssigned: (...args) => live.isScopeAssigned(...args) };
    const listScopes = vi.spyOn(scopes, 'listScopes');
    const { deps } = fixture({ scopes, actor: 'user_other' });
    const before = await (await send(deps, 'forecast-context', { method: 'GET' })).json();
    expect(before.data.assignedScopes).toEqual([{ programmeId: 5, learningCentreId: 1 }]);
    expect(listScopes).toHaveBeenCalledWith('user_other');
    live = assignedTo(); // assignment ended
    expect((await send(deps, 'forecast-context', { method: 'GET' })).status).toBe(200);
    expect((await upload(deps, validCsv)).status).toBe(403);
    expect((await send(deps, 'forecast-imports?programmeId=5&learningCentreId=1&targetSemesterId=2', { method: 'GET' })).status).toBe(403);
    expect((await send(deps, 'forecast-context?programmeId=5', { method: 'GET' })).status).toBe(403);
  });
  it('reports an empty target when no current semester is marked', async () => {
    const scopes: ScopeProvider = { ...testScopeProvider, currentSemesterId: vi.fn(async () => null) };
    const body = await (await send(fixture({ scopes }).deps, 'forecast-context', { method: 'GET' })).json();
    expect(body.data).toMatchObject({ targetSemesters: [], targetSemesterId: null, currentSemesterId: null });
  });
});

describe('upload', () => {
  it('accepts a fully valid file directly and stores fingerprint, summary, students and records', async () => {
    const { deps, stored } = fixture();
    const response = await upload(deps, validCsv);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { data } = await response.json();
    expect(data).toMatchObject({ importBatchId: 1, programmeId: 5, learningCentreId: 1, targetSemesterId: 2, sourceDate: '2026-10-30', snapshotStatus: 'ACCEPTED_IMMUTABLE' });
    expect(data.sourceFingerprint).toBe(await sha256Hex(validCsv));
    expect(data.validationReport).toMatchObject({ status: 'VALID', acceptedSnapshot: { importBatchId: 1, sourceFingerprint: data.sourceFingerprint } });
    expect(data.counts).toMatchObject({ studentRows: 2, uniqueStudents: 2, validAttempts: 1, rejectedRows: 0 });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ outcome: 'ACCEPTED', actor: COORDINATOR, programmeId: 5 });
    expect(stored[0]!.students.map((s) => s.externalReference)).toEqual(['S1', 'S2']);
    expect(stored[0]!.students.map((s) => s.studentName)).toEqual(['Alya', null]);
    expect(stored[0]!.records).toEqual([{ externalReference: 'S1', subjectId: 101, subjectStatus: 'COMPLETED', semesterId: 1, recognizedCredits: 3, isSynthetic: false }]);
    expect(stored[0]!.summary.internal).toMatchObject({ schemaVersion: 1, csvVersion: 1, dataRows: 2 });
    expect(JSON.stringify(data)).not.toContain('internal');
  });
  it('returns a 422 correction report with an ETag and stores the batch for acknowledgement', async () => {
    const { deps, stored } = fixture();
    const response = await upload(deps, errorCsv);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('IMPORT_CORRECTION_REQUIRED');
    expect(body.error.report).toMatchObject({ status: 'CORRECTION_REQUIRED', subsetAcknowledgementRequired: true, acceptedSnapshot: null, counts: { rejectedRows: 1, validAttempts: 1 } });
    expect(response.headers.get('ETag')).toBe('"' + body.error.report.validationRevision + '"');
    expect(stored[0]!.outcome).toBe('VALIDATED');
  });
  it('rejects a bad file as FILE_REJECTED without an ETag and records it as REJECTED', async () => {
    const { deps, stored } = fixture();
    const response = await upload(deps, 'wrong,header\n1,2');
    expect(response.status).toBe(422);
    expect(response.headers.get('ETag')).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: 'IMPORT_FILE_REJECTED', report: { status: 'FILE_REJECTED' } } });
    expect(stored[0]!.outcome).toBe('REJECTED');
    expect(stored[0]!.students).toEqual([]);
  });
  it('records a correction report with no usable students as REJECTED with no subset option', async () => {
    const { deps, stored } = fixture();
    const body = await (await upload(deps, [header, row('S1', '2024-DEMO', '', 'UNKNOWN')].join('\n'))).json();
    expect(body.error.report.subsetAcknowledgementRequired).toBe(false);
    expect(stored[0]!.outcome).toBe('REJECTED');
  });
  it('replays the original snapshot for an identical file in the same scope', async () => {
    const { deps, stored } = fixture();
    await upload(deps, validCsv);
    const response = await upload(deps, validCsv);
    expect(response.status).toBe(200);
    expect((await response.json()).data.importBatchId).toBe(1);
    expect(stored).toHaveLength(1);
  });
  it('accepts a raw text/csv body with the scope in the query string', async () => {
    const { deps } = fixture();
    const query = new URLSearchParams(fields).toString();
    const response = await send(deps, 'forecast-imports?' + query, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: validCsv });
    expect(response.status).toBe(201);
  });
  it('denies an unassigned scope before reading the catalogue or storing anything', async () => {
    const { deps, repository } = fixture({ scopes: denyScope });
    const response = await upload(deps, validCsv);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'SCOPE_NOT_ASSIGNED' } });
    expect(repository.catalogue).not.toHaveBeenCalled();
    expect(repository.storeImport).not.toHaveBeenCalled();
  });
  it('only allows the semester after the current one', async () => {
    const { deps, repository } = fixture();
    const response = await upload(deps, validCsv, { targetSemesterId: '3' });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'TARGET_SEMESTER_NOT_ALLOWED' } });
    expect(repository.storeImport).not.toHaveBeenCalled();
    const scopes: ScopeProvider = { ...testScopeProvider, currentSemesterId: vi.fn(async () => null) };
    expect((await upload(fixture({ scopes }).deps, validCsv)).status).toBe(409);
  });
  it('reports an unconfigured programme as not found', async () => {
    const { deps } = fixture();
    const response = await upload(deps, validCsv, { programmeId: '7' });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'SCOPE_NOT_FOUND' } });
  });
  it.each([
    ['missing programme', { programmeId: undefined }], ['bad centre', { learningCentreId: 'x' }], ['impossible date', { sourceDate: '2026-02-31' }],
    ['future date', { sourceDate: '2026-12-31' }], ['blank label', { sourceLabel: '  ' }], ['long label', { sourceLabel: 'x'.repeat(256) }], ['unknown field', { actor: 'user_other' }],
  ])('rejects invalid fields: %s', async (_name, overrides) => {
    const { deps, repository } = fixture();
    expect((await upload(deps, validCsv, overrides as Record<string, string | undefined>)).status).toBe(400);
    expect(repository.storeImport).not.toHaveBeenCalled();
  });
  it('requires the file and rejects other media types', async () => {
    const { deps } = fixture();
    const data = new FormData(); for (const [k, v] of Object.entries(fields)) data.append(k, v);
    expect((await send(deps, 'forecast-imports', { method: 'POST', body: data })).status).toBe(400);
    expect((await send(deps, 'forecast-imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(415);
  });
  it('limits the upload size by declared length and by actual bytes', async () => {
    const { deps, repository } = fixture();
    const big = new Uint8Array(IMPORT_LIMITS.maxBytes + 1).fill(65);
    expect((await upload(deps, big)).status).toBe(413);
    const declared = await send(deps, 'forecast-imports', { method: 'POST', headers: { 'Content-Type': 'text/csv', 'Content-Length': String(IMPORT_LIMITS.maxBytes + 1) }, body: 'x' });
    expect(declared.status).toBe(413);
    expect(await declared.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(repository.storeImport).not.toHaveBeenCalled();
  });
  it('rejects a streamed raw body that exceeds the limit without a Content-Length', async () => {
    const { deps } = fixture();
    const chunk = new Uint8Array(1024 * 1024).fill(65);
    const body = new ReadableStream({ start(controller) { for (let i = 0; i < 6; i += 1) controller.enqueue(chunk); controller.close(); } });
    const request = new Request(URL_BASE + 'forecast-imports?' + new URLSearchParams(fields).toString(), { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body, duplex: 'half' } as RequestInit);
    expect((await handleForecastingRequest(request, deps))!.status).toBe(413);
  });
  it('maps repository failures to safe stable errors without leaking text', async () => {
    const { deps } = fixture();
    deps.repository.storeImport = vi.fn(async () => { throw new ForecastingError('IMPORT_FAILED'); });
    const failed = await upload(deps, validCsv);
    expect(failed.status).toBe(500);
    deps.repository.catalogue = vi.fn(async () => { throw new Error('connection string postgres://secret'); });
    const unavailable = await upload(deps, validCsv);
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain('secret');
  });
});

describe('subset acceptance', () => {
  async function validated(deps: ForecastingDependencies) {
    const body = await (await upload(deps, errorCsv)).json();
    return body.error.report as { validationId: string; validationRevision: string };
  }
  it('accepts the remaining valid rows once, bound to the exact revision', async () => {
    const { deps, repository, batches } = fixture();
    const report = await validated(deps);
    const response = await accept(deps, report.validationId, report.validationRevision);
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({ importBatchId: 1, snapshotStatus: 'ACCEPTED_IMMUTABLE', counts: { rejectedRows: 1 }, validationReport: { subsetAcknowledgementRequired: true, acceptedSnapshot: { importBatchId: 1 } } });
    expect(repository.acceptValidated).toHaveBeenCalledWith(1, COORDINATOR);
    expect(batches[0]!.acceptedBy).toBe(COORDINATOR);
    // A retry after success replays the receipt without a second acceptance.
    expect((await accept(deps, report.validationId, report.validationRevision)).status).toBe(201);
    expect(repository.acceptValidated).toHaveBeenCalledTimes(1);
  });
  it('requires If-Match and rejects a stale or mismatched revision with 412', async () => {
    const { deps, repository } = fixture();
    const report = await validated(deps);
    expect(await (await accept(deps, report.validationId, report.validationRevision, {}, null)).json()).toMatchObject({ error: { code: 'IF_MATCH_REQUIRED' } });
    expect((await accept(deps, report.validationId, report.validationRevision, {}, 'not-quoted')).status).toBe(400);
    expect((await accept(deps, report.validationId, report.validationRevision, {}, '"sha256:old"')).status).toBe(412);
    expect((await accept(deps, report.validationId, report.validationRevision, { validationRevision: 'sha256:old' })).status).toBe(412);
    expect(repository.acceptValidated).not.toHaveBeenCalled();
  });
  it('validates the body strictly', async () => {
    const { deps } = fixture();
    const report = await validated(deps);
    for (const overrides of [{ acknowledgeRejectedRows: false }, { acknowledgeRejectedRows: 'true' }, { programmeId: '5' }, { extra: 1 }, { validationRevision: '' }]) {
      expect((await accept(deps, report.validationId, report.validationRevision, overrides)).status).toBe(400);
    }
    expect((await accept(deps, 'not-a-uuid', report.validationRevision)).status).toBe(400);
  });
  it('denies an unassigned scope and hides other coordinators uploads and mismatched scopes', async () => {
    const { deps } = fixture();
    const report = await validated(deps);
    expect((await accept(deps, report.validationId, report.validationRevision, { learningCentreId: 2 })).status).toBe(404);
    expect((await accept(deps, '00000000-0000-4000-8000-000000000000', report.validationRevision)).status).toBe(404);
    const other = fixture({ actor: 'user_other' });
    other.deps.repository = deps.repository;
    expect((await accept(other.deps, report.validationId, report.validationRevision)).status).toBe(404);
    const denied = { ...deps, scopes: denyScope };
    expect((await accept(denied, report.validationId, report.validationRevision)).status).toBe(403);
  });
  it('refuses fully valid, rejected or already accepted validations', async () => {
    const { deps, batches } = fixture();
    const ok = await (await upload(deps, validCsv)).json();
    const accepted = batches[0]!;
    expect((await accept(deps, accepted.summary.validationId, accepted.summary.validationRevision)).status).toBe(409);
    expect(ok.data.importBatchId).toBe(1);
    const rejected = await (await upload(deps, 'bad,header')).json();
    const rejectedBatch = batches[batches.length - 1]!;
    expect(rejected.error.code).toBe('IMPORT_FILE_REJECTED');
    expect((await accept(deps, rejectedBatch.summary.validationId, rejectedBatch.summary.validationRevision)).status).toBe(409);
  });
  it('returns a conflict when the database refuses a second acceptance', async () => {
    const { deps, repository } = fixture();
    const report = await validated(deps);
    repository.acceptValidated = vi.fn(async () => null);
    expect((await accept(deps, report.validationId, report.validationRevision)).status).toBe(409);
  });
});

describe('list and get', () => {
  async function seed(deps: ForecastingDependencies, count: number) {
    for (let i = 0; i < count; i += 1) await upload(deps, validCsv + '\n' + row('X' + i, '2024-DEMO', 'ACTIVE', 'UNKNOWN'));
  }
  const listPath = (extra = '') => 'forecast-imports?programmeId=5&learningCentreId=1&targetSemesterId=2' + extra;
  it('pages summaries newest first with an opaque cursor and omits reports', async () => {
    const { deps } = fixture();
    await seed(deps, 3);
    const first = (await (await send(deps, listPath('&limit=2'), { method: 'GET' })).json()).data;
    expect(first.items.map((i: { importBatchId: number }) => i.importBatchId)).toEqual([3, 2]);
    expect(first.items[0]).not.toHaveProperty('validationReport');
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (await (await send(deps, listPath('&limit=2&cursor=' + first.nextCursor), { method: 'GET' })).json()).data;
    expect(second.items.map((i: { importBatchId: number }) => i.importBatchId)).toEqual([1]);
    expect(second.nextCursor).toBeUndefined();
  });
  it('validates the scope, limit and cursor, and enforces assignment', async () => {
    const { deps } = fixture();
    for (const path of ['forecast-imports', listPath('&limit=0'), listPath('&limit=101'), listPath('&cursor=***'), listPath('&bogus=1')]) expect((await send(deps, path, { method: 'GET' })).status).toBe(400);
    expect((await send(fixture({ scopes: denyScope }).deps, listPath(), { method: 'GET' })).status).toBe(403);
  });
  it('gets an accepted import with its full report, hiding unassigned, pending and unknown ones', async () => {
    const { deps } = fixture();
    await seed(deps, 1);
    await upload(deps, errorCsv);
    const found = await send(deps, 'forecast-imports/1', { method: 'GET' });
    expect(found.status).toBe(200);
    expect((await found.json()).data.validationReport.status).toBe('VALID');
    expect((await send(deps, 'forecast-imports/2', { method: 'GET' })).status).toBe(404);
    expect((await send(deps, 'forecast-imports/99', { method: 'GET' })).status).toBe(404);
    const denied = await send({ ...deps, scopes: denyScope }, 'forecast-imports/1', { method: 'GET' });
    expect(denied.status).toBe(404);
  });
  it('pages the retained roster of an accepted import, names included, no-store, assignment-scoped', async () => {
    const { deps } = fixture();
    await upload(deps, validCsv);
    const first = await send(deps, 'forecast-imports/1/students?limit=2', { method: 'GET' });
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    const page = (await first.json()).data;
    expect(page.items.map((i: { studentName: string | null }) => i.studentName)).toEqual(['Student 1', null]);
    expect(page.nextCursor).toEqual(expect.any(String));
    const next = (await (await send(deps, 'forecast-imports/1/students?limit=2&cursor=' + page.nextCursor, { method: 'GET' })).json()).data;
    expect(next.items.map((i: { importedStudentId: number }) => i.importedStudentId)).toEqual([3]);
    expect((await send(deps, 'forecast-imports/9/students', { method: 'GET' })).status).toBe(404);
    expect((await send({ ...deps, scopes: denyScope }, 'forecast-imports/1/students', { method: 'GET' })).status).toBe(404);
    expect((await send(deps, 'forecast-imports/1/students?limit=101', { method: 'GET' })).status).toBe(400);
  });
});

describe('coordinator export format (S2-P004-010)', () => {
  const coordinatorHeader = 'courseCode,subjCode,centerName,stuname,stuMetricNo,eMail,SemesterMohon,grade,status';
  const crow = (course: string, subj: string, centre: string, matric: string, grade: string, status = 'A', semester = '2024/2025 1') =>
    csvLine([course, subj, centre, "'ALYA " + matric, matric, 'private@example.org', semester, grade, status]);
  const coordinatorCsv = [coordinatorHeader,
    crow('SECJH', 'DEMO101', 'KUALA LUMPUR', 'M1', 'B+'), crow('SECJH', 'DEMO101', 'KUALA LUMPUR', 'M2', 'E', 'A', '2023/2024 1'), crow('SECJH', 'DEMO101', 'KUALA LUMPUR', 'M2', 'EX', 'A', ''),
    crow('SCSJ', 'DEMO101', 'KUALA LUMPUR', 'M3', 'A'), crow('SECJH', 'DEMO101', 'JOHOR BAHRU', 'M4', 'A'), crow('SECJH', 'DEMO101', 'KUALA LUMPUR', 'M5', 'A', 'N'),
    crow('SECJH', 'DEMO101', 'KUALA LUMPUR', 'M6', 'NULL'), crow('SECJH', 'ULRS1022', 'KUALA LUMPUR', 'M1', 'A')].join('\n');

  it('serves a coordinator template (header plus two synthetic rows) next to the native one', async () => {
    const response = await send(fixture().deps, 'forecast-import-template?format=coordinator', { method: 'GET' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('uc20-import-template-coordinator.csv');
    const lines = (await response.text()).trim().split('\n');
    expect(lines[0]).toBe(coordinatorHeader);
    expect(lines).toHaveLength(3);
    expect((await send(fixture().deps, 'forecast-import-template?format=other', { method: 'GET' })).status).toBe(400);
  });
  it('accepts a coordinator export upload, skips what does not belong and reports the counts without the e-mail', async () => {
    const { deps, stored } = fixture();
    const response = await upload(deps, coordinatorCsv);
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.validationReport).toMatchObject({ format: 'COORDINATOR', coordinatorExport: {
      rowsRead: 8, skippedOtherProgramme: 1, skippedOtherCentre: 1, skippedInactive: 1, skippedInProgress: 1, olderAttemptsDropped: 1, skippedSubjectNotInCurriculum: 1,
      subjectsNotInCurriculum: [{ code: 'ULRS1022', count: 1 }],
    } });
    expect(data.counts).toMatchObject({ uniqueStudents: 2, validAttempts: 2 });
    expect(stored[0]!.students.map((s) => [s.externalReference, s.studentName, s.cohortStatus])).toEqual([['M1', 'ALYA M1', 'ACTIVE'], ['M2', 'ALYA M2', 'ACTIVE']]);
    expect(stored[0]!.records.map((r) => r.subjectStatus)).toEqual(['COMPLETED', 'EXEMPTED']);
    expect(JSON.stringify(data)).not.toContain('example.org');
    expect(JSON.stringify(stored)).not.toContain('example.org');
  });
  it('replays the same coordinator file and keeps native uploads unchanged', async () => {
    const { deps } = fixture();
    expect((await upload(deps, coordinatorCsv)).status).toBe(201);
    expect((await upload(deps, coordinatorCsv)).status).toBe(200);
    const native = await (await upload(fixture().deps, validCsv)).json();
    expect(native.data.validationReport).not.toHaveProperty('format');
  });
  it('returns the usual 422 correction report for coordinator rows with errors', async () => {
    const { deps } = fixture();
    const csv = [coordinatorHeader, crow('SECJH', 'DEMO101', 'KUALA LUMPUR', 'M1', 'A'), crow('SECJH', 'DEMO101', 'KUALA LUMPUR', '', 'A')].join('\n');
    const response = await upload(deps, csv);
    expect(response.status).toBe(422);
    const { error } = await response.json();
    expect(error.code).toBe('IMPORT_CORRECTION_REQUIRED');
    expect(error.report).toMatchObject({ format: 'COORDINATOR', subsetAcknowledgementRequired: true });
    expect(error.report.issues.find((i: { severity: string }) => i.severity === 'ERROR')).toMatchObject({ code: 'EXTERNAL_REFERENCE_REQUIRED', row: 3 });
  });
  it('uses only the selected programme and centre aliases', async () => {
    const { deps } = fixture();
    const response = await upload(deps, coordinatorCsv, { learningCentreId: '2' });
    expect(response.status).toBe(201);
    expect((await response.json()).data.validationReport.coordinatorExport).toMatchObject({ skippedOtherCentre: 6 });
  });
});
