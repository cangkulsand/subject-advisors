import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAcademicSetupClient } from './academic-client';
import { keepAccountSession } from '../auth/account-cache';

beforeEach(() => keepAccountSession({ userId: 'user_admin_fixture', sessionId: 'session_fixture' }));
afterEach(() => { keepAccountSession(null); vi.unstubAllGlobals(); vi.useRealTimers(); });
const centre = { learningCentreId: 1, centreCode: 'TEST', centreName: 'Fictional centre', isActive: true };
const faculty = { facultyId: 2, facultyCode: 'TEST', facultyName: 'Fictional faculty', isActive: true };
const department = { departmentId: 4, departmentCode: 'DEP', departmentName: 'Fictional department', facultyId: 2, isActive: true };
const programme = { programmeId: 3, programmeCode: 'TEST', programmeName: 'Fictional programme', facultyId: 2, faculty, departmentId: 4, department };
const semester = { semesterId: 4, academicYear: '2026/2027', semesterNo: 1 as const, semesterType: 'NORMAL' as const, maxSubjects: 4, maxCredits: 12, startDate: null, endDate: null, isCurrent: true, selectionOpensAt: null, selectionClosesAt: null };
const assignment = { assignmentId: 5, accountId: 6, facultyId: 2, programmeId: 3, learningCentreId: 1, startedAt: '2026-11-02T00:00:00Z', endedAt: null };
const prefix = '/api/admin/academic-setup';
type Client = ReturnType<typeof createAcademicSetupClient>;
it.each([
  ['centres', (c: Client) => c.centres(), '/learning-centres?includeInactive=true', [centre]],
  ['faculties', (c: Client) => c.faculties(), '/faculties?includeInactive=true', [faculty]],
  ['departments', (c: Client) => c.departments(), '/departments?includeInactive=true', [department]],
  ['programmes', (c: Client) => c.programmes(), '/programmes', [programme]],
  ['semesters', (c: Client) => c.semesters(), '/semesters', [semester]],
  ['current', (c: Client) => c.currentSemester(), '/current-semester', null],
  ['assignments', (c: Client) => c.assignments(), '/coordinator-assignments', [assignment]],
])('%s reads fresh authenticated data and preserves an unset current marker', async (_name, call, path, data) => {
  const fetcher = vi.fn(async () => Response.json({ data })); vi.stubGlobal('fetch', fetcher);
  await expect(call(createAcademicSetupClient(async () => 'TEST_ONLY', 'https://fixture.invalid/'))).resolves.toEqual(data);
  expect(fetcher).toHaveBeenCalledWith('https://fixture.invalid' + prefix + path, expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer TEST_ONLY' } }));
});
it.each([
  [(c: Client) => c.createCentre({ centreCode: 'TEST', centreName: 'Fictional centre', reason: 'Why' }), 'POST', '/learning-centres', centre],
  [(c: Client) => c.updateCentre(1, { isActive: false, reason: 'Why' }), 'PATCH', '/learning-centres/1', { ...centre, isActive: false }],
  [(c: Client) => c.createFaculty({ facultyCode: 'TEST', facultyName: 'Fictional faculty', reason: 'Why' }), 'POST', '/faculties', faculty],
  [(c: Client) => c.updateFaculty(2, { isActive: false, reason: 'Why' }), 'PATCH', '/faculties/2', { ...faculty, isActive: false }],
  [(c: Client) => c.createDepartment({ departmentCode: 'DEP', departmentName: 'Fictional department', facultyId: 2, reason: 'Why' }), 'POST', '/departments', department],
  [(c: Client) => c.updateDepartment(4, { isActive: false, reason: 'Why' }), 'PATCH', '/departments/4', { ...department, isActive: false }],
  [(c: Client) => c.setProgrammeDepartment(3, { departmentId: null, reason: 'Why' }), 'PATCH', '/programmes/3/department', { ...programme, facultyId: null, faculty: null, departmentId: null, department: null }],
  [(c: Client) => c.createSemester({ academicYear: '2026/2027', semesterNo: 1, semesterType: 'NORMAL', maxSubjects: 4, maxCredits: 12, startDate: null, endDate: null, selectionOpensAt: null, selectionClosesAt: null, reason: 'Why' }), 'POST', '/semesters', semester],
  [(c: Client) => c.updateSemester(4, { maxCredits: 15, reason: 'Why' }), 'PATCH', '/semesters/4', { ...semester, maxCredits: 15 }],
  [(c: Client) => c.setCurrentSemester({ semesterId: 4, reason: 'Why' }), 'PUT', '/current-semester', semester],
  [(c: Client) => c.createAssignment({ accountId: 6, facultyId: 2, programmeId: 3, learningCentreId: 1, reason: 'Why' }), 'POST', '/coordinator-assignments', assignment],
  [(c: Client) => c.endAssignment(5, 'Why'), 'POST', '/coordinator-assignments/5/end', { ...assignment, endedAt: '2026-11-03T00:00:00Z' }],
])('sends contract mutation %s with a reason and decodes its response', async (call, method, path, data) => {
  const fetcher = vi.fn(async () => Response.json({ data })); vi.stubGlobal('fetch', fetcher);
  await expect(call(createAcademicSetupClient(async () => 'TEST_ONLY'))).resolves.toEqual(data);
  expect(fetcher).toHaveBeenCalledWith(prefix + path, expect.objectContaining({ method, cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer TEST_ONLY', 'Content-Type': 'application/json' }, body: expect.stringContaining('"reason":"Why"') }));
});
it.each([
  [(c: Client) => c.centres(), [{ ...centre, isActive: 'true' }]],
  [(c: Client) => c.faculties(), [{ ...faculty, facultyId: 0 }]],
  [(c: Client) => c.programmes(), [{ ...programme, facultyId: 99 }]],
  [(c: Client) => c.programmes(), [{ ...programme, departmentId: 99 }]],
  [(c: Client) => c.programmes(), [{ ...programme, department: null }]],
  [(c: Client) => c.departments(), [{ ...department, facultyId: 0 }]],
  [(c: Client) => c.semesters(), [{ ...semester, semesterNo: 3 }]],
  [(c: Client) => c.currentSemester(), {}],
  [(c: Client) => c.assignments(), [{ ...assignment, endedAt: false }]],
])('rejects malformed academic response %s as a stable inline error', async (call, data) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data })));
  await expect(call(createAcademicSetupClient(async () => 'TEST_ONLY'))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('preserves stable backend mutation errors', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'ASSIGNMENT_ENDED', message: 'Assignment already ended.' } }, { status: 409 })));
  await expect(createAcademicSetupClient(async () => 'TEST_ONLY').endAssignment(5, 'Why')).rejects.toMatchObject({ status: 409, code: 'ASSIGNMENT_ENDED', message: 'Assignment already ended.' });
});
it('rejects a response when account session changes while it is pending', async () => {
  let finish!: (r: Response) => void; vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const pending = createAcademicSetupClient(async () => 'TEST_ONLY').centres().catch(e => e);
  await vi.waitFor(() => expect(finish).toBeDefined());
  keepAccountSession({ userId: 'another', sessionId: 'another' }); finish(Response.json({ data: [centre] }));
  expect(await pending).toMatchObject({ code: 'SESSION_CHANGED' });
});
it('bounds stalled tokens without issuing a late request', async () => {
  vi.useFakeTimers(); let token!: (v: string) => void; const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const pending = createAcademicSetupClient(() => new Promise<string>(resolve => { token = resolve; })).centres().catch(e => e);
  await vi.advanceTimersByTimeAsync(15000); expect(await pending).toMatchObject({ code: 'ADMIN_TIMEOUT' });
  token('LATE_TEST_ONLY'); await Promise.resolve(); expect(fetcher).not.toHaveBeenCalled();
});
it('aborts before token resolution without issuing a request', async () => {
  const controller = new AbortController(); controller.abort(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(createAcademicSetupClient(async () => 'TEST_ONLY').centres(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([401, 403])('preserves unreadable %s denial status', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status })));
  await expect(createAcademicSetupClient(async () => 'TEST_ONLY').centres()).rejects.toMatchObject({ status });
});