import { beforeEach, expect, it, vi } from 'vitest';
const { getUserList } = vi.hoisted(() => ({ getUserList: vi.fn() }));
vi.mock('@clerk/backend', () => ({ createClerkClient: () => ({ users: { getUserList } }) }));
import { createAdminIdentities } from './identities';
beforeEach(() => getUserList.mockReset());
it('never performs an instance-wide provider lookup for an empty identity page', async () => {
  const identities = createAdminIdentities('TEST_ONLY');
  expect(await identities.lookup([])).toEqual(new Map());
  expect(await identities.lookup(['__MIGRATION_0004__'])).toEqual(new Map());
  expect(getUserList).not.toHaveBeenCalled();
});
it('batches only requested IDs and projects minimal primary identity details', async () => {
  getUserList.mockResolvedValue({ data: [{ id: 'user_fixture', firstName: 'Fictional', lastName: 'Account', username: null, primaryEmailAddressId: 'email_primary', emailAddresses: [{ id: 'email_other', emailAddress: 'other@example.invalid', verification: { status: 'verified' } }, { id: 'email_primary', emailAddress: 'primary@example.invalid', verification: { status: 'unverified' } }], privateMetadata: { confidential: 'MUST_NOT_ESCAPE' } }], totalCount: 1 });
  const result = await createAdminIdentities('TEST_ONLY').lookup(['user_fixture', 'user_fixture']);
  expect(getUserList).toHaveBeenCalledExactlyOnceWith({ userId: ['user_fixture'], limit: 100 });
  expect(result.get('user_fixture')).toEqual({ state: 'available', name: 'Fictional Account', email: 'primary@example.invalid', emailVerified: false });
  expect(JSON.stringify([...result.values()])).not.toContain('MUST_NOT_ESCAPE');
});
it('reports bounded identity search totals so routes can reject truncation', async () => {
  getUserList.mockResolvedValue({ data: [{ id: 'user_fixture' }], totalCount: 101 });
  expect(await createAdminIdentities('TEST_ONLY').search('Fictional')).toEqual({ ids: ['user_fixture'], total: 101 });
  expect(getUserList).toHaveBeenCalledExactlyOnceWith({ query: 'Fictional', limit: 100 });
});
it('rejects oversized identity batches before contacting the provider', async () => {
  await expect(createAdminIdentities('TEST_ONLY').lookup(Array.from({ length: 101 }, (_, i) => 'user_fixture_' + i))).rejects.toThrow('bounded page');
  expect(getUserList).not.toHaveBeenCalled();
});
