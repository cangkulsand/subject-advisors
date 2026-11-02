import type { ClassType, Int32Id } from '../contracts';
import type { ConfigurationIssueCode, EngineCapacityRule, EngineSection, SectionFlag } from './types';

export const ALLOCATION_POLICY_VERSION = 1;

export type CapacityResolution =
  | { status: 'CONFIGURED'; rule: EngineCapacityRule; matchedScope: 'SUBJECT_CENTRE' | 'CENTRE' | 'GLOBAL' }
  | { status: 'CONFIGURATION_REQUIRED'; issue: ConfigurationIssueCode; message: string };

const SCOPES = ['SUBJECT_CENTRE', 'CENTRE', 'GLOBAL'] as const;

function validRule(rule: EngineCapacityRule): boolean {
  const whole = (n: number) => Number.isInteger(n) && n >= 0;
  return whole(rule.minimumEnrollment) && whole(rule.breakEvenTarget) && Number.isInteger(rule.normalMaximum) && rule.normalMaximum > 0 &&
    rule.minimumEnrollment <= rule.normalMaximum && (rule.exceptionMaximum === null || (Number.isInteger(rule.exceptionMaximum) && rule.exceptionMaximum >= rule.normalMaximum));
}

function matches(rule: EngineCapacityRule, scope: (typeof SCOPES)[number], subjectId: Int32Id, learningCentreId: Int32Id): boolean {
  const kind = rule.scopeKind ?? 'GLOBAL';
  if (kind !== scope) return false;
  if (scope === 'SUBJECT_CENTRE') return rule.subjectId === subjectId && rule.learningCentreId === learningCentreId;
  if (scope === 'CENTRE') return rule.learningCentreId === learningCentreId;
  return true;
}

/**
 * Resolves the capacity rule for one subject. Precedence: subject+centre, then centre, then global; the first
 * scope that has active rules for the subject's class type decides. Exactly one rule must remain at that scope;
 * none, several or an invalid one yields CONFIGURATION_REQUIRED for this subject only (nothing is invented).
 */
export function resolveCapacityRule(
  subject: { subjectId: Int32Id; classType: ClassType }, learningCentreId: Int32Id, rules: readonly EngineCapacityRule[],
): CapacityResolution {
  if (subject.classType === null) {
    return { status: 'CONFIGURATION_REQUIRED', issue: 'CLASS_TYPE_MISSING', message: 'The subject has no class type (LECTURE or LAB), so no capacity rule can be chosen.' };
  }
  const active = rules.filter((rule) => rule.isActive && rule.classType === subject.classType);
  for (const scope of SCOPES) {
    const candidates = active.filter((rule) => matches(rule, scope, subject.subjectId, learningCentreId));
    if (candidates.length === 0) continue;
    if (candidates.length > 1) {
      return { status: 'CONFIGURATION_REQUIRED', issue: 'AMBIGUOUS_CAPACITY_RULE', message: `More than one active ${scope} capacity rule exists for class type ${subject.classType}.` };
    }
    const rule = candidates[0] as EngineCapacityRule;
    if (!validRule(rule)) {
      return { status: 'CONFIGURATION_REQUIRED', issue: 'INVALID_CAPACITY_RULE', message: `The active capacity rule for class type ${subject.classType} has invalid values.` };
    }
    return { status: 'CONFIGURED', rule, matchedScope: scope };
  }
  return { status: 'CONFIGURATION_REQUIRED', issue: 'NO_ACTIVE_CAPACITY_RULE', message: `No active capacity rule exists for class type ${subject.classType}.` };
}

/** ceil(D / normalMaximum) sections, sizes differing by at most one (larger sections first), total preserved. */
export function evenSplit(demand: number, normalMaximum: number): number[] {
  if (!Number.isInteger(demand) || demand <= 0) return [];
  const count = Math.ceil(demand / normalMaximum);
  const base = Math.floor(demand / count);
  const extra = demand - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

/**
 * Allocates supported demand to sections under a resolved rule. Never exceeds the normal maximum (the exception
 * maximum is carried for review only), never cancels: low sections are only flagged.
 */
export function allocateSections(demand: number, rule: EngineCapacityRule): EngineSection[] {
  return evenSplit(demand, rule.normalMaximum).map((expectedStudents, index) => {
    const flags: SectionFlag[] = [];
    if (expectedStudents < rule.minimumEnrollment) flags.push('BELOW_MINIMUM');
    if (expectedStudents < rule.breakEvenTarget) flags.push('BELOW_OPTIMAL');
    return {
      sectionNumber: index + 1, expectedStudents, capacityRuleId: rule.capacityRuleId,
      minimumEnrollment: rule.minimumEnrollment, breakEvenTarget: rule.breakEvenTarget,
      normalMaximum: rule.normalMaximum, exceptionMaximum: rule.exceptionMaximum, flags, reviewStatus: 'PENDING',
    };
  });
}
