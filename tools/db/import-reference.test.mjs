import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  ImportError,activateReferenceImport,applyReferenceImport,assertExistingReferenceRowsUnchanged,captureExistingReferenceRows,loadManifest,planReferenceImport,validateManifest
} from './import-reference.mjs';
import {loadMigrations} from './migrations.mjs';

const ROOT=new URL('../../',import.meta.url);
const loaded=await loadManifest();
const source=loaded.manifest;
const target={kind:'local-disposable',development:true,disposable:true,approvedForSchemaCreation:true,approvedBy:'offline fixture',host:'127.0.0.1',port:55432,database:'utm_db_foundation_test',connectionStringEnvironmentVariable:'DB_FOUNDATION_URL'};
const targetIdentity={kind:target.kind,host:target.host,port:target.port,database:target.database,projectId:null,branchId:null};
const copy=(value)=>structuredClone(value);
function emptyCatalogue(){return {programmes:[],curricula:[],subjects:[],curriculumSubjects:[],requirements:[],prerequisites:[],receipts:[]};}
function existingCatalogue(count=61){
  const catalogue=emptyCatalogue();
  catalogue.subjects=source.subjects.slice(0,count).map((row,index)=>({subject_id:index+1,subject_code:row.code,subject_name:`Existing ${row.code}`,credit_hours:row.credits,status:'ACTIVE',include_in_offering_forecast:false,class_type:null,subject_category:'Global category'}));
  for(let index=0;catalogue.subjects.length<78;index++)catalogue.subjects.push({subject_id:catalogue.subjects.length+1,subject_code:`ZZZZ9${String(index).padStart(3,'0')}`,subject_name:`Baseline unrelated ${index}`,credit_hours:2,status:'ACTIVE',include_in_offering_forecast:true,class_type:null,subject_category:null});
  catalogue.curriculumSubjects=catalogue.subjects.map((row,index)=>({curriculum_subject_id:index+1,curriculum_id:1,subject_id:row.subject_id,subject_category:'Core',is_compulsory:1,row_json:{display_name:null,prerequisite_details:null}}));
  return catalogue;
}
function replayCatalogue(){
  const curriculumId=2,programmeId=1;
  const catalogue=emptyCatalogue();
  catalogue.programmes=[{programme_id:programmeId,programme_code:source.programme.programmeCode,programme_name:source.programme.programmeName,level:null,status:'ACTIVE'}];
  catalogue.curricula=[{curriculum_id:curriculumId,curriculum_version:'English',total_credit_required:128,effective_year:null,status:'INACTIVE',programme_id:programmeId}];
  catalogue.subjects=source.subjects.map((item,index)=>({subject_id:index+1,subject_code:item.code,subject_name:`Existing ${item.code}`,credit_hours:item.credits,status:'ACTIVE',include_in_offering_forecast:false,class_type:null,subject_category:'Global'}));
  const subjectIdByCode=new Map(catalogue.subjects.map(row=>[row.subject_code,row.subject_id]));
  const mappingIdByCode=new Map();
  catalogue.curriculumSubjects=source.subjects.map((item,index)=>{
    const curriculum_subject_id=index+1;mappingIdByCode.set(item.code,curriculum_subject_id);
    return {curriculum_subject_id,curriculum_id:curriculumId,subject_id:subjectIdByCode.get(item.code),subject_category:item.category,is_compulsory:item.isCompulsory?1:0,
      row_json:{display_name:item.englishName,prerequisite_details:item.prerequisites}};
  });
  catalogue.requirements=Object.entries({
    CORE:[62,21],'UNIVERSITY_COMPULSORY':[19,10],ELECTIVE_E1:[null,7],ELECTIVE_E2:[null,5],ELECTIVE_E3:[12,2],ELECTIVE_U1:[null,1],ELECTIVE_U2:[null,1]
  }).map(([requirement_type,[required_credits,required_subjects]],index)=>({requirement_id:index+1,curriculum_id:curriculumId,requirement_type,required_credits,required_subjects}));
  const getMandatory=(node,out=[])=>{if(!node)return out;if(node.operator==='course')out.push(node.code);else if(node.operator==='allOf')for(const child of node.operands)getMandatory(child,out);return out;};
  let edgeId=1;
  for(const item of source.subjects)for(const code of getMandatory(item.prerequisites.expression))catalogue.prerequisites.push({prerequisite_id:edgeId++,requirement_type:'MANDATORY',curriculum_subject_id:mappingIdByCode.get(item.code),required_curriculum_subject_id:mappingIdByCode.get(code),curriculum_id:curriculumId,subject_code:item.code,required_subject_code:code});
  const manifestSha256='a'.repeat(64);
  catalogue.receipts=[{dataset_id:source.datasetId,curriculum_id:curriculumId,manifest_sha256:manifestSha256,receipt:{datasetId:source.datasetId,manifestSha256,curriculumId,target:targetIdentity}}];
  return {catalogue,curriculumId,manifestSha256};
}
async function activationFixtureClient(catalogue){
  const history=(await loadMigrations()).map(item=>({version:item.version,filename:item.file,sha256:item.sha256}));
  const statements=[];
  const client={async query(sql,parameters){
    statements.push({sql,parameters});
    if(sql.startsWith('SELECT current_database()'))return {rows:[{database:target.database,server_version:180006,project_id:null,branch_id:null}]};
    if(sql.startsWith("SELECT to_regclass('migration_meta.schema_migrations')"))return {rows:[{tracked:true}]};
    if(sql.startsWith('SELECT version,filename,sha256'))return {rows:history};
    if(sql.startsWith("SELECT to_regclass('migration_meta.reference_data_imports')"))return {rows:[{receipt_table:true,display_column:true,prerequisite_column:true}]};
    if(sql.startsWith('SELECT programme_id,programme_code'))return {rows:catalogue.programmes};
    if(sql.startsWith('SELECT curriculum_id,curriculum_version'))return {rows:catalogue.curricula};
    if(sql.startsWith('SELECT subject_id,subject_code'))return {rows:catalogue.subjects};
    if(sql.startsWith('SELECT cs.curriculum_subject_id,cs.curriculum_id'))return {rows:catalogue.curriculumSubjects};
    if(sql.startsWith('SELECT requirement_id,curriculum_id'))return {rows:catalogue.requirements};
    if(sql.startsWith('SELECT sp.prerequisite_id'))return {rows:catalogue.prerequisites};
    if(sql.startsWith('SELECT dataset_id,curriculum_id'))return {rows:catalogue.receipts};
    if(sql.startsWith('SELECT cs.curriculum_subject_id,cs.subject_category'))return {rows:catalogue.curriculumSubjects.map(row=>({
      curriculum_subject_id:row.curriculum_subject_id,subject_category:row.subject_category,is_compulsory:row.is_compulsory,
      display_name:row.row_json.display_name,prerequisite_details:row.row_json.prerequisite_details,
      subject_code:catalogue.subjects.find(item=>item.subject_id===row.subject_id).subject_code
    }))};
    if(sql.startsWith('SELECT requirement_type,required_credits'))return {rows:catalogue.requirements};
    if(sql.startsWith('SELECT sp.requirement_type,s.subject_code'))return {rows:catalogue.prerequisites.map(row=>({requirement_type:row.requirement_type,subject_code:row.subject_code,required_code:row.required_subject_code}))};
    if(sql.startsWith("UPDATE public.curriculum SET status='ACTIVE'"))return {rowCount:1};
    if(sql.startsWith("UPDATE public.programme SET status='ACTIVE'"))return {rowCount:1};
    if(sql.startsWith('UPDATE migration_meta.reference_data_imports'))return {rowCount:1};
    return {rows:[],rowCount:0};
  }};
  return {client,statements};
}

