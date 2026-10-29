import { describe, it, expect, vi } from 'vitest';
import { profileInput, P001Error, jsonBody } from './validation';
import { recordInput } from '../records/validation';
import { createProfileReader, createProfileRepository } from './repository';
import { createReferenceCache, type CacheBindings } from '../../cache/redis';
import { handleP001Request, type P001Dependencies } from './routes';
import { AuthError } from '../auth/errors';
import type { Profile, ProfileRepository } from './contracts';
import type { AccessAssignment } from '../auth/contracts';

const input = { studentName: 'Demo student', curriculumId: 1, currentSemesterId: 201, weeklyWorkingHours: 0, availableStudyHours: 12 };
const profile: Profile = { ...input, studentId: 1, matricNo: null, programmeCode: 'DEMO', programmeName: 'Not official', curriculumVersion: 'DEMO', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const record = { subjectId: 1, semesterId: null, status: 'EXEMPTED', recognizedCredits: 0, remarks: 'DEMO credit-free exemption' };
const cacheBindings: CacheBindings = {
  REDIS_CACHE_ENABLED: 'true', REDIS_CURRICULUM_CACHE_ENABLED: 'true', UPSTASH_REDIS_REST_URL: 'https://cache.test.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-secret', REDIS_CACHE_NAMESPACE: 'test', REDIS_CACHE_DATASET: 'profile',
};
function referenceCacheHarness() {
  const store = new Map<string, unknown>();
  const get = vi.fn(async <T>(key: string): Promise<T | null> => (store.get(key) as T | undefined) ?? null);
  const set = vi.fn(async (key: string, value: unknown) => { store.set(key, value); return 'OK'; });
  const createClient = vi.fn((_config: { url: string; token: string }, _signal: AbortSignal) => {
    void _config; void _signal;
    return { get: <T>(key: string) => get(key) as Promise<T | null>, set };
  });
  return { cache: createReferenceCache(cacheBindings, { createClient }), get, set, createClient };
}
function dependencies(state: 'COMPLETE' | 'SETUP_REQUIRED' | 'UNAVAILABLE' = 'COMPLETE'): P001Dependencies {
  return {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: 'verified_student_a', sessionId: 'test', primaryEmail: { address: 'demo@graduate.utm.my', verified: true } })),
      access: { find: vi.fn(async () => ({ clerkUserId: 'verified_student_a', appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
      profiles: { stateFor: vi.fn(async () => state) },
    },
    profiles: { find: vi.fn(async () => profile), save: vi.fn(async () => profile), options: vi.fn(async () => ({ curricula: [], subjects: [], semesters: [] })) },
    records: { list: vi.fn(async () => []), save: vi.fn(), delete: vi.fn() },
  };
}
function request(path: string, method = 'GET', body?: unknown) {
  return new Request('https://example.test' + path, { method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
describe('P001 strict input validation', () => {
  it('normalizes a valid profile and permits zero working hours', () => expect(profileInput({ ...input, studentName: ' Demo ' })).toMatchObject({ studentName: 'Demo', matricNo: null }));
  it.each([-1, 1.5, NaN, Infinity, '0', null, undefined, 2147483648])('rejects invalid hour value %s', value => expect(() => profileInput({ ...input, weeklyWorkingHours: value })).toThrow(P001Error));
  it.each(['uuid-value', 0, -2, 1.5, 2147483648])('rejects invalid curriculum ID %s', value => expect(() => profileInput({ ...input, curriculumId: value })).toThrow());
  it.each(['uuid-value', 0, -2, 1.5, 2147483648, undefined, null])('rejects invalid current semester ID %s', value => expect(() => profileInput({ ...input, currentSemesterId: value })).toThrow());
  it.each(['clerkUserId','studentId','appRole','email','accessStatus','employmentText'])('rejects unauthorized/unmodeled field %s', key => expect(() => profileInput({ ...input, [key]: 'spoof' })).toThrow());
  it('requires a nonblank bounded name', () => { expect(() => profileInput({ ...input, studentName: ' ' })).toThrow(); expect(() => profileInput({ ...input, studentName: 'x'.repeat(256) })).toThrow(); });
  it('leaves missing/null EXEMPTED credits unset for full subject-credit derivation', () => {
    expect(recordInput({ subjectId: 1, status: 'EXEMPTED' })).toEqual({ subjectId: 1, semesterId: null, status: 'EXEMPTED', grade: null, recognizedCredits: null, remarks: null });
    expect(recordInput({ subjectId: 1, status: 'EXEMPTED', recognizedCredits: null, grade: null, remarks: null })).toMatchObject({ recognizedCredits: null, grade: null, remarks: null });
  });
  it('allows full-credit exemption input without remarks while repository checks configured subject credits', () => {
    expect(recordInput({ subjectId: 1, status: 'EXEMPTED', recognizedCredits: 3 })).toMatchObject({ recognizedCredits: 3, remarks: null });
  });
  it.each([-1, 1.5, '0', NaN, Infinity, 2147483648])('rejects malformed EXEMPTED recognized credits %s instead of defaulting', credits => {
    expect(() => recordInput({ subjectId: 1, status: 'EXEMPTED', recognizedCredits: credits })).toThrow(P001Error);
  });
  it.each(['COMPLETED','EXEMPTED','FAILED','WITHDRAWN'] as const)('allows omitted grade and remarks for %s', status => {
    const recognizedCredits = status === 'COMPLETED' ? undefined : 0;
    expect(recordInput({ subjectId: 1, status, recognizedCredits })).toMatchObject({ grade: null, remarks: null });
  });
  it.each(['FAILED','WITHDRAWN'])('never permits earned credits or omitted credits on %s', status => {
    expect(recordInput({ subjectId: 1, status, recognizedCredits: 0 })).toMatchObject({ recognizedCredits: 0, status });
    expect(() => recordInput({ ...record, status, recognizedCredits: 1 })).toThrow();
    expect(() => recordInput({ subjectId: 1, status })).toThrow();
  });
  it('derives completed credits rather than requiring client totals', () => expect(recordInput({ subjectId: 1, status: 'COMPLETED' })).toMatchObject({ recognizedCredits: null, semesterId: null }));
  it('rejects invented outcomes and notes/identity fields', () => {
    expect(() => recordInput({ ...record, status: 'IN_PROGRESS' })).toThrow();
    expect(() => recordInput({ ...record, notes: 'wrong column' })).toThrow();
    expect(() => recordInput({ ...record, studentId: 2 })).toThrow();
  });
  it('rejects malformed JSON, array bodies and overlarge payloads', async () => {
    await expect(jsonBody(new Request('https://test', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' }))).rejects.toThrow();
    expect(() => profileInput([])).toThrow();
    await expect(jsonBody(new Request('https://test', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(16385) }))).rejects.toMatchObject({ status: 413 });
  });
});
describe('P001 ProfileReader seam', () => {
  function repository(find: ProfileRepository['find']): ProfileRepository { return { find, save: vi.fn(), options: vi.fn() }; }
  it('reports complete only for the saved valid profile', async () => expect(await createProfileReader(repository(async () => profile)).stateFor('a')).toBe('COMPLETE'));
  it('reports setup for absent, legacy-no-semester or nullable availability', async () => {
    expect(await createProfileReader(repository(async () => null)).stateFor('a')).toBe('SETUP_REQUIRED');
    expect(await createProfileReader(repository(async () => ({ ...profile, currentSemesterId: null }))).stateFor('a')).toBe('SETUP_REQUIRED');
    expect(await createProfileReader(repository(async () => ({ ...profile, currentSemesterId: undefined as unknown as number }))).stateFor('a')).toBe('SETUP_REQUIRED');
    expect(await createProfileReader(repository(async () => ({ ...profile, availableStudyHours: null }))).stateFor('a')).toBe('SETUP_REQUIRED');
  });
  it('reports unavailable on a persistence failure', async () => expect(await createProfileReader(repository(async () => { throw new Error('private details'); })).stateFor('a')).toBe('UNAVAILABLE'));
});
describe('P001 authenticated route boundary', () => {
  it('keeps auth ahead of the curriculum cache on warm requests and preserves no-store response shape', async () => {
    const cache = referenceCacheHarness();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT curriculum_id AS "curriculumId" FROM public.student_profile')) return [{ curriculumId: 12 }];
      return [] as Record<string, unknown>[];
    });
    const profiles = createProfileRepository(query, cache.cache, { curriculumCacheEnabled: true });
    const deps = dependencies();
    deps.profiles = profiles;
    const first = await handleP001Request(request('/api/profile/options'), deps);
    const second = await handleP001Request(request('/api/profile/options'), deps);
    expect(first?.headers.get('Cache-Control')).toBe('no-store');
    expect(second?.headers.get('Cache-Control')).toBe('no-store');
    expect(await second?.json()).toEqual({ data: { curricula: [], subjects: [], semesters: [], subjectGroups: [] } });
    expect(query).toHaveBeenCalledTimes(6); // cold lookup 5; warm lookup 1 live association read
    expect(cache.get).toHaveBeenCalledTimes(6);
    expect(cache.set).toHaveBeenCalledTimes(3);

    const redisReadsBeforeDenied = cache.get.mock.calls.length;
    const queryCallsBeforeDenied = query.mock.calls.length;
    const assignment: AccessAssignment = { clerkUserId: 'verified_student_a', appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' };
    let expired = false;
    const verify = vi.fn(async () => {
      if (expired) throw new AuthError(401, 'SESSION_INVALID', 'Session expired.');
      return { clerkUserId: 'verified_student_a', sessionId: 'test', primaryEmail: { address: 'demo@graduate.utm.my', verified: true } };
    });
    const accessFind = vi.fn(async () => assignment);
    deps.auth.verify = verify;
    deps.auth.access.find = accessFind;
    expired = true;
    expect((await handleP001Request(request('/api/profile/options'), deps))?.status).toBe(401);
    expired = false;
    assignment.accessStatus = 'SUSPENDED';
    expect((await handleP001Request(request('/api/profile/options'), deps))?.status).toBe(403);
    assignment.accessStatus = 'ACTIVE';
    assignment.appRole = 'COORDINATOR';
    assignment.roles = ['COORDINATOR'];
    expect((await handleP001Request(request('/api/profile/options'), deps))?.status).toBe(403);
    expect(verify).toHaveBeenCalledTimes(3);
    expect(accessFind).toHaveBeenCalledTimes(2);
    expect(cache.get).toHaveBeenCalledTimes(redisReadsBeforeDenied);
    expect(query).toHaveBeenCalledTimes(queryCallsBeforeDenied);
  });

  it('keeps auth fresh and ahead of a warm profile-options cache, with no-store responses', async () => {
    const cache = referenceCacheHarness();
    const query = vi.fn(async () => [] as Record<string, unknown>[]);
    const profiles = createProfileRepository(query, cache.cache);
    const options = vi.spyOn(profiles, 'options');
    const deps = dependencies();
    deps.profiles = profiles;
    let assignment: AccessAssignment = { clerkUserId: 'verified_student_a', appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' };
    let invalidSession = false;
    const verified = { clerkUserId: 'verified_student_a', sessionId: 'new-session', primaryEmail: { address: 'demo@graduate.utm.my', verified: true } };
    const verify = vi.fn(async () => { if (invalidSession) throw new AuthError(401, 'SESSION_INVALID', 'Session expired.'); return verified; });
    const accessFind = vi.fn(async () => assignment);
    deps.auth.verify = verify;
    deps.auth.access.find = accessFind;

    const first = await handleP001Request(request('/api/profile/options'), deps);
    const second = await handleP001Request(request('/api/profile/options'), deps);
    expect(first?.headers.get('Cache-Control')).toBe('no-store');
    expect(second?.headers.get('Cache-Control')).toBe('no-store');
    expect(await second?.json()).toEqual({ data: { curricula: [], subjects: [], semesters: [], subjectGroups: [] } });
    expect(options).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(6);
    expect(cache.get).toHaveBeenCalledTimes(4);
    expect(cache.set).toHaveBeenCalledTimes(2);

    const dbCallsBeforeDenied = query.mock.calls.length;
    const cacheCallsBeforeDenied = cache.get.mock.calls.length;
    invalidSession = true;
    expect((await handleP001Request(request('/api/profile/options'), deps))?.status).toBe(401);
    invalidSession = false;
    assignment = { ...assignment, accessStatus: 'SUSPENDED' };
    expect((await handleP001Request(request('/api/profile/options'), deps))?.status).toBe(403);
    assignment = { clerkUserId: 'verified_student_a', appRole: 'COORDINATOR', roles: ['COORDINATOR'], accessStatus: 'ACTIVE' };
    expect((await handleP001Request(request('/api/profile/options'), deps))?.status).toBe(403);

    expect(verify).toHaveBeenCalledTimes(5);
    expect(accessFind).toHaveBeenCalledTimes(4);
    expect(options).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(dbCallsBeforeDenied);
    expect(cache.get).toHaveBeenCalledTimes(cacheCallsBeforeDenied);
  });

  it('allows setup/profile writes before completion using verified identity only', async () => {
    const deps = dependencies('SETUP_REQUIRED'); const response = await handleP001Request(request('/api/profile','PUT',input),deps);
    expect(response?.status).toBe(200); expect(deps.profiles.save).toHaveBeenCalledWith('verified_student_a', { ...input, matricNo: null });
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });
  it('returns absent profile as a valid setup state', async () => {
    const deps = dependencies('SETUP_REQUIRED'); deps.profiles.find = vi.fn(async () => null);
    expect(await (await handleP001Request(request('/api/profile'),deps))?.json()).toEqual({ data: null });
  });
  it.each(['SETUP_REQUIRED','UNAVAILABLE'] as const)('denies record access when profile is %s', async state => {
    const deps = dependencies(state); const response = await handleP001Request(request('/api/academic-records'),deps);
    expect(response?.status).toBe(state === 'UNAVAILABLE' ? 503 : 403); expect(deps.records.list).not.toHaveBeenCalled();
  });
  it('scopes record reads and updates to verified identity', async () => {
    const deps = dependencies(); deps.records.save = vi.fn(async () => { throw new P001Error(404,'RECORD_NOT_FOUND','Record unavailable.'); });
    await handleP001Request(request('/api/academic-records'),deps); expect(deps.records.list).toHaveBeenCalledWith('verified_student_a');
    const response = await handleP001Request(request('/api/academic-records/42','PUT',record),deps);
    expect(response?.status).toBe(404); expect(deps.records.save).toHaveBeenCalledWith('verified_student_a', expect.objectContaining({ subjectId: 1 }), 42);
  });
  it('creates only undated initial records and deletes one verified-owner row', async () => {
    const deps = dependencies(); deps.records.save = vi.fn(async () => ({ ...record, status: 'COMPLETED' as const, grade: null, recordId: 7, subjectCode: 'DEMO', subjectName: 'Demo', creditHours: 3, academicYear: null, semesterNo: null, createdAt: '2026-01-01T00:00:00Z', recognizedCredits: 3 }));
    const created = await handleP001Request(request('/api/academic-records','POST',record),deps);
    expect(created?.status).toBe(201); expect(deps.records.save).toHaveBeenCalledWith('verified_student_a', expect.objectContaining({ semesterId: null }), undefined);
    deps.records.delete = vi.fn(async () => ({ recordId: 7, subjectId: 1 }));
    const deleted = await handleP001Request(request('/api/academic-records/7','DELETE'),deps);
    expect(deleted?.status).toBe(200); expect(await deleted?.json()).toEqual({ data: { recordId: 7, subjectId: 1 } });
    expect(deps.records.delete).toHaveBeenCalledWith('verified_student_a', 7);
  });
  it('accepts minimal Exempted input through POST and leaves credits for configured derivation', async () => {
    const deps = dependencies();
    deps.records.save = vi.fn(async (_userId, saved) => ({ ...saved, recordId: 8, recognizedCredits: 3, createdAt: '2026-01-01T00:00:00Z', subjectCode: 'DEMO', subjectName: 'Demo', creditHours: 3, academicYear: null, semesterNo: null }));
    const response = await handleP001Request(request('/api/academic-records','POST',{ subjectId: 1, status: 'EXEMPTED' }),deps);
    expect(response?.status).toBe(201);
    expect(deps.records.save).toHaveBeenCalledWith('verified_student_a', { subjectId: 1, semesterId: null, status: 'EXEMPTED', grade: null, recognizedCredits: null, remarks: null }, undefined);
    expect(await response?.json()).toMatchObject({ data: { recognizedCredits: 3 } });
  });
  it('does not invoke record deletion for invalid IDs and returns scoped not-found', async () => {
    const deps = dependencies(); deps.records.delete = vi.fn(async () => { throw new P001Error(404,'RECORD_NOT_FOUND','The record is unavailable.'); });
    expect((await handleP001Request(request('/api/academic-records/0','DELETE'),deps))?.status).toBe(400);
    expect(deps.records.delete).not.toHaveBeenCalled();
    expect((await handleP001Request(request('/api/academic-records/99','DELETE'),deps))?.status).toBe(404);
    expect(deps.records.delete).toHaveBeenCalledWith('verified_student_a',99);
  });
  it('applies existing auth, role and profile gates to record deletion', async () => {
    const expired = dependencies(); expired.auth.verify = vi.fn(async () => { throw new AuthError(401,'SESSION_INVALID','Session expired.'); });
    expect((await handleP001Request(request('/api/academic-records/7','DELETE'),expired))?.status).toBe(401);
    expect(expired.records.delete).not.toHaveBeenCalled();
    const wrongRole = dependencies(); wrongRole.auth.access.find = vi.fn(async () => ({ clerkUserId: 'verified_student_a', appRole: 'COORDINATOR' as const, roles: ['COORDINATOR' as const], accessStatus: 'ACTIVE' as const }));
    expect((await handleP001Request(request('/api/academic-records/7','DELETE'),wrongRole))?.status).toBe(403);
    expect(wrongRole.records.delete).not.toHaveBeenCalled();
    const incomplete = dependencies('SETUP_REQUIRED');
    expect((await handleP001Request(request('/api/academic-records/7','DELETE'),incomplete))?.status).toBe(403);
    expect(incomplete.records.delete).not.toHaveBeenCalled();
  });
  it.each(['bad-id','1.2','0','2147483648'])('rejects invalid record path %s', async id => expect((await handleP001Request(request('/api/academic-records/'+id,'PUT',record),dependencies()))?.status).toBe(400));
  it('does not accept spoofed record ownership', async () => {
    const deps = dependencies(); const response = await handleP001Request(request('/api/academic-records','POST',{ ...record, studentId: 100 }),deps);
    expect(response?.status).toBe(400); expect(deps.records.save).not.toHaveBeenCalled();
  });
  it('denies expired sessions before repository access', async () => {
    const deps = dependencies(); deps.auth.verify = vi.fn(async () => { throw new AuthError(401,'SESSION_INVALID','Session expired.'); });
    expect((await handleP001Request(request('/api/profile'),deps))?.status).toBe(401); expect(deps.profiles.find).not.toHaveBeenCalled();
  });
  it('denies suspended students and staff without running feature queries', async () => {
    for (const assignment of [{ appRole: 'STUDENT' as const, accessStatus: 'SUSPENDED' as const },{ appRole: 'COORDINATOR' as const, accessStatus: 'ACTIVE' as const }]) {
      const deps = dependencies(); deps.auth.access.find = vi.fn(async () => ({ clerkUserId: 'verified_student_a', ...assignment, roles: [assignment.appRole] }));
      expect((await handleP001Request(request('/api/profile'),deps))?.status).toBe(403); expect(deps.profiles.find).not.toHaveBeenCalled();
    }
  });
  it('preserves safe conflict messages and hides database details', async () => {
    const deps = dependencies(); deps.profiles.save = vi.fn(async () => { throw { code: '23514', detail: 'PRIVATE DATABASE' }; });
    const conflict = await handleP001Request(request('/api/profile','PUT',input),deps); expect(conflict?.status).toBe(409); expect(await conflict?.text()).not.toContain('PRIVATE');
    deps.profiles.find = vi.fn(async () => { throw new Error('PRIVATE DATABASE'); });
    const unavailable = await handleP001Request(request('/api/profile'),deps); expect(unavailable?.status).toBe(503); expect(await unavailable?.text()).not.toContain('PRIVATE');
  });
  it('returns conflict for duplicate attempts', async () => {
    const deps = dependencies(); deps.records.save = vi.fn(async () => { throw { code: '23505' }; });
    expect((await handleP001Request(request('/api/academic-records','POST',record),deps))?.status).toBe(409);
  });
  it('implements only owned routes/methods', async () => {
    const deps = dependencies(); expect(await handleP001Request(request('/api/pathway/graph'),deps)).toBeNull();
    expect((await handleP001Request(request('/api/academic-records','DELETE'),deps))?.status).toBe(405);
    expect((await handleP001Request(request('/api/academic-records/12','PATCH'),deps))?.status).toBe(405);
  });
});
