import type { InitialDemandProjection } from '../../../../../packages/shared/src/forecasting/initial-demand';
import { accountSessionStamp, clearAccountCache } from '../auth/account-cache';
import type {
  AcceptedImport, ForecastContext, ForecastScope, ImportListData, ImportStudentListData, ImportValidationReport, OperationReceipt, Paginated,
  ForecastAuditEntry, SystemSnapshotRequest,
} from '../../../../../packages/shared/src/forecasting/contracts';
import type {
  ConfirmedOfferingAuditEntry, ConfirmedOfferingSet, OfferingPickCountSummary,
} from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import type {
  FinalizeRunRequest, ForecastRunDetail, ForecastRunSummary, GenerateRunRequest, RunDecision, RunDecisionBatchRequest, RunSubjectStudents, StartRunReviewRequest,
} from '../../../../../packages/shared/src/forecasting/runs';

/** Every non-2xx answer, timeout or unreadable body. `details` carries safe ids such as `pendingSubjectIds`; `report` the 422 import report. */
export class CoordinatorApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, unknown>, public report?: ImportValidationReport, public etag?: string) { super(message); }
}

export type UploadOutcome =
  | { kind: 'ACCEPTED'; replay: boolean; data: AcceptedImport }
  | { kind: 'CORRECTION_REQUIRED'; report: ImportValidationReport; revision: string }
  | { kind: 'FILE_REJECTED'; report: ImportValidationReport };
export interface UploadInput extends ForecastScope { sourceDate: string; sourceLabel: string; file: File }
export interface SystemSnapshotOutcome { replay: boolean; data: AcceptedImport }
export interface RunWithRevision { run: ForecastRunDetail; revision: string }
export interface MutationResult { receipt: OperationReceipt; revision: string; created: boolean }
export interface PageQuery { limit?: number; cursor?: string }
/** `revision` is null until the first confirmation of the scope exists. */
export interface ConfirmationWithRevision { set: ConfirmedOfferingSet; revision: string | null }
export interface ConfirmOfferingsInput { scope: ForecastScope; forecastRunId: number; subjectIds: number[]; reason: string; pickDeadline: string; revision: string | null }

export interface CoordinatorClient {
  initialDemand(scope: ForecastScope, importBatchId: number, signal?: AbortSignal): Promise<InitialDemandProjection>;
  context(programmeId?: number, signal?: AbortSignal): Promise<ForecastContext>;
  template(format?: 'native' | 'coordinator', signal?: AbortSignal): Promise<{ filename: string; text: string }>;
  uploadImport(input: UploadInput, signal?: AbortSignal): Promise<UploadOutcome>;
  /** "Both": the students in the system plus the CSV students not already there, one snapshot. Same outcomes as `uploadImport`; subset acceptance uses `acceptSubset`. */
  uploadCombined(input: UploadInput, signal?: AbortSignal): Promise<UploadOutcome>;
  /** Snapshot of the students in the system (main data source); 201 created, 200 replay of the same data. */
  createSystemSnapshot(request: SystemSnapshotRequest, signal?: AbortSignal): Promise<SystemSnapshotOutcome>;
  acceptSubset(scope: ForecastScope, report: Pick<ImportValidationReport, 'validationId' | 'validationRevision'>, revision: string): Promise<AcceptedImport>;
  listImports(scope: ForecastScope, page?: PageQuery, signal?: AbortSignal): Promise<ImportListData>;
  getImport(importBatchId: number, signal?: AbortSignal): Promise<AcceptedImport>;
  listStudents(importBatchId: number, page?: PageQuery, signal?: AbortSignal): Promise<ImportStudentListData>;
  generateRun(request: GenerateRunRequest): Promise<MutationResult>;
  listRuns(scope: ForecastScope, page?: PageQuery, signal?: AbortSignal): Promise<Paginated<ForecastRunSummary>>;
  getRun(forecastRunId: number, signal?: AbortSignal): Promise<RunWithRevision>;
  listAudit(forecastRunId: number, page?: PageQuery, signal?: AbortSignal): Promise<Paginated<ForecastAuditEntry>>;
  /** View only: the students behind one subject's numbers. */
  getSubjectStudents(forecastRunId: number, subjectId: number, signal?: AbortSignal): Promise<RunSubjectStudents>;
  startReview(forecastRunId: number, revision: string, scope: ForecastScope, reason?: string): Promise<MutationResult>;
  decide(forecastRunId: number, revision: string, scope: ForecastScope, decisions: RunDecision[]): Promise<MutationResult>;
  finalize(forecastRunId: number, revision: string, scope: ForecastScope, input?: { reason?: string; approvalReference?: string }): Promise<MutationResult>;
  getConfirmation(scope: ForecastScope, signal?: AbortSignal): Promise<ConfirmationWithRevision>;
  listConfirmationAudit(scope: ForecastScope, page?: PageQuery, signal?: AbortSignal): Promise<Paginated<ConfirmedOfferingAuditEntry>>;
  pickCounts(scope: ForecastScope, signal?: AbortSignal): Promise<OfferingPickCountSummary>;
  confirmOfferings(input: ConfirmOfferingsInput): Promise<MutationResult>;
  withdrawOfferings(scope: ForecastScope, revision: string, subjectIds: number[], reason: string): Promise<MutationResult>;
  setPickDeadline(scope: ForecastScope, revision: string, input: { pickDeadline: string; reason: string; forecastRunId?: number }): Promise<MutationResult>;
}

