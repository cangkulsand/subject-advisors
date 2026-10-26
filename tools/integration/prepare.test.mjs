import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { prepareIntegration } from './prepare.mjs';
async function fixture(features=[]){
  const root=await mkdtemp(join(tmpdir(),'subject-advisors-integration-'));
  const entries={p001Api:['apps/api/src/modules/profile/index.ts'],p001Web:['apps/web/src/features/profile/ProfilePage.tsx','apps/web/src/features/profile/client.ts','apps/web/src/features/records/RecordsPage.tsx'],p002Api:['apps/api/src/modules/offerings/index.ts'],p002Web:['apps/web/src/features/offerings/index.ts']};
  for(const key of features)for(const file of entries[key]){await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),'// TEST FIXTURE ONLY\n');}
  return root;
}
test('no pasted modules generates compiling empty registries, ignoring private p002 package',async()=>{
  const root=await fixture();await mkdir(join(root,'p002/api/offerings'),{recursive:true});await writeFile(join(root,'p002/api/offerings/index.ts'),'// must not auto-import');
  const result=await prepareIntegration(root,true);assert.ok(Object.values(result).every(value=>value===false));
  const api=await readFile(join(root,'.generated-integration/api.ts'),'utf8');assert.ok(!api.includes('createOfferingHandler'));assert.ok(api.includes('createAuthDependencies(env)'));
});
for(const features of [['p001Api','p001Web'],['p002Api','p002Web'],['p001Api','p001Web','p002Api','p002Web']])test('discovers only pasted canonical modules: '+features.join(','),async()=>{
  const root=await fixture(features);const result=await prepareIntegration(root,true);for(const name of Object.keys(result))assert.equal(result[name],features.includes(name));
  const api=await readFile(join(root,'.generated-integration/api.ts'),'utf8'),web=await readFile(join(root,'.generated-integration/web.tsx'),'utf8');
  assert.equal(api.includes('handleP001Request(request, p001)'),features.includes('p001Api'));assert.equal(api.includes('createOfferingHandler(env,'),features.includes('p002Api'));
  assert.equal(web.includes('createAcademicClient(getToken)'),features.includes('p001Web'));assert.equal(web.includes('createOfferingClient(getToken)'),features.includes('p002Web'));
  if(features.includes('p002Api'))assert.ok(api.includes("stateFor: async () => 'UNAVAILABLE'"));
});
test('missing P001 records entry is an explicit incomplete-overlay error',async()=>{
  const root=await fixture(['p001Api']);await mkdir(join(root,'apps/web/src/features/profile'),{recursive:true});await writeFile(join(root,'apps/web/src/features/profile/ProfilePage.tsx'),'// incomplete');
  await assert.rejects(prepareIntegration(root,true),/Incomplete P001 web overlay/);
});
test('preparing twice produces identical generated sources without touching pasted source',async()=>{
  const root=await fixture(['p001Api','p002Api']);await prepareIntegration(root,true);const before=await readFile(join(root,'.generated-integration/api.ts'),'utf8');await prepareIntegration(root,true);
  assert.equal(await readFile(join(root,'.generated-integration/api.ts'),'utf8'),before);assert.equal(await readFile(join(root,'apps/api/src/modules/profile/index.ts'),'utf8'),'// TEST FIXTURE ONLY\n');
});
