import type { CurriculumOption } from '../../../../api/src/modules/profile/contracts';

/** Resolve only an unambiguous active option, except when retaining the saved version. */
export function resolveProgrammeCurriculum(
  curricula: CurriculumOption[],
  programmeId: string,
  savedCurriculumId?: number,
): number | null {
  if (!programmeId) return null;
  const matching = curricula.filter(option => String(option.programmeId) === programmeId);
  if (savedCurriculumId !== undefined && matching.some(option => option.curriculumId === savedCurriculumId)) {
    return savedCurriculumId;
  }
  return matching.length === 1 ? matching[0]!.curriculumId : null;
}
