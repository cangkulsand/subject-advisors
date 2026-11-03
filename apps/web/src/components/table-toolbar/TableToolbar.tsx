import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import '../../app/typography.css';
import './table-toolbar.css';

// Shared table toolbar (S2-INT-004). Anatomy and rules: docs/themeguide.md "Table toolbar (mandatory)".
// Row order: SegmentedFilter (primary status) -> FilterMenu(s) -> SearchField (last on mobile). The caller owns all state.

export interface ToolbarOption { value: string; label: string }

function Svg({ children }: { children: ReactNode }) {
  return <svg className="tt-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export function TableToolbar({ label, children, onSubmit }: { label: string; children: ReactNode; onSubmit?: () => void }) {
  return <form className="table-toolbar" role="search" aria-label={label} onSubmit={event => { event.preventDefault(); onSubmit?.(); }}>{children}</form>;
}

export function ClearFilters({ onClear }: { onClear: () => void }) {
  return <button type="button" className="tt-clear" onClick={onClear}>Clear filters</button>;
}

export function SegmentedFilter({ label, options, value, onChange }: { label: string; options: ToolbarOption[]; value: string; onChange: (value: string) => void }) {
  return <div className="tt-segmented" role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} className="tt-segment" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

export function SearchField({ label, value, onChange, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number }) {
  return <label className="tt-search">
    <span className="tt-sr-only">{label}</span>
    <Svg><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Svg>
    <input type="search" value={value} maxLength={maxLength} placeholder={placeholder} onChange={event => onChange(event.target.value)}/>
  </label>;
}

export interface FilterGroup {
  id: string; heading: string; value: string; options: ToolbarOption[];
  /** Label of the empty value (default "All"); noAll removes the empty option (sort groups). */
  allLabel?: string; noAll?: boolean; onChange: (value: string) => void;
}

export function FilterMenu({ label = 'Filter', icon = 'filter', groups, showValue = false, align = 'start' }: { label?: string; icon?: 'filter' | 'sort'; groups: FilterGroup[]; showValue?: boolean; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), menuId = useId();
  const full = (group: FilterGroup) => (group.noAll ? [] : [{ value: '', label: group.allLabel ?? 'All' }]).concat(group.options);
  const active = groups.flatMap(group => group.value !== '' || group.noAll ? [{ group, option: full(group).find(option => option.value === group.value) }] : []);
  const first = active[0]?.option;
  const text = active.length === 0 ? label : active.length === 1 && first ? (showValue ? `${label}: ${first.label}` : first.label) : `${label}: ${active.length} selected`;
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
  const openMenu = (focusLast = false) => {
    setOpen(true);
    requestAnimationFrame(() => { const list = items(); (focusLast ? list[list.length - 1] : list.find(item => item.getAttribute('aria-checked') === 'true') ?? list[0])?.focus(); });
  };
  const close = (restore: boolean) => { setOpen(false); if (restore) button.current?.focus(); };
  const onMenuKey = (event: KeyboardEvent) => {
    const list = items(), index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); list[list.length - 1]?.focus(); }
  };
  return <div className={`tt-menu tt-menu-${align}`} ref={root}>
    <button type="button" ref={button} className={`tt-menu-button${active.length ? ' is-active' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => open ? close(false) : openMenu()}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(); } else if (event.key === 'ArrowUp') { event.preventDefault(); openMenu(true); } else if (event.key === 'Escape' && open) close(true); }}>
      {icon === 'sort' ? <Svg><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></Svg> : <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></Svg>}
      <span>{text}</span>
      <Svg><path d="m6 9 6 6 6-6"/></Svg>
    </button>
    {open && <div className="tt-popover" id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKey}>
      {groups.map(group => <div className="tt-group" role="group" aria-label={group.heading} key={group.id}>
        <p className="tt-group-heading" aria-hidden="true">{group.heading}</p>
        {full(group).map(option => <button type="button" role="menuitemradio" aria-checked={option.value === group.value} className="tt-option" key={option.value} tabIndex={-1}
          onClick={() => { group.onChange(option.value); close(true); }}>{option.label}</button>)}
      </div>)}
    </div>}
  </div>;
}
