import { describe, expect, it } from 'vitest';
import { formatCurriculumPrerequisiteExpression, type CurriculumPrerequisiteExpression } from '../curriculum-reference';
import { evaluateOfferingEligibility, OFFERING_ELIGIBILITY_LABELS, type EligibilityHistory } from './eligibility';
import type { OfferingPrerequisites, OfferingSubject } from './offerings';

type Req = 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE';
const mk = (n: string, code: string, name: string, prerequisites?: OfferingPrerequisites): OfferingSubject =>
  ({ curriculumSubjectId: n, subjectId: `s${n}`, code, name, creditHours: 3, prerequisites });
const avail = (items: Array<[string, Req]>, details?: any): OfferingPrerequisites => ({
  status: 'available',
  items: items.map(([requiredCurriculumSubjectId, requirementType]) => ({ requiredCurriculumSubjectId, requirementType })),
  ...(details ? { details } : {}),
});
const A = mk('1', 'A001', 'Fictional A');
const C = mk('3', 'C001', 'Fictional C');
const E = mk('5', 'E001', 'Fictional E');
const G = mk('7', 'G001', 'Fictional G');
const H = mk('8', 'H001', 'Fictional H');
const B = mk('2', 'B001', 'Fictional B', avail([['1', 'MANDATORY']]));
const D = mk('4', 'D001', 'Fictional D', avail([['3', 'COREQUISITE']]));
const F = mk('6', 'F001', 'Fictional F', avail([['5', 'RECOMMENDED']]));
const catalogue = [A, B, C, D, E, F, G, H];
type Rec = [string, 'COMPLETED' | 'EXEMPTED' | 'FAILED' | 'WITHDRAWN', number?];
const hist = (...rs: Rec[]): EligibilityHistory =>
  ({ status: 'available', records: rs.map(([subjectId, status, recognizedCredits = 3]) => ({ subjectId, status, recognizedCredits })) });
const run = (subject: OfferingSubject, history: EligibilityHistory, picked: string[] = []) =>
  evaluateOfferingEligibility({ subject, catalogue, history, pickedCurriculumSubjectIds: picked });
const withDetails = (details: any, items: Array<[string, Req]> = []) => mk('9', 'X001', 'Fictional X', avail(items, details));
const cond = (type: string, operator: string, value: number) => ({ expression: null, conditionNote: null, conditions: [{ type, operator, value }] });

