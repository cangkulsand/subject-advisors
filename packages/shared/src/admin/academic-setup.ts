import { ADMIN_REASON_MAX_LENGTH, normaliseReason, type AdminValidation } from './admin';
import type { CoordinatorAssignment } from '../forecasting/confirmed-offerings';

export const ACADEMIC_SETUP_ERROR_CODES = [
  'INVALID_REQUEST', 'NOT_FOUND', 'CONFLICT', 'DEPENDENCY_UNAVAILABLE',
  'COORDINATOR_ROLE_REQUIRED', 'ACCOUNT_INACTIVE', 'REFERENCE_INACTIVE',
  'PROGRAMME_FACULTY_MISMATCH', 'ASSIGNMENT_ACTIVE', 'ASSIGNMENT_ENDED', 'DEPARTMENT_HAS_PROGRAMMES',
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
/** A department belongs to exactly one faculty (Faculty -> Department -> Programme). */
export interface Department {
  departmentId: number; departmentCode: string; departmentName: string; facultyId: number; isActive: boolean;
}
/** Programme with its department and the faculty that follows from it (faculty is derived once a department is assigned). */
export interface ProgrammeFaculty {
  programmeId: number; programmeCode: string; programmeName: string;
  level: string | null; isActive: boolean;
  facultyId: number | null; faculty: Faculty | null;
  departmentId: number | null; department: Department | null;
}
export type SemesterType = 'NORMAL' | 'SHORT';
export interface AcademicSemester {
  semesterId: number; academicYear: string; semesterNo: 1 | 2 | 3;
  semesterType: SemesterType; maxSubjects: number; maxCredits: number;
  startDate: string | null; endDate: string | null; isCurrent: boolean;
  /** Admin-set picking window (ISO date-time, UTC). Both null means selection is not scheduled. */
  selectionOpensAt: string | null; selectionClosesAt: string | null;
}
export interface AdminCoordinatorAssignment extends CoordinatorAssignment {
  assignmentId: number; accountId: number; startedAt: string; endedAt: string | null;
}
export interface CreateLearningCentreRequest { centreCode: string; centreName: string; reason: string }
export interface UpdateLearningCentreRequest { centreCode?: string; centreName?: string; isActive?: boolean; reason: string }
export interface CreateFacultyRequest { facultyCode: string; facultyName: string; reason: string }
export interface UpdateFacultyRequest { facultyCode?: string; facultyName?: string; isActive?: boolean; reason: string }
export interface CreateDepartmentRequest { departmentCode: string; departmentName: string; facultyId: number; reason: string }
export interface UpdateDepartmentRequest { departmentCode?: string; departmentName?: string; facultyId?: number; isActive?: boolean; reason: string }
/** Assigning a department also sets the programme faculty to the department's faculty; null clears both when the programme had a department. */
export interface SetProgrammeDepartmentRequest { departmentId: number | null; reason: string }
export interface Curriculum {
  curriculumId: number; programmeId: number; curriculumVersion: string; totalCreditRequired: number;
  effectiveYear: number | null; isActive: boolean; subjectCount: number;
}
export interface CreateProgrammeRequest { programmeCode: string; programmeName: string; level: string | null; departmentId: number; reason: string }
export interface UpdateProgrammeRequest { programmeCode?: string; programmeName?: string; level?: string | null; isActive?: boolean; reason: string }
export interface CreateCurriculumRequest { programmeId: number; curriculumVersion: string; totalCreditRequired: number; effectiveYear: number | null; reason: string }
export interface UpdateCurriculumRequest { curriculumVersion?: string; totalCreditRequired?: number; effectiveYear?: number | null; isActive?: boolean; reason: string }
export type SemesterFields = Pick<AcademicSemester, 'academicYear' | 'semesterNo' | 'semesterType' | 'maxSubjects' | 'maxCredits' | 'startDate' | 'endDate' | 'selectionOpensAt' | 'selectionClosesAt'>;
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
function dateTime(v: unknown): v is string | null {
  return v === null || (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)));
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

