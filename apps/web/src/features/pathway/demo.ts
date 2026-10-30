import type { PathwayGraph } from './contracts';

/**
 * Clearly labelled development-only fixture used to demonstrate every UC17 visual
 * state. It is NOT official UTMSPACE data and is never returned by the API.
 */
export const DEMO_PATHWAY_GRAPH: PathwayGraph = {
  curriculumId: 0,
  curriculumVersion: 'DEMO',
  programmeName: 'Demo curriculum (not official UTMSPACE data)',
  demo: true,
  nodes: [
    { id: 'd1', subjectCode: 'SECJ1013', subjectName: 'Programming Technique 1', creditHours: 3, isCompulsory: true, subjectCategory: 'CORE', status: 'COMPLETED', grade: 'A-', recognizedCredits: 3 },
    { id: 'd2', subjectCode: 'SECJ1023', subjectName: 'Programming Technique 2', creditHours: 3, isCompulsory: true, subjectCategory: 'CORE', status: 'COMPLETED', grade: 'B+', recognizedCredits: 3 },
    { id: 'd3', subjectCode: 'SECJ2013', subjectName: 'Data Structures', creditHours: 3, isCompulsory: true, subjectCategory: 'CORE', status: 'IN_PROGRESS', grade: null, recognizedCredits: null },
    { id: 'd4', subjectCode: 'SECJ2154', subjectName: 'Object Oriented Programming', creditHours: 3, isCompulsory: true, subjectCategory: 'CORE', status: 'ELIGIBLE', grade: null, recognizedCredits: null },
    { id: 'd5', subjectCode: 'SECJ2203', subjectName: 'Software Engineering', creditHours: 3, isCompulsory: true, subjectCategory: 'CORE', status: 'RECOMMENDED', grade: null, recognizedCredits: null },
    { id: 'd6', subjectCode: 'SECJ3303', subjectName: 'Artificial Intelligence', creditHours: 3, isCompulsory: true, subjectCategory: 'CORE', status: 'LOCKED', grade: null, recognizedCredits: null },
    { id: 'd7', subjectCode: 'SECJ3553', subjectName: 'Final Year Project 1', creditHours: 2, isCompulsory: true, subjectCategory: 'CORE', status: 'REMAINING', grade: null, recognizedCredits: null },
    { id: 'd8', subjectCode: 'ULAB1122', subjectName: 'Academic English Skills', creditHours: 2, isCompulsory: false, subjectCategory: 'UNIVERSITY', status: 'EXEMPTED', grade: null, recognizedCredits: 0 },
  ],
  edges: [
    { id: 'e1', source: 'd1', target: 'd2', requirementType: 'MANDATORY' },
    { id: 'e2', source: 'd2', target: 'd3', requirementType: 'MANDATORY' },
    { id: 'e3', source: 'd2', target: 'd4', requirementType: 'MANDATORY' },
    { id: 'e4', source: 'd3', target: 'd6', requirementType: 'MANDATORY' },
    { id: 'e5', source: 'd4', target: 'd5', requirementType: 'RECOMMENDED' },
    { id: 'e6', source: 'd5', target: 'd7', requirementType: 'RECOMMENDED' },
  ],
};
