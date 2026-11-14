import { describe, expect, it, vi } from 'vitest';
import type { AdminDependencies } from './contracts';
import { AdminMutationError } from './errors';
import { AuthError } from '../auth/errors';
import { handleAdminRequest } from './routes';

const date = '2026-11-01T10:00:00.000Z';
const ADMIN = 'user_admin';
const account = { accountId: 5, clerkUserId: 'user_target', roles: ['COORDINATOR' as const], accessStatus: 'ACTIVE' as const, protectedOwner: false, createdAt: date, updatedAt: date, memberships: [] };
const invitation = { id: '2f1c0f0e-0000-4000-8000-000000000001', email: 'new@utm.my', roles: ['COORDINATOR' as const], status: 'PENDING' as const, invitedBy: ADMIN, reason: 'Join', createdAt: date, expiresAt: '2026-11-08T10:00:00.000Z', acceptedAt: null };

const programme = { studentId: 9, studentName: 'Student', matricNo: 'A22EC0001', curriculumId: 1, curriculumVersion: 'V1', programmeId: 7, programmeCode: 'OLD', programmeName: 'Old programme' };
function fixture(roles: ('STUDENT' | 'SYSTEM_ADMIN' | 'COORDINATOR')[] = ['SYSTEM_ADMIN']) {
  const deps: AdminDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: ADMIN, sessionId: 'session_test', primaryEmail: { address: 'admin@utm.my', verified: true } })),
      access: { find: vi.fn(async (id: string) => id === ADMIN ? { clerkUserId: ADMIN, appRole: roles[0]!, roles, accessStatus: 'ACTIVE' as const } : null), initializeStudent: vi.fn() },
    },
    repository: {
      overview: vi.fn(), accounts: vi.fn(), audit: vi.fn(), account: vi.fn(async () => account),
      createAccount: vi.fn(async () => account), grantRole: vi.fn(async () => account), revokeRole: vi.fn(async () => account), setAccessStatus: vi.fn(async () => account),
      createInvitation: vi.fn(async () => invitation), attachClerkInvitation: vi.fn(async () => ({ ...invitation })), listInvitations: vi.fn(async () => ({ items: [invitation], total: 1, page: 1, pageSize: 20, generatedAt: date })),
      revokeInvitation: vi.fn(async () => ({ ...invitation, status: 'REVOKED' as const })), findPendingInvitationByEmail: vi.fn(), clerkInvitationIdOf: vi.fn(async () => 'inv_clerk'),
      expireInvitations: vi.fn(), acceptInvitation: vi.fn(),
      studentProgramme: vi.fn(async () => programme), curriculumOptions: vi.fn(async () => [{ curriculumId: 2, curriculumVersion: 'V2', programmeId: 8, programmeCode: 'PGM', programmeName: 'Programme' }]),
      changeStudentProgramme: vi.fn(async () => ({ programme: { ...programme, curriculumId: 2 }, removedPicks: 3 })),
    },
    identities: {
      search: vi.fn(), lookup: vi.fn(async () => new Map([['user_target', { state: 'available' as const, name: 'Target', email: 'target@utm.my', emailVerified: true }]])),
      findByEmail: vi.fn(async () => ({ clerkUserId: 'user_target', verifiedEmail: 'target@utm.my', emailVerified: true })),
      createInvitation: vi.fn(async () => ({ clerkInvitationId: 'inv_clerk' })), revokeInvitation: vi.fn(async () => undefined),
    },
  };
  return deps;
}
function call(path: string, method: string, body?: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  return new Request('https://test.invalid' + path, { method, headers: { Authorization: 'Bearer test-only', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}
const send = (deps: AdminDependencies, path: string, method: string, body?: unknown, headers?: Record<string, string>) => handleAdminRequest(call(path, method, body, headers), deps) as Promise<Response>;
const reason = 'Because of policy';
type Repo = AdminDependencies['repository'];
const mocked = (deps: AdminDependencies, name: keyof Repo) => deps.repository[name] as unknown as ReturnType<typeof vi.fn>;

const routes: { name: string; path: string; method: string; body: unknown; status: number; repo: keyof Repo }[] = [
  { name: 'create account', path: '/api/admin/users', method: 'POST', body: { email: 'target@utm.my', roles: ['COORDINATOR'], reason }, status: 201, repo: 'createAccount' },
  { name: 'grant role', path: '/api/admin/users/5/roles', method: 'POST', body: { role: 'COORDINATOR', reason }, status: 200, repo: 'grantRole' },
  { name: 'revoke role', path: '/api/admin/users/5/roles/COORDINATOR', method: 'DELETE', body: { reason }, status: 200, repo: 'revokeRole' },
  { name: 'change access', path: '/api/admin/users/5/access', method: 'PATCH', body: { status: 'SUSPENDED', reason }, status: 200, repo: 'setAccessStatus' },
  { name: 'change student programme', path: '/api/admin/users/5/programme', method: 'PATCH', body: { curriculumId: 2, reason }, status: 200, repo: 'changeStudentProgramme' },
  { name: 'create invitation', path: '/api/admin/invitations', method: 'POST', body: { email: 'new@utm.my', roles: ['COORDINATOR'], reason }, status: 201, repo: 'createInvitation' },
  { name: 'revoke invitation', path: '/api/admin/invitations/2f1c0f0e-0000-4000-8000-000000000001', method: 'DELETE', body: { reason }, status: 200, repo: 'revokeInvitation' },
];

describe.each(routes)('$name ($method $path)', route => {
  it('succeeds with no-store, rejects a smuggled actor, and uses the authorized admin as the actor', async () => {
    const deps = fixture();
    deps.identities.findByEmail = vi.fn(async () => route.repo === 'createInvitation' ? null : { clerkUserId: 'user_target', verifiedEmail: 'target@utm.my', emailVerified: true });
    const smuggled = await send(deps, route.path, route.method, { ...(route.body as object), actor: 'user_evil' });
    expect(smuggled.status).toBe(400);
    expect(deps.repository[route.repo]).not.toHaveBeenCalled();
    const ok = await send(deps, route.path, route.method, route.body);
    expect(ok.status).toBe(route.status);
    expect(ok.headers.get('cache-control')).toContain('no-store');
    expect(mocked(deps, route.repo).mock.calls[0]).toContain(ADMIN);
  });
  it.each(['STUDENT', 'COORDINATOR'] as const)('returns 403 for %s before any work', async role => {
    const deps = fixture([role]);
    expect((await send(deps, route.path, route.method, route.body)).status).toBe(403);
    expect(deps.repository[route.repo]).not.toHaveBeenCalled();
  });
  it('returns 401 for an invalid session', async () => {
    const deps = fixture();
    deps.auth.verify = vi.fn(async () => { throw new AuthError(401, 'SESSION_INVALID', 'Session expired.'); });
    expect((await send(deps, route.path, route.method, route.body)).status).toBe(401);
    expect(deps.repository[route.repo]).not.toHaveBeenCalled();
  });
  it('rejects a non-JSON content type with 415, bad JSON, oversize and invalid bodies with 400', async () => {
    const deps = fixture();
    expect((await send(deps, route.path, route.method, 'x=1', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await send(deps, route.path, route.method, route.body, {})).status).toBe(415);
    expect((await send(deps, route.path, route.method, '{not json')).status).toBe(400);
    expect((await send(deps, route.path, route.method, JSON.stringify({ reason: 'x'.repeat(17_000) }))).status).toBe(400);
    expect((await send(deps, route.path, route.method, '[]')).status).toBe(400);
    expect((await send(deps, route.path, route.method, {})).status).toBe(400);
    expect((await send(deps, route.path + '?x=1', route.method, route.body)).status).toBe(400);
    expect(deps.repository[route.repo]).not.toHaveBeenCalled();
  });
  it('maps repository rule errors to their status and stable code without leaking text', async () => {
    for (const code of ['SELF_LOCKOUT', 'LAST_ACTIVE_ADMIN', 'PROTECTED_OWNER', 'LAST_ROLE', 'ROLE_ALREADY_ASSIGNED', 'NOT_FOUND', 'INVITATION_NOT_PENDING'] as const) {
      const deps = fixture();
      deps.identities.findByEmail = vi.fn(async () => route.repo === 'createInvitation' ? null : { clerkUserId: 'user_target', verifiedEmail: 'target@utm.my', emailVerified: true });
      mocked(deps, route.repo).mockRejectedValue(new AdminMutationError(code));
      const response = await send(deps, route.path, route.method, route.body);
      const expected = new AdminMutationError(code);
      expect(response.status).toBe(expected.status);
      expect(await response.json()).toEqual({ error: { code, message: expected.message } });
    }
  });
  it('hides unexpected failures behind a generic 503', async () => {
    const deps = fixture();
    deps.identities.findByEmail = vi.fn(async () => route.repo === 'createInvitation' ? null : { clerkUserId: 'user_target', verifiedEmail: 'target@utm.my', emailVerified: true });
    mocked(deps, route.repo).mockRejectedValue(new Error('relation "user_access_assignment" does not exist; postgres://secret'));
    const response = await send(deps, route.path, route.method, route.body);
    const text = await response.text();
    expect(response.status).toBe(503); expect(text).not.toContain('postgres'); expect(text).not.toContain('relation');
  });
});

describe('method handling', () => {
  it.each([
    ['/api/admin/users', 'DELETE', 'GET, POST'], ['/api/admin/users', 'PATCH', 'GET, POST'],
    ['/api/admin/users/5', 'POST', 'GET'], ['/api/admin/users/5/roles', 'GET', 'POST'], ['/api/admin/users/5/roles', 'DELETE', 'POST'],
    ['/api/admin/users/5/roles/COORDINATOR', 'POST', 'DELETE'], ['/api/admin/users/5/access', 'POST', 'PATCH'], ['/api/admin/users/5/access', 'GET', 'PATCH'],
    ['/api/admin/invitations', 'PATCH', 'GET, POST'], ['/api/admin/invitations/2f1c0f0e-0000-4000-8000-000000000001', 'GET', 'DELETE'],
    ['/api/admin/overview', 'POST', 'GET'], ['/api/admin/audit', 'DELETE', 'GET'],
  ])('%s %s returns 405 with Allow: %s', async (path, method, allow) => {
    const deps = fixture();
    const response = await send(deps, path, method, method === 'GET' ? undefined : {});
    expect(response.status).toBe(405); expect(response.headers.get('Allow')).toBe(allow);
  });
  it('still returns 404 for unknown administration paths', async () => {
    expect((await send(fixture(), '/api/admin/nothing', 'POST', {})).status).toBe(404);
  });
});

describe('POST /api/admin/users rules (D5)', () => {
  const body = { email: 'target@utm.my', roles: ['COORDINATOR'], reason };
  it('returns 404 CLERK_USER_NOT_FOUND when no Clerk user matches', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => null);
    const response = await send(deps, '/api/admin/users', 'POST', body);
    expect(response.status).toBe(404); expect((await response.json()).error.code).toBe('CLERK_USER_NOT_FOUND');
    expect(deps.repository.createAccount).not.toHaveBeenCalled();
  });
  it('requires a verified email and eligibility for every requested role', async () => {
    const unverified = fixture(); unverified.identities.findByEmail = vi.fn(async () => ({ clerkUserId: 'user_target', verifiedEmail: 'target@utm.my', emailVerified: false }));
    const first = await send(unverified, '/api/admin/users', 'POST', body);
    expect(first.status).toBe(422); expect((await first.json()).error.code).toBe('ROLE_NOT_ELIGIBLE');
    for (const [address, roles] of [['target@gmail.com', ['COORDINATOR']], ['target@graduate.utm.my', ['COORDINATOR']], ['target@utm.my', ['STUDENT']], ['target@gmail.com', ['STUDENT']], ['target@example.com', ['SYSTEM_ADMIN']], ['target@sub.gmail.com', ['SYSTEM_ADMIN']]] as const) {
      const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => ({ clerkUserId: 'user_target', verifiedEmail: address, emailVerified: true }));
      const response = await send(deps, '/api/admin/users', 'POST', { email: address, roles, reason });
      expect(response.status).toBe(422);
      expect(deps.repository.createAccount).not.toHaveBeenCalled();
    }
  });
  it('creates the account for the Clerk user id found by email, enriched with identity', async () => {
    const deps = fixture();
    const response = await send(deps, '/api/admin/users', 'POST', { email: ' Target@UTM.my ', roles: ['COORDINATOR'], reason: '  ' + reason + '  ' });
    expect(response.status).toBe(201);
    expect(deps.identities.findByEmail).toHaveBeenCalledWith('target@utm.my');
    expect(deps.repository.createAccount).toHaveBeenCalledWith('user_target', ['COORDINATOR'], ADMIN, reason);
    const json = await response.json(); expect(json.data.identity).toMatchObject({ state: 'available', email: 'target@utm.my' });
  });
  it('maps ACCOUNT_EXISTS from the repository to 409', async () => {
    const deps = fixture(); deps.repository.createAccount = vi.fn(async () => { throw new AdminMutationError('ACCOUNT_EXISTS'); });
    expect((await send(deps, '/api/admin/users', 'POST', body)).status).toBe(409);
  });
});

describe('role grants and revokes', () => {
  it('re-checks eligibility against the target current verified email on grant (suspended targets are allowed)', async () => {
    const deps = fixture(); deps.repository.account = vi.fn(async () => ({ ...account, accessStatus: 'SUSPENDED' as const }));
    expect((await send(deps, '/api/admin/users/5/roles', 'POST', { role: 'COORDINATOR', reason })).status).toBe(200);
    deps.identities.lookup = vi.fn(async () => new Map([['user_target', { state: 'available' as const, name: null, email: 'target@gmail.com', emailVerified: true }]]));
    const denied = await send(deps, '/api/admin/users/5/roles', 'POST', { role: 'COORDINATOR', reason });
    expect(denied.status).toBe(422); expect((await denied.json()).error.code).toBe('ROLE_NOT_ELIGIBLE');
    expect(deps.repository.grantRole).toHaveBeenCalledTimes(1);
  });
  it('returns 404 for a missing target and 503 (no grant) when the identity provider is unavailable', async () => {
    const deps = fixture(); deps.repository.account = vi.fn(async () => null);
    expect((await send(deps, '/api/admin/users/5/roles', 'POST', { role: 'COORDINATOR', reason })).status).toBe(404);
    const down = fixture(); down.identities.lookup = vi.fn(async () => { throw new Error('clerk token sk_live_secret'); });
    const response = await send(down, '/api/admin/users/5/roles', 'POST', { role: 'COORDINATOR', reason });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('sk_live');
    expect(down.repository.grantRole).not.toHaveBeenCalled();
  });
  it('validates account id and role before touching data', async () => {
    const deps = fixture();
    expect((await send(deps, '/api/admin/users/5/roles/OWNER', 'DELETE', { reason })).status).toBe(400);
    expect((await send(deps, '/api/admin/users/0/roles', 'POST', { role: 'COORDINATOR', reason })).status).toBe(404);
    expect((await send(deps, '/api/admin/users/5/access', 'PATCH', { status: 'DELETED', reason })).status).toBe(400);
    expect((await send(deps, '/api/admin/users/5/roles', 'POST', { role: 'COORDINATOR', reason: '   ' })).status).toBe(400);
    expect(deps.repository.revokeRole).not.toHaveBeenCalled(); expect(deps.repository.setAccessStatus).not.toHaveBeenCalled();
  });
  it('passes the actor and trimmed reason to revoke and access changes', async () => {
    const deps = fixture();
    await send(deps, '/api/admin/users/5/roles/COORDINATOR', 'DELETE', { reason: ' Left ' });
    expect(deps.repository.revokeRole).toHaveBeenCalledWith(5, 'COORDINATOR', ADMIN, 'Left');
    await send(deps, '/api/admin/users/5/access', 'PATCH', { status: 'ACTIVE', reason: 'Resolved' });
    expect(deps.repository.setAccessStatus).toHaveBeenCalledWith(5, 'ACTIVE', ADMIN, 'Resolved');
  });
  it('surfaces LAST_ROLE as 409 telling admins to suspend', async () => {
    const deps = fixture(); deps.repository.revokeRole = vi.fn(async () => { throw new AdminMutationError('LAST_ROLE'); });
    const response = await send(deps, '/api/admin/users/5/roles/COORDINATOR', 'DELETE', { reason });
    expect(response.status).toBe(409); const json = await response.json();
    expect(json.error.code).toBe('LAST_ROLE'); expect(json.error.message.toLowerCase()).toContain('suspend');
  });
});

describe('invitations', () => {
  const body = { email: 'New@UTM.my', roles: ['COORDINATOR'], reason };
  it('creates the DB row, then the Clerk invitation (7 days), then attaches the reference; returns 201', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => null);
    const order: string[] = [];
    deps.repository.createInvitation = vi.fn(async () => { order.push('db'); return invitation; });
    deps.identities.createInvitation = vi.fn(async () => { order.push('clerk'); return { clerkInvitationId: 'inv_clerk' }; });
    deps.repository.attachClerkInvitation = vi.fn(async () => { order.push('attach'); return invitation; });
    const before = Date.now();
    const response = await send(deps, '/api/admin/invitations', 'POST', body);
    expect(response.status).toBe(201); expect(order).toEqual(['db', 'clerk', 'attach']);
    const [email, roles, actor, why, expiresAt] = vi.mocked(deps.repository.createInvitation).mock.calls[0]!;
    expect([email, roles, actor, why]).toEqual(['new@utm.my', ['COORDINATOR'], ADMIN, reason]);
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(7 * 86_400_000 + 5000);
    expect(deps.identities.createInvitation).toHaveBeenCalledWith('new@utm.my', undefined, 7);
    expect(deps.repository.attachClerkInvitation).toHaveBeenCalledWith(invitation.id, 'inv_clerk', ADMIN);
  });
  it('rejects roles the invited email domain cannot hold before creating anything', async () => {
    for (const [email, roles] of [['x@gmail.com', ['COORDINATOR']], ['x@gmail.com', ['STUDENT']], ['x@example.com', ['SYSTEM_ADMIN']], ['x@evil-gmail.com', ['SYSTEM_ADMIN']], ['x@utm.my', ['STUDENT']]] as const) {
      const deps = fixture(); const response = await send(deps, '/api/admin/invitations', 'POST', { email, roles, reason });
      expect(response.status).toBe(422); expect((await response.json()).error.code).toBe('ROLE_NOT_ELIGIBLE');
      expect(deps.repository.createInvitation).not.toHaveBeenCalled();
    }
  });
  it('returns ACCOUNT_EXISTS when the email belongs to a Clerk user who already has an application account', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => ({ clerkUserId: ADMIN, verifiedEmail: 'new@utm.my', emailVerified: true }));
    const response = await send(deps, '/api/admin/invitations', 'POST', body);
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe('ACCOUNT_EXISTS');
    expect(deps.repository.createInvitation).not.toHaveBeenCalled(); expect(deps.identities.createInvitation).not.toHaveBeenCalled();
  });
  it('returns CLERK_USER_EXISTS when the email belongs to a Clerk user without an application account', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => ({ clerkUserId: 'user_clerk_only', verifiedEmail: 'new@utm.my', emailVerified: true }));
    const response = await send(deps, '/api/admin/invitations', 'POST', body);
    const json = await response.json();
    expect(response.status).toBe(409); expect(json.error.code).toBe('CLERK_USER_EXISTS');
    expect(json.error.message).toBe('This person already has a sign-in account. Use Add account instead.');
    expect(deps.repository.createInvitation).not.toHaveBeenCalled(); expect(deps.identities.createInvitation).not.toHaveBeenCalled();
  });
  it('maps a duplicate pending invitation to 409 INVITATION_EXISTS', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => null);
    deps.repository.createInvitation = vi.fn(async () => { throw new AdminMutationError('INVITATION_EXISTS'); });
    const response = await send(deps, '/api/admin/invitations', 'POST', body);
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe('INVITATION_EXISTS');
    expect(deps.identities.createInvitation).not.toHaveBeenCalled();
  });
  it('revokes the DB row and returns 503 INVITATION_DELIVERY_FAILED when Clerk fails, without leaking the provider error', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => null);
    deps.identities.createInvitation = vi.fn(async () => { throw new Error('clerk sk_live_secret rejected'); });
    const response = await send(deps, '/api/admin/invitations', 'POST', body);
    const text = await response.text();
    expect(response.status).toBe(503); expect(text).toContain('INVITATION_DELIVERY_FAILED'); expect(text).not.toContain('sk_live');
    expect(deps.repository.revokeInvitation).toHaveBeenCalledWith(invitation.id, ADMIN, expect.any(String));
    expect(deps.repository.attachClerkInvitation).not.toHaveBeenCalled();
  });
  it('still reports delivery failure when the compensating DB revoke also fails', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => null);
    deps.identities.createInvitation = vi.fn(async () => { throw new Error('down'); });
    deps.repository.revokeInvitation = vi.fn(async () => { throw new Error('db down'); });
    expect((await send(deps, '/api/admin/invitations', 'POST', body)).status).toBe(503);
  });
  it('best-effort revokes Clerk and DB rows when attaching fails, then returns the mapped error', async () => {
    const deps = fixture(); deps.identities.findByEmail = vi.fn(async () => null);
    deps.repository.attachClerkInvitation = vi.fn(async () => { throw new AdminMutationError('INVITATION_NOT_PENDING'); });
    deps.identities.revokeInvitation = vi.fn(async () => { throw new Error('clerk down'); });
    const response = await send(deps, '/api/admin/invitations', 'POST', body);
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe('INVITATION_NOT_PENDING');
    expect(deps.identities.revokeInvitation).toHaveBeenCalledWith('inv_clerk');
    expect(deps.repository.revokeInvitation).toHaveBeenCalledWith(invitation.id, ADMIN, expect.any(String));
  });
  it('revokes an invitation in the database and, best effort, in Clerk', async () => {
    const deps = fixture(); deps.identities.revokeInvitation = vi.fn(async () => { throw new Error('clerk down'); });
    const response = await send(deps, `/api/admin/invitations/${invitation.id}`, 'DELETE', { reason });
    expect(response.status).toBe(200); expect((await response.json()).data.status).toBe('REVOKED');
    expect(deps.repository.revokeInvitation).toHaveBeenCalledWith(invitation.id, ADMIN, reason);
    expect(deps.identities.revokeInvitation).toHaveBeenCalledWith('inv_clerk');
  });
  it('does not call Clerk for an invitation without a Clerk reference or when the DB revoke fails', async () => {
    const none = fixture(); none.repository.clerkInvitationIdOf = vi.fn(async () => null);
    await send(none, `/api/admin/invitations/${invitation.id}`, 'DELETE', { reason }); expect(none.identities.revokeInvitation).not.toHaveBeenCalled();
    const failed = fixture(); failed.repository.revokeInvitation = vi.fn(async () => { throw new AdminMutationError('INVITATION_NOT_PENDING'); });
    expect((await send(failed, `/api/admin/invitations/${invitation.id}`, 'DELETE', { reason })).status).toBe(409);
    expect(failed.identities.revokeInvitation).not.toHaveBeenCalled();
  });
  it('validates the invitation id as a UUID', async () => {
    const deps = fixture(); expect((await send(deps, '/api/admin/invitations/not-a-uuid', 'DELETE', { reason })).status).toBe(400);
    expect(deps.repository.revokeInvitation).not.toHaveBeenCalled();
  });
  it('lists invitations with strict query validation', async () => {
    const deps = fixture();
    const ok = await send(deps, '/api/admin/invitations?page=2&status=PENDING', 'GET');
    expect(ok.status).toBe(200); expect(deps.repository.listInvitations).toHaveBeenCalledWith({ page: 2, status: 'PENDING' });
    for (const path of ['?status=bogus', '?page=0', '?foo=1', '?page=1&page=2', '?status=PENDING&status=REVOKED']) {
      expect((await send(deps, '/api/admin/invitations' + path, 'GET')).status).toBe(400);
    }
    expect(deps.repository.listInvitations).toHaveBeenCalledTimes(1);
  });
});

