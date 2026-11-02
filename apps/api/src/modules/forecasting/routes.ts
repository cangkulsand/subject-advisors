import { authorize, AuthError, authErrorResponse, authJson } from '../auth';
import { IMPORT_CSV_HEADER, IMPORT_LIMITS } from '../../../../../packages/shared/src/forecasting/contracts';
import type {
  AcceptedImport, ForecastContext, ForecastScope, ForecastSubjectOption, ImportSummary, ImportValidationReport, SemesterOption,
} from '../../../../../packages/shared/src/forecasting/contracts';
import { nextSemesterAfter } from '../../../../../packages/shared/src/offerings/confirmed-offerings';
import type { ForecastingDependencies, ImportBatchRow, StoredValidationSummary } from './contracts';
import { ForecastingError } from './errors';
import { bad, decodeCursor, encodeCursor, errorResponse, methodNotAllowed, noStore, onlyParameters, positive, readBounded, readJson, sha256Hex } from './http';
import { handleOfferingRoute, OFFERING_ROUTE } from './offerings-routes';
import { handleRunRoute, RUN_ROUTE } from './runs-routes';
import { combinedFingerprint, combinedSummary, mergeCombined } from './combined-snapshot';
import { sourceOf, studentSourceOf } from './import-source';
import { buildSystemSnapshot, readSystemSnapshotRequest, systemSummary } from './system-snapshot';
import { validateImportCsv } from './validation';

export { sha256Hex };

const PREFIX = '/api/coordinator/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Multipart framing overhead allowed on top of the 5 MiB file limit. */
const MULTIPART_OVERHEAD_BYTES = 256 * 1024;
const UPLOAD_FIELDS = ['programmeId', 'learningCentreId', 'targetSemesterId', 'sourceDate', 'sourceLabel'] as const;

function isRealDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000-') && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
}

interface UploadInput extends ForecastScope { sourceDate: string; sourceLabel: string; bytes: Uint8Array }
/** Accepts the documented multipart form (file + fields) or a raw text/csv body with the fields in the query string. */
async function readUpload(request: Request, url: URL, now: Date): Promise<UploadInput> {
  const contentType = request.headers.get('content-type') ?? '';
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  const fields: Record<string, string> = {};
  let bytes: Uint8Array;
  if (type === 'multipart/form-data') {
    onlyParameters(url, []);
    const raw = await readBounded(request, IMPORT_LIMITS.maxBytes + MULTIPART_OVERHEAD_BYTES);
    let form: FormData;
    try { form = await new Response(raw as BodyInit, { headers: { 'content-type': contentType } }).formData(); }
    catch { return bad('The multipart form could not be read.'); }
    let file: File | undefined;
    for (const key of new Set(form.keys())) {
      const values = form.getAll(key);
      if (values.length !== 1) bad('Duplicate form field ' + key + '.');
      const value = values[0]!;
      if (key === 'file') {
        if (typeof value === 'string') bad('The file field must be a file.');
        file = value as File;
      } else if ((UPLOAD_FIELDS as readonly string[]).includes(key) && typeof value === 'string') fields[key] = value;
      else bad('Unsupported form field ' + key + '.');
    }
    if (!file) bad('Attach the CSV as the file field.');
    if (file.size > IMPORT_LIMITS.maxBytes) throw new ForecastingError('PAYLOAD_TOO_LARGE');
    bytes = new Uint8Array(await file.arrayBuffer());
  } else if (type === 'text/csv') {
    onlyParameters(url, UPLOAD_FIELDS);
    for (const key of UPLOAD_FIELDS) { const value = url.searchParams.get(key); if (value !== null) fields[key] = value; }
    bytes = await readBounded(request, IMPORT_LIMITS.maxBytes);
  } else throw new ForecastingError('UNSUPPORTED_MEDIA_TYPE');
  const key = request.headers.get('idempotency-key');
  if (key !== null && (key.length < 1 || key.length > 128)) bad('Idempotency-Key must be 1-128 characters.');
  const sourceDate = fields.sourceDate ?? '';
  if (!isRealDate(sourceDate)) bad('sourceDate must be a valid YYYY-MM-DD date.');
  if (Date.parse(sourceDate + 'T00:00:00.000Z') > now.getTime() + 86_400_000) bad('sourceDate cannot be in the future.');
  const sourceLabel = (fields.sourceLabel ?? '').trim();
  if (!sourceLabel || sourceLabel.length > IMPORT_LIMITS.maxSourceLabelLength || /[\u0000-\u001f\u007f]/.test(sourceLabel)) bad('sourceLabel must be 1-255 printable characters.');
  return {
    programmeId: positive(fields.programmeId, 'programmeId'), learningCentreId: positive(fields.learningCentreId, 'learningCentreId'),
    targetSemesterId: positive(fields.targetSemesterId, 'targetSemesterId'), sourceDate, sourceLabel, bytes,
  };
}

