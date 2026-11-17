import type { ReactNode } from 'react';

/** Small inline icons for the graduation plan (S3-P004-010). Decorative only: the meaning is always in text beside them. */
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return <svg className={'planning-icon' + (className ? ' ' + className : '')} width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const GripIcon = () => <Icon>{[6, 12, 18].flatMap(y => [9, 15].map(x => <circle key={x + '-' + y} cx={x} cy={y} r="1.4" fill="currentColor" stroke="none" />))}</Icon>;
export const NormalIcon = () => <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
export const ShortIcon = () => <Icon><path d="M12 16a4 4 0 0 1 0-8z" fill="currentColor" /><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></Icon>;
export const PinIcon = () => <Icon><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></Icon>;
export const LockIcon = () => <Icon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>;
export const WarningIcon = () => <Icon><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Icon>;
export const CheckIcon = () => <Icon><path d="M20 6 9 17l-5-5" /></Icon>;
export const SpinnerIcon = () => <Icon className="planning-spin"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></Icon>;