describe('evaluateOfferingEligibility', () => {
  it('is eligible with no requirements', () => {
    expect(run(A, hist())).toEqual({ curriculumSubjectId: '1', status: 'ELIGIBLE', reasons: [] });
  });

  it('checks mandatory prerequisites against history', () => {
    expect(run(B, hist(['s1', 'COMPLETED'])).status).toBe('ELIGIBLE');
    expect(run(B, hist(['s1', 'EXEMPTED'])).status).toBe('ELIGIBLE');
    const failed = run(B, hist(['s1', 'FAILED']));
    expect(failed.status).toBe('NOT_ELIGIBLE');
    expect(failed.reasons).toEqual([{ kind: 'MISSING_PREREQUISITE', blocking: true, message: 'Needs A001 Fictional A' }]);
    expect(run(B, hist(['s1', 'WITHDRAWN'])).status).toBe('NOT_ELIGIBLE');
    expect(run(B, hist()).status).toBe('NOT_ELIGIBLE');
  });

  it('asks to check when history is unavailable', () => {
    const r = run(B, { status: 'unavailable' });
    expect(r.status).toBe('CHECK');
    expect(r.reasons).toEqual([{ kind: 'HISTORY_UNAVAILABLE', blocking: false, message: 'Your academic records could not be loaded, so prerequisites were not checked.' }]);
    expect(run(A, { status: 'unavailable' }).status).toBe('ELIGIBLE');
  });

  it('asks to check when prerequisites are unavailable', () => {
    const r = run(mk('9', 'X001', 'X', { status: 'unavailable' }), hist());
    expect(r.status).toBe('CHECK');
    expect(r.reasons[0]?.kind).toBe('PREREQUISITES_UNAVAILABLE');
  });

  it('accepts a corequisite that is passed or picked', () => {
    const r = run(D, hist());
    expect(r.status).toBe('NOT_ELIGIBLE');
    expect(r.reasons).toEqual([{ kind: 'MISSING_COREQUISITE', blocking: true, message: 'Take C001 Fictional C in the same semester or complete it first' }]);
    expect(run(D, hist(), ['3']).status).toBe('ELIGIBLE');
    expect(run(D, hist(['s3', 'COMPLETED'])).status).toBe('ELIGIBLE');
  });

  it('keeps recommended subjects non-blocking', () => {
    const r = run(F, hist());
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reasons).toEqual([{ kind: 'RECOMMENDED', blocking: false, message: 'Recommended first: E001 Fictional E' }]);
    expect(run(F, hist(['s5', 'COMPLETED'])).reasons).toEqual([]);
  });

  it('checks completed credits', () => {
    const gt = withDetails(cond('completedCredits', '>', 80));
    const r = run(gt, hist(['s1', 'COMPLETED', 80]));
    expect(r.status).toBe('NOT_ELIGIBLE');
    expect(r.reasons).toEqual([{ kind: 'CREDITS', blocking: true, message: 'Needs more than 80 completed credits (you have 80)' }]);
    expect(run(gt, hist(['s1', 'COMPLETED', 81])).status).toBe('ELIGIBLE');
    expect(run(gt, hist(['s1', 'FAILED', 90])).status).toBe('NOT_ELIGIBLE');
    const ge = withDetails(cond('completedCredits', '>=', 80));
    expect(run(ge, hist(['s1', 'EXEMPTED', 80])).status).toBe('ELIGIBLE');
    expect(run(ge, hist(['s1', 'COMPLETED', 79])).status).toBe('NOT_ELIGIBLE');
  });

  it('flags CGPA and topic rules for checking', () => {
    const cg = run(withDetails(cond('cgpa', '>=', 2)), hist());
    expect(cg.status).toBe('CHECK');
    expect(cg.reasons).toEqual([{ kind: 'CGPA', blocking: false, message: 'Needs CGPA of at least 2; confirm with your coordinator' }]);
    const tp = run(withDetails({ expression: null, conditionNote: null, conditions: [], topicDependent: true }), hist());
    expect(tp.status).toBe('CHECK');
    expect(tp.reasons).toEqual([{ kind: 'TOPIC', blocking: false, message: 'Prerequisite depends on the chosen topic; confirm with your coordinator' }]);
    expect(run(withDetails(cond('cgpa', '>=', 2)), { status: 'unavailable' }).reasons.map(x => x.kind)).toEqual(['CGPA']);
  });

  it('evaluates imported expressions', () => {
    const expression: CurriculumPrerequisiteExpression = {
      operator: 'allOf',
      operands: [
        { operator: 'course', code: 'A001' },
        { operator: 'anyOf', operands: [{ operator: 'course', code: 'G001' }, { operator: 'course', code: 'H001' }] },
      ],
    };
    const s = withDetails({ expression, conditionNote: null, conditions: [] }, [['1', 'MANDATORY']]);
    const r = run(s, hist(['s1', 'COMPLETED']));
    expect(r.status).toBe('CHECK');
    expect(r.reasons).toEqual([{ kind: 'IMPORTED_RULE', blocking: false, message: 'Check with your coordinator: requires ' + formatCurriculumPrerequisiteExpression(expression) }]);
    expect(run(s, hist(['s1', 'COMPLETED'], ['s8', 'COMPLETED'])).status).toBe('ELIGIBLE');
  });

  it('lets blocking reasons win over check reasons', () => {
    expect(run(withDetails(cond('cgpa', '>=', 2), [['1', 'MANDATORY']]), hist()).status).toBe('NOT_ELIGIBLE');
  });

  it('has labels', () => {
    expect(OFFERING_ELIGIBILITY_LABELS).toEqual({ ELIGIBLE: 'Eligible', CHECK: 'Check with your coordinator', NOT_ELIGIBLE: 'Not eligible' });
  });
});
