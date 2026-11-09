import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CoordinatorApiError, createCoordinatorClient } from './client';
import { keepAccountSession } from '../auth/account-cache';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
beforeEach(() => keepAccountSession({ userId: 'user_coordinator_fixture', sessionId: 'session_fixture' }));
afterEach(() => { keepAccountSession(null); vi.unstubAllGlobals(); vi.useRealTimers(); });

const scope = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
const counts = { studentRows: 3, uniqueStudents: 2, validAttempts: 3, rejectedRows: 1, partialStudents: 0, unknownHistoryStudents: 0 };
const report = { validationId: '6f1c9d2e-0000-4000-8000-000000000001', validationRevision: 'sha256:abc', status: 'CORRECTION_REQUIRED', counts, issues: [], completenessChanges: [], subsetAcknowledgementRequired: true, acceptedSnapshot: null };
const accepted = { importBatchId: 9, ...scope, sourceDate: '2026-10-30', sourceLabel: 'Cohort', acceptedAt: '2026-11-01T00:00:00Z', sourceFingerprint: 'f', counts, snapshotStatus: 'ACCEPTED_IMMUTABLE', validationReport: { ...report, status: 'VALID' } };
const summary = { subjects: 1, excludedSubjects: 0, notOfferedInSemesterTypeSubjects: 0, configurationRequiredSubjects: 0, totalSupportedDemand: 1, totalUncertain: 0, totalSections: 1, pendingSections: 1, sectionsBelowMinimum: 0, sectionsBelowOptimal: 1, pendingSubjects: 1, subjectsBelowMinimum: 0 };
const detail = { forecastRunId: 3, importBatchId: 9, versionNumber: 1, status: 'DRAFT', revision: 'fr3.DRAFT.0', subjects: [], summary, ...scope };
const receipt = { resourceId: 3, ...scope, acceptedAt: '2026-11-01T00:00:00Z', revision: 'fr3.UNDER_REVIEW.1' };
const reply = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify({ data }), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
const client = () => createCoordinatorClient(async () => 'TEST_ONLY');
const headersOf = (fetcher: ReturnType<typeof vi.fn>) => (fetcher.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>;

it('reads with a live bearer token, no-store, no credentials and encoded scope query', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply({ items: [] })); vi.stubGlobal('fetch', fetcher);
  await client().listImports(scope, { limit: 20, cursor: 'abc' });
  expect(fetcher).toHaveBeenCalledWith('/api/coordinator/forecast-imports?programmeId=5&learningCentreId=1&targetSemesterId=2&limit=20&cursor=abc',
    expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer TEST_ONLY' } }));
});

it('loads the forecast context for a programme', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply({ programmes: [], learningCentres: [], targetSemesters: [], curricula: [], subjects: [] })); vi.stubGlobal('fetch', fetcher);
  await client().context(5);
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/forecast-context?programmeId=5');
});

it('downloads the template as text and takes the file name from Content-Disposition', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('a,b\n', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="uc20-import-template.csv"' } })));
  expect(await client().template()).toEqual({ filename: 'uc20-import-template.csv', text: 'a,b\n' });
});

it('asks for the coordinator template with the format query', async () => {
  const fetcher = vi.fn<Fetch>(async () => new Response('courseCode\n', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="uc20-import-template-coordinator.csv"' } })); vi.stubGlobal('fetch', fetcher);
  expect(await client().template('coordinator')).toEqual({ filename: 'uc20-import-template-coordinator.csv', text: 'courseCode\n' });
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/forecast-import-template?format=coordinator');
});

it('uploads multipart without a JSON content type and returns accepted/replayed imports', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(accepted, { status: 201 })); vi.stubGlobal('fetch', fetcher);
  const input = { ...scope, sourceDate: '2026-10-30', sourceLabel: 'Cohort', file: new File(['x'], 'cohort.csv', { type: 'text/csv' }) };
  expect(await client().uploadImport(input)).toMatchObject({ kind: 'ACCEPTED', replay: false });
  const init = fetcher.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get('sourceLabel')).toBe('Cohort');
  expect(headersOf(fetcher)).toEqual({ Authorization: 'Bearer TEST_ONLY', 'Idempotency-Key': expect.any(String) });
  fetcher.mockResolvedValueOnce(reply(accepted, { status: 200 }));
  expect(await client().uploadImport(input)).toMatchObject({ kind: 'ACCEPTED', replay: true });
});

