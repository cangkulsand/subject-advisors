import { authorize, authJson, authErrorResponse, AuthError } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { fields, jsonBody, positiveId, P001Error } from '../profile/validation';
import type { Sprint2Repository } from './contracts';
import { calculateProgress } from './progress';
import { databaseError } from './repository';
import { linkInput, revision, subjectInput, validateDependency, validatePrerequisites } from './validation';
export interface Sprint2Dependencies { auth: AuthDependencies; repository: Sprint2Repository }
const prefix = '/api/p001-sprint2';
export async function handleSprint2Request(request: Request, deps: Sprint2Dependencies): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== prefix && !path.startsWith(prefix+'/')) return null;
  try {
    const progress = path === prefix+'/progress';
    const me = await authorize(request,deps.auth,{ roles: progress?['STUDENT']:['SYSTEM_ADMIN'],requireProfile:progress });
    if (progress && request.method==='GET') {
      const source = await deps.repository.progress(me.clerkUserId);
      if (!source) throw new P001Error(403,'PROFILE_SETUP_REQUIRED','Complete your academic profile first.');
      return authJson({data:calculateProgress(source)});
    }
    if (path===prefix+'/curricula' && request.method==='GET') return authJson({data:await deps.repository.catalogue()});
    const match = new RegExp('^'+prefix+'/curricula/(\\d+)(?:/(subjects|dependencies)(?:/(\\d+))?)?$').exec(path);
    if (!match) return authJson({error:{code:'ROUTE_NOT_FOUND',message:'This Sprint 2 route is unavailable.'}},404);
    const id=positiveId(Number(match[1]),'Curriculum'), item=match[3]?positiveId(Number(match[3]),'Item'):null;
    if (!match[2] && request.method==='GET') {
      const snapshot=await deps.repository.curriculum(id);
      if (!snapshot) throw new P001Error(404,'CURRICULUM_NOT_FOUND','The curriculum is unavailable.');
      return authJson({data:snapshot});
    }
    if (match[2]==='subjects' && request.method===(item===null?'POST':'PUT')) {
      const input=subjectInput(await jsonBody(request),item!==null);
      const snapshot=await deps.repository.curriculum(id);
      if (!snapshot) throw new P001Error(404,'CURRICULUM_NOT_FOUND','The curriculum is unavailable.');
      if (item!==null && !snapshot.data.subjects.some(s=>s.mappingId===item)) throw new P001Error(404,'SUBJECT_NOT_FOUND','The mapped subject is unavailable.');
      if (item===null && input.prerequisites) validatePrerequisites(snapshot.data,input.prerequisites);
      return authJson({data:await deps.repository.subject(id,item,input)},item===null?201:200);
    }
    if (match[2]==='dependencies' && request.method===(item===null?'POST':'PUT')) {
      const input=linkInput(await jsonBody(request)), snapshot=await deps.repository.curriculum(id);
      if (!snapshot) throw new P001Error(404,'CURRICULUM_NOT_FOUND','The curriculum is unavailable.');
      validateDependency(snapshot.data,input,item);
      return authJson({data:await deps.repository.dependency(id,item,input)},item===null?201:200);
    }
    if (match[2]==='dependencies' && item!==null && request.method==='DELETE') {
      const input=fields(await jsonBody(request),['revision']), rev=revision(input.revision);
      const snapshot=await deps.repository.curriculum(id);
      if (!snapshot?.data.links.some(l=>l.id===item)) throw new P001Error(404,'LINK_NOT_FOUND','The relationship is unavailable.');
      return authJson({data:await deps.repository.removeDependency(id,item,rev)});
    }
    return authJson({error:{code:'METHOD_NOT_ALLOWED',message:'This method is not supported.'}},405);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    try { databaseError(error); } catch (safe) {
      const e=safe as P001Error; return authJson({error:{code:e.code,message:e.message}},e.status);
    }
  }
}
