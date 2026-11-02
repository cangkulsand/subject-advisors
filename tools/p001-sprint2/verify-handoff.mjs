// Read-only checks; this script never copies, overwrites or deletes project files.
import { readFile } from 'node:fs/promises';
import { resolve,isAbsolute,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(sourceRoot,'p001-sprint2-handoff-manifest.json'),'utf8'));
const flag=process.argv.indexOf('--project');
if(flag>=0&&!process.argv[flag+1])throw new Error('--project requires the existing project folder.');
const root=flag<0?process.cwd():resolve(process.argv[flag+1]);
const preflight=process.argv.includes('--preflight');let present=0,missing=0;
function target(path){const result=resolve(root,path);if(isAbsolute(path)||relative(root,result).startsWith('..'))throw new Error('Unsafe manifest path.');return result;}
for(const entry of manifest.files){
 try{const bytes=await readFile(target(entry.path));if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('File collision or integrity mismatch: '+entry.path);present++;}
 catch(error){if(error.code==='ENOENT'&&preflight){missing++;continue;}throw error;}
}
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
for(const dependency of ['@clerk/backend','@clerk/react','@neondatabase/serverless','react','react-dom'])if(!pkg.dependencies?.[dependency])throw new Error('Existing dependency missing: '+dependency);
for(const path of manifest.requiredBaseFiles)await readFile(target(path));
const changedBase=[];
for(const entry of manifest.baselineFiles){const bytes=await readFile(target(entry.path));if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)changedBase.push(entry.path);}
console.log(JSON.stringify({status:'PASS',mode:preflight?'PREFLIGHT':'INSTALLED_INTEGRITY',scope:['UC05','UC06'],present,missingToCopy:missing,changedBaseFilesRequiringReview:changedBase,note:'Changed base files are reported for compatibility review; nothing is overwritten.'},null,2));
