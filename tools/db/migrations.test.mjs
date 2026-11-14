import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
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
test('ordered canonical manifest includes registered forward extensions and excludes superseded UUID migration',async()=>{
 const entries=await loadMigrations();
 assert.deepEqual(entries.map(m=>m.version),['0000','0001','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011']);
 assert.ok(entries.every(m=>m.sha256.length===64));
 assert.ok(entries.every(m=>!m.file.startsWith('20261024')));
 assert.match(entries[3].sql,/ADD COLUMN current_semester_id integer NULL/);
 assert.match(entries[3].sql,/REFERENCES public\.academic_semester \(semester_id\)\s+ON DELETE RESTRICT/);
 assert.doesNotMatch(entries[3].sql,/UPDATE public\.student_profile|DEFAULT|NOT NULL/i);
 assert.match(entries[4].sql,/CREATE TABLE public\.user_role_assignment/);
 assert.match(entries[4].sql,/CREATE TABLE public\.user_role_audit_log/);
 assert.match(entries[4].sql,/email_policy IN \('ROLE_DOMAIN','OWNER_STUDENT_COORDINATOR'\)/);
 assert.match(entries[4].sql,/grant_source IN \('MIGRATION_COMPAT','LEGACY_INIT','OPERATOR'\)/);
 assert.match(entries[4].sql,/DROP TRIGGER preserve_last_admin/);
 assert.match(entries[4].sql,/Cannot remove the last active System Administrator/);
 assert.match(entries[4].sql,/Protected owner administrator membership cannot be removed/);
 assert.match(entries[4].sql,/REVOKE ALL ON public\.user_role_assignment FROM PUBLIC/);
 assert.doesNotMatch(entries[4].sql,/UPDATE public\.user_access_assignment\s+SET app_role/i);
});
test('0005 is additive only and registers the approved nullable curriculum metadata',async()=>{
 const entries=await loadMigrations();const migration=entries.find(m=>m.version==='0005');
 assert.ok(migration);assert.equal(migration.file,'0005_network_security_reference_support.sql');
 assert.match(migration.sql,/ADD COLUMN display_name varchar\(255\)/i);
 assert.match(migration.sql,/ADD COLUMN prerequisite_details jsonb/i);
 assert.match(migration.sql,/prerequisite_details \?& ARRAY\['expression','conditions','fixedCourseEdgesShown','sourcePrerequisiteStatus'\]/i);
 assert.match(migration.sql,/jsonb_typeof\(prerequisite_details->'conditions'\) = 'array'/i);
 assert.match(migration.sql,/CREATE TABLE migration_meta\.reference_data_imports/i);
 assert.match(migration.sql,/manifest_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/i);
 assert.match(migration.sql,/REFERENCES public\.curriculum\(curriculum_id\) ON DELETE RESTRICT/i);
 assert.match(migration.sql,/REVOKE ALL ON SCHEMA migration_meta FROM PUBLIC/i);
 assert.match(migration.sql,/REVOKE ALL ON migration_meta\.reference_data_imports FROM PUBLIC/i);
 assert.doesNotMatch(migration.sql,/\b(?:INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|TRUNCATE|DROP\s+(?:TABLE|COLUMN|SCHEMA))\b/i);
 assert.deepEqual([...migration.sql.matchAll(/CREATE\s+TABLE\s+([^\s(]+)/gi)].map(match=>match[1]),['migration_meta.reference_data_imports']);
 const review=await reviewSchema();assert.equal(review.sourceContractColumns,171);assert.equal(review.engineeringExtensionColumns,25);
});
test('0006 audits access-status changes and adds a protected pending-invitation table',async()=>{
 const entries=await loadMigrations();const migration=entries.find(m=>m.version==='0006');
 assert.ok(migration);assert.equal(migration.file,'0006_admin_user_management.sql');
 assert.match(migration.sql,/CREATE TRIGGER user_access_status_audit AFTER UPDATE OF access_status ON public\.user_access_assignment/);
 assert.match(migration.sql,/'ACCESS_STATUS_CHANGE'/);
 assert.match(migration.sql,/CREATE UNIQUE INDEX admin_user_invitation_one_pending_email_idx[^;]+WHERE status = 'PENDING'/);
 assert.match(migration.sql,/REFERENCES public\.user_access_assignment\(access_assignment_id\) ON DELETE RESTRICT/);
 assert.match(migration.sql,/BEFORE DELETE ON public\.admin_user_invitation/);
 assert.match(migration.sql,/REVOKE ALL ON public\.admin_user_invitation FROM PUBLIC/);
 assert.doesNotMatch(migration.sql,/\bprotected_owner\s+boolean|\bDROP\s+(?:TABLE|TRIGGER)|UPDATE\s+public\./i);
 assert.deepEqual([...migration.sql.matchAll(/CREATE\s+TABLE\s+([^\s(]+)/gi)].map(match=>match[1]),['public.admin_user_invitation']);
});
test('0007 adds programme-scoped forecast persistence and protected offering confirmation',async()=>{
 const entries=await loadMigrations();const migration=entries.find(m=>m.version==='0007');
 assert.ok(migration);assert.equal(migration.file,'0007_uc20_forecast_and_confirmation.sql');
 assert.match(migration.sql,/CREATE UNIQUE INDEX forecast_run_programme_scope_version_key[^;]+WHERE programme_id IS NOT NULL/);
 assert.match(migration.sql,/CREATE UNIQUE INDEX forecast_run_legacy_centre_version_key[^;]+WHERE programme_id IS NULL/);
 assert.match(migration.sql,/CREATE TRIGGER imported_student_freeze/);
 assert.match(migration.sql,/Confirmation requires a FINALIZED forecast run/);
 assert.match(migration.sql,/Subject is excluded from offering confirmation/);
 assert.match(migration.sql,/app\.offering_actor/);
 assert.match(migration.sql,/BEFORE UPDATE OR DELETE ON public\.confirmed_offering_audit/);
 assert.match(migration.sql,/REVOKE ALL ON public\.confirmed_offering_audit FROM PUBLIC/);
 assert.doesNotMatch(migration.sql.replace(/--.*$/gm,''),/coordinator_assignment|public\.faculty|is_current|ALTER TABLE public\.student_profile|student_offering_pick|DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|INSERT\s+INTO/i);
 assert.deepEqual([...migration.sql.matchAll(/CREATE\s+TABLE\s+([^\s(]+)/gi)].map(match=>match[1]),['public.forecast_adjustment_audit','public.offering_confirmation','public.confirmed_offering','public.confirmed_offering_audit']);
 const review=await reviewSchema();assert.equal(review.engineeringExtensionColumns,25);
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

// Mutate isolated copies so a checker regression cannot damage the checkout.
for(const [label,file,replace,expected] of [
 ['nonboolean NULL default','db/migrations/0008_admin_academic_setup.sql',s=>s.replace('is_current boolean NOT NULL DEFAULT false','is_current boolean NOT NULL DEFAULT NULL'),/COLUMN_SHAPE_MISMATCH/],
 ['nonliteral boolean default','db/migrations/0008_admin_academic_setup.sql',s=>s.replace('is_current boolean NOT NULL DEFAULT false',"is_current boolean NOT NULL DEFAULT (1=0)"),/COLUMN_SHAPE_MISMATCH/],
 ['nullable default','db/migrations/0008_admin_academic_setup.sql',s=>s.replace('faculty_id integer NULL REFERENCES','faculty_id integer NULL DEFAULT NULL REFERENCES'),/COLUMN_SHAPE_MISMATCH/],
 ['wrong required default','db/engineering-extensions.json',s=>s.replace('"default": false','"default": true'),/INVALID_ENGINEERING_EXTENSION_COLUMN/],
 ['unregistered required column','db/engineering-extensions.json',s=>s.replace('"name": "is_current"','"name": "unexpected"'),/INVALID_ENGINEERING_EXTENSION_COLUMN/],
 ['baseline type drift','db/migrations/0001_initial_schema.sql',s=>s.replace('programme_code varchar(20)','programme_code varchar(21)'),/COLUMN_MAPPING_MISMATCH/]
])test('schema review rejects '+label,async()=>{
 const root=await mkdtemp(join(tmpdir(),'academic-checker-'));
 try{
  await cp('db',join(root,'db'),{recursive:true});
  const path=join(root,file);const original=await readFile(path,'utf8');const changed=replace(original);
  assert.notEqual(changed,original,'fixture mutation must match');await writeFile(path,changed);
  await assert.rejects(reviewSchema(root),expected);
 }finally{
  const cleanupRoot=resolve(root);const parent=resolve(tmpdir());const boundary=relative(parent,cleanupRoot);
  assert.ok(boundary&&!boundary.startsWith('..')&&!isAbsolute(boundary)&&boundary.startsWith('academic-checker-'),'cleanup must stay in its generated temporary directory');
  await rm(cleanupRoot,{recursive:true,force:true});
 }
});
test('0008 follows the exact 0007 prefix and shared history remains enforced',async()=>{
 const entries=(await loadMigrations()).slice(0,9);assert.deepEqual(entries.slice(-2).map(m=>m.version),['0007','0008']);
 assert.doesNotMatch(entries.at(-1).sql,/confirmed_offering|forecast_configuration|confirmed_semester/i);
 const applied=entries.slice(0,-1).map(m=>({version:m.version,filename:m.file,sha256:m.sha256}));
 assert.deepEqual((await migrationStatus(client({applied}),entries)).pending.map(m=>m.version),['0008']);
 const eight=entries.at(-1);
 await assert.rejects(migrationStatus(client({applied:applied.filter(m=>m.version!=='0007').concat([{version:'0008',filename:eight.file,sha256:eight.sha256}])}),entries),/NOT_A_PREFIX/);
 await assert.rejects(migrationStatus(client({applied:applied.map(m=>m.version==='0007'?{...m,sha256:'0'.repeat(64)}:m)}),entries),/HISTORY_OR_CHECKSUM/);
});
test('0009 follows the exact 0008 prefix and stays additive',async()=>{
 const entries=(await loadMigrations()).slice(0,10);assert.deepEqual(entries.slice(-2).map(m=>m.version),['0008','0009']);
 assert.doesNotMatch(entries.at(-1).sql,/DROP\s|TRUNCATE\s+TABLE|ALTER\s+TABLE\s+public\.(offering_confirmation|confirmed_offering)/i);
 const applied=entries.slice(0,-1).map(m=>({version:m.version,filename:m.file,sha256:m.sha256}));
 assert.deepEqual((await migrationStatus(client({applied}),entries)).pending.map(m=>m.version),['0009']);
 const nine=entries.at(-1);
 await assert.rejects(migrationStatus(client({applied:applied.filter(m=>m.version!=='0008').concat([{version:'0009',filename:nine.file,sha256:nine.sha256}])}),entries),/NOT_A_PREFIX/);
 await assert.rejects(migrationStatus(client({applied:applied.map(m=>m.version==='0008'?{...m,sha256:'0'.repeat(64)}:m)}),entries),/HISTORY_OR_CHECKSUM/);
});
test('0010 follows the exact 0009 prefix, adds only the department level and stays additive',async()=>{
 const entries=(await loadMigrations()).slice(0,11);assert.deepEqual(entries.slice(-2).map(m=>m.version),['0009','0010']);
 const sql=entries.at(-1).sql;
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE|DELETE\s+FROM|INSERT\s+INTO\s+public\.(?:department|faculty|programme)/i);
 assert.deepEqual([...sql.matchAll(/CREATE\s+TABLE\s+([^\s(]+)/gi)].map(match=>match[1]),['public.department']);
 assert.match(sql,/ADD COLUMN department_id integer NULL REFERENCES public\.department\(department_id\) ON DELETE RESTRICT/);
 assert.match(sql,/DEPARTMENT_HAS_PROGRAMMES/);
 const applied=entries.slice(0,-1).map(m=>({version:m.version,filename:m.file,sha256:m.sha256}));
 assert.deepEqual((await migrationStatus(client({applied}),entries)).pending.map(m=>m.version),['0010']);
 const ten=entries.at(-1);
 await assert.rejects(migrationStatus(client({applied:applied.filter(m=>m.version!=='0009').concat([{version:'0010',filename:ten.file,sha256:ten.sha256}])}),entries),/NOT_A_PREFIX/);
 await assert.rejects(migrationStatus(client({applied:applied.map(m=>m.version==='0009'?{...m,sha256:'0'.repeat(64)}:m)}),entries),/HISTORY_OR_CHECKSUM/);
});
test('0011 follows the exact 0010 prefix, adds no public table and keeps the programme change audited',async()=>{
 const entries=await loadMigrations();assert.deepEqual(entries.slice(-2).map(m=>m.version),['0010','0011']);
 const sql=entries.at(-1).sql;
 assert.deepEqual([...sql.matchAll(/CREATE\s+TABLE\s+([^\s(]+)/gi)].map(match=>match[1]),['migration_meta.programme_change_context']);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE|ALTER\s+TABLE/i);
 assert.match(sql,/CREATE FUNCTION public\.db_change_student_programme\(target_student_id integer, target_curriculum_id integer\)/);
 assert.match(sql,/'student_programme',target_student_id,'CHANGE_PROGRAMME'/);
 assert.match(sql,/REVOKE EXECUTE ON FUNCTION public\.db_change_student_programme\(integer,integer\) FROM PUBLIC/);
 const applied=entries.slice(0,-1).map(m=>({version:m.version,filename:m.file,sha256:m.sha256}));
 assert.deepEqual((await migrationStatus(client({applied}),entries)).pending.map(m=>m.version),['0011']);
 const eleven=entries.at(-1);
 await assert.rejects(migrationStatus(client({applied:applied.filter(m=>m.version!=='0010').concat([{version:'0011',filename:eleven.file,sha256:eleven.sha256}])}),entries),/NOT_A_PREFIX/);
 await assert.rejects(migrationStatus(client({applied:applied.map(m=>m.version==='0010'?{...m,sha256:'0'.repeat(64)}:m)}),entries),/HISTORY_OR_CHECKSUM/);
});
