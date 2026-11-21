/**
 * Live forecast input (S3-P004-032): the system-student selection of `buildSystemSnapshot`, turned into engine students in memory.
 * Nothing is stored; the same rules as a system snapshot apply (records count as COMPLETE history, no records = UNKNOWN).
 */
import type { EngineRecord, EngineStudent } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { BuiltSystemSnapshot } from './system-snapshot';

export function engineStudentsOf(built: BuiltSystemSnapshot): EngineStudent[] {
  const recordsByStudent = new Map<string, EngineRecord[]>();
  for (const record of built.records) {
    const list = recordsByStudent.get(record.externalReference) ?? [];
    list.push({ subjectId: record.subjectId, status: record.subjectStatus as EngineRecord['status'], semesterId: record.semesterId, recognizedCredits: record.recognizedCredits });
    recordsByStudent.set(record.externalReference, list);
  }
  return built.students.map((student) => ({
    externalReference: student.externalReference, studentName: student.studentName, curriculumId: student.curriculumId,
    cohortStatus: student.cohortStatus, historyCompleteness: student.historyCompleteness, records: recordsByStudent.get(student.externalReference) ?? [],
  }));
}
