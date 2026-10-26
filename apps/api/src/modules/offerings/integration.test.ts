import { describe, expect, it, vi } from 'vitest';
import type { AuthBindings, ProfileReader } from '../auth';
import { createOfferingHandler } from './integration';

const env: AuthBindings = { CLERK_SECRET_KEY: '', CLERK_PUBLISHABLE_KEY: '', CLERK_AUTHORIZED_PARTIES: '', DATABASE_URL: '' };
describe('production offering handler composition', () => {
  it('does not initialize providers for another owner\'s route', async () => {
    const profiles: ProfileReader = { stateFor: vi.fn(async () => 'UNAVAILABLE' as const) };
    const handle = createOfferingHandler(env, { profiles });
    expect(await handle(new Request('https://test.invalid/api/profile'))).toBeNull();
    expect(profiles.stateFor).not.toHaveBeenCalled();
  });
  it('fails closed with missing provider configuration and reveals no secret', async () => {
    const profiles: ProfileReader = { stateFor: vi.fn(async () => 'COMPLETE' as const) };
    const response = await createOfferingHandler(env, { profiles })(new Request('https://test.invalid/api/semester-offerings'));
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('postgres://');
    expect(profiles.stateFor).not.toHaveBeenCalled();
  });
});
