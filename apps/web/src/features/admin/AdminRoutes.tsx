import { useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { AuthGate } from '../auth';
import { navigateApp, useAppLocation } from '../../app/navigation';
import { useAccountApiBase } from '../auth/account-context';
import { createAdminClient } from './client';
import { ViewAsButton } from './ViewAsDialog';
import { createAcademicSetupClient } from './academic-client';
import { ReferenceSetupPage } from './ReferenceSetupPage';
import { AcademicStructurePage } from './AcademicStructurePage';
import { parseStructurePath } from './academic-structure';
import { SemestersPage } from './SemestersPage';
import { CoordinatorAssignmentsPage } from './CoordinatorAssignmentsPage';
import { AdminShell } from './AdminShell';
import { AdminAccountPage, AdminAuditPage, AdminOverviewPage, AdminUsersPage } from './AdminPages';
import { createSprint2Client } from '../p001-sprint2/client';
import { CurriculumPage } from '../p001-sprint2/CurriculumPage';

/** The Departments and Programmes pages became levels of Academic Structure (S3-P004-038); old links land on its Faculties root. */
function RedirectToStructure() {
  useEffect(() => { navigateApp('/admin/faculties', { replace: true }); }, []);
  return <p role="status">Opening Academic Structure…</p>;
}

function Workspace() {
  const { getToken, userId, sessionId } = useAuth();
  const apiBase = useAccountApiBase();
  const client = useMemo(() => createAdminClient(getToken, apiBase), [getToken, apiBase]);
  const academic = useMemo(() => createAcademicSetupClient(getToken, apiBase), [getToken, apiBase]);
  const curriculum = useMemo(() => createSprint2Client(getToken, apiBase), [getToken, apiBase]);
  const location = new URL(useAppLocation(), window.location.origin);
  const pathname = location.pathname.replace(/\/$/, '');
  const detail = /^\/admin\/users\/([1-9]\d*)$/.exec(pathname);
  const setupTitles: Record<string, string> = { '/admin/learning-centres': 'Learning Centres', '/admin/departments': 'Academic Structure', '/admin/programmes': 'Academic Structure', '/admin/semesters': 'Academic Semesters', '/admin/coordinator-assignments': 'Coordinator Assignments' };
  const structure = parseStructurePath(pathname) !== null;
  const title = structure ? 'Academic Structure' : setupTitles[pathname] ?? ( pathname === '/admin/users' ? 'Users & Access' : detail ? 'Account details' : pathname === '/admin/audit' ? 'Audit Log' : pathname === '/admin/curriculum' ? 'Curriculum & Prerequisites' : (pathname === '/admin' ? 'Overview' : 'Page not found'));
  const key = [userId, sessionId, pathname, location.search].join('|');
  return <AdminShell path={pathname} title={title} actions={<ViewAsButton client={client} academic={academic}/>}><div key={key}>
    {pathname === '/admin' ? <AdminOverviewPage client={client}/> : pathname === '/admin/users' ? <AdminUsersPage client={client} academic={academic} search={location.search}/> : detail && Number(detail[1]) <= 2147483647 ? <AdminAccountPage client={client} accountId={Number(detail[1])} viewerClerkUserId={userId}/> : pathname === '/admin/audit' ? <AdminAuditPage client={client}/> : pathname === '/admin/learning-centres' ? <ReferenceSetupPage client={academic}/> : structure ? <AcademicStructurePage client={academic} pathname={pathname}/> : pathname === '/admin/departments' || pathname === '/admin/programmes' ? <RedirectToStructure/> : pathname === '/admin/semesters' ? <SemestersPage client={academic}/> : pathname === '/admin/coordinator-assignments' ? <CoordinatorAssignmentsPage client={academic} users={client}/> : pathname === '/admin/curriculum' ? <CurriculumPage api={curriculum} initialCurriculumId={location.searchParams.get('curriculum') ?? ''}/> : <section className="admin-card"><h1>Page not found</h1><p>Choose a page from the administration menu.</p></section>}
  </div></AdminShell>;
}
export function AdminRoutes() { return <AuthGate roles={['SYSTEM_ADMIN']}><Workspace/></AuthGate>; }
