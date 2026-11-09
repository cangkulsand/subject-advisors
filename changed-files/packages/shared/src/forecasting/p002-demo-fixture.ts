import type { EngineSnapshot, EngineStudent } from './engine/types';

/** Synthetic-only 50-student sample for future demos and UI work; this generator performs no persistence. */
export function createP002DemoCohort(): { snapshot: EngineSnapshot; expected: { cohort: number; eligible: number; unknownHistory: number; distinctReferences: number } } {
  const students: EngineStudent[] = Array.from({ length: 50 }, (_, index) => ({
    externalReference: `DEMO-P002-${String(index + 1).padStart(3, '0')}`,
    studentName: `Demo Student ${index + 1}`,
    curriculumId: 1,
    cohortStatus: 'ACTIVE',
    historyCompleteness: index >= 45 ? 'UNKNOWN' : 'COMPLETE',
    records: [],
  }));
  return { snapshot: { students, rejectedRowsByStudent: {} }, expected: { cohort: 50, eligible: 45, unknownHistory: 5, distinctReferences: 50 } };
}
