import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { AuthGate } from '../features/auth';
import { installedPages } from '../../../../.generated-integration/web';
import type { InstalledStudentPages } from './feature-contracts';
import { StudentShell } from './StudentShell';
import { PathwayPage } from '../features/pathway';
import { ProgressPage } from '../features/p001-sprint2/ProgressPage';
import { createSprint2Client } from '../features/p001-sprint2/client';
import { createAcademicClient } from '../features/profile/client';
import { useAccountApiBase } from '../features/auth/account-context';
export type StudentArea = 'setup' | 'profile' | 'records' | 'offerings' | 'pathway' | 'progress';
export function StudentAreaContent({ area, pages = installedPages }: { area: StudentArea; pages?: InstalledStudentPages }) {
  const { getToken, userId, sessionId } = useAuth();
  const apiBase = useAccountApiBase();
  const progressApi = useMemo(() => createSprint2Client(getToken, apiBase), [getToken, apiBase]);
  const academicApi = useMemo(() => createAcademicClient(getToken, apiBase), [getToken, apiBase]);
  const Page = area === 'setup' || area === 'profile' ? pages.Profile : area === 'records' ? pages.Records : area === 'offerings' ? pages.Offerings : area === 'progress' ? null : PathwayPage;
  const title = area === 'setup' ? 'Academic profile setup' : area === 'profile' ? 'Academic profile' : area === 'records' ? 'Subject records' : area === 'offerings' ? 'Semester offerings' : area === 'progress' ? 'Academic progress' : 'Academic pathway';
  return <StudentShell area={area} title={title} key={[userId, sessionId].join('|')}>
    {area === 'progress' ? <ProgressPage key={area} api={progressApi} offerings={academicApi} /> : Page ? <Page key={area} getToken={getToken} setup={area === 'setup'} /> : <section className="student-shell-unavailable" role="status">
      <h1>{title}</h1><p>This page is not available yet. Please try again when the service is enabled.</p>
      <p>Your account and saved academic information remain unchanged.</p>
    </section>}
  </StudentShell>;
}
export function StudentRoutes({ area }: { area: StudentArea }) {
  return <AuthGate roles={['STUDENT']} requireProfile={area === 'records' || area === 'offerings' || area === 'pathway' || area === 'progress'}><StudentAreaContent area={area} /></AuthGate>;
}
