#!/usr/bin/env node
import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { createClerkClient } from '@clerk/backend';
import { parsePublishableKey } from '@clerk/shared/keys';
import { Client } from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = Object.freeze({ projectId: 'still-waterfall-91972583', branchId: 'br-shy-cherry-azuzy9v5', database: 'neondb' });
const BATCH = '20261101-50';
const PURPOSE = 'subject-advisors-development-dummy';
const CURRICULUM_ID = 3;
const SEMESTER_ID = 1;
const ID_PATTERN = /^user_[A-Za-z0-9]+$/;

export class SeedError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const fail = code => { throw new SeedError(code); };
const suffixFor = number => String(number).padStart(2, '0');

export function parseMode(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true, apply: false };
  const allowed = new Set(['--apply', '--dry-run']);
  if (args.some(arg => !allowed.has(arg)) || (args.includes('--apply') && args.includes('--dry-run'))) fail('INVALID_ARGUMENTS');
  return { help: false, apply: args.includes('--apply') };
}

export function candidateFor(number) {
  const suffix = suffixFor(number);
  if (number < 1 || number > 50) fail('INVALID_STUDENT_NUMBER');
  return {
    number,
    suffix,
    email: `student${suffix}+clerk_test@graduate.utm.my`,
    firstName: 'Dummy',
    lastName: `Student ${suffix}`,
    fullName: `Dummy Student ${suffix}`,
    matricNo: `DUMMY-20261101-${suffix}`,
  };
}

export function candidates() { return Array.from({ length: 50 }, (_, index) => candidateFor(index + 1)); }

export function validateKeyPair({ secretKey, publishableKey, vitePublishableKey }) {
  if (typeof secretKey !== 'string' || !secretKey.startsWith('sk_test_')) fail('CLERK_DEVELOPMENT_SECRET_REQUIRED');
  if (typeof publishableKey !== 'string' || !publishableKey.startsWith('pk_test_')) fail('CLERK_DEVELOPMENT_PUBLISHABLE_REQUIRED');
  if (publishableKey !== vitePublishableKey) fail('CLERK_PUBLISHABLE_KEYS_MISMATCH');
  let parsed;
  try { parsed = parsePublishableKey(publishableKey, { fatal: true }); } catch { fail('INVALID_PUBLISHABLE_KEY'); }
  if (parsed.instanceType !== 'development') fail('CLERK_PUBLISHABLE_NOT_DEVELOPMENT');
  return { frontendApi: parsed.frontendApi };
}

function urlHost(value) {
  try { return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase(); }
  catch { fail('INVALID_FRONTEND_API_HOST'); }
}

export function validateFrontendEnvironment(payload) {
  const environment = payload?.response ?? payload;
  const config = environment?.user_settings;
  const display = environment?.display_config;
  if (!environment || display?.instance_environment_type !== 'development') fail('FRONTEND_API_NOT_DEVELOPMENT');
  if (environment.auth_config && Object.hasOwn(environment.auth_config, 'test_mode') && environment.auth_config.test_mode !== true) fail('CLERK_TEST_MODE_DISABLED');
  const attributes = config?.attributes;
  if (attributes?.email_address?.enabled !== true || attributes?.email_address?.used_for_first_factor !== true || attributes?.password?.enabled !== true) fail('EMAIL_PASSWORD_SIGN_IN_UNAVAILABLE');
  const supportedRequired = new Set(['email_address', 'password', 'first_name', 'last_name']);
  for (const [name, value] of Object.entries(attributes)) {
    if (value?.required === true && !supportedRequired.has(name)) fail('UNSUPPORTED_REQUIRED_SIGNUP_ATTRIBUTE');
    if (value?.required === true && value?.enabled !== true) fail('REQUIRED_SIGNUP_ATTRIBUTE_DISABLED');
  }
  if (config.sign_up.legal_consent_enabled === true) fail('LEGAL_CONSENT_REQUIRED');
  return {
    firstNameEnabled: attributes.first_name?.enabled === true,
    lastNameEnabled: attributes.last_name?.enabled === true,
    passwordSettings: config.password_settings,
  };
}

