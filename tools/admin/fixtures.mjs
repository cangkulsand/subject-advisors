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
function paged(items, url) {
  const page = Number(url.searchParams.get('page') || 1);
  return { items: items.slice((page - 1) * 20, page * 20), total: items.length, page, pageSize: 20, generatedAt };
}
export function fixtureResponse(url, state = {}) {
  if (url.pathname === '/api/me') {
    const roles = state.roles ?? ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'];
    const appRole = roles.includes('SYSTEM_ADMIN') ? 'SYSTEM_ADMIN' : roles[0];
    return { clerkUserId: 'user_test', appRole, roles, availableRoles: roles, accessStatus: 'ACTIVE', studentProfileState: roles.includes('STUDENT') ? 'SETUP_REQUIRED' : 'NOT_APPLICABLE', profileState: appRole === 'STUDENT' ? 'SETUP_REQUIRED' : 'NOT_APPLICABLE', landingPath: appRole === 'SYSTEM_ADMIN' ? '/admin' : appRole === 'COORDINATOR' ? '/coordinator' : '/student/setup' };
  }
  if (url.pathname === '/api/admin/overview') return {
    generatedAt, accounts: { total: 23, active: 22, suspended: 1 }, roles: { STUDENT: 22, COORDINATOR: 2, SYSTEM_ADMIN: 1 },
    configuration: { programmes: 1, curricula: 1, subjects: 40, semesters: 3 },
    recentEvents: events.slice(0, 5).map(({ eventId, kind, action, role, occurredAt }) => ({ eventId, kind, action, role, occurredAt })),
  };
  if (url.pathname === '/api/admin/users') {
    const q = (url.searchParams.get('q') || '').toLowerCase(), role = url.searchParams.get('role'), status = url.searchParams.get('status');
    const items = state.empty ? [] : accounts.filter(account => (!role || account.roles.includes(role)) && (!status || account.accessStatus === status) && (!q || (account.identity.name + account.identity.email + account.clerkUserId).toLowerCase().includes(q)));
    const result = paged(items, url);
    if (state.degraded) result.items = result.items.map(item => ({ ...item, identity: { state: 'unavailable', name: null, email: null, emailVerified: false } }));
    return result;
  }
  if (/^\/api\/admin\/users\/\d+$/.test(url.pathname)) {
    const account = accounts.find(item => item.accountId === Number(url.pathname.split('/').pop()));
    if (!account) return null;
    return { ...account, memberships: account.roles.map(role => ({ role, emailPolicy: 'ROLE_DOMAIN', source: 'OPERATOR', protectedOwner: role === 'SYSTEM_ADMIN', reason: 'Explicit fictional fixture assignment.', grantedAt: generatedAt })) };
  }
  if (url.pathname === '/api/admin/audit') return paged(events.filter(event => (!url.searchParams.get('accountId') || event.accountId === Number(url.searchParams.get('accountId'))) && (!url.searchParams.get('kind') || url.searchParams.get('kind') === 'ALL' || event.kind === url.searchParams.get('kind')) && (!url.searchParams.get('from') || generatedAt.slice(0, 10) >= url.searchParams.get('from')) && (!url.searchParams.get('to') || generatedAt.slice(0, 10) <= url.searchParams.get('to'))), url);
  return null;
}
