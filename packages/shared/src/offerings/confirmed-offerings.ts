/**
 * PLANNED student-facing contracts for the coordinator-confirmed offerings rule
 * (product owner decision 2026-11-01, change S2-P004-006). IDs are positive INTEGER decimal
 * strings at this boundary, like the rest of the offerings API. Not implemented yet.
 */
import type { OfferingPrerequisites, OfferingSemester, OfferingSelection } from './offerings';

export { CONFIRMED_OFFERING_LABEL, CONFIRMED_OFFERING_NOTICE } from '../forecasting/confirmed-offerings';

/** A subject the coordinator confirmed for the student's programme + learning centre + target semester. */
export interface ConfirmedOfferingListItem {
  confirmedOfferingId: string;
  curriculumSubjectId: string;
  subjectId?: string;
  code: string;
  name: string;
  creditHours: number;
  subjectCategory?: string | null;
  isCompulsory?: 0 | 1;
  /** Display aid carried over from UC08; same known-empty versus unavailable semantics. */
  prerequisites?: OfferingPrerequisites;
  confirmedAt: string;
  /** True when the student has already picked this subject. */
  picked: boolean;
}
export interface ConfirmedOfferingsScope {
  programmeName: string;
  curriculumName?: string;
  learningCentreName: string;
}
/** Per-semester limits from academic_semester.max_subjects / max_credits (data model A.08, D07). */
export interface PickLimits { maxSubjects: number; maxCredits: number }
/** Remaining allowance shown on the page. */
export interface PickAllowance extends PickLimits {
  pickedSubjects: number;
  pickedCredits: number;
  remainingSubjects: number;
  remainingCredits: number;
}
/** Subject record statuses that count as passed; passed subjects are hidden from the student's list. */
export const PASSED_RECORD_STATUSES = ['COMPLETED', 'EXEMPTED'] as const;
export const NOT_YET_CONFIRMED_MESSAGE = 'Offerings not yet confirmed by the coordinator';
export const PICKS_CLOSED_MESSAGE = 'Picking is closed. The coordinator\'s deadline has passed.';
/** Stable server error codes. */
export const PICK_ERROR_CODES = {
  notConfirmed: 'OFFERING_NOT_CONFIRMED',
  closed: 'PICKS_CLOSED',
  limitExceeded: 'PICK_LIMIT_EXCEEDED',
  alreadyPassed: 'ALREADY_PASSED',
} as const;

/**
 * Response of the planned GET /api/semester-offerings (new meaning). The target semester is
 * the NEXT semester after the SYSTEM current semester, which is managed by the System
 * Administrator (Academic Semesters module, planned marker) and not by students. The student's
 * own profile current semester stays their setup value and does not drive the target. When the
 * coordinator has not confirmed any offering for the student's programme + learning centre +
 * target semester the state is NOT_YET_CONFIRMED and the student cannot pick.
 * The list excludes subjects the student has already passed (COMPLETED or EXEMPTED).
 * Prerequisites remain a display aid (UC09 owns eligibility).
 */
export type ConfirmedOfferingsPageData =
  | {
      status: 'CONFIRMED';
      scope: ConfirmedOfferingsScope;
      targetSemester: OfferingSemester;
      /** Opaque revision of the confirmed set; changes when the coordinator confirms or withdraws. */
      confirmationRevision: string;
      /** Coordinator's deadline (ISO date-time). */
      pickDeadline: string;
      /** OPEN: pick and change until the deadline. CLOSED: deadline passed; picks are read-only. */
      pickWindow: 'OPEN' | 'CLOSED';
      allowance: PickAllowance;
      offerings: ConfirmedOfferingListItem[];
    }
  | {
      /** Display: "Offerings not yet confirmed by the coordinator". No picking is possible. */
      status: 'NOT_YET_CONFIRMED';
      scope: ConfirmedOfferingsScope;
      targetSemester: OfferingSemester;
      offerings: [];
    }
  | {
      /** The admin-managed system semester has no following semester configured. */
      status: 'NO_NEXT_SEMESTER';
      scope: ConfirmedOfferingsScope;
      offerings: [];
    };

