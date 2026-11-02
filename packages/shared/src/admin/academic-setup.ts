import { ADMIN_REASON_MAX_LENGTH, normaliseReason, type AdminValidation } from './admin';
import type { CoordinatorAssignment } from '../forecasting/confirmed-offerings';

export const ACADEMIC_SETUP_ERROR_CODES = [
  'INVALID_REQUEST', 'NOT_FOUND', 'CONFLICT', 'DEPENDENCY_UNAVAILABLE',
  'COORDINATOR_ROLE_REQUIRED', 'ACCOUNT_INACTIVE', 'REFERENCE_INACTIVE',
  'PROGRAMME_FACULTY_MISMATCH', 'ASSIGNMENT_ACTIVE', 'ASSIGNMENT_ENDED',
] as const;
export type AcademicSetupErrorCode = typeof ACADEMIC_SETUP_ERROR_CODES[number];
export interface AcademicSetupError { error: { code: AcademicSetupErrorCode; message: string } }
export interface AcademicSetupEnvelope<T> { data: T }

export interface LearningCentre {
  learningCentreId: number; centreCode: string; centreName: string; isActive: boolean;
}
export interface Faculty {
  facultyId: number; facultyCode: string; facultyName: string; isActive: boolean;
}
export interface ProgrammeFaculty {
  programmeId: number; programmeCode: string; programmeName: string;
  facultyId: number | null; faculty: Faculty | null;
}
export type SemesterType = 'NORMAL' | 'SHORT';
export interface AcademicSemester {
  semesterId: number; academicYear: string; semesterNo: 1 | 2 | 3;
  semesterType: SemesterType; maxSubjects: number; maxCredits: number;
  startDate: string | null; endDate: string | null; isCurrent: boolean;
}
export interface AdminCoordinatorAssignment extends CoordinatorAssignment {
  assignmentId: number; accountId: number; startedAt: string; endedAt: string | null;
}
export interface CreateLearningCentreRequest { centreCode: string; centreName: string; reason: string }
export interface UpdateLearningCentreRequest { centreCode?: string; centreName?: string; isActive?: boolean; reason: string }
export interface CreateFacultyRequest { facultyCode: string; facultyName: string; reason: string }
export interface UpdateFacultyRequest { facultyCode?: string; facultyName?: string; isActive?: boolean; reason: string }
export interface SetProgrammeFacultyRequest { facultyId: number | null; reason: string }
export type SemesterFields = Pick<AcademicSemester, 'academicYear' | 'semesterNo' | 'semesterType' | 'maxSubjects' | 'maxCredits' | 'startDate' | 'endDate'>;
export interface CreateSemesterRequest extends SemesterFields { reason: string }
export type UpdateSemesterRequest = Partial<SemesterFields> & { reason: string };
export interface SetCurrentSemesterRequest { semesterId: number; reason: string }
export interface CreateCoordinatorAssignmentRequest extends CoordinatorAssignment { accountId: number; reason: string }
export interface EndCoordinatorAssignmentRequest { reason: string }

