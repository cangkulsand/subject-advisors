import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const children=[];let stopping=false;
function stop(code=0){
  if(stopping)return;stopping=true;process.exitCode=code;
  for(const child of children){
    if(child.exitCode!==null||child.signalCode!==null)continue;
    if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    else child.kill('SIGTERM');
  }
}
for(const args of [
  ['node_modules/wrangler/bin/wrangler.js','dev','--config','wrangler.p001.jsonc','--local','--log-level','warn'],
  ['node_modules/vite/bin/vite.js','--config','vite.p001.config.ts'],
]){
  const child=spawn(process.execPath,args,{stdio:'inherit',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:'.wrangler/logs',WRANGLER_REGISTRY_PATH:'.wrangler/registry',BROWSER:'none'}});
  children.push(child);child.on('error',()=>stop(1));child.on('exit',code=>{if(!stopping)stop(code??1);});
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log('P001 preview: http://127.0.0.1:5173 — Ctrl+C stops both servers.');
