import { authJson } from '../auth';
import type { ForecastScope, UncertaintyReason } from '../../../../../packages/shared/src/forecasting/contracts';
import { catalogueFingerprint, runForecastEngine, subjectStudentOutcomes } from '../../../../../packages/shared/src/forecasting/engine';
import type { EngineSubjectDemand } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { OperationReceipt } from '../../../../../packages/shared/src/forecasting/contracts';
import type { RunSubjectStudents, SubjectStudentOutcome } from '../../../../../packages/shared/src/forecasting/runs';
import type { ForecastingDependencies, PortalContact } from './contracts';
import { ForecastingError } from './errors';
import { sourceOf } from './import-source';
import { bad, methodNotAllowed, onlyParameters, positive, readJson } from './http';
import type { NewRunInput, RunRecord } from './runs-contracts';
import { detailOf, revisionOf } from './runs-view';
import type { StoredSubjectAssumptions } from './runs-view';

export const RUN_ROUTE = /^forecast-runs(?:\/([1-9]\d*)(?:\/subjects\/([1-9]\d*)\/students)?)?$/;

function checkIdempotencyKey(request: Request) {
  const key = request.headers.get('idempotency-key');
  if (key !== null && (key.length < 1 || key.length > 128)) bad('Idempotency-Key must be 1-128 characters.');
}
const scopeOf = (run: RunRecord): ForecastScope => ({ programmeId: run.programmeId, learningCentreId: run.learningCentreId, targetSemesterId: run.targetSemesterId });

function receiptResponse(run: RunRecord, status: number, acceptedAt: string): Response {
  const revision = revisionOf(run);
  const receipt: OperationReceipt = { resourceId: run.forecastRunId, ...scopeOf(run), acceptedAt, revision };
  const response = authJson({ data: receipt }, status);
  response.headers.set('ETag', '"' + revision + '"');
  return response;
}

async function requireScope(deps: ForecastingDependencies, actor: string, scope: Pick<ForecastScope, 'programmeId' | 'learningCentreId'>) {
  if (!(await deps.scopes.isScopeAssigned(actor, scope.programmeId, scope.learningCentreId))) throw new ForecastingError('SCOPE_NOT_ASSIGNED');
}
/** Unassigned scopes are indistinguishable from absent runs. */
async function loadRun(deps: ForecastingDependencies, actor: string, forecastRunId: number): Promise<RunRecord> {
  const run = await deps.runs.getRun(forecastRunId);
  if (!run || !(await deps.scopes.isScopeAssigned(actor, run.programmeId, run.learningCentreId))) throw new ForecastingError('RUN_NOT_FOUND');
  return run;
}

function assumptionsOf(demand: EngineSubjectDemand): StoredSubjectAssumptions {
  return {
    nearGraduationCount: demand.nearGraduationCount, breakdown: demand.breakdown, uncertaintyReasonCounts: demand.uncertaintyReasonCounts,
    configurationIssue: demand.configurationIssue, configurationMessage: demand.configurationMessage, exclusionReason: demand.exclusionReason,
    semesterTypeExcluded: demand.semesterTypeExcluded, semesterTypeExclusionReason: demand.semesterTypeExclusionReason, capacityRuleId: demand.capacityRuleId,
  };
}

async function generate(request: Request, deps: ForecastingDependencies, actor: string): Promise<Response> {
  checkIdempotencyKey(request);
  const body = await readJson(request);
  const allowed = ['programmeId', 'learningCentreId', 'targetSemesterId', 'importBatchId', 'demandAssumption'];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || allowed.some((key) => !(key in body))) bad('The request must contain exactly the documented fields.');
  if (body.demandAssumption !== 'SUPPORTED_ELIGIBLE_POOL') bad('demandAssumption must be SUPPORTED_ELIGIBLE_POOL.');
  const idOf = (key: string) => typeof body[key] === 'number' && Number.isInteger(body[key]) ? positive(String(body[key]), key) : bad(key + ' must be a positive integer.');
  const scope: ForecastScope = { programmeId: idOf('programmeId'), learningCentreId: idOf('learningCentreId'), targetSemesterId: idOf('targetSemesterId') };
  const importBatchId = idOf('importBatchId');
  await requireScope(deps, actor, scope);

  const batch = await deps.repository.getBatch(importBatchId);
  if (!batch || batch.status !== 'ACCEPTED' || batch.programmeId !== scope.programmeId || batch.learningCentreId !== scope.learningCentreId || batch.targetSemesterId !== scope.targetSemesterId) {
    throw new ForecastingError('IMPORT_NOT_FOUND');
  }
  // Replay: an import snapshot yields exactly one forecast; a retry returns the receipt of the one already created.
  const existing = await deps.runs.findByImportBatch(importBatchId);
  if (existing) return receiptResponse(existing, 200, existing.generatedAt);

  const inputs = await deps.runs.engineInputs(scope, importBatchId);
  const result = runForecastEngine({
    scope, target: inputs.target, curricula: inputs.curricula, capacityRules: inputs.capacityRules,
    snapshot: { ...inputs.snapshot, rejectedRowsByStudent: batch.summary.internal.rejectedRowsByStudent ?? {} },
  });
  const input: NewRunInput = {
    scope, importBatchId, actor, engineVersion: result.engineVersion, ruleSnapshot: result.ruleSnapshot, originalRecommendations: result.originalRecommendations,
    scenarioAssumptions: {
      demandAssumption: 'SUPPORTED_ELIGIBLE_POOL', importBatchId, sourceFingerprint: batch.sourceFingerprint, sourceDate: batch.sourceDate, sourceLabel: batch.sourceLabel, importSource: sourceOf(batch),
      engineSummary: result.summary, subjects: Object.fromEntries(result.demands.map((demand) => [String(demand.subjectId), assumptionsOf(demand)])),
    },
    demands: result.demands.map((demand) => ({
      subjectId: demand.subjectId, eligibleCount: demand.supportedDemand, forecastCount: demand.forecastCount, uncertainCount: demand.uncertainCount,
      uncertaintyReasons: demand.uncertaintyReasons as UncertaintyReason[], dataQualityStatus: demand.qualityStatus, configurationStatus: demand.configurationStatus,
    })),
    sections: result.demands.flatMap((demand) => demand.sections.map((section) => ({
      subjectId: demand.subjectId, sectionNumber: section.sectionNumber, expectedStudents: section.expectedStudents, capacityRuleId: section.capacityRuleId,
    }))),
  };
  const run = await deps.runs.createRun(input);
  return receiptResponse(run, 201, run.generatedAt);
}

