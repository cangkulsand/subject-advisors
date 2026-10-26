export interface ProfileInput {
  studentName: string;
  matricNo: string | null;
  curriculumId: number;
  weeklyWorkingHours: number;
  availableStudyHours: number;
}
export interface Profile extends Omit<ProfileInput, 'weeklyWorkingHours' | 'availableStudyHours'> {
  studentId: number;
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
export interface SubjectOption { subjectId: number; subjectCode: string; subjectName: string; creditHours: number }
export interface SemesterOption { semesterId: number; academicYear: string; semesterNo: number }
export interface ProfileOptions { curricula: CurriculumOption[]; subjects: SubjectOption[]; semesters: SemesterOption[] }
export type Parameter = string | number | boolean | null;
export type Query = (text: string, parameters: Parameter[]) => Promise<Record<string, unknown>[]>;
export interface ProfileRepository {
  find(userId: string): Promise<Profile | null>;
  save(userId: string, input: ProfileInput): Promise<Profile>;
  options(userId: string): Promise<ProfileOptions>;
}
