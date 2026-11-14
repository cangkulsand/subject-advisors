// Real PostgreSQL SQL/trigger checks in an isolated in-memory PGlite instance.
// No network, Neon connection, application credentials or persistent database.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const modulePath=resolve(process.env.P001_S2_PGLITE_MODULE??'.verification-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite }=await import(pathToFileURL(modulePath).href);
const output=await build({stdin:{contents:"export {createSprint2Repository} from './apps/api/src/modules/p001-sprint2/repository.ts';export {calculateProgress} from './apps/api/src/modules/p001-sprint2/progress.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {createSprint2Repository,calculateProgress}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const pg=new PGlite();let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
try{
 await pg.exec(await readFile('db/migrations/0001_initial_schema.sql','utf8'));
 await pg.exec(`INSERT INTO programme(programme_id,programme_code,programme_name) VALUES(1,'S2_DEMO','Fictional programme NOT OFFICIAL');
 INSERT INTO curriculum(curriculum_id,curriculum_version,total_credit_required,programme_id) VALUES(1,'DEMO_A',12,1),(2,'DEMO_B',12,1);
 INSERT INTO subject(subject_id,subject_code,subject_name,credit_hours) VALUES(1,'DEMO1','Fictional subject 1',3),(2,'DEMO2','Fictional subject 2',2),(3,'DEMO3','Fictional subject 3',3);
 ALTER TABLE subject ALTER COLUMN subject_id RESTART WITH 4;
 INSERT INTO curriculum_subject(curriculum_subject_id,curriculum_id,subject_id,is_compulsory,subject_category) VALUES(1,1,1,1,'CORE'),(2,1,2,1,'FYP1'),(3,1,3,0,'ELECTIVE');
 ALTER TABLE curriculum_subject ALTER COLUMN curriculum_subject_id RESTART WITH 4;
 INSERT INTO curriculum_requirement(curriculum_id,requirement_type,required_credits,required_subjects) VALUES(1,'COMPULSORY',5,2);
 INSERT INTO student_profile(clerk_user_id,student_name,curriculum_id,weekly_working_hours,available_study_hours) VALUES('demo_a','Fictional A',1,0,8),('demo_b','Fictional B',1,0,8);`);
 const db={query:async(text,params)=>(await pg.query(text,params)).rows,
   transaction:commands=>pg.transaction(async tx=>{const results=[];for(const c of commands)results.push((await tx.query(c.text,c.params)).rows);return results;})};
 const repo=createSprint2Repository(db);
 const draft={revision:'',existingSubjectId:null,code:'DEMO4',name:'Fictional added subject',credits:2,category:'ELECTIVE',compulsory:false,semesterTypes:['SHORT'],confirmSharedChanges:false};
 let snapshot=await repo.curriculum(1),added;
 await check('catalogue and revision snapshot load from actual schema',async()=>{assert.equal(snapshot.data.subjects.length,3);assert.match(snapshot.revision,/^[a-f0-9]{32}$/);assert.equal((await repo.catalogue()).curricula.length,2);});
 await check('new subject, mapping and semester rules save atomically',async()=>{snapshot=await repo.subject(1,null,{...draft,revision:snapshot.revision});added=snapshot.data.subjects.find(s=>s.code==='DEMO4');assert.ok(added);assert.deepEqual(added.semesterTypes,['SHORT']);});
 await check('duplicate subject code rolls back all changes',async()=>{const before=await repo.curriculum(1);await assert.rejects(()=>repo.subject(1,null,{...draft,revision:before.revision}),e=>e.code==='DUPLICATE_CURRICULUM_DATA');assert.equal((await repo.curriculum(1)).revision,before.revision);});
 await check('stale revision cannot mutate any subject or semester rules',async()=>{const before=await repo.curriculum(1);await assert.rejects(()=>repo.subject(1,added.mappingId,{...draft,code:'STALE',revision:'0'.repeat(32),confirmSharedChanges:true}),e=>e.code==='STALE_CURRICULUM');assert.equal((await repo.curriculum(1)).revision,before.revision);});
 await check('invalid existing subject creates neither mapping nor rules',async()=>{const before=await repo.curriculum(1);await assert.rejects(()=>repo.subject(1,null,{...draft,existingSubjectId:999,revision:before.revision}),e=>e.code==='SUBJECT_NOT_FOUND');assert.equal((await repo.curriculum(1)).revision,before.revision);});
 await check('configured FYP1 normal-semester exception persists',async()=>{snapshot=await repo.curriculum(1);snapshot=await repo.subject(1,2,{...draft,code:'DEMO2',name:'Fictional FYP1',credits:2,category:'FYP1',compulsory:true,semesterTypes:['NORMAL','SHORT'],confirmSharedChanges:true,revision:snapshot.revision});assert.deepEqual(snapshot.data.subjects.find(s=>s.mappingId===2).semesterTypes,['NORMAL','SHORT']);});
 await check('mandatory chain saves in the existing dependency table',async()=>{snapshot=await repo.curriculum(1);snapshot=await repo.dependency(1,null,{revision:snapshot.revision,from:2,required:1,kind:'MANDATORY'});snapshot=await repo.dependency(1,null,{revision:snapshot.revision,from:3,required:2,kind:'MANDATORY'});assert.equal(snapshot.data.links.length,2);});
 await check('database trigger rejects a mandatory cycle and rolls back',async()=>{const before=await repo.curriculum(1);await assert.rejects(()=>repo.dependency(1,null,{revision:before.revision,from:1,required:3,kind:'MANDATORY'}),e=>e.code==='CURRICULUM_CONFLICT');assert.equal((await repo.curriculum(1)).revision,before.revision);});
 await check('reciprocal concurrent links remain distinct from mandatory links',async()=>{snapshot=await repo.curriculum(1);snapshot=await repo.dependency(1,null,{revision:snapshot.revision,from:1,required:2,kind:'COREQUISITE'});snapshot=await repo.dependency(1,null,{revision:snapshot.revision,from:2,required:1,kind:'COREQUISITE'});assert.equal(snapshot.data.links.filter(l=>l.kind==='COREQUISITE').length,2);});
 await check('relationship editing and removal return current snapshots',async()=>{snapshot=await repo.curriculum(1);const link=snapshot.data.links.find(l=>l.kind==='COREQUISITE');snapshot=await repo.dependency(1,link.id,{revision:snapshot.revision,from:1,required:2,kind:'RECOMMENDED'});assert.equal(snapshot.data.links.find(l=>l.id===link.id).kind,'RECOMMENDED');snapshot=await repo.removeDependency(1,link.id,snapshot.revision);assert.ok(!snapshot.data.links.some(l=>l.id===link.id));});
 await check('existing global subject attaches without duplicating metadata',async()=>{let other=await repo.curriculum(2);other=await repo.subject(2,null,{...draft,existingSubjectId:1,revision:other.revision});assert.equal(other.data.subjects[0].subjectId,1);assert.equal((await pg.query('SELECT count(*)::integer AS n FROM subject')).rows[0].n,4);});
 await check('cross-curriculum prerequisites are rejected by database integrity',async()=>{snapshot=await repo.curriculum(1);const other=await repo.curriculum(2);await assert.rejects(()=>repo.dependency(1,null,{revision:snapshot.revision,from:1,required:other.data.subjects[0].mappingId,kind:'MANDATORY'}),e=>e.code==='CURRICULUM_CONFLICT');});
 const uc24={revision:'',existingSubjectId:null,code:'DEMO5',name:'Fictional UC24 subject',credits:3,category:'ELECTIVE',compulsory:false,semesterTypes:['NORMAL'],confirmSharedChanges:false};
 await check('UC24: subject with multiple initial mandatory prerequisites saves atomically',async()=>{snapshot=await repo.curriculum(1);snapshot=await repo.subject(1,null,{...uc24,revision:snapshot.revision,prerequisites:[{mappingId:1,code:'DEMO1'},{mappingId:2,code:'DEMO2'}]});
  const created=snapshot.data.subjects.find(s=>s.code==='DEMO5');assert.ok(created);
  const edges=snapshot.data.links.filter(l=>l.from===created.mappingId);assert.equal(edges.length,2);
  assert.ok(edges.every(l=>l.kind==='MANDATORY'));assert.deepEqual(edges.map(l=>l.required).sort(),[1,2]);});
 await check('UC24: subject without prerequisites still saves',async()=>{snapshot=await repo.curriculum(1);snapshot=await repo.subject(1,null,{...uc24,code:'DEMO6',category:'ELECTIVE',compulsory:false,revision:snapshot.revision,prerequisites:[]});
  const created=snapshot.data.subjects.find(s=>s.code==='DEMO6');assert.ok(created);assert.equal(snapshot.data.links.filter(l=>l.from===created.mappingId).length,0);});
 for(const [label,prerequisites] of [['missing reference',[{mappingId:999,code:'DEMO1'}]],['foreign curriculum reference',(await repo.curriculum(2)).data.subjects.map(s=>({mappingId:s.mappingId,code:s.code})).slice(0,1)],['mismatched canonical code',[{mappingId:1,code:'WRONG'}]]])
  await check('UC24: '+label+' rolls back the entire subject, mapping and semester rules',async()=>{const before=await repo.curriculum(1);
   await assert.rejects(()=>repo.subject(1,null,{...uc24,code:'BADREF',revision:before.revision,prerequisites}),e=>['INVALID_PREREQUISITE','CURRICULUM_CONFLICT','REFERENCE_CONFLICT'].includes(e.code));
   const after=await repo.curriculum(1);assert.equal(after.revision,before.revision);assert.ok(!after.data.subjects.some(s=>s.code==='BADREF'));
   assert.equal((await pg.query('SELECT count(*)::integer AS n FROM subject WHERE subject_code=$1',['BADREF'])).rows[0].n,0);});
 await check('UC24: a late failing prerequisite edge rolls back the whole creation',async()=>{
  await pg.exec(`CREATE OR REPLACE FUNCTION public.uc24_test_reject() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.required_curriculum_subject_id=3 THEN RAISE EXCEPTION 'test-only late failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $fn$;
  CREATE TRIGGER uc24_test_late BEFORE INSERT ON public.subject_prerequisite FOR EACH ROW EXECUTE FUNCTION public.uc24_test_reject();`);
  const before=await repo.curriculum(1);const edgesBefore=(await pg.query('SELECT count(*)::integer AS n FROM subject_prerequisite')).rows[0].n;
  await assert.rejects(()=>repo.subject(1,null,{...uc24,code:'LATEFAIL',revision:before.revision,prerequisites:[{mappingId:1,code:'DEMO1'},{mappingId:3,code:'DEMO3'}]}),e=>e.code==='CURRICULUM_CONFLICT');
  const after=await repo.curriculum(1);assert.equal(after.revision,before.revision);assert.ok(!after.data.subjects.some(s=>s.code==='LATEFAIL'));
  assert.equal((await pg.query('SELECT count(*)::integer AS n FROM subject_prerequisite')).rows[0].n,edgesBefore);
  await pg.exec('DROP TRIGGER uc24_test_late ON public.subject_prerequisite');});
 await check('UC24: duplicate mandatory edge attempt is rejected by uniqueness',async()=>{const before=await repo.curriculum(1);
  await assert.rejects(()=>repo.subject(1,null,{...uc24,code:'DUPEDGE',revision:before.revision,prerequisites:[{mappingId:1,code:'DEMO1'},{mappingId:1,code:'DEMO1'}]}),e=>['DUPLICATE_CURRICULUM_DATA','INVALID_PREREQUISITE','CURRICULUM_CONFLICT'].includes(e.code));
  assert.equal((await repo.curriculum(1)).revision,before.revision);assert.ok(!(await repo.curriculum(1)).data.subjects.some(s=>s.code==='DUPEDGE'));});
 await check('UC24: stale create with prerequisites leaves snapshot and catalogue unchanged',async()=>{const before=await repo.curriculum(1);
  await assert.rejects(()=>repo.subject(1,null,{...uc24,code:'STALEC',revision:'0'.repeat(32),prerequisites:[{mappingId:1,code:'DEMO1'},{mappingId:2,code:'DEMO2'}]}),e=>e.code==='STALE_CURRICULUM');
  assert.equal((await repo.curriculum(1)).revision,before.revision);
  assert.equal((await pg.query('SELECT count(*)::integer AS n FROM subject WHERE subject_code=$1',['STALEC'])).rows[0].n,0);});
 await check('UC24: catalogue reuse with prerequisites shares the subject and persists edges',async()=>{
  let other=await repo.curriculum(2);const requiredMapping=other.data.subjects[0].mappingId;
  const existing=(await repo.catalogue()).subjects.find(s=>s.code==='DEMO6');assert.ok(existing);
  const subjectCount=(await pg.query('SELECT count(*)::integer AS n FROM subject')).rows[0].n;
  other=await repo.subject(2,null,{...uc24,existingSubjectId:existing.subjectId,revision:other.revision,prerequisites:[{mappingId:requiredMapping,code:'DEMO1'}]});
  const added=other.data.subjects.find(s=>s.code==='DEMO6');assert.ok(added);assert.equal(added.subjectId,existing.subjectId);
  assert.equal((await pg.query('SELECT count(*)::integer AS n FROM subject')).rows[0].n,subjectCount);
  const edge=other.data.links.find(l=>l.from===added.mappingId);assert.ok(edge);assert.equal(edge.kind,'MANDATORY');assert.equal(edge.required,requiredMapping);});
 await pg.exec(`INSERT INTO academic_semester(semester_id,academic_year,semester_no,semester_type,max_subjects,max_credits) VALUES(1,'1001/1002',1,'NORMAL',3,10),(2,'1001/1002',3,'SHORT',3,6);
 INSERT INTO academic_record(student_id,subject_id,semester_id,status,recognized_credits,remarks)
 SELECT student_id,1,1,'COMPLETED',3,NULL FROM student_profile WHERE clerk_user_id='demo_a';
 INSERT INTO academic_record(student_id,subject_id,semester_id,status,recognized_credits,remarks)
 SELECT student_id,1,2,'FAILED',0,NULL FROM student_profile WHERE clerk_user_id='demo_a';
 INSERT INTO academic_record(student_id,subject_id,semester_id,status,recognized_credits,remarks)
 SELECT student_id,2,NULL,'EXEMPTED',0,'Fictional non-credit exemption' FROM student_profile WHERE clerk_user_id='demo_a';`);
 await check('progress query isolates students and deduplicates actual saved history',async()=>{const a=calculateProgress(await repo.progress('demo_a')),b=calculateProgress(await repo.progress('demo_b'));assert.equal(a.earnedCredits,3);assert.equal(a.zeroCreditExemptions,1);assert.equal(a.outstandingCompulsory,0);assert.equal(b.earnedCredits,0);assert.equal(b.noHistory,true);assert.equal(await repo.progress('missing'),null);});
 await check('historical-credit protection rolls back subject and semester changes',async()=>{const before=await repo.curriculum(1);await assert.rejects(()=>repo.subject(1,1,{...draft,revision:before.revision,code:'DEMO1',name:'Attempted bad edit',credits:4,semesterTypes:['SHORT'],confirmSharedChanges:true}),e=>e.code==='CURRICULUM_CONFLICT');assert.equal((await repo.curriculum(1)).revision,before.revision);});
 await check('metadata edit preserves recorded credits and invalidates shared revisions',async()=>{snapshot=await repo.curriculum(1);const otherBefore=await repo.curriculum(2);snapshot=await repo.subject(1,1,{...draft,revision:snapshot.revision,code:'DEMO1',name:'Fictional renamed subject',credits:3,semesterTypes:['NORMAL'],confirmSharedChanges:true});assert.notEqual((await repo.curriculum(2)).revision,otherBefore.revision);assert.equal(calculateProgress(await repo.progress('demo_a')).earnedCredits,3);});
 await check('UC07 graduation totals, requirement rows and semester caps remain unchanged',async()=>{assert.equal((await pg.query('SELECT total_credit_required FROM curriculum WHERE curriculum_id=1')).rows[0].total_credit_required,12);assert.equal((await pg.query('SELECT count(*)::integer AS n FROM curriculum_requirement')).rows[0].n,1);assert.equal((await pg.query('SELECT max_credits FROM academic_semester WHERE semester_id=1')).rows[0].max_credits,10);});
 console.log(JSON.stringify({passed,database:'Isolated in-memory PostgreSQL (PGlite)',neon:'NOT CONNECTED',concurrency:'Not tested across independent database sessions'}));
}finally{await pg.close();}
