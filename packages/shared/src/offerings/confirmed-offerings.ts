/**
 * Superseded by the simplified offering flow (S2-P004-017 to S2-P004-024): the student offerings page
 * lists subjects the coordinator approved (`../forecasting/offering-decisions`) while the admin-set
 * selection window is open (`../forecasting/selection-window`). Only the helper other modules still
 * import is kept here, plus the re-exported student wording.
 */
import type { OfferingSemester } from './offerings';

export { CONFIRMED_OFFERING_LABEL, CONFIRMED_OFFERING_NOTICE } from '../forecasting/confirmed-offerings';

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
