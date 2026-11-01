/**
 * PLANNED contracts for the coordinator-confirmed offerings rule (product owner decision
 * 2026-11-01, change S2-P004-006). Transport types and pure validators only: no handler,
 * table or UI exists yet. See docs/api/forecasting-uc20.openapi.json.
 */
import type { ForecastScope, Int32Id, ClassType, Paginated, Envelope, OperationReceipt, SemesterOption } from './contracts';

/** Wording shown to students. Must never imply official registration or a guaranteed timetable. */
export const CONFIRMED_OFFERING_LABEL = 'Confirmed by coordinator';
export const CONFIRMED_OFFERING_NOTICE =
  'Confirmed by coordinator — not an official registration and not a guaranteed timetable';

export const CONFIRMED_OFFERING_STATUSES = ['CONFIRMED', 'WITHDRAWN'] as const;
export type ConfirmedOfferingStatus = (typeof CONFIRMED_OFFERING_STATUSES)[number];
export const CONFIRMED_OFFERING_ACTIONS = ['CONFIRM', 'WITHDRAW', 'SET_DEADLINE'] as const;
export type ConfirmedOfferingAction = (typeof CONFIRMED_OFFERING_ACTIONS)[number];

/** Latest confirmation state of one subject for programme + centre + target semester. */
export interface ConfirmedOffering extends ForecastScope {
  confirmedOfferingId: Int32Id;
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  creditHours: number;
  classType: ClassType;
  status: ConfirmedOfferingStatus;
  /** FINALIZED run the coordinator based the confirmation on (provenance, not a live link). */
  forecastRunId: Int32Id | null;
  confirmedBy: string;
  confirmedAt: string;
  reason: string;
}
export interface ConfirmedOfferingSet {
  scope: ForecastScope;
  /** Pick deadline set by the coordinator for this scope; null before the first confirmation. */
  pickDeadline: string | null;
  /** Opaque revision of the whole set for this scope; null before the first confirmation. */
  revision: string | null;
  /**
   * Informational only: a newer forecast run exists for this programme + centre + semester.
   * A new forecast never changes, invalidates or requires re-confirmation of a confirmation.
   */
  newerForecastAvailable?: boolean;
  offerings: ConfirmedOffering[];
}
/** Confirm (or re-confirm) subjects. Requires a FINALIZED run for the same scope. */
export interface ConfirmOfferingsRequest {
  scope: ForecastScope;
  forecastRunId: Int32Id;
  subjectIds: Int32Id[];
  reason: string;
  /**
   * Pick DEADLINE (ISO date-time) after which students can no longer pick or change picks.
   * Replaces the Google Form practice (publish subject list, students answer before a date).
   * On re-confirmation send the current deadline unchanged.
   */
  pickDeadline: string;
  /** Revision the coordinator last saw; null when no confirmation exists yet. */
  baseRevision: string | null;
}
/** Change the pick deadline for a scope (audited). */
export interface SetPickDeadlineRequest {
  scope: ForecastScope;
  pickDeadline: string;
  reason: string;
  baseRevision: string;
}
export interface WithdrawOfferingsRequest {
  scope: ForecastScope;
  subjectIds: Int32Id[];
  reason: string;
  baseRevision: string;
}
export interface ConfirmedOfferingAuditEntry {
  auditId: Int32Id;
  scope: ForecastScope;
  /** Null for SET_DEADLINE, which applies to the whole scope. */
  subjectId: Int32Id | null;
  action: ConfirmedOfferingAction;
  beforeStatus: ConfirmedOfferingStatus | null;
  afterStatus: ConfirmedOfferingStatus | null;
  beforeDeadline: string | null;
  afterDeadline: string | null;
  recordedBy: string;
  recordedAt: string;
  reason: string;
  forecastRunId: Int32Id | null;
}

/**
 * Student pick count and picker list for one subject (product owner decision 2026-11-01,
 * reverses the earlier "counts only"). Coordinators manage the students of their assigned
 * centre and see WHO picked each subject, replacing the old process of importing names and
 * untaken subjects from the student management system. Only students whose profile programme +
 * learning centre fall within the coordinator's assignment are listed (403 SCOPE_NOT_ASSIGNED
 * otherwise); there is no small-number suppression. Students never see other students' picks.
 * The data is a display aid: it is not an input to the forecast calculation, and nothing is
 * allocated automatically. The cycle ENDS here: students pick, the coordinator sees the counts
 * and the pickers and decides. No class sections are created from picks and there is no
 * registration or timetable in this cycle.
 */
