import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountSessionStamp, keepAccountSession } from '../auth/account-cache';
import { ACADEMIC_CACHE_TTL, cachedAcademicRead, clearAcademicCache } from '../profile/data-cache';
import { demoContext } from '../../../../../tools/offerings/demo/fixtures';
import { createOfferingClient, OfferingApiError } from './client';

const session = { userId: 'offering-student-a', sessionId: 'offering-session-a' };
function successfulResponse(path: string, init?: RequestInit): Response {
  if (new URL(path, 'https://local.invalid').pathname === '/api/academic-records') return Response.json({ data: [] });
  if (init?.method === 'PUT') return Response.json({ data: { semesterId: '201', curriculumSubjectIds: [] } });
  return Response.json({ data: { ...demoContext, selection: null } });
}
beforeEach(() => { keepAccountSession(session); clearAcademicCache(); });
afterEach(() => { keepAccountSession(null); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('offerings browser API transport', () => {
  it('requires a live token before requesting private data', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(createOfferingClient(async () => null).load()).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses bearer auth and composes a known-empty P001 history snapshot', async () => {
    const fetcher = vi.fn(async (path: string, init: RequestInit) => successfulResponse(path, init)); vi.stubGlobal('fetch', fetcher);
    const token = vi.fn(async () => 'fictional-token');
    const controller = new AbortController();
    const client = createOfferingClient(token, 'https://api.invalid/');
    const page = await client.load('201', controller.signal);
    expect(page.academicHistory).toEqual({ status: 'available', records: [] });
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://api.invalid/api/semester-offerings?semesterId=201', expect.objectContaining({
      method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer fictional-token' },
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.invalid/api/academic-records', expect.objectContaining({
      method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer fictional-token' },
    }));
    await client.save({ semesterId: '201', curriculumSubjectIds: [] });
    expect(token).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]![1].body).toBe('{"semesterId":"201","curriculumSubjectIds":[]}');
  });
  it('keys cached offering context by identity, normalized API base and semester query', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (path: string, init: RequestInit) => successfulResponse(path, init)); vi.stubGlobal('fetch', fetcher);
    const client = createOfferingClient(async () => 'fixture-token', 'https://api.invalid/');
    await client.load('201'); await client.load('201');
    expect(fetcher).toHaveBeenCalledTimes(2); // Context and session-cached P001 records.
    await client.load('202'); expect(fetcher).toHaveBeenCalledTimes(3);
    await createOfferingClient(async () => 'fixture-token', 'https://other.invalid').load('201'); expect(fetcher).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(5 * 60 * 1000);
    await client.load('201'); expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('bypasses pre-total P002 snapshots while keeping identity first in the versioned key', async () => {
    const base = 'https://api.invalid';
    const path = '/api/semester-offerings?semesterId=201';
    const oldKey = JSON.stringify([accountSessionStamp(), base, path]);
    await cachedAcademicRead(oldKey, async () => ({ ...demoContext, selection: null }), undefined, ACADEMIC_CACHE_TTL);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/api/academic-records')
      ? Response.json({ data: [] })
      : Response.json({ data: { ...demoContext, curriculum: { ...demoContext.curriculum, totalCreditRequired: 131 }, selection: null } })));
    const page = await createOfferingClient(async () => 'fixture-token', base).load('201');
    expect(page.curriculum.totalCreditRequired).toBe(131);
  });
  it('retains offering and records snapshots after failed save, invalidates before decoding successful save', async () => {
    const fetcher = vi.fn(async (path: string, init: RequestInit) => successfulResponse(path, init)); vi.stubGlobal('fetch', fetcher);
    const client = createOfferingClient(async () => 'fixture-token');
    await client.load('201');
    fetcher.mockResolvedValueOnce(Response.json({ error: { code: 'SAVE_FAILED', message: 'Try again.' } }, { status: 503 }));
    await expect(client.save({ semesterId: '201', curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 503 });
    await client.load('201'); expect(fetcher).toHaveBeenCalledTimes(3);

    fetcher.mockResolvedValueOnce(Response.json({ data: { semesterId: '201', curriculumSubjectIds: ['duplicate', 'duplicate'] } }));
    await expect(client.save({ semesterId: '201', curriculumSubjectIds: [] })).rejects.toThrow('Invalid offerings response');
    await client.load('201'); expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('propagates P001 authorization failures but degrades non-auth history failures to unknown', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { ...demoContext, selection: null } }))
      .mockResolvedValueOnce(Response.json({ error: { code: 'DENIED', message: 'Denied.' } }, { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createOfferingClient(async () => 'fixture-token').load('201')).rejects.toMatchObject({ status: 403, code: 'DENIED' });

    clearAcademicCache();
    fetcher.mockReset()
      .mockResolvedValueOnce(Response.json({ data: { ...demoContext, selection: null } }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const page = await createOfferingClient(async () => 'fixture-token').load('201');
    expect(page.academicHistory).toEqual({ status: 'unavailable' });
  });
  it.each([
    ['GET', 401, 'SESSION_REQUIRED'], ['PUT', 403, 'ACCESS_DENIED'],
  ] as const)('normalizes a non-JSON %s authorization denial', async (method, status, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unreadable error body', { status })));
    const client = createOfferingClient(async () => 'fixture-token');
    const operation = method === 'GET' ? client.load('201') : client.save({ semesterId: '201', curriculumSubjectIds: [] });
    const error = await operation.then(() => null, reason => reason);
    expect(error).toBeInstanceOf(OfferingApiError);
    expect(error).toMatchObject({ status, code });
  });
  it.each([
    [401, '{}', 'SESSION_REQUIRED'], [401, '[]', 'SESSION_REQUIRED'], [401, 'null', 'SESSION_REQUIRED'],
    [403, '{}', 'ACCESS_DENIED'], [403, '[]', 'ACCESS_DENIED'], [403, 'null', 'ACCESS_DENIED'],
  ] as const)('normalizes JSON %s denial body %s to a typed P002 error', async (status, body, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } })));
    await expect(createOfferingClient(async () => 'fixture-token').load('201')).rejects.toMatchObject({ status, code });
  });
  it('preserves structured P002 authorization details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'PROFILE_SETUP_REQUIRED', message: 'Complete your profile.' } }, { status: 403 })));
    await expect(createOfferingClient(async () => 'fixture-token').load('201')).rejects.toMatchObject({ status: 403, code: 'PROFILE_SETUP_REQUIRED', message: 'Complete your profile.' });
  });
  it('rejects a P002 response that completes after the account changes', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetcher);
    const pending = createOfferingClient(async () => 'fixture-token').load('201');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    keepAccountSession({ userId: 'offering-student-b', sessionId: 'offering-session-b' });
    finish(Response.json({ data: { ...demoContext, selection: null } }));
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not report save success for malformed, invalid or network responses', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ unexpected: true }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const client = createOfferingClient(async () => 'fixture-token');
    await expect(client.save({ semesterId: '201', curriculumSubjectIds: [] })).rejects.toThrow();
    await expect(client.load()).rejects.toThrow('offline');
  });
  it('rejects malformed success data and history instead of publishing it', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: null }))
      .mockResolvedValueOnce(Response.json({ data: { ...demoContext, semesters: [{ semesterId: 'bad', academicYear: '2026/2027', semesterNo: 4 }], selection: null } }))
      .mockResolvedValueOnce(Response.json({ data: { semesterId: 'fixture', curriculumSubjectIds: ['duplicate', 'duplicate'] } }));
    vi.stubGlobal('fetch', fetcher);
    const client = createOfferingClient(async () => 'fixture');
    await expect(client.load()).rejects.toThrow('Invalid offerings response');
    await expect(client.load()).rejects.toThrow('Invalid offerings response');
    await expect(client.save({ semesterId: 'fixture', curriculumSubjectIds: [] })).rejects.toThrow('Invalid offerings response');
  });
});
