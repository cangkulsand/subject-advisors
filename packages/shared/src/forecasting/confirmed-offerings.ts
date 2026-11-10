/**
 * Superseded by the simplified offering flow (S2-P004-017 to S2-P004-024): offerings are no longer
 * confirmed from a finalized forecast with a coordinator pick deadline. Coordinators approve or remove
 * subjects per programme + learning centre + semester (`./offering-decisions`) and the admin-set
 * selection window decides when students may pick (`./selection-window`).
 *
 * What stays here is still imported by other modules: the student-facing wording, and the coordinator
 * assignment shape used by the admin academic setup and the scope provider.
 */
import type { ForecastScope, Int32Id } from './contracts';

/** Wording shown to students. Must never imply official registration or a guaranteed timetable. */
export const CONFIRMED_OFFERING_LABEL = 'Confirmed by coordinator';
export const CONFIRMED_OFFERING_NOTICE =
  'Confirmed by coordinator — not an official registration and not a guaranteed timetable';

/**
 * Decided 2026-11-01: coordinators are ASSIGNED (admin-managed) to faculty, degree
 * (programme) and learning centre. A coordinator may decide offerings and see pick counts and
 * pickers only within assignments. Server error: 403 SCOPE_NOT_ASSIGNED.
 */
export interface CoordinatorAssignment {
  facultyId: Int32Id;
  programmeId: Int32Id;
  learningCentreId: Int32Id;
}
export const SCOPE_NOT_ASSIGNED_ERROR = 'SCOPE_NOT_ASSIGNED';
export function isScopeAssigned(assignments: readonly CoordinatorAssignment[], scope: ForecastScope): boolean {
  return assignments.some((a) => a.programmeId === scope.programmeId && a.learningCentreId === scope.learningCentreId);
}
