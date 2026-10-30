import { it, expect, vi } from 'vitest';
import { dispatchIntegratedRequest, type IntegratedServices } from './router';
import { AuthError } from '../modules/auth/errors';
function services(): IntegratedServices {
  return { auth: {
    verify: vi.fn(async () => ({ clerkUserId: 'test_student', sessionId: 'test', primaryEmail: { address: 'test@graduate.utm.my', verified: true } })),
    access: { find: vi.fn(async () => ({ clerkUserId: 'test_student', appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
    profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
  } };
}
it.each(['/api/profile','/api/profile/options','/api/academic-records','/api/academic-records/12'])('dispatches P001 route %s without swallowing P002',async path=>{
  const deps=services();deps.profile=vi.fn(async()=>Response.json({owner:'P001'}));deps.offerings=vi.fn();
  const response=await dispatchIntegratedRequest(new Request('https://example.test'+path),deps);
  expect(await response.json()).toEqual({owner:'P001'});expect(deps.offerings).not.toHaveBeenCalled();
});
it.each(['GET','PUT'])('dispatches P002 offerings %s with the original request/query/body',async method=>{
  const deps=services();deps.profile=vi.fn();deps.offerings=vi.fn(async req=>Response.json({method:req.method,path:new URL(req.url).pathname}));
  const request=new Request('https://example.test/api/semester-offerings?semesterId=1',{method,...(method==='PUT'?{body:'{"semesterId":"1","curriculumSubjectIds":[]}'}:{})});
  expect((await dispatchIntegratedRequest(request,deps)).status).toBe(200);expect(deps.offerings).toHaveBeenCalledWith(request);expect(deps.profile).not.toHaveBeenCalled();
});
it('shares the real profile reader with /api/me',async()=>{
  const deps=services();const response=await dispatchIntegratedRequest(new Request('https://example.test/api/me'),deps);
  expect(await response.json()).toMatchObject({data:{profileState:'COMPLETE',landingPath:'/student'}});expect(deps.auth.profiles?.stateFor).toHaveBeenCalledWith('test_student');
});
it('fails closed with a useful response when an authorized feature is absent',async()=>{
  const response=await dispatchIntegratedRequest(new Request('https://example.test/api/semester-offerings'),services());
  expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:{code:'FEATURE_NOT_INSTALLED'}});
});
it('does not bypass real auth when a feature is absent',async()=>{
  const deps=services();deps.auth.verify=vi.fn(async()=>{throw new AuthError(401,'SESSION_INVALID','Sign in.');});
  await expect(dispatchIntegratedRequest(new Request('https://example.test/api/profile'),deps)).rejects.toMatchObject({status:401});
});
it('denies staff and suspended access before absent-feature responses',async()=>{
  for(const assignment of [{appRole:'COORDINATOR' as const,accessStatus:'ACTIVE' as const},{appRole:'STUDENT' as const,accessStatus:'SUSPENDED' as const}]){
    const deps=services();deps.auth.access.find=vi.fn(async()=>({clerkUserId:'test_student',...assignment,roles:[assignment.appRole]}));
    await expect(dispatchIntegratedRequest(new Request('https://example.test/api/academic-records'),deps)).rejects.toMatchObject({status:403});
  }
});
it('returns unavailable when a registered adapter does not handle its declared route',async()=>{
  const deps=services();deps.offerings=vi.fn(async()=>null);expect((await dispatchIntegratedRequest(new Request('https://example.test/api/semester-offerings'),deps)).status).toBe(503);
});
it('dispatches P003 pathway graph with the original request',async()=>{
  const deps=services();deps.pathway=vi.fn(async req=>Response.json({owner:'P003',path:new URL(req.url).pathname}));
  const response=await dispatchIntegratedRequest(new Request('https://example.test/api/pathway/graph'),deps);
  expect(await response.json()).toEqual({owner:'P003',path:'/api/pathway/graph'});expect(deps.pathway).toHaveBeenCalled();
});
it('fails closed when the pathway feature is absent',async()=>{
  const response=await dispatchIntegratedRequest(new Request('https://example.test/api/pathway/graph'),services());
  expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:{code:'FEATURE_NOT_INSTALLED'}});
});
it('leaves unknown routes unimplemented and preserves auth body rejection',async()=>{
  const deps=services();expect((await dispatchIntegratedRequest(new Request('https://example.test/api/unknown'),deps)).status).toBe(404);
  const response=await dispatchIntegratedRequest(new Request('https://example.test/api/me/initialize',{method:'POST',body:'{}'}),deps);expect(response.status).toBe(400);
});
