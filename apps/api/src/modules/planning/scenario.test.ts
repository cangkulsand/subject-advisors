import { describe, expect, it, vi } from 'vitest';
import { toRows, type SavedChange } from '../../../../../packages/shared/src/planning/saved';
import { planningBaselineVersion } from '../../../../../packages/shared/src/planning/baseline-version';
import type { PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import { createScenarioRepository } from './scenario';
import { handlePlanningRequest, type PlanningDependencies } from './routes';

// A small plan: start 2026/2027 S2, configured through 2027/2028 S3 (ids 21-25).
const subject = (id: number, code: string, extra = {}) => ({ curriculumSubjectId: id, subjectCode: code, subjectName: 'Name ' + code, creditHours: 3,
  category: 'Core', compulsory: true, semesterTypes: ['NORMAL' as const], prerequisites: [] as number[], ...extra });
const input: PlanningInput = {
  programmeName: 'Demo', curriculumVersion: '2024', totalCredits: 12, earnedCredits: 3,
  subjects: [subject(1, 'SECA1013'), subject(2, 'SECA2013', { prerequisites: [1] }), subject(3, 'SECB1013'), subject(4, 'SECC1013')],
  requirements: [], passed: [4], start: { academicYear: '2026/2027', semesterNo: 2 },
  limits: [['2026/2027', 2], ['2026/2027', 3], ['2027/2028', 1], ['2027/2028', 2], ['2027/2028', 3]].map(([academicYear, semesterNo], i) =>
    ({ semesterId: 21 + i, academicYear: academicYear as string, semesterNo: semesterNo as number, maxSubjects: 3, maxCredits: 10 })),
  approvedFirst: null,
};
const saved = (changes: SavedChange[]) => ({ changes, savedAt: '2026-11-17T00:00:00.000Z' });

function deps(role: 'STUDENT' | 'COORDINATOR' = 'STUDENT') {
  const repository = { load: vi.fn(async () => input) };
  const scenarios = { read: vi.fn(async () => null as ReturnType<typeof saved> | null), replace: vi.fn(async (_id: string, rows: ReturnType<typeof toRows>) => saved(rows.length ? [] : [])), remove: vi.fn(async () => undefined) };
  const d: PlanningDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: 'student_a', sessionId: 'test', primaryEmail: { address: 'demo@graduate.utm.my', verified: true } })),
      access: { find: vi.fn(async () => ({ clerkUserId: 'student_a', appRole: role, accessStatus: 'ACTIVE' as const, roles: [role] })), initializeStudent: vi.fn() },
      profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
    },
    repository, scenarios,
  };
  return { d, scenarios };
}
const call = (d: PlanningDependencies, method: string, body?: unknown) =>
  handlePlanningRequest(new Request('https://example.test/api/planning/scenario', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) }), d)
    .then(res => res!);

describe('GET /api/planning/scenario', () => {
  it('returns null when nothing is saved', async () => {
    const res = await call(deps().d, 'GET');
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ data: null });
  });
  it('returns the saved changes', async () => {
    const { d, scenarios } = deps(); scenarios.read.mockResolvedValue(saved([{ kind: 'PLACE', curriculumSubjectId: 3, semesterId: 24 }]));
    expect(await (await call(d, 'GET')).json()).toEqual({ data: saved([{ kind: 'PLACE', curriculumSubjectId: 3, semesterId: 24 }]) });
    expect(scenarios.read).toHaveBeenCalledWith('student_a');
  });
});

