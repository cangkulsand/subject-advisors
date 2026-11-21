/**
 * Live coordinator forecast (S3-P004-032): calculated from the students in the system on every read, never stored.
 * The subject and student shapes are the run shapes, so the Forecast page and the students dialog read them unchanged.
 */
import type { Int32Id } from './contracts';
import type { RunSubject, RunSubjectStudents } from './runs';

export type LiveSubject = Pick<RunSubject,
  'subjectId' | 'subjectCode' | 'subjectName' | 'creditHours' | 'classType' | 'excluded' | 'semesterTypeExcluded'
  | 'supportedEligibleCount' | 'uncertainStudentCount' | 'nearGraduationCount' | 'breakdown'>;

export interface LiveForecast {
  programmeId: Int32Id;
  learningCentreId: Int32Id;
  targetSemesterId: Int32Id;
  /** ISO time the forecast was calculated. */
  calculatedAt: string;
  /** Students of the scope included in the calculation. */
  studentsInScope: number;
  subjects: LiveSubject[];
}

export type LiveSubjectStudents = Omit<RunSubjectStudents, 'forecastRunId' | 'catalogueMatchesRun'>;
