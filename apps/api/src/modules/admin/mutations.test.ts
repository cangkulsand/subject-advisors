import { describe, expect, it, vi } from 'vitest';
import { createAdminRepository, type AdminQuery, type AdminStatement } from './repository';
import { AdminMutationError, mapAdminDatabaseError } from './errors';
import { checkRoleEligibility } from './eligibility';

const date = '2026-11-01T10:00:00.000Z';
const accountRow = { accountId: 7, clerkUserId: 'user_target', accessStatus: 'ACTIVE', createdAt: date, updatedAt: date, roles: ['COORDINATOR'], protectedOwner: false };
const membership = { role: 'COORDINATOR', emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: false, reason: 'Because', grantedAt: date };
const invitationRow = { id: '2f1c0f0e-0000-4000-8000-000000000001', email: 'new@utm.my', roles: ['COORDINATOR'], status: 'PENDING', invitedBy: 'user_admin', reason: 'Join', createdAt: date, expiresAt: '2026-11-08T10:00:00.000Z', acceptedAt: null };

/** Fake transaction: an empty result per statement, with canned account detail rows as the last two. */
function harness(options: { fail?: unknown; rows?: (statements: AdminStatement[]) => Record<string, unknown>[][] } = {}) {
  const calls: AdminStatement[][] = [];
  const transaction = vi.fn(async (statements: AdminStatement[]) => {
    calls.push(statements);
    if (options.fail) throw options.fail;
    if (options.rows) return options.rows(statements);
    const results: Record<string, unknown>[][] = statements.map(() => []);
    results[results.length - 2] = [accountRow];
    results[results.length - 1] = [membership];
    return results;
  });
  const query = vi.fn<AdminQuery>(async () => []);
  return { repository: createAdminRepository(query, transaction), calls, transaction, query };
}
const sqlOf = (statements: AdminStatement[]) => statements.map(statement => statement.text.replace(/\s+/g, ' '));

