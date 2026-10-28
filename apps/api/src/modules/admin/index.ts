import { neon } from '@neondatabase/serverless';
import type { AuthBindings } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { createAdminRepository } from './repository';
import { createAdminIdentities } from './identities';
import { handleAdminRequest } from './routes';
export { handleAdminRequest } from './routes';
export function createAdminHandler(env: AuthBindings, auth: AuthDependencies) {
  const sql = neon(env.DATABASE_URL);
  const repository = createAdminRepository(async (text, values) => await sql.query(text, values) as Record<string, unknown>[]);
  const identities = createAdminIdentities(env.CLERK_SECRET_KEY);
  return (request: Request) => handleAdminRequest(request, { auth, repository, identities });
}
