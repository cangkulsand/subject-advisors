import { neon } from '@neondatabase/serverless';
import { createP001Dependencies } from '../profile';
import type { AuthBindings } from '../auth';
import { createAcademicSetupRepository } from '../admin/academic-repository';
import { createSprint2Repository,neonDatabase } from './repository';
import type { CoordinatorScopes } from './routes';
export { handleSprint2Request } from './routes';
/** Coordinator scope for curriculum editing (S3-P004-041): the programmes of the account's live assignments, faculty rows expanded. */
export function coordinatorScopes(url: string): CoordinatorScopes {
  const sql = neon(url);
  const query = async (text: string, values: unknown[]) => await sql.query(text, values) as Record<string, unknown>[];
  const reader = createAcademicSetupRepository(query, async () => { throw new Error('Curriculum scope reads only'); });
  return { async programmeIds(clerkUserId) { return [...new Set((await reader.listScopes(clerkUserId)).map(scope => scope.programmeId))]; } };
}
export function createSprint2Dependencies(env: AuthBindings) {
  const p001=createP001Dependencies(env);
  return { ...p001,repository:createSprint2Repository(neonDatabase(env.DATABASE_URL)),scopes:coordinatorScopes(env.DATABASE_URL) };
}
