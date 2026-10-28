import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyGrantIdentity, provisionRoles } from './role-provisioning.mjs';
const user={id:'user_fixture',primaryEmailAddressId:'email_fixture',emailAddresses:[{id:'email_fixture',emailAddress:'owner@graduate.utm.my',verification:{status:'verified'}}]};
const input={userId:user.id,expectedEmail:'owner@graduate.utm.my',roles:['STUDENT','COORDINATOR','SYSTEM_ADMIN'],actor:'operator_fixture',reason:'Explicit owner bootstrap fixture.',owner:true};
test('owner bootstrap validates exact Clerk ID and verified primary email',()=>{
  assert.equal(verifyGrantIdentity(user,input).coordinatorPolicy,'OWNER_STUDENT_COORDINATOR');
  assert.throws(()=>verifyGrantIdentity(user,{...input,userId:'user_impostor'}));
  assert.throws(()=>verifyGrantIdentity(user,{...input,expectedEmail:'other@graduate.utm.my'}));
  assert.throws(()=>verifyGrantIdentity({...user,banned:true},input));
  assert.throws(()=>verifyGrantIdentity({...user,emailAddresses:[{...user.emailAddresses[0],verification:{status:'unverified'}}]},input));
});
test('domains alone cannot grant staff roles and owner requires all explicit roles',()=>{
  assert.throws(()=>verifyGrantIdentity(user,{...input,owner:false}));
  assert.throws(()=>verifyGrantIdentity(user,{...input,roles:['SYSTEM_ADMIN']}));
  assert.throws(()=>verifyGrantIdentity(user,{...input,roles:['OWNER']}));
  assert.throws(()=>verifyGrantIdentity(user,{...input,actor:''}));
  const staff={...user,emailAddresses:[{...user.emailAddresses[0],emailAddress:'approved@utm.my'}]};
  assert.equal(verifyGrantIdentity(staff,{...input,owner:false,roles:['COORDINATOR'],expectedEmail:'approved@utm.my'}).coordinatorPolicy,'ROLE_DOMAIN');
});
test('dry-run is read-only and never performs a rolled-back write as a preview',async()=>{
  const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:[]};}};
  const result=await provisionRoles(client,verifyGrantIdentity(user,input));
  assert.equal(result.mode,'DRY_RUN');assert.ok(queries.every(sql=>sql.startsWith('SELECT')));
});
test('provisioning refuses to reactivate suspended accounts',async()=>{
  const client={query:async()=>({rows:[{access_assignment_id:1,access_status:'SUSPENDED'}]})};
  await assert.rejects(provisionRoles(client,verifyGrantIdentity(user,input),true),/Suspended/);
});