describe('PUT /api/planning/scenario', () => {
  it('saves a valid list as rows', async () => {
    const { d, scenarios } = deps();
    const changes: SavedChange[] = [{ kind: 'PLACE', curriculumSubjectId: 3, semesterId: 24 }];
    scenarios.replace.mockResolvedValue(saved(changes));
    const res = await call(d, 'PUT', { changes });
    expect(res.status).toBe(200);
    expect(scenarios.replace).toHaveBeenCalledWith('student_a', toRows(changes));
    expect(await res.json()).toEqual({ data: saved(changes) });
  });
  const invalid: [string, unknown, string?][] = [
    ['a bad body', { changes: 'x' }],
    ['a subject outside the curriculum', { changes: [{ kind: 'POSTPONE', curriculumSubjectId: 99 }] }],
    ['a passed subject', { changes: [{ kind: 'POSTPONE', curriculumSubjectId: 4 }] }],
    ['a semester that is not set up', { changes: [{ kind: 'PLACE', curriculumSubjectId: 3, semesterId: 99 }] }],
    ['a move the rules refuse', { changes: [{ kind: 'PLACE', curriculumSubjectId: 2, semesterId: 21 }] }, 'Needs SECA1013 first, and there is no room to fit it in an earlier semester.'],
  ];
  for (const [name, body, reason] of invalid) it('refuses ' + name + ' and writes nothing', async () => {
    const { d, scenarios } = deps();
    const res = await call(d, 'PUT', body);
    expect(res.status).toBe(422);
    const json = await res.json() as { error: { code: string; message: string } };
    expect(json.error.code).toBe('SCENARIO_INVALID');
    if (reason) expect(json.error.message).toBe(reason);
    expect(scenarios.replace).not.toHaveBeenCalled();
  });
  it('refuses invalid JSON', async () => {
    const res = await handlePlanningRequest(new Request('https://example.test/api/planning/scenario', { method: 'PUT', body: '{' }), deps().d);
    expect(res!.status).toBe(422);
  });
  it('maps a curriculum mismatch from the database to 422', async () => {
    const { d, scenarios } = deps(); scenarios.replace.mockRejectedValue({ code: '23514', message: 'Student subject curriculum mismatch' });
    const res = await call(d, 'PUT', { changes: [{ kind: 'POSTPONE', curriculumSubjectId: 3 }] });
    expect(res.status).toBe(422); expect(JSON.stringify(await res.json())).not.toContain('mismatch');
  });
});

describe('baseline version token', () => {
  const token = () => planningBaselineVersion(input);
  it('saves a valid list when the token matches the current input', async () => {
    const { d, scenarios } = deps();
    const changes: SavedChange[] = [{ kind: 'POSTPONE', curriculumSubjectId: 3 }];
    scenarios.replace.mockResolvedValue(saved(changes));
    const res = await call(d, 'PUT', { changes, baselineVersion: await token() });
    expect(res.status).toBe(200);
    expect(scenarios.replace).toHaveBeenCalledWith('student_a', toRows(changes));
  });
  it('returns 409 when the token was computed from an older baseline, writing nothing', async () => {
    const { d, scenarios } = deps();
    const stale = await planningBaselineVersion({ ...input, totalCredits: 130 });
    const res = await call(d, 'PUT', { changes: [{ kind: 'POSTPONE', curriculumSubjectId: 3 }], baselineVersion: stale });
    expect(res.status).toBe(409);
    const json = await res.json() as { error: { code: string; message: string } };
    expect(json.error.code).toBe('PLANNING_BASELINE_CHANGED');
    expect(json.error.message).toContain('Refresh');
    expect(scenarios.replace).not.toHaveBeenCalled();
  });
  it('checks the token before the change list: a stale token with an unknown subject still gives 409', async () => {
    const { d, scenarios } = deps();
    const res = await call(d, 'PUT', { changes: [{ kind: 'POSTPONE', curriculumSubjectId: 99 }], baselineVersion: 'f'.repeat(64) });
    expect(res.status).toBe(409);
    expect(scenarios.replace).not.toHaveBeenCalled();
  });
  it('refuses a malformed token without loading the baseline', async () => {
    const { d, scenarios } = deps();
    const res = await call(d, 'PUT', { changes: [], baselineVersion: 'not-a-hash' });
    expect(res.status).toBe(422);
    expect((await res.json() as { error: { code: string } }).error.code).toBe('SCENARIO_INVALID');
    expect(scenarios.replace).not.toHaveBeenCalled();
  });
  it('still accepts a legacy client that sends no token', async () => {
    const { d, scenarios } = deps();
    const res = await call(d, 'PUT', { changes: [{ kind: 'POSTPONE', curriculumSubjectId: 3 }] });
    expect(res.status).toBe(200);
    expect(scenarios.replace).toHaveBeenCalled();
  });
});

