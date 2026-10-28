// Trusted operator CLI only. It is never bundled into the Worker or browser.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createClerkClient } from '@clerk/backend';
import { Client } from 'pg';
import { validateTarget, verifyConnectedTarget, loadMigrations, migrationStatus } from '../db/migrations.mjs';
import { ProvisionError, verifyGrantIdentity, provisionRoles } from './role-provisioning.mjs';

let client;
try {
  const { values } = parseArgs({ options:{
    'user-id':{type:'string'},'expected-email':{type:'string'},roles:{type:'string'},actor:{type:'string'},reason:{type:'string'},
    target:{type:'string'},owner:{type:'boolean',default:false},apply:{type:'boolean',default:false},
  } });
  if (!values.target || !process.env.CLERK_SECRET_KEY) throw new ProvisionError('Provide an approved --target and CLERK_SECRET_KEY through the environment. Dry-run is the default.');
  const target = JSON.parse(await readFile(values.target,'utf8'));
  const connectionString = validateTarget(target);
  const clerk = createClerkClient({ secretKey:process.env.CLERK_SECRET_KEY });
  const user = await clerk.users.getUser(values['user-id'] || '');
  const request = verifyGrantIdentity(user, {userId:values['user-id'],expectedEmail:values['expected-email'],roles:(values.roles || '').split(','),actor:values.actor,reason:values.reason,owner:values.owner});
  client = new Client({ connectionString }); await client.connect();
  await verifyConnectedTarget(client,target);
  const status = await migrationStatus(client,await loadMigrations());
  if (status.pending.length) throw new ProvisionError('Apply the reviewed canonical migrations before provisioning roles.');
  const result = await provisionRoles(client,request,values.apply);
  console.log(JSON.stringify({mode:result.mode,clerkUserId:request.userId,currentRoles:result.memberships,proposedRoles:result.proposedRoles,protectOwner:result.protectOwner},null,2));
} catch (error) {
  console.error(error instanceof ProvisionError ? error.message : 'Role provisioning failed. Provider/database details and credentials were not logged.');
  process.exitCode=1;
} finally { await client?.end(); }
