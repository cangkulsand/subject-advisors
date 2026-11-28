import { authorize, authJson, authErrorResponse, AuthError } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { jsonBody, positiveId, P001Error } from '../profile/validation';
import type { CurriculumSnapshot, Sprint2Repository } from './contracts';
import { calculateProgress } from './progress';
import { databaseError } from './repository';
import { linkInput, removalInput, subjectInput, validateDependency, validatePrerequisites } from './validation';
/** Programmes a coordinator's live assignments cover (faculty rows expanded, S3-P004-040). */
export interface CoordinatorScopes { programmeIds(clerkUserId: string): Promise<number[]> }
export interface Sprint2Dependencies { auth: AuthDependencies; repository: Sprint2Repository; scopes: CoordinatorScopes }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const prefix = '/api/p001-sprint2';
export async function handleSprint2Request(request: Request, deps: Sprint2Dependencies): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== prefix && !path.startsWith(prefix+'/')) return null;
  try {
    const progress = path === prefix+'/progress';
    // S3-P004-041: coordinators edit curricula of programmes in their scope; holding the admin role means no scope limit.
    const me = await authorize(request,deps.auth,{ roles: progress?['STUDENT']:['SYSTEM_ADMIN','COORDINATOR'],requireProfile:progress });
    // The admin bypass follows the roles the account's email may use (availableRoles), not stored memberships (review fix).
    const isAdmin = !progress && (me.availableRoles ?? []).includes('SYSTEM_ADMIN');
    const scope = progress || isAdmin ? null : await deps.scopes.programmeIds(me.clerkUserId);
    // Every snapshot sent to a coordinator says which shared subjects are locked, so the page keeps the lock after a save (review fix).
    const locked = <T extends CurriculumSnapshot>(snapshot: T): T => !scope ? snapshot
      : { ...snapshot, data: { ...snapshot.data, subjects: snapshot.data.subjects.map(s => ({ ...s, lockedBy: (s.sharedWith ?? []).filter(o => !scope.includes(o.programmeId)).map(o => o.programmeCode) })) } };
    const inScope = async (curriculumId: number) => {
      if (!scope) return;
      const programmeId = await deps.repository.curriculumProgrammeId(curriculumId);
      if (programmeId === null || !scope.includes(programmeId)) throw new P001Error(403,'CURRICULUM_OUT_OF_SCOPE','This curriculum is outside your coordinator assignment.');
    };
    if (progress && request.method==='GET') {
      const source = await deps.repository.progress(me.clerkUserId);
      if (!source) throw new P001Error(403,'PROFILE_SETUP_REQUIRED','Complete your academic profile first.');
      return authJson({data:calculateProgress(source)});
    }
    if (path===prefix+'/curricula' && request.method==='GET') return authJson({data:await deps.repository.catalogue(scope ?? undefined)});
    const match = new RegExp('^'+prefix+'/curricula/(\\d+)(?:/(subjects|dependencies)(?:/(\\d+))?)?$').exec(path);
    if (!match) return authJson({error:{code:'ROUTE_NOT_FOUND',message:'This Sprint 2 route is unavailable.'}},404);
    const id=positiveId(Number(match[1]),'Curriculum'), item=match[3]?positiveId(Number(match[3]),'Item'):null;
    await inScope(id);
    if (!match[2] && request.method==='GET') {
      const snapshot=await deps.repository.curriculum(id);
      if (!snapshot) throw new P001Error(404,'CURRICULUM_NOT_FOUND','The curriculum is unavailable.');
      return authJson({data:locked(snapshot)});
    }
    if (match[2]==='subjects' && request.method===(item===null?'POST':'PUT')) {
      const input=subjectInput(await jsonBody(request),item!==null);
      const snapshot=await deps.repository.curriculum(id);
      if (!snapshot) throw new P001Error(404,'CURRICULUM_NOT_FOUND','The curriculum is unavailable.');
      const saved = item===null ? undefined : snapshot.data.subjects.find(s=>s.mappingId===item);
      if (item!==null && !saved) throw new P001Error(404,'SUBJECT_NOT_FOUND','The mapped subject is unavailable.');
      // Option 1 (owner, 2026-11-28): code, name and credits are shared; a coordinator changes them only when every programme using the subject is in scope.
      if (scope && saved && (input.code!==saved.code || input.name!==saved.name || input.credits!==saved.credits)) {
        const outside = (saved.sharedWith ?? []).filter(other=>!scope.includes(other.programmeId)).map(other=>other.programmeCode);
        if (outside.length) throw new P001Error(403,'SUBJECT_SHARED_OUTSIDE_SCOPE',`This subject is also used by ${outside.join(', ')}. Ask its coordinator or the admin to change its code, name or credits.`);
      }
      if (item===null && input.prerequisites) validatePrerequisites(snapshot.data,input.prerequisites);
      return authJson({data:locked(await deps.repository.subject(id,item,input,me.clerkUserId))},item===null?201:200);
    }
    if (match[2]==='dependencies' && request.method===(item===null?'POST':'PUT')) {
      const input=linkInput(await jsonBody(request)), snapshot=await deps.repository.curriculum(id);
      if (!snapshot) throw new P001Error(404,'CURRICULUM_NOT_FOUND','The curriculum is unavailable.');
      validateDependency(snapshot.data,input,item);
      return authJson({data:locked(await deps.repository.dependency(id,item,input,me.clerkUserId))},item===null?201:200);
    }
    if (match[2]==='dependencies' && item!==null && request.method==='DELETE') {
      const input=removalInput(await jsonBody(request));
      const snapshot=await deps.repository.curriculum(id);
      if (!snapshot?.data.links.some(l=>l.id===item)) throw new P001Error(404,'LINK_NOT_FOUND','The relationship is unavailable.');
      return authJson({data:locked(await deps.repository.removeDependency(id,item,input.revision,input.reason,me.clerkUserId))});
    }
    if (match[2]==='subjects' && item!==null && request.method==='DELETE') {
      // Subject removal (S3-P004-041): a true delete from this curriculum, refused while picks or plans keep the mapping.
      const input=removalInput(await jsonBody(request));
      const snapshot=await deps.repository.curriculum(id);
      if (!snapshot?.data.subjects.some(s=>s.mappingId===item)) throw new P001Error(404,'SUBJECT_NOT_FOUND','The mapped subject is unavailable.');
      const use=await deps.repository.subjectUse(item);
      if (use.picks>0 || use.plans>0) {
        const parts=[use.picks>0?`Picked by ${plural(use.picks,'student','students')}${use.semesters.length?' in '+use.semesters.join(', '):''}`:'',
          use.plans>0?`${use.picks>0?'in':'In'} ${plural(use.plans,'graduation plan','graduation plans')}`:''].filter(Boolean);
        return Response.json({error:{code:'SUBJECT_IN_USE',message:`${parts.join(' and ')}. It can't be removed yet.`,details:{picks:use.picks,plans:use.plans}}},{status:409,headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
      }
      return authJson({data:locked(await deps.repository.removeSubject(id,item,input.revision,input.reason,me.clerkUserId))});
    }
    return authJson({error:{code:'METHOD_NOT_ALLOWED',message:'This method is not supported.'}},405);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    try { databaseError(error); } catch (safe) {
      const e=safe as P001Error; return authJson({error:{code:e.code,message:e.message}},e.status);
    }
  }
}
