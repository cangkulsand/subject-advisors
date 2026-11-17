import type { PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import type { SavedChange, SavedScenario } from '../../../../../packages/shared/src/planning/saved';
import { createAcademicClient } from '../profile/client';

export interface PlanningClient {
  load(signal?: AbortSignal): Promise<PlanningInput>;
  /** The student's saved what-if, or null (S3-P004-010). */
  loadScenario(signal?: AbortSignal): Promise<SavedScenario | null>;
  saveScenario(changes: SavedChange[]): Promise<SavedScenario>;
  clearScenario(): Promise<void>;
}

/** Delegates to the shared academic client for session fencing and error semantics. */
export function createPlanningClient(getToken: () => Promise<string | null>, baseUrl = ''): PlanningClient {
  const academic = createAcademicClient(getToken, baseUrl);
  return {
    load: signal => academic<PlanningInput>('/api/planning/input', { signal }),
    loadScenario: signal => academic<SavedScenario | null>('/api/planning/scenario', { signal }),
    saveScenario: changes => academic<SavedScenario>('/api/planning/scenario', { method: 'PUT', body: { changes } }),
    clearScenario: async () => { await academic<null>('/api/planning/scenario', { method: 'DELETE' }); },
  };
}
