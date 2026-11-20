#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClerkClient } from '@clerk/backend';
import { Client } from 'pg';
import { inspectGrant, provisionRoles, verifyGrantIdentity } from './role-provisioning.mjs';
import { credentialLines, generatePassword, inspectClerkTarget, parseMode, readLocalConfig, safeError, validateClerkIdentity } from './seed-development-students.mjs';

const TARGET = Object.freeze({ projectId: 'still-waterfall-91972583', branchId: 'br-shy-cherry-azuzy9v5', database: 'neondb' });
const PURPOSE = 'subject-advisors-development-dummy-coordinator';
const BATCH = '20261102-2';
const ACTOR = '__DEV_DUMMY_COORDINATOR_SEED__';
const REASON = 'User-requested development dummy coordinator provisioning.';
const EXPECTED = Object.freeze([
  { email: 'ecrh+clerk_test@utm.my', firstName: 'Dummy', lastName: 'Coordinator ECRH', label: 'ECRH' },
  { email: 'ecjh+clerk_test@utm.my', firstName: 'Dummy', lastName: 'Coordinator ECJH', label: 'ECJH' },
]);

function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function coordinatorCandidates() {
  return EXPECTED.map(item => ({ ...item, fullName: `${item.firstName} ${item.lastName}` }));
}

export function validateCoordinatorUser(user, candidate, authSettings, requireOwned = true) {
  const identity = validateClerkIdentity(user, candidate, authSettings, false);
  if (requireOwned && (user.privateMetadata?.purpose !== PURPOSE || user.privateMetadata?.batch !== BATCH)) fail('CLERK_IDENTITY_NOT_OWNED_BY_THIS_BATCH');
  return identity;
}

export function grantRequest(identity) {
  return verifyGrantIdentity(identity.user, {
    userId: identity.clerkUserId,
    expectedEmail: identity.email,
    roles: ['COORDINATOR'],
    owner: false,
    actor: ACTOR,
    reason: REASON,
  });
}

export function assertCoordinatorState(state) {
  if (state.account && (state.account.access_status !== 'ACTIVE' || state.memberships.length !== 1 ||
      state.memberships[0].app_role !== 'COORDINATOR' || state.memberships[0].email_policy !== 'ROLE_DOMAIN' || state.memberships[0].protected_owner)) {
    fail('EXISTING_COORDINATOR_ROLE_CONFLICT');
  }
  return true;
}

export async function listCandidates(clerk) {
  const candidates = coordinatorCandidates();
  const { data } = await clerk.users.getUserList({ emailAddress: candidates.map(item => item.email), limit: 10 });
  return candidates.map(candidate => {
    const matches = data.filter(user => user.emailAddresses?.some(address => address.emailAddress.toLowerCase() === candidate.email.toLowerCase()));
    if (matches.length > 1) fail('MULTIPLE_CLERK_EMAIL_MATCHES');
    return { candidate, user: matches[0] ?? null };
  });
}

async function inspectExisting(db, user, candidate) {
  if (!user) return null;
  const identity = validateCoordinatorUser(user, candidate, { firstNameEnabled: false, lastNameEnabled: false });
  const request = grantRequest(identity);
  const state = await inspectGrant(db, request);
  assertCoordinatorState(state);
  const { rows } = await db.query('SELECT 1 FROM public.student_profile WHERE clerk_user_id=$1', [identity.clerkUserId]);
  if (rows.length) fail('COORDINATOR_HAS_STUDENT_PROFILE');
  return { identity, request };
}

