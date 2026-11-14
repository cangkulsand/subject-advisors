import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { AuthGate } from '../auth';
import { useAppLocation } from '../../app/navigation';
import { useAccountApiBase } from '../auth/account-context';
import { createAdminClient } from './client';
import { createAcademicSetupClient } from './academic-client';
import { ReferenceSetupPage } from './ReferenceSetupPage';
import { DepartmentsPage } from './DepartmentsPage';
import { SemestersPage } from './SemestersPage';
import { CoordinatorAssignmentsPage } from './CoordinatorAssignmentsPage';
import { AdminShell } from './AdminShell';
import { AdminAccountPage, AdminAuditPage, AdminOverviewPage, AdminUsersPage } from './AdminPages';
import { StaffPlannedPage } from './staff-navigation';

const plannedAdminPages: Record<string, { title: string; description: string }> = {
  '/admin/curriculum': { title: 'Curriculum & Prerequisites', description: 'Maintain approved curriculum subjects, prerequisite links and curriculum versions.' },
  '/admin/requirements': { title: 'Graduation Requirements', description: 'Maintain the approved graduation requirements used for academic guidance.' },
};

function Workspace() {
  const { getToken, userId, sessionId } = useAuth();
  const apiBase = useAccountApiBase();
  const client = useMemo(() => createAdminClient(getToken, apiBase), [getToken, apiBase]);
  const academic = useMemo(() => createAcademicSetupClient(getToken, apiBase), [getToken, apiBase]);
  const location = new URL(useAppLocation(), window.location.origin);
  const pathname = location.pathname.replace(/\/$/, '');
  const detail = /^\/admin\/users\/([1-9]\d*)$/.exec(pathname);
  const planned = plannedAdminPages[pathname];
  const setupTitles: Record<string, string> = { '/admin/learning-centres': 'Learning Centres', '/admin/faculties': 'Faculties', '/admin/departments': 'Departments', '/admin/semesters': 'Academic Semesters', '/admin/coordinator-assignments': 'Coordinator Assignments' };
  const title = setupTitles[pathname] ?? ( pathname === '/admin/users' ? 'Users & Access' : detail ? 'Account details' : pathname === '/admin/audit' ? 'Audit Log' : planned?.title ?? (pathname === '/admin' ? 'Overview' : 'Page not found'));
  const key = [userId, sessionId, pathname, location.search].join('|');
  return <AdminShell path={pathname} title={title}><div key={key}>
    {pathname === '/admin' ? <AdminOverviewPage client={client}/> : pathname === '/admin/users' ? <AdminUsersPage client={client} search={location.search}/> : detail && Number(detail[1]) <= 2147483647 ? <AdminAccountPage client={client} accountId={Number(detail[1])} viewerClerkUserId={userId}/> : pathname === '/admin/audit' ? <AdminAuditPage client={client}/> : pathname === '/admin/learning-centres' ? <ReferenceSetupPage client={academic} kind="centre"/> : pathname === '/admin/faculties' ? <ReferenceSetupPage client={academic} kind="faculty"/> : pathname === '/admin/departments' ? <DepartmentsPage client={academic}/> : pathname === '/admin/semesters' ? <SemestersPage client={academic}/> : pathname === '/admin/coordinator-assignments' ? <CoordinatorAssignmentsPage client={academic} users={client}/> : planned ? <StaffPlannedPage {...planned}/> : <section className="admin-card"><h1>Page not found</h1><p>Choose a page from the administration menu.</p></section>}
  </div></AdminShell>;
}
export function AdminRoutes() { return <AuthGate roles={['SYSTEM_ADMIN']}><Workspace/></AuthGate>; }
