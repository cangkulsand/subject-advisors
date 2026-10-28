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
