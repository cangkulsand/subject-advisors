import { describe, it, expect, vi } from 'vitest';
import { authorize } from '../../middleware/auth';
import { handleAuthRequest } from './routes';
import { AuthError } from './errors';
import type { AccessAssignment, AuthDependencies, VerifiedIdentity } from './contracts';

// Fictional test-only identities and repository. Never used by production code.
function fixture() {
  const identity: VerifiedIdentity = { clerkUserId: 'user_test_a', sessionId: 'sess_test',
    primaryEmail: { address: 'test@graduate.utm.my', verified: true } };
  const records = new Map<string, AccessAssignment>();
  const deps: AuthDependencies = {
    verify: vi.fn(async () => identity),
    access: {
      find: vi.fn(async id => records.get(id) ?? null),
      initializeStudent: vi.fn(async id => {
        if (!records.has(id)) records.set(id, { clerkUserId: id, appRole: 'STUDENT', accessStatus: 'ACTIVE' });
        return records.get(id)!;
      }),
    },
    profiles: { stateFor: vi.fn(async () => 'SETUP_REQUIRED' as const) },
  };
  const request = (path = '/api/me/initialize', body?: string) => new Request('https://api.test' + path, {
    method: path.endsWith('initialize') ? 'POST' : 'GET', ...(body ? { body } : {}),
  });
  return { identity, records, deps, request };
}

describe('P004 authorization and endpoints', () => {
  it('initializes one student and sends them to mandatory setup', async () => {
    const f = fixture();
    for (let i = 0; i < 2; i++) {
      const res = await handleAuthRequest(f.request(), f.deps);
      expect(res?.status).toBe(200);
      expect(res?.headers.get('cache-control')).toBe('no-store');
      expect(await res?.json()).toMatchObject({ data: { appRole: 'STUDENT', accessStatus: 'ACTIVE', landingPath: '/student/setup' } });
    }
    expect(f.records.size).toBe(1);
    expect(f.deps.access.initializeStudent).toHaveBeenCalledTimes(1);
  });
  it.each(['test@gmail.com', 'test@graduate.utm.my.attacker.test', 'test@sub.graduate.utm.my', 'test@@graduate.utm.my', 'test@graduate.utm.my '])('rejects domain spoof %s', async address => {
    const f = fixture(); f.identity.primaryEmail!.address = address;
    expect((await handleAuthRequest(f.request(), f.deps))?.status).toBe(403);
    expect(f.records.size).toBe(0);
  });
  it('accepts case-insensitive exact domain', async () => {
    const f = fixture(); f.identity.primaryEmail!.address = 'test@GRADUATE.UTM.MY';
    expect((await handleAuthRequest(f.request(), f.deps))?.status).toBe(200);
  });
  it('rejects unverified registration and rechecks email on existing access', async () => {
    const f = fixture(); f.identity.primaryEmail!.verified = false;
    expect((await handleAuthRequest(f.request(), f.deps))?.status).toBe(403);
    f.identity.primaryEmail!.verified = true;
    await handleAuthRequest(f.request(), f.deps);
    f.identity.primaryEmail = null;
    expect((await handleAuthRequest(f.request('/api/me'), f.deps))?.status).toBe(403);
  });
  it('rejects role/status/identity injection in request body', async () => {
    const f = fixture();
    const res = await handleAuthRequest(f.request('/api/me/initialize', JSON.stringify({
      clerkUserId: 'victim', appRole: 'SYSTEM_ADMIN', accessStatus: 'ACTIVE',
    })), f.deps);
    expect(res?.status).toBe(400); expect(f.records.size).toBe(0);
  });
  it('ignores query/header/metadata claims and binds only verified identity', async () => {
    const f = fixture();
    const request = new Request('https://api.test/api/me/initialize?clerkUserId=victim&appRole=SYSTEM_ADMIN', {
      method: 'POST', headers: { 'X-User-Id': 'victim', 'X-Role': 'SYSTEM_ADMIN' },
    });
    const res = await handleAuthRequest(request, f.deps);
    expect(await res?.json()).toMatchObject({ data: { clerkUserId: 'user_test_a', appRole: 'STUDENT' } });
    expect(f.deps.profiles?.stateFor).toHaveBeenCalledWith('user_test_a');
    expect(f.records.has('victim')).toBe(false);
  });
  it.each(['COORDINATOR', 'SYSTEM_ADMIN'] as const)('denies student direct %s API access', async role => {
    const f = fixture(); await handleAuthRequest(f.request(), f.deps);
    await expect(authorize(f.request('/api/private'), f.deps, { roles: [role] })).rejects.toMatchObject({ status: 403, code: 'ROLE_DENIED' });
  });
  it('does not reactivate a suspended assignment', async () => {
    const f = fixture();
    f.records.set(f.identity.clerkUserId, { clerkUserId: f.identity.clerkUserId, appRole: 'STUDENT', accessStatus: 'SUSPENDED' });
    for (let i = 0; i < 2; i++) expect((await handleAuthRequest(f.request(), f.deps))?.status).toBe(403);
    expect(f.deps.access.initializeStudent).not.toHaveBeenCalled();
    expect(f.records.get(f.identity.clerkUserId)?.accessStatus).toBe('SUSPENDED');
  });
  it.each([['COORDINATOR', '/coordinator'], ['SYSTEM_ADMIN', '/admin']] as const)('preserves approved %s assignments', async (role, path) => {
    const f = fixture(); f.identity.primaryEmail = null;
    f.records.set(f.identity.clerkUserId, { clerkUserId: f.identity.clerkUserId, appRole: role, accessStatus: 'ACTIVE' });
    const res = await handleAuthRequest(f.request(), f.deps);
    expect(await res?.json()).toMatchObject({ data: { appRole: role, landingPath: path } });
    expect(f.deps.access.initializeStudent).not.toHaveBeenCalled();
  });
  it('denies missing assignment and unapproved staff registration', async () => {
    const f = fixture(); f.identity.primaryEmail!.address = 'staff@example.test';
    expect((await handleAuthRequest(f.request('/api/me'), f.deps))?.status).toBe(403);
    expect((await handleAuthRequest(f.request(), f.deps))?.status).toBe(403);
  });
  it('blocks academic routes until profile integration confirms completion', async () => {
    const f = fixture(); await handleAuthRequest(f.request(), f.deps);
    await expect(authorize(f.request(), f.deps, { requireProfile: true })).rejects.toMatchObject({ code: 'PROFILE_SETUP_REQUIRED' });
    delete f.deps.profiles;
    expect(await authorize(f.request(), f.deps)).toMatchObject({ profileState: 'UNAVAILABLE', landingPath: '/student/setup' });
    await expect(authorize(f.request(), f.deps, { requireProfile: true })).rejects.toMatchObject({ status: 503 });
    f.deps.profiles = { stateFor: async () => 'COMPLETE' };
    expect(await authorize(f.request(), f.deps, { requireProfile: true })).toMatchObject({ landingPath: '/student' });
  });
  it('returns 401 for expired sessions and conceals provider/DB errors', async () => {
    const f = fixture();
    f.deps.verify = async () => { throw new AuthError(401, 'SESSION_INVALID', 'Please sign in again.'); };
    expect((await handleAuthRequest(f.request(), f.deps))?.status).toBe(401);
    f.deps.verify = async () => { throw new Error('secret-token-and-database-url'); };
    const res = await handleAuthRequest(f.request(), f.deps);
    expect(res?.status).toBe(503); expect(await res?.text()).not.toContain('secret-token');
    f.deps.verify = async () => f.identity;
    f.deps.access.initializeStudent = async () => { throw new Error('secret-database-url'); };
    expect((await handleAuthRequest(f.request(), f.deps))?.status).toBe(503);
    expect(f.records.size).toBe(0);
  });
  it('leaves other routes to their owners and enforces method', async () => {
    const f = fixture();
    expect(await handleAuthRequest(f.request('/api/profile'), f.deps)).toBeNull();
    expect((await handleAuthRequest(new Request('https://api.test/api/me/initialize'), f.deps))?.status).toBe(405);
  });
});

