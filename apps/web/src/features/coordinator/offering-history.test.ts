import { describe, expect, it } from 'vitest';
import type { SemesterOption } from '../../../../../packages/shared/src/forecasting/contracts';
import type { OfferingDecisionSet } from '../../../../../packages/shared/src/forecasting/offering-decisions';
import { closedSemesters, historyRows } from './offering-history';

const now = new Date('2026-11-15T00:00:00.000Z');
const semester = (semesterId: number, selectionClosesAt?: string | null, selectionOpensAt: string | null = '2024-01-01T00:00:00.000Z'): SemesterOption => ({ semesterId, academicYear: '2025/2026', semesterNumber: 1, selectionOpensAt, selectionClosesAt });

describe('closedSemesters', () => {
  it('lists only semesters whose selection closed before now', () => {
    const list = closedSemesters([semester(1, '2026-01-01T00:00:00.000Z'), semester(2, '2026-12-01T00:00:00.000Z'), semester(3, null), semester(4), semester(5, 'not a date')], now);
    expect(list.map(item => item.semesterId)).toEqual([1]);
  });
  it('follows selectionPhase: closed at exactly the closing time, never closed without an opening time', () => {
    const list = closedSemesters([semester(1, now.toISOString()), semester(2, '2026-01-01T00:00:00.000Z', null)], now);
    expect(list.map(item => item.semesterId)).toEqual([1]);
  });
  it('sorts newest first by the closing time and keeps the input untouched', () => {
    const input = [semester(1, '2025-03-01T00:00:00.000Z'), semester(2, '2026-06-01T00:00:00.000Z'), semester(3, '2025-11-01T00:00:00.000Z')];
    expect(closedSemesters(input, now).map(item => item.semesterId)).toEqual([2, 3, 1]);
    expect(input.map(item => item.semesterId)).toEqual([1, 2, 3]);
  });
});

const decision = (subjectId: number, subjectCode: string, status: 'APPROVED' | 'REMOVED') => ({ subjectId, subjectCode, subjectName: 'Name ' + subjectCode, creditHours: 3, classType: null, status, decidedBy: 'user_test', decidedAt: '2026-01-01T00:00:00.000Z' });
const setOf = (decisions: OfferingDecisionSet['decisions'], pickCounts: OfferingDecisionSet['pickCounts']): OfferingDecisionSet => ({
  scope: { programmeId: 5, learningCentreId: 1, targetSemesterId: 1 }, semester: { ...semester(1, '2026-01-01T00:00:00.000Z'), selectionOpensAt: null, selectionClosesAt: '2026-01-01T00:00:00.000Z' }, phase: 'CLOSED', asOf: now.toISOString(), editable: false, decisions, pickCounts,
});

describe('historyRows', () => {
  it('shows the pick count for approved subjects, 0 when nobody picked, and null for removed subjects', () => {
    const rows = historyRows(setOf([decision(1, 'SECJ1013', 'APPROVED'), decision(2, 'SECJ1023', 'REMOVED'), decision(3, 'SECJ2203', 'APPROVED')], [{ subjectId: 1, pickCount: 4 }, { subjectId: 2, pickCount: 9 }]));
    expect(rows.map(row => [row.code, row.decision, row.picks])).toEqual([['SECJ1013', 'Approved', 4], ['SECJ1023', 'Removed', null], ['SECJ2203', 'Approved', 0]]);
  });
  it('sorts by subject code and carries name and credits', () => {
    const rows = historyRows(setOf([decision(9, 'SECJ2203', 'APPROVED'), decision(8, 'SCSJ1013', 'APPROVED')], []));
    expect(rows.map(row => row.code)).toEqual(['SCSJ1013', 'SECJ2203']);
    expect(rows[0]).toEqual({ subjectId: 8, code: 'SCSJ1013', name: 'Name SCSJ1013', credits: 3, decision: 'Approved', picks: 0 });
  });
});