/**
 * The semester after the given current semester, in academic order (academic year, then
 * semester number 1, 2, 3). Pass the SYSTEM current semester ID (admin-managed); the helper
 * itself is source agnostic. Returns null when none is configured.
 */
export function nextSemesterAfter(
  currentSemesterId: string,
  semesters: readonly OfferingSemester[],
): OfferingSemester | null {
  const current = semesters.find((s) => s.semesterId === currentSemesterId);
  if (!current) return null;
  const later = semesters.filter((s) => s.academicYear > current.academicYear
    || (s.academicYear === current.academicYear && s.semesterNo > current.semesterNo));
  later.sort((x, y) => (x.academicYear === y.academicYear ? x.semesterNo - y.semesterNo : x.academicYear < y.academicYear ? -1 : 1));
  return later[0] ?? null;
}

/** Remove subjects the student already passed from the confirmed list. */
export function hideAlreadyPassed<T extends { subjectId?: string; curriculumSubjectId: string }>(
  offerings: readonly T[],
  passedSubjectIds: ReadonlySet<string>,
): T[] {
  return offerings.filter((o) => !(o.subjectId !== undefined && passedSubjectIds.has(o.subjectId)));
}

export function pickAllowance(limits: PickLimits, picked: readonly { creditHours: number }[]): PickAllowance {
  const pickedCredits = picked.reduce((sum, item) => sum + item.creditHours, 0);
  return {
    ...limits,
    pickedSubjects: picked.length,
    pickedCredits,
    remainingSubjects: Math.max(0, limits.maxSubjects - picked.length),
    remainingCredits: Math.max(0, limits.maxCredits - pickedCredits),
  };
}

/** Body of the planned PUT /api/semester-offerings. Same shape as the legacy selection. */
export type SaveOfferingPicks = OfferingSelection;

export interface OfferingPickIssue {
  code: 'PICK_DUPLICATE' | 'OFFERING_NOT_CONFIRMED' | 'PICK_LIMIT_SUBJECTS' | 'PICK_LIMIT_CREDITS' | 'ALREADY_PASSED';
  /** Null for limit issues, which apply to the whole selection. */
  curriculumSubjectId: string | null;
}
export type OfferingPickValidation = { ok: true } | { ok: false; issues: OfferingPickIssue[] };
export interface OfferingPickOptions {
  /** academic_semester limits of the target semester; enforce on save with PICK_LIMIT_EXCEEDED. */
  limits?: PickLimits;
  /** Curriculum subject IDs the student already passed; they cannot be picked. */
  passedCurriculumSubjectIds?: ReadonlySet<string>;
}

/**
 * Picks may only be currently confirmed subjects, without duplicates, not already passed,
 * and within the semester subject/credit limits. Empty clears all picks. The server also
 * rejects saves after the deadline (409 PICKS_CLOSED); see isPickWindowOpen.
 */
export function validateOfferingPicks(
  curriculumSubjectIds: readonly string[],
  confirmed: readonly { curriculumSubjectId: string; creditHours?: number }[],
  options: OfferingPickOptions = {},
): OfferingPickValidation {
  const byId = new Map(confirmed.map((item) => [item.curriculumSubjectId, item]));
  const seen = new Set<string>();
  const issues: OfferingPickIssue[] = [];
  let credits = 0;
  for (const id of curriculumSubjectIds) {
    if (seen.has(id)) issues.push({ code: 'PICK_DUPLICATE', curriculumSubjectId: id });
    else if (!byId.has(id)) issues.push({ code: 'OFFERING_NOT_CONFIRMED', curriculumSubjectId: id });
    else if (options.passedCurriculumSubjectIds?.has(id)) issues.push({ code: 'ALREADY_PASSED', curriculumSubjectId: id });
    else credits += byId.get(id)?.creditHours ?? 0;
    seen.add(id);
  }
  const { limits } = options;
  if (limits) {
    if (seen.size > limits.maxSubjects) issues.push({ code: 'PICK_LIMIT_SUBJECTS', curriculumSubjectId: null });
    if (credits > limits.maxCredits) issues.push({ code: 'PICK_LIMIT_CREDITS', curriculumSubjectId: null });
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
