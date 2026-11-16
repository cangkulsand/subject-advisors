import type {
  Bottleneck, GraduationPlan, MovedSubject, PlanComparison, PlanCompletion, PlannedSemester, PlannedSubject,
  PlanningInput, PlanningSubject, ScenarioChange, ScenarioChangeKind, UnplannedSubject,
} from './contracts';
import { limitsFor, semesterAt, semesterLabel, semesterTypeOf } from './semesters';

/**
 * UC14–UC16 planning engine (M5). Pure and deterministic: the same input and changes always give the same plan,
 * so the baseline and every what-if scenario come from this one function (UC16 BR3). It never touches records.
 */

const EMPTY_STREAK_LIMIT = 9;
const SEMESTER_GUARD = 60;
const BOTTLENECK_COUNT = 5;

interface Constraints {
  notBefore: Map<number, number>;
  failedIn: Map<number, number>;
  replaced: Map<number, number>;
  changeOf: Map<number, ScenarioChangeKind>;
}
const none = (): Constraints => ({ notBefore: new Map(), failedIn: new Map(), replaced: new Map(), changeOf: new Map() });

const normalise = (value: string) => value.trim().toUpperCase().replace(/[\s_]+/g, '_');

interface Needed { ids: Set<number>; electives: Map<number, NonNullable<PlannedSubject['electiveChoice']>>; noGroups: boolean }

/** Which unpassed subjects the student still has to take (design rule 2). */
function neededSubjects(input: PlanningInput, byId: Map<number, PlanningSubject>, passed: Set<number>, constraints: Constraints): Needed {
  const ids = new Set<number>();
  const electives = new Map<number, NonNullable<PlannedSubject['electiveChoice']>>();
  const unlocks = (id: number) => input.subjects.filter(s => !passed.has(s.curriculumSubjectId) && s.prerequisites.includes(id)).length;
  const unmetPrereqs = (s: PlanningSubject) => s.prerequisites.filter(id => !passed.has(id)).length;
  const forcedIn = new Set(constraints.replaced.values());
  let matchedAny = false;
  const inGroup = new Set<number>();
  for (const requirement of input.requirements) {
    const type = normalise(requirement.requirementType);
    const members = input.subjects.filter(s => type === 'COMPULSORY' ? s.compulsory : normalise(s.category) === type);
    if (members.length === 0) continue;
    matchedAny = true;
    for (const member of members) inGroup.add(member.curriculumSubjectId);
    const done = members.filter(s => passed.has(s.curriculumSubjectId));
    const needCount = requirement.requiredSubjects === null ? null : Math.max(0, requirement.requiredSubjects - done.length);
    const needCredits = requirement.requiredCredits === null ? null : Math.max(0, requirement.requiredCredits - done.reduce((n, s) => n + s.creditHours, 0));
    if (needCount === null && needCredits === null) continue;
    const pool = members
      .filter(s => !passed.has(s.curriculumSubjectId) && !constraints.replaced.has(s.curriculumSubjectId))
      .sort((left, right) => Number(forcedIn.has(right.curriculumSubjectId)) - Number(forcedIn.has(left.curriculumSubjectId))
        || unlocks(right.curriculumSubjectId) - unlocks(left.curriculumSubjectId)
        || unmetPrereqs(left) - unmetPrereqs(right)
        || left.subjectCode.localeCompare(right.subjectCode));
    const chosen: PlanningSubject[] = [];
    let credits = 0;
    for (const candidate of pool) {
      if ((needCount === null || chosen.length >= needCount) && (needCredits === null || credits >= needCredits)) break;
      chosen.push(candidate); credits += candidate.creditHours;
    }
    const options = pool.length + [...constraints.replaced.keys()].filter(id => members.some(m => m.curriculumSubjectId === id)).length;
    for (const pick of chosen) {
      ids.add(pick.curriculumSubjectId);
      if (chosen.length < options && !pick.compulsory) electives.set(pick.curriculumSubjectId, { requirementType: type, needed: needCount ?? chosen.length, options });
    }
  }
  for (const s of input.subjects) {
    if (passed.has(s.curriculumSubjectId)) continue;
    if (!matchedAny || (s.compulsory && !inGroup.has(s.curriculumSubjectId))) ids.add(s.curriculumSubjectId);
  }
  // Pull in unpassed MANDATORY prerequisites of anything included.
  const queue = [...ids];
  while (queue.length) {
    const subject = byId.get(queue.pop()!);
    for (const required of subject?.prerequisites ?? []) {
      if (!passed.has(required) && byId.has(required) && !ids.has(required)) { ids.add(required); queue.push(required); }
    }
  }
  return { ids, electives, noGroups: !matchedAny };
}

