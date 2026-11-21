// Actual shared app, mocked Clerk/API. --installed also exercises pasted owner pages.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { assertReadable } from '../ui/readability.mjs';
import { prepareIntegration } from './prepare.mjs';
import { fixtureResponse as adminFixtureResponse } from '../admin/fixtures.mjs';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const features=await prepareIntegration();const installed=process.argv.includes('--installed');
if(installed&&!['p001Api','p001Web','p002Api','p002Web'].every(name=>features[name]))throw new Error('--installed requires both real owner overlays');
const output=await build({entryPoints:['tools/auth/local/main.tsx'],bundle:true,write:false,outdir:'.wrangler/integration-ui',jsx:'automatic',loader:{'.png':'dataurl'},alias:{'@clerk/react':resolve('apps/web/src/features/auth/testing/clerk-mock.tsx')},define:{'process.env.NODE_ENV':'"development"','import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':'"TEST_ONLY_PUBLIC_KEY"'}});
const script=output.outputFiles.find(file=>file.path.endsWith('.js')).text,css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(script);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser,passed=0;
const profile={studentId:1,studentName:'DEMO NOT OFFICIAL',matricNo:'A22EC0001',learningCentreId:1,learningCentreLocked:false,curriculumId:1,currentSemesterId:1,weeklyWorkingHours:0,availableStudyHours:8,programmeCode:'DEMO',programmeName:'DEMO',curriculumVersion:'DEMO',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
const progressSubjects=[1,2,3].map(id=>({mappingId:id,subjectId:100+id,code:'DEMO'+id,name:'Fictional subject '+id,credits:3,category:'CORE',compulsory:true,semesterTypes:id===3?['SHORT']:['NORMAL','SHORT'],outcome:['COMPLETED','REMAINING','REMAINING'][id-1],earnedCredits:id===1?3:0}));
const progressFixture={programme:'DEMO programme - NOT OFFICIAL',version:'DEMO_A',totalCredits:9,earnedCredits:3,completedCredits:3,exemptionCredits:0,remainingCredits:6,percent:33,completedSubjects:1,exemptedSubjects:0,zeroCreditExemptions:0,outstandingCompulsory:2,noHistory:false,warnings:[],links:[{id:1,from:2,required:1,kind:'MANDATORY'},{id:2,from:3,required:2,kind:'MANDATORY'},{id:3,from:3,required:1,kind:'RECOMMENDED'}],subjects:progressSubjects,requirements:[{type:'COMPULSORY',credits:9,subjects:3,earnedCredits:3,satisfiedSubjects:1,status:'OUTSTANDING'}]};
const gradFixture={requiredCredits:120,earnedCredits:90,remainingCredits:30,creditsMet:false,status:'NOT_YET_ELIGIBLE',missing:['30 more credits needed.','Confirm you have no outstanding fees.','Confirm you have your MUET certificate.'],feesClearedConfirmedAt:null,muetConfirmedAt:null};
const planSubject=(id,code,credits,extra={})=>({curriculumSubjectId:id,subjectCode:code,subjectName:'Fictional '+code,creditHours:credits,category:'Core',compulsory:true,semesterTypes:['NORMAL'],prerequisites:[],...extra});
const PLAN_TOKEN='a'.repeat(64);
const planFixture={programmeName:'DEMO programme - NOT OFFICIAL',curriculumVersion:'DEMO_A',totalCredits:21,earnedCredits:0,passed:[],approvedFirst:null,start:{academicYear:'2026/2027',semesterNo:2},curriculumId:1,recorded:{},baselineVersion:PLAN_TOKEN,
 limits:[['2026/2027',2],['2026/2027',3],['2027/2028',1],['2027/2028',2],['2027/2028',3],['2028/2029',1],['2028/2029',2],['2028/2029',3]].map(([academicYear,semesterNo],i)=>({semesterId:21+i,academicYear,semesterNo,maxSubjects:3,maxCredits:semesterNo===3?6:10})),
 requirements:[{requirementType:'CORE',requiredSubjects:4,requiredCredits:12},{requirementType:'ELECTIVE_E1',requiredSubjects:1,requiredCredits:null},{requirementType:'UNIVERSITY_COMPULSORY',requiredSubjects:3,requiredCredits:6}],
 subjects:[planSubject(1,'DEMA1013',3),planSubject(2,'DEMA2013',3,{prerequisites:[1]}),planSubject(3,'DEMA3013',3,{prerequisites:[2]}),planSubject(4,'DEMB1013',3),
  planSubject(5,'DEME1013',3,{category:'Elective E1',compulsory:false}),planSubject(6,'DEME2013',3,{category:'Elective E1',compulsory:false}),planSubject(7,'DEME3013',3,{category:'Elective E1',compulsory:false,prerequisites:[5]}),
  planSubject(8,'DEML1112',2,{category:'University Compulsory',semesterTypes:['SHORT']}),planSubject(9,'DEML2122',2,{category:'University Compulsory',semesterTypes:['SHORT'],prerequisites:[8]}),planSubject(10,'DEML3132',2,{category:'University Compulsory',semesterTypes:['SHORT'],prerequisites:[9]})]};
async function mock(page,state={}){
 await page.route(/\/api\//,async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/admin/')){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:adminFixtureResponse(new URL(route.request().url()))})});return;}
  (state.requests??=[]).push({path,method:route.request().method()});
  if(path==='/api/p001-sprint2/progress'){if(state.progressFail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SPRINT2_UNAVAILABLE',message:'Please retry later.'}})});return;}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:state.progress??progressFixture})});return;}
  if(path==='/api/planning/scenario'){const method=route.request().method();(state.scenarioWrites??=[]);
   if(method==='PUT'){const body=route.request().postDataJSON();state.scenarioWrites.push({method,body});if(state.holdSave)await new Promise(resolve=>{state.releaseSave=resolve;});if(state.scenarioFail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SPRINT2_UNAVAILABLE',message:'Please retry later.'}})});return;}if(body.baselineVersion!==undefined&&body.baselineVersion!==(state.plan?.baselineVersion??planFixture.baselineVersion)){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'PLANNING_BASELINE_CHANGED',message:'Your plan changed since you opened this page. Refresh the plan to continue.'}})});return;}state.scenario={changes:body.changes,savedAt:'2026-11-17T02:00:00.000Z'};}
   if(method==='DELETE'){state.scenarioWrites.push({method});state.scenario=null;}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:method==='DELETE'?null:state.scenario??null})});return;}
  if(path==='/api/planning/input'){if(state.planFail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SPRINT2_UNAVAILABLE',message:'Please retry later.'}})});return;}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:state.plan??planFixture})});return;}
  if(path==='/api/graduation-check'||path==='/api/graduation-check/confirmations'){
   if(route.request().method()==='PUT'){const body=route.request().postDataJSON();(state.graduationPuts??=[]).push(body);if(state.graduationSaveFail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'GRADUATION_UNAVAILABLE',message:'Could not save your confirmations.'}})});return;}const at='2026-11-15T02:00:00.000Z',prev=state.graduation??gradFixture,fc=body.feesCleared?(prev.feesClearedConfirmedAt??at):null,mc=body.muet?(prev.muetConfirmedAt??at):null,missing=[];if(prev.requiredCredits===null)missing.push('The programme credit requirement is not configured.');else if(!prev.creditsMet)missing.push((prev.requiredCredits-prev.earnedCredits)+' more credits needed.');if(!fc)missing.push('Confirm you have no outstanding fees.');if(!mc)missing.push('Confirm you have your MUET certificate.');state.graduation={...prev,feesClearedConfirmedAt:fc,muetConfirmedAt:mc,missing,status:prev.requiredCredits===null?'CANNOT_ASSESS':missing.length===0?'ELIGIBLE':'NOT_YET_ELIGIBLE'};}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:state.graduation??gradFixture})});return;}
  if(path==='/api/semester-offerings'&&state.offeringsFail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'Please retry later.'}})});return;}
  if(path==='/api/me')state.accountReads=(state.accountReads??0)+1;
  if(path==='/api/profile'&&route.request().method()==='PUT')state.setup=false;
  const role=state.role??'STUDENT',roles=state.roles??[role],availableRoles=state.availableRoles??roles;
  const studentProfileState=availableRoles.includes('STUDENT')?(state.setup?'SETUP_REQUIRED':'COMPLETE'):'NOT_APPLICABLE';
  const data=path==='/api/me'?{clerkUserId:'user_test',appRole:role,roles,availableRoles,studentProfileState,accessStatus:'ACTIVE',profileState:role==='STUDENT'?studentProfileState:'NOT_APPLICABLE',landingPath:role==='SYSTEM_ADMIN'?'/admin':role==='COORDINATOR'?'/coordinator':state.setup?'/student/setup':'/student'}
   :path==='/api/profile'?(state.setup?null:profile):path==='/api/profile/options'?{learningCentres:[{learningCentreId:1,centreCode:'KL',centreName:'DEMO Kuala Lumpur'},{learningCentreId:2,centreCode:'JB',centreName:'DEMO Johor Bahru'}],curricula:[{curriculumId:1,curriculumVersion:'DEMO',programmeId:1,programmeCode:'DEMO',programmeName:'DEMO'}],subjects:[{subjectId:1,subjectCode:'DEMO101',subjectName:'DEMO Subject',creditHours:3,subjectCategory:'CORE'}],currentSemester:{semesterId:1,academicYear:'1001/1002',semesterNo:1,semesterType:'NORMAL'},currentAcademicYear:'1001/1002',semesters:[{semesterId:1,academicYear:'1001/1002',semesterNo:1,semesterType:'NORMAL'}]}
   :path==='/api/academic-records'?[]:path==='/api/semester-offerings'?{currentSemesterId:'1',window:{status:'OPEN',targetSemesterId:'1',selectionOpensAt:null,selectionClosesAt:null,learningCentreName:'KL'},curriculum:{curriculumId:'1',name:'DEMO',programmeName:'DEMO'},subjects:[{subjectId:'102',curriculumSubjectId:'1',code:'DEMO101',name:'DEMO Subject',creditHours:3}],semesters:[{semesterId:'1',academicYear:'1001/1002',semesterNo:1}],selection:{semesterId:'1',curriculumSubjectIds:[]}}
   :path==='/api/pathway/graph'?{curriculumId:1,curriculumVersion:'DEMO',programmeName:'Fictional demo programme',demo:true,nodes:[
    {id:'10',subjectCode:'DEMO101',subjectName:'Foundations',creditHours:3,isCompulsory:true,subjectCategory:'CORE',status:'COMPLETED',grade:'A',recognizedCredits:3},
    {id:'11',subjectCode:'DEMO201',subjectName:'Applied study',creditHours:3,isCompulsory:true,subjectCategory:'CORE',status:'REMAINING',grade:null,recognizedCredits:null},
   ],edges:[{id:'1',source:'10',target:'11',requirementType:'MANDATORY'}]}:{};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
 });
 return state;
}
async function clickStudentLink(page,name){
 const nav=page.getByRole('navigation',{name:'Student navigation',includeHidden:true});await nav.waitFor({state:'attached'});
 if(page.viewportSize().width<1280){const toggle=page.locator('button[aria-controls="student-sidebar"]');await toggle.waitFor();if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}
 await nav.getByRole('link',{name,exact:true}).click();
}
async function check(name,body,width=390){const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));try{await body(page);await assertReadable(page,name);assert.deepEqual(errors,[]);passed++;console.log('PASS '+name);}finally{await page.close();}}
try{
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 await check('a student-only account has no staff view selector',async page=>{
  await mock(page);await page.goto(base+'/student/profile');await page.getByLabel('Student name',{exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox',{name:'Workspace view'}).count(),0);
 },1440);
 await check('an explicitly multi-role owner switches all views with one Clerk session and fresh access checks',async page=>{
  const state=await mock(page,{roles:['STUDENT','COORDINATOR','SYSTEM_ADMIN']});await page.goto(base+'/student/profile');
  const views=page.getByRole('combobox',{name:'Workspace view'});await views.waitFor();
  assert.deepEqual(await views.locator('option').allTextContents(),['Student','Academic Coordinator','System Admin']);
  const mounts=await page.evaluate(()=>document.documentElement.dataset.clerkMounts);
  for(const [role,path]of [['SYSTEM_ADMIN','/admin'],['COORDINATOR','/coordinator'],['STUDENT','/student']]){
   await page.getByRole('combobox',{name:'Workspace view'}).selectOption(role);await page.waitForURL('**'+path);
  }
  await page.getByRole('table',{name:'Subject records'}).waitFor();assert.equal(state.accountReads,4);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.clerkMounts),mounts);
 },1440);
 await check('an owner can open staff views before completing their student profile',async page=>{
  await mock(page,{roles:['STUDENT','COORDINATOR','SYSTEM_ADMIN'],setup:true});await page.goto(base+'/admin');
  const views=page.getByRole('combobox',{name:'Workspace view'});await views.waitFor();await views.selectOption('STUDENT');await page.waitForURL('**/student/setup');
  await page.getByRole('combobox',{name:'Workspace view'}).selectOption('SYSTEM_ADMIN');await page.waitForURL('**/admin');
  await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();
 },1440);
 await check('a coordinator-only account has no student or admin choices',async page=>{
  const coordinator=await mock(page,{role:'COORDINATOR'});await page.goto(base+'/coordinator');await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();
  await page.getByRole('link',{name:'Data Imports',exact:true}).click();await page.getByRole('heading',{name:'Data Imports',exact:true}).waitFor();
  assert.deepEqual(coordinator.requests.filter(request=>request.path.startsWith('/api/')).map(request=>request.path),['/api/me','/api/coordinator/forecast-context']);
  assert.equal(await page.getByRole('combobox',{name:'Workspace view'}).count(),0);
 },1440);
 await check('a revoked role cannot be selected using an older account snapshot',async page=>{
  const state=await mock(page,{roles:['STUDENT','COORDINATOR','SYSTEM_ADMIN']});await page.goto(base+'/student/profile');
  const views=page.getByRole('combobox',{name:'Workspace view'});await views.waitFor();state.roles=['STUDENT'];
  await views.selectOption('SYSTEM_ADMIN');await page.getByRole('alert').filter({hasText:'no longer available'}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/student/profile');assert.equal(state.accountReads,2);
 },1440);
 for(const width of [320,390])await check('multi-role workspace control remains usable on mobile '+width,async page=>{
  await mock(page,{roles:['STUDENT','COORDINATOR','SYSTEM_ADMIN']});await page.goto(base+'/student/profile');
  await page.getByRole('button',{name:'Toggle header controls'}).click();const views=page.getByRole('combobox',{name:'Workspace view'});await views.waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await views.selectOption('SYSTEM_ADMIN');await page.waitForURL('**/admin');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 },width);
 await check('role switching preserves a student draft when navigation is declined',async page=>{
  await mock(page,{roles:['STUDENT','COORDINATOR','SYSTEM_ADMIN']});await page.goto(base+'/student/profile');
  await page.getByLabel('Student name',{exact:true}).fill('DEMO keep this draft');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('combobox',{name:'Workspace view'}).selectOption('SYSTEM_ADMIN');
  assert.equal(new URL(page.url()).pathname,'/student/profile');assert.equal(await page.getByLabel('Student name',{exact:true}).inputValue(),'DEMO keep this draft');
 },1440);
 await check('a student cannot reach the admin view by typing its URL',async page=>{
  await mock(page);await page.goto(base+'/admin');await page.getByRole('alert').filter({hasText:'does not have access'}).waitFor();
  assert.equal(await page.getByRole('combobox',{name:'Workspace view'}).count(),0);
 },1440);
 for(const path of ['/student/profile','/student/records','/student/progress','/student/graduation','/student/plan','/student/offerings','/student/recommendations','/student/pathway'])await check('shared route and navigation '+path,async page=>{
  await mock(page);await page.goto(base+path);const nav=page.getByRole('navigation',{name:'Student navigation',includeHidden:true});await nav.waitFor({state:'attached'});
  for(const [name,href]of [['Academic profile','/student/profile'],['Subject records','/student/records'],['Graduation check','/student/graduation'],['Graduation plan','/student/plan'],['Semester offerings','/student/offerings'],['Academic pathway','/student/pathway']])assert.equal(await nav.getByRole('link',{name,exact:true,includeHidden:true}).getAttribute('href'),href);
  assert.equal(await page.getByRole('heading',{name:'Page not found',exact:true}).count(),0);
  if(installed)assert.equal(await page.getByText('This page is not available yet. Please try again when the service is enabled.',{exact:true}).count(),0);
 });

 const shots=process.env.PROGRESS_SHOTS;
 async function progressPage(page,state){await mock(page,state);await page.goto(base+'/student/progress');await page.getByText('Credit completion: 33%',{exact:true}).waitFor();}
 async function shot(page,name){if(!shots)return;const {mkdirSync}=await import('node:fs');mkdirSync(shots,{recursive:true});await page.screenshot({path:shots+'/'+name+'.png',fullPage:true});}
 async function shotTop(page,name){if(!shots)return;await page.evaluate(()=>window.scrollTo(0,0));const {mkdirSync}=await import('node:fs');mkdirSync(shots,{recursive:true});await page.screenshot({path:shots+'/'+name+'.png',fullPage:false});}
 for(const width of [1440,375])await check('Academic progress is hidden from the menu, details show prerequisites, unlocks and approval at '+width,async page=>{
  await progressPage(page,{});
  const nav=page.getByRole('navigation',{name:'Student navigation',includeHidden:true});await nav.waitFor({state:'attached'});assert.equal(await nav.getByRole('link',{name:'Academic progress',exact:true,includeHidden:true}).count(),0);assert.equal(await nav.getByRole('link',{name:'Recommendations',exact:true,includeHidden:true}).count(),0);
  await page.getByText('DEMO1 — Fictional subject 1',{exact:true}).first().waitFor();await shot(page,'progress-'+width);
  const opener=page.getByRole('button',{name:'Details for DEMO2',exact:true});await opener.click();
  const dialog=page.getByRole('dialog',{name:'Fictional subject 2'});await dialog.waitFor();
  await dialog.getByRole('heading',{name:'Prerequisites',exact:true}).waitFor();await dialog.getByRole('heading',{name:'Unlocks',exact:true}).waitFor();await dialog.getByRole('heading',{name:'Next semester',exact:true}).waitFor();
  await dialog.getByText('Met',{exact:true}).waitFor();await dialog.getByText('DEMO3 — Fictional subject 3').waitFor();await dialog.getByText('Approved for next semester',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('Availability not confirmed').count(),0);assert.equal(await dialog.locator('input,textarea,select').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(page,'details-'+width);
  await assertReadable(page,'progress details '+width);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Details for DEMO2');
 },width);
 await check('a subject with an unmet mandatory prerequisite, advice only and a Short-only note',async page=>{
  await progressPage(page,{});await page.getByRole('button',{name:'Details for DEMO3',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fictional subject 3'});
  await dialog.getByText('Not met',{exact:true}).waitFor();await dialog.getByText('Recommended (advice only)').waitFor();await dialog.getByText('Offered in Short semester (Semester 3) only',{exact:true}).waitFor();
  await dialog.getByText('Availability not confirmed',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Details for DEMO1',exact:true}).click();await page.getByRole('dialog',{name:'Fictional subject 1'}).getByText('No mandatory prerequisite is configured',{exact:true}).waitFor();
 });
 await check('failed offerings request shows Availability not confirmed and the page still works',async page=>{
  await progressPage(page,{offeringsFail:true});await page.getByRole('button',{name:'Details for DEMO2',exact:true}).click();
  await page.getByRole('dialog',{name:'Fictional subject 2'}).getByText('Availability not confirmed',{exact:true}).waitFor();
 });
 await check('Academic progress filter shows only remaining subjects',async page=>{
  await progressPage(page,{});await page.getByLabel('Show subjects').selectOption('REMAINING');
  await page.getByText('DEMO2 — Fictional subject 2',{exact:true}).first().waitFor();assert.equal(await page.getByText('DEMO1 — Fictional subject 1',{exact:true}).count(),0);
 });
 await check('Academic progress failure offers retry without fabricated totals',async page=>{
  const state={progressFail:true};await mock(page,state);await page.goto(base+'/student/progress');await page.getByRole('alert').first().waitFor();assert.equal(await page.locator('progress').count(),0);
  state.progressFail=false;await page.getByRole('button',{name:'Refresh progress'}).click();await page.getByText('Credit completion: 33%',{exact:true}).waitFor();
 });
 await check('Academic progress with incomplete credit configuration shows no percentage',async page=>{
  await mock(page,{progress:{...progressFixture,percent:null,totalCredits:null,remainingCredits:null,warnings:['The programme credit requirement is not configured.']}});await page.goto(base+'/student/progress');
  await page.getByText('Not configured',{exact:true}).first().waitFor();assert.equal(await page.locator('progress').count(),0);
 });
 await check('Academic progress needs a completed profile',async page=>{await mock(page,{setup:true});await page.goto(base+'/student/progress');await page.waitForURL('**/student/setup');});
 async function graduationPage(page,state){await mock(page,state);await page.goto(base+'/student/records');await clickStudentLink(page,'Graduation check');await page.waitForURL('**/student/graduation');await page.getByText('Not yet eligible',{exact:true}).waitFor();}
 for(const width of [1440,375])await check('Graduation check lists what is missing, saves a confirmation and fails safely at '+width,async page=>{
  const state={};await graduationPage(page,state);
  const nav=page.getByRole('navigation',{name:'Student navigation',includeHidden:true});assert.equal(await nav.getByRole('link',{name:'Graduation check',exact:true,includeHidden:true}).getAttribute('aria-current'),'page');
  for(const line of ['30 more credits needed.','Confirm you have no outstanding fees.','Confirm you have your MUET certificate.'])await page.getByText(line,{exact:true}).waitFor();
  await page.getByText('90 of 120 credits earned',{exact:true}).waitFor();await page.getByText('30 remaining',{exact:true}).waitFor();assert.equal(await page.locator('progress').count(),1);
  await page.getByText('Based on your recorded subjects and your own confirmations. Not an official UTMSPACE graduation decision.',{exact:true}).waitFor();
  assert.equal(await page.getByText('not confirmed',{exact:true}).count(),2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const muet=page.getByLabel('I have my MUET certificate',{exact:true});await muet.check();await page.getByText('confirmed 15 Nov 2026',{exact:true}).waitFor();await page.getByText('Confirm you have your MUET certificate.',{exact:true}).waitFor({state:'detached'});await page.getByText('Confirm you have no outstanding fees.',{exact:true}).waitFor();
  assert.deepEqual(state.graduationPuts.at(-1),{feesCleared:false,muet:true});assert.equal(await muet.isChecked(),true);
  await shot(page,'graduation-'+width);await assertReadable(page,'graduation '+width);
  state.graduationSaveFail=true;const fees=page.getByLabel('I have no outstanding fees (no debt)',{exact:true});await fees.check();
  await page.getByRole('alert').filter({hasText:'Could not save your confirmations.'}).waitFor();assert.equal(await fees.isChecked(),false);
  state.graduationSaveFail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('alert').waitFor({state:'detached'});assert.equal(await fees.isChecked(),true);
 },width);
 await check('Graduation check shows eligible and cannot-assess states',async page=>{
  await mock(page,{graduation:{...gradFixture,status:'ELIGIBLE',earnedCredits:120,remainingCredits:0,creditsMet:true,missing:[],feesClearedConfirmedAt:'2026-11-15T02:00:00.000Z',muetConfirmedAt:'2026-11-15T02:00:00.000Z'}});await page.goto(base+'/student/graduation');
  await page.getByText('Eligible to graduate',{exact:true}).waitFor();assert.equal(await page.getByLabel('I have my MUET certificate',{exact:true}).isChecked(),true);
 });
 await check('Graduation check with no configured requirement shows no progress bar',async page=>{
  await mock(page,{graduation:{...gradFixture,status:'CANNOT_ASSESS',requiredCredits:null,remainingCredits:null,creditsMet:null,missing:['The programme credit requirement is not configured.']}});await page.goto(base+'/student/graduation');
  await page.getByText('Cannot assess',{exact:true}).waitFor();assert.equal(await page.locator('progress').count(),0);
 });
 await check('Graduation check load failure offers retry',async page=>{
  await mock(page,{});await page.route('**/api/graduation-check',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'X',message:'Please retry later.'}})}));
  await page.goto(base+'/student/graduation');await page.getByRole('alert').getByText('Please retry later.').waitFor();assert.equal(await page.locator('progress').count(),0);
 });
 await check('Graduation check needs a completed profile',async page=>{await mock(page,{setup:true});await page.goto(base+'/student/graduation');await page.waitForURL('**/student/setup');});
 for(const width of [1440,375])await check('Graduation plan shows completion, semesters, bottlenecks and assumptions at '+width,async page=>{
  const state=await mock(page);await page.goto(base+'/student/records');await clickStudentLink(page,'Graduation plan');await page.waitForURL('**/student/plan');
  await page.getByRole('group',{name:'Plan view'}).waitFor();assert.equal(await page.getByRole('region',{name:'Plan summary'}).count(),0,'no summary card');
  assert.ok(state.requests.some(r=>r.path==='/api/planning/input'&&r.method==='GET'));
  const semesters=page.locator('.planning-semester');assert.equal(await semesters.count(),8);
  assert.deepEqual(await semesters.first().locator('[data-subject]').evaluateAll(rows=>rows.map(r=>r.dataset.subject)),['DEMA1013','DEMB1013','DEME1013']);
  await semesters.first().getByText('Elective choice: any 1 of 3 options',{exact:true}).waitFor();
  await page.getByText('Nothing can be taken this semester',{exact:false}).first().waitFor();
  await page.getByText('Delaying DEMA1013 delays 2 later subjects (DEMA1013 → DEMA2013 → DEMA3013).',{exact:true}).waitFor();
  await page.getByRole('region',{name:'How this plan is made'}).getByText('This plan is advice only.',{exact:false}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shot(page,'plan-'+width);await assertReadable(page,'plan '+width);
 },width);
 async function whatIfOption(page,code,option){
  await page.getByRole('button',{name:'Move '+code,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move '+code});await dialog.waitFor();
  await dialog.getByRole('group',{name:'Or try'}).getByRole('radio',{name:option,exact:true}).check();
  await dialog.getByRole('button',{name:'Apply',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }
 async function dragToPostpone(page,code){
  const grip=page.locator('[data-subject="'+code+'"]:not(.planning-failed) .planning-grip').first();await grip.scrollIntoViewIfNeeded();
  const g=await grip.boundingBox();
  await page.mouse.move(g.x+g.width/2,g.y+g.height/2);await page.mouse.down();await page.mouse.move(g.x+g.width/2+6,g.y+g.height/2+6,{steps:4});
  const t=await page.locator('.planning-postpone-zone').boundingBox();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:20});await page.waitForTimeout(120);await page.mouse.move(t.x+t.width/2+2,t.y+t.height/2+2,{steps:2});await page.waitForTimeout(120);await page.mouse.up();
 }
 await check('Graduation plan opens on the board; postpone by drop, fail and replace from Move…, compare and reset',async page=>{
  await page.setViewportSize({width:1440,height:2400});
  const state=await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  assert.equal(await page.getByRole('region',{name:'What if…'}).count(),0,'no What if form');
  assert.equal(await page.getByText('A semester-by-semester plan',{exact:false}).count(),0,'no lead text');
  assert.deepEqual(await page.getByRole('group',{name:'Plan view'}).getByRole('button').allInnerTexts(),['Semester plan','Dependencies']);
  assert.equal(await page.getByRole('group',{name:'Plan shown'}).count(),0,'only two tabs');
  assert.equal(await page.getByRole('region',{name:'Plan summary'}).count(),0,'no summary card');
  assert.ok(await page.evaluate(()=>document.querySelector('.planning-board').getBoundingClientRect().top<500),'the board starts near the top of the page');
  await dragToPostpone(page,'DEML1112');
  const changes=page.getByRole('region',{name:'Your changes',exact:true});await changes.getByText('Postpone DEML1112 one semester',{exact:true}).waitFor();
  const compare=page.getByRole('region',{name:'Compare with your plan'});await compare.getByText('3 semesters later',{exact:true}).waitFor();
  await compare.getByRole('definition').getByText('2029/2030 – Semester 3 (Short Semester)',{exact:true}).waitFor();
  await compare.locator('tbody tr[data-subject="DEML1112"]').waitFor();
  await page.getByRole('heading',{name:'Plan with your changes',exact:true}).waitFor();
  await page.getByRole('button',{name:'Move DEML1112',exact:true}).click();
  const moveDialog=page.getByRole('dialog',{name:'Move DEML1112'});
  assert.deepEqual(await moveDialog.getByRole('group',{name:'Or try'}).getByRole('radio').evaluateAll(items=>items.map(item=>item.closest('label').innerText.trim())),['Postpone one semester','Fail it','Withdraw']);
  await moveDialog.getByRole('button',{name:'Cancel',exact:true}).click();await moveDialog.waitFor({state:'hidden'});
  await whatIfOption(page,'DEMB1013','Fail it');
  await page.locator('.planning-semester').first().locator('.planning-failed[data-subject="DEMB1013"]').waitFor();
  await page.getByText('Failed in this what-if: retaken later',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Move DEME1013',exact:true}).click();
  const replaceDialog=page.getByRole('dialog',{name:'Move DEME1013'});
  const replaceOptions=await replaceDialog.getByRole('group',{name:'Or try'}).getByRole('radio').evaluateAll(items=>items.map(item=>item.closest('label').innerText.trim()));
  assert.deepEqual(replaceOptions.filter(text=>text.startsWith('Replace')),['Replace with Fictional DEME2013 (DEME2013)','Replace with Fictional DEME3013 (DEME3013)']);
  await replaceDialog.getByRole('radio',{name:'Replace with Fictional DEME2013 (DEME2013)',exact:true}).check();await replaceDialog.getByRole('button',{name:'Apply',exact:true}).click();
  await page.locator('.planning-semester [data-subject="DEME2013"]').first().waitFor();
  assert.equal(await changes.getByRole('listitem').count(),3);
  await changes.getByRole('button',{name:'Remove: Postpone DEML1112 one semester',exact:true}).click();assert.equal(await changes.getByRole('listitem').count(),2);
  await assertReadable(page,'plan what-if');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await changes.getByRole('button',{name:'Reset to my plan',exact:true}).click();
  const resetDialog=page.getByRole('dialog',{name:'Reset to your plan?'});await resetDialog.waitFor();
  await resetDialog.getByRole('button',{name:'Cancel',exact:true}).click();await resetDialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.textContent==='Reset to my plan',null,{timeout:3000});
  assert.equal(await changes.getByRole('listitem').count(),2);assert.equal((state.scenarioWrites??[]).filter(w=>w.method==='DELETE').length,0);
  await changes.getByRole('button',{name:'Reset to my plan',exact:true}).click();
  await page.getByRole('dialog',{name:'Reset to your plan?'}).getByRole('button',{name:'Reset to my plan',exact:true}).click();
  await compare.waitFor({state:'detached'});assert.equal(await page.getByRole('region',{name:'Your changes',exact:true}).count(),0);
  await page.waitForFunction(()=>(document.activeElement?.getAttribute('aria-label')??document.activeElement?.textContent)==='Refresh plan',null,{timeout:3000});
  assert.ok(state.requests.every(r=>r.method==='GET'||r.path==='/api/planning/scenario'));
  await page.locator('.planning-save').getByText('Saved',{exact:true}).waitFor();assert.equal(state.scenarioWrites.at(-1).method,'DELETE');
 });
 const panel=(page,key)=>page.locator('.planning-semester[data-semester="'+key+'"]');
 async function dragCard(page,code,key){
  const grip=page.locator('[data-subject="'+code+'"]:not(.planning-failed) .planning-grip').first();await grip.scrollIntoViewIfNeeded();
  const g=await grip.boundingBox(),t=await panel(page,key).locator('.planning-cards').boundingBox();
  await page.mouse.move(g.x+g.width/2,g.y+g.height/2);await page.mouse.down();await page.mouse.move(g.x+g.width/2+6,g.y+g.height/2+6,{steps:4});
  await page.mouse.move(t.x+t.width/2,t.y+Math.min(t.height/2,24),{steps:20});await page.waitForTimeout(120);await page.mouse.move(t.x+t.width/2+2,t.y+Math.min(t.height/2,24)+2,{steps:2});await page.waitForTimeout(120);await page.mouse.up();
 }
 for(const width of [1440,375])await check('Plan semesters are coloured by semester number and show their type at '+width,async page=>{
  await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  const panels=await page.locator('.planning-semester').evaluateAll(list=>list.map(el=>({no:el.dataset.semesterNo,color:getComputedStyle(el).borderLeftColor,text:el.textContent})));
  assert.equal(panels.length,8);
  const byNo={};for(const p of panels){byNo[p.no]??=new Set();byNo[p.no].add(p.color);}
  assert.deepEqual(Object.keys(byNo).sort(),['1','2','3']);for(const set of Object.values(byNo))assert.equal(set.size,1);
  assert.equal(new Set(Object.values(byNo).map(s=>[...s][0])).size,3);
  for(const p of panels)assert.ok(p.text.includes(p.no==='3'?'Short semester':'Normal semester'));
  await page.locator('.planning-semester').first().locator('svg').first().waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shot(page,'plan-board-'+width);
 },width);
 await check('Move… pins a subject, re-plans, saves and survives a reload',async page=>{
  const state=await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Move DEMB1013',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move DEMB1013'});await dialog.waitFor();
  await dialog.getByRole('radio',{name:'2027/2028 – Semester 2',exact:true}).check();await dialog.getByRole('button',{name:'Move here',exact:true}).click();
  const card=panel(page,'2027/2028-2').locator('[data-subject="DEMB1013"]');await card.waitFor();await card.getByText('Placed here by you',{exact:true}).waitFor();
  await page.locator('.planning-save').getByText('Saved',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.closest('[data-subject]')?.closest('.planning-semester')?.dataset.semester==='2027/2028-2',null,{timeout:3000});
  assert.deepEqual(state.scenarioWrites.at(-1),{method:'PUT',body:{changes:[{kind:'PLACE',curriculumSubjectId:4,semesterId:24}],baselineVersion:PLAN_TOKEN}});
  await page.getByRole('region',{name:'Your changes',exact:true}).getByText('Move DEMB1013 to 2027/2028 – Semester 2',{exact:true}).waitFor();
  await page.reload();await panel(page,'2027/2028-2').locator('[data-subject="DEMB1013"]').waitFor();
  assert.equal(state.scenarioWrites.length,1);
 });
 await check('A refused move explains why and saves nothing',async page=>{
  await page.setViewportSize({width:1440,height:2400});
  const state=await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Move DEMB1013',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move DEMB1013'});
  await dialog.getByText('now in',{exact:false}).waitFor();
  const blocked=dialog.getByRole('radio',{name:'2026/2027 – Semester 3 (Short Semester)',exact:false});
  assert.ok(await blocked.isDisabled());
  const describedBy=await blocked.getAttribute('aria-describedby');assert.ok(describedBy);
  await dialog.getByText('Runs only in Normal semesters.',{exact:true}).first().waitFor();
  assert.equal(await dialog.locator('[id="'+describedBy+'"]').innerText(),'Runs only in Normal semesters.');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Move DEMB1013',null,{timeout:3000});
  await dragCard(page,'DEMB1013','2026/2027-3');
  await page.getByLabel('Notifications',{exact:true}).getByText('Runs only in Normal semesters.',{exact:true}).waitFor();
  assert.equal(await page.locator('.planning-move-message').count(),0);
  assert.equal(await page.locator('[data-subject="DEMB1013"]').count(),1);assert.equal((state.scenarioWrites??[]).length,0);
 });
 await check('Dragging a card to another semester moves it; dropping it back on its own semester does nothing',async page=>{
  await page.setViewportSize({width:1440,height:2400});
  const state=await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await dragCard(page,'DEMB1013','2026/2027-2');await page.waitForTimeout(300);assert.equal((state.scenarioWrites??[]).length,0);
  await dragCard(page,'DEMB1013','2027/2028-2');
  await panel(page,'2027/2028-2').locator('[data-subject="DEMB1013"]').getByText('Placed here by you',{exact:true}).waitFor();
  await page.locator('.planning-save').getByText('Saved',{exact:true}).waitFor();
  assert.deepEqual(state.scenarioWrites.at(-1).body,{changes:[{kind:'PLACE',curriculumSubjectId:4,semesterId:24}],baselineVersion:PLAN_TOKEN});
  assert.equal(await page.locator('.planning-board [data-subject="DEMB1013"]').count(),1);
 });
 await check('Reset clears the saved what-if; a failed save can be retried',async page=>{
  const state=await mock(page,{scenarioFail:true});await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Move DEMB1013',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move DEMB1013'});await dialog.getByRole('radio',{name:'2027/2028 – Semester 2',exact:true}).check();await dialog.getByRole('button',{name:'Move here',exact:true}).click();
  const save=page.locator('.planning-save');await save.getByText('Not saved',{exact:true}).waitFor();
  await page.getByLabel('Notifications',{exact:true}).getByText('Your last change was not saved. Use Try again at the top of the plan.',{exact:true}).waitFor();
  state.scenarioFail=false;await save.getByRole('button',{name:'Try again',exact:true}).click();await save.getByText('Saved',{exact:true}).waitFor();
  assert.ok(state.scenario);
  await page.getByRole('region',{name:'Your changes',exact:true}).getByRole('button',{name:'Reset to my plan',exact:true}).click();
  const resetDialog=page.getByRole('dialog',{name:'Reset to your plan?'});await resetDialog.waitFor();await page.keyboard.press('Escape');
  await resetDialog.waitFor({state:'hidden'});assert.equal((state.scenarioWrites??[]).filter(w=>w.method==='DELETE').length,0);
  await page.getByRole('region',{name:'Your changes',exact:true}).getByRole('button',{name:'Reset to my plan',exact:true}).click();
  await page.getByRole('dialog',{name:'Reset to your plan?'}).getByRole('button',{name:'Reset to my plan',exact:true}).click();
  await page.locator('.planning-semester').first().locator('[data-subject="DEMB1013"]').waitFor();
  await save.getByText('Saved',{exact:true}).waitFor();assert.equal(state.scenarioWrites.at(-1).method,'DELETE');assert.equal(state.scenario,null);
 });
 await check('Saved changes that no longer apply are removed with a notice',async page=>{
  const state=await mock(page,{scenario:{changes:[{kind:'PLACE',curriculumSubjectId:999,semesterId:24},{kind:'PLACE',curriculumSubjectId:4,semesterId:24}],savedAt:'2026-11-16T00:00:00.000Z'}});
  await page.goto(base+'/student/plan');await page.getByText('Some saved changes no longer apply and were removed.',{exact:true}).waitFor();
  await panel(page,'2027/2028-2').locator('[data-subject="DEMB1013"]').waitFor();
  await page.locator('.planning-save').getByText('Saved',{exact:true}).waitFor();
  assert.deepEqual(state.scenarioWrites,[{method:'PUT',body:{changes:[{kind:'PLACE',curriculumSubjectId:4,semesterId:24}],baselineVersion:PLAN_TOKEN}}]);
 });
 await check('A saved what-if opens editable; a plan without a calendar is read-only',async page=>{
  await mock(page,{scenario:{changes:[{kind:'PLACE',curriculumSubjectId:4,semesterId:24}],savedAt:'2026-11-16T00:00:00.000Z'}});
  await page.goto(base+'/student/plan');await panel(page,'2027/2028-2').locator('[data-subject="DEMB1013"]').waitFor();
  assert.ok(await page.locator('.planning-grip').count()>0);await page.locator('.planning-postpone-zone').waitFor();
  await page.unrouteAll({behavior:'ignoreErrors'});
  await mock(page,{plan:{...planFixture,start:null,limits:[]}});await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.locator('.planning-semester-head').getByText('Plan semester 1',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.planning-grip').count(),0);assert.equal(await page.getByRole('button',{name:/^Move /}).count(),0);assert.equal(await page.locator('.planning-postpone-zone').count(),0);
 });
 await check('Graduation plan shows done, unplanned and load-failure states',async page=>{
  await mock(page,{plan:{...planFixture,passed:[1,2,3,4,5,8,9,10]}});await page.goto(base+'/student/plan');
  await page.getByText('No subjects left to plan',{exact:true}).waitFor();assert.equal(await page.locator('.planning-postpone-zone').count(),0);
  await page.unrouteAll({behavior:'ignoreErrors'});
  await mock(page,{plan:{...planFixture,requirements:[],subjects:[...planFixture.subjects,planSubject(11,'DEMX4118',12)]}});await page.goto(base+'/student/plan');
  await page.getByRole('heading',{name:'Some subjects cannot be planned',exact:true}).waitFor();await page.getByText('Worth 12 credits, more than any semester allows.',{exact:false}).waitFor();
  await page.unrouteAll({behavior:'ignoreErrors'});
  const state={planFail:true};await mock(page,state);await page.goto(base+'/student/plan');await page.getByRole('alert').getByText('Please retry later.').waitFor();
  state.planFail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('group',{name:'Plan view'}).waitFor();
 });
 for(const width of [1440,375])await check('Recommendations rank the next semester, explain why and list alternatives at '+width,async page=>{
  const state=await mock(page);await page.goto(base+'/student/recommendations');
  await page.getByRole('heading',{name:'Recommended for 2026/2027 – Semester 2',exact:true}).waitFor();
  const best=page.getByRole('region',{name:'Recommended subjects'});
  assert.deepEqual(await best.locator('tbody tr').evaluateAll(rows=>rows.map(r=>r.dataset.subject)),['DEMA1013','DEMB1013','DEME1013']);
  await best.getByText('Unlocks 2 later subjects',{exact:true}).waitFor();await best.getByText('Counts toward Elective E1',{exact:true}).waitFor();
  await page.getByText('No specific prerequisite warning was found from the available data.',{exact:true}).waitFor();
  assert.equal(await page.locator('.recommend-alternatives > li').count(),3);
  await page.getByRole('heading',{name:'Option 2',exact:true}).waitFor();
  assert.equal(await page.getByText('Same completion as the recommendation',{exact:false}).count(),3);
  assert.equal(await page.getByRole('link',{name:'Save your picks on Semester offerings',exact:true}).getAttribute('href'),'/student/offerings');
  assert.equal(await page.getByRole('link',{name:'Try what-ifs in your Graduation plan',exact:true}).getAttribute('href'),'/student/plan');
  assert.ok(state.requests.every(r=>r.method==='GET'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shot(page,'recommend-'+width);await assertReadable(page,'recommendations '+width);
 },width);
 await check('Recommendations warn about a Short-only chain and handle no candidates and failures',async page=>{
  await mock(page,{plan:{...planFixture,start:{academicYear:'2026/2027',semesterNo:3}}});await page.goto(base+'/student/recommendations');
  await page.getByText('Short semester only: the next chance is 2027/2028 – Semester 3 (Short Semester)',{exact:true}).waitFor();
  await page.getByText('If you do not take DEML1112 in 2026/2027 – Semester 3 (Short Semester), your earliest completion moves from',{exact:false}).waitFor();
  await page.unrouteAll({behavior:'ignoreErrors'});
  await mock(page,{plan:{...planFixture,approvedFirst:[]}});await page.goto(base+'/student/recommendations');
  await page.getByRole('heading',{name:'No recommendation for 2026/2027 – Semester 2',exact:true}).waitFor();
  await page.getByText('Only subjects your coordinator approved for 2026/2027 – Semester 2 are recommended.',{exact:true}).waitFor();
  await page.unrouteAll({behavior:'ignoreErrors'});
  const state={planFail:true};await mock(page,state);await page.goto(base+'/student/recommendations');await page.getByRole('alert').getByText('Please retry later.').waitFor();
  state.planFail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('heading',{name:'Recommended for 2026/2027 – Semester 2',exact:true}).waitFor();
 });
 await check('P003 pathway loads a graph, inspects a node and switches to the accessible list',async page=>{
  const state=await mock(page);await page.goto(base+'/student/pathway');
  const node=page.getByRole('button',{name:'DEMO101 Foundations, 3 credits, Completed'});await node.waitFor();
  assert.ok(state.requests.some(request=>request.path==='/api/pathway/graph'&&request.method==='GET'));
  await node.click();await page.getByRole('complementary',{name:'Selected subject details'}).getByText('Completed',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Switch to list view'}).click();
  await page.getByRole('list',{name:'Curriculum subjects'}).getByText('Applied study').waitFor();
 });
 await check('profile-to-offerings navigation uses shared route',async page=>{await mock(page);await page.goto(base+'/student/profile');await clickStudentLink(page,'Semester offerings');await page.waitForURL('**/student/offerings');await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).waitFor({state:'attached'});});
 for(const path of ['/student/records','/student/progress','/student/graduation','/student/plan','/student/offerings','/student/recommendations','/student/pathway'])await check('setup guard covers '+path,async page=>{await mock(page,{setup:true});await page.goto(base+path);await page.waitForURL('**/student/setup');await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).waitFor({state:'attached'});});
 await check('coordinator cannot open student offerings',async page=>{await mock(page,{role:'COORDINATOR'});await page.goto(base+'/student/offerings');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).count(),0);});
 await check('P001 actions use burgundy and explicit Cancel uses red in the shared shell',async page=>{
  await mock(page);await page.goto(base+'/student/profile');const name=page.getByLabel('Student name',{exact:true});await name.waitFor();await name.fill('DEMO updated');
  const save=page.getByRole('button',{name:'Save profile',exact:true}),cancel=page.getByRole('button',{name:'Cancel changes',exact:true});
  assert.equal(await save.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(107, 29, 47)');await save.hover();assert.equal(await save.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(82, 22, 36)');
  assert.equal(await cancel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(185, 28, 28)');await cancel.hover();assert.equal(await cancel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(153, 27, 27)');
 });
 for(const width of [320,1440])await check('shared shell avoids page overflow at '+width,async page=>{await mock(page);await page.goto(base+'/student/offerings');await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).waitFor({state:'attached'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));},width);
 await check('student links keep the document, Clerk provider and account snapshot alive',async page=>{
  const state=await mock(page);let documents=0;page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;});
  await page.goto(base+'/student/profile?scenario=sdk-boot');await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).waitFor({state:'attached'});
  const mounts=await page.evaluate(()=>document.documentElement.dataset.clerkMounts);
  await page.evaluate(()=>{document.documentElement.dataset.sameDocument='yes';new MutationObserver(()=>{if(document.body.innerText.includes('Loading sign-in'))document.documentElement.dataset.repeatedSignInLoading='yes';}).observe(document.body,{childList:true,subtree:true,characterData:true});});
  for(const name of ['Subject records','Semester offerings','Academic pathway','Academic profile']){await clickStudentLink(page,name);await page.waitForFunction(expected=>document.querySelector('nav[aria-label="Student navigation"] a[aria-current="page"]')?.textContent?.trim()===expected,name);}
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.sameDocument),'yes');assert.equal(await page.evaluate(()=>document.documentElement.dataset.clerkMounts),mounts);assert.equal(await page.evaluate(()=>document.documentElement.dataset.repeatedSignInLoading),undefined);assert.equal(documents,1);assert.equal(state.accountReads,1);
 });
 await check('browser back and forward update the student page without restarting Clerk',async page=>{
  await mock(page);await page.goto(base+'/student/profile');await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).waitFor({state:'attached'});
  await clickStudentLink(page,'Subject records');await page.waitForURL('**/student/records');await clickStudentLink(page,'Semester offerings');await page.waitForURL('**/student/offerings');
  await page.goBack();await page.waitForURL('**/student/records');await page.goBack();await page.waitForURL('**/student/profile');await page.goForward();await page.waitForURL('**/student/records');assert.equal(await page.getByRole('link',{name:'Subject records',exact:true,includeHidden:true}).getAttribute('aria-current'),'page');
 });
 if(installed){
  await check('profile navigation warns and preserves the draft when discard is cancelled',async page=>{
   await mock(page);await page.goto(base+'/student/profile');await page.getByLabel('Student name',{exact:true}).fill('DEMO unsaved');
   const prompt=page.waitForEvent('dialog');const click=clickStudentLink(page,'Subject records');await(await prompt).dismiss();await click;
   assert.equal(new URL(page.url()).pathname,'/student/profile');assert.equal(await page.getByLabel('Student name',{exact:true}).inputValue(),'DEMO unsaved');
   const discard=page.waitForEvent('dialog');const proceed=clickStudentLink(page,'Subject records');await(await discard).accept();await proceed;await page.waitForURL('**/student/records');
  });
  await check('record draft can cancel browser back without losing the page or history',async page=>{
   await mock(page);await page.goto(base+'/student/profile');await clickStudentLink(page,'Subject records');await page.getByLabel('Taken for DEMO101 DEMO Subject',{exact:true}).check();
   const prompt=page.waitForEvent('dialog');const back=page.evaluate(()=>history.back());await(await prompt).dismiss();await back;await page.waitForURL('**/student/records');assert.equal(await page.getByLabel('Taken for DEMO101 DEMO Subject',{exact:true}).isChecked(),true);
   await page.getByRole('button',{name:'Cancel changes',exact:true}).click();await page.goBack();await page.waitForURL('**/student/profile');
  });
  await check('offering draft also protects shared navigation',async page=>{
   await mock(page);await page.goto(base+'/student/offerings');await page.getByRole('checkbox').first().check();
   const prompt=page.waitForEvent('dialog');const click=clickStudentLink(page,'Academic profile');await(await prompt).dismiss();await click;assert.equal(new URL(page.url()).pathname,'/student/offerings');assert.equal(await page.getByRole('checkbox').first().isChecked(),true);
  });
  await check('saving setup reaches records in the same initialized document',async page=>{
   const state=await mock(page,{setup:true});await page.goto(base+'/student/setup');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();const mounts=await page.evaluate(()=>document.documentElement.dataset.clerkMounts);
   await page.getByLabel('Student name',{exact:true}).fill('DEMO new student');await page.getByLabel('Matric number',{exact:true}).fill('A22EC0001');await page.getByLabel('Programme',{exact:true}).selectOption('1');await page.getByLabel('Learning centre',{exact:true}).selectOption('1');await page.getByLabel('Weekly working hours',{exact:true}).fill('0');await page.getByLabel('Available study hours per week').fill('8');assert.equal(await page.getByLabel('Academic year').inputValue(),'1001/1002');
   await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.waitForURL('**/student');await page.getByRole('table',{name:'Subject records'}).waitFor();assert.equal(state.accountReads,1);assert.equal(await page.evaluate(()=>document.documentElement.dataset.clerkMounts),mounts);
  });
 }
 await check('theme header search, dark preference, account and responsive sidebar',async page=>{
  await mock(page);await page.goto(base+'/student/profile');await page.getByRole('button',{name:'Toggle sidebar',exact:true}).waitFor();
  const sidebar=page.locator('#student-sidebar');
  assert.equal(Math.round((await sidebar.boundingBox()).width),290);
  await page.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await page.waitForFunction(()=>Math.round(document.querySelector('#student-sidebar').getBoundingClientRect().width)===90);
  await sidebar.hover();await page.waitForFunction(()=>Math.round(document.querySelector('#student-sidebar').getBoundingClientRect().width)===290);
  await page.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await page.keyboard.press('Control+k');await page.getByRole('searchbox',{name:'Search pages'}).fill('offering');
  await page.locator('#student-search-results').getByRole('link',{name:'Semester offerings'}).click();await page.waitForURL('**/student/offerings');
  await page.screenshot({path:'.wrangler/theme-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await page.reload();await page.getByRole('button',{name:'Switch to light mode'}).waitFor();
  assert.equal(await page.locator('.student-shell').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(30, 21, 24)');
  await page.getByRole('button',{name:'Student account',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator('#student-account-menu').count(),0);
  await page.screenshot({path:'.wrangler/theme-dark.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).waitFor();
  assert.equal(await sidebar.getAttribute('inert'),'');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await sidebar.getByRole('link',{name:'Academic profile',exact:true}).waitFor();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Open navigation',exact:true}).waitFor();
  await page.getByRole('button',{name:'Toggle header controls'}).click();await page.getByRole('button',{name:'Switch to light mode'}).click();
  await page.getByRole('button',{name:'Toggle header controls'}).click();
  await page.screenshot({path:'.wrangler/theme-mobile.png',fullPage:true});
  for(const width of [320,390,768,1024,1279,1280,1440]){await page.setViewportSize({width,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);}
 },1440);
 await check('pathway route is explicit and performs read-only graph access',async page=>{
  const state=await mock(page);await page.goto(base+'/student/pathway');await page.getByRole('heading',{name:'Academic pathway',exact:true}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).getByRole('link',{name:'Academic pathway',exact:true,includeHidden:true}).getAttribute('aria-current'),'page');
  await page.getByRole('button',{name:'DEMO101 Foundations, 3 credits, Completed'}).waitFor();
  assert.ok(state.requests.some(request=>request.path==='/api/pathway/graph'&&request.method==='GET'));
  assert.ok(state.requests.every(request=>request.method==='GET'));
  await clickStudentLink(page,'Subject records');await page.waitForURL('**/student/records');
 });
 await check('page search opens the pathway page',async page=>{
  await mock(page);await page.goto(base+'/student/profile');await page.getByRole('searchbox',{name:'Search pages'}).waitFor();await page.keyboard.press('Control+k');await page.getByRole('searchbox',{name:'Search pages'}).fill('pathway');
  await page.locator('#student-search-results').getByRole('link',{name:'Academic pathway',exact:true}).click();await page.waitForURL('**/student/pathway');await page.getByRole('heading',{name:'Academic pathway',exact:true}).waitFor();
 },1440);
 for(const role of ['COORDINATOR','SYSTEM_ADMIN'])await check(role+' cannot open student pathway',async page=>{
  await mock(page,{role});await page.goto(base+'/student/pathway');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Academic pathway',exact:true}).count(),0);
 });
 await check('signed-out pathway navigation requires sign-in',async page=>{
  const state=await mock(page);await page.goto(base+'/student/pathway?scenario=signed-out');await page.waitForURL('**/sign-in');assert.equal(state.requests?.length??0,0);assert.equal(await page.getByRole('heading',{name:'Academic pathway',exact:true}).count(),0);
 });
 if(installed)await check('academic navigation reuses cached options and records, the profile page always rereads the profile (admin programme change); save invalidates',async page=>{
  await mock(page);const reads={};page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='GET'&&['/api/profile','/api/profile/options','/api/academic-records'].includes(path))reads[path]=(reads[path]??0)+1;});
  await page.goto(base+'/student/profile');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  await clickStudentLink(page,'Subject records');await page.getByLabel('Taken for DEMO101 DEMO Subject',{exact:true}).waitFor();
  await clickStudentLink(page,'Academic profile');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  await clickStudentLink(page,'Subject records');await page.getByLabel('Taken for DEMO101 DEMO Subject',{exact:true}).waitFor();
  assert.deepEqual(reads,{'/api/profile':2,'/api/profile/options':2,'/api/academic-records':1});
  await page.reload();await page.getByLabel('Taken for DEMO101 DEMO Subject',{exact:true}).waitFor();
  await clickStudentLink(page,'Academic profile');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  assert.deepEqual(reads,{'/api/profile':3,'/api/profile/options':3,'/api/academic-records':1});
  await clickStudentLink(page,'Academic profile');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByText('Profile saved.',{exact:true}).waitFor();
  await clickStudentLink(page,'Subject records');await page.getByLabel('Taken for DEMO101 DEMO Subject',{exact:true}).waitFor();
  assert.equal(reads['/api/academic-records'],2);assert.equal(reads['/api/profile/options'],4);
 },1440);
  await check('A stale baseline stops writes, keeps the draft and refreshes after confirmation',async page=>{
  const state=await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  state.plan={...planFixture,baselineVersion:'b'.repeat(64)};
  await page.getByRole('button',{name:'Move DEMB1013',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move DEMB1013'});await dialog.getByRole('radio',{name:'2027/2028 – Semester 2',exact:true}).check();await dialog.getByRole('button',{name:'Move here',exact:true}).click();
  await page.locator('.planning-stale').getByText('This plan view is out of date',{exact:false}).waitFor();
  await page.getByLabel('Notifications',{exact:true}).getByText('This plan view is out of date, so your latest change was not saved.',{exact:false}).waitFor();
  assert.equal(await page.locator('.planning-postpone-zone').count(),0);
  assert.equal(await page.locator('.planning-grip').count(),0);
  assert.equal(await page.getByRole('button',{name:'Try again',exact:true}).count(),0);
  assert.equal(state.scenarioWrites.length,1);
  await page.getByText('Your unsaved what-if changes are still shown',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Refresh plan',exact:true}).first().click();
  const confirm=page.getByRole('dialog',{name:'Refresh the plan?'});await confirm.waitFor();
  await confirm.getByRole('button',{name:'Cancel',exact:true}).click();await confirm.waitFor({state:'hidden'});
  await page.locator('.planning-stale').getByText('This plan view is out of date',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Refresh plan',exact:true}).first().click();
  await page.getByRole('dialog',{name:'Refresh the plan?'}).getByRole('button',{name:'Refresh plan',exact:true}).click();
  await page.locator('.planning-postpone-zone').waitFor();
  assert.equal(await page.locator('.planning-stale').getByText('This plan view is out of date',{exact:false}).count(),0);
  assert.equal(state.scenarioWrites.length,1);
 });
 await check('Comparison reports projected requirements and never fabricates completion',async page=>{
  await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await whatIfOption(page,'DEML1112','Postpone one semester');
  const compare=page.getByRole('region',{name:'Compare with your plan'});
  await compare.getByText('Requirement changes',{exact:false}).click();
  const reqTable=compare.getByRole('region',{name:'Requirement comparison'});
  await reqTable.getByRole('columnheader',{name:'Baseline plan',exact:true}).waitFor();
  await reqTable.locator('tbody').getByText('Projected',{exact:false}).first().waitFor();
  await assertReadable(page,'plan requirements');
  await page.unrouteAll({behavior:'ignoreErrors'});
  await mock(page,{plan:{...planFixture,totalCredits:null}});
  await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await whatIfOption(page,'DEML1112','Postpone one semester');
  const incomplete=page.getByRole('region',{name:'Compare with your plan'});
  await incomplete.getByText('Cannot compare reliably',{exact:true}).waitFor();
  assert.equal(await incomplete.locator('dd').getByText('Cannot confirm yet',{exact:true}).count(),2);
 });
 await check('Dependencies view reuses the same plan and flags moved subjects',async page=>{
  await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Dependencies',exact:true}).click();
  const deps=page.getByRole('region',{name:'Subject dependencies'});
  await deps.locator('.pathway-node').first().waitFor();
  await deps.getByRole('button',{name:'View dependencies as a table',exact:true}).click();
  await deps.getByRole('region',{name:'Subject dependencies'}).locator('tbody tr[data-subject="DEMA2013"]').getByText('DEMA1013',{exact:true}).waitFor();
  assert.equal(await deps.locator('.pathway-node.is-changed').count(),0);
  await page.getByRole('button',{name:'Semester plan',exact:true}).click();
  await page.getByRole('button',{name:'Move DEMB1013',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move DEMB1013'});await dialog.getByRole('radio',{name:'2027/2028 – Semester 2',exact:true}).check();await dialog.getByRole('button',{name:'Move here',exact:true}).click();
  await page.locator('.planning-save').getByText('Saved',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Dependencies',exact:true}).click();
  await page.locator('.pathway-node.is-changed').first().waitFor();
  assert.ok(await page.locator('.pathway-node.is-changed').count()>=1);
  await page.locator('.planning-save').getByText('Saved',{exact:true}).waitFor();
  await assertReadable(page,'plan dependencies');await shotTop(page,'plan-deps-1440');
 },1440);
 await check('Dependencies view stays usable at 375 and 320',async page=>{
  await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Dependencies',exact:true}).click();
  await page.locator('.pathway-node').first().waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shotTop(page,'plan-deps-375');
  await page.setViewportSize({width:320,height:844});
  await page.locator('.pathway-node').first().waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shotTop(page,'plan-deps-320');
 },375);
 await check('A queued save is discarded when the page unmounts',async page=>{
  const state=await mock(page,{holdSave:true});await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Move DEMB1013',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move DEMB1013'});await dialog.getByRole('radio',{name:'2027/2028 – Semester 2',exact:true}).check();await dialog.getByRole('button',{name:'Move here',exact:true}).click();
  await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Move DEMA1013',exact:true}).click();
  const dialog2=page.getByRole('dialog',{name:'Move DEMA1013'});await dialog2.getByRole('radio',{name:'2027/2028 – Semester 1',exact:true}).check();await dialog2.getByRole('button',{name:'Move here',exact:true}).click();
  await clickStudentLink(page,'Graduation check');await page.waitForURL('**/student/graduation');
  if(state.releaseSave)state.releaseSave();state.holdSave=false;await page.waitForTimeout(300);
  assert.equal(state.scenarioWrites.length,1);
 });
 await check('Move dialog names the current semester and unconfigured panels say they are not set up',async page=>{
  await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Move DEMB1013',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move DEMB1013'});
  await dialog.getByText('now in',{exact:false}).waitFor();
  await dialog.getByRole('strong').getByText('2026/2027 – Semester 2',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.unrouteAll({behavior:'ignoreErrors'});
  const shortLimits=planFixture.limits.slice(0,4);
  await mock(page,{plan:{...planFixture,limits:shortLimits}});
  await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByText('Not set up for moving subjects',{exact:true}).first().waitFor();
 });
 await check('Plan controls keep touch targets at 768 and stay usable at 200% zoom',async page=>{
  await page.setViewportSize({width:768,height:1000});
  await mock(page);await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  const heights=await page.locator('.planning-move').evaluateAll(list=>list.map(el=>el.getBoundingClientRect().height));
  assert.ok(heights.length>0&&heights.every(h=>h>=44));
  await shot(page,'plan-768');
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  const move=page.locator('.planning-move').first();await move.scrollIntoViewIfNeeded();
  assert.ok((await move.boundingBox()).height>=44);
  await move.focus();assert.ok(await move.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=(window.innerHeight+2)&&r.left>=0&&r.right<=(window.innerWidth+2);}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await shotTop(page,'plan-zoom200');
 },768);
 await check('Planning controls and dialogs stay readable in dark mode',async page=>{
  await page.setViewportSize({width:1440,height:900});
  await mock(page);await page.goto(base+'/student/profile');await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();
  await page.goto(base+'/student/plan');await page.getByRole('group',{name:'Plan view'}).waitFor();
  await page.getByRole('button',{name:'Dependencies',exact:true}).click();await page.locator('.pathway-node').first().waitFor();
  const contrast=await page.locator('.planning-toggle').evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:getComputedStyle(el.querySelector('button')).color};});
  assert.notEqual(contrast.bg,'rgb(243, 244, 246)');
  await page.getByRole('button',{name:'Semester plan',exact:true}).click();
  await whatIfOption(page,'DEML1112','Postpone one semester');
  await page.getByRole('region',{name:'Your changes',exact:true}).getByRole('button',{name:'Reset to my plan',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Reset to your plan?'});await dialog.waitFor();
  const dialogBg=await dialog.evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(dialogBg,'rgba(0, 0, 0, 0)');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await shotTop(page,'plan-dark-1440');
 },1440);
console.log(JSON.stringify({passed,installedOwnerPages:installed,clerkAndApi:'MOCKED'}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
