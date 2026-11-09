import { describe, expect, it } from 'vitest';
import type { ForecastSubjectOption } from './contracts';
import { buildInitialDemand } from './initial-demand';
import { buildStudentEligibility } from './student-eligibility';
import type { EngineCurriculum, EngineStudent } from './engine/types';
import { createP002DemoCohort } from './p002-demo-fixture';
import type { CurriculumPrerequisiteExpression } from '../curriculum-reference';

const option: ForecastSubjectOption = { curriculumSubjectId: 10, curriculumId: 1, subjectId: 1, subjectCode: 'DEMO1000', subjectName: 'DEMO subject', creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true, exclusionReason: null, prerequisiteLinks: [], conditionalPrerequisites: { status: 'UNAVAILABLE', reason: 'No conditional prerequisite details are configured.' } };
const curriculum: EngineCurriculum = { curriculumId: 1, curriculumVersion: 'DEMO', catalogueFingerprint: 'DEMO', requirements: [], subjectSemesterRules: [], subjects: [option], totalCreditsRequired: 120 };
const student = (ref: string, completeness: EngineStudent['historyCompleteness'] = 'COMPLETE'): EngineStudent => ({ externalReference: ref, studentName: null, curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness: completeness, records: [] });
const target = { semesterId: 4, semesterType: 'NORMAL' as const, maxSubjects: 6, maxCredits: 20 };
const scope = { programmeId: 2, learningCentreId: 1, targetSemesterId: 4 };
const makeDemand = (students: EngineStudent[]) => buildInitialDemand({ scope, importBatchId: 9, sourceFingerprint: 'DEMO-fingerprint', snapshot: { students, rejectedRowsByStudent: {} }, curricula: [curriculum], target });
const makeOption = (overrides: Partial<ForecastSubjectOption> = {}): ForecastSubjectOption => ({ ...option, ...overrides });
const withOptions = (...subjects: ForecastSubjectOption[]): EngineCurriculum => ({ ...curriculum, subjects });
const record = (subjectId: number, status: EngineStudent['records'][number]['status'] = 'COMPLETED') => ({ subjectId, status, semesterId: 1, recognizedCredits: 3 });
const eligibleProjection = (studentInput: EngineStudent, options: EngineCurriculum, confirmedIds?: number[]) => buildStudentEligibility({ scope, confirmationId: 7, confirmationRevision: 1, confirmedAt: '2026-11-07T00:00:00Z', student: studentInput, curriculum: options, target,
  confirmedSubjects: (confirmedIds ?? options.subjects.map((item) => item.subjectId)).map((subjectId) => ({ subjectId, status: 'CONFIRMED' as const, confirmedOfferingId: subjectId + 10 })), rejectedRows: 0 });

