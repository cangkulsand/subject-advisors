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
  const data=path==='/api/me'?{clerkUserId:'user_test',appRole:state.role??'STUDENT',accessStatus:'ACTIVE',profileState:state.setup?'SETUP_REQUIRED':'COMPLETE',landingPath:state.setup?'/student/setup':'/student'}
   :path==='/api/profile'?profile:path==='/api/profile/options'?{curricula:[{curriculumId:1,curriculumVersion:'DEMO',programmeId:1,programmeCode:'DEMO',programmeName:'DEMO'}],subjects:[],semesters:[]}
   :path==='/api/academic-records'?[]:path==='/api/semester-offerings'?{curriculum:{curriculumId:'1',name:'DEMO',programmeName:'DEMO'},subjects:[],semesters:[],selection:null}:{};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
 });
}
async function clickStudentLink(page,name){const nav=page.getByRole('navigation',{name:'Student navigation',includeHidden:true});await nav.waitFor({state:'attached'});if(page.viewportSize().width<1280){const toggle=page.locator('button[aria-controls="student-sidebar"]');await toggle.waitFor();if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}await nav.getByRole('link',{name,exact:true}).click();}
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
 await check('pathway is an explicit UI placeholder',async page=>{await mock(page);await page.goto(base+'/student/pathway');await page.getByRole('heading',{name:'Academic pathway',exact:true}).waitFor();assert.equal(await page.getByRole('status').innerText(),'Coming soon');});
 await check('staff cannot open the student pathway',async page=>{await mock(page,{role:'SYSTEM_ADMIN'});await page.goto(base+'/student/pathway');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Academic pathway',exact:true}).count(),0);});
 await check('shared template search, theme, sidebar and mobile layout',async page=>{
  await mock(page);await page.goto(base+'/student/profile');const toggle=page.getByRole('button',{name:'Toggle sidebar',exact:true});await toggle.waitFor();assert.equal(await page.locator('.student-shell').evaluate(el=>getComputedStyle(el).getPropertyValue('--color-brand').trim()),'#521f28');
  await toggle.click();await page.waitForFunction(()=>Math.round(document.querySelector('#student-sidebar').getBoundingClientRect().width)===90);await toggle.click();
  await page.keyboard.press('Control+k');await page.getByRole('searchbox',{name:'Search pages'}).fill('pathway');await page.locator('#student-search-results').getByRole('link',{name:'Academic pathway',exact:true}).click();await page.waitForURL('**/student/pathway');await page.getByRole('heading',{name:'Academic pathway',exact:true}).waitFor();
  await page.getByRole('button',{name:'Switch to dark mode'}).click();await page.reload();await page.getByRole('button',{name:'Switch to light mode'}).waitFor();assert.equal(await page.locator('.student-shell').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(30, 21, 24)');
  await page.setViewportSize({width:390,height:844});await clickStudentLink(page,'Academic profile');await page.waitForURL('**/student/profile');assert.equal(await page.locator('#student-sidebar').getAttribute('inert'),'');
  for(const width of [320,390,768,1024,1279,1280,1440]){await page.setViewportSize({width,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);}
 },1440);
 console.log(JSON.stringify({passed,installedOwnerPages:installed,clerkAndApi:'MOCKED'}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
