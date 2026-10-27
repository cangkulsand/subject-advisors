// Opt-in actual repository tests. Every fixture/write is transaction-rolled-back.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Client } from 'pg';
import assert from 'node:assert/strict';
import { randomInt,randomBytes } from 'node:crypto';
import { validateTarget,verifyConnectedTarget,migrationStatus,loadMigrations } from '../db/migrations.mjs';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const flag=process.argv.indexOf('--target');if(flag<0)throw new Error('Explicit approved development --target file required');
const target=JSON.parse(await readFile(resolve(process.argv[flag+1]),'utf8'));
if(target.allowRollbackOnlyTests!==true)throw new Error('Rollback-only test approval required');
const output=await build({stdin:{contents:"export {createProfileRepository} from './apps/api/src/modules/profile/repository.ts'; export {createRecordsRepository} from './apps/api/src/modules/records/repository.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {createProfileRepository,createRecordsRepository}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const client=new Client({connectionString:validateTarget(target),connectionTimeoutMillis:10000});
let passed=0;
async function check(name,body){await body();passed++;console.log('PASS '+name);}
async function rejects(body,code){await client.query('SAVEPOINT expected_rejection');try{await assert.rejects(body,error=>error.code===code);}finally{await client.query('ROLLBACK TO SAVEPOINT expected_rejection');await client.query('RELEASE SAVEPOINT expected_rejection');}}
const base=randomInt(1900000000,1990000000),nonce=randomBytes(4).toString('hex'),a='__P001_TEST_'+nonce+'_A',b='__P001_TEST_'+nonce+'_B';
try{
  await client.connect();await verifyConnectedTarget(client,target);
  if((await migrationStatus(client,await loadMigrations())).pending.length)throw new Error('Canonical migrations must already be applied');
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
  await client.query("INSERT INTO public.programme(programme_id,programme_code,programme_name) VALUES($1,$2,'DEMO NOT OFFICIAL')",[base,'P001_DEMO_'+nonce]);
  await client.query("INSERT INTO public.curriculum(curriculum_id,curriculum_version,total_credit_required,programme_id) VALUES($1,'DEMO_A',99,$3),($2,'DEMO_B',99,$3)",[base+1,base+2,base]);
  for(const [offset,credits] of [[3,3],[4,2],[5,4]])await client.query("INSERT INTO public.subject(subject_id,subject_code,subject_name,credit_hours) VALUES($1,$2,'DEMO NOT OFFICIAL',$3)",[base+offset,'P001_'+nonce+'_'+offset,credits]);
  for(const [curr,sub] of [[1,3],[1,4],[2,5]])await client.query("INSERT INTO public.curriculum_subject(is_compulsory,subject_category,curriculum_id,subject_id) VALUES(1,'DEMO',$1,$2)",[base+curr,base+sub]);
  await client.query("INSERT INTO public.academic_semester(semester_id,academic_year,semester_no,semester_type,max_subjects,max_credits) VALUES($1,'1001/1002',1,'NORMAL',9,99),($2,'1001/1002',3,'SHORT',9,77)",[base+6,base+7]);
  let queue=Promise.resolve();
  const query=(text,parameters)=>{const next=queue.then(async()=>(await client.query(text,parameters)).rows);queue=next.catch(()=>{});return next;};
  const profiles=createProfileRepository(query),records=createRecordsRepository(query);
  const profileInput={studentName:'DEMO A',matricNo:null,curriculumId:base+1,weeklyWorkingHours:0,availableStudyHours:12};
  const recordInput={subjectId:base+3,semesterId:base+6,status:'COMPLETED',grade:null,recognizedCredits:null,remarks:null};
  await check('initial setup persists with integer IDs and no invented profile fields',async()=>{const p=await profiles.save(a,profileInput);assert.equal(p.studentName,'DEMO A');assert.equal(p.curriculumId,base+1);assert.equal((await profiles.find(a)).availableStudyHours,12);});
  await check('setup retry is an idempotent upsert',async()=>{const before=await profiles.find(a);assert.equal((await profiles.save(a,{...profileInput,studentName:'DEMO A UPDATED'})).studentId,before.studentId);});
  await profiles.save(b,{...profileInput,studentName:'DEMO B'});
  await check('form options expose only own curriculum subjects',async()=>{const options=await profiles.options(a);assert.ok(options.subjects.some(s=>s.subjectId===base+3));assert.ok(!options.subjects.some(s=>s.subjectId===base+5));});
  let first;
  await check('completed credits derive from the configured subject',async()=>{first=await records.save(a,recordInput);assert.equal(first.recognizedCredits,3);assert.equal(first.status,'COMPLETED');});
  await check('duplicate dated attempt conflicts safely',async()=>rejects(()=>records.save(a,recordInput),'DUPLICATE_RECORD'));
  await check('retake in a different semester preserves the completed history',async()=>{await records.save(a,{...recordInput,semesterId:base+7,status:'FAILED',recognizedCredits:0});assert.equal((await records.list(a)).length,2);});
  await check('zero-credit exemption and withdrawal remain distinct',async()=>{
    await records.save(a,{...recordInput,subjectId:base+4,semesterId:null,status:'EXEMPTED',recognizedCredits:0,remarks:'DEMO credit-free exemption'});
    await records.save(a,{...recordInput,subjectId:base+4,status:'WITHDRAWN',recognizedCredits:0});
    const rows=await records.list(a);assert.deepEqual(new Set(rows.map(r=>r.status)),new Set(['COMPLETED','EXEMPTED','FAILED','WITHDRAWN']));
  });
  await check('duplicate undated attempt conflicts',async()=>rejects(()=>records.save(a,{...recordInput,subjectId:base+4,semesterId:null,status:'EXEMPTED',recognizedCredits:0,remarks:'DEMO'}),'DUPLICATE_RECORD'));
  await check('foreign-owned update is rejected and other student remains unchanged',async()=>{const foreign=await records.save(b,recordInput);await rejects(()=>records.save(a,{...recordInput,grade:'A'},foreign.recordId),'RECORD_NOT_FOUND');assert.equal((await records.list(b))[0].grade,null);});
  await check('subject outside current curriculum is rejected',async()=>rejects(()=>records.save(a,{...recordInput,subjectId:base+5}),'INVALID_SUBJECT_OR_CREDITS'));
  await check('over-recognition and client-overridden completion credits are rejected',async()=>{await rejects(()=>records.save(a,{...recordInput,subjectId:base+4,status:'EXEMPTED',recognizedCredits:3,remarks:'DEMO'}),'INVALID_SUBJECT_OR_CREDITS');await rejects(()=>records.save(a,{...recordInput,recognizedCredits:2}),'INVALID_SUBJECT_OR_CREDITS');});
  await check('invalid semester FK is rejected',async()=>rejects(()=>records.save(a,{...recordInput,semesterId:2147483000}),'INVALID_REFERENCE'));
  await check('failed curriculum switch preserves profile and existing records',async()=>{await rejects(()=>profiles.save(a,{...profileInput,curriculumId:base+2}),'DATA_CONFLICT');assert.equal((await profiles.find(a)).curriculumId,base+1);assert.equal((await records.list(a)).length,4);});
  await check('own update persists without changing another student',async()=>{const updated=await records.save(a,{...recordInput,grade:'A',remarks:'DEMO updated'},first.recordId);assert.equal(updated.grade,'A');assert.equal((await records.list(b))[0].grade,null);});
  await client.query('ROLLBACK');
  await check('all synthetic profile/reference rows rolled back',async()=>{assert.equal((await client.query('SELECT count(*)::int AS n FROM public.student_profile WHERE clerk_user_id=ANY($1)',[[a,b]])).rows[0].n,0);assert.equal((await client.query('SELECT count(*)::int AS n FROM public.programme WHERE programme_id=$1',[base])).rows[0].n,0);});
  console.log(JSON.stringify({passed,targetBranchId:target.branchId,fixtureRollback:'PASS',note:'Real PostgreSQL repository tests; not real Clerk browser sign-in.'}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({status:'FAILED',code:error.code??error.name,message:error.name==='AssertionError'?error.message:'Inspect the named failing test; credentials/database details are omitted.'}));process.exitCode=1;}
finally{await client.end();}
