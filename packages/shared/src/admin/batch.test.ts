import { describe, expect, it } from 'vitest';
import { batchSummary, planBatch, programmeWarning, validateBatchApplyRequest, validateBatchPreviewRequest, type BatchMatch } from './batch';

const match = (matricNo: string, intakeYear: number | null, curriculumId = 1, studentId = 1): BatchMatch => ({
  matricNo, accountId: studentId + 100, studentId, studentName: 'Student ' + studentId, programmeCode: 'SECJ', curriculumId, curriculumVersion: '1',
  intakeYear, accountStatus: 'ACTIVE', isStudent: true,
});
const matches = [match('SX232315ECJHF04', 2020, 1, 1), match('SX230001ECJHF04', 2023, 1, 2), match('DUMMY-1', 2020, 1, 3)];

describe('batch planning (S3-P004-039)', () => {
  it('from each matric number: changes, already correct, and unreadable', () => {
    const plan = planBatch(matches, null, { mode: 'matric' });
    expect(plan.rows.map(row => [row.after.intakeYear, row.changes, row.problem ?? null])).toEqual([[2023, true, null], [2023, false, null], [2020, false, 'INTAKE_UNREADABLE']]);
    expect([plan.intakeChanges, plan.programmeChanges, plan.unchanged, plan.problems]).toEqual([1, 0, 1, 1]);
  });
  it('set all to a year changes every student whose year differs', () => {
    const plan = planBatch(matches, null, { mode: 'set', year: 2024 });
    expect(plan.rows.every(row => row.after.intakeYear === 2024 && row.changes)).toBe(true);
    expect(plan.intakeChanges).toBe(3);
  });
  it('a chosen curriculum counts only students on another curriculum', () => {
    const plan = planBatch([match('SX1', 2020, 1, 1), match('SX2', 2020, 4, 2)], 4, { mode: 'keep' });
    expect(plan.rows.map(row => [row.after.curriculumId, row.changes])).toEqual([[4, true], [4, false]]);
    expect([plan.programmeChanges, plan.unchanged]).toEqual([1, 1]);
  });
  it('summarises in plain words', () => {
    expect(batchSummary(planBatch(matches.slice(0, 2), null, { mode: 'matric' }))).toBe('Applies to 2 students: 1 intake year changes, 0 programmes change, 1 already correct.');
    expect(batchSummary(planBatch(matches, null, { mode: 'set', year: 2024 }))).toBe('Applies to 3 students: 3 intake years change, 0 programmes change, 0 already correct.');
  });
});

describe('programme warning', () => {
  it('warns when the matric programme differs from the programme', () => {
    expect(programmeWarning('SX2302ECRHF04', 'SECJ')).toBe('Matric says ECRH, programme is SECJ');
    expect(programmeWarning('SX232315ECJHF04', 'SECJ')).toBeNull();
    expect(programmeWarning('SX232315ECJHF04', 'SECJH')).toBeNull();
    expect(programmeWarning('SX2302ECRHF04', 'SECRH')).toBeNull();
    expect(programmeWarning('DUMMY-1', 'SECJ')).toBeNull();
    expect(programmeWarning('SX23', 'SECJ')).toBeNull();
  });
});

describe('batch request validation', () => {
  const expected = [{ matricNo: 'SX1234', studentId: 1, curriculumId: 1, intakeYear: 2020 }];
  it('normalises numbers and enforces 1-500', () => {
    expect(validateBatchPreviewRequest({ matricNos: [' sx12 34 ', 'SX1234'] })).toEqual({ ok: true, value: { matricNos: ['SX1234'] } });
    expect(validateBatchPreviewRequest({ matricNos: [] })).toEqual({ ok: false, error: 'Paste at least one matric number.' });
    expect(validateBatchPreviewRequest({ matricNos: Array.from({ length: 501 }, (_, i) => 'SX' + (1000 + i)) })).toEqual({ ok: false, error: 'Paste at most 500 matric numbers.' });
    expect(validateBatchPreviewRequest({ matricNos: ['SX-1'] }).ok).toBe(false);
  });
  it('requires a change, a reason and the preview it was based on', () => {
    const body = { matricNos: ['SX1234'], curriculumId: null, intake: { mode: 'matric' }, reason: ' Fix ', expected };
    expect(validateBatchApplyRequest(body)).toEqual({ ok: true, value: { ...body, reason: 'Fix', intake: { mode: 'matric' } } });
    expect(validateBatchApplyRequest({ ...body, intake: { mode: 'keep' } })).toEqual({ ok: false, error: 'Choose a programme or an intake year to change.' });
    expect(validateBatchApplyRequest({ ...body, intake: { mode: 'set', year: 1989 } }).ok).toBe(false);
    expect(validateBatchApplyRequest({ ...body, intake: { mode: 'set', year: 2024 }, curriculumId: 4 }).ok).toBe(true);
    expect(validateBatchApplyRequest({ ...body, reason: ' ' }).ok).toBe(false);
    expect(validateBatchApplyRequest({ ...body, expected: [] }).ok).toBe(false);
    expect(validateBatchApplyRequest({ ...body, curriculumId: 0 }).ok).toBe(false);
  });
});

describe('review fixes (S3-P004-039)', () => {
  it('a matric year after the current year is a problem, not a write', () => {
    const now = new Date('2026-11-27T00:00:00Z');
    const plan = planBatch([match('SX920001ECJHF04', 2020), match('SX260001ECJHF04', 2020, 1, 2)], null, { mode: 'matric' }, now);
    expect(plan.rows.map(row => row.problem ?? null)).toEqual(['INTAKE_UNREADABLE', null]);
    expect(plan.rows[1]!.after.intakeYear).toBe(2026);
  });
});
