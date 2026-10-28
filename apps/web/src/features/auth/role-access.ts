import type { AppRole, Me } from './contracts';

export const roleLabels: Record<AppRole, string> = { STUDENT: 'Student', COORDINATOR: 'Academic Coordinator', SYSTEM_ADMIN: 'System Admin' };
export function roleLandingPath(me: Me, role: AppRole): Me['landingPath'] {
  return role === 'SYSTEM_ADMIN' ? '/admin' : role === 'COORDINATOR' ? '/coordinator'
    : me.studentProfileState === 'COMPLETE' ? '/student' : '/student/setup';
}
export function roleForPath(path: string, fallback: AppRole): AppRole {
  const normalized = path.replace(/\/$/, '') || '/';
  const within = (base: string) => normalized === base || normalized.startsWith(`${base}/`);
  return within('/admin') ? 'SYSTEM_ADMIN' : within('/coordinator') ? 'COORDINATOR'
    : within('/student') ? 'STUDENT' : fallback;
}
