import type { AdminAuditQuery, AdminAuditEvent, AdminInvitation, AdminMembership, AdminOverview, AdminPage, AdminRole, AdminUsersQuery } from '../../../../../packages/shared/src/admin/admin';
import type { AccountDetailRow, AccountRow, AdminRepository } from './contracts';
import { AdminMutationError, GUARD_MARKER, mapAdminDatabaseError, type AdminErrorCode } from './errors';
export type AdminQuery = (sql: string, values: unknown[]) => Promise<Record<string, unknown>[]>;
export interface AdminStatement { text: string; values: unknown[] }
/** Runs all statements in ONE database transaction (neon HTTP: sql.transaction) and returns one row set per statement. */
export type AdminTransaction = (statements: AdminStatement[]) => Promise<Record<string, unknown>[][]>;
const unavailableTransaction: AdminTransaction = async () => { throw new Error('Admin transactions are not configured'); };
const integer = (value: unknown) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Invalid admin aggregate');
  return result;
};
const timestamp = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();
const accountColumns = `a.access_assignment_id AS "accountId", a.clerk_user_id AS "clerkUserId", a.access_status AS "accessStatus",
  a.created_at AS "createdAt", a.updated_at AS "updatedAt",
  COALESCE(array_agg(DISTINCT r.app_role ORDER BY r.app_role) FILTER (WHERE r.app_role IS NOT NULL), '{}'::varchar[]) AS roles,
  COALESCE(bool_or(r.protected_owner),false) AS "protectedOwner"`;
function accountRow(row: Record<string, unknown>): AccountRow {
  return { ...row, accountId: integer(row.accountId), createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt) } as unknown as AccountRow;
}
const events = `SELECT 'role:' || l.user_role_audit_log_id AS "eventId", l.access_assignment_id AS "accountId",
  a.clerk_user_id AS target, l.performed_by_clerk_user_id AS actor, 'ROLE' AS kind, l.action, l.app_role AS role,
  l.old_email_policy AS before, l.new_email_policy AS after, l.reason, l.created_at AS "occurredAt"
  FROM public.user_role_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id)
  UNION ALL
  SELECT 'access:' || l.access_audit_id, l.access_assignment_id, a.clerk_user_id, l.performed_by_clerk_user_id,
  'ACCESS', l.change_type, NULL::varchar, l.old_value, l.new_value, l.reason, l.created_at
  FROM public.user_access_audit_log l JOIN public.user_access_assignment a USING(access_assignment_id)`;

const membershipColumns = `app_role AS role, email_policy AS "emailPolicy", grant_source AS source,
  protected_owner AS "protectedOwner", grant_reason AS reason, created_at AS "grantedAt"`;
const membershipRow = (row: Record<string, unknown>) => ({ ...row, grantedAt: timestamp(row.grantedAt) }) as unknown as AdminMembership;
// Lapsed PENDING rows read as EXPIRED even before the lazy write happens.
const effectiveStatus = "(CASE WHEN status='PENDING' AND expires_at<=now() THEN 'EXPIRED' ELSE status END)";
const invitationColumns = `invitation_id AS id, email, roles, ${effectiveStatus} AS status, invited_by_clerk_user_id AS "invitedBy",
  reason, created_at AS "createdAt", expires_at AS "expiresAt", accepted_at AS "acceptedAt"`;
function roleList(value: unknown): AdminRole[] {
  const list = Array.isArray(value) ? value : String(value).replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  return list.map(String) as AdminRole[];
}
function invitationRow(row: Record<string, unknown>): AdminInvitation {
  return { id: String(row.id), email: String(row.email), roles: roleList(row.roles), status: row.status as AdminInvitation['status'],
    invitedBy: String(row.invitedBy), reason: String(row.reason), createdAt: timestamp(row.createdAt), expiresAt: timestamp(row.expiresAt),
    acceptedAt: row.acceptedAt == null ? null : timestamp(row.acceptedAt) };
}
/**
 * Non-interactive transactions cannot branch in JavaScript, so preconditions are SQL statements that
 * abort (and roll back) the whole transaction when the condition holds. The cast of a non-constant
 * scalar subquery is only evaluated when the CASE branch is taken (a constant would be folded at plan time).
 */
function guard(condition: string, values: unknown[], code: AdminErrorCode): AdminStatement {
  return { text: `SELECT CASE WHEN ${condition} THEN ((SELECT '${GUARD_MARKER}${code}' FROM generate_series(1,1))::integer) END`, values };
}

