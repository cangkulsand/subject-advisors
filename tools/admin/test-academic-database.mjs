// Disposable loopback PostgreSQL only. Never reads .dev.vars or DATABASE_URL.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import { loadMigrations, applyMigrations } from '../db/migrations.mjs';
import { runAcademicRaces } from './academic-database-races.mjs';

const cache = resolve('.wrangler/multi-role-postgres');
const bin = process.env.MULTI_ROLE_POSTGRES_BIN || join(cache,'node_modules/@embedded-postgres/windows-x64/native/bin');
await mkdir(cache,{recursive:true});
const run=await mkdtemp(join(cache,'admin-academic-run-'));
const data=join(run,'data');
function command(name,args){
  const result=spawnSync(join(bin,name+(process.platform==='win32'?'.exe':'')),args,
    {encoding:'utf8',windowsHide:true,timeout:30000,stdio:name==='pg_ctl'?'ignore':'pipe'});
  if(result.error||result.status!==0)throw new Error(name+' failed: '+(result.error?.message||result.stderr||result.stdout));
}
const socket=createServer();
await new Promise(done=>socket.listen(0,'127.0.0.1',done));
const port=socket.address().port;
await new Promise(done=>socket.close(done));
command('initdb',['-D',data,'-U','postgres','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--locale=C']);
let started=false;
const clients=[];
async function connect(database){
  const client=new Client({host:'127.0.0.1',port,user:'postgres',database});
  await client.connect();clients.push(client);return client;
}
try{
  command('pg_ctl',['-D',data,'-l',join(run,'postgres.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);
  started=true;
  const admin=await connect('postgres');
  await admin.query('CREATE DATABASE utm_db_foundation_admin_academic_test');
  const db=await connect('utm_db_foundation_admin_academic_test');
  const entries=await loadMigrations();
  assert.deepEqual(await applyMigrations(db,entries),entries.map(item=>item.version));
  assert.deepEqual(await applyMigrations(db,entries),[]);
  console.log('PASS ordered migrations and repeated no-op');
  for(const file of ['001_schema_verification.sql','004_profile_current_semester.sql','005_multi_role_access.sql',
    '007_network_security_reference.sql','008_admin_user_management.sql','012_admin_academic_setup.sql',
    '002_behavior_tests.sql','003_role_boundary_tests.sql','006_multi_role_behavior_tests.sql',
    '009_admin_user_management_behavior_tests.sql','013_admin_academic_setup_behavior.sql']){
    const response=await db.query(await readFile('db/checks/'+file,'utf8'));
    const rows=(Array.isArray(response)?response.flatMap(result=>result.rows||[]):response.rows).filter(row=>row.test_name);
    if(file.includes('behavior')||file.includes('boundary'))assert.ok(rows.length>0,file+' returned no assertions');
    assert.ok(rows.every(row=>row.status==='PASS'||row.status.startsWith('SKIP:')),
      file+': '+JSON.stringify(rows.filter(row=>row.status!=='PASS')));
    console.log('PASS '+file+' ('+rows.length+' assertions)');
  }
  const repositoryTests=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.auth.config.ts',
    'apps/api/src/modules/admin/academic-repository.database.test.ts'],{
    encoding:'utf8',windowsHide:true,timeout:120000,
    env:{...process.env,ACADEMIC_TEST_DATABASE_URL:`postgresql://postgres@127.0.0.1:${port}/utm_db_foundation_admin_academic_test`},
  });
  process.stdout.write(repositoryTests.stdout||'');
  process.stderr.write(repositoryTests.stderr||'');
  assert.equal(repositoryTests.status,0,'Academic repository PostgreSQL suite failed: '+(repositoryTests.error?.message||repositoryTests.status));
  await runAcademicRaces(db,()=>connect('utm_db_foundation_admin_academic_test'));
}finally{
  await Promise.allSettled(clients.map(client=>client.end()));
  if(started)command('pg_ctl',['-D',data,'-m','fast','-w','stop']);
}
