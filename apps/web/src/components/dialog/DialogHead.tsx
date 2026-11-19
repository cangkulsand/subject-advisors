import type { ReactNode } from 'react';
import '../../app/typography.css';
import './dialog-head.css';

/**
 * Top row of every modal: the title on the left and a Close (×) button on the right (themeguide "Modal close button").
 * The row sticks to the top of the dialog while its content scrolls, so a long modal can be closed without scrolling down.
 * `onClose` must do what Escape does; pass `disabled` while a save is in flight.
 */
export function DialogHead({ children, onClose, disabled, label = 'Close' }: { children: ReactNode; onClose: () => void; disabled?: boolean; label?: string }) {
  return <div className="dialog-head">
    <div className="dialog-head-title">{children}</div>
    <button type="button" className="dialog-close" aria-label={label} title={label} data-close disabled={disabled} onClick={onClose}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
  </div>;
}
