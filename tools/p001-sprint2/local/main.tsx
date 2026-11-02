import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider,AuthPage,AuthGate,AuthDependencyPlaceholder } from '../../../apps/web/src/features/auth';
import { Sprint2Routes } from '../../../apps/web/src/features/p001-sprint2/Sprint2Routes';
import { StudentRoutes } from '../../../apps/web/src/app/StudentRoutes';
import '../../../apps/web/src/features/p001-sprint2/sprint2.css';
function Routes(){
  const path=window.location.pathname.replace(/\/$/,'')||'/';
  if(path.startsWith('/sign-in'))return <AuthPage mode="sign-in"/>;
  if(path.startsWith('/sign-up'))return <AuthPage mode="sign-up"/>;
  if(path==='/'||path==='/auth/complete')return <AuthGate complete/>;
  if(path==='/student/progress')return <Sprint2Routes area="progress"/>;
  if(path==='/student/profile')return <Sprint2Routes area="profile"/>;
  if(path==='/student/setup')return <Sprint2Routes area="setup"/>;
  if(path==='/student'||path==='/student/records')return <Sprint2Routes area="records"/>;
  if(path==='/admin'||path==='/admin/curriculum')return <Sprint2Routes area="curriculum"/>;
  if(path==='/student/offerings')return <StudentRoutes area="offerings"/>;
  if(path==='/student/pathway')return <StudentRoutes area="pathway"/>;
  if(path==='/coordinator')return <AuthGate roles={['COORDINATOR']}><AuthDependencyPlaceholder area="coordinator"/></AuthGate>;
  return <main className="s2"><h1>Page not found</h1><a href="/auth/complete">Go to your account</a></main>;
}
document.body.classList.add('s2-preview');
const key=import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
createRoot(document.getElementById('root')!).render(<StrictMode>{key?<AuthProvider publishableKey={key}><Routes/></AuthProvider>:<main className="s2"><h1>Configure development authentication</h1><p>Supply the existing team Clerk and Neon settings in the private .env.local and .dev.vars files, then restart the launcher.</p></main>}</StrictMode>);