export interface OfferingPickCount {
  subjectId: Int32Id;
  subjectCode: string;
  subjectName: string;
  pickCount: number;
  /** LAB or LECTURE (non-lab); null in the catalogue is treated as LECTURE. Display aid. */
  classType: ClassType;
  /** Implied number of classes and size comparison; display aid only. */
  implied: ImpliedClasses;
  /** Students who picked this subject (length equals pickCount), seniority order by default. */
  pickers: OfferingPicker[];
}
/**
 * One picker as shown to an assigned coordinator. Fields that exist today: `studentId`
 * (student_profile.student_id, not the Clerk ID), `studentName` (student_profile.student_name),
 * `matricNo` (student_profile.matric_no, nullable), `currentSemester` (student_profile
 * current_semester_id) and `creditsCompleted` (sum of academic_record.recognized_credits for
 * COMPLETED/EXEMPTED records, derived). Planned addition: `intakeSemester` (no intake field
 * exists on student_profile today; null until recorded).
 */
export interface OfferingPicker {
  studentId: Int32Id;
  studentName: string;
  matricNo: string | null;
  currentSemester: SemesterOption | null;
  /** PLANNED field (P001): not stored today, null until added. */
  intakeSemester: SemesterOption | null;
  /** Credits completed toward the curriculum; null when the records are unavailable. */
  creditsCompleted: number | null;
}
export type PickerSort = 'seniority' | 'name';
export interface OfferingPickCountSummary {
  scope: ForecastScope;
  asOf: string;
  /** Deadline after which picks are closed (read-only). */
  pickDeadline: string | null;
  counts: OfferingPickCount[];
}

/**
 * Decided 2026-11-01: two class types, LAB and non-lab (LECTURE). Maximum per class LAB 35,
 * LECTURE 45; optimal class size 25 (use as CapacityRule.breakEvenTarget). These replace the
 * earlier example values (40 / 30 / 35). They are entered as configuration (class capacity
 * rules); they are not seeded by migration.
 */
export const CLASS_SIZE_MAXIMUM = { LAB: 35, LECTURE: 45 } as const;
export const OPTIMAL_CLASS_SIZE = 25;
export interface ImpliedClasses {
  maxPerClass: number;
  /** ceil(picks / maxPerClass) */
  classesAtMaximum: number;
  /** ceil(picks / OPTIMAL_CLASS_SIZE) */
  classesAtOptimal: number;
  /** picks / classesAtMaximum, compared by the UI with OPTIMAL_CLASS_SIZE; 0 when no picks */
  averageSizeAtMaximum: number;
}
/** Display aid only: not a class-section proposal and not an input to the forecast. */
export function impliedClasses(pickCount: number, classType: ClassType): ImpliedClasses {
  const maxPerClass = classType === 'LAB' ? CLASS_SIZE_MAXIMUM.LAB : CLASS_SIZE_MAXIMUM.LECTURE;
  const picks = Math.max(0, Math.floor(pickCount));
  const classesAtMaximum = Math.ceil(picks / maxPerClass);
  return {
    maxPerClass,
    classesAtMaximum,
    classesAtOptimal: Math.ceil(picks / OPTIMAL_CLASS_SIZE),
    averageSizeAtMaximum: classesAtMaximum === 0 ? 0 : picks / classesAtMaximum,
  };
}

/**
 * Decided 2026-11-01: coordinators are ASSIGNED (admin-managed, planned) to faculty, degree
 * (programme) and learning centre. A coordinator may confirm offerings, set deadlines and see
 * pick counts and pickers only within assignments. Server error: 403 SCOPE_NOT_ASSIGNED.
 */
export interface CoordinatorAssignment {
  facultyId: Int32Id;
  programmeId: Int32Id;
  learningCentreId: Int32Id;
}
export const SCOPE_NOT_ASSIGNED_ERROR = 'SCOPE_NOT_ASSIGNED';
export function isScopeAssigned(assignments: readonly CoordinatorAssignment[], scope: ForecastScope): boolean {
  return assignments.some((a) => a.programmeId === scope.programmeId && a.learningCentreId === scope.learningCentreId);
}

/**
 * Display-aid policy, version 1 (single source of truth for picker ordering). The rule may be
 * changed or improved later: that needs a new change record plus an update to this helper only.
 * No database migration is needed because the ordering is computed and never stored.
 */
export const SENIORITY_POLICY_VERSION = 1;
const compareSemesterOrder = (a: SemesterOption, b: SemesterOption): number =>
  a.academicYear === b.academicYear ? a.semesterNumber - b.semesterNumber : (a.academicYear < b.academicYear ? -1 : 1);
/**
 * Seniority ordering, a display aid only (the coordinator decides; nothing is allocated
 * automatically). Decided 2026-11-01 (OP16): more credits completed toward the curriculum
 * first; tie-break the earliest intake semester (known intake before unknown), then the current
 * semester (the later one, i.e. further along, is treated as more senior when intake is missing);
 * then name and student ID for a stable order. Unknown credits sort last.
 */