function reportOf(batch: ImportBatchRow): ImportValidationReport {
  const report: Omit<StoredValidationSummary, 'internal'> & { internal?: unknown } = { ...batch.summary };
  delete report.internal; // private engine inputs are never returned
  return {
    ...report,
    acceptedSnapshot: batch.status === 'ACCEPTED' && batch.acceptedAt
      ? { importBatchId: batch.importBatchId, acceptedAt: batch.acceptedAt, sourceFingerprint: batch.sourceFingerprint } : null,
  };
}
function summaryOf(batch: ImportBatchRow): ImportSummary {
  if (batch.status !== 'ACCEPTED' || !batch.acceptedAt) throw new ForecastingError('IMPORT_NOT_FOUND');
  return {
    importBatchId: batch.importBatchId, programmeId: batch.programmeId, learningCentreId: batch.learningCentreId, targetSemesterId: batch.targetSemesterId,
    sourceDate: batch.sourceDate, sourceLabel: batch.sourceLabel, acceptedAt: batch.acceptedAt, sourceFingerprint: batch.sourceFingerprint,
    source: sourceOf(batch), counts: batch.summary.counts, snapshotStatus: 'ACCEPTED_IMMUTABLE',
  };
}
const acceptedOf = (batch: ImportBatchRow): AcceptedImport => ({ ...summaryOf(batch), validationReport: reportOf(batch) });

/** Validation-failure envelope: { error: { code, message, report } }. */
function validationResponse(report: ImportValidationReport, etag: string | null): Response {
  const rejected = report.status === 'FILE_REJECTED';
  const response = noStore(Response.json({ error: {
    code: rejected ? 'IMPORT_FILE_REJECTED' : 'IMPORT_CORRECTION_REQUIRED',
    message: rejected ? 'The file could not be read. Correct it and upload again.' : 'Correct the rejected rows, or explicitly acknowledge them to accept the remaining valid rows.',
    report,
  } }, { status: 422 }));
  if (etag) response.headers.set('ETag', '"' + etag + '"');
  return response;
}
function ifMatchValue(request: Request): string {
  const header = request.headers.get('if-match');
  if (!header) throw new ForecastingError('IF_MATCH_REQUIRED');
  const value = header.trim().replace(/^W\//, '');
  const match = /^"([^"]{1,200})"$/.exec(value);
  if (!match) bad('If-Match must be a quoted validation revision.');
  return match[1]!;
}

async function resolveTarget(deps: ForecastingDependencies): Promise<{ currentSemesterId: number | null; target: SemesterOption | null }> {
  const [currentSemesterId, semesters] = await Promise.all([deps.scopes.currentSemesterId(), deps.repository.semesters()]);
  if (currentSemesterId === null) return { currentSemesterId, target: null };
  const next = nextSemesterAfter(String(currentSemesterId), semesters.map((s) => ({ semesterId: String(s.semesterId), academicYear: s.academicYear, semesterNo: s.semesterNumber })));
  const target = next ? semesters.find((s) => String(s.semesterId) === next.semesterId) ?? null : null;
  return { currentSemesterId, target };
}

async function assignedScopes(deps: ForecastingDependencies, actor: string) {
  const all = await deps.scopes.listScopes();
  const flags = await Promise.all(all.map((scope) => deps.scopes.isScopeAssigned(actor, scope.programme.programmeId, scope.centre.learningCentreId)));
  return all.filter((_, index) => flags[index]);
}
async function requireScope(deps: ForecastingDependencies, actor: string, scope: Pick<ForecastScope, 'programmeId' | 'learningCentreId'>) {
  if (!(await deps.scopes.isScopeAssigned(actor, scope.programmeId, scope.learningCentreId))) throw new ForecastingError('SCOPE_NOT_ASSIGNED');
}

