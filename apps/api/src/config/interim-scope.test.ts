import { describe, expect, it } from 'vitest';
import { getScopeProvider, INTERIM_CENTRES, INTERIM_PROGRAMMES, isScopeAssignedFor } from './interim-scope';

describe('interim scope provider (TEMPORARY)', () => {
  const p = getScopeProvider();
  it('lists every programme x centre scope', async () => {
    expect(await p.listScopes()).toHaveLength(INTERIM_PROGRAMMES.length * INTERIM_CENTRES.length);
  });
  it('assigns any coordinator to every configured scope only', async () => {
    expect(await p.isScopeAssigned('user_a', 5, 1)).toBe(true);
    expect(await p.isScopeAssigned('user_b', 7, 1)).toBe(true);
    expect(await p.isScopeAssigned('user_a', 99, 1)).toBe(false);
    expect(await p.isScopeAssigned('user_a', 5, 99)).toBe(false);
    expect(await p.isScopeAssigned('', 5, 1)).toBe(false);
    expect(await isScopeAssignedFor(p, 'user_a', { programmeId: 5, learningCentreId: 1 })).toBe(true);
  });
  it('returns the current semester and student centre', async () => {
    expect(await p.currentSemesterId()).toBe(1);
    expect(await p.studentLearningCentreId(123)).toBe(1);
    expect((await p.listScopes()).some((s) => s.centre.learningCentreId === 1)).toBe(true);
  });
});