function department(body: unknown, update: boolean): AdminValidation<CreateDepartmentRequest | UpdateDepartmentRequest> {
  const parsed = record(body, ['departmentCode', 'departmentName', 'facultyId', ...(update ? ['isActive'] : []), 'reason']);
  if (!parsed.ok) return parsed;
  const r = parsed.value, fields = ['departmentCode', 'departmentName', 'facultyId', 'isActive'];
  if (update && !fields.some(k => own(r, k))) return fail('At least one change is required.');
  if ((!update || own(r, 'departmentCode')) && !label(r.departmentCode, 20)) return fail('Invalid departmentCode.');
  if ((!update || own(r, 'departmentName')) && !label(r.departmentName, 255)) return fail('Invalid departmentName.');
  if ((!update || own(r, 'facultyId')) && !id(r.facultyId)) return fail('Invalid facultyId.');
  if (own(r, 'isActive') && typeof r.isActive !== 'boolean') return fail('Invalid isActive.');
  const why = reason(r);
  if (!why.ok) return why;
  return { ok: true, value: {
    ...(own(r, 'departmentCode') ? { departmentCode: label(r.departmentCode, 20) } : {}),
    ...(own(r, 'departmentName') ? { departmentName: label(r.departmentName, 255) } : {}),
    ...(own(r, 'facultyId') ? { facultyId: r.facultyId } : {}),
    ...(own(r, 'isActive') ? { isActive: r.isActive } : {}),
    reason: why.value,
  } as unknown as CreateDepartmentRequest | UpdateDepartmentRequest };
}
export const validateCreateDepartmentRequest = (body: unknown): AdminValidation<CreateDepartmentRequest> =>
  department(body, false) as AdminValidation<CreateDepartmentRequest>;
export const validateUpdateDepartmentRequest = (body: unknown): AdminValidation<UpdateDepartmentRequest> =>
  department(body, true) as AdminValidation<UpdateDepartmentRequest>;
export function validateSetProgrammeDepartmentRequest(body: unknown): AdminValidation<SetProgrammeDepartmentRequest> {
  const parsed = record(body, ['departmentId', 'reason']);
  if (!parsed.ok) return parsed;
  if (parsed.value.departmentId !== null && !id(parsed.value.departmentId)) return fail('Invalid departmentId.');
  const why = reason(parsed.value);
  return why.ok ? { ok: true, value: { departmentId: parsed.value.departmentId as number | null, reason: why.value } } : why;
}
/** Blank level clears it (null); otherwise trimmed, at most 50 characters. Returns undefined when invalid. */
function level(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const result = v.trim();
  return result.length === 0 ? null : result.length <= 50 ? result : undefined;
}
function programme(body: unknown, update: boolean): AdminValidation<CreateProgrammeRequest | UpdateProgrammeRequest> {
  const parsed = record(body, ['programmeCode', 'programmeName', 'level', ...(update ? ['isActive'] : ['departmentId']), 'reason']);
  if (!parsed.ok) return parsed;
  const r = parsed.value, fields = ['programmeCode', 'programmeName', 'level', 'isActive'];
  if (update && !fields.some(k => own(r, k))) return fail('At least one change is required.');
  if ((!update || own(r, 'programmeCode')) && !label(r.programmeCode, 20)) return fail('Invalid programmeCode.');
  if ((!update || own(r, 'programmeName')) && !label(r.programmeName, 255)) return fail('Invalid programmeName.');
  if ((!update || own(r, 'level')) && level(r.level) === undefined) return fail('Invalid level.');
  if (!update && !id(r.departmentId)) return fail('Invalid departmentId.');
  if (own(r, 'isActive') && typeof r.isActive !== 'boolean') return fail('Invalid isActive.');
  const why = reason(r);
  if (!why.ok) return why;
  return { ok: true, value: {
    ...(own(r, 'programmeCode') ? { programmeCode: label(r.programmeCode, 20) } : {}),
    ...(own(r, 'programmeName') ? { programmeName: label(r.programmeName, 255) } : {}),
    ...(own(r, 'level') ? { level: level(r.level) } : {}),
    ...(!update ? { departmentId: r.departmentId } : {}),
    ...(own(r, 'isActive') ? { isActive: r.isActive } : {}),
    reason: why.value,
  } as unknown as CreateProgrammeRequest | UpdateProgrammeRequest };
}
export const validateCreateProgrammeRequest = (body: unknown): AdminValidation<CreateProgrammeRequest> =>
  programme(body, false) as AdminValidation<CreateProgrammeRequest>;
