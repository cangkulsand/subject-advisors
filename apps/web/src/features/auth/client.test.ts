import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAccount } from './client';
afterEach(() => vi.unstubAllGlobals());
describe('auth client', () => {
  it('uses a fresh bearer token and no body/cookies for initialization', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { appRole: 'STUDENT' } }));
    vi.stubGlobal('fetch', fetcher);
    await loadAccount(async () => 'test-only', 'https://api.test/', true);
    expect(fetcher).toHaveBeenCalledWith('https://api.test/api/me/initialize', expect.objectContaining({
      method: 'POST', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer test-only' },
    }));
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
  it('does not fetch after session expiry', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(loadAccount(async () => null)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503])('surfaces %s without a success result', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'TEST_ERROR', message: 'Please retry.' } }, { status })));
    await expect(loadAccount(async () => 'test-only')).rejects.toMatchObject({ status, code: 'TEST_ERROR' });
  });
  it('surfaces network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(loadAccount(async () => 'test-only')).rejects.toThrow();
  });
});
