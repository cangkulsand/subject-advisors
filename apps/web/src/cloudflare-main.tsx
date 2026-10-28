import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './features/auth';
import { AppRoutes } from './app/AppRoutes';
import '../../../tools/auth/local/preview.css';

class ProviderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <main className="local-card" role="alert"><h1>Sign-in is temporarily unavailable</h1><p>Please try again later.</p></main>
      : this.props.children;
  }
}

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
createRoot(document.getElementById('root')!).render(<StrictMode><ProviderBoundary>
  {key ? <AuthProvider publishableKey={key}><AppRoutes /></AuthProvider> : <main className="local-card" role="alert"><h1>Application configuration is incomplete</h1><p>Please contact the site administrator.</p></main>}
</ProviderBoundary></StrictMode>);
