import type { OfferingAcademicHistory, OfferingPageData, OfferingSubject } from '../../../../../../packages/shared/src/offerings/offerings';

/** Required by ELIG201 but never completed, and not an offered row: it only exists in the prerequisite catalogue. */
const missingRequirement: OfferingSubject = { curriculumSubjectId: '610', subjectId: '90', code: 'ELIG100', name: 'Foundation requirement', creditHours: 3, subjectCategory: 'Core', isCompulsory: 1 };
const subjects: OfferingSubject[] = [
  { curriculumSubjectId: '601', subjectId: '91', code: 'ELIG101', name: 'Open introduction', creditHours: 3, subjectCategory: 'Core', isCompulsory: 1, prerequisites: { status: 'available', items: [] } },
  { curriculumSubjectId: '602', subjectId: '92', code: 'ELIG201', name: 'Needs a missing prerequisite', creditHours: 3, subjectCategory: 'Core', isCompulsory: 1,
    prerequisites: { status: 'available', items: [{ requiredCurriculumSubjectId: '610', requirementType: 'MANDATORY' }] } },
  { curriculumSubjectId: '603', subjectId: '93', code: 'ELIG301', name: 'Prerequisites not loaded', creditHours: 3, subjectCategory: 'Core', isCompulsory: 1, prerequisites: { status: 'unavailable' } },
];
const available: OfferingAcademicHistory = { status: 'available', records: [{ subjectId: '94', code: 'ELIG050', name: 'Earlier subject', status: 'COMPLETED', recognizedCredits: 3, creditHours: 3 }] };

/** eligibility = records loaded; eligibility-saved = ELIG201 already saved; eligibility-no-records / -409 = records unavailable. */
export function eligibilityFixture(scenario: string): OfferingPageData {
  const unavailable = scenario === 'eligibility-no-records' || scenario === 'eligibility-409';
  return {
    curriculum: { curriculumId: '601', name: 'Fictional eligibility curriculum', programmeName: 'Browser acceptance fixture' },
    window: { status: 'OPEN', targetSemesterId: '201', selectionOpensAt: null, selectionClosesAt: null, learningCentreName: 'Kuala Lumpur' },
    currentSemesterId: '201',
    semesters: [{ semesterId: '201', academicYear: '2026/2027', semesterNo: 1 }],
    subjects, prerequisiteCatalogue: [...subjects, missingRequirement],
    selection: { semesterId: '201', curriculumSubjectIds: scenario === 'eligibility-saved' ? ['602'] : [] },
    academicHistory: unavailable ? { status: 'unavailable' } : available,
  };
}
