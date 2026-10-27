// Read-only integrity/collision check. Never copies, deletes, stages or commits files.
import { readFile } from 'node:fs/promises';
import { resolve,isAbsolute,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(sourceRoot,'p001-handoff-manifest.json'),'utf8'));
const flag=process.argv.indexOf('--project');const project=flag<0?process.cwd():resolve(process.argv[flag+1]);
const preflight=process.argv.includes('--preflight');
let missing=0,present=0;
for(const entry of manifest.files){
 const path=resolve(project,entry.path);
 if(isAbsolute(entry.path)||relative(project,path).startsWith('..'))throw new Error('Unsafe manifest path');
 try{const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('File collision/hash mismatch: '+entry.path);present++;}
 catch(error){if(error.code==='ENOENT'&&preflight){missing++;continue;}throw error;}
}
const pkg=JSON.parse(await readFile(resolve(project,'package.json'),'utf8'));
for(const name of ['@clerk/backend','@clerk/react','@neondatabase/serverless','react','react-dom'])if(!pkg.dependencies?.[name])throw new Error('Required existing dependency missing: '+name);
for(const path of ['apps/api/src/modules/auth/index.ts','apps/api/src/middleware/auth.ts','apps/web/src/features/auth/index.ts','tsconfig.auth.json','vitest.auth.config.ts'])await readFile(resolve(project,path));
const changedBase=[];
for(const entry of manifest.baselineFiles){try{const bytes=await readFile(resolve(project,entry.path));if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)changedBase.push(entry.path);}catch{changedBase.push(entry.path);}}
console.log(JSON.stringify({status:'PASS',mode:preflight?'PREFLIGHT':'INSTALLED_INTEGRITY',present,missingToCopy:missing,changedBaseFilesRequiringReview:changedBase,sourceRevision:manifest.sourceRevision},null,2));
