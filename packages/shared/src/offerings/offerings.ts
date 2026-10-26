/** UC08 contract. IDs are positive INTEGER decimal strings, never a Clerk identity. */
export interface OfferingSubject {
  curriculumSubjectId: string;
  code: string;
  name: string;
  creditHours: number;
}
export interface OfferingSemester {
  semesterId: string;
  academicYear: string;
  semesterNo: 1 | 2 | 3;
}
export interface OfferingContext {
  curriculum: { curriculumId: string; name: string; programmeName: string };
  subjects: OfferingSubject[];
  semesters: OfferingSemester[];
}
export interface OfferingSelection {
  semesterId: string;
  curriculumSubjectIds: string[];
}
export interface OfferingPageData extends OfferingContext {
  selection: OfferingSelection | null;
}
export type SaveOfferings = OfferingSelection;
export interface OfferingsClient {
  load(semesterId?: string, signal?: AbortSignal): Promise<OfferingPageData>;
  save(input: SaveOfferings): Promise<OfferingSelection>;
}
export const OFFERING_NOTICE = 'Student-reported offerings — not verified by UTMSPACE';
export function semesterType(semesterNo: OfferingSemester['semesterNo']): 'Normal' | 'Short' {
  return semesterNo === 3 ? 'Short' : 'Normal';
}
export function semesterLabel(semester: OfferingSemester): string {
  return `Academic Year ${semester.academicYear} — Semester ${semester.semesterNo} (${semesterType(semester.semesterNo)} Semester)`;
}
