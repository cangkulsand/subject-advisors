import { describe, expect, it, vi } from 'vitest';
import { parse } from 'libpg-query';
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
  it('never lets a dummy (+clerk_test) address hold SYSTEM_ADMIN (S3-P004-029 review)', () => {
    expect(checkRoleEligibility(verified('d-1a2b+clerk_test@gmail.com'), ['SYSTEM_ADMIN'])).toEqual({ eligible: false, ineligible: ['SYSTEM_ADMIN'] });
    expect(checkRoleEligibility(verified('d-1a2b+CLERK_TEST@gmail.com'), ['SYSTEM_ADMIN'])).toEqual({ eligible: false, ineligible: ['SYSTEM_ADMIN'] });
    expect(checkRoleEligibility(verified('d-1a2b+clerk_test@utm.my'), ['COORDINATOR'])).toEqual({ eligible: true, ineligible: [] });
  });
  it('requires an exact verified graduate.utm.my address for STUDENT', () => {
    expect(checkRoleEligibility(verified('a@graduate.utm.my'), ['STUDENT'])).toEqual({ eligible: true, ineligible: [] });
    expect(checkRoleEligibility(verified('a@utm.my'), ['STUDENT'])).toEqual({ eligible: false, ineligible: ['STUDENT'] });
    expect(checkRoleEligibility(verified('a@evil.graduate.utm.my'), ['STUDENT']).eligible).toBe(false);
  });
  it('requires an exact verified utm.my address for COORDINATOR; utm.my and graduate.utm.my are never SYSTEM_ADMIN (S3-P004-033)', () => {
    expect(checkRoleEligibility(verified('a@utm.my'), ['COORDINATOR', 'SYSTEM_ADMIN'])).toEqual({ eligible: false, ineligible: ['SYSTEM_ADMIN'] });
    expect(checkRoleEligibility(verified('a@graduate.utm.my'), ['COORDINATOR', 'SYSTEM_ADMIN'])).toEqual({ eligible: false, ineligible: ['COORDINATOR', 'SYSTEM_ADMIN'] });
    expect(checkRoleEligibility(verified('a@mail.utm.my'), ['COORDINATOR']).eligible).toBe(false);
  });
  it.each(['a@gmail.com', 'A@GMAIL.COM', 'a@Gmail.Com'])('allows SYSTEM_ADMIN for %s', address => {
    expect(checkRoleEligibility(verified(address), ['SYSTEM_ADMIN'])).toEqual({ eligible: true, ineligible: [] });
  });
  it.each(['a@utm.my', 'a@graduate.utm.my', 'a@Graduate.UTM.my', 'a@evil-gmail.com', 'a@gmail.com.evil.io', 'a@sub.gmail.com', 'a@utm.my.evil', 'a@mail.utm.my', 'a@evil.graduate.utm.my', 'a@googlemail.com', 'a@gmail.com@evil.io', '@gmail.com', 'a b@gmail.com'])('denies SYSTEM_ADMIN for %s', address => {
    expect(checkRoleEligibility(verified(address), ['SYSTEM_ADMIN']).eligible).toBe(false);
  });
  it('denies SYSTEM_ADMIN for an unverified gmail address and keeps gmail out of STUDENT and COORDINATOR', () => {
    expect(checkRoleEligibility({ address: 'a@gmail.com', verified: false }, ['SYSTEM_ADMIN']).eligible).toBe(false);
    expect(checkRoleEligibility(verified('a@gmail.com'), ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'])).toEqual({ eligible: false, ineligible: ['STUDENT', 'COORDINATOR'] });
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

describe('student programme change (S2-P004-026)', () => {
  const programmeRow = { studentId: 9, studentName: 'Student', matricNo: 'A22EC0001', curriculumId: 2, curriculumVersion: 'V2', programmeId: 8, programmeCode: 'PGM', programmeName: 'Programme', intakeYear: 2022 };
  it('runs the database function in one audited transaction and returns the removed pick count', async () => {
    const { repository, calls, query } = harness({ rows: statements => statements.map((_, index) => index === 2 ? [{ removedPicks: '4' }] : index === 3 ? [programmeRow] : []) });
    const result = await repository.changeStudentProgramme(7, 2, 'user_admin', 'Wrong programme at setup');
    expect(query).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    const sql = sqlOf(calls[0]!);
    expect(sql).toHaveLength(4);
    expect(calls[0]![0]!.values).toEqual(['user_admin', 'Wrong programme at setup']);
    expect(sql[1]).toContain('ADMIN_GUARD:NOT_FOUND');
    expect(sql[2]).toContain('public.db_change_student_programme(');
    expect(calls[0]![2]!.values).toEqual([7, 2]);
    expect(result).toEqual({ programme: programmeRow, removedPicks: 4 });
  });
  it('rejects a blank reason before touching the database', async () => {
    const { repository, transaction } = harness();
    await expect(repository.changeStudentProgramme(7, 2, 'user_admin', '  ')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([['PROGRAMME_CHANGE:STUDENT_NOT_FOUND', 'STUDENT_PROFILE_NOT_FOUND'], ['PROGRAMME_CHANGE:CURRICULUM_UNAVAILABLE', 'CURRICULUM_UNAVAILABLE'], ['PROGRAMME_CHANGE:UNCHANGED', 'PROGRAMME_UNCHANGED']])('maps %s to %s', async (message, code) => {
    const { repository } = harness({ fail: Object.assign(new Error(message), { code: '23514' }) });
    await expect(repository.changeStudentProgramme(7, 2, 'user_admin', 'Reason')).rejects.toMatchObject({ code });
    expect(mapAdminDatabaseError(Object.assign(new Error(message), { code: '23514' })).code).toBe(code);
  });
  it('reads the student programme and the active curriculum options', async () => {
    const query = vi.fn<AdminQuery>(async sql => sql.includes('student_profile') ? [programmeRow] : [{ curriculumId: 2, curriculumVersion: 'V2', programmeId: 8, programmeCode: 'PGM', programmeName: 'Programme' }]);
    const repository = createAdminRepository(query);
    expect(await repository.studentProgramme(7)).toEqual(programmeRow);
    expect(await repository.curriculumOptions()).toHaveLength(1);
    expect(query.mock.calls[1]![0]).toContain("coalesce(upper(c.status),'ACTIVE')='ACTIVE'");
    expect(await createAdminRepository(vi.fn<AdminQuery>(async () => [])).studentProgramme(7)).toBeNull();
  });
});

describe('dummy accounts (S3-P004-029)', () => {
  const student = { role: 'STUDENT' as const, name: 'Aina', curriculumId: 4, learningCentreId: 2, reason: 'Testing' };
  const coordinator = { role: 'COORDINATOR' as const, name: 'Lim', programmeId: 3, learningCentreId: 2, reason: 'Testing' };

  it('creates a dummy student account and a complete profile in one transaction', async () => {
    const { repository, calls, transaction } = harness();
    await repository.createDummyAccount('user_dummy', student, 'DUMMY012345', 'user_admin', 'Testing');
    expect(transaction).toHaveBeenCalledTimes(1);
    const sql = sqlOf(calls[0]!);
    expect(calls[0]![0]!.values).toEqual(['user_admin', 'Testing']);
    expect(sql[1]).toContain('ADMIN_GUARD:ACCOUNT_EXISTS');
    expect(sql[2]).toContain('ADMIN_GUARD:ACADEMIC_SEMESTER_UNAVAILABLE');
    expect(sql[3]).toContain('ADMIN_GUARD:DUMMY_SCOPE_INVALID');
    expect(calls[0]![3]!.values).toEqual([4, 2]);
    expect(sql[4]).toMatch(/^INSERT INTO public\.user_access_assignment/);
    const profile = calls[0]!.find(statement => statement.text.includes('INSERT INTO public.student_profile'))!;
    expect(profile.text).toContain('is_current');
    expect(profile.values).toEqual(['user_dummy', 'Aina', 'DUMMY012345', 4, 2, 0, 20]);
    expect(sql.some(text => text.startsWith('DELETE'))).toBe(false);
    expect(sql.some(text => text.includes('coordinator_assignment'))).toBe(false);
  });

  it('creates a dummy coordinator with the COORDINATOR role, no student seed and one assignment', async () => {
    const { repository, calls } = harness();
    await repository.createDummyAccount('user_dummy', coordinator, 'unused', 'user_admin', 'Testing');
    const sql = sqlOf(calls[0]!);
    expect(sql.some(text => text.includes('ACADEMIC_SEMESTER_UNAVAILABLE'))).toBe(false);
    expect(sql[2]).toContain('ADMIN_GUARD:DUMMY_SCOPE_INVALID');
    expect(calls[0]![2]!.values).toEqual([3, 2]);
    expect(calls[0]!.find(statement => statement.text.includes('INSERT INTO public.user_role_assignment'))!.values[1]).toBe('COORDINATOR');
    expect(sql.some(text => /^DELETE FROM public\.user_role_assignment WHERE app_role='STUDENT' AND grant_source='LEGACY_INIT'/.test(text))).toBe(true);
    const assignment = calls[0]!.find(statement => statement.text.includes('INSERT INTO public.coordinator_assignment'))!;
    expect(assignment.text).toContain('faculty_id');
    expect(assignment.values).toEqual(['user_dummy', 3, 2]);
    expect(sql.some(text => text.includes('student_profile'))).toBe(false);
  });

  it('maps a failed scope guard to DUMMY_SCOPE_INVALID', async () => {
    const { repository } = harness({ fail: { code: '22P02', message: 'invalid input syntax for type integer: "ADMIN_GUARD:DUMMY_SCOPE_INVALID"' } });
    await expect(repository.createDummyAccount('user_dummy', student, 'DUMMY012345', 'user_admin', 'Testing')).rejects.toMatchObject({ code: 'DUMMY_SCOPE_INVALID', status: 409 });
  });

  it('reads the current semester id, or null when none is current', async () => {
    const some = harness(); some.query.mockResolvedValueOnce([{ semesterId: 24 }]);
    expect(await some.repository.currentSemesterId()).toBe(24);
    const none = harness();
    expect(await none.repository.currentSemesterId()).toBeNull();
  });
});

describe('student intake year change (S3-P004-037)', () => {
  const programmeRow = { studentId: 9, studentName: 'Student', matricNo: 'A22EC0001', curriculumId: 2, curriculumVersion: 'V2', programmeId: 8, programmeCode: 'PGM', programmeName: 'Programme', intakeYear: 2023 };
  it('parses as SQL, binds values and runs guards, the update and the audit row in one audited transaction', async () => {
    const parsed: string[] = [];
    const { repository, calls, query } = harness({ rows: statements => statements.map((_, index) => index === statements.length - 1 ? [programmeRow] : index === statements.length - 2 ? [{ auditId: 41 }] : []) });
    const result = await repository.changeStudentIntakeYear(7, 2023, 'user_admin', 'Wrong intake at setup');
    expect(result).toEqual(programmeRow);
    expect(query).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    const statements = calls[0]!;
    for (const statement of statements) { await parse(statement.text); parsed.push(statement.text); }
    expect(parsed).toHaveLength(statements.length);
    const sql = sqlOf(statements);
    expect(statements[0]!.values).toEqual(['user_admin', 'Wrong intake at setup']);
    // Lock the profile row, then the guards in order: no account, no profile, unchanged.
    expect(sql[1]).toContain('FOR UPDATE OF p');
    expect(sql[2]).toContain('ADMIN_GUARD:NOT_FOUND');
    expect(sql[3]).toContain('ADMIN_GUARD:STUDENT_PROFILE_NOT_FOUND');
    expect(sql[4]).toContain('ADMIN_GUARD:UNCHANGED');
    expect(sql[4]).toContain('p.intake_year IS NOT DISTINCT FROM $2::smallint');
    expect(statements[4]!.values).toEqual([7, 2023]);
    // The update and the append-only audit row are one statement.
    const write = sql[5]!;
    expect(write).toContain('UPDATE public.student_profile');
    expect(write).toContain('SET intake_year=$2::smallint');
    expect(write).not.toContain('curriculum_id=');
    expect(write).toContain('INSERT INTO public.academic_setup_audit_log(entity_type,entity_id,action,actor,reason,before_data,after_data)');
    expect(write).toContain("'student_intake'");
    expect(write).toContain("'CHANGE_INTAKE_YEAR'");
    expect(write).toContain("btrim(current_setting('app.access_actor',true))");
    expect(write).toContain("jsonb_build_object('intakeYear',");
    expect(statements[5]!.values).toEqual([7, 2023]);
    expect(sql[6]).toContain('p.intake_year AS "intakeYear"');
    for (const statement of statements) expect(statement.text).not.toContain('2023');
  });
  it('rejects a blank reason before touching the database', async () => {
    const { repository, transaction } = harness();
    await expect(repository.changeStudentIntakeYear(7, 2023, 'user_admin', '  ')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(['NOT_FOUND', 'STUDENT_PROFILE_NOT_FOUND', 'UNCHANGED'] as const)('maps the %s guard to its stable code', async code => {
    const { repository } = harness({ fail: Object.assign(new Error(`invalid input syntax for type integer: "ADMIN_GUARD:${code}"`), { code: '22P02' }) });
    await expect(repository.changeStudentIntakeYear(7, 2023, 'user_admin', 'Reason')).rejects.toMatchObject({ code });
  });
  it('UNCHANGED is a 409 with a plain message', () => {
    expect(new AdminMutationError('UNCHANGED')).toMatchObject({ status: 409, message: 'The intake year is already set to this year.' });
  });
  it('fails safely when the readback is missing', async () => {
    const { repository } = harness({ rows: statements => statements.map(() => []) });
    await expect(repository.changeStudentIntakeYear(7, 2023, 'user_admin', 'Reason')).rejects.toMatchObject({ code: 'MUTATION_FAILED' });
  });
  it('reads the intake year with the student programme, null when not set', async () => {
    const query = vi.fn<AdminQuery>(async () => [{ ...programmeRow, intakeYear: null }]);
    expect(await createAdminRepository(query).studentProgramme(7)).toEqual({ ...programmeRow, intakeYear: null });
    expect(query.mock.calls[0]![0]).toContain('p.intake_year AS "intakeYear"');
    query.mockResolvedValueOnce([{ ...programmeRow, intakeYear: '2021' }]);
    expect((await createAdminRepository(query).studentProgramme(7))?.intakeYear).toBe(2021);
  });
});

describe('student matric number change (S3-P004-039)', () => {
  const programmeRow = { studentId: 9, studentName: 'Student', matricNo: 'SX232316ECJHF04', curriculumId: 2, curriculumVersion: 'V2', programmeId: 8, programmeCode: 'PGM', programmeName: 'Programme', intakeYear: 2023 };
  it('locks the profile, runs the guards, then the update and its audit row in one statement', async () => {
    const { repository, calls } = harness({ rows: statements => statements.map((_, index) => index === statements.length - 1 ? [programmeRow] : index === statements.length - 2 ? [{ auditId: 42 }] : []) });
    expect(await repository.changeStudentMatric(7, 'SX232316ECJHF04', 'user_admin', 'Typo at setup')).toEqual(programmeRow);
    const statements = calls[0]!;
    for (const statement of statements) await parse(statement.text);
    const sql = sqlOf(statements);
    expect(sql[1]).toContain('FOR UPDATE OF p');
    expect(sql[2]).toContain('ADMIN_GUARD:NOT_FOUND');
    expect(sql[3]).toContain('ADMIN_GUARD:STUDENT_PROFILE_NOT_FOUND');
    expect(sql[4]).toContain('ADMIN_GUARD:MATRIC_UNCHANGED');
    expect(sql[4]).toContain("upper(regexp_replace(coalesce(p.matric_no,''),'[[:space:]]','','g'))=$2");
    expect(sql[5]).toContain('ADMIN_GUARD:MATRIC_TAKEN');
    expect(sql[5]).toContain("upper(regexp_replace(o.matric_no,'[[:space:]]','','g'))=$2");
    expect(statements[5]!.values).toEqual([7, 'SX232316ECJHF04']);
    const write = sql[6]!;
    expect(write).toContain('SET matric_no=$2');
    expect(write).not.toContain('intake_year=');
    expect(write).toContain("'student_matric'");
    expect(write).toContain("'CHANGE_MATRIC_NO'");
    expect(write).toContain("jsonb_build_object('matricNo',");
    expect(statements[6]!.values).toEqual([7, 'SX232316ECJHF04']);
  });
  it.each(['NOT_FOUND', 'STUDENT_PROFILE_NOT_FOUND', 'MATRIC_UNCHANGED', 'MATRIC_TAKEN'] as const)('maps the %s guard to its stable code', async code => {
    const { repository } = harness({ fail: Object.assign(new Error(`invalid input syntax for type integer: "ADMIN_GUARD:${code}"`), { code: '22P02' }) });
    await expect(repository.changeStudentMatric(7, 'SX232316ECJHF04', 'user_admin', 'Reason')).rejects.toMatchObject({ code });
  });
  it('gives plain 409 messages', () => {
    expect(new AdminMutationError('MATRIC_TAKEN')).toMatchObject({ status: 409, message: 'Another student already uses this matric number.' });
    expect(new AdminMutationError('MATRIC_UNCHANGED')).toMatchObject({ status: 409, message: 'The matric number is already set to this number.' });
  });
});

describe('batch correction (S3-P004-039)', () => {
  const found = (matricNo: string, studentId: number | null, accountId: number | null = studentId === null ? null : studentId + 100) => ({
    matricNo, studentId, accountId, studentName: studentId === null ? null : 'Student ' + studentId, programmeCode: 'SECJ', curriculumId: 2, curriculumVersion: '1',
    intakeYear: 2020, accessStatus: accountId === null ? null : 'ACTIVE', isStudent: accountId !== null });
  it('previews matches and names each problem', async () => {
    const query = vi.fn<AdminQuery>(async () => [found('SX232315ECJHF04', 9), found('SX000001', null), found('SX2302ECRHF04', 10), found('SX2302ECRHF04', 11), found('SX2402ECRHF04', 12, null)]);
    const preview = await createAdminRepository(query).previewBatch(['SX232315ECJHF04', 'SX000001', 'SX2302ECRHF04', 'SX2402ECRHF04']);
    expect(preview.matches).toEqual([{ matricNo: 'SX232315ECJHF04', accountId: 109, studentId: 9, studentName: 'Student 9', programmeCode: 'SECJ', curriculumId: 2, curriculumVersion: '1', intakeYear: 2020, accountStatus: 'ACTIVE', isStudent: true }]);
    expect(preview.problems).toEqual([{ matricNo: 'SX000001', kind: 'NOT_FOUND' }, { matricNo: 'SX2302ECRHF04', kind: 'DUPLICATE' }, { matricNo: 'SX2402ECRHF04', kind: 'NO_ACCOUNT' }]);
    const [sql, values] = query.mock.calls[0]!;
    await parse(sql);
    expect(sql).toContain("upper(regexp_replace(p.matric_no,'[[:space:]]','','g'))=w.matric_no");
    expect(values).toEqual([['SX232315ECJHF04', 'SX000001', 'SX2302ECRHF04', 'SX2402ECRHF04']]);
  });
  const input = { matricNos: ['SX232315ECJHF04', 'SX2302ECRHF04'], curriculumId: null, intake: { mode: 'matric' as const }, reason: 'Backfill used the curriculum year',
    expected: [{ matricNo: 'SX2302ECRHF04', studentId: 10, curriculumId: 2, intakeYear: 2022 }, { matricNo: 'SX232315ECJHF04', studentId: 9, curriculumId: 2, intakeYear: 2020 }] };
  it('locks, runs every guard, then writes the programme and intake changes in one audited transaction', async () => {
    const { repository, calls } = harness({ rows: statements => statements.map(statement =>
      statement.text.includes('AS "corrected"') ? [{ corrected: 2 }] : statement.text.includes('AS "removedPicks"') ? [{ removedPicks: 0, programmeChanges: 0 }]
        : statement.text.includes('AS "intakeChanges"') ? [{ intakeChanges: 2 }] : []) });
    expect(await repository.applyBatch(input, 'user_admin')).toEqual({ corrected: 2, intakeChanges: 2, programmeChanges: 0, removedPicks: 0 });
    const statements = calls[0]!;
    for (const statement of statements) await parse(statement.text);
    const sql = sqlOf(statements);
    expect(statements[0]!.values).toEqual(['user_admin', 'Backfill used the curriculum year']);
    expect(sql[1]).toContain('FOR UPDATE');
    const order = ['BATCH_HAS_PROBLEMS', 'BATCH_STALE', 'CURRICULUM_UNAVAILABLE', 'UNCHANGED'].map(code => sql.findIndex(text => text.includes('ADMIN_GUARD:' + code)));
    expect(order).toEqual([2, 3, 4, 5]);
    const firstWrite = sql.findIndex(text => text.includes('db_change_student_programme') || text.includes('UPDATE public.student_profile'));
    expect(firstWrite).toBeGreaterThan(6);
    expect(sql.some(text => text.includes('public.db_change_student_programme(student_id, new_curriculum)'))).toBe(true);
    const intake = sql.find(text => text.includes('AS "intakeChanges"'))!;
    expect(intake).toContain("'student_intake'");
    expect(intake).toContain("'CHANGE_INTAKE_YEAR'");
    // Expected rows travel in the order of matricNos, as aligned arrays.
    expect(statements[3]!.values).toEqual([['SX232315ECJHF04', 'SX2302ECRHF04'], [9, 10], [2, 2], [2020, 2022]]);
    expect(statements[5]!.values).toEqual([['SX232315ECJHF04', 'SX2302ECRHF04'], null, 'matric', null]);
  });
  it('a preview that does not cover the same numbers is stale before touching the database', async () => {
    const { repository, transaction } = harness();
    await expect(repository.applyBatch({ ...input, expected: input.expected.slice(1) }, 'user_admin')).rejects.toMatchObject({ code: 'BATCH_STALE', status: 409 });
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(['BATCH_HAS_PROBLEMS', 'BATCH_STALE', 'CURRICULUM_UNAVAILABLE', 'UNCHANGED'] as const)('maps the %s guard', async code => {
    const { repository } = harness({ fail: Object.assign(new Error(`invalid input syntax for type integer: "ADMIN_GUARD:${code}"`), { code: '22P02' }) });
    await expect(repository.applyBatch(input, 'user_admin')).rejects.toMatchObject({ code });
  });
  it('gives the plain batch messages', () => {
    expect(new AdminMutationError('BATCH_STALE')).toMatchObject({ status: 409, message: 'Some students changed since you checked. Check again.' });
    expect(new AdminMutationError('BATCH_HAS_PROBLEMS')).toMatchObject({ status: 409, message: 'Remove the problem numbers, then check again.' });
  });
});

describe('batch review fixes (S3-P004-039)', () => {
  it('the problems guard also refuses a matric year after the current year', async () => {
    const { repository, calls } = harness({ rows: statements => statements.map(statement =>
      statement.text.includes('AS "corrected"') ? [{ corrected: 1 }] : statement.text.includes('AS "removedPicks"') ? [{ removedPicks: 0, programmeChanges: 0 }]
        : statement.text.includes('AS "intakeChanges"') ? [{ intakeChanges: 1 }] : []) });
    await repository.applyBatch({ matricNos: ['SX232315ECJHF04'], curriculumId: null, intake: { mode: 'matric' }, reason: 'Fix',
      expected: [{ matricNo: 'SX232315ECJHF04', studentId: 9, curriculumId: 2, intakeYear: null }] }, 'user_admin');
    const problems = calls[0]!.map(statement => statement.text.replace(/\s+/g, ' ')).find(text => text.includes('ADMIN_GUARD:BATCH_HAS_PROBLEMS'))!;
    expect(problems).toContain('2000 + substring(m.no FROM 3 FOR 2)::integer > extract(year FROM now())::integer');
  });
});
