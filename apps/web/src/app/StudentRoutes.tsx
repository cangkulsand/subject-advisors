import { useAuth } from '@clerk/react';
import { AuthGate, LogoutButton } from '../features/auth';
import { installedPages } from '../../../../.generated-integration/web';
import type { InstalledStudentPages } from './feature-contracts';
import './student-shell.css';
export type StudentArea = 'setup' | 'profile' | 'records' | 'offerings';
export function StudentAreaContent({ area, pages = installedPages }: { area: StudentArea; pages?: InstalledStudentPages }) {
  const { getToken, userId, sessionId } = useAuth();
  const Page = area === 'setup' || area === 'profile' ? pages.Profile : area === 'records' ? pages.Records : pages.Offerings;
  const title = area === 'setup' ? 'Academic profile setup' : area === 'profile' ? 'Academic profile' : area === 'records' ? 'Subject records' : 'Semester offerings';
  return <div className="student-shell" key={[userId, sessionId].join('|')}>
    <header className="student-shell-header"><a href="/student" className="student-shell-brand">Subject Advisors</a>
      <nav aria-label="Student navigation">
        <a href="/student/profile" aria-current={area === 'profile' || area === 'setup' ? 'page' : undefined}>Academic profile</a>
        <a href="/student/records" aria-current={area === 'records' ? 'page' : undefined}>Subject records</a>
        <a href="/student/offerings" aria-current={area === 'offerings' ? 'page' : undefined}>Semester offerings</a>
      </nav><LogoutButton />
    </header>
    <main>{Page ? <Page getToken={getToken} setup={area === 'setup'} /> : <section className="student-shell-unavailable" role="status">
      <h1>{title}</h1><p>This page is not available yet. Please try again when the service is enabled.</p>
      <p>Your account and saved academic information remain unchanged.</p>
    </section>}</main>
  </div>;
}
export function StudentRoutes({ area }: { area: StudentArea }) {
  return <AuthGate roles={['STUDENT']} requireProfile={area === 'records' || area === 'offerings'}>
    <StudentAreaContent area={area} />
  </AuthGate>;
}
