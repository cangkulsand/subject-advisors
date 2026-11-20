import { accountSessionStamp, clearAccountCache } from '../auth/account-cache';
import { AdminApiError } from './client';
import * as Contract from '../../../../../packages/shared/src/admin/academic-setup';

function invalid(): never { throw new AdminApiError(503, 'INVALID_RESPONSE', 'Academic setup data could not be read. Please retry.'); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function row<T>(value: unknown, ids: string[], strings: string[], booleans: string[] = []): T {
  const item = object(value);
  if (ids.some(key => !Contract.isAcademicSetupId(item[key])) || strings.some(key => typeof item[key] !== 'string') || booleans.some(key => typeof item[key] !== 'boolean')) return invalid();
  return item as T;
}
const centre = (v: unknown) => row<Contract.LearningCentre>(v, ['learningCentreId'], ['centreCode', 'centreName'], ['isActive']);
const faculty = (v: unknown) => row<Contract.Faculty>(v, ['facultyId'], ['facultyCode', 'facultyName'], ['isActive']);
function programme(v: unknown): Contract.ProgrammeFaculty {
  const item = row<Contract.ProgrammeFaculty>(v, ['programmeId'], ['programmeCode', 'programmeName']);
  if (item.facultyId !== null && !Contract.isAcademicSetupId(item.facultyId)) return invalid();
  if (item.faculty !== null) faculty(item.faculty);
  if ((item.faculty?.facultyId ?? null) !== item.facultyId) return invalid();
  return item;
}
function semester(v: unknown): Contract.AcademicSemester {
  const item = row<Contract.AcademicSemester>(v, ['semesterId'], ['academicYear', 'semesterType'], ['isCurrent']);
  const checked = Contract.validateCreateSemesterRequest({ academicYear: item.academicYear, semesterNo: item.semesterNo, semesterType: item.semesterType, maxSubjects: item.maxSubjects, maxCredits: item.maxCredits, startDate: item.startDate, endDate: item.endDate, reason: 'Response validation' });
  return checked.ok ? item : invalid();
}
function assignment(v: unknown): Contract.AdminCoordinatorAssignment {
  const item = row<Contract.AdminCoordinatorAssignment>(v, ['assignmentId', 'accountId', 'facultyId', 'programmeId', 'learningCentreId'], ['startedAt']);
  if (item.endedAt !== null && typeof item.endedAt !== 'string') return invalid();
  return item;
}
function list<T>(read: (v: unknown) => T) { return (v: unknown): T[] => Array.isArray(v) ? v.map(read) : invalid(); }
interface RequestInput { method: 'GET' | 'POST' | 'PUT' | 'PATCH'; body?: unknown }
export function createAcademicSetupClient(getToken: () => Promise<string | null>, baseUrl = '') {
  const base = baseUrl.replace(/\/+$/, '');
  async function request<T>(path: string, decode: (value: unknown) => T, signal?: AbortSignal, init: RequestInput = { method: 'GET' }): Promise<T> {
    const expected = accountSessionStamp(), controller = new AbortController();
    const assertSession = () => { if (expected !== accountSessionStamp()) throw new AdminApiError(401, 'SESSION_CHANGED', 'Your account changed. Reload this page.'); };
    const cancel = () => controller.abort(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    let abort!: () => void;
    const stopped = new Promise<never>((_resolve, reject) => { abort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', abort, { once: true }); if (controller.signal.aborted) abort(); });
    const timer = setTimeout(() => controller.abort(new AdminApiError(503, 'ADMIN_TIMEOUT', 'Administration is taking too long. Please retry.')), 15000);
    const run = async () => {
      assertSession();
      if (controller.signal.aborted) throw controller.signal.reason;
      const token = await getToken(); assertSession();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!token) { clearAccountCache(); throw new AdminApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again.'); }
      const response = await fetch(base + path, { method: init.method, headers: init.body === undefined ? { Authorization: 'Bearer ' + token } : { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body), credentials: 'omit', cache: 'no-store', signal: controller.signal });
      assertSession();
      if ([401, 403].includes(response.status)) clearAccountCache();
      let body: Record<string, unknown>;
      try { body = object(await response.json()); }
      catch { throw new AdminApiError(response.status || 503, 'INVALID_RESPONSE', 'Administration data could not be read. Please retry.'); }
      assertSession();
      if (!response.ok) {
        const error = body.error && typeof body.error === 'object' ? object(body.error) : {};
        throw new AdminApiError(response.status, typeof error.code === 'string' ? error.code : 'ADMIN_UNAVAILABLE', typeof error.message === 'string' ? error.message : 'Administration data is unavailable. Please retry.');
      }
      const result = decode(body.data); assertSession(); return result;
    };
    try { return await Promise.race([run(), stopped]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', abort); }
  }
  const path = '/api/admin/academic-setup';
  return {
    centres: (signal?: AbortSignal) => request(path + '/learning-centres?includeInactive=true', list(centre), signal),
    createCentre: (input: Contract.CreateLearningCentreRequest) => request(path + '/learning-centres', centre, undefined, { method: 'POST', body: input }),
    updateCentre: (id: number, input: Contract.UpdateLearningCentreRequest) => request(path + '/learning-centres/' + id, centre, undefined, { method: 'PATCH', body: input }),
    faculties: (signal?: AbortSignal) => request(path + '/faculties?includeInactive=true', list(faculty), signal),
    createFaculty: (input: Contract.CreateFacultyRequest) => request(path + '/faculties', faculty, undefined, { method: 'POST', body: input }),
    updateFaculty: (id: number, input: Contract.UpdateFacultyRequest) => request(path + '/faculties/' + id, faculty, undefined, { method: 'PATCH', body: input }),
    programmes: (signal?: AbortSignal) => request(path + '/programmes', list(programme), signal),
    setProgrammeFaculty: (id: number, input: Contract.SetProgrammeFacultyRequest) => request(path + '/programmes/' + id + '/faculty', programme, undefined, { method: 'PATCH', body: input }),
    semesters: (signal?: AbortSignal) => request(path + '/semesters', list(semester), signal),
    currentSemester: (signal?: AbortSignal) => request(path + '/current-semester', v => v === null ? null : semester(v), signal),
    createSemester: (input: Contract.CreateSemesterRequest) => request(path + '/semesters', semester, undefined, { method: 'POST', body: input }),
    updateSemester: (id: number, input: Contract.UpdateSemesterRequest) => request(path + '/semesters/' + id, semester, undefined, { method: 'PATCH', body: input }),
    setCurrentSemester: (input: Contract.SetCurrentSemesterRequest) => request(path + '/current-semester', semester, undefined, { method: 'PUT', body: input }),
    assignments: (signal?: AbortSignal) => request(path + '/coordinator-assignments', list(assignment), signal),
    createAssignment: (input: Contract.CreateCoordinatorAssignmentRequest) => request(path + '/coordinator-assignments', assignment, undefined, { method: 'POST', body: input }),
    endAssignment: (id: number, reason: string) => request(path + '/coordinator-assignments/' + id + '/end', assignment, undefined, { method: 'POST', body: { reason } }),
  };
}
export type AcademicSetupClient = ReturnType<typeof createAcademicSetupClient>;
