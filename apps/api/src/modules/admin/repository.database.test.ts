import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAdminRepository, type AdminStatement } from './repository';
import type { AdminRepository } from './contracts';
import { createInvitationRedeemerFor } from './redemption';

// EXPLICIT TEST CONNECTION ONLY (disposable database already migrated through 0006). Never falls back to DATABASE_URL.
// The neon HTTP driver cannot talk to plain PostgreSQL, so this test runs the repository's exact statements through `pg`
// with the same semantics as sql.transaction (all statements atomically, rolled back on error). Every test runs inside an
// outer transaction that is rolled back, with each repository transaction wrapped in a SAVEPOINT, so nothing is committed.
const databaseUrl = process.env.ADMIN_TEST_DATABASE_URL;
interface PgClient { connect(): Promise<void>; end(): Promise<void>; query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }

describe.skipIf(!databaseUrl)('admin user management repository on PostgreSQL (disposable database, rolled back)', () => {
  let client: PgClient;
  let repository: AdminRepository;
  let n = 0;
  const id = (label: string) => `user_${label}_${Date.now().toString(36)}_${n++}`;
  const settings = async () => (await client.query("SELECT current_setting('app.access_actor',true) AS actor, current_setting('app.access_reason',true) AS reason")).rows[0]!;

  beforeAll(async () => {
    const moduleName = 'pg';
    const pg = await import(/* @vite-ignore */ moduleName) as { default?: { Client: new (config: unknown) => PgClient }; Client?: new (config: unknown) => PgClient };
    const Client = pg.Client ?? pg.default!.Client;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const version = (await client.query("SELECT to_regclass('public.admin_user_invitation') AS invitations")).rows[0]!;
    if (!version.invitations) throw new Error('The test database must be migrated through 0006.');
  });
  afterAll(async () => { await client?.end(); });
  beforeEach(async () => {
    await client.query('BEGIN');
    let savepoints = 0;
    repository = createAdminRepository(
      async (text, values) => (await client.query(text, values)).rows,
      async (statements: AdminStatement[]) => {
        const name = 'repo_tx_' + savepoints++;
        await client.query('SAVEPOINT ' + name);
        try {
          const results: Record<string, unknown>[][] = [];
          for (const statement of statements) results.push((await client.query(statement.text, statement.values)).rows);
          await client.query('RELEASE SAVEPOINT ' + name);
          // sql.transaction would end the transaction (clearing is_local settings); emulate that so a missing context is detectable.
          await client.query("SELECT set_config('app.access_actor','',true), set_config('app.access_reason','',true)");
          return results;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT ' + name);
          throw error;
        }
      },
    );
  });
  afterEach(async () => { await client.query('ROLLBACK'); });

  const otherActiveAdmins = async () => Number((await client.query(
    `SELECT count(*) AS total FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id)
     WHERE r.app_role='SYSTEM_ADMIN' AND a.access_status='ACTIVE'`)).rows[0]!.total);

  it('creates a staff account without an implicit STUDENT grant and audits grants and the seed removal', async () => {
    const actor = id('admin');
    const target = id('coord');
    const account = await repository.createAccount(target, ['COORDINATOR'], actor, 'Appoint coordinator');
    expect(account.roles).toEqual(['COORDINATOR']);
    expect(account.memberships.map(m => m.role)).toEqual(['COORDINATOR']);
    expect(account.memberships[0]).toMatchObject({ source: 'OPERATOR', emailPolicy: 'ROLE_DOMAIN', protectedOwner: false });
    const audit = (await client.query(
      `SELECT app_role, action, performed_by_clerk_user_id AS actor, reason FROM public.user_role_audit_log WHERE access_assignment_id=$1 ORDER BY user_role_audit_log_id`,
      [account.accountId])).rows;
    expect(audit.map(row => `${row.app_role}:${row.action}`)).toEqual(['STUDENT:GRANT', 'COORDINATOR:GRANT', 'STUDENT:REVOKE']);
    expect(audit[1]).toMatchObject({ actor, reason: 'Appoint coordinator' });
    expect(audit[2]).toMatchObject({ actor, reason: 'Appoint coordinator' });
    expect(await settings()).toMatchObject({ actor: '', reason: '' });
  });

  it('keeps the seeded STUDENT membership for student and student-plus-staff accounts', async () => {
    const student = await repository.createAccount(id('student'), ['STUDENT'], id('admin'), 'Add student');
    expect(student.memberships.map(m => m.role)).toEqual(['STUDENT']);
    const both = await repository.createAccount(id('both'), ['STUDENT', 'COORDINATOR'], id('admin'), 'Add both');
    expect(both.memberships.map(m => m.role)).toEqual(['COORDINATOR', 'STUDENT']);
  });

  it('rejects a duplicate account without side effects', async () => {
    const target = id('dup');
    await repository.createAccount(target, ['STUDENT'], id('admin'), 'First');
    await expect(repository.createAccount(target, ['COORDINATOR'], id('admin'), 'Second')).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS', status: 409 });
    expect((await client.query('SELECT count(*) AS total FROM public.user_access_assignment WHERE clerk_user_id=$1', [target])).rows[0]!.total).toBe('1');
  });

  it('grants and revokes roles with audit rows and maps duplicate/missing cases', async () => {
    const actor = id('admin');
    const account = await repository.createAccount(id('person'), ['STUDENT'], actor, 'Add');
    const granted = await repository.grantRole(account.accountId, 'COORDINATOR', actor, 'Promote');
    expect(granted.roles).toEqual(['COORDINATOR', 'STUDENT']);
    await expect(repository.grantRole(account.accountId, 'COORDINATOR', actor, 'Again')).rejects.toMatchObject({ code: 'ROLE_ALREADY_ASSIGNED' });
    const revoked = await repository.revokeRole(account.accountId, 'COORDINATOR', actor, 'Demote');
    expect(revoked.roles).toEqual(['STUDENT']);
    await expect(repository.revokeRole(account.accountId, 'COORDINATOR', actor, 'Again')).rejects.toMatchObject({ code: 'ROLE_NOT_ASSIGNED', status: 404 });
    await expect(repository.grantRole(2_000_000_000, 'COORDINATOR', actor, 'Nobody')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    const reasons = (await client.query(
      `SELECT action, reason FROM public.user_role_audit_log WHERE access_assignment_id=$1 AND app_role='COORDINATOR' ORDER BY user_role_audit_log_id`, [account.accountId])).rows;
    expect(reasons).toEqual([{ action: 'GRANT', reason: 'Promote' }, { action: 'REVOKE', reason: 'Demote' }]);
  });

  it('suspends and reactivates with an access-status audit row, and blocks self-suspension and self admin revoke', async () => {
    const actor = id('admin');
    const target = await repository.createAccount(id('target'), ['STUDENT'], actor, 'Add');
    const suspended = await repository.setAccessStatus(target.accountId, 'SUSPENDED', actor, 'Misconduct');
    expect(suspended.accessStatus).toBe('SUSPENDED');
    expect((await repository.setAccessStatus(target.accountId, 'ACTIVE', actor, 'Resolved')).accessStatus).toBe('ACTIVE');
    const audit = (await client.query(
      `SELECT change_type, old_value, new_value, performed_by_clerk_user_id AS actor, reason FROM public.user_access_audit_log WHERE access_assignment_id=$1 ORDER BY access_audit_id`, [target.accountId])).rows;
    expect(audit).toEqual([
      { change_type: 'ACCESS_STATUS_CHANGE', old_value: 'ACTIVE', new_value: 'SUSPENDED', actor, reason: 'Misconduct' },
      { change_type: 'ACCESS_STATUS_CHANGE', old_value: 'SUSPENDED', new_value: 'ACTIVE', actor, reason: 'Resolved' },
    ]);

    const selfId = id('self');
    const self = await repository.createAccount(selfId, ['SYSTEM_ADMIN'], id('seed'), 'Seed admin');
    await expect(repository.setAccessStatus(self.accountId, 'SUSPENDED', selfId, 'Oops')).rejects.toMatchObject({ code: 'SELF_LOCKOUT' });
    await expect(repository.revokeRole(self.accountId, 'SYSTEM_ADMIN', selfId, 'Oops')).rejects.toMatchObject({ code: 'SELF_LOCKOUT' });
    expect((await repository.account(self.accountId))?.roles).toEqual(['SYSTEM_ADMIN']);
  });

  it('refuses to remove or suspend the last active System Administrator and allows it once another exists', async () => {
    const existing = await otherActiveAdmins();
    if (existing > 0) return; // Only deterministic on a database without pre-existing administrators.
    const actor = id('operator');
    const only = await repository.createAccount(id('onlyadmin'), ['SYSTEM_ADMIN', 'STUDENT'], actor, 'Seed admin');
    await expect(repository.revokeRole(only.accountId, 'SYSTEM_ADMIN', actor, 'Remove')).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
    await expect(repository.setAccessStatus(only.accountId, 'SUSPENDED', actor, 'Suspend')).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
    expect(await repository.account(only.accountId)).toMatchObject({ accessStatus: 'ACTIVE', roles: ['STUDENT', 'SYSTEM_ADMIN'] });
    await repository.createAccount(id('secondadmin'), ['SYSTEM_ADMIN'], actor, 'Second admin');
    expect((await repository.revokeRole(only.accountId, 'SYSTEM_ADMIN', actor, 'Remove')).roles).toEqual(['STUDENT']);
  });

  it('protects the protected owner from suspension and role removal', async () => {
    const ownerId = id('owner');
    const owner = await repository.createAccount(ownerId, ['SYSTEM_ADMIN', 'STUDENT'], id('seed'), 'Seed');
    await client.query("SELECT set_config('app.access_actor','user_bootstrap',true), set_config('app.access_reason','Bootstrap owner',true), set_config('app.protected_owner_bootstrap','VERIFIED_CLERK_ID',true)");
    await client.query("UPDATE public.user_role_assignment SET protected_owner=true WHERE access_assignment_id=$1 AND app_role='SYSTEM_ADMIN'", [owner.accountId]);
    await client.query("SELECT set_config('app.protected_owner_bootstrap','',true)");
    await expect(repository.setAccessStatus(owner.accountId, 'SUSPENDED', id('admin'), 'No')).rejects.toMatchObject({ code: 'PROTECTED_OWNER' });
    await expect(repository.revokeRole(owner.accountId, 'SYSTEM_ADMIN', id('admin'), 'No')).rejects.toMatchObject({ code: 'PROTECTED_OWNER' });
  });

  it('runs the invitation lifecycle: create, duplicate, attach once, list, revoke, then re-invite', async () => {
    const actor = id('admin');
    const email = `${id('invitee')}@utm.my`;
    const expires = new Date(Date.now() + 7 * 86_400_000);
    const invitation = await repository.createInvitation(email, ['COORDINATOR'], actor, 'Join us', expires);
    expect(invitation).toMatchObject({ email, status: 'PENDING', roles: ['COORDINATOR'], invitedBy: actor, acceptedAt: null });
    await expect(repository.createInvitation(email, ['STUDENT'], actor, 'Again', expires)).rejects.toMatchObject({ code: 'INVITATION_EXISTS' });
    const attached = await repository.attachClerkInvitation(invitation.id, 'inv_clerk_1', actor);
    expect(attached.id).toBe(invitation.id);
    await expect(repository.attachClerkInvitation(invitation.id, 'inv_clerk_2', actor)).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
    const listed = await repository.listInvitations({ page: 1, status: 'PENDING' });
    expect(listed.items.some(item => item.id === invitation.id)).toBe(true);
    const revoked = await repository.revokeInvitation(invitation.id, actor);
    expect(revoked.status).toBe('REVOKED');
    await expect(repository.revokeInvitation(invitation.id, actor)).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
    await expect(repository.revokeInvitation('00000000-0000-4000-8000-000000000000', actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await repository.createInvitation(email, ['COORDINATOR'], actor, 'Re-invite', expires)).status).toBe('PENDING');
  });

  it('expires lapsed invitations (before create, in bulk, and on read) and refuses to accept them', async () => {
    const actor = id('admin');
    const email = `${id('late')}@utm.my`;
    const invitation = await repository.createInvitation(email, ['COORDINATOR'], actor, 'Join', new Date(Date.now() + 86_400_000));
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    // Simulate time passing by rewinding the row's window with the guard trigger disabled for this fixture only.
    await client.query('ALTER TABLE public.admin_user_invitation DISABLE TRIGGER admin_user_invitation_guard');
    await client.query("UPDATE public.admin_user_invitation SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE invitation_id=$1", [invitation.id]);
    await client.query('ALTER TABLE public.admin_user_invitation ENABLE TRIGGER admin_user_invitation_guard');
    expect((await repository.listInvitations({ page: 1, status: 'EXPIRED' })).items.map(item => item.id)).toContain(invitation.id);
    const account = await repository.createAccount(id('late_user'), ['COORDINATOR'], actor, 'Add');
    await expect(repository.acceptInvitation(invitation.id, account.accountId, actor)).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
    await expect(repository.createAccount(id('late_redeem'), ['COORDINATOR'], actor, 'Redeem', { invitationId: invitation.id })).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
    const fresh = await repository.createInvitation(email, ['COORDINATOR'], actor, 'Re-invite', new Date(Date.now() + 86_400_000));
    expect(fresh.status).toBe('PENDING');
    expect(await repository.expireInvitations(actor)).toBe(0);
  });

  it('redeems an invitation atomically: account, roles and acceptance succeed or fail together', async () => {
    const actor = id('admin');
    const invitee = id('invitee');
    const invitation = await repository.createInvitation(`${invitee}@utm.my`, ['COORDINATOR'], actor, 'Join', new Date(Date.now() + 86_400_000));
    await expect(repository.createAccount(invitee, ['SYSTEM_ADMIN'], invitee, 'Escalate', { invitationId: invitation.id })).rejects.toMatchObject({ code: 'ROLE_NOT_ELIGIBLE' });
    expect((await client.query('SELECT count(*) AS total FROM public.user_access_assignment WHERE clerk_user_id=$1', [invitee])).rows[0]!.total).toBe('0');
    const account = await repository.createAccount(invitee, ['COORDINATOR'], invitee, 'Invitation redeemed', { invitationId: invitation.id });
    expect(account.roles).toEqual(['COORDINATOR']);
    const stored = (await client.query('SELECT status, accepted_access_assignment_id AS account FROM public.admin_user_invitation WHERE invitation_id=$1', [invitation.id])).rows[0]!;
    expect(stored).toEqual({ status: 'ACCEPTED', account: account.accountId });
    await expect(repository.revokeInvitation(invitation.id, actor)).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
  });

  it('refuses to remove the last remaining role of an account (suspend instead) and writes nothing', async () => {
    const actor = id('admin');
    const account = await repository.createAccount(id('solo'), ['COORDINATOR'], actor, 'Add');
    await expect(repository.revokeRole(account.accountId, 'COORDINATOR', actor, 'Remove')).rejects.toMatchObject({ code: 'LAST_ROLE', status: 409 });
    expect((await repository.account(account.accountId))?.roles).toEqual(['COORDINATOR']);
  });

  it('finds only an unexpired PENDING invitation by exact email and exposes the Clerk reference separately', async () => {
    const actor = id('admin');
    const email = `${id('finder')}@utm.my`;
    expect(await repository.findPendingInvitationByEmail(email)).toBeNull();
    const invitation = await repository.createInvitation(email, ['COORDINATOR'], actor, 'Join', new Date(Date.now() + 86_400_000));
    expect((await repository.findPendingInvitationByEmail(email.toUpperCase()))?.id).toBe(invitation.id);
    expect(await repository.clerkInvitationIdOf(invitation.id)).toBeNull();
    await repository.attachClerkInvitation(invitation.id, 'inv_clerk_9', actor);
    expect(await repository.clerkInvitationIdOf(invitation.id)).toBe('inv_clerk_9');
    await repository.revokeInvitation(invitation.id, actor);
    expect(await repository.findPendingInvitationByEmail(email)).toBeNull();
  });

  it('first sign-in redemption creates the invited account once, and an ineligible or repeated sign-in grants nothing', async () => {
    const actor = id('admin');
    const invitee = id('invitee');
    const email = `${invitee}@utm.my`;
    await repository.createInvitation(email, ['COORDINATOR'], actor, 'Join', new Date(Date.now() + 86_400_000));
    const redeemer = createInvitationRedeemerFor(repository, { find: async clerkUserId => {
      const rows = (await client.query(
        "SELECT a.access_status, array_agg(r.app_role ORDER BY r.app_role) AS roles FROM public.user_access_assignment a JOIN public.user_role_assignment r USING(access_assignment_id) WHERE a.clerk_user_id=$1 GROUP BY a.access_status", [clerkUserId])).rows;
      return rows[0] ? { clerkUserId, appRole: 'STUDENT' as const, accessStatus: rows[0].access_status as 'ACTIVE' | 'SUSPENDED', roles: rows[0].roles as ('STUDENT' | 'COORDINATOR' | 'SYSTEM_ADMIN')[] } : null;
    } });
    const unverified = await redeemer.redeem({ clerkUserId: invitee, sessionId: 's', primaryEmail: { address: email, verified: false } });
    expect(unverified).toBeNull();
    const wrongDomain = await redeemer.redeem({ clerkUserId: invitee, sessionId: 's', primaryEmail: { address: email.replace('@utm.my', '@gmail.com'), verified: true } });
    expect(wrongDomain).toBeNull();
    const redeemed = await redeemer.redeem({ clerkUserId: invitee, sessionId: 's', primaryEmail: { address: email, verified: true } });
    expect(redeemed).toMatchObject({ clerkUserId: invitee, roles: ['COORDINATOR'] });
    const stored = (await client.query("SELECT status FROM public.admin_user_invitation WHERE email=$1", [email])).rows[0]!;
    expect(stored.status).toBe('ACCEPTED');
    const audit = (await client.query("SELECT performed_by_clerk_user_id AS actor, reason FROM public.user_role_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id) WHERE a.clerk_user_id=$1 AND l.app_role='COORDINATOR'", [invitee])).rows;
    expect(audit).toEqual([{ actor: invitee, reason: expect.stringMatching(/^Invitation [0-9a-f-]{36} accepted$/) }]);
    expect(await redeemer.redeem({ clerkUserId: invitee, sessionId: 's', primaryEmail: { address: email, verified: true } })).toBeNull();
  });

  it('never leaks database text for an unexpected failure', async () => {
    const account = await repository.createAccount(id('badrole'), ['STUDENT'], id('admin'), 'Add');
    await expect(repository.grantRole(account.accountId, 'NOT_A_ROLE' as never, id('admin'), 'Bad')).rejects.toMatchObject({ code: 'MUTATION_FAILED', status: 500 });
  });
});
