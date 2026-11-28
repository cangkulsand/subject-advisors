/**
 * Curriculum credit check (S3-P004-044), warning only. The minimum path to graduate is the compulsory credits plus, for each
 * requirement group, the fewest extra credits of optional subjects in that group that meet its subject count and credits.
 * Groups match subjects by category with the progress-page rule: upper case, spaces and underscores alike.
 */
export interface CreditCheckSubject { code: string; credits: number; category: string; compulsory: boolean }
export interface CreditCheckRequirement { type: string; credits: number | null; subjects: number | null }
export interface CreditCheckGroup { type: string; label: string; extra: number; unmet: string | null }
export interface CreditCheck {
  total: number | null; compulsory: number; groups: CreditCheckGroup[]; minimum: number;
  status: 'MATCHES' | 'SHORT' | 'OVER' | 'NOT_SET'; difference: number; summary: string;
}

const key = (value: string) => value.trim().toUpperCase().replace(/[\s_]+/g, '_');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Fewest extra credits from `optional` so that `count + picked >= needCount` and `credits + sum >= needCredits`; null when impossible. */
function cheapestExtra(optional: number[], count: number, credits: number, needCount: number | null, needCredits: number | null): number | null {
  // reachable[k] = the credit sums reachable by picking exactly k optional subjects.
  let reachable: Set<number>[] = [new Set([0])];
  for (const value of optional) {
    const next = reachable.map(sums => new Set(sums));
    reachable.forEach((sums, k) => { for (const sum of sums) (next[k + 1] ??= new Set()).add(sum + value); });
    reachable = next;
  }
  let best: number | null = null;
  reachable.forEach((sums, k) => {
    if (needCount !== null && count + k < needCount) return;
    for (const sum of sums) if ((needCredits === null || credits + sum >= needCredits) && (best === null || sum < best)) best = sum;
  });
  return best;
}

export function creditCheck(subjects: CreditCheckSubject[], requirements: CreditCheckRequirement[], totalCredits: number | null): CreditCheck {
  const compulsory = subjects.filter(s => s.compulsory).reduce((n, s) => n + s.credits, 0);
  const groups = requirements.map((requirement): CreditCheckGroup => {
    const members = subjects.filter(s => key(s.category) === key(requirement.type));
    const name = members[0]?.category.trim() || requirement.type;
    const needs = [requirement.subjects !== null ? plural(requirement.subjects, 'subject', 'subjects') : '', requirement.credits !== null ? plural(requirement.credits, 'credit', 'credits') : ''].filter(Boolean);
    const label = needs.length ? `${name} (${needs.join(', ')})` : name;
    const fixed = members.filter(s => s.compulsory);
    const fixedCredits = fixed.reduce((n, s) => n + s.credits, 0);
    const extra = cheapestExtra(members.filter(s => !s.compulsory).map(s => s.credits), fixed.length, fixedCredits, requirement.subjects, requirement.credits);
    if (extra !== null) return { type: requirement.type, label, extra, unmet: null };
    const available = members.reduce((n, s) => n + s.credits, 0);
    const unmet = requirement.subjects !== null && members.length < requirement.subjects
      ? `${name} needs ${plural(requirement.subjects, 'subject', 'subjects')}; only ${members.length} ${members.length === 1 ? 'is' : 'are'} available.`
      : `${name} needs ${plural(requirement.credits ?? 0, 'credit', 'credits')}; only ${available} ${available === 1 ? 'is' : 'are'} available.`;
    return { type: requirement.type, label, extra: members.filter(s => !s.compulsory).reduce((n, s) => n + s.credits, 0), unmet };
  });
  const minimum = compulsory + groups.reduce((n, g) => n + g.extra, 0);
  if (totalCredits === null || totalCredits <= 0) return { total: null, compulsory, groups, minimum, status: 'NOT_SET', difference: 0, summary: 'Total credit requirement is not set.' };
  const difference = Math.abs(minimum - totalCredits);
  const status = minimum === totalCredits ? 'MATCHES' : minimum < totalCredits ? 'SHORT' : 'OVER';
  const summary = status === 'MATCHES' ? 'Matches' : `${status === 'SHORT' ? 'Short' : 'Over'} by ${plural(difference, 'credit', 'credits')}`;
  return { total: totalCredits, compulsory, groups, minimum, status, difference, summary };
}