export function validateClerkIdentity(user, candidate, { firstNameEnabled, lastNameEnabled }, requireOwned = true) {
  if (!user || !ID_PATTERN.test(user.id ?? '') || user.banned || user.locked || user.passwordEnabled !== true) fail('CLERK_IDENTITY_NOT_USABLE');
  const primary = user.emailAddresses?.find(item => item.id === user.primaryEmailAddressId);
  if (!primary || primary.emailAddress.toLowerCase() !== candidate.email.toLowerCase() || primary.verification?.status !== 'verified') fail('CLERK_PRIMARY_EMAIL_MISMATCH');
  if (requireOwned && (user.privateMetadata?.purpose !== PURPOSE || user.privateMetadata?.batch !== BATCH)) fail('CLERK_EMAIL_ALREADY_OWNED');
  if (firstNameEnabled && user.firstName !== candidate.firstName) fail('CLERK_FIRST_NAME_MISMATCH');
  if (lastNameEnabled && user.lastName !== candidate.lastName) fail('CLERK_LAST_NAME_MISMATCH');
  return { ...candidate, clerkUserId: user.id, user };
}

export function inspectInitialDatabase(candidatesList, classified, snapshot) {
  const existing = classified.flatMap(item => item.identity ? [item.identity] : []);
  const byId = new Map(existing.map(identity => [identity.clerkUserId, identity]));
  const byMatric = new Map(candidatesList.map(candidate => [candidate.matricNo, candidate]));
  for (const profile of snapshot.profiles) {
    const identity = byId.get(profile.clerk_user_id);
    const target = byMatric.get(profile.matric_no);
    if (target && (!identity || identity.email.toLowerCase() !== target.email.toLowerCase())) fail('DUMMY_MATRIC_COLLISION');
  }
  if (existing.length) {
    const existingCandidates = existing.map(identity => candidatesList.find(candidate => candidate.email.toLowerCase() === identity.email.toLowerCase()));
    planDatabaseRows(existingCandidates, existing, snapshot);
  }
  return existing;
}

export function planDatabaseRows(candidatesList, identities, snapshot) {
  const byEmail = new Map(identities.map(identity => [identity.email.toLowerCase(), identity]));
  const byId = new Map(identities.map(identity => [identity.clerkUserId, identity]));
  const byMatric = new Map(candidatesList.map(candidate => [candidate.matricNo, candidate]));
  const accounts = new Map(snapshot.accounts.map(row => [row.clerk_user_id, row]));
  const profilesById = new Map();
  for (const row of snapshot.profiles) {
    const candidate = byId.get(row.clerk_user_id);
    const matricCandidate = byMatric.get(row.matric_no);
    if (!candidate && matricCandidate) fail('DUMMY_MATRIC_COLLISION');
    if (candidate && (candidate.matricNo !== row.matric_no || candidate.fullName !== row.student_name || row.curriculum_id !== CURRICULUM_ID || row.current_semester_id !== SEMESTER_ID || row.weekly_working_hours !== 0 || row.available_study_hours !== 10)) fail('EXISTING_PROFILE_MISMATCH');
    if (candidate) profilesById.set(row.clerk_user_id, row);
  }
  const missingAccounts = [];
  const missingProfiles = [];
  for (const candidate of candidatesList) {
    const identity = byEmail.get(candidate.email.toLowerCase());
    if (!identity) fail('CLERK_IDENTITY_MAPPING_MISSING');
    const account = accounts.get(identity.clerkUserId);
    if (account) {
      if (account.access_status !== 'ACTIVE' || account.app_role !== 'STUDENT' || (account.roles ?? []).filter(Boolean).join(',') !== 'STUDENT') fail('EXISTING_ACCESS_ASSIGNMENT_MISMATCH');
    } else missingAccounts.push(identity);
    if (!profilesById.has(identity.clerkUserId)) missingProfiles.push(identity);
  }
  return { missingAccounts, missingProfiles };
}

