import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyGrantIdentity, inspectGrant, provisionRoles } from './role-provisioning.mjs';
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
test('host operator guard requires an existing active account with STUDENT membership',async()=>{
  const request=verifyGrantIdentity(user,{...input,owner:false,roles:['SYSTEM_ADMIN'],requireExistingStudent:true});
  const missing={query:async()=>({rows:[]})};
  await assert.rejects(inspectGrant(missing,request),/existing active student account/);
  const noStudent={query:async(sql)=>sql.includes('SELECT access_assignment_id')
    ?{rows:[{access_assignment_id:1,access_status:'ACTIVE'}]}
    :{rows:[]}};
  await assert.rejects(inspectGrant(noStudent,request),/existing STUDENT membership/);
});
test('host operator guard is rechecked under transaction lock before any insert',async()=>{
  const request=verifyGrantIdentity(user,{...input,owner:false,roles:['SYSTEM_ADMIN'],requireExistingStudent:true});
  let accountReads=0;const queries=[];
  const client={query:async(sql)=>{
    queries.push(sql);
    if(sql.includes('SELECT access_assignment_id'))return{rows:++accountReads===1?[{access_assignment_id:1,access_status:'ACTIVE'}]:[]};
    if(sql.includes('SELECT a.clerk_user_id'))return{rows:[]};
    if(sql.includes('SELECT app_role'))return{rows:[{app_role:'STUDENT',email_policy:'ROLE_DOMAIN',protected_owner:false}]};
    return{rows:[]};
  }};
  await assert.rejects(provisionRoles(client,request,true),/existing active student account/);
  assert.ok(queries.includes('SELECT pg_advisory_xact_lock(260002,1)'));
  assert.ok(queries.includes('ROLLBACK'));
  assert.ok(!queries.some(sql=>sql.startsWith('INSERT INTO user_access_assignment')));
  assert.ok(!queries.some(sql=>sql.startsWith('INSERT INTO user_role_assignment')));
});
test('owner bootstrap requires the pre-existing SYSTEM_ADMIN membership and rechecks it under lock',async()=>{
  const request=verifyGrantIdentity(user,{...input,requireExistingStudent:true,requireExistingSystemAdmin:true});
  const missing={query:async(sql)=>sql.includes('SELECT access_assignment_id')
    ?{rows:[{access_assignment_id:1,access_status:'ACTIVE'}]}
    :sql.includes('SELECT app_role')?{rows:[{app_role:'STUDENT',email_policy:'ROLE_DOMAIN',protected_owner:false}]}:{rows:[]}};
  await assert.rejects(inspectGrant(missing,request),/existing SYSTEM_ADMIN membership/);

  let membershipReads=0;const queries=[];
  const race={query:async(sql)=>{
    queries.push(sql);
    if(sql.includes('SELECT access_assignment_id'))return{rows:[{access_assignment_id:1,access_status:'ACTIVE'}]};
    if(sql.includes('SELECT a.clerk_user_id'))return{rows:[]};
    if(sql.includes('SELECT app_role'))return{rows:++membershipReads===1
      ?[{app_role:'STUDENT',email_policy:'ROLE_DOMAIN',protected_owner:false},{app_role:'SYSTEM_ADMIN',email_policy:'ROLE_DOMAIN',protected_owner:false}]
      :[{app_role:'STUDENT',email_policy:'ROLE_DOMAIN',protected_owner:false}]};
    return{rows:[]};
  }};
  await assert.rejects(provisionRoles(race,request,true),/existing SYSTEM_ADMIN membership/);
  assert.ok(queries.includes('SELECT pg_advisory_xact_lock(260002,1)'));
  assert.ok(queries.includes('ROLLBACK'));
  assert.ok(!queries.some(sql=>sql.startsWith('INSERT INTO user_access_assignment')));
  assert.ok(!queries.some(sql=>sql.startsWith('INSERT INTO user_role_assignment')));
});
