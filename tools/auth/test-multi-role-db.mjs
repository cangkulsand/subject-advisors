// Disposable loopback PostgreSQL only. Never reads .dev.vars or DATABASE_URL.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import { loadMigrations, applyMigrations } from '../db/migrations.mjs';
import { verifyGrantIdentity, provisionRoles } from './role-provisioning.mjs';

const cache = resolve('.wrangler/multi-role-postgres');
const bin = process.env.MULTI_ROLE_POSTGRES_BIN || join(cache, 'node_modules/@embedded-postgres/windows-x64/native/bin');
await mkdir(cache, { recursive: true });
const run = await mkdtemp(join(cache, 'run-'));
const data = join(run, 'data');
function command(name, args) {
  const result = spawnSync(join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args,
    { encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' });
  if (result.error || result.status !== 0) throw new Error(name + ' failed: ' + (result.error?.message || result.stderr || result.stdout));
}
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
command('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--locale=C']);
let started = false;
const clients = [];
async function connect() {
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'utm_db_foundation_multi_role_test' });
  await client.connect(); clients.push(client); return client;
}
try {
  command('pg_ctl', ['-D', data, '-l', join(run, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + port, '-w', 'start']);
  started = true;
  const admin = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
  await admin.connect();
  try { await admin.query('CREATE DATABASE utm_db_foundation_multi_role_test'); } finally { await admin.end(); }
  const db = await connect(), migrations = await loadMigrations();
  await applyMigrations(db, migrations.filter(m => m.version < '0004'));
  await db.query("INSERT INTO user_access_assignment(clerk_user_id,app_role,access_status) VALUES ('__BACKFILL_STUDENT__','STUDENT','ACTIVE'),('__BACKFILL_COORDINATOR__','COORDINATOR','ACTIVE')");
  await applyMigrations(db, migrations);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM user_role_assignment')).rows[0].count, 2);
  console.log('PASS existing account roles backfilled without new privileges');
  for (const file of ['001_schema_verification.sql', '004_profile_current_semester.sql', '005_multi_role_access.sql', '002_behavior_tests.sql', '003_role_boundary_tests.sql', '006_multi_role_behavior_tests.sql']) {
    const results = await db.query(await readFile('db/checks/' + file, 'utf8'));
    const rows = (Array.isArray(results) ? results.flatMap(r => r.rows || []) : results.rows).filter(r => r.test_name);
    assert.ok(rows.every(r => r.status === 'PASS'), JSON.stringify(rows.filter(r => r.status !== 'PASS')));
    console.log('PASS ' + file + ' (' + rows.length + ' assertions)');
  }
  async function grant(client, id) {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('app.access_actor','__RACE_OPERATOR__',true),set_config('app.access_reason','Synthetic concurrency test.',true)");
      const { rows: [account] } = await client.query("INSERT INTO user_access_assignment(clerk_user_id,app_role,access_status) VALUES ($1,'STUDENT','ACTIVE') RETURNING access_assignment_id", [id]);
      await client.query("INSERT INTO user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,granted_by_clerk_user_id,grant_reason) VALUES ($1,'SYSTEM_ADMIN','ROLE_DOMAIN','OPERATOR','__RACE_OPERATOR__','Synthetic administrator race fixture.')", [account.access_assignment_id]);
      await client.query('COMMIT'); return account.access_assignment_id;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  async function race(kind) {
    const ids = [await grant(db, '__RACE_' + kind + '_A__'), await grant(db, '__RACE_' + kind + '_B__')];
    await db.query('BEGIN');
    await db.query("SELECT set_config('app.access_actor','__RACE_OPERATOR__',true),set_config('app.access_reason','Prepare isolated administrator race.',true)");
    await db.query("DELETE FROM user_role_assignment WHERE app_role='SYSTEM_ADMIN' AND access_assignment_id<>ALL($1::int[])", [ids]);
    await db.query('COMMIT');
    const a = await connect(), b = await connect();
    for (const client of [a, b]) {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='8s'");
      await client.query("SELECT set_config('app.access_actor','__RACE_OPERATOR__',true),set_config('app.access_reason','Concurrent administrator removal.',true)");
    }
    const sql = kind === 'revoke'
      ? "DELETE FROM user_role_assignment WHERE access_assignment_id=$1 AND app_role='SYSTEM_ADMIN'"
      : "UPDATE user_access_assignment SET access_status='SUSPENDED' WHERE access_assignment_id=$1";
    await a.query(sql, [ids[0]]);
    const pending = b.query(sql, [ids[1]]).then(() => ({ accepted: true }), error => ({ error }));
    const pid = b.processID;
    let waiting = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      waiting = (await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock';
      if (waiting) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(waiting, 'second administrator mutation must contend on the transaction lock');
    await a.query('COMMIT');
    const result = await pending;
    await b.query('ROLLBACK');
    assert.equal(result.error?.code, '23514', 'second mutation must preserve the last active administrator');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM user_role_assignment r JOIN user_access_assignment a USING(access_assignment_id) WHERE r.app_role='SYSTEM_ADMIN' AND a.access_status='ACTIVE'")).rows[0].count, 1);
    console.log('PASS concurrent administrator ' + kind + ' preserves the last active administrator');
  }
  await race('revoke');
  await race('suspend');
  const owner={id:'user_bootstrapfixture',primaryEmailAddressId:'email_fixture',emailAddresses:[{id:'email_fixture',emailAddress:'owner@graduate.utm.my',verification:{status:'verified'}}]};
  const request=verifyGrantIdentity(owner,{userId:owner.id,expectedEmail:'owner@graduate.utm.my',roles:['STUDENT','COORDINATOR','SYSTEM_ADMIN'],owner:true,actor:'__TEST_OPERATOR__',reason:'Explicit verified owner provisioning fixture.'});
  assert.equal((await provisionRoles(db,request)).mode,'DRY_RUN');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM user_access_assignment WHERE clerk_user_id=$1',[owner.id])).rows[0].count,0);
  const applied=await provisionRoles(db,request,true);assert.equal(applied.memberships.length,3);
  assert.ok(applied.memberships.some(role=>role.app_role==='SYSTEM_ADMIN'&&role.protected_owner));
  const beforeAudit=(await db.query('SELECT count(*)::int AS count FROM user_role_audit_log')).rows[0].count;
  await provisionRoles(db,request,true);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM user_role_audit_log')).rows[0].count,beforeAudit,'idempotent provisioning must not invent grant audit events');
  await assert.rejects(provisionRoles(db,{...request,userId:'user_replacementfixture'},true),/Another protected owner/);
  const coordinator={...owner,id:'user_coordinatorfixture',emailAddresses:[{...owner.emailAddresses[0],emailAddress:'approved@utm.my'}]};
  const staffRequest=verifyGrantIdentity(coordinator,{...request,userId:coordinator.id,expectedEmail:'approved@utm.my',roles:['COORDINATOR'],owner:false});
  assert.deepEqual((await provisionRoles(db,staffRequest,true)).memberships.map(role=>role.app_role),['COORDINATOR']);
  console.log('PASS trusted provisioning dry-run, audited/idempotent owner grants, owner-rotation denial and coordinator-only grants');
  console.log('PASS isolated PostgreSQL multi-role migration, permissions, audit, owner protection and concurrency');
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
}
