import { describe, expect, it } from 'vitest';
import { coordinatorTargetSemester } from './target-semester';

const s = (semesterId: number, academicYear: string, semesterNumber: 1 | 2 | 3, semesterType?: 'NORMAL' | 'SHORT') => ({ semesterId, academicYear, semesterNumber, ...(semesterType ? { semesterType } : {}) });
const semesters = [s(1, '2026/2027', 1, 'NORMAL'), s(2, '2026/2027', 2, 'NORMAL'), s(3, '2026/2027', 3, 'SHORT'), s(4, '2027/2028', 1, 'NORMAL'), s(5, '2027/2028', 2, 'NORMAL')];

describe('coordinatorTargetSemester (S3-P004-031)', () => {
  it('is the next semester when it is Normal', () => {
    expect(coordinatorTargetSemester(1, semesters)?.semesterId).toBe(2);
  });
  it('skips a Short semester and returns the next Normal one', () => {
    expect(coordinatorTargetSemester(2, semesters)?.semesterId).toBe(4);
  });
  it('from a Short current semester returns the next Normal one', () => {
    expect(coordinatorTargetSemester(3, semesters)?.semesterId).toBe(4);
  });
  it('treats a semester without a type as Normal', () => {
    expect(coordinatorTargetSemester(1, [s(1, '2026/2027', 1), s(2, '2026/2027', 2)])?.semesterId).toBe(2);
  });
  it('orders by year then number regardless of input order', () => {
    expect(coordinatorTargetSemester(2, [...semesters].reverse())?.semesterId).toBe(4);
  });
  it('is null with no current semester, an unknown current semester, or no later Normal semester', () => {
    expect(coordinatorTargetSemester(null, semesters)).toBeNull();
    expect(coordinatorTargetSemester(99, semesters)).toBeNull();
    expect(coordinatorTargetSemester(5, semesters)).toBeNull();
    expect(coordinatorTargetSemester(2, semesters.slice(0, 3))).toBeNull();
  });
});
