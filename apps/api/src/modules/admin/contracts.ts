import type { AuthDependencies } from '../auth/contracts';
import type { AdminAccount, AdminAuditEvent, AdminAuditQuery, AdminMembership, AdminOverview, AdminPage, AdminUsersQuery, AdminIdentity } from '../../../../../packages/shared/src/admin/admin';
export type AccountRow = Omit<AdminAccount, 'identity'>;
export interface AdminRepository {
  overview(): Promise<Omit<AdminOverview, 'recentEvents'>>;
  accounts(query: AdminUsersQuery, matchingIds: string[]): Promise<AdminPage<AccountRow>>;
  account(id: number): Promise<(AccountRow & { memberships: AdminMembership[] }) | null>;
  audit(query: AdminAuditQuery, pageSize?: number): Promise<AdminPage<AdminAuditEvent>>;
}
export interface AdminIdentities {
  search(query: string): Promise<{ ids: string[]; total: number }>;
  lookup(ids: string[]): Promise<Map<string, AdminIdentity>>;
}
export interface AdminDependencies { auth: AuthDependencies; repository: AdminRepository; identities: AdminIdentities }