export function compareBySeniority(a: OfferingPicker, b: OfferingPicker): number {
  const ac = a.creditsCompleted ?? -1;
  const bc = b.creditsCompleted ?? -1;
  if (ac !== bc) return bc - ac;
  if (a.intakeSemester && b.intakeSemester) {
    const d = compareSemesterOrder(a.intakeSemester, b.intakeSemester);
    if (d !== 0) return d;
  } else if (a.intakeSemester || b.intakeSemester) {
    return a.intakeSemester ? -1 : 1;
  }
  if (a.currentSemester && b.currentSemester) {
    const d = compareSemesterOrder(b.currentSemester, a.currentSemester);
    if (d !== 0) return d;
  } else if (a.currentSemester || b.currentSemester) {
    return a.currentSemester ? -1 : 1;
  }
  return a.studentName.localeCompare(b.studentName) || a.studentId - b.studentId;
}
export function sortPickers(pickers: readonly OfferingPicker[], sort: PickerSort = 'seniority'): OfferingPicker[] {
  const copy = [...pickers];
  if (sort === 'name') return copy.sort((a, b) => a.studentName.localeCompare(b.studentName) || a.studentId - b.studentId);
  return copy.sort(compareBySeniority);
}

export type ConfirmedOfferingSetEnvelope = Envelope<ConfirmedOfferingSet>;
export type ConfirmedOfferingOperationEnvelope = Envelope<OperationReceipt>;
export type ConfirmedOfferingAuditData = Paginated<ConfirmedOfferingAuditEntry>;
export type OfferingPickCountEnvelope = Envelope<OfferingPickCountSummary>;

export interface ConfirmationValidationIssue {
  field: 'subjectIds' | 'reason' | 'scope' | 'forecastRunId' | 'pickDeadline';
  code: string;
  message: string;
}
export type ConfirmationValidationResult = { ok: true } | { ok: false; issues: ConfirmationValidationIssue[] };

const isInt32Id = (value: unknown): value is Int32Id =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;

function checkScope(scope: ForecastScope | undefined, issues: ConfirmationValidationIssue[]): void {
  if (!scope || !isInt32Id(scope.programmeId) || !isInt32Id(scope.learningCentreId) || !isInt32Id(scope.targetSemesterId)) {
    issues.push({ field: 'scope', code: 'SCOPE_INVALID', message: 'programmeId, learningCentreId and targetSemesterId must be positive integers.' });
  }
}
function checkSubjectsAndReason(subjectIds: readonly unknown[], reason: unknown, issues: ConfirmationValidationIssue[]): void {
  if (!Array.isArray(subjectIds) || subjectIds.length === 0 || !subjectIds.every(isInt32Id)) {
    issues.push({ field: 'subjectIds', code: 'SUBJECTS_INVALID', message: 'Provide at least one positive integer subject ID.' });
  } else if (new Set(subjectIds).size !== subjectIds.length) {
    issues.push({ field: 'subjectIds', code: 'SUBJECTS_DUPLICATE', message: 'Subject IDs must be unique.' });
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    issues.push({ field: 'reason', code: 'REASON_REQUIRED', message: 'A reason is required and is recorded in the audit trail.' });
  }
}
const isDateTime = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
/** True while students may pick or change picks. After the deadline picks are closed (read-only). */
export function isPickWindowOpen(pickDeadline: string, now: Date = new Date()): boolean {
  return Date.parse(pickDeadline) > now.getTime();
}
/** Structural validation only; the server additionally checks run status, exclusions and revision. */
export function validateConfirmOfferingsRequest(request: ConfirmOfferingsRequest): ConfirmationValidationResult {
  const issues: ConfirmationValidationIssue[] = [];
  checkScope(request.scope, issues);
  if (!isInt32Id(request.forecastRunId)) {
    issues.push({ field: 'forecastRunId', code: 'RUN_REQUIRED', message: 'A FINALIZED forecast run for the same scope is required.' });
  }
  checkSubjectsAndReason(request.subjectIds, request.reason, issues);
  if (!isDateTime(request.pickDeadline)) {
    issues.push({ field: 'pickDeadline', code: 'DEADLINE_INVALID', message: 'A pick deadline (ISO date-time) is required.' });
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
export function validateWithdrawOfferingsRequest(request: WithdrawOfferingsRequest): ConfirmationValidationResult {
  const issues: ConfirmationValidationIssue[] = [];
  checkScope(request.scope, issues);
  checkSubjectsAndReason(request.subjectIds, request.reason, issues);
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
/** Changing the deadline needs a future date-time and a reason (audited). */
export function validateSetPickDeadlineRequest(request: SetPickDeadlineRequest, now: Date = new Date()): ConfirmationValidationResult {
  const issues: ConfirmationValidationIssue[] = [];
  checkScope(request.scope, issues);
  if (!isDateTime(request.pickDeadline) || Date.parse(request.pickDeadline) <= now.getTime()) {
    issues.push({ field: 'pickDeadline', code: 'DEADLINE_INVALID', message: 'The pick deadline must be a future ISO date-time.' });
  }
  if (typeof request.reason !== 'string' || request.reason.trim().length === 0) {
    issues.push({ field: 'reason', code: 'REASON_REQUIRED', message: 'A reason is required and is recorded in the audit trail.' });
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
