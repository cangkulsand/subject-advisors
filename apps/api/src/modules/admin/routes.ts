import { authorize, AuthError, authErrorResponse, authJson } from '../auth';
import { ADMIN_ROLES } from '../../../../../packages/shared/src/admin/admin';
import type { AdminIdentity, AdminUsersQuery, AdminAuditQuery } from '../../../../../packages/shared/src/admin/admin';
import type { AccountRow, AdminDependencies } from './contracts';

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

export async function handleAdminRequest(request: Request, deps: AdminDependencies): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/admin' && !url.pathname.startsWith('/api/admin/')) return null;
  try {
    await authorize(request, deps.auth, { roles: ['SYSTEM_ADMIN'] });
    if (request.method !== 'GET') {
      const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Administration is read-only in this release.' } }, 405);
      response.headers.set('Allow', 'GET'); return response;
    }
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
      const [account] = await enrich([result], deps);
      return authJson({ data: { ...account, memberships: result.memberships } });
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
    if (error instanceof AuthError) return authErrorResponse(error);
    return authJson({ error: { code: 'ADMIN_UNAVAILABLE', message: 'Administration data is unavailable. Please retry.' } }, 503);
  }
}
