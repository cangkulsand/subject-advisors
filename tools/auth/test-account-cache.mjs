// Actual AuthGate/client, mocked Clerk and API. No real accounts or database writes.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const output=await build({entryPoints:['apps/web/src/features/auth/testing/cache-harness.tsx'],bundle:true,write:false,outdir:'.wrangler/account-cache-tests',jsx:'automatic',alias:{'@clerk/react':resolve('apps/web/src/features/auth/testing/clerk-mock.tsx')},define:{'process.env.NODE_ENV':'"development"'}});
const script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=output.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
const server=createServer((req,res)=>{if(req.url==='/test.js'){res.setHeader('Content-Type','text/javascript');res.end(script);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>'+css+'</style></head><body><div id="root"></div><script type="module" src="/test.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let browser,passed=0;
async function fixture(page){const state={reads:0,initializations:0,writes:0,denied:false,setup:false,user:'user_test'};await page.route(/\/api\//,async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path==='/api/profile'){state.writes++;state.setup=false;if(state.denied){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'ACCESS_SUSPENDED',message:'Access denied'}})});return;}await route.fulfill({contentType:'application/json',body:JSON.stringify({data:{saved:true}})});return;}
 if(path==='/api/me/initialize')state.initializations++;else state.reads++;
 await route.fulfill({status:state.denied?403:200,contentType:'application/json',body:JSON.stringify(state.denied?{error:{code:'ACCESS_SUSPENDED',message:'Access denied'}}:{data:{clerkUserId:state.user,appRole:'STUDENT',accessStatus:'ACTIVE',profileState:state.setup?'SETUP_REQUIRED':'COMPLETE',landingPath:state.setup?'/student/setup':'/student'}})});
 });return state;}
async function check(name,body){const page=await browser.newPage();try{await body(page);passed++;console.log('PASS '+name);}finally{await page.close();}}
async function ready(page){await page.getByRole('heading',{name:'Private academic page',exact:true}).waitFor();}
try{
 browser=await chromium.launch({headless:true});
 await check('one account check across full page navigation and reload',async page=>{const state=await fixture(page);await page.goto(base+'/student/profile');await ready(page);for(const name of ['Records','Offerings','Profile']){await page.getByRole('link',{name,exact:true}).click();await ready(page);}await page.reload();await ready(page);assert.equal(state.reads,1);});
 await check('login initializes once and the destination reuses its result',async page=>{const state=await fixture(page);await page.goto(base+'/auth/complete');await page.waitForURL(base+'/student');await ready(page);assert.equal(state.initializations,1);assert.equal(state.reads,0);});
 await check('focus does not recheck access or discard a draft',async page=>{const state=await fixture(page);await page.goto(base+'/student/profile');await ready(page);await page.getByLabel('Draft').fill('Unsaved draft');await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));});assert.equal(await page.getByLabel('Draft').inputValue(),'Unsaved draft');assert.equal(state.reads,1);});
 await check('profile update is sent to the server and setup cache updates without polling',async page=>{const state=await fixture(page);state.setup=true;await page.goto(base+'/student/setup');await ready(page);await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByText('Profile saved',{exact:true}).waitFor();await page.getByRole('link',{name:'Records',exact:true}).click();await ready(page);assert.equal(state.writes,1);assert.equal(state.reads,1);});
 await check('a server permission denial clears navigation access immediately',async page=>{const state=await fixture(page);await page.goto(base+'/student/profile');await ready(page);state.denied=true;await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Private academic page',exact:true}).count(),0);assert.equal(state.writes,1);assert.equal(state.reads,2);});
 await check('logout clears this tab account snapshot',async page=>{await fixture(page);await page.goto(base+'/student/profile');await ready(page);await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.signedOut==='true');const count=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('subject-advisors.account.')).length);assert.equal(count,0);});
 await check('a different Clerk user/session cannot reuse the first user snapshot',async page=>{const state=await fixture(page);await page.goto(base+'/student/profile');await ready(page);state.user='user_second';await page.goto(base+'/student/records?test-user=user_second&test-session=sess_second');await ready(page);assert.equal(state.reads,2);const keys=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('subject-advisors.account.')));assert.ok(keys.every(k=>!k.includes('user_test')));});
 console.log(JSON.stringify({passed,cache:'current Clerk session only',browserAndApi:'EXPLICIT_TEST_MOCKS'}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
