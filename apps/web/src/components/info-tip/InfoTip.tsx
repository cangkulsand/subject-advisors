import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import '../../app/typography.css';
import './info-tip.css';

const GAP = 8, EDGE = 8, CLOSE_DELAY = 120;

/**
 * Info icon with a hover popover (TailAdmin "popover" look: title + text, arrow). Opens on hover and on keyboard focus,
 * stays open while the pointer is over the icon or the popover, closes on leave, blur or Escape (WCAG 1.4.13).
 * The popover is fixed to the viewport so a scrolling table or dialog cannot clip it; it opens above, or below when there is no room.
 */
export function InfoTip({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false), [place, setPlace] = useState<{ style: CSSProperties; side: 'top' | 'bottom'; arrow: number }>({ style: { visibility: 'hidden' }, side: 'top', arrow: 0 });
  const button = useRef<HTMLButtonElement>(null), popover = useRef<HTMLDivElement>(null), timer = useRef<number | undefined>(undefined), id = useId();
  const show = () => { window.clearTimeout(timer.current); setOpen(true); };
  const hide = (delay = CLOSE_DELAY) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), delay); };
  const position = () => {
    if (!button.current || !popover.current) return;
    const anchor = button.current.getBoundingClientRect(), tip = popover.current.getBoundingClientRect();
    const side = anchor.top - GAP - tip.height >= EDGE ? 'top' : 'bottom';
    const centre = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(EDGE, centre - tip.width / 2), window.innerWidth - tip.width - EDGE);
    setPlace({ side, arrow: centre - left, style: { top: side === 'top' ? anchor.top - GAP - tip.height : anchor.bottom + GAP, left } });
  };
  useLayoutEffect(() => { if (open) position(); else setPlace(current => ({ ...current, style: { visibility: 'hidden' } })); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); setOpen(false); } };
    document.addEventListener('keydown', onKey, true); window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
    return () => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); };
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <span className="info-tip" onMouseEnter={show} onMouseLeave={() => hide()}>
    <button type="button" ref={button} className="info-tip-button" aria-label={label ?? `About ${title}`} aria-describedby={id}
      onFocus={show} onBlur={() => hide(0)} onClick={show}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
    </button>
    <div ref={popover} id={id} role="tooltip" className="info-tip-popover" data-side={place.side} hidden={!open}
      style={{ ...place.style, '--info-tip-arrow': `${place.arrow}px` } as CSSProperties}>
      <span className="info-tip-title">{title}</span>
      <span className="info-tip-text">{children}</span>
    </div>
  </span>;
}
