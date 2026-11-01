import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../../app/navigation';
import { AdminApiError, type AdminClient } from './client';
import { AddUserDialog, ReasonDialog, roleLabels as labels } from './AdminUserManagement';
import { ADMIN_ROLES } from '../../../../../packages/shared/src/admin/admin';
import type { AdminAccount, AdminAccountDetail, AdminAuditQuery, AdminInvitation, AdminInvitationStatus, AdminPage, AdminRole, AdminUsersQuery } from '../../../../../packages/shared/src/admin/admin';

const invitationLabels: Record<AdminInvitationStatus, string> = { PENDING: 'Pending', ACCEPTED: 'Accepted', REVOKED: 'Revoked', EXPIRED: 'Expired' };
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
function InviteIcon() { return <svg className="admin-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>; }
export function AdminUsersPage({ client, search }: { client: AdminClient; search: string }) {
  const parameters = new URLSearchParams(search);
  const [filters, setFilters] = useState<AdminUsersQuery>({ page: 1, q: '', role: ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'].includes(parameters.get('role') ?? '') ? parameters.get('role') as AdminRole : '', status: ['ACTIVE', 'SUSPENDED'].includes(parameters.get('status') ?? '') ? parameters.get('status') as 'ACTIVE' | 'SUSPENDED' : '' });
  const [invited, setInvited] = useState(false), [invitationFilter, setInvitationFilter] = useState<{ page: number; status: AdminInvitationStatus | '' }>({ page: 1, status: 'PENDING' });
  const [term, setTerm] = useState('');
  const [changes, setChanges] = useState(0), [notice, setNotice] = useState<{ text: string; accountId?: number }>(), [adding, setAdding] = useState(false), [target, setTarget] = useState<AdminInvitation>();
  const showInvitations = invited || !filters.status, invitationQuery = invited ? invitationFilter : { page: 1, status: 'PENDING' as const };
  const accounts = useRead(signal => invited ? Promise.resolve(null) : client.users(filters, signal), 'users:' + changes + ':' + invited + ':' + JSON.stringify(filters));
  const invitations = useRead(signal => showInvitations ? client.listInvitations(invitationQuery, signal) : Promise.resolve(null), 'invitations:' + changes + ':' + showInvitations + ':' + JSON.stringify(invitationQuery));
  const retry = () => { accounts.retry(); invitations.retry(); };
  const needle = filters.q.toLowerCase();
  const invitationRows = (invitations.data?.items ?? []).filter(item => (!needle || item.email.toLowerCase().includes(needle)) && (!filters.role || item.roles.includes(filters.role)));
  const accountRows = accounts.data?.items ?? [], loaded = accounts.data !== undefined && invitations.data !== undefined;
  const reset = () => { setTerm(''); setInvited(false); setInvitationFilter({ page: 1, status: 'PENDING' }); setFilters({ page: 1, q: '', role: '', status: '' }); retry(); };
  return <><PageHeading title="Users & Access" text="Find application accounts, add users, and manage invitations." refresh={retry}/>
    <div id="admin-action-status" tabIndex={-1} className="admin-status-region">{notice && <p className="admin-success" role="status">{notice.text} {notice.accountId && <AppLink href={'/admin/users/' + notice.accountId}>View account →</AppLink>}</p>}</div>
    <section className="admin-card admin-users-card" aria-labelledby="admin-users-title">
      <div className="admin-card-title"><div><h2 id="admin-users-title">Users and invitations</h2><p className="admin-muted">Invitations are valid for 7 days. Roles apply only if the verified email still qualifies at first sign-in.</p></div>
        <button type="button" className="admin-primary admin-icon-button" aria-haspopup="dialog" onClick={() => setAdding(true)}><InviteIcon/>Add user</button></div>
      <form className="admin-filters" onSubmit={event => { event.preventDefault(); setFilters(old => ({ ...old, page: 1, q: term.trim() })); setInvitationFilter(old => ({ ...old, page: 1 })); }}>
        <label className="admin-search-field">Search users<input type="search" maxLength={100} value={term} onChange={event => setTerm(event.target.value)} placeholder="Name, email or Clerk account ID"/></label>
        <label>Role<select aria-label="Role" value={filters.role} onChange={event => { setFilters(old => ({ ...old, role: event.target.value as AdminUsersQuery['role'], page: 1 })); setInvitationFilter(old => ({ ...old, page: 1 })); }}><option value="">All roles</option>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Access<select aria-label="Access" value={invited ? 'INVITED' : filters.status} onChange={event => { const value = event.target.value; setInvited(value === 'INVITED'); setFilters(old => ({ ...old, status: value === 'INVITED' ? '' : value as AdminUsersQuery['status'], page: 1 })); setInvitationFilter({ page: 1, status: 'PENDING' }); }}><option value="">All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="INVITED">Invited</option></select></label>
        {invited && <label>Invitation status<select aria-label="Invitation status" value={invitationFilter.status} onChange={event => setInvitationFilter({ page: 1, status: event.target.value as AdminInvitationStatus | '' })}><option value="">All</option>{Object.entries(invitationLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>}
        <button className="admin-primary" type="submit">Search</button>
      </form>
      <Panel error={accounts.error ?? invitations.error} retry={retry}>{loaded && <>
        {accountRows.some(item => item.identity.state !== 'available') && <p className="admin-notice" role="status">Some Clerk identity details are unavailable. Application roles and access status are shown below.</p>}
        {!invitationRows.length && !accountRows.length ? <div className="admin-empty"><h2>No accounts found</h2><p>Try a different search or reset your filters.</p><button type="button" onClick={reset}>Reset filters</button></div> : <div className="admin-table-scroll" role="region" aria-label="Users and invitations table" tabIndex={0}><table><thead><tr><th>Account</th><th>Roles</th><th>Status</th><th>Updated</th><th><span className="admin-sr-only">Actions</span></th></tr></thead>
          {!!invitationRows.length && <tbody><tr className="admin-group-row"><th colSpan={5} scope="colgroup">Invitations ({invitationRows.length})</th></tr>{invitationRows.map(item => <tr key={item.id}>
            <td className="admin-wrap"><div className="admin-identity"><strong>{item.email}</strong><span className="admin-pill admin-invite-tag">Invitation</span></div></td><td><RolePills roles={item.roles}/></td><td><span className={`admin-pill admin-invite-${item.status.toLowerCase()}`}>{invitationLabels[item.status]}</span></td>
            <td className="admin-invite-dates"><span>Invited <time dateTime={item.createdAt}>{when(item.createdAt)}</time></span><span>Expires <time dateTime={item.expiresAt}>{when(item.expiresAt)}</time></span></td>
            <td>{item.status === 'PENDING' && <button type="button" className="admin-row-action" onClick={() => setTarget(item)}>Revoke<span className="admin-sr-only"> invitation for {item.email}</span></button>}</td>
          </tr>)}</tbody>}
          {!!accountRows.length && <tbody><tr className="admin-group-row"><th colSpan={5} scope="colgroup">Accounts ({accounts.data?.total ?? accountRows.length})</th></tr>{accountRows.map(account => <tr key={account.accountId}>
            <td><Identity account={account}/>{account.protectedOwner && <span className="admin-pill admin-owner">Protected owner</span>}</td><td><RolePills roles={account.roles}/></td><td><AccessPill status={account.accessStatus}/></td><td><time dateTime={account.updatedAt}>{when(account.updatedAt)}</time></td><td><AppLink className="admin-detail-link" href={'/admin/users/' + account.accountId}>View details<span className="admin-sr-only"> for {account.identity.name ?? account.clerkUserId}</span> →</AppLink></td>
          </tr>)}</tbody>}
        </table></div>}
        {invited && invitations.data && invitations.data.total > invitations.data.pageSize && <Pager result={invitations.data} onPage={page => setInvitationFilter(old => ({ ...old, page }))}/>}
        {accounts.data && <><Pager result={accounts.data} onPage={page => setFilters(old => ({ ...old, page }))}/><p className="admin-snapshot">Retrieved {when(accounts.data.generatedAt)}</p></>}
      </>}</Panel>
    </section>
    {adding && <AddUserDialog client={client} onClose={() => setAdding(false)} onAdded={done => { setAdding(false); setNotice(done); setChanges(value => value + 1); }}/>}
    {target && <ReasonDialog title="Revoke invitation" confirmLabel="Revoke invitation" danger onCancel={() => setTarget(undefined)}
      description={<p>The invitation for <strong>{target.email}</strong> will stop working. You can send a new invitation later.</p>}
      onSubmit={async reason => { await client.revokeInvitation(target.id, { reason }); setTarget(undefined); setNotice({ text: `Invitation for ${target.email} revoked.` }); setChanges(value => value + 1); }}/>}
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
type PendingAction = { kind: 'revoke'; role: AdminRole } | { kind: 'grant'; role: AdminRole } | { kind: 'access'; status: 'ACTIVE' | 'SUSPENDED' };
function dialogCopy(pending: PendingAction) {
  if (pending.kind === 'revoke') return { title: `Remove ${labels[pending.role]} role`, confirm: 'Remove role', danger: true, text: `This account loses the ${labels[pending.role]} role immediately. An account must keep at least one role.` };
  if (pending.kind === 'grant') return { title: `Add ${labels[pending.role]} role`, confirm: 'Add role', danger: false, text: 'The role is added only if the verified email address of the account is eligible for it.' };
  return pending.status === 'SUSPENDED'
    ? { title: 'Suspend account', confirm: 'Suspend account', danger: true, text: 'The account holder is blocked from using the application until access is reactivated. Roles are kept.' }
    : { title: 'Reactivate account', confirm: 'Reactivate account', danger: false, text: 'The account holder can use the application again with their existing roles.' };
}
export function AdminAccountPage({ client, accountId, viewerClerkUserId }: { client: AdminClient; accountId: number; viewerClerkUserId?: string | null }) {
  const result = useRead(signal => client.account(accountId, signal), 'account:' + accountId);
  const [updated, setUpdated] = useState<AdminAccountDetail>();
  const [pending, setPending] = useState<PendingAction>();
  const [notice, setNotice] = useState(''), [auditVersion, setAuditVersion] = useState(0), [grant, setGrant] = useState('');
  const account = updated ?? result.data;
  const self = !!account && !!viewerClerkUserId && account.clerkUserId === viewerClerkUserId;
  const missing = account ? ADMIN_ROLES.filter(role => !account.roles.includes(role)) : [];
  const copy = pending ? dialogCopy(pending) : undefined;
  async function confirm(reason: string) {
    if (!pending) return;
    const done = (detail: AdminAccountDetail, text: string) => { setUpdated(detail); setPending(undefined); setNotice(text); setAuditVersion(value => value + 1); setGrant(''); };
    if (pending.kind === 'revoke') done(await client.revokeRole(accountId, pending.role, { reason }), `${labels[pending.role]} role removed.`);
    else if (pending.kind === 'grant') done(await client.grantRole(accountId, { role: pending.role, reason }), `${labels[pending.role]} role added.`);
    else done(await client.setAccess(accountId, { status: pending.status, reason }), pending.status === 'SUSPENDED' ? 'Account suspended.' : 'Account reactivated.');
  }
  return <><AppLink className="admin-back" href="/admin/users">← All accounts</AppLink><PageHeading title="Account details" text="Identity, assigned memberships and recorded access changes." refresh={() => { setUpdated(undefined); result.retry(); }}/>
    <div id="admin-action-status" tabIndex={-1} className="admin-status-region">{notice && <p className="admin-success" role="status">{notice}</p>}</div>
    <Panel error={result.error} retry={result.retry}>{account && <>
      <section className="admin-card"><div className="admin-account-heading"><span className="admin-account-avatar" aria-hidden="true">{(account.identity.name ?? 'A').slice(0, 1).toUpperCase()}</span><Identity account={account}/><AccessPill status={account.accessStatus}/>{account.protectedOwner && <span className="admin-pill admin-owner">Protected owner</span>}</div>
        <dl className="admin-account-facts"><div><dt>Primary email</dt><dd>{account.identity.email ?? 'Unavailable'}</dd></div><div><dt>Email verification</dt><dd>{account.identity.state !== 'available' ? 'Unavailable' : account.identity.emailVerified ? 'Verified' : 'Not verified'}</dd></div><div><dt>Application account created</dt><dd>{when(account.createdAt)}</dd></div><div><dt>Last access update</dt><dd>{when(account.updatedAt)}</dd></div></dl>
      </section>
      <section className="admin-card"><h2>Role memberships</h2>{!account.memberships.length ? <p>No explicit memberships are assigned.</p> : <div className="admin-memberships">{account.memberships.map(membership => <article key={membership.role}><RolePills roles={[membership.role]}/><dl><div><dt>Assigned</dt><dd>{when(membership.grantedAt)}</dd></div><div><dt>Source</dt><dd>{({ MIGRATION_COMPAT: 'Legacy role migration', LEGACY_INIT: 'Student registration', OPERATOR: 'Trusted operator' } as Record<string, string>)[membership.source] ?? membership.source}</dd></div><div><dt>Email policy</dt><dd>{membership.emailPolicy === 'OWNER_STUDENT_COORDINATOR' ? 'Protected owner exception' : 'Role eligibility policy'}</dd></div><div><dt>Reason</dt><dd>{membership.reason}</dd></div></dl>{membership.protectedOwner && <span className="admin-pill admin-owner">Protected owner</span>}
          {membership.protectedOwner ? <p className="admin-locked">Locked. The protected owner role cannot be changed.</p> : self && membership.role === 'SYSTEM_ADMIN' ? <p className="admin-locked">You cannot remove your own System Admin role.</p> : <button type="button" className="admin-row-action admin-danger-outline" onClick={() => setPending({ kind: 'revoke', role: membership.role })}>Remove role<span className="admin-sr-only"> {labels[membership.role]}</span></button>}
        </article>)}</div>}
        {missing.length ? <form className="admin-add-role" onSubmit={event => { event.preventDefault(); if (grant) setPending({ kind: 'grant', role: grant as AdminRole }); }}>
          <label>Role to add<select aria-label="Role to add" value={grant} onChange={event => setGrant(event.target.value)}><option value="">Choose a role</option>{missing.map(role => <option value={role} key={role}>{labels[role]}</option>)}</select></label>
          <button type="submit" disabled={!grant}>Add role</button></form> : <p className="admin-muted">This account already holds every role.</p>}
      </section>
      <section className="admin-card admin-access-card"><h2>Account access</h2>
        <p className="admin-muted">Suspending blocks the application without deleting the account or its roles. Accounts are never deleted.</p>
        {account.protectedOwner ? <p className="admin-locked">Locked. The protected owner account cannot be suspended.</p>
          : account.accessStatus === 'SUSPENDED' ? <button type="button" className="admin-primary" onClick={() => setPending({ kind: 'access', status: 'ACTIVE' })}>Reactivate account</button>
          : self ? <p className="admin-locked">You cannot suspend your own account.</p>
          : <button type="button" className="admin-danger-outline" onClick={() => setPending({ kind: 'access', status: 'SUSPENDED' })}>Suspend account</button>}
      </section>
      <AdminAuditView key={auditVersion} client={client} accountId={accountId}/>
    </>}</Panel>
    {pending && copy && <ReasonDialog title={copy.title} confirmLabel={copy.confirm} danger={copy.danger} description={<p>{copy.text}</p>} onCancel={() => setPending(undefined)} onSubmit={confirm}/>}
  </>;
}
export function AdminAuditPage({ client }: { client: AdminClient }) { return <><PageHeading title="Audit Log" text="Read-only history of application role and access changes."/><AdminAuditView client={client}/></>; }
