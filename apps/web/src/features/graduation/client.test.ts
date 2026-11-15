import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepAccountSession } from '../auth/account-cache';
import { clearAcademicCache } from '../profile/data-cache';
import { createGraduationClient } from './client';

const check = { requiredCredits: 120, earnedCredits: 90, remainingCredits: 30, creditsMet: false, status: 'NOT_YET_ELIGIBLE', missing: ['30 more credits'], feesClearedConfirmedAt: null, muetConfirmedAt: null };
beforeEach(() => { keepAccountSession({ userId: 'grad-user', sessionId: 'grad-session' }); clearAcademicCache(); });
afterEach(() => { keepAccountSession(null); vi.unstubAllGlobals(); });

describe('graduation client', () => {
  it('load GETs the graduation check with bearer auth', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: check })); vi.stubGlobal('fetch', fetcher);
    expect(await createGraduationClient(async () => 'tok', 'https://api.invalid/').load()).toEqual(check);
    expect(fetcher).toHaveBeenCalledWith('https://api.invalid/api/graduation-check', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer tok' } }));
  });
  it('save PUTs both confirmations as JSON', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: check })); vi.stubGlobal('fetch', fetcher);
    await createGraduationClient(async () => 'tok').save({ feesCleared: false, muet: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/graduation-check/confirmations');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ feesCleared: false, muet: true });
  });
  it.each([400, 503])('rejects with the server message on %i', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'X', message: 'Server says no.' } }, { status })));
    await expect(createGraduationClient(async () => 'tok').save({ feesCleared: true, muet: true })).rejects.toMatchObject({ status, message: 'Server says no.' });
  });
});
