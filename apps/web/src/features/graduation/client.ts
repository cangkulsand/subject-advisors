import { createAcademicClient } from '../profile/client';

/** Web-side copy of the API's GraduationCheck contract (web does not import from apps/api). */
export type GraduationStatus = 'ELIGIBLE' | 'NOT_YET_ELIGIBLE' | 'CANNOT_ASSESS';
export interface GraduationCheck {
  requiredCredits: number | null; earnedCredits: number; remainingCredits: number | null; creditsMet: boolean | null;
  status: GraduationStatus; missing: string[]; feesClearedConfirmedAt: string | null; muetConfirmedAt: string | null;
}
export interface GraduationClient {
  load(signal?: AbortSignal): Promise<GraduationCheck>;
  save(input: { feesCleared: boolean; muet: boolean }): Promise<GraduationCheck>;
}
/** Delegates to the shared academic client for session fencing and error semantics. */
export function createGraduationClient(getToken: () => Promise<string | null>, baseUrl = ''): GraduationClient {
  const academic = createAcademicClient(getToken, baseUrl);
  return {
    load: signal => academic<GraduationCheck>('/api/graduation-check', { signal }),
    save: input => academic<GraduationCheck>('/api/graduation-check/confirmations', { method: 'PUT', body: input }),
  };
}
