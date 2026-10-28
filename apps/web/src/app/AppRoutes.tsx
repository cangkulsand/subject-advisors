import { AuthGate, AuthPage } from '../features/auth';
import { StudentRoutes } from './StudentRoutes';
import { useAppPathname } from './navigation';
import { AdminRoutes } from '../features/admin/AdminRoutes';
import { CoordinatorRoutes } from '../features/coordinator/CoordinatorRoutes';

/** Shared integrated route table used by local and deployed application shells. */
export function AppRoutes() {
  const path = useAppPathname().replace(/\/$/, '') || '/';
  if (path === '/sign-in' || path.startsWith('/sign-in/')) return <AuthPage mode="sign-in" />;
  if (path === '/sign-up' || path.startsWith('/sign-up/')) return <AuthPage mode="sign-up" />;
  if (path === '/auth/complete') return <AuthGate complete />;
  if (path === '/student/setup') return <StudentRoutes area="setup" />;
  if (path === '/student/profile') return <StudentRoutes area="profile" />;
  if (path === '/student' || path === '/student/records') return <StudentRoutes area="records" />;
  if (path === '/student/offerings') return <StudentRoutes area="offerings" />;
  if (path === '/student/pathway') return <StudentRoutes area="pathway" />;
  if (path === '/coordinator' || path.startsWith('/coordinator/')) return <CoordinatorRoutes/>;
  if (path === '/admin' || path.startsWith('/admin/')) return <AdminRoutes/>;
  if (path !== '/') return <main className="local-card"><h1>Page not found</h1><a href="/">Return home</a></main>;
  return <main className="local-card">
    <h1>Subject Advisors</h1>
    <p>Register with your verified institutional email or sign in to your existing account.</p>
    <nav aria-label="Account"><a className="primary-link" href="/sign-in">Sign in</a><a href="/sign-up">Create student account</a><a href="/auth/complete">Continue to my account</a></nav>
    <p className="note">Academic services become available as the team enables them.</p>
  </main>;
}
