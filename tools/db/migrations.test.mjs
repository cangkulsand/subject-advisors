import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {loadMigrations,validateTarget,verifyConnectedTarget,migrationStatus,applyMigrations} from './migrations.mjs';
import {reviewSchema} from './review.mjs';

const target={kind:'local-disposable',development:true,disposable:true,approvedForSchemaCreation:true,approvedBy:'explicit test approval',host:'127.0.0.1',port:55432,database:'utm_db_foundation_test',connectionStringEnvironmentVariable:'DB_FOUNDATION_URL'};
const environment={DB_FOUNDATION_URL:'postgresql://test:test@127.0.0.1:55432/utm_db_foundation_test'};
const entry={version:'0001',file:'0001_test.sql',sha256:'a'.repeat(64),sql:'-- TEST-ONLY synthetic DDL'};
function client({applied=[],tables=[],fail=false}={}){
 const queries=[];
 return {queries,async query(sql,params){
   queries.push({sql,params});
   if(sql.startsWith('SELECT to_regclass'))return {rows:[{tracked:applied.length>0}]};
   if(sql.startsWith('SELECT version,filename,sha256'))return {rows:applied};
   if(sql.startsWith('SELECT c.relname'))return {rows:tables.map(relname=>({relname}))};
   if(fail&&sql===entry.sql)throw Error('simulated DDL failure');
   return {rows:[]};
 }};
}
test('authoritative source maps exactly 26 entities, 171 fields and 39 FKs; native SQL and PL/pgSQL syntax parses',async()=>{
 const result=await reviewSchema();
 assert.equal(result.domainTables,26);assert.equal(result.columns,171);assert.equal(result.explicitForeignKeys,39);
 assert.equal(result.databaseExecution,'NOT_PERFORMED_BY_STATIC_REVIEW');
});
test('ordered canonical manifest includes the forward profile semester extension and excludes superseded UUID migration',async()=>{
 const entries=await loadMigrations();
 assert.deepEqual(entries.map(m=>m.version),['0000','0001','0002','0003']);
 assert.ok(entries.every(m=>m.sha256.length===64));
 assert.ok(entries.every(m=>!m.file.startsWith('20261024')));
 assert.match(entries.at(-1).sql,/ADD COLUMN current_semester_id integer NULL/);
 assert.match(entries.at(-1).sql,/REFERENCES public\.academic_semester \(semester_id\)\s+ON DELETE RESTRICT/);
 assert.doesNotMatch(entries.at(-1).sql,/UPDATE public\.student_profile|DEFAULT|NOT NULL/i);
});
test('refuses unapproved, non-development and default application credentials',()=>{
 assert.throws(()=>validateTarget({...target,approvedForSchemaCreation:false},environment));
 assert.throws(()=>validateTarget({...target,development:false},environment));
 assert.throws(()=>validateTarget({...target,connectionStringEnvironmentVariable:'DATABASE_URL'},{DATABASE_URL:environment.DB_FOUNDATION_URL}));
});
test('local approval is bound to loopback, exact port and isolated database name',()=>{
 assert.equal(validateTarget(target,environment),environment.DB_FOUNDATION_URL);
 assert.throws(()=>validateTarget({...target,database:'production'},environment));
 assert.throws(()=>validateTarget(target,{DB_FOUNDATION_URL:environment.DB_FOUNDATION_URL.replace('55432','5432')}));
});
test('Neon target requires exact project, branch and encrypted transport',()=>{
 const neon={...target,kind:'neon-development',host:'ep-test.neon.tech',port:5432,database:'neondb',projectId:'project-test',branchId:'branch-test',disposable:false};
 const env={DB_FOUNDATION_URL:'postgresql://test:test@ep-test.neon.tech/neondb?sslmode=require'};
 assert.equal(validateTarget(neon,env),env.DB_FOUNDATION_URL);
 assert.throws(()=>validateTarget({...neon,branchId:null},env));
 assert.throws(()=>validateTarget(neon,{DB_FOUNDATION_URL:env.DB_FOUNDATION_URL.split('?')[0]}));
});
test('connected branch identity is checked before any schema operation',async()=>{
 const mock={query:async()=>({rows:[{database:'neondb',server_version:180006,project_id:'project-test',branch_id:'production-branch'}]})};
 await assert.rejects(verifyConnectedTarget(mock,{kind:'neon-development',database:'neondb',projectId:'project-test',branchId:'dev-branch'}));
});
test('history rejects checksum drift and unknown versions',async()=>{
 await assert.rejects(migrationStatus(client({applied:[{version:'0001',filename:entry.file,sha256:'b'.repeat(64)}]}),[entry]));
 await assert.rejects(migrationStatus(client({applied:[{version:'9999',filename:'unknown',sha256:entry.sha256}]}),[entry]));
});
test('first application locks, writes schema and records checksum in the same transaction',async()=>{
 const c=client();assert.deepEqual(await applyMigrations(c,[entry]),['0001']);
 assert.equal(c.queries[0].sql,'BEGIN');
 assert.ok(c.queries.some(q=>q.sql.includes('pg_advisory_xact_lock')));
 assert.ok(c.queries.some(q=>q.sql===entry.sql));
 assert.deepEqual(c.queries.find(q=>q.sql.startsWith('INSERT INTO migration_meta')).params,['0001',entry.file,entry.sha256]);
 assert.equal(c.queries.at(-1).sql,'COMMIT');
});
test('repeated migration is idempotent and does not rerun DDL',async()=>{
 const c=client({applied:[{version:entry.version,filename:entry.file,sha256:entry.sha256}]});
 assert.deepEqual(await applyMigrations(c,[entry]),[]);
 assert.ok(!c.queries.some(q=>q.sql===entry.sql));
});
test('existing schema is rejected unless explicitly recognized legacy adoption is approved',async()=>{
 await assert.rejects(applyMigrations(client({tables:['user_access_assignment']}),[entry]));
 await assert.rejects(applyMigrations(client({tables:['student_profile']}),[entry],{allowLegacyP004Adoption:true}));
 const c=client({tables:['user_access_assignment']});
 assert.deepEqual(await applyMigrations(c,[entry],{allowLegacyP004Adoption:true}),['0001']);
});
test('DDL failure rolls back and never commits partial migration state',async()=>{
 const c=client({fail:true});await assert.rejects(applyMigrations(c,[entry]));
 assert.equal(c.queries.at(-1).sql,'ROLLBACK');assert.ok(!c.queries.some(q=>q.sql==='COMMIT'));
});
test('CLI refuses migration without an explicit target even if DATABASE_URL exists',()=>{
 const result=spawnSync(process.execPath,['tools/db/cli.mjs','migrate'],{encoding:'utf8',env:{...process.env,DATABASE_URL:'postgresql://test:test@production.invalid/db'},timeout:10000,windowsHide:true});
 assert.equal(result.status,1);assert.match(result.stderr,/EXPLICIT_TARGET_FILE_REQUIRED/);
});
