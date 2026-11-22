import { AuthError } from './errors';

/**
 * System Admin "View as" (S3-P004-033). The web app sends the chosen context on every API call; `authorize` checks
 * that the caller is an active, domain-eligible System Administrator before it is used.
 * - COORDINATOR: the admin acts in one programme x centre; every write keeps the admin's own Clerk ID as actor.
 * - STUDENT: the admin reads one student's screens; any method other than GET/HEAD is refused.
 */
export const VIEW_AS_HEADER = 'X-View-As';
export type ViewAs = { role: 'COORDINATOR'; programmeId: number; learningCentreId: number } | { role: 'STUDENT'; studentId: number };
export type ViewAsContext = ViewAs & { adminClerkUserId: string; studentName?: string };

const invalid = () => new AuthError(400, 'VIEW_AS_INVALID', 'The view-as context is not valid. Exit the view and choose again.');
function id(value: string | undefined): number {
  if (!value || !/^[1-9]\d{0,9}$/.test(value)) throw invalid();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > 2147483647) throw invalid();
  return number;
}

/** `COORDINATOR;programme=<id>;centre=<id>` or `STUDENT;student=<id>`; null when the header is absent. */
export function parseViewAs(header: string | null): ViewAs | null {
  if (header === null) return null;
  const [role, ...parts] = header.trim().split(';');
  const fields = new Map<string, string>();
  for (const part of parts) {
    const [key, value, extra] = part.split('=');
    if (!key || value === undefined || extra !== undefined || fields.has(key)) throw invalid();
    fields.set(key, value);
  }
  const only = (...keys: string[]) => { if (fields.size !== keys.length || keys.some(key => !fields.has(key))) throw invalid(); };
  if (role === 'COORDINATOR') { only('programme', 'centre'); return { role, programmeId: id(fields.get('programme')), learningCentreId: id(fields.get('centre')) }; }
  if (role === 'STUDENT') { only('student'); return { role, studentId: id(fields.get('student')) }; }
  throw invalid();
}

export const isReadMethod = (method: string) => method === 'GET' || method === 'HEAD';
