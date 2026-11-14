import { describe, expect, it, vi } from 'vitest';
import type { AccessAssignment, VerifiedIdentity } from '../auth/contracts';
import { AuthError } from '../auth/errors';
import { demoContext } from '../../../../../tools/offerings/demo/fixtures';
import type { OfferingDependencies, StudentOfferingContext } from './contracts';
import { handleOfferingRequest } from './routes';

function fixture() {
  const identity: VerifiedIdentity = { clerkUserId: 'fictional_a', sessionId: 'fictional_session',
    primaryEmail: { address: 'fictional@graduate.utm.my', verified: true } };
  const assignment: AccessAssignment = { clerkUserId: identity.clerkUserId, appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' };
  const values = new Map<string, string[]>();
  const context: StudentOfferingContext = { ...structuredClone(demoContext), studentId: '301', programmeId: '501', learningCentreId: '601',
    withdrawnSubjects: [], window: structuredClone(demoContext.window!), limits: { maxSubjects: 6, maxCredits: 18 } };
  const deps: OfferingDependencies = {
    auth: {
      verify: vi.fn(async () => identity),
      access: { find: vi.fn(async () => assignment), initializeStudent: vi.fn(async () => assignment) },
      profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
    },
    contextFor: vi.fn(async () => context),
    repository: {
      read: vi.fn(async (scope, semesterId) => ({ semesterId, curriculumSubjectIds: values.get(scope.clerkUserId + semesterId) ?? [] })),
      replace: vi.fn(async (scope, input) => {
        values.set(scope.clerkUserId + input.semesterId, [...input.curriculumSubjectIds]);
        return { ...input };
      }),
    },
  };
  const semesterId = demoContext.semesters[0]!.semesterId;
  const subjectId = demoContext.subjects[0]!.curriculumSubjectId;
  const request = (input?: unknown, query = '') => new Request('https://test.invalid/api/semester-offerings' + query, input === undefined ? {} : {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const get = async (req: Request) => {
    const response = await handleOfferingRequest(req, deps);
    if (!response) throw new Error('Expected route response');
    return response;
  };
  return { identity, assignment, values, context, deps, semesterId, subjectId, request, get };
}

describe('authenticated UC08 offering routes', () => {
  it('exposes only context, no student or Clerk ID, with no-store authorization caching', async () => {
    const f = fixture(); const response = await f.get(f.request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Authorization');
    const body = await response.json();
    expect(body.data.selection).toEqual({ semesterId: f.semesterId, curriculumSubjectIds: [] });
    expect(body.data.currentSemesterId).toBe(f.semesterId);
    expect(body.data.studentId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('fictional_a');
    expect(f.deps.contextFor).toHaveBeenCalledWith('fictional_a', { includePrerequisites: true });
  });
  it('saves and reloads idempotently for a configured semester', async () => {
    const f = fixture(); const input = { semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId] };
    expect((await f.get(f.request(input))).status).toBe(200);
    expect((await f.get(f.request(input))).status).toBe(200);
    const result = await (await f.get(f.request(undefined, '?semesterId=' + f.semesterId))).json();
    expect(result.data.selection).toEqual(input);
    expect(f.values.size).toBe(1);
    expect(f.deps.repository.replace).toHaveBeenCalledWith({ clerkUserId: 'fictional_a', studentId: f.context.studentId, curriculumId: f.context.curriculum.curriculumId, programmeId: '501', learningCentreId: '601' }, input);
    expect(f.deps.contextFor).toHaveBeenCalledWith('fictional_a', { includePrerequisites: true });
  });
  it('isolates students and semesters using verified identity', async () => {
    const f = fixture();
    await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId] }));
    f.identity.clerkUserId = 'fictional_b'; f.assignment.clerkUserId = 'fictional_b';
    expect((await (await f.get(f.request(undefined, '?semesterId=' + f.semesterId))).json()).data.selection.curriculumSubjectIds).toEqual([]);
    f.identity.clerkUserId = 'fictional_a'; f.assignment.clerkUserId = 'fictional_a';
    const second = demoContext.semesters[1]!.semesterId;
    expect((await f.get(f.request(undefined, '?semesterId=' + second))).status).toBe(409);
  });
  it.each(['studentId', 'clerkUserId', 'curriculumId'])('rejects browser ownership field %s', async field => {
    const f = fixture();
    expect((await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [], [field]: 'other' }))).status).toBe(400);
    expect(f.deps.repository.replace).not.toHaveBeenCalled();
  });
  it('rejects duplicates with 400 and any subject that is not approved with 409 OFFERING_NOT_APPROVED, without writes', async () => {
    const f = fixture();
    expect((await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId, f.subjectId] }))).status).toBe(400);
    const outside = await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: ['601'] }));
    expect(outside.status).toBe(409);
    expect((await outside.json()).error.code).toBe('OFFERING_NOT_APPROVED');
    expect(f.deps.repository.replace).not.toHaveBeenCalled();
  });
  it('PUT rejects a subject that is no longer approved', async () => {
    const f = fixture();
    // The coordinator withdrew the subject: the fresh context no longer lists it.
    f.context.subjects = f.context.subjects.filter(subject => subject.curriculumSubjectId !== f.subjectId);
    const response = await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId] }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: 'OFFERING_NOT_APPROVED', message: 'A subject you picked is no longer offered. Reload offerings.' });
    expect(f.deps.repository.replace).not.toHaveBeenCalled();
  });
  it('PUT rejects picks over max_subjects or max_credits', async () => {
    const f = fixture();
    f.context.limits = { maxSubjects: 1, maxCredits: 18 };
    const ids = f.context.subjects.slice(0, 2).map(subject => subject.curriculumSubjectId);
    const bySubjects = await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: ids }));
    expect(bySubjects.status).toBe(409);
    expect((await bySubjects.json()).error).toMatchObject({ code: 'PICK_LIMIT_EXCEEDED', message: 'You can pick at most 1 subjects and 18 credits for this semester.' });
    f.context.limits = { maxSubjects: 6, maxCredits: 5 };
    const byCredits = await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: ids }));
    expect(byCredits.status).toBe(409);
    expect((await byCredits.json()).error.code).toBe('PICK_LIMIT_EXCEEDED');
    expect(f.deps.repository.replace).not.toHaveBeenCalled();
  });
  describe('eligibility on save', () => {
    const subject = (id: string, code: string, name: string, items: Array<{ requiredCurriculumSubjectId: string; requirementType: 'MANDATORY' | 'COREQUISITE' }> = []) =>
      ({ curriculumSubjectId: id, code, name, creditHours: 3, prerequisites: { status: 'available' as const, items } });
    function eligibilityFixture() {
      const f = fixture();
      f.context.subjects = [
        subject('11', 'A001', 'Fictional A'),
        subject('12', 'B001', 'Fictional B', [{ requiredCurriculumSubjectId: '11', requirementType: 'MANDATORY' }]),
        subject('13', 'C001', 'Fictional C'),
        subject('14', 'D001', 'Fictional D', [{ requiredCurriculumSubjectId: '13', requirementType: 'COREQUISITE' }]),
      ].map((s, index) => ({ ...s, subjectId: String(900 + index) }));
      f.context.history = { status: 'available', records: [] };
      const put = (ids: string[]) => f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: ids }));
      return { f, put };
    }
    it('rejects a subject whose mandatory prerequisite is not passed with 409 OFFERING_NOT_ELIGIBLE', async () => {
      const { f, put } = eligibilityFixture();
      const response = await put(['12']);
      expect(response.status).toBe(409);
      expect((await response.json()).error).toEqual({ code: 'OFFERING_NOT_ELIGIBLE', message: 'B001 cannot be picked: Needs A001 Fictional A.' });
      expect(f.deps.repository.replace).not.toHaveBeenCalled();
    });
    it('accepts a subject picked together with its corequisite', async () => {
      const { put } = eligibilityFixture();
      expect((await put(['13', '14'])).status).toBe(200);
    });
    it('does not block when academic history is unavailable', async () => {
      const { f, put } = eligibilityFixture();
      f.context.history = { status: 'unavailable' };
      expect((await put(['12'])).status).toBe(200);
    });
    it('keeps approval and limit errors ahead of eligibility', async () => {
      const { f, put } = eligibilityFixture();
      expect((await (await put(['12', '999'])).json()).error.code).toBe('OFFERING_NOT_APPROVED');
      f.context.limits = { maxSubjects: 0, maxCredits: 18 };
      expect((await (await put(['12'])).json()).error.code).toBe('PICK_LIMIT_EXCEEDED');
    });
    it('never exposes history on GET', async () => {
      const { f } = eligibilityFixture();
      const body = await (await f.get(f.request())).json();
      expect(body.data.history).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('"records"');
    });
  });
  it('PUT is 409 PICKS_CLOSED after closing and 409 PICKS_NOT_OPEN during planning', async () => {
    const closed = fixture(); closed.context.window.status = 'CLOSED';
    const response = await closed.get(closed.request({ semesterId: closed.semesterId, curriculumSubjectIds: [closed.subjectId] }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: 'PICKS_CLOSED', message: 'Picking is closed. The selection period has ended.' });
    for (const status of ['NOT_OPEN', 'NOT_SCHEDULED', 'NO_NEXT_SEMESTER', 'NO_LEARNING_CENTRE'] as const) {
      const f = fixture(); f.context.window.status = status;
      const planning = await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [] }));
      expect(planning.status).toBe(409);
      expect((await planning.json()).error).toMatchObject({ code: 'PICKS_NOT_OPEN', message: 'Picking has not opened yet.' });
      expect(f.deps.repository.replace).not.toHaveBeenCalled();
    }
  });
  it('GET with another semesterId is 409 SEMESTER_NOT_TARGET', async () => {
    const f = fixture(); const other = demoContext.semesters[1]!.semesterId;
    const response = await f.get(f.request(undefined, '?semesterId=' + other));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: 'SEMESTER_NOT_TARGET', message: 'Offerings are only available for the next semester.' });
  });
  it('no learning centre shows the profile prompt', async () => {
    const f = fixture();
    f.context.learningCentreId = null; f.context.subjects = []; f.context.window = { ...f.context.window, status: 'NO_LEARNING_CENTRE', learningCentreName: null };
    const response = await f.get(f.request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.window.status).toBe('NO_LEARNING_CENTRE');
    expect(body.data.subjects).toEqual([]);
    expect(body.data.selection).toBeNull();
    expect(f.deps.repository.read).not.toHaveBeenCalled();
  });
  it('returns the window, limits and withdrawal notes, and lists only picks that are still offered', async () => {
    const f = fixture();
    f.context.withdrawnSubjects = [{ subjectId: '9', code: 'DEMO204', name: 'Human–computer interaction', withdrawnAt: '2026-11-09T10:00:00.000Z' }];
    f.values.set('fictional_a' + f.semesterId, [f.subjectId, '999']);
    const body = await (await f.get(f.request())).json();
    expect(body.data).toMatchObject({ window: { status: 'OPEN', targetSemesterId: f.semesterId }, limits: { maxSubjects: 6, maxCredits: 18 },
      withdrawnSubjects: [{ code: 'DEMO204' }], selection: { curriculumSubjectIds: [f.subjectId] } });
    expect(body.data.programmeId).toBeUndefined();
    expect(body.data.learningCentreId).toBeUndefined();
  });
  it('rejects unconfigured semester and unexpected/ambiguous queries', async () => {
    const f = fixture();
    expect((await f.get(f.request(undefined, '?semesterId=601'))).status).toBe(404);
    for (const query of ['?studentId=other', '?semesterId=bad', '?semesterId=' + f.semesterId + '&semesterId=' + f.semesterId]) {
      expect((await f.get(f.request(undefined, query))).status).toBe(400);
    }
  });
  it('uses only the target semester for reads and writes and tolerates a missing next semester', async () => {
    const f = fixture();
    const other = demoContext.semesters[1]!.semesterId;
    expect((await f.get(f.request(undefined, '?semesterId=' + other))).status).toBe(409);
    expect((await f.get(f.request({ semesterId: other, curriculumSubjectIds: [f.subjectId] }))).status).toBe(409);
    expect(f.deps.repository.replace).not.toHaveBeenCalled();
    const none = fixture(); delete none.context.currentSemesterId;
    none.context.subjects = []; none.context.window = { status: 'NO_NEXT_SEMESTER', targetSemesterId: null, selectionOpensAt: null, selectionClosesAt: null, learningCentreName: 'Demonstration centre' };
    const response = await none.get(none.request());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ window: { status: 'NO_NEXT_SEMESTER' }, selection: null });
  });
  it.each(['COORDINATOR', 'SYSTEM_ADMIN'] as const)('denies %s access', async role => {
    const f = fixture(); f.assignment.appRole = role; f.assignment.roles = [role];
    expect((await f.get(f.request())).status).toBe(403);
    expect(f.deps.contextFor).not.toHaveBeenCalled();
  });
  it('denies suspended students, invalid sessions, and unverified emails', async () => {
    const f = fixture(); f.assignment.accessStatus = 'SUSPENDED';
    expect((await f.get(f.request())).status).toBe(403);
    f.assignment.accessStatus = 'ACTIVE'; f.identity.primaryEmail!.verified = false;
    expect((await f.get(f.request())).status).toBe(403);
    vi.mocked(f.deps.auth.verify).mockRejectedValue(new AuthError(401, 'SESSION_INVALID', 'Sign in again.'));
    expect((await f.get(f.request())).status).toBe(401);
    expect(f.deps.contextFor).not.toHaveBeenCalled();
  });
  it('denies incomplete or unavailable profiles', async () => {
    const f = fixture();
    vi.mocked(f.deps.auth.profiles!.stateFor).mockResolvedValue('SETUP_REQUIRED');
    expect((await f.get(f.request())).status).toBe(403);
    vi.mocked(f.deps.auth.profiles!.stateFor).mockResolvedValue('UNAVAILABLE');
    expect((await f.get(f.request())).status).toBe(503);
    vi.mocked(f.deps.auth.profiles!.stateFor).mockResolvedValue('COMPLETE');
    vi.mocked(f.deps.contextFor).mockResolvedValue(null);
    expect((await f.get(f.request())).status).toBe(403);
  });
  it('returns a safe service error without serializing internal errors', async () => {
    const f = fixture();
    vi.mocked(f.deps.repository.replace).mockRejectedValue(new Error('secret database connection'));
    const response = await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId] }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
  });
  it('permits an empty set to remove all offerings', async () => {
    const f = fixture();
    await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId] }));
    await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [] }));
    expect((await (await f.get(f.request(undefined, '?semesterId=' + f.semesterId))).json()).data.selection.curriculumSubjectIds).toEqual([]);
  });
  it('returns null for other owners and Allow for unsupported methods', async () => {
    const f = fixture();
    expect(await handleOfferingRequest(new Request('https://test.invalid/api/profile'), f.deps)).toBeNull();
    const response = await f.get(new Request('https://test.invalid/api/semester-offerings', { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, PUT');
  });
});