describe('P002 backend projections', () => {
  it.each([[29, 'BELOW_THRESHOLD'], [30, 'QUALIFIED'], [31, 'QUALIFIED']] as const)('uses exact >=30 threshold (%i)', (n, outcome) => {
    expect(makeDemand(Array.from({ length: n }, (_, i) => student(`DEMO-${i}`))).subjects[0]).toMatchObject({ eligibleDistinctCount: n, outcome });
  });
  it('does not count unknown history, ambiguous duplicate identity, or capacity rules as demand blockers', () => {
    const duplicate = student('DEMO-duplicate');
    const res = makeDemand([...Array.from({ length: 29 }, (_, i) => student(`DEMO-${i}`)), student('DEMO-unknown', 'UNKNOWN'), duplicate, { ...duplicate, cohortStatus: 'INACTIVE' }]);
    expect(res.subjects[0]).toMatchObject({ eligibleDistinctCount: 29, uncertainDistinctCount: 2, outcome: 'UNCERTAIN' });
    expect(res.ambiguousDuplicateReferences).toBe(1);
  });
  it('student projection uses only current confirmed rows and returns a no-confirmation empty state', () => {
    const input = { scope, confirmationId: 7, confirmationRevision: 3, confirmedAt: '2026-11-07T00:00:00Z', student: student('DEMO-own'), curriculum, target,
      confirmedSubjects: [{ subjectId: 1, status: 'CONFIRMED' as const, confirmedOfferingId: 4 }, { subjectId: 2, status: 'WITHDRAWN' as const, confirmedOfferingId: 5 }], rejectedRows: 0 };
    expect(buildStudentEligibility(input).results).toEqual([{ subjectId: 1, subjectCode: 'DEMO1000', subjectName: 'DEMO subject', creditHours: 3, status: 'ELIGIBLE', explanation: 'Confirmed offering; recorded prerequisites and available evidence are satisfied.' }]);
    expect(buildStudentEligibility(null, scope)).toMatchObject({ state: 'NO_ACTIVE_CONFIRMATION', scope, results: [] });
  });
  it('confirmed revision is provenance, independent of later forecast run status', () => {
    const input = { scope, confirmationId: 7, confirmationRevision: 3, confirmedAt: '2026-11-07T00:00:00Z', student: student('DEMO-own'), curriculum, target,
      confirmedSubjects: [{ subjectId: 1, status: 'CONFIRMED' as const, confirmedOfferingId: 4 }], rejectedRows: 0 };
    expect(buildStudentEligibility(input)).toMatchObject({ confirmationId: 7, confirmationRevision: 3, state: 'AVAILABLE' });
  });

  it('deduplicates identical student references and makes conflicting duplicates uncertain', () => {
    const same = student('DEMO-same');
    const identical = makeDemand([same, { ...same }]);
    expect(identical).toMatchObject({ studentsInCohort: 1, subjects: [{ eligibleDistinctCount: 1 }] });
    const conflict = makeDemand([same, { ...same, cohortStatus: 'INACTIVE' }]);
    expect(conflict).toMatchObject({ studentsInCohort: 1, ambiguousDuplicateReferences: 1, subjects: [{ eligibleDistinctCount: 0, uncertainDistinctCount: 1 }] });
  });

  it.each(['COMPLETED', 'EXEMPTED'] as const)('keeps passed %s out of new demand', (status) => {
    expect(makeDemand([{ ...student('DEMO-passed'), records: [record(1, status)] }]).subjects[0]).toMatchObject({ eligibleDistinctCount: 0, passedCount: 1 });
  });

  it('treats failed/withdrawn representation as not passed but preserves in-progress uncertainty', () => {
    const failed = makeDemand([{ ...student('DEMO-failed'), records: [record(1, 'FAILED')] }]);
    expect(failed.subjects[0]).toMatchObject({ eligibleDistinctCount: 1, passedCount: 0 });
    const inProgress = makeDemand([{ ...student('DEMO-progress'), records: [record(1, 'IN_PROGRESS')] }]);
    expect(inProgress.subjects[0]).toMatchObject({ eligibleDistinctCount: 0, uncertainDistinctCount: 1 });
  });

  it('gates unmet corequisites from positive demand and student eligibility', () => {
    const coreq = makeOption({ prerequisiteLinks: [{ prerequisiteId: 1, curriculumSubjectId: 10, requiredCurriculumSubjectId: 11, requirementType: 'COREQUISITE' }] });
    const required = makeOption({ curriculumSubjectId: 11, subjectId: 2, subjectCode: 'DEMO2000' });
    const c = withOptions(coreq, required);
    expect(buildInitialDemand({ scope, importBatchId: 9, sourceFingerprint: 'DEMO', snapshot: { students: [student('DEMO-coreq')], rejectedRowsByStudent: {} }, curricula: [c], target }).subjects[0]).toMatchObject({ eligibleDistinctCount: 0, uncertainDistinctCount: 1 });
    expect(eligibleProjection(student('DEMO-coreq'), c).results[0]).toMatchObject({ status: 'CONDITIONAL', requiredConcurrentSubjectIds: [2] });
  });
  it('keeps a two-credit Normal subject out of both the student view and first filter without an explicit Normal rule', () => {
    const twoCredit = makeOption({ creditHours: 2 });
    const c = withOptions(twoCredit);
    expect(eligibleProjection(student('DEMO-two-credit'), c).results[0]).toMatchObject({ status: 'INELIGIBLE', reason: 'NOT_OFFERED' });
    expect(buildInitialDemand({ scope, importBatchId: 9, sourceFingerprint: 'DEMO', snapshot: { students: [student('DEMO-two-credit')], rejectedRowsByStudent: {} }, curricula: [c], target }).subjects[0]).toMatchObject({ eligibleDistinctCount: 0 });
  });
  it('does not emit conditional eligibility when another P002 guard remains uncertain', () => {
    const training = makeOption({ subjectCode: 'SECJ4114', prerequisiteLinks: [{ prerequisiteId: 1, curriculumSubjectId: 10, requiredCurriculumSubjectId: 11, requirementType: 'COREQUISITE' }] });
    const coreq = makeOption({ curriculumSubjectId: 11, subjectId: 2, subjectCode: 'DEMO2000' });
    const c = withOptions(training, coreq);
    expect(eligibleProjection(student('DEMO-training'), c).results[0]).toMatchObject({ status: 'UNCERTAIN', reasons: ['COREQUISITE_EVIDENCE_MISSING'] });
  });

  it('shows normalized mandatory course codes for actionable ineligible results', () => {
    const mandatory = makeOption({ prerequisiteLinks: [{ prerequisiteId: 1, curriculumSubjectId: 10, requiredCurriculumSubjectId: 11, requirementType: 'MANDATORY' }] });
    const required = makeOption({ curriculumSubjectId: 11, subjectId: 2, subjectCode: 'DEMO2000' });
    const result = eligibleProjection(student('DEMO-mandatory'), withOptions(mandatory, required), [1]).results[0]!;
    expect(result).toMatchObject({ status: 'INELIGIBLE', reason: 'PREREQUISITE_NOT_MET' });
    expect(result.explanation).toContain('Required courses: DEMO2000.');
  });

  it('does not turn topic-dependent or unrepresented free-text conditions into eligibility', () => {
    const topic = makeOption({ conditionalPrerequisites: { status: 'AVAILABLE', details: { expression: null, conditions: [], topicDependent: true, conditionNote: 'Prerequisite depends on special topic.' } } });
    const extraApproval = makeOption({ conditionalPrerequisites: { status: 'AVAILABLE', details: { expression: null, conditions: [], topicDependent: false, conditionNote: 'Lecturer approval required.' } } });
    for (const item of [topic, extraApproval]) {
      const c = withOptions(item);
      expect(buildInitialDemand({ scope, importBatchId: 9, sourceFingerprint: 'DEMO', snapshot: { students: [student('DEMO-text')], rejectedRowsByStudent: {} }, curricula: [c], target }).subjects[0]).toMatchObject({ eligibleDistinctCount: 0 });
      expect(eligibleProjection(student('DEMO-text'), c).results[0]).toMatchObject({ status: 'UNCERTAIN', reasons: ['PREREQUISITE_EVIDENCE_MISSING'] });
    }
  });

  it('applies structured prerequisite chains and nested alternatives under a descriptive exact note', () => {
    const expression: CurriculumPrerequisiteExpression = { operator: 'allOf', operands: [
      { operator: 'course', code: 'DEMO2000' },
      { operator: 'course', code: 'DEMO3000' },
      { operator: 'anyOf', operands: [{ operator: 'course', code: 'DEMO4000' }, { operator: 'course', code: 'DEMO5000' }] },
    ] };
    const targetOption = makeOption({ conditionalPrerequisites: { status: 'AVAILABLE', details: { expression, conditions: [], conditionNote: 'Prerequisites 4 and 5 are alternatives: DEMO4000 OR DEMO5000.' } } });
    const prerequisites = [2000, 3000, 4000, 5000].map((suffix, i) => makeOption({ curriculumSubjectId: 11 + i, subjectId: 2 + i, subjectCode: `DEMO${suffix}` }));
    const c = withOptions(targetOption, ...prerequisites);
    const hasAlternative = { ...student('DEMO-nested'), records: [record(2), record(3), record(4)] };
    expect(eligibleProjection(hasAlternative, c, [1]).results[0]).toMatchObject({ status: 'ELIGIBLE' });
    expect(eligibleProjection({ ...student('DEMO-nested-no-alt'), records: [record(2), record(3)] }, c, [1]).results[0]).toMatchObject({ status: 'INELIGIBLE', reason: 'PREREQUISITE_NOT_MET' });
  });

  it('keeps known credit and CGPA conditions authoritative without exposing personal CGPA', () => {
    const industrial = makeOption({ subjectCode: 'DEMO8000', conditionalPrerequisites: { status: 'AVAILABLE', details: {
      expression: null, conditions: [{ type: 'completedCredits', operator: '>', value: 92 }, { type: 'cgpa', operator: '>=', value: 2 }],
      conditionNote: 'Industrial training: more than 92 completed credits and CGPA at least 2.0.',
    } } });
    const c = withOptions(industrial);
    const sufficientCredits: EngineStudent = { ...student('DEMO-cgpa'), records: Array.from({ length: 31 }, (_, index) => ({ subjectId: 100 + index, status: 'COMPLETED', semesterId: 1, recognizedCredits: 3 })) };
    const result = eligibleProjection(sufficientCredits, c).results[0]!;
    expect(result).toMatchObject({ status: 'UNCERTAIN', reasons: ['CGPA_EVIDENCE_MISSING'] });
    expect(result.explanation).toContain('CGPA >= 2.0');
    expect(result.explanation).not.toContain('available student CGPA');
    expect(result.explanation).not.toMatch(/CGPA is [0-9]/i);
  });

  it('does not qualify excluded options and reports students whose curriculum is unavailable', () => {
    const excluded = makeOption({ includeInOfferingForecast: false, exclusionReason: 'not selected for forecast' });
    const result = buildInitialDemand({ scope, importBatchId: 9, sourceFingerprint: 'DEMO', snapshot: { students: [student('DEMO-known'), { ...student('DEMO-unresolved'), curriculumId: 99 }], rejectedRowsByStudent: {} }, curricula: [withOptions(excluded)], target });
    expect(result).toMatchObject({ qualifiedSubjectIds: [], unresolvedCurriculumStudents: 1, subjects: [{ excluded: true, outcome: 'BELOW_THRESHOLD', eligibleDistinctCount: 0 }] });
  });

  it('keeps semester exclusions and incomplete/rejected evidence out of supported demand', () => {
    const blocked = withOptions(option);
    blocked.subjectSemesterRules = [{ ruleId: 1, curriculumSubjectId: 10, semesterType: 'SHORT' }];
    const excluded = buildInitialDemand({ scope, importBatchId: 9, sourceFingerprint: 'DEMO', snapshot: { students: [student('DEMO-blocked')], rejectedRowsByStudent: {} }, curricula: [blocked], target });
    expect(excluded.subjects[0]!.eligibleDistinctCount).toBe(0);
    const partial = buildInitialDemand({ scope, importBatchId: 9, sourceFingerprint: 'DEMO', snapshot: { students: [student('DEMO-partial', 'PARTIAL')], rejectedRowsByStudent: { 'DEMO-partial': 1 } }, curricula: [curriculum], target });
    expect(partial.subjects[0]).toMatchObject({ eligibleDistinctCount: 0, uncertainDistinctCount: 1 });
  });

  it('provides a synthetic 50-student demo cohort with stable expected counts', () => {
    const { snapshot, expected } = createP002DemoCohort();
    expect(snapshot.students.map((item) => item.externalReference)).toEqual(expect.arrayContaining(['DEMO-P002-001', 'DEMO-P002-050']));
    expect(snapshot.students).toHaveLength(expected.cohort);
    const demand = makeDemand(snapshot.students);
    expect(demand).toMatchObject({ studentsInCohort: expected.cohort, subjects: [{ eligibleDistinctCount: expected.eligible, uncertainDistinctCount: expected.unknownHistory }] });
  });
});
