export class P001Error extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export function invalid(message: string): never { throw new P001Error(400, 'INVALID_INPUT', message); }
export function positiveId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 2147483647) invalid(label + ' must be a positive integer ID.');
  return value;
}
export function nonnegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2147483647) invalid(label + ' must be a nonnegative whole number.');
  return value;
}
export function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value === null || value === undefined) { if (required) invalid(label + ' is required.'); return null; }
  if (typeof value !== 'string') invalid(label + ' must be text.');
  const result = value.trim();
  if (result.length > max || (required && !result)) invalid(label + ' must contain ' + (required ? '1 to ' : 'at most ') + max + ' characters.');
  return result || null;
}
export function fields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Provide a JSON object.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) invalid('The request contains unsupported fields.');
  return result;
}
export async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') invalid('Send an application/json body.');
  if (!request.body) invalid('A request body is required.');
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new P001Error(413, 'BODY_TOO_LARGE', 'The request body is too large.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { return invalid('The request body must be valid JSON.'); }
}
export function profileInput(value: unknown) {
  const body = fields(value, ['studentName', 'matricNo', 'curriculumId', 'currentSemesterId', 'weeklyWorkingHours', 'availableStudyHours']);
  return {
    studentName: text(body.studentName, 'Student name', 255, true)!,
    matricNo: text(body.matricNo, 'Matric number', 30),
    curriculumId: positiveId(body.curriculumId, 'Curriculum'),
    currentSemesterId: positiveId(body.currentSemesterId, 'Current semester'),
    weeklyWorkingHours: nonnegative(body.weeklyWorkingHours, 'Weekly working hours'),
    availableStudyHours: nonnegative(body.availableStudyHours, 'Available study hours'),
  };
}
export function persistenceError(error: unknown): never {
  if (error instanceof P001Error) throw error;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === '23505') throw new P001Error(409, 'DUPLICATE_RECORD', 'An entry already exists for that subject and semester. Edit the existing entry.');
  if (code === '23503') throw new P001Error(400, 'INVALID_REFERENCE', 'The selected reference is unavailable. Refresh and try again.');
  if (code === '23514') throw new P001Error(409, 'DATA_CONFLICT', 'This change conflicts with saved academic data. Keep the current curriculum or request reconciliation.');
  throw new P001Error(503, 'ACADEMIC_DATA_UNAVAILABLE', 'Academic data is temporarily unavailable. Please retry.');
}
