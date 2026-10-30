import { AuthGate } from '../auth';
import { useAppLocation } from '../../app/navigation';
import { StaffNavigationShell, StaffPlannedPage, type StaffNavigationGroup } from '../admin/staff-navigation';
import { AppLink } from '../../app/navigation';

const groups: StaffNavigationGroup[] = [
  { label: 'Workspace', links: [{ href: '/coordinator', label: 'Overview', icon: 'overview' }] },
  { label: 'Academic data', links: [{ href: '/coordinator/imports', label: 'Data Imports', icon: 'data' }, { href: '/coordinator/data-quality', label: 'Data Quality', icon: 'quality' }] },
  { label: 'Forecast planning', links: [{ href: '/coordinator/forecasts', label: 'Class Offering Forecast', icon: 'forecast' }, { href: '/coordinator/versions', label: 'Forecast Versions', icon: 'versions' }, { href: '/coordinator/comparison', label: 'Compare Versions', icon: 'compare' }, { href: '/coordinator/decisions', label: 'Offering Decisions', icon: 'decisions' }] },
  { label: 'Audit', links: [{ href: '/coordinator/audit', label: 'Decision Audit', icon: 'audit' }] },
];
const pages: Record<string, { title: string; description: string }> = {
  '/coordinator/imports': { title: 'Data Imports', description: 'Review the separate external academic-data snapshots used for forecast planning.' },
  '/coordinator/data-quality': { title: 'Data Quality', description: 'Review validation results and source coverage before planning.' },
  '/coordinator/forecasts': { title: 'Class Offering Forecast', description: 'Prepare advisory class-offering forecasts from reviewed academic snapshots.' },
  '/coordinator/versions': { title: 'Forecast Versions', description: 'Review numbered forecast versions and their lifecycle.' },
  '/coordinator/comparison': { title: 'Compare Versions', description: 'Compare forecast versions before decisions are reviewed.' },
  '/coordinator/decisions': { title: 'Offering Decisions', description: 'Review decisions about forecast class offerings.' },
  '/coordinator/audit': { title: 'Decision Audit', description: 'Review the recorded history of forecast and offering decisions.' },
};
const quickLinks = groups.slice(1).flatMap(group => group.links);

function Overview() {
  return <><header className="admin-page-heading"><div><p className="admin-eyebrow">COORDINATOR WORKSPACE</p><h1>Overview</h1><p>Choose a workspace to review academic snapshots, forecast planning and decisions.</p></div></header>
    <div className="admin-metrics coordinator-quicklinks">{quickLinks.map(link => <AppLink className="admin-card coordinator-quicklink" href={link.href} key={link.href}><strong>{link.label}</strong><span>Planned workspace <span aria-hidden="true">→</span></span></AppLink>)}</div>
    <p className="coordinator-separation-note">Coordinator planning data is separate from student academic records.</p>
  </>;
}

function Workspace() {
  const path = new URL(useAppLocation(), window.location.origin).pathname.replace(/\/$/, '') || '/coordinator';
  const page = pages[path];
  const title = page?.title ?? (path === '/coordinator' ? 'Overview' : 'Page not found');
  return <StaffNavigationShell path={path} title={title} workspace="Coordinator" roleLabel="Academic coordinator" home="/coordinator" navLabel="Coordinator navigation" groups={groups} variant="coordinator">
    {path === '/coordinator' ? <Overview/> : page ? <StaffPlannedPage {...page}/> : <section className="admin-card"><h1>Page not found</h1><p>Choose a page from the coordinator menu.</p></section>}
  </StaffNavigationShell>;
}

export function CoordinatorRoutes() { return <AuthGate roles={['COORDINATOR']}><Workspace/></AuthGate>; }
