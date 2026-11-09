// FICTIONAL DATA ONLY. No accounts, credentials, persistence or official curriculum policy.
import { createP002DemoCohort } from '../../packages/shared/src/forecasting/p002-demo-fixture';
import { buildInitialDemand } from '../../packages/shared/src/forecasting/initial-demand';
import { buildStudentEligibility, type StudentEligibilityInput } from '../../packages/shared/src/forecasting/student-eligibility';
import { validateSemesterSelection } from '../../packages/shared/src/forecasting/semester-selection';
import type { EngineCurriculum, EngineRecord } from '../../packages/shared/src/forecasting/engine/types';
import type { ForecastSubjectOption } from '../../packages/shared/src/forecasting/contracts';
import { fingerprint } from '../../packages/shared/src/forecasting/engine/hash';
const subject = (id: number, code: string, name: string, extra: Partial<ForecastSubjectOption> = {}): ForecastSubjectOption => ({
  curriculumSubjectId: id, curriculumId: 1, subjectId: id, subjectCode: code, subjectName: name, creditHours: 3,
  classType: 'LECTURE', includeInOfferingForecast: true, exclusionReason: null, prerequisiteLinks: [],
  conditionalPrerequisites: { status: 'UNAVAILABLE', reason: 'No optional conditions configured.' }, ...extra,
});
export function demoData(options: { conditionalPair?: boolean; deadline?: string } = {}) {
  const cohort = createP002DemoCohort();
  const option = (id: number, required: number) => [{ prerequisiteId: id, curriculumSubjectId: id, requiredCurriculumSubjectId: required, requirementType: 'MANDATORY' as const }];
  const subjects = [
    subject(1, 'DEMO1000', 'Programming Foundations'),
    subject(2, 'DEMO2000', 'Software Design', { prerequisiteLinks: option(2, 1) }),
    subject(3, 'DEMO2100', 'Computer Networks'),
    subject(4, 'DEMO2200', 'Database Systems'),
    subject(5, 'DEMO3000', 'Applied Artificial Intelligence', { prerequisiteLinks: option(5, 2) }),
    subject(6, 'DEMO4000', 'Research Placement', { conditionalPrerequisites: { status: 'AVAILABLE', details: { expression: null, conditions: [{ type: 'cgpa', operator: '>=', value: 2 }], conditionNote: null } } }),
    subject(7, 'DEMO2300', 'Short Semester Workshop'),
    subject(8, 'DEMO9990', 'Excluded Demonstration Subject', { includeInOfferingForecast: false, exclusionReason: 'Fictional catalogue exclusion for the demonstration.' }),
  ];
  const subjectSemesterRules = [{ ruleId: 1, curriculumSubjectId: 7, semesterType: 'SHORT' as const }];
  const curriculum: EngineCurriculum = { curriculumId: 1, curriculumVersion: 'DEMO-2026', totalCreditsRequired: 120, subjects, subjectSemesterRules, requirements: [], catalogueFingerprint: fingerprint({ subjects, subjectSemesterRules }) };
  const completed = (subjectId: number): EngineRecord => ({ subjectId, status: 'COMPLETED', recognizedCredits: 3, semesterId: null });
  cohort.snapshot.students.forEach((student, index) => {
    student.records = [ ...(index < 35 ? [completed(1)] : []), ...(index >= 30 && index < 35 ? [completed(2)] : []), ...(index < 16 ? [completed(3)] : []), ...(index < 14 ? [completed(4)] : []) ];
  });
  const scope = { programmeId: 5, learningCentreId: 1, targetSemesterId: 2 };
  const target = { semesterId: 2, semesterType: 'NORMAL' as const, maxSubjects: 3, maxCredits: 10 };
  const initial = buildInitialDemand({ scope, importBatchId: 1, sourceFingerprint: fingerprint(cohort.snapshot), snapshot: cohort.snapshot, curricula: [curriculum], target });
  const studentSubjects: ForecastSubjectOption[] = [...subjects];
  if (options.conditionalPair) {
    const pair = [
      subject(9, 'DEMO3100', 'Concurrent Project Studio', { prerequisiteLinks: [{ prerequisiteId: 9, curriculumSubjectId: 9, requiredCurriculumSubjectId: 10, requirementType: 'COREQUISITE' }] }),
      subject(10, 'DEMO3110', 'Concurrent Project Lab', { prerequisiteLinks: [{ prerequisiteId: 10, curriculumSubjectId: 10, requiredCurriculumSubjectId: 9, requirementType: 'COREQUISITE' }] }),
    ];
    studentSubjects.push(...pair);
  }
  const studentCurriculum: EngineCurriculum = { ...curriculum, subjects: studentSubjects, catalogueFingerprint: fingerprint({ subjects: studentSubjects, subjectSemesterRules }) };
  const deadline = options.deadline ?? '2099-12-31T23:59:59.000Z';
  const input: StudentEligibilityInput = { scope, target, curriculum: studentCurriculum, student: cohort.snapshot.students[20]!, rejectedRows: 0, confirmationId: 1, confirmationRevision: 1, confirmedAt: '2026-11-07T08:00:00.000Z', pickDeadline: deadline, confirmedSubjects: studentSubjects.filter(item => item.subjectId >= 2 && item.subjectId <= 7 || options.conditionalPair && (item.subjectId === 9 || item.subjectId === 10)).map(item => ({ confirmedOfferingId: item.subjectId, subjectId: item.subjectId, status: 'CONFIRMED' })) };
  const student = { ...buildStudentEligibility(input), centreBasis: 'Fictional demo: Kuala Lumpur cohort.', scopeLabels: { programmeName: 'Fictional Software Engineering Programme', learningCentreName: 'Kuala Lumpur', targetSemesterLabel: '2026/2027 · Semester 2 (Normal semester)' } };
  return { label: 'FICTIONAL P002 DEMONSTRATION ONLY', cohort: cohort.snapshot, curriculum, target, initial, student, studentInput: input,
    selection: { deadline, sourceRevision: fingerprint({ source: fingerprint(cohort.snapshot), confirmationRevision: input.confirmationRevision, deadline }),
      plan: { revision: 0, subjectIds: [] as number[], updatedAt: null as string | null },
      pageData(plan: { revision: number; subjectIds: number[]; updatedAt: string | null }, changedSource = false) {
        const current = changedSource ? { ...input, confirmationRevision: 2, confirmedSubjects: input.confirmedSubjects.filter(item => item.subjectId !== 2).map(item => ({ ...item, status: 'CONFIRMED' as const })) } : input;
        const sourceRevision = changedSource ? fingerprint({ source: 'fictional-confirmation-revision-2', confirmationRevision: 2 }) : this.sourceRevision;
        const validation = validateSemesterSelection(current, plan.subjectIds);
        return { eligibility: buildStudentEligibility(current), centreBasis: student.centreBasis, scopeLabels: student.scopeLabels,
          sourceRevision, deadline: changedSource ? '2099-12-31T23:59:59.000Z' : this.deadline,
          editingOpen: Date.parse(changedSource ? '2099-12-31T23:59:59.000Z' : this.deadline) > Date.now(),
          plan: { revision: plan.revision, subjectIds: [...plan.subjectIds], updatedAt: plan.updatedAt }, validation };
      } },
    expected: { students: 50, softwareDesignEligible: 30, networksEligible: 29, databasesEligible: 31, uncertainHistory: 5, qualifiedIds: [2, 4] } };
}
