import { describe, expect, it, vi } from 'vitest';
import { parse } from 'libpg-query';
import { AuthError } from '../auth/errors';
import type { AdminDependencies } from './contracts';
import { handleAdminRequest } from './routes';
import { createAdminRepository } from './repository';
const date = '2026-10-28T10:00:00.000Z';
function fixture(roles: ('STUDENT' | 'SYSTEM_ADMIN' | 'COORDINATOR')[] = ['SYSTEM_ADMIN']) {
  const account = { accountId: 1, clerkUserId: 'user_fixture', roles, accessStatus: 'ACTIVE' as const, protectedOwner: false, createdAt: date, updatedAt: date };
  const event = { eventId: 'role:1', accountId: 1, actor: 'user_operator', target: 'user_fixture', kind: 'ROLE' as const, action: 'GRANT', role: 'STUDENT' as const, before: null, after: 'ROLE_DOMAIN', reason: 'Private account context', occurredAt: date };
  const page = { items: [event], total: 1, page: 1, pageSize: 20, generatedAt: date };
  const deps: AdminDependencies = {
    auth: { verify: vi.fn(async () => ({ clerkUserId: 'user_fixture', sessionId: 'session_test', primaryEmail: { address: 'fixture@gmail.com', verified: true } })),
      access: { find: vi.fn(async () => ({ ...account, appRole: roles[0]! })), initializeStudent: vi.fn() }, profiles: { stateFor: vi.fn(async () => 'SETUP_REQUIRED' as const) } },
    repository: { overview: vi.fn(async () => ({ generatedAt: date, accounts: { total: 1, active: 1, suspended: 0 }, roles: { STUDENT: 0, COORDINATOR: 0, SYSTEM_ADMIN: 1 }, configuration: { programmes: 1, curricula: 1, subjects: 4, semesters: 3 } })),
      accounts: vi.fn(async () => ({ ...page, items: [account] })), account: vi.fn(async () => ({ ...account, memberships: [] })), audit: vi.fn(async () => page),
      createAccount: vi.fn(), grantRole: vi.fn(), revokeRole: vi.fn(), setAccessStatus: vi.fn(), createInvitation: vi.fn(), attachClerkInvitation: vi.fn(),
      listInvitations: vi.fn(), revokeInvitation: vi.fn(), findPendingInvitationByEmail: vi.fn(), clerkInvitationIdOf: vi.fn(), expireInvitations: vi.fn(), acceptInvitation: vi.fn(), studentProgramme: vi.fn(), curriculumOptions: vi.fn(), changeStudentProgramme: vi.fn(), changeStudentIntakeYear: vi.fn(), createDummyAccount: vi.fn(), currentSemesterId: vi.fn(), existingClerkUserIds: vi.fn(async () => new Set<string>()) },
    identities: { search: vi.fn(async () => ({ ids: ['user_fixture'], total: 1 })), lookup: vi.fn(async () => new Map([['user_fixture', { state: 'available' as const, name: 'Fictional Account', email: 'fixture@graduate.utm.my', emailVerified: true }]])),
      findByEmail: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn(), setSignInBlocked: vi.fn(), createUser: vi.fn(), setPassword: vi.fn(), deleteUser: vi.fn(), userCount: vi.fn(), listStaffSignups: vi.fn(async () => ({ items: [], truncated: false })) },
  };
  return deps;
}
function request(path: string, method = 'GET') { return new Request('https://test.invalid' + path, { method, headers: { Authorization: 'Bearer test-only', 'X-App-Role': 'SYSTEM_ADMIN' } }); }
describe('read-only administration authorization and privacy', () => {
  it.each(['STUDENT', 'COORDINATOR'] as const)('rejects %s regardless of a spoofed header', async role => {
    const deps = fixture([role]);
    expect((await handleAdminRequest(request('/api/admin/users'), deps))?.status).toBe(403);
    expect(deps.repository.accounts).not.toHaveBeenCalled(); expect(deps.identities.lookup).not.toHaveBeenCalled();
  });
  it('rejects expired sessions before any data read', async () => {
    const deps = fixture(); deps.auth.verify = vi.fn(async () => { throw new AuthError(401, 'SESSION_INVALID', 'Session expired.'); });
    expect((await handleAdminRequest(request('/api/admin/overview'), deps))?.status).toBe(401); expect(deps.repository.overview).not.toHaveBeenCalled();
  });
  it('blocks suspended administrators', async () => {
    const deps = fixture(); deps.auth.access.find = vi.fn(async () => ({ clerkUserId: 'user_fixture', appRole: 'SYSTEM_ADMIN' as const, roles: ['SYSTEM_ADMIN' as const], accessStatus: 'SUSPENDED' as const }));
    expect((await handleAdminRequest(request('/api/admin/overview'), deps))?.status).toBe(403); expect(deps.repository.overview).not.toHaveBeenCalled();
  });
  it('allows multi-role admins with incomplete student setup and redacts overview identities', async () => {
    const response = await handleAdminRequest(request('/api/admin/overview'), fixture(['STUDENT', 'SYSTEM_ADMIN']));
    expect(response?.status).toBe(200); expect(response?.headers.get('cache-control')).toContain('no-store');
    const body = await response!.text(); expect(body).not.toContain('user_fixture'); expect(body).not.toContain('Private account context'); expect(body).toContain('recentEvents');
  });
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('rejects %s before data reads', async method => {
    const deps = fixture(); const response = await handleAdminRequest(request('/api/admin/overview', method), deps);
    expect(response?.status).toBe(405); expect(response?.headers.get('Allow')).toBe('GET'); expect(deps.repository.accounts).not.toHaveBeenCalled();
  });
  it.each(['/api/admin/users?status=bogus', '/api/admin/users?role=OWNER', '/api/admin/users?page=0', '/api/admin/users?q=a&q=b', '/api/admin/users?ownerId=1', '/api/admin/audit?from=2026-02-30', '/api/admin/audit?from=0000-01-01', '/api/admin/audit?from=2026-10-29&to=2026-10-28', '/api/admin/users/2147483648'])('validates query %s', async path => {
    expect((await handleAdminRequest(request(path), fixture()))?.status).toBe(400);
  });
  it('degrades provider enrichment errors explicitly, without discarding database access data', async () => {
    const deps = fixture(); deps.identities.lookup = vi.fn(async () => { throw new Error('provider secret details'); });
    const response = await handleAdminRequest(request('/api/admin/users'), deps); expect(response?.status).toBe(200);
    expect(await response!.text()).toContain('unavailable'); expect(deps.identities.lookup).toHaveBeenCalledWith(['user_fixture']);
  });
  it('marks a membership the account email cannot use (S3-P004-033)', async () => {
    const deps = fixture();
    const membership = (role: 'STUDENT' | 'SYSTEM_ADMIN') => ({ role, emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: false, reason: 'r', grantedAt: '2026-11-01T00:00:00.000Z' });
    const base = (await deps.repository.account(1))!; deps.repository.account = vi.fn(async () => ({ ...base, memberships: [membership('STUDENT'), membership('SYSTEM_ADMIN')] })) as never;
    const body = await (await handleAdminRequest(request('/api/admin/users/9'), deps))!.json() as { data: { memberships: { role: string; usable?: boolean }[] } };
    expect(body.data.memberships.map(m => [m.role, m.usable])).toEqual([['STUDENT', true], ['SYSTEM_ADMIN', false]]);
  });
  it('leaves usable unset when the identity provider is unavailable', async () => {
    const deps = fixture(); deps.identities.lookup = vi.fn(async () => { throw new Error('down'); });
    const base = (await deps.repository.account(1))!; deps.repository.account = vi.fn(async () => ({ ...base, memberships: [{ role: 'SYSTEM_ADMIN', emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: false, reason: 'r', grantedAt: '2026-11-01T00:00:00.000Z' }] })) as never;
    const body = await (await handleAdminRequest(request('/api/admin/users/9'), deps))!.json() as { data: { memberships: { usable?: boolean }[] } };
    expect(body.data.memberships[0]!.usable).toBeUndefined();
  });
  it('rejects overly broad identity searches instead of truncating silently', async () => {
    const deps = fixture(); deps.identities.search = vi.fn(async () => ({ ids: [], total: 101 }));
    expect((await handleAdminRequest(request('/api/admin/users?q=test'), deps))?.status).toBe(400); expect(deps.repository.accounts).not.toHaveBeenCalled();
  });
  it('searches direct Clerk IDs without an instance-wide identity search', async () => {
    const deps = fixture(); expect((await handleAdminRequest(request('/api/admin/users?q=user_fixture'), deps))?.status).toBe(200); expect(deps.identities.search).not.toHaveBeenCalled();
  });
  it('returns missing account and sanitized service errors', async () => {
    const deps = fixture(); deps.repository.account = vi.fn(async () => null);
    expect((await handleAdminRequest(request('/api/admin/users/9'), deps))?.status).toBe(404);
    deps.repository.overview = vi.fn(async () => { throw new Error('postgres connection failed; details redacted'); });
    const response = await handleAdminRequest(request('/api/admin/overview'), deps); expect(response?.status).toBe(503); expect(await response!.text()).not.toContain('postgres');
  });
});
it('parses read-only SQL, binds hostile search strings and distinguishes role/account counts', async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const repository = createAdminRepository(async (sql, values) => {
    await parse(sql); queries.push({ sql, values });
    if (sql.includes('AS programmes')) return [{ programmes: 1, curricula: 1, subjects: 4, semesters: 3 }];
    if (sql.includes('GROUP BY app_role')) return [{ app_role: 'STUDENT', total: 2 }, { app_role: 'SYSTEM_ADMIN', total: 1 }];
    if (sql.includes('AS active')) return [{ total: 2, active: 2, suspended: 0 }];
    if (sql.includes('count(*) AS total')) return [{ total: 0 }];
    if (sql.includes('FROM public.user_access_assignment a LEFT JOIN')) return [{ accountId: 9, clerkUserId: 'user_fixture', accessStatus: 'ACTIVE', roles: ['STUDENT'], protectedOwner: false, createdAt: new Date(date), updatedAt: date }];
    if (sql.includes('grant_reason AS reason')) return [{ role: 'STUDENT', emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: false, reason: 'Fictional assignment.', grantedAt: new Date(date) }];
    return [];
  });
  const result = await repository.overview(); expect(result.accounts.total).toBe(2); expect(result.roles.STUDENT + result.roles.SYSTEM_ADMIN).toBe(3);
  const hostile = "%' OR 1=1 --";
  await repository.accounts({ q: hostile, page: 2, role: '', status: '' }, ['user_fixture']);
  const detail = await repository.account(9); expect(detail?.memberships[0]?.grantedAt).toBe(date); expect(detail?.createdAt).toBe(date);
  await repository.audit({ page: 1, kind: 'ALL', from: '2026-01-01', to: '2026-10-28' });
  expect(queries.every(item => !/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/.test(item.sql))).toBe(true);
  expect(queries.every(item => !item.sql.includes(hostile))).toBe(true);
  expect(queries.some(item => JSON.stringify(item.values).includes('user_fixture'))).toBe(true);
  expect(queries.every(item => !/student_profile|academic_record|semester_offering/.test(item.sql))).toBe(true);
});

