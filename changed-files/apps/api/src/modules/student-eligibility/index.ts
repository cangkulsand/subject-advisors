import { neon } from '@neondatabase/serverless';
import type { AuthBindings, AuthDependencies } from '../auth';
import { createStudentEligibilityReader } from './repository';
import { handleStudentEligibilityRequest } from './routes';
import { createSemesterSelectionRepository } from './selection-repository';
import { handleSemesterSelectionRequest } from './selection-routes';
export { handleStudentEligibilityRequest } from './routes';
export { createStudentEligibilityReader } from './repository';
export { handleSemesterSelectionRequest } from './selection-routes';
export { createSemesterSelectionRepository, buildSelectionSaveStatements } from './selection-repository';

/** The integrated P001 auth dependency includes its real profile reader. */
export function createStudentEligibilityHandler(env: Pick<AuthBindings, 'DATABASE_URL'>, auth: AuthDependencies) {
  const sql = neon(env.DATABASE_URL);
  const reader = createStudentEligibilityReader(async (text, values) => await sql.query(text, values) as Record<string, unknown>[]);
  const selections = createSemesterSelectionRepository({
    query: async (text, values) => await sql.query(text, values) as Record<string, unknown>[],
    transaction: async commands => await sql.transaction(commands.map(command => sql.query(command.text, command.params)), { isolationLevel: 'Serializable' }) as Record<string, unknown>[][],
  });
  return async (request: Request) => await handleSemesterSelectionRequest(request, { auth, reader, selections }) ?? handleStudentEligibilityRequest(request, { auth, reader });
}
