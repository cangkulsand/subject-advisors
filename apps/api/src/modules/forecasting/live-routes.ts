/**
 * Live coordinator forecast (S3-P004-032). Calculated from the students in the system on every read and never stored:
 * the system-snapshot selection (`buildSystemSnapshot`) and the UC20 engine, without a snapshot or a forecast run.
 */
import { authJson } from '../auth';
import type { ForecastScope, SemesterOption } from '../../../../../packages/shared/src/forecasting/contracts';
import { runForecastEngine, subjectStudentOutcomes } from '../../../../../packages/shared/src/forecasting/engine';
import type { ForecastEngineInput } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { LiveForecast, LiveSubject, LiveSubjectStudents } from '../../../../../packages/shared/src/forecasting/live';
import type { ForecastingDependencies } from './contracts';
import { ForecastingError } from './errors';
import { methodNotAllowed, onlyParameters, positive } from './http';
import { engineStudentsOf } from './live-input';
import { withContacts } from './runs-routes';
import { buildSystemSnapshot } from './system-snapshot';

export const LIVE_ROUTE = /^forecast-live(?:\/subjects\/([1-9]\d*)\/students)?$/;
type ResolveTarget = (deps: ForecastingDependencies) => Promise<{ target: SemesterOption | null }>;

/** The engine input for the scope's students right now. `null` when the scope has no students (nothing to calculate). */
async function liveEngineRequest(deps: ForecastingDependencies, actor: string, url: URL, resolveTarget: ResolveTarget): Promise<{ scope: ForecastScope; request: ForecastEngineInput | null }> {
  const programmeId = positive(url.searchParams.get('programmeId'), 'programmeId');
  const learningCentreId = positive(url.searchParams.get('learningCentreId'), 'learningCentreId');
  if (!(await deps.scopes.isScopeAssigned(actor, programmeId, learningCentreId))) throw new ForecastingError('SCOPE_NOT_ASSIGNED');
  const { target } = await resolveTarget(deps);
  if (!target) throw new ForecastingError('TARGET_SEMESTER_UNAVAILABLE');
  const scope: ForecastScope = { programmeId, learningCentreId, targetSemesterId: target.semesterId };
  const selection = await deps.repository.systemStudents(programmeId);
  const curriculumIds = [...new Set(selection.students.filter((student) => student.eligible).map((student) => student.curriculumId))].sort((a, b) => a - b);
  if (curriculumIds.length === 0) return { scope, request: null };
  // One catalogue read (review): the engine curricula also give the credit hours the student selection needs.
  const inputs = await deps.runs.catalogueInputs(scope, curriculumIds);
  const built = await buildSystemSnapshot(selection, { programmeId, curricula: inputs.curricula }, learningCentreId, (ids) => deps.scopes.studentLearningCentres(ids), { fingerprint: false });
  if (built.students.length === 0) return { scope, request: null };
  const students = engineStudentsOf(built);
  return { scope, request: { scope, target: inputs.target, curricula: inputs.curricula, capacityRules: inputs.capacityRules, snapshot: { students, rejectedRowsByStudent: {} } } };
}

async function forecast(deps: ForecastingDependencies, actor: string, url: URL, resolveTarget: ResolveTarget): Promise<Response> {
  const { scope, request } = await liveEngineRequest(deps, actor, url, resolveTarget);
  const calculatedAt = (deps.now ?? (() => new Date()))().toISOString();
  let subjects: LiveSubject[] = [];
  if (request) {
    const credits = new Map(request.curricula.flatMap((curriculum) => curriculum.subjects).map((subject) => [subject.subjectId, subject.creditHours]));
    subjects = runForecastEngine(request).demands.map((demand) => ({
      subjectId: demand.subjectId, subjectCode: demand.subjectCode, subjectName: demand.subjectName, creditHours: credits.get(demand.subjectId) ?? 0, classType: demand.classType,
      excluded: demand.excluded, semesterTypeExcluded: demand.semesterTypeExcluded, supportedEligibleCount: demand.supportedDemand, uncertainStudentCount: demand.uncertainCount,
      nearGraduationCount: demand.nearGraduationCount, breakdown: demand.breakdown,
    }));
  }
  const data: LiveForecast = { ...scope, calculatedAt, studentsInScope: request?.snapshot.students.length ?? 0, subjects };
  return authJson({ data });
}

async function subjectStudents(subjectId: number, deps: ForecastingDependencies, actor: string, url: URL, resolveTarget: ResolveTarget): Promise<Response> {
  const { request } = await liveEngineRequest(deps, actor, url, resolveTarget);
  const meta = request?.curricula.flatMap((curriculum) => curriculum.subjects).find((subject) => subject.subjectId === subjectId);
  if (!request || !meta) throw new ForecastingError('RUN_SUBJECT_NOT_FOUND');
  const view = subjectStudentOutcomes(request, subjectId);
  const b = view.breakdown;
  const data: LiveSubjectStudents = {
    subjectId, subjectCode: meta.subjectCode, subjectName: meta.subjectName,
    summary: {
      inCurriculum: b.inCurriculum, counted: b.supported, uncertain: b.uncertain, nearGraduation: view.nearGraduationCount,
      notCounted: b.alreadyPassed + b.prerequisiteNotMet + b.notOfferedInSemesterType, breakdown: b, uncertaintyReasonCounts: view.uncertaintyReasonCounts,
    },
    ...await withContacts(view.students, deps),
  };
  return authJson({ data });
}

/** Handles `forecast-live...` routes. The caller already authenticated a COORDINATOR and passes the verified actor. */
export async function handleLiveRoute(route: string, request: Request, url: URL, deps: ForecastingDependencies, actor: string, resolveTarget: ResolveTarget): Promise<Response | null> {
  const match = LIVE_ROUTE.exec(route);
  if (!match) return null;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  onlyParameters(url, ['programmeId', 'learningCentreId']);
  return match[1] ? await subjectStudents(Number(match[1]), deps, actor, url, resolveTarget) : await forecast(deps, actor, url, resolveTarget);
}
