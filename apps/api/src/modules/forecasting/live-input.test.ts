import { describe, expect, it } from 'vitest';
import { engineStudentsOf } from './live-input';
import type { BuiltSystemSnapshot } from './system-snapshot';

const built = (): BuiltSystemSnapshot => ({
  students: [
    { externalReference: 'PORTAL-1', curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE', studentName: 'Aina' },
    { externalReference: 'PORTAL-2', curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness: 'UNKNOWN', studentName: null },
  ],
  records: [
    { externalReference: 'PORTAL-1', subjectId: 10, subjectStatus: 'COMPLETED', semesterId: 1, recognizedCredits: null, isSynthetic: false },
    { externalReference: 'PORTAL-1', subjectId: 11, subjectStatus: 'FAILED', semesterId: null, recognizedCredits: 3, isSynthetic: false },
  ],
  coverage: {} as BuiltSystemSnapshot['coverage'], fingerprint: 'x', matricByReference: new Map(),
});

describe('engineStudentsOf', () => {
  it('groups records per student and keeps history completeness', () => {
    expect(engineStudentsOf(built())).toEqual([
      { externalReference: 'PORTAL-1', studentName: 'Aina', curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE', records: [
        { subjectId: 10, status: 'COMPLETED', semesterId: 1, recognizedCredits: null },
        { subjectId: 11, status: 'FAILED', semesterId: null, recognizedCredits: 3 },
      ] },
      { externalReference: 'PORTAL-2', studentName: null, curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness: 'UNKNOWN', records: [] },
    ]);
  });
});
