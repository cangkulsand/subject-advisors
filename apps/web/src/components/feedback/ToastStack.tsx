import type { AnimationEvent } from 'react';
import './toast-stack.css';

export type ToastKind = 'success' | 'info' | 'warning' | 'danger';

export type ToastNotification = {
  id: number;
  message: string;
  kind: ToastKind;
  closing: boolean;
};

type ToastStackProps = {
  toasts: ToastNotification[];
  onDismiss: (id: number) => void;
  onExitAnimationEnd: (id: number, event: AnimationEvent<HTMLDivElement>) => void;
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === 'success') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 4.5 4.5L19 7" /></svg>;
  if (kind === 'info') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></svg>;
  if (kind === 'warning') return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="m9 9 6 6m0-6-6 6" /></svg>;
}

export function ToastStack({ toasts, onDismiss, onExitAnimationEnd }: ToastStackProps) {
  if (!toasts.length) return null;
  return <div className="p001-record-toast-stack" aria-label="Notifications" aria-live="polite" aria-relevant="additions removals">
    {toasts.map(toast => <div
      key={toast.id}
      className={`p001-record-toast p001-record-toast--${toast.kind}${toast.closing ? ' p001-record-toast--closing' : ''}`}
      role="status"
      aria-atomic="true"
      data-toast-id={toast.id}
      onAnimationEnd={event => onExitAnimationEnd(toast.id, event)}
    >
      <ToastIcon kind={toast.kind} />
      <span className="p001-record-toast__message">{toast.message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>)}
  </div>;
}
