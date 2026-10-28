import type { AppRole, Me } from './contracts';

export const roleLabels: Record<AppRole, string> = { STUDENT: 'Student', COORDINATOR: 'Academic Coordinator', SYSTEM_ADMIN: 'System Admin' };
export function roleLandingPath(me: Me, role: AppRole): Me['landingPath'] {
  return role === 'SYSTEM_ADMIN' ? '/admin' : role === 'COORDINATOR' ? '/coordinator'
    : me.studentProfileState === 'COMPLETE' ? '/student' : '/student/setup';
}
export function roleForPath(path: string, fallback: AppRole): AppRole {
  return path === '/admin' ? 'SYSTEM_ADMIN' : path === '/coordinator' ? 'COORDINATOR'
    : path === '/student' || path.startsWith('/student/') ? 'STUDENT' : fallback;
}
