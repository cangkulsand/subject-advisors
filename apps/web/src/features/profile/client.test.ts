import { it, expect, vi, afterEach } from 'vitest';
import { createAcademicClient } from './client';
afterEach(() => vi.unstubAllGlobals());
it('requires a token before sending any academic request', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
  await expect(createAcademicClient(async () => null)('/api/profile')).rejects.toMatchObject({ status: 401 }); expect(fetch).not.toHaveBeenCalled();
});
it('sends bearer auth and JSON without cookies or caching', async () => {
  const fetch = vi.fn(async () => Response.json({ data: { saved: true } })); vi.stubGlobal('fetch',fetch);
  expect(await createAcademicClient(async () => 'test-token')('/api/profile',{ method: 'PUT', body: { studentName: 'DEMO' } })).toEqual({ saved: true });
  expect(fetch).toHaveBeenCalledWith('/api/profile',expect.objectContaining({ credentials: 'omit', cache: 'no-store', method: 'PUT', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' } }));
});
it('preserves actionable API conflicts', async () => {
  vi.stubGlobal('fetch',vi.fn(async () => Response.json({ error: { code: 'DUPLICATE_RECORD', message: 'Edit the existing attempt.' } },{ status: 409 })));
  await expect(createAcademicClient(async () => 'test')('/api/academic-records')).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_RECORD' });
});
it.each([
  [401, '{}', 'SESSION_REQUIRED'], [401, '[]', 'SESSION_REQUIRED'], [401, 'null', 'SESSION_REQUIRED'],
  [403, '{}', 'ACCESS_DENIED'], [403, '[]', 'ACCESS_DENIED'], [403, 'null', 'ACCESS_DENIED'],
  [401, 'not-json', 'SESSION_REQUIRED'], [403, 'not-json', 'ACCESS_DENIED'],
] as const)('normalizes P001 %s authorization response %s', async (status, body, code) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } })));
  await expect(createAcademicClient(async () => 'test')('/api/academic-records')).rejects.toMatchObject({ status, code });
});
