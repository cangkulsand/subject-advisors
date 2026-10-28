import { useAuth } from '@clerk/react';
import { useState } from 'react';
import { useAccountAccess, useAccountApiBase } from './account-context';
import { refreshAccountRoles } from './account-cache';
import { roleForPath, roleLabels, roleLandingPath } from './role-access';
import { navigateApp, useAppPathname } from '../../app/navigation';
import type { AppRole } from './contracts';

/** Changes navigation only; the backend authorizes each requested resource. */
export function RoleSwitcher() {
  const me = useAccountAccess();
  const apiBaseUrl = useAccountApiBase();
  const { userId, sessionId, getToken } = useAuth();
  const path = useAppPathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!me || me.availableRoles.length < 2) return error ? <p role="alert">{error}</p> : null;
  async function change(role: AppRole) {
    if (!userId || !sessionId || pending) return;
    setPending(true); setError('');
    try {
      const current = await refreshAccountRoles({ userId, sessionId, apiBaseUrl }, getToken);
      if (!current.availableRoles.includes(role)) { setError('That workspace is no longer available to your account.'); return; }
      navigateApp(roleLandingPath(current, role));
    } catch { setError('Workspace access could not be checked. Please retry.'); }
    finally { setPending(false); }
  }
  return <div className="auth-role-switcher">
    <label>Workspace view <select aria-label="Workspace view" value={roleForPath(path, me.appRole)} disabled={pending}
      onChange={event => { void change(event.target.value as AppRole); }}>
      {me.availableRoles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
    </select></label>
    {pending && <span role="status">Checking access…</span>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