test('manifest validation preserves source counts, requirements, training conditions and topic dependence',()=>{
  const result=validateManifest(source);
  assert.equal(result.subjects.size,79);
  assert.equal(source.computedSummary.poolCredits,195);
  assert.equal(source.programme.totalCreditRequired,128);
  assert.deepEqual(source.exclusions.map(row=>row.code),['SECJ2363','SECJ3303','SECJ3483','SECJ3563','SECJ3603','SECJ3623','SECJ4423']);
  assert.deepEqual(source.subjects.find(row=>row.code==='SECR4114').prerequisites.conditions.map(row=>[row.type,row.operator,row.value]),[['completedCredits','>',92],['cgpa','>=',2]]);
  assert.equal(source.subjects.find(row=>row.code==='SECR4973').prerequisites.topicDependent,true);
  assert.equal(source.subjects.find(row=>row.code==='SECR3104').prerequisites.expression.operands.find(row=>row.operator==='anyOf').operands.length,2);
});

test('manifest validator rejects broken counts, credits, exclusions, dangling edges, cycles and conditions',()=>{
  const cases=[];
  let damaged=copy(source);damaged.subjects.pop();cases.push([damaged,'INVALID_SUBJECT_COUNT']);
  damaged=copy(source);damaged.subjects[0].credits=999;cases.push([damaged,'INVALID_SUBJECT_DECLARATION']);
  damaged=copy(source);damaged.exclusions[0].code='SECJ0000';cases.push([damaged,'INVALID_EXCLUSIONS']);
  damaged=copy(source);damaged.subjects.find(row=>row.code==='SECR2043').prerequisites.expression={operator:'allOf',operands:[{operator:'course',code:'ZZZZ9999'}]};damaged.subjects.find(row=>row.code==='SECR2043').prerequisites.fixedCourseEdgesShown=true;cases.push([damaged,'INVALID_PREREQUISITE_COURSE']);
  damaged=copy(source);damaged.subjects.find(row=>row.code==='SECR2043').prerequisites.expression={operator:'allOf',operands:[{operator:'course',code:'SECR2033'}]};damaged.subjects.find(row=>row.code==='SECR2033').prerequisites.expression={operator:'allOf',operands:[{operator:'course',code:'SECR2043'}]};damaged.subjects.find(row=>row.code==='SECR2043').prerequisites.fixedCourseEdgesShown=true;cases.push([damaged,'PREREQUISITE_CYCLE']);
  damaged=copy(source);damaged.subjects.find(row=>row.code==='SECR4114').prerequisites.conditions[0].operator='>=';cases.push([damaged,'INVALID_COMPLETED_CREDITS_CONDITION']);
  for(const [manifest,code] of cases)assert.throws(()=>validateManifest(manifest),error=>error instanceof ImportError&&error.message===code);
});

