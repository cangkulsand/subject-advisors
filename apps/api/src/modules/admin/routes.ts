import { authorize, AuthError, authErrorResponse, authJson } from '../auth';
import { ADMIN_ROLES, isAdminRole, validateChangeAccessRequest, validateCreateAccountRequest, validateCreateInvitationRequest, validateGrantRoleRequest, validateRevokeRoleRequest, validateChangeProgrammeRequest } from '../../../../../packages/shared/src/admin/admin';
import type { AdminIdentity, AdminInvitationStatus, AdminUsersQuery, AdminAuditQuery, AdminValidation } from '../../../../../packages/shared/src/admin/admin';
import type { AccountDetailRow, AccountRow, AdminDependencies } from './contracts';
import { AdminMutationError } from './errors';
import { checkRoleEligibility } from './eligibility';
import { handleAcademicSetupRequest } from './academic-routes';
import { DUMMY_CLERK_USER_LIMIT, dummyEmail, dummyMatric, isDummyEmail, validateCreateDummyUserRequest, validateResetDummyPasswordRequest } from '../../../../../packages/shared/src/admin/dummy';
import { generateDummyPassword } from './dummy-password';

/** Lower-case hex or decimal digits from the platform CSPRNG (dummy email suffix, fake matric). */
function randomDigits(count: number, radix: 16 | 10): string {
  return [...crypto.getRandomValues(new Uint8Array(count))].map(byte => (byte % radix).toString(radix)).join('');
}

function invalid(message: string): never { throw new AuthError(400, 'INVALID_ADMIN_QUERY', message); }
function positive(value: string, label: string) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) invalid('Invalid ' + label + '.');
  return Number(value);
}
function page(params: URLSearchParams) {
  const result = positive(params.get('page') ?? '1', 'page');
  if (result > 10000) invalid('Page is outside the supported range.');
  return result;
}
function parameters(url: URL, allowed: string[]) {
  for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) invalid('Unsupported or duplicate query parameter.');
}
function date(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid('Use a valid date in YYYY-MM-DD format.');
  return value;
}
async function enrich(rows: AccountRow[], deps: AdminDependencies) {
  let identities: Map<string, AdminIdentity>;
  try { identities = await deps.identities.lookup(rows.map(row => row.clerkUserId)); }
  catch { return rows.map(row => ({ ...row, identity: { state: 'unavailable' as const, name: null, email: null, emailVerified: false } })); }
  return rows.map(row => ({ ...row, identity: identities.get(row.clerkUserId) ?? { state: 'not_found' as const, name: null, email: null, emailVerified: false } }));
}

const BODY_LIMIT_BYTES = 16 * 1024;
const INVITATION_DAYS = 7;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITATION_STATUSES: readonly string[] = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'];

function methodNotAllowed(allowed: string[]): Response {
  const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported for this resource.' } }, 405);
  response.headers.set('Allow', allowed.join(', '));
  return response;
}
function badRequest(code: string, message: string): never { throw new AuthError(400, code, message); }
/** Reads a bounded JSON body: Content-Type must be application/json (415), size and syntax errors are 400. */
async function readJson(request: Request): Promise<unknown> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') throw new AuthError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json.');
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > BODY_LIMIT_BYTES) badRequest('BODY_TOO_LARGE', 'The request body is too large.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > BODY_LIMIT_BYTES) badRequest('BODY_TOO_LARGE', 'The request body is too large.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return badRequest('INVALID_JSON', 'The request body is not valid JSON.'); }
}
function validated<T>(result: AdminValidation<T>): T {
  if (!result.ok) badRequest('INVALID_REQUEST', result.error);
  return result.value;
}
function mutationResponse(error: AdminMutationError): Response {
  return authJson({ error: { code: error.code, message: error.message } }, error.status);
}
/** `usable` (S3-P004-033): can the account's verified email hold this role? Unset when Clerk could not be read. */
function withUsable(memberships: AccountDetailRow['memberships'], identity: { email: string | null; emailVerified: boolean; state: string }) {
  if (identity.state !== 'available') return memberships;
  const email = identity.email ? { address: identity.email, verified: identity.emailVerified } : null;
  return memberships.map(membership => ({ ...membership, usable: checkRoleEligibility(email, [membership.role]).eligible }));
}

