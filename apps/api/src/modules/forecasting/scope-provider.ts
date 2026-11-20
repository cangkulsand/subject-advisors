/**
 * DB-backed forecasting scope (S2-P004-011). Replaces the interim configuration of S2-P004-007.
 *
 * Coordinator scopes, the current semester and active centres are read live through the admin module's
 * `AcademicScopeReader` (migration 0008). Nothing is cached: a revoked assignment, ended account or
 * deactivated centre takes effect on the next request.
 */
import type { CentreOption, ProgrammeOption } from '../../../../../packages/shared/src/forecasting/contracts';
import type { AcademicScopeReader, AcademicSetupRepository } from '../admin/academic-contracts';
import { IMPORT_ALIASES, type ImportAliases } from '../../config/import-aliases';

export type { ImportAliases };
export interface ScopeOption { programme: ProgrammeOption; centre: CentreOption }

export interface ScopeProvider {
  /** Live programme x centre scopes assigned to the Clerk user (`coordinator_assignment`); empty when none. */
  listScopes(clerkUserId: string): Promise<readonly ScopeOption[]>;
  /** Live `coordinator_assignment` check for the Clerk user. Rechecked on every read and mutation. */
  isScopeAssigned(clerkUserId: string, programmeId: number, learningCentreId: number): Promise<boolean>;
  /** `academic_semester.is_current`; null when none is marked. */
  currentSemesterId(): Promise<number | null>;
  /** Centre of a student. */
  studentLearningCentreId(studentId: number): Promise<number | null>;
  /** Coordinator-export vocabulary (S2-P004-010): export programme code -> system programme_code, centre name -> system centre code. */
  importAliases(): Promise<ImportAliases>;
}

/**
 * TODO(Package B, migration 0009): read `student_profile.learning_centre_id`. Until that merges every student
 * counts as belonging to Kuala Lumpur (dev learning_centre_id 1), exactly as before S2-P004-011.
 */
export const DEFAULT_STUDENT_CENTRE_ID = 1;

export type ScopeSource = AcademicScopeReader & Pick<AcademicSetupRepository, 'listProgrammeFaculties'>;

export function createDbScopeProvider(source: ScopeSource): ScopeProvider {
  return {
    async listScopes(clerkUserId) {
      const assigned = await source.listScopes(clerkUserId);
      if (assigned.length === 0) return [];
      const [centres, programmes] = await Promise.all([source.listActiveLearningCentres(), source.listProgrammeFaculties()]);
      return assigned.flatMap((scope) => {
        const programme = programmes.find((p) => p.programmeId === scope.programmeId);
        const centre = centres.find((c) => c.learningCentreId === scope.learningCentreId && c.isActive);
        if (!programme || !centre) return [];
        return [{
          programme: { programmeId: programme.programmeId, programmeCode: programme.programmeCode, programmeName: programme.programmeName },
          centre: { learningCentreId: centre.learningCentreId, centreCode: centre.centreCode, centreName: centre.centreName },
        }];
      });
    },
    isScopeAssigned: (clerkUserId, programmeId, learningCentreId) => source.isScopeAssigned(clerkUserId, programmeId, learningCentreId),
    currentSemesterId: () => source.currentSemesterId(),
    async studentLearningCentreId() { return DEFAULT_STUDENT_CENTRE_ID; },
    async importAliases() { return IMPORT_ALIASES; },
  };
}
