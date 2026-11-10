import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfferingRepository } from './repository';
import type { OfferingDatabase } from './repository';

const scope = { clerkUserId: 'fictional_a', studentId: '301', curriculumId: '401', programmeId: '501', learningCentreId: '601' };
const semesterId = '202';
const subjectId = '101';
const NOW = new Date('2026-11-10T12:00:00.000Z');
/** Semesters 201 (admin current) and 202 (next, the target). */
function semesterRows(window: { opens: string | null; closes: string | null } = { opens: '2026-11-01T00:00:00.000Z', closes: null }) {
  return [
    { semester_id: 201, academic_year: '2026/2027', semester_no: 1, is_current: true, max_subjects: 6, max_credits: 18, selection_opens_at: null, selection_closes_at: null },
    { semester_id: 202, academic_year: '2026/2027', semester_no: 2, is_current: false, max_subjects: 6, max_credits: 18, selection_opens_at: window.opens, selection_closes_at: window.closes },
  ];
}

function database(window?: { opens: string | null; closes: string | null }) {
  const statements: { text: string; parameters: unknown[] }[] = [];
  const query = vi.fn(async (text: string, parameters: unknown[]): Promise<Record<string, unknown>[]> => {
    statements.push({ text, parameters });
    if (text.includes('SELECT curriculum_id, learning_centre_id FROM student_profile')) return [{ curriculum_id: scope.curriculumId, learning_centre_id: scope.learningCentreId }];
    if (text.includes('FROM academic_semester')) return semesterRows(window);
    if (text.includes('SELECT curriculum_subject_id FROM curriculum_subject')) return (parameters[1] as string[]).map(id => ({ curriculum_subject_id: id }));
    if (text.includes('JOIN offering_decision')) return (parameters[4] as string[]).map(id => ({ curriculum_subject_id: id, credit_hours: '3.0' }));
    if (text.includes('SELECT o.curriculum_subject_id')) return [{ curriculum_subject_id: subjectId }];
    return [];
  });
  const db: OfferingDatabase = {
    query: vi.fn(async () => []),
    transaction: vi.fn(async work => work({ query })),
  };
  return { db, query, statements, repository: createOfferingRepository(db, () => NOW) };
}