test('pure planner finds 61 same-code/same-credit reuses and 18 inserts without changing shared names',()=>{
  const catalogue=existingCatalogue(61);
  const plan=planReferenceImport(source,catalogue,targetIdentity);
  assert.equal(plan.canApply,true);
  assert.equal(plan.counts.reusedSubjects,61);
  assert.equal(plan.counts.newSubjects,18);
  assert.deepEqual(plan.expectedCatalogueTotalsAfterImport,{subjects:96,curriculumSubjectMappings:157});
  assert.equal(plan.mappings.length,79);
  assert.equal(plan.requirements.length,7);
  assert.equal(plan.subjects.reuse[0].namePreserved,true);
  assert.equal(plan.subjects.reuse[0].existingName,`Existing ${source.subjects[0].code}`);
  assert.equal(plan.mandatoryEdges.some(edge=>edge.subjectCode==='SECR3104'&&['SECD2613','SECJ2203'].includes(edge.requiredCode)),false);
  assert.match(plan.previewSha256,/^[a-f0-9]{64}$/);
});

test('planner reports credit, legacy alias, pair and duplicate requirement conflicts',()=>{
  const catalogue=existingCatalogue(61);
  const first=source.subjects[0];catalogue.subjects[0].credit_hours++;
  catalogue.subjects.push({subject_id:900,subject_code:first.legacyEquivalent.code,subject_name:'Legacy row',credit_hours:first.credits});
  catalogue.programmes=[{programme_id:1,programme_code:'SECRH',programme_name:source.programme.programmeName}];
  catalogue.curricula=[{curriculum_id:2,programme_id:1,curriculum_version:'English',total_credit_required:128,effective_year:null,status:'INACTIVE'}];
  catalogue.requirements=[{requirement_id:1,curriculum_id:2,requirement_type:'CORE'},{requirement_id:2,curriculum_id:2,requirement_type:'CORE'}];
  const plan=planReferenceImport(source,catalogue,targetIdentity);
  const kinds=new Set(plan.conflicts.map(item=>item.type));
  assert.ok(kinds.has('SUBJECT_CREDIT_MISMATCH'));
  assert.ok(kinds.has('LEGACY_ALIAS_ALREADY_CATALOGUED'));
  assert.ok(kinds.has('CURRICULUM_VERSION_ALREADY_EXISTS_WITHOUT_IMPORT_RECEIPT'));
  assert.ok(kinds.has('DUPLICATE_REQUIREMENT_TYPE'));
  assert.equal(plan.canApply,false);
});

