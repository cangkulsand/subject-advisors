import type { AuthDependencies } from '../auth/contracts';
import type { AdminAccount, AdminAuditEvent, AdminAuditQuery, AdminMembership, AdminOverview, AdminPage, AdminUsersQuery, AdminIdentity, AdminInvitation, AdminInvitationStatus, AdminRole, AdminStatus } from '../../../../../packages/shared/src/admin/admin';
export type AccountRow = Omit<AdminAccount, 'identity'>;
export type AccountDetailRow = AccountRow & { memberships: AdminMembership[] };
export interface AdminInvitationQuery { page: number; status?: AdminInvitationStatus | '' }
export interface AdminRepository {
  overview(): Promise<Omit<AdminOverview, 'recentEvents'>>;
  accounts(query: AdminUsersQuery, matchingIds: string[]): Promise<AdminPage<AccountRow>>;
  account(id: number): Promise<AccountDetailRow | null>;
  audit(query: AdminAuditQuery, pageSize?: number): Promise<AdminPage<AdminAuditEvent>>;
  /**
   * Mutations: every one runs in a single database transaction whose first statement sets the trusted
   * audit context (actor, reason) and throws AdminMutationError on rule violations. Callers must have
   * already checked email-domain eligibility against the VERIFIED Clerk email (see eligibility.ts).
   */
  createAccount(clerkUserId: string, roles: AdminRole[], actor: string, reason: string, options?: { invitationId?: string }): Promise<AccountDetailRow>;
  grantRole(accountId: number, role: AdminRole, actor: string, reason: string): Promise<AccountDetailRow>;
  revokeRole(accountId: number, role: AdminRole, actor: string, reason: string): Promise<AccountDetailRow>;
  setAccessStatus(accountId: number, status: AdminStatus, actor: string, reason: string): Promise<AccountDetailRow>;
  createInvitation(email: string, roles: AdminRole[], actor: string, reason: string, expiresAt: Date): Promise<AdminInvitation>;
  attachClerkInvitation(invitationId: string, clerkInvitationId: string, actor: string): Promise<AdminInvitation>;
  listInvitations(query: AdminInvitationQuery): Promise<AdminPage<AdminInvitation>>;
  revokeInvitation(invitationId: string, actor: string, reason?: string): Promise<AdminInvitation>;
  /** The single unexpired PENDING invitation for an exact lower-cased email, if any (used for redemption). */
  findPendingInvitationByEmail(email: string): Promise<AdminInvitation | null>;
  /** The Clerk invitation reference stored on a row (not part of the public AdminInvitation contract). */
  clerkInvitationIdOf(invitationId: string): Promise<string | null>;
  /** Marks every lapsed PENDING invitation EXPIRED; returns how many rows changed. */
  expireInvitations(actor: string): Promise<number>;
  acceptInvitation(invitationId: string, accountId: number, actor: string): Promise<AdminInvitation>;
}
export interface AdminIdentities {
  search(query: string): Promise<{ ids: string[]; total: number }>;
  lookup(ids: string[]): Promise<Map<string, AdminIdentity>>;
  /** Exact primary-email match (case-insensitive). emailVerified reflects Clerk's verification status. */
  findByEmail(email: string): Promise<{ clerkUserId: string; verifiedEmail: string; emailVerified: boolean } | null>;
  createInvitation(email: string, redirectUrl?: string, expiresInDays?: number): Promise<{ clerkInvitationId: string }>;
  revokeInvitation(clerkInvitationId: string): Promise<void>;
}
export interface AdminDependencies { auth: AuthDependencies; repository: AdminRepository; identities: AdminIdentities; academicRepository?: import('./academic-contracts').AcademicSetupRepository }
