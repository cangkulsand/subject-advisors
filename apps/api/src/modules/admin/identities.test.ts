import { beforeEach, expect, it, vi } from 'vitest';
const { getUserList, createInvitation, revokeInvitation } = vi.hoisted(() => ({ getUserList: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn() }));
vi.mock('@clerk/backend', () => ({ createClerkClient: () => ({ users: { getUserList }, invitations: { createInvitation, revokeInvitation } }) }));
import { createAdminIdentities } from './identities';
beforeEach(() => { getUserList.mockReset(); createInvitation.mockReset(); revokeInvitation.mockReset(); });
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

const user = (id: string, primary: string, verified: boolean, others: string[] = []) => ({ id, primaryEmailAddressId: 'p_' + id,
  emailAddresses: [...others.map((address, i) => ({ id: 'o' + i + id, emailAddress: address, verification: { status: 'verified' } })), { id: 'p_' + id, emailAddress: primary, verification: { status: verified ? 'verified' : 'unverified' } }],
  privateMetadata: { secret: 'MUST_NOT_ESCAPE' } });
it('findByEmail matches only the exact primary email and projects no metadata', async () => {
  getUserList.mockResolvedValue({ data: [user('user_secondary', 'other@utm.my', true, ['wanted@utm.my']), user('user_primary', 'Wanted@utm.my', true)], totalCount: 2 });
  const found = await createAdminIdentities('TEST_ONLY').findByEmail(' WANTED@utm.my ');
  expect(getUserList).toHaveBeenCalledExactlyOnceWith({ emailAddress: ['wanted@utm.my'], limit: 10 });
  expect(found).toEqual({ clerkUserId: 'user_primary', verifiedEmail: 'wanted@utm.my', emailVerified: true });
  expect(JSON.stringify(found)).not.toContain('MUST_NOT_ESCAPE');
});
it('findByEmail reports unverified status and returns null for no or ambiguous matches', async () => {
  getUserList.mockResolvedValueOnce({ data: [user('user_a', 'a@utm.my', false)], totalCount: 1 });
  expect(await createAdminIdentities('TEST_ONLY').findByEmail('a@utm.my')).toMatchObject({ emailVerified: false });
  getUserList.mockResolvedValueOnce({ data: [], totalCount: 0 });
  expect(await createAdminIdentities('TEST_ONLY').findByEmail('a@utm.my')).toBeNull();
  getUserList.mockResolvedValueOnce({ data: [user('user_a', 'a@utm.my', true), user('user_b', 'a@utm.my', true)], totalCount: 2 });
  expect(await createAdminIdentities('TEST_ONLY').findByEmail('a@utm.my')).toBeNull();
});
it('creates and revokes Clerk invitations without sending metadata', async () => {
  createInvitation.mockResolvedValue({ id: 'inv_1', publicMetadata: { leak: 'MUST_NOT_ESCAPE' } });
  const identities = createAdminIdentities('TEST_ONLY');
  const result = await identities.createInvitation('New@UTM.my', 'https://app.invalid/sign-up', 7);
  expect(result).toEqual({ clerkInvitationId: 'inv_1' });
  expect(createInvitation).toHaveBeenCalledExactlyOnceWith({ emailAddress: 'new@utm.my', ignoreExisting: false, notify: true, redirectUrl: 'https://app.invalid/sign-up', expiresInDays: 7 });
  await identities.createInvitation('plain@utm.my');
  expect(createInvitation.mock.calls[1]![0]).toEqual({ emailAddress: 'plain@utm.my', ignoreExisting: false, notify: true });
  await identities.revokeInvitation('inv_1');
  expect(revokeInvitation).toHaveBeenCalledExactlyOnceWith('inv_1');
});
