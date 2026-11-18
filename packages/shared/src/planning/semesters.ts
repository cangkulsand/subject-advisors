import type { SemesterLimit, SemesterRef, SemesterType } from './contracts';

export const DEFAULT_LIMITS: Record<SemesterType, { maxSubjects: number; maxCredits: number }> = {
  NORMAL: { maxSubjects: 3, maxCredits: 10 },
  SHORT: { maxSubjects: 3, maxCredits: 6 },
};

/** Semester 1 and 2 are Normal, semester 3 is Short (academic_semester rule 4). */
export const semesterTypeOf = (semesterNo: number): SemesterType => semesterNo === 3 ? 'SHORT' : 'NORMAL';

/** "2026/2027" -> "2027/2028". Anything else is returned unchanged. */
export function nextAcademicYear(academicYear: string): string {
  const match = /^(\d{4})\/(\d{4})$/.exec(academicYear);
  return match ? `${Number(match[1]) + 1}/${Number(match[2]) + 1}` : academicYear;
}

/** The semester `offset` steps after `start` (offset 0 = start). Without a start, numbered semesters from Semester 1. */
export function semesterAt(start: SemesterRef | null, offset: number): SemesterRef {
  let academicYear = start?.academicYear ?? '';
  let semesterNo = start?.semesterNo ?? 1;
  for (let step = 0; step < offset; step++) {
    semesterNo++;
    if (semesterNo > 3) { semesterNo = 1; academicYear = nextAcademicYear(academicYear); }
  }
  return { academicYear, semesterNo };
}

/** 0-based offset of `target` from `start` (0 = start); null without a calendar or when the target is before start. */
export function semesterIndex(start: SemesterRef | null, target: SemesterRef): number | null {
  if (start === null) return null;
  for (let offset = 0; offset < 60; offset++) {
    const ref = semesterAt(start, offset);
    if (ref.academicYear === target.academicYear && ref.semesterNo === target.semesterNo) return offset;
  }
  return null;
}

/** UC14 BR12 label without the "AY" prefix (owner decision 2026-11-16), e.g. "2026/2027 – Semester 3 (Short Semester)"; numbered when there is no calendar. */
export function semesterLabel(semester: SemesterRef, index: number, calendar: boolean): string {
  const short = semester.semesterNo === 3 ? ' (Short Semester)' : '';
  return calendar ? `${semester.academicYear} – Semester ${semester.semesterNo}${short}` : `Plan semester ${index}${short}`;
}

export const allowedSemesterTypes = (subject: { creditHours: number; semesterTypes: SemesterType[] }): SemesterType[] =>
  subject.semesterTypes.length > 0 ? subject.semesterTypes : subject.creditHours === 2 ? ['SHORT'] : ['NORMAL', 'SHORT'];

const order = (left: SemesterRef, right: SemesterRef) =>
  left.academicYear === right.academicYear ? left.semesterNo - right.semesterNo : left.academicYear < right.academicYear ? -1 : 1;

/** Configured limits for that semester; else the latest configured semester of the same type; else the defaults. */
export function limitsFor(semester: SemesterRef, limits: SemesterLimit[]): { maxSubjects: number; maxCredits: number; configured: boolean } {
  const exact = limits.find(item => item.academicYear === semester.academicYear && item.semesterNo === semester.semesterNo);
  if (exact) return { maxSubjects: exact.maxSubjects, maxCredits: exact.maxCredits, configured: true };
  const type = semesterTypeOf(semester.semesterNo);
  const sameType = limits.filter(item => semesterTypeOf(item.semesterNo) === type).sort(order).at(-1);
  if (sameType) return { maxSubjects: sameType.maxSubjects, maxCredits: sameType.maxCredits, configured: true };
  return { ...DEFAULT_LIMITS[type], configured: false };
}