async function forecastContext(deps: ForecastingDependencies, actor: string, programmeId: number | null): Promise<ForecastContext> {
  const scopes = await assignedScopes(deps, actor);
  const programmes = [...new Map(scopes.map((s) => [s.programme.programmeId, s.programme])).values()];
  const learningCentres = [...new Map(scopes.map((s) => [s.centre.learningCentreId, s.centre])).values()];
  const { currentSemesterId, target } = await resolveTarget(deps);
  const context: ForecastContext = {
    programmes, learningCentres, targetSemesters: target ? [target] : [],
    assignedScopes: scopes.map((s) => ({ programmeId: s.programme.programmeId, learningCentreId: s.centre.learningCentreId })),
    currentSemesterId, targetSemesterId: target?.semesterId ?? null, curricula: [], subjects: [],
  };
  if (programmeId === null) return context;
  if (!programmes.some((p) => p.programmeId === programmeId)) throw new ForecastingError('SCOPE_NOT_ASSIGNED');
  const catalogue = await deps.repository.catalogue(programmeId);
  if (!catalogue) throw new ForecastingError('SCOPE_NOT_FOUND');
  context.curricula = catalogue.curricula.map((c) => ({ curriculumId: c.curriculumId, programmeId, curriculumVersion: c.curriculumVersion, effectiveYear: c.effectiveYear }));
  context.subjects = catalogue.curricula.flatMap((c) => c.subjects.map((s): ForecastSubjectOption => ({
    curriculumSubjectId: s.curriculumSubjectId, curriculumId: c.curriculumId, subjectId: s.subjectId, subjectCode: s.subjectCode, subjectName: s.subjectName,
    creditHours: s.creditHours, classType: s.classType, includeInOfferingForecast: s.includeInOfferingForecast,
    exclusionReason: s.includeInOfferingForecast ? null : 'Excluded from the offering forecast in the subject catalogue.',
    prerequisiteLinks: catalogue.prerequisites.filter((p) => p.curriculumSubjectId === s.curriculumSubjectId),
    conditionalPrerequisites: { status: 'UNAVAILABLE', reason: 'Conditional prerequisite rules are resolved by the forecast engine, not by the import context.' },
  })));
  return context;
}

async function upload(request: Request, url: URL, deps: ForecastingDependencies, actor: string): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const input = await readUpload(request, url, now);
  await requireScope(deps, actor, input);
  const { target } = await resolveTarget(deps);
  if (!target) throw new ForecastingError('TARGET_SEMESTER_UNAVAILABLE');
  if (target.semesterId !== input.targetSemesterId) throw new ForecastingError('TARGET_SEMESTER_NOT_ALLOWED');
  const catalogue = await deps.repository.catalogue(input.programmeId);
  if (!catalogue) throw new ForecastingError('SCOPE_NOT_FOUND');
  const sourceFingerprint = await sha256Hex(input.bytes);
  // The same bytes for the same scope already accepted: replay the original snapshot instead of creating a duplicate.
  const existing = await deps.repository.findAcceptedByFingerprint(input, sourceFingerprint);
  if (existing) return authJson({ data: acceptedOf(existing) }, 200);

  const outcome = validateImportCsv(input.bytes, catalogue);
  const validationRevision = 'sha256:' + await sha256Hex(JSON.stringify([sourceFingerprint, input.programmeId, input.learningCentreId, input.targetSemesterId, outcome.report]));
  const validationId = crypto.randomUUID();
  const status = outcome.report.status === 'VALID' ? 'ACCEPTED' : outcome.report.status === 'CORRECTION_REQUIRED' && outcome.students.length ? 'VALIDATED' : 'REJECTED';
  const summary: StoredValidationSummary = {
    validationId, validationRevision, ...outcome.report,
    internal: { schemaVersion: 1, csvVersion: 1, dataRows: outcome.dataRows, rejectedRowsByStudent: outcome.rejectedRowsByStudent },
  };
  const stored = await deps.repository.storeImport({
    programmeId: input.programmeId, learningCentreId: input.learningCentreId, targetSemesterId: input.targetSemesterId,
    validationId, sourceDate: input.sourceDate, sourceLabel: input.sourceLabel, actor, sourceFingerprint,
    outcome: status, summary, students: outcome.students, records: outcome.records,
  });
  if (stored.status === 'ACCEPTED') return authJson({ data: acceptedOf(stored) }, 201);
  return validationResponse(reportOf(stored), stored.status === 'VALIDATED' ? validationRevision : null);
}