describe('waiting staff sign-ups (S3-P004-036)', () => {
  const waiting = (id: string, role: 'COORDINATOR' | 'SYSTEM_ADMIN') => ({ clerkUserId: id, name: 'Fictional ' + id, email: id + (role === 'COORDINATOR' ? '@utm.my' : '@gmail.com'), role, signedUpAt: date });
  it('lists staff-domain sign-ins that have no application account yet', async () => {
    const deps = fixture();
    deps.identities.listStaffSignups = vi.fn(async () => ({ items: [waiting('user_new', 'COORDINATOR'), waiting('user_has', 'COORDINATOR'), waiting('user_admin', 'SYSTEM_ADMIN')], truncated: false }));
    deps.repository.existingClerkUserIds = vi.fn(async () => new Set(['user_has']));
    const response = await handleAdminRequest(request('/api/admin/waiting-users'), deps);
    expect(response?.status).toBe(200); expect(response?.headers.get('cache-control')).toContain('no-store');
    const body = await response!.json() as { data: { items: { clerkUserId: string }[]; truncated: boolean } };
    expect(body.data.items.map(item => item.clerkUserId)).toEqual(['user_new', 'user_admin']); expect(body.data.truncated).toBe(false);
    expect(deps.repository.existingClerkUserIds).toHaveBeenCalledExactlyOnceWith(['user_new', 'user_has', 'user_admin']);
  });
  it.each(['STUDENT', 'COORDINATOR'] as const)('refuses %s', async role => {
    const deps = fixture([role]);
    expect((await handleAdminRequest(request('/api/admin/waiting-users'), deps))?.status).toBe(403);
    expect(deps.identities.listStaffSignups).not.toHaveBeenCalled();
  });
  it('allows only GET and no query parameters', async () => {
    expect((await handleAdminRequest(request('/api/admin/waiting-users', 'POST'), fixture()))?.status).toBe(405);
    expect((await handleAdminRequest(request('/api/admin/waiting-users?page=2'), fixture()))?.status).toBe(400);
  });
  it('reports the sign-in service as unavailable without leaking provider errors', async () => {
    const deps = fixture(); deps.identities.listStaffSignups = vi.fn(async () => { throw new Error('clerk secret detail'); });
    const response = await handleAdminRequest(request('/api/admin/waiting-users'), deps);
    expect(response?.status).toBe(503); const body = await response!.text();
    expect(body).toContain('WAITING_USERS_UNAVAILABLE'); expect(body).not.toContain('clerk secret');
  });
});
it('checks existing accounts with one bound read-only query and none for an empty list (S3-P004-036)', async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const repository = createAdminRepository(async (sql, values) => { await parse(sql); queries.push({ sql, values }); return [{ clerk_user_id: 'user_has' }]; });
  expect(await repository.existingClerkUserIds([])).toEqual(new Set()); expect(queries).toHaveLength(0);
  expect(await repository.existingClerkUserIds(['user_has', 'user_new'])).toEqual(new Set(['user_has']));
  expect(queries).toHaveLength(1); expect(queries[0]!.values).toEqual([['user_has', 'user_new']]);
  expect(/(INSERT|UPDATE|DELETE)/.test(queries[0]!.sql)).toBe(false);
});
