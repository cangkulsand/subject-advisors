import { neon } from '@neondatabase/serverless';
import type { AuthBindings } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { createAcademicSetupRepository } from '../admin/academic-repository';
import { createDbScopeProvider } from './scope-provider';
import { createForecastingRepository } from './repository';
import { createOfferingsRepository } from './offerings-repository';
import { createForecastRunsRepository } from './runs-repository';
import { handleForecastingRequest } from './routes';
export { handleForecastingRequest } from './routes';

export function createForecastingHandler(env: Pick<AuthBindings, 'DATABASE_URL'>, auth: AuthDependencies) {
  const sql = neon(env.DATABASE_URL);
  // sql.transaction submits the statements as one non-interactive HTTP transaction (BEGIN ... COMMIT, rolled back on any error).
  const query = async (text: string, values: unknown[]) => await sql.query(text, values) as Record<string, unknown>[];
  const transaction = async (statements: Array<{ text: string; values: unknown[] }>) =>
    await sql.transaction(statements.map(statement => sql.query(statement.text, statement.values))) as Record<string, unknown>[][];
  const repository = createForecastingRepository(query, transaction);
  const runs = createForecastRunsRepository(query, transaction);
  const offerings = createOfferingsRepository(query, transaction);
  // Live, uncached reads of the admin academic setup (migration 0008): assignments, current semester, active centres.
  const scopes = createDbScopeProvider(createAcademicSetupRepository(query, transaction));
  return (request: Request) => handleForecastingRequest(request, { auth, repository, runs, offerings, scopes });
}
