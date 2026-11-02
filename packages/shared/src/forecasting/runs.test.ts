import { describe, expect, it } from 'vitest';
import { runRevision, sectionFlags, subjectDecisionStatus } from './runs';

const rule = { minimumEnrollment: 15, breakEvenTarget: 25, normalMaximum: 45 };

describe('forecast run helpers', () => {
  it('recomputes section flags from the stored rule values', () => {
    expect(sectionFlags({ ...rule, expectedStudents: 14 })).toEqual(['BELOW_MINIMUM', 'BELOW_OPTIMAL']);
    expect(sectionFlags({ ...rule, expectedStudents: 15 })).toEqual(['BELOW_OPTIMAL']);
    expect(sectionFlags({ ...rule, expectedStudents: 25 })).toEqual([]);
    expect(sectionFlags({ ...rule, expectedStudents: 45 })).toEqual([]);
    expect(sectionFlags({ ...rule, expectedStudents: 46 })).toEqual(['ABOVE_NORMAL_MAXIMUM']);
  });

  it('derives the subject decision status from its sections', () => {
    expect(subjectDecisionStatus([])).toBe('NONE');
    expect(subjectDecisionStatus([{ reviewStatus: 'PENDING' }, { reviewStatus: 'APPROVED' }])).toBe('PENDING');
    expect(subjectDecisionStatus([{ reviewStatus: 'APPROVED' }, { reviewStatus: 'APPROVED' }])).toBe('APPROVED');
    expect(subjectDecisionStatus([{ reviewStatus: 'APPROVED' }, { reviewStatus: 'DEFERRED' }])).toBe('MIXED');
  });

  it('builds a revision that changes with status and audit count', () => {
    expect(runRevision(7, 'DRAFT', 0)).toBe('fr7.DRAFT.0');
    expect(runRevision(7, 'UNDER_REVIEW', 0)).not.toBe(runRevision(7, 'DRAFT', 0));
    expect(runRevision(7, 'UNDER_REVIEW', 1)).not.toBe(runRevision(7, 'UNDER_REVIEW', 0));
  });
});
