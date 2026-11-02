import { describe, expect, it, vi } from 'vitest';
import { authorize } from '../../middleware/auth';
import type { AccessAssignment, AuthDependencies, VerifiedIdentity } from '../auth/contracts';
import type { AdminInvitation } from '../../../../../packages/shared/src/admin/admin';
import { AdminMutationError } from './errors';
import { createInvitationRedeemerFor, type RedemptionRepository } from './redemption';

const date = '2026-11-01T10:00:00.000Z';
const invitation = (overrides: Partial<AdminInvitation> = {}): AdminInvitation => ({ id: '2f1c0f0e-0000-4000-8000-000000000001', email: 'coord@utm.my', roles: ['COORDINATOR'],
  status: 'PENDING', invitedBy: 'user_admin', reason: 'Join', createdAt: date, expiresAt: '2026-11-08T10:00:00.000Z', acceptedAt: null, ...overrides });

function setup(options: { invitation?: AdminInvitation | null; email?: { address: string; verified: boolean } | null; existing?: AccessAssignment; createError?: unknown } = {}) {
  const records = new Map<string, AccessAssignment>();
  if (options.existing) records.set(options.existing.clerkUserId, options.existing);
  const identity: VerifiedIdentity = { clerkUserId: 'user_new', sessionId: 'sess', primaryEmail: options.email === undefined ? { address: 'coord@utm.my', verified: true } : options.email };
  const repository: RedemptionRepository = {
    findPendingInvitationByEmail: vi.fn(async () => options.invitation === undefined ? invitation() : options.invitation),
    createAccount: vi.fn(async (clerkUserId: string, roles) => {
      if (options.createError) throw options.createError;
      records.set(clerkUserId, { clerkUserId, appRole: 'STUDENT', roles: [...roles], accessStatus: 'ACTIVE' });
      return {} as never;
    }),
  };
  const initializeStudent = vi.fn(async (id: string) => { const row: AccessAssignment = { clerkUserId: id, appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' }; records.set(id, row); return row; });
  const access = { find: vi.fn(async (id: string) => records.get(id) ?? null), initializeStudent };
  const deps: AuthDependencies = { verify: vi.fn(async () => identity), access, invitations: createInvitationRedeemerFor(repository, access) };
  return { deps, repository, identity, records, initializeStudent };
}

describe('invitation redemption at first sign-in', () => {
  it('redeems a pending invitation for the verified email with the user as their own actor', async () => {
    const f = setup();
    const me = await authorize(new Request('https://api.test/api/me/initialize', { method: 'POST' }), f.deps, { initialize: true });
    expect(me.roles).toEqual(['COORDINATOR']); expect(me.landingPath).toBe('/coordinator');
    expect(f.repository.createAccount).toHaveBeenCalledWith('user_new', ['COORDINATOR'], 'user_new', `Invitation ${invitation().id} accepted`, { invitationId: invitation().id });
    expect(f.initializeStudent).not.toHaveBeenCalled();
  });
  it('redeems an invited gmail.com SYSTEM_ADMIN without student registration', async () => {
    const f = setup({ invitation: invitation({ email: 'friend@gmail.com', roles: ['SYSTEM_ADMIN'] }), email: { address: 'Friend@Gmail.com', verified: true } });
    const me = await authorize(new Request('https://api.test/api/me/initialize', { method: 'POST' }), f.deps, { initialize: true });
    expect(me.roles).toEqual(['SYSTEM_ADMIN']); expect(me.availableRoles).toEqual(['SYSTEM_ADMIN']); expect(me.landingPath).toBe('/admin');
    expect(f.initializeStudent).not.toHaveBeenCalled();
  });
  it('redeems an invited graduate.utm.my SYSTEM_ADMIN with only the invited role and no student account', async () => {
    const f = setup({ invitation: invitation({ email: 'friend@graduate.utm.my', roles: ['SYSTEM_ADMIN'] }), email: { address: 'friend@graduate.utm.my', verified: true } });
    const me = await authorize(new Request('https://api.test/api/me/initialize', { method: 'POST' }), f.deps, { initialize: true });
    expect(me.roles).toEqual(['SYSTEM_ADMIN']); expect(f.initializeStudent).not.toHaveBeenCalled();
    await authorize(new Request('https://api.test/api/me/initialize', { method: 'POST' }), f.deps, { initialize: true });
    expect(f.repository.createAccount).toHaveBeenCalledTimes(1);
  });
  it('denies an uninvited gmail.com user (no self-signup)', async () => {
    const f = setup({ invitation: null, email: { address: 'stranger@gmail.com', verified: true } });
    await expect(authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true })).rejects.toMatchObject({ code: 'EMAIL_DOMAIN_DENIED' });
    expect(f.repository.createAccount).not.toHaveBeenCalled(); expect(f.initializeStudent).not.toHaveBeenCalled();
  });
  it('does not let a gmail.com invitation grant COORDINATOR or STUDENT', async () => {
    for (const roles of [['COORDINATOR'], ['STUDENT']] as const) {
      const f = setup({ invitation: invitation({ email: 'friend@gmail.com', roles: [...roles] }), email: { address: 'friend@gmail.com', verified: true } });
      await expect(authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true })).rejects.toMatchObject({ code: 'EMAIL_DOMAIN_DENIED' });
      expect(f.repository.createAccount).not.toHaveBeenCalled();
    }
  });
  it('matches the verified primary email exactly after lower-casing', async () => {
    const f = setup({ email: { address: 'Coord@UTM.my', verified: true } });
    await authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true });
    expect(f.repository.findPendingInvitationByEmail).toHaveBeenCalledWith('coord@utm.my');
  });
  it('falls back to student self-registration when roles are ineligible for the verified email', async () => {
    const f = setup({ invitation: invitation({ roles: ['COORDINATOR'] }), email: { address: 'student@graduate.utm.my', verified: true } });
    const me = await authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true });
    expect(f.repository.createAccount).not.toHaveBeenCalled(); expect(f.initializeStudent).toHaveBeenCalledTimes(1);
    expect(me.roles).toEqual(['STUDENT']);
  });
  it('does not redeem for an unverified email and falls back to the existing rejection', async () => {
    const f = setup({ email: { address: 'coord@utm.my', verified: false } });
    await expect(authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true })).rejects.toMatchObject({ status: 403 });
    expect(f.repository.findPendingInvitationByEmail).not.toHaveBeenCalled(); expect(f.repository.createAccount).not.toHaveBeenCalled();
  });
  it('falls back when no pending (or only expired) invitation exists', async () => {
    const f = setup({ invitation: null, email: { address: 'student@graduate.utm.my', verified: true } });
    const me = await authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true });
    expect(me.roles).toEqual(['STUDENT']); expect(f.repository.createAccount).not.toHaveBeenCalled();
  });
  it('treats an invitation that lapses during redemption as not redeemable', async () => {
    const f = setup({ email: { address: 'student@graduate.utm.my', verified: true }, invitation: invitation({ email: 'student@graduate.utm.my', roles: ['STUDENT'] }), createError: new AdminMutationError('INVITATION_NOT_PENDING') });
    const me = await authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true });
    expect(me.roles).toEqual(['STUDENT']); expect(f.initializeStudent).toHaveBeenCalledTimes(1);
  });
  it('never grants roles to an existing account', async () => {
    const f = setup({ existing: { clerkUserId: 'user_new', appRole: 'STUDENT', roles: ['STUDENT'], accessStatus: 'ACTIVE' }, email: { address: 'coord@utm.my', verified: true } });
    await authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true }).catch(() => undefined);
    expect(f.repository.findPendingInvitationByEmail).not.toHaveBeenCalled(); expect(f.repository.createAccount).not.toHaveBeenCalled();
  });
  it('only redeems on explicit initialization, not on a plain read', async () => {
    const f = setup();
    await expect(authorize(new Request('https://api.test/api/me'), f.deps)).rejects.toMatchObject({ code: 'ACCESS_NOT_ASSIGNED' });
    expect(f.repository.findPendingInvitationByEmail).not.toHaveBeenCalled();
  });
  it('lets infrastructure failures surface instead of silently self-registering', async () => {
    const f = setup({ createError: new Error('database down') });
    await expect(authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true })).rejects.toThrow('database down');
    expect(f.initializeStudent).not.toHaveBeenCalled();
  });
  it('behaves exactly like before when no redeemer is configured', async () => {
    const f = setup({ email: { address: 'student@graduate.utm.my', verified: true } });
    delete f.deps.invitations;
    const me = await authorize(new Request('https://api.test/x', { method: 'POST' }), f.deps, { initialize: true });
    expect(me.roles).toEqual(['STUDENT']);
  });
});
