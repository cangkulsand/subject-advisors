/** Seniority information policy. Kept in one place so the rule can change later without touching the engine. */
export const NEAR_GRADUATION_POLICY_VERSION = 1;
/** v1: remaining credits within this many semesters of the target semester max_credits. */
export const NEAR_GRADUATION_SEMESTERS = 2;

/**
 * Policy v1: a student is near graduation when remaining curriculum credits (curriculum total minus credits
 * completed/exempted) are at most 2 x the target semester max_credits. Unknown remaining credits (null) are never
 * near graduation. Information only: it never changes demand.
 */
export function isNearGraduation(remainingCredits: number | null, targetMaxCredits: number): boolean {
  if (remainingCredits === null || !Number.isFinite(remainingCredits)) return false;
  return Math.max(0, remainingCredits) <= NEAR_GRADUATION_SEMESTERS * targetMaxCredits;
}

/** Retake policy v1: any pass wins; IN_PROGRESS without a pass is unresolved; FAILED-only still needs the subject. */
export const RETAKE_POLICY_VERSION = 1;
/** Prerequisite policy v1: mandatory prerequisites need COMPLETED/EXEMPTED evidence; a details expression supersedes link rows. */
export const PREREQUISITE_POLICY_VERSION = 1;
