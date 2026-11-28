import type {
  Bottleneck, GraduationPlan, MovedSubject, PlanComparison, PlanCompletion, PlannedSemester, PlannedSubject,
  PlanningInput, PlanningSubject, ScenarioChange, ScenarioChangeKind, UnplannedSubject,
} from './contracts';
import { allowedSemesterTypes, limitsFor, semesterAt, semesterIndex, semesterLabel, semesterTypeOf } from './semesters';

/**
 * UC14–UC16 planning engine (M5). Pure and deterministic: the same input and changes always give the same plan,
 * so the baseline and every what-if scenario come from this one function (UC16 BR3). It never touches records.
 */

const EMPTY_STREAK_LIMIT = 9;
const SEMESTER_GUARD = 60;
const BOTTLENECK_COUNT = 5;

interface Constraints {
  notBefore: Map<number, number>;
  /** Semester indexes holding a failed attempt, per subject. */
  failedIn: Map<number, number[]>;
  replaced: Map<number, number>;
  changeOf: Map<number, ScenarioChangeKind>;
  /** Semester index each subject is pinned to (PLACE, or a moved retake). */
  pinned: Map<number, number>;
}
const none = (): Constraints => ({ notBefore: new Map(), failedIn: new Map(), replaced: new Map(), changeOf: new Map(), pinned: new Map() });
const copy = (c: Constraints): Constraints => ({
  notBefore: new Map(c.notBefore), failedIn: new Map([...c.failedIn].map(([id, list]) => [id, [...list]])),
  replaced: new Map(c.replaced), changeOf: new Map(c.changeOf), pinned: new Map(c.pinned),
});

/** Requirement type / category key: upper case, spaces and underscores alike ("Elective E1" = "ELECTIVE_E1"). */
export const normaliseRequirementType = (value: string) => value.trim().toUpperCase().replace(/[\s_]+/g, '_');
const normalise = normaliseRequirementType;

interface Needed { ids: Set<number>; electives: Map<number, NonNullable<PlannedSubject['electiveChoice']>>; noGroups: boolean }

