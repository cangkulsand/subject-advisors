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
import { CurriculumPage } from '../p001-sprint2/CurriculumPage';
import { createSprint2Client, type Sprint2Client } from '../p001-sprint2/client';
import type { Catalogue } from '../../../../api/src/modules/p001-sprint2/contracts';
import { useEffect, useMemo, useState } from 'react';

const groups: StaffNavigationGroup[] = [
  { label: 'Workspace', links: [{ href: '/coordinator', label: 'Overview', icon: 'overview' }] },
  // Data Imports left the menu (S3-P004-032): the forecast reads live student data. The page stays reachable by its URL for the hidden CSV import.
  // One link per group: single-link groups render as plain menu links with no group heading.
  { label: 'Offering Forecast', links: [{ href: '/coordinator/forecasts', label: 'Offering Forecast', icon: 'forecast' }] },
  { label: 'Offering History', links: [{ href: '/coordinator/history', label: 'Offering History', icon: 'history' }] },
  // S3-P004-041: subjects of the curricula in the coordinator's scope.
  { label: 'Curriculum & Subjects', links: [{ href: '/coordinator/curriculum', label: 'Curriculum & Subjects', icon: 'curriculum' }] },
];
// Page titles for the main landmark label; each page renders its own heading and description.
const pages: Record<string, { title: string }> = {
  '/coordinator/imports': { title: 'Data Imports' },
  '/coordinator/forecasts': { title: 'Class Offering Forecast' },
  '/coordinator/history': { title: 'Offering History' },
  '/coordinator/curriculum': { title: 'Curriculum & Subjects' },
};
const quickLinks = groups.slice(1).flatMap(group => group.links);

function Overview() {
  return <><header className="admin-page-heading"><div><h1>Overview</h1><p>Choose a workspace to plan class offerings from live student data and look back at past semesters.</p></div></header>
    <div className="admin-metrics coordinator-quicklinks">{quickLinks.map(link => <AppLink className="admin-card coordinator-quicklink" href={link.href} key={link.href}><strong>{link.label}</strong><span>Open workspace <span aria-hidden="true">→</span></span></AppLink>)}</div>
    <p className="coordinator-separation-note">The forecast reads students' own academic records and never changes them.</p>
  </>;
}

/** The curriculum editor limited to the coordinator's scope; with nothing in scope it says how to get an assignment. */
function CoordinatorCurriculum({ api }: { api: Sprint2Client }) {
  const [empty, setEmpty] = useState<boolean | null>(null);
  useEffect(() => { const c = new AbortController(); api<Catalogue>('/curricula', { signal: c.signal }).then(v => { if (!c.signal.aborted) setEmpty(!v.curricula.length); }, () => { if (!c.signal.aborted) setEmpty(false); }); return () => c.abort(); }, [api]);
  if (empty === null) return <p role="status" className="admin-loading">Loading curricula…</p>;
  if (empty) return <section className="admin-card"><p className="admin-notice" role="status">You are not assigned to any programme yet. Ask a system administrator to assign you in Coordinators.</p></section>;
  return <CurriculumPage api={api} role="coordinator"/>;
}

function Workspace() {
  const { getToken, userId, sessionId } = useAuth();
  const apiBase = useAccountApiBase();
  const client = useMemo(() => createCoordinatorClient(getToken, apiBase), [getToken, apiBase]);
  const curriculum = useMemo(() => createSprint2Client(getToken, apiBase), [getToken, apiBase]);
  const location = new URL(useAppLocation(), window.location.origin);
  const path = location.pathname.replace(/\/$/, '') || '/coordinator';
  const page = pages[path];
  const title = page?.title ?? (path === '/coordinator' ? 'Overview' : 'Page not found');
  return <StaffNavigationShell path={path} title={title} workspace="Coordinator" roleLabel="Academic coordinator" home="/coordinator" navLabel="Coordinator navigation" groups={groups} variant="coordinator">
    <div key={[userId, sessionId, path].join('|')}>{path === '/coordinator' ? <Overview/> : path === '/coordinator/imports' ? <ImportsPage client={client} search={location.search}/> : path === '/coordinator/forecasts' ? <ForecastsPage client={client} search={location.search}/> : path === '/coordinator/history' ? <OfferingHistoryPage client={client}/> : path === '/coordinator/curriculum' ? <CoordinatorCurriculum api={curriculum}/> : <section className="admin-card"><h1>Page not found</h1><p>Choose a page from the coordinator menu.</p></section>}</div>
  </StaffNavigationShell>;
}

export function CoordinatorRoutes() { return <AuthGate roles={['COORDINATOR']}><Workspace/></AuthGate>; }
