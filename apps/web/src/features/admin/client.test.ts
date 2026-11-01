import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAdminClient } from './client';
import { keepAccountSession } from '../auth/account-cache';
beforeEach(() => keepAccountSession({ userId: 'user_admin_fixture', sessionId: 'session_fixture' }));
afterEach(() => { keepAccountSession(null); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('uses a live bearer token with no-store and no credentials for admin reads', async () => {
  const fetcher = vi.fn(async () => Response.json({ data: { items: [], total: 0, page: 1, pageSize: 20, generatedAt: '2026-10-28T00:00:00Z' } })); vi.stubGlobal('fetch', fetcher);
  await createAdminClient(async () => 'TEST_ONLY').users({ page: 1, q: '', role: '', status: '' });
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/admin/users?'), expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer TEST_ONLY' } }));
});
it('does not publish an admin response after the signed-in account changes', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const pending = createAdminClient(async () => 'TEST_ONLY').audit({ page: 1, kind: 'ALL' }).then(() => null, error => error);
  await vi.waitFor(() => expect(finish).toBeDefined());
  keepAccountSession({ userId: 'user_student_fixture', sessionId: 'another_session' });
  finish(Response.json({ data: { items: [], total: 0, page: 1, pageSize: 20, generatedAt: '2026-10-28T00:00:00Z' } }));
  expect(await pending).toMatchObject({ code: 'SESSION_CHANGED' });
});
it('bounds a stalled token and prevents a late token from sending an admin request', async () => {
  vi.useFakeTimers(); let token!: (value: string) => void; const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const pending = createAdminClient(() => new Promise<string>(resolve => { token = resolve; })).overview().then(() => null, error => error);
  await vi.advanceTimersByTimeAsync(15000); expect(await pending).toMatchObject({ code: 'ADMIN_TIMEOUT' });
  token('LATE_TEST_ONLY'); await Promise.resolve(); expect(fetcher).not.toHaveBeenCalled();
});
it.each([401, 403])('preserves an unreadable %s denial as a denied admin read', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status })));
  await expect(createAdminClient(async () => 'TEST_ONLY').overview()).rejects.toMatchObject({ status });
});
it('rejects malformed success data rather than rendering it as account data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { items: [{ roles: ['OWNER'] }], total: 1, page: 1, pageSize: 20, generatedAt: '' } })));
  await expect(createAdminClient(async () => 'TEST_ONLY').users({ page: 1, q: '', role: '', status: '' })).rejects.toThrow('Invalid administration response');
});
const accountDetail = { accountId: 5, clerkUserId: 'user_target', roles: ['COORDINATOR'], accessStatus: 'ACTIVE', protectedOwner: false, createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', identity: { state: 'available', name: 'T', email: 't@utm.my', emailVerified: true }, memberships: [{ role: 'COORDINATOR', emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: false, reason: 'r', grantedAt: '2026-10-28T00:00:00Z' }] };
const invitationRow = { id: '6f1c9d2e-0000-4000-8000-000000000001', email: 'new@utm.my', roles: ['COORDINATOR'], status: 'PENDING', invitedBy: 'user_admin', reason: 'r', createdAt: '2026-10-28T00:00:00Z', expiresAt: '2026-11-04T00:00:00Z', acceptedAt: null };
it.each([
  ['createAccount', (c: ReturnType<typeof createAdminClient>) => c.createAccount({ email: 't@utm.my', roles: ['COORDINATOR'], reason: 'Why' }), 'POST', '/api/admin/users', accountDetail],
  ['grantRole', (c: ReturnType<typeof createAdminClient>) => c.grantRole(5, { role: 'STUDENT', reason: 'Why' }), 'POST', '/api/admin/users/5/roles', accountDetail],
  ['revokeRole', (c: ReturnType<typeof createAdminClient>) => c.revokeRole(5, 'COORDINATOR', { reason: 'Why' }), 'DELETE', '/api/admin/users/5/roles/COORDINATOR', accountDetail],
  ['setAccess', (c: ReturnType<typeof createAdminClient>) => c.setAccess(5, { status: 'SUSPENDED', reason: 'Why' }), 'PATCH', '/api/admin/users/5/access', accountDetail],
  ['createInvitation', (c: ReturnType<typeof createAdminClient>) => c.createInvitation({ email: 'new@utm.my', roles: ['COORDINATOR'], reason: 'Why' }), 'POST', '/api/admin/invitations', invitationRow],
  ['revokeInvitation', (c: ReturnType<typeof createAdminClient>) => c.revokeInvitation(invitationRow.id, { reason: 'Why' }), 'DELETE', '/api/admin/invitations/' + invitationRow.id, invitationRow],
])('%s sends a JSON body with the bearer token and decodes the strict response', async (_name, call, method, path, data) => {
  const fetcher = vi.fn(async () => Response.json({ data })); vi.stubGlobal('fetch', fetcher);
  await expect(call(createAdminClient(async () => 'TEST_ONLY'))).resolves.toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith(path, expect.objectContaining({ method, credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer TEST_ONLY', 'Content-Type': 'application/json' }, body: expect.stringContaining('"reason":"Why"') }));
});
it('lists invitations with the status filter and validates every row', async () => {
  const fetcher = vi.fn(async () => Response.json({ data: { items: [invitationRow], total: 1, page: 1, pageSize: 20, generatedAt: '2026-10-28T00:00:00Z' } })); vi.stubGlobal('fetch', fetcher);
  const result = await createAdminClient(async () => 'TEST_ONLY').listInvitations({ page: 1, status: 'PENDING' });
  expect(result.items[0]?.email).toBe('new@utm.my');
  expect(fetcher).toHaveBeenCalledWith('/api/admin/invitations?page=1&status=PENDING', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer TEST_ONLY' } }));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { items: [{ ...invitationRow, status: 'LOST' }], total: 1, page: 1, pageSize: 20, generatedAt: '' } })));
  await expect(createAdminClient(async () => 'TEST_ONLY').listInvitations({ page: 1, status: '' })).rejects.toThrow('Invalid administration response');
});
it('rejects a malformed mutation response and parses API errors into AdminApiError', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { ...accountDetail, memberships: [{ role: 'OWNER' }] } })));
  await expect(createAdminClient(async () => 'TEST_ONLY').setAccess(5, { status: 'ACTIVE', reason: 'Why' })).rejects.toThrow('Invalid administration response');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'ROLE_NOT_ELIGIBLE', message: 'Not eligible.' } }, { status: 422 })));
  await expect(createAdminClient(async () => 'TEST_ONLY').grantRole(5, { role: 'SYSTEM_ADMIN', reason: 'Why' })).rejects.toMatchObject({ name: 'Error', status: 422, code: 'ROLE_NOT_ELIGIBLE', message: 'Not eligible.' });
});
