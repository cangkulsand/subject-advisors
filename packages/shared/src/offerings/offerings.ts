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
/** @deprecated Lists curriculum subjects for student reporting; replaced by ConfirmedOfferingsPageData. */
export interface OfferingContext {
  curriculum: { curriculumId: string; name: string; programmeName: string; totalCreditRequired?: number };
  /** Current period chosen in the academic profile. Optional only for legacy/demo fixtures. */
  currentSemesterId?: string;
  subjects: OfferingSubject[];
  semesters: OfferingSemester[];
}
/** Still the PUT body shape for student picks (see SaveOfferingPicks). */
export interface OfferingSelection {
  semesterId: string;
  curriculumSubjectIds: string[];
}
/** @deprecated Replaced by ConfirmedOfferingsPageData (./confirmed-offerings). */
export interface OfferingPageData extends OfferingContext {
  selection: OfferingSelection | null;
  academicHistory?: OfferingAcademicHistory;
}
/** @deprecated Use SaveOfferingPicks. */
export type SaveOfferings = OfferingSelection;
export interface OfferingsClient {
  load(semesterId?: string, signal?: AbortSignal): Promise<OfferingPageData>;
  save(input: SaveOfferings): Promise<OfferingSelection>;
  /** Clear private academic snapshots before a user-requested reload. */
  refresh?(): void;
}
/** @deprecated Student-reported wording is withdrawn. Use CONFIRMED_OFFERING_NOTICE (./confirmed-offerings). Kept because the legacy page text is hard-coded until the P002 package. */
export const OFFERING_NOTICE = 'Student-reported offerings — not verified by UTMSPACE';
export function semesterType(semesterNo: OfferingSemester['semesterNo']): 'Normal' | 'Short' {
  return semesterNo === 3 ? 'Short' : 'Normal';
}
export function semesterLabel(semester: OfferingSemester): string {
  return `Academic Year ${semester.academicYear} — Semester ${semester.semesterNo} (${semesterType(semester.semesterNo)} Semester)`;
}
