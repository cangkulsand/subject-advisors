import { useEffect } from 'react';
import { navigateApp } from '../../app/navigation';
/** Fixed internal auth destinations only. FOUNDATION may replace with its router adapter. */
export function AuthRedirect({ to }: { to: string }) {
  useEffect(() => { navigateApp(to,{replace:true,skipUnsaved:true}); }, [to]);
  return <p role="status">Redirecting… <a href={to}>Continue</a></p>;
}
