export type SemesterType = 'NORMAL' | 'SHORT';
export type LinkKind = 'MANDATORY' | 'COREQUISITE' | 'RECOMMENDED';
export interface CurriculumSubject {
  mappingId: number; subjectId: number; code: string; name: string; credits: number;
  category: string; compulsory: boolean; semesterTypes: SemesterType[];
}
export interface Dependency { id: number; from: number; required: number; kind: LinkKind }
export interface CurriculumData {
  curriculumId: number; programme: string; version: string; totalCredits: number;
  subjects: CurriculumSubject[]; links: Dependency[];
}
export interface CurriculumSnapshot { revision: string; data: CurriculumData }
export interface CurriculumOption { curriculumId: number; programme: string; version: string }
export interface CatalogueSubject { subjectId: number; code: string; name: string; credits: number }
export interface Catalogue { curricula: CurriculumOption[]; subjects: CatalogueSubject[] }
export interface Attempt { subjectId: number; status: string; recognizedCredits: number | null; remarks?: string | null }
export interface Requirement { type: string; credits: number | null; subjects: number | null }
export interface ProgressSource { curriculum: CurriculumData; attempts: Attempt[]; requirements: Requirement[] }
export interface ProgressSubject extends CurriculumSubject { outcome: 'COMPLETED' | 'EXEMPTED' | 'REMAINING'; earnedCredits: number }
export interface Progress {
  programme: string; version: string; totalCredits: number | null; earnedCredits: number;
  completedCredits: number; exemptionCredits: number; remainingCredits: number | null; percent: number | null;
  completedSubjects: number; exemptedSubjects: number; zeroCreditExemptions: number;
  outstandingCompulsory: number; noHistory: boolean; warnings: string[];
  subjects: ProgressSubject[]; requirements: (Requirement & { earnedCredits: number | null; satisfiedSubjects: number | null; status: 'MET' | 'OUTSTANDING' | 'UNASSESSED' })[];
}
export interface PrerequisiteSelection { mappingId: number; code: string }
export interface SubjectInput {
  revision: string; existingSubjectId: number | null; code: string; name: string; credits: number;
  category: string; compulsory: boolean; semesterTypes: SemesterType[]; confirmSharedChanges: boolean;
  prerequisites?: PrerequisiteSelection[];
}
export interface LinkInput { revision: string; from: number; required: number; kind: LinkKind }
export interface Sprint2Repository {
  progress(userId: string): Promise<ProgressSource | null>;
  catalogue(): Promise<Catalogue>;
  curriculum(id: number): Promise<CurriculumSnapshot | null>;
  subject(id: number, mappingId: number | null, input: SubjectInput): Promise<CurriculumSnapshot>;
  dependency(id: number, linkId: number | null, input: LinkInput): Promise<CurriculumSnapshot>;
  removeDependency(id: number, linkId: number, revision: string): Promise<CurriculumSnapshot>;
}
