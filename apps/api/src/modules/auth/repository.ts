import { neon } from '@neondatabase/serverless';
import type { AccessAssignment, AccessRepository } from './contracts';

export type SqlQuery = (text: string, parameters: string[]) => Promise<unknown>;
function assignmentFrom(rows: unknown): AccessAssignment | null {
  if (!Array.isArray(rows)) throw new Error('Invalid access query result');
  if (!rows.length) return null;
  const row: unknown = rows[0];
  if (typeof row !== 'object' || row === null ||
      !('clerk_user_id' in row) || typeof row.clerk_user_id !== 'string' ||
      !('app_role' in row) || !('access_status' in row) ||
      !['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'].includes(String(row.app_role)) ||
      !['ACTIVE', 'SUSPENDED'].includes(String(row.access_status))) throw new Error('Invalid access assignment');
  if (!('roles' in row) || !Array.isArray(row.roles) ||
      row.roles.some(role => !['STUDENT','COORDINATOR','SYSTEM_ADMIN'].includes(role)) ||
      new Set(row.roles).size !== row.roles.length) throw new Error('Invalid role memberships');
  const coordinatorStudentException = 'coordinator_student_exception' in row && row.coordinator_student_exception === true;
  const protectedOwner = 'protected_owner' in row && row.protected_owner === true;
  if (coordinatorStudentException && (!row.roles.includes('COORDINATOR') || !protectedOwner) ||
      protectedOwner && !row.roles.includes('SYSTEM_ADMIN')) throw new Error('Invalid protected owner memberships');
  return {
    clerkUserId: row.clerk_user_id,
    appRole: row.app_role as AccessAssignment['appRole'],
    accessStatus: row.access_status as AccessAssignment['accessStatus'],
    roles: row.roles as AccessAssignment['roles'], coordinatorStudentException, protectedOwner,
  };
}

export function createAccessRepository(query: SqlQuery): AccessRepository {
  const find = async (userId: string) => assignmentFrom(await query(
    `SELECT a.clerk_user_id, a.app_role, a.access_status,
       coalesce(array_agg(r.app_role ORDER BY r.app_role) FILTER (WHERE r.app_role IS NOT NULL), ARRAY[]::varchar[]) AS roles,
       coalesce(bool_or(r.email_policy='OWNER_STUDENT_COORDINATOR'),false) AS coordinator_student_exception,
       coalesce(bool_or(r.protected_owner),false) AS protected_owner
     FROM user_access_assignment a LEFT JOIN user_role_assignment r USING(access_assignment_id)
     WHERE a.clerk_user_id=$1 GROUP BY a.access_assignment_id`, [userId]));
  return {
    find,
    async initializeStudent(userId) {
      // Unique constraint serializes concurrent inserts. DO NOTHING preserves all existing assignments.
      await query(
        "INSERT INTO user_access_assignment (clerk_user_id, app_role, access_status) VALUES ($1, 'STUDENT', 'ACTIVE') ON CONFLICT (clerk_user_id) DO NOTHING", [userId]);
      // Separate statement gets a fresh committed snapshot after a concurrent insert.
      const assignment = await find(userId);
      if (!assignment) throw new Error('Access assignment unavailable');
      return assignment;
    },
  };
}
export function createNeonAccessRepository(databaseUrl: string): AccessRepository {
  if (!databaseUrl) throw new Error('Database configuration is missing');
  const sql = neon(databaseUrl);
  return createAccessRepository((text, params) => sql.query(text, params));
}