describe('student programme (S2-P004-026)', () => {
  it('changes the programme as the authorized admin and returns the new programme with the removed pick count', async () => {
    const deps = fixture();
    const response = await send(deps, '/api/admin/users/5/programme', 'PATCH', { curriculumId: 2, reason });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { programme: { ...programme, curriculumId: 2 }, removedPicks: 3 } });
    expect(mocked(deps, 'changeStudentProgramme')).toHaveBeenCalledWith(5, 2, ADMIN, reason);
  });
  it.each([
    [{ curriculumId: 2 }], [{ curriculumId: 2, reason: '   ' }], [{ curriculumId: 2, reason: 'x'.repeat(501) }], [{ reason }],
    [{ curriculumId: '2', reason }], [{ curriculumId: 0, reason }], [{ curriculumId: 1.5, reason }], [{ curriculumId: 2147483648, reason }],
  ])('rejects the invalid body %j without changing anything', async body => {
    const deps = fixture();
    expect((await send(deps, '/api/admin/users/5/programme', 'PATCH', body)).status).toBe(400);
    expect(mocked(deps, 'changeStudentProgramme')).not.toHaveBeenCalled();
  });
  it('rejects POST, PUT and DELETE with 405 and an Allow header', async () => {
    const deps = fixture();
    for (const method of ['POST', 'DELETE', 'PUT']) {
      const response = await send(deps, '/api/admin/users/5/programme', method, { curriculumId: 2, reason });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, PATCH');
    }
  });
  it('maps programme change rule errors to their status and stable code', async () => {
    const expected = { STUDENT_PROFILE_NOT_FOUND: 404, CURRICULUM_UNAVAILABLE: 409, PROGRAMME_UNCHANGED: 409 } as const;
    for (const [code, status] of Object.entries(expected) as [keyof typeof expected, number][]) {
      const deps = fixture();
      mocked(deps, 'changeStudentProgramme').mockRejectedValue(new AdminMutationError(code));
      const response = await send(deps, '/api/admin/users/5/programme', 'PATCH', { curriculumId: 2, reason });
      expect(response.status).toBe(status);
      expect((await response.json() as { error: { code: string } }).error.code).toBe(code);
    }
  });
  it('GET returns the programme (or null) for an existing account and 404 for an unknown one', async () => {
    const deps = fixture();
    const ok = await send(deps, '/api/admin/users/5/programme', 'GET');
    expect(ok.status).toBe(200); expect(ok.headers.get('cache-control')).toContain('no-store');
    expect(await ok.json()).toEqual({ data: programme });
    mocked(deps, 'studentProgramme').mockResolvedValue(null);
    expect(await (await send(deps, '/api/admin/users/5/programme', 'GET')).json()).toEqual({ data: null });
    mocked(deps, 'account').mockResolvedValue(null);
    expect((await send(deps, '/api/admin/users/5/programme', 'GET')).status).toBe(404);
  });
  it('lists curriculum options for administrators only', async () => {
    const deps = fixture();
    const ok = await send(deps, '/api/admin/curriculum-options', 'GET');
    expect(ok.status).toBe(200);
    expect((await ok.json() as { data: unknown[] }).data).toHaveLength(1);
    expect((await send(deps, '/api/admin/curriculum-options', 'POST', {})).status).toBe(405);
    for (const role of ['STUDENT', 'COORDINATOR'] as const) {
      const denied = fixture([role]);
      expect((await send(denied, '/api/admin/curriculum-options', 'GET')).status).toBe(403);
      expect((await send(denied, '/api/admin/users/5/programme', 'GET')).status).toBe(403);
      expect(denied.repository.curriculumOptions).not.toHaveBeenCalled();
    }
  });
});
