import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminHandler, createAcademicRepository } from './index';
import type { AuthBindings } from '../auth';
import type { AuthDependencies, AccessAssignment } from '../auth/contracts';

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), identity: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query: mocks.query, transaction: mocks.transaction }) }));
vi.mock('./identities', () => ({ createAdminIdentities: () => ({ lookup: mocks.identity }) }));
const env = { DATABASE_URL: 'postgresql://unused.invalid/test', CLERK_SECRET_KEY: 'test_only' } as AuthBindings;
function auth(roles: AccessAssignment['roles'] = ['SYSTEM_ADMIN']): AuthDependencies {
  return { verify: vi.fn(async () => ({ clerkUserId: 'user_verified', sessionId: 's', primaryEmail: { address: 'test@utm.my', verified: true } })),
    access: { find: vi.fn(async (): Promise<AccessAssignment> => ({ clerkUserId: 'user_verified', appRole: roles![0]!, roles, accessStatus: 'ACTIVE' })), initializeStudent: vi.fn() } };
}
const request = (path: string, method = 'GET', body?: object) => new Request('https://test.invalid/api/admin/' + path, {
  method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', 'X-Actor': 'user_spoof' }, ...(body ? { body: JSON.stringify(body) } : {}),
});
describe('Neon academic factory and existing admin dispatch', () => {
  beforeEach(() => {
    mocks.query.mockReset(); mocks.transaction.mockReset(); mocks.identity.mockReset();
    mocks.query.mockImplementation(async (text: string) => text.includes('FROM public.faculty') || text.includes('INSERT INTO public.faculty')
      ? [{ facultyId: 7, facultyCode: 'TEST', facultyName: 'Test faculty', isActive: true }] : []);
    mocks.transaction.mockImplementation(async (statements: Promise<unknown>[]) => Promise.all(statements));
  });
  it('routes academic reads before the existing admin catchall without Clerk lookups', async () => {
    const response = await createAdminHandler(env, auth())(request('academic-setup/faculties'));
    expect(response?.status).toBe(200);
    expect(await response!.json()).toEqual({ data: [{ facultyId: 7, facultyCode: 'TEST', facultyName: 'Test faculty', isActive: true }] });
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it('factory submits bound audited writes using Neon transaction and verified actor', async () => {
    const response = await createAdminHandler(env, auth())(request('academic-setup/faculties', 'POST', { facultyCode: 'TEST', facultyName: 'Test faculty', reason: '  Reviewed  ' }));
    expect(response?.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0]).toEqual(["SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)", ['user_verified', 'Reviewed']]);
    expect(mocks.query.mock.calls[1]![1]).toEqual(['TEST', 'Test faculty']);
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it('rejects non-admin roles and suspended accounts before SQL', async () => {
    for (const roles of [['STUDENT'], ['COORDINATOR']] as const) {
      expect((await createAdminHandler(env, auth([...roles]))(request('academic-setup/faculties')))?.status).toBe(403);
    }
    const dependencies = auth();
    vi.mocked(dependencies.access.find).mockResolvedValue({ clerkUserId: 'user_verified', appRole: 'SYSTEM_ADMIN', roles: ['SYSTEM_ADMIN'], accessStatus: 'SUSPENDED' });
    expect((await createAdminHandler(env, dependencies)(request('academic-setup/faculties')))?.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('keeps old admin routing and unknown academic responses compatible', async () => {
    const handler = createAdminHandler(env, auth());
    expect((await handler(request('unknown')))?.status).toBe(404);
    expect((await handler(request('academic-setup/unknown')))?.status).toBe(404);
    expect((await handler(request('academic-setup/faculties', 'DELETE')))?.status).toBe(405);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('exports the uncached SQL reader factory and sanitizes driver failures through the real route', async () => {
    expect(createAcademicRepository(env.DATABASE_URL)).toHaveProperty('listScopes');
    mocks.query.mockRejectedValue(new Error('secret database SQL'));
    const response = await createAdminHandler(env, auth())(request('academic-setup/faculties'));
    expect(response?.status).toBe(503);
    expect(await response!.text()).not.toContain('secret');
  });
});
