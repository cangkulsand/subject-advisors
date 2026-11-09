import { describe, expect, it, vi } from 'vitest';
import { handleStudentEligibilityRequest, STUDENT_ELIGIBILITY_PATH, type StudentEligibilityDependencies } from './routes';

function fixture(roles: ('STUDENT'|'COORDINATOR'|'SYSTEM_ADMIN')[] = ['STUDENT']) {
  const readOwnEligibility = vi.fn(async () => ({ input: null, emptyScope: null, centreBasis: 'Interim ScopeProvider centre mapping (centre 1)', internal: { studentId: 22, sourceSnapshot: { student_id: 22, secret: 'internal', pick_deadline: '2026-11-20T12:00:00Z' }, sourceRevision: 'fp1:secret' } }));
  const deps: StudentEligibilityDependencies = { auth: {
    verify: vi.fn(async () => ({ clerkUserId: 'clerk-own', sessionId: 'session', primaryEmail: { address: 's@graduate.utm.my', verified: true } })),
    access: { find: vi.fn(async (clerkUserId) => ({ clerkUserId, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
  }, reader: { readOwnEligibility } };
  return { deps, readOwnEligibility };
}
describe('GET /api/student/eligible-offerings', () => {
  it('requires a fresh student identity with a complete profile and reads only that identity', async () => {
    const { deps, readOwnEligibility } = fixture();
    const response = await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`), deps);
    expect(response?.status).toBe(200); expect(readOwnEligibility).toHaveBeenCalledWith('clerk-own');
  });
  it('does not serialize the internal source envelope into public eligibility data', async () => {
    const { deps } = fixture();
    const response = await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`), deps);
    const body = await response!.text();
    expect(body).not.toContain('sourceSnapshot');
    expect(body).not.toContain('sourceRevision');
    expect(body).not.toContain('student_id');
    expect(body).not.toContain('fp1:secret');
    expect(body).not.toContain('internal');
    expect(body).not.toContain('pick_deadline');
  });
  it('rejects query scope overrides and non-students', async () => {
    const f = fixture();
    expect((await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}?programmeId=7`), f.deps))?.status).toBe(400);
    const c = fixture(['COORDINATOR']);
    expect((await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`), c.deps))?.status).toBe(403);
  });
  it('returns a redacted safe error when the reader fails', async () => {
    const f = fixture(); f.deps.reader.readOwnEligibility = vi.fn(async () => { throw new Error('secret SQL details'); });
    const response = await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`), f.deps);
    expect(response?.status).toBe(503); expect(await response?.text()).not.toContain('secret SQL');
  });
});
it('fails closed on absent or incomplete profiles and suspended accounts before querying academic data', async () => {
  for (const state of ['SETUP_REQUIRED', 'UNAVAILABLE'] as const) {
    const f = fixture(); f.deps.auth.profiles = { stateFor: vi.fn(async () => state) };
    const response = await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`), f.deps);
    expect(response?.status).toBe(state === 'SETUP_REQUIRED' ? 403 : 503); expect(f.readOwnEligibility).not.toHaveBeenCalled();
  }
  const f = fixture(); f.deps.auth.access.find = vi.fn(async () => ({ clerkUserId: 'clerk-own', appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'SUSPENDED' as const }));
  expect((await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`), f.deps))?.status).toBe(403);
  expect(f.readOwnEligibility).not.toHaveBeenCalled();
});
it('is read-only, rejects all scope and identity parameters, and sets private response headers', async () => {
  const f = fixture();
  const response = await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`, { method: 'PUT', body: '{}' }), f.deps);
  expect(response?.status).toBe(405); expect(response?.headers.get('allow')).toBe('GET');
  for (const query of ['studentId=other', 'clerkUserId=other', 'semesterId=99', 'programmeId=3', 'learningCentreId=2']) {
    expect((await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}?${query}`), f.deps))?.status).toBe(400);
  }
  expect(f.readOwnEligibility).not.toHaveBeenCalled();
  const success = await handleStudentEligibilityRequest(new Request(`https://x${STUDENT_ELIGIBILITY_PATH}`), f.deps);
  expect(success?.headers.get('cache-control')).toBe('no-store'); expect(success?.headers.get('vary')).toBe('Authorization');
});