export const validateUpdateProgrammeRequest = (body: unknown): AdminValidation<UpdateProgrammeRequest> =>
  programme(body, true) as AdminValidation<UpdateProgrammeRequest>;

const credits = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000;
const effectiveYear = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 1900 && v <= 2100);
function curriculum(body: unknown, update: boolean): AdminValidation<CreateCurriculumRequest | UpdateCurriculumRequest> {
  const parsed = record(body, [...(update ? ['isActive'] : ['programmeId']), 'curriculumVersion', 'totalCreditRequired', 'effectiveYear', 'reason']);
  if (!parsed.ok) return parsed;
  const r = parsed.value, fields = ['curriculumVersion', 'totalCreditRequired', 'effectiveYear', 'isActive'];
  if (update && !fields.some(k => own(r, k))) return fail('At least one change is required.');
  if (!update && !id(r.programmeId)) return fail('Invalid programmeId.');
  if ((!update || own(r, 'curriculumVersion')) && !label(r.curriculumVersion, 20)) return fail('Invalid curriculumVersion.');
  if ((!update || own(r, 'totalCreditRequired')) && !credits(r.totalCreditRequired)) return fail('Invalid totalCreditRequired.');
  if ((!update || own(r, 'effectiveYear')) && !effectiveYear(r.effectiveYear)) return fail('Invalid effectiveYear.');
  if (own(r, 'isActive') && typeof r.isActive !== 'boolean') return fail('Invalid isActive.');
  const why = reason(r);
  if (!why.ok) return why;
  return { ok: true, value: {
    ...(!update ? { programmeId: r.programmeId } : {}),
    ...(own(r, 'curriculumVersion') ? { curriculumVersion: label(r.curriculumVersion, 20) } : {}),
    ...(own(r, 'totalCreditRequired') ? { totalCreditRequired: r.totalCreditRequired } : {}),
    ...(own(r, 'effectiveYear') ? { effectiveYear: r.effectiveYear } : {}),
    ...(own(r, 'isActive') ? { isActive: r.isActive } : {}),
    reason: why.value,
  } as unknown as CreateCurriculumRequest | UpdateCurriculumRequest };
}
export const validateCreateCurriculumRequest = (body: unknown): AdminValidation<CreateCurriculumRequest> =>
  curriculum(body, false) as AdminValidation<CreateCurriculumRequest>;
export const validateUpdateCurriculumRequest = (body: unknown): AdminValidation<UpdateCurriculumRequest> =>
  curriculum(body, true) as AdminValidation<UpdateCurriculumRequest>;

function selectionWindowError(opens: string | null, closes: string | null): string | null {
  if (closes === null) return null;
  if (opens === null) return 'selectionClosesAt requires selectionOpensAt.';
  return Date.parse(closes) > Date.parse(opens) ? null : 'selectionClosesAt must be after selectionOpensAt.';
}
function semester(body: unknown, update: boolean): AdminValidation<CreateSemesterRequest | UpdateSemesterRequest> {
  const fields = ['academicYear', 'semesterNo', 'semesterType', 'maxSubjects', 'maxCredits', 'startDate', 'endDate', 'selectionOpensAt', 'selectionClosesAt'];
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
  for (const field of ['selectionOpensAt', 'selectionClosesAt']) if (own(r, field) && !dateTime(r[field])) return fail(`Invalid ${field}.`);
  if (own(r, 'selectionOpensAt') && own(r, 'selectionClosesAt')) { const bad = selectionWindowError(r.selectionOpensAt as string | null, r.selectionClosesAt as string | null); if (bad) return fail(bad); }
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
  const window = selectionWindowError(merged.selectionOpensAt, merged.selectionClosesAt);
  if (window) return fail(window);
  return { ok: true, value: {
    academicYear: merged.academicYear, semesterNo: merged.semesterNo, semesterType: merged.semesterType,
    maxSubjects: merged.maxSubjects, maxCredits: merged.maxCredits, startDate: merged.startDate, endDate: merged.endDate,
    selectionOpensAt: merged.selectionOpensAt, selectionClosesAt: merged.selectionClosesAt,
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