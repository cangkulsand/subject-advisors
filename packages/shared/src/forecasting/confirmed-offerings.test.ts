import { describe, expect, it } from 'vitest';
import { CONFIRMED_OFFERING_LABEL, isScopeAssigned } from './confirmed-offerings';

const scope = { programmeId: 1, learningCentreId: 2, targetSemesterId: 3 };

describe('coordinator assignments and student wording', () => {
  it('limits scope to assigned programme and centre', () => {
    const assignments = [{ facultyId: 1, programmeId: 1, learningCentreId: 2 }];
    expect(isScopeAssigned(assignments, scope)).toBe(true);
    expect(isScopeAssigned(assignments, { ...scope, learningCentreId: 9 })).toBe(false);
    expect(isScopeAssigned([], scope)).toBe(false);
  });
  it('uses the label that does not claim official registration', () => {
    expect(CONFIRMED_OFFERING_LABEL).toBe('Confirmed by coordinator');
  });
});
