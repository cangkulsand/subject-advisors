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
  return {
    clerkUserId: row.clerk_user_id,
    appRole: row.app_role as AccessAssignment['appRole'],
    accessStatus: row.access_status as AccessAssignment['accessStatus'],
  };
}

export function createAccessRepository(query: SqlQuery): AccessRepository {
  const find = async (userId: string) => assignmentFrom(await query(
    'SELECT clerk_user_id, app_role, access_status FROM user_access_assignment WHERE clerk_user_id = $1', [userId]));
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
