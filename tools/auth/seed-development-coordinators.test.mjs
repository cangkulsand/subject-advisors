import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinatorCandidates, grantRequest, assertCoordinatorState, validateCoordinatorUser } from './seed-development-coordinators.mjs';
import { parseMode, SeedError } from './seed-development-students.mjs';

const auth = { firstNameEnabled: true, lastNameEnabled: true };
function userFor(candidate) {
  return {
    id: `user_${candidate.label.toLowerCase()}123`,
    primaryEmailAddressId: `email_${candidate.label}`,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    passwordEnabled: true,
    banned: false,
    locked: false,
    privateMetadata: { purpose: 'subject-advisors-development-dummy-coordinator', batch: '20261102-2' },
    emailAddresses: [{ id: `email_${candidate.label}`, emailAddress: candidate.email, verification: { status: 'verified' } }],
  };
}

test('candidate list is exactly the requested two development emails and names', () => {
  assert.deepEqual(coordinatorCandidates().map(({ email, fullName }) => [email, fullName]), [
    ['ecrh+clerk_test@utm.my', 'Dummy Coordinator ECRH'],
    ['ecjh+clerk_test@utm.my', 'Dummy Coordinator ECJH'],
  ]);
});

test('only explicit --apply selects writes; default and dry-run remain read-only', () => {
  assert.deepEqual(parseMode([]), { help: false, apply: false });
  assert.deepEqual(parseMode(['--dry-run']), { help: false, apply: false });
  assert.deepEqual(parseMode(['--apply']), { help: false, apply: true });
  assert.throws(() => parseMode(['--apply', '--dry-run']), SeedError);
});

test('coordinator request grants only the exact verified identity with no owner privilege', () => {
  const candidate = coordinatorCandidates()[0];
  const identity = validateCoordinatorUser(userFor(candidate), candidate, auth);
  const request = grantRequest(identity);
  assert.equal(request.userId, identity.clerkUserId);
  assert.deepEqual(request.roles, ['COORDINATOR']);
  assert.equal(request.owner, false);
  assert.equal(request.coordinatorPolicy, 'ROLE_DOMAIN');
});

test('unrelated, unverified, wrong-domain and unusable identities are rejected', () => {
  const candidate = coordinatorCandidates()[0];
  assert.throws(() => validateCoordinatorUser({ ...userFor(candidate), privateMetadata: {} }, candidate, auth), /CLERK_IDENTITY_NOT_OWNED_BY_THIS_BATCH/);
  assert.throws(() => validateCoordinatorUser({ ...userFor(candidate), emailAddresses: [{ ...userFor(candidate).emailAddresses[0], verification: { status: 'unverified' } }] }, candidate, auth), /CLERK_PRIMARY_EMAIL_MISMATCH/);
  const wrongDomain = { ...candidate, email: 'ecrh+clerk_test@graduate.utm.my' };
  assert.throws(() => grantRequest(validateCoordinatorUser(userFor(wrongDomain), wrongDomain, auth)), /Coordinator grants require utm\.my/);
  assert.throws(() => validateCoordinatorUser({ ...userFor(candidate), passwordEnabled: false }, candidate, auth), /CLERK_IDENTITY_NOT_USABLE/);
});

test('existing account is reusable only when active with sole unprotected coordinator role', () => {
  assert.equal(assertCoordinatorState({ account: null, memberships: [] }), true);
  assert.equal(assertCoordinatorState({ account: { access_status: 'ACTIVE' }, memberships: [{ app_role: 'COORDINATOR', email_policy: 'ROLE_DOMAIN', protected_owner: false }] }), true);
  for (const state of [
    { account: { access_status: 'SUSPENDED' }, memberships: [{ app_role: 'COORDINATOR', email_policy: 'ROLE_DOMAIN', protected_owner: false }] },
    { account: { access_status: 'ACTIVE' }, memberships: [{ app_role: 'STUDENT', email_policy: 'ROLE_DOMAIN', protected_owner: false }] },
    { account: { access_status: 'ACTIVE' }, memberships: [{ app_role: 'COORDINATOR', email_policy: 'ROLE_DOMAIN', protected_owner: true }] },
    { account: { access_status: 'ACTIVE' }, memberships: [{ app_role: 'COORDINATOR', email_policy: 'ROLE_DOMAIN', protected_owner: false }, { app_role: 'SYSTEM_ADMIN', email_policy: 'ROLE_DOMAIN', protected_owner: false }] },
  ]) assert.throws(() => assertCoordinatorState(state), /EXISTING_COORDINATOR_ROLE_CONFLICT/);
});
