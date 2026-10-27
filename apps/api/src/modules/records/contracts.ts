export const statuses = ['COMPLETED', 'EXEMPTED', 'FAILED', 'WITHDRAWN'] as const;
export type RecordStatus = typeof statuses[number];
export interface RecordInput {
  subjectId: number; semesterId: number | null; status: RecordStatus;
  grade: string | null; recognizedCredits: number | null; remarks: string | null;
}
export interface AcademicRecord extends Omit<RecordInput, 'recognizedCredits'> {
  recordId: number; recognizedCredits: number; createdAt: string;
  subjectCode: string; subjectName: string; creditHours: number;
  academicYear: string | null; semesterNo: number | null;
}
export interface DeletedRecordIdentity { recordId: number; subjectId: number }
export interface RecordsRepository {
  list(userId: string): Promise<AcademicRecord[]>;
  save(userId: string, input: RecordInput, recordId?: number): Promise<AcademicRecord>;
  delete(userId: string, recordId: number): Promise<DeletedRecordIdentity>;
}
