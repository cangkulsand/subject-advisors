import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { AuthGate } from '../auth';
import { useAccountApiBase } from '../auth/account-context';
import { useAppLocation } from '../../app/navigation';
import { StaffNavigationShell, type StaffNavigationGroup } from '../admin/staff-navigation';
import { AppLink } from '../../app/navigation';
import { createCoordinatorClient } from './client';
import { ForecastsPage } from './ForecastsPage';
import { ImportsPage } from './ImportsPage';
import { OfferingHistoryPage } from './OfferingHistoryPage';

const groups: StaffNavigationGroup[] = [
  { label: 'Workspace', links: [{ href: '/coordinator', label: 'Overview', icon: 'overview' }] },
  { label: 'Academic data', links: [{ href: '/coordinator/imports', label: 'Data Imports', icon: 'data' }] },
  { label: 'Forecast planning', links: [{ href: '/coordinator/forecasts', label: 'Class Offering Forecast', icon: 'forecast' }, { href: '/coordinator/history', label: 'Offering History', icon: 'history' }] },
];
const pages: Record<string, { title: string; description: string }> = {
  '/coordinator/imports': { title: 'Data Imports', description: 'Upload and validate student academic history, and keep accepted snapshots for forecast planning.' },
  '/coordinator/forecasts': { title: 'Class Offering Forecast', description: 'Look at the forecast for a student data snapshot and decide which subjects are offered.' },
  '/coordinator/history': { title: 'Offering History', description: "Look back at past semesters' offering decisions and how many students picked each subject." },
};
const quickLinks = groups.slice(1).flatMap(group => group.links);

function Overview() {
  return <><header className="admin-page-heading"><div><h1>Overview</h1><p>Choose a workspace to import academic snapshots, plan class offerings and look back at past semesters.</p></div></header>
    <div className="admin-metrics coordinator-quicklinks">{quickLinks.map(link => <AppLink className="admin-card coordinator-quicklink" href={link.href} key={link.href}><strong>{link.label}</strong><span>Open workspace <span aria-hidden="true">→</span></span></AppLink>)}</div>
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
    <div key={[userId, sessionId, path].join('|')}>{path === '/coordinator' ? <Overview/> : path === '/coordinator/imports' ? <ImportsPage client={client} search={location.search}/> : path === '/coordinator/forecasts' ? <ForecastsPage client={client} search={location.search}/> : path === '/coordinator/history' ? <OfferingHistoryPage client={client}/> : <section className="admin-card"><h1>Page not found</h1><p>Choose a page from the coordinator menu.</p></section>}</div>
  </StaffNavigationShell>;
}

export function CoordinatorRoutes() { return <AuthGate roles={['COORDINATOR']}><Workspace/></AuthGate>; }
