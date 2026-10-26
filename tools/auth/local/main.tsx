import { Component, StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, AuthPage, AuthGate, AuthDependencyPlaceholder } from '../../../apps/web/src/features/auth';
import { StudentRoutes } from '../../../apps/web/src/app/StudentRoutes';
import './preview.css';

class ProviderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <main className="local-card" role="alert"><h1>Sign-in could not start</h1><p>Check the Clerk development publishable key in .env.local, then restart the local servers.</p></main>
      : this.props.children;
  }
}
function Setup() {
  const [status, setStatus] = useState('Checking the local API...');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/local-status', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then((value: { configured: boolean }) => setStatus(value.configured
        ? 'Local API is running and its settings are present. Live services have not been verified.'
        : 'Local API is running. Add its Clerk and Neon settings to .dev.vars.'))
      .catch(() => { if (!controller.signal.aborted) setStatus('Local API is unavailable. Check the terminal running npm run dev.'); });
    return () => controller.abort();
  }, []);
  return <main className="local-card">
    <p className="eyebrow">Programmer 4 / Sprint 1</p><h1>Finish local setup</h1>
    <p>The app is running. Add your development settings to enable account registration and sign-in.</p>
    <ol>
      <li>Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>.env.local</code>.</li>
      <li>Set the matching Clerk keys and your development Neon <code>DATABASE_URL</code> in <code>.dev.vars</code>.</li>
      <li>Use the team's migrated development database, then restart <code>npm run dev</code>.</li>
    </ol>
    <p role="status">{status}</p><p>Instructions: <code>docs/p004-local.md</code></p>
  </main>;
}
function LocalRoutes() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/sign-in' || path.startsWith('/sign-in/')) return <AuthPage mode="sign-in" />;
  if (path === '/sign-up' || path.startsWith('/sign-up/')) return <AuthPage mode="sign-up" />;
  if (path === '/auth/complete') return <AuthGate complete />;
  if (path === '/student/setup') return <StudentRoutes area="setup" />;
  if (path === '/student/profile') return <StudentRoutes area="profile" />;
  if (path === '/student' || path === '/student/records') return <StudentRoutes area="records" />;
  if (path === '/student/offerings') return <StudentRoutes area="offerings" />;
  if (path === '/student/pathway') return <StudentRoutes area="pathway" />;
  if (path === '/coordinator') return <AuthGate roles={['COORDINATOR']}><AuthDependencyPlaceholder area="coordinator" /></AuthGate>;
  if (path === '/admin') return <AuthGate roles={['SYSTEM_ADMIN']}><AuthDependencyPlaceholder area="admin" /></AuthGate>;
  if (path !== '/') return <main className="local-card"><h1>Page not found</h1><a href="/">Return home</a></main>;
  return <main className="local-card">
    <p className="eyebrow">Programmer 4 / Sprint 1</p><h1>Subject Advisors</h1>
    <p>Register with your verified institutional email or sign in to your existing account.</p>
    <nav aria-label="Account"><a className="primary-link" href="/sign-in">Sign in</a><a href="/sign-up">Create student account</a><a href="/auth/complete">Continue to my account</a></nav>
    <p className="note">Academic services become available as the team enables them.</p>
  </main>;
}
const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
createRoot(document.getElementById('root')!).render(<StrictMode><ProviderBoundary>
  {key ? <AuthProvider publishableKey={key}><LocalRoutes /></AuthProvider> : <Setup />}
</ProviderBoundary></StrictMode>);
