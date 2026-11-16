import type { PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import { createAcademicClient } from '../profile/client';

export interface PlanningClient { load(signal?: AbortSignal): Promise<PlanningInput> }

/** Delegates to the shared academic client for session fencing and error semantics. */
export function createPlanningClient(getToken: () => Promise<string | null>, baseUrl = ''): PlanningClient {
  const academic = createAcademicClient(getToken, baseUrl);
  return { load: signal => academic<PlanningInput>('/api/planning/input', { signal }) };
}
