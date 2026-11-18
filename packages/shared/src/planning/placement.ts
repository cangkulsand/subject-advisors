import type { GraduationPlan, PlanningInput, PlanningSubject, ScenarioChange, SemesterRef } from './contracts';
import { planScenario } from './engine';
import { allowedSemesterTypes, semesterAt, semesterIndex, semesterLabel, semesterTypeOf } from './semesters';

/**
 * Drag-and-drop checks for the graduation plan (S3-P004-010). Pure: the page runs them before showing or saving a
 * change, and the API runs `validateChanges` again before writing. Every refusal is a short, student-readable reason.
 */
export type Check = { ok: true; changes: ScenarioChange[]; plan: GraduationPlan } | { ok: false; reason: string };

const same = (left: SemesterRef, right: SemesterRef) => left.academicYear === right.academicYear && left.semesterNo === right.semesterNo;
const labelOf = (ref: SemesterRef, index: number) => semesterLabel(ref, index + 1, true);
const configuredRow = (input: PlanningInput, ref: SemesterRef) => input.limits.find(limit => same(limit, ref));
const retakeKinds = new Set(['FAIL', 'WITHDRAW']);

/** Where each subject sits in a plan (its real attempt, not a failed one), as a semester index. */
function positions(plan: GraduationPlan): Map<number, number> {
  const at = new Map<number, number>();
  plan.semesters.forEach((semester, index) => semester.subjects.forEach(s => { if (!s.failedAttempt) at.set(s.curriculumSubjectId, index); }));
  return at;
}

