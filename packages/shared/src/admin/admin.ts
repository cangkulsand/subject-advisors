export const ADMIN_ROLES = ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];
/** Exact (case-insensitive) email domains that may hold SYSTEM_ADMIN. The single source for API, runtime policy and UI. */
export const SYSTEM_ADMIN_EMAIL_DOMAINS = ['utm.my', 'graduate.utm.my', 'gmail.com'] as const;
export const SYSTEM_ADMIN_EMAIL_RULE = 'System Administrator: verified @utm.my, @graduate.utm.my or @gmail.com';
export function isSystemAdminEmailDomain(address: string): boolean {
  const parts = address.trim().split('@');
  if (parts.length !== 2 || !parts[0] || /\s/.test(parts[0])) return false;
  return (SYSTEM_ADMIN_EMAIL_DOMAINS as readonly string[]).includes(parts[1]!.toLowerCase());
}
export type AdminStatus = 'ACTIVE' | 'SUSPENDED';
export interface AdminIdentity {
  state: 'available' | 'not_found' | 'unavailable';
  name: string | null;
  email: string | null;
  emailVerified: boolean;
}
export interface AdminAccount {
  accountId: number;
  clerkUserId: string;
  roles: AdminRole[];
  accessStatus: AdminStatus;
  protectedOwner: boolean;
  createdAt: string;
  updatedAt: string;
  identity: AdminIdentity;
}
export interface AdminMembership {
  role: AdminRole;
  emailPolicy: string;
  source: string;
  protectedOwner: boolean;
  reason: string;
  grantedAt: string;
}
export interface AdminAccountDetail extends AdminAccount { memberships: AdminMembership[] }
export interface AdminAuditEvent {
  eventId: string;
  accountId: number;
  target: string;
  actor: string;
  kind: 'ROLE' | 'ACCESS';
  action: string;
  role: AdminRole | null;
  before: string | null;
  after: string | null;
  reason: string | null;
  occurredAt: string;
}
export interface AdminPage<T> { items: T[]; total: number; page: number; pageSize: number; generatedAt: string }
export interface AdminOverview {
  generatedAt: string;
  accounts: { total: number; active: number; suspended: number };
  roles: Record<AdminRole, number>;
  configuration: { programmes: number; curricula: number; subjects: number; semesters: number };
  recentEvents: Pick<AdminAuditEvent, 'eventId' | 'kind' | 'action' | 'role' | 'occurredAt'>[];
}
export interface AdminUsersQuery { page: number; q: string; role: AdminRole | ''; status: AdminStatus | '' }
export interface AdminAuditQuery { page: number; accountId?: number; kind: 'ALL' | 'ROLE' | 'ACCESS'; from?: string; to?: string }

// ---- User-management mutation contracts (S2-P004-004) ----
export const ADMIN_REASON_MAX_LENGTH = 500;
export const ADMIN_EMAIL_MAX_LENGTH = 254;
export type AdminInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export const ADMIN_MUTATION_ERROR_CODES = [
  'ROLE_ALREADY_ASSIGNED', 'LAST_ACTIVE_ADMIN', 'PROTECTED_OWNER', 'SELF_LOCKOUT',
  'ROLE_NOT_ELIGIBLE', 'ACCOUNT_EXISTS', 'CLERK_USER_EXISTS', 'CLERK_USER_NOT_FOUND', 'INVITATION_EXISTS',
  'LAST_ROLE', 'INVITATION_DELIVERY_FAILED',
] as const;
export type AdminMutationErrorCode = typeof ADMIN_MUTATION_ERROR_CODES[number];

export interface AdminCreateAccountRequest { email: string; roles: AdminRole[]; reason: string }
export interface AdminCreateInvitationRequest { email: string; roles: AdminRole[]; reason: string }
export interface AdminGrantRoleRequest { role: AdminRole; reason: string }
export interface AdminRevokeRoleRequest { reason: string }
export interface AdminChangeAccessRequest { status: AdminStatus; reason: string }
export interface AdminInvitation {
  id: string;
  email: string;
  roles: AdminRole[];
  status: AdminInvitationStatus;
  invitedBy: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export type AdminValidation<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;

/** Trim and bound a mutation reason; returns null when empty, non-string or too long. */
export function normaliseReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const reason = value.trim();
  return reason.length >= 1 && reason.length <= ADMIN_REASON_MAX_LENGTH ? reason : null;
}

/** Trim and lower-case an email; returns null when malformed. */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= ADMIN_EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email) ? email : null;
}

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

function asRecord(body: unknown, allowed: readonly string[]): Record<string, unknown> | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Request body must be an object.';
  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record).find(key => !allowed.includes(key));
  return unknown === undefined ? record : `Unknown field: ${unknown}.`;
}

function roleList(value: unknown): AdminRole[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'At least one role is required.';
  const roles: AdminRole[] = [];
  for (const item of value) {
    if (!isAdminRole(item)) return 'Invalid role.';
    if (roles.includes(item)) return 'Duplicate role.';
    roles.push(item);
  }
  return roles;
}

function emailRolesReason(body: unknown): AdminValidation<AdminCreateAccountRequest> {
  const record = asRecord(body, ['email', 'roles', 'reason']);
  if (typeof record === 'string') return { ok: false, error: record };
  const email = normaliseEmail(record.email);
  if (!email) return { ok: false, error: 'A valid email is required.' };
  const roles = roleList(record.roles);
  if (typeof roles === 'string') return { ok: false, error: roles };
  const reason = normaliseReason(record.reason);
  if (!reason) return { ok: false, error: `Reason is required (1-${ADMIN_REASON_MAX_LENGTH} characters).` };
  return { ok: true, value: { email, roles, reason } };
}

export const validateCreateAccountRequest = (body: unknown): AdminValidation<AdminCreateAccountRequest> => emailRolesReason(body);
export const validateCreateInvitationRequest = (body: unknown): AdminValidation<AdminCreateInvitationRequest> => emailRolesReason(body);

export function validateGrantRoleRequest(body: unknown): AdminValidation<AdminGrantRoleRequest> {
  const record = asRecord(body, ['role', 'reason']);
  if (typeof record === 'string') return { ok: false, error: record };
  if (!isAdminRole(record.role)) return { ok: false, error: 'Invalid role.' };
  const reason = normaliseReason(record.reason);
  if (!reason) return { ok: false, error: `Reason is required (1-${ADMIN_REASON_MAX_LENGTH} characters).` };
  return { ok: true, value: { role: record.role, reason } };
}

export function validateRevokeRoleRequest(body: unknown): AdminValidation<AdminRevokeRoleRequest> {
  const record = asRecord(body, ['reason']);
  if (typeof record === 'string') return { ok: false, error: record };
  const reason = normaliseReason(record.reason);
  if (!reason) return { ok: false, error: `Reason is required (1-${ADMIN_REASON_MAX_LENGTH} characters).` };
  return { ok: true, value: { reason } };
}

export function validateChangeAccessRequest(body: unknown): AdminValidation<AdminChangeAccessRequest> {
  const record = asRecord(body, ['status', 'reason']);
  if (typeof record === 'string') return { ok: false, error: record };
  if (record.status !== 'ACTIVE' && record.status !== 'SUSPENDED') return { ok: false, error: 'Invalid status.' };
  const reason = normaliseReason(record.reason);
  if (!reason) return { ok: false, error: `Reason is required (1-${ADMIN_REASON_MAX_LENGTH} characters).` };
  return { ok: true, value: { status: record.status, reason } };
}
