import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfferingRepository } from './repository';
import type { OfferingDatabase } from './repository';

const scope = { clerkUserId: 'fictional_a', studentId: '301', curriculumId: '401' };
const semesterId = '201';
const subjectId = '101';

function database() {
  const statements: { text: string; parameters: unknown[] }[] = [];
  const query = vi.fn(async (text: string, parameters: unknown[]): Promise<Record<string, unknown>[]> => {
    statements.push({ text, parameters });
    if (text.includes('SELECT curriculum_id FROM student_profile')) return [{ curriculum_id: scope.curriculumId }];
    if (text.includes('SELECT semester_id FROM academic_semester')) return [{ semester_id: semesterId }];
    if (text.includes('SELECT curriculum_subject_id FROM curriculum_subject')) return (parameters[1] as string[]).map(id => ({ curriculum_subject_id: id }));
    if (text.includes('SELECT o.curriculum_subject_id')) return [{ curriculum_subject_id: subjectId }];
    return [];
  });
  const db: OfferingDatabase = {
    query: vi.fn(async () => []),
    transaction: vi.fn(async work => work({ query })),
  };
  return { db, query, statements, repository: createOfferingRepository(db) };
}

describe('offering SQL transaction contract', () => {
  it('locks and revalidates profile, semester and subjects before mutation on the same connection', async () => {
    const f = database(); const input = { semesterId, curriculumSubjectIds: [subjectId] };
    expect(await f.repository.replace(scope, input)).toEqual(input);
    expect(f.db.transaction).toHaveBeenCalledOnce();
    expect(f.db.query).not.toHaveBeenCalled();
    expect(f.statements.map(statement => statement.text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' '))).toEqual([
      'SELECT curriculum_id FROM student_profile', 'SELECT semester_id FROM academic_semester',
      'SELECT curriculum_subject_id FROM curriculum_subject', 'DELETE FROM semester_offering WHERE',
      'INSERT INTO semester_offering (student_id,', 'SELECT o.curriculum_subject_id FROM semester_offering',
    ]);
    expect(f.statements[0]!.text).toContain('FOR UPDATE');
    expect(f.statements[0]!.parameters).toEqual([scope.studentId, scope.clerkUserId]);
    expect(f.statements[2]!.text).toContain('FOR SHARE');
    for (const statement of f.statements) expect(statement.text).not.toContain(scope.studentId);
    expect(f.statements[3]!.parameters).toEqual([scope.studentId, semesterId, [subjectId]]);
    expect(f.statements[4]!.text).toContain('ON CONFLICT (student_id, semester_id, curriculum_subject_id) DO NOTHING');
  });
  it('rechecks curriculum after acquiring the lock, preserving saved rows on a stale profile', async () => {
    const f = database(); f.query.mockResolvedValueOnce([{ curriculum_id: 402 }]);
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 409 });
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it('rejects a changed subject mapping before deleting anything', async () => {
    const f = database();
    f.query.mockResolvedValueOnce([{ curriculum_id: scope.curriculumId }]).mockResolvedValueOnce([{ semester_id: semesterId }]).mockResolvedValueOnce([]);
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] })).rejects.toMatchObject({ code: 'SUBJECT_OUTSIDE_CURRICULUM' });
    expect(f.query).toHaveBeenCalledTimes(3);
  });
  it('rejects a removed semester before mutation', async () => {
    const f = database();
    f.query.mockResolvedValueOnce([{ curriculum_id: scope.curriculumId }]).mockResolvedValueOnce([]);
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 404 });
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it('propagates insertion failure to the transaction boundary for rollback', async () => {
    const f = database();
    f.query.mockResolvedValueOnce([{ curriculum_id: scope.curriculumId }]).mockResolvedValueOnce([{ semester_id: semesterId }])
      .mockResolvedValueOnce([{ curriculum_subject_id: subjectId }]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('insert failed'));
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] })).rejects.toThrow('insert failed');
    expect(f.query).toHaveBeenCalledTimes(5);
  });
  it('validates duplicates even if called without the HTTP handler', async () => {
    const f = database();
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId, subjectId] })).rejects.toMatchObject({ status: 400 });
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it('scopes reads by verified Clerk ID, student, semester and current curriculum', async () => {
    const f = database();
    vi.mocked(f.db.query).mockResolvedValue([{ curriculum_subject_id: subjectId }]);
    expect(await f.repository.read(scope, semesterId)).toEqual({ semesterId, curriculumSubjectIds: [subjectId] });
    const [sql, parameters] = vi.mocked(f.db.query).mock.calls[0]!;
    expect(parameters).toEqual([scope.studentId, scope.clerkUserId, semesterId, scope.curriculumId]);
    expect(sql).toContain('cs.curriculum_id = p.curriculum_id');
  });
});

const mocks = vi.hoisted(() => ({
  query: vi.fn(), release: vi.fn(), end: vi.fn(), connect: vi.fn(), http: vi.fn(),
}));
vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({ query: mocks.http }),
  Pool: class { connect = mocks.connect; end = mocks.end; },
}));
import { createNeonOfferingRepository } from './neon';

describe('Neon connection lifecycle and rollback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.end.mockResolvedValue(undefined);
    mocks.query.mockImplementation(async (text: string) => ({ rows:
      text.includes('SELECT curriculum_id FROM student_profile') ? [{ curriculum_id: scope.curriculumId }] :
      text.includes('SELECT semester_id FROM academic_semester') ? [{ semester_id: semesterId }] :
      text.includes('SELECT curriculum_subject_id FROM curriculum_subject') || text.includes('SELECT o.curriculum_subject_id') ? [{ curriculum_subject_id: subjectId }] : [],
    }));
  });
  it('begins and commits one transaction, releasing and ending its request-local pool', async () => {
    const repository = createNeonOfferingRepository('postgres://fictional.invalid/demo');
    await repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] });
    expect(mocks.query.mock.calls[0]![0]).toBe('BEGIN');
    expect(mocks.query.mock.calls.at(-1)![0]).toBe('COMMIT');
    expect(mocks.query.mock.calls.some(call => call[0] === 'ROLLBACK')).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce(); expect(mocks.end).toHaveBeenCalledOnce();
  });
  it('rolls back if insertion fails after deletion; never commits a partial set', async () => {
    const prior = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (text: string, ...args: unknown[]) => {
      if (text.includes('INSERT INTO semester_offering')) throw new Error('insert failed');
      return prior(text, ...args);
    });
    const repository = createNeonOfferingRepository('postgres://fictional.invalid/demo');
    await expect(repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] })).rejects.toThrow('insert failed');
    const commands = mocks.query.mock.calls.map(call => call[0]);
    expect(commands.some(sql => sql.startsWith('DELETE'))).toBe(true);
    expect(commands.at(-1)).toBe('ROLLBACK'); expect(commands).not.toContain('COMMIT');
    expect(mocks.release).toHaveBeenCalledOnce(); expect(mocks.end).toHaveBeenCalledOnce();
  });
  it('ends the pool on connection failure without attempting any writes', async () => {
    mocks.connect.mockRejectedValue(new Error('offline'));
    await expect(createNeonOfferingRepository('postgres://fictional.invalid/demo').replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toThrow('offline');
    expect(mocks.end).toHaveBeenCalledOnce(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it('uses the existing HTTP driver for scoped reads without opening a pool', async () => {
    mocks.http.mockResolvedValue([{ curriculum_subject_id: subjectId }]);
    expect(await createNeonOfferingRepository('postgres://fictional.invalid/demo').read(scope, semesterId)).toEqual({ semesterId, curriculumSubjectIds: [subjectId] });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
