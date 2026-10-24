import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { describe, it, expect } from 'vitest';

// Opt-in, real Neon test. Temporary table shadows the app table only inside each
// transaction and drops at commit. Use a dedicated development/test database.
const url = process.env.AUTH_TEST_DATABASE_URL;
describe.skipIf(!url)('P004 migration on Neon (explicit test credentials required)', () => {
  async function transaction(statements: { text: string; params?: string[] }[]) {
    const sql = neon(url!);
    const migration = (await readFile('db/migrations/20261024_p004_user_access_assignment.sql', 'utf8'))
      .replace('CREATE TABLE', 'CREATE TEMP TABLE').replace(/\);\s*$/, ') ON COMMIT DROP;');
    return sql.transaction([sql.query(migration), ...statements.map(s => sql.query(s.text, s.params ?? []))]);
  }
  const insert = "INSERT INTO user_access_assignment (clerk_user_id, app_role, access_status) VALUES ($1, $2, $3)";
  it('creates and reuses one assignment while preserving a suspension', async () => {
    const results = await transaction([
      { text: insert, params: ['user_test', 'SYSTEM_ADMIN', 'SUSPENDED'] },
      { text: insert + ' ON CONFLICT (clerk_user_id) DO NOTHING', params: ['user_test', 'STUDENT', 'ACTIVE'] },
      { text: 'SELECT app_role, access_status FROM user_access_assignment' },
    ]);
    expect(results[3]).toEqual([{ app_role: 'SYSTEM_ADMIN', access_status: 'SUSPENDED' }]);
  });
  it.each([
    ['', 'STUDENT', 'ACTIVE'], ['user_test', 'OWNER', 'ACTIVE'], ['user_test', 'STUDENT', 'ENABLED'],
  ])('rejects invalid assignment %s/%s/%s', async (id, role, status) => {
    await expect(transaction([{ text: insert, params: [id, role, status] }])).rejects.toThrow();
  });
  it('enforces unique Clerk IDs', async () => {
    await expect(transaction([
      { text: insert, params: ['user_test', 'STUDENT', 'ACTIVE'] },
      { text: insert, params: ['user_test', 'STUDENT', 'ACTIVE'] },
    ])).rejects.toThrow();
  });
});
