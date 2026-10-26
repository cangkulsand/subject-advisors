import { describe, expect, it, vi, afterEach } from 'vitest';
import { createOfferingClient } from './client';
import { demoContext } from '../../../../../tools/offerings/demo/fixtures';

afterEach(() => vi.unstubAllGlobals());
describe('offerings browser API transport', () => {
  it('requires a live token before requesting private data', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(createOfferingClient(async () => null).load()).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses a fresh bearer token, no cookies and no cache for each request', async () => {
    const fetcher = vi.fn().mockImplementation(async (_path: string, init: RequestInit) => Response.json({
      data: init.method === 'PUT' ? { semesterId: '201', curriculumSubjectIds: [] } : { ...demoContext, selection: null },
    }));
    vi.stubGlobal('fetch', fetcher);
    const token = vi.fn(async () => 'fictional-token');
    const controller = new AbortController();
    const client = createOfferingClient(token, 'https://api.invalid/');
    await client.load('201', controller.signal);
    expect(fetcher).toHaveBeenCalledWith('https://api.invalid/api/semester-offerings?semesterId=201', expect.objectContaining({
      method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: 'Bearer fictional-token' },
    }));
    await client.save({ semesterId: '201', curriculumSubjectIds: [] });
    expect(token).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![1].body).toBe('{"semesterId":"201","curriculumSubjectIds":[]}');
  });
  it('preserves access-denied status and safe server recovery message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'PROFILE_SETUP_REQUIRED', message: 'Complete your profile.' } }, { status: 403 })));
    await expect(createOfferingClient(async () => 'fixture').load()).rejects.toMatchObject({ status: 403, code: 'PROFILE_SETUP_REQUIRED', message: 'Complete your profile.' });
  });
  it('does not report success for an invalid response or a network failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ unexpected: true })).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const client = createOfferingClient(async () => 'fixture');
    await expect(client.save({ semesterId: 'fixture', curriculumSubjectIds: [] })).rejects.toThrow();
    await expect(client.load()).rejects.toThrow('offline');
  });
  it('rejects malformed success data rather than crashing the page or claiming a save', async () => {
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
