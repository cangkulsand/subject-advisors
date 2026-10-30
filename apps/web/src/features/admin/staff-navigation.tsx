import { useEffect, useRef, type ReactNode } from 'react';
import { AppLink } from '../../app/navigation';
import { LogoutButton } from '../auth';
import { RoleSwitcher } from '../auth/RoleSwitcher';
import './admin.css';

export type StaffNavigationLink = { href: string; label: string; icon: string };
export type StaffNavigationGroup = { label: string; links: StaffNavigationLink[] };
const paths: Record<string, ReactNode> = {
  overview: <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m0-16a3 3 0 0 1 0 6m3 3a6 6 0 0 1 3 5v2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/></>,
  curriculum: <><path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3Zm0 14h16M8 7h8m-8 4h6"/></>,
  audit: <><path d="M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4"/></>,
  data: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5m-16 7v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
  quality: <><path d="M12 3 3 20h18L12 3Zm0 6v5m0 3h.01"/></>,
  forecast: <><path d="M3 20V4m0 16h18M6 16l4-5 4 2 6-8"/></>,
  versions: <><path d="M4 5h16M4 12h16M4 19h16M8 3v4m8 3v4m-5 3v4"/></>,
  compare: <><path d="M5 4h5v16H5zM14 4h5v16h-5zM10 8h4m-4 8h4"/></>,
  decisions: <><path d="m5 12 4 4L20 5"/><path d="M20 12v7H4V5h11"/></>,
};
function Icon({ name }: { name: string }) { return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name] ?? paths.data}</svg>; }

function isActivePath(path: string, href: string) {
  return path === href || (href !== '/admin' && href !== '/coordinator' && path.startsWith(`${href}/`));
}

function StaffNavigation({ groups, path, label, onNavigate }: { groups: StaffNavigationGroup[]; path: string; label: string; onNavigate: () => void }) {
  const detailsRefs = useRef<Array<HTMLDetailsElement | null>>([]);
  useEffect(() => {
    const activeIndex = groups.findIndex(group => group.links.some(link => isActivePath(path, link.href)));
    if (activeIndex >= 0 && detailsRefs.current[activeIndex]) detailsRefs.current[activeIndex]!.open = true;
  }, [path, groups]);
  return <nav aria-label={label}>
    {groups.map((group, index) => {
      const onlyLink = group.links.length === 1 ? group.links[0] : undefined;
      return <section className="staff-nav-group" key={group.label}>
      {onlyLink ? <AppLink href={onlyLink.href} className="admin-nav-link" aria-current={isActivePath(path, onlyLink.href) ? 'page' : undefined} onClick={onNavigate}><Icon name={onlyLink.icon}/><span>{onlyLink.label}</span></AppLink> :
        <details ref={element => { detailsRefs.current[index] = element; }} open>
          <summary>{group.label}<span aria-hidden="true">⌄</span></summary>
          <div className="staff-nav-group-links">{group.links.map(link => <AppLink key={link.href} href={link.href} className="admin-nav-link" aria-current={isActivePath(path, link.href) ? 'page' : undefined} onClick={onNavigate}><Icon name={link.icon}/><span>{link.label}</span></AppLink>)}</div>
        </details>}
    </section>;
    })}
  </nav>;
}

export function StaffNavigationShell({ path, title, workspace, roleLabel, home, navLabel, groups, children, variant = 'admin' }: {
  path: string; title: string; workspace: string; roleLabel: string; home: string; navLabel: string;
  groups: StaffNavigationGroup[]; children: ReactNode; variant?: 'admin' | 'coordinator';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.close(); }, [path]);
  const close = () => dialog.current?.close();
  const brand = <AppLink href={home} className="admin-brand" onClick={close}><span className="admin-brand-mark" aria-hidden="true">SA</span><span>Subject Advisors<small>{workspace.toUpperCase()}</small></span></AppLink>;
  return <div className={`admin-shell admin-shell-${variant}`}>
    <a href="#staff-content" className="admin-skip">Skip to content</a>
    <aside className="admin-sidebar" aria-label={`${workspace} workspace`}>{brand}<p className="admin-nav-caption">WORKSPACE</p><StaffNavigation groups={groups} path={path} label={navLabel} onNavigate={close}/><p className="admin-sidebar-foot">Academic advisory system</p></aside>
    <dialog ref={dialog} id="staff-mobile-menu" className="admin-drawer" aria-label={`${workspace} menu`} onClose={() => opener.current?.focus()} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], summary')].filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX > bounds.right || event.clientY > bounds.bottom || event.clientX < bounds.left || event.clientY < bounds.top)) close();
    }}>
      <button className="admin-drawer-close" type="button" onClick={close} aria-label="Close navigation">×</button>{brand}<StaffNavigation groups={groups} path={path} label={navLabel} onNavigate={close}/>
    </dialog>
    <div className="admin-main">
      <header className="admin-topbar"><div className="admin-topbar-title"><button ref={opener} type="button" className="admin-menu-button" aria-label="Open navigation" aria-haspopup="dialog" aria-controls="staff-mobile-menu" onClick={() => dialog.current?.showModal()}>☰</button><span>{workspace}</span></div>
        <div className="admin-topbar-actions"><RoleSwitcher/><span className="admin-admin-badge">{roleLabel}</span><LogoutButton/></div>
      </header>
      <main id="staff-content" tabIndex={-1} className="admin-content"><nav className="admin-breadcrumb" aria-label="Breadcrumb"><AppLink href={home}>{workspace}</AppLink><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>{children}</main>
    </div>
  </div>;
}

export function StaffPlannedPage({ title, description }: { title: string; description: string }) {
  return <section className="admin-card admin-planned-page">
    <p className="admin-eyebrow">STAFF WORKSPACE</p><div className="admin-page-heading"><div><h1>{title}</h1><p>{description}</p></div><span className="admin-pill">Coming soon</span></div>
    <p className="admin-planned-note">This workspace is planned. No academic data or decisions are being shown here.</p>
  </section>;
}
