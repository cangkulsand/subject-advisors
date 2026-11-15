import type { ProgressSource } from '../p001-sprint2/contracts';
export type GraduationStatus = 'ELIGIBLE' | 'NOT_YET_ELIGIBLE' | 'CANNOT_ASSESS';
/** ISO-8601 timestamps, or null when the student has not confirmed. */
export interface Confirmations { feesClearedConfirmedAt: string | null; muetConfirmedAt: string | null }
export interface GraduationCheck extends Confirmations {
  requiredCredits: number | null; earnedCredits: number; remainingCredits: number | null;
  creditsMet: boolean | null; status: GraduationStatus; missing: string[];
}
export interface GraduationRepository {
  source(clerkUserId: string): Promise<{ progress: ProgressSource; confirmations: Confirmations } | null>;
  save(clerkUserId: string, value: Confirmations): Promise<boolean>;
}