describe('DELETE and other methods', () => {
  it('DELETE removes the saved scenario', async () => {
    const { d, scenarios } = deps();
    const res = await call(d, 'DELETE');
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ data: null }); expect(scenarios.remove).toHaveBeenCalledWith('student_a');
  });
  it('PATCH is not allowed', async () => {
    const res = await call(deps().d, 'PATCH');
    expect(res.status).toBe(405); expect(res.headers.get('Allow')).toBe('GET, PUT, DELETE');
  });
  it('only students may use it', async () => {
    expect((await call(deps('COORDINATOR').d, 'GET')).status).toBe(403);
  });
});

describe('scenario repository', () => {
  it('replaces the rows in one transaction, one scenario per student, in order', async () => {
    const transaction = vi.fn(async () => [[{ student_id: 7 }], [], [], [], [{ saved_at: '2026-11-17T00:00:00.000Z' }]]);
    const changes: SavedChange[] = [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }, { kind: 'PLACE', curriculumSubjectId: 3, semesterId: 24 }];
    const result = await createScenarioRepository({ query: vi.fn(), transaction }).replace('student_a', toRows(changes));
    expect(result).toEqual(saved(changes));
    const commands = (transaction.mock.calls[0] as unknown as [{ text: string; params: unknown[] }[]])[0];
    expect(commands).toHaveLength(5);
    expect(commands[0]!.text).toContain('FOR UPDATE');
    expect(commands[1]!.text).toContain('NOT EXISTS');
    expect(commands[2]!.text).toContain('DELETE FROM public.simulation_subject');
    expect(commands[3]!.text).toContain('ORDER BY');
    expect(JSON.parse(commands[3]!.params[1] as string)).toEqual(toRows(changes).map((row, ord) => ({ ...row, ord })));
  });
  it('reads rows in ID order and returns null without a scenario', async () => {
    const query = vi.fn(async () => [] as Record<string, unknown>[]);
    const repository = createScenarioRepository({ query, transaction: vi.fn() });
    expect(await repository.read('student_a')).toBeNull();
    query.mockResolvedValue([
      { scenario_created: '2026-11-16T00:00:00.000Z', curriculum_subject_id: 5, change_type: 'REPLACE', proposed_semester_id: null, hypothetical_status: null, row_created: '2026-11-17T00:00:00.000Z' },
      { scenario_created: '2026-11-16T00:00:00.000Z', curriculum_subject_id: 6, change_type: 'REPLACEMENT', proposed_semester_id: 24, hypothetical_status: null, row_created: '2026-11-17T00:00:00.000Z' },
    ]);
    expect(await repository.read('student_a')).toEqual({ changes: [{ kind: 'REPLACE', curriculumSubjectId: 5, replacementId: 6 }, { kind: 'PLACE', curriculumSubjectId: 6, semesterId: 24 }], savedAt: '2026-11-17T00:00:00.000Z' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY sub.simulation_subject_id'), ['student_a']);
  });
  it('remove deletes the rows before the scenario', async () => {
    const transaction = vi.fn(async () => [[], []]);
    await createScenarioRepository({ query: vi.fn(), transaction }).remove('student_a');
    const commands = (transaction.mock.calls[0] as unknown as [{ text: string }[]])[0];
    expect(commands[0]!.text).toContain('DELETE FROM public.simulation_subject');
    expect(commands[1]!.text).toContain('DELETE FROM public.simulation_scenario');
  });
});
