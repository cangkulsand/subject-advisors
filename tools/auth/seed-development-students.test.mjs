import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SeedError, applyIfRequested, assertNeonTarget, candidateFor, candidates, credentialLines, createMissingUsers,
  generatePassword, inspectInitialDatabase, parseMode, planDatabaseRows, safeError,
  validateClerkIdentity, validateFrontendEnvironment, validateKeyPair,
} from './seed-development-students.mjs';

const validEnvironment = () => ({
  auth_config: { test_mode: true },
  display_config: { instance_environment_type: 'development' },
  user_settings: {
    attributes: {
      email_address: { enabled: true, used_for_first_factor: true, required: true },
      password: { enabled: true, used_for_first_factor: false, required: true },
      first_name: { enabled: true, required: true },
      last_name: { enabled: true, required: true },
      phone_number: { enabled: false, required: false },
    },
    sign_up: { mode: 'public', allowlist_only: false, legal_consent_enabled: false },
    password_settings: { min_length: 8, max_length: 72, require_lowercase: true, require_uppercase: true, require_numbers: true, require_special_char: true, allowed_special_characters: '!' },
  },
});

const identityFor = candidate => ({
  ...candidate,
  clerkUserId: 'user_fixture123',
  user: { id: 'user_fixture123' },
});

test('no argument and --dry-run are read-only; apply callback is never called', async () => {
  assert.deepEqual(parseMode([]), { help: false, apply: false });
  assert.deepEqual(parseMode(['--dry-run']), { help: false, apply: false });
  let writes = 0;
  assert.equal(await applyIfRequested(parseMode([]), async () => { writes++; }), null);
  assert.equal(writes, 0);
  assert.equal(await applyIfRequested(parseMode(['--apply']), async () => { writes++; return 'applied'; }), 'applied');
  assert.equal(writes, 1);
  assert.throws(() => parseMode(['--apply', '--dry-run']), SeedError);
});

test('target and development key guards reject production and wrong Neon branches', () => {
  assert.throws(() => validateKeyPair({ secretKey: 'sk_live_redacted', publishableKey: 'pk_test_x', vitePublishableKey: 'pk_test_x' }), /CLERK_DEVELOPMENT_SECRET_REQUIRED/);
  assert.throws(() => validateKeyPair({ secretKey: 'sk_test_x', publishableKey: 'pk_live_x', vitePublishableKey: 'pk_live_x' }), /CLERK_DEVELOPMENT_PUBLISHABLE_REQUIRED/);
  assert.throws(() => validateKeyPair({ secretKey: 'sk_test_x', publishableKey: 'pk_test_a', vitePublishableKey: 'pk_test_b' }), /CLERK_PUBLISHABLE_KEYS_MISMATCH/);
  assert.equal(assertNeonTarget({ database: 'neondb', project_id: 'still-waterfall-91972583', branch_id: 'br-shy-cherry-azuzy9v5' }), true);
  assert.throws(() => assertNeonTarget({ database: 'neondb', project_id: 'still-waterfall-91972583', branch_id: 'production' }), /CONNECTED_NEON_TARGET_MISMATCH/);
});

test('candidate batch has exact email, display name and matric patterns', () => {
  assert.equal(candidates().length, 50);
  assert.deepEqual(candidateFor(1), {
    number: 1, suffix: '01', email: 'student01+clerk_test@graduate.utm.my', firstName: 'Dummy',
    lastName: 'Student 01', fullName: 'Dummy Student 01', matricNo: 'DUMMY-20261101-01',
  });
  assert.equal(candidateFor(50).email, 'student50+clerk_test@graduate.utm.my');
});

