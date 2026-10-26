/** TEST ONLY: imported by an esbuild alias in browser checks, never by production. */
import { useSyncExternalStore, type ReactNode } from 'react';
const scenario = new URLSearchParams(location.search).get('scenario');
let current = { isLoaded: true, isSignedIn: scenario !== 'signed-out', userId: 'test_student_a', sessionId: 'test_session_a' };
const listeners = new Set<() => void>();
window.addEventListener('p002-test-session', () => {
  current = { ...current, userId: 'test_student_b', sessionId: 'test_session_b' };
  for (const listener of listeners) listener();
});
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => current;
const getToken = async () => 'test-only-' + current.userId;
export function useAuth() { return { ...useSyncExternalStore(subscribe, getSnapshot), getToken }; }
export function useClerk() { return { signOut: async () => undefined }; }
export function ClerkProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export function SignIn() { return <p>Test sign-in</p>; }
export function SignUp() { return <p>Test sign-up</p>; }