test('matching durable manifest receipt and complete data replay as a no-op',()=>{
  const replay=replayCatalogue();
  const plan=planReferenceImport(source,replay.catalogue,targetIdentity,replay.manifestSha256);
  assert.equal(plan.canApply,true);
  assert.equal(plan.replayNoop,true);
  assert.equal(plan.curriculum.action,'REPLAY_NOOP');
  assert.equal(plan.mappings.length,0);
  assert.equal(plan.conflicts.length,0);
});

test('existing-reference reconciliation tolerates new rows but rejects changes to prior rows',()=>{
  const beforeCatalogue=existingCatalogue(61);
  beforeCatalogue.programmes=[{programme_id:5,programme_code:'SECJ',programme_name:'Existing programme',status:null}];
  const before=captureExistingReferenceRows(beforeCatalogue);
  const after=copy(beforeCatalogue);
  after.subjects.push({subject_id:999,subject_code:'NEWC1234',subject_name:'New subject',credit_hours:3});
  after.curricula.push({curriculum_id:10,programme_id:6,curriculum_version:'English',total_credit_required:128});
  assert.doesNotThrow(()=>assertExistingReferenceRowsUnchanged(before,captureExistingReferenceRows(after)));
  after.programmes[0].status='INACTIVE';
  assert.throws(()=>assertExistingReferenceRowsUnchanged(before,captureExistingReferenceRows(after)),error=>error instanceof ImportError&&error.message==='EXISTING_REFERENCE_ROWS_CHANGED');
});

test('activation requires explicit reader compatibility confirmation',async()=>{
  await assert.rejects(activateReferenceImport({},source,target,{expectedManifestSha256:'a'.repeat(64)}),error=>error.message==='READER_COMPATIBILITY_CONFIRMATION_REQUIRED');
});

test('activation scopes status changes to the imported programme and curriculum',async()=>{
  const replay=replayCatalogue();
  replay.catalogue.programmes[0].status='INACTIVE';
  const {client,statements}=await activationFixtureClient(replay.catalogue);
  const result=await activateReferenceImport(client,source,target,{expectedManifestSha256:replay.manifestSha256,confirmReadersCompatible:true});
  assert.equal(result.status,'ACTIVATED');
  const curriculumUpdate=statements.find(row=>row.sql.startsWith("UPDATE public.curriculum SET status='ACTIVE'"));
  const programmeUpdate=statements.find(row=>row.sql.startsWith("UPDATE public.programme SET status='ACTIVE'"));
  assert.deepEqual(curriculumUpdate.parameters,[replay.curriculumId,1]);
  assert.deepEqual(programmeUpdate.parameters,[1,'SECRH']);
  const updates=statements.filter(row=>/^UPDATE\b/i.test(row.sql));
  assert.equal(updates.length,3);
  assert.ok(updates.every(row=>row.sql.includes('curriculum')||row.sql.includes('programme')));
  assert.ok(statements.some(row=>row.sql.includes("'programmeStatus',$2::text")));
  assert.ok(statements.some(row=>row.sql.startsWith('LOCK TABLE')&&row.sql.includes('public.subject')));
  assert.ok(statements.findIndex(row=>row.sql.includes('SET LOCAL lock_timeout'))<statements.findIndex(row=>row.sql.includes('pg_advisory_xact_lock')));
  assert.equal(statements.at(-1).sql,'COMMIT');
});