/** Builds an ACCEPTED snapshot from the students in the system. Same fingerprint in the same scope replays the existing snapshot (200). */
async function systemSnapshot(request: Request, deps: ForecastingDependencies, actor: string): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const input = await readSystemSnapshotRequest(request);
  await requireScope(deps, actor, input);
  const { target } = await resolveTarget(deps);
  if (!target) throw new ForecastingError('TARGET_SEMESTER_UNAVAILABLE');
  if (target.semesterId !== input.targetSemesterId) throw new ForecastingError('TARGET_SEMESTER_NOT_ALLOWED');
  const catalogue = await deps.repository.catalogue(input.programmeId);
  if (!catalogue) throw new ForecastingError('SCOPE_NOT_FOUND');
  const built = await buildSystemSnapshot(await deps.repository.systemStudents(input.programmeId), catalogue, input.learningCentreId, (studentId) => deps.scopes.studentLearningCentreId(studentId));
  if (built.students.length === 0) throw new ForecastingError('SYSTEM_SNAPSHOT_EMPTY');
  const existing = await deps.repository.findAcceptedByFingerprint(input, built.fingerprint);
  if (existing) return authJson({ data: acceptedOf(existing) }, 200);
  const validationId = crypto.randomUUID();
  const stored = await deps.repository.storeImport({
    programmeId: input.programmeId, learningCentreId: input.learningCentreId, targetSemesterId: input.targetSemesterId, validationId,
    sourceDate: now.toISOString().slice(0, 10), sourceLabel: input.sourceLabel, actor, sourceFingerprint: built.fingerprint, outcome: 'ACCEPTED',
    summary: await systemSummary(built, input, validationId), students: built.students, records: built.records,
  });
  return authJson({ data: acceptedOf(stored) }, 201);
}

/**
 * Builds ONE snapshot from the students in the system plus the uploaded CSV students who are not already there (MT9).
 * The CSV part is validated exactly like `upload`. Rows to correct give the same 422 + ETag; the VALIDATED batch already holds the final
 * combined students, so the existing subset-acceptance endpoint accepts it unchanged. Same inputs replay (200).
 */
async function combinedSnapshot(request: Request, url: URL, deps: ForecastingDependencies, actor: string): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const input = await readUpload(request, url, now);
  await requireScope(deps, actor, input);
  const { target } = await resolveTarget(deps);
  if (!target) throw new ForecastingError('TARGET_SEMESTER_UNAVAILABLE');
  if (target.semesterId !== input.targetSemesterId) throw new ForecastingError('TARGET_SEMESTER_NOT_ALLOWED');
  const catalogue = await deps.repository.catalogue(input.programmeId);
  if (!catalogue) throw new ForecastingError('SCOPE_NOT_FOUND');
  const system = await buildSystemSnapshot(await deps.repository.systemStudents(input.programmeId), catalogue, input.learningCentreId, (studentId) => deps.scopes.studentLearningCentreId(studentId));
  const csvFingerprint = await sha256Hex(input.bytes);
  const fingerprint = await combinedFingerprint(csvFingerprint, system, input);
  const existing = await deps.repository.findAcceptedByFingerprint(input, fingerprint);
  if (existing) return authJson({ data: acceptedOf(existing) }, 200);

  const outcome = validateImportCsv(input.bytes, catalogue);
  const rejectedFile = outcome.report.status === 'FILE_REJECTED';
  const merge = mergeCombined(system, rejectedFile ? { ...outcome, students: [], records: [] } : outcome);
  const validationId = crypto.randomUUID();
  const summary = await combinedSummary(system, outcome, merge, input, validationId, fingerprint);
  const status = rejectedFile || merge.students.length === 0 ? 'REJECTED' : outcome.report.status === 'VALID' ? 'ACCEPTED' : 'VALIDATED';
  const stored = await deps.repository.storeImport({
    programmeId: input.programmeId, learningCentreId: input.learningCentreId, targetSemesterId: input.targetSemesterId, validationId,
    sourceDate: input.sourceDate, sourceLabel: input.sourceLabel, actor, sourceFingerprint: fingerprint,
    outcome: status, summary, students: status === 'REJECTED' ? [] : merge.students, records: status === 'REJECTED' ? [] : merge.records,
  });
  if (stored.status === 'ACCEPTED') return authJson({ data: acceptedOf(stored) }, 201);
  return validationResponse(reportOf(stored), stored.status === 'VALIDATED' ? summary.validationRevision : null);
}

