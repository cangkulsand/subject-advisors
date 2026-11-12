import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountSessionStamp, keepAccountSession } from '../auth/account-cache';
import { cachedAcademicRead, clearAcademicCache } from '../profile/data-cache';
import { createSprint2Client } from './client';

const session = { userId: 'uc24-admin', sessionId: 'uc24-session' };
beforeEach(() => { keepAccountSession(session); clearAcademicCache(); });
afterEach(() => { keepAccountSession(null); vi.unstubAllGlobals(); });

describe('sprint2 academic client', () => {
  it('trims a custom base URL and sends bearer auth on the sprint2 route family', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { curricula: [] } })); vi.stubGlobal('fetch', fetcher);
    const value = await createSprint2Client(async () => 'fictional-token', 'https://api.invalid//')<{ curricula: unknown[] }>('/curricula');
    expect(value).toEqual({ curricula: [] });
    expect(fetcher).toHaveBeenCalledWith('https://api.invalid/api/p001-sprint2/curricula', expect.objectContaining({
      method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer fictional-token' },
    }));
  });
  it('requires a token before any fetch', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(createSprint2Client(async () => null)('/curricula')).rejects.toMatchObject({ status: 401, code: 'SESSION_REQUIRED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a response received after the account session changed', async () => {
    const fetcher = vi.fn(async () => { keepAccountSession({ userId: 'uc24-other', sessionId: 'other' }); return Response.json({ data: [] }); });
    vi.stubGlobal('fetch', fetcher);
    await expect(createSprint2Client(async () => 'fictional-token')('/curricula')).rejects.toMatchObject({ status: 401, code: 'SESSION_CHANGED' });
  });
  it('clears stale academic reads after a successful mutation', async () => {
    const key = JSON.stringify([accountSessionStamp(), '', '/api/profile']);
    await cachedAcademicRead(key, async () => ({ studentName: 'Stale snapshot' }));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { revision: 'a'.repeat(32) } })));
    await createSprint2Client(async () => 'fictional-token')('/curricula/1/subjects', { method: 'POST', body: { code: 'DEMO' } });
    expect(await cachedAcademicRead(key, async () => ({ studentName: 'Fresh snapshot' }))).toEqual({ studentName: 'Fresh snapshot' });
  });
  it('propagates safe API errors and rejects malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'STALE_CURRICULUM', message: 'Reload.' } }, { status: 409 })));
    await expect(createSprint2Client(async () => 'fictional-token')('/curricula/1/subjects', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 409, code: 'STALE_CURRICULUM', message: 'Reload.' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(createSprint2Client(async () => 'fictional-token')('/curricula')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