it('maps a 422 correction report to an outcome with the ETag as revision', async () => {
  const body = { error: { code: 'IMPORT_CORRECTION_REQUIRED', message: 'Correct', report } };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 422, headers: { 'Content-Type': 'application/json', ETag: '"sha256:etag"' } })));
  const outcome = await client().uploadImport({ ...scope, sourceDate: '2026-10-30', sourceLabel: 'Cohort', file: new File(['x'], 'c.csv') });
  expect(outcome).toMatchObject({ kind: 'CORRECTION_REQUIRED', revision: 'sha256:etag' });
});

it('maps a rejected file to an outcome and other upload failures to errors', async () => {
  const rejected = { error: { code: 'IMPORT_FILE_REJECTED', message: 'No', report: { ...report, status: 'FILE_REJECTED', subsetAcknowledgementRequired: false } } };
  const fetcher = vi.fn<Fetch>(async () => new Response(JSON.stringify(rejected), { status: 422, headers: { 'Content-Type': 'application/json' } })); vi.stubGlobal('fetch', fetcher);
  const input = { ...scope, sourceDate: '2026-10-30', sourceLabel: 'Cohort', file: new File(['x'], 'c.csv') };
  expect(await client().uploadImport(input)).toMatchObject({ kind: 'FILE_REJECTED' });
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'TARGET_SEMESTER_NOT_ALLOWED', message: 'Wrong semester.' } }), { status: 422, headers: { 'Content-Type': 'application/json' } }));
  await expect(client().uploadImport(input)).rejects.toMatchObject({ status: 422, code: 'TARGET_SEMESTER_NOT_ALLOWED', message: 'Wrong semester.' });
});

it('accepts the valid subset with a quoted If-Match, the revision in the body and the acknowledgement', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(accepted, { status: 201 })); vi.stubGlobal('fetch', fetcher);
  await client().acceptSubset(scope, report, 'sha256:abc');
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/forecast-imports/' + report.validationId + '/subset-acceptances');
  expect(headersOf(fetcher)).toMatchObject({ 'If-Match': '"sha256:abc"', 'Content-Type': 'application/json', 'Idempotency-Key': expect.any(String) });
  expect(JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ ...scope, validationRevision: 'sha256:abc', acknowledgeRejectedRows: true });
});

it('generates a run: 201 is new, 200 is a replay of the existing run, ETag wins as revision', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(receipt, { status: 201, headers: { ETag: '"fr3.DRAFT.0"' } })); vi.stubGlobal('fetch', fetcher);
  const request = { ...scope, importBatchId: 9, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL' as const };
  expect(await client().generateRun(request)).toMatchObject({ created: true, revision: 'fr3.DRAFT.0', receipt: { resourceId: 3 } });
  expect(headersOf(fetcher)['If-Match']).toBeUndefined();
  expect(headersOf(fetcher)['Idempotency-Key']).toBeTruthy();
  fetcher.mockResolvedValueOnce(reply(receipt, { status: 200 }));
  expect(await client().generateRun(request)).toMatchObject({ created: false, revision: 'fr3.UNDER_REVIEW.1' });
});

it('uses a fresh Idempotency-Key for each mutation', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(receipt)); vi.stubGlobal('fetch', fetcher);
  await client().startReview(3, 'fr3.DRAFT.0', scope); const first = headersOf(fetcher)['Idempotency-Key'];
  await client().startReview(3, 'fr3.DRAFT.0', scope); expect(headersOf(fetcher)['Idempotency-Key']).not.toBe(first);
});

it('reads a run with its revision from the ETag header, falling back to the body', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(detail, { headers: { ETag: '"fr3.DRAFT.0"' } })); vi.stubGlobal('fetch', fetcher);
  expect(await client().getRun(3)).toMatchObject({ revision: 'fr3.DRAFT.0', run: { forecastRunId: 3 } });
  fetcher.mockResolvedValueOnce(reply({ ...detail, revision: 'fr3.UNDER_REVIEW.1' }));
  expect((await client().getRun(3)).revision).toBe('fr3.UNDER_REVIEW.1');
});

