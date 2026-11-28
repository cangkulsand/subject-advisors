import { describe,it,expect,vi } from 'vitest';
import { AuthError } from '../auth/errors';
import { calculateProgress } from './progress';
import { subjectInput,linkInput,validateDependency,validatePrerequisites } from './validation';
import { createSprint2Repository,databaseError,progressSql,snapshotSql,type Database,type Command } from './repository';
import { handleSprint2Request,type Sprint2Dependencies } from './routes';
import type { CurriculumData,ProgressSource,SubjectInput } from './contracts';
const rev='a'.repeat(32);
const curriculum:CurriculumData={curriculumId:1,programme:'DEMO NOT OFFICIAL',version:'DEMO',totalCredits:10,
 subjects:[1,2,3].map(id=>({mappingId:id,subjectId:id,code:'DEMO'+id,name:'Fictional subject '+id,credits:id===3?2:3,category:id===3?'ELECTIVE':'CORE',compulsory:id!==3,semesterTypes:['NORMAL','SHORT']})),links:[]};
function source():ProgressSource{return structuredClone({curriculum,attempts:[],requirements:[{type:'COMPULSORY',credits:6,subjects:2},{type:'ELECTIVE',credits:2,subjects:1}]});}
function deps():Sprint2Dependencies{return {
 auth:{verify:vi.fn(async()=>({clerkUserId:'student_a',sessionId:'test',primaryEmail:{address:'demo@graduate.utm.my',verified:true}})),
  access:{find:vi.fn(async()=>({clerkUserId:'student_a',appRole:'STUDENT' as const,accessStatus:'ACTIVE' as const,roles:['STUDENT' as const]})),initializeStudent:vi.fn()},profiles:{stateFor:vi.fn(async()=>'COMPLETE' as const)}},
 repository:{progress:vi.fn(async()=>source()),catalogue:vi.fn(async()=>({curricula:[],subjects:[]})),curriculum:vi.fn(async()=>({revision:rev,data:structuredClone(curriculum)})),subject:vi.fn(),dependency:vi.fn(),removeDependency:vi.fn(),curriculumProgrammeId:vi.fn(async()=>1),subjectUse:vi.fn(async()=>({picks:0,plans:0,semesters:[]})),removeSubject:vi.fn()},
 scopes:{programmeIds:vi.fn(async()=>[1])}
};}
function request(path:string,method='GET',body?:unknown){return new Request('https://example.test/api/p001-sprint2'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
function admin(d:Sprint2Dependencies){d.auth.verify=vi.fn(async()=>({clerkUserId:'student_a',sessionId:'test',primaryEmail:{address:'demo@gmail.com',verified:true}}));d.auth.access.find=vi.fn(async()=>({clerkUserId:'student_a',appRole:'SYSTEM_ADMIN' as const,accessStatus:'ACTIVE' as const,roles:['SYSTEM_ADMIN' as const]}));return d;}
const newSubject={revision:rev,code:'DEMO4',name:'Not official',credits:2,category:'ELECTIVE',compulsory:false,semesterTypes:['SHORT'],confirmSharedChanges:false,reason:'Fictional change.'};
describe('UC05 academic progress',()=>{
 it('shows an initial state without claiming official completion',()=>{const p=calculateProgress(source());expect(p.noHistory).toBe(true);expect(p.earnedCredits).toBe(0);expect(p.remainingCredits).toBe(10);expect(p.outstandingCompulsory).toBe(2);expect(p).not.toHaveProperty('graduationEligible');});
 it('returns the curriculum prerequisite links',()=>{const s=source();s.curriculum.links=[{id:1,from:2,required:1,kind:'MANDATORY'},{id:2,from:3,required:2,kind:'COREQUISITE'}];expect(calculateProgress(s).links).toEqual(s.curriculum.links);});
 it('counts each credit entitlement once across retakes and exemptions',()=>{const s=source();s.attempts=[{subjectId:1,status:'COMPLETED',recognizedCredits:3},{subjectId:1,status:'COMPLETED',recognizedCredits:3},{subjectId:1,status:'FAILED',recognizedCredits:0},{subjectId:1,status:'EXEMPTED',recognizedCredits:3,remarks:'Recognized'}];const p=calculateProgress(s);expect(p.earnedCredits).toBe(3);expect(p.completedCredits).toBe(3);expect(p.exemptionCredits).toBe(0);});
 it('separates zero-credit exemption satisfaction from earned credits',()=>{const s=source();s.attempts=[{subjectId:1,status:'EXEMPTED',recognizedCredits:0,remarks:'Non-credit exemption'}];const p=calculateProgress(s);expect(p.earnedCredits).toBe(0);expect(p.exemptedSubjects).toBe(1);expect(p.zeroCreditExemptions).toBe(1);expect(p.outstandingCompulsory).toBe(1);});
 it('uses maximum exemption recognition rather than summing attempts',()=>{const s=source();s.attempts=[1,2].map(n=>({subjectId:1,status:'EXEMPTED',recognizedCredits:n,remarks:'Recognized'}));expect(calculateProgress(s).exemptionCredits).toBe(2);});
 it.each(['FAILED','WITHDRAWN'])('excludes %s credits',status=>{const s=source();s.attempts=[{subjectId:1,status,recognizedCredits:0}];expect(calculateProgress(s).earnedCredits).toBe(0);});
 it('counts an exemption saved without remarks, as the Subject records page allows (S3-P004-008)',()=>{const s=source();s.attempts=[{subjectId:1,status:'EXEMPTED',recognizedCredits:3,remarks:null},{subjectId:2,status:'EXEMPTED',recognizedCredits:3,remarks:'  '}];const p=calculateProgress(s);expect(p.subjects.filter(x=>x.outcome==='EXEMPTED').length).toBe(2);expect(p.earnedCredits).toBe(6);expect(p.warnings.join(' ')).not.toContain('inconsistent');});
 it('flags missing exemption information without counting unsupported credits',()=>{const s=source();s.attempts=[{subjectId:1,status:'EXEMPTED',recognizedCredits:null}];const p=calculateProgress(s);expect(p.earnedCredits).toBe(0);expect(p.warnings.join(' ')).toContain('incomplete');});
 it('excludes out-of-curriculum records',()=>{const s=source();s.attempts=[{subjectId:999,status:'COMPLETED',recognizedCredits:50}];expect(calculateProgress(s).earnedCredits).toBe(0);expect(calculateProgress(s).warnings.join(' ')).toContain('outside');});
 it('matches requirement types to categories with spaces and underscores alike (S3-P004-006)',()=>{const s=source();s.curriculum.subjects[2]!.category='Elective E1';s.requirements=[{type:'ELECTIVE_E1',credits:2,subjects:1},{type:' elective  e1 ',credits:null,subjects:1}];s.attempts=[{subjectId:3,status:'COMPLETED',recognizedCredits:2}];const p=calculateProgress(s);expect(p.requirements.map(r=>r.status)).toEqual(['MET','MET']);expect(p.requirements[0]).toMatchObject({earnedCredits:2,satisfiedSubjects:1});expect(p.warnings.join(' ')).not.toContain('no matching classification');});
 it('does not invent a requirement total or a percentage',()=>{const s=source();s.curriculum.totalCredits=0;expect(calculateProgress(s)).toMatchObject({percent:null,remainingCredits:null,totalCredits:null});});
 it('clamps percentage but preserves actual earned credits',()=>{const s=source();s.curriculum.totalCredits=1;s.attempts=[{subjectId:1,status:'COMPLETED',recognizedCredits:3}];expect(calculateProgress(s)).toMatchObject({percent:100,earnedCredits:3,remainingCredits:0});});
 it('checks both group thresholds and leaves unknown groups unassessed',()=>{const s=source();s.attempts=[{subjectId:1,status:'COMPLETED',recognizedCredits:3},{subjectId:2,status:'EXEMPTED',recognizedCredits:0,remarks:'No credits'}];s.requirements.push({type:'UNMAPPED',credits:5,subjects:null});const p=calculateProgress(s);expect(p.requirements[0]).toMatchObject({satisfiedSubjects:2,earnedCredits:3,status:'OUTSTANDING'});expect(p.requirements[2]?.status).toBe('UNASSESSED');});
});
describe('UC06 validation and relationship semantics',()=>{
 it('accepts explicit short-semester rules and configured FYP1 exception',()=>{expect(subjectInput(newSubject,false).semesterTypes).toEqual(['SHORT']);expect(subjectInput({...newSubject,category:'FYP1',semesterTypes:['NORMAL','SHORT']},false).semesterTypes).toEqual(['NORMAL','SHORT']);});
 it.each([{types:[]},{types:['NORMAL','NORMAL']},{types:['SUMMER']}])('rejects invalid semester types %j',({types:semesterTypes})=>expect(()=>subjectInput({...newSubject,semesterTypes},false)).toThrow());
 it.each([-1,1.5,'3'])('rejects invalid credits %s',credits=>expect(()=>subjectInput({...newSubject,credits},false)).toThrow());
 it('requires acknowledgment for shared subject edits',()=>{expect(()=>subjectInput(newSubject,true)).toThrow();expect(subjectInput({...newSubject,confirmSharedChanges:true},true)).toMatchObject({confirmSharedChanges:true});});
 it('does not accept graduation totals, load settings or identity fields',()=>{for(const key of ['totalCredits','requiredCredits','maxCredits','studentId','appRole'])expect(()=>subjectInput({...newSubject,[key]:10},false)).toThrow();});
 it('rejects self links and cross-curriculum links',()=>{expect(()=>linkInput({revision:rev,from:1,required:1,kind:'MANDATORY'})).toThrow();expect(()=>validateDependency(curriculum,{revision:rev,from:1,required:999,kind:'MANDATORY'})).toThrow();});
 it('rejects indirect mandatory cycles including edited links',()=>{const data=structuredClone(curriculum);data.links=[{id:1,from:2,required:1,kind:'MANDATORY'},{id:2,from:3,required:2,kind:'MANDATORY'}];expect(()=>validateDependency(data,{revision:rev,from:1,required:3,kind:'MANDATORY'})).toThrow(/cycle/);});
 it.each(['COREQUISITE','RECOMMENDED'] as const)('allows reciprocal %s relationships without treating them as sequential blockers',kind=>{const data=structuredClone(curriculum);data.links=[{id:1,from:1,required:2,kind}];expect(()=>validateDependency(data,{revision:rev,from:2,required:1,kind})).not.toThrow();});
 it('supports the explicit English 1 to 2 to 3 chain',()=>{const data=structuredClone(curriculum);data.links=[{id:1,from:2,required:1,kind:'MANDATORY'}];expect(()=>validateDependency(data,{revision:rev,from:3,required:2,kind:'MANDATORY'})).not.toThrow();});
 it('rejects duplicates while allowing a link to be edited in place',()=>{const data=structuredClone(curriculum);data.links=[{id:7,from:2,required:1,kind:'MANDATORY'}];const input={revision:rev,from:2,required:1,kind:'MANDATORY' as const};expect(()=>validateDependency(data,input)).toThrow(/exists/);expect(()=>validateDependency(data,input,7)).not.toThrow();});
});
describe('UC24 initial prerequisite validation',()=>{
 const pick=(mappingId:number,code='DEMO'+mappingId)=>({mappingId,code});
 it('normalizes an absent, empty, single and multiple prerequisite selection',()=>{
  expect(subjectInput(newSubject,false).prerequisites).toBeUndefined();
  expect(subjectInput({...newSubject,prerequisites:[]},false).prerequisites).toEqual([]);
  expect(subjectInput({...newSubject,prerequisites:[pick(1)]},false).prerequisites).toEqual([pick(1)]);
  expect(subjectInput({...newSubject,prerequisites:[pick(1),pick(2)]},false).prerequisites).toHaveLength(2);
 });
 it.each([null,{},'DEMO1'] )('rejects a non-array prerequisites value %j',prerequisites=>expect(()=>subjectInput({...newSubject,prerequisites},false)).toThrow());
 it.each([{mappingId:0,code:'DEMO1'},{mappingId:1.5,code:'DEMO1'},{mappingId:'1',code:'DEMO1'},{mappingId:1},{mappingId:1,code:''},{mappingId:1,code:'X'.repeat(21)},{mappingId:1,code:'DEMO1',extra:true},['DEMO1']])('rejects malformed selection %j',entry=>expect(()=>subjectInput({...newSubject,prerequisites:[entry]},false)).toThrow());
 it('rejects duplicate selections by mapping ID',()=>expect(()=>subjectInput({...newSubject,prerequisites:[pick(1),{mappingId:1,code:'OTHER'}]},false)).toThrow(/duplicate/i));
 it('rejects initial prerequisites on subject edits',()=>expect(()=>subjectInput({...newSubject,confirmSharedChanges:true,prerequisites:[pick(1)]},true)).toThrow());
 it('accepts prerequisites together with an existing catalogue subject',()=>expect(subjectInput({...newSubject,existingSubjectId:9,prerequisites:[pick(2)]},false).prerequisites).toEqual([pick(2)]));
 it('rejects mismatched, missing or foreign selections against the snapshot',()=>{
  expect(()=>validatePrerequisites(curriculum,[{mappingId:1,code:'WRONG'}])).toThrow();
  expect(()=>validatePrerequisites(curriculum,[{mappingId:99,code:'DEMO99'}])).toThrow();
  expect(()=>validatePrerequisites(curriculum,[pick(1),pick(3)])).not.toThrow();
 });
});
describe('backend roles and scope',()=>{
 it('reads progress only for verified identity and returns private no-store data',async()=>{const d=deps();const r=await handleSprint2Request(request('/progress?studentId=999'),d);expect(r?.status).toBe(200);expect(d.repository.progress).toHaveBeenCalledWith('student_a');expect(r?.headers.get('Cache-Control')).toBe('no-store');});
 it('requires completed student setup',async()=>{const d=deps();d.auth.profiles={stateFor:vi.fn(async()=>'SETUP_REQUIRED' as const)};expect((await handleSprint2Request(request('/progress'),d))?.status).toBe(403);expect(d.repository.progress).not.toHaveBeenCalled();});
 it('denies student curriculum writes before repository access',async()=>{const d=deps();expect((await handleSprint2Request(request('/curricula/1/subjects','POST',newSubject),d))?.status).toBe(403);expect(d.repository.subject).not.toHaveBeenCalled();});
 it('allows an administrator to read curriculum metadata without a student profile',async()=>{const d=admin(deps());expect((await handleSprint2Request(request('/curricula'),d))?.status).toBe(200);expect(d.auth.profiles?.stateFor).not.toHaveBeenCalled();});
 it('denies suspended administrators',async()=>{const d=admin(deps());d.auth.access.find=vi.fn(async()=>({clerkUserId:'student_a',appRole:'SYSTEM_ADMIN' as const,accessStatus:'SUSPENDED' as const,roles:['SYSTEM_ADMIN' as const]}));expect((await handleSprint2Request(request('/curricula'),d))?.status).toBe(403);});
 it('allows subject creation with validated data',async()=>{const d=admin(deps());d.repository.subject=vi.fn(async()=>({revision:rev,data:curriculum}));expect((await handleSprint2Request(request('/curricula/1/subjects','POST',newSubject),d))?.status).toBe(201);expect(d.repository.subject).toHaveBeenCalledWith(1,null,expect.objectContaining({credits:2,semesterTypes:['SHORT']}),'student_a');});
 it('creates a subject with validated initial prerequisites and returns 201',async()=>{const d=admin(deps());d.repository.subject=vi.fn(async()=>({revision:rev,data:curriculum}));const r=await handleSprint2Request(request('/curricula/1/subjects','POST',{...newSubject,prerequisites:[{mappingId:1,code:'DEMO1'},{mappingId:3,code:'DEMO3'}]}),d);expect(r?.status).toBe(201);expect(d.repository.subject).toHaveBeenCalledWith(1,null,expect.objectContaining({prerequisites:[{mappingId:1,code:'DEMO1'},{mappingId:3,code:'DEMO3'}]}),'student_a');});
 it('allows creation without prerequisites or with an empty list',async()=>{const d=admin(deps());d.repository.subject=vi.fn(async()=>({revision:rev,data:curriculum}));expect((await handleSprint2Request(request('/curricula/1/subjects','POST',newSubject),d))?.status).toBe(201);expect((await handleSprint2Request(request('/curricula/1/subjects','POST',{...newSubject,prerequisites:[]}),d))?.status).toBe(201);});
 it.each([{p:[{mappingId:1,code:'DEMO2'}]},{p:[{mappingId:9,code:'DEMO9'}]},{p:[{mappingId:1,code:'DEMO1'},{mappingId:1,code:'DEMO1'}]}])('rejects invalid initial prerequisite references %j before writing',async ({p:prerequisites})=>{const d=admin(deps());const r=await handleSprint2Request(request('/curricula/1/subjects','POST',{...newSubject,prerequisites}),d);expect(r?.status).toBe(400);expect(d.repository.subject).not.toHaveBeenCalled();});
 it('requires curriculum mapping IDs rather than shared subject IDs',async()=>{const d=admin(deps());const data={...structuredClone(curriculum),subjects:[{...curriculum.subjects[0]!,mappingId:55}]};d.repository.curriculum=vi.fn(async()=>({revision:rev,data}));d.repository.subject=vi.fn(async()=>({revision:rev,data}));
  expect((await handleSprint2Request(request('/curricula/1/subjects','POST',{...newSubject,prerequisites:[{mappingId:1,code:'DEMO1'}]}),d))?.status).toBe(400);expect(d.repository.subject).not.toHaveBeenCalled();
  expect((await handleSprint2Request(request('/curricula/1/subjects','POST',{...newSubject,prerequisites:[{mappingId:55,code:'DEMO1'}]}),d))?.status).toBe(201);});
 it('denies suspended and unauthenticated subject creation before writing',async()=>{
  const d=admin(deps());d.auth.access.find=vi.fn(async()=>({clerkUserId:'student_a',appRole:'SYSTEM_ADMIN' as const,accessStatus:'SUSPENDED' as const,roles:['SYSTEM_ADMIN' as const]}));
  expect((await handleSprint2Request(request('/curricula/1/subjects','POST',{...newSubject,prerequisites:[{mappingId:1,code:'DEMO1'}]}),d))?.status).toBe(403);expect(d.repository.subject).not.toHaveBeenCalled();
  const d2=admin(deps());d2.auth.verify=vi.fn(async()=>{throw new AuthError(401,'SESSION_INVALID','Sign in again.');});
  expect((await handleSprint2Request(request('/curricula/1/subjects','POST',newSubject),d2))?.status).toBe(401);expect(d2.repository.subject).not.toHaveBeenCalled();});
 it('rejects initial prerequisites on subject PUT before writing',async()=>{const d=admin(deps());const r=await handleSprint2Request(request('/curricula/1/subjects/1','PUT',{...newSubject,confirmSharedChanges:true,prerequisites:[{mappingId:2,code:'DEMO2'}]}),d);expect(r?.status).toBe(400);expect(d.repository.subject).not.toHaveBeenCalled();});
 it('denies coordinators initial-prerequisite creation before writing',async()=>{const d=deps();d.auth.access.find=vi.fn(async()=>({clerkUserId:'student_a',appRole:'COORDINATOR' as const,accessStatus:'ACTIVE' as const,roles:['COORDINATOR' as const]}));expect((await handleSprint2Request(request('/curricula/1/subjects','POST',{...newSubject,prerequisites:[{mappingId:1,code:'DEMO1'}]}),d))?.status).toBe(403);expect(d.repository.subject).not.toHaveBeenCalled();});
 it('rejects dependency cycles without calling the write',async()=>{const d=admin(deps());d.repository.curriculum=vi.fn(async()=>({revision:rev,data:{...curriculum,links:[{id:1,from:2,required:1,kind:'MANDATORY' as const}]}}));expect((await handleSprint2Request(request('/curricula/1/dependencies','POST',{revision:rev,from:1,required:2,kind:'MANDATORY'}),d))?.status).toBe(400);expect(d.repository.dependency).not.toHaveBeenCalled();});
 it('does not implement UC07 or other owners routes',async()=>{const d=admin(deps());expect(await handleSprint2Request(new Request('https://test/api/graduation-requirements'),d)).toBeNull();expect((await handleSprint2Request(request('/curricula/1/requirements','PUT',{}),d))?.status).toBe(404);});
 it('redacts unexpected database errors',async()=>{const d=admin(deps());d.repository.catalogue=vi.fn(async()=>{throw new Error('PRIVATE_CREDENTIAL');});const r=await handleSprint2Request(request('/curricula'),d);expect(r?.status).toBe(503);expect(await r?.text()).not.toContain('PRIVATE');});
});
describe('atomic repository contract',()=>{
 function database(allowed=true){const commands:Command[][]=[];const db:Database={query:vi.fn(async()=>[]),transaction:vi.fn(async c=>{commands.push(c);return [[{allowed,revision:rev,data:curriculum}]];})};return{db,commands};}
 it('uses bound owner identity for the single progress snapshot',async()=>{const {db}=database();await createSprint2Repository(db).progress("student' OR TRUE");expect(db.query).toHaveBeenCalledWith(progressSql,["student' OR TRUE"]);expect(progressSql).toContain('p.clerk_user_id=$1');});
 it('locks and checks revisions before any guarded subject/semester mutation',async()=>{const {db,commands}=database();await createSprint2Repository(db).subject(1,1,subjectInput({...newSubject,confirmSharedChanges:true},true),'user_admin');const c=commands[0]!;expect(c[0]?.params).toEqual(['user_admin','Fictional change.']);expect(c[1]?.text).toContain('pg_advisory_xact_lock');expect(c[3]?.params).toEqual([1,rev]);for(const write of c.filter(v=>/^(UPDATE|DELETE|INSERT)/.test(v.text)))expect(write.text).toContain("current_setting('p001s2.allowed'");expect(c.at(-1)?.text).toContain(snapshotSql);});
 it('reports stale updates after a transaction in which writes are guarded off',async()=>{const {db}=database(false);await expect(createSprint2Repository(db).subject(1,1,subjectInput({...newSubject,confirmSharedChanges:true},true),'user_admin')).rejects.toMatchObject({status:409,code:'STALE_CURRICULUM'});});
 it('propagates a transaction failure as a safe conflict',async()=>{const {db}=database();db.transaction=vi.fn(async()=>{throw{code:'23514',detail:'PRIVATE'};});await expect(createSprint2Repository(db).subject(1,null,subjectInput(newSubject,false),'user_admin')).rejects.toMatchObject({status:409,code:'CURRICULUM_CONFLICT'});});
 it.each(['23505','23503','40001','40P01'])('maps database conflict %s',code=>expect(()=>databaseError({code})).toThrow());
 it('sends dependency deletes with curriculum ownership and revision guards',async()=>{const {db,commands}=database();await createSprint2Repository(db).removeDependency(1,7,rev,'Fictional change.','user_admin');expect(commands[0]?.[4]).toMatchObject({params:[7,1]});expect(commands[0]?.[4]?.text).toContain('curriculum_id=$2');});
 it('inserts initial prerequisites inside the same guarded transaction with bound selections',async()=>{const {db,commands}=database();await createSprint2Repository(db).subject(1,null,{...subjectInput(newSubject,false),prerequisites:[{mappingId:1,code:'DEMO1'},{mappingId:2,code:'DEMO2'}]},'user_admin');const c=commands[0]!;const edge=c.find(v=>v.text.includes('jsonb_to_recordset'));expect(edge?.text).toContain('subject_prerequisite');expect(edge?.text).toContain("'MANDATORY'");expect(edge?.text).toContain("current_setting('p001s2.allowed'");expect(edge?.params).toEqual([JSON.stringify([{mappingId:1,code:'DEMO1'},{mappingId:2,code:'DEMO2'}]),1]);expect(c.indexOf(edge!)).toBeLessThan(c.length-1);});
 it('sends no prerequisite selection when legacy callers omit the field',async()=>{const {db,commands}=database();await createSprint2Repository(db).subject(1,null,subjectInput(newSubject,false),'user_admin');const edge=commands[0]!.find(v=>v.text.includes('jsonb_to_recordset'));expect(edge?.params).toEqual(['[]',1]);});
 it('maps a null prerequisite identity to a safe 400',()=>expect(()=>databaseError({code:'23502'})).toThrow(expect.objectContaining({status:400,code:'INVALID_PREREQUISITE'})));
 it('never changes programme totals or semester loads',async()=>{const {db,commands}=database();await createSprint2Repository(db).subject(1,null,subjectInput(newSubject,false) as SubjectInput,'user_admin');const sql=commands.flat().map(c=>c.text).join('\n');expect(sql).not.toMatch(/(?:UPDATE|INSERT INTO|DELETE FROM) public\.(curriculum_requirement|academic_semester|curriculum)\b/);});
});

function coordinator(d:Sprint2Dependencies){d.auth.verify=vi.fn(async()=>({clerkUserId:'coord_a',sessionId:'test',primaryEmail:{address:'ecjh@utm.my',verified:true}}));d.auth.access.find=vi.fn(async()=>({clerkUserId:'coord_a',appRole:'COORDINATOR' as const,accessStatus:'ACTIVE' as const,roles:['COORDINATOR' as const]}));return d;}
const sharedCurriculum=():CurriculumData=>({...structuredClone(curriculum),subjects:curriculum.subjects.map(x=>({...x,sharedWith:x.mappingId===1?[{programmeId:2,programmeCode:'SECRH'}]:[]}))});
const edit={revision:rev,code:'DEMO1',name:'Fictional subject 1',credits:3,category:'CORE',compulsory:true,semesterTypes:['NORMAL','SHORT'],confirmSharedChanges:true,reason:'Fictional change.'};
describe('coordinator subject editing (S3-P004-041)',()=>{
 it('a coordinator lists only the curricula of programmes in scope',async()=>{const d=coordinator(deps());d.scopes.programmeIds=vi.fn(async()=>[1,4]);expect((await handleSprint2Request(request('/curricula'),d))?.status).toBe(200);expect(d.repository.catalogue).toHaveBeenCalledWith([1,4]);expect(d.scopes.programmeIds).toHaveBeenCalledWith('coord_a');});
 it('an admin lists every curriculum and never reads coordinator scope',async()=>{const d=admin(deps());await handleSprint2Request(request('/curricula'),d);expect(d.repository.catalogue).toHaveBeenCalledWith(undefined);expect(d.scopes.programmeIds).not.toHaveBeenCalled();});
 it('a coordinator gets 403 on a curriculum outside scope, read or write, before any write',async()=>{const d=coordinator(deps());d.repository.curriculumProgrammeId=vi.fn(async()=>2);
  for(const [path,method,body] of [['/curricula/1','GET',undefined],['/curricula/1/subjects','POST',newSubject],['/curricula/1/subjects/1','PUT',edit],['/curricula/1/subjects/1','DELETE',{revision:rev,reason:'x'}]] as const){
   const r=await handleSprint2Request(request(path,method,body),d);expect(r?.status).toBe(403);expect((await r!.json()).error).toEqual({code:'CURRICULUM_OUT_OF_SCOPE',message:'This curriculum is outside your coordinator assignment.'});}
  expect(d.repository.subject).not.toHaveBeenCalled();expect(d.repository.removeSubject).not.toHaveBeenCalled();});
 it('a coordinator cannot change the code, name or credits of a subject another programme uses, but can change its category',async()=>{const d=coordinator(deps());d.repository.curriculum=vi.fn(async()=>({revision:rev,data:sharedCurriculum()}));d.repository.subject=vi.fn(async()=>({revision:rev,data:curriculum}));
  for(const change of [{code:'DEMO1X'},{name:'Renamed'},{credits:4}]){const r=await handleSprint2Request(request('/curricula/1/subjects/1','PUT',{...edit,...change}),d);expect(r?.status).toBe(403);
   expect((await r!.json()).error).toEqual({code:'SUBJECT_SHARED_OUTSIDE_SCOPE',message:'This subject is also used by SECRH. Ask its coordinator or the admin to change its code, name or credits.'});}
  expect(d.repository.subject).not.toHaveBeenCalled();
  expect((await handleSprint2Request(request('/curricula/1/subjects/1','PUT',{...edit,category:'ELECTIVE'}),d))?.status).toBe(200);
  expect(d.repository.subject).toHaveBeenCalledWith(1,1,expect.objectContaining({category:'ELECTIVE',reason:'Fictional change.'}),'coord_a');});
 it('a coordinator whose scope covers every user of the subject may change its code',async()=>{const d=coordinator(deps());d.scopes.programmeIds=vi.fn(async()=>[1,2]);d.repository.curriculum=vi.fn(async()=>({revision:rev,data:sharedCurriculum()}));d.repository.subject=vi.fn(async()=>({revision:rev,data:curriculum}));
  expect((await handleSprint2Request(request('/curricula/1/subjects/1','PUT',{...edit,code:'DEMO1X'}),d))?.status).toBe(200);});
 it('an admin may change a shared subject',async()=>{const d=admin(deps());d.repository.curriculum=vi.fn(async()=>({revision:rev,data:sharedCurriculum()}));d.repository.subject=vi.fn(async()=>({revision:rev,data:curriculum}));
  expect((await handleSprint2Request(request('/curricula/1/subjects/1','PUT',{...edit,code:'DEMO1X'}),d))?.status).toBe(200);});
 it('every write needs a reason',async()=>{const d=admin(deps());const {reason:_r,...noReason}=newSubject;void _r;
  expect((await handleSprint2Request(request('/curricula/1/subjects','POST',noReason),d))?.status).toBe(400);
  expect((await handleSprint2Request(request('/curricula/1/dependencies','POST',{revision:rev,from:2,required:1,kind:'MANDATORY'}),d))?.status).toBe(400);
  expect((await handleSprint2Request(request('/curricula/1/subjects/1','DELETE',{revision:rev}),d))?.status).toBe(400);
  expect(d.repository.subject).not.toHaveBeenCalled();expect(d.repository.dependency).not.toHaveBeenCalled();expect(d.repository.removeSubject).not.toHaveBeenCalled();});
 it('a subject that students picked or planned cannot be removed',async()=>{const d=admin(deps());d.repository.subjectUse=vi.fn(async()=>({picks:6,plans:1,semesters:['2026/2027 S1']}));
  const r=await handleSprint2Request(request('/curricula/1/subjects/2','DELETE',{revision:rev,reason:'Dropped from the programme.'}),d);expect(r?.status).toBe(409);
  expect((await r!.json()).error).toEqual({code:'SUBJECT_IN_USE',message:"Picked by 6 students in 2026/2027 S1 and in 1 graduation plan. It can't be removed yet.",details:{picks:6,plans:1}});
  expect(d.repository.removeSubject).not.toHaveBeenCalled();});
 it('removes an unused subject with the actor and reason, and reports what was cleared',async()=>{const d=admin(deps());d.repository.removeSubject=vi.fn(async()=>({revision:rev,data:curriculum,removed:{scenarioRows:2,prerequisiteLinks:1}}));
  const r=await handleSprint2Request(request('/curricula/1/subjects/2','DELETE',{revision:rev,reason:' Dropped from the programme. '}),d);expect(r?.status).toBe(200);
  expect((await r!.json()).data.removed).toEqual({scenarioRows:2,prerequisiteLinks:1});expect(d.repository.removeSubject).toHaveBeenCalledWith(1,2,rev,'Dropped from the programme.','student_a');});
 it('removing a subject not in the curriculum is 404',async()=>{const d=admin(deps());expect((await handleSprint2Request(request('/curricula/1/subjects/99','DELETE',{revision:rev,reason:'x'}),d))?.status).toBe(404);});
});

describe('curriculum writes carry the actor context (S3-P004-041)',()=>{
 function db(){const commands:Command[][]=[];const database:Database={query:vi.fn(async()=>[]),transaction:vi.fn(async(c:Command[])=>{commands.push(c);return c.map((_,i)=>i===c.length-1?[{allowed:true,revision:rev,data:curriculum}]:[{ n:0 }]);})};return {database,commands};}
 it('every mutation first sets the audit actor and reason for the triggers',async()=>{const {database,commands}=db();await createSprint2Repository(database).dependency(1,null,{revision:rev,from:2,required:1,kind:'MANDATORY',reason:'Fictional change.'},'user_admin');
  expect(commands[0]![0]!.text).toContain("set_config('app.access_actor',$1,true)");expect(commands[0]![0]!.params).toEqual(['user_admin','Fictional change.']);});
 it('removing a subject clears scenarios, both-side links and semester rules before the mapping',async()=>{const {database,commands}=db();await createSprint2Repository(database).removeSubject(1,5,rev,'Fictional change.','user_admin');
  const texts=commands[0]!.map(c=>c.text.replace(/\s+/g,' '));
  const at=(needle:string)=>texts.findIndex(t=>t.includes(needle));
  expect(at('DELETE FROM public.simulation_subject')).toBeGreaterThan(0);
  expect(at('DELETE FROM public.subject_prerequisite')).toBeGreaterThan(at('DELETE FROM public.simulation_subject'));
  expect(texts[at('DELETE FROM public.subject_prerequisite')]).toContain('curriculum_subject_id=$1 OR required_curriculum_subject_id=$1');
  expect(at('DELETE FROM public.subject_semester_rule')).toBeGreaterThan(at('DELETE FROM public.subject_prerequisite'));
  expect(at('DELETE FROM public.curriculum_subject')).toBeGreaterThan(at('DELETE FROM public.subject_semester_rule'));
  for(const needle of ['simulation_subject','subject_prerequisite','subject_semester_rule','DELETE FROM public.curriculum_subject']) expect(texts[at(needle.startsWith('DELETE')?needle:'DELETE FROM public.'+needle)]).toContain("current_setting('p001s2.allowed',true)='true'");});
});

describe('coordinator subject editing review fixes (S3-P004-041)',()=>{
 it('a stored SYSTEM_ADMIN role that the email domain does not allow gives no admin bypass',async()=>{const d=coordinator(deps());d.auth.access.find=vi.fn(async()=>({clerkUserId:'coord_a',appRole:'COORDINATOR' as const,accessStatus:'ACTIVE' as const,roles:['SYSTEM_ADMIN' as const,'COORDINATOR' as const]}));
  expect((await handleSprint2Request(request('/curricula'),d))?.status).toBe(200);expect(d.repository.catalogue).toHaveBeenCalledWith([1]);expect(d.scopes.programmeIds).toHaveBeenCalledWith('coord_a');});
 it('every snapshot returned to a coordinator carries the shared-subject lock, including after a save',async()=>{const d=coordinator(deps());d.repository.curriculum=vi.fn(async()=>({revision:rev,data:sharedCurriculum()}));d.repository.subject=vi.fn(async()=>({revision:rev,data:sharedCurriculum()}));
  const r=await handleSprint2Request(request('/curricula/1/subjects/1','PUT',{...edit,category:'ELECTIVE'}),d);expect(r?.status).toBe(200);
  const body=await r!.json();expect(body.data.data.subjects[0].lockedBy).toEqual(['SECRH']);expect(body.data.data.subjects[1].lockedBy).toEqual([]);});
 it('an admin never gets a lock',async()=>{const d=admin(deps());d.repository.subject=vi.fn(async()=>({revision:rev,data:sharedCurriculum()}));
  const body=await (await handleSprint2Request(request('/curricula/1/subjects/1','PUT',{...edit,category:'ELECTIVE'}),d))!.json();expect(body.data.data.subjects[0].lockedBy).toBeUndefined();});
});

describe('snapshot requirement groups (S3-P004-044)',()=>{
 it('the snapshot carries the curriculum requirement groups outside the revision',async()=>{
  const query=vi.fn(async(text:string)=>text.includes('FROM public.curriculum_requirement')?[{type:'ELECTIVE_E1',credits:null,subjects:4}]:text.includes('md5(')?[{revision:rev,data:structuredClone(curriculum)}]:[]);
  const snapshot=await createSprint2Repository({query,transaction:vi.fn()} as unknown as Database).curriculum(1);
  expect(snapshot?.revision).toBe(rev);expect(snapshot?.data.requirements).toEqual([{type:'ELECTIVE_E1',credits:null,subjects:4}]);
  const sql=query.mock.calls.find(([t])=>String(t).includes('FROM public.curriculum_requirement'))!;expect(sql[1]).toEqual([1]);});
});
