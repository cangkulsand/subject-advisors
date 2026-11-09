import { accountSessionStamp, clearAccountCache } from '../auth/account-cache';
import type { StudentEligibilityProjection, EligibilityResult } from '../../../../../packages/shared/src/forecasting/student-eligibility';
import type { UncertaintyReason } from '../../../../../packages/shared/src/forecasting/contracts';
import type { SaveSemesterSelection, SemesterSelectionPageData } from '../../../../../packages/shared/src/forecasting/semester-selection-contracts';

export class StudentEligibilityApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly issues?: Array<{ code: string; message: string; subjectId?: number }>) { super(message); }
}

export interface EligibilityScopeLabels { programmeName: string; learningCentreName: string; targetSemesterLabel: string }
export interface StudentEligibilityData extends StudentEligibilityProjection { centreBasis: string; scopeLabels?: EligibilityScopeLabels }
export interface StudentSelectionClient { load(signal?: AbortSignal): Promise<SemesterSelectionPageData>; save(body: SaveSemesterSelection, signal?: AbortSignal): Promise<SemesterSelectionPageData> }
export interface StudentEligibilityClient { load(signal?: AbortSignal): Promise<StudentEligibilityData>; selection?: StudentSelectionClient }

const BAD = 'Eligibility could not be loaded. Please retry.';
const PATH = '/api/student/eligible-offerings';
const uncertaintyReasons: readonly UncertaintyReason[] = ['COHORT_STATUS_UNMAPPED', 'HISTORY_UNKNOWN', 'HISTORY_PARTIAL', 'SOURCE_STATUS_UNMAPPED', 'RETAKE_OUTCOME_UNRESOLVED', 'CREDIT_EVIDENCE_MISSING', 'CGPA_EVIDENCE_MISSING', 'PREREQUISITE_EVIDENCE_MISSING', 'COREQUISITE_EVIDENCE_MISSING', 'CURRICULUM_VERSION_UNRESOLVED', 'REJECTED_HISTORY_ROW'];
const uncertaintyReasonSet = new Set<UncertaintyReason>(uncertaintyReasons);
type Fetcher = typeof fetch;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
  return value as Record<string, unknown>;
}
function int(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function nonNegativeInt(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function nullableInt(value: unknown): value is number | null { return value === null || int(value); }
function nullableString(value: unknown): value is string | null { return value === null || typeof value === 'string'; }
function readResult(value: unknown): EligibilityResult {
  const item = object(value);
  if (!int(item.subjectId) || typeof item.subjectCode !== 'string' || typeof item.subjectName !== 'string' || !Number.isFinite(item.creditHours) || Number(item.creditHours) < 0 || typeof item.explanation !== 'string') throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
  const base = { subjectId: item.subjectId, subjectCode: item.subjectCode, subjectName: item.subjectName, creditHours: Number(item.creditHours), explanation: item.explanation };
  if (item.status === 'ELIGIBLE') return { ...base, status: 'ELIGIBLE' };
  if (item.status === 'CONDITIONAL' && Array.isArray(item.requiredConcurrentSubjectIds) && item.requiredConcurrentSubjectIds.length > 0 && item.requiredConcurrentSubjectIds.every(int) && new Set(item.requiredConcurrentSubjectIds).size === item.requiredConcurrentSubjectIds.length) return { ...base, status: 'CONDITIONAL', requiredConcurrentSubjectIds: [...item.requiredConcurrentSubjectIds] };
  if (item.status === 'INELIGIBLE' && ['PASSED', 'PREREQUISITE_NOT_MET', 'NOT_OFFERED'].includes(String(item.reason))) return { ...base, status: 'INELIGIBLE', reason: item.reason as 'PASSED' | 'PREREQUISITE_NOT_MET' | 'NOT_OFFERED' };
  if (item.status === 'UNCERTAIN' && Array.isArray(item.reasons) && item.reasons.every((reason): reason is UncertaintyReason => typeof reason === 'string' && uncertaintyReasonSet.has(reason as UncertaintyReason))) return { ...base, status: 'UNCERTAIN', reasons: [...item.reasons] };
  throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
}

const SELECTION_PATH = '/api/student/semester-selection';
const SELECTION_BAD = 'Your semester selection could not be loaded or saved. Please retry.';
function readSelectionValidation(value: unknown) {
  const item = object(value), limits = object(item.limits);
  if (typeof item.valid !== 'boolean' || !Number.isSafeInteger(item.totalSubjects) || Number(item.totalSubjects) < 0 || !Number.isFinite(item.totalCredits) || !nonNegativeInt(limits.maxSubjects) || !Number.isFinite(limits.maxCredits) || Number(limits.maxCredits) < 0 || !Array.isArray(item.issues)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', SELECTION_BAD);
  const issues = item.issues.map(raw => { const issue = object(raw); if (typeof issue.code !== 'string' || typeof issue.message !== 'string' || issue.subjectId !== undefined && !int(issue.subjectId)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', SELECTION_BAD); return { code: issue.code, message: issue.message, ...(issue.subjectId === undefined ? {} : { subjectId: issue.subjectId as number }) }; });
  return { valid: item.valid, totalSubjects: Number(item.totalSubjects), totalCredits: Number(item.totalCredits), limits: { maxSubjects: Number(limits.maxSubjects), maxCredits: Number(limits.maxCredits) }, issues };
}
export function parseSemesterSelectionPageData(value: unknown): SemesterSelectionPageData {
  const item = object(value), plan = object(item.plan);
  const rawEligibility = object(item.eligibility);
  if (typeof item.sourceRevision !== 'string' || !item.sourceRevision || !nullableString(item.deadline) || typeof item.editingOpen !== 'boolean' || !nonNegativeInt(plan.revision) || !Array.isArray(plan.subjectIds) || !plan.subjectIds.every(int) || new Set(plan.subjectIds).size !== plan.subjectIds.length || !nullableString(plan.updatedAt) || !Array.isArray(rawEligibility.results) || typeof item.centreBasis !== 'string') throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', SELECTION_BAD);
  const eligibility = parseStudentEligibility({ ...rawEligibility, centreBasis: item.centreBasis, scopeLabels: item.scopeLabels });
  if (eligibility.state === 'NO_ACTIVE_CONFIRMATION' && (item.editingOpen || item.validation !== null)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', SELECTION_BAD);
  const scopeLabels = item.scopeLabels === undefined ? undefined : eligibility.scopeLabels;
  return { eligibility, centreBasis: item.centreBasis, ...(scopeLabels ? { scopeLabels } : {}), sourceRevision: item.sourceRevision, deadline: item.deadline, editingOpen: item.editingOpen,
    plan: { revision: Number(plan.revision), subjectIds: [...plan.subjectIds] as number[], updatedAt: plan.updatedAt }, validation: item.validation === null ? null : readSelectionValidation(item.validation) };
}

export function createStudentSelectionClient(getToken: () => Promise<string | null>, baseUrl = '', fetcher: Fetcher = fetch): StudentSelectionClient {
  const base = baseUrl.replace(/\/+$/, '');
  async function request(method: 'GET' | 'PUT', body?: SaveSemesterSelection, signal?: AbortSignal): Promise<SemesterSelectionPageData> {
    const expected = accountSessionStamp(), controller = new AbortController();
    const assertSession = () => { if (expected !== accountSessionStamp()) throw new StudentEligibilityApiError(401, 'SESSION_CHANGED', 'Your account changed. Reload this page.'); };
    const cancel = () => controller.abort(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; if (controller.signal.aborted) reject(controller.signal.reason); else controller.signal.addEventListener('abort', () => rejectAbort(controller.signal.reason), { once: true }); });
    const timeout = setTimeout(() => controller.abort(new StudentEligibilityApiError(503, 'SELECTION_TIMEOUT', 'Semester selection is taking too long. Please retry.')), 20000);
    const run = async () => {
      assertSession(); const token = await getToken(); assertSession();
      if (!token) { clearAccountCache(); throw new StudentEligibilityApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again.'); }
      if (controller.signal.aborted) throw controller.signal.reason;
      const response = await fetcher(base + SELECTION_PATH, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), credentials: 'omit', cache: 'no-store', signal: controller.signal });
      assertSession(); if (response.status === 401 || response.status === 403) clearAccountCache();
      let raw: unknown; try { raw = await response.json(); } catch { assertSession(); throw new StudentEligibilityApiError(response.status || 503, 'INVALID_RESPONSE', SELECTION_BAD); }
      assertSession(); if (controller.signal.aborted) throw controller.signal.reason;
      const envelope = object(raw);
      if (!response.ok) {
        const error = envelope.error && typeof envelope.error === 'object' ? object(envelope.error) : {};
        const details = error.details && typeof error.details === 'object' ? object(error.details) : {};
        const rawIssues = Array.isArray(details.issues) ? details.issues : Array.isArray(error.issues) ? error.issues : undefined;
        const issues = rawIssues?.map(issue => { const value = object(issue); if (typeof value.code !== 'string' || typeof value.message !== 'string') throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', SELECTION_BAD); return { code: value.code, message: value.message, ...(int(value.subjectId) ? { subjectId: value.subjectId } : {}) }; });
        const status = response.status;
        throw new StudentEligibilityApiError(status, typeof error.code === 'string' ? error.code : 'SELECTION_UNAVAILABLE', typeof error.message === 'string' ? error.message : SELECTION_BAD, issues);
      }
      if (!('data' in envelope)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', SELECTION_BAD);
      return parseSemesterSelectionPageData(envelope.data);
    };
    try { return await Promise.race([run(), aborted]); }
    catch (error) { if (controller.signal.aborted && controller.signal.reason instanceof StudentEligibilityApiError) throw controller.signal.reason; throw error; }
    finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
  }
  return { load: signal => request('GET', undefined, signal), save: (body, signal) => request('PUT', body, signal) };
}
/** Validate and whitelist the public projection, so extra server fields (including accidental identity fields) are not retained. */
export function parseStudentEligibility(value: unknown): StudentEligibilityData {
  const item = object(value);
  if (!['AVAILABLE', 'NO_ACTIVE_CONFIRMATION'].includes(String(item.state)) || typeof item.centreBasis !== 'string' || !Array.isArray(item.results)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
  const results = item.results.map(readResult);
  if (new Set(results.map(result => result.subjectId)).size !== results.length) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
  const scope = item.scope === null ? null : (() => {
    const candidate = object(item.scope);
    if (!int(candidate.programmeId) || !int(candidate.learningCentreId) || !int(candidate.targetSemesterId)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
    return { programmeId: candidate.programmeId, learningCentreId: candidate.learningCentreId, targetSemesterId: candidate.targetSemesterId };
  })();
  if (!nullableInt(item.confirmationId) || !nullableInt(item.confirmationRevision) || !nullableString(item.confirmedAt)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
  if (item.state === 'AVAILABLE' && (!item.confirmationId || !item.confirmationRevision || !item.confirmedAt || !scope) || item.state === 'NO_ACTIVE_CONFIRMATION' && (item.confirmationId !== null || item.confirmationRevision !== null || item.confirmedAt !== null || results.length > 0)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
  let scopeLabels: EligibilityScopeLabels | undefined;
  if (item.scopeLabels !== undefined) {
    const labels = object(item.scopeLabels);
    if (typeof labels.programmeName !== 'string' || !labels.programmeName.trim() || typeof labels.learningCentreName !== 'string' || !labels.learningCentreName.trim() || typeof labels.targetSemesterLabel !== 'string' || !labels.targetSemesterLabel.trim()) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
    scopeLabels = { programmeName: labels.programmeName, learningCentreName: labels.learningCentreName, targetSemesterLabel: labels.targetSemesterLabel };
  }
  return { state: item.state as StudentEligibilityProjection['state'], scope, confirmationId: item.confirmationId, confirmationRevision: item.confirmationRevision,
    confirmedAt: item.confirmedAt, results, centreBasis: item.centreBasis, ...(scopeLabels ? { scopeLabels } : {}) };
}

export function createStudentEligibilityClient(getToken: () => Promise<string | null>, baseUrl = '', fetcher: Fetcher = fetch, selection?: StudentSelectionClient): StudentEligibilityClient {
  const base = baseUrl.replace(/\/+$/, '');
  const selectionClient = selection ?? createStudentSelectionClient(getToken, baseUrl, fetcher);
  return { selection: selectionClient, async load(signal) {
    const expected = accountSessionStamp(), controller = new AbortController();
    const assertSession = () => { if (expected !== accountSessionStamp()) throw new StudentEligibilityApiError(401, 'SESSION_CHANGED', 'Your account changed. Reload this page.'); };
    const cancel = () => controller.abort(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    let rejectAbort!: (reason: unknown) => void;
    const onAbort = () => rejectAbort(controller.signal.reason);
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
      if (controller.signal.aborted) reject(controller.signal.reason);
      else controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(new StudentEligibilityApiError(503, 'ELIGIBILITY_TIMEOUT', 'Eligibility is taking too long to load. Please retry.')), 20000);
    const run = async () => {
      assertSession();
      const token = await getToken();
      assertSession();
      if (!token) { clearAccountCache(); throw new StudentEligibilityApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again.'); }
      if (controller.signal.aborted) throw controller.signal.reason;
      const response = await fetcher(base + PATH, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, credentials: 'omit', cache: 'no-store', signal: controller.signal });
      assertSession();
      if (response.status === 401 || response.status === 403) clearAccountCache();
      let body: unknown;
      try { body = await response.json(); }
      catch { assertSession(); throw new StudentEligibilityApiError(response.status || 503, 'INVALID_RESPONSE', BAD); }
      assertSession();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!response.ok) {
        const root = object(body), error = root.error && typeof root.error === 'object' ? object(root.error) : {};
        const status = response.status;
        const message = status === 401 ? 'Your session has ended. Sign in again.' : status === 403 ? 'You do not have access to eligibility. Check your account, then retry.' : typeof error.message === 'string' ? error.message : BAD;
        throw new StudentEligibilityApiError(status, typeof error.code === 'string' ? error.code : 'ELIGIBILITY_UNAVAILABLE', message);
      }
      const envelope = object(body);
      if (!('data' in envelope)) throw new StudentEligibilityApiError(502, 'INVALID_RESPONSE', BAD);
      return parseStudentEligibility(envelope.data);
    };
    try { return await Promise.race([run(), aborted]); }
    catch (error) {
      if (controller.signal.aborted && controller.signal.reason instanceof StudentEligibilityApiError) throw controller.signal.reason;
      throw error;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', onAbort); }
  } };
}
