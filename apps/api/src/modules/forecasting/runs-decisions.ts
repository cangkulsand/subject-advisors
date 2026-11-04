import type { ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import { RUN_DECISION_ACTIONS, RUN_LIMITS } from '../../../../../packages/shared/src/forecasting/runs';
import type { RunDecisionAction, SectionReviewStatus } from '../../../../../packages/shared/src/forecasting/runs';
import { ForecastingError } from './errors';
import { bad, INT32_MAX } from './http';
import type { DecisionPlan, RunDetailRows, RunSectionRow, SectionState } from './runs-contracts';
import { assumptionsFor } from './runs-view';

const CONTROL = /[\u0000-\u001f\u007f]/;

export interface ParsedDecision {
  subjectId: number;
  action: RunDecisionAction;
  reason: string;
  approvalReference: string | null;
  replacementSections: Array<{ proposedSectionId: number | null; sectionNumber: number; expectedStudents: number; justification: string | null }> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) bad('Unsupported field in ' + label + '.');
}
function int(value: unknown, label: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > INT32_MAX) bad(label + ' must be an integer of at least ' + min + '.');
  return value as number;
}
/** Optional free text: trimmed, 1..max printable characters, or null. */
function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') bad(label + ' must be text.');
  const trimmed = (value as string).trim();
  if (trimmed === '') return null;
  if (trimmed.length > max || CONTROL.test(trimmed)) bad(label + ' must be at most ' + max + ' printable characters.');
  return trimmed;
}

/** Scope object shared by every run mutation body. */
export function parseScope(value: unknown): ForecastScope {
  if (!isRecord(value)) bad('scope is required.');
  const scope = value as Record<string, unknown>;
  exactKeys(scope, ['programmeId', 'learningCentreId', 'targetSemesterId'], 'scope');
  return { programmeId: int(scope.programmeId, 'programmeId', 1), learningCentreId: int(scope.learningCentreId, 'learningCentreId', 1), targetSemesterId: int(scope.targetSemesterId, 'targetSemesterId', 1) };
}
export const sameScope = (a: ForecastScope, b: ForecastScope) => a.programmeId === b.programmeId && a.learningCentreId === b.learningCentreId && a.targetSemesterId === b.targetSemesterId;

/** Reason for the audit trail: required for decisions (1-500 characters). */
function requiredReason(value: unknown): string {
  if (typeof value !== 'string') throw new ForecastingError('DECISION_REASON_REQUIRED');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > RUN_LIMITS.maxReasonLength) throw new ForecastingError('DECISION_REASON_REQUIRED');
  if (CONTROL.test(trimmed)) bad('reason must be printable text.');
  return trimmed;
}

export function parseDecisions(body: Record<string, unknown>): { scope: ForecastScope; decisions: ParsedDecision[] } {
  exactKeys(body, ['scope', 'decisions'], 'the request');
  const scope = parseScope(body.scope);
  if (!Array.isArray(body.decisions) || body.decisions.length < 1 || body.decisions.length > RUN_LIMITS.maxDecisionsPerRequest) {
    bad('decisions must contain 1-' + RUN_LIMITS.maxDecisionsPerRequest + ' entries.');
  }
  const decisions = (body.decisions as unknown[]).map((raw): ParsedDecision => {
    if (!isRecord(raw)) bad('Each decision must be an object.');
    const item = raw as Record<string, unknown>;
    exactKeys(item, ['subjectId', 'action', 'reason', 'approvalReference', 'replacementSections'], 'a decision');
    const action = item.action;
    if (typeof action !== 'string' || !(RUN_DECISION_ACTIONS as readonly string[]).includes(action)) bad('action must be REVIEW, APPROVE, DEFER, REOPEN or REPLACE_ALLOCATION.');
    const subjectId = int(item.subjectId, 'subjectId', 1);
    const reason = requiredReason(item.reason);
    const approvalReference = optionalText(item.approvalReference, 'approvalReference', RUN_LIMITS.maxApprovalReferenceLength);
    if (action !== 'REPLACE_ALLOCATION') {
      if (item.replacementSections !== undefined) bad('replacementSections is only allowed for REPLACE_ALLOCATION.');
      return { subjectId, action: action as RunDecisionAction, reason, approvalReference, replacementSections: null };
    }
    if (!Array.isArray(item.replacementSections) || item.replacementSections.length > RUN_LIMITS.maxSectionsPerSubject) {
      bad('replacementSections must be a list of at most ' + RUN_LIMITS.maxSectionsPerSubject + ' sections.');
    }
    const replacementSections = (item.replacementSections as unknown[]).map((entry) => {
      if (!isRecord(entry)) bad('Each replacement section must be an object.');
      const section = entry as Record<string, unknown>;
      exactKeys(section, ['proposedSectionId', 'sectionNumber', 'expectedStudents', 'justification'], 'a replacement section');
      return {
        proposedSectionId: section.proposedSectionId === undefined ? null : int(section.proposedSectionId, 'proposedSectionId', 1),
        sectionNumber: int(section.sectionNumber, 'sectionNumber', 1), expectedStudents: int(section.expectedStudents, 'expectedStudents', 0),
        justification: optionalText(section.justification, 'justification', RUN_LIMITS.maxJustificationLength),
      };
    });
    return { subjectId, action: 'REPLACE_ALLOCATION', reason, approvalReference, replacementSections };
  });
  return { scope, decisions };
}

