import { describe, expect, it, vi } from 'vitest';
import { ACADEMIC_SETUP_ERROR_CODES } from '../../../../../packages/shared/src/admin/academic-setup';
import type { AcademicSetupDependencies, AcademicSetupRepository } from './academic-contracts';
import { AcademicSetupDomainError } from './academic-errors';
import { handleAcademicSetupRequest } from './academic-routes';
import { AuthError } from '../auth';
import type { AccessAssignment } from '../auth/contracts';

const PREFIX = '/api/admin/academic-setup';
const ACTOR = 'user_verified_admin';
const reason = 'Reviewed correction';
const centre = { learningCentreId: 7, centreCode: 'TEST', centreName: 'Test only', isActive: true };
const faculty = { facultyId: 8, facultyCode: 'TEST', facultyName: 'Test faculty', isActive: true };
const department = { departmentId: 13, departmentCode: 'TEST', departmentName: 'Test department', facultyId: 8, isActive: true };
const programme = { programmeId: 9, programmeCode: 'TEST', programmeName: 'Test programme', level: null, isActive: true, facultyId: 8, faculty, departmentId: 13, department };
const curriculum = { curriculumId: 4, programmeId: 9, curriculumVersion: '2026', totalCreditRequired: 120, effectiveYear: 2026, isActive: true, subjectCount: 0 };
const semester = { semesterId: 10, academicYear: '2026/2027', semesterNo: 1 as const, semesterType: 'NORMAL' as const, maxSubjects: 4, maxCredits: 12, startDate: null, endDate: null, isCurrent: false, selectionOpensAt: null, selectionClosesAt: null };
const semesterInput = { academicYear: semester.academicYear, semesterNo: semester.semesterNo, semesterType: semester.semesterType, maxSubjects: 4, maxCredits: 12, startDate: null, endDate: null, selectionOpensAt: null, selectionClosesAt: null, reason };
const assignment = { assignmentId: 11, accountId: 12, facultyId: 8, programmeId: 9, learningCentreId: 7, startedAt: '2026-11-02T00:00:00Z', endedAt: null };
const assignmentInput = { accountId: 12, facultyId: 8, programmeId: 9, learningCentreId: 7, reason };
function fixture(): AcademicSetupDependencies {
  return {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: ACTOR, sessionId: 'session_test', primaryEmail: { address: 'test@utm.my', verified: true } })),
      access: {
        find: vi.fn(async (): Promise<AccessAssignment> => ({ clerkUserId: ACTOR, appRole: 'SYSTEM_ADMIN', roles: ['SYSTEM_ADMIN'], accessStatus: 'ACTIVE' })),
        initializeStudent: vi.fn(),
      },
    },
    repository: {
      listLearningCentres: vi.fn(async () => [centre]), createLearningCentre: vi.fn(async () => centre), updateLearningCentre: vi.fn(async () => centre),
      listFaculties: vi.fn(async () => [faculty]), createFaculty: vi.fn(async () => faculty), updateFaculty: vi.fn(async () => faculty),
      listDepartments: vi.fn(async () => [department]), createDepartment: vi.fn(async () => department), updateDepartment: vi.fn(async () => department),
      listProgrammeFaculties: vi.fn(async () => [programme]), setProgrammeDepartment: vi.fn(async () => programme),
      createProgramme: vi.fn(async () => programme), updateProgramme: vi.fn(async () => programme),
      listCurricula: vi.fn(async () => [curriculum]), createCurriculum: vi.fn(async () => curriculum), updateCurriculum: vi.fn(async () => curriculum),
      listAcademicSemesters: vi.fn(async () => [semester]), createAcademicSemester: vi.fn(async () => semester), updateAcademicSemester: vi.fn(async () => semester),
      getCurrentAcademicSemester: vi.fn(async () => null), setCurrentAcademicSemester: vi.fn(async () => ({ ...semester, isCurrent: true })),
      listCoordinatorAssignments: vi.fn(async () => [assignment]), createCoordinatorAssignment: vi.fn(async () => assignment), endCoordinatorAssignment: vi.fn(async () => ({ ...assignment, endedAt: '2026-11-02T01:00:00Z' })),
    },
  };
}
function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  return new Request('https://test.invalid' + PREFIX + path, { method, headers: { Authorization: 'Bearer test_fixture', 'X-Actor': 'user_spoofed', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}
async function send(deps: AcademicSetupDependencies, path: string, method = 'GET', body?: unknown, headers?: Record<string, string>): Promise<Response> {
  const response = await handleAcademicSetupRequest(request(path, method, body, headers), deps);
  if (!response) throw new Error('Fixture did not match');
  return response;
}
function noCalls(deps: AcademicSetupDependencies) { for (const method of Object.values(deps.repository)) expect(method).not.toHaveBeenCalled(); }
type Operation = { path: string; method: string; repo: keyof AcademicSetupRepository; args: unknown[]; body?: object; data: unknown; status?: number };
const operations: Operation[] = [
  { path: '/learning-centres', method: 'GET', repo: 'listLearningCentres', args: [false], data: [centre] },
  { path: '/learning-centres', method: 'POST', repo: 'createLearningCentre', body: { centreCode: 'TEST', centreName: 'Test only', reason }, args: [{ centreCode: 'TEST', centreName: 'Test only', reason }, ACTOR], data: centre, status: 201 },
  { path: '/learning-centres/7', method: 'PATCH', repo: 'updateLearningCentre', body: { isActive: false, reason }, args: [7, { isActive: false, reason }, ACTOR], data: centre },
  { path: '/faculties', method: 'GET', repo: 'listFaculties', args: [false], data: [faculty] },
  { path: '/faculties', method: 'POST', repo: 'createFaculty', body: { facultyCode: 'TEST', facultyName: 'Test faculty', reason }, args: [{ facultyCode: 'TEST', facultyName: 'Test faculty', reason }, ACTOR], data: faculty, status: 201 },
  { path: '/faculties/8', method: 'PATCH', repo: 'updateFaculty', body: { facultyName: 'New test', reason }, args: [8, { facultyName: 'New test', reason }, ACTOR], data: faculty },
  { path: '/programmes', method: 'GET', repo: 'listProgrammeFaculties', args: [], data: [programme] },
  { path: '/programmes', method: 'POST', repo: 'createProgramme', body: { programmeCode: 'TEST', programmeName: 'Test programme', level: null, departmentId: 13, reason }, args: [{ programmeCode: 'TEST', programmeName: 'Test programme', level: null, departmentId: 13, reason }, ACTOR], data: programme, status: 201 },
  { path: '/programmes/9', method: 'PATCH', repo: 'updateProgramme', body: { isActive: false, reason }, args: [9, { isActive: false, reason }, ACTOR], data: programme },
  { path: '/curricula', method: 'GET', repo: 'listCurricula', args: [], data: [curriculum] },
  { path: '/curricula', method: 'POST', repo: 'createCurriculum', body: { programmeId: 9, curriculumVersion: '2026', totalCreditRequired: 120, effectiveYear: 2026, reason }, args: [{ programmeId: 9, curriculumVersion: '2026', totalCreditRequired: 120, effectiveYear: 2026, reason }, ACTOR], data: curriculum, status: 201 },
  { path: '/curricula/4', method: 'PATCH', repo: 'updateCurriculum', body: { isActive: false, reason }, args: [4, { isActive: false, reason }, ACTOR], data: curriculum },
  { path: '/departments', method: 'GET', repo: 'listDepartments', args: [false], data: [department] },
  { path: '/departments', method: 'POST', repo: 'createDepartment', body: { departmentCode: 'TEST', departmentName: 'Test department', facultyId: 8, reason }, args: [{ departmentCode: 'TEST', departmentName: 'Test department', facultyId: 8, reason }, ACTOR], data: department, status: 201 },
  { path: '/departments/13', method: 'PATCH', repo: 'updateDepartment', body: { isActive: false, reason }, args: [13, { isActive: false, reason }, ACTOR], data: department },
  { path: '/programmes/9/department', method: 'PATCH', repo: 'setProgrammeDepartment', body: { departmentId: null, reason }, args: [9, { departmentId: null, reason }, ACTOR], data: programme },
  { path: '/semesters', method: 'GET', repo: 'listAcademicSemesters', args: [], data: [semester] },
  { path: '/semesters', method: 'POST', repo: 'createAcademicSemester', body: semesterInput, args: [semesterInput, ACTOR], data: semester, status: 201 },
  { path: '/semesters/10', method: 'PATCH', repo: 'updateAcademicSemester', body: { maxSubjects: 5, reason }, args: [10, { maxSubjects: 5, reason }, ACTOR], data: semester },
  { path: '/semesters/10', method: 'PATCH', repo: 'updateAcademicSemester', body: { selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }, args: [10, { selectionOpensAt: '2026-11-20T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z', reason }, ACTOR], data: semester },
  { path: '/current-semester', method: 'GET', repo: 'getCurrentAcademicSemester', args: [], data: null },
  { path: '/current-semester', method: 'PUT', repo: 'setCurrentAcademicSemester', body: { semesterId: 10, reason }, args: [{ semesterId: 10, reason }, ACTOR], data: { ...semester, isCurrent: true } },
  { path: '/coordinator-assignments', method: 'GET', repo: 'listCoordinatorAssignments', args: [{}], data: [assignment] },
  { path: '/coordinator-assignments', method: 'POST', repo: 'createCoordinatorAssignment', body: assignmentInput, args: [assignmentInput, ACTOR], data: assignment, status: 201 },
  { path: '/coordinator-assignments/11/end', method: 'POST', repo: 'endCoordinatorAssignment', body: { reason }, args: [11, { reason }, ACTOR], data: { ...assignment, endedAt: '2026-11-02T01:00:00Z' } },
];

describe.each(operations)('$method $path', operation => {
  it('dispatches exact validated payload and verified actor with no-store envelope', async () => {
    const deps = fixture();
    const response = await send(deps, operation.path, operation.method, operation.body);
    expect(response.status).toBe(operation.status ?? 200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Authorization');
    expect(await response.json()).toEqual({ data: operation.data });
    expect(deps.repository[operation.repo]).toHaveBeenCalledExactlyOnceWith(...operation.args);
    for (const [name, fn] of Object.entries(deps.repository)) if (name !== operation.repo) expect(fn).not.toHaveBeenCalled();
  });
  it.each(['missing', 'expired', 'unassigned', 'suspended', 'student', 'coordinator'] as const)('rejects %s access before repository work', async state => {
    const deps = fixture();
    if (state === 'missing' || state === 'expired') deps.auth.verify = vi.fn(async () => { throw new AuthError(401, 'SESSION_INVALID', 'Session required.'); });
    if (state === 'unassigned') deps.auth.access.find = vi.fn(async () => null);
    if (state === 'suspended') deps.auth.access.find = vi.fn(async (): Promise<AccessAssignment> => ({ clerkUserId: ACTOR, appRole: 'SYSTEM_ADMIN', roles: ['SYSTEM_ADMIN'], accessStatus: 'SUSPENDED' }));
    if (state === 'student' || state === 'coordinator') deps.auth.access.find = vi.fn(async (): Promise<AccessAssignment> => ({ clerkUserId: ACTOR, appRole: state === 'student' ? 'STUDENT' : 'COORDINATOR', roles: [state === 'student' ? 'STUDENT' : 'COORDINATOR'], accessStatus: 'ACTIVE' }));
    const response = await send(deps, operation.path, operation.method, operation.body);
    expect(response.status).toBe(state === 'missing' || state === 'expired' ? 401 : 403);
    expect(response.headers.get('cache-control')).toBe('no-store'); noCalls(deps);
  });
  it('rejects unexpected query parameters before repository work', async () => {
    const deps = fixture();
    expect((await send(deps, operation.path + '?actor=spoof', operation.method, operation.body)).status).toBe(400); noCalls(deps);
  });
  if (operation.body) {
    it('requires reason, rejects actor injection, media, syntax and bounded UTF-8 bodies', async () => {
      for (const [body, headers, expected] of [
        [{ ...operation.body, reason: ' ' }, undefined, 400],
        [{ ...operation.body, actor: 'user_spoofed' }, undefined, 400],
        [operation.body, { 'Content-Type': 'text/plain' }, 415],
        [operation.body, {}, 415], ['{broken', undefined, 400], [[], undefined, 400],
        [JSON.stringify({ reason: '界'.repeat(6000) }), undefined, 400],
        [operation.body, { 'Content-Type': 'application/json', 'Content-Length': '17000' }, 400],
      ] as const) {
        const deps = fixture();
        expect((await send(deps, operation.path, operation.method, body, headers)).status).toBe(expected); noCalls(deps);
      }
    });
  }
  it('redacts unexpected repository failures', async () => {
    const deps = fixture(); vi.mocked(deps.repository[operation.repo]).mockRejectedValue(new Error('postgres://secret SQL relation sensitive'));
    const response = await send(deps, operation.path, operation.method, operation.body);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: new AcademicSetupDomainError('DEPENDENCY_UNAVAILABLE').message } });
  });
});