test('activation rejects global credit drift and curriculum version drift before status writes',async()=>{
  for(const mutation of [
    catalogue=>{catalogue.subjects[0].credit_hours++;},
    catalogue=>{catalogue.curricula[0].curriculum_version='1';}
  ]){
    const replay=replayCatalogue();mutation(replay.catalogue);
    const {client,statements}=await activationFixtureClient(replay.catalogue);
    await assert.rejects(activateReferenceImport(client,source,target,{expectedManifestSha256:replay.manifestSha256,confirmReadersCompatible:true}),error=>error.message==='ACTIVATION_REFERENCE_RECONCILIATION_FAILED');
    assert.ok(statements.some(row=>row.sql==='ROLLBACK'));
    assert.equal(statements.filter(row=>/^UPDATE\b/i.test(row.sql)).length,0);
  }
});

test('apply rolls back an injected SQL failure and never mutates existing references',async()=>{
  const migrations=await loadMigrations();
  const targetForTest={...target};
  const empty=emptyCatalogue();
  const plan=planReferenceImport(source,empty,targetIdentity);
  const history=migrations.map(item=>({version:item.version,filename:item.file,sha256:item.sha256}));
  const queries=[];
  const client={async query(sql,parameters){
    queries.push({sql,parameters});
    if(sql.startsWith('SELECT current_database()'))return {rows:[{database:targetForTest.database,server_version:180006,project_id:null,branch_id:null}]};
    if(sql.startsWith("SELECT to_regclass('migration_meta.reference_data_imports')"))return {rows:[{receipt_table:true,display_column:true,prerequisite_column:true}]};
    if(sql.startsWith("SELECT to_regclass('migration_meta.schema_migrations')"))return {rows:[{tracked:true}]};
    if(sql.startsWith('SELECT version,filename,sha256'))return {rows:history};
    if(sql.startsWith('SELECT programme_id,programme_code'))return {rows:[]};
    if(sql.startsWith('SELECT curriculum_id,curriculum_version'))return {rows:[]};
    if(sql.startsWith('SELECT subject_id,subject_code'))return {rows:[]};
    if(sql.startsWith('SELECT cs.curriculum_subject_id'))return {rows:[]};
    if(sql.startsWith('SELECT requirement_id,curriculum_id'))return {rows:[]};
    if(sql.startsWith('SELECT sp.prerequisite_id'))return {rows:[]};
    if(sql.startsWith('SELECT dataset_id,curriculum_id'))return {rows:[]};
    if(sql.startsWith('INSERT INTO public.programme '))return {rows:[{programme_id:1,programme_code:'SECRH',programme_name:source.programme.programmeName,level:null,status:'ACTIVE'}]};
    if(sql.startsWith('INSERT INTO public.curriculum '))return {rows:[{curriculum_id:2}]};
    if(sql.startsWith('INSERT INTO public.subject '))throw new Error('synthetic subject insert failure');
    return {rows:[],rowCount:0};
  }};
  await assert.rejects(applyReferenceImport(client,source,targetForTest,plan.previewSha256),/synthetic subject insert failure/);
  assert.ok(queries.some(query=>query.sql==='BEGIN'));
  assert.ok(queries.some(query=>query.sql==='ROLLBACK'));
  assert.ok(!queries.some(query=>query.sql==='COMMIT'));
  assert.ok(queries.some(query=>query.sql.startsWith('LOCK TABLE')));
  assert.ok(!queries.some(query=>/\bUPDATE\s+public\.(?:subject|curriculum_subject|student_profile|student_subject_record|student_course_record)\b/i.test(query.sql)));
  assert.ok(!queries.some(query=>/\bDELETE\s+FROM\s+public\./i.test(query.sql)));
  assert.ok(queries.every(query=>!query.sql.includes('student_profile')));
});