async function acceptSubset(request: Request, validationId: string, deps: ForecastingDependencies, actor: string): Promise<Response> {
  if (!UUID.test(validationId)) bad('Invalid validation ID.');
  const header = ifMatchValue(request);
  const body = await readJson(request);
  const allowed = ['programmeId', 'learningCentreId', 'targetSemesterId', 'validationRevision', 'acknowledgeRejectedRows'];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || allowed.some((key) => !(key in body))) bad('The request must contain exactly the documented fields.');
  if (body.acknowledgeRejectedRows !== true) bad('acknowledgeRejectedRows must be true.');
  if (typeof body.validationRevision !== 'string' || !body.validationRevision) bad('validationRevision is required.');
  const idOf = (key: string) => typeof body[key] === 'number' && Number.isInteger(body[key]) ? positive(String(body[key]), key) : bad(key + ' must be a positive integer.');
  const scope: ForecastScope = { programmeId: idOf('programmeId'), learningCentreId: idOf('learningCentreId'), targetSemesterId: idOf('targetSemesterId') };
  await requireScope(deps, actor, scope);
  const batch = await deps.repository.findByValidationId(validationId);
  // Only the uploading Coordinator may acknowledge; anyone else (or a scope mismatch) sees nothing.
  if (!batch || batch.providedBy !== actor || batch.programmeId !== scope.programmeId || batch.learningCentreId !== scope.learningCentreId || batch.targetSemesterId !== scope.targetSemesterId) {
    throw new ForecastingError('IMPORT_NOT_FOUND');
  }
  const revision = batch.summary.validationRevision;
  if (header !== revision || body.validationRevision !== revision) throw new ForecastingError('IMPORT_REVISION_MISMATCH');
  if (batch.status === 'ACCEPTED' && batch.summary.internal.subsetAcknowledgedBy === actor) return authJson({ data: acceptedOf(batch) }, 201); // retry after success
  if (batch.status !== 'VALIDATED') throw new ForecastingError('IMPORT_STATE_CONFLICT');
  if (!batch.summary.subsetAcknowledgementRequired || batch.summary.status !== 'CORRECTION_REQUIRED') throw new ForecastingError('IMPORT_NOT_SUBSET_ACCEPTABLE');
  const accepted = await deps.repository.acceptValidated(batch.importBatchId, actor);
  if (!accepted) throw new ForecastingError('IMPORT_STATE_CONFLICT');
  return authJson({ data: acceptedOf(accepted) }, 201);
}

