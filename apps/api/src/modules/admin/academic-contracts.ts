import type * as C from '../../../../../packages/shared/src/admin/academic-setup';
import type { CoordinatorAssignment } from '../../../../../packages/shared/src/forecasting/confirmed-offerings';
import type { AuthDependencies } from '../auth/contracts';

export interface AssignmentFilters { accountId?: number; programmeId?: number; learningCentreId?: number }
/** Uncached forecast reads. Implementations must recheck ACTIVE account, current COORDINATOR
 * membership, unended assignments, active references and programme/faculty consistency.
 * Consuming adapters authorize their caller. Student learning centre belongs to Package B. */
export interface AcademicScopeReader {
  currentSemesterId(): Promise<number | null>;
  listActiveLearningCentres(): Promise<C.LearningCentre[]>;
  listScopes(clerkUserId: string): Promise<CoordinatorAssignment[]>;
  isScopeAssigned(clerkUserId: string, programmeId: number, learningCentreId: number): Promise<boolean>;
}
/** All writes set transaction-local trusted actor/reason and audit in the same transaction.
 * Recheck references/account/role under appropriate locks. Never trust browser actor data.
 * updateSemester must apply only supplied fields and validate merged type/date invariants
 * atomically in the database; do not read a row then overwrite a stale full snapshot.
 * setCurrentSemester serializes switches and preserves the previous marker on failure. */
export interface AcademicSetupRepository {
  listLearningCentres(includeInactive: boolean): Promise<C.LearningCentre[]>;
  createLearningCentre(input: C.CreateLearningCentreRequest, actor: string): Promise<C.LearningCentre>;
  updateLearningCentre(id: number, input: C.UpdateLearningCentreRequest, actor: string): Promise<C.LearningCentre>;
  listFaculties(includeInactive: boolean): Promise<C.Faculty[]>;
  createFaculty(input: C.CreateFacultyRequest, actor: string): Promise<C.Faculty>;
  updateFaculty(id: number, input: C.UpdateFacultyRequest, actor: string): Promise<C.Faculty>;
  listDepartments(includeInactive: boolean): Promise<C.Department[]>;
  createDepartment(input: C.CreateDepartmentRequest, actor: string): Promise<C.Department>;
  /** A department that still has programmes cannot move to another faculty (DEPARTMENT_HAS_PROGRAMMES). */
  updateDepartment(id: number, input: C.UpdateDepartmentRequest, actor: string): Promise<C.Department>;
  listProgrammeFaculties(): Promise<C.ProgrammeFaculty[]>;
  /** Sets the department and, in the same statement, the programme faculty from that department; null clears both when the programme had a department. */
  setProgrammeDepartment(id: number, input: C.SetProgrammeDepartmentRequest, actor: string): Promise<C.ProgrammeFaculty>;
  /** Creates an ACTIVE programme under the department; the faculty is taken from it in the same statement. */
  createProgramme(input: C.CreateProgrammeRequest, actor: string): Promise<C.ProgrammeFaculty>;
  /** Sparse edit; isActive maps to programme.status. Department changes stay on setProgrammeDepartment. */
  updateProgramme(id: number, input: C.UpdateProgrammeRequest, actor: string): Promise<C.ProgrammeFaculty>;
  listCurricula(): Promise<C.Curriculum[]>;
  createCurriculum(input: C.CreateCurriculumRequest, actor: string): Promise<C.Curriculum>;
  updateCurriculum(id: number, input: C.UpdateCurriculumRequest, actor: string): Promise<C.Curriculum>;
  listAcademicSemesters(): Promise<C.AcademicSemester[]>;
  createAcademicSemester(input: C.CreateSemesterRequest, actor: string): Promise<C.AcademicSemester>;
  updateAcademicSemester(id: number, input: C.UpdateSemesterRequest, actor: string): Promise<C.AcademicSemester>;
  getCurrentAcademicSemester(): Promise<C.AcademicSemester | null>;
  setCurrentAcademicSemester(input: C.SetCurrentSemesterRequest, actor: string): Promise<C.AcademicSemester>;
  /** Includes ended history, optionally filtered. Live forecast scopes use AcademicScopeReader. */
  listCoordinatorAssignments(filters: AssignmentFilters): Promise<C.AdminCoordinatorAssignment[]>;
  createCoordinatorAssignment(input: C.CreateCoordinatorAssignmentRequest, actor: string): Promise<C.AdminCoordinatorAssignment>;
  endCoordinatorAssignment(id: number, input: C.EndCoordinatorAssignmentRequest, actor: string): Promise<C.AdminCoordinatorAssignment>;
}
export interface AcademicSetupDependencies { auth: AuthDependencies; repository: AcademicSetupRepository }