it.each([
  ['startReview', (c: ReturnType<typeof client>) => c.startReview(3, 'fr3.DRAFT.0', scope, 'Begin'), '/api/coordinator/forecast-runs/3/reviews', { scope, action: 'START_REVIEW', reason: 'Begin' }, '"fr3.DRAFT.0"'],
  ['decide', (c: ReturnType<typeof client>) => c.decide(3, 'fr3.UNDER_REVIEW.1', scope, [{ subjectId: 7, action: 'APPROVE', reason: 'Ok' }]), '/api/coordinator/forecast-runs/3/decisions', { scope, decisions: [{ subjectId: 7, action: 'APPROVE', reason: 'Ok' }] }, '"fr3.UNDER_REVIEW.1"'],
  ['finalize', (c: ReturnType<typeof client>) => c.finalize(3, 'fr3.UNDER_REVIEW.4', scope, { reason: 'Done' }), '/api/coordinator/forecast-runs/3/finalizations', { scope, reason: 'Done' }, '"fr3.UNDER_REVIEW.4"'],
])('%s posts JSON with a quoted If-Match', async (_name, call, path, body, ifMatch) => {
  const fetcher = vi.fn<Fetch>(async () => reply(receipt)); vi.stubGlobal('fetch', fetcher);
  await call(client());
  expect(fetcher.mock.calls[0]![0]).toBe(path);
  expect(headersOf(fetcher)).toMatchObject({ Authorization: 'Bearer TEST_ONLY', 'Content-Type': 'application/json', 'If-Match': ifMatch });
  expect(JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string)).toEqual(body);
});

it('keeps the stable error code, safe details and a readable message', async () => {
  const error = { error: { code: 'REVIEWS_INCOMPLETE', message: 'Every proposed section must be reviewed.', details: { pendingSubjectIds: [4, 9] } } };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(error), { status: 422, headers: { 'Content-Type': 'application/json' } })));
  const failure = await client().finalize(3, 'fr3.UNDER_REVIEW.4', scope, { reason: 'x' }).catch(value => value);
  expect(failure).toBeInstanceOf(CoordinatorApiError);
  expect(failure).toMatchObject({ status: 422, code: 'REVIEWS_INCOMPLETE', details: { pendingSubjectIds: [4, 9] } });
});

it('reports a 412 as RUN_REVISION_MISMATCH', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'RUN_REVISION_MISMATCH', message: 'Changed.' } }), { status: 412, headers: { 'Content-Type': 'application/json' } })));
  await expect(client().decide(3, 'fr3.DRAFT.0', scope, [])).rejects.toMatchObject({ status: 412, code: 'RUN_REVISION_MISMATCH' });
});

it.each([401, 403])('turns an unreadable %s into a typed error', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status })));
  await expect(client().context()).rejects.toMatchObject({ status, code: 'INVALID_RESPONSE' });
});

it('rejects a malformed success body instead of rendering it', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ forecastRunId: 'x' })));
  await expect(client().getRun(3)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

it('does not publish a response after the signed-in account changes', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const pending = client().listRuns(scope).then(() => null, error => error);
  await vi.waitFor(() => expect(finish).toBeDefined());
  keepAccountSession({ userId: 'someone_else', sessionId: 'another_session' });
  finish(reply({ items: [] }));
  expect(await pending).toMatchObject({ code: 'SESSION_CHANGED' });
});

it('bounds a stalled token and never sends a late request', async () => {
  vi.useFakeTimers(); let token!: (value: string) => void; const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const pending = createCoordinatorClient(() => new Promise<string>(resolve => { token = resolve; })).context().then(() => null, error => error);
  await vi.advanceTimersByTimeAsync(20000);
  expect(await pending).toMatchObject({ code: 'FORECASTING_TIMEOUT' });
  token('LATE'); await Promise.resolve(); expect(fetcher).not.toHaveBeenCalled();
});

const confirmationSet = { scope, pickDeadline: '2026-11-20T04:00:00.000Z', revision: 'oc1.3', forecastRunId: 3, pickWindow: 'OPEN', newerForecastAvailable: null, offerings: [] };
const confirmationReceipt = { resourceId: 1, ...scope, acceptedAt: '2026-11-01T00:00:00Z', revision: 'oc1.3' };