export async function handleForecastingRequest(request: Request, deps: ForecastingDependencies): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const route = url.pathname.slice(PREFIX.length);
  const importId = /^forecast-imports\/([1-9]\d*)$/.exec(route);
  const students = /^forecast-imports\/([1-9]\d*)\/students$/.exec(route);
  const subset = /^forecast-imports\/([^/]+)\/subset-acceptances$/.exec(route);
  const known = ['forecast-context', 'forecast-import-template', 'forecast-imports', 'forecast-imports/system-snapshots', 'forecast-imports/combined-snapshots'].includes(route) || importId || students || subset || RUN_ROUTE.test(route) || OFFERING_ROUTE.test(route);
  if (!known) return null;
  try {
    // Coordinator only. The actor is always the verified Clerk user of the session, never a request value.
    const actor = (await authorize(request, deps.auth, { roles: ['COORDINATOR'] })).clerkUserId;
    const method = request.method;
    if (RUN_ROUTE.test(route)) return await handleRunRoute(route, request, url, deps, actor);
    if (OFFERING_ROUTE.test(route)) return await handleOfferingRoute(route, request, url, deps, actor);
    if (route === 'forecast-context') {
      if (method !== 'GET') return methodNotAllowed(['GET']);
      onlyParameters(url, ['programmeId']);
      const programmeId = url.searchParams.has('programmeId') ? positive(url.searchParams.get('programmeId'), 'programmeId') : null;
      return authJson({ data: await forecastContext(deps, actor, programmeId) });
    }
    if (route === 'forecast-import-template') {
      if (method !== 'GET') return methodNotAllowed(['GET']);
      onlyParameters(url, []);
      return noStore(new Response(IMPORT_CSV_HEADER.join(',') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="uc20-import-template.csv"' } }));
    }
    if (route === 'forecast-imports/system-snapshots') {
      if (method !== 'POST') return methodNotAllowed(['POST']);
      onlyParameters(url, []);
      return await systemSnapshot(request, deps, actor);
    }
    if (route === 'forecast-imports/combined-snapshots') {
      if (method !== 'POST') return methodNotAllowed(['POST']);
      return await combinedSnapshot(request, url, deps, actor);
    }
    if (route === 'forecast-imports') {
      if (method === 'POST') return await upload(request, url, deps, actor);
      if (method !== 'GET') return methodNotAllowed(['GET', 'POST']);
      onlyParameters(url, ['programmeId', 'learningCentreId', 'targetSemesterId', 'limit', 'cursor']);
      const scope: ForecastScope = { programmeId: positive(url.searchParams.get('programmeId'), 'programmeId'), learningCentreId: positive(url.searchParams.get('learningCentreId'), 'learningCentreId'), targetSemesterId: positive(url.searchParams.get('targetSemesterId'), 'targetSemesterId') };
      const limit = url.searchParams.has('limit') ? positive(url.searchParams.get('limit'), 'limit') : 50;
      if (limit > 100) bad('limit must be between 1 and 100.');
      const cursor = url.searchParams.has('cursor') ? decodeCursor(url.searchParams.get('cursor')!) : null;
      await requireScope(deps, actor, scope);
      const rows = await deps.repository.listAccepted(scope, limit + 1, cursor);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return authJson({ data: { items: page.map(summaryOf), ...(rows.length > limit && last ? { nextCursor: encodeCursor(last.importBatchId) } : {}) } });
    }
    if (importId) {
      if (method !== 'GET') return methodNotAllowed(['GET']);
      onlyParameters(url, []);
      const batch = await deps.repository.getBatch(Number(importId[1]));
      // Unassigned scopes and non-accepted batches are indistinguishable from absent ones.
      if (!batch || batch.status !== 'ACCEPTED' || !(await deps.scopes.isScopeAssigned(actor, batch.programmeId, batch.learningCentreId))) throw new ForecastingError('IMPORT_NOT_FOUND');
      return authJson({ data: acceptedOf(batch) });
    }
    if (students) {
      if (method !== 'GET') return methodNotAllowed(['GET']);
      onlyParameters(url, ['limit', 'cursor']);
      const limit = url.searchParams.has('limit') ? positive(url.searchParams.get('limit'), 'limit') : 50;
      if (limit > 100) bad('limit must be between 1 and 100.');
      const cursor = url.searchParams.has('cursor') ? decodeCursor(url.searchParams.get('cursor')!) : null;
      const batch = await deps.repository.getBatch(Number(students[1]));
      if (!batch || batch.status !== 'ACCEPTED' || !(await deps.scopes.isScopeAssigned(actor, batch.programmeId, batch.learningCentreId))) throw new ForecastingError('IMPORT_NOT_FOUND');
      const rows = await deps.repository.listStudents(batch.importBatchId, limit + 1, cursor);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return authJson({ data: { items: page.map((row) => ({ ...row, source: studentSourceOf(batch, row.externalReference) })), ...(rows.length > limit && last ? { nextCursor: encodeCursor(last.importedStudentId) } : {}) } });
    }
    if (method !== 'POST') return methodNotAllowed(['POST']);
    onlyParameters(url, []);
    return await acceptSubset(request, subset![1]!, deps, actor);
  } catch (error) {
    if (error instanceof ForecastingError) return errorResponse(error);
    if (error instanceof AuthError) return authErrorResponse(error);
    return errorResponse(new ForecastingError('FORECASTING_UNAVAILABLE'));
  }
}
