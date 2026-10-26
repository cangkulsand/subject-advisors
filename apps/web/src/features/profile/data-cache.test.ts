import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { keepAccountSession, clearAccountCache } from '../auth/account-cache';
import { createAcademicClient } from './client';
import { ACADEMIC_CACHE_TTL } from './data-cache';

const session = { userId: 'student-a', sessionId: 'session-a' };
beforeEach(() => { keepAccountSession(session); });
afterEach(() => { keepAccountSession(null); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('shares session-long profile reads across clients and separates API origins', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ data: { name: 'Student' } })); vi.stubGlobal('fetch', fetcher);
  const first = createAcademicClient(async () => 'token');
  const second = createAcademicClient(async () => 'token');
  const [a, b] = await Promise.all([first<{name:string}>('/api/profile'), second('/api/profile')]);
  a.name = 'Local edit'; expect(b).toEqual({ name: 'Student' });
  expect(await second('/api/profile')).toEqual({ name: 'Student' }); expect(fetcher).toHaveBeenCalledTimes(1);
  await createAcademicClient(async () => 'token', 'https://other.example')('/api/profile'); expect(fetcher).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(24 * 60 * 60 * 1000); await first('/api/profile'); expect(fetcher).toHaveBeenCalledTimes(2);
  await first('/api/profile/options'); vi.advanceTimersByTime(ACADEMIC_CACHE_TTL); await first('/api/profile/options'); expect(fetcher).toHaveBeenCalledTimes(4);
});
it('refreshes records and curriculum options after a successful save', async () => {
  const fetcher = vi.fn(async () => Response.json({ data: [] })); vi.stubGlobal('fetch', fetcher);
  const api = createAcademicClient(async () => 'token');
  await api('/api/academic-records'); await api('/api/profile/options');
  await api('/api/academic-records'); expect(fetcher).toHaveBeenCalledTimes(2);
  await api('/api/academic-records', { method: 'POST', body: {} });
  await api('/api/academic-records'); await api('/api/profile/options'); expect(fetcher).toHaveBeenCalledTimes(5);
  await api('/api/profile', { method: 'PUT', body: {} }); await api('/api/profile/options'); expect(fetcher).toHaveBeenCalledTimes(7);
});
it('never caches errors and clears private data on access denial and logout', async () => {
  const fetcher = vi.fn(async () => Response.json({ data: [] })); vi.stubGlobal('fetch', fetcher);
  const api = createAcademicClient(async () => 'token'); await api('/api/profile');
  fetcher.mockResolvedValueOnce(Response.json({ error: { code:'DENIED', message:'Denied' } }, { status:403 }));
  await expect(api('/api/academic-records')).rejects.toMatchObject({ status:403 });
  await api('/api/profile'); await api('/api/academic-records'); expect(fetcher).toHaveBeenCalledTimes(4);
  clearAccountCache(false); await api('/api/profile'); expect(fetcher).toHaveBeenCalledTimes(5);
});
it('a cancelled component does not cancel another subscriber', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetcher);
  const api = createAcademicClient(async () => 'token'), controller = new AbortController();
  const first = api('/api/profile', { signal:controller.signal }); const second = api('/api/profile');
  const rejected = expect(first).rejects.toMatchObject({ name:'AbortError' }); controller.abort();
  await Promise.resolve(); finish(Response.json({ data: { name:'Student' } }));
  await rejected; expect(await second).toEqual({ name:'Student' }); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects late data after a session switch without clearing the new session', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish=resolve; })).mockResolvedValue(Response.json({ data:{ name:'B' } }));
  vi.stubGlobal('fetch',fetcher); const api=createAcademicClient(async ()=>'token');
  const old=api('/api/profile'); const rejected=expect(old).rejects.toMatchObject({ code:'SESSION_CHANGED' }); await Promise.resolve();
  keepAccountSession({userId:'student-b',sessionId:'session-b'}); expect(await api('/api/profile')).toEqual({name:'B'});
  finish(Response.json({data:{name:'A'}})); await rejected;
  expect(await api('/api/profile')).toEqual({name:'B'}); expect(fetcher).toHaveBeenCalledTimes(2);
});
it('an older read cannot repopulate cache after a save', async () => {
  let finish!: (response: Response) => void;
  const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;})).mockImplementation(async()=>Response.json({data:[]}));
  vi.stubGlobal('fetch',fetcher);const api=createAcademicClient(async()=>'token');
  const old=api('/api/academic-records');const rejected=expect(old).rejects.toMatchObject({name:'AbortError'});await Promise.resolve();
  await api('/api/academic-records/1',{method:'PUT',body:{}});finish(Response.json({data:[{recordId:1}]}));await rejected;
  expect(await api('/api/academic-records')).toEqual([]);expect(fetcher).toHaveBeenCalledTimes(3);
});
