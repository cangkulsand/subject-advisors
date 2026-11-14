import { accountSessionStamp, clearAccountCache } from '../auth/account-cache';
import type { AdminAccount, AdminAccountDetail, AdminChangeProgrammeRequest, AdminCurriculumOption, AdminProgrammeChange, AdminStudentProgramme, AdminAuditEvent, AdminAuditQuery, AdminChangeAccessRequest, AdminCreateAccountRequest, AdminCreateInvitationRequest, AdminGrantRoleRequest, AdminIdentity, AdminInvitation, AdminInvitationStatus, AdminOverview, AdminPage, AdminRevokeRoleRequest, AdminRole, AdminUsersQuery } from '../../../../../packages/shared/src/admin/admin';
import { ADMIN_ROLES } from '../../../../../packages/shared/src/admin/admin';
export class AdminApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid administration response');
  return value as Record<string, unknown>;
}
function text(value: unknown) { if (typeof value !== 'string') throw new Error('Invalid administration response'); return value; }
function count(value: unknown) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid administration response'); return value; }
function role(value: unknown) { if (!ADMIN_ROLES.includes(value as typeof ADMIN_ROLES[number])) throw new Error('Invalid administration response'); }
function identity(value: unknown): AdminIdentity {
  const item = object(value);
  if (!['available', 'not_found', 'unavailable'].includes(String(item.state)) || typeof item.emailVerified !== 'boolean' ||
      (item.name !== null && typeof item.name !== 'string') || (item.email !== null && typeof item.email !== 'string')) throw new Error('Invalid administration response');
  return item as unknown as AdminIdentity;
}
function account(value: unknown): AdminAccount {
  const item = object(value);
  if (!count(item.accountId) || !Array.isArray(item.roles) || typeof item.protectedOwner !== 'boolean' || !['ACTIVE', 'SUSPENDED'].includes(String(item.accessStatus))) throw new Error('Invalid administration response');
  item.roles.forEach(role); text(item.clerkUserId); text(item.createdAt); text(item.updatedAt); identity(item.identity);
  return item as unknown as AdminAccount;
}
function audit(value: unknown): AdminAuditEvent {
  const item = object(value);
  text(item.eventId); count(item.accountId); text(item.actor); text(item.target); text(item.action); text(item.occurredAt);
  if (item.role !== null) role(item.role);
  if (!['ROLE', 'ACCESS'].includes(String(item.kind))) throw new Error('Invalid administration response');
  for (const key of ['before', 'after', 'reason']) if (item[key] !== null) text(item[key]);
  return item as unknown as AdminAuditEvent;
}
function paged<T>(value: unknown, read: (item: unknown) => T): AdminPage<T> {
  const data = object(value); if (!Array.isArray(data.items) || !count(data.page) || !count(data.pageSize)) throw new Error('Invalid administration response');
  count(data.total); text(data.generatedAt); data.items.forEach(read);
  return data as unknown as AdminPage<T>;
}
function overview(value: unknown): AdminOverview {
  const data = object(value); text(data.generatedAt);
  for (const item of Object.values(object(data.accounts))) count(item);
  for (const key of ['total', 'active', 'suspended']) count(object(data.accounts)[key]);
  for (const key of ADMIN_ROLES) count(object(data.roles)[key]);
  for (const key of ['programmes', 'curricula', 'subjects', 'semesters']) count(object(data.configuration)[key]);
  if (!Array.isArray(data.recentEvents)) throw new Error('Invalid administration response');
  for (const event of data.recentEvents) { const row = object(event); text(row.eventId); text(row.action); text(row.occurredAt); if (!['ROLE', 'ACCESS'].includes(String(row.kind))) throw new Error('Invalid administration response'); if (row.role !== null) role(row.role); }
  return data as unknown as AdminOverview;
}
function detail(value: unknown): AdminAccountDetail {
  account(value); const data = object(value);
  if (!Array.isArray(data.memberships)) throw new Error('Invalid administration response');
  for (const membership of data.memberships) { const item = object(membership); role(item.role); text(item.emailPolicy); text(item.source); text(item.reason); text(item.grantedAt); if (typeof item.protectedOwner !== 'boolean') throw new Error('Invalid administration response'); }
  return data as unknown as AdminAccountDetail;
}
function invitation(value: unknown): AdminInvitation {
  const item = object(value);
  text(item.id); text(item.email); text(item.invitedBy); text(item.reason); text(item.createdAt); text(item.expiresAt);
  if (!Array.isArray(item.roles) || !['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'].includes(String(item.status))) throw new Error('Invalid administration response');
  item.roles.forEach(role);
  if (item.acceptedAt !== null) text(item.acceptedAt);
  return item as unknown as AdminInvitation;
}
function id(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid administration response'); return value; }
function curriculumOption(value: unknown): AdminCurriculumOption {
  const item = object(value); id(item.curriculumId); id(item.programmeId); text(item.curriculumVersion); text(item.programmeCode); text(item.programmeName);
  return item as unknown as AdminCurriculumOption;
}
function studentProgramme(value: unknown): AdminStudentProgramme | null {
  if (value === null) return null;
  const item = object(value); id(item.studentId); text(item.studentName); if (item.matricNo !== null) text(item.matricNo);
  curriculumOption(value);
  return item as unknown as AdminStudentProgramme;
}
function programmeChange(value: unknown): AdminProgrammeChange {
  const item = object(value); const programme = studentProgramme(item.programme);
  if (!programme || typeof item.removedPicks !== 'number' || !Number.isSafeInteger(item.removedPicks) || item.removedPicks < 0) throw new Error('Invalid administration response');
  return item as unknown as AdminProgrammeChange;
}
function query(values: object) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') parameters.set(key, String(value));
  return '?' + parameters.toString();
}
export interface AdminInvitationsQuery { page: number; status: AdminInvitationStatus | '' }
export interface AdminClient {
  overview(signal?: AbortSignal): Promise<AdminOverview>;
  users(filters: AdminUsersQuery, signal?: AbortSignal): Promise<AdminPage<AdminAccount>>;
  account(id: number, signal?: AbortSignal): Promise<AdminAccountDetail>;
  audit(filters: AdminAuditQuery, signal?: AbortSignal): Promise<AdminPage<AdminAuditEvent>>;
  createAccount(input: AdminCreateAccountRequest): Promise<AdminAccountDetail>;
  grantRole(id: number, input: AdminGrantRoleRequest): Promise<AdminAccountDetail>;
  revokeRole(id: number, role: AdminRole, input: AdminRevokeRoleRequest): Promise<AdminAccountDetail>;
  setAccess(id: number, input: AdminChangeAccessRequest): Promise<AdminAccountDetail>;
  listInvitations(filters: AdminInvitationsQuery, signal?: AbortSignal): Promise<AdminPage<AdminInvitation>>;
  createInvitation(input: AdminCreateInvitationRequest): Promise<AdminInvitation>;
  revokeInvitation(id: string, input: AdminRevokeRoleRequest): Promise<AdminInvitation>;
  /** The account's student programme; null when the account has no student profile. */
  studentProgramme(id: number, signal?: AbortSignal): Promise<AdminStudentProgramme | null>;
  curriculumOptions(signal?: AbortSignal): Promise<AdminCurriculumOption[]>;
  changeProgramme(id: number, input: AdminChangeProgrammeRequest): Promise<AdminProgrammeChange>;
}
interface RequestInput { method: 'GET' | 'POST' | 'DELETE' | 'PATCH'; body?: unknown }
export function createAdminClient(getToken: () => Promise<string | null>, baseUrl = ''): AdminClient {
  const base = baseUrl.replace(/\/+$/, '');
  async function request<T>(path: string, decode: (value: unknown) => T, signal?: AbortSignal, init: RequestInput = { method: 'GET' }): Promise<T> {
    const expected = accountSessionStamp(), controller = new AbortController();
    const assertSession = () => { if (expected !== accountSessionStamp()) throw new AdminApiError(401, 'SESSION_CHANGED', 'Your account changed. Reload this page.'); };
    const cancel = () => controller.abort(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    let abort!: () => void;
    const stopped = new Promise<never>((_resolve, reject) => { abort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', abort, { once: true }); if (controller.signal.aborted) abort(); });
    const timer = setTimeout(() => controller.abort(new AdminApiError(503, 'ADMIN_TIMEOUT', 'Administration is taking too long. Please retry.')), 15000);
    const run = async () => {
      assertSession();
      if (controller.signal.aborted) throw controller.signal.reason;
      const token = await getToken(); assertSession();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!token) { clearAccountCache(); throw new AdminApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Sign in again.'); }
      const response = await fetch(base + path, { method: init.method, headers: init.body === undefined ? { Authorization: 'Bearer ' + token } : { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body), credentials: 'omit', cache: 'no-store', signal: controller.signal });
      assertSession();
      if ([401, 403].includes(response.status)) clearAccountCache();
      let body: Record<string, unknown>;
      try { body = object(await response.json()); }
      catch { throw new AdminApiError(response.status || 503, 'INVALID_RESPONSE', 'Administration data could not be read. Please retry.'); }
      assertSession();
      if (!response.ok) {
        const error = body.error && typeof body.error === 'object' ? object(body.error) : {};
        throw new AdminApiError(response.status, typeof error.code === 'string' ? error.code : 'ADMIN_UNAVAILABLE', typeof error.message === 'string' ? error.message : 'Administration data is unavailable. Please retry.');
      }
      const result = decode(body.data); assertSession(); return result;
    };
    try { return await Promise.race([run(), stopped]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', abort); }
  }
  return {
    overview: signal => request('/api/admin/overview', overview, signal),
    users: (filters, signal) => request('/api/admin/users' + query(filters), value => paged(value, account), signal),
    account: (id, signal) => request('/api/admin/users/' + id, detail, signal),
    audit: (filters, signal) => request('/api/admin/audit' + query(filters), value => paged(value, audit), signal),
    createAccount: input => request('/api/admin/users', detail, undefined, { method: 'POST', body: input }),
    grantRole: (id, input) => request('/api/admin/users/' + id + '/roles', detail, undefined, { method: 'POST', body: input }),
    revokeRole: (id, roleName, input) => request('/api/admin/users/' + id + '/roles/' + encodeURIComponent(roleName), detail, undefined, { method: 'DELETE', body: input }),
    setAccess: (id, input) => request('/api/admin/users/' + id + '/access', detail, undefined, { method: 'PATCH', body: input }),
    listInvitations: (filters, signal) => request('/api/admin/invitations' + query(filters), value => paged(value, invitation), signal),
    createInvitation: input => request('/api/admin/invitations', invitation, undefined, { method: 'POST', body: input }),
    revokeInvitation: (id, input) => request('/api/admin/invitations/' + encodeURIComponent(id), invitation, undefined, { method: 'DELETE', body: input }),
    studentProgramme: (accountId, signal) => request('/api/admin/users/' + accountId + '/programme', studentProgramme, signal),
    curriculumOptions: signal => request('/api/admin/curriculum-options', value => { if (!Array.isArray(value)) throw new Error('Invalid administration response'); return value.map(curriculumOption); }, signal),
    changeProgramme: (accountId, input) => request('/api/admin/users/' + accountId + '/programme', programmeChange, undefined, { method: 'PATCH', body: input }),
  };
}
