// Local contract fixture; the real account client is tested against this HTTP stand-in.
const http = require('node:http');
const allowed = ['owner','student','denied','malformed'];
let fallback = 'owner';
async function mode() { return typeof pm === 'undefined' ? fallback : (await pm.state.get('account-access.mode')) || 'owner'; }
async function setMode(value) { if (typeof pm === 'undefined') fallback=value; else await pm.state.set('account-access.mode',value); }
function json(res, status, body) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body)); }
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://fixture.local').pathname;
  if(req.method==='POST' && path==='/_test/state') {
    let body=req.body;
    if(!body) { let text='';for await(const chunk of req)text+=chunk;try{body=JSON.parse(text);}catch{body={};} }
    if(!allowed.includes(body.mode))return json(res,400,{error:{code:'INVALID_FIXTURE',message:'Choose a known test state.'}});
    await setMode(body.mode);return json(res,200,{mode:await mode()});
  }
  if((req.method==='GET'&&path==='/api/me')||(req.method==='POST'&&path==='/api/me/initialize')) {
    const selected=await mode();
    if(selected==='denied')return json(res,403,{error:{code:'ACCOUNT_SUSPENDED',message:'This synthetic account is suspended.'}});
    const roles=selected==='owner'?['STUDENT','COORDINATOR','SYSTEM_ADMIN']:['STUDENT'];
    return json(res,200,{data:{clerkUserId:'user_fixture',appRole:'STUDENT',roles:selected==='malformed'?['SYSTEM_ADMIN']:roles,availableRoles:roles,accessStatus:'ACTIVE',studentProfileState:'COMPLETE',profileState:'COMPLETE',landingPath:'/student'}});
  }
  json(res,501,{error:{code:'UNMODELED_FIXTURE_ROUTE',message:'This contract fixture does not model that operation.'}});
}).listen(process.env.PORT||4500);
