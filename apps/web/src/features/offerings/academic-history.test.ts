import { describe, expect, it } from 'vitest';
import type { OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringHistoryState, readOfferingAcademicHistory, summarizeOfferingHistory } from './academic-history';

const subject = (subjectId: string): OfferingSubject => ({ curriculumSubjectId: subjectId, subjectId, code: `FIX${subjectId}`, name: 'Fictional subject', creditHours: 3 });
const record = (subjectId: number, status: string, recognizedCredits: number) => ({
  subjectId, status, recognizedCredits, creditHours: 3, subjectCode: `FIX${subjectId}`, subjectName: 'Fictional subject',
});

describe('UC08 own academic history projection', () => {
  it('preserves status and recorded recognized credits, including zero-credit exemptions', () => {
    const history = readOfferingAcademicHistory([record(1, 'COMPLETED', 3), record(2, 'EXEMPTED', 0), record(3, 'FAILED', 0), record(4, 'WITHDRAWN', 0)]);
    expect(history).toMatchObject({ status: 'available', records: [
      { subjectId: '1', status: 'COMPLETED', recognizedCredits: 3 },
      { subjectId: '2', status: 'EXEMPTED', recognizedCredits: 0 },
      { subjectId: '3', status: 'FAILED', recognizedCredits: 0 },
      { subjectId: '4', status: 'WITHDRAWN', recognizedCredits: 0 },
    ] });
    expect(offeringHistoryState(subject('1'), history)).toBe('taken');
    expect(offeringHistoryState(subject('2'), history)).toBe('exempted');
    expect(offeringHistoryState(subject('3'), history)).toBe('remaining');
    expect(offeringHistoryState(subject('9'), history)).toBe('remaining');
    expect(offeringHistoryState(subject('1'), undefined)).toBe('unknown');
  });
  it('treats duplicates as ambiguous and excludes their counts and credits', () => {
    const history = readOfferingAcademicHistory([record(1, 'COMPLETED', 3), record(1, 'EXEMPTED', 3), record(2, 'EXEMPTED', 0)]);
    expect(offeringHistoryState(subject('1'), history)).toBe('ambiguous');
    expect(summarizeOfferingHistory([subject('1'), subject('2'), subject('9')], history)).toEqual({
      takenCount: 0, exemptedCount: 1, earnedCredits: 0, exemptedCredits: 0, complete: false, unresolvedCount: 1,
    });
  });
  it('summarizes only unambiguous records in the current curriculum and distinguishes unknown history', () => {
    const history = readOfferingAcademicHistory([record(1, 'COMPLETED', 3), record(2, 'EXEMPTED', 2), record(3, 'FAILED', 8), record(4, 'WITHDRAWN', 9), record(88, 'COMPLETED', 4)]);
    expect(summarizeOfferingHistory([subject('1'), subject('2'), subject('3'), subject('4')], history)).toEqual({
      takenCount: 1, exemptedCount: 1, earnedCredits: 3, exemptedCredits: 2, complete: true, unresolvedCount: 0,
    });
    expect(summarizeOfferingHistory([subject('1')], { status: 'unavailable' })).toBeNull();
    expect(summarizeOfferingHistory([{ ...subject('1'), subjectId: undefined }], history)).toMatchObject({
      complete: false, unresolvedCount: 1,
    });
    expect(summarizeOfferingHistory([subject('1'), { ...subject('2'), subjectId: '1' }], history)).toMatchObject({
      complete: false, unresolvedCount: 1,
    });
    expect(readOfferingAcademicHistory([])).toEqual({ status: 'available', records: [] });
  });
  it('rejects malformed records and identifiers', () => {
    expect(() => readOfferingAcademicHistory([{ ...record(1, 'PASSED', 3) }])).toThrow('Invalid academic history response');
    expect(() => readOfferingAcademicHistory([{ ...record(0, 'COMPLETED', 3) }])).toThrow('Invalid PostgreSQL integer identifier');
    expect(() => readOfferingAcademicHistory([{ ...record(1, 'COMPLETED', -1) }])).toThrow('Invalid academic history response');
  });
});
