export type SemesterType = 'NORMAL' | 'SHORT';
export type LinkKind = 'MANDATORY' | 'COREQUISITE' | 'RECOMMENDED';
export interface CurriculumSubject {
  mappingId: number; subjectId: number; code: string; name: string; credits: number;
  category: string; compulsory: boolean; semesterTypes: SemesterType[];
  /** Other programmes whose curricula use the same shared subject (S3-P004-041); outside the revision. */
  sharedWith?: { programmeId: number; programmeCode: string }[];
  /** For a coordinator: programmes outside their scope that also use the subject, so code, name and credits are locked. */
  lockedBy?: string[];
}
export interface Dependency { id: number; from: number; required: number; kind: LinkKind }
export interface CurriculumData {
  curriculumId: number; programme: string; version: string; totalCredits: number;
  subjects: CurriculumSubject[]; links: Dependency[];
  /** Requirement groups for the credit check (S3-P004-044); outside the revision. */
  requirements?: Requirement[];
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
  links: Dependency[]; subjects: ProgressSubject[]; requirements: (Requirement & { earnedCredits: number | null; satisfiedSubjects: number | null; status: 'MET' | 'OUTSTANDING' | 'UNASSESSED' })[];
}
export interface PrerequisiteSelection { mappingId: number; code: string }
export interface SubjectInput {
  revision: string; existingSubjectId: number | null; code: string; name: string; credits: number;
  category: string; compulsory: boolean; semesterTypes: SemesterType[]; confirmSharedChanges: boolean;
  prerequisites?: PrerequisiteSelection[];
  /** Recorded in the audit log (S3-P004-041). */
  reason: string;
}
export interface LinkInput { revision: string; from: number; required: number; kind: LinkKind; reason: string }
export interface SubjectUse { picks: number; plans: number; semesters: string[] }
export interface SubjectRemoval extends CurriculumSnapshot { removed: { scenarioRows: number; prerequisiteLinks: number } }
export interface Sprint2Repository {
  progress(userId: string): Promise<ProgressSource | null>;
  /** Curricula of the given programmes only, or all when omitted (coordinator scope, S3-P004-041). */
  catalogue(programmeIds?: number[]): Promise<Catalogue>;
  curriculum(id: number): Promise<CurriculumSnapshot | null>;
  curriculumProgrammeId(id: number): Promise<number | null>;
  subjectUse(mappingId: number): Promise<SubjectUse>;
  subject(id: number, mappingId: number | null, input: SubjectInput, actor: string): Promise<CurriculumSnapshot>;
  dependency(id: number, linkId: number | null, input: LinkInput, actor: string): Promise<CurriculumSnapshot>;
  removeDependency(id: number, linkId: number, revision: string, reason: string, actor: string): Promise<CurriculumSnapshot>;
  removeSubject(id: number, mappingId: number, revision: string, reason: string, actor: string): Promise<SubjectRemoval>;
}
