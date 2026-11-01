import { describe, expect, it } from 'vitest';
import type { ClassType, ForecastSubjectOption, HistoryCompleteness } from '../contracts';
import { allocateSections, evenSplit, resolveCapacityRule } from './capacity';
import { isNearGraduation } from './policy';
import { ENGINE_VERSION, runForecastEngine } from './forecast';
import type { EngineCapacityRule, EngineCurriculum, EngineRecord, EngineStudent, ForecastEngineInput } from './types';

const LAB_RULE: EngineCapacityRule = { capacityRuleId: 1, classType: 'LAB', minimumEnrollment: 15, breakEvenTarget: 25, normalMaximum: 35, exceptionMaximum: null, isActive: true };
const LECTURE_RULE: EngineCapacityRule = { capacityRuleId: 2, classType: 'LECTURE', minimumEnrollment: 15, breakEvenTarget: 25, normalMaximum: 45, exceptionMaximum: null, isActive: true };

function subject(id: number, code: string, classType: ClassType, extra: Partial<ForecastSubjectOption> = {}): ForecastSubjectOption {
  return {
    curriculumSubjectId: id * 10, curriculumId: 1, subjectId: id, subjectCode: code, subjectName: `Subject ${code}`, creditHours: 3, classType,
    includeInOfferingForecast: true, exclusionReason: null, prerequisiteLinks: [],
    conditionalPrerequisites: { status: 'UNAVAILABLE', reason: 'not loaded' }, ...extra,
  };
}
function curriculum(subjects: ForecastSubjectOption[], extra: Partial<EngineCurriculum> = {}): EngineCurriculum {
  return { curriculumId: 1, curriculumVersion: '2024', catalogueFingerprint: 'x', requirements: [], subjectSemesterRules: [], subjects, totalCreditsRequired: 120, ...extra };
}
function student(ref: string, records: EngineRecord[] = [], extra: Partial<EngineStudent> = {}): EngineStudent {
  return { externalReference: ref, studentName: null, curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE', records, ...extra };
}
const rec = (subjectId: number, status: EngineRecord['status'], recognizedCredits: number | null = null): EngineRecord => ({ subjectId, status, semesterId: null, recognizedCredits });
const many = (count: number, make: (i: number) => EngineStudent): EngineStudent[] => Array.from({ length: count }, (_, i) => make(i));

function input(students: EngineStudent[], subjects: ForecastSubjectOption[], extra: Partial<ForecastEngineInput> = {}, cur: Partial<EngineCurriculum> = {}): ForecastEngineInput {
  return {
    scope: { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 },
    target: { semesterId: 2, semesterType: 'NORMAL', maxSubjects: 6, maxCredits: 20 },
    snapshot: { students, rejectedRowsByStudent: {} },
    curricula: [curriculum(subjects, cur)],
    capacityRules: [LAB_RULE, LECTURE_RULE],
    ...extra,
  };
}
const demandOf = (result: ReturnType<typeof runForecastEngine>, subjectId: number) => result.demands.find((d) => d.subjectId === subjectId)!;
const A = subject(1, 'AAAA1000', 'LECTURE');

describe('section allocation examples', () => {
  it('splits 46 lecture students into 23 + 23', () => {
    const result = runForecastEngine(input(many(46, (i) => student(`s${i}`)), [A]));
    expect(demandOf(result, 1).sections.map((s) => s.expectedStudents)).toEqual([23, 23]);
  });
  it('splits 71 lab students into 24 + 24 + 23', () => {
    const lab = subject(3, 'LABB1000', 'LAB');
    const result = runForecastEngine(input(many(71, (i) => student(`s${i}`)), [lab]));
    expect(demandOf(result, 3).sections.map((s) => s.expectedStudents)).toEqual([24, 24, 23]);
  });
  it('keeps one section of 14 below the minimum of 15 without cancelling', () => {
    const result = runForecastEngine(input(many(14, (i) => student(`s${i}`)), [A]));
    const [section] = demandOf(result, 1).sections;
    expect(section).toMatchObject({ expectedStudents: 14, flags: ['BELOW_MINIMUM', 'BELOW_OPTIMAL'], reviewStatus: 'PENDING', capacityRuleId: 2 });
    expect(result.summary.sectionsBelowMinimum).toBe(1);
  });
  it('flags only BELOW_OPTIMAL between minimum and break-even, and none at 25', () => {
    expect(allocateSections(20, LECTURE_RULE)[0]?.flags).toEqual(['BELOW_OPTIMAL']);
    expect(allocateSections(25, LECTURE_RULE)[0]?.flags).toEqual([]);
  });
  it('never fills past the normal maximum or into the exception maximum', () => {
    const rule = { ...LECTURE_RULE, exceptionMaximum: 50 };
    expect(allocateSections(45, rule).map((s) => s.expectedStudents)).toEqual([45]);
    expect(allocateSections(46, rule).every((s) => s.expectedStudents <= 45)).toBe(true);
    expect(allocateSections(0, rule)).toEqual([]);
  });
  it('preserves the total for every demand size', () => {
    for (let d = 1; d <= 300; d += 1) {
      const split = evenSplit(d, 35);
      expect(split.reduce((a, b) => a + b, 0)).toBe(d);
      expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
      expect(Math.max(...split)).toBeLessThanOrEqual(35);
    }
  });
  it('reports zero supported demand with uncertainty as INSUFFICIENT_DATA and proposes no sections', () => {
    const students = many(5, (i) => student(`s${i}`, [], { historyCompleteness: 'UNKNOWN' }));
    const demand = demandOf(runForecastEngine(input(students, [A])), 1);
    expect(demand).toMatchObject({ supportedDemand: 0, uncertainCount: 5, qualityStatus: 'INSUFFICIENT_DATA', insufficientData: true, sections: [] });
  });
});

describe('capacity resolver', () => {
  it('resolves by class type from global rules', () => {
    expect(resolveCapacityRule({ subjectId: 1, classType: 'LAB' }, 1, [LAB_RULE, LECTURE_RULE])).toMatchObject({ status: 'CONFIGURED', rule: { capacityRuleId: 1 }, matchedScope: 'GLOBAL' });
  });
  it('requires configuration for a NULL class type, a missing, an inactive, an ambiguous or an invalid rule', () => {
    expect(resolveCapacityRule({ subjectId: 1, classType: null }, 1, [LAB_RULE])).toMatchObject({ issue: 'CLASS_TYPE_MISSING' });
    expect(resolveCapacityRule({ subjectId: 1, classType: 'LECTURE' }, 1, [LAB_RULE])).toMatchObject({ issue: 'NO_ACTIVE_CAPACITY_RULE' });
    expect(resolveCapacityRule({ subjectId: 1, classType: 'LAB' }, 1, [{ ...LAB_RULE, isActive: false }])).toMatchObject({ issue: 'NO_ACTIVE_CAPACITY_RULE' });
    expect(resolveCapacityRule({ subjectId: 1, classType: 'LAB' }, 1, [LAB_RULE, { ...LAB_RULE, capacityRuleId: 9 }])).toMatchObject({ issue: 'AMBIGUOUS_CAPACITY_RULE' });
    expect(resolveCapacityRule({ subjectId: 1, classType: 'LAB' }, 1, [{ ...LAB_RULE, normalMaximum: 0 }])).toMatchObject({ issue: 'INVALID_CAPACITY_RULE' });
  });
  it('prefers subject+centre over centre over global when richer rules exist', () => {
    const centre = { ...LECTURE_RULE, capacityRuleId: 10, scopeKind: 'CENTRE' as const, learningCentreId: 1, normalMaximum: 40 };
    const specific = { ...LECTURE_RULE, capacityRuleId: 11, scopeKind: 'SUBJECT_CENTRE' as const, learningCentreId: 1, subjectId: 7, normalMaximum: 30 };
    const rules = [LECTURE_RULE, centre, specific];
    expect(resolveCapacityRule({ subjectId: 7, classType: 'LECTURE' }, 1, rules)).toMatchObject({ matchedScope: 'SUBJECT_CENTRE', rule: { capacityRuleId: 11 } });
    expect(resolveCapacityRule({ subjectId: 8, classType: 'LECTURE' }, 1, rules)).toMatchObject({ matchedScope: 'CENTRE', rule: { capacityRuleId: 10 } });
    expect(resolveCapacityRule({ subjectId: 8, classType: 'LECTURE' }, 2, rules)).toMatchObject({ matchedScope: 'GLOBAL' });
  });
  it('limits CONFIGURATION_REQUIRED to the affected subject', () => {
    const noType = subject(5, 'NNNN1000', null);
    const result = runForecastEngine(input(many(30, (i) => student(`s${i}`)), [A, noType]));
    expect(demandOf(result, 5)).toMatchObject({ configurationStatus: 'CONFIGURATION_REQUIRED', configurationIssue: 'CLASS_TYPE_MISSING', supportedDemand: 30, sections: [] });
    expect(demandOf(result, 1)).toMatchObject({ configurationStatus: 'CONFIGURED' });
    expect(demandOf(result, 1).sections).toHaveLength(1);
    expect(result.summary.configurationRequiredSubjects).toBe(1);
  });
});

describe('eligibility', () => {
  it('skips subjects already COMPLETED or EXEMPTED and counts each student once', () => {
    const students = [student('a', [rec(1, 'COMPLETED')]), student('b', [rec(1, 'EXEMPTED', 3)]), student('c', [rec(1, 'FAILED'), rec(1, 'FAILED')]), student('d')];
    const demand = demandOf(runForecastEngine(input(students, [A])), 1);
    expect(demand.supportedDemand).toBe(2);
    expect(demand.breakdown).toMatchObject({ inCurriculum: 4, alreadyPassed: 2, supported: 2 });
  });
  it('treats a pass after a failure as passed (retake policy v1) and records it', () => {
    const demand = demandOf(runForecastEngine(input([student('a', [rec(1, 'FAILED'), rec(1, 'COMPLETED')])], [A])), 1);
    expect(demand.supportedDemand).toBe(0);
    expect(demand.breakdown).toMatchObject({ alreadyPassed: 1, retakeResolvedAsPassed: 1 });
  });
  it('detects an unresolved retake: failed then in progress, or in progress alone', () => {
    const demand = demandOf(runForecastEngine(input([student('a', [rec(1, 'FAILED'), rec(1, 'IN_PROGRESS')]), student('b', [rec(1, 'IN_PROGRESS')])], [A])), 1);
    expect(demand).toMatchObject({ supportedDemand: 0, uncertainCount: 2, uncertaintyReasons: ['RETAKE_OUTCOME_UNRESOLVED'] });
  });
  describe('Normal/Short offering rule (subject_semester_rule)', () => {
    const shortOnly = subject(6, 'SSSS1000', 'LECTURE');
    const normalOnly = subject(7, 'NNNN1000', 'LECTURE');
    const projectI = subject(8, 'SECJ3032', 'LECTURE');
    const cur = {
      subjectSemesterRules: [
        { ruleId: 1, curriculumSubjectId: 60, semesterType: 'SHORT' as const },
        { ruleId: 2, curriculumSubjectId: 70, semesterType: 'NORMAL' as const },
        { ruleId: 3, curriculumSubjectId: 80, semesterType: 'NORMAL' as const },
      ],
    };
    const shortTarget = { target: { semesterId: 3, semesterType: 'SHORT' as const, maxSubjects: 3, maxCredits: 10 } };
    const students = many(20, (i) => student(`s${i}`));
    const subjects = [A, shortOnly, normalOnly, projectI];

    it('a Normal target excludes Short-only subjects: no demand, no sections, not in totals, with a reason', () => {
      const result = runForecastEngine(input(students, subjects, {}, cur));
      expect(demandOf(result, 6)).toMatchObject({
        semesterTypeExcluded: true, semesterTypeExclusionReason: 'Runs only in Short semesters', excluded: false, configurationStatus: 'EXCLUDED',
        forecastCount: null, supportedDemand: 0, uncertainCount: 0, sections: [], breakdown: { notOfferedInSemesterType: 20, supported: 0 },
      });
      for (const id of [1, 7, 8]) expect(demandOf(result, id)).toMatchObject({ semesterTypeExcluded: false, supportedDemand: 20, configurationStatus: 'CONFIGURED' });
      expect(result.summary).toMatchObject({ subjects: 4, excludedSubjects: 0, notOfferedInSemesterTypeSubjects: 1, totalSupportedDemand: 60 });
      expect(result.originalRecommendations.map((r) => r.subjectId)).toEqual([1, 7, 8]);
      expect(result.ruleSnapshot.semesterTypeExclusions).toEqual([{ subjectId: 6, offeredIn: ['SHORT'], reason: 'Runs only in Short semesters' }]);
    });
    it('a Short target excludes Normal-only subjects and Project I (Normal only)', () => {
      const result = runForecastEngine(input(students, subjects, shortTarget, cur));
      expect(demandOf(result, 6)).toMatchObject({ semesterTypeExcluded: false, supportedDemand: 20, forecastCount: 20 });
      for (const id of [7, 8]) {
        expect(demandOf(result, id)).toMatchObject({ semesterTypeExcluded: true, semesterTypeExclusionReason: 'Runs only in Normal semesters', forecastCount: null, sections: [] });
      }
      expect(demandOf(result, 8).subjectCode).toBe('SECJ3032');
      expect(result.summary).toMatchObject({ notOfferedInSemesterTypeSubjects: 2, totalSupportedDemand: 40 });
    });
    it('keeps a subject with no rule rows unrestricted in both semester types', () => {
      expect(demandOf(runForecastEngine(input(students, subjects, {}, cur)), 1).semesterTypeExcluded).toBe(false);
      expect(demandOf(runForecastEngine(input(students, subjects, shortTarget, cur)), 1)).toMatchObject({ semesterTypeExcluded: false, supportedDemand: 20 });
      const none = runForecastEngine(input(students, [A, shortOnly]));
      expect(none.summary.notOfferedInSemesterTypeSubjects).toBe(0);
      expect(none.ruleSnapshot.semesterTypeExclusions).toEqual([]);
    });
    it('does not exclude a subject that another curriculum leaves unrestricted, but counts the restricted students as not offered', () => {
      const second = curriculum([{ ...shortOnly, curriculumId: 2, curriculumSubjectId: 600 }], { curriculumId: 2, subjectSemesterRules: [] });
      const base = input([...students, student('z1', [], { curriculumId: 2 })], [shortOnly], {}, { subjectSemesterRules: [cur.subjectSemesterRules[0]!] });
      const result = runForecastEngine({ ...base, curricula: [...base.curricula, second] });
      expect(demandOf(result, 6)).toMatchObject({ semesterTypeExcluded: false, supportedDemand: 1, breakdown: { notOfferedInSemesterType: 20 } });
    });
    it('changes the rule snapshot fingerprint when the rules change, and carries the bumped engine version', () => {
      const withRules = runForecastEngine(input(students, subjects, {}, cur));
      const without = runForecastEngine(input(students, subjects));
      expect(withRules.ruleSnapshot.catalogueFingerprint).not.toBe(without.ruleSnapshot.catalogueFingerprint);
      expect(withRules.engineVersion).toBe('uc20-engine-1.1.0');
    });
  });
  it('keeps excluded subjects visible with no sections', () => {
    const fyp = subject(4, 'FYPP4000', null, { includeInOfferingForecast: false, exclusionReason: 'Final year project' });
    const result = runForecastEngine(input(many(10, (i) => student(`s${i}`)), [A, fyp]));
    expect(demandOf(result, 4)).toMatchObject({ excluded: true, exclusionReason: 'Final year project', configurationStatus: 'EXCLUDED', sections: [], forecastCount: null, supportedDemand: 10 });
    expect(result.ruleSnapshot.exclusions).toEqual([{ subjectId: 4, reason: 'Final year project', effectiveFromSemesterId: 2, effectiveToSemesterId: null }]);
    expect(result.summary).toMatchObject({ excludedSubjects: 1, notOfferedInSemesterTypeSubjects: 0 });
    expect(result.summary.totalSupportedDemand).toBe(10);
  });
});

describe('mandatory prerequisites', () => {
  const B = subject(2, 'BBBB2000', 'LECTURE', { prerequisiteLinks: [
    { prerequisiteId: 1, curriculumSubjectId: 20, requiredCurriculumSubjectId: 10, requirementType: 'MANDATORY' },
    { prerequisiteId: 2, curriculumSubjectId: 20, requiredCurriculumSubjectId: 10, requirementType: 'RECOMMENDED' },
  ] });
  it('is satisfied by COMPLETED or EXEMPTED evidence', () => {
    const demand = demandOf(runForecastEngine(input([student('a', [rec(1, 'COMPLETED')]), student('b', [rec(1, 'EXEMPTED', 3)])], [A, B])), 2);
    expect(demand.supportedDemand).toBe(2);
  });
  it('is not met when a complete history lacks the prerequisite or it was failed', () => {
    const demand = demandOf(runForecastEngine(input([student('a'), student('b', [rec(1, 'FAILED')])], [A, B])), 2);
    expect(demand).toMatchObject({ supportedDemand: 0, uncertainCount: 0, breakdown: { prerequisiteNotMet: 2 } });
  });
  it('is uncertain for an in-progress prerequisite', () => {
    const demand = demandOf(runForecastEngine(input([student('a', [rec(1, 'IN_PROGRESS')])], [A, B])), 2);
    expect(demand).toMatchObject({ supportedDemand: 0, uncertainCount: 1, uncertaintyReasons: ['PREREQUISITE_EVIDENCE_MISSING'] });
  });
  it('is uncertain, not unmet, when history is partial and the prerequisite is not on record', () => {
    const demand = demandOf(runForecastEngine(input([student('a', [], { historyCompleteness: 'PARTIAL' })], [A, B])), 2);
    expect(demand.uncertaintyReasons).toEqual(['HISTORY_PARTIAL', 'PREREQUISITE_EVIDENCE_MISSING']);
    expect(demand.supportedDemand).toBe(0);
  });
  it('keeps a recorded pass reliable even with a partial history', () => {
    const demand = demandOf(runForecastEngine(input([student('a', [rec(1, 'COMPLETED')], { historyCompleteness: 'PARTIAL' })], [A, B])), 2);
    expect(demand).toMatchObject({ supportedDemand: 0, uncertainCount: 1, uncertaintyReasons: ['HISTORY_PARTIAL'] });
  });
  it('evaluates anyOf / allOf expressions and credit conditions from details', () => {
    const C = subject(7, 'CCCC3000', 'LECTURE');
    const D = subject(8, 'DDDD3000', 'LECTURE', { conditionalPrerequisites: { status: 'AVAILABLE', details: {
      expression: { operator: 'anyOf', operands: [{ operator: 'course', code: 'AAAA1000' }, { operator: 'course', code: 'CCCC3000' }] },
      conditions: [{ type: 'completedCredits', operator: '>=', value: 5 }], conditionNote: null,
    } } });
    const students = [
      student('ok', [rec(7, 'COMPLETED')]), // 3 credits < 5 -> not met
      student('ok2', [rec(1, 'COMPLETED'), rec(7, 'COMPLETED')]), // 6 credits -> met
      student('none'), // expression false
      student('exempt', [rec(1, 'EXEMPTED'), rec(7, 'EXEMPTED', 3)]), // exempt without credits but known sum satisfies? 3 known only
    ];
    const demand = demandOf(runForecastEngine(input(students, [A, C, D])), 8);
    expect(demand.supportedDemand).toBe(1);
    expect(demand.breakdown.prerequisiteNotMet).toBe(1 + 1);
    expect(demand.uncertainCount).toBe(1);
    expect(demand.uncertaintyReasons).toEqual(['CREDIT_EVIDENCE_MISSING']);
  });
  it('treats cgpa conditions and topic-dependent prerequisites as unknown evidence', () => {
    const E = subject(9, 'EEEE4000', 'LECTURE', { conditionalPrerequisites: { status: 'AVAILABLE', details: { expression: null, conditions: [{ type: 'cgpa', operator: '>=', value: 2 }], conditionNote: null } } });
    const T = subject(10, 'TTTT4000', 'LECTURE', { conditionalPrerequisites: { status: 'AVAILABLE', details: { expression: null, conditions: [], conditionNote: null, topicDependent: true } } });
    const result = runForecastEngine(input([student('a')], [E, T]));
    expect(demandOf(result, 9).uncertaintyReasons).toEqual(['CGPA_EVIDENCE_MISSING']);
    expect(demandOf(result, 10).uncertaintyReasons).toEqual(['PREREQUISITE_EVIDENCE_MISSING']);
  });
});

describe('uncertainty', () => {
  const cases: Array<[string, Partial<EngineStudent>, string]> = [
    ['history UNKNOWN', { historyCompleteness: 'UNKNOWN' as HistoryCompleteness }, 'HISTORY_UNKNOWN'],
    ['history PARTIAL', { historyCompleteness: 'PARTIAL' as HistoryCompleteness }, 'HISTORY_PARTIAL'],
    ['unsupported cohort', { cohortStatus: 'DEFERRED' }, 'COHORT_STATUS_UNMAPPED'],
  ];
  it.each(cases)('marks only the affected students uncertain: %s', (_name, extra, reason) => {
    const students = [student('good'), student('bad', [], extra)];
    const demand = demandOf(runForecastEngine(input(students, [A])), 1);
    expect(demand).toMatchObject({ supportedDemand: 1, uncertainCount: 1, qualityStatus: 'PRELIMINARY', uncertaintyReasons: [reason], uncertaintyReasonCounts: [{ reason, count: 1 }] });
  });
  it('treats rejected rows as uncertainty even when history is already PARTIAL', () => {
    const students = [student('r', [], { historyCompleteness: 'PARTIAL' })];
    const request = input(students, [A]);
    request.snapshot.rejectedRowsByStudent = { r: 2 };
    expect(demandOf(runForecastEngine(request), 1).uncertaintyReasons).toEqual(['HISTORY_PARTIAL', 'REJECTED_HISTORY_ROW']);
  });
  it('does not make uncertain students supported and reports SUPPORTED only without any uncertainty', () => {
    const clean = demandOf(runForecastEngine(input([student('a')], [A])), 1);
    expect(clean).toMatchObject({ qualityStatus: 'SUPPORTED', uncertainCount: 0, insufficientData: false });
  });
  it('still skips a known pass for a student with unknown history', () => {
    const demand = demandOf(runForecastEngine(input([student('a', [rec(1, 'COMPLETED')], { historyCompleteness: 'UNKNOWN' })], [A])), 1);
    expect(demand).toMatchObject({ supportedDemand: 0, uncertainCount: 0 });
  });
  it('excludes students whose curriculum is not in the catalogue from every count and reports them', () => {
    const result = runForecastEngine(input([student('a'), student('b', [], { curriculumId: 99 })], [A]));
    expect(demandOf(result, 1).supportedDemand).toBe(1);
    expect(result.summary.studentsWithUnresolvedCurriculum).toBe(1);
    expect(result.summary.qualityStatus).toBe('PRELIMINARY');
  });
});

describe('near-graduation policy v1', () => {
  it('is remaining <= 2 x max_credits and never for unknown remaining credits', () => {
    expect(isNearGraduation(40, 20)).toBe(true);
    expect(isNearGraduation(41, 20)).toBe(false);
    expect(isNearGraduation(-3, 20)).toBe(true);
    expect(isNearGraduation(null, 20)).toBe(false);
  });
  it('counts eligible students only and does not change demand', () => {
    const subjects = [A];
    const near = student('near', [rec(2, 'COMPLETED', 85)]); // 120 - 85 = 35 <= 40
    const far = student('far', [rec(2, 'COMPLETED', 10)]); // 110 > 40
    const unknownCredits = student('unk', [rec(2, 'EXEMPTED')]); // exempt credits unknown -> not counted
    const uncertainNear = student('u', [rec(2, 'COMPLETED', 100)], { historyCompleteness: 'PARTIAL' });
    const result = runForecastEngine(input([near, far, unknownCredits, uncertainNear], subjects));
    const demand = demandOf(result, 1);
    expect(demand.supportedDemand).toBe(3);
    expect(demand.nearGraduationCount).toBe(1);
    expect(demand.uncertainCount).toBe(1);
  });
  it('uses the curriculum total and target max_credits; unknown total never counts', () => {
    const students = [student('a', [rec(2, 'COMPLETED', 100)])];
    const tight = runForecastEngine(input(students, [A], { target: { semesterId: 2, semesterType: 'NORMAL', maxSubjects: 6, maxCredits: 5 } }));
    expect(demandOf(tight, 1).nearGraduationCount).toBe(0); // remaining 20 > 10
    const nullTotal = runForecastEngine(input(students, [A], {}, { totalCreditsRequired: null }));
    expect(demandOf(nullTotal, 1).nearGraduationCount).toBe(0);
  });
});

describe('result shape and determinism', () => {
  it('carries engine version, rule snapshot, persistable recommendations and a summary', () => {
    const lab = subject(3, 'LABB1000', 'LAB');
    const fyp = subject(4, 'FYPP4000', null, { includeInOfferingForecast: false, exclusionReason: 'FYP' });
    const result = runForecastEngine(input(many(40, (i) => student(`s${i}`)), [lab, A, fyp]));
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.ruleSnapshot).toMatchObject({
      programmeId: 5, learningCentreId: 1, targetSemesterId: 2, demandAssumption: 'SUPPORTED_ELIGIBLE_POOL', engineVersion: ENGINE_VERSION,
      policyVersions: { nearGraduation: 1 }, supportedCohortStatuses: ['ACTIVE'], targetSemester: { semesterType: 'NORMAL', maxCredits: 20 },
    });
    expect(result.ruleSnapshot.catalogueFingerprint).toMatch(/^fp1:[0-9a-f]{28}$/);
    expect(result.ruleSnapshot.capacityRules.map((r) => r.capacityRuleId)).toEqual([1, 2]);
    expect(result.demands.map((d) => d.subjectId)).toEqual([1, 3, 4]);
    expect(result.originalRecommendations.map((r) => r.subjectId)).toEqual([1, 3]);
    expect(result.summary).toMatchObject({ subjects: 3, excludedSubjects: 1, totalSections: 3, subjectsWithSections: 2, totalSupportedDemand: 80, studentsInSnapshot: 40 });
  });
  it('changes the catalogue fingerprint when the catalogue changes', () => {
    const one = runForecastEngine(input([student('a')], [A])).ruleSnapshot.catalogueFingerprint;
    const two = runForecastEngine(input([student('a')], [{ ...A, creditHours: 4 }])).ruleSnapshot.catalogueFingerprint;
    expect(one).not.toBe(two);
  });
  it('is deterministic, independent of input order, and does not mutate the input', () => {
    const lab = subject(3, 'LABB1000', 'LAB');
    const students = [
      ...many(30, (i) => student(`s${String(i).padStart(2, '0')}`, i % 3 === 0 ? [rec(1, 'COMPLETED')] : [], i % 7 === 0 ? { historyCompleteness: 'PARTIAL' as HistoryCompleteness } : {})),
    ];
    const request = input(students, [A, lab]);
    request.snapshot.rejectedRowsByStudent = { s01: 1 };
    const before = JSON.stringify(request);
    const first = runForecastEngine(request);
    const second = runForecastEngine(request);
    expect(JSON.stringify(request)).toBe(before);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    const shuffled = input([...students].reverse(), [lab, A]);
    shuffled.snapshot.rejectedRowsByStudent = { s01: 1 };
    shuffled.capacityRules = [LECTURE_RULE, LAB_RULE];
    expect(runForecastEngine(shuffled)).toEqual(first);
  });
});