/** Which unpassed subjects the student still has to take (design rule 2). */
function neededSubjects(input: PlanningInput, byId: Map<number, PlanningSubject>, passed: Set<number>, constraints: Constraints): Needed {
  const ids = new Set<number>();
  const electives = new Map<number, NonNullable<PlannedSubject['electiveChoice']>>();
  const unlocks = (id: number) => input.subjects.filter(s => !passed.has(s.curriculumSubjectId) && s.prerequisites.includes(id)).length;
  const unmetPrereqs = (s: PlanningSubject) => s.prerequisites.filter(id => !passed.has(id)).length;
  const forcedIn = new Set(constraints.replaced.values());
  // Compulsory subjects are always needed, whatever a group's threshold says (UC11 BR5; matches UC05 outstanding compulsory).
  for (const s of input.subjects) if (s.compulsory && !passed.has(s.curriculumSubjectId)) ids.add(s.curriculumSubjectId);
  let matchedAny = false;
  for (const requirement of input.requirements) {
    const type = normalise(requirement.requirementType);
    const members = input.subjects.filter(s => type === 'COMPULSORY' ? s.compulsory : normalise(s.category) === type);
    if (members.length === 0) continue;
    matchedAny = true;
    // Passed and compulsory members already count toward the group; only optional members are chosen.
    const counted = members.filter(s => passed.has(s.curriculumSubjectId) || s.compulsory);
    const needCount = requirement.requiredSubjects === null ? null : Math.max(0, requirement.requiredSubjects - counted.length);
    const needCredits = requirement.requiredCredits === null ? null : Math.max(0, requirement.requiredCredits - counted.reduce((n, s) => n + s.creditHours, 0));
    if (needCount === null && needCredits === null) continue;
    const optional = members.filter(s => !s.compulsory && !passed.has(s.curriculumSubjectId));
    const pool = optional
      .filter(s => !constraints.replaced.has(s.curriculumSubjectId))
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
    for (const pick of chosen) {
      ids.add(pick.curriculumSubjectId);
      if (chosen.length < optional.length) electives.set(pick.curriculumSubjectId, { requirementType: type, needed: needCount ?? chosen.length, options: optional.length });
    }
  }
  if (!matchedAny) for (const s of input.subjects) if (!passed.has(s.curriculumSubjectId)) ids.add(s.curriculumSubjectId);
  // Pull in unpassed MANDATORY prerequisites of anything included.
  const queue = [...ids];
  while (queue.length) {
    const subject = byId.get(queue.pop()!);
    for (const required of [...(subject?.prerequisites ?? []), ...(subject?.corequisites ?? [])]) {
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
  // Prerequisites of a pinned subject must be placed before the pin: give them a deadline and place them first.
  const deadline = new Map<number, number>();
  const setDeadline = (id: number, latest: number, guard: number) => {
    if (guard > 40 || (deadline.get(id) ?? Infinity) <= latest) return;
    deadline.set(id, latest);
    const subject = byId.get(id);
    for (const required of subject?.prerequisites ?? []) if (needed.ids.has(required)) setDeadline(required, latest - 1, guard + 1);
    for (const partner of subject?.corequisites ?? []) if (needed.ids.has(partner)) setDeadline(partner, latest, guard + 1);
  };
  for (const [id, index] of constraints.pinned) {
    const subject = byId.get(id);
    for (const required of subject?.prerequisites ?? []) if (needed.ids.has(required)) setDeadline(required, index - 1, 0);
    for (const partner of subject?.corequisites ?? []) if (needed.ids.has(partner)) setDeadline(partner, index, 0);
  }
  const order = [...needed.ids].map(id => byId.get(id)!).sort((left, right) =>
    (deadline.get(left.curriculumSubjectId) ?? Infinity) - (deadline.get(right.curriculumSubjectId) ?? Infinity)
    || depth.get(right.curriculumSubjectId)! - depth.get(left.curriculumSubjectId)!
    || unlocks.get(right.curriculumSubjectId)! - unlocks.get(left.curriculumSubjectId)!
    || Number(right.compulsory) - Number(left.compulsory)
    || left.subjectCode.localeCompare(right.subjectCode));
  const remainingCredits = order.reduce((n, s) => n + s.creditHours, 0);

  const toPlanned = (s: PlanningSubject, failedAttempt = false, pinned = false): PlannedSubject => ({
    curriculumSubjectId: s.curriculumSubjectId, subjectCode: s.subjectCode, subjectName: s.subjectName, creditHours: s.creditHours,
    category: s.category, compulsory: s.compulsory, electiveChoice: needed.electives.get(s.curriculumSubjectId) ?? null,
    change: constraints.changeOf.get(s.curriculumSubjectId) ?? null, failedAttempt, pinned,
  });

  const placedAt = new Map<number, number>();
  const semesters: PlannedSemester[] = [];
  let emptyStreak = 0;
  let usedDefaults = false;
  const waitUntil = Math.max(-1, ...constraints.pinned.values(), ...constraints.notBefore.values(), ...[...constraints.failedIn.values()].flat());
  for (let index = 0; placedAt.size < order.length && index < SEMESTER_GUARD && (emptyStreak < EMPTY_STREAK_LIMIT || index <= waitUntil); index++) {
    const ref = semesterAt(input.start, index);
    const type = semesterTypeOf(ref.semesterNo);
    const limits = limitsFor(ref, input.limits);
    if (!limits.configured) usedDefaults = true;
    const subjects: PlannedSubject[] = [];
    let credits = 0;
    for (const [id, failedIndexes] of constraints.failedIn) {
      const s = byId.get(id);
      if (s && failedIndexes.includes(index)) { subjects.push(toPlanned(s, true)); credits += s.creditHours; }
    }
    const placedBefore = subjects.filter(s => !s.failedAttempt).length;
    const bundleOf = (seed: PlanningSubject): PlanningSubject[] => {
      const bundle = [seed];
      const seen = new Set([seed.curriculumSubjectId]);
      for (let i = 0; i < bundle.length; i++) {
        for (const id of bundle[i]!.corequisites ?? []) {
          if (seen.has(id) || passed.has(id) || placedAt.has(id)) continue;
          const partner = byId.get(id);
          if (partner) { seen.add(id); bundle.push(partner); }
        }
      }
      return bundle;
    };
    const attempt = (seed: PlanningSubject): boolean => {
      const bundle = bundleOf(seed);
      if (subjects.length + bundle.length > limits.maxSubjects) return false;
      if (credits + bundle.reduce((n, member) => n + member.creditHours, 0) > limits.maxCredits) return false;
      const memberIds = new Set(bundle.map(member => member.curriculumSubjectId));
      for (const member of bundle) {
        if ((member.corequisites ?? []).some(id => !byId.has(id) && !passed.has(id))) return false;
        if (!allowedSemesterTypes(member).includes(type)) return false;
        const memberPin = constraints.pinned.get(member.curriculumSubjectId);
        if (memberPin !== undefined && memberPin !== index && (member !== seed || memberPin > index)) return false;
        if ((constraints.notBefore.get(member.curriculumSubjectId) ?? 0) > index) return false;
        if (index === 0 && input.approvedFirst !== null && !input.approvedFirst.includes(member.curriculumSubjectId)) return false;
        for (const required of member.prerequisites) {
          if (passed.has(required)) continue;
          if (memberIds.has(required)) return false;
          if ((placedAt.get(required) ?? Infinity) >= index) return false;
        }
      }
      for (const member of bundle) {
        placedAt.set(member.curriculumSubjectId, index);
        subjects.push(toPlanned(member, false, constraints.pinned.get(member.curriculumSubjectId) === index));
        credits += member.creditHours;
      }
      return true;
    };
    // Subjects the student placed in this semester go first. One whose rules are not met here falls back to normal placement.
    for (const s of order) {
      if (constraints.pinned.get(s.curriculumSubjectId) !== index || placedAt.has(s.curriculumSubjectId)) continue;
      attempt(s);
    }
    for (const s of order) {
      if (subjects.length >= limits.maxSubjects) break;
      const id = s.curriculumSubjectId;
      if (placedAt.has(id)) continue;
      const pin = constraints.pinned.get(id);
      if (pin !== undefined && index <= pin) continue;
      attempt(s);
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
  const largest = Math.max(...allowedSemesterTypes(s)
    .map(type => limitsFor({ academicYear: '', semesterNo: type === 'SHORT' ? 3 : 1 }, input.limits).maxCredits));
  if (s.creditHours > largest) return { ...base, reason: `Worth ${s.creditHours} credits, more than any semester allows.` };
  if ((s.corequisites ?? []).some(id => !byId.has(id) && !passed.has(id))) {
    return { ...base, reason: 'A co-requisite it needs is not part of this curriculum.' };
  }
  const blocked = s.prerequisites.find(id => !passed.has(id) && !placedAt.has(id));
  if (blocked !== undefined) return { ...base, reason: `Needs ${byId.get(blocked)?.subjectCode ?? 'a prerequisite'} first, which cannot be planned.` };
  const unplacedPartner = (s.corequisites ?? []).find(id => !passed.has(id) && byId.has(id) && !placedAt.has(id));
  if (unplacedPartner !== undefined) {
    return { ...base, reason: `Needs co-requisite ${byId.get(unplacedPartner)?.subjectCode ?? 'another subject'} in the same semester, which cannot be planned.` };
  }
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
      ? `${firstLabel} uses only the subjects your coordinator approved. Projects and industrial training need no approval.`
      : `${firstLabel} does not check the coordinator's offering decisions, so you may plan any subject. See Semester Offerings for what is offered next semester.`);
  }
  list.push('Later semesters assume every subject is offered in the semester type it runs in.');
  if (usedDefaults) list.push('Some semesters have no configured limits, so the usual limits are used (Normal: 3 subjects, 10 credits; Short: 3 subjects, 6 credits).');
  if (needed.electives.size) list.push('Elective choices are examples: any option from the same elective group works.');
  if (needed.noGroups) list.push('No requirement groups are configured, so every remaining curriculum subject is included.');
  list.push('Co-requisites are planned together or accepted from an earlier semester; recommended prerequisites are advisory only.');
  list.push('Only configured prerequisite, co-requisite, semester-type and load rules are checked. Additional FYP and industrial-training entry conditions must be confirmed with your coordinator.');
  if (input.subjects.some(s => s.semesterTypes.length === 0)) {
    list.push('A subject with 2 credit hours and no configured semester types is assumed to run in Short semesters, and other unconfigured subjects in either type; explicit semester types always apply.');
  }
  return list;
}

/**
 * What the baseline still needs, with each needed subject's critical-chain length (1 = nothing needed depends on it)
 * and how many needed subjects it unlocks. Used by UC11/UC12 recommendations to explain priorities.
 */
export function planningAnalysis(input: PlanningInput): { needed: number[]; depth: Map<number, number>; unlocks: Map<number, number> } {
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const needed = neededSubjects(input, byId, new Set(input.passed), none());
  const { depth, unlocks } = chains(needed.ids, input.subjects);
  return { needed: [...needed.ids].sort((a, b) => a - b), depth, unlocks };
}

/** UC14 baseline: the plan with no what-if changes. */
export function planBaseline(input: PlanningInput): GraduationPlan {
  return plan(input, none());
}

/**
 * UC15 scenario: the same engine with the student's what-if changes, applied one after another. Each change acts on
 * the plan as it stands after the earlier changes: postpone, fail and withdraw keep the subject out of the semester it
 * is currently in (fail also keeps the failed attempt there, using its slot and credits); replace swaps an elective
 * choice for another option of the same group. A change to a subject the current plan does not place is ignored.
 */
export function planScenario(input: PlanningInput, changes: ScenarioChange[]): GraduationPlan {
  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const passed = new Set(input.passed);
  let constraints = none();
  let current = plan(input, constraints);
  for (const change of changes) {
    let at: number | undefined, group: string | undefined;
    current.semesters.forEach((semester, index) => semester.subjects.forEach(s => {
      if (s.curriculumSubjectId !== change.curriculumSubjectId || s.failedAttempt) return;
      at = index; group = s.electiveChoice?.requirementType;
    }));
    if (at === undefined) continue;
    const next = copy(constraints);
    if (change.kind === 'REPLACE') {
      const replacement = change.replacementId === undefined ? undefined : byId.get(change.replacementId);
      if (!group || !replacement || replacement.compulsory || passed.has(replacement.curriculumSubjectId) || normalise(replacement.category) !== group) continue;
      next.replaced.set(change.curriculumSubjectId, replacement.curriculumSubjectId);
      next.changeOf.set(replacement.curriculumSubjectId, 'REPLACE');
    } else if (change.kind === 'PLACE') {
      const index = change.semester ? semesterIndex(input.start, change.semester) : null;
      if (index === null) continue;
      next.pinned.set(change.curriculumSubjectId, index);
      next.notBefore.delete(change.curriculumSubjectId);
      next.changeOf.set(change.curriculumSubjectId, 'PLACE');
    } else {
      next.notBefore.set(change.curriculumSubjectId, at + 1);
      const retake = change.semester && change.kind !== 'POSTPONE' ? semesterIndex(input.start, change.semester) : null;
      if (retake !== null && retake > at) next.pinned.set(change.curriculumSubjectId, retake);
      else next.pinned.delete(change.curriculumSubjectId);
      next.changeOf.set(change.curriculumSubjectId, change.kind);
      if (change.kind === 'FAIL') next.failedIn.set(change.curriculumSubjectId, [...(next.failedIn.get(change.curriculumSubjectId) ?? []), at]);
    }
    constraints = next;
    current = plan(input, constraints);
  }
  return current;
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
