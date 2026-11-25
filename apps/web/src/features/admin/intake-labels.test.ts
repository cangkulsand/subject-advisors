import { expect, it } from 'vitest';
import { curriculumIntakeLines, intakeYearChangeNotice, intakeYearLabel } from './intake-labels';

it('lists students per intake year, not set last, or says there are none (S3-P004-037)', () => {
  expect(curriculumIntakeLines([{ intakeYear: 2023, students: 4 }, { intakeYear: 2022, students: 225 }, { intakeYear: null, students: 3 }]))
    .toEqual([{ label: '2023 intake', students: 4 }, { label: '2022 intake', students: 225 }, { label: 'Not set', students: 3 }]);
  expect(curriculumIntakeLines([])).toEqual([{ label: 'No students', students: null }]);
});
it('labels the saved intake year and the change notice', () => {
  expect(intakeYearLabel(2022)).toBe('2022');
  expect(intakeYearLabel(null)).toBe('Not set');
  expect(intakeYearChangeNotice(2023)).toBe('Intake year changed to 2023.');
});
