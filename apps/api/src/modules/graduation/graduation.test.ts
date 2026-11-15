import { describe, it, expect, vi } from 'vitest';
import { assessGraduation, nextConfirmations } from './assess';
import { handleGraduationRequest, type GraduationDependencies } from './routes';
import { calculateProgress } from '../p001-sprint2/progress';
import type { Progress, ProgressSource } from '../p001-sprint2/contracts';
import type { Confirmations } from './contracts';

const T = '2026-01-01T00:00:00.000Z';
const none: Confirmations = { feesClearedConfirmedAt: null, muetConfirmedAt: null };
const both: Confirmations = { feesClearedConfirmedAt: T, muetConfirmedAt: T };
const prog = (earned: number, total: number | null): Progress => ({ totalCredits: total, earnedCredits: earned, remainingCredits: total === null ? null : Math.max(0, total - earned) } as Progress);

describe('assessGraduation', () => {
  it('is eligible when credits met and both confirmed', () => {
    expect(assessGraduation(prog(120, 120), both)).toMatchObject({ status: 'ELIGIBLE', missing: [], creditsMet: true });
  });
  it('lists what is missing in order', () => {
    expect(assessGraduation(prog(98, 120), none)).toMatchObject({
      status: 'NOT_YET_ELIGIBLE', creditsMet: false,
      missing: ['22 more credits needed.', 'Confirm you have no outstanding fees.', 'Confirm you have your MUET certificate.'],
    });
  });
  it('handles surplus credits', () => {
    expect(assessGraduation(prog(130, 120), both)).toMatchObject({ creditsMet: true, remainingCredits: 0 });
  });
  it('cannot assess without a credit requirement', () => {
    const r = assessGraduation(prog(50, null), both);
    expect(r).toMatchObject({ status: 'CANNOT_ASSESS', creditsMet: null, requiredCredits: null });
    expect(r.missing[0]).toBe('The programme credit requirement is not configured.');
  });
});

describe('nextConfirmations', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  it('keeps an existing time, stamps a new tick, clears on untick', () => {
    expect(nextConfirmations({ feesClearedConfirmedAt: T, muetConfirmedAt: null }, { feesCleared: true, muet: true }, now))
      .toEqual({ feesClearedConfirmedAt: T, muetConfirmedAt: now.toISOString() });
    expect(nextConfirmations(both, { feesCleared: false, muet: false }, now)).toEqual(none);
  });
});

function source(): ProgressSource {
  return { curriculum: { curriculumId: 1, programme: 'P', version: 'V', totalCredits: 3, subjects: [{ mappingId: 1, subjectId: 1, code: 'A', name: 'A', credits: 3, category: 'CORE', compulsory: true, semesterTypes: ['NORMAL'] }], links: [] },
    attempts: [{ subjectId: 1, status: 'COMPLETED', recognizedCredits: 3 }], requirements: [] };
}
function deps(role: 'STUDENT' | 'COORDINATOR' = 'STUDENT') {
  const repository = { source: vi.fn(async () => ({ progress: source(), confirmations: { ...none } })), save: vi.fn(async () => true) };
  const d: GraduationDependencies = {
    auth: {
      verify: vi.fn(async () => ({ clerkUserId: 'student_a', sessionId: 'test', primaryEmail: { address: 'demo@graduate.utm.my', verified: true } })),
      access: { find: vi.fn(async () => ({ clerkUserId: 'student_a', appRole: role, accessStatus: 'ACTIVE' as const, roles: [role] })), initializeStudent: vi.fn() },
      profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
    },
    repository, now: () => new Date('2026-06-01T00:00:00.000Z'),
  };
  return { d, repository };
}
const req = (path: string, method = 'GET', body?: unknown) => new Request('https://example.test' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('graduation routes', () => {
  it('ignores other paths', async () => { expect(await handleGraduationRequest(req('/api/other'), deps().d)).toBeNull(); });
  it('GET returns the check', async () => {
    const { d } = deps();
    const res = (await handleGraduationRequest(req('/api/graduation-check'), d))!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: assessGraduation(calculateProgress(source()), none) });
  });
  it('PUT saves and returns the new state', async () => {
    const { d, repository } = deps();
    const res = (await handleGraduationRequest(req('/api/graduation-check/confirmations', 'PUT', { feesCleared: true, muet: false }), d))!;
    expect(res.status).toBe(200);
    expect(repository.save).toHaveBeenCalledWith('student_a', { feesClearedConfirmedAt: '2026-06-01T00:00:00.000Z', muetConfirmedAt: null });
    expect(await res.json()).toMatchObject({ data: { feesClearedConfirmedAt: '2026-06-01T00:00:00.000Z', muetConfirmedAt: null, status: 'NOT_YET_ELIGIBLE' } });
  });
  it.each([{ feesCleared: true }, { feesCleared: 'yes', muet: false }, { feesCleared: true, muet: false, studentId: 1 }])('rejects invalid body %j', async body => {
    const { d, repository } = deps();
    const res = (await handleGraduationRequest(req('/api/graduation-check/confirmations', 'PUT', body), d))!;
    expect(res.status).toBe(400); expect(repository.save).not.toHaveBeenCalled();
  });
  it('rejects non-students', async () => {
    const { d } = deps('COORDINATOR');
    expect((await handleGraduationRequest(req('/api/graduation-check'), d))!.status).toBe(403);
  });
  it('requires a profile row', async () => {
    const { d, repository } = deps(); repository.source.mockResolvedValue(null as never);
    const res = (await handleGraduationRequest(req('/api/graduation-check'), d))!;
    expect(res.status).toBe(403); expect(await res.json()).toMatchObject({ error: { code: 'PROFILE_SETUP_REQUIRED' } });
  });
  it('rejects other methods', async () => {
    expect((await handleGraduationRequest(req('/api/graduation-check', 'POST', {}), deps().d))!.status).toBe(405);
  });
});
