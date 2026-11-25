/**
 * Intake year and curriculum (S3-P004-037). The student picks the intake year; the curriculum follows.
 * Pure rules shared by the profile API (save validation) and the profile page.
 */
export interface IntakeCurriculum { curriculumId: number; curriculumVersion: string; effectiveYear: number | null }
export type IntakeCurriculumResult = { curriculumId: number } | { choose: number[] };

/**
 * Picks the curriculum for an intake year among the offered curricula of ONE programme: the curriculum with the
 * greatest effective year on or before the intake year. A tie on that year, or no curriculum effective by then
 * (later or unknown years), leaves the choice to the student. A single offered curriculum is always the answer.
 */
export function curriculumForIntake(curricula: IntakeCurriculum[], intakeYear: number): IntakeCurriculumResult {
  if (curricula.length === 1) return { curriculumId: curricula[0]!.curriculumId };
  const effective = curricula.filter(c => c.effectiveYear !== null && c.effectiveYear <= intakeYear);
  if (!effective.length) return { choose: curricula.map(c => c.curriculumId) };
  const latest = Math.max(...effective.map(c => c.effectiveYear!));
  const winners = effective.filter(c => c.effectiveYear === latest);
  return winners.length === 1 ? { curriculumId: winners[0]!.curriculumId } : { choose: winners.map(c => c.curriculumId) };
}

/** "V1 (from 2022)", or "V1" when the effective year is unknown. */
export function curriculumLabel(c: { curriculumVersion: string; effectiveYear: number | null }): string {
  return c.effectiveYear === null ? c.curriculumVersion : `${c.curriculumVersion} (from ${c.effectiveYear})`;
}

/** Intake years a student may pick: the last twelve years up to the current UTC year. */
export function intakeYearRange(now: Date): { min: number; max: number } {
  const year = now.getUTCFullYear();
  return { min: year - 12, max: year };
}