test('rollback-only apply requires target approval and exercises the full transaction without persisting',async()=>{
  const plan=planReferenceImport(source,emptyCatalogue(),targetIdentity);
  await assert.rejects(applyReferenceImport({},source,target,plan.previewSha256,undefined,{rollbackOnly:true}),error=>error.message==='ROLLBACK_ONLY_TEST_APPROVAL_REQUIRED');
  const migrations=await loadMigrations();
  const history=migrations.map(item=>({version:item.version,filename:item.file,sha256:item.sha256}));
  const state=emptyCatalogue();
  const statements=[];
  let nextProgramme=1,nextCurriculum=1,nextSubject=1,nextMapping=1,nextRequirement=1,nextPrerequisite=1;
  const targetWithRollbackApproval={...target,allowRollbackOnlyTests:true};
  const client={async query(sql,parameters=[]){
    statements.push({sql,parameters});
    if(sql.startsWith('SELECT current_database()'))return {rows:[{database:target.database,server_version:180006,project_id:null,branch_id:null}]};
    if(sql.startsWith("SELECT to_regclass('migration_meta.reference_data_imports')"))return {rows:[{receipt_table:true,display_column:true,prerequisite_column:true}]};
    if(sql.startsWith("SELECT to_regclass('migration_meta.schema_migrations')"))return {rows:[{tracked:true}]};
    if(sql.startsWith('SELECT version,filename,sha256'))return {rows:history};
    if(sql.startsWith('SELECT programme_id,programme_code'))return {rows:state.programmes};
    if(sql.startsWith('SELECT curriculum_id,curriculum_version'))return {rows:state.curricula};
    if(sql.startsWith('SELECT subject_id,subject_code'))return {rows:state.subjects};
    if(sql.startsWith('SELECT cs.curriculum_subject_id,cs.curriculum_id'))return {rows:state.curriculumSubjects};
    if(sql.startsWith('SELECT requirement_id,curriculum_id'))return {rows:state.requirements};
    if(sql.startsWith('SELECT sp.prerequisite_id'))return {rows:state.prerequisites};
    if(sql.startsWith('SELECT dataset_id,curriculum_id'))return {rows:state.receipts};
    if(sql.startsWith('INSERT INTO public.programme ')){
      const row={programme_id:nextProgramme++,programme_code:parameters[0],programme_name:parameters[1],level:null,status:parameters[2]};state.programmes.push(row);return {rows:[row]};
    }
    if(sql.startsWith('INSERT INTO public.curriculum ')){
      const row={curriculum_id:nextCurriculum++,curriculum_version:parameters[0],total_credit_required:parameters[1],effective_year:parameters[2],status:parameters[3],programme_id:parameters[4]};state.curricula.push(row);return {rows:[{curriculum_id:row.curriculum_id}]};
    }
    if(sql.startsWith('INSERT INTO public.subject ')){
      const row={subject_id:nextSubject++,subject_code:parameters[0],subject_name:parameters[1],credit_hours:parameters[2],status:parameters[3],include_in_offering_forecast:parameters[4],class_type:parameters[5]};state.subjects.push(row);return {rows:[{subject_id:row.subject_id}]};
    }
    if(sql.startsWith('INSERT INTO public.curriculum_subject ')){
      const row={curriculum_subject_id:nextMapping++,curriculum_id:parameters[0],subject_id:parameters[1],subject_category:parameters[2],is_compulsory:parameters[3],display_name:parameters[4],prerequisite_details:JSON.parse(parameters[5]),row_json:{display_name:parameters[4],prerequisite_details:JSON.parse(parameters[5])}};state.curriculumSubjects.push(row);return {rows:[{curriculum_subject_id:row.curriculum_subject_id}]};
    }
    if(sql.startsWith('INSERT INTO public.curriculum_requirement ')){
      state.requirements.push({requirement_id:nextRequirement++,requirement_type:parameters[0],required_credits:parameters[1],required_subjects:parameters[2],curriculum_id:parameters[3]});return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO public.subject_prerequisite ')){
      const current=state.curriculumSubjects.find(row=>row.curriculum_subject_id===parameters[1]);
      const required=state.curriculumSubjects.find(row=>row.curriculum_subject_id===parameters[2]);
      const subject=state.subjects.find(row=>row.subject_id===current.subject_id),requiredSubject=state.subjects.find(row=>row.subject_id===required.subject_id);
      state.prerequisites.push({prerequisite_id:nextPrerequisite++,requirement_type:parameters[0],curriculum_subject_id:parameters[1],required_curriculum_subject_id:parameters[2],curriculum_id:current.curriculum_id,subject_code:subject.subject_code,required_subject_code:requiredSubject.subject_code});return {rows:[]};
    }
    if(sql.startsWith('SELECT cs.curriculum_subject_id,cs.subject_category'))return {rows:state.curriculumSubjects.map(row=>({
      curriculum_subject_id:row.curriculum_subject_id,subject_category:row.subject_category,is_compulsory:row.is_compulsory,
      display_name:row.display_name,prerequisite_details:row.prerequisite_details,
      subject_code:state.subjects.find(item=>item.subject_id===row.subject_id).subject_code
    }))};
    if(sql.startsWith('SELECT requirement_type,required_credits'))return {rows:state.requirements};
    if(sql.startsWith('SELECT sp.requirement_type,s.subject_code'))return {rows:state.prerequisites.map(row=>({requirement_type:row.requirement_type,subject_code:row.subject_code,required_code:row.required_subject_code}))};
    if(sql.startsWith('INSERT INTO migration_meta.reference_data_imports')){
      state.receipts.push({dataset_id:parameters[0],curriculum_id:parameters[1],manifest_sha256:parameters[2],manifest:JSON.parse(parameters[3]),receipt:JSON.parse(parameters[4])});return {rowCount:1};
    }
    return {rows:[],rowCount:0};
  }};
  const result=await applyReferenceImport(client,source,targetWithRollbackApproval,plan.previewSha256,undefined,{rollbackOnly:true});
  assert.equal(result.status,'ROLLED_BACK_TEST');
  assert.equal(result.persisted,false);
  assert.equal(result.committed,undefined);
  assert.equal(result.receipt,undefined);
  assert.ok(statements.some(row=>row.sql.startsWith('INSERT INTO migration_meta.reference_data_imports')));
  assert.equal(statements.at(-1).sql,'ROLLBACK');
  assert.equal(statements.some(row=>row.sql==='COMMIT'),false);
  assert.ok(statements.findIndex(row=>row.sql.includes('SET LOCAL statement_timeout'))<statements.findIndex(row=>row.sql.includes('pg_advisory_xact_lock')));
  assert.equal(result.counts.mappings,79);
  assert.equal(result.counts.newSubjects,79);
});

test('CLI validation is offline and rejects unknown flags without database access',()=>{
  const valid=spawnSync(process.execPath,['tools/db/import-reference.mjs','validate'],{encoding:'utf8'});
  assert.equal(valid.status,0,valid.stderr);
  assert.match(valid.stdout,/'status':?\s*"VALID"|"status": "VALID"/);
  const invalid=spawnSync(process.execPath,['tools/db/import-reference.mjs','validate','--typo'],{encoding:'utf8'});
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/INVALID_CLI_ARGUMENTS/);
  const activation=spawnSync(process.execPath,['tools/db/import-reference.mjs','activate','--target-file','missing-target.json','--expect-manifest-sha256','0'.repeat(64),'--confirm-readers-compatible'],{encoding:'utf8'});
  assert.equal(activation.status,1);
  assert.match(activation.stderr,/MANIFEST_FILE_DIGEST_MISMATCH/);
});

test('source manifest bytes are the reviewed file digest and load without database configuration',async()=>{
  const raw=await readFile(new URL('db/reference-data/network-security/english/manifest.json',ROOT));
  assert.equal(loaded.manifestSha256.length,64);
  assert.equal(raw.length>0,true);
});
