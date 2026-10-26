// Actual shared app, mocked Clerk/API. --installed also exercises pasted owner pages.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { prepareIntegration } from './prepare.mjs';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const features=await prepareIntegration();const installed=process.argv.includes('--installed');
if(installed&&!Object.values(features).every(Boolean))throw new Error('--installed requires both real owner overlays');
const output=await build({entryPoints:['tools/auth/local/main.tsx'],bundle:true,write:false,outdir:'.wrangler/integration-ui',jsx:'automatic',alias:{'@clerk/react':resolve('apps/web/src/features/auth/testing/clerk-mock.tsx')},define:{'process.env.NODE_ENV':'"development"','import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':'"TEST_ONLY_PUBLIC_KEY"'}});
const script=output.outputFiles.find(file=>file.path.endsWith('.js')).text,css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(script);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser,passed=0;
const profile={studentId:1,studentName:'DEMO NOT OFFICIAL',matricNo:null,curriculumId:1,weeklyWorkingHours:0,availableStudyHours:8,programmeCode:'DEMO',programmeName:'DEMO',curriculumVersion:'DEMO',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
async function mock(page,state={}){
 await page.route(/\/api\//,async route=>{
  const path=new URL(route.request().url()).pathname;
  (state.requests??=[]).push({path,method:route.request().method()});
  if(path==='/api/me')state.accountReads=(state.accountReads??0)+1;
  if(path==='/api/profile'&&route.request().method==='PUT')state.setup=false;
  const data=path==='/api/me'?{clerkUserId:'user_test',appRole:state.role??'STUDENT',accessStatus:'ACTIVE',profileState:state.setup?'SETUP_REQUIRED':'COMPLETE',landingPath:state.setup?'/student/setup':'/student'}
   :path==='/api/profile'?profile:path==='/api/profile/options'?{curricula:[{curriculumId:1,curriculumVersion:'DEMO',programmeId:1,programmeCode:'DEMO',programmeName:'DEMO'}],subjects:[{subjectId:1,subjectCode:'DEMO101',subjectName:'DEMO Subject',creditHours:3}],semesters:[{semesterId:1,academicYear:'1001/1002',semesterNo:1}]}
   :path==='/api/academic-records'?[]:path==='/api/semester-offerings'?{curriculum:{curriculumId:'1',name:'DEMO',programmeName:'DEMO'},subjects:[{curriculumSubjectId:'1',code:'DEMO101',name:'DEMO Subject',creditHours:3}],semesters:[{semesterId:'1',academicYear:'1001/1002',semesterNo:1}],selection:null}:{};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
 });
 return state;
}
async function clickStudentLink(page,name){
 const nav=page.getByRole('navigation',{name:'Student navigation',includeHidden:true});await nav.waitFor({state:'attached'});
 if(page.viewportSize().width<1280){const toggle=page.locator('button[aria-controls="student-sidebar"]');await toggle.waitFor();if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}
 await nav.getByRole('link',{name,exact:true}).click();
}
async function check(name,body,width=390){const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));try{await body(page);assert.deepEqual(errors,[]);passed++;console.log('PASS '+name);}finally{await page.close();}}
try{
 browser=await chromium.launch({headless:true});
 for(const path of ['/student/profile','/student/records','/student/offerings','/student/pathway'])await check('shared route and navigation '+path,async page=>{
  await mock(page);await page.goto(base+path);const nav=page.getByRole('navigation',{name:'Student navigation',includeHidden:true});await nav.waitFor({state:'attached'});
  for(const [name,href]of [['Academic profile','/student/profile'],['Subject records','/student/records'],['Semester offerings','/student/offerings'],['Academic pathway','/student/pathway']])assert.equal(await nav.getByRole('link',{name,exact:true,includeHidden:true}).getAttribute('href'),href);
  assert.equal(await page.getByRole('heading',{name:'Page not found',exact:true}).count(),0);
  if(installed)assert.equal(await page.getByText('This page is not available yet. Please try again when the service is enabled.',{exact:true}).count(),0);
 });
 await check('profile-to-offerings navigation uses shared route',async page=>{await mock(page);await page.goto(base+'/student/profile');await clickStudentLink(page,'Semester offerings');await page.waitForURL('**/student/offerings');await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).waitFor({state:'attached'});});
 for(const path of ['/student/records','/student/offerings','/student/pathway'])await check('setup guard covers '+path,async page=>{await mock(page,{setup:true});await page.goto(base+path);await page.waitForURL('**/student/setup');await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).waitFor({state:'attached'});});
 await check('coordinator cannot open student offerings',async page=>{await mock(page,{role:'COORDINATOR'});await page.goto(base+'/student/offerings');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).count(),0);});
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
   await mock(page);await page.goto(base+'/student/profile');await clickStudentLink(page,'Subject records');await page.getByLabel('Subject',{exact:true}).selectOption('1');
   const prompt=page.waitForEvent('dialog');const back=page.evaluate(()=>history.back());await(await prompt).dismiss();await back;await page.waitForURL('**/student/records');assert.equal(await page.getByLabel('Subject',{exact:true}).inputValue(),'1');
   await page.getByRole('button',{name:'Cancel changes',exact:true}).click();await page.goBack();await page.waitForURL('**/student/profile');
  });
  await check('offering draft also protects shared navigation',async page=>{
   await mock(page);await page.goto(base+'/student/offerings');await page.getByRole('checkbox').first().check();
   const prompt=page.waitForEvent('dialog');const click=clickStudentLink(page,'Academic profile');await(await prompt).dismiss();await click;assert.equal(new URL(page.url()).pathname,'/student/offerings');assert.equal(await page.getByRole('checkbox').first().isChecked(),true);
  });
  await check('saving setup reaches records in the same initialized document',async page=>{
   const state=await mock(page,{setup:true});await page.goto(base+'/student/setup');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();const mounts=await page.evaluate(()=>document.documentElement.dataset.clerkMounts);
   await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.waitForURL('**/student');await page.getByRole('heading',{name:'Your subject history',exact:true}).waitFor();assert.equal(state.accountReads,1);assert.equal(await page.evaluate(()=>document.documentElement.dataset.clerkMounts),mounts);
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
 await check('pathway skeleton is explicit and makes no graph reads or writes',async page=>{
  const state=await mock(page);await page.goto(base+'/student/pathway');await page.getByRole('heading',{name:'Academic pathway',exact:true}).waitFor();
  assert.equal(await page.getByRole('status').innerText(),'Coming soon');
  assert.equal(await page.getByRole('navigation',{name:'Student navigation',includeHidden:true}).getByRole('link',{name:'Academic pathway',exact:true,includeHidden:true}).getAttribute('aria-current'),'page');
  assert.deepEqual(state.requests,[{path:'/api/me',method:'GET'}]);
  await page.getByRole('link',{name:'subject records',exact:true}).click();await page.waitForURL('**/student/records');
 });
 await check('page search opens the pathway skeleton',async page=>{
  await mock(page);await page.goto(base+'/student/profile');await page.getByRole('searchbox',{name:'Search pages'}).waitFor();await page.keyboard.press('Control+k');await page.getByRole('searchbox',{name:'Search pages'}).fill('pathway');
  await page.locator('#student-search-results').getByRole('link',{name:'Academic pathway',exact:true}).click();await page.waitForURL('**/student/pathway');await page.getByRole('heading',{name:'Academic pathway',exact:true}).waitFor();
 },1440);
 for(const role of ['COORDINATOR','SYSTEM_ADMIN'])await check(role+' cannot open student pathway',async page=>{
  await mock(page,{role});await page.goto(base+'/student/pathway');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Academic pathway',exact:true}).count(),0);
 });
 await check('signed-out pathway navigation requires sign-in',async page=>{
  const state=await mock(page);await page.goto(base+'/student/pathway?scenario=signed-out');await page.waitForURL('**/sign-in');assert.equal(state.requests?.length??0,0);assert.equal(await page.getByRole('heading',{name:'Academic pathway',exact:true}).count(),0);
 });
 if(installed)await check('academic navigation reuses cached profile, options and records; save invalidates',async page=>{
  await mock(page);const reads={};page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='GET'&&['/api/profile','/api/profile/options','/api/academic-records'].includes(path))reads[path]=(reads[path]??0)+1;});
  await page.goto(base+'/student/profile');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  await clickStudentLink(page,'Subject records');await page.getByLabel('Subject',{exact:true}).waitFor();
  await clickStudentLink(page,'Academic profile');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  await clickStudentLink(page,'Subject records');await page.getByLabel('Subject',{exact:true}).waitFor();
  assert.deepEqual(reads,{'/api/profile':1,'/api/profile/options':1,'/api/academic-records':1});
  await page.reload();await page.getByLabel('Subject',{exact:true}).waitFor();
  await clickStudentLink(page,'Academic profile');await page.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  assert.deepEqual(reads,{'/api/profile':1,'/api/profile/options':1,'/api/academic-records':1});
  await clickStudentLink(page,'Academic profile');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByText('Profile saved.',{exact:true}).waitFor();
  await clickStudentLink(page,'Subject records');await page.getByLabel('Subject',{exact:true}).waitFor();
  assert.equal(reads['/api/academic-records'],2);assert.equal(reads['/api/profile/options'],2);
 },1440);
 console.log(JSON.stringify({passed,installedOwnerPages:installed,clerkAndApi:'MOCKED'}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
