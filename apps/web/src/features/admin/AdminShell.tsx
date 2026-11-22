import type { ReactNode } from 'react';
import { StaffNavigationShell, type StaffNavigationGroup } from './staff-navigation';

const groups: StaffNavigationGroup[] = [
  // Single-link groups render as plain menu links with no heading; only Academic setup keeps a heading for its seven pages.
  { label: 'Overview', links: [{ href: '/admin', label: 'Overview', icon: 'overview' }] },
  { label: 'Users & Access', links: [{ href: '/admin/users', label: 'Users & Access', icon: 'users' }] },
  { label: 'Academic setup', links: [{ href: '/admin/learning-centres', label: 'Learning Centres', icon: 'centre' }, { href: '/admin/faculties', label: 'Faculties', icon: 'faculty' }, { href: '/admin/departments', label: 'Departments', icon: 'department' }, { href: '/admin/programmes', label: 'Programmes', icon: 'programme' }, { href: '/admin/coordinator-assignments', label: 'Coordinator Assignments', icon: 'users' }, { href: '/admin/semesters', label: 'Academic Semesters', icon: 'calendar' }, { href: '/admin/curriculum', label: 'Subjects & Prerequisites', icon: 'curriculum' }] },
  { label: 'Audit', links: [{ href: '/admin/audit', label: 'Audit Log', icon: 'audit' }] },
];

export function AdminShell({ path, title, children, actions }: { path: string; title: string; children: ReactNode; actions?: ReactNode }) {
  return <StaffNavigationShell path={path} title={title} workspace="Administration" roleLabel="System administrator" home="/admin" navLabel="Administration navigation" groups={groups} actions={actions}>{children}</StaffNavigationShell>;
}
