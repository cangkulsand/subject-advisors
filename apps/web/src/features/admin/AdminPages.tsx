import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../../app/navigation';
import { AdminApiError, type AdminClient } from './client';
import type { AdminAccount, AdminAuditQuery, AdminPage, AdminRole, AdminUsersQuery } from '../../../../../packages/shared/src/admin/admin';

const labels: Record<AdminRole, string> = { STUDENT: 'Student', COORDINATOR: 'Coordinator', SYSTEM_ADMIN: 'System Admin' };
function when(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
function useRead<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const latest = useRef(load); latest.current = load;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: '' });
  useEffect(() => {
    const controller = new AbortController(); setState({ key });
    latest.current(controller.signal).then(data => { if (!controller.signal.aborted) setState({ key, data }); }, error => {
      if (!controller.signal.aborted) setState({ key, error: error instanceof AdminApiError ? error.message : 'Administration data could not be loaded. Please retry.' });
    });
    return () => controller.abort();
  }, [key, attempt]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, retry: () => setAttempt(value => value + 1) };
}
function Panel({ error, retry, children }: { error?: string; retry: () => void; children?: ReactNode }) {
  if (error) return <section className="admin-card admin-error"><p role="alert">{error}</p><button type="button" onClick={retry}>Retry</button></section>;
  if (!children) return <section className="admin-card admin-loading" role="status">Loading administration data…</section>;
  return <>{children}</>;
}
function PageHeading({ title, text, refresh }: { title: string; text: string; refresh?: () => void }) {
  return <header className="admin-page-heading"><div><p className="admin-eyebrow">ADMIN WORKSPACE</p><h1>{title}</h1><p>{text}</p></div>{refresh && <button type="button" className="admin-secondary" onClick={refresh}>Refresh data</button>}</header>;
}
export function RolePills({ roles }: { roles: AdminRole[] }) { return <span className="admin-pills">{roles.length ? roles.map(role => <span className={`admin-pill admin-role-${role.toLowerCase()}`} key={role}>{labels[role]}</span>) : <span className="admin-pill">No memberships</span>}</span>; }
function AccessPill({ status }: { status: AdminAccount['accessStatus'] }) { return <span className={`admin-pill admin-status-${status.toLowerCase()}`}>{status === 'ACTIVE' ? 'Active' : 'Suspended'}</span>; }
function Identity({ account }: { account: AdminAccount }) {
  const value = account.identity;
  return <div className="admin-identity"><strong>{value.state === 'available' ? value.name ?? value.email ?? 'Unnamed account' : value.state === 'not_found' ? 'Clerk identity not found' : 'Identity unavailable'}</strong>
    {value.email && <span>{value.email}</span>}<code>{account.clerkUserId}</code></div>;
}
function Pager({ result, onPage }: { result: AdminPage<unknown>; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <div className="admin-pagination"><span>{result.total} {result.total === 1 ? 'result' : 'results'} · Page {result.page} of {pages}</span><div><button type="button" disabled={result.page <= 1} onClick={() => onPage(result.page - 1)}>Previous</button><button type="button" disabled={result.page >= pages} onClick={() => onPage(result.page + 1)}>Next</button></div></div>;
}
function eventLabel(event: { action: string; role: AdminRole | null; kind: string }) {
  const action = ({ GRANT: 'Role granted', REVOKE: 'Role revoked', POLICY_CHANGE: 'Role policy changed', PROTECT_OWNER: 'Owner protected', ACCESS_STATUS_CHANGE: 'Access status changed', ROLE_CHANGE: 'Legacy role changed' } as Record<string, string>)[event.action] ?? event.action.replaceAll('_', ' ').toLowerCase();
  return event.role ? `${action} · ${labels[event.role]}` : action;
}
export function AdminOverviewPage({ client }: { client: AdminClient }) {
  const result = useRead(signal => client.overview(signal), 'overview');
  const data = result.data;
  return <><PageHeading title="Overview" text="Account access, role distribution and academic setup at a glance." refresh={result.retry}/>
    <Panel error={result.error} retry={result.retry}>{data && <>
      <p className="admin-snapshot">Snapshot calculated {when(data.generatedAt)}</p>
      <div className="admin-metrics">{[{ label: 'Total accounts', value: data.accounts.total, href: '/admin/users' }, { label: 'Active accounts', value: data.accounts.active, href: '/admin/users?status=ACTIVE' }, { label: 'Suspended accounts', value: data.accounts.suspended, href: '/admin/users?status=SUSPENDED' }].map(item => <AppLink className="admin-card admin-metric" href={item.href} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>View accounts <span aria-hidden="true">↗</span></small></AppLink>)}</div>
      <div className="admin-two-columns">
        <section className="admin-card"><div className="admin-card-title"><h2>Assigned roles</h2><span className="admin-small-label">MEMBERSHIPS</span></div><p className="admin-muted">An account can have more than one role.</p><div className="admin-role-counts">{Object.entries(data.roles).map(([role, count]) => <AppLink href={'/admin/users?role=' + role} key={role}><RolePills roles={[role as AdminRole]}/><strong>{count}</strong><span aria-hidden="true">→</span></AppLink>)}</div></section>
        <section className="admin-card"><h2>Academic setup</h2><p className="admin-muted">Configured reference data available to academic features.</p><dl className="admin-readiness">{Object.entries(data.configuration).map(([name, count]) => <div key={name}><dt>{name.charAt(0).toUpperCase() + name.slice(1)}</dt><dd><strong>{count}</strong><span className={`admin-pill ${count ? 'admin-ready' : 'admin-missing'}`}>{count ? 'Configured' : 'Setup needed'}</span></dd></div>)}</dl></section>
      </div>
      <section className="admin-card"><div className="admin-card-title"><div><h2>Recent access activity</h2><p className="admin-muted">Role and access events, without account details.</p></div><AppLink href="/admin/audit">View audit log →</AppLink></div>
        {!data.recentEvents.length ? <p className="admin-empty">No access changes recorded.</p> : <ul className="admin-activity">{data.recentEvents.map(event => <li key={event.eventId}><span className="admin-activity-dot" aria-hidden="true"/><span>{eventLabel(event)}</span><time dateTime={event.occurredAt}>{when(event.occurredAt)}</time></li>)}</ul>}
      </section>
    </>}</Panel></>;
}
export function AdminUsersPage({ client, search }: { client: AdminClient; search: string }) {
  const parameters = new URLSearchParams(search);
  const [filters, setFilters] = useState<AdminUsersQuery>({ page: 1, q: '', role: ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'].includes(parameters.get('role') ?? '') ? parameters.get('role') as AdminRole : '', status: ['ACTIVE', 'SUSPENDED'].includes(parameters.get('status') ?? '') ? parameters.get('status') as 'ACTIVE' | 'SUSPENDED' : '' });
  const [term, setTerm] = useState('');
  const result = useRead(signal => client.users(filters, signal), 'users:' + JSON.stringify(filters));
  return <><PageHeading title="Users & Access" text="Find application accounts and review their assigned roles and access status." refresh={result.retry}/>
    <section className="admin-card admin-users-card">
      <form className="admin-filters" onSubmit={event => { event.preventDefault(); setFilters(old => ({ ...old, page: 1, q: term.trim() })); }}>
        <label className="admin-search-field">Search accounts<input type="search" maxLength={100} value={term} onChange={event => setTerm(event.target.value)} placeholder="Name, email or Clerk account ID"/></label>
        <label>Role<select aria-label="Role" value={filters.role} onChange={event => setFilters(old => ({ ...old, role: event.target.value as AdminUsersQuery['role'], page: 1 }))}><option value="">All roles</option>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Access<select aria-label="Access" value={filters.status} onChange={event => setFilters(old => ({ ...old, status: event.target.value as AdminUsersQuery['status'], page: 1 }))}><option value="">All access states</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
        <button className="admin-primary" type="submit">Search</button>
      </form>
      <Panel error={result.error} retry={result.retry}>{result.data && <>
        {result.data.items.some(item => item.identity.state !== 'available') && <p className="admin-notice" role="status">Some Clerk identity details are unavailable. Application roles and access status are shown below.</p>}
        {!result.data.items.length ? <div className="admin-empty"><h2>No accounts found</h2><p>Try a different search or reset your filters.</p><button type="button" onClick={() => { setTerm(''); setFilters({ page: 1, q: '', role: '', status: '' }); result.retry(); }}>Reset filters</button></div> : <div className="admin-table-scroll" role="region" aria-label="Application accounts table" tabIndex={0}><table><thead><tr><th>Account</th><th>Roles</th><th>Access</th><th>Updated</th><th><span className="admin-sr-only">Details</span></th></tr></thead><tbody>{result.data.items.map(account => <tr key={account.accountId}>
          <td><Identity account={account}/>{account.protectedOwner && <span className="admin-pill admin-owner">Protected owner</span>}</td><td><RolePills roles={account.roles}/></td><td><AccessPill status={account.accessStatus}/></td><td><time dateTime={account.updatedAt}>{when(account.updatedAt)}</time></td><td><AppLink className="admin-detail-link" href={'/admin/users/' + account.accountId}>View details<span className="admin-sr-only"> for {account.identity.name ?? account.clerkUserId}</span> →</AppLink></td>
        </tr>)}</tbody></table></div>}
        <Pager result={result.data} onPage={page => setFilters(old => ({ ...old, page }))}/><p className="admin-snapshot">Retrieved {when(result.data.generatedAt)}</p>
      </>}</Panel>
    </section>
  </>;
}
export function AdminAuditView({ client, accountId }: { client: AdminClient; accountId?: number }) {
  const [filters, setFilters] = useState<AdminAuditQuery>({ page: 1, accountId, kind: 'ALL' });
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const result = useRead(signal => client.audit(filters, signal), 'audit:' + JSON.stringify(filters));
  return <section className="admin-card">
    <h2>{accountId ? 'Account access history' : 'Access change history'}</h2>
    <p className="admin-muted">Date filters use UTC. Event times are shown in your local time.</p>
    <form className="admin-filters admin-audit-filters" onSubmit={event => { event.preventDefault(); setFilters(old => ({ ...old, from: from || undefined, to: to || undefined, page: 1 })); }}>
      <label>Event type<select aria-label="Event type" value={filters.kind} onChange={event => setFilters(old => ({ ...old, kind: event.target.value as AdminAuditQuery['kind'], page: 1 }))}><option value="ALL">All changes</option><option value="ROLE">Role changes</option><option value="ACCESS">Account access</option></select></label>
      <label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>To<input type="date" min={from || undefined} value={to} onChange={event => setTo(event.target.value)}/></label><button type="submit" className="admin-primary">Apply filters</button>
    </form>
    <Panel error={result.error} retry={result.retry}>{result.data && <>
      {!result.data.items.length ? <p className="admin-empty">No access changes match these filters.</p> : <div className="admin-table-scroll" role="region" aria-label="Access audit table" tabIndex={0}><table><thead><tr><th>When</th><th>Change</th>{!accountId && <th>Account</th>}<th>Administrator / actor</th><th>Previous → New</th><th>Reason</th></tr></thead><tbody>{result.data.items.map(event => <tr key={event.eventId}>
        <td><time dateTime={event.occurredAt}>{when(event.occurredAt)}</time></td><td>{eventLabel(event)}</td>{!accountId && <td><AppLink href={'/admin/users/' + event.accountId}>Account #{event.accountId}</AppLink><code className="admin-audit-id">{event.target}</code></td>}<td className="admin-actor">{event.actor === '__MIGRATION_0004__' ? 'System migration' : event.actor}</td><td>{event.before ?? '—'} → {event.after ?? '—'}</td><td className="admin-reason">{event.reason ?? '—'}</td>
      </tr>)}</tbody></table></div>}
      <Pager result={result.data} onPage={page => setFilters(old => ({ ...old, page }))}/>
    </>}</Panel>
  </section>;
}
export function AdminAccountPage({ client, accountId }: { client: AdminClient; accountId: number }) {
  const result = useRead(signal => client.account(accountId, signal), 'account:' + accountId);
  const account = result.data;
  return <><AppLink className="admin-back" href="/admin/users">← All accounts</AppLink><PageHeading title="Account details" text="Identity, assigned memberships and recorded access changes." refresh={result.retry}/>
    <Panel error={result.error} retry={result.retry}>{account && <>
      <section className="admin-card"><div className="admin-account-heading"><span className="admin-account-avatar" aria-hidden="true">{(account.identity.name ?? 'A').slice(0, 1).toUpperCase()}</span><Identity account={account}/><AccessPill status={account.accessStatus}/>{account.protectedOwner && <span className="admin-pill admin-owner">Protected owner</span>}</div>
        <dl className="admin-account-facts"><div><dt>Primary email</dt><dd>{account.identity.email ?? 'Unavailable'}</dd></div><div><dt>Email verification</dt><dd>{account.identity.state !== 'available' ? 'Unavailable' : account.identity.emailVerified ? 'Verified' : 'Not verified'}</dd></div><div><dt>Application account created</dt><dd>{when(account.createdAt)}</dd></div><div><dt>Last access update</dt><dd>{when(account.updatedAt)}</dd></div></dl>
      </section>
      <section className="admin-card"><h2>Role memberships</h2>{!account.memberships.length ? <p>No explicit memberships are assigned.</p> : <div className="admin-memberships">{account.memberships.map(membership => <article key={membership.role}><RolePills roles={[membership.role]}/><dl><div><dt>Assigned</dt><dd>{when(membership.grantedAt)}</dd></div><div><dt>Source</dt><dd>{({ MIGRATION_COMPAT: 'Legacy role migration', LEGACY_INIT: 'Student registration', OPERATOR: 'Trusted operator' } as Record<string, string>)[membership.source] ?? membership.source}</dd></div><div><dt>Email policy</dt><dd>{membership.emailPolicy === 'OWNER_STUDENT_COORDINATOR' ? 'Protected owner exception' : 'Role eligibility policy'}</dd></div><div><dt>Reason</dt><dd>{membership.reason}</dd></div></dl>{membership.protectedOwner && <span className="admin-pill admin-owner">Protected owner</span>}</article>)}</div>}</section>
      <AdminAuditView client={client} accountId={accountId}/>
    </>}</Panel>
  </>;
}
export function AdminAuditPage({ client }: { client: AdminClient }) { return <><PageHeading title="Audit Log" text="Read-only history of application role and access changes."/><AdminAuditView client={client}/></>; }
