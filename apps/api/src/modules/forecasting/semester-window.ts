import type { SemesterOption } from '../../../../../packages/shared/src/forecasting/contracts';
import { selectionPhase, type SelectionPhase, type SelectionWindow } from '../../../../../packages/shared/src/forecasting/selection-window';
import { coordinatorTargetSemester } from '../../../../../packages/shared/src/forecasting/target-semester';
import type { ForecastingDependencies } from './contracts';
import { ForecastingError } from './errors';

export interface SemesterWindow {
  semester: SemesterOption & SelectionWindow;
  /** True when the semester is the coordinator target: the next NORMAL semester after the current one (the only one that can be planned; S3-P004-031). */
  isNext: boolean;
  phase: SelectionPhase;
}

/** Reads the semester live (admin may change the dates or the current semester at any time) and computes its phase from the server clock. */
export async function resolveSemesterWindow(deps: ForecastingDependencies, targetSemesterId: number): Promise<SemesterWindow> {
  const [currentSemesterId, semesters] = await Promise.all([deps.scopes.currentSemesterId(), deps.repository.semesters()]);
  const found = semesters.find((semester) => semester.semesterId === targetSemesterId);
  if (!found) throw new ForecastingError('SCOPE_NOT_FOUND');
  const semester = { ...found, selectionOpensAt: found.selectionOpensAt ?? null, selectionClosesAt: found.selectionClosesAt ?? null };
  const next = coordinatorTargetSemester(currentSemesterId, semesters);
  const clock = (deps.now ?? (() => new Date()))();
  return { semester, isNext: next?.semesterId === targetSemesterId, phase: selectionPhase(semester, clock) };
}
