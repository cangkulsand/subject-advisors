/**
 * TEMPORARY interim scope configuration (S2-P004-007, MT1).
 *
 * TODO(remove): replace with a DB-backed `ScopeProvider` once these modules exist:
 *  - admin setup module: `learning_centre`, `faculty`, `coordinator_assignment` (admin-managed)
 *  - admin Academic Semesters module: `academic_semester.is_current` marker
 *  - P001 student profile: `student_profile.learning_centre_id`
 * Callers MUST go through `ScopeProvider` / `getScopeProvider()`, never the constants, so the swap
 * is a one-file change. Values verified read-only against Neon DEVELOPMENT on 2026-11-01:
 * programmes 5 (SECJ) and 7 (SECRH) have curricula; semesters 1-3 of 2026/2027 exist with null
 * dates; `learning_centre` rows KL (1), JB (2) and PENANG (3) were inserted for this build.
 */
import type { CentreOption, ForecastScope, ProgrammeOption } from '../../../../packages/shared/src/forecasting/contracts';

export interface ScopeOption { programme: ProgrammeOption; centre: CentreOption }

export interface ScopeProvider {
  /** All programme x centre scopes (target of `coordinator_assignment`). */
  listScopes(): Promise<readonly ScopeOption[]>;
  /** Mirrors a `coordinator_assignment` lookup for the Clerk user. */
  isScopeAssigned(clerkUserId: string, programmeId: number, learningCentreId: number): Promise<boolean>;
  /** Mirrors `academic_semester.is_current`; null when none is marked. */
  currentSemesterId(): Promise<number | null>;
  /** Mirrors `student_profile.learning_centre_id`; null when the student has none. */
  studentLearningCentreId(studentId: number): Promise<number | null>;
  /** Coordinator-export vocabulary (S2-P004-010): export programme code -> system programme_code, centre name -> system centre code. */
  importAliases(): Promise<ImportAliases>;
}
export interface ImportAliases { programmes: Readonly<Record<string, string>>; centres: Readonly<Record<string, string>> }

export const INTERIM_PROGRAMMES: readonly ProgrammeOption[] = [
  { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Ijazah Sarjana Muda Sains Komputer (Kejuruteraan Perisian)' },
  { programmeId: 7, programmeCode: 'SECRH', programmeName: 'Bachelor of Computer Science (Computer Networks & Security) with Honours' },
];

/** Dev `learning_centre` rows 1-3, inserted 2026-11-01 from the product owner's centre list. */
export const INTERIM_CENTRES: readonly CentreOption[] = [
  { learningCentreId: 1, centreCode: 'KL', centreName: 'UTMSPACE Kuala Lumpur' },
  { learningCentreId: 2, centreCode: 'JB', centreName: 'UTMSPACE Johor Bahru' },
  { learningCentreId: 3, centreCode: 'PENANG', centreName: 'UTMSPACE Penang' },
];

/**
 * Coordinator export programme codes that map to a system programme (S2-P004-010). A code equal to a programme_code always maps
 * to itself (SECRH). Other export programmes (SCSEH, SCSJ, SCSR, SCSV ...) are skipped until the subject/degree/faculty registration module exists.
 */
export const INTERIM_PROGRAMME_ALIASES: Readonly<Record<string, string>> = { SECJH: 'SECJ' };
/** Coordinator export centre names -> centre code (the code itself is accepted too). */
export const INTERIM_CENTRE_ALIASES: Readonly<Record<string, string>> = { 'KUALA LUMPUR': 'KL', 'JOHOR BAHRU': 'JB', 'PULAU PINANG': 'PENANG' };

/** 2026/2027 semester 1 (dev semester_id 1); dates are null so this is a deliberate choice. */
export const INTERIM_CURRENT_SEMESTER_ID = 1;
/** Default student centre until profiles record one: KL. */
export const INTERIM_DEFAULT_STUDENT_CENTRE_ID = 1;

export const interimScopeProvider: ScopeProvider = {
  async listScopes() {
    return INTERIM_PROGRAMMES.flatMap((programme) => INTERIM_CENTRES.map((centre) => ({ programme, centre })));
  },
  async isScopeAssigned(clerkUserId, programmeId, learningCentreId) {
    // Interim rule: every (active) coordinator is assigned to every configured scope.
    if (!clerkUserId) return false;
    return INTERIM_PROGRAMMES.some((p) => p.programmeId === programmeId)
      && INTERIM_CENTRES.some((c) => c.learningCentreId === learningCentreId);
  },
  async currentSemesterId() {
    return INTERIM_CURRENT_SEMESTER_ID;
  },
  async studentLearningCentreId() {
    return INTERIM_DEFAULT_STUDENT_CENTRE_ID;
  },
  async importAliases() {
    return { programmes: INTERIM_PROGRAMME_ALIASES, centres: INTERIM_CENTRE_ALIASES };
  },
};

export function getScopeProvider(): ScopeProvider {
  return interimScopeProvider;
}

export async function isScopeAssignedFor(provider: ScopeProvider, clerkUserId: string, scope: Pick<ForecastScope, 'programmeId' | 'learningCentreId'>): Promise<boolean> {
  return provider.isScopeAssigned(clerkUserId, scope.programmeId, scope.learningCentreId);
}