async function detail(forecastRunId: number, deps: ForecastingDependencies, actor: string): Promise<Response> {
  await loadRun(deps, actor, forecastRunId);
  const rows = await deps.runs.getDetail(forecastRunId);
  if (!rows) throw new ForecastingError('RUN_NOT_FOUND');
  const response = authJson({ data: detailOf(rows) });
  response.headers.set('ETag', '"' + revisionOf(rows.run) + '"');
  return response;
}

/**
 * Read-only roster behind one subject's numbers. Rebuilds the engine input from the run's frozen import batch and the run's stored target semester,
 * so the only live input is the curriculum catalogue; `catalogueMatchesRun` says whether that still equals the run's stored fingerprint.
 */
/** Adds the live matric number and sign-in email of portal (`PORTAL-<student_id>`) students. A lookup failure keeps the list usable without them. */
async function withContacts(students: SubjectStudentOutcome[], deps: ForecastingDependencies): Promise<Pick<RunSubjectStudents, 'emailsAvailable' | 'students'>> {
  const idOf = (reference: string) => { const match = /^PORTAL-(\d+)$/.exec(reference); return match ? Number(match[1]) : null; };
  const ids = [...new Set(students.map((student) => idOf(student.externalReference)).filter((id): id is number => id !== null))];
  let contacts = new Map<number, PortalContact>(), emailsAvailable = true;
  if (ids.length && deps.portalContacts) {
    try { ({ contacts, emailsAvailable } = await deps.portalContacts(ids)); } catch { emailsAvailable = false; }
  }
  return { emailsAvailable, students: students.map((student) => {
    const id = idOf(student.externalReference), contact = id === null ? undefined : contacts.get(id);
    return { ...student, matricNo: contact?.matricNo ?? null, email: contact?.email ?? null };
  }) };
}

async function subjectStudents(forecastRunId: number, subjectId: number, deps: ForecastingDependencies, actor: string): Promise<Response> {
  const run = await loadRun(deps, actor, forecastRunId);
  const rows = await deps.runs.getDetail(forecastRunId);
  const stored = rows?.subjects.find((subject) => subject.subjectId === subjectId);
  if (!rows || !stored) throw new ForecastingError('RUN_SUBJECT_NOT_FOUND');
  const scope = scopeOf(run);
  const batch = await deps.repository.getBatch(run.importBatchId);
  if (!batch) throw new ForecastingError('IMPORT_NOT_FOUND');
  const inputs = await deps.runs.engineInputs(scope, run.importBatchId);
  const request = {
    scope, target: rows.ruleSnapshot.targetSemester, curricula: inputs.curricula, capacityRules: inputs.capacityRules,
    snapshot: { ...inputs.snapshot, rejectedRowsByStudent: batch.summary.internal.rejectedRowsByStudent ?? {} },
  };
  const view = subjectStudentOutcomes(request, subjectId);
  const b = view.breakdown;
  const data: RunSubjectStudents = {
    forecastRunId, subjectId, subjectCode: stored.subjectCode, subjectName: stored.subjectName,
    catalogueMatchesRun: catalogueFingerprint(request.curricula) === rows.ruleSnapshot.catalogueFingerprint,
    summary: {
      inCurriculum: b.inCurriculum, counted: b.supported, uncertain: b.uncertain, nearGraduation: view.nearGraduationCount,
      notCounted: b.alreadyPassed + b.prerequisiteNotMet + b.notOfferedInSemesterType, breakdown: b, uncertaintyReasonCounts: view.uncertaintyReasonCounts,
    },
    ...await withContacts(view.students, deps),
  };
  return authJson({ data });
}

/** Handles `forecast-runs...` routes. The caller already authenticated a COORDINATOR and passes the verified actor. */
export async function handleRunRoute(route: string, request: Request, url: URL, deps: ForecastingDependencies, actor: string): Promise<Response | null> {
  const match = RUN_ROUTE.exec(route);
  if (!match) return null;
  const method = request.method;
  const id = match[1] ? Number(match[1]) : null;
  const subjectId = match[2] ? Number(match[2]) : null;
  if (id === null) {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    onlyParameters(url, []);
    return await generate(request, deps, actor);
  }
  if (method !== 'GET') return methodNotAllowed(['GET']);
  onlyParameters(url, []);
  if (subjectId !== null) return await subjectStudents(id, subjectId, deps, actor);
  return await detail(id, deps, actor);
}
