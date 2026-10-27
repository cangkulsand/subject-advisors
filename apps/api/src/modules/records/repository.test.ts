import { describe, expect, it, vi } from 'vitest';
import { P001Error } from '../profile/validation';
import type { Parameter } from '../profile/contracts';
import { createRecordsRepository } from './repository';

const valid = { subjectId: 12, semesterId: null, status: 'COMPLETED' as const, grade: null, recognizedCredits: null, remarks: null };
describe('P001 initial subject records repository', () => {
  it('rejects dated creation before querying persistence', async () => {
    const query = vi.fn(); const repository = createRecordsRepository(query);
    await expect(repository.save('verified-student', { ...valid, semesterId: 3 })).rejects.toMatchObject({ code: 'INITIAL_RECORD_MUST_BE_UNDATED', status: 400 });
    expect(query).not.toHaveBeenCalled();
  });
  it('blocks a same-subject legacy row regardless of semester and identifies new inserts as undated', async () => {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => { void parameters; return sql.includes('INSERT INTO') ? [] : [{ exists: true }]; });
    const repository = createRecordsRepository(query);
    await expect(repository.save('verified-student', valid)).rejects.toMatchObject({ code: 'INITIAL_RECORD_EXISTS', status: 409 });
    expect(query.mock.calls[0]![0]).toContain('WHERE NOT EXISTS (SELECT 1 FROM public.academic_record prior');
    expect(query.mock.calls[0]![0]).toContain('prior.student_id=e.student_id AND prior.subject_id=e.subject_id');
    expect(query.mock.calls[0]![0]).toContain('SELECT e.student_id,e.subject_id,$3::integer');
    expect(query.mock.calls[0]![1]).toEqual(['verified-student',12,null,'COMPLETED',null,null,null]);
    expect(query.mock.calls[1]![0]).toContain('JOIN public.academic_record r USING(student_id)');
    expect(query.mock.calls[1]![0]).toContain('p.clerk_user_id=$1 AND r.subject_id=$2');
  });
  it('updates only mutable fields and requires the saved subject/semester identity', async () => {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => { void sql; void parameters; return []; }); const repository = createRecordsRepository(query);
    await expect(repository.save('verified-student', valid, 17)).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND', status: 404 });
    const sql = query.mock.calls[0]![0];
    expect(sql).toContain('UPDATE public.academic_record r SET status=$4,grade=$5,recognized_credits=e.credits,remarks=$7');
    expect(sql).toContain('r.subject_id=$2 AND r.semester_id IS NOT DISTINCT FROM $3::integer');
    expect(sql).toContain('r.record_id=$8 AND r.student_id=e.student_id');
    expect(sql).toContain('p.clerk_user_id=$1 AND s.subject_id=$2');
    expect(sql).not.toContain('SET subject_id='); expect(sql).not.toContain('SET semester_id=');
  });
  it.each(['COMPLETED','EXEMPTED'] as const)('derives full configured subject credits for %s', async status => {
    const persisted = {
      recordId: 41, subjectId: 12, semesterId: null, status, grade: null,
      recognizedCredits: 3, remarks: null, createdAt: '2026-01-01T00:00:00Z', subjectCode: 'DEMO12',
      subjectName: 'Demo subject', creditHours: 3, academicYear: null, semesterNo: null,
    };
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => { void sql; void parameters; return [persisted]; });
    const result = await createRecordsRepository(query).save('verified-student', { ...valid, status });
    expect(result).toMatchObject({ status, recognizedCredits: 3, creditHours: 3, remarks: null });
    const sql = query.mock.calls[0]![0];
    expect(sql).toContain("CASE WHEN $4::text IN ('COMPLETED','EXEMPTED') THEN s.credit_hours");
    expect(sql).toContain("($4::text IN ('COMPLETED','EXEMPTED') AND ($6::integer IS NULL OR $6::integer=s.credit_hours))");
    expect(sql).toContain("($4::text IN ('FAILED','WITHDRAWN') AND $6::integer=0)");
    expect(query.mock.calls[0]![1]).toEqual(['verified-student',12,null,status,null,null,null]);
  });
  it.each(['COMPLETED','EXEMPTED'] as const)('rejects an explicit partial-credit %s through the subject-credit eligibility predicate', async status => {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => { void sql; void parameters; return []; });
    await expect(createRecordsRepository(query).save('verified-student', { ...valid, status, recognizedCredits: 2 }))
      .rejects.toMatchObject({ code: 'INVALID_SUBJECT_OR_CREDITS', status: 400 });
    const sql = query.mock.calls[0]![0];
    expect(sql).toContain("$4::text IN ('COMPLETED','EXEMPTED') AND ($6::integer IS NULL OR $6::integer=s.credit_hours)");
    expect(query.mock.calls[0]![1]).toEqual(['verified-student',12,null,status,null,2,null]);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('deletes only one owner and current-curriculum row, returning its identity', async () => {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => { void sql; void parameters; return [{ recordId: 17, subjectId: 12 }]; }); const repository = createRecordsRepository(query);
    await expect(repository.delete('verified-student',17)).resolves.toEqual({ recordId: 17, subjectId: 12 });
    expect(query.mock.calls[0]![0]).toContain('DELETE FROM public.academic_record r USING public.student_profile p,public.curriculum_subject cs');
    expect(query.mock.calls[0]![0]).toContain('p.clerk_user_id=$2');
    expect(query.mock.calls[0]![0]).toContain('cs.curriculum_id=p.curriculum_id AND cs.subject_id=r.subject_id');
    expect(query.mock.calls[0]![1]).toEqual([17,'verified-student']);
  });
  it('reports missing or foreign delete targets as 404 and leaves other rows untouched', async () => {
    const query = vi.fn(async (sql: string, parameters: Parameter[]) => { void sql; void parameters; return []; }); const repository = createRecordsRepository(query);
    await expect(repository.delete('another-student',17)).rejects.toBeInstanceOf(P001Error);
    await expect(repository.delete('another-student',17)).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND', status: 404 });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
