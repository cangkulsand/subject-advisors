import type { OfferingContext } from '../../../packages/shared/src/offerings/offerings';

/** Fictional review data only. Not a university catalogue or a real student profile. */
export const demoContext: OfferingContext = {
  curriculum: {
    curriculumId: '401',
    name: 'Fictional Computing · Prototype curriculum',
    programmeName: 'Demonstration programme',
  },
  subjects: [
    ['DEMO101', 'Programming foundations', 3],
    ['DEMO102', 'Discrete structures', 3],
    ['DEMO201', 'Data structures & algorithms', 3],
    ['DEMO202', 'Database fundamentals', 3],
    ['DEMO203', 'Computer networks', 3],
    ['DEMO204', 'Human–computer interaction', 3],
    ['DEMO301', 'Software design studio', 4],
    ['DEMO302', 'Operating systems', 3],
    ['DEMO303', 'Professional communication', 2],
    ['DEMO304', 'Applied statistics', 3],
  ].map(([code, name, creditHours], index) => ({
    curriculumSubjectId: String(101 + index),
    code: String(code), name: String(name), creditHours: Number(creditHours),
  })),
  semesters: ['2026/2027', '2027/2028'].flatMap((academicYear, yearIndex) =>
    ([1, 2, 3] as const).map(semesterNo => ({
      semesterId: String(200 + yearIndex * 3 + semesterNo),
      academicYear, semesterNo,
    }))),
};
