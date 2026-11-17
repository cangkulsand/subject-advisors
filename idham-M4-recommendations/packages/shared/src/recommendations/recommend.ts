import type { PlanCompletion, PlanningInput } from '../planning/contracts';
import { planBaseline, planningAnalysis } from '../planning/engine';
import { limitsFor, semesterAt, semesterLabel, semesterTypeOf } from '../planning/semesters';

/**
 * UC11/UC12 recommendations (M4). Ranks every valid combination for the next semester by planning the rest of the
 * degree around it with the M5 engine (UC11 BR6), then explains the choice and warns about subjects not to postpone.
 * Pure and deterministic; nothing is saved.
 */

export interface RecommendedSubject {
  curriculumSubjectId: number; subjectCode: string; subjectName: string; creditHours: number; compulsory: boolean;
  /** Why the subject matters, in words (UC12 BR5). */
  reasons: string[];
}
export interface RecommendationOption {
  subjects: RecommendedSubject[];
  credits: number;
  completion: PlanCompletion | null;
  /** Semesters later than the best option; 0 for the best one; null when either cannot complete. */
  differenceFromBest: number | null;
}
export interface BottleneckWarning { curriculumSubjectId: number; subjectCode: string; subjectName: string; message: string }
export interface Recommendations {
  status: 'READY' | 'NO_CANDIDATES' | 'DONE';
  semester: { label: string; semesterType: 'NORMAL' | 'SHORT'; maxSubjects: number; maxCredits: number } | null;
  best: RecommendationOption | null;
  alternatives: RecommendationOption[];
  warnings: BottleneckWarning[];
  assumptions: string[];
}

const ALTERNATIVES = 3;
const NEVER = Number.MAX_SAFE_INTEGER;

/** Every non-empty subset within the subject and credit limits (candidates are few: at most a few hundred sets). */
function combinations<T extends { creditHours: number }>(items: T[], maxSubjects: number, maxCredits: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, picked: T[], credits: number) => {
    if (picked.length) out.push(picked);
    if (picked.length === maxSubjects) return;
    for (let i = start; i < items.length; i++) {
      const item = items[i]!;
      if (credits + item.creditHours <= maxCredits) walk(i + 1, [...picked, item], credits + item.creditHours);
    }
  };
  walk(0, [], 0);
  return out;
}

export function recommend(input: PlanningInput): Recommendations {
  const analysis = planningAnalysis(input);
  const calendar = input.start !== null;
  const ref = semesterAt(input.start, 0);
  const type = semesterTypeOf(ref.semesterNo);
  const limits = limitsFor(ref, input.limits);
  const label = semesterLabel(ref, 1, calendar);
  const semester = { label, semesterType: type, maxSubjects: limits.maxSubjects, maxCredits: limits.maxCredits };
  const assumptions = [
    input.approvedFirst !== null
      ? `Only subjects your coordinator approved for ${label} are recommended.`
      : `Your coordinator has not approved subjects for ${label} yet, so these come from your curriculum, not the offering list.`,
    'Completion dates assume later semesters offer every subject in its semester type; they are not guaranteed.',
    'Following a recommendation does not register you for any subject. Save your picks on the Semester offerings page.',
    'If the offering list changes, reload this page to recalculate.',
  ];
  if (analysis.needed.length === 0) return { status: 'DONE', semester, best: null, alternatives: [], warnings: [], assumptions };

  const byId = new Map(input.subjects.map(s => [s.curriculumSubjectId, s]));
  const passed = new Set(input.passed);
  const depth = (id: number) => analysis.depth.get(id) ?? 1;
  const candidates = analysis.needed.map(id => byId.get(id)!)
    .filter(s => s.prerequisites.every(required => passed.has(required)))
    .filter(s => s.semesterTypes.length === 0 || s.semesterTypes.includes(type))
    .filter(s => input.approvedFirst === null || input.approvedFirst.includes(s.curriculumSubjectId))
    .filter(s => s.creditHours <= limits.maxCredits)
    .sort((left, right) => left.subjectCode.localeCompare(right.subjectCode));
  if (candidates.length === 0) {
    return { status: 'NO_CANDIDATES', semester, best: null, alternatives: [], warnings: [], assumptions };
  }

  const evaluate = (set: typeof candidates) => {
    const plan = planBaseline({ ...input, approvedFirst: set.map(s => s.curriculumSubjectId) });
    return {
      set,
      completion: plan.completion,
      rank: plan.completion?.index ?? NEVER,
      chain: set.reduce((n, s) => n + depth(s.curriculumSubjectId), 0),
      compulsory: set.filter(s => s.compulsory).length,
      credits: set.reduce((n, s) => n + s.creditHours, 0),
      key: set.map(s => s.subjectCode).join('+'),
    };
  };
  const ranked = combinations(candidates, limits.maxSubjects, limits.maxCredits).map(evaluate).sort((left, right) =>
    left.rank - right.rank || right.chain - left.chain || right.compulsory - left.compulsory || right.credits - left.credits || left.key.localeCompare(right.key));
  const nothing = evaluate([]);
  const best = ranked[0]!;

  const nextShortLabel = () => {
    for (let offset = 1; offset < 6; offset++) {
      const later = semesterAt(input.start, offset);
      if (later.semesterNo === 3) return semesterLabel(later, offset + 1, calendar);
    }
    return 'a later Short semester';
  };
  const reasonsFor = (id: number): string[] => {
    const s = byId.get(id)!;
    const reasons: string[] = [];
    const unlocks = analysis.unlocks.get(id) ?? 0;
    if (unlocks > 0) reasons.push(`Unlocks ${unlocks} later subject${unlocks === 1 ? '' : 's'}`);
    reasons.push(s.compulsory ? 'Compulsory' : `Counts toward ${s.category}`);
    if (s.semesterTypes.length === 1 && s.semesterTypes[0] === 'SHORT' && type === 'SHORT') reasons.push(`Short semester only: the next chance is ${nextShortLabel()}`);
    return reasons;
  };
  const option = (entry: typeof best): RecommendationOption => ({
    subjects: entry.set.map(s => ({ curriculumSubjectId: s.curriculumSubjectId, subjectCode: s.subjectCode, subjectName: s.subjectName, creditHours: s.creditHours, compulsory: s.compulsory, reasons: reasonsFor(s.curriculumSubjectId) })),
    credits: entry.credits,
    completion: entry.completion,
    differenceFromBest: entry.completion && best.completion ? entry.completion.index - best.completion.index : null,
  });

  const warnings: BottleneckWarning[] = [];
  for (const s of candidates) {
    if (depth(s.curriculumSubjectId) < 2) continue;
    const without = ranked.find(entry => !entry.set.includes(s)) ?? nothing;
    if (without.rank <= best.rank) continue;
    const to = without.completion?.label ?? 'a semester that cannot be planned yet';
    warnings.push({
      curriculumSubjectId: s.curriculumSubjectId, subjectCode: s.subjectCode, subjectName: s.subjectName,
      message: `If you do not take ${s.subjectCode} in ${label}, your earliest completion moves from ${best.completion?.label ?? '—'} to ${to}. ` +
        `This assumes later semesters offer every subject.`,
    });
  }

  return {
    status: 'READY', semester, best: option(best),
    alternatives: ranked.slice(1, 1 + ALTERNATIVES).map(option),
    warnings, assumptions,
  };
}