const BAD = 'Forecasting data could not be read. Please retry.';
function invalid(): never { throw new CoordinatorApiError(502, 'INVALID_RESPONSE', BAD); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function requireKeys(value: unknown, numbers: string[], strings: string[], lists: string[]) {
  const item = object(value);
  for (const key of numbers) if (typeof item[key] !== 'number') invalid();
  for (const key of strings) if (typeof item[key] !== 'string') invalid();
  for (const key of lists) if (!Array.isArray(item[key])) invalid();
  return item;
}
function page<T>(value: unknown, read: (item: unknown) => void): Paginated<T> {
  const data = requireKeys(value, [], [], ['items']);
  (data.items as unknown[]).forEach(read);
  if (data.nextCursor !== undefined && typeof data.nextCursor !== 'string') invalid();
  return data as unknown as Paginated<T>;
}
function acceptedImport(value: unknown) { requireKeys(value, ['importBatchId', 'programmeId', 'learningCentreId', 'targetSemesterId'], ['sourceDate', 'sourceLabel'], []); object(object(value).counts); return value as AcceptedImport; }
function report(value: unknown): ImportValidationReport {
  const item = requireKeys(value, [], ['validationId', 'validationRevision', 'status'], ['issues']);
  object(item.counts);
  return item as unknown as ImportValidationReport;
}
function receipt(value: unknown) { requireKeys(value, ['resourceId'], ['acceptedAt', 'revision'], []); return value as OperationReceipt; }
function runDetail(value: unknown) { requireKeys(value, ['forecastRunId', 'versionNumber'], ['status', 'revision'], ['subjects']); object(object(value).summary); return value as ForecastRunDetail; }
function subjectStudents(value: unknown) { requireKeys(value, ['forecastRunId', 'subjectId'], ['subjectCode'], ['students']); object(object(value).summary); return value as RunSubjectStudents; }
function runSummary(value: unknown) { requireKeys(value, ['forecastRunId', 'versionNumber'], ['status', 'revision'], []); object(object(value).summary); }
function confirmationSet(value: unknown) { requireKeys(value, [], [], ['offerings']); object(object(value).scope); return value as ConfirmedOfferingSet; }
function query(values: object) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') parameters.set(key, String(value));
  const text = parameters.toString();
  return text ? '?' + text : '';
}
const scopeQuery = (scope: ForecastScope, page: PageQuery = {}) => query({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId, limit: page.limit, cursor: page.cursor });
/** Callers may pass richer scope objects (labels); the API accepts only the three ids. */
const plainScope = (scope: ForecastScope): ForecastScope => ({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId });
const unquote = (etag: string | null) => etag ? etag.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1') : null;
const quote = (revision: string) => '"' + revision.replace(/"/g, '') + '"';
function idempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

interface Raw { status: number; etag: string | null; data: unknown; disposition: string | null }
interface Init { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: BodyInit; text?: boolean; timeoutMs?: number }

export function createCoordinatorClient(getToken: () => Promise<string | null>, baseUrl = ''): CoordinatorClient {
  const base = baseUrl.replace(/\/+$/, '');
  async function request(path: string, init: Init, signal?: AbortSignal): Promise<Raw> {
    const expected = accountSessionStamp(), controller = new AbortController();
    const assertSession = () => { if (expected !== accountSessionStamp()) throw new CoordinatorApiError(401, 'SESSION_CHANGED', 'Your account changed. Reload this page.'); };
    const cancel = () => controller.abort(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    let abort!: () => void;
    const stopped = new Promise<never>((_resolve, reject) => { abort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', abort, { once: true }); if (controller.signal.aborted) abort(); });
    const timer = setTimeout(() => controller.abort(new CoordinatorApiError(503, 'FORECASTING_TIMEOUT', 'Forecasting is taking too long. Please retry.')), init.timeoutMs ?? 20000);
    const run = async (): Promise<Raw> => {
      assertSession();
      const token = await getToken(); assertSession();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!token) { clearAccountCache(); throw new CoordinatorApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again.'); }
      const response = await fetch(base + path, { method: init.method, headers: { Authorization: 'Bearer ' + token, ...init.headers }, body: init.body, credentials: 'omit', cache: 'no-store', signal: controller.signal });
      assertSession();
      if ([401, 403].includes(response.status)) clearAccountCache();
      const etag = unquote(response.headers.get('ETag')), disposition = response.headers.get('Content-Disposition');
      if (response.ok && init.text) return { status: response.status, etag, data: await response.text(), disposition };
      let body: Record<string, unknown>;
      try { body = object(await response.json()); }
      catch { throw new CoordinatorApiError(response.status || 503, 'INVALID_RESPONSE', BAD); }
      assertSession();
      if (!response.ok) {
        const error = body.error && typeof body.error === 'object' ? object(body.error) : {};
        const details = error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details as Record<string, unknown> : undefined;
        let reportBody: ImportValidationReport | undefined;
        try { if (error.report) reportBody = report(error.report); } catch { reportBody = undefined; }
        throw new CoordinatorApiError(response.status, typeof error.code === 'string' ? error.code : 'FORECASTING_UNAVAILABLE',
          typeof error.message === 'string' ? error.message : 'Forecasting data is unavailable. Please retry.', details, reportBody, etag ?? undefined);
      }
      return { status: response.status, etag, data: body.data, disposition };
    };
    try { return await Promise.race([run(), stopped]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', abort); }
  }
  const prefix = '/api/coordinator/';
  const json = (body: unknown) => JSON.stringify(body);
  const jsonHeaders = (revision?: string): Record<string, string> => ({ 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey(), ...(revision ? { 'If-Match': quote(revision) } : {}) });
  async function mutate(path: string, revision: string | undefined, body: unknown): Promise<MutationResult> {
    const raw = await request(prefix + path, { method: 'POST', headers: jsonHeaders(revision), body: json(body) });
    const data = receipt(raw.data);
    return { receipt: data, revision: raw.etag ?? data.revision, created: raw.status === 201 };
  }
  async function upload(path: string, input: UploadInput, signal?: AbortSignal): Promise<UploadOutcome> {
    const form = new FormData();
    form.set('programmeId', String(input.programmeId)); form.set('learningCentreId', String(input.learningCentreId)); form.set('targetSemesterId', String(input.targetSemesterId));
    form.set('sourceDate', input.sourceDate); form.set('sourceLabel', input.sourceLabel); form.set('file', input.file);
    try {
      const raw = await request(prefix + path, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: form, timeoutMs: 60000 }, signal);
      return { kind: 'ACCEPTED', replay: raw.status === 200, data: acceptedImport(raw.data) };
    } catch (error) {
      if (error instanceof CoordinatorApiError && error.report) {
        if (error.code === 'IMPORT_CORRECTION_REQUIRED') return { kind: 'CORRECTION_REQUIRED', report: error.report, revision: error.etag ?? error.report.validationRevision };
        if (error.code === 'IMPORT_FILE_REJECTED') return { kind: 'FILE_REJECTED', report: error.report };
      }
      throw error;
    }
  }
  return {
    initialDemand: async (scope, importBatchId, signal) => {
      const raw = (await request(prefix + 'initial-demand' + query({ ...plainScope(scope), importBatchId }), { method: 'GET' }, signal)).data;
      const data = requireKeys(raw, ['importBatchId', 'threshold', 'studentsInCohort', 'ambiguousDuplicateReferences', 'unresolvedCurriculumStudents'], ['sourceFingerprint', 'catalogueFingerprint', 'revision'], ['subjects', 'qualifiedSubjectIds']);
      requireKeys(data.scope, ['programmeId', 'learningCentreId', 'targetSemesterId'], [], []);
      for (const item of data.subjects as unknown[]) {
        const row = requireKeys(item, ['subjectId', 'creditHours', 'eligibleDistinctCount', 'uncertainDistinctCount', 'passedCount', 'prerequisiteNotMetCount', 'notOfferedCount'], ['subjectCode', 'subjectName', 'outcome'], []);
        if (!['QUALIFIED', 'BELOW_THRESHOLD', 'UNCERTAIN'].includes(String(row.outcome)) || typeof row.excluded !== 'boolean') invalid();
        object(row.uncertaintyReasonCounts);
      }
      return data as unknown as InitialDemandProjection;
    },
    context: async (programmeId, signal) => {
      const data = requireKeys((await request(prefix + 'forecast-context' + query({ programmeId }), { method: 'GET' }, signal)).data, [], [], ['programmes', 'learningCentres', 'targetSemesters']);
      return data as unknown as ForecastContext;
    },
    template: async (format, signal) => {
      const raw = await request(prefix + 'forecast-import-template' + (format === 'coordinator' ? '?format=coordinator' : ''), { method: 'GET', text: true }, signal);
      const name = /filename="?([^";]+)"?/.exec(raw.disposition ?? '')?.[1];
      return { filename: name ?? (format === 'coordinator' ? 'uc20-import-template-coordinator.csv' : 'uc20-import-template.csv'), text: String(raw.data) };
    },
    uploadImport: (input, signal) => upload('forecast-imports', input, signal),
    uploadCombined: (input, signal) => upload('forecast-imports/combined-snapshots', input, signal),
    createSystemSnapshot: async (input, signal) => {
      const raw = await request(prefix + 'forecast-imports/system-snapshots', {
        method: 'POST', headers: jsonHeaders(), timeoutMs: 60000,
        body: json({ programmeId: input.programmeId, learningCentreId: input.learningCentreId, targetSemesterId: input.targetSemesterId, ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}) }),
      }, signal);
      return { replay: raw.status === 200, data: acceptedImport(raw.data) };
    },
    acceptSubset: async (scope, validation, revision) => {
      const raw = await request(prefix + 'forecast-imports/' + encodeURIComponent(validation.validationId) + '/subset-acceptances', {
        method: 'POST', headers: jsonHeaders(revision),
        body: json({ programmeId: scope.programmeId, learningCentreId: scope.learningCentreId, targetSemesterId: scope.targetSemesterId, validationRevision: validation.validationRevision, acknowledgeRejectedRows: true }),
      });
      return acceptedImport(raw.data);
    },
    listImports: async (scope, paging, signal) => page((await request(prefix + 'forecast-imports' + scopeQuery(scope, paging), { method: 'GET' }, signal)).data, item => requireKeys(item, ['importBatchId'], ['sourceLabel'], [])) as ImportListData,
    getImport: async (id, signal) => acceptedImport((await request(prefix + 'forecast-imports/' + id, { method: 'GET' }, signal)).data),
    listStudents: async (id, paging, signal) => page((await request(prefix + 'forecast-imports/' + id + '/students' + query({ limit: paging?.limit, cursor: paging?.cursor }), { method: 'GET' }, signal)).data, item => requireKeys(item, ['importedStudentId'], ['externalReference'], [])) as ImportStudentListData,
    generateRun: request0 => mutate('forecast-runs', undefined, request0),
    listRuns: async (scope, paging, signal) => page<ForecastRunSummary>((await request(prefix + 'forecast-runs' + scopeQuery(scope, paging), { method: 'GET' }, signal)).data, runSummary),
    getRun: async (id, signal) => {
      const raw = await request(prefix + 'forecast-runs/' + id, { method: 'GET' }, signal);
      const run = runDetail(raw.data);
      return { run, revision: raw.etag ?? run.revision };
    },
    getSubjectStudents: async (id, subjectId, signal) => subjectStudents((await request(prefix + 'forecast-runs/' + id + '/subjects/' + subjectId + '/students', { method: 'GET' }, signal)).data),
    listAudit: async (id, paging, signal) => page<ForecastAuditEntry>((await request(prefix + 'forecast-runs/' + id + '/audit' + query({ limit: paging?.limit, cursor: paging?.cursor }), { method: 'GET' }, signal)).data, item => requireKeys(item, ['decisionAuditId'], ['actionType', 'recordedAt'], [])),
    startReview: (id, revision, scope, reason) => mutate('forecast-runs/' + id + '/reviews', revision, { scope, action: 'START_REVIEW', ...(reason ? { reason } : {}) } satisfies StartRunReviewRequest),
    decide: (id, revision, scope, decisions) => mutate('forecast-runs/' + id + '/decisions', revision, { scope, decisions } satisfies RunDecisionBatchRequest),
    getConfirmation: async (scope, signal) => {
      const raw = await request(prefix + 'confirmed-offerings' + scopeQuery(scope), { method: 'GET' }, signal);
      const set = confirmationSet(raw.data);
      return { set, revision: set.revision === null ? null : raw.etag ?? set.revision };
    },
    listConfirmationAudit: async (scope, paging, signal) => page<ConfirmedOfferingAuditEntry>((await request(prefix + 'confirmed-offerings/audit' + scopeQuery(scope, paging), { method: 'GET' }, signal)).data, item => requireKeys(item, ['auditId'], ['action', 'recordedAt'], [])),
    pickCounts: async (scope, signal) => {
      const data = requireKeys((await request(prefix + 'offering-pick-counts' + scopeQuery(scope), { method: 'GET' }, signal)).data, [], [], ['counts']);
      return data as unknown as OfferingPickCountSummary;
    },
    confirmOfferings: input => mutate('confirmed-offerings', input.revision ?? undefined, {
      scope: plainScope(input.scope), forecastRunId: input.forecastRunId, subjectIds: input.subjectIds, reason: input.reason, baseRevision: input.revision, pickDeadline: input.pickDeadline,
    }),
    withdrawOfferings: (scope, revision, subjectIds, reason) => mutate('confirmed-offerings/withdrawals', revision, { scope: plainScope(scope), subjectIds, reason, baseRevision: revision }),
    setPickDeadline: (scope, revision, input) => mutate('confirmed-offerings/pick-deadline', revision, {
      scope: plainScope(scope), pickDeadline: input.pickDeadline, reason: input.reason, baseRevision: revision, ...(input.forecastRunId ? { forecastRunId: input.forecastRunId } : {}),
    }),
    finalize: (id, revision, scope, input) => mutate('forecast-runs/' + id + '/finalizations', revision, { scope, ...(input?.reason ? { reason: input.reason } : {}), ...(input?.approvalReference ? { approvalReference: input.approvalReference } : {}) } satisfies FinalizeRunRequest),
  };
}