/** Longest chain of needed subjects starting at each needed subject, and the set each one unlocks. */
function chains(needed: Set<number>, subjects: PlanningSubject[]) {
  const children = new Map<number, number[]>();
  for (const s of subjects) {
    if (!needed.has(s.curriculumSubjectId)) continue;
    for (const required of s.prerequisites) if (needed.has(required)) children.set(required, [...(children.get(required) ?? []), s.curriculumSubjectId]);
  }
  const depth = new Map<number, number>();
  const next = new Map<number, number | null>();
  const visiting = new Set<number>();
  const visit = (id: number): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 1; // cycle guard: data error, treat as a leaf
    visiting.add(id);
    let best = 0, bestChild: number | null = null;
    for (const child of children.get(id) ?? []) { const d = visit(child); if (d > best) { best = d; bestChild = child; } }
    visiting.delete(id);
    depth.set(id, best + 1); next.set(id, bestChild);
    return best + 1;
  };
  const descendants = (id: number) => {
    const seen = new Set<number>(); const stack = [...(children.get(id) ?? [])];
    while (stack.length) { const c = stack.pop()!; if (!seen.has(c)) { seen.add(c); stack.push(...(children.get(c) ?? [])); } }
    return seen.size;
  };
  for (const id of needed) visit(id);
  return { depth, next, unlocks: new Map([...needed].map(id => [id, descendants(id)])) };
}

function plan(input: PlanningInput, constraints: Constraints): GraduationPlan {
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const passed = new Set(input.passed);
  const needed = neededSubjects(input, byId, passed, constraints);
  const { depth, next, unlocks } = chains(needed.ids, input.subjects);
  const calendar = input.start !== null;
  const order = [...needed.ids].map(id => byId.get(id)!).sort((left, right) =>
    depth.get(right.curriculumSubjectId)! - depth.get(left.curriculumSubjectId)!
    || unlocks.get(right.curriculumSubjectId)! - unlocks.get(left.curriculumSubjectId)!
    || Number(right.compulsory) - Number(left.compulsory)
    || left.subjectCode.localeCompare(right.subjectCode));
  const remainingCredits = order.reduce((n, s) => n + s.creditHours, 0);

  const toPlanned = (s: PlanningSubject, failedAttempt = false): PlannedSubject => ({
    curriculumSubjectId: s.curriculumSubjectId, subjectCode: s.subjectCode, subjectName: s.subjectName, creditHours: s.creditHours,
    category: s.category, compulsory: s.compulsory, electiveChoice: needed.electives.get(s.curriculumSubjectId) ?? null,
    change: constraints.changeOf.get(s.curriculumSubjectId) ?? null, failedAttempt,
  });

  const placedAt = new Map<number, number>();
  const semesters: PlannedSemester[] = [];
  let emptyStreak = 0;
  let usedDefaults = false;
  for (let index = 0; placedAt.size < order.length && emptyStreak < EMPTY_STREAK_LIMIT && index < SEMESTER_GUARD; index++) {
    const ref = semesterAt(input.start, index);
    const type = semesterTypeOf(ref.semesterNo);
    const limits = limitsFor(ref, input.limits);
    if (!limits.configured) usedDefaults = true;
    const subjects: PlannedSubject[] = [];
    let credits = 0;
    for (const [id, failedIndex] of constraints.failedIn) {
      const s = byId.get(id);
      if (failedIndex === index && s) { subjects.push(toPlanned(s, true)); credits += s.creditHours; }
    }
    const placedBefore = subjects.filter(s => !s.failedAttempt).length;
    for (const s of order) {
      if (subjects.length >= limits.maxSubjects) break;
      const id = s.curriculumSubjectId;
      if (placedAt.has(id) || credits + s.creditHours > limits.maxCredits) continue;
      if (s.semesterTypes.length > 0 && !s.semesterTypes.includes(type)) continue;
      if ((constraints.notBefore.get(id) ?? 0) > index) continue;
      if (index === 0 && input.approvedFirst !== null && !input.approvedFirst.includes(id)) continue;
      if (!s.prerequisites.every(required => passed.has(required) || (placedAt.get(required) ?? Infinity) < index)) continue;
      placedAt.set(id, index); subjects.push(toPlanned(s)); credits += s.creditHours;
    }
    emptyStreak = subjects.length > placedBefore ? 0 : emptyStreak + 1;
    semesters.push({ ...ref, index: index + 1, semesterType: type, label: semesterLabel(ref, index + 1, calendar), maxSubjects: limits.maxSubjects, maxCredits: limits.maxCredits, subjects, credits });
  }
  while (semesters.length && semesters.at(-1)!.subjects.length === 0) semesters.pop();

  const completionOf = (index: number): PlanCompletion => {
    const ref = semesterAt(input.start, index - 1);
    return { ...ref, index, label: semesterLabel(ref, index, calendar) };
  };
  const unplanned = order.filter(s => !placedAt.has(s.curriculumSubjectId)).map(s => unplannedReason(s, byId, placedAt, passed, input));
  const lastUsed = semesters.length;
  const status: GraduationPlan['status'] = order.length === 0 ? 'DONE' : unplanned.length ? 'INCOMPLETE' : 'PLANNED';

  return {
    status,
    remainingSubjects: order.length,
    remainingCredits,
    semesters,
    completion: status === 'PLANNED' ? completionOf(lastUsed) : null,
    earliest: order.length === 0 ? null : completionOf(earliestIndex(order, depth, input)),
    bottlenecks: bottlenecks(order, depth, next, unlocks, byId),
    unplanned,
    assumptions: assumptions(input, needed, usedDefaults, semesters[0]?.label ?? null),
  };
}