async function createOrReuse(clerk, item, authSettings, credentials) {
  const { candidate, user } = item;
  if (user) return validateCoordinatorUser(user, candidate, authSettings);
  const password = generatePassword(authSettings.passwordSettings, candidate.label === 'ECRH' ? 1 : 2);
  const handoff = { email: candidate.email, password, status: 'uncertain' };
  credentials.push(handoff);
  const payload = {
    emailAddress: [candidate.email], password,
    privateMetadata: { purpose: PURPOSE, batch: BATCH },
    ...(authSettings.firstNameEnabled ? { firstName: candidate.firstName } : {}),
    ...(authSettings.lastNameEnabled ? { lastName: candidate.lastName } : {}),
  };
  try {
    const created = await clerk.users.createUser(payload);
    const identity = validateCoordinatorUser(created, candidate, authSettings);
    await clerk.users.verifyPassword({ userId: identity.clerkUserId, password });
    handoff.status = 'created';
    return identity;
  } catch (error) {
    handoff.status = 'uncertain';
    throw error;
  }
}

async function verifyDatabaseTarget(db) {
  const { rows: [row] } = await db.query("SELECT current_database() AS database, current_setting('neon.project_id',true) AS project_id, current_setting('neon.branch_id',true) AS branch_id");
  if (row?.database !== TARGET.database || row?.project_id !== TARGET.projectId || row?.branch_id !== TARGET.branchId) fail('CONNECTED_NEON_TARGET_MISMATCH');
}

function help() {
  console.log('Usage: node tools/auth/seed-development-coordinators.mjs [--dry-run|--apply]');
  console.log('No arguments performs a read-only preflight. --apply provisions exactly two development coordinator identities and audited roles.');
}

async function main(args = process.argv.slice(2)) {
  let db;
  const credentials = [];
  let result;
  let failure;
  try {
    const mode = parseMode(args);
    if (mode.help) { help(); return; }
    const config = await readLocalConfig();
    db = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 10000, statement_timeout: 20000 });
    await db.connect();
    await verifyDatabaseTarget(db);
    const clerk = createClerkClient({ secretKey: config.secretKey });
    const authSettings = await inspectClerkTarget(clerk, config.frontendApi);
    const matched = await listCandidates(clerk);
    const existing = [];
    for (const item of matched) existing.push(await inspectExisting(db, item.user, item.candidate));
    if (!mode.apply) {
      console.log(JSON.stringify({ mode: 'DRY_RUN', target: { ...TARGET, clerk: 'development' }, candidates: 2, ownedClerkUsers: existing.filter(Boolean).length, missingClerkUsers: existing.filter(item => !item).length, coordinatorStates: 'preflight passed; no writes' }));
      return;
    }
    const identities = [];
    for (let index = 0; index < matched.length; index++) identities.push(await createOrReuse(clerk, matched[index], authSettings, credentials));
    for (const identity of identities) {
      const request = grantRequest(identity);
      const state = await inspectGrant(db, request);
      assertCoordinatorState(state);
      await provisionRoles(db, request, true);
      const finalState = await inspectGrant(db, request);
      if (!finalState.account || finalState.account.access_status !== 'ACTIVE' || finalState.memberships.length !== 1 || finalState.memberships[0].app_role !== 'COORDINATOR' || finalState.memberships[0].protected_owner) fail('COORDINATOR_ROLE_VERIFICATION_FAILED');
      const { rows } = await db.query('SELECT 1 FROM public.student_profile WHERE clerk_user_id=$1', [identity.clerkUserId]);
      if (rows.length) fail('COORDINATOR_HAS_STUDENT_PROFILE');
    }
    result = { mode: 'APPLIED', target: { ...TARGET, clerk: 'development' }, users: identities.length, role: 'COORDINATOR', profiles: 0, academicRecords: 0, semesterOfferings: 0 };
  } catch (error) {
    failure = safeError(error);
  } finally {
    if (db) await db.end().catch(() => {});
    if (credentials.length) {
      console.log('\nTemporary coordinator credentials (terminal handoff only; not saved to a file):');
      for (const line of credentialLines(credentials)) console.log(line);
    }
  }
  if (failure) {
    console.error(`Seed stopped safely: ${JSON.stringify(failure)}`);
    process.exitCode = 1;
  } else if (result) console.log(JSON.stringify(result));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