type RecordValue = Record<string, unknown>;
const id = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 2147483647;
const smallint = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 32767;
const own = (o: RecordValue, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
function record(body: unknown, fields: readonly string[]): AdminValidation<RecordValue> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Request body must be an object.' };
  const value = body as RecordValue;
  const extra = Object.keys(value).find(k => !fields.includes(k));
  return extra ? { ok: false, error: `Unknown field: ${extra}.` } : { ok: true, value };
}
function reason(value: RecordValue): AdminValidation<string> {
  const result = normaliseReason(value.reason);
  return result ? { ok: true, value: result } : { ok: false, error: `Reason is required (1-${ADMIN_REASON_MAX_LENGTH} characters).` };
}
function label(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const result = v.trim();
  return result.length >= 1 && result.length <= max ? result : null;
}
function date(v: unknown): v is string | null {
  if (v === null) return true;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith('0000-')) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function year(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9]{4}\/[0-9]{4}$/.test(v);
}
const fail = <T>(error: string): AdminValidation<T> => ({ ok: false, error });
function reference(body: unknown, kind: 'centre' | 'faculty', update: boolean): AdminValidation<RecordValue> {
  const fields: readonly [string, string] = kind === 'centre' ? ['centreCode', 'centreName'] : ['facultyCode', 'facultyName'];
  const parsed = record(body, [...fields, ...(update ? ['isActive'] : []), 'reason']);
  if (!parsed.ok) return parsed;
  const r = parsed.value;
  if (update && !fields.some(k => own(r, k)) && !own(r, 'isActive')) return fail('At least one change is required.');
  const code = fields[0], name = fields[1];
  if ((!update || own(r, code)) && !label(r[code], kind === 'centre' ? 10 : 20)) return fail(`Invalid ${code}.`);
  if ((!update || own(r, name)) && !label(r[name], kind === 'centre' ? 100 : 255)) return fail(`Invalid ${name}.`);
  if (own(r, 'isActive') && typeof r.isActive !== 'boolean') return fail('Invalid isActive.');
  const why = reason(r);
  if (!why.ok) return why;
  return { ok: true, value: {
    ...(own(r, code) ? { [code]: label(r[code], kind === 'centre' ? 10 : 20) } : {}),
    ...(own(r, name) ? { [name]: label(r[name], kind === 'centre' ? 100 : 255) } : {}),
    ...(own(r, 'isActive') ? { isActive: r.isActive } : {}),
    reason: why.value,
  } };
}
export const validateCreateLearningCentreRequest = (body: unknown): AdminValidation<CreateLearningCentreRequest> =>
  reference(body, 'centre', false) as AdminValidation<CreateLearningCentreRequest>;
export const validateUpdateLearningCentreRequest = (body: unknown): AdminValidation<UpdateLearningCentreRequest> =>
  reference(body, 'centre', true) as AdminValidation<UpdateLearningCentreRequest>;
export const validateCreateFacultyRequest = (body: unknown): AdminValidation<CreateFacultyRequest> =>
  reference(body, 'faculty', false) as AdminValidation<CreateFacultyRequest>;
export const validateUpdateFacultyRequest = (body: unknown): AdminValidation<UpdateFacultyRequest> =>
  reference(body, 'faculty', true) as AdminValidation<UpdateFacultyRequest>;

export function validateSetProgrammeFacultyRequest(body: unknown): AdminValidation<SetProgrammeFacultyRequest> {
  const parsed = record(body, ['facultyId', 'reason']);
  if (!parsed.ok) return parsed;
  if (parsed.value.facultyId !== null && !id(parsed.value.facultyId)) return fail('Invalid facultyId.');
  const why = reason(parsed.value);
  return why.ok ? { ok: true, value: { facultyId: parsed.value.facultyId as number | null, reason: why.value } } : why;
}
function semester(body: unknown, update: boolean): AdminValidation<CreateSemesterRequest | UpdateSemesterRequest> {
  const fields = ['academicYear', 'semesterNo', 'semesterType', 'maxSubjects', 'maxCredits', 'startDate', 'endDate'];
  const parsed = record(body, [...fields, 'reason']);
  if (!parsed.ok) return parsed;
  const r = parsed.value;
  if (update && !fields.some(k => own(r, k))) return fail('At least one change is required.');
  if ((!update || own(r, 'academicYear')) && !year(r.academicYear)) return fail('Invalid academicYear.');
  if ((!update || own(r, 'semesterNo')) && ![1, 2, 3].includes(r.semesterNo as number)) return fail('Invalid semesterNo.');
  if ((!update || own(r, 'semesterType')) && r.semesterType !== 'NORMAL' && r.semesterType !== 'SHORT') return fail('Invalid semesterType.');
  if ((!update || own(r, 'maxSubjects')) && !smallint(r.maxSubjects)) return fail('Invalid maxSubjects.');
  if ((!update || own(r, 'maxCredits')) && !smallint(r.maxCredits)) return fail('Invalid maxCredits.');
  for (const field of ['startDate', 'endDate']) if ((!update || own(r, field)) && !date(r[field])) return fail(`Invalid ${field}.`);
  if (own(r, 'semesterNo') && own(r, 'semesterType') &&
      (r.semesterNo === 3 ? r.semesterType !== 'SHORT' : r.semesterType !== 'NORMAL')) return fail('semesterNo and semesterType do not match.');
  if (own(r, 'startDate') && own(r, 'endDate') && r.startDate !== null && r.endDate !== null && (r.startDate as string) > (r.endDate as string)) return fail('endDate must not precede startDate.');
  const why = reason(r);
  if (!why.ok) return why;
  return { ok: true, value: { ...r, reason: why.value } as unknown as CreateSemesterRequest | UpdateSemesterRequest };
}
export const validateCreateSemesterRequest = (body: unknown): AdminValidation<CreateSemesterRequest> =>
  semester(body, false) as AdminValidation<CreateSemesterRequest>;
