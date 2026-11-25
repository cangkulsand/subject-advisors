import type { CurriculumIntake } from '../../../../../packages/shared/src/admin/academic-setup';

/** One line per intake year, shown as "2022 intake: 225" or "Not set: 3"; "No students" (count null) when the curriculum has none (S3-P004-037). */
export function curriculumIntakeLines(intakes: CurriculumIntake[]): { label: string; students: number | null }[] {
  if (!intakes.length) return [{ label: 'No students', students: null }];
  return intakes.map(item => ({ label: item.intakeYear === null ? 'Not set' : `${item.intakeYear} intake`, students: item.students }));
}
export const intakeYearLabel = (year: number | null) => year === null ? 'Not set' : String(year);
export const intakeYearChangeNotice = (year: number) => `Intake year changed to ${year}.`;
