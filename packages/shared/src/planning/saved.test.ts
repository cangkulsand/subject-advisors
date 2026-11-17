import { describe, expect, it } from 'vitest';
import type { PlanningInput } from './contracts';
import { fromRows, fromSaved, toRows, toSaved, validateSavedBody, type SavedChange } from './saved';

describe('toRows / fromRows', () => {
  const cases: [string, SavedChange[]][] = [
    ['a move', [{ kind: 'PLACE', curriculumSubjectId: 4, semesterId: 24 }]],
    ['a fail with and without a moved retake', [{ kind: 'FAIL', curriculumSubjectId: 4, semesterId: 25 }, { kind: 'FAIL', curriculumSubjectId: 1 }]],
    ['a withdraw and a postpone', [{ kind: 'WITHDRAW', curriculumSubjectId: 2 }, { kind: 'POSTPONE', curriculumSubjectId: 3 }]],
    ['a swap', [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }]],
    ['a swap whose replacement was then moved', [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }, { kind: 'PLACE', curriculumSubjectId: 6, semesterId: 23 }]],
  ];
  for (const [name, changes] of cases) it('round-trips ' + name, () => expect(fromRows(toRows(changes))).toEqual(changes));

  it('stores the hypothetical status and one row per subject', () => {
    const rows = toRows([{ kind: 'FAIL', curriculumSubjectId: 4 }, { kind: 'WITHDRAW', curriculumSubjectId: 2 },
      { kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }, { kind: 'PLACE', curriculumSubjectId: 6, semesterId: 23 }]);
    expect(rows.map(r => r.hypotheticalStatus)).toEqual(['FAILED', 'WITHDRAWN', null, null]);
    expect(rows.at(-1)).toEqual({ curriculumSubjectId: 6, changeType: 'REPLACEMENT', proposedSemesterId: 23, hypotheticalStatus: null });
    expect(new Set(rows.map(r => r.curriculumSubjectId)).size).toBe(rows.length);
  });
  it('drops a swap without its replacement row', () => {
    expect(fromRows([{ curriculumSubjectId: 5, changeType: 'REPLACE', proposedSemesterId: null, hypotheticalStatus: null }])).toEqual([]);
  });
});

describe('toSaved / fromSaved', () => {
  const input = { start: { academicYear: '2026/2027', semesterNo: 2 }, limits: [{ semesterId: 24, academicYear: '2027/2028', semesterNo: 2, maxSubjects: 3, maxCredits: 10 }] } as PlanningInput;
  it('maps semesters to their configured IDs and back', () => {
    const changes = [{ kind: 'PLACE' as const, curriculumSubjectId: 4, semester: { academicYear: '2027/2028', semesterNo: 2 } }];
    expect(toSaved(input, changes)).toEqual([{ kind: 'PLACE', curriculumSubjectId: 4, semesterId: 24 }]);
    expect(fromSaved(input, toSaved(input, changes))).toEqual(changes);
  });
  it('keeps an unknown semester as an empty one so cleanup drops it', () => {
    expect(fromSaved(input, [{ kind: 'PLACE', curriculumSubjectId: 4, semesterId: 99 }])[0]!.semester).toEqual({ academicYear: '', semesterNo: 0 });
  });
});

describe('validateSavedBody', () => {
  const refused = (body: unknown) => { const r = validateSavedBody(body); return r.ok ? 'accepted' : 'refused'; };
  it('accepts a valid list', () => {
    expect(validateSavedBody({ changes: [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }, { kind: 'PLACE', curriculumSubjectId: 6, semesterId: 23 }] }))
      .toEqual({ ok: true, value: [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }, { kind: 'PLACE', curriculumSubjectId: 6, semesterId: 23 }] });
  });
  it('refuses bad bodies', () => {
    expect(refused({ changes: [], extra: 1 })).toBe('refused');
    expect(refused({ changes: Array.from({ length: 61 }, (_, i) => ({ kind: 'POSTPONE', curriculumSubjectId: i + 1 })) })).toBe('refused');
    expect(refused({ changes: [{ kind: 'PLACE', curriculumSubjectId: 4 }] })).toBe('refused');
    expect(refused({ changes: [{ kind: 'POSTPONE', curriculumSubjectId: 4, semesterId: 23 }] })).toBe('refused');
    expect(refused({ changes: [{ kind: 'POSTPONE', curriculumSubjectId: 4 }, { kind: 'FAIL', curriculumSubjectId: 4 }] })).toBe('refused');
    expect(refused({ changes: [{ kind: 'POSTPONE', curriculumSubjectId: 0 }] })).toBe('refused');
    expect(refused({ changes: [{ kind: 'POSTPONE', curriculumSubjectId: 2147483648 }] })).toBe('refused');
    expect(refused({ changes: [{ kind: 'MOVE', curriculumSubjectId: 4 }] })).toBe('refused');
    expect(refused({ changes: [{ kind: 'POSTPONE', curriculumSubjectId: 4, replacementId: 5 }] })).toBe('refused');
    expect(refused([])).toBe('refused');
  });
});
