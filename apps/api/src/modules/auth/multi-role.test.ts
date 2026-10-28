import { describe, expect, it, vi } from 'vitest';
import { authorize } from '../../middleware/auth';
import { createAccessRepository } from './repository';
import type { AccessAssignment, AuthDependencies, VerifiedIdentity } from './contracts';

function fixture(roles: AccessAssignment['roles'] = ['STUDENT','COORDINATOR','SYSTEM_ADMIN']) {
  const identity: VerifiedIdentity = { clerkUserId:'user_owner_fixture',sessionId:'session_fixture',primaryEmail:{address:'owner@graduate.utm.my',verified:true} };
  const assignment: AccessAssignment = { clerkUserId:identity.clerkUserId,appRole:roles[0]!,roles,accessStatus:'ACTIVE',coordinatorStudentException:true,protectedOwner:true };
  const deps: AuthDependencies = { verify:vi.fn(async()=>identity),access:{find:vi.fn(async()=>assignment),initializeStudent:vi.fn()},profiles:{stateFor:vi.fn(async()=> 'COMPLETE' as const)} };
  return {identity,assignment,deps,request:new Request('https://app.test/api/private')};
}
describe('explicit multi-role authorization',()=>{
  it.each(['STUDENT','COORDINATOR','SYSTEM_ADMIN'] as const)('permits the protected graduate owner in the granted %s role',async role=>{
    const f=fixture();expect(await authorize(f.request,f.deps,{roles:[role],requireProfile:role==='STUDENT'})).toMatchObject({appRole:role,availableRoles:['STUDENT','COORDINATOR','SYSTEM_ADMIN']});
  });
  it('does not turn a student domain or a requested role into a privilege grant',async()=>{
    const f=fixture(['STUDENT']);f.assignment.protectedOwner=false;f.assignment.coordinatorStudentException=false;
    for(const role of ['COORDINATOR','SYSTEM_ADMIN'] as const)await expect(authorize(f.request,f.deps,{roles:[role]})).rejects.toMatchObject({code:'ROLE_DENIED'});
  });
  it('requires an exact verified coordinator domain or the protected owner exception',async()=>{
    const f=fixture(['COORDINATOR']);f.assignment.protectedOwner=false;f.assignment.coordinatorStudentException=false;
    await expect(authorize(f.request,f.deps,{roles:['COORDINATOR']})).rejects.toMatchObject({code:'EMAIL_DOMAIN_DENIED'});
    f.identity.primaryEmail!.address='approved@utm.my';expect((await authorize(f.request,f.deps)).availableRoles).toEqual(['COORDINATOR']);
    f.identity.primaryEmail!.address='approved@utm.my.attacker.test';await expect(authorize(f.request,f.deps)).rejects.toMatchObject({code:'EMAIL_DOMAIN_DENIED'});
    f.identity.primaryEmail!.address='approved@utm.my';f.identity.primaryEmail!.verified=false;await expect(authorize(f.request,f.deps)).rejects.toMatchObject({code:'EMAIL_UNVERIFIED'});
  });
  it('does not let an exception flag on another account bypass the coordinator domain',async()=>{
    const f=fixture();f.assignment.protectedOwner=false;
    await expect(authorize(f.request,f.deps,{roles:['COORDINATOR']})).rejects.toMatchObject({code:'EMAIL_DOMAIN_DENIED'});
  });
  it('keeps staff views usable when the student profile is unavailable',async()=>{
    const f=fixture();f.deps.profiles!.stateFor=vi.fn(async()=> 'UNAVAILABLE' as const);
    expect(await authorize(f.request,f.deps,{roles:['SYSTEM_ADMIN']})).toMatchObject({profileState:'NOT_APPLICABLE',studentProfileState:'UNAVAILABLE'});
    await expect(authorize(f.request,f.deps,{roles:['STUDENT'],requireProfile:true})).rejects.toMatchObject({code:'PROFILE_UNAVAILABLE'});
  });
  it('checks student eligibility only for student access',async()=>{
    const f=fixture();f.identity.primaryEmail!.address='owner@personal.test';
    expect((await authorize(f.request,f.deps,{roles:['SYSTEM_ADMIN']})).appRole).toBe('SYSTEM_ADMIN');
    await expect(authorize(f.request,f.deps,{roles:['STUDENT']})).rejects.toMatchObject({code:'EMAIL_DOMAIN_DENIED'});
  });
  it('honors current grants, global suspension and revocation on every API call',async()=>{
    const f=fixture();await authorize(f.request,f.deps,{roles:['SYSTEM_ADMIN']});
    f.assignment.roles=['STUDENT'];await expect(authorize(f.request,f.deps,{roles:['SYSTEM_ADMIN']})).rejects.toMatchObject({code:'ROLE_DENIED'});
    f.assignment.accessStatus='SUSPENDED';await expect(authorize(f.request,f.deps,{roles:['STUDENT']})).rejects.toMatchObject({code:'ACCOUNT_SUSPENDED'});
    expect(f.deps.access.find).toHaveBeenCalledTimes(3);
  });
  it('fails closed with no memberships even if the legacy role says administrator',async()=>{
    const f=fixture(['SYSTEM_ADMIN']);f.assignment.roles=[];
    await expect(authorize(f.request,f.deps)).rejects.toMatchObject({code:'ACCESS_NOT_ASSIGNED'});
    await expect(createAccessRepository(async()=>[{clerk_user_id:'user_a',app_role:'SYSTEM_ADMIN',access_status:'ACTIVE'}]).find('user_a')).rejects.toThrow('Invalid role memberships');
  });
});