it('reads a confirmation, preferring the ETag as revision, and reports no revision before the first confirmation', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(confirmationSet, { headers: { ETag: '"oc1.9"' } })); vi.stubGlobal('fetch', fetcher);
  expect(await client().getConfirmation(scope)).toMatchObject({ revision: 'oc1.9', set: { forecastRunId: 3 } });
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/confirmed-offerings?programmeId=5&learningCentreId=1&targetSemesterId=2');
  fetcher.mockResolvedValueOnce(reply({ ...confirmationSet, revision: null, pickDeadline: null, offerings: [] }));
  expect(await client().getConfirmation(scope)).toMatchObject({ revision: null });
  fetcher.mockResolvedValueOnce(reply({ scope }));
  await expect(client().getConfirmation(scope)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

it('creates the first confirmation without If-Match and with baseRevision null', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(confirmationReceipt, { status: 201, headers: { ETag: '"oc1.3"' } })); vi.stubGlobal('fetch', fetcher);
  const result = await client().confirmOfferings({ scope, forecastRunId: 3, subjectIds: [101, 102], reason: 'Offered', pickDeadline: '2026-11-20T04:00:00.000Z', revision: null });
  expect(result).toMatchObject({ created: true, revision: 'oc1.3' });
  const init = fetcher.mock.calls[0]![1] as RequestInit;
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/confirmed-offerings');
  expect(headersOf(fetcher)).toEqual({ Authorization: 'Bearer TEST_ONLY', 'Content-Type': 'application/json', 'Idempotency-Key': expect.any(String) });
  expect(JSON.parse(init.body as string)).toEqual({ scope, forecastRunId: 3, subjectIds: [101, 102], reason: 'Offered', baseRevision: null, pickDeadline: '2026-11-20T04:00:00.000Z' });
});

it('sends the quoted revision in If-Match and baseRevision for later confirm, withdraw and deadline changes', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply(confirmationReceipt)); vi.stubGlobal('fetch', fetcher);
  await client().confirmOfferings({ scope, forecastRunId: 3, subjectIds: [103], reason: 'Add', pickDeadline: '2026-11-20T04:00:00.000Z', revision: 'oc1.3' });
  expect(headersOf(fetcher)['If-Match']).toBe('"oc1.3"');
  expect(JSON.parse((fetcher.mock.calls.at(-1)![1] as RequestInit).body as string).baseRevision).toBe('oc1.3');
  await client().withdrawOfferings(scope, 'oc1.3', [101], 'Not enough demand');
  expect(fetcher.mock.calls.at(-1)![0]).toBe('/api/coordinator/confirmed-offerings/withdrawals');
  expect(headersOf(fetcher)['If-Match']).toBe('"oc1.3"');
  expect(JSON.parse((fetcher.mock.calls.at(-1)![1] as RequestInit).body as string)).toEqual({ scope, subjectIds: [101], reason: 'Not enough demand', baseRevision: 'oc1.3' });
  await client().setPickDeadline(scope, 'oc1.3', { pickDeadline: '2026-11-25T04:00:00.000Z', reason: 'More time', forecastRunId: 4 });
  expect(fetcher.mock.calls.at(-1)![0]).toBe('/api/coordinator/confirmed-offerings/pick-deadline');
  expect(JSON.parse((fetcher.mock.calls.at(-1)![1] as RequestInit).body as string)).toEqual({ scope, pickDeadline: '2026-11-25T04:00:00.000Z', reason: 'More time', baseRevision: 'oc1.3', forecastRunId: 4 });
  await client().setPickDeadline(scope, 'oc1.3', { pickDeadline: '2026-11-25T04:00:00.000Z', reason: 'More time' });
  expect(JSON.parse((fetcher.mock.calls.at(-1)![1] as RequestInit).body as string)).not.toHaveProperty('forecastRunId');
});

it('surfaces confirmation errors with their stable code, status and safe details', async () => {
  const body = { error: { code: 'SUBJECT_EXCLUDED', message: 'Excluded.', details: { subjectIds: [104] } } };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 422, headers: { 'Content-Type': 'application/json' } })));
  await expect(client().confirmOfferings({ scope, forecastRunId: 3, subjectIds: [104], reason: 'x', pickDeadline: '2026-11-20T04:00:00.000Z', revision: null }))
    .rejects.toMatchObject({ status: 422, code: 'SUBJECT_EXCLUDED', details: { subjectIds: [104] } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'CONFIRMATION_REVISION_MISMATCH', message: 'Changed.' } }), { status: 412, headers: { 'Content-Type': 'application/json' } })));
  await expect(client().withdrawOfferings(scope, 'oc1.1', [101], 'x')).rejects.toBeInstanceOf(CoordinatorApiError);
});

it('pages the confirmation audit and reads honest pick counts', async () => {
  const fetcher = vi.fn<Fetch>(async () => reply({ items: [{ auditId: 5, action: 'CONFIRM', recordedAt: '2026-11-01T00:00:00Z' }], nextCursor: 'NQ' })); vi.stubGlobal('fetch', fetcher);
  expect(await client().listConfirmationAudit(scope, { limit: 20, cursor: 'abc' })).toMatchObject({ nextCursor: 'NQ' });
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/confirmed-offerings/audit?programmeId=5&learningCentreId=1&targetSemesterId=2&limit=20&cursor=abc');
  fetcher.mockResolvedValueOnce(reply({ scope, asOf: '2026-11-01T00:00:00Z', pickDeadline: null, picksAvailable: false, counts: [] }));
  expect(await client().pickCounts(scope)).toMatchObject({ picksAvailable: false });
  expect(fetcher.mock.calls.at(-1)![0]).toBe('/api/coordinator/offering-pick-counts?programmeId=5&learningCentreId=1&targetSemesterId=2');
});

