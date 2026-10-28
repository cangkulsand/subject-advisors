import type { AdminAuditQuery, AdminAuditEvent, AdminMembership, AdminOverview, AdminPage, AdminUsersQuery } from '../../../../../packages/shared/src/admin/admin';
import type { AccountRow, AdminRepository } from './contracts';
export type AdminQuery = (sql: string, values: unknown[]) => Promise<Record<string, unknown>[]>;
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

export function createAdminRepository(query: AdminQuery): AdminRepository {
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
      const memberships = await query(`SELECT app_role AS role, email_policy AS "emailPolicy", grant_source AS source,
        protected_owner AS "protectedOwner", grant_reason AS reason, created_at AS "grantedAt"
        FROM public.user_role_assignment WHERE access_assignment_id=$1 ORDER BY app_role`, [id]);
      return { ...accountRow(rows[0]), memberships: memberships.map(row => ({ ...row, grantedAt: timestamp(row.grantedAt) }) as unknown as AdminMembership) };
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
  };
}