function unplannedReason(s: PlanningSubject, byId: Map<number, PlanningSubject>, placedAt: Map<number, number>, passed: Set<number>, input: PlanningInput): UnplannedSubject {
  const base = { curriculumSubjectId: s.curriculumSubjectId, subjectCode: s.subjectCode, subjectName: s.subjectName };
  const largest = Math.max(...(['NORMAL', 'SHORT'] as const)
    .filter(type => s.semesterTypes.length === 0 || s.semesterTypes.includes(type))
    .map(type => limitsFor({ academicYear: '', semesterNo: type === 'SHORT' ? 3 : 1 }, input.limits).maxCredits));
  if (s.creditHours > largest) return { ...base, reason: `Worth ${s.creditHours} credits, more than any semester allows.` };
  const blocked = s.prerequisites.find(id => !passed.has(id) && !placedAt.has(id));
  if (blocked !== undefined) return { ...base, reason: `Needs ${byId.get(blocked)?.subjectCode ?? 'a prerequisite'} first, which cannot be planned.` };
  return { ...base, reason: 'Could not be placed in any semester under the current limits.' };
}

/** Design rule 9: the larger of the longest chain and the capacity needed for what is left. */
function earliestIndex(order: PlanningSubject[], depth: Map<number, number>, input: PlanningInput): number {
  const chainBound = Math.max(...order.map(s => depth.get(s.curriculumSubjectId)!));
  const credits = order.reduce((n, s) => n + s.creditHours, 0);
  let subjects = 0, capacity = 0, index = 0;
  while ((subjects < order.length || capacity < credits) && index < SEMESTER_GUARD) {
    const limits = limitsFor(semesterAt(input.start, index), input.limits);
    subjects += limits.maxSubjects; capacity += limits.maxCredits; index++;
  }
  return Math.max(chainBound, index);
}

function bottlenecks(order: PlanningSubject[], depth: Map<number, number>, next: Map<number, number | null>, unlocks: Map<number, number>, byId: Map<number, PlanningSubject>): Bottleneck[] {
  return order
    .filter(s => depth.get(s.curriculumSubjectId)! >= 2)
    .sort((left, right) => depth.get(right.curriculumSubjectId)! - depth.get(left.curriculumSubjectId)!
      || unlocks.get(right.curriculumSubjectId)! - unlocks.get(left.curriculumSubjectId)!
      || left.subjectCode.localeCompare(right.subjectCode))
    .slice(0, BOTTLENECK_COUNT)
    .map(s => {
      const chain: string[] = [];
      for (let id: number | null | undefined = s.curriculumSubjectId; id !== null && id !== undefined && chain.length < 20; id = next.get(id)) chain.push(byId.get(id)!.subjectCode);
      const count = unlocks.get(s.curriculumSubjectId)!;
      return {
        curriculumSubjectId: s.curriculumSubjectId, subjectCode: s.subjectCode, subjectName: s.subjectName, unlocks: count, chain,
        explanation: `Delaying ${s.subjectCode} delays ${count} later subject${count === 1 ? '' : 's'} (${chain.join(' → ')}).`,
      };
    });
}

