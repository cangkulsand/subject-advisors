import { authJson } from '../auth';
import type { ForecastScope, OperationReceipt } from '../../../../../packages/shared/src/forecasting/contracts';
import {
  isPickWindowOpen, validateConfirmOfferingsRequest, validateSetPickDeadlineRequest, validateWithdrawOfferingsRequest,
} from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import type {
  ConfirmationValidationResult, ConfirmedOffering, ConfirmedOfferingSet, OfferingPickCountSummary,
} from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import { nextSemesterAfter } from '../../../../../packages/shared/src/offerings/confirmed-offerings';
import { RUN_LIMITS } from '../../../../../packages/shared/src/forecasting/runs';
import type { ForecastingDependencies } from './contracts';
import { ForecastingError } from './errors';
import { assumptionsFor } from './runs-view';
import { bad, decodeCursor, encodeCursor, methodNotAllowed, onlyParameters, positive, readJson } from './http';
import type { ConfirmationHeader, ConfirmationRows } from './offerings-contracts';
import { newerOf } from './runs-view';
import type { RunRecord } from './runs-contracts';

export const OFFERING_ROUTE = /^(confirmed-offerings(?:\/(withdrawals|pick-deadline|audit))?|offering-pick-counts)$/;
const MAX_REASON = 500;
const MAX_SUBJECTS = 200;

export const confirmationRevision = (header: Pick<ConfirmationHeader, 'confirmationId' | 'revision'>) => 'oc' + header.confirmationId + '.' + header.revision;
const scopeOfHeader = (header: ConfirmationHeader): ForecastScope => ({ programmeId: header.programmeId, learningCentreId: header.learningCentreId, targetSemesterId: header.targetSemesterId });
const scopeOfRun = (run: RunRecord): ForecastScope => ({ programmeId: run.programmeId, learningCentreId: run.learningCentreId, targetSemesterId: run.targetSemesterId });
const now = (deps: ForecastingDependencies) => (deps.now ?? (() => new Date()))();

function checkIdempotencyKey(request: Request) {
  const key = request.headers.get('idempotency-key');
  if (key !== null && (key.length < 1 || key.length > 128)) bad('Idempotency-Key must be 1-128 characters.');
}
/** Null when the header is absent. */
function ifMatchRevision(request: Request): string | null {
  const header = request.headers.get('if-match');
  if (header === null) return null;
  const match = /^"([^"]{1,200})"$/.exec(header.trim().replace(/^W\//, ''));
  if (!match) bad('If-Match must be the quoted revision of the confirmation.');
  return match![1]!;
}
const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;

function parseScope(value: unknown): ForecastScope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad('scope is required.');
  const scope = value as Record<string, unknown>;
  if (Object.keys(scope).some((key) => !['programmeId', 'learningCentreId', 'targetSemesterId'].includes(key))) bad('scope may only contain programmeId, learningCentreId and targetSemesterId.');
  if (!isId(scope.programmeId) || !isId(scope.learningCentreId) || !isId(scope.targetSemesterId)) bad('scope IDs must be positive integers.');
  return { programmeId: scope.programmeId as number, learningCentreId: scope.learningCentreId as number, targetSemesterId: scope.targetSemesterId as number };
}
function queryScope(url: URL): ForecastScope {
  return {
    programmeId: positive(url.searchParams.get('programmeId'), 'programmeId'), learningCentreId: positive(url.searchParams.get('learningCentreId'), 'learningCentreId'),
    targetSemesterId: positive(url.searchParams.get('targetSemesterId'), 'targetSemesterId'),
  };
}
function parseSubjectIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SUBJECTS || !value.every(isId)) return bad('subjectIds must contain 1-' + MAX_SUBJECTS + ' positive integers.');
  if (new Set(value).size !== value.length) bad('subjectIds must be unique.');
  return value as number[];
}
function parseReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new ForecastingError('CONFIRMATION_REASON_REQUIRED');
  const reason = value.trim();
  if (reason.length > MAX_REASON || new RegExp('[\u0000-\u001f\u007f]').test(reason)) throw new ForecastingError('CONFIRMATION_REASON_REQUIRED');
  return reason;
}
function parseDeadline(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40 || Number.isNaN(Date.parse(value))) throw new ForecastingError('PICK_DEADLINE_INVALID');
  return new Date(value).toISOString();
}
function onlyKeys(body: Record<string, unknown>, allowed: string[], required: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key)) || required.some((key) => !(key in body))) bad('The request must contain exactly the documented fields.');
}
/** Maps the structural validators of the shared contract to stable API errors (the body shape was already checked). */
function requireValid(result: ConfirmationValidationResult) {
  if (result.ok) return;
  const codes = result.issues.map((issue) => issue.code);
  if (codes.includes('REASON_REQUIRED')) throw new ForecastingError('CONFIRMATION_REASON_REQUIRED');
  if (codes.includes('DEADLINE_INVALID')) throw new ForecastingError('PICK_DEADLINE_INVALID');
  bad(result.issues[0]!.message);
}