it('creates a system-students snapshot with a JSON body, an idempotency key and 201 or 200 replay', async () => {
  const systemSnapshot = { ...accepted, source: 'SYSTEM', sourceLabel: 'System students' };
  const fetcher = vi.fn<Fetch>(async () => reply(systemSnapshot, { status: 201 })); vi.stubGlobal('fetch', fetcher);
  expect(await client().createSystemSnapshot(scope)).toMatchObject({ replay: false, data: { source: 'SYSTEM', importBatchId: 9 } });
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/forecast-imports/system-snapshots');
  const init = fetcher.mock.calls[0]![1] as RequestInit;
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual(scope);
  expect(headersOf(fetcher)).toEqual({ Authorization: 'Bearer TEST_ONLY', 'Content-Type': 'application/json', 'Idempotency-Key': expect.any(String) });
  fetcher.mockResolvedValueOnce(reply(systemSnapshot, { status: 200 }));
  expect(await client().createSystemSnapshot({ ...scope, sourceLabel: 'Intake' })).toMatchObject({ replay: true });
  expect(JSON.parse((fetcher.mock.calls[1]![1] as RequestInit).body as string)).toEqual({ ...scope, sourceLabel: 'Intake' });
});

it('surfaces an empty system snapshot as a typed error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'SYSTEM_SNAPSHOT_EMPTY', message: 'No students match.' } }), { status: 422, headers: { 'Content-Type': 'application/json' } })));
  await expect(client().createSystemSnapshot(scope)).rejects.toMatchObject({ status: 422, code: 'SYSTEM_SNAPSHOT_EMPTY' });
});

it('uploads the combined snapshot as multipart to its own endpoint, with replay and the 422 correction outcome', async () => {
  const combined = { ...accepted, source: 'COMBINED', sourceLabel: 'Both' };
  const fetcher = vi.fn<Fetch>(async () => reply(combined, { status: 201 })); vi.stubGlobal('fetch', fetcher);
  const input = { ...scope, sourceDate: '2026-10-30', sourceLabel: 'Both', file: new File(['x'], 'both.csv', { type: 'text/csv' }) };
  expect(await client().uploadCombined(input)).toMatchObject({ kind: 'ACCEPTED', replay: false, data: { source: 'COMBINED' } });
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/forecast-imports/combined-snapshots');
  const init = fetcher.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  expect(headersOf(fetcher)).toEqual({ Authorization: 'Bearer TEST_ONLY', 'Idempotency-Key': expect.any(String) });
  fetcher.mockResolvedValueOnce(reply(combined, { status: 200 }));
  expect(await client().uploadCombined(input)).toMatchObject({ replay: true });
  const body = { error: { code: 'IMPORT_CORRECTION_REQUIRED', message: 'Correct', report: { ...report, source: 'COMBINED' } } };
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 422, headers: { 'Content-Type': 'application/json', ETag: '"sha256:combined"' } }));
  expect(await client().uploadCombined(input)).toMatchObject({ kind: 'CORRECTION_REQUIRED', revision: 'sha256:combined' });
});
it('reads initial demand from an accepted snapshot using the exact assigned scope', async () => {
  const data = { scope, importBatchId: 9, threshold: 30, studentsInCohort: 50, ambiguousDuplicateReferences: 0, unresolvedCurriculumStudents: 0,
    sourceFingerprint: 'source', catalogueFingerprint: 'catalogue', revision: 'revision', subjects: [], qualifiedSubjectIds: [] };
  const fetcher = vi.fn<Fetch>(async () => reply(data)); vi.stubGlobal('fetch', fetcher);
  expect(await client().initialDemand(scope, 9)).toEqual(data);
  expect(fetcher.mock.calls[0]![0]).toBe('/api/coordinator/initial-demand?programmeId=5&learningCentreId=1&targetSemesterId=2&importBatchId=9');
  fetcher.mockResolvedValueOnce(reply({ ...data, subjects: [{ subjectId: 1, outcome: 'QUALIFIED' }] }));
  await expect(client().initialDemand(scope, 9)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