function assumptions(input: PlanningInput, needed: Needed, usedDefaults: boolean, firstLabel: string | null): string[] {
  const list = ['This plan is advice only. It does not register you for any subject and is not a guarantee.'];
  if (input.start === null) list.push('No current semester is set, so semesters are numbered from your next one.');
  if (firstLabel !== null) {
    list.push(input.approvedFirst !== null
      ? `${firstLabel} uses only the subjects your coordinator approved.`
      : `Your coordinator has not approved subjects for ${firstLabel} yet, so it assumes any subject can be offered.`);
  }
  list.push('Later semesters assume every subject is offered in the semester type it runs in.');
  if (usedDefaults) list.push('Some semesters have no configured limits, so the usual limits are used (Normal: 3 subjects, 10 credits; Short: 3 subjects, 6 credits).');
  if (needed.electives.size) list.push('Elective choices are examples: any option from the same elective group works.');
  if (needed.noGroups) list.push('No requirement groups are configured, so every remaining curriculum subject is included.');
  list.push('Co-requisites and recommended prerequisites are not checked.');
  return list;
}

/** UC14 baseline: the plan with no what-if changes. */
export function planBaseline(input: PlanningInput): GraduationPlan {
  return plan(input, none());
}

/**
 * UC15 scenario: the same engine with the student's what-if changes. Postpone, fail and withdraw keep the subject out
 * of the semester the baseline put it in (fail also keeps the failed attempt there). Replace swaps an elective choice
 * for another option of the same group. Changes to subjects the baseline does not plan are ignored.
 */
export function planScenario(input: PlanningInput, changes: ScenarioChange[]): GraduationPlan {
  const baseline = planBaseline(input);
  const position = new Map<number, number>();
  const groupOf = new Map<number, string>();
  baseline.semesters.forEach((semester, index) => semester.subjects.forEach(s => {
    position.set(s.curriculumSubjectId, index);
    if (s.electiveChoice) groupOf.set(s.curriculumSubjectId, s.electiveChoice.requirementType);
  }));
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const passed = new Set(input.passed);
  const constraints = none();
  const delays = new Map<number, number>();
  for (const change of changes) {
    const at = position.get(change.curriculumSubjectId);
    if (at === undefined) continue;
    if (change.kind === 'REPLACE') {
      const group = groupOf.get(change.curriculumSubjectId);
      const replacement = change.replacementId === undefined ? undefined : byId.get(change.replacementId);
      if (!group || !replacement || passed.has(replacement.curriculumSubjectId) || normalise(replacement.category) !== group) continue;
      constraints.replaced.set(change.curriculumSubjectId, replacement.curriculumSubjectId);
      constraints.changeOf.set(replacement.curriculumSubjectId, 'REPLACE');
      continue;
    }
    const steps = (delays.get(change.curriculumSubjectId) ?? 0) + 1;
    delays.set(change.curriculumSubjectId, steps);
    constraints.notBefore.set(change.curriculumSubjectId, at + steps);
    constraints.changeOf.set(change.curriculumSubjectId, change.kind);
    if (change.kind === 'FAIL') constraints.failedIn.set(change.curriculumSubjectId, at);
  }
  return plan(input, constraints);
}

/** UC16 comparison, computed only from the two engine results. */
export function comparePlans(baseline: GraduationPlan, scenario: GraduationPlan): PlanComparison {
  const where = (p: GraduationPlan) => {
    const map = new Map<number, { label: string; subject: PlannedSubject }>();
    for (const semester of p.semesters) for (const s of semester.subjects) if (!s.failedAttempt) map.set(s.curriculumSubjectId, { label: semester.label, subject: s });
    return map;
  };
  const before = where(baseline), after = where(scenario);
  const moved: MovedSubject[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const from = before.get(id), to = after.get(id);
    if (from?.label === to?.label) continue;
    const s = (to ?? from)!.subject;
    moved.push({ curriculumSubjectId: id, subjectCode: s.subjectCode, subjectName: s.subjectName, from: from?.label ?? null, to: to?.label ?? null });
  }
  moved.sort((left, right) => left.subjectCode.localeCompare(right.subjectCode));
  return {
    baseline: baseline.completion,
    scenario: scenario.completion,
    semesterDifference: baseline.completion && scenario.completion ? scenario.completion.index - baseline.completion.index : null,
    moved,
  };
}
