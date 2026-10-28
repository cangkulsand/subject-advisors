export const ADMIN_ROLES = ['STUDENT', 'COORDINATOR', 'SYSTEM_ADMIN'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];
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