async function requireScope(deps: ForecastingDependencies, actor: string, scope: ForecastScope) {
  if (!(await deps.scopes.isScopeAssigned(actor, scope.programmeId, scope.learningCentreId))) throw new ForecastingError('SCOPE_NOT_ASSIGNED');
}
/** Changes are only allowed for the semester after the current one, exactly like imports. */
async function requireTargetSemester(deps: ForecastingDependencies, scope: ForecastScope) {
  const [currentSemesterId, semesters] = await Promise.all([deps.scopes.currentSemesterId(), deps.repository.semesters()]);
  if (currentSemesterId === null) throw new ForecastingError('TARGET_SEMESTER_UNAVAILABLE');
  const next = nextSemesterAfter(String(currentSemesterId), semesters.map((s) => ({ semesterId: String(s.semesterId), academicYear: s.academicYear, semesterNo: s.semesterNumber })));
  if (!next || next.semesterId !== String(scope.targetSemesterId)) throw new ForecastingError('TARGET_SEMESTER_NOT_ALLOWED');
}

function receipt(header: ConfirmationHeader, status: number, deps: ForecastingDependencies): Response {
  const revision = confirmationRevision(header);
  const body: OperationReceipt = { resourceId: header.confirmationId, ...scopeOfHeader(header), acceptedAt: now(deps).toISOString(), revision };
  const response = authJson({ data: body }, status);
  response.headers.set('ETag', '"' + revision + '"');
  return response;
}

/** Revision handling shared by every mutation: a missing header means the request must have been written against none. */
function requireRevision(rows: ConfirmationRows | null, supplied: string | null, baseRevision: unknown): asserts rows is ConfirmationRows {
  if (!rows) throw new ForecastingError('CONFIRMATION_NOT_FOUND');
  if (typeof baseRevision !== 'string' || baseRevision.length === 0) bad('baseRevision must be the revision of the confirmation.');
  if (supplied === null) throw new ForecastingError('IF_MATCH_REQUIRED');
  const current = confirmationRevision(rows.header);
  if (supplied !== current || baseRevision !== current) throw new ForecastingError('CONFIRMATION_REVISION_MISMATCH');
}

/** The run must exist, belong to the scope and be FINALIZED; its subjects decide what can be confirmed. */
async function requireFinalizedRun(deps: ForecastingDependencies, forecastRunId: number, scope: ForecastScope): Promise<RunRecord> {
  const run = await deps.runs.getRun(forecastRunId);
  if (!run) throw new ForecastingError('RUN_NOT_FOUND');
  const own = scopeOfRun(run);
  if (own.programmeId !== scope.programmeId || own.learningCentreId !== scope.learningCentreId || own.targetSemesterId !== scope.targetSemesterId) throw new ForecastingError('RUN_SCOPE_MISMATCH');
  if (run.status !== 'FINALIZED') throw new ForecastingError('RUN_NOT_FINALIZED');
  return run;
}

