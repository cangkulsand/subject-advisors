// DEVELOPMENT ONLY. Exercises migration 0015 (owner moves to the gmail System Admin, S3-P004-033) against
// rollback-only synthetic accounts. On a fresh database the pinned production Clerk IDs are absent, so the real
// apply is a no-op; this check swaps the pinned IDs for fixtures and runs the same SQL inside a transaction.
import assert from 'node:assert/strict';

export const PINNED_FROM = 'user_3L9068HIQmPtA3AzFTo6bBpRAyO';
export const PINNED_TO = 'user_3MPgmlCxY4NFIuYgPaypFquJ0l6';
const FROM = '__DB_OWNER_FROM__', TO = '__DB_OWNER_TO__';

const roles = async (db, clerk) => (await db.query(
  `SELECT r.app_role, r.protected_owner FROM public.user_role_assignment r JOIN public.user_access_assignment a USING(access_assignment_id)
   WHERE a.clerk_user_id=$1 ORDER BY r.app_role`, [clerk])).rows.map(row => row.app_role + (row.protected_owner ? '*' : ''));

async function seed(db, { toHasAdmin = true } = {}) {
  await db.query("SELECT set_config('app.access_actor','__DB_OWNER_TEST__',true), set_config('app.access_reason','Synthetic owner transfer fixture.',true)");
  await db.query("INSERT INTO public.user_access_assignment(clerk_user_id,app_role,access_status) VALUES ($1,'STUDENT','ACTIVE'),($2,'STUDENT','ACTIVE')", [FROM, TO]);
  const grant = (clerk) => db.query(`INSERT INTO public.user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason)
    SELECT access_assignment_id,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR','__DB_OWNER_TEST__','Synthetic admin.' FROM public.user_access_assignment WHERE clerk_user_id=$1`, [clerk]);
  await grant(FROM);
  if (toHasAdmin) await grant(TO);
  await db.query("SELECT set_config('app.protected_owner_bootstrap','VERIFIED_CLERK_ID',true)");
  await db.query(`UPDATE public.user_role_assignment SET protected_owner=true WHERE app_role='SYSTEM_ADMIN'
    AND access_assignment_id=(SELECT access_assignment_id FROM public.user_access_assignment WHERE clerk_user_id=$1)`, [FROM]);
  await db.query("SELECT set_config('app.protected_owner_bootstrap','',true)");
}

/** Returns the assertion names that passed; throws on the first failure. */
export async function runOwnerTransferChecks(db, migrationSql) {
  assert.ok(migrationSql.includes(PINNED_FROM) && migrationSql.includes(PINNED_TO), '0015 must pin both production Clerk IDs');
  const sql = migrationSql.replaceAll(PINNED_FROM, FROM).replaceAll(PINNED_TO, TO);
  const passed = [];
  await db.query('BEGIN');
  try {
    if ((await db.query('SELECT 1 FROM public.user_role_assignment WHERE protected_owner')).rows.length) {
      passed.push('SKIP: database already has a protected owner');
      return passed;
    }
    await db.query('SAVEPOINT unexpected_state');
    await seed(db, { toHasAdmin: false });
    await assert.rejects(db.query(sql), /0015/, 'unexpected state must abort');
    await db.query('ROLLBACK TO SAVEPOINT unexpected_state');
    assert.deepEqual(await roles(db, FROM), [], 'abort leaves nothing behind');
    passed.push('aborts and changes nothing when the gmail account has no SYSTEM_ADMIN');

    await seed(db);
    await db.query(sql);
    assert.deepEqual(await roles(db, TO), ['STUDENT', 'SYSTEM_ADMIN*'], 'gmail account is the owner');
    assert.deepEqual(await roles(db, FROM), ['STUDENT'], 'graduate account keeps STUDENT only');
    passed.push('moves the owner to the gmail account and leaves the graduate account STUDENT only');

    const audit = (await db.query(`SELECT a.clerk_user_id, l.action, l.app_role, l.protected_owner FROM public.user_role_audit_log l
      JOIN public.user_access_assignment a USING(access_assignment_id) WHERE l.performed_by_clerk_user_id='__MIGRATION_0015__' ORDER BY l.user_role_audit_log_id`)).rows
      .map(row => [row.clerk_user_id, row.action, row.app_role, row.protected_owner]);
    assert.deepEqual(audit, [[FROM, 'PROTECT_OWNER', 'SYSTEM_ADMIN', false], [TO, 'PROTECT_OWNER', 'SYSTEM_ADMIN', true], [FROM, 'REVOKE', 'SYSTEM_ADMIN', false]]);
    passed.push('audits both owner changes and the revoke');

    const trigger = (await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='user_role_audit_guard'")).rows[0];
    assert.equal(trigger?.tgenabled, 'O', 'owner lock trigger is enabled again');
    await db.query('SAVEPOINT lock');
    await db.query("SELECT set_config('app.access_actor','__DB_OWNER_TEST__',true), set_config('app.access_reason','try',true)");
    await assert.rejects(db.query(`UPDATE public.user_role_assignment SET protected_owner=false WHERE protected_owner`), /Protected owner administrator membership cannot be changed/);
    await db.query('ROLLBACK TO SAVEPOINT lock');
    passed.push('restores the owner lock');

    await db.query(sql);
    assert.deepEqual(await roles(db, TO), ['STUDENT', 'SYSTEM_ADMIN*']);
    passed.push('a second run is a no-op');
  } finally {
    await db.query('ROLLBACK');
  }
  await db.query(sql.replaceAll(FROM, '__DB_ABSENT_A__').replaceAll(TO, '__DB_ABSENT_B__'));
  passed.push('is a no-op when neither pinned account exists');
  return passed;
}
