import type { AuthDependencies } from '../auth/contracts';
import type { ForecastScope, ImportedStudentSummary, ImportSummary, ImportValidationReport, SemesterOption, StoredValidationInternals } from '../../../../../packages/shared/src/forecasting/contracts';
import type { ScopeProvider } from './scope-provider';
import type { OfferingsRepository } from './offerings-contracts';
import type { ForecastRunsRepository } from './runs-contracts';
import type { CatalogueCurriculum, ImportCatalogue, RecordToStore, StudentToStore } from './validation';

export type { ScopeProvider };

export type ImportBatchStatus = 'UPLOADED' | 'VALIDATED' | 'ACCEPTED' | 'REJECTED';
/** What is persisted in `academic_import_batch.validation_summary`: the public report body plus private internals. */
export interface StoredValidationSummary extends Omit<ImportValidationReport, 'acceptedSnapshot'> { internal: StoredValidationInternals }

export interface ImportBatchRow extends ForecastScope {
  importBatchId: number;
  status: ImportBatchStatus;
  sourceDate: string;
  sourceLabel: string;
  providedBy: string;
  sourceFingerprint: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  summary: StoredValidationSummary;
}

/** A roster row as stored; the route adds the per-student `source`. */
export type StoredStudentSummary = Omit<ImportedStudentSummary, 'source'>;

/** One student in the system (student_profile) of the requested programme, as read for a system-students snapshot. */
export interface PortalStudentRow {
  studentId: number;
  studentName: string;
  /** Only used in memory to match CSV students of a combined snapshot; never stored. */
  matricNo?: string | null;
  curriculumId: number;
  /** ACTIVE access assignment that also holds the STUDENT role. */
  eligible: boolean;
}
export interface PortalRecordRow { studentId: number; subjectId: number; status: string; semesterId: number | null; recognizedCredits: number }
export interface PortalStudentSelection {
  students: PortalStudentRow[];
  /** Records of the eligible students above (read-only copy of academic_record). */
  records: PortalRecordRow[];
  /** Student profiles whose curriculum belongs to another programme. */
  otherProgrammeStudents: number;
}

export interface ProgrammeCatalogue extends ImportCatalogue {
  curricula: CatalogueCurriculum[];
  prerequisites: Array<{ prerequisiteId: number; curriculumSubjectId: number; requiredCurriculumSubjectId: number; requirementType: 'MANDATORY' | 'RECOMMENDED' | 'COREQUISITE' }>;
}

export interface StoreImportInput extends ForecastScope {
  validationId: string;
  sourceDate: string;
  sourceLabel: string;
  actor: string;
  sourceFingerprint: string;
  /** Final lifecycle state the batch is driven to inside the same transaction. */
  outcome: 'ACCEPTED' | 'VALIDATED' | 'REJECTED';
  summary: StoredValidationSummary;
  students: StudentToStore[];
  records: RecordToStore[];
}

/** Data access. Every method is parameterised SQL; `storeImport`/`acceptValidated` are atomic. */
export interface ForecastingRepository {
  semesters(): Promise<SemesterOption[]>;
  /** Null when the programme does not exist. */
  catalogue(programmeId: number): Promise<ProgrammeCatalogue | null>;
  /** Read-only selection of the students in the system for a programme (never writes student tables). */
  systemStudents(programmeId: number): Promise<PortalStudentSelection>;
  findAcceptedByFingerprint(scope: ForecastScope, fingerprint: string): Promise<ImportBatchRow | null>;
  /** One transaction: batch UPLOADED, students, records, then VALIDATED/REJECTED (and ACCEPTED when asked). */
  storeImport(input: StoreImportInput): Promise<ImportBatchRow>;
  getBatch(importBatchId: number): Promise<ImportBatchRow | null>;
  findByValidationId(validationId: string): Promise<ImportBatchRow | null>;
  listAccepted(scope: ForecastScope, limit: number, beforeImportBatchId: number | null): Promise<ImportBatchRow[]>;
  /** Retained roster students of a batch, keyset-paged by imported_student_id. */
  listStudents(importBatchId: number, limit: number, afterImportedStudentId: number | null): Promise<StoredStudentSummary[]>;
  /** VALIDATED -> ACCEPTED guarded by status; returns null when the batch was not VALIDATED any more. */
  acceptValidated(importBatchId: number, actor: string): Promise<ImportBatchRow | null>;
}

export interface PortalContact { matricNo: string | null; email: string | null }

export interface ForecastingDependencies {
  auth: AuthDependencies;
  repository: ForecastingRepository;
  /** Forecast runs (UC20 Package 6). */
  runs: ForecastRunsRepository;
  /** Coordinator offering confirmation (S2-P004-006). */
  offerings: OfferingsRepository;
  scopes: ScopeProvider;
  /**
   * Live matric number (student_profile) and sign-in email (primary Clerk email) of portal students by `student_id`, for display in the
   * subject student list only; never stored. Absent in tests and local tools: the list then shows the student reference.
   * `emailsAvailable` is false when the identity provider could not be read (matric numbers are still returned).
   */
  portalContacts?: (studentIds: number[]) => Promise<{ contacts: Map<number, PortalContact>; emailsAvailable: boolean }>;
  now?: () => Date;
}

export type { ImportSummary };
