import type { ComponentType } from 'react';
import type { StudentPageProps } from '../../app/feature-contracts';

/** P003 UC17 entry point. Replace this placeholder with the read-only pathway UI. */
export const PathwayPage: ComponentType<StudentPageProps> = () => (
  <section className="student-shell-unavailable" aria-labelledby="pathway-title">
    <h1 id="pathway-title">Academic pathway</h1>
    <p role="status">Coming soon</p>
    <p>Your curriculum subjects and prerequisite map will appear here when this feature is available.</p>
    <p>You can continue updating your <a href="/student/profile">academic profile</a> and <a href="/student/records">subject records</a>.</p>
    <p>Advisory roadmap — future offerings and graduation dates are not guaranteed.</p>
  </section>
);
