import { createClerkClient } from '@clerk/backend';
import type { AdminIdentities } from './contracts';
import type { AdminIdentity } from '../../../../../packages/shared/src/admin/admin';

/** Only the minimal primary identity is projected; never return Clerk metadata or credentials. */
export function createAdminIdentities(secretKey: string): AdminIdentities {
  const clerk = createClerkClient({ secretKey });
  return {
    async search(query) {
      const response = await clerk.users.getUserList({ query, limit: 100 });
      return { ids: response.data.map(user => user.id), total: response.totalCount };
    },
    async lookup(ids) {
      const unique = [...new Set(ids)].filter(id => id.startsWith('user_'));
      const result = new Map<string, AdminIdentity>();
      // An empty filter must never turn into a request for all provider accounts.
      if (!unique.length) return result;
      if (unique.length > 100) throw new Error('Identity batch exceeds bounded page');
      const response = await clerk.users.getUserList({ userId: unique, limit: 100 });
      for (const user of response.data) {
        const email = user.emailAddresses.find(item => item.id === user.primaryEmailAddressId);
        result.set(user.id, { state: 'available', name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || null,
          email: email?.emailAddress ?? null, emailVerified: email?.verification?.status === 'verified' });
      }
      return result;
    },
  };
}