test('Frontend environment fails closed unless development email/password sign-in is enabled', () => {
  const expected = {
    firstNameEnabled: true, lastNameEnabled: true, passwordSettings: validEnvironment().user_settings.password_settings,
  };
  assert.deepEqual(validateFrontendEnvironment(validEnvironment()), expected);
  assert.deepEqual(validateFrontendEnvironment({ response: validEnvironment(), client: {} }), expected);
  const emailDisabled = validEnvironment(); emailDisabled.user_settings.attributes.email_address.used_for_first_factor = false;
  assert.throws(() => validateFrontendEnvironment(emailDisabled), /EMAIL_PASSWORD_SIGN_IN_UNAVAILABLE/);
  const passwordDisabled = validEnvironment(); passwordDisabled.user_settings.attributes.password.enabled = false;
  assert.throws(() => validateFrontendEnvironment(passwordDisabled), /EMAIL_PASSWORD_SIGN_IN_UNAVAILABLE/);
  const passwordFactorAbsent = validEnvironment(); delete passwordFactorAbsent.user_settings.attributes.password.used_for_first_factor;
  assert.equal(validateFrontendEnvironment(passwordFactorAbsent).lastNameEnabled, true);
  const passwordMissing = validEnvironment(); delete passwordMissing.user_settings.attributes.password;
  assert.throws(() => validateFrontendEnvironment(passwordMissing), /EMAIL_PASSWORD_SIGN_IN_UNAVAILABLE/);
  const production = validEnvironment(); production.display_config.instance_environment_type = 'production';
  assert.throws(() => validateFrontendEnvironment(production), /FRONTEND_API_NOT_DEVELOPMENT/);
  const testModeOff = validEnvironment(); testModeOff.auth_config.test_mode = false;
  assert.throws(() => validateFrontendEnvironment(testModeOff), /CLERK_TEST_MODE_DISABLED/);
  const unsupported = validEnvironment(); unsupported.user_settings.attributes.phone_number.required = true;
  assert.throws(() => validateFrontendEnvironment(unsupported), /UNSUPPORTED_REQUIRED_SIGNUP_ATTRIBUTE/);
  const legal = validEnvironment(); legal.user_settings.sign_up.legal_consent_enabled = true;
  assert.throws(() => validateFrontendEnvironment(legal), /LEGAL_CONSENT_REQUIRED/);
  const restrictedSignup = validEnvironment(); restrictedSignup.user_settings.sign_up.mode = 'restricted'; restrictedSignup.user_settings.sign_up.allowlist_only = true;
  assert.equal(validateFrontendEnvironment(restrictedSignup).firstNameEnabled, true);
});

test('existing Clerk identity must be exact, verified, batch-owned and password-enabled', () => {
  const candidate = candidateFor(1);
  const auth = { firstNameEnabled: true, lastNameEnabled: true };
  const user = {
    id: 'user_fixture123', primaryEmailAddressId: 'email_1', firstName: 'Dummy', lastName: 'Student 01',
    privateMetadata: { purpose: 'subject-advisors-development-dummy', batch: '20261101-50' },
    emailAddresses: [{ id: 'email_1', emailAddress: candidate.email, verification: { status: 'verified' } }],
    passwordEnabled: true, banned: false, locked: false,
  };
  assert.equal(validateClerkIdentity(user, candidate, auth).clerkUserId, user.id);
  assert.throws(() => validateClerkIdentity({ ...user, id: candidate.email }, candidate, auth), /CLERK_IDENTITY_NOT_USABLE/);
  assert.throws(() => validateClerkIdentity({ ...user, privateMetadata: {} }, candidate, auth), /CLERK_EMAIL_ALREADY_OWNED/);
  assert.throws(() => validateClerkIdentity({ ...user, passwordEnabled: false }, candidate, auth), /CLERK_IDENTITY_NOT_USABLE/);
  assert.throws(() => validateClerkIdentity({ ...user, emailAddresses: [{ ...user.emailAddresses[0], verification: { status: 'unverified' } }] }, candidate, auth), /CLERK_PRIMARY_EMAIL_MISMATCH/);
});

test('database plan binds rows by actual Clerk ID and rejects matric or role collisions', () => {
  const candidate = candidateFor(1);
  const identity = identityFor(candidate);
  const clean = planDatabaseRows([candidate], [identity], { accounts: [], profiles: [] });
  assert.deepEqual(clean, { missingAccounts: [identity], missingProfiles: [identity] });
  assert.throws(() => planDatabaseRows([candidate], [identity], {
    accounts: [], profiles: [{ clerk_user_id: 'user_other', student_name: candidate.fullName, matric_no: candidate.matricNo, curriculum_id: 3, current_semester_id: 1, weekly_working_hours: 0, available_study_hours: 10 }],
  }), /DUMMY_MATRIC_COLLISION/);
  assert.throws(() => planDatabaseRows([candidate], [identity], {
    accounts: [{ clerk_user_id: identity.clerkUserId, app_role: 'STUDENT', access_status: 'SUSPENDED', roles: ['STUDENT'] }], profiles: [],
  }), /EXISTING_ACCESS_ASSIGNMENT_MISMATCH/);
  assert.throws(() => planDatabaseRows([candidate], [identity], {
    accounts: [{ clerk_user_id: identity.clerkUserId, app_role: 'STUDENT', access_status: 'ACTIVE', roles: ['STUDENT', 'SYSTEM_ADMIN'] }], profiles: [],
  }), /EXISTING_ACCESS_ASSIGNMENT_MISMATCH/);
  assert.throws(() => planDatabaseRows([candidate], [identity], {
    accounts: [], profiles: [{ clerk_user_id: identity.clerkUserId, student_name: candidate.fullName, matric_no: candidate.matricNo, curriculum_id: 3, current_semester_id: 1, weekly_working_hours: null, available_study_hours: 10 }],
  }), /EXISTING_PROFILE_MISMATCH/);
});

