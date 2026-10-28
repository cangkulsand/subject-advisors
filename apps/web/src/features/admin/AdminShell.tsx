import type { ReactNode } from 'react';
import { StaffNavigationShell, type StaffNavigationGroup } from './staff-navigation';

const groups: StaffNavigationGroup[] = [
  { label: 'Workspace', links: [{ href: '/admin', label: 'Overview', icon: 'overview' }, { href: '/admin/users', label: 'Users & Access', icon: 'users' }] },
  { label: 'Academic setup', links: [{ href: '/admin/semesters', label: 'Academic Semesters', icon: 'calendar' }, { href: '/admin/curriculum', label: 'Curriculum & Prerequisites', icon: 'curriculum' }, { href: '/admin/requirements', label: 'Graduation Requirements', icon: 'curriculum' }] },
  { label: 'Audit', links: [{ href: '/admin/audit', label: 'Audit Log', icon: 'audit' }] },
];

export function AdminShell({ path, title, children }: { path: string; title: string; children: ReactNode }) {
  return <StaffNavigationShell path={path} title={title} workspace="Administration" roleLabel="System administrator" home="/admin" navLabel="Administration navigation" groups={groups}>{children}</StaffNavigationShell>;
}
