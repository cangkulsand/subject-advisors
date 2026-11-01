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
    async findByEmail(email) {
      const wanted = email.trim().toLowerCase();
      const response = await clerk.users.getUserList({ emailAddress: [wanted], limit: 10 });
      // Only an exact PRIMARY email match counts; a secondary address must not select an account.
      const matches = response.data.flatMap(user => {
        const primary = user.emailAddresses.find(item => item.id === user.primaryEmailAddressId);
        return primary && primary.emailAddress.toLowerCase() === wanted
          ? [{ clerkUserId: user.id, verifiedEmail: primary.emailAddress.toLowerCase(), emailVerified: primary.verification?.status === 'verified' }] : [];
      });
      // Ambiguity is treated as not found rather than guessing which account an administrator meant.
      return matches.length === 1 ? matches[0]! : null;
    },
    async createInvitation(email, redirectUrl, expiresInDays) {
      // No publicMetadata: roles live only in the application database and are re-checked at redemption.
      const invitation = await clerk.invitations.createInvitation({ emailAddress: email.trim().toLowerCase(), ignoreExisting: false, notify: true,
        ...(redirectUrl ? { redirectUrl } : {}), ...(expiresInDays ? { expiresInDays } : {}) });
      return { clerkInvitationId: invitation.id };
    },
    async revokeInvitation(clerkInvitationId) {
      await clerk.invitations.revokeInvitation(clerkInvitationId);
    },
  };
}
