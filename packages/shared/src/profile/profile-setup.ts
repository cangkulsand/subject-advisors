/**
 * PLANNED profile-setup contract additions (product owner decision 2026-11-01, change
 * S2-P004-006): the student profile records a learning centre, and programme, curriculum and
 * learning centre are locked once set up for the student; a System Admin may correct them
 * (reason required, audited; OP5 decided). Any later
 * profile-setup redesign is future work. Not implemented yet.
 */
export interface ProfileLearningCentreOption { learningCentreId: number; centreCode: string; centreName: string }
export interface ProfileSetupScope { programmeId: number; curriculumId: number; learningCentreId: number }

export const PROFILE_SETUP_LOCKED_FIELDS = ['programmeId', 'curriculumId', 'learningCentreId'] as const;
export type ProfileSetupLockedField = (typeof PROFILE_SETUP_LOCKED_FIELDS)[number];
/** Stable error code the profile save returns (HTTP 409) when a locked field would change. */
export const PROFILE_SETUP_LOCKED_ERROR = 'PROFILE_SETUP_LOCKED';

/**
 * Locked fields that a student's save would change. Legacy profiles with no learning centre
 * (existing centre null) may set the missing centre once (open point OP6).
 */
export function lockedProfileFieldChanges(
  existing: { programmeId: number; curriculumId: number; learningCentreId: number | null } | null,
  requested: ProfileSetupScope,
): ProfileSetupLockedField[] {
  if (!existing) return [];
  const changed: ProfileSetupLockedField[] = [];
  if (existing.programmeId !== requested.programmeId) changed.push('programmeId');
  if (existing.curriculumId !== requested.curriculumId) changed.push('curriculumId');
  if (existing.learningCentreId !== null && existing.learningCentreId !== requested.learningCentreId) changed.push('learningCentreId');
  return changed;
}
