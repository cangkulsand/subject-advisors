import { AuthError, authJson } from '../auth';
import { ForecastingError } from './errors';

export const JSON_LIMIT_BYTES = 16 * 1024;
export const INT32_MAX = 2_147_483_647;

export function bad(message: string): never { throw new AuthError(400, 'INVALID_REQUEST', message); }
export function methodNotAllowed(allowed: string[]): Response {
  const response = authJson({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported for this resource.' } }, 405);
  response.headers.set('Allow', allowed.join(', '));
  return response;
}
export function positive(value: string | null | undefined, label: string): number {
  if (!value || !/^[1-9]\d*$/.test(value) || Number(value) > INT32_MAX) bad('Invalid ' + label + '.');
  return Number(value);
}
export function onlyParameters(url: URL, allowed: readonly string[]) {
  for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) bad('Unsupported or duplicate query parameter.');
}

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

/** Reads at most `limit` bytes; rejects with 413 as soon as the declared or streamed size exceeds it. */
export async function readBounded(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > limit) throw new ForecastingError('PAYLOAD_TOO_LARGE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new ForecastingError('PAYLOAD_TOO_LARGE');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') throw new AuthError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json.');
  let value: unknown;
  try {
    const bytes = await readBounded(request, JSON_LIMIT_BYTES);
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof ForecastingError) throw error;
    return bad('The request body is not valid JSON.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) bad('The request body must be a JSON object.');
  return value as Record<string, unknown>;
}


export const encodeCursor = (id: number) => btoa(String(id)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function decodeCursor(value: string): number {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) bad('Invalid cursor.');
  try { return positive(atob(value.replace(/-/g, '+').replace(/_/g, '/')), 'cursor'); } catch { return bad('Invalid cursor.'); }
}


export function errorResponse(error: ForecastingError): Response {
  return authJson({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } }, error.status);
}
export function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Vary', 'Authorization');
  return response;
}
