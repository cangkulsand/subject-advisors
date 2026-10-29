/** UC08 contract. IDs are positive INTEGER decimal strings, never a Clerk identity. */
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
  | { status: 'available'; items: Array<{ requiredCurriculumSubjectId: string; requirementType: OfferingRequirementType }> }
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
export interface OfferingContext {
  curriculum: { curriculumId: string; name: string; programmeName: string; totalCreditRequired?: number };
  /** Current period chosen in the academic profile. Optional only for legacy/demo fixtures. */
  currentSemesterId?: string;
  subjects: OfferingSubject[];
  semesters: OfferingSemester[];
}
export interface OfferingSelection {
  semesterId: string;
  curriculumSubjectIds: string[];
}
export interface OfferingPageData extends OfferingContext {
  selection: OfferingSelection | null;
  academicHistory?: OfferingAcademicHistory;
}
export type SaveOfferings = OfferingSelection;
export interface OfferingsClient {
  load(semesterId?: string, signal?: AbortSignal): Promise<OfferingPageData>;
  save(input: SaveOfferings): Promise<OfferingSelection>;
  /** Clear private academic snapshots before a user-requested reload. */
  refresh?(): void;
}
export const OFFERING_NOTICE = 'Student-reported offerings — not verified by UTMSPACE';
export function semesterType(semesterNo: OfferingSemester['semesterNo']): 'Normal' | 'Short' {
  return semesterNo === 3 ? 'Short' : 'Normal';
}
export function semesterLabel(semester: OfferingSemester): string {
  return `Academic Year ${semester.academicYear} — Semester ${semester.semesterNo} (${semesterType(semester.semesterNo)} Semester)`;
}
