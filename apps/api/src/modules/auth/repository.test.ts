import { describe, expect, it, vi } from 'vitest';
import { createAccessRepository } from './repository';
describe('access persistence boundary', () => {
  it('inserts only STUDENT/ACTIVE and returns persisted assignment', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { clerk_user_id: 'user_test', app_role: 'STUDENT', roles: ['STUDENT'], access_status: 'ACTIVE' },
    ]);
    const repo = createAccessRepository(query);
    expect(await repo.initializeStudent('user_test')).toMatchObject({ clerkUserId: 'user_test', appRole: 'STUDENT' });
    expect(query.mock.calls[0]).toEqual([
      "INSERT INTO user_access_assignment (clerk_user_id, app_role, access_status) VALUES ($1, 'STUDENT', 'ACTIVE') ON CONFLICT (clerk_user_id) DO NOTHING", ['user_test'],
    ]);
  });
  it('returns existing suspension/role rather than claiming a new active student', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { clerk_user_id: 'user_test', app_role: 'COORDINATOR', roles: ['COORDINATOR'], access_status: 'SUSPENDED' },
    ]);
    expect(await createAccessRepository(query).initializeStudent('user_test')).toMatchObject({ appRole: 'COORDINATOR', accessStatus: 'SUSPENDED' });
  });
  it('passes identity as a query parameter', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const id = "user_x'; DROP TABLE user_access_assignment; --";
    expect(await createAccessRepository(query).find(id)).toBeNull();
    expect(query.mock.calls[0]?.[0]).not.toContain(id);
    expect(query.mock.calls[0]?.[1]).toEqual([id]);
  });
  it('fails closed on DB outage, missing insert result, and invalid stored role', async () => {
    await expect(createAccessRepository(async () => { throw new Error('offline'); }).find('a')).rejects.toThrow();
    await expect(createAccessRepository(async () => []).initializeStudent('a')).rejects.toThrow();
    await expect(createAccessRepository(async () => [{ clerk_user_id: 'a', app_role: 'OWNER', access_status: 'ACTIVE' }]).find('a')).rejects.toThrow();
  });
});