test('fresh dry-run preflight permits zero existing Clerk identities and checks all matric collisions', () => {
  const batch = candidates().map(candidate => ({ candidate, identity: null }));
  assert.deepEqual(inspectInitialDatabase(candidates(), batch, { accounts: [], profiles: [] }), []);
  assert.throws(() => inspectInitialDatabase(candidates(), batch, {
    accounts: [], profiles: [{ clerk_user_id: 'user_unrelated', matric_no: 'DUMMY-20261101-02' }],
  }), /DUMMY_MATRIC_COLLISION/);
});

test('password generator honors required classes and max length even when no classes are required', () => {
  const policy = { min_length: 8, max_length: 26, require_lowercase: true, require_uppercase: true, require_numbers: true, require_special_char: true, allowed_special_characters: '!' };
  const password = generatePassword(policy, 7);
  assert.equal(password.length, 26);
  assert.match(password, /[a-z]/); assert.match(password, /[A-Z]/); assert.match(password, /[0-9]/); assert.match(password, /!/);
  assert.equal(password.slice(-2), '07');
  const passwordWithoutRequiredClasses = generatePassword({ min_length: 8, max_length: 28, require_lowercase: false, require_uppercase: false, require_numbers: false, require_special_char: false }, 2);
  assert.ok(passwordWithoutRequiredClasses.length >= 8 && passwordWithoutRequiredClasses.length <= 28);
  assert.equal(passwordWithoutRequiredClasses.slice(-2), '02');
  assert.throws(() => generatePassword({ min_length: 28, max_length: 27 }, 1), /PASSWORD_POLICY_UNSATISFIABLE/);
});

test('owned partial batch rows can be retried only when identity, role and profile match', () => {
  const candidate = candidateFor(1);
  const identity = identityFor(candidate);
  const wrapper = { candidate, identity };
  const snapshot = {
    accounts: [{ clerk_user_id: identity.clerkUserId, app_role: 'STUDENT', access_status: 'ACTIVE', roles: ['STUDENT'] }],
    profiles: [{ clerk_user_id: identity.clerkUserId, student_name: candidate.fullName, matric_no: candidate.matricNo, curriculum_id: 3, current_semester_id: 1, weekly_working_hours: 0, available_study_hours: 10 }],
  };
  assert.deepEqual(inspectInitialDatabase([candidate], [wrapper], snapshot), [identity]);
  assert.throws(() => inspectInitialDatabase([candidate], [wrapper], {
    ...snapshot, accounts: [{ ...snapshot.accounts[0], access_status: 'SUSPENDED' }],
  }), /EXISTING_ACCESS_ASSIGNMENT_MISMATCH/);
});

test('transient password verification recovery retains one mapping and one credential', async () => {
  const candidate = candidateFor(1);
  let verifyCalls = 0;
  const user = {
    id: 'user_created123', primaryEmailAddressId: 'email_1', firstName: 'Dummy', lastName: 'Student 01',
    privateMetadata: { purpose: 'subject-advisors-development-dummy', batch: '20261101-50' },
    emailAddresses: [{ id: 'email_1', emailAddress: candidate.email, verification: { status: 'verified' } }],
    passwordEnabled: true, banned: false, locked: false,
  };
  const clerk = { users: {
    createUser: async () => user,
    getUserList: async () => ({ data: [user] }),
    verifyPassword: async () => { verifyCalls++; if (verifyCalls === 1) throw new TypeError('private network detail'); return { verified: true }; },
  } };
  const credentials = [];
  const result = await createMissingUsers(clerk, [{ candidate, identity: null }], {
    firstNameEnabled: true, lastNameEnabled: true,
    passwordSettings: { min_length: 8, max_length: 72, require_lowercase: true, require_uppercase: true, require_numbers: true, require_special_char: false },
  }, credentials);
  assert.equal(result.length, 1);
  assert.equal(result[0].clerkUserId, user.id);
  assert.equal(verifyCalls, 2);
  assert.equal(credentials.length, 1);
  assert.equal(credentials[0].status, 'created');
});

