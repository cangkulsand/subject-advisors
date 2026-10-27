import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { useAuth } from '@clerk/react';
import { AuthProvider, AuthPage, AuthGate, LogoutButton } from '../../../apps/web/src/features/auth';
import { ProfilePage } from '../../../apps/web/src/features/profile/ProfilePage';
import { RecordsPage } from '../../../apps/web/src/features/records/RecordsPage';
import { createAcademicClient } from '../../../apps/web/src/features/profile/client';
import './preview.css';
function StudentContent({ records, setup }: { records?: boolean; setup?: boolean }) {
  const { getToken } = useAuth(); const api = useMemo(() => createAcademicClient(getToken), [getToken]);
  return <><nav className="p001-preview-nav" aria-label="Student navigation"><a href="/student/profile">Academic profile</a><a href="/student/records">Subject records</a><LogoutButton /></nav>
    <main>{records ? <RecordsPage api={api} /> : <ProfilePage api={api} setup={setup} />}</main></>;
}
function Routes() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/sign-in' || path.startsWith('/sign-in/')) return <AuthPage mode="sign-in" />;
  if (path === '/sign-up' || path.startsWith('/sign-up/')) return <AuthPage mode="sign-up" />;
  if (path === '/auth/complete' || path === '/') return <AuthGate complete />;
  if (path === '/student/setup' || path === '/student/profile') return <AuthGate roles={['STUDENT']}><StudentContent setup={path === '/student/setup'} /></AuthGate>;
  if (path === '/student' || path === '/student/records') return <AuthGate roles={['STUDENT']} requireProfile><StudentContent records /></AuthGate>;
  return <main className="p001-preview-notice"><h1>Page unavailable in this preview</h1><p>This preview provides academic profile and subject records. Staff areas remain in the shared application.</p><a href="/auth/complete">Return to your account</a></main>;
}
const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
createRoot(document.getElementById('root')!).render(<StrictMode>{key ? <AuthProvider publishableKey={key}><Routes /></AuthProvider>
  : <main className="p001-preview-notice"><h1>Configure development authentication</h1><p>Add the team's Clerk development publishable key to .env.local and matching backend settings to .dev.vars. Restart the preview after configuration.</p><p>See docs/p001-sprint1-handoff.md.</p></main>}</StrictMode>);
