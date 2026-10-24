// TEST ONLY. This module is never exported by the production auth entry point.
import type { ReactNode } from 'react';
const scenario = new URLSearchParams(window.location.search).get('scenario');
const getToken = async () => scenario === 'expired-token' ? null : 'test-only-token';
export const useAuth = () => ({
  isLoaded: scenario !== 'loading', isSignedIn: scenario !== 'signed-out',
  userId: 'user_test', sessionId: 'sess_test', getToken,
});
export const useClerk = () => ({
  signOut: async () => {
    if (scenario === 'logout-failure') throw new Error('test-only failure');
    document.body.dataset.signedOut = 'true';
  },
});
export function ClerkProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export function SignIn() { return <p>Test sign-in widget</p>; }
export function SignUp() { return <p>Test sign-up widget</p>; }
