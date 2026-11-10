/** In-memory stand-in for the forecast-run repository, used by route tests only (never imported by production code). */
import { ForecastingError } from './errors';
import type { EngineInputRows, ForecastRunsRepository, RunDetailRows, RunRecord, RunSectionRow, RunSubjectRow } from './runs-contracts';

interface StoredRun {
  record: RunRecord;
  detail: Omit<RunDetailRows, 'run'>;
}

export function fakeRunsRepository(inputs: EngineInputRows) {
  const runs: StoredRun[] = [];
  let nextRun = 1; let nextDemand = 1; let nextSection = 1;
  const clock = () => '2026-11-01T10:00:00.000Z';
  const refresh = (stored: StoredRun) => { stored.record.auditCount = 0; return stored.record; };
  const find = (id: number) => runs.find((entry) => entry.record.forecastRunId === id);
  const subjectMeta = new Map(inputs.curricula.flatMap((curriculum) => curriculum.subjects).map((subject) => [subject.subjectId, subject]));

  const repository: ForecastRunsRepository = {
    engineInputs: async () => inputs,
    findByImportBatch: async (importBatchId) => [...runs].reverse().find((entry) => entry.record.importBatchId === importBatchId)?.record ?? null,
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
      runs.push({ record, detail: { scenarioAssumptions: input.scenarioAssumptions, ruleSnapshot: input.ruleSnapshot, originalRecommendations: input.originalRecommendations, subjects, sections } });
      return { ...record };
    },
    getRun: async (id) => { const stored = find(id); return stored ? { ...refresh(stored) } : null; },
    getDetail: async (id) => { const stored = find(id); return stored ? { run: { ...refresh(stored) }, ...structuredClone(stored.detail) } : null; },
  };
  return { repository, runs };
}
