import { neon } from '@neondatabase/serverless';
import type { AuthBindings } from '../auth';
import type { AccessRepository, AuthDependencies, InvitationRedeemer } from '../auth/contracts';
import { createAdminRepository } from './repository';
import { createAdminIdentities } from './identities';
import { createInvitationRedeemerFor } from './redemption';
import { handleAdminRequest } from './routes';
export { handleAdminRequest } from './routes';
function createRepository(databaseUrl: string) {
  const sql = neon(databaseUrl);
  // sql.transaction submits the statements as one non-interactive HTTP transaction (BEGIN ... COMMIT, rolled back on any error).
  return createAdminRepository(
    async (text, values) => await sql.query(text, values) as Record<string, unknown>[],
    async statements => await sql.transaction(statements.map(statement => sql.query(statement.text, statement.values))) as Record<string, unknown>[][],
  );
}
export function createAdminHandler(env: AuthBindings, auth: AuthDependencies) {
  const repository = createRepository(env.DATABASE_URL);
  const identities = createAdminIdentities(env.CLERK_SECRET_KEY);
  return (request: Request) => handleAdminRequest(request, { auth, repository, identities });
}
/** First-sign-in invitation redemption for the auth module (set as AuthDependencies.invitations). */
export function createInvitationRedeemer(env: Pick<AuthBindings, 'DATABASE_URL'>, access: Pick<AccessRepository, 'find'>): InvitationRedeemer {
  return createInvitationRedeemerFor(createRepository(env.DATABASE_URL), access);
}
