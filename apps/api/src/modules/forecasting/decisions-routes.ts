import { authJson } from '../auth';
import type { ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import {
  OFFERING_DECISION_STATUSES, type DecideOfferingRequest, type DecideOfferingResult, type OfferingDecisionSet, type OfferingDecisionStatus, type DecisionPickers,
} from '../../../../../packages/shared/src/forecasting/offering-decisions';
import { RUN_LIMITS } from '../../../../../packages/shared/src/forecasting/runs';
import type { ForecastingDependencies, PortalContact } from './contracts';
import { ForecastingError } from './errors';
import { bad, decodeCursor, encodeCursor, methodNotAllowed, onlyParameters, positive, readJson } from './http';
import { resolveSemesterWindow } from './semester-window';

export const DECISION_ROUTE = /^offering-decisions(?:\/(audit)|\/([1-9]\d*)\/pickers)?$/;
const DECISION_KEYS = ['scope', 'subjectId', 'status', 'expectedStatus', 'importBatchId'];
const now = (deps: ForecastingDependencies) => (deps.now ?? (() => new Date()))();

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;
function queryScope(url: URL): ForecastScope {
  return {
    programmeId: positive(url.searchParams.get('programmeId'), 'programmeId'), learningCentreId: positive(url.searchParams.get('learningCentreId'), 'learningCentreId'),
    targetSemesterId: positive(url.searchParams.get('targetSemesterId'), 'targetSemesterId'),
  };
}
function bodyScope(value: unknown): ForecastScope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad('scope is required.');
  const scope = value as Record<string, unknown>;
  if (Object.keys(scope).some((key) => !['programmeId', 'learningCentreId', 'targetSemesterId'].includes(key))) bad('scope may only contain programmeId, learningCentreId and targetSemesterId.');
  if (!isId(scope.programmeId) || !isId(scope.learningCentreId) || !isId(scope.targetSemesterId)) bad('scope IDs must be positive integers.');
  return { programmeId: scope.programmeId as number, learningCentreId: scope.learningCentreId as number, targetSemesterId: scope.targetSemesterId as number };
}
function parseStatus(value: unknown, label: string): OfferingDecisionStatus {
  if (typeof value !== 'string' || !(OFFERING_DECISION_STATUSES as readonly string[]).includes(value)) return bad(label + ' must be PENDING, APPROVED or REMOVED.');
  return value as OfferingDecisionStatus;
}
function parseDecision(body: Record<string, unknown>): DecideOfferingRequest {
  if (Object.keys(body).some((key) => !DECISION_KEYS.includes(key)) || DECISION_KEYS.some((key) => !(key in body))) bad('The request must contain exactly the documented fields.');
  if (!isId(body.subjectId)) bad('subjectId must be a positive integer.');
  if (body.importBatchId !== null && !isId(body.importBatchId)) bad('importBatchId must be a positive integer or null.');
  return {
    scope: bodyScope(body.scope), subjectId: body.subjectId as number, status: parseStatus(body.status, 'status'),
    expectedStatus: parseStatus(body.expectedStatus, 'expectedStatus'), importBatchId: body.importBatchId as number | null,
  };
}

async function requireScope(deps: ForecastingDependencies, actor: string, scope: ForecastScope) {
  if (!(await deps.scopes.isScopeAssigned(actor, scope.programmeId, scope.learningCentreId))) throw new ForecastingError('SCOPE_NOT_ASSIGNED');
}

async function read(url: URL, deps: ForecastingDependencies, actor: string): Promise<Response> {
  onlyParameters(url, ['programmeId', 'learningCentreId', 'targetSemesterId']);
  const scope = queryScope(url);
  await requireScope(deps, actor, scope);
  const [window, decisions, pickCounts] = await Promise.all([resolveSemesterWindow(deps, scope.targetSemesterId), deps.decisions.get(scope), deps.decisions.pickCounts(scope)]);
  const set: OfferingDecisionSet = {
    scope, semester: window.semester, phase: window.phase, asOf: now(deps).toISOString(), editable: window.isNext && window.phase !== 'CLOSED', decisions, pickCounts,
  };
  return authJson({ data: set });
}