export function createAdminRepository(query: AdminQuery, transaction: AdminTransaction = unavailableTransaction): AdminRepository {
  /** First statement of every mutation: trusted audit context, transaction-local (is_local = true). */
  const context = (actor: string, reason: string): AdminStatement => ({
    text: "SELECT set_config('app.access_actor',$1,true), set_config('app.access_reason',$2,true)", values: [actor, reason] });
  async function run(actor: string, reason: string, statements: AdminStatement[]): Promise<Record<string, unknown>[][]> {
    if (!actor.trim() || !reason.trim()) throw new AdminMutationError('INVALID_REQUEST');
    try { return (await transaction([context(actor, reason), ...statements])).slice(1); }
    catch (error) { throw mapAdminDatabaseError(error); }
  }
  /** Account detail by id or Clerk ID, read inside the same transaction as the write. */
  const detail = (by: 'id' | 'clerk', value: unknown): AdminStatement[] => {
    const key = by === 'id' ? 'a.access_assignment_id=$1' : 'a.clerk_user_id=$1';
    return [
      { text: `SELECT ${accountColumns} FROM public.user_access_assignment a LEFT JOIN public.user_role_assignment r USING(access_assignment_id)
        WHERE ${key} GROUP BY a.access_assignment_id`, values: [value] },
      { text: `SELECT ${membershipColumns} FROM public.user_role_assignment WHERE access_assignment_id=
        (SELECT a.access_assignment_id FROM public.user_access_assignment a WHERE ${key}) ORDER BY app_role`, values: [value] },
    ];
  };
  const detailFrom = (results: Record<string, unknown>[][]): AccountDetailRow => {
    const [accounts, memberships] = results.slice(-2);
    if (!accounts?.[0] || !memberships) throw new AdminMutationError('MUTATION_FAILED');
    return { ...accountRow(accounts[0]), memberships: memberships.map(membershipRow) };
  };
  const invitationFrom = (rows: Record<string, unknown>[] | undefined): AdminInvitation => {
    if (!rows?.[0]) throw new AdminMutationError('MUTATION_FAILED');
    return invitationRow(rows[0]);
  };
  /** Zero rows updated means nothing was written, so a follow-up read can safely classify the failure. */
  async function missingInvitation(invitationId: string): Promise<AdminMutationError> {
    const rows = await query(`SELECT ${effectiveStatus} AS status FROM public.admin_user_invitation WHERE invitation_id=$1::uuid`, [invitationId]);
    if (!rows[0]) return new AdminMutationError('NOT_FOUND');
    return new AdminMutationError(rows[0].status === 'EXPIRED' ? 'INVITATION_EXPIRED' : 'INVITATION_NOT_PENDING');
  }
  const noAccount = (param: string) => `NOT EXISTS (SELECT 1 FROM public.user_access_assignment WHERE access_assignment_id=${param})`;
  const grantSql = (key: string) =>
    `INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,protected_owner,granted_by_clerk_user_id,grant_reason)
      SELECT access_assignment_id,$2::varchar,'ROLE_DOMAIN','OPERATOR',false,$3::varchar,$4::text FROM public.user_access_assignment WHERE ${key}`;
  return {
    async overview() {
      const [rows, roles, config] = await Promise.all([
        query(`SELECT count(*) AS total, count(*) FILTER (WHERE access_status='ACTIVE') AS active,
          count(*) FILTER (WHERE access_status='SUSPENDED') AS suspended FROM public.user_access_assignment`, []),
        query('SELECT app_role, count(*) AS total FROM public.user_role_assignment GROUP BY app_role', []),
        query(`SELECT (SELECT count(*) FROM public.programme) AS programmes, (SELECT count(*) FROM public.curriculum) AS curricula,
          (SELECT count(*) FROM public.subject) AS subjects, (SELECT count(*) FROM public.academic_semester) AS semesters`, []),
      ]);
      const assigned: AdminOverview['roles'] = { STUDENT: 0, COORDINATOR: 0, SYSTEM_ADMIN: 0 };
      for (const row of roles) if (String(row.app_role) in assigned) assigned[row.app_role as keyof typeof assigned] = integer(row.total);
      return { generatedAt: new Date().toISOString(), accounts: { total: integer(rows[0]?.total), active: integer(rows[0]?.active), suspended: integer(rows[0]?.suspended) }, roles: assigned,
        configuration: { programmes: integer(config[0]?.programmes), curricula: integer(config[0]?.curricula), subjects: integer(config[0]?.subjects), semesters: integer(config[0]?.semesters) } };
    },
    async accounts(input: AdminUsersQuery, matchingIds: string[]) {
      const text = input.q ? '%' + input.q.replace(/[\\%_]/g, '\\$&') + '%' : null;
      const values: unknown[] = [text, matchingIds, input.role || null, input.status || null];
      const where = `WHERE ($1::text IS NULL OR a.clerk_user_id ILIKE $1 OR a.clerk_user_id=ANY($2::varchar[]))
        AND ($3::varchar IS NULL OR EXISTS (SELECT 1 FROM public.user_role_assignment f WHERE f.access_assignment_id=a.access_assignment_id AND f.app_role=$3))
        AND ($4::varchar IS NULL OR a.access_status=$4)`;
      const [count, rows] = await Promise.all([
        query(`SELECT count(*) AS total FROM public.user_access_assignment a ${where}`, values),
        query(`SELECT ${accountColumns} FROM public.user_access_assignment a LEFT JOIN public.user_role_assignment r USING(access_assignment_id)
          ${where} GROUP BY a.access_assignment_id ORDER BY a.access_assignment_id DESC LIMIT $5 OFFSET $6`, [...values, 20, (input.page - 1) * 20]),
      ]);
      return { items: rows.map(accountRow), total: integer(count[0]?.total), page: input.page, pageSize: 20, generatedAt: new Date().toISOString() };
    },
    async account(id) {
      const rows = await query(`SELECT ${accountColumns} FROM public.user_access_assignment a LEFT JOIN public.user_role_assignment r USING(access_assignment_id)
        WHERE a.access_assignment_id=$1 GROUP BY a.access_assignment_id`, [id]);
      if (!rows[0]) return null;
      const memberships = await query(`SELECT ${membershipColumns} FROM public.user_role_assignment WHERE access_assignment_id=$1 ORDER BY app_role`, [id]);
      return { ...accountRow(rows[0]), memberships: memberships.map(membershipRow) };
    },
    async audit(input: AdminAuditQuery, pageSize = 20): Promise<AdminPage<AdminAuditEvent>> {
      const values: unknown[] = [input.accountId ?? null, input.kind === 'ALL' ? null : input.kind, input.from ?? null, input.to ?? null];
      const where = `WHERE ($1::integer IS NULL OR "accountId"=$1) AND ($2::text IS NULL OR kind=$2)
        AND ($3::date IS NULL OR "occurredAt">=($3::date::timestamp AT TIME ZONE 'UTC'))
        AND ($4::date IS NULL OR "occurredAt"<(($4::date + 1)::timestamp AT TIME ZONE 'UTC'))`;
      const [count, rows] = await Promise.all([
        query(`WITH events AS (${events}) SELECT count(*) AS total FROM events ${where}`, values),
        query(`WITH events AS (${events}) SELECT * FROM events ${where} ORDER BY "occurredAt" DESC, "eventId" DESC LIMIT $5 OFFSET $6`, [...values, pageSize, (input.page - 1) * pageSize]),
      ]);
      return { items: rows.map(row => ({ ...row, accountId: integer(row.accountId), occurredAt: timestamp(row.occurredAt) }) as unknown as AdminAuditEvent),
        total: integer(count[0]?.total), page: input.page, pageSize, generatedAt: new Date().toISOString() };
    },
    async createAccount(clerkUserId, roles, actor, reason, options) {
      if (!clerkUserId.startsWith('user_') || roles.length === 0 || new Set(roles).size !== roles.length) throw new AdminMutationError('INVALID_REQUEST');
      const invitationId = options?.invitationId;
      const invitation: AdminStatement[] = invitationId ? [
        guard("NOT EXISTS (SELECT 1 FROM public.admin_user_invitation WHERE invitation_id=$1::uuid AND status='PENDING' AND expires_at>clock_timestamp())", [invitationId], 'INVITATION_NOT_PENDING'),
        // Roles come from the verified request but may never exceed what the invitation recorded.
        guard('NOT ($2::varchar[] <@ (SELECT roles FROM public.admin_user_invitation WHERE invitation_id=$1::uuid))', [invitationId, roles], 'ROLE_NOT_ELIGIBLE'),
      ] : [];
      const accepted: AdminStatement[] = invitationId ? [{
        text: `UPDATE public.admin_user_invitation SET status='ACCEPTED', accepted_at=now(),
          accepted_access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id=$2)
          WHERE invitation_id=$1::uuid AND status='PENDING'`, values: [invitationId, clerkUserId] }] : [];
      // Mirrors tools/auth/role-provisioning.mjs: the INSERT trigger seeds a LEGACY_INIT STUDENT membership and a
      // new staff account must not keep it, so it is deleted once the requested roles exist. The account is
      // guaranteed new (ACCOUNT_EXISTS guard plus unique key), so the seed is the only STUDENT row.
      const staff: AdminStatement[] = (['SYSTEM_ADMIN', 'COORDINATOR'] as const).filter(role => roles.includes(role)).map(role => ({
        text: grantSql('clerk_user_id=$1'), values: [clerkUserId, role, actor, reason] }));
      const dropSeed: AdminStatement[] = roles.includes('STUDENT') ? [] : [{
        text: "DELETE FROM public.user_role_assignment WHERE app_role='STUDENT' AND grant_source='LEGACY_INIT' AND access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id=$1)",
        values: [clerkUserId] }];
      const results = await run(actor, reason, [
        guard('EXISTS (SELECT 1 FROM public.user_access_assignment WHERE clerk_user_id=$1)', [clerkUserId], 'ACCOUNT_EXISTS'),
        ...invitation,
        { text: "INSERT INTO public.user_access_assignment(clerk_user_id,app_role,access_status) VALUES ($1,'STUDENT','ACTIVE')", values: [clerkUserId] },
        ...staff, ...dropSeed, ...accepted, ...detail('clerk', clerkUserId),
      ]);
      return detailFrom(results);
    },
    async grantRole(accountId, role, actor, reason) {
      const results = await run(actor, reason, [
        guard(noAccount('$1'), [accountId], 'NOT_FOUND'),
        { text: grantSql('access_assignment_id=$1'), values: [accountId, role, actor, reason] },
        ...detail('id', accountId),
      ]);
      return detailFrom(results);
    },
    async revokeRole(accountId, role, actor, reason) {
      const results = await run(actor, reason, [
        guard(noAccount('$1'), [accountId], 'NOT_FOUND'),
        // Checked in SQL inside the transaction, never from a stale read: an admin may not remove their own SYSTEM_ADMIN role.
        ...(role === 'SYSTEM_ADMIN' ? [guard('EXISTS (SELECT 1 FROM public.user_access_assignment WHERE access_assignment_id=$1 AND clerk_user_id=$2)', [accountId, actor], 'SELF_LOCKOUT')] : []),
        guard('NOT EXISTS (SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=$1 AND app_role=$2)', [accountId, role], 'ROLE_NOT_ASSIGNED'),
        // An account must keep at least one role; admins suspend instead of stripping the last role.
        guard('(SELECT count(*) FROM public.user_role_assignment WHERE access_assignment_id=$1) <= 1', [accountId], 'LAST_ROLE'),
        { text: 'DELETE FROM public.user_role_assignment WHERE access_assignment_id=$1 AND app_role=$2', values: [accountId, role] },
        ...detail('id', accountId),
      ]);
      return detailFrom(results);
    },
    async setAccessStatus(accountId, status, actor, reason) {
      const results = await run(actor, reason, [
        guard(noAccount('$1'), [accountId], 'NOT_FOUND'),
        ...(status === 'SUSPENDED' ? [
          guard('EXISTS (SELECT 1 FROM public.user_access_assignment WHERE access_assignment_id=$1 AND clerk_user_id=$2)', [accountId, actor], 'SELF_LOCKOUT'),
          guard('EXISTS (SELECT 1 FROM public.user_role_assignment WHERE access_assignment_id=$1 AND protected_owner)', [accountId], 'PROTECTED_OWNER'),
        ] : []),
        // The status-audit trigger records old/new status with the reason from the context statement.
        { text: 'UPDATE public.user_access_assignment SET access_status=$2, updated_at=now() WHERE access_assignment_id=$1', values: [accountId, status] },
        ...detail('id', accountId),
      ]);
      return detailFrom(results);
    },
    async createInvitation(email, roles, actor, reason, expiresAt) {
      const normalised = email.trim().toLowerCase();
      if (!normalised || roles.length === 0 || new Set(roles).size !== roles.length || !(expiresAt.getTime() > Date.now())) throw new AdminMutationError('INVALID_REQUEST');
      const results = await run(actor, reason, [
        // A lapsed PENDING row would otherwise block the partial unique index, so expire it first (database clock).
        { text: "UPDATE public.admin_user_invitation SET status='EXPIRED' WHERE email=$1 AND status='PENDING' AND expires_at<=clock_timestamp()", values: [normalised] },
        { text: `INSERT INTO public.admin_user_invitation(email,roles,invited_by_clerk_user_id,reason,expires_at) VALUES ($1,$2::varchar[],$3,$4,$5::timestamptz)
          RETURNING ${invitationColumns}`, values: [normalised, roles, actor, reason, expiresAt.toISOString()] },
      ]);
      return invitationFrom(results[1]);
    },
    async attachClerkInvitation(invitationId, clerkInvitationId, actor) {
      const results = await run(actor, 'Attach Clerk invitation reference', [{
        text: `UPDATE public.admin_user_invitation SET clerk_invitation_id=$2 WHERE invitation_id=$1::uuid AND status='PENDING' AND clerk_invitation_id IS NULL
          RETURNING ${invitationColumns}`, values: [invitationId, clerkInvitationId] }]);
      if (!results[0]?.length) throw await missingInvitation(invitationId);
      return invitationFrom(results[0]);
    },
    async listInvitations(input) {
      const values: unknown[] = [input.status || null];
      const where = `WHERE ($1::varchar IS NULL OR ${effectiveStatus}=$1)`;
      const [count, rows] = await Promise.all([
        query(`SELECT count(*) AS total FROM public.admin_user_invitation ${where}`, values),
        query(`SELECT ${invitationColumns} FROM public.admin_user_invitation ${where} ORDER BY created_at DESC, invitation_id DESC LIMIT $2 OFFSET $3`, [...values, 20, (input.page - 1) * 20]),
      ]);
      return { items: rows.map(invitationRow), total: integer(count[0]?.total), page: input.page, pageSize: 20, generatedAt: new Date().toISOString() };
    },
    async revokeInvitation(invitationId, actor, reason = 'Invitation revoked by administrator') {
      const results = await run(actor, reason, [{
        text: `UPDATE public.admin_user_invitation SET status='REVOKED', revoked_at=now(), revoked_by_clerk_user_id=$2
          WHERE invitation_id=$1::uuid AND status='PENDING' RETURNING ${invitationColumns}`, values: [invitationId, actor] }]);
      if (!results[0]?.length) throw await missingInvitation(invitationId);
      return invitationFrom(results[0]);
    },
    async findPendingInvitationByEmail(email) {
      const rows = await query(`SELECT ${invitationColumns} FROM public.admin_user_invitation
        WHERE email=$1 AND status='PENDING' AND expires_at>now() ORDER BY created_at DESC LIMIT 1`, [email.trim().toLowerCase()]);
      return rows[0] ? invitationRow(rows[0]) : null;
    },
    async clerkInvitationIdOf(invitationId) {
      const rows = await query('SELECT clerk_invitation_id FROM public.admin_user_invitation WHERE invitation_id=$1::uuid', [invitationId]);
      return rows[0]?.clerk_invitation_id == null ? null : String(rows[0].clerk_invitation_id);
    },
    async expireInvitations(actor) {
      const results = await run(actor, 'Expire lapsed invitations', [{
        text: "UPDATE public.admin_user_invitation SET status='EXPIRED' WHERE status='PENDING' AND expires_at<=clock_timestamp() RETURNING invitation_id", values: [] }]);
      return results[0]?.length ?? 0;
    },
    async acceptInvitation(invitationId, accountId, actor) {
      const results = await run(actor, 'Invitation accepted', [{
        text: `UPDATE public.admin_user_invitation SET status='ACCEPTED', accepted_at=now(), accepted_access_assignment_id=$2
          WHERE invitation_id=$1::uuid AND status='PENDING' AND expires_at>clock_timestamp() RETURNING ${invitationColumns}`, values: [invitationId, accountId] }]);
      if (!results[0]?.length) throw await missingInvitation(invitationId);
      return invitationFrom(results[0]);
    },
  };
}