test('an explicit rate limit is retried once only after the exact email is confirmed absent', async () => {
  const candidate = candidateFor(1);
  let createCalls = 0; let lookupCalls = 0;
  const user = {
    id: 'user_rate123', primaryEmailAddressId: 'email_1', firstName: 'Dummy', lastName: 'Student 01',
    privateMetadata: { purpose: 'subject-advisors-development-dummy', batch: '20261101-50' },
    emailAddresses: [{ id: 'email_1', emailAddress: candidate.email, verification: { status: 'verified' } }],
    passwordEnabled: true, banned: false, locked: false,
  };
  const clerk = { users: {
    createUser: async () => { createCalls++; if (createCalls === 1) throw Object.assign(new Error('rate limit'), { status: 429 }); return user; },
    getUserList: async () => { lookupCalls++; return { data: [] }; },
    verifyPassword: async () => ({ verified: true }),
  } };
  const credentials = [];
  const result = await createMissingUsers(clerk, [{ candidate, identity: null }], {
    firstNameEnabled: true, lastNameEnabled: true,
    passwordSettings: { min_length: 8, max_length: 72 },
  }, credentials);
  assert.equal(createCalls, 2);
  assert.equal(lookupCalls, 2);
  assert.equal(result.length, 1);
  assert.equal(credentials[0].status, 'created');
});

test('recovered owned identity with a different password is never confirmed as created', async () => {
  const first = candidateFor(1); const second = candidateFor(2);
  const makeUser = (candidate, id) => ({
    id, primaryEmailAddressId: `email_${candidate.number}`, firstName: 'Dummy', lastName: `Student ${candidate.suffix}`,
    privateMetadata: { purpose: 'subject-advisors-development-dummy', batch: '20261101-50' },
    emailAddresses: [{ id: `email_${candidate.number}`, emailAddress: candidate.email, verification: { status: 'verified' } }],
    passwordEnabled: true, banned: false, locked: false,
  });
  const createdFirst = makeUser(first, 'user_created001');
  const recoveredSecond = makeUser(second, 'user_recovered002');
  let verifications = 0;
  const clerk = { users: {
    createUser: async payload => {
      if (payload.emailAddress[0] === first.email) return createdFirst;
      throw Object.assign(new Error('create outcome unknown'), { status: 500 });
    },
    getUserList: async () => ({ data: [recoveredSecond] }),
    verifyPassword: async ({ userId }) => {
      verifications++;
      if (userId === recoveredSecond.id) throw new Error('different prior password');
      return { verified: true };
    },
  } };
  const credentials = [];
  await assert.rejects(createMissingUsers(clerk, [
    { candidate: first, identity: null }, { candidate: second, identity: null },
  ], {
    firstNameEnabled: true, lastNameEnabled: true,
    passwordSettings: { min_length: 8, max_length: 72 },
  }, credentials));
  assert.equal(verifications, 3);
  assert.deepEqual(credentials.map(item => item.status), ['created', 'uncertain']);
  assert.match(credentialLines(credentials)[1], /outcome uncertain/);
});

test('partial credential handoff keeps only created or uncertain users and errors omit messages', () => {
  assert.deepEqual(credentialLines([
    { email: 'student01+clerk_test@graduate.utm.my', password: 'secret-01', status: 'created' },
    { email: 'student02+clerk_test@graduate.utm.my', password: 'secret-02', status: 'uncertain' },
    { email: 'student03+clerk_test@graduate.utm.my', password: 'secret-03', status: 'not-created' },
  ]), [
    'student01+clerk_test@graduate.utm.my\tsecret-01',
    'student02+clerk_test@graduate.utm.my\tsecret-02\t(outcome uncertain; check Clerk before retry)',
  ]);
  const error = safeError(Object.assign(new Error('never expose password=bad'), { code: 'api_error', status: 503 }));
  assert.deepEqual(error, { type: 'Error', status: 503, code: 'api_error' });
  assert.equal(JSON.stringify(error).includes('password=bad'), false);
});
