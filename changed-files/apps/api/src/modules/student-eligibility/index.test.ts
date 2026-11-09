import { expect, it, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createStudentEligibilityHandler } from './index';
import type { AuthDependencies } from '../auth/contracts';
import { OWN_ELIGIBILITY_SQL } from './repository';
const query = vi.hoisted(() => vi.fn(async () => []));
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn(() => ({ query })) }));
it('wires the production SQL reader to supplied real profile auth, without constructing a second auth service', async () => {
  const profiles = { stateFor: vi.fn(async () => 'COMPLETE' as const) };
  const auth: AuthDependencies = { verify: vi.fn(async () => ({ clerkUserId: 'own-user', sessionId: 'own-session', primaryEmail: { address: 'demo@graduate.utm.my', verified: true } })),
    access: { find: vi.fn(async () => ({ clerkUserId: 'own-user', appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() }, profiles };
  const handle = createStudentEligibilityHandler({ DATABASE_URL: 'TEST_ONLY_DATABASE_BINDING' }, auth);
  const response = await handle(new Request('https://test.invalid/api/student/eligible-offerings'));
  expect(neon).toHaveBeenCalledWith('TEST_ONLY_DATABASE_BINDING'); expect(profiles.stateFor).toHaveBeenCalledWith('own-user');
  expect(query).toHaveBeenCalledWith(OWN_ELIGIBILITY_SQL, ['own-user', 1]);
  expect(response?.status).toBe(409); // Mocked database has no own profile; no fabricated data is returned.
});