function setOf(scope: ForecastScope, rows: ConfirmationRows | null, newer: ConfirmedOfferingSet['newerForecastAvailable'], at: Date): ConfirmedOfferingSet {
  if (!rows) return { scope, pickDeadline: null, revision: null, forecastRunId: null, pickWindow: null, createdBy: null, createdAt: null, updatedBy: null, updatedAt: null, newerForecastAvailable: null, offerings: [] };
  const { header } = rows;
  return {
    scope, pickDeadline: header.pickDeadline, revision: confirmationRevision(header), forecastRunId: header.forecastRunId,
    pickWindow: isPickWindowOpen(header.pickDeadline, at) ? 'OPEN' : 'CLOSED',
    createdBy: header.createdBy, createdAt: header.createdAt, updatedBy: header.updatedBy, updatedAt: header.updatedAt, newerForecastAvailable: newer,
    offerings: rows.offerings.map((row): ConfirmedOffering => ({
      confirmedOfferingId: row.confirmedOfferingId, ...scope, subjectId: row.subjectId, subjectCode: row.subjectCode, subjectName: row.subjectName,
      creditHours: row.creditHours, classType: row.classType, status: row.status, forecastRunId: row.forecastRunId, confirmedBy: row.confirmedBy,
      confirmedAt: row.confirmedAt, withdrawnBy: row.withdrawnBy, withdrawnAt: row.withdrawnAt, reason: row.reason,
    })),
  };
}

async function read(url: URL, deps: ForecastingDependencies, actor: string): Promise<Response> {
  onlyParameters(url, ['programmeId', 'learningCentreId', 'targetSemesterId']);
  const scope = queryScope(url);
  await requireScope(deps, actor, scope);
  const rows = await deps.offerings.get(scope);
  let newer: ConfirmedOfferingSet['newerForecastAvailable'] = null;
  if (rows) {
    const [source, latest] = await Promise.all([deps.runs.getRun(rows.header.forecastRunId), deps.runs.latestVersion(scope)]);
    newer = source ? newerOf(latest, source) : null;
  }
  const response = authJson({ data: setOf(scope, rows, newer, now(deps)) });
  if (rows) response.headers.set('ETag', '"' + confirmationRevision(rows.header) + '"');
  return response;
}

async function confirm(request: Request, deps: ForecastingDependencies, actor: string): Promise<Response> {
  checkIdempotencyKey(request);
  const supplied = ifMatchRevision(request);
  const body = await readJson(request);
  onlyKeys(body, ['scope', 'forecastRunId', 'subjectIds', 'reason', 'baseRevision', 'pickDeadline'], ['scope', 'forecastRunId', 'subjectIds', 'reason', 'baseRevision', 'pickDeadline']);
  if (body.baseRevision !== null && typeof body.baseRevision !== 'string') bad('baseRevision must be a revision or null.');
  const scope = parseScope(body.scope);
  if (!isId(body.forecastRunId)) bad('forecastRunId must be a positive integer.');
  const subjectIds = parseSubjectIds(body.subjectIds);
  const reason = parseReason(body.reason);
  const pickDeadline = parseDeadline(body.pickDeadline);
  requireValid(validateConfirmOfferingsRequest({ scope, forecastRunId: body.forecastRunId as number, subjectIds, reason, pickDeadline, baseRevision: body.baseRevision as string | null }));
  await requireScope(deps, actor, scope);
  await requireTargetSemester(deps, scope);
  const forecastRunId = body.forecastRunId as number;

  const rows = await deps.offerings.get(scope);
  if (rows) {
    if (body.baseRevision === null) throw new ForecastingError('CONFIRMATION_REVISION_MISMATCH');
    requireRevision(rows, supplied, body.baseRevision);
  } else if (body.baseRevision !== null) throw new ForecastingError('CONFIRMATION_REVISION_MISMATCH');

  if (rows && forecastRunId !== rows.header.forecastRunId) throw new ForecastingError('CONFIRMATION_RUN_MISMATCH');
  await requireFinalizedRun(deps, forecastRunId, scope);
  if (rows) {
    if (Date.parse(pickDeadline) !== Date.parse(rows.header.pickDeadline)) throw new ForecastingError('PICK_DEADLINE_MISMATCH');
  } else if (Date.parse(pickDeadline) <= now(deps).getTime()) throw new ForecastingError('PICK_DEADLINE_INVALID');

  const detail = await deps.runs.getDetail(forecastRunId);
  if (!detail) throw new ForecastingError('RUN_NOT_FOUND');
  const inRun = new Map(detail.subjects.map((subject) => [subject.subjectId, subject]));
  const missing = subjectIds.filter((id) => !inRun.has(id));
  if (missing.length) throw new ForecastingError('SUBJECT_NOT_IN_RUN', { subjectIds: missing });
  const notOffered = subjectIds.filter((id) => assumptionsFor(detail, id)?.semesterTypeExcluded === true);
  if (notOffered.length) throw new ForecastingError('SUBJECT_NOT_OFFERED_IN_SEMESTER_TYPE', { subjectIds: notOffered });
  const excluded = subjectIds.filter((id) => inRun.get(id)!.configurationStatus === 'EXCLUDED');
  if (excluded.length) throw new ForecastingError('SUBJECT_EXCLUDED', { subjectIds: excluded });

  const existing = new Map((rows?.offerings ?? []).map((offering) => [offering.subjectId, offering.status]));
  const insertSubjectIds = subjectIds.filter((id) => !existing.has(id));
  const reconfirmSubjectIds = subjectIds.filter((id) => existing.get(id) === 'WITHDRAWN');
  // Everything already CONFIRMED: nothing to change, nothing to audit. Return the current state (idempotent retry).
  if (rows && insertSubjectIds.length === 0 && reconfirmSubjectIds.length === 0) return receipt(rows.header, 200, deps);
  const header = await deps.offerings.confirm({
    scope, forecastRunId, pickDeadline, actor, reason, confirmationId: rows?.header.confirmationId ?? null,
    expectedRevision: rows?.header.revision ?? null, insertSubjectIds, reconfirmSubjectIds,
  });
  return receipt(header, rows ? 200 : 201, deps);
}

