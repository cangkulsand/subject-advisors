// Fictional test/preview data only. Never imported by an application entry point.
export const generatedAt = '2026-10-28T10:00:00.000Z';
const accounts = Array.from({ length: 23 }, (_, i) => ({
  accountId: i + 1, clerkUserId: 'user_fictional_' + (i + 1),
  roles: i === 0 ? ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'] : i === 1 ? ['COORDINATOR'] : ['STUDENT'],
  accessStatus: i === 2 ? 'SUSPENDED' : 'ACTIVE', protectedOwner: i === 0,
  createdAt: generatedAt, updatedAt: generatedAt,
  identity: { state: 'available', name: i === 0 ? 'Fictional Administrator' : 'Fictional Account ' + (i + 1), email: 'fixture' + (i + 1) + '@example.invalid', emailVerified: true },
}));
const events = accounts.slice(0, 6).map((account, i) => ({
  eventId: 'role:' + (i + 1), accountId: account.accountId, target: account.clerkUserId,
  actor: 'user_fictional_operator', kind: i === 2 ? 'ACCESS' : 'ROLE',
  action: i === 2 ? 'ACCESS_STATUS_CHANGE' : 'GRANT', role: i === 2 ? null : account.roles[0],
  before: i === 2 ? 'ACTIVE' : null, after: i === 2 ? 'SUSPENDED' : 'ROLE_DOMAIN',
  reason: 'Fictional test event. <script>window.untrustedExecuted=true</script>', occurredAt: generatedAt,
}));
const invitations = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'pending.one@utm.my', roles: ['COORDINATOR'], status: 'PENDING', invitedBy: 'user_fictional_operator', reason: 'Fictional invitation.', createdAt: generatedAt, expiresAt: '2026-11-04T10:00:00.000Z', acceptedAt: null },
  { id: '00000000-0000-4000-8000-000000000002', email: 'pending.two@graduate.utm.my', roles: ['STUDENT'], status: 'PENDING', invitedBy: 'user_fictional_operator', reason: 'Fictional invitation.', createdAt: generatedAt, expiresAt: '2026-11-04T10:00:00.000Z', acceptedAt: null },
  { id: '00000000-0000-4000-8000-000000000003', email: 'accepted@utm.my', roles: ['COORDINATOR'], status: 'ACCEPTED', invitedBy: 'user_fictional_operator', reason: 'Fictional invitation.', createdAt: generatedAt, expiresAt: '2026-11-04T10:00:00.000Z', acceptedAt: generatedAt },
  { id: '00000000-0000-4000-8000-000000000004', email: 'revoked@utm.my', roles: ['SYSTEM_ADMIN'], status: 'REVOKED', invitedBy: 'user_fictional_operator', reason: 'Fictional invitation.', createdAt: generatedAt, expiresAt: '2026-11-04T10:00:00.000Z', acceptedAt: null },
];
/** Per-session mutable copy so one browser check never leaks edits into another. */
function store(state) {
  return state.store ??= { accounts: structuredClone(accounts), invitations: structuredClone(invitations), events: structuredClone(events), nextId: accounts.length + 1 };
}
function membershipsOf(account) {
  return account.memberships ?? account.roles.map(role => ({ role, emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: role === 'SYSTEM_ADMIN' && account.protectedOwner, reason: 'Explicit fictional fixture assignment.', grantedAt: generatedAt }));
}
const detailOf = account => ({ ...account, memberships: membershipsOf(account) });
const failure = (status, code, message) => ({ status, payload: { error: { code, message } } });
const eligible = (email, roles) => roles.every(role => email.endsWith('@example.invalid') ? role !== 'SYSTEM_ADMIN' : role === 'STUDENT' ? email.endsWith('@graduate.utm.my') : email.endsWith('@utm.my') && !email.endsWith('@graduate.utm.my'));
const CLERK_ONLY = { 'clerk.only@utm.my': 'user_clerk_only' };
function paged(items, url) {
  const page = Number(url.searchParams.get('page') || 1);
  return { items: items.slice((page - 1) * 20, page * 20), total: items.length, page, pageSize: 20, generatedAt };
}
export function fixtureResponse(url, state = {}) {
  if (url.pathname === '/api/me') {
    const roles = state.roles ?? ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'];
    const appRole = roles.includes('SYSTEM_ADMIN') ? 'SYSTEM_ADMIN' : roles[0];
    return { clerkUserId: state.clerkUserId ?? 'user_test', appRole, roles, availableRoles: roles, accessStatus: 'ACTIVE', studentProfileState: roles.includes('STUDENT') ? 'SETUP_REQUIRED' : 'NOT_APPLICABLE', profileState: appRole === 'STUDENT' ? 'SETUP_REQUIRED' : 'NOT_APPLICABLE', landingPath: appRole === 'SYSTEM_ADMIN' ? '/admin' : appRole === 'COORDINATOR' ? '/coordinator' : '/student/setup' };
  }
  if (url.pathname === '/api/admin/overview') return {
    generatedAt, accounts: { total: 23, active: 22, suspended: 1 }, roles: { STUDENT: 22, COORDINATOR: 2, SYSTEM_ADMIN: 1 },
    configuration: { programmes: 1, curricula: 1, subjects: 40, semesters: 3 },
    recentEvents: events.slice(0, 5).map(({ eventId, kind, action, role, occurredAt }) => ({ eventId, kind, action, role, occurredAt })),
  };
  if (url.pathname === '/api/admin/users') {
    const q = (url.searchParams.get('q') || '').toLowerCase(), role = url.searchParams.get('role'), status = url.searchParams.get('status');
    const items = state.empty ? [] : store(state).accounts.filter(account => (!role || account.roles.includes(role)) && (!status || account.accessStatus === status) && (!q || (account.identity.name + account.identity.email + account.clerkUserId).toLowerCase().includes(q)));
    const result = paged(items, url);
    if (state.degraded) result.items = result.items.map(item => ({ ...item, identity: { state: 'unavailable', name: null, email: null, emailVerified: false } }));
    return result;
  }
  if (/^\/api\/admin\/users\/\d+$/.test(url.pathname)) {
    const account = store(state).accounts.find(item => item.accountId === Number(url.pathname.split('/').pop()));
    return account ? detailOf(account) : null;
  }
  if (url.pathname === '/api/admin/invitations') {
    const status = url.searchParams.get('status');
    return paged(store(state).invitations.filter(item => !status || item.status === status), url);
  }
  if (url.pathname === '/api/admin/audit') return paged(store(state).events.filter(event => (!url.searchParams.get('accountId') || event.accountId === Number(url.searchParams.get('accountId'))) && (!url.searchParams.get('kind') || url.searchParams.get('kind') === 'ALL' || event.kind === url.searchParams.get('kind')) && (!url.searchParams.get('from') || generatedAt.slice(0, 10) >= url.searchParams.get('from')) && (!url.searchParams.get('to') || generatedAt.slice(0, 10) <= url.searchParams.get('to'))), url);
  return null;
}
/** Mutation endpoints. Returns { status, payload } mirroring the API envelope, or null when the route is unknown. */
export function fixtureMutation(method, url, body, state = {}) {
  const data = store(state), now = new Date().toISOString();
  const audit = (account, action, role, before, after, reason) => data.events.unshift({ eventId: 'mutation:' + data.events.length, accountId: account.accountId, target: account.clerkUserId, actor: 'user_test', kind: action === 'ACCESS_STATUS_CHANGE' ? 'ACCESS' : 'ROLE', action, role, before, after, reason, occurredAt: now });
  if (typeof body?.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500) return failure(400, 'INVALID_REQUEST', 'Reason is required (1-500 characters).');
  const reason = body.reason.trim();
  if (method === 'POST' && url.pathname === '/api/admin/users') {
    const email = String(body.email).trim().toLowerCase();
    if (data.accounts.some(item => item.identity.email === email)) return failure(409, 'ACCOUNT_EXISTS', 'An application account already exists for this user.');
    if (email.startsWith('nobody@')) return failure(404, 'CLERK_USER_NOT_FOUND', 'No matching sign-in account was found.');
    if (!eligible(email, body.roles)) return failure(422, 'ROLE_NOT_ELIGIBLE', 'The verified email address is not eligible for the requested role.');
    const created = { accountId: data.nextId++, clerkUserId: 'user_fictional_new_' + data.nextId, roles: [...body.roles], accessStatus: 'ACTIVE', protectedOwner: false, createdAt: now, updatedAt: now, identity: { state: 'available', name: 'Fictional New Account', email, emailVerified: true } };
    data.accounts.push(created); body.roles.forEach(role => audit(created, 'GRANT', role, null, 'ROLE_DOMAIN', reason));
    return { status: 201, payload: { data: detailOf(created) } };
  }
  if (method === 'POST' && url.pathname === '/api/admin/invitations') {
    const email = String(body.email).trim().toLowerCase();
    if (!eligible(email, body.roles)) return failure(422, 'ROLE_NOT_ELIGIBLE', 'The verified email address is not eligible for the requested role.');
    if (data.accounts.some(item => item.identity.email === email)) return failure(409, 'ACCOUNT_EXISTS', 'An application account already exists for this user.');
    if (CLERK_ONLY[email]) return failure(409, 'CLERK_USER_EXISTS', 'This person already has a sign-in account. Use Add account instead.');
    if (data.invitations.some(item => item.email === email && item.status === 'PENDING')) return failure(409, 'INVITATION_EXISTS', 'A pending invitation already exists for this email address.');
    const invitation = { id: '00000000-0000-4000-8000-0000000001' + String(data.invitations.length).padStart(2, '0'), email, roles: [...body.roles], status: 'PENDING', invitedBy: 'user_test', reason, createdAt: now, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), acceptedAt: null };
    data.invitations.unshift(invitation);
    return { status: 201, payload: { data: invitation } };
  }
  const invitationRoute = /^\/api\/admin\/invitations\/([^/]+)$/.exec(url.pathname);
  if (method === 'DELETE' && invitationRoute) {
    const row = data.invitations.find(item => item.id === invitationRoute[1]);
    if (!row) return failure(404, 'NOT_FOUND', 'The requested account or invitation was not found.');
    if (row.status !== 'PENDING') return failure(409, 'INVITATION_NOT_PENDING', 'The invitation is no longer pending.');
    row.status = 'REVOKED';
    return { status: 200, payload: { data: row } };
  }
  const route = /^\/api\/admin\/users\/(\d+)\/(roles|access)(?:\/([A-Z_]+))?$/.exec(url.pathname);
  if (!route) return null;
  const target = data.accounts.find(item => item.accountId === Number(route[1]));
  if (!target) return failure(404, 'NOT_FOUND', 'The requested account or invitation was not found.');
  target.memberships = membershipsOf(target);
  if (method === 'POST' && route[2] === 'roles') {
    if (target.roles.includes(body.role)) return failure(409, 'ROLE_ALREADY_ASSIGNED', 'The account already holds this role.');
    if (!eligible(target.identity.email, [body.role])) return failure(422, 'ROLE_NOT_ELIGIBLE', 'The verified email address is not eligible for the requested role.');
    target.roles.push(body.role); target.memberships.push({ role: body.role, emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: false, reason, grantedAt: now });
    audit(target, 'GRANT', body.role, null, 'ROLE_DOMAIN', reason);
  } else if (method === 'DELETE' && route[2] === 'roles') {
    if (!target.roles.includes(route[3])) return failure(404, 'ROLE_NOT_ASSIGNED', 'The account does not hold this role.');
    if (target.roles.length === 1) return failure(409, 'LAST_ROLE', 'An account must keep at least one role. Suspend the account instead of removing its last role.');
    target.roles = target.roles.filter(role => role !== route[3]); target.memberships = target.memberships.filter(item => item.role !== route[3]);
    audit(target, 'REVOKE', route[3], 'ROLE_DOMAIN', null, reason);
  } else if (method === 'PATCH' && route[2] === 'access') {
    audit(target, 'ACCESS_STATUS_CHANGE', null, target.accessStatus, body.status, reason); target.accessStatus = body.status;
  } else return null;
  target.updatedAt = now;
  return { status: 200, payload: { data: detailOf(target) } };
}
