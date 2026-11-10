import type { CurriculumPrerequisiteSummary } from '../curriculum-reference';

/**
 * UC08 contract. IDs are positive INTEGER decimal strings, never a Clerk identity.
 * @deprecated in part (S2-P004-006, 2026-11-01): UC08 is no longer student-reported. The
 * semester offerings page shows coordinator-confirmed subjects; see ./confirmed-offerings.
 * These types remain for backward compatibility until the P002 package replaces them.
 */
export interface OfferingSubject {
  curriculumSubjectId: string;
  /** Underlying subject identity; optional for backwards-compatible fixtures. */
  subjectId?: string;
  code: string;
  name: string;
  creditHours: number;
  /** Curriculum-specific classification. Missing means unknown, not another category. */
  subjectCategory?: string | null;
  isCompulsory?: 0 | 1;
  /** Optional direct catalogue metadata. Available with [] is known-empty; unavailable is unknown. */
  prerequisites?: OfferingPrerequisites;
}
export type OfferingRequirementType = 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE';
export type OfferingPrerequisites =
  | { status: 'available'; items: Array<{ requiredCurriculumSubjectId: string; requirementType: OfferingRequirementType }>; details?: CurriculumPrerequisiteSummary }
  | { status: 'unavailable' };
export type OfferingAcademicRecordStatus = 'COMPLETED' | 'EXEMPTED' | 'FAILED' | 'WITHDRAWN';
export interface OfferingAcademicRecord {
  subjectId: string;
  code: string;
  name: string;
  status: OfferingAcademicRecordStatus;
  recognizedCredits: number;
  creditHours: number;
}
/** Omitted history is unknown in legacy/demo data; available with [] means known empty. */
export type OfferingAcademicHistory =
  | { status: 'available'; records: OfferingAcademicRecord[] }
  | { status: 'unavailable' };
export interface OfferingSemester {
  semesterId: string;
  academicYear: string;
  semesterNo: 1 | 2 | 3;
}
/**
 * Where the next semester's selection window stands for this student (S2-P004-022).
 * NO_NEXT_SEMESTER and NO_LEARNING_CENTRE are not window states; they explain why nothing is offered.
 */
export type OfferingWindowStatus = 'NO_NEXT_SEMESTER' | 'NO_LEARNING_CENTRE' | 'NOT_SCHEDULED' | 'NOT_OPEN' | 'OPEN' | 'CLOSED';
export interface OfferingWindow {
  status: OfferingWindowStatus;
  /** The next semester after the admin current semester; null when none is configured. */
  targetSemesterId: string | null;
  selectionOpensAt: string | null;
  selectionClosesAt: string | null;
  learningCentreName: string | null;
}
/** academic_semester.max_subjects / max_credits of the target semester. */
export interface OfferingPickLimits { maxSubjects: number; maxCredits: number }
/** A subject the coordinator withdrew after the student picked it. */
export interface WithdrawnOffering { subjectId: string; code: string; name: string; withdrawnAt: string }
/** Same wording on the page and in the API (409 PICK_LIMIT_EXCEEDED). */
export function pickLimitMessage(limits: OfferingPickLimits): string {
  return `You can pick at most ${limits.maxSubjects} subjects and ${limits.maxCredits} credits for this semester.`;
}
/** Context of the student offerings page: the approved subjects of the next semester and the selection window. */
export interface OfferingContext {
  curriculum: { curriculumId: string; name: string; programmeName: string; totalCreditRequired?: number };
  /**
   * The target (next) semester. It no longer follows the profile's current semester (S2-P004-022).
   * Absent only for legacy/demo fixtures and when no next semester is configured.
   */
  currentSemesterId?: string;
  /** Subjects the coordinator approved for the student's programme + learning centre; [] unless the window is OPEN or CLOSED. */
  subjects: OfferingSubject[];
  semesters: OfferingSemester[];
  /** Optional so demo fixtures keep working; a page without it behaves as OPEN. */
  window?: OfferingWindow;
  limits?: OfferingPickLimits;
  /**
   * Every subject of the curriculum, without prerequisites. Prerequisites of an offered subject
   * resolve against this list because a prerequisite need not be offered itself.
   */
  prerequisiteCatalogue?: OfferingSubject[];
}
/** PUT body shape for student picks. */
export interface OfferingSelection {
  semesterId: string;
  curriculumSubjectIds: string[];
}
export interface OfferingPageData extends OfferingContext {
  selection: OfferingSelection | null;
  academicHistory?: OfferingAcademicHistory;
  withdrawnSubjects?: WithdrawnOffering[];
}
export type SaveOfferings = OfferingSelection;
export interface OfferingsClient {
  load(semesterId?: string, signal?: AbortSignal): Promise<OfferingPageData>;
  save(input: SaveOfferings): Promise<OfferingSelection>;
  /** Clear private academic snapshots before a user-requested reload. */
  refresh?(): void;
}
/** @deprecated Student-reported wording is withdrawn. Use CONFIRMED_OFFERING_NOTICE (../forecasting/confirmed-offerings). Kept because the legacy page text is hard-coded until the P002 package. */
export const OFFERING_NOTICE = 'Student-reported offerings — not verified by UTMSPACE';
export function semesterType(semesterNo: OfferingSemester['semesterNo']): 'Normal' | 'Short' {
  return semesterNo === 3 ? 'Short' : 'Normal';
}
export function semesterLabel(semester: OfferingSemester): string {
  return `Academic Year ${semester.academicYear} — Semester ${semester.semesterNo} (${semesterType(semester.semesterNo)} Semester)`;
}
