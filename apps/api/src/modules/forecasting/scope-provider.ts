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
  /** Each student's profile learning centre (null when unset), read in ONE query for the whole list (S3-P004-016). */
  studentLearningCentres(studentIds: number[]): Promise<Map<number, number | null>>;
  /** Coordinator-export vocabulary (S2-P004-010): export programme code -> system programme_code, centre name -> system centre code. */
  importAliases(): Promise<ImportAliases>;
  /** View as Coordinator (S3-P004-033): the programme x centre option when both are active (programme with a faculty); else null. */
  scopeFor?(programmeId: number, learningCentreId: number): Promise<ScopeOption | null>;
}

/** View as Coordinator (S3-P004-033): the admin is "assigned" exactly the chosen scope, nothing from coordinator_assignment. */
export function viewAsScopeProvider(base: ScopeProvider, scope: ScopeOption | null): ScopeProvider {
  return {
    ...base,
    async listScopes() { return scope ? [scope] : []; },
    async isScopeAssigned(_clerkUserId, programmeId, learningCentreId) {
      return scope !== null && scope.programme.programmeId === programmeId && scope.centre.learningCentreId === learningCentreId;
    },
  };
}

export type ScopeSource = AcademicScopeReader & Pick<AcademicSetupRepository, 'listProgrammeFaculties'>;

/**
 * `studentCentres` reads `student_profile.learning_centre_id` live (S2-P004-023) for a list of students in one query
 * (one request per student exceeded the Workers subrequest limit, S3-P004-016); a student without a centre maps to null
 * and is left out of "students in the system" snapshots.
 */
export function createDbScopeProvider(source: ScopeSource, studentCentres: (studentIds: number[]) => Promise<Map<number, number | null>>): ScopeProvider {
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
    studentLearningCentres: (studentIds) => studentCentres(studentIds),
    async importAliases() { return IMPORT_ALIASES; },
    async scopeFor(programmeId, learningCentreId) {
      const [centres, programmes] = await Promise.all([source.listActiveLearningCentres(), source.listProgrammeFaculties()]);
      const programme = programmes.find((p) => p.programmeId === programmeId && p.isActive && p.facultyId != null && p.faculty?.isActive !== false);
      const centre = centres.find((c) => c.learningCentreId === learningCentreId && c.isActive);
      if (!programme || !centre) return null;
      return {
        programme: { programmeId: programme.programmeId, programmeCode: programme.programmeCode, programmeName: programme.programmeName },
        centre: { learningCentreId: centre.learningCentreId, centreCode: centre.centreCode, centreName: centre.centreName },
      };
    },
  };
}