async function decide(request: Request, deps: ForecastingDependencies, actor: string): Promise<Response> {
  const key = request.headers.get('idempotency-key');
  if (key !== null && (key.length < 1 || key.length > 128)) bad('Idempotency-Key must be 1-128 characters.');
  const input = parseDecision(await readJson(request));
  const { scope } = input;
  await requireScope(deps, actor, scope);
  // Only the next semester can be planned, and only until selection closes. Checked live against the admin dates on every change.
  const window = await resolveSemesterWindow(deps, scope.targetSemesterId);
  if (!window.isNext) throw new ForecastingError('SEMESTER_READ_ONLY');
  if (window.phase === 'CLOSED') throw new ForecastingError('SELECTION_CLOSED');

  const catalogue = await deps.repository.catalogue(scope.programmeId);
  if (!catalogue) throw new ForecastingError('SCOPE_NOT_FOUND');
  const subject = catalogue.curricula.flatMap((curriculum) => curriculum.subjects).find((candidate) => candidate.subjectId === input.subjectId);
  if (!subject) throw new ForecastingError('DECISION_SUBJECT_NOT_FOUND');
  // Excluded subjects cannot be approved, but an earlier decision must stay removable.
  if (!subject.includeInOfferingForecast && input.status === 'APPROVED') throw new ForecastingError('SUBJECT_EXCLUDED');
  if (input.importBatchId !== null) {
    const batch = await deps.repository.getBatch(input.importBatchId);
    if (!batch || batch.status !== 'ACCEPTED' || batch.programmeId !== scope.programmeId || batch.learningCentreId !== scope.learningCentreId || batch.targetSemesterId !== scope.targetSemesterId) {
      throw new ForecastingError('IMPORT_NOT_FOUND');
    }
  }

  let outcome = { beforeStatus: input.expectedStatus, afterStatus: input.status, affectedPicks: 0 };
  // Same status as the caller saw: nothing to change and nothing to audit (idempotent retry).
  if (input.status !== input.expectedStatus) {
    outcome = await deps.decisions.decide({ scope, subjectId: input.subjectId, expectedStatus: input.expectedStatus, status: input.status, actor, importBatchId: input.importBatchId });
  }
  const result: DecideOfferingResult = { subjectId: input.subjectId, ...outcome, phase: window.phase };
  return authJson({ data: result });
}

async function auditPage(url: URL, deps: ForecastingDependencies, actor: string): Promise<Response> {
  onlyParameters(url, ['programmeId', 'learningCentreId', 'targetSemesterId', 'limit', 'cursor']);
  const scope = queryScope(url);
  const limit = url.searchParams.has('limit') ? positive(url.searchParams.get('limit'), 'limit') : RUN_LIMITS.defaultPageSize;
  if (limit > RUN_LIMITS.maxPageSize) bad('limit must be between 1 and ' + RUN_LIMITS.maxPageSize + '.');
  const cursor = url.searchParams.has('cursor') ? decodeCursor(url.searchParams.get('cursor')!) : null;
  await requireScope(deps, actor, scope);
  const entries = await deps.decisions.listAudit(scope, limit + 1, cursor);
  const page = entries.slice(0, limit);
  const last = page[page.length - 1];
  return authJson({ data: { items: page, ...(entries.length > limit && last ? { nextCursor: encodeCursor(last.auditId) } : {}) } });
}

/** Students who picked one subject in the scope. Names and matric numbers from the database; sign-in emails live, never stored; personal data, so `no-store`. */
async function pickers(url: URL, subjectId: number, deps: ForecastingDependencies, actor: string): Promise<Response> {
  if (subjectId > 2147483647) bad('Invalid subjectId.');
  onlyParameters(url, ['programmeId', 'learningCentreId', 'targetSemesterId']);
  const scope = queryScope(url);
  await requireScope(deps, actor, scope);
  const stored = (await deps.decisions.get(scope)).find((decision) => decision.subjectId === subjectId);
  if (!stored) throw new ForecastingError('OFFERING_DECISION_NOT_FOUND');
  const rows = await deps.decisions.pickers(scope, subjectId);
  // Same contact merge as the subject student list (runs-routes.ts): a failed lookup keeps the list usable without emails.
  let contacts = new Map<number, PortalContact>(), emailsAvailable = true;
  if (rows.length && deps.portalContacts) {
    try { ({ contacts, emailsAvailable } = await deps.portalContacts(rows.map((row) => row.studentId))); } catch { emailsAvailable = false; }
  }
  const data: DecisionPickers = {
    scope, subjectId, subjectCode: stored.subjectCode, subjectName: stored.subjectName, pickCount: rows.length, emailsAvailable,
    pickers: rows.map((row) => {
      const contact = contacts.get(row.studentId);
      return { studentId: row.studentId, studentName: row.studentName, matricNo: row.matricNo ?? contact?.matricNo ?? null, email: contact?.email ?? null };
    }),
  };
  return authJson({ data });
}

/** Handles `offering-decisions`, `offering-decisions/audit` and `offering-decisions/audit`. The caller already authenticated a COORDINATOR and passes the verified actor. */
export async function handleDecisionRoute(route: string, request: Request, url: URL, deps: ForecastingDependencies, actor: string): Promise<Response | null> {
  const match = DECISION_ROUTE.exec(route);
  if (!match) return null;
  const method = request.method;
  if (match[2]) {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return await pickers(url, Number(match[2]), deps, actor);
  }
  if (match[1] === 'audit') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return await auditPage(url, deps, actor);
  }
  if (method === 'GET') return await read(url, deps, actor);
  if (method !== 'POST') return methodNotAllowed(['GET', 'POST']);
  onlyParameters(url, []);
  return await decide(request, deps, actor);
}
