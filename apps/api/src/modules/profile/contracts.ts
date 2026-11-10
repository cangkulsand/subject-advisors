export interface ProfileInput {
  studentName: string;
  matricNo: string | null;
  /** Active learning centre (S2-P004-023); decides which coordinator's approvals the student sees. */
  learningCentreId: number;
  curriculumId: number;
  currentSemesterId: number;
  weeklyWorkingHours: number;
  availableStudyHours: number;
}
export interface Profile extends Omit<ProfileInput, 'currentSemesterId' | 'weeklyWorkingHours' | 'availableStudyHours' | 'learningCentreId'> {
  studentId: number;
  /** Null for a legacy profile that has not chosen a centre yet. */
  learningCentreId: number | null;
  /** True from the moment selection opens for the next semester until the admin moves the current semester forward. */
  learningCentreLocked: boolean;
  currentSemesterId: number | null;
  /** Configured curriculum denominator; optional for older profile fixtures/responses. */
  totalCreditRequired?: number | null;
  weeklyWorkingHours: number | null;
  availableStudyHours: number | null;
  programmeCode: string;
  programmeName: string;
  curriculumVersion: string;
  createdAt: string;
  updatedAt: string;
}
export interface CurriculumOption {
  curriculumId: number; curriculumVersion: string; programmeId: number;
  programmeCode: string; programmeName: string;
}
export interface SubjectOption { subjectId: number; subjectCode: string; subjectName: string; creditHours: number; subjectCategory?: string | null; isCompulsory?: 0 | 1 }
export interface SubjectGroupOption { category: string; requiredSubjects: number | null; availableSubjects: number }
export interface SemesterOption { semesterId: number; academicYear: string; semesterNo: number; semesterType?: 'NORMAL' | 'SHORT' }
export interface LearningCentreOption { learningCentreId: number; centreCode: string; centreName: string }
export interface ProfileOptions { curricula: CurriculumOption[]; subjects: SubjectOption[]; semesters: SemesterOption[]; subjectGroups?: SubjectGroupOption[]; learningCentres: LearningCentreOption[] }
export type Parameter = string | number | boolean | null;
export type Query = (text: string, parameters: Parameter[]) => Promise<Record<string, unknown>[]>;
export interface ProfileRepository {
  find(userId: string): Promise<Profile | null>;
  save(userId: string, input: ProfileInput): Promise<Profile>;
  options(userId: string): Promise<ProfileOptions>;
}
