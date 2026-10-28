import { describe, expect, it, vi } from 'vitest';
import worker from './cloudflare';

function environment() {
  return {
    CLERK_SECRET_KEY: 'test-secret', CLERK_PUBLISHABLE_KEY: 'test-publishable',
    CLERK_AUTHORIZED_PARTIES: 'https://preview.example', DATABASE_URL: 'postgres://unused',
    ASSETS: { fetch: vi.fn(async () => new Response('<main>app</main>', { headers: { 'Content-Type': 'text/html' } })) },
  };
}

describe('Cloudflare deployment adapter', () => {
  it('returns an unauthorized JSON response for API calls without a bearer token', async () => {
    const response = await worker.fetch(new Request('https://preview.example/api/me'), environment());
    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns JSON 404 for unknown API paths instead of the SPA document', async () => {
    const response = await worker.fetch(new Request('https://preview.example/api/unknown', { headers: { Authorization: 'Bearer test-token' } }), environment());
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('does not expose the local-only status route', async () => {
    const env = environment();
    const response = await worker.fetch(new Request('https://preview.example/api/auth/local-status', { headers: { Authorization: 'Bearer test-token' } }), env);
    expect(response.status).toBe(404);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('passes deep links to the SPA asset handler', async () => {
    const env = environment();
    const response = await worker.fetch(new Request('https://preview.example/student/profile'), env);
    expect(response.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
  });
});
