import { describe, expect, it } from 'vitest';
import type { AcademicRecord } from '../../../../api/src/modules/records/contracts';
import type { SubjectOption } from '../../../../api/src/modules/profile/contracts';
import { summarizeRecordedCredits } from './recorded-credit-summary';

const subjects: SubjectOption[] = [
  { subjectId: 1, subjectCode: 'DEMO101', subjectName: 'Fictional completed subject', creditHours: 3 },
  { subjectId: 2, subjectCode: 'DEMO102', subjectName: 'Fictional exempted subject', creditHours: 4 },
  { subjectId: 3, subjectCode: 'DEMO103', subjectName: 'Fictional failed subject', creditHours: 3 },
  { subjectId: 4, subjectCode: 'DEMO104', subjectName: 'Fictional withdrawn subject', creditHours: 3 },
];
function row(subjectId: number, status: AcademicRecord['status'], recognizedCredits: number, recordId = subjectId): AcademicRecord {
  return { recordId, subjectId, subjectCode: `DEMO${subjectId}`, subjectName: 'Fictional subject', creditHours: 3,
    semesterId: null, academicYear: null, semesterNo: null, status, grade: null, recognizedCredits, remarks: null,
    createdAt: '2026-01-01T00:00:00Z' };
}

describe('Subject Records recorded-credit summary', () => {
  it('separates uniquely mapped completed and exempted credits, including zero credit exemptions', () => {
    expect(summarizeRecordedCredits(subjects, [row(1, 'COMPLETED', 3), row(2, 'EXEMPTED', 0),
      row(3, 'FAILED', 0), row(4, 'WITHDRAWN', 0), row(99, 'COMPLETED', 12)])).toEqual({
      earnedCredits: 3, exemptedCredits: 0, takenCount: 1, exemptedCount: 1,
      complete: true, unresolvedCount: 0, mappedSubjectCount: 4,
    });
  });

  it('keeps only known totals and suppresses completion when a curriculum record is duplicated', () => {
    expect(summarizeRecordedCredits(subjects, [row(1, 'COMPLETED', 3), row(2, 'EXEMPTED', 4, 22),
      row(2, 'FAILED', 0, 23)])).toMatchObject({ earnedCredits: 3, exemptedCredits: 0, complete: false, unresolvedCount: 1 });
  });

  it('marks repeated curriculum mappings, missing subject IDs and empty catalogs unresolved', () => {
    const repeated = [...subjects.slice(0, 1), { ...subjects[0]! }];
    expect(summarizeRecordedCredits(repeated, [row(1, 'COMPLETED', 3)])).toMatchObject({ complete: false, earnedCredits: 0, unresolvedCount: 1 });
    expect(summarizeRecordedCredits([{ ...subjects[0]!, subjectId: undefined as unknown as number }], [])).toMatchObject({ complete: false, unresolvedCount: 1 });
    expect(summarizeRecordedCredits([], [])).toMatchObject({ complete: false, unresolvedCount: 1, mappedSubjectCount: 0 });
  });

  it('does not count malformed recognized credit values as known progress', () => {
    expect(summarizeRecordedCredits(subjects.slice(0, 1), [row(1, 'COMPLETED', Number.NaN)])).toMatchObject({
      earnedCredits: 0, complete: false, unresolvedCount: 1,
    });
  });
});