async function withdraw(request: Request, deps: ForecastingDependencies, actor: string): Promise<Response> {
  checkIdempotencyKey(request);
  const supplied = ifMatchRevision(request);
  const body = await readJson(request);
  onlyKeys(body, ['scope', 'subjectIds', 'reason', 'baseRevision'], ['scope', 'subjectIds', 'reason', 'baseRevision']);
  const scope = parseScope(body.scope);
  const subjectIds = parseSubjectIds(body.subjectIds);
  const reason = parseReason(body.reason);
  requireValid(validateWithdrawOfferingsRequest({ scope, subjectIds, reason, baseRevision: String(body.baseRevision ?? '') }));
  await requireScope(deps, actor, scope);
  await requireTargetSemester(deps, scope);
  const rows = await deps.offerings.get(scope);
  requireRevision(rows, supplied, body.baseRevision);
  const status = new Map(rows.offerings.map((offering) => [offering.subjectId, offering.status]));
  const notConfirmed = subjectIds.filter((id) => status.get(id) !== 'CONFIRMED');
  if (notConfirmed.length) throw new ForecastingError('OFFERING_NOT_CONFIRMED', { subjectIds: notConfirmed });
  const header = await deps.offerings.withdraw({ confirmationId: rows.header.confirmationId, expectedRevision: rows.header.revision, subjectIds, reason, actor });
  return receipt(header, 200, deps);
}

async function setDeadline(request: Request, deps: ForecastingDependencies, actor: string): Promise<Response> {
  checkIdempotencyKey(request);
  const supplied = ifMatchRevision(request);
  const body = await readJson(request);
  onlyKeys(body, ['scope', 'pickDeadline', 'reason', 'baseRevision', 'forecastRunId'], ['scope', 'pickDeadline', 'reason', 'baseRevision']);
  const scope = parseScope(body.scope);
  if ('forecastRunId' in body && !isId(body.forecastRunId)) bad('forecastRunId must be a positive integer.');
  const reason = parseReason(body.reason);
  const pickDeadline = parseDeadline(body.pickDeadline);
  const clock = now(deps);
  requireValid(validateSetPickDeadlineRequest({ scope, pickDeadline, reason, baseRevision: String(body.baseRevision ?? '') }, clock));
  await requireScope(deps, actor, scope);
  await requireTargetSemester(deps, scope);
  const rows = await deps.offerings.get(scope);
  requireRevision(rows, supplied, body.baseRevision);
  const forecastRunId = (body.forecastRunId as number | undefined) ?? rows.header.forecastRunId;
  if (forecastRunId !== rows.header.forecastRunId) await requireFinalizedRun(deps, forecastRunId, scope);
  if (Date.parse(pickDeadline) === Date.parse(rows.header.pickDeadline) && forecastRunId === rows.header.forecastRunId) throw new ForecastingError('CONFIRMATION_UNCHANGED');
  const header = await deps.offerings.setDeadline({ confirmationId: rows.header.confirmationId, expectedRevision: rows.header.revision, pickDeadline, forecastRunId, reason, actor });
  return receipt(header, 200, deps);
}

