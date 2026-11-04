/** In-memory stand-in for the forecast-run repository, used by route tests only (never imported by production code). */
import type { ForecastAuditEntry, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ForecastRunStatus } from '../../../../../packages/shared/src/forecasting/runs';
import { ForecastingError } from './errors';
import type { EngineInputRows, ForecastRunsRepository, RunDetailRows, RunRecord, RunSectionRow, RunSubjectRow } from './runs-contracts';

interface StoredRun {
  record: RunRecord;
  detail: Omit<RunDetailRows, 'run'>;
  audit: ForecastAuditEntry[];
}

export function fakeRunsRepository(inputs: EngineInputRows) {
  const runs: StoredRun[] = [];
  let nextRun = 1; let nextDemand = 1; let nextSection = 1; let nextAudit = 1;
  const clock = () => '2026-11-01T10:00:00.000Z';
  const refresh = (stored: StoredRun) => { stored.record.auditCount = stored.audit.length; return stored.record; };
  const find = (id: number) => runs.find((entry) => entry.record.forecastRunId === id);
  const guard = (stored: StoredRun, expected: { status: ForecastRunStatus; auditCount: number }) => {
    if (stored.record.status !== expected.status || stored.audit.length !== expected.auditCount) throw new ForecastingError('RUN_REVISION_MISMATCH');
  };
  const subjectMeta = new Map(inputs.curricula.flatMap((curriculum) => curriculum.subjects).map((subject) => [subject.subjectId, subject]));

  const repository: ForecastRunsRepository = {
    engineInputs: async () => inputs,
    findByImportBatch: async (importBatchId) => [...runs].reverse().find((entry) => entry.record.importBatchId === importBatchId)?.record ?? null,
    latestVersion: async (scope: ForecastScope) => {
      const own = runs.filter((entry) => entry.record.programmeId === scope.programmeId && entry.record.learningCentreId === scope.learningCentreId && entry.record.targetSemesterId === scope.targetSemesterId);
      const top = own.sort((a, b) => b.record.versionNumber - a.record.versionNumber)[0];
      return top ? { forecastRunId: top.record.forecastRunId, versionNumber: top.record.versionNumber, status: top.record.status } : null;
    },
    createRun: async (input) => {
      if (runs.some((entry) => entry.record.importBatchId === input.importBatchId)) throw new ForecastingError('RUN_ALREADY_EXISTS');
      const previous = runs.filter((entry) => entry.record.programmeId === input.scope.programmeId && entry.record.learningCentreId === input.scope.learningCentreId && entry.record.targetSemesterId === input.scope.targetSemesterId)
        .sort((a, b) => b.record.versionNumber - a.record.versionNumber)[0];
      const record: RunRecord = {
        forecastRunId: nextRun++, ...input.scope, importBatchId: input.importBatchId, versionNumber: (previous?.record.versionNumber ?? 0) + 1,
        parentForecastRunId: previous?.record.forecastRunId ?? null, status: 'DRAFT', engineVersion: input.engineVersion, generatedBy: input.actor, generatedAt: clock(),
        finalizedBy: null, finalizedAt: null, auditCount: 0,
      };
      const subjects: RunSubjectRow[] = input.demands.map((demand) => {
        const meta = subjectMeta.get(demand.subjectId)!;
        return {
          demandId: nextDemand++, subjectId: demand.subjectId, subjectCode: meta.subjectCode, subjectName: meta.subjectName, creditHours: meta.creditHours, classType: meta.classType,
          eligibleCount: demand.eligibleCount, forecastCount: demand.forecastCount, uncertainCount: demand.uncertainCount, uncertaintyReasons: demand.uncertaintyReasons,
          dataQualityStatus: demand.dataQualityStatus, configurationStatus: demand.configurationStatus,
        };
      });
      const sections: RunSectionRow[] = input.sections.map((section) => {
        const rule = inputs.capacityRules.find((entry) => entry.capacityRuleId === section.capacityRuleId)!;
        return {
          proposedSectionId: nextSection++, demandId: subjects.find((subject) => subject.subjectId === section.subjectId)!.demandId, capacityRuleId: rule.capacityRuleId,
          sectionNumber: section.sectionNumber, expectedStudents: section.expectedStudents, reviewStatus: 'PENDING', justification: null, reviewedBy: null, reviewedAt: null,
          minimumEnrollment: rule.minimumEnrollment, breakEvenTarget: rule.breakEvenTarget, normalMaximum: rule.normalMaximum, exceptionMaximum: rule.exceptionMaximum,
        };
      });
      runs.push({ record, detail: { scenarioAssumptions: input.scenarioAssumptions, ruleSnapshot: input.ruleSnapshot, originalRecommendations: input.originalRecommendations, subjects, sections }, audit: [] });
      return { ...record };
    },
    getRun: async (id) => { const stored = find(id); return stored ? { ...refresh(stored) } : null; },
    getDetail: async (id) => { const stored = find(id); return stored ? { run: { ...refresh(stored) }, ...structuredClone(stored.detail) } : null; },
    listRuns: async (scope, limit, before) => runs
      .filter((entry) => entry.record.programmeId === scope.programmeId && entry.record.learningCentreId === scope.learningCentreId && entry.record.targetSemesterId === scope.targetSemesterId
        && (before === null || entry.record.forecastRunId < before))
      .sort((a, b) => b.record.forecastRunId - a.record.forecastRunId).slice(0, limit).map((entry) => ({
        ...refresh(entry),
        summary: {
          subjects: entry.detail.subjects.length, excludedSubjects: 0, notOfferedInSemesterTypeSubjects: 0, configurationRequiredSubjects: 0, totalSupportedDemand: 0, totalUncertain: 0,
          totalSections: entry.detail.sections.length, pendingSections: entry.detail.sections.filter((section) => section.reviewStatus === 'PENDING').length,
          sectionsBelowMinimum: 0, sectionsBelowOptimal: 0,
          pendingSubjects: new Set(entry.detail.sections.filter((section) => section.reviewStatus === 'PENDING').map((section) => section.demandId)).size, subjectsBelowMinimum: 0,
        },
      })),
    listAudit: async (id, _scope, limit, before) => [...(find(id)?.audit ?? [])].sort((a, b) => b.decisionAuditId - a.decisionAuditId)
      .filter((entry) => before === null || entry.decisionAuditId < before).slice(0, limit),
    startReview: async (id, expected, actor, reason) => {
      const stored = find(id)!; guard(stored, expected);
      stored.audit.push({
        decisionAuditId: nextAudit++, forecastRunId: id, scope: { programmeId: stored.record.programmeId, learningCentreId: stored.record.learningCentreId, targetSemesterId: stored.record.targetSemesterId },
        subjectId: null, proposedSectionId: null, actionType: 'START_REVIEW', recordedBy: actor, recordedAt: clock(), reason, before: { status: expected.status }, after: { status: 'UNDER_REVIEW' },
      });
      stored.record.status = 'UNDER_REVIEW';
      return { ...refresh(stored) };
    },
    applyDecisions: async (id, expected, actor, plans) => {
      const stored = find(id)!; guard(stored, expected);
      for (const plan of plans) {
        const sections = stored.detail.sections;
        if (plan.replace) {
          stored.detail.sections = sections.filter((section) => !plan.replace!.deleteSectionIds.includes(section.proposedSectionId));
          for (const keep of plan.replace.keep) {
            const row = stored.detail.sections.find((section) => section.proposedSectionId === keep.proposedSectionId)!;
            Object.assign(row, { sectionNumber: keep.sectionNumber, expectedStudents: keep.expectedStudents, justification: keep.justification, reviewStatus: plan.sectionStatus, reviewedBy: actor, reviewedAt: clock() });
          }
          for (const insert of plan.replace.insert) {
            const rule = inputs.capacityRules.find((entry) => entry.capacityRuleId === insert.capacityRuleId)!;
            stored.detail.sections.push({
              proposedSectionId: nextSection++, demandId: plan.demandId, capacityRuleId: rule.capacityRuleId, sectionNumber: insert.sectionNumber, expectedStudents: insert.expectedStudents,
              reviewStatus: plan.sectionStatus, justification: insert.justification, reviewedBy: actor, reviewedAt: clock(), minimumEnrollment: rule.minimumEnrollment,
              breakEvenTarget: rule.breakEvenTarget, normalMaximum: rule.normalMaximum, exceptionMaximum: rule.exceptionMaximum,
            });
          }
        } else {
          for (const section of sections.filter((entry) => entry.demandId === plan.demandId)) Object.assign(section, plan.sectionStatus === 'PENDING' ? { reviewStatus: 'PENDING', reviewedBy: null, reviewedAt: null } : { reviewStatus: plan.sectionStatus, reviewedBy: actor, reviewedAt: clock() });
        }
        const after = stored.detail.sections.filter((section) => section.demandId === plan.demandId).sort((a, b) => a.sectionNumber - b.sectionNumber)
          .map((section) => ({ proposedSectionId: section.proposedSectionId, sectionNumber: section.sectionNumber, expectedStudents: section.expectedStudents, reviewStatus: section.reviewStatus, justification: section.justification }));
        stored.audit.push({
          decisionAuditId: nextAudit++, forecastRunId: id, scope: { programmeId: stored.record.programmeId, learningCentreId: stored.record.learningCentreId, targetSemesterId: stored.record.targetSemesterId },
          subjectId: plan.subjectId, proposedSectionId: null, actionType: plan.action, recordedBy: actor, recordedAt: clock(), reason: plan.reason,
          ...(plan.approvalReference ? { approvalReference: plan.approvalReference } : {}), before: { sections: plan.before } as never, after: { sections: after, approvalReference: plan.approvalReference } as never,
        });
      }
      return { ...refresh(stored) };
    },
    finalize: async (id, expected, actor, audit) => {
      const stored = find(id)!; guard(stored, expected);
      stored.audit.push({
        decisionAuditId: nextAudit++, forecastRunId: id, scope: { programmeId: stored.record.programmeId, learningCentreId: stored.record.learningCentreId, targetSemesterId: stored.record.targetSemesterId },
        subjectId: null, proposedSectionId: null, actionType: 'FINALIZE', recordedBy: actor, recordedAt: clock(), reason: audit.reason,
        ...(audit.approvalReference ? { approvalReference: audit.approvalReference } : {}), before: { status: expected.status }, after: { status: 'FINALIZED', approvalReference: audit.approvalReference },
      });
      Object.assign(stored.record, { status: 'FINALIZED', finalizedBy: actor, finalizedAt: clock() });
      return { ...refresh(stored) };
    },
  };
  return { repository, runs };
}
