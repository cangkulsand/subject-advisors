import { asRecord, normaliseReason, type AdminAccountDetail, type AdminValidation } from './admin';

/** Dummy users (S3-P004-029): ready-to-use test logins an administrator creates from Users & Access. */
export type DummyRole = 'STUDENT' | 'COORDINATOR';
export interface CreateDummyStudentRequest { role: 'STUDENT'; name: string; curriculumId: number; learningCentreId: number; reason: string }
export interface CreateDummyCoordinatorRequest { role: 'COORDINATOR'; name: string; programmeId: number; learningCentreId: number; reason: string }
export type CreateDummyUserRequest = CreateDummyStudentRequest | CreateDummyCoordinatorRequest;
export interface DummyCredentials { email: string; password: string }
export interface CreateDummyUserResponse { account: AdminAccountDetail; credentials: DummyCredentials }
export interface DummyCapacity { used: number; limit: number }

/** Clerk development instances allow 100 users. */
export const DUMMY_CLERK_USER_LIMIT = 100;
const MARKER = '+clerk_test@';
const DOMAIN: Record<DummyRole, string> = { STUDENT: 'graduate.utm.my', COORDINATOR: 'utm.my' };
const NAME_MAX = 100;

/** The only test for "is a dummy": the primary email is a Clerk test address. */
export function isDummyEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().includes(MARKER);
}

/** `<slug>-<suffix>+clerk_test@<role domain>`; the slug is at most 20 characters and `dummy` when the name has no a-z or 0-9. */
export function dummyEmail(name: string, role: DummyRole, suffix: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/, '') || 'dummy';
  return `${slug}-${suffix}${MARKER}${DOMAIN[role]}`;
}

export const dummyMatric = (digits: string): string => 'DUMMY' + digits;

const id = (value: unknown): number | null => Number.isInteger(value) && (value as number) > 0 ? value as number : null;

export function validateCreateDummyUserRequest(body: unknown): AdminValidation<CreateDummyUserRequest> {
  const role = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).role : undefined;
  if (role !== 'STUDENT' && role !== 'COORDINATOR') return { ok: false, error: 'Role must be Student or Coordinator.' };
  const scopeField = role === 'STUDENT' ? 'curriculumId' : 'programmeId';
  const record = asRecord(body, ['role', 'name', scopeField, 'learningCentreId', 'reason']);
  if (typeof record === 'string') return { ok: false, error: record };
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > NAME_MAX) return { ok: false, error: `Name is required (1-${NAME_MAX} characters).` };
  const scope = id(record[scopeField]), learningCentreId = id(record.learningCentreId);
  if (scope === null) return { ok: false, error: role === 'STUDENT' ? 'Choose a programme.' : 'Choose a programme to coordinate.' };
  if (learningCentreId === null) return { ok: false, error: 'Choose a learning centre.' };
  const reason = normaliseReason(record.reason);
  if (!reason) return { ok: false, error: 'Reason is required.' };
  return { ok: true, value: role === 'STUDENT'
    ? { role, name, curriculumId: scope, learningCentreId, reason }
    : { role, name, programmeId: scope, learningCentreId, reason } };
}

/** A password reset is a confirm with an empty body: there is no audit table for it, so no reason is collected. */
export function validateResetDummyPasswordRequest(body: unknown): AdminValidation<Record<string, never>> {
  const record = asRecord(body, []);
  return typeof record === 'string' ? { ok: false, error: record } : { ok: true, value: {} };
}
