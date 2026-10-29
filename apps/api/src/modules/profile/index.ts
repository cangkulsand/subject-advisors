import { neon } from '@neondatabase/serverless';
import { createAuthDependencies, type AuthBindings } from '../auth';
import { createReferenceCache, isCurriculumCacheEnabled, type CacheBindings } from '../../cache/redis';
import { createProfileRepository, createProfileReader } from './repository';
import { createRecordsRepository } from '../records/repository';
import type { Query } from './contracts';
type P001Bindings = AuthBindings & Partial<CacheBindings>;
export { handleP001Request } from './routes';
export { createProfileReader, createProfileRepository } from './repository';
export { createRecordsRepository } from '../records/repository';
export function createP001Dependencies(env: P001Bindings) {
  const sql = neon(env.DATABASE_URL);
  const query: Query = async (text, parameters) => await sql.query(text, parameters) as Record<string, unknown>[];
  const referenceCache = createReferenceCache(env, {
    observe: event => {
      if (env.REDIS_CACHE_ENABLED !== 'true') return;
      console.info(JSON.stringify({
        event: 'reference_cache',
        kind: event.kind,
        outcome: event.outcome,
        lookupDurationMs: event.lookupDurationMs,
        redisDurationMs: event.redisDurationMs,
        dbLoads: event.dbLoads,
      }));
    },
  });
  const profiles = createProfileRepository(query, referenceCache, {
    curriculumCacheEnabled: isCurriculumCacheEnabled(env),
  });
  return { auth: createAuthDependencies(env, createProfileReader(profiles)), profiles, records: createRecordsRepository(query) };
}
