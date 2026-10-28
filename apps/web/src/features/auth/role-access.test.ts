import { describe, expect, it } from 'vitest';
import { roleForPath } from './role-access';

describe('roleForPath', () => {
  it.each(['/admin', '/admin/users', '/admin/users/25', '/admin/audit', '/admin/requirements/'])('selects System Admin for %s', path => {
    expect(roleForPath(path, 'STUDENT')).toBe('SYSTEM_ADMIN');
  });
  it.each(['/coordinator', '/coordinator/imports', '/coordinator/forecasts/versions', '/coordinator/audit/'])('selects Coordinator for %s', path => {
    expect(roleForPath(path, 'STUDENT')).toBe('COORDINATOR');
  });
  it('keeps path boundaries and preserves the fallback for unrelated routes', () => {
    expect(roleForPath('/administrator', 'COORDINATOR')).toBe('COORDINATOR');
    expect(roleForPath('/coordinators', 'SYSTEM_ADMIN')).toBe('SYSTEM_ADMIN');
    expect(roleForPath('/student/records', 'SYSTEM_ADMIN')).toBe('STUDENT');
    expect(roleForPath('/sign-in', 'COORDINATOR')).toBe('COORDINATOR');
  });
});