export function safeError(error) {
  if (error instanceof SeedError) return { code: error.code };
  const result = { type: error?.constructor?.name ?? 'Error' };
  if (Number.isInteger(error?.status)) result.status = error.status;
  if (typeof error?.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(error.code)) result.code = error.code;
  if (typeof error?.cause?.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(error.cause.code)) result.causeCode = error.cause.code;
  const codes = Array.isArray(error?.errors) ? error.errors.map(item => item.code).filter(code => typeof code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(code)) : [];
  if (codes.length) result.errorCodes = codes;
  return result;
}

export function assertNeonTarget(row) {
  if (row?.database !== TARGET.database || row?.project_id !== TARGET.projectId || row?.branch_id !== TARGET.branchId) fail('CONNECTED_NEON_TARGET_MISMATCH');
  return true;
}

export async function applyIfRequested(mode, apply) {
  if (!mode.apply) return null;
  return apply();
}

export async function readLocalConfig() {
  const [devText, localText] = await Promise.all([
    readFile(resolve(ROOT, '.dev.vars'), 'utf8'),
    readFile(resolve(ROOT, '.env.local'), 'utf8'),
  ]);
  const dev = parseEnv(devText);
  const local = parseEnv(localText);
  const keyInfo = validateKeyPair({ secretKey: dev.CLERK_SECRET_KEY, publishableKey: dev.CLERK_PUBLISHABLE_KEY, vitePublishableKey: local.VITE_CLERK_PUBLISHABLE_KEY });
  if (typeof dev.DATABASE_URL !== 'string') fail('DATABASE_URL_MISSING');
  let dbUrl;
  try { dbUrl = new URL(dev.DATABASE_URL); } catch { fail('DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol) || !dbUrl.hostname.endsWith('.neon.tech') || decodeURIComponent(dbUrl.pathname.slice(1)) !== TARGET.database || !['require', 'verify-ca', 'verify-full'].includes(dbUrl.searchParams.get('sslmode'))) fail('DEVELOPMENT_DATABASE_URL_REQUIRED');
  return { secretKey: dev.CLERK_SECRET_KEY, publishableKey: dev.CLERK_PUBLISHABLE_KEY, databaseUrl: dev.DATABASE_URL, frontendApi: keyInfo.frontendApi };
}

async function verifyDatabaseTarget(db) {
  const { rows: [row] } = await db.query("SELECT current_database() AS database, current_setting('neon.project_id',true) AS project_id, current_setting('neon.branch_id',true) AS branch_id");
  assertNeonTarget(row);
  const { rows: [curriculum] } = await db.query(`SELECT c.curriculum_id, c.curriculum_version, c.status AS curriculum_status, p.programme_code, p.status AS programme_status
    FROM public.curriculum c JOIN public.programme p USING(programme_id) WHERE c.curriculum_id=$1`, [CURRICULUM_ID]);
  if (!curriculum || curriculum.programme_code !== 'SECRH' || curriculum.curriculum_version !== 'English' || String(curriculum.curriculum_status ?? 'ACTIVE').toUpperCase() !== 'ACTIVE' || String(curriculum.programme_status ?? 'ACTIVE').toUpperCase() !== 'ACTIVE') fail('DUMMY_CURRICULUM_UNAVAILABLE');
  const { rows: [semester] } = await db.query('SELECT semester_id FROM public.academic_semester WHERE semester_id=$1', [SEMESTER_ID]);
  if (!semester) fail('DUMMY_SEMESTER_UNAVAILABLE');
}

export async function inspectClerkTarget(clerk, frontendApi) {
  const instance = await clerk.instance.get();
  if (instance.environmentType !== 'development') fail('CLERK_BACKEND_NOT_DEVELOPMENT');
  const { data: domains } = await clerk.domains.list();
  const expectedHost = urlHost(frontendApi);
  if (!domains.some(domain => urlHost(domain.frontendApiUrl) === expectedHost)) fail('CLERK_DOMAIN_KEY_MISMATCH');
  const response = await fetch(`https://${expectedHost}/v1/environment`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) fail('CLERK_FRONTEND_ENVIRONMENT_UNAVAILABLE');
  return validateFrontendEnvironment(await response.json());
}

async function listExactUsers(clerk, candidateList) {
  const { data } = await clerk.users.getUserList({ emailAddress: candidateList.map(item => item.email), limit: 100 });
  if (data.length >= 100) fail('CLERK_CANDIDATE_QUERY_OVERFLOW');
  return candidateList.map(candidate => {
    const found = data.filter(user => user.emailAddresses?.some(email => email.emailAddress.toLowerCase() === candidate.email.toLowerCase()));
    if (found.length > 1) fail('MULTIPLE_CLERK_EMAIL_MATCHES');
    return { candidate, user: found[0] ?? null };
  });
}

function classifyUsers(matches, authSettings) {
  const classified = matches.map(({ candidate, user }) => ({ candidate, identity: user ? validateClerkIdentity(user, candidate, authSettings) : null }));
  const ids = classified.flatMap(item => item.identity ? [item.identity.clerkUserId] : []);
  if (new Set(ids).size !== ids.length) fail('CLERK_IDENTITY_ID_COLLISION');
  return classified;
}

async function readDatabaseSnapshot(db, candidateList, identities) {
  const ids = identities.map(item => item.clerkUserId);
  const matricNumbers = candidateList.map(item => item.matricNo);
  const { rows: accounts } = await db.query(`SELECT a.clerk_user_id, a.app_role, a.access_status,
      coalesce(array_agg(r.app_role ORDER BY r.app_role) FILTER (WHERE r.app_role IS NOT NULL), ARRAY[]::varchar[]) AS roles
    FROM public.user_access_assignment a LEFT JOIN public.user_role_assignment r USING(access_assignment_id)
    WHERE a.clerk_user_id = ANY($1::text[]) GROUP BY a.access_assignment_id`, [ids]);
  const { rows: profiles } = await db.query(`SELECT clerk_user_id, student_name, matric_no, curriculum_id, current_semester_id,
      weekly_working_hours, available_study_hours, student_id
    FROM public.student_profile WHERE clerk_user_id = ANY($1::text[]) OR matric_no = ANY($2::varchar[])`, [ids, matricNumbers]);
  return { accounts, profiles };
}

async function checkNoAcademicRows(db, identities) {
  const ids = identities.map(item => item.clerkUserId);
  const { rows: profiles } = await db.query('SELECT student_id FROM public.student_profile WHERE clerk_user_id = ANY($1::text[])', [ids]);
  const studentIds = profiles.map(row => row.student_id);
  if (!studentIds.length) return;
  const { rows: [records] } = await db.query('SELECT count(*)::int AS count FROM public.academic_record WHERE student_id = ANY($1::int[])', [studentIds]);
  const { rows: [offerings] } = await db.query('SELECT count(*)::int AS count FROM public.semester_offering WHERE student_id = ANY($1::int[])', [studentIds]);
  if (records.count !== 0 || offerings.count !== 0) fail('DUMMY_ACADEMIC_ROWS_EXIST');
}

async function checkRoleAudit(db, identities) {
  const ids = identities.map(item => item.clerkUserId);
  const { rows } = await db.query(`SELECT a.clerk_user_id, count(*) FILTER (WHERE l.app_role='STUDENT' AND l.action='GRANT')::int AS grants
    FROM public.user_access_assignment a JOIN public.user_role_audit_log l USING(access_assignment_id)
    WHERE a.clerk_user_id = ANY($1::text[]) GROUP BY a.clerk_user_id`, [ids]);
  if (rows.length !== 50 || rows.some(row => row.grants < 1)) fail('STUDENT_ROLE_AUDIT_MISSING');
}

async function transactionallyReconcile(db, candidateList, identities) {
  await db.query('BEGIN');
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('subject-advisors-development-dummy-students'))");
    const snapshot = await readDatabaseSnapshot(db, candidateList, identities);
    const plan = planDatabaseRows(candidateList, identities, snapshot);
    for (const identity of plan.missingAccounts) {
      await db.query("INSERT INTO public.user_access_assignment(clerk_user_id, app_role, access_status) VALUES ($1, 'STUDENT', 'ACTIVE')", [identity.clerkUserId]);
    }
    for (const identity of plan.missingProfiles) {
      await db.query(`INSERT INTO public.student_profile(clerk_user_id, student_name, matric_no, curriculum_id,
        current_semester_id, weekly_working_hours, available_study_hours) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [identity.clerkUserId, identity.fullName, identity.matricNo, CURRICULUM_ID, SEMESTER_ID, 0, 10]);
    }
    const finalSnapshot = await readDatabaseSnapshot(db, candidateList, identities);
    const finalPlan = planDatabaseRows(candidateList, identities, finalSnapshot);
    if (finalPlan.missingAccounts.length || finalPlan.missingProfiles.length) fail('DATABASE_RECONCILE_INCOMPLETE');
    await checkRoleAudit(db, identities);
    await checkNoAcademicRows(db, identities);
    await db.query('COMMIT');
    return { insertedAccounts: plan.missingAccounts.length, insertedProfiles: plan.missingProfiles.length };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export function generatePassword(settings = {}, number) {
  const min = Number(settings.min_length) || 8;
  const max = Number(settings.max_length) || 128;
  const special = [...(settings.allowed_special_characters ?? '')];
  const classes = [];
  if (settings.require_lowercase) classes.push('abcdefghijklmnopqrstuvwxyz');
  if (settings.require_uppercase) classes.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  if (settings.require_numbers) classes.push('0123456789');
  if (settings.require_special_char) classes.push(special.join(''));
  if (classes.some(chars => chars.length === 0)) fail('PASSWORD_POLICY_UNSATISFIABLE');
  const alphabet = [...new Set(`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789${special.join('')}`)];
  if (min > max || alphabet.length === 0) fail('PASSWORD_POLICY_UNSATISFIABLE');
  const suffix = suffixFor(number);
  const length = Math.min(max, Math.max(min, 26));
  if (length <= suffix.length) fail('PASSWORD_POLICY_UNSATISFIABLE');
  const required = classes.map(chars => chars[randomInt(chars.length)]);
  while (required.length < length - suffix.length) required.push(alphabet[randomInt(alphabet.length)]);
  for (let i = required.length - 1; i > 0; i--) { const j = randomInt(i + 1); [required[i], required[j]] = [required[j], required[i]]; }
  return `${required.join('')}${suffix}`;
}

export function credentialLines(credentials) {
  return credentials.filter(item => item.status === 'created' || item.status === 'uncertain')
    .map(item => `${item.email}\t${item.password}${item.status === 'uncertain' ? '\t(outcome uncertain; check Clerk before retry)' : ''}`);
}

async function createUserWithRateLimitRetry(clerk, candidate, payload) {
  let attempt = 0;
  while (true) {
    try { return { user: await clerk.users.createUser(payload), createdHere: true }; }
    catch (error) {
      const [match] = await listExactUsers(clerk, [candidate]);
      if (match.user) return { user: match.user, createdHere: false };
      if (error?.status !== 429 || attempt > 0) throw error;
      const retryAfter = Number(error.retryAfter);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(3000, Math.max(1000, retryAfter * 1000)) : 1000;
      await new Promise(resolvePromise => setTimeout(resolvePromise, waitMs));
      const [afterWait] = await listExactUsers(clerk, [candidate]);
      if (afterWait.user) return { user: afterWait.user, createdHere: false };
      attempt++;
    }
  }
}

export async function createMissingUsers(clerk, classified, authSettings, credentials) {
  const identities = [];
  let verifiedPassword = false;
  for (const item of classified) {
    if (item.identity) { identities.push(item.identity); continue; }
    const candidate = item.candidate;
    const password = generatePassword(authSettings.passwordSettings, candidate.number);
    const handoff = { email: candidate.email, password, status: 'uncertain' };
    credentials.push(handoff);
    const payload = {
      emailAddress: [candidate.email], password,
      privateMetadata: { purpose: PURPOSE, batch: BATCH },
      ...(authSettings.firstNameEnabled ? { firstName: candidate.firstName } : {}),
      ...(authSettings.lastNameEnabled ? { lastName: candidate.lastName } : {}),
    };
    let createdHere = false;
    try {
      const created = await createUserWithRateLimitRetry(clerk, candidate, payload);
      const user = created.user;
      createdHere = created.createdHere;
      const identity = validateClerkIdentity(user, candidate, authSettings);
      if (!verifiedPassword || !createdHere) {
        await clerk.users.verifyPassword({ userId: identity.clerkUserId, password });
        if (!verifiedPassword) verifiedPassword = true;
      }
      handoff.status = 'created';
      identities.push(identity);
    } catch (error) {
      if (error instanceof SeedError) { handoff.status = createdHere ? 'created' : 'not-created'; throw error; }
      try {
        const [match] = await listExactUsers(clerk, [candidate]);
        if (match.user && match.user.privateMetadata?.purpose === PURPOSE && match.user.privateMetadata?.batch === BATCH) {
          const identity = validateClerkIdentity(match.user, candidate, authSettings);
          await clerk.users.verifyPassword({ userId: identity.clerkUserId, password });
          handoff.status = 'created';
          identities.push(identity);
          verifiedPassword = true;
          continue;
        }
        handoff.status = 'not-created';
      } catch { handoff.status = 'uncertain'; }
      throw error;
    }
  }
  if (new Set(identities.map(identity => identity.clerkUserId)).size !== identities.length) fail('CLERK_IDENTITY_ID_COLLISION');
  return identities;
}

function printHelp() {
  console.log('Usage: node tools/auth/seed-development-students.mjs [--dry-run|--apply]');
  console.log('No arguments performs a read-only development preflight. --apply creates/reconciles this exact 50-user dummy batch.');
}

async function main(args = process.argv.slice(2)) {
  let db;
  const credentials = [];
  let result = null;
  let failure = null;
  try {
    const mode = parseMode(args);
    if (mode.help) { printHelp(); return; }
    const config = await readLocalConfig();
    db = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 10000, statement_timeout: 20000 });
    await db.connect();
    await verifyDatabaseTarget(db);
    const clerk = createClerkClient({ secretKey: config.secretKey });
    const authSettings = await inspectClerkTarget(clerk, config.frontendApi);
    const candidateList = candidates();
    const matches = await listExactUsers(clerk, candidateList);
    const classified = classifyUsers(matches, authSettings);
    const existing = classified.flatMap(item => item.identity ? [item.identity] : []);
    const initialSnapshot = await readDatabaseSnapshot(db, candidateList, existing);
    inspectInitialDatabase(candidateList, classified, initialSnapshot);
    if (!mode.apply) {
      console.log(JSON.stringify({ mode: 'DRY_RUN', target: { ...TARGET, clerk: 'development' }, candidates: 50, ownedClerkUsers: existing.length, missingClerkUsers: 50 - existing.length, databasePreflight: 'passed; no writes' }));
      return;
    }
    result = await applyIfRequested(mode, async () => {
      const identities = await createMissingUsers(clerk, classified, authSettings, credentials);
      if (identities.length !== 50) fail('CLERK_BATCH_INCOMPLETE');
      const dbResult = await transactionallyReconcile(db, candidateList, identities);
      return { mode: 'APPLIED', target: { ...TARGET, clerk: 'development' }, users: identities.length, accessAssignmentsInserted: dbResult.insertedAccounts, profilesInserted: dbResult.insertedProfiles, role: 'STUDENT', academicRecords: 0, semesterOfferings: 0 };
    });
  } catch (error) {
    failure = safeError(error);
  } finally {
    if (db) await db.end().catch(() => {});
    if (credentials.length) {
      console.log('\nTemporary credentials (terminal handoff only; not saved to a file):');
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
