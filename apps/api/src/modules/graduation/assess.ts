import type { Progress } from '../p001-sprint2/contracts';
import type { Confirmations, GraduationCheck, GraduationStatus } from './contracts';

export function assessGraduation(progress: Progress, confirmations: Confirmations): GraduationCheck {
  const required = progress.totalCredits;
  const creditsMet = required === null ? null : progress.earnedCredits >= required;
  const missing: string[] = [];
  if (required === null) missing.push('The programme credit requirement is not configured.');
  else if (!creditsMet) missing.push(`${required - progress.earnedCredits} more credits needed.`);
  if (!confirmations.feesClearedConfirmedAt) missing.push('Confirm you have no outstanding fees.');
  if (!confirmations.muetConfirmedAt) missing.push('Confirm you have your MUET certificate.');
  const status: GraduationStatus = required === null ? 'CANNOT_ASSESS' : missing.length === 0 ? 'ELIGIBLE' : 'NOT_YET_ELIGIBLE';
  return {
    requiredCredits: required, earnedCredits: progress.earnedCredits, remainingCredits: progress.remainingCredits,
    creditsMet, status, missing,
    feesClearedConfirmedAt: confirmations.feesClearedConfirmedAt, muetConfirmedAt: confirmations.muetConfirmedAt,
  };
}

/** Ticking keeps an already-stored time; unticking clears it. */
export function nextConfirmations(current: Confirmations, input: { feesCleared: boolean; muet: boolean }, now: Date): Confirmations {
  const stamp = now.toISOString();
  return {
    feesClearedConfirmedAt: input.feesCleared ? current.feesClearedConfirmedAt ?? stamp : null,
    muetConfirmedAt: input.muet ? current.muetConfirmedAt ?? stamp : null,
  };
}
