// TEST ONLY: no application shell or academic features.
import { createRoot } from 'react-dom/client';
import { AuthGate, AuthProvider, LogoutButton } from '../Auth';
const scenario = new URLSearchParams(window.location.search).get('scenario');
const root = createRoot(document.getElementById('root')!);
root.render(scenario === 'missing-key'
  ? <AuthProvider publishableKey=""><p>Private content</p></AuthProvider>
  : scenario?.startsWith('logout')
    ? <LogoutButton />
    : <AuthGate roles={scenario === 'wrong-role' ? ['SYSTEM_ADMIN'] : ['STUDENT']}
        requireProfile complete={scenario === 'complete'}>
        <p>Private content</p><LogoutButton />
      </AuthGate>);