describe('offering SQL transaction contract', () => {
  it('locks and revalidates profile, semesters, subjects and the approved set before mutation on the same connection', async () => {
    const f = database(); const input = { semesterId, curriculumSubjectIds: [subjectId] };
    expect(await f.repository.replace(scope, input)).toEqual(input);
    expect(f.db.transaction).toHaveBeenCalledOnce();
    expect(f.db.query).not.toHaveBeenCalled();
    expect(f.statements.map(statement => statement.text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' '))).toEqual([
      'SELECT curriculum_id, learning_centre_id FROM', 'SELECT semester_id, academic_year, semester_no,',
      'SELECT curriculum_subject_id FROM curriculum_subject', 'SELECT cs.curriculum_subject_id, s.credit_hours FROM',
      'DELETE FROM semester_offering WHERE', 'INSERT INTO semester_offering (student_id,', 'SELECT o.curriculum_subject_id FROM semester_offering',
    ]);
    expect(f.statements[0]!.text).toContain('FOR UPDATE');
    expect(f.statements[0]!.parameters).toEqual([scope.studentId, scope.clerkUserId]);
    expect(f.statements[1]!.text).toContain('FOR SHARE');
    expect(f.statements[2]!.text).toContain('FOR SHARE');
    expect(f.statements[3]!.text).toContain('FOR SHARE OF d');
    expect(f.statements[3]!.parameters).toEqual([scope.curriculumId, scope.programmeId, scope.learningCentreId, semesterId, [subjectId]]);
    for (const statement of f.statements) expect(statement.text).not.toContain(scope.studentId);
    expect(f.statements[4]!.parameters).toEqual([scope.studentId, semesterId, [subjectId]]);
    expect(f.statements[5]!.text).toContain('ON CONFLICT (student_id, semester_id, curriculum_subject_id) DO NOTHING');
  });
  it('replace rechecks the window and the approved set inside the transaction', async () => {
    const closed = database({ opens: '2026-11-01T00:00:00.000Z', closes: '2026-11-09T00:00:00.000Z' });
    await expect(closed.repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] })).rejects.toMatchObject({ status: 409, code: 'PICKS_CLOSED' });
    expect(closed.statements.some(statement => /^\s*(DELETE|INSERT)/.test(statement.text))).toBe(false);
    const planning = database({ opens: '2026-12-01T00:00:00.000Z', closes: null });
    await expect(planning.repository.replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 409, code: 'PICKS_NOT_OPEN' });
    const unscheduled = database({ opens: null, closes: null });
    await expect(unscheduled.repository.replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toMatchObject({ code: 'PICKS_NOT_OPEN' });
    const withdrawn = database();
    withdrawn.query.mockImplementation(async (text, parameters) => {
      withdrawn.statements.push({ text, parameters });
      if (text.includes('SELECT curriculum_id, learning_centre_id FROM student_profile')) return [{ curriculum_id: scope.curriculumId, learning_centre_id: scope.learningCentreId }];
      if (text.includes('FROM academic_semester')) return semesterRows();
      if (text.includes('SELECT curriculum_subject_id FROM curriculum_subject')) return [{ curriculum_subject_id: subjectId }];
      return [];
    });
    await expect(withdrawn.repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] })).rejects.toMatchObject({ status: 409, code: 'OFFERING_NOT_APPROVED' });
    expect(withdrawn.statements.some(statement => /^\s*(DELETE|INSERT)/.test(statement.text))).toBe(false);
  });
  it('rejects a semester that is not the next one after the admin current semester', async () => {
    const f = database();
    await expect(f.repository.replace(scope, { semesterId: '201', curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 409, code: 'SEMESTER_NOT_TARGET' });
    expect(f.statements.some(statement => /^\s*(DELETE|INSERT)/.test(statement.text))).toBe(false);
  });
  it('rejects picks over the semester subject or credit limits before mutation', async () => {
    const subjects = database();
    const ids = ['1', '2', '3', '4', '5', '6', '7'];
    await expect(subjects.repository.replace(scope, { semesterId, curriculumSubjectIds: ids })).rejects.toMatchObject({ status: 409, code: 'PICK_LIMIT_EXCEEDED',
      message: 'You can pick at most 6 subjects and 18 credits for this semester.' });
    expect(subjects.statements.some(statement => /^\s*(DELETE|INSERT)/.test(statement.text))).toBe(false);
    // Within the subject limit (5 of 6) but 5 x 4 credits = 20 > 18.
    const credits = database();
    await expect(credits.repository.replace(scope, { semesterId, curriculumSubjectIds: ['1', '2', '3', '4', '5', '6'] })).resolves.toBeDefined();
    credits.query.mockImplementation(async (text, parameters) => {
      if (text.includes('SELECT curriculum_id, learning_centre_id FROM student_profile')) return [{ curriculum_id: scope.curriculumId, learning_centre_id: scope.learningCentreId }];
      if (text.includes('FROM academic_semester')) return semesterRows();
      if (text.includes('SELECT curriculum_subject_id FROM curriculum_subject')) return (parameters[1] as string[]).map(id => ({ curriculum_subject_id: id }));
      if (text.includes('JOIN offering_decision')) return (parameters[4] as string[]).map(id => ({ curriculum_subject_id: id, credit_hours: '4.0' }));
      return [];
    });
    await expect(credits.repository.replace(scope, { semesterId, curriculumSubjectIds: ['1', '2', '3', '4', '5'] })).rejects.toMatchObject({ code: 'PICK_LIMIT_EXCEEDED' });
  });
  it('rechecks curriculum after acquiring the lock, preserving saved rows on a stale profile', async () => {
    const f = database(); f.query.mockResolvedValueOnce([{ curriculum_id: 402, learning_centre_id: scope.learningCentreId }]);
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 409 });
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it('rejects a changed learning centre before any offering rows are touched', async () => {
    const f = database(); f.query.mockResolvedValueOnce([{ curriculum_id: scope.curriculumId, learning_centre_id: '699' }]);
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toMatchObject({ code: 'PROFILE_CHANGED' });
    expect(f.query).toHaveBeenCalledOnce();
  });
  it('rejects a changed subject mapping before deleting anything', async () => {
    const f = database();
    f.query.mockResolvedValueOnce([{ curriculum_id: scope.curriculumId, learning_centre_id: scope.learningCentreId }]).mockResolvedValueOnce(semesterRows()).mockResolvedValueOnce([]);
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] })).rejects.toMatchObject({ code: 'SUBJECT_OUTSIDE_CURRICULUM' });
    expect(f.query).toHaveBeenCalledTimes(3);
  });
  it('rejects a removed semester before mutation', async () => {
    const f = database();
    f.query.mockResolvedValueOnce([{ curriculum_id: scope.curriculumId, learning_centre_id: scope.learningCentreId }]).mockResolvedValueOnce([]);
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [] })).rejects.toMatchObject({ status: 404 });
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it('propagates insertion failure to the transaction boundary for rollback', async () => {
    const f = database();
    f.query.mockResolvedValueOnce([{ curriculum_id: scope.curriculumId, learning_centre_id: scope.learningCentreId }]).mockResolvedValueOnce(semesterRows())
      .mockResolvedValueOnce([{ curriculum_subject_id: subjectId }]).mockResolvedValueOnce([{ curriculum_subject_id: subjectId, credit_hours: 3 }])
      .mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('insert failed'));
    await expect(f.repository.replace(scope, { semesterId, curriculumSubjectIds: [subjectId] })).rejects.toThrow('insert failed');
    expect(f.query).toHaveBeenCalledTimes(6);
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
      text.includes('SELECT curriculum_id, learning_centre_id FROM student_profile') ? [{ curriculum_id: scope.curriculumId, learning_centre_id: scope.learningCentreId }] :
      text.includes('FROM academic_semester') ? semesterRows() :
      text.includes('JOIN offering_decision') ? [{ curriculum_subject_id: subjectId, credit_hours: 3 }] :
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
