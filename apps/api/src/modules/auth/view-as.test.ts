import { describe, expect, it, vi } from 'vitest';
import { authorize } from '../../middleware/auth';
import { parseViewAs, VIEW_AS_HEADER } from './view-as';
import type { AccessAssignment, AuthDependencies, VerifiedIdentity } from './contracts';

const ADMIN = 'user_admin', STUDENT = 'user_student';
function fixture(options: { email?: string; roles?: AccessAssignment['roles']; status?: AccessAssignment['accessStatus']; profile?: 'COMPLETE' | 'SETUP_REQUIRED' } = {}) {
  const identity: VerifiedIdentity = { clerkUserId: ADMIN, sessionId: 's', primaryEmail: { address: options.email ?? 'admin@gmail.com', verified: true } };
  const admin: AccessAssignment = { clerkUserId: ADMIN, appRole: 'SYSTEM_ADMIN', roles: options.roles ?? ['SYSTEM_ADMIN'], accessStatus: options.status ?? 'ACTIVE' };
  const deps: AuthDependencies = {
    verify: vi.fn(async () => identity),
    access: {
      find: vi.fn(async (id: string) => id === ADMIN ? admin : null), initializeStudent: vi.fn(),
      studentClerkUserId: vi.fn(async (studentId: number) => studentId === 42 ? { clerkUserId: STUDENT, studentName: 'Aina' } : null),
    },
    profiles: { stateFor: vi.fn(async (id: string) => id === STUDENT ? options.profile ?? 'COMPLETE' : 'SETUP_REQUIRED') },
  };
  return { deps, identity };
}
const request = (viewAs: string | null, method = 'GET') =>
  new Request('https://app.test/api/x', { method, headers: viewAs === null ? {} : { [VIEW_AS_HEADER]: viewAs } });

describe('parseViewAs', () => {
  it('reads coordinator and student contexts', () => {
    expect(parseViewAs('COORDINATOR;programme=3;centre=7')).toEqual({ role: 'COORDINATOR', programmeId: 3, learningCentreId: 7 });
    expect(parseViewAs('STUDENT;student=42')).toEqual({ role: 'STUDENT', studentId: 42 });
    expect(parseViewAs(null)).toBeNull();
  });
  it.each(['', 'ADMIN;x=1', 'COORDINATOR;programme=3', 'COORDINATOR;programme=0;centre=7', 'STUDENT;student=-1', 'STUDENT;student=4x', 'STUDENT;student=42;extra=1', 'STUDENT;student=1e3'])('rejects %j', value => {
    expect(() => parseViewAs(value)).toThrow(expect.objectContaining({ code: 'VIEW_AS_INVALID', status: 400 }));
  });
});

describe('authorize with a view-as context (S3-P004-033)', () => {
  it('leaves requests without the header unchanged', async () => {
    const f = fixture();
    expect(await authorize(request(null), f.deps, { roles: ['SYSTEM_ADMIN'] })).not.toHaveProperty('viewAs');
  });
  it.each([
    ['a student-only account', { email: 'a@graduate.utm.my', roles: ['STUDENT'] as AccessAssignment['roles'] }],
    ['a utm.my account holding SYSTEM_ADMIN (not eligible)', { email: 'a@utm.my', roles: ['SYSTEM_ADMIN', 'COORDINATOR'] as AccessAssignment['roles'] }],
  ])('refuses %s', async (_label, options) => {
    const f = fixture(options);
    await expect(authorize(request('COORDINATOR;programme=3;centre=7'), f.deps, { roles: ['COORDINATOR'] })).rejects.toMatchObject({ status: 403, code: 'VIEW_AS_DENIED' });
  });
  it('refuses a suspended admin', async () => {
    const f = fixture({ status: 'SUSPENDED' });
    await expect(authorize(request('STUDENT;student=42'), f.deps, { roles: ['STUDENT'] })).rejects.toMatchObject({ status: 403 });
  });
  it('acts as coordinator with the admin as actor and the chosen scope', async () => {
    const f = fixture();
    const me = await authorize(request('COORDINATOR;programme=3;centre=7', 'POST'), f.deps, { roles: ['COORDINATOR'] });
    expect(me).toMatchObject({ clerkUserId: ADMIN, appRole: 'COORDINATOR', availableRoles: ['SYSTEM_ADMIN', 'COORDINATOR'], landingPath: '/coordinator',
      viewAs: { role: 'COORDINATOR', programmeId: 3, learningCentreId: 7, adminClerkUserId: ADMIN } });
  });
  it('refuses a coordinator context on a route that does not take coordinators', async () => {
    const f = fixture();
    await expect(authorize(request('COORDINATOR;programme=3;centre=7'), f.deps, { roles: ['STUDENT'] })).rejects.toMatchObject({ code: 'ROLE_DENIED' });
  });
  it('reads as the chosen student on GET and HEAD', async () => {
    const f = fixture();
    for (const method of ['GET', 'HEAD']) {
      const me = await authorize(request('STUDENT;student=42', method), f.deps, { roles: ['STUDENT'], requireProfile: true });
      expect(me).toMatchObject({ clerkUserId: STUDENT, appRole: 'STUDENT', roles: ['STUDENT'], availableRoles: ['SYSTEM_ADMIN', 'STUDENT'], profileState: 'COMPLETE', landingPath: '/student',
        viewAs: { role: 'STUDENT', studentId: 42, adminClerkUserId: ADMIN, studentName: 'Aina' } });
    }
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses %s in student view', async method => {
    const f = fixture();
    await expect(authorize(request('STUDENT;student=42', method), f.deps, { roles: ['STUDENT'] })).rejects.toMatchObject({ status: 403, code: 'VIEW_AS_READ_ONLY' });
    expect(f.deps.access.studentClerkUserId).not.toHaveBeenCalled();
  });
  it('refuses account initialization with any view-as context', async () => {
    const f = fixture();
    await expect(authorize(request('COORDINATOR;programme=3;centre=7', 'POST'), f.deps, { initialize: true })).rejects.toMatchObject({ code: 'VIEW_AS_READ_ONLY' });
    expect(f.deps.access.initializeStudent).not.toHaveBeenCalled();
  });
  it('returns 404 for an unknown student and 403 for an incomplete profile', async () => {
    await expect(authorize(request('STUDENT;student=7'), fixture().deps, { roles: ['STUDENT'] })).rejects.toMatchObject({ status: 404, code: 'VIEW_AS_STUDENT_NOT_FOUND' });
    await expect(authorize(request('STUDENT;student=42'), fixture({ profile: 'SETUP_REQUIRED' }).deps, { roles: ['STUDENT'] })).rejects.toMatchObject({ status: 403, code: 'VIEW_AS_PROFILE_INCOMPLETE' });
  });
  it('answers /api/me style calls (no roles option) with the viewed workspace', async () => {
    const me = await authorize(request('STUDENT;student=42'), fixture().deps);
    expect(me.appRole).toBe('STUDENT');
  });
});