const STATUS_FOR: Record<Exclude<RunDecisionAction, 'REPLACE_ALLOCATION'>, SectionReviewStatus> = { REVIEW: 'REVIEWED', APPROVE: 'APPROVED', DEFER: 'DEFERRED', REOPEN: 'PENDING' };
const stateOf = (section: RunSectionRow): SectionState => ({
  proposedSectionId: section.proposedSectionId, sectionNumber: section.sectionNumber, expectedStudents: section.expectedStudents,
  reviewStatus: section.reviewStatus, justification: section.justification,
});

/**
 * Validates every decision against the CURRENT run and turns it into a write plan. Nothing is written here; the caller applies the
 * whole batch atomically (any invalid decision rejects the entire request).
 */
export function planDecisions(decisions: ParsedDecision[], rows: RunDetailRows): DecisionPlan[] {
  const seen = new Set<number>();
  return decisions.map((decision): DecisionPlan => {
    if (seen.has(decision.subjectId)) throw new ForecastingError('DECISION_DUPLICATE_SUBJECT', { subjectId: decision.subjectId });
    seen.add(decision.subjectId);
    const subject = rows.subjects.find((row) => row.subjectId === decision.subjectId);
    if (!subject) throw new ForecastingError('DECISION_SUBJECT_NOT_FOUND', { subjectId: decision.subjectId });
    const sections = rows.sections.filter((section) => section.demandId === subject.demandId).sort((a, b) => a.sectionNumber - b.sectionNumber);
    const base = { demandId: subject.demandId, subjectId: subject.subjectId, action: decision.action, reason: decision.reason, approvalReference: decision.approvalReference, before: sections.map(stateOf) };

    if (decision.action !== 'REPLACE_ALLOCATION') {
      if (sections.length === 0) throw new ForecastingError('DECISION_NO_SECTIONS', { subjectId: decision.subjectId });
      return { ...base, sectionStatus: STATUS_FOR[decision.action], replace: null };
    }

    if (subject.configurationStatus !== 'CONFIGURED') throw new ForecastingError('SUBJECT_NOT_CONFIGURED', { subjectId: decision.subjectId });
    const stored = assumptionsFor(rows, subject.subjectId);
    const capacityRuleId = stored?.capacityRuleId ?? sections[0]?.capacityRuleId ?? null;
    const rule = rows.ruleSnapshot.capacityRules.find((entry) => entry.capacityRuleId === capacityRuleId);
    if (capacityRuleId === null || !rule) throw new ForecastingError('SUBJECT_NOT_CONFIGURED', { subjectId: decision.subjectId });

    const replacement = decision.replacementSections ?? [];
    const numbers = replacement.map((entry) => entry.sectionNumber).sort((a, b) => a - b);
    if (numbers.some((number, index) => number !== index + 1)) throw new ForecastingError('ALLOCATION_INVALID', { subjectId: decision.subjectId });
    const ids = replacement.flatMap((entry) => (entry.proposedSectionId === null ? [] : [entry.proposedSectionId]));
    const known = new Set(sections.map((section) => section.proposedSectionId));
    if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) throw new ForecastingError('ALLOCATION_INVALID', { subjectId: decision.subjectId });
    if (replacement.some((entry) => entry.expectedStudents < 1)) throw new ForecastingError('ALLOCATION_INVALID', { subjectId: decision.subjectId });
    // The forecast demand is fixed by the engine: a replacement redistributes it, it never creates or removes demand.
    const total = replacement.reduce((sum, entry) => sum + entry.expectedStudents, 0);
    if (total !== (subject.forecastCount ?? 0)) throw new ForecastingError('ALLOCATION_TOTAL_MISMATCH', { subjectId: decision.subjectId, expected: subject.forecastCount ?? 0, actual: total });
    const ceiling = rule.exceptionMaximum ?? rule.normalMaximum;
    if (replacement.some((entry) => entry.expectedStudents > ceiling)) throw new ForecastingError('ALLOCATION_EXCEEDS_CAPACITY', { subjectId: decision.subjectId, maximum: ceiling });

    // An exception above the normal maximum keeps its own justification, falling back to the decision reason (which is always present).
    const justificationOf = (entry: (typeof replacement)[number]) =>
      entry.expectedStudents > rule.normalMaximum ? entry.justification ?? decision.reason : entry.justification;
    const keptIds = new Set(ids);
    return {
      ...base, sectionStatus: 'REVIEWED',
      replace: {
        deleteSectionIds: sections.filter((section) => !keptIds.has(section.proposedSectionId)).map((section) => section.proposedSectionId),
        keep: replacement.filter((entry) => entry.proposedSectionId !== null).map((entry) => ({
          proposedSectionId: entry.proposedSectionId as number, sectionNumber: entry.sectionNumber, expectedStudents: entry.expectedStudents, justification: justificationOf(entry),
        })),
        insert: replacement.filter((entry) => entry.proposedSectionId === null).map((entry) => ({
          sectionNumber: entry.sectionNumber, expectedStudents: entry.expectedStudents, justification: justificationOf(entry), capacityRuleId,
        })),
      },
    };
  });
}
