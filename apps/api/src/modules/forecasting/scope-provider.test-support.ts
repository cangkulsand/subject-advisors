/** Test-only `ScopeProvider` fake (fixed fixture scopes, every user assigned). Never imported by production code. */
import type { CentreOption, ProgrammeOption } from '../../../../../packages/shared/src/forecasting/contracts';
import { IMPORT_ALIASES } from '../../config/import-aliases';
import type { ScopeProvider } from './scope-provider';

export const TEST_PROGRAMMES: readonly ProgrammeOption[] = [
  { programmeId: 5, programmeCode: 'SECJ', programmeName: 'Ijazah Sarjana Muda Sains Komputer (Kejuruteraan Perisian)' },
  { programmeId: 7, programmeCode: 'SECRH', programmeName: 'Bachelor of Computer Science (Computer Networks & Security) with Honours' },
];
export const TEST_CENTRES: readonly CentreOption[] = [
  { learningCentreId: 1, centreCode: 'KL', centreName: 'UTMSPACE Kuala Lumpur' },
  { learningCentreId: 2, centreCode: 'JB', centreName: 'UTMSPACE Johor Bahru' },
  { learningCentreId: 3, centreCode: 'PENANG', centreName: 'UTMSPACE Penang' },
];

export const testScopeProvider: ScopeProvider = {
  async listScopes(clerkUserId) {
    return clerkUserId ? TEST_PROGRAMMES.flatMap((programme) => TEST_CENTRES.map((centre) => ({ programme, centre }))) : [];
  },
  async isScopeAssigned(clerkUserId, programmeId, learningCentreId) {
    return Boolean(clerkUserId) && TEST_PROGRAMMES.some((p) => p.programmeId === programmeId) && TEST_CENTRES.some((c) => c.learningCentreId === learningCentreId);
  },
  async currentSemesterId() { return 1; },
  async studentLearningCentreId() { return 1; },
  async importAliases() { return IMPORT_ALIASES; },
};

/** Fixture provider assigned only to the given programme x centre pairs; everything else live-matches the pairs. */
export function assignedTo(...pairs: Array<readonly [programmeId: number, learningCentreId: number]>): ScopeProvider {
  const has = (p: number, c: number) => pairs.some(([programmeId, centreId]) => programmeId === p && centreId === c);
  return {
    ...testScopeProvider,
    async listScopes() {
      return TEST_PROGRAMMES.flatMap((programme) => TEST_CENTRES.filter((centre) => has(programme.programmeId, centre.learningCentreId)).map((centre) => ({ programme, centre })));
    },
    async isScopeAssigned(_user, programmeId, learningCentreId) { return has(programmeId, learningCentreId); },
  };
}
