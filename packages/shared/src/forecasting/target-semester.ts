/**
 * The semester a coordinator forecasts and approves (S3-P004-031): the first NORMAL semester after the admin current
 * semester. Short semesters are arranged outside this application, so coordinators skip them. Students still pick for the
 * semester straight after the current one (`nextSemesterAfter` in ../offerings/confirmed-offerings).
 * A semester without a type is treated as Normal.
 */
export interface TypedSemester { semesterId: number; academicYear: string; semesterNumber: number; semesterType?: 'NORMAL' | 'SHORT' }

export function coordinatorTargetSemester<T extends TypedSemester>(currentSemesterId: number | null, semesters: readonly T[]): T | null {
  if (currentSemesterId === null) return null;
  const current = semesters.find((semester) => semester.semesterId === currentSemesterId);
  if (!current) return null;
  const after = (s: TypedSemester) => s.academicYear > current.academicYear || (s.academicYear === current.academicYear && s.semesterNumber > current.semesterNumber);
  const later = semesters.filter((s) => after(s) && s.semesterType !== 'SHORT');
  later.sort((x, y) => x.academicYear === y.academicYear ? x.semesterNumber - y.semesterNumber : x.academicYear < y.academicYear ? -1 : 1);
  return later[0] ?? null;
}
