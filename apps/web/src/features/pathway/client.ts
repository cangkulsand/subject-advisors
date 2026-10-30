import type { PathwayApiResult, PathwayGraph } from './contracts';

export class PathwayApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export async function loadPathwayGraph(
  getToken: () => Promise<string | null>,
  apiBaseUrl = '',
  signal?: AbortSignal,
): Promise<PathwayGraph> {
  const token = await getToken();
  if (!token) throw new PathwayApiError(401, 'SESSION_REQUIRED', 'Your session has ended. Please sign in again.');
  const response = await fetch(apiBaseUrl.replace(/\/$/, '') + '/api/pathway/graph', {
    headers: { Authorization: 'Bearer ' + token },
    credentials: 'omit', cache: 'no-store', signal,
  });
  const body: PathwayApiResult = await response.json();
  if (!response.ok) {
    if ('error' in body) throw new PathwayApiError(response.status, body.error.code, body.error.message);
    throw new Error('Academic pathway is unavailable.');
  }
  if (!('data' in body)) throw new Error('Academic pathway is unavailable.');
  return body.data;
}
