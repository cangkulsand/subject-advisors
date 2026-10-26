import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { useEffect, useState, type ReactNode } from 'react';
import { AuthRedirect } from './navigation';
import { AuthApiError } from './client';
import { ACCOUNT_CACHE_CHANGED, accountSessionStamp, clearAccountCache, keepAccountSession, loadSessionAccount, readAccountCache } from './account-cache';
import type { AppRole, Me } from './contracts';
import './auth.css';

export function AuthProvider({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  if (!publishableKey) return <section role="alert">Sign-in is unavailable until Clerk is configured.</section>;
  return <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up"
    appearance={{ variables: { colorPrimary: '#521f28', colorForeground: '#49383b', colorMutedForeground: '#786368', colorNeutral: '#49383b', colorBackground: '#ffffff', colorRing: '#9a596b', colorDanger: '#b13b35', colorSuccess: '#34634c', colorWarning: '#825c1a' } }}
    signInForceRedirectUrl="/auth/complete" signUpForceRedirectUrl="/auth/complete"
    afterSignOutUrl="/sign-in"><AccountSessionLifecycle />{children}</ClerkProvider>;
}

function AccountSessionLifecycle() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  useEffect(() => { if (isLoaded) keepAccountSession(isSignedIn && userId && sessionId ? { userId, sessionId } : null); }, [isLoaded,isSignedIn,userId,sessionId]);
  return null;
}

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p role="status">Loading sign-in...</p>;
  if (isSignedIn) return <AuthRedirect to="/auth/complete" />;
  return <main className="auth-panel">
    <h1>{mode === 'sign-up' ? 'Create your student account' : 'Sign in'}</h1>
    <p>Student access requires a verified @graduate.utm.my primary email.</p>
    {mode === 'sign-up'
      ? <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/auth/complete" />
      : <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/auth/complete" />}
  </main>;
}

export function LogoutButton() {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function logout() {
    setPending(true); setFailed(false);
    clearAccountCache(false);
    try { await signOut({ redirectUrl: '/sign-in' }); }
    catch { setFailed(true); }
    finally { setPending(false); }
  }
  return <div>
    <button type="button" disabled={pending} onClick={() => { void logout(); }}>
      {pending ? 'Signing out...' : 'Sign out'}
    </button>
    {failed && <p role="alert">Sign out failed. Your session may still be active. Please retry.</p>}
  </div>;
}

/** Use for auth completion and every private route; API middleware remains authoritative. */
export function AuthGate({ children, roles, requireProfile = false, complete = false, apiBaseUrl = '' }: {
  children?: ReactNode; roles?: readonly AppRole[]; requireProfile?: boolean; complete?: boolean; apiBaseUrl?: string; pathname?: string;
}) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const session = userId && sessionId ? { userId, sessionId, apiBaseUrl } : undefined;
  const key = [userId, sessionId, complete, apiBaseUrl, attempt].join('|');
  const [result, setResult] = useState<{ key: string; me?: Me; error?: Error }>();
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId || !sessionId) return;
    let active = true;
    keepAccountSession({userId,sessionId,apiBaseUrl});
    loadSessionAccount({userId,sessionId,apiBaseUrl},getToken,complete,attempt>0).then(
      me => { if (active) setResult({ key, me }); },
      error => { if (active) setResult({ key, error: error instanceof Error ? error : new Error('Account access is unavailable.') }); },
    );
    return () => { active = false; };
  }, [isLoaded, isSignedIn, userId, sessionId, getToken, apiBaseUrl, complete, key, attempt]);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail === 'profile-saved' && userId && sessionId) {
        const me=readAccountCache({userId,sessionId,apiBaseUrl});
        if(me){setResult({key,me});return;}
      }
      setAttempt(n => n + 1);
    };
    window.addEventListener(ACCOUNT_CACHE_CHANGED, refresh);
    return () => window.removeEventListener(ACCOUNT_CACHE_CHANGED, refresh);
  }, [userId,sessionId,apiBaseUrl,key]);
  if (!isLoaded) return <p role="status">Loading sign-in...</p>;
  if (!isSignedIn) return <AuthRedirect to="/sign-in" />;
  const cached = !complete && session ? readAccountCache(session) : undefined;
  if (result?.key !== key && !cached) return <p role="status">Checking account access...</p>;
  if (result?.key === key && result.error) {
    const error = result.error;
    if (error instanceof AuthApiError && error.code === 'ACCESS_NOT_ASSIGNED' && !complete) {
      return <AuthRedirect to="/auth/complete" />;
    }
    return <section className="auth-panel">
      <p role="alert">{error instanceof AuthApiError ? error.message : 'Unable to reach account services. Please retry.'}</p>
      {error instanceof AuthApiError && error.status === 401 && <p>Your session cannot be used. Sign out, then sign in again.</p>}
      <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button>
      <LogoutButton />
    </section>;
  }
  const me = result?.key === key ? result.me : cached;
  if (!me || me.accessStatus !== 'ACTIVE') return <p role="alert">Account access is unavailable.</p>;
  if (roles && !roles.includes(me.appRole)) return <section className="auth-panel">
    <p role="alert">Your account does not have access to this page.</p><a href={me.landingPath}>Go to your account</a><LogoutButton />
  </section>;
  if (complete) return <AuthRedirect to={me.landingPath} />;
  if (requireProfile && me.appRole === 'STUDENT' && me.profileState !== 'COMPLETE') {
    return <AuthRedirect to="/student/setup" />;
  }
  if (accountSessionStamp() !== JSON.stringify([userId, sessionId])) return <p role="status">Checking account access...</p>;
  return <>{children}</>;
}

export function AuthDependencyPlaceholder({ area }: { area: 'setup' | 'student' | 'coordinator' | 'admin' }) {
  return <main className="auth-panel">
    <h1>{area === 'setup' ? 'Academic profile setup' : 'Account access confirmed'}</h1>
    <p>{area === 'setup'
      ? 'Profile setup is not available yet. Academic features remain blocked until a valid profile and curriculum are saved.'
      : 'This area is not yet implemented. Your account is signed in.'}</p>
    <LogoutButton />
  </main>;
}
