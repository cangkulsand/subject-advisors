import { useAuth } from '@clerk/react';
import { AuthGate } from '../features/auth';
import { installedPages } from '../../../../.generated-integration/web';
import type { InstalledStudentPages } from './feature-contracts';
import { StudentShell } from './StudentShell';
import { PathwayPage } from '../features/pathway';
export type StudentArea = 'setup' | 'profile' | 'records' | 'offerings' | 'pathway';
export function StudentAreaContent({ area, pages = installedPages }: { area: StudentArea; pages?: InstalledStudentPages }) {
  const { getToken, userId, sessionId } = useAuth();
  const Page = area === 'setup' || area === 'profile' ? pages.Profile : area === 'records' ? pages.Records : area === 'offerings' ? pages.Offerings : PathwayPage;
  const title = area === 'setup' ? 'Academic profile setup' : area === 'profile' ? 'Academic profile' : area === 'records' ? 'Subject records' : area === 'offerings' ? 'Semester offerings' : 'Academic pathway';
  return <StudentShell area={area} title={title} key={[userId, sessionId].join('|')}>
    {Page ? <Page key={area} getToken={getToken} setup={area === 'setup'} /> : <section className="student-shell-unavailable" role="status">
      <h1>{title}</h1><p>This page is not available yet. Please try again when the service is enabled.</p>
      <p>Your account and saved academic information remain unchanged.</p>
    </section>}
  </StudentShell>;
}
export function StudentRoutes({ area }: { area: StudentArea }) {
  return <AuthGate roles={['STUDENT']} requireProfile={area === 'records' || area === 'offerings' || area === 'pathway'}><StudentAreaContent area={area} /></AuthGate>;
}