async function detail(account: AccountDetailRow, deps: AdminDependencies) {
  const [row] = await enrich([account], deps);
  return { ...row!, memberships: withUsable(account.memberships, row!.identity) };
}

export async function handleAdminRequest(request: Request, deps: AdminDependencies): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/admin' && !url.pathname.startsWith('/api/admin/')) return null;
  // Academic routes must run before the user-management catchall. Old fixture dependencies remain compatible.
  if (deps.academicRepository) {
    const response = await handleAcademicSetupRequest(request, { auth: deps.auth, repository: deps.academicRepository });
    if (response) return response;
  }
  try {
    // The actor is always the authorized administrator's own verified Clerk ID, never a value from the request.
    const actor = (await authorize(request, deps.auth, { roles: ['SYSTEM_ADMIN'] })).clerkUserId;
    const method = request.method;
    const allow = (...methods: string[]) => methods.includes(method) ? null : methodNotAllowed(methods);
    const usersMutation = /^\/api\/admin\/users\/([1-9]\d*)\/(roles|access)$/.exec(url.pathname);
    const roleDelete = /^\/api\/admin\/users\/([1-9]\d*)\/roles\/([^/]+)$/.exec(url.pathname);
    const invitationDelete = /^\/api\/admin\/invitations\/([^/]+)$/.exec(url.pathname);

    // Dummy users (S3-P004-029). The password is generated here, sent to Clerk and returned once; it is never stored or logged.
    if (url.pathname === '/api/admin/dummy-users/capacity') {
      const denied = allow('GET'); if (denied) return denied;
      parameters(url, []);
      return authJson({ data: { used: await deps.identities.userCount(), limit: DUMMY_CLERK_USER_LIMIT } });
    }
    if (url.pathname === '/api/admin/dummy-users') {
      const denied = allow('POST'); if (denied) return denied;
      parameters(url, []);
      const input = validated(validateCreateDummyUserRequest(await readJson(request)));
      if (input.role === 'STUDENT' && await deps.repository.currentSemesterId() === null) throw new AdminMutationError('ACADEMIC_SEMESTER_UNAVAILABLE');
      if (await deps.identities.userCount() >= DUMMY_CLERK_USER_LIMIT) throw new AdminMutationError('DUMMY_LIMIT_REACHED');
      const email = dummyEmail(input.name, input.role, randomDigits(4, 16));
      if (!checkRoleEligibility({ address: email, verified: true }, [input.role]).eligible) throw new AdminMutationError('ROLE_NOT_ELIGIBLE');
      const password = generateDummyPassword();
      let clerkUserId: string;
      try { clerkUserId = (await deps.identities.createUser({ email, firstName: input.name, password })).clerkUserId; }
      catch { throw new AdminMutationError('DUMMY_CREATE_FAILED'); }
      try {
        const created = await deps.repository.createDummyAccount(clerkUserId, input, dummyMatric(randomDigits(6, 10)), actor, input.reason);
        return authJson({ data: { account: await detail(created, deps), credentials: { email, password } } }, 201);
      } catch (error) {
        // No orphan login: the Clerk user exists only if the account does.
        await deps.identities.deleteUser(clerkUserId).catch(() => undefined);
        throw error;
      }
    }
    const dummyPassword = /^\/api\/admin\/users\/([1-9]\d*)\/dummy-password$/.exec(url.pathname);
    if (dummyPassword) {
      const denied = allow('POST'); if (denied) return denied;
      parameters(url, []);
      validated(validateResetDummyPasswordRequest(await readJson(request)));
      const account = await deps.repository.account(positive(dummyPassword[1]!, 'account ID'));
      if (!account) throw new AdminMutationError('NOT_FOUND');
      const email = (await deps.identities.lookup([account.clerkUserId])).get(account.clerkUserId)?.email ?? null;
      // A dummy that somehow holds SYSTEM_ADMIN must never have an admin-issued password.
      if (!email || !isDummyEmail(email) || account.roles.includes('SYSTEM_ADMIN')) throw new AdminMutationError('NOT_A_DUMMY_ACCOUNT');
      const password = generateDummyPassword();
      await deps.identities.setPassword(account.clerkUserId, password);
      return authJson({ data: { email, password } });
    }
    if (url.pathname === '/api/admin/users' && method === 'POST') {
      parameters(url, []);
      const input = validated(validateCreateAccountRequest(await readJson(request)));
      const found = await deps.identities.findByEmail(input.email);
      if (!found) throw new AdminMutationError('CLERK_USER_NOT_FOUND');
      if (!found.emailVerified) throw new AdminMutationError('ROLE_NOT_ELIGIBLE');
      if (!checkRoleEligibility({ address: found.verifiedEmail, verified: true }, input.roles).eligible) throw new AdminMutationError('ROLE_NOT_ELIGIBLE');
      const created = await deps.repository.createAccount(found.clerkUserId, input.roles, actor, input.reason);
      return authJson({ data: await detail(created, deps) }, 201);
    }
    const programmeRoute = /^\/api\/admin\/users\/([1-9]\d*)\/programme$/.exec(url.pathname);
    if (programmeRoute) {
      const denied = allow('GET', 'PATCH'); if (denied) return denied;
      parameters(url, []);
      const accountId = positive(programmeRoute[1]!, 'account ID');
      if (method === 'GET') {
        if (!await deps.repository.account(accountId)) throw new AuthError(404, 'ACCOUNT_NOT_FOUND', 'This application account was not found.');
        return authJson({ data: await deps.repository.studentProgramme(accountId) });
      }
      const input = validated(validateChangeProgrammeRequest(await readJson(request)));
      return authJson({ data: await deps.repository.changeStudentProgramme(accountId, input.curriculumId, actor, input.reason) });
    }
    if (url.pathname === '/api/admin/curriculum-options') {
      const denied = allow('GET'); if (denied) return denied;
      parameters(url, []);
      return authJson({ data: await deps.repository.curriculumOptions() });
    }
    if (usersMutation && usersMutation[2] === 'roles') {
      const denied = allow('POST'); if (denied) return denied;
      parameters(url, []);
      const accountId = positive(usersMutation[1]!, 'account ID');
      const input = validated(validateGrantRoleRequest(await readJson(request)));
      const target = await deps.repository.account(accountId);
      if (!target) throw new AdminMutationError('NOT_FOUND');
      // Re-check eligibility against the target's CURRENT verified email, never the stored role history.
      const identity = (await deps.identities.lookup([target.clerkUserId])).get(target.clerkUserId);
      if (!identity || identity.state === 'not_found') throw new AdminMutationError('CLERK_USER_NOT_FOUND');
      if (identity.state !== 'available') throw new Error('Identity provider unavailable');
      if (!checkRoleEligibility(identity.email ? { address: identity.email, verified: identity.emailVerified } : null, [input.role]).eligible) throw new AdminMutationError('ROLE_NOT_ELIGIBLE');
      return authJson({ data: await detail(await deps.repository.grantRole(accountId, input.role, actor, input.reason), deps) });
    }
    if (usersMutation) {
      const denied = allow('PATCH'); if (denied) return denied;
      parameters(url, []);
      const input = validated(validateChangeAccessRequest(await readJson(request)));
      const accountId = positive(usersMutation[1]!, 'account ID');
      const before = await deps.repository.account(accountId);
      if (!before) throw new AdminMutationError('NOT_FOUND');
      // App first (its guards: self-lockout, protected owner, last admin), then Clerk. If Clerk fails, put the app
      // status back so the app and Clerk never disagree (S3-P004-009).
      const changed = await deps.repository.setAccessStatus(accountId, input.status, actor, input.reason);
      const blocking = input.status === 'SUSPENDED';
      try {
        await deps.identities.setSignInBlocked(before.clerkUserId, blocking);
      } catch {
        await deps.repository.setAccessStatus(accountId, before.accessStatus, actor,
          blocking ? 'Reverted: sign-in could not be blocked in Clerk' : 'Reverted: sign-in could not be unblocked in Clerk').catch(() => undefined);
        throw new AdminMutationError(blocking ? 'SIGN_IN_BLOCK_FAILED' : 'SIGN_IN_UNBLOCK_FAILED');
      }
      return authJson({ data: await detail(changed, deps) });
    }
    if (roleDelete) {
      const denied = allow('DELETE'); if (denied) return denied;
      parameters(url, []);
      const role = decodeURIComponent(roleDelete[2]!);
      if (!isAdminRole(role)) badRequest('INVALID_REQUEST', 'Invalid role.');
      const input = validated(validateRevokeRoleRequest(await readJson(request)));
      return authJson({ data: await detail(await deps.repository.revokeRole(positive(roleDelete[1]!, 'account ID'), role, actor, input.reason), deps) });
    }
    if (url.pathname === '/api/admin/invitations') {
      const denied = allow('GET', 'POST'); if (denied) return denied;
      if (method === 'GET') {
        parameters(url, ['page', 'status']);
        const status = url.searchParams.get('status') ?? '';
        if (status && !INVITATION_STATUSES.includes(status)) invalid('Check the invitation status filter.');
        return authJson({ data: await deps.repository.listInvitations({ page: page(url.searchParams), status: status as AdminInvitationStatus | '' }) });
      }
      parameters(url, []);
      const input = validated(validateCreateInvitationRequest(await readJson(request)));
      if (!checkRoleEligibility({ address: input.email, verified: true }, input.roles).eligible) throw new AdminMutationError('ROLE_NOT_ELIGIBLE');
      const existing = await deps.identities.findByEmail(input.email);
      if (existing) throw new AdminMutationError(await deps.auth.access.find(existing.clerkUserId) ? 'ACCOUNT_EXISTS' : 'CLERK_USER_EXISTS');
      const pending = await deps.repository.createInvitation(input.email, input.roles, actor, input.reason, new Date(Date.now() + INVITATION_DAYS * 86_400_000));
      let clerkInvitationId: string;
      try { clerkInvitationId = (await deps.identities.createInvitation(input.email, undefined, INVITATION_DAYS)).clerkInvitationId; }
      catch {
        await deps.repository.revokeInvitation(pending.id, actor, 'Invitation email could not be delivered').catch(() => undefined);
        throw new AdminMutationError('INVITATION_DELIVERY_FAILED');
      }
      try { return authJson({ data: await deps.repository.attachClerkInvitation(pending.id, clerkInvitationId, actor) }, 201); }
      catch (error) {
        await deps.identities.revokeInvitation(clerkInvitationId).catch(() => undefined);
        await deps.repository.revokeInvitation(pending.id, actor, 'Invitation could not be recorded').catch(() => undefined);
        throw error;
      }
    }
    if (invitationDelete) {
      const denied = allow('DELETE'); if (denied) return denied;
      parameters(url, []);
      const id = invitationDelete[1]!;
      if (!UUID.test(id)) badRequest('INVALID_REQUEST', 'Invalid invitation ID.');
      const input = validated(validateRevokeRoleRequest(await readJson(request)));
      const clerkInvitationId = await deps.repository.clerkInvitationIdOf(id);
      const revoked = await deps.repository.revokeInvitation(id, actor, input.reason);
      // The database row is authoritative (redemption requires PENDING), so a provider failure here is not fatal.
      if (clerkInvitationId) await deps.identities.revokeInvitation(clerkInvitationId).catch(() => undefined);
      return authJson({ data: revoked });
    }
    if (url.pathname === '/api/admin/users') {
      const denied = allow('GET', 'POST'); if (denied) return denied;
    }
    const known = url.pathname === '/api/admin/overview' || url.pathname === '/api/admin/audit' || /^\/api\/admin\/users\/[1-9]\d*$/.test(url.pathname) || url.pathname === '/api/admin/users';
    if (known && method !== 'GET') return methodNotAllowed(['GET']);
    if (url.pathname === '/api/admin/overview') {
      parameters(url, []);
      const [overview, recent] = await Promise.all([deps.repository.overview(), deps.repository.audit({ page: 1, kind: 'ALL' }, 5)]);
      // Overview intentionally excludes account identifiers and free-text audit reasons.
      return authJson({ data: { ...overview, recentEvents: recent.items.map(({ eventId, kind, action, role, occurredAt }) => ({ eventId, kind, action, role, occurredAt })) } });
    }
    if (url.pathname === '/api/admin/users') {
      parameters(url, ['page', 'q', 'role', 'status']);
      const q = (url.searchParams.get('q') ?? '').trim();
      const role = url.searchParams.get('role') ?? '';
      const status = url.searchParams.get('status') ?? '';
      if (q.length > 100 || (role && !ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) || (status && status !== 'ACTIVE' && status !== 'SUSPENDED')) invalid('Check the search text, role and access filters.');
      const input = { page: page(url.searchParams), q, role, status } as AdminUsersQuery;
      let matchingIds: string[] = [];
      if (q && !q.startsWith('user_')) {
        try {
          const result = await deps.identities.search(q);
          if (result.total > 100) throw new AuthError(400, 'SEARCH_TOO_BROAD', 'Too many identity matches. Enter a more specific name or email.');
          matchingIds = result.ids;
        } catch (error) {
          if (error instanceof AuthError) throw error;
          throw new AuthError(503, 'IDENTITY_SEARCH_UNAVAILABLE', 'Account name and email search is unavailable. Retry, or search by Clerk account ID.');
        }
      }
      const result = await deps.repository.accounts(input, matchingIds);
      return authJson({ data: { ...result, items: await enrich(result.items, deps) } });
    }
    const match = /^\/api\/admin\/users\/([1-9]\d*)$/.exec(url.pathname);
    if (match) {
      parameters(url, []);
      const result = await deps.repository.account(positive(match[1]!, 'account ID'));
      if (!result) throw new AuthError(404, 'ACCOUNT_NOT_FOUND', 'This application account was not found.');
      return authJson({ data: await detail(result, deps) });
    }
    if (url.pathname === '/api/admin/audit') {
      parameters(url, ['page', 'accountId', 'kind', 'from', 'to']);
      const kind = url.searchParams.get('kind') ?? 'ALL';
      if (!['ALL', 'ROLE', 'ACCESS'].includes(kind)) invalid('Invalid audit type.');
      const from = date(url.searchParams.get('from')), to = date(url.searchParams.get('to'));
      if (from && to && from > to) invalid('Start date must not be after the end date.');
      const accountId = url.searchParams.has('accountId') ? positive(url.searchParams.get('accountId')!, 'account ID') : undefined;
      return authJson({ data: await deps.repository.audit({ page: page(url.searchParams), kind, accountId, from, to } as AdminAuditQuery) });
    }
    throw new AuthError(404, 'ADMIN_ROUTE_NOT_FOUND', 'Administration page not found.');
  } catch (error) {
    if (error instanceof AdminMutationError) return mutationResponse(error);
    if (error instanceof AuthError) return authErrorResponse(error);
    return authJson({ error: { code: 'ADMIN_UNAVAILABLE', message: 'Administration data is unavailable. Please retry.' } }, 503);
  }
}
