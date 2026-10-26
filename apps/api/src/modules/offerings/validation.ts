import { AuthError } from '../auth/errors';
import type { SaveOfferings } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringId } from '../../../../../packages/shared/src/offerings/identifiers';

export const MAX_SUBJECTS = 500;
export function requireId(value: unknown): string {
  try { return offeringId(value); }
  catch {
    throw new AuthError(400, 'INVALID_ID', 'Select a configured semester and valid curriculum subjects.');
  }
}
export function parseSave(value: unknown): SaveOfferings {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      Object.keys(value).some(key => key !== 'semesterId' && key !== 'curriculumSubjectIds') ||
      !('semesterId' in value) || !('curriculumSubjectIds' in value) ||
      !Array.isArray(value.curriculumSubjectIds) || value.curriculumSubjectIds.length > MAX_SUBJECTS) {
    throw new AuthError(400, 'INVALID_OFFERINGS', 'Send a semester and a list of up to 500 curriculum subject IDs only.');
  }
  const curriculumSubjectIds = value.curriculumSubjectIds.map(requireId);
  if (new Set(curriculumSubjectIds).size !== curriculumSubjectIds.length) {
    throw new AuthError(400, 'DUPLICATE_SUBJECT', 'Each subject can appear only once in the offering list.');
  }
  return { semesterId: requireId(value.semesterId), curriculumSubjectIds };
}
/** Bound actual streamed bytes, including requests without a Content-Length header. */
export async function readSave(request: Request): Promise<SaveOfferings> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new AuthError(415, 'JSON_REQUIRED', 'Send offerings as application/json.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, 'INVALID_JSON', 'The offerings request is empty.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) throw new AuthError(413, 'REQUEST_TOO_LARGE', 'The offering list is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new AuthError(400, 'INVALID_JSON', 'The offerings request is not valid JSON.'); }
  return parseSave(value);
}
