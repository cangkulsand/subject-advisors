import { createAcademicClient } from '../profile/client';
export type Sprint2Client = <T>(path: string, options?: { method?: 'GET'|'POST'|'PUT'|'DELETE'; body?: unknown; signal?: AbortSignal }) => Promise<T>;
/** Delegates to the shared academic client for session fencing, cache invalidation and error semantics. */
export function createSprint2Client(getToken: () => Promise<string|null>, baseUrl = ''): Sprint2Client {
  const academic = createAcademicClient(getToken, baseUrl);
  return <T>(path: string, options: Parameters<Sprint2Client>[1] = {}): Promise<T> => academic<T>('/api/p001-sprint2'+path, options);
}
