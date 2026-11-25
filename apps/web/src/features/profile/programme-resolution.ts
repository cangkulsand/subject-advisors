import type { CurriculumOption } from '../../../../api/src/modules/profile/contracts';
import { curriculumForIntake, curriculumLabel, intakeYearRange } from '../../../../../packages/shared/src/profile/intake';

/** How the setup form shows the curriculum (S3-P004-037): the intake year decides it, a tie asks the student. */
export type CurriculumResolution =
  | { kind: 'pending' }
  | { kind: 'single'; curriculum: CurriculumOption }
  | { kind: 'choose'; options: CurriculumOption[]; selected: CurriculumOption | null };

/** Applies the shared intake rule to the chosen programme; `chosenId` is the student's pick, kept only when it is one of the tie. */
export function resolveIntakeCurriculum(curricula: CurriculumOption[], programmeId: string, intakeYear: string, chosenId: string): CurriculumResolution {
  if (!programmeId || !intakeYear) return { kind: 'pending' };
  const offered = curricula.filter(c => String(c.programmeId) === programmeId);
  if (!offered.length) return { kind: 'pending' };
  const result = curriculumForIntake(offered, Number(intakeYear));
  if ('curriculumId' in result) return { kind: 'single', curriculum: offered.find(c => c.curriculumId === result.curriculumId)! };
  const options = offered.filter(c => result.choose.includes(c.curriculumId));
  return { kind: 'choose', options, selected: options.find(c => String(c.curriculumId) === chosenId) ?? null };
}

/** "V1 (from 2022) · 131 credits". */
export const curriculumOptionText = (c: CurriculumOption) => `${curriculumLabel(c)} · ${c.totalCreditRequired} credits`;

/** Intake years the student may pick, newest first. */
export function intakeYears(now: Date): number[] {
  const { min, max } = intakeYearRange(now);
  return Array.from({ length: max - min + 1 }, (_, i) => max - i);
}

/** Read-only line for a saved profile; a curriculum no longer offered keeps its saved version. */
export function savedIntakeSummary(
  profile: { intakeYear: number | null; curriculumId: number; curriculumVersion: string; totalCreditRequired?: number | null },
  curricula: CurriculumOption[],
): string {
  const offered = curricula.find(c => c.curriculumId === profile.curriculumId);
  const label = curriculumLabel({ curriculumVersion: offered?.curriculumVersion ?? profile.curriculumVersion, effectiveYear: offered?.effectiveYear ?? null });
  const credits = profile.totalCreditRequired ?? offered?.totalCreditRequired ?? null;
  const intake = profile.intakeYear === null ? 'Intake year: not set' : `Intake ${profile.intakeYear}`;
  return `${intake} · Curriculum ${label}` + (credits === null ? '' : ` · ${credits} credits`);
}
