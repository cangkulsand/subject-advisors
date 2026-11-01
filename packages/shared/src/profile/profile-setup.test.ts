import { describe, expect, it } from 'vitest';
import { lockedProfileFieldChanges, PROFILE_SETUP_LOCKED_FIELDS } from './profile-setup';

const existing = { programmeId: 1, curriculumId: 10, learningCentreId: 5 };
describe('profile setup lock', () => {
  it('allows first-time setup', () => {
    expect(lockedProfileFieldChanges(null, { programmeId: 1, curriculumId: 10, learningCentreId: 5 })).toEqual([]);
  });
  it('allows an unchanged resave', () => {
    expect(lockedProfileFieldChanges(existing, { programmeId: 1, curriculumId: 10, learningCentreId: 5 })).toEqual([]);
  });
  it('reports every changed locked field', () => {
    expect(lockedProfileFieldChanges(existing, { programmeId: 2, curriculumId: 11, learningCentreId: 6 }))
      .toEqual([...PROFILE_SETUP_LOCKED_FIELDS]);
  });
  it('lets a legacy profile set a missing centre once but not change programme', () => {
    expect(lockedProfileFieldChanges({ ...existing, learningCentreId: null }, { programmeId: 1, curriculumId: 10, learningCentreId: 7 })).toEqual([]);
    expect(lockedProfileFieldChanges({ ...existing, learningCentreId: null }, { programmeId: 2, curriculumId: 10, learningCentreId: 7 })).toEqual(['programmeId']);
  });
});