describe('initialization HTTP body regression', () => {
  it.each([false, true])('accepts an empty stream, including zero-length chunks: %s', async zeroChunk => {
    const f = fixture();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (zeroChunk) controller.enqueue(new Uint8Array(0));
        controller.close();
      },
    });
    const init = { method: 'POST', body: stream, duplex: 'half' };
    const request = new Request('https://api.test/api/me/initialize', init);
    expect(request.body).not.toBeNull();
    const response = await handleAuthRequest(request, f.deps);
    expect(response?.status).toBe(200);
    expect(f.deps.verify).toHaveBeenCalledOnce();
    expect(f.records.size).toBe(1);
  });

  it.each(['{}', ' ', '{"appRole":"SYSTEM_ADMIN"}'])('rejects actual bytes even if Content-Length says zero: %s', async body => {
    const f = fixture();
    const request = new Request('https://api.test/api/me/initialize', {
      method: 'POST', body, headers: { 'Content-Length': '0' },
    });
    const response = await handleAuthRequest(request, f.deps);
    expect(response?.status).toBe(400);
    expect(f.deps.verify).not.toHaveBeenCalled();
    expect(f.records.size).toBe(0);
  });

  it('cancels a nonempty stream without consuming an entire upload', async () => {
    const f = fixture();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.of(1)); },
      cancel,
    });
    const init = { method: 'POST', body: stream, duplex: 'half' };
    const response = await handleAuthRequest(new Request('https://api.test/api/me/initialize', init), f.deps);
    expect(response?.status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.deps.verify).not.toHaveBeenCalled();
  });
});