/** True when `id` is a prerequisite of `of`, directly or through a chain. */
function needs(byId: Map<number, PlanningSubject>, of: number, id: number): boolean {
  const seen = new Set<number>(); const stack = [...(byId.get(of)?.prerequisites ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (next === id) return true;
    if (!seen.has(next)) { seen.add(next); stack.push(...(byId.get(next)?.prerequisites ?? [])); }
  }
  return false;
}

/**
 * Adds a change under the one-change-per-subject rule: a move after a fail or withdraw pins the retake and keeps that
 * change; a move replaces a postpone or an earlier move; any other change replaces every earlier change to the subject.
 */
export function withChange(changes: ScenarioChange[], change: ScenarioChange): ScenarioChange[] {
  const id = change.curriculumSubjectId;
  if (change.kind === 'PLACE') {
    const retake = changes.find(c => c.curriculumSubjectId === id && retakeKinds.has(c.kind));
    if (retake) return changes.map(c => c === retake ? { ...c, semester: change.semester } : c);
    return [...changes.filter(c => !(c.curriculumSubjectId === id && (c.kind === 'PLACE' || c.kind === 'POSTPONE'))), change];
  }
  return [...withoutSwapMoves(changes, changes.filter(c => c.curriculumSubjectId === id)).filter(c => c.curriculumSubjectId !== id), change];
}

/** Dropping a swap also drops the student's move of the subject it brought in, which is no longer in the plan. */
function withoutSwapMoves(changes: ScenarioChange[], dropped: ScenarioChange[]): ScenarioChange[] {
  const replacements = new Set(dropped.filter(c => c.kind === 'REPLACE' && c.replacementId !== undefined).map(c => c.replacementId!));
  return changes.filter(c => !(c.kind === 'PLACE' && replacements.has(c.curriculumSubjectId)));
}

/** Removes one change from "Your changes" (and the move of a swap's replacement with its swap). */
export function removeChange(changes: ScenarioChange[], index: number): ScenarioChange[] {
  const removed = changes[index];
  if (!removed) return changes;
  return withoutSwapMoves(changes.filter((_, i) => i !== index), [removed]);
}

/** The same list without the student's placement of this subject (a retake keeps its fail / withdraw). */
function withoutPin(changes: ScenarioChange[], id: number): ScenarioChange[] {
  return changes.flatMap(c => {
    if (c.curriculumSubjectId !== id || !c.semester) return [c];
    if (c.kind === 'PLACE') return [];
    const { semester: _drop, ...rest } = c; void _drop;
    return [rest];
  });
}

/** Placements (PLACE, or a moved retake) whose subject is not where the student put it, with their target. */
function brokenPins(input: PlanningInput, changes: ScenarioChange[], plan: GraduationPlan) {
  const at = positions(plan);
  const passed = new Set(input.passed);
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const broken: { id: number; index: number | null; semester: SemesterRef; where: number | undefined }[] = [];
  for (const change of changes) {
    if (!change.semester) continue;
    const index = semesterIndex(input.start, change.semester);
    const where = at.get(change.curriculumSubjectId);
    const prerequisitesEarlier = (byId.get(change.curriculumSubjectId)?.prerequisites ?? [])
      .every(required => passed.has(required) || (at.get(required) ?? Infinity) < (where ?? -1));
    if (index === null || where !== index || !prerequisitesEarlier) broken.push({ id: change.curriculumSubjectId, index, semester: change.semester, where });
  }
  return broken;
}

function coreqReason(input: PlanningInput, plan: GraduationPlan, id: number, index: number): string | null {
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const at = positions(plan);
  const passed = new Set(input.passed);
  const unmet = (byId.get(id)?.corequisites ?? [])
    .filter(partner => !passed.has(partner) && (at.get(partner) ?? Infinity) > index)
    .map(partner => byId.get(partner)?.subjectCode ?? 'another subject')
    .sort((left, right) => left.localeCompare(right))[0];
  return unmet ? `Needs co-requisite ${unmet} in the same semester, and it does not fit there.` : null;
}

/** Why a subject cannot sit at `index` in `plan`: the first prerequisite not placed earlier, else the semester is full. */
function placementReason(input: PlanningInput, plan: GraduationPlan, id: number, index: number, semester: SemesterRef): string {
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const at = positions(plan);
  const passed = new Set(input.passed);
  const blocking = (byId.get(id)?.prerequisites ?? [])
    .filter(required => !passed.has(required) && (at.get(required) ?? Infinity) >= index)
    .map(required => byId.get(required)?.subjectCode ?? '')
    .sort((left, right) => left.localeCompare(right))[0];
  if (blocking) return `Needs ${blocking} first, and there is no room to fit it in an earlier semester.`;
  const coreq = coreqReason(input, plan, id, index);
  if (coreq) return coreq;
  return `${labelOf(semester, index)} is already full with subjects you placed there.`;
}

/**
 * The whole list holds: every placed subject sits where the student put it with its prerequisites earlier, and every
 * swap still applies. The API runs this before saving.
 */
export function validateChanges(input: PlanningInput, changes: ScenarioChange[]): Check {
  const plan = planScenario(input, changes);
  const broken = brokenPins(input, changes, plan)[0];
  if (broken) {
    if (broken.index === null) return { ok: false, reason: 'This semester is not set up yet.' };
    const label = labelOf(broken.semester, broken.index);
    const code = input.subjects.find(s => s.curriculumSubjectId === broken.id)?.subjectCode ?? 'A subject';
    if (broken.where === undefined) {
      const coreq = coreqReason(input, plan, broken.id, broken.index);
      if (coreq) return { ok: false, reason: coreq };
      return { ok: false, reason: `${code} is placed in ${label} but is no longer in your plan. Remove that move first.` };
    }
    if (broken.index === 0 && input.approvedFirst !== null && !input.approvedFirst.includes(broken.id)) return { ok: false, reason: `Not approved by your coordinator for ${label}.` };
    return { ok: false, reason: placementReason(input, plan, broken.id, broken.index, broken.semester) };
  }
  const at = positions(plan);
  for (const change of changes) {
    if (change.kind !== 'REPLACE') continue;
    const replacement = change.replacementId;
    if (replacement === undefined || at.has(change.curriculumSubjectId) || !at.has(replacement)) return { ok: false, reason: 'This swap is no longer possible.' };
  }
  return { ok: true, changes, plan };
}

/** Checks moving a subject to `target` (drag and drop or "Move…"), in the order the design gives. */
export function checkPlacement(input: PlanningInput, changes: ScenarioChange[], curriculumSubjectId: number, target: SemesterRef): Check {
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const subject = byId.get(curriculumSubjectId);
  const current = planScenario(input, changes);
  if (!subject || !positions(current).has(curriculumSubjectId)) return { ok: false, reason: 'This subject is not in your plan.' };
  const index = semesterIndex(input.start, target);
  if (input.start === null) return { ok: false, reason: 'This semester is not set up yet.' };
  if (index === null) return { ok: false, reason: `You can only plan from ${labelOf(input.start, 0)} onwards.` };
  const row = configuredRow(input, target);
  if (!row) return { ok: false, reason: 'This semester is not set up yet.' };
  const type = semesterTypeOf(target.semesterNo);
  const allowed = allowedSemesterTypes(subject);
  if (!allowed.includes(type)) {
    return { ok: false, reason: allowed.includes('NORMAL') ? 'Runs only in Normal semesters.' : 'Runs only in Short semesters.' };
  }
  // A retake (after a fail or withdraw) has to come after the semester of that attempt.
  const retakeAt = changes.findIndex(c => c.curriculumSubjectId === curriculumSubjectId && retakeKinds.has(c.kind));
  if (retakeAt >= 0) {
    const attempt = positions(planScenario(input, changes.slice(0, retakeAt))).get(curriculumSubjectId);
    if (attempt !== undefined && index <= attempt) {
      return { ok: false, reason: changes[retakeAt]!.kind === 'FAIL' ? 'A retake must come after the semester you failed it in.' : 'Taking it again must come after the semester you withdrew from it.' };
    }
  }
  const label = labelOf(target, index);
  if (index === 0 && input.approvedFirst !== null && !input.approvedFirst.includes(curriculumSubjectId)) {
    return { ok: false, reason: `Not approved by your coordinator for ${label}.` };
  }
  const others = changes.filter(c => c.semester && c.curriculumSubjectId !== curriculumSubjectId);
  const pinnedHere = others.filter(c => same(c.semester!, target)).map(c => byId.get(c.curriculumSubjectId)).filter((s): s is PlanningSubject => !!s);
  if (pinnedHere.length + 1 > row.maxSubjects || pinnedHere.reduce((n, s) => n + s.creditHours, subject.creditHours) > row.maxCredits) {
    return { ok: false, reason: `${label} is already full with subjects you placed there.` };
  }
  for (const other of others) {
    const otherIndex = semesterIndex(input.start, other.semester!);
    if (otherIndex !== null && otherIndex <= index && needs(byId, other.curriculumSubjectId, curriculumSubjectId)) {
      return { ok: false, reason: `${byId.get(other.curriculumSubjectId)!.subjectCode} is placed in ${labelOf(other.semester!, otherIndex)} and needs this subject first.` };
    }
  }
  // Dropping a subject where the plan would put it anyway just removes the student's placement.
  const unpinned = withoutPin(changes, curriculumSubjectId);
  const free = planScenario(input, unpinned);
  const next = positions(free).get(curriculumSubjectId) === index ? unpinned : withChange(changes, { kind: 'PLACE', curriculumSubjectId, semester: target });
  const plan = next === unpinned ? free : planScenario(input, next);
  if (positions(plan).get(curriculumSubjectId) !== index || brokenPins(input, next, plan).some(b => b.id === curriculumSubjectId)) {
    return { ok: false, reason: placementReason(input, plan, curriculumSubjectId, index, target) };
  }
  return validateChanges(input, next);
}

/** Checks a What-if form change (postpone, fail, withdraw, swap) against the student's placements. */
export function checkChange(input: PlanningInput, changes: ScenarioChange[], change: ScenarioChange): Check {
  const next = withChange(changes, change);
  const result = validateChanges(input, next);
  if (result.ok) return result;
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const plan = planScenario(input, next);
  const broken = brokenPins(input, next, plan).find(b => b.index !== null && needs(byId, b.id, change.curriculumSubjectId));
  if (broken) {
    return { ok: false, reason: `${byId.get(broken.id)!.subjectCode} is placed in ${labelOf(broken.semester, broken.index!)} and needs this subject first. Remove that move first.` };
  }
  return result;
}

export interface PlacementTarget { semester: SemesterRef; label: string; ok: boolean; reason: string | null }

/** Every semester from the first planned one to one after the plan's last, with whether the subject may move there. */
export function placementTargets(input: PlanningInput, plan: GraduationPlan, changes: ScenarioChange[], curriculumSubjectId: number): PlacementTarget[] {
  if (input.start === null) return [];
  let latest = -1;
  for (const limit of input.limits) {
    const index = semesterIndex(input.start, limit);
    if (index !== null && index > latest) latest = index;
  }
  const length = Math.min(60, Math.max(plan.semesters.length + 1, latest + 1));
  return Array.from({ length }, (_, index) => {
    const semester = semesterAt(input.start, index);
    const check = checkPlacement(input, changes, curriculumSubjectId, semester);
    return { semester, label: labelOf(semester, index), ok: check.ok, reason: check.ok ? null : check.reason };
  });
}

/**
 * Saved changes that no longer apply (subject gone or passed, semester gone or now in the past, or a rule now broken)
 * are removed; for rules, the latest changes go first until the list holds.
 */
export function cleanChanges(input: PlanningInput, changes: ScenarioChange[]): { changes: ScenarioChange[]; dropped: number } {
  const known = new Set(input.subjects.map(s => s.curriculumSubjectId));
  const passed = new Set(input.passed);
  const usable = (id: number | undefined) => id === undefined || (known.has(id) && !passed.has(id));
  const semesterUsable = (c: ScenarioChange) => !c.semester || (!!configuredRow(input, c.semester) && semesterIndex(input.start, c.semester) !== null);
  const kept = changes.filter(c => usable(c.curriculumSubjectId) && usable(c.replacementId))
    // A fail / withdraw whose retake semester no longer applies keeps the change and loses only the retake's place.
    .flatMap(c => semesterUsable(c) ? [c] : retakeKinds.has(c.kind) ? withoutPin([c], c.curriculumSubjectId) : []);
  while (kept.length && !validateChanges(input, kept).ok) kept.pop();
  return { changes: kept, dropped: changes.length - kept.length };
}
