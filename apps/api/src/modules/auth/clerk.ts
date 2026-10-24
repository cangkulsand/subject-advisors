import { createClerkClient } from '@clerk/backend';
import type { VerifiedIdentity } from './contracts';
import { AuthError } from './errors';

export interface ClerkConfig {
  secretKey: string;
  publishableKey: string;
  authorizedParties: string[];
}

export function createClerkVerifier(config: ClerkConfig) {
  if (!config.secretKey || !config.publishableKey || !config.authorizedParties.length ||
    config.authorizedParties.some(origin => {
      try {
        const url = new URL(origin);
        return url.origin !== origin || !['https:', 'http:'].includes(url.protocol);
      } catch { return true; }
    })) {
    throw new AuthError(503, 'AUTH_CONFIGURATION', 'Authentication configuration is incomplete.');
  }
  const clerk = createClerkClient({ secretKey: config.secretKey, publishableKey: config.publishableKey });
  return async (request: Request): Promise<VerifiedIdentity> => {
    // Explicit bearer-only API: cookie-only requests cannot trigger account mutations.
    if (!/^Bearer [^\s]+$/i.test(request.headers.get('Authorization') ?? '')) {
      throw new AuthError(401, 'SESSION_REQUIRED', 'Please sign in to continue.');
    }
    try {
      const state = await clerk.authenticateRequest(request, {
        authorizedParties: config.authorizedParties, acceptsToken: 'session_token',
      });
      if (!state.isAuthenticated) throw new AuthError(401, 'SESSION_INVALID', 'Your session has expired. Please sign in again.');
      const auth = state.toAuth();
      if (!auth?.userId || !auth.sessionId) throw new AuthError(401, 'SESSION_INVALID', 'Please sign in again.');
      // Check revocation on every request; JWT validation alone allows replay until expiry.
      const session = await clerk.sessions.getSession(auth.sessionId);
      if (session.status !== 'active' || session.userId !== auth.userId || session.expireAt <= Date.now()) {
        throw new AuthError(401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.');
      }
      const user = await clerk.users.getUser(auth.userId);
      if (user.id !== auth.userId || user.banned || user.locked) {
        throw new AuthError(403, 'IDENTITY_DISABLED', 'This identity is not permitted to access the application.');
      }
      const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
      return {
        clerkUserId: auth.userId, sessionId: auth.sessionId,
        primaryEmail: primary ? { address: primary.emailAddress, verified: primary.verification?.status === 'verified' } : null,
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
        throw new AuthError(401, 'SESSION_INVALID', 'Please sign in again.');
      }
      throw new AuthError(503, 'CLERK_UNAVAILABLE', 'Sign-in verification is temporarily unavailable. Please retry.');
    }
  };
}
