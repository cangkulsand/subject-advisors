import { access,mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function prepareIntegration(root=process.cwd(),quiet=false){
  const exists=async path=>{try{await access(resolve(root,path));return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
  async function entry(directory,file){
    if(!await exists(directory))return false;
    if(!await exists(file))throw new Error('Incomplete feature overlay; missing '+file);
    return true;
  }
  const features={
    p001Api:await entry('apps/api/src/modules/profile','apps/api/src/modules/profile/index.ts'),
    p001Web:await entry('apps/web/src/features/profile','apps/web/src/features/profile/ProfilePage.tsx'),
    p002Api:await entry('apps/api/src/modules/offerings','apps/api/src/modules/offerings/index.ts'),
    p002Web:await entry('apps/web/src/features/offerings','apps/web/src/features/offerings/index.ts'),
    adminApi:await entry('apps/api/src/modules/admin','apps/api/src/modules/admin/index.ts'),
  };
  if(features.p001Web)for(const file of ['apps/web/src/features/profile/client.ts','apps/web/src/features/records/RecordsPage.tsx'])if(!await exists(file))throw new Error('Incomplete P001 web overlay; missing '+file);
  const api=[
    "import { createAuthDependencies, type AuthBindings } from '../apps/api/src/modules/auth';",
    "import type { IntegratedServices } from '../apps/api/src/integration/router';",
    ...(features.p001Api?["import { createP001Dependencies, handleP001Request } from '../apps/api/src/modules/profile';"]:[]),
    ...(features.p002Api?["import { createOfferingHandler } from '../apps/api/src/modules/offerings';"]:[]),
    ...(features.adminApi?["import { createAdminHandler } from '../apps/api/src/modules/admin';"]:[]),
    'export function createIntegratedServices(env: AuthBindings): IntegratedServices {',
    ...(features.p001Api?['  const p001 = createP001Dependencies(env);','  const auth = p001.auth;']:['  const auth = createAuthDependencies(env);']),
    '  return { auth,',
    ...(features.adminApi?['    admin: createAdminHandler(env, auth),']:[]),
    ...(features.p001Api?['    profile: request => handleP001Request(request, p001),']:[]),
    ...(features.p002Api?["    offerings: createOfferingHandler(env, { profiles: auth.profiles ?? { stateFor: async () => 'UNAVAILABLE' as const } }),"]:[]),
    '  };','}',
  ].filter(line=>!(features.p001Api&&line==="import { createAuthDependencies, type AuthBindings } from '../apps/api/src/modules/auth';"));
  if(features.p001Api)api.unshift("import type { AuthBindings } from '../apps/api/src/modules/auth';");
  const web=[
    "import type { InstalledStudentPages } from '../apps/web/src/app/feature-contracts';",
    ...(features.p001Web||features.p002Web?["import { useMemo } from 'react';","import type { StudentPageProps } from '../apps/web/src/app/feature-contracts';"]:[]),
    ...(features.p001Web?[
      "import { ProfilePage } from '../apps/web/src/features/profile/ProfilePage';",
      "import { RecordsPage } from '../apps/web/src/features/records/RecordsPage';",
      "import { createAcademicClient } from '../apps/web/src/features/profile/client';",
      'function Profile({getToken,setup}: StudentPageProps) { const api=useMemo(()=>createAcademicClient(getToken),[getToken]); return <ProfilePage api={api} setup={setup} />; }',
      'function Records({getToken}: StudentPageProps) { const api=useMemo(()=>createAcademicClient(getToken),[getToken]); return <RecordsPage api={api} />; }',
    ]:[]),
    ...(features.p002Web?[
      "import { OfferingsPage, createOfferingClient } from '../apps/web/src/features/offerings';",
      'function Offerings({getToken}: StudentPageProps) { const client=useMemo(()=>createOfferingClient(getToken),[getToken]); return <OfferingsPage client={client} />; }',
    ]:[]),
    'export const installedPages: InstalledStudentPages = {',
    ...(features.p001Web?['  Profile, Records,']:[]),...(features.p002Web?['  Offerings,']:[]),'};',
  ];
  const directory=resolve(root,'.generated-integration');await mkdir(directory,{recursive:true});
  await writeFile(resolve(directory,'api.ts'),'// GENERATED; do not commit. Run npm run prepare:integration after pasting modules.\n'+api.join('\n')+'\n');
  await writeFile(resolve(directory,'web.tsx'),'// GENERATED; do not commit. No demo modules are loaded.\n'+web.join('\n')+'\n');
  await writeFile(resolve(directory,'status.json'),JSON.stringify(features,null,2)+'\n');
  if(!quiet)console.log('Prepared shared integration: '+JSON.stringify(features));
  return features;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareIntegration();