/** A PATCH validator also needs the stored row to check merged date and type invariants. */
export const validateUpdateSemesterRequest = (body: unknown): AdminValidation<UpdateSemesterRequest> =>
  semester(body, true) as AdminValidation<UpdateSemesterRequest>;
export function validateMergedSemester(existing: AcademicSemester, patch: UpdateSemesterRequest): AdminValidation<SemesterFields> {

  const merged = { ...existing, ...patch };
  if (merged.semesterNo === 3 ? merged.semesterType !== 'SHORT' : merged.semesterType !== 'NORMAL') return fail('semesterNo and semesterType do not match.');
  if (merged.startDate !== null && merged.endDate !== null && merged.startDate > merged.endDate) return fail('endDate must not precede startDate.');
  return { ok: true, value: {
    academicYear: merged.academicYear, semesterNo: merged.semesterNo, semesterType: merged.semesterType,
    maxSubjects: merged.maxSubjects, maxCredits: merged.maxCredits, startDate: merged.startDate, endDate: merged.endDate,
  } };
}
export function validateSetCurrentSemesterRequest(body: unknown): AdminValidation<SetCurrentSemesterRequest> {
  const parsed = record(body, ['semesterId', 'reason']);
  if (!parsed.ok) return parsed;
  if (!id(parsed.value.semesterId)) return fail('Invalid semesterId.');
  const why = reason(parsed.value);
  return why.ok ? { ok: true, value: { semesterId: parsed.value.semesterId as number, reason: why.value } } : why;
}
export function validateCreateCoordinatorAssignmentRequest(body: unknown): AdminValidation<CreateCoordinatorAssignmentRequest> {
  const parsed = record(body, ['accountId', 'facultyId', 'programmeId', 'learningCentreId', 'reason']);
  if (!parsed.ok) return parsed;
  for (const field of ['accountId', 'facultyId', 'programmeId', 'learningCentreId']) if (!id(parsed.value[field])) return fail(`Invalid ${field}.`);
  const why = reason(parsed.value);
  return why.ok ? { ok: true, value: { accountId: parsed.value.accountId as number, facultyId: parsed.value.facultyId as number,
    programmeId: parsed.value.programmeId as number, learningCentreId: parsed.value.learningCentreId as number, reason: why.value } } : why;
}
export function validateEndCoordinatorAssignmentRequest(body: unknown): AdminValidation<EndCoordinatorAssignmentRequest> {
  const parsed = record(body, ['reason']);
  if (!parsed.ok) return parsed;
  const why = reason(parsed.value);
  return why.ok ? { ok: true, value: { reason: why.value } } : why;
}
export const isAcademicSetupId = id;