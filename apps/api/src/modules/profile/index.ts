import { neon } from '@neondatabase/serverless';
import { createAuthDependencies, type AuthBindings } from '../auth';
import { createProfileRepository, createProfileReader } from './repository';
import { createRecordsRepository } from '../records/repository';
import type { Query } from './contracts';
export { handleP001Request } from './routes';
export { createProfileReader, createProfileRepository } from './repository';
export { createRecordsRepository } from '../records/repository';
export function createP001Dependencies(env: AuthBindings) {
  const sql = neon(env.DATABASE_URL);
  const query: Query = async (text, parameters) => await sql.query(text, parameters) as Record<string, unknown>[];
  const profiles = createProfileRepository(query);
  return { auth: createAuthDependencies(env, createProfileReader(profiles)), profiles, records: createRecordsRepository(query) };
}
