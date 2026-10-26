import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LogoutButton } from '../features/auth';
import { AppLink } from './navigation';
import type { StudentArea } from './StudentRoutes';
import './student-shell.css';
const links = [
  { area: 'profile', href: '/student/profile', label: 'Academic profile', icon: 'user' },
  { area: 'records', href: '/student/records', label: 'Subject records', icon: 'records' },
  { area: 'offerings', href: '/student/offerings', label: 'Semester offerings', icon: 'calendar' },
  { area: 'pathway', href: '/student/pathway', label: 'Academic pathway', icon: 'pathway' },
] as const;
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-3.5 3-5.5 7-5.5s6.5 2 7 5.5"/></>,
    records: <><path d="M6 3.75h9l3 3V20H6z"/><path d="M14.5 4v4h4M9 12h6M9 16h6"/></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16M8 14h3m2 3h3"/></>,
    pathway: <><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></>,
    menu: <path d="M4 6h16M4 12h9M4 18h16"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>, moon: <path d="M20 13a8 8 0 0 1-9-9 8.5 8.5 0 1 0 9 9Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Brand() { return <><span className="student-brand-mark" aria-hidden="true">SA</span><span className="student-brand-name">Subject Advisors</span></>; }
export function StudentShell({ area, title, children }: { area: StudentArea; title: string; children: ReactNode }) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 1279px)').matches);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('subject-advisors-theme') === 'dark'; } catch { return false; } });
  const searchRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wide = mobile || expanded || hovered;
  const results = links.filter(link => link.label.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const resize = () => { setMobile(media.matches); setOpen(false); setHovered(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setActionsOpen(true); requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === 'Escape') { setOpen(false); setAccountOpen(false); setSearchOpen(false); }
    };
    const outside = (event: PointerEvent) => { if (!headerRef.current?.contains(event.target as Node)) { setAccountOpen(false); setSearchOpen(false); } };
    document.addEventListener('keydown', keydown); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', outside); };
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; sidebarRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = sidebarRef.current?.querySelectorAll<HTMLElement>('a, button');
      const first = items?.[0], last = items?.[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', trap); toggleRef.current?.focus(); };
  }, [mobile, open]);
  function closeNavigation() { setOpen(false); setSearchOpen(false); setAccountOpen(false); }
  function toggleTheme() { setDark(value => { try { localStorage.setItem('subject-advisors-theme', value ? 'light' : 'dark'); } catch { /* Preference storage is optional. */ } return !value; }); }
  return <div className={`student-shell${dark ? ' student-dark' : ''}${wide ? '' : ' student-compact'}${open ? ' student-menu-open' : ''}`}>
    <aside id="student-sidebar" ref={sidebarRef} className="student-sidebar" aria-label="Student workspace" inert={mobile && !open} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false); }}>
      <button className="student-icon-button student-sidebar-close" type="button" aria-label="Close navigation" onClick={() => setOpen(false)}><Icon name="close"/></button>
      <AppLink href="/student" className="student-shell-brand" aria-label="Subject Advisors home" onClick={closeNavigation}><Brand/></AppLink>
      <p className="student-sidebar-label">{wide ? 'MENU' : '•••'}</p>
      <nav aria-label="Student navigation">{links.map(link => <AppLink key={link.area} href={link.href} aria-label={link.label} title={!wide ? link.label : undefined} className="student-nav-link" aria-current={area === link.area || area === 'setup' && link.area === 'profile' ? 'page' : undefined} onClick={closeNavigation}><Icon name={link.icon}/><span>{link.label}</span></AppLink>)}</nav>
    </aside>
    {mobile && open && <button className="student-sidebar-backdrop" type="button" tabIndex={-1} aria-label="Dismiss navigation" onClick={() => setOpen(false)}/>}
    <div className="student-main-column">
      <header ref={headerRef} className="student-topbar">
        <div className="student-header-row">
          <button ref={toggleRef} className="student-icon-button student-menu-toggle" type="button" aria-label={mobile ? open ? 'Close navigation' : 'Open navigation' : 'Toggle sidebar'} aria-controls="student-sidebar" aria-expanded={mobile ? open : expanded} onClick={() => mobile ? setOpen(!open) : setExpanded(!expanded)}><Icon name={open ? 'close' : 'menu'}/></button>
          <AppLink href="/student" className="student-mobile-brand"><Brand/></AppLink>
          <button className="student-icon-button student-more" type="button" aria-label="Toggle header controls" aria-controls="student-header-controls" aria-expanded={actionsOpen} onClick={() => setActionsOpen(!actionsOpen)}><Icon name="more"/></button>
        </div>
        <div id="student-header-controls" className={`student-header-controls${actionsOpen ? ' is-open' : ''}`}>
          <div className="student-search">
            <Icon name="search"/><input ref={searchRef} type="search" aria-label="Search pages" placeholder="Search pages…" value={query} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} aria-controls="student-search-results"/>
            <kbd>Ctrl K</kbd>
            {searchOpen && <div id="student-search-results" className="student-dropdown student-search-results"><p>GO TO PAGE</p>{results.length ? results.map(link => <AppLink key={link.area} href={link.href} onClick={closeNavigation}><Icon name={link.icon}/>{link.label}</AppLink>) : <p>No matching pages.</p>}</div>}
          </div>
          <div className="student-header-actions">
            <button className="student-icon-button student-theme-toggle" type="button" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}><Icon name={dark ? 'sun' : 'moon'}/></button>
            <div className="student-account">
              <button className="student-account-toggle" type="button" aria-label="Student account" aria-expanded={accountOpen} aria-controls="student-account-menu" onClick={() => { setAccountOpen(!accountOpen); setSearchOpen(false); }}><span className="student-avatar"><Icon name="user"/></span><span>Student</span><Icon name="chevron"/></button>
              {accountOpen && <div id="student-account-menu" className="student-dropdown student-account-menu"><strong>Student account</strong><p>Subject Advisors</p><AppLink href="/student/profile" onClick={closeNavigation}><Icon name="user"/>Academic profile</AppLink><div className="student-shell-logout"><LogoutButton/></div></div>}
            </div>
          </div>
        </div>
      </header>
      <main className="student-content"><nav className="student-breadcrumb" aria-label="Breadcrumb"><span>Student workspace</span><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>{children}</main>
    </div>
  </div>;
}
