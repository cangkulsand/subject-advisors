import type { SemesterOption } from '../../../../../packages/shared/src/forecasting/contracts';
import { selectionPhase, type SelectionPhase, type SelectionWindow } from '../../../../../packages/shared/src/forecasting/selection-window';
import { nextSemesterAfter } from '../../../../../packages/shared/src/offerings/confirmed-offerings';
import type { ForecastingDependencies } from './contracts';
import { ForecastingError } from './errors';

export interface SemesterWindow {
  semester: SemesterOption & SelectionWindow;
  /** True when the semester is the one after the current semester (the only one that can be planned). */
  isNext: boolean;
  phase: SelectionPhase;
}

/** Reads the semester live (admin may change the dates or the current semester at any time) and computes its phase from the server clock. */
export async function resolveSemesterWindow(deps: ForecastingDependencies, targetSemesterId: number): Promise<SemesterWindow> {
  const [currentSemesterId, semesters] = await Promise.all([deps.scopes.currentSemesterId(), deps.repository.semesters()]);
  const found = semesters.find((semester) => semester.semesterId === targetSemesterId);
  if (!found) throw new ForecastingError('SCOPE_NOT_FOUND');
  const semester = { ...found, selectionOpensAt: found.selectionOpensAt ?? null, selectionClosesAt: found.selectionClosesAt ?? null };
  const next = currentSemesterId === null ? null
    : nextSemesterAfter(String(currentSemesterId), semesters.map((s) => ({ semesterId: String(s.semesterId), academicYear: s.academicYear, semesterNo: s.semesterNumber })));
  const clock = (deps.now ?? (() => new Date()))();
  return { semester, isNext: next?.semesterId === String(targetSemesterId), phase: selectionPhase(semester, clock) };
}
