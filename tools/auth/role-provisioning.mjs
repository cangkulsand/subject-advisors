export class ProvisionError extends Error {}
const knownRoles = ['STUDENT','COORDINATOR','SYSTEM_ADMIN'];
export function verifyGrantIdentity(user, request) {
  if (!/^user_[A-Za-z0-9]+$/.test(request.userId || '') || user.id !== request.userId || user.banned || user.locked) throw new ProvisionError('The exact approved Clerk identity must be active.');
  const primary = user.emailAddresses?.find(email => email.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified' || primary.emailAddress.toLowerCase() !== request.expectedEmail?.toLowerCase()) throw new ProvisionError('The expected email must match this Clerk ID’s verified primary email.');
  if (!Array.isArray(request.roles) || !request.roles.length || new Set(request.roles).size !== request.roles.length || request.roles.some(role => !knownRoles.includes(role))) throw new ProvisionError('Specify unique known roles explicitly.');
  if (!request.actor?.trim() || !request.reason?.trim()) throw new ProvisionError('A trusted operator actor and reason are required.');
  const student = /^[^@\s]+@graduate\.utm\.my$/i.test(primary.emailAddress);
  const coordinator = /^[^@\s]+@utm\.my$/i.test(primary.emailAddress);
  if (request.owner && (!student || knownRoles.some(role => !request.roles.includes(role)))) throw new ProvisionError('Protected owner bootstrap requires the verified graduate identity and all three explicit roles.');
  if (request.roles.includes('STUDENT') && !student) throw new ProvisionError('Student grants require the exact graduate.utm.my domain.');
  if (request.roles.includes('COORDINATOR') && !coordinator && !(request.owner && student)) throw new ProvisionError('Coordinator grants require utm.my or the explicit protected owner bootstrap.');
  return { ...request, coordinatorPolicy: request.owner ? 'OWNER_STUDENT_COORDINATOR' : 'ROLE_DOMAIN' };
}
export async function inspectGrant(client, request) {
  const accountLock = request.requireExistingStudent ? ' FOR UPDATE' : '';
  const { rows: accounts } = await client.query(`SELECT access_assignment_id,access_status FROM user_access_assignment WHERE clerk_user_id=$1${accountLock}`, [request.userId]);
  const account = accounts[0];
  if (request.requireExistingStudent && !account) throw new ProvisionError('The existing active student account is required; provisioning will not create an account.');
  if (account && account.access_status !== 'ACTIVE') throw new ProvisionError('Suspended accounts must not be reactivated by role provisioning.');
  const { rows: owners } = await client.query('SELECT a.clerk_user_id FROM user_role_assignment r JOIN user_access_assignment a USING(access_assignment_id) WHERE r.protected_owner');
  if (request.owner && owners.some(owner => owner.clerk_user_id !== request.userId)) throw new ProvisionError('Another protected owner already exists; owner rotation is not supported.');
  const membershipLock = request.requireExistingStudent || request.requireExistingSystemAdmin ? ' FOR UPDATE' : '';
  const memberships = account ? (await client.query(`SELECT app_role,email_policy,protected_owner FROM user_role_assignment WHERE access_assignment_id=$1 ORDER BY app_role${membershipLock}`, [account.access_assignment_id])).rows : [];
  if (request.requireExistingStudent && !memberships.some(member => member.app_role === 'STUDENT')) throw new ProvisionError('The existing STUDENT membership is required; provisioning will not remove or replace it.');
  if (request.requireExistingSystemAdmin && !memberships.some(member => member.app_role === 'SYSTEM_ADMIN')) throw new ProvisionError('The existing SYSTEM_ADMIN membership is required; owner bootstrap will not recreate it.');
  return { account, memberships, proposedRoles: request.roles, protectOwner: Boolean(request.owner), coordinatorPolicy: request.coordinatorPolicy };
}
/** Caller must already verify the Clerk identity. A dry-run only reads. */
export async function provisionRoles(client, request, apply = false) {
  const plan = await inspectGrant(client, request);
  if (!apply) return { mode:'DRY_RUN', ...plan };
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(260002,1)');
    await inspectGrant(client, request);
    await client.query("SELECT set_config('app.access_actor',$1,true),set_config('app.access_reason',$2,true)", [request.actor, request.reason]);
    if (request.owner) await client.query("SELECT set_config('app.protected_owner_bootstrap','VERIFIED_CLERK_ID',true)");
    const inserted = await client.query("INSERT INTO user_access_assignment(clerk_user_id,app_role,access_status) VALUES ($1,'STUDENT','ACTIVE') ON CONFLICT(clerk_user_id) DO NOTHING RETURNING access_assignment_id", [request.userId]);
    const { rows:[account] } = await client.query('SELECT access_assignment_id,access_status FROM user_access_assignment WHERE clerk_user_id=$1 FOR UPDATE', [request.userId]);
    if (!account || account.access_status !== 'ACTIVE') throw new ProvisionError('The target account is not active.');
    for (const role of ['SYSTEM_ADMIN','STUDENT','COORDINATOR'].filter(role => request.roles.includes(role))) {
      const policy = role === 'COORDINATOR' ? request.coordinatorPolicy : 'ROLE_DOMAIN';
      await client.query(`INSERT INTO user_role_assignment(access_assignment_id,app_role,email_policy,grant_source,protected_owner,granted_by_clerk_user_id,grant_reason)
        SELECT $1::integer,$2::varchar,$3::varchar,'OPERATOR',$4::boolean,$5::varchar,$6::text WHERE NOT EXISTS
          (SELECT 1 FROM user_role_assignment WHERE access_assignment_id=$1 AND app_role=$2::varchar)`,
      [account.access_assignment_id,role,policy,Boolean(request.owner && role === 'SYSTEM_ADMIN'),request.actor,request.reason]);
      if (request.owner && role === 'SYSTEM_ADMIN') await client.query("UPDATE user_role_assignment SET protected_owner=true WHERE access_assignment_id=$1 AND app_role='SYSTEM_ADMIN' AND NOT protected_owner", [account.access_assignment_id]);
      if (request.owner && role === 'COORDINATOR') await client.query("UPDATE user_role_assignment SET email_policy='OWNER_STUDENT_COORDINATOR' WHERE access_assignment_id=$1 AND app_role='COORDINATOR' AND email_policy<>'OWNER_STUDENT_COORDINATOR'", [account.access_assignment_id]);
    }
    // A newly provisioned staff account must not keep the compatibility seed role.
    if (inserted.rows.length && !request.roles.includes('STUDENT')) await client.query("DELETE FROM user_role_assignment WHERE access_assignment_id=$1 AND app_role='STUDENT'", [account.access_assignment_id]);
    const result = await inspectGrant(client, request);
    if (request.roles.some(role => !result.memberships.some(member => member.app_role === role)) ||
        request.owner && !result.memberships.some(member => member.app_role === 'SYSTEM_ADMIN' && member.protected_owner)) throw new ProvisionError('Grant verification failed; transaction rolled back.');
    await client.query('COMMIT');
    return { mode:'APPLIED', ...result };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
