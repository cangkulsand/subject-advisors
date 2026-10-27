import { neon, Pool } from '@neondatabase/serverless';
import type { OfferingDatabase } from './repository';
import { createOfferingRepository } from './repository';

/** Existing Neon driver only. All interactive connections live within one request. */
export function createNeonOfferingRepository(databaseUrl: string) {
  if (!databaseUrl) throw new Error('Offering database configuration is missing');
  const sql = neon(databaseUrl);
  const db: OfferingDatabase = {
    async query(text, parameters) {
      return await sql.query(text, parameters) as Record<string, unknown>[];
    },
    async transaction(work) {
      const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
      try {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          try {
            const result = await work({
              query: async (text, parameters) => (await connection.query<Record<string, unknown>>(text, parameters)).rows,
            });
            await connection.query('COMMIT');
            return result;
          } catch (error) {
            await connection.query('ROLLBACK').catch(() => undefined);
            throw error;
          }
        } finally { connection.release(); }
      } finally { await pool.end(); }
    },
  };
  return createOfferingRepository(db);
}
