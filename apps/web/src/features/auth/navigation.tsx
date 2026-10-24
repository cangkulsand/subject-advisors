import { useEffect } from 'react';
/** Fixed internal auth destinations only. FOUNDATION may replace with its router adapter. */
export function AuthRedirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return <p role="status">Redirecting… <a href={to}>Continue</a></p>;
}
