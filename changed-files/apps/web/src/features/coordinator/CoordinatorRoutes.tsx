import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { AuthGate } from '../auth';
import { useAccountApiBase } from '../auth/account-context';
import { useAppLocation } from '../../app/navigation';
import { StaffNavigationShell, StaffPlannedPage, type StaffNavigationGroup } from '../admin/staff-navigation';
import { AppLink } from '../../app/navigation';
import { createCoordinatorClient } from './client';
import { DecisionsPage } from './DecisionsPage';
import { ForecastsPage } from './ForecastsPage';
import { InitialDemandPage } from './InitialDemandPage';
import { ImportsPage } from './ImportsPage';

const groups: StaffNavigationGroup[] = [
  { label: 'Workspace', links: [{ href: '/coordinator', label: 'Overview', icon: 'overview' }] },
  { label: 'Academic data', links: [{ href: '/coordinator/imports', label: 'Data Imports', icon: 'data' }, { href: '/coordinator/data-quality', label: 'Data Quality', icon: 'quality' }] },
  { label: 'Forecast planning', links: [{ href: '/coordinator/initial-demand', label: 'Initial Eligible Demand', icon: 'forecast' }, { href: '/coordinator/forecasts', label: 'Class Offering Forecast', icon: 'forecast' }, { href: '/coordinator/versions', label: 'Forecast Versions', icon: 'versions' }, { href: '/coordinator/comparison', label: 'Compare Versions', icon: 'compare' }, { href: '/coordinator/decisions', label: 'Offering Decisions', icon: 'decisions' }] },
  { label: 'Audit', links: [{ href: '/coordinator/audit', label: 'Decision Audit', icon: 'audit' }] },
];
const pages: Record<string, { title: string; description: string }> = {
  '/coordinator/initial-demand': { title: 'Initial Eligible Demand', description: 'Identify subjects needed by at least 30 eligible students before resource refinement.' },
  '/coordinator/imports': { title: 'Data Imports', description: 'Upload and validate student academic history, and keep accepted snapshots for forecast planning.' },
  '/coordinator/data-quality': { title: 'Data Quality', description: 'Review validation results and source coverage before planning.' },
  '/coordinator/forecasts': { title: 'Class Offering Forecast', description: 'Review potential demand and proposed classes, then finalize the forecast.' },
  '/coordinator/versions': { title: 'Forecast Versions', description: 'Review numbered forecast versions and their lifecycle.' },
  '/coordinator/comparison': { title: 'Compare Versions', description: 'Compare forecast versions before decisions are reviewed.' },
  '/coordinator/decisions': { title: 'Offering Decisions', description: 'Confirm the subjects offered next semester and set the pick deadline.' },
  '/coordinator/audit': { title: 'Decision Audit', description: 'Review the recorded history of forecast and offering decisions.' },
};
const quickLinks = groups.slice(1).flatMap(group => group.links);

function Overview() {
  return <><header className="admin-page-heading"><div><p className="admin-eyebrow">COORDINATOR WORKSPACE</p><h1>Overview</h1><p>Choose a workspace to review academic snapshots, forecast planning and decisions.</p></div></header>
    <div className="admin-metrics coordinator-quicklinks">{quickLinks.map(link => <AppLink className="admin-card coordinator-quicklink" href={link.href} key={link.href}><strong>{link.label}</strong><span>{['/coordinator/imports', '/coordinator/initial-demand', '/coordinator/forecasts', '/coordinator/decisions'].includes(link.href) ? 'Open workspace' : 'Planned workspace'} <span aria-hidden="true">→</span></span></AppLink>)}</div>
    <p className="coordinator-separation-note">Coordinator planning data is separate from student academic records.</p>
  </>;
}

function Workspace() {
  const { getToken, userId, sessionId } = useAuth();
  const apiBase = useAccountApiBase();
  const client = useMemo(() => createCoordinatorClient(getToken, apiBase), [getToken, apiBase]);
  const location = new URL(useAppLocation(), window.location.origin);
  const path = location.pathname.replace(/\/$/, '') || '/coordinator';
  const page = pages[path];
  const title = page?.title ?? (path === '/coordinator' ? 'Overview' : 'Page not found');
  return <StaffNavigationShell path={path} title={title} workspace="Coordinator" roleLabel="Academic coordinator" home="/coordinator" navLabel="Coordinator navigation" groups={groups} variant="coordinator">
    <div key={[userId, sessionId, path].join('|')}>{path === '/coordinator' ? <Overview/> : path === '/coordinator/imports' ? <ImportsPage client={client} search={location.search}/> : path === '/coordinator/initial-demand' ? <InitialDemandPage client={client} search={location.search}/> : path === '/coordinator/forecasts' ? <ForecastsPage client={client} search={location.search}/> : path === '/coordinator/decisions' ? <DecisionsPage client={client} search={location.search}/> : page ? <StaffPlannedPage {...page}/> : <section className="admin-card"><h1>Page not found</h1><p>Choose a page from the coordinator menu.</p></section>}</div>
  </StaffNavigationShell>;
}

export function CoordinatorRoutes() { return <AuthGate roles={['COORDINATOR']}><Workspace/></AuthGate>; }
