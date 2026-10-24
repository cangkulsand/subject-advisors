import { beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  authenticateRequest: vi.fn(), sessions: { getSession: vi.fn() }, users: { getUser: vi.fn() },
}));
vi.mock('@clerk/backend', () => ({ createClerkClient: vi.fn(() => sdk) }));
import { createClerkVerifier } from './clerk';
const config = { secretKey: 'test-only', publishableKey: 'test-only', authorizedParties: ['https://web.test'] };
const request = () => new Request('https://api.test/api/me', { headers: { Authorization: 'Bearer test-only' } });
beforeEach(() => {
  sdk.authenticateRequest.mockReset().mockResolvedValue({
    isAuthenticated: true, toAuth: () => ({ userId: 'user_a', sessionId: 'sess_a' }),
  });
  sdk.sessions.getSession.mockReset().mockResolvedValue({ userId: 'user_a', status: 'active', expireAt: Date.now() + 60000 });
  sdk.users.getUser.mockReset().mockResolvedValue({ id: 'user_a', primaryEmailAddressId: 'primary',
    emailAddresses: [{ id: 'primary', emailAddress: 'test@graduate.utm.my', verification: { status: 'verified' } }],
  });
});
describe('Clerk SDK verification boundary (provider mocked)', () => {
  it('restricts token type and authorized parties, then checks current session and user', async () => {
    expect(await createClerkVerifier(config)(request())).toMatchObject({ clerkUserId: 'user_a', primaryEmail: { verified: true } });
    expect(sdk.authenticateRequest).toHaveBeenCalledWith(expect.any(Request), { authorizedParties: ['https://web.test'], acceptsToken: 'session_token' });
    expect(sdk.sessions.getSession).toHaveBeenCalledWith('sess_a');
    expect(sdk.users.getUser).toHaveBeenCalledWith('user_a');
  });
  it('rejects cookie-only authentication', async () => {
    await expect(createClerkVerifier(config)(new Request('https://api.test', { headers: { Cookie: '__session=test' } }))).rejects.toMatchObject({ status: 401 });
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });
  it('rejects invalid/expired tokens before database access', async () => {
    sdk.authenticateRequest.mockResolvedValue({ isAuthenticated: false });
    await expect(createClerkVerifier(config)(request())).rejects.toMatchObject({ status: 401 });
    expect(sdk.sessions.getSession).not.toHaveBeenCalled();
  });
  it.each(['ended', 'revoked', 'expired', 'abandoned', 'pending'])('rejects replay of a cryptographically valid token after session becomes %s', async status => {
    sdk.sessions.getSession.mockResolvedValue({ userId: 'user_a', status, expireAt: Date.now() + 60000 });
    await expect(createClerkVerifier(config)(request())).rejects.toMatchObject({ status: 401 });
  });
  it('rejects a mismatched session subject', async () => {
    sdk.sessions.getSession.mockResolvedValue({ userId: 'victim', status: 'active', expireAt: Date.now() + 60000 });
    await expect(createClerkVerifier(config)(request())).rejects.toMatchObject({ status: 401 });
  });
  it('uses current primary email rather than a stale verified secondary', async () => {
    sdk.users.getUser.mockResolvedValue({ id: 'user_a', primaryEmailAddressId: 'new',
      emailAddresses: [
        { id: 'old', emailAddress: 'test@graduate.utm.my', verification: { status: 'verified' } },
        { id: 'new', emailAddress: 'test@example.test', verification: { status: 'unverified' } },
      ] });
    expect(await createClerkVerifier(config)(request())).toMatchObject({ primaryEmail: { address: 'test@example.test', verified: false } });
  });
  it('fails closed during provider outage', async () => {
    sdk.sessions.getSession.mockRejectedValue(new Error('private-provider-error'));
    await expect(createClerkVerifier(config)(request())).rejects.toMatchObject({ status: 503, code: 'CLERK_UNAVAILABLE' });
  });
  it('rejects missing configuration and wildcard origins', () => {
    expect(() => createClerkVerifier({ ...config, secretKey: '' })).toThrow();
    expect(() => createClerkVerifier({ ...config, authorizedParties: [] })).toThrow();
    expect(() => createClerkVerifier({ ...config, authorizedParties: ['*'] })).toThrow();
  });
});
