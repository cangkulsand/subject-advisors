import { describe, expect, it, vi } from 'vitest';
import type { AccessAssignment, VerifiedIdentity } from '../auth/contracts';
import { AuthError } from '../auth/errors';
import { demoContext } from '../../../../../tools/offerings/demo/fixtures';
import type { OfferingDependencies } from './contracts';
import { handleOfferingRequest } from './routes';

function fixture() {
  const identity: VerifiedIdentity = { clerkUserId: 'fictional_a', sessionId: 'fictional_session',
    primaryEmail: { address: 'fictional@graduate.utm.my', verified: true } };
  const assignment: AccessAssignment = { clerkUserId: identity.clerkUserId, appRole: 'STUDENT', accessStatus: 'ACTIVE' };
  const values = new Map<string, string[]>();
  const context = { ...structuredClone(demoContext), studentId: '301' };
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
    expect(body.data.selection).toBeNull();
    expect(body.data.studentId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('fictional_a');
    expect(f.deps.contextFor).toHaveBeenCalledWith('fictional_a');
  });
  it('saves and reloads idempotently for a configured semester', async () => {
    const f = fixture(); const input = { semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId] };
    expect((await f.get(f.request(input))).status).toBe(200);
    expect((await f.get(f.request(input))).status).toBe(200);
    const result = await (await f.get(f.request(undefined, '?semesterId=' + f.semesterId))).json();
    expect(result.data.selection).toEqual(input);
    expect(f.values.size).toBe(1);
    expect(f.deps.repository.replace).toHaveBeenCalledWith({ clerkUserId: 'fictional_a', studentId: f.context.studentId, curriculumId: f.context.curriculum.curriculumId }, input);
  });
  it('isolates students and semesters using verified identity', async () => {
    const f = fixture();
    await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [f.subjectId] }));
    f.identity.clerkUserId = 'fictional_b'; f.assignment.clerkUserId = 'fictional_b';
    expect((await (await f.get(f.request(undefined, '?semesterId=' + f.semesterId))).json()).data.selection.curriculumSubjectIds).toEqual([]);
    f.identity.clerkUserId = 'fictional_a'; f.assignment.clerkUserId = 'fictional_a';
    const second = demoContext.semesters[1]!.semesterId;
    expect((await (await f.get(f.request(undefined, '?semesterId=' + second))).json()).data.selection.curriculumSubjectIds).toEqual([]);
  });
  it.each(['studentId', 'clerkUserId', 'curriculumId'])('rejects browser ownership field %s', async field => {
    const f = fixture();
    expect((await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: [], [field]: 'other' }))).status).toBe(400);
    expect(f.deps.repository.replace).not.toHaveBeenCalled();
  });
  it('rejects subjects outside the current curriculum and duplicates without writes', async () => {
    const f = fixture();
    for (const ids of [['601'], [f.subjectId, f.subjectId]]) {
      expect((await f.get(f.request({ semesterId: f.semesterId, curriculumSubjectIds: ids }))).status).toBe(400);
    }
    expect(f.deps.repository.replace).not.toHaveBeenCalled();
  });
  it('rejects unconfigured semester and unexpected/ambiguous queries', async () => {
    const f = fixture();
    expect((await f.get(f.request(undefined, '?semesterId=601'))).status).toBe(404);
    for (const query of ['?studentId=other', '?semesterId=bad', '?semesterId=' + f.semesterId + '&semesterId=' + f.semesterId]) {
      expect((await f.get(f.request(undefined, query))).status).toBe(400);
    }
  });
  it.each(['COORDINATOR', 'SYSTEM_ADMIN'] as const)('denies %s access', async role => {
    const f = fixture(); f.assignment.appRole = role;
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