describe('transaction sequencing', () => {
  it('sets the trusted audit context as the very first statement of every mutation', async () => {
    const { repository, calls } = harness();
    await repository.grantRole(7, 'COORDINATOR', 'user_admin', 'Needs access');
    await repository.revokeRole(7, 'COORDINATOR', 'user_admin', 'Left');
    await repository.setAccessStatus(7, 'SUSPENDED', 'user_admin', 'Policy');
    await repository.createAccount('user_target', ['COORDINATOR'], 'user_admin', 'Add');
    expect(calls).toHaveLength(4);
    for (const statements of calls) {
      expect(statements[0]!.text).toBe("SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)");
      expect(statements[0]!.values[0]).toBe('user_admin');
    }
    expect(calls[0]![0]!.values).toEqual(['user_admin', 'Needs access']);
  });

  it('grantRole guards the account, inserts an OPERATOR membership and reads the refreshed account in the same transaction', async () => {
    const { repository, calls, transaction, query } = harness();
    const result = await repository.grantRole(7, 'COORDINATOR', 'user_admin', 'Needs access');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    const sql = sqlOf(calls[0]!);
    expect(sql).toHaveLength(5);
    expect(sql[1]).toContain('ADMIN_GUARD:NOT_FOUND');
    expect(sql[2]).toMatch(/^INSERT INTO public\.user_role_assignment/);
    expect(sql[2]).toContain("'OPERATOR'");
    expect(calls[0]![2]!.values).toEqual([7, 'COORDINATOR', 'user_admin', 'Needs access']);
    expect(result.accountId).toBe(7);
    expect(result.memberships).toEqual([membership]);
  });

  it('revokeRole checks self-lockout only for SYSTEM_ADMIN and deletes the membership', async () => {
    const admin = harness();
    await admin.repository.revokeRole(7, 'SYSTEM_ADMIN', 'user_admin', 'Rotate');
    expect(sqlOf(admin.calls[0]!).some(text => text.includes('ADMIN_GUARD:SELF_LOCKOUT'))).toBe(true);
    const other = harness();
    await other.repository.revokeRole(7, 'COORDINATOR', 'user_admin', 'Left');
    const sql = sqlOf(other.calls[0]!);
    expect(sql.some(text => text.includes('SELF_LOCKOUT'))).toBe(false);
    expect(sql.some(text => text.includes('ADMIN_GUARD:ROLE_NOT_ASSIGNED'))).toBe(true);
    expect(sql.some(text => text.startsWith('DELETE FROM public.user_role_assignment'))).toBe(true);
  });

  it('setAccessStatus guards self and protected owner only when suspending', async () => {
    const suspend = harness();
    await suspend.repository.setAccessStatus(7, 'SUSPENDED', 'user_admin', 'Policy');
    const suspendSql = sqlOf(suspend.calls[0]!).join('\n');
    expect(suspendSql).toContain('ADMIN_GUARD:SELF_LOCKOUT');
    expect(suspendSql).toContain('ADMIN_GUARD:PROTECTED_OWNER');
    expect(suspendSql).toContain('UPDATE public.user_access_assignment SET access_status=$2');
    const reactivate = harness();
    await reactivate.repository.setAccessStatus(7, 'ACTIVE', 'user_admin', 'Resolved');
    const reactivateSql = sqlOf(reactivate.calls[0]!).join('\n');
    expect(reactivateSql).not.toContain('SELF_LOCKOUT');
    expect(reactivateSql).not.toContain('PROTECTED_OWNER');
  });

  it('createAccount grants staff roles then drops the seeded STUDENT membership when STUDENT was not requested', async () => {
    const { repository, calls } = harness();
    await repository.createAccount('user_target', ['SYSTEM_ADMIN', 'COORDINATOR'], 'user_admin', 'Add staff');
    const sql = sqlOf(calls[0]!);
    expect(sql[1]).toContain('ADMIN_GUARD:ACCOUNT_EXISTS');
    expect(sql[2]).toMatch(/^INSERT INTO public\.user_access_assignment/);
    expect(calls[0]!.slice(3, 5).map(statement => statement.values[1])).toEqual(['SYSTEM_ADMIN', 'COORDINATOR']);
    expect(sql[5]).toMatch(/^DELETE FROM public\.user_role_assignment WHERE app_role='STUDENT' AND grant_source='LEGACY_INIT'/);
    expect(sql).toHaveLength(8);
  });

  it('createAccount keeps the seeded STUDENT membership for a student-only account and for STUDENT plus staff', async () => {
    const student = harness();
    await student.repository.createAccount('user_target', ['STUDENT'], 'user_admin', 'Add student');
    expect(sqlOf(student.calls[0]!).some(text => text.startsWith('DELETE'))).toBe(false);
    expect(sqlOf(student.calls[0]!).filter(text => text.startsWith('INSERT INTO public.user_role_assignment'))).toHaveLength(0);
    const both = harness();
    await both.repository.createAccount('user_target', ['STUDENT', 'COORDINATOR'], 'user_admin', 'Add both');
    const sql = sqlOf(both.calls[0]!);
    expect(sql.some(text => text.startsWith('DELETE'))).toBe(false);
    expect(sql.filter(text => text.startsWith('INSERT INTO public.user_role_assignment'))).toHaveLength(1);
  });

  it('createAccount with an invitation checks it is pending, within its roles, and marks it accepted atomically', async () => {
    const { repository, calls } = harness();
    await repository.createAccount('user_target', ['COORDINATOR'], 'user_target', 'Invitation redeemed', { invitationId: invitationRow.id });
    const sql = sqlOf(calls[0]!);
    expect(sql[2]).toContain('ADMIN_GUARD:INVITATION_NOT_PENDING');
    expect(sql[3]).toContain('ADMIN_GUARD:ROLE_NOT_ELIGIBLE');
    expect(sql.some(text => text.startsWith("UPDATE public.admin_user_invitation SET status='ACCEPTED'"))).toBe(true);
    expect(calls[0]![0]!.values[0]).toBe('user_target');
  });

  it('rejects malformed input before contacting the database', async () => {
    const { repository, transaction } = harness();
    await expect(repository.createAccount('not-clerk', ['STUDENT'], 'a', 'b')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.createAccount('user_x', [], 'a', 'b')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.grantRole(1, 'STUDENT', ' ', 'reason')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.grantRole(1, 'STUDENT', 'user_a', '  ')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.createInvitation('a@utm.my', ['COORDINATOR'], 'user_a', 'why', new Date(Date.now() - 1000))).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('without a configured transaction runner mutations fail safely', async () => {
    const repository = createAdminRepository(vi.fn(async () => []));
    await expect(repository.grantRole(1, 'STUDENT', 'user_a', 'why')).rejects.toMatchObject({ code: 'MUTATION_FAILED' });
  });
});

describe('invitation statements', () => {
  it('createInvitation expires a lapsed pending row for the same email, then inserts a lower-cased invitation', async () => {
    const { repository, calls } = harness({ rows: statements => statements.map((_, i) => i === 2 ? [invitationRow] : []) });
    const expires = new Date(Date.now() + 86_400_000);
    const result = await repository.createInvitation('  New@UTM.my ', ['COORDINATOR'], 'user_admin', 'Join', expires);
    const sql = sqlOf(calls[0]!);
    expect(sql[1]).toContain("SET status='EXPIRED'");
    expect(calls[0]![1]!.values).toEqual(['new@utm.my']);
    expect(sql[2]).toMatch(/^INSERT INTO public\.admin_user_invitation/);
    expect(calls[0]![2]!.values).toEqual(['new@utm.my', ['COORDINATOR'], 'user_admin', 'Join', expires.toISOString()]);
    expect(result).toMatchObject({ id: invitationRow.id, status: 'PENDING', roles: ['COORDINATOR'], acceptedAt: null, invitedBy: 'user_admin' });
  });

  it('parses a text array and Date columns from the driver', async () => {
    const { repository } = harness({ rows: statements => statements.map((_, i) => i === 1 ? [{ ...invitationRow, roles: '{STUDENT,COORDINATOR}', createdAt: new Date(date) }] : []) });
    const result = await repository.attachClerkInvitation(invitationRow.id, 'inv_123', 'user_admin');
    expect(result.roles).toEqual(['STUDENT', 'COORDINATOR']);
    expect(result.createdAt).toBe(date);
  });

  it('revokeInvitation runs in one transaction with the revoker as actor; zero rows is classified afterwards', async () => {
    const ok = harness({ rows: statements => statements.map((_, i) => i === 1 ? [{ ...invitationRow, status: 'REVOKED' }] : []) });
    expect((await ok.repository.revokeInvitation(invitationRow.id, 'user_admin')).status).toBe('REVOKED');
    expect(ok.calls[0]![0]!.values[0]).toBe('user_admin');
    expect(ok.calls[0]![1]!.values).toEqual([invitationRow.id, 'user_admin']);
    const missing = harness({ rows: statements => statements.map(() => []) });
    await expect(missing.repository.revokeInvitation(invitationRow.id, 'user_admin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const done = harness({ rows: statements => statements.map(() => []) });
    done.query.mockResolvedValueOnce([{ status: 'ACCEPTED' }]);
    await expect(done.repository.revokeInvitation(invitationRow.id, 'user_admin')).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
  });

  it('acceptInvitation distinguishes expired from not pending when nothing was updated', async () => {
    const expired = harness({ rows: statements => statements.map(() => []) });
    expired.query.mockResolvedValueOnce([{ status: 'EXPIRED' }]);
    await expect(expired.repository.acceptInvitation(invitationRow.id, 7, 'user_target')).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
    expect(sqlOf(expired.calls[0]!)[1]).toContain('expires_at>clock_timestamp()');
  });

  it('expireInvitations returns the number of rows changed; listInvitations reads without a transaction', async () => {
    const { repository, transaction, query } = harness({ rows: () => [[], [{ invitation_id: 'a' }, { invitation_id: 'b' }]] });
    expect(await repository.expireInvitations('user_admin')).toBe(2);
    query.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([invitationRow]);
    const page = await repository.listInvitations({ page: 2, status: 'PENDING' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(page).toMatchObject({ total: 1, page: 2, pageSize: 20 });
    expect(query.mock.calls[1]![1]).toEqual(['PENDING', 20, 20]);
    expect(page.items[0]!.id).toBe(invitationRow.id);
  });
});

describe('database error mapping', () => {
  const db = (code: string, message: string) => Object.assign(new Error(message), { code });
  it.each([
    ['23514', 'Cannot remove the last active System Administrator', 'LAST_ACTIVE_ADMIN', 409],
    ['23514', 'Cannot suspend the last active System Administrator', 'LAST_ACTIVE_ADMIN', 409],
    ['23514', 'Protected owner administrator membership cannot be removed', 'PROTECTED_OWNER', 409],
    ['23505', 'Role already assigned; use an explicit policy update', 'ROLE_ALREADY_ASSIGNED', 409],
    ['23505', 'duplicate key value violates unique constraint "admin_user_invitation_one_pending_email_idx"', 'INVITATION_EXISTS', 409],
    ['23505', 'duplicate key value violates unique constraint "user_access_assignment_clerk_user_id_key"', 'ACCOUNT_EXISTS', 409],
    ['23514', 'Expired invitation cannot be accepted', 'INVITATION_EXPIRED', 409],
    ['23514', 'Terminal invitation (REVOKED) cannot be changed', 'INVITATION_NOT_PENDING', 409],
    ['22P02', 'invalid input syntax for type integer: "ADMIN_GUARD:SELF_LOCKOUT"', 'SELF_LOCKOUT', 409],
    ['22P02', 'invalid input syntax for type integer: "ADMIN_GUARD:NOT_FOUND"', 'NOT_FOUND', 404],
    ['23505', 'duplicate key value violates unique constraint "something_else"', 'CONFLICT', 409],
  ])('%s %s -> %s', (code, message, expected, status) => {
    const mapped = mapAdminDatabaseError(db(code, message));
    expect(mapped).toBeInstanceOf(AdminMutationError);
    expect(mapped.code).toBe(expected);
    expect(mapped.status).toBe(status);
  });

  it('never leaks SQL text, table names or connection details for unknown errors', () => {
    for (const error of [db('XX000', 'SELECT secret FROM user_access_assignment postgres://user:pw@host/db'), db('23514', 'new row violates check constraint "x"'), new Error('boom'), 'string', null, undefined]) {
      const mapped = mapAdminDatabaseError(error);
      expect(mapped.code).toBe('MUTATION_FAILED');
      expect(mapped.status).toBe(500);
      expect(mapped.message).not.toMatch(/SELECT|postgres|user_access|constraint/i);
    }
    expect(mapAdminDatabaseError(db('22P02', 'ADMIN_GUARD:DROP_TABLE')).code).toBe('MUTATION_FAILED');
  });

  it('maps transaction failures from a mutation and does not wrap an existing AdminMutationError', async () => {
    const { repository } = harness({ fail: db('23514', 'Cannot remove the last active System Administrator') });
    await expect(repository.revokeRole(7, 'SYSTEM_ADMIN', 'user_admin', 'Rotate')).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN', status: 409 });
    const existing = new AdminMutationError('NOT_FOUND');
    expect(mapAdminDatabaseError(existing)).toBe(existing);
  });
});

describe('role eligibility', () => {
  const verified = (address: string) => ({ address, verified: true });
  it('requires an exact verified graduate.utm.my address for STUDENT', () => {
    expect(checkRoleEligibility(verified('a@graduate.utm.my'), ['STUDENT'])).toEqual({ eligible: true, ineligible: [] });
    expect(checkRoleEligibility(verified('a@utm.my'), ['STUDENT'])).toEqual({ eligible: false, ineligible: ['STUDENT'] });
    expect(checkRoleEligibility(verified('a@evil.graduate.utm.my'), ['STUDENT']).eligible).toBe(false);
  });
  it('requires an exact verified utm.my address for COORDINATOR and SYSTEM_ADMIN', () => {
    expect(checkRoleEligibility(verified('a@utm.my'), ['COORDINATOR', 'SYSTEM_ADMIN'])).toEqual({ eligible: true, ineligible: [] });
    expect(checkRoleEligibility(verified('a@graduate.utm.my'), ['COORDINATOR', 'SYSTEM_ADMIN'])).toEqual({ eligible: false, ineligible: ['COORDINATOR', 'SYSTEM_ADMIN'] });
    expect(checkRoleEligibility(verified('a@mail.utm.my'), ['COORDINATOR']).eligible).toBe(false);
    expect(checkRoleEligibility(verified('a@utm.my.evil.test'), ['SYSTEM_ADMIN']).eligible).toBe(false);
  });
  it('reports only the offending roles for mixed requests and is case-insensitive', () => {
    expect(checkRoleEligibility(verified('A@UTM.MY'), ['COORDINATOR', 'STUDENT'])).toEqual({ eligible: false, ineligible: ['STUDENT'] });
  });
  it('never treats an unverified, missing or role-less request as eligible, and has no owner exception', () => {
    expect(checkRoleEligibility({ address: 'a@utm.my', verified: false }, ['COORDINATOR']).eligible).toBe(false);
    expect(checkRoleEligibility(null, ['STUDENT']).ineligible).toEqual(['STUDENT']);
    expect(checkRoleEligibility(verified('a@utm.my'), []).eligible).toBe(false);
    expect(checkRoleEligibility(verified('a@graduate.utm.my'), ['COORDINATOR']).eligible).toBe(false);
  });
});

describe('last-role guard and redemption lookups', () => {
  it('revokeRole guards against removing the last remaining role inside the transaction', async () => {
    const { repository, calls } = harness();
    await repository.revokeRole(7, 'COORDINATOR', 'user_admin', 'Left');
    const sql = sqlOf(calls[0]!);
    const roleGuard = sql.findIndex(text => text.includes('ADMIN_GUARD:LAST_ROLE'));
    expect(roleGuard).toBeGreaterThan(0);
    expect(roleGuard).toBeLessThan(sql.findIndex(text => text.startsWith('DELETE FROM public.user_role_assignment')));
  });
  it('maps the LAST_ROLE and INVITATION_DELIVERY_FAILED codes to stable statuses', () => {
    expect(new AdminMutationError('LAST_ROLE').status).toBe(409);
    expect(new AdminMutationError('INVITATION_DELIVERY_FAILED').status).toBe(503);
    expect(mapAdminDatabaseError({ code: '22P02', message: 'invalid input syntax for type integer: "ADMIN_GUARD:LAST_ROLE"' }).code).toBe('LAST_ROLE');
  });
  it('findPendingInvitationByEmail reads an unexpired PENDING row by lower-cased email', async () => {
    const query = vi.fn<AdminQuery>(async () => [invitationRow]);
    const repository = createAdminRepository(query, async () => []);
    expect((await repository.findPendingInvitationByEmail(' New@UTM.my '))?.id).toBe(invitationRow.id);
    expect(query.mock.calls[0]![1]).toEqual(['new@utm.my']);
    expect(query.mock.calls[0]![0]).toContain("status='PENDING'");
    query.mockResolvedValueOnce([]);
    expect(await repository.findPendingInvitationByEmail('none@utm.my')).toBeNull();
  });
});