async function auditPage(url: URL, deps: ForecastingDependencies, actor: string): Promise<Response> {
  onlyParameters(url, ['programmeId', 'learningCentreId', 'targetSemesterId', 'limit', 'cursor']);
  const scope = queryScope(url);
  const limit = url.searchParams.has('limit') ? positive(url.searchParams.get('limit'), 'limit') : RUN_LIMITS.defaultPageSize;
  if (limit > RUN_LIMITS.maxPageSize) bad('limit must be between 1 and ' + RUN_LIMITS.maxPageSize + '.');
  const cursor = url.searchParams.has('cursor') ? decodeCursor(url.searchParams.get('cursor')!) : null;
  await requireScope(deps, actor, scope);
  const rows = await deps.offerings.get(scope);
  if (!rows) return authJson({ data: { items: [] } });
  const entries = await deps.offerings.listAudit(rows.header, limit + 1, cursor);
  const page = entries.slice(0, limit);
  const last = page[page.length - 1];
  return authJson({ data: { items: page, ...(entries.length > limit && last ? { nextCursor: encodeCursor(last.auditId) } : {}) } });
}

/**
 * Student picks do not exist yet (they arrive with the student offerings page, P002). The endpoint is read-only and honest:
 * every confirmed subject shows zero picks and no pickers, and `picksAvailable` is false so a screen never reads zero as "nobody picked".
 */
async function pickCounts(url: URL, deps: ForecastingDependencies, actor: string): Promise<Response> {
  onlyParameters(url, ['programmeId', 'learningCentreId', 'targetSemesterId', 'sort']);
  const sort = url.searchParams.get('sort');
  if (sort !== null && sort !== 'seniority' && sort !== 'name') bad('sort must be seniority or name.');
  const scope = queryScope(url);
  await requireScope(deps, actor, scope);
  const rows = await deps.offerings.get(scope);
  const summary: OfferingPickCountSummary = {
    scope, asOf: now(deps).toISOString(), pickDeadline: rows?.header.pickDeadline ?? null, picksAvailable: false,
    counts: (rows?.offerings ?? []).filter((offering) => offering.status === 'CONFIRMED').map((offering) => ({
      subjectId: offering.subjectId, subjectCode: offering.subjectCode, subjectName: offering.subjectName, pickCount: 0, classType: offering.classType,
      implied: { maxPerClass: offering.classType === 'LAB' ? 35 : 45, classesAtMaximum: 0, classesAtOptimal: 0, averageSizeAtMaximum: 0 }, pickers: [],
    })),
  };
  return authJson({ data: summary });
}

/** Handles `confirmed-offerings...` and `offering-pick-counts`. The caller already authenticated a COORDINATOR and passes the verified actor. */
export async function handleOfferingRoute(route: string, request: Request, url: URL, deps: ForecastingDependencies, actor: string): Promise<Response | null> {
  const match = OFFERING_ROUTE.exec(route);
  if (!match) return null;
  const method = request.method;
  const leaf = match[2] ?? null;
  if (route === 'offering-pick-counts') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return await pickCounts(url, deps, actor);
  }
  if (leaf === 'audit') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return await auditPage(url, deps, actor);
  }
  if (leaf === null) {
    if (method === 'GET') return await read(url, deps, actor);
    if (method !== 'POST') return methodNotAllowed(['GET', 'POST']);
    onlyParameters(url, []);
    return await confirm(request, deps, actor);
  }
  if (method !== 'POST') return methodNotAllowed(['POST']);
  onlyParameters(url, []);
  return leaf === 'withdrawals' ? await withdraw(request, deps, actor) : await setDeadline(request, deps, actor);
}