describe('academic API boundaries', () => {
  it.each([
    ['/learning-centres', 'GET, POST'], ['/faculties', 'GET, POST'], ['/departments', 'GET, POST'], ['/programmes', 'GET, POST'], ['/curricula', 'GET, POST'], ['/curricula/1', 'PATCH'], ['/programmes/1', 'PATCH'],
    ['/semesters', 'GET, POST'], ['/current-semester', 'GET, PUT'], ['/coordinator-assignments', 'GET, POST'],
    ['/learning-centres/1', 'PATCH'], ['/faculties/1', 'PATCH'], ['/departments/1', 'PATCH'], ['/semesters/1', 'PATCH'],
    ['/programmes/1/department', 'PATCH'], ['/coordinator-assignments/1/end', 'POST'],
  ])('%s rejects unsupported methods with Allow %s', async (path, allow) => {
    const deps = fixture(), response = await send(deps, path, 'DELETE');
    expect(response.status).toBe(405); expect(response.headers.get('Allow')).toBe(allow); noCalls(deps);
  });
  it('rejects query parameters on curricula and unsupported curricula methods', async () => {
    const deps = fixture();
    expect((await send(deps, '/curricula?x=1')).status).toBe(400);
    const put = await send(deps, '/curricula', 'PUT', {});
    expect(put.status).toBe(405); expect(put.headers.get('Allow')).toBe('GET, POST'); noCalls(deps);
  });
  it.each(['0', '-1', '01', '1e2', '2147483648', 'abc'])('rejects invalid ID %s', async raw => {
    for (const [path, method, body] of [
      ['/learning-centres/' + raw, 'PATCH', { centreName: 'Test', reason }],
      ['/coordinator-assignments?accountId=' + raw, 'GET', undefined],
    ] as const) {
      const deps = fixture(); expect((await send(deps, path, method, body)).status).toBe(400); noCalls(deps);
    }
  });
  it.each(['includeInactive=1', 'includeInactive=', 'includeInactive=True', 'includeInactive=true&includeInactive=false'])('rejects malformed boolean/duplicate query %s', async query => {
    const deps = fixture(); expect((await send(deps, '/learning-centres?' + query)).status).toBe(400); noCalls(deps);
  });
  it('passes only normalized boolean and numeric filters', async () => {
    const deps = fixture();
    await send(deps, '/learning-centres?includeInactive=true'); await send(deps, '/faculties?includeInactive=false');
    await send(deps, '/coordinator-assignments?accountId=12&programmeId=9&learningCentreId=7');
    expect(deps.repository.listLearningCentres).toHaveBeenCalledWith(true);
    expect(deps.repository.listFaculties).toHaveBeenCalledWith(false);
    expect(deps.repository.listCoordinatorAssignments).toHaveBeenCalledWith({ accountId: 12, programmeId: 9, learningCentreId: 7 });
    expect((await send(deps, '/coordinator-assignments?programmeId=9&programmeId=9')).status).toBe(400);
  });
  it('normalizes reason and sends sparse semester PATCH for atomic repository validation', async () => {
    const deps = fixture();
    await send(deps, '/semesters/10', 'PATCH', { endDate: '2026-12-01', reason: '  Reviewed correction  ' });
    expect(deps.repository.updateAcademicSemester).toHaveBeenCalledExactlyOnceWith(10, { endDate: '2026-12-01', reason }, ACTOR);
    expect(deps.repository.listAcademicSemesters).not.toHaveBeenCalled();
  });
  it('rejects a semester selection window whose closing time is not after the opening time', async () => {
    const deps = fixture();
    expect((await send(deps, '/semesters/10', 'PATCH', { selectionOpensAt: '2026-12-02T00:00:00.000Z', selectionClosesAt: '2026-12-01T00:00:00.000Z', reason })).status).toBe(400);
    expect((await send(deps, '/semesters/10', 'PATCH', { selectionOpensAt: 'tomorrow', reason })).status).toBe(400);
    noCalls(deps);
  });
  it.each(ACADEMIC_SETUP_ERROR_CODES)('maps stable domain error %s', async code => {
    const deps = fixture(), error = new AcademicSetupDomainError(code);
    vi.mocked(deps.repository.createCoordinatorAssignment).mockRejectedValue(error);
    const response = await send(deps, '/coordinator-assignments', 'POST', assignmentInput);
    expect(response.status).toBe(code === 'INVALID_REQUEST' ? 400 : code === 'NOT_FOUND' ? 404 : code === 'DEPENDENCY_UNAVAILABLE' ? 503 : 409);
    expect(await response.json()).toEqual({ error: { code, message: error.message } });
  });
  it('rechecks role assignments on every call and does not cache authorization', async () => {
    const deps = fixture();
    expect((await send(deps, '/semesters')).status).toBe(200);
    vi.mocked(deps.auth.access.find).mockResolvedValue({ clerkUserId: ACTOR, appRole: 'COORDINATOR', roles: ['COORDINATOR'], accessStatus: 'ACTIVE' });
    expect((await send(deps, '/semesters')).status).toBe(403);
    expect(deps.auth.verify).toHaveBeenCalledTimes(2); expect(deps.auth.access.find).toHaveBeenCalledTimes(2);
    expect(deps.repository.listAcademicSemesters).toHaveBeenCalledTimes(1);
  });
  it('fails closed for spoofed account identity or unverified email', async () => {
    const deps = fixture();
    vi.mocked(deps.auth.access.find).mockResolvedValue({ clerkUserId: 'user_other', appRole: 'SYSTEM_ADMIN', roles: ['SYSTEM_ADMIN'], accessStatus: 'ACTIVE' });
    expect((await send(deps, '/semesters')).status).toBe(503); noCalls(deps);
    const unverified = fixture();
    vi.mocked(unverified.auth.verify).mockResolvedValue({ clerkUserId: ACTOR, sessionId: 'test', primaryEmail: { address: 'admin@utm.my', verified: false } });
    expect((await send(unverified, '/semesters')).status).toBe(403); noCalls(unverified);
  });
  it('returns null outside owned prefix and safe 404 within owned prefix', async () => {
    const deps = fixture();
    expect(await handleAcademicSetupRequest(new Request('https://test.invalid/api/admin/users'), deps)).toBeNull();
    expect(deps.auth.verify).not.toHaveBeenCalled();
    expect((await send(deps, '/unknown')).status).toBe(404); noCalls(deps);
  });
});
