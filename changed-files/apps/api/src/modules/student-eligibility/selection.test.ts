import { parse } from 'libpg-query';
import { describe, expect, it, vi } from 'vitest';
import type { ForecastSubjectOption } from '../../../../../packages/shared/src/forecasting/contracts';
import type { EngineCurriculum, EngineStudent } from '../../../../../packages/shared/src/forecasting/engine/types';
import type { StudentEligibilityInput } from '../../../../../packages/shared/src/forecasting/student-eligibility';
import { buildSelectionSaveStatements, createSemesterSelectionRepository, type SelectionDatabase } from './selection-repository';
import { handleSemesterSelectionRequest, STUDENT_SEMESTER_SELECTION_PATH, type SemesterSelectionDependencies } from './selection-routes';
import type { StudentEligibilityReader } from './routes';

const option: ForecastSubjectOption = { curriculumSubjectId: 11, curriculumId: 1, subjectId: 1, subjectCode: 'CS1000', subjectName: 'CS 1000',
  creditHours: 3, classType: 'LECTURE', includeInOfferingForecast: true, exclusionReason: null, prerequisiteLinks: [],
  conditionalPrerequisites: { status: 'UNAVAILABLE', reason: 'Not configured.' } };
const curriculum: EngineCurriculum = { curriculumId: 1, curriculumVersion: '2026', catalogueFingerprint: 'catalogue', totalCreditsRequired: 120,
  subjects: [option], subjectSemesterRules: [], requirements: [] };
const student: EngineStudent = { externalReference: 'own-profile', studentName: null, curriculumId: 1, cohortStatus: 'ACTIVE', historyCompleteness: 'COMPLETE', records: [] };
const input: StudentEligibilityInput = { scope: { programmeId: 3, learningCentreId: 1, targetSemesterId: 20 }, confirmationId: 31, confirmationRevision: 4,
  confirmedAt: '2026-11-01T00:00:00.000Z', pickDeadline: '2026-12-01T00:00:00.000Z', curriculum, student,
  target: { semesterId: 20, semesterType: 'NORMAL', maxSubjects: 3, maxCredits: 10 }, confirmedSubjects: [{ subjectId: 1, status: 'CONFIRMED', confirmedOfferingId: 41 }], rejectedRows: 0 };
const internal = { studentId: 22, sourceSnapshot: { student_id: 22, revision: 4 }, sourceRevision: 'fp1:source' };
const auth = {
  verify: vi.fn(async () => ({ clerkUserId: 'clerk-own', sessionId: 'session', primaryEmail: { address: 'own@graduate.utm.my', verified: true } })),
  access: { find: vi.fn(async (clerkUserId: string) => ({ clerkUserId, appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'ACTIVE' as const })), initializeStudent: vi.fn() },
  profiles: { stateFor: vi.fn(async () => 'COMPLETE' as const) },
};
function fixture() {
  const readOwnEligibility = vi.fn<StudentEligibilityReader['readOwnEligibility']>(async () => ({ input, centreBasis: 'Campus mapping: Kuala Lumpur', scopeLabels: { programmeName: 'Programme', learningCentreName: 'Kuala Lumpur', targetSemesterLabel: '2027 · Semester 1' }, internal }));
  const readOwnPlan = vi.fn(async () => ({ revision: 0, subjectIds: [] as number[], updatedAt: null }));
  const save = vi.fn(async () => ({ revision: 1, subjectIds: [1], updatedAt: '2026-11-09T12:00:00.000Z' }));
  const deps: SemesterSelectionDependencies = { auth, reader: { readOwnEligibility }, selections: { readOwnPlan, save }, now: () => Date.parse('2026-11-09T00:00:00.000Z') };
  return { deps, readOwnEligibility, readOwnPlan, save };
}
const url = `https://test.invalid${STUDENT_SEMESTER_SELECTION_PATH}`;

describe('semester selection API', () => {
  it('serves the authenticated plan and calculated validation without internal snapshot fields', async () => {
    const f = fixture();
    const response = await handleSemesterSelectionRequest(new Request(url), f.deps);
    const body = await response!.json() as { data: Record<string, unknown> };
    expect(response?.status).toBe(200);
    expect(body.data).toMatchObject({ sourceRevision: 'fp1:source', deadline: input.pickDeadline, editingOpen: true, plan: { revision: 0, subjectIds: [] }, validation: { valid: true, totalCredits: 0 } });
    expect(JSON.stringify(body)).not.toMatch(/sourceSnapshot|student_id/);
  });

  it('validates and commits using the fresh own snapshot once, returning the committed selection', async () => {
    const f = fixture();
    const response = await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body: JSON.stringify({ subjectIds: [1], sourceRevision: 'fp1:source', planRevision: 0 }) }), f.deps);
    expect(response?.status).toBe(200);
    expect(f.readOwnEligibility).toHaveBeenCalledTimes(1);
    expect(f.save).toHaveBeenCalledWith(expect.objectContaining({ clerkUserId: 'clerk-own', studentId: 22, semesterId: 20, confirmationId: 31, planRevision: 0, subjectIds: [1] }));
    expect(await response!.json()).toMatchObject({ data: { plan: { revision: 1, subjectIds: [1] }, validation: { valid: true, totalSubjects: 1 } } });
  });

  it('rejects stale revisions, invalid selections, missing confirmation, body errors, and query overrides', async () => {
    const stale = fixture();
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body: JSON.stringify({ subjectIds: [1], sourceRevision: 'old', planRevision: 0 }) }), stale.deps))?.status).toBe(409);
    const invalid = fixture();
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body: JSON.stringify({ subjectIds: [999], sourceRevision: 'fp1:source', planRevision: 0 }) }), invalid.deps))?.status).toBe(422);
    const noConfirmation = fixture(); noConfirmation.readOwnEligibility.mockResolvedValueOnce({ input: null, emptyScope: input.scope, centreBasis: 'Campus', internal });
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body: JSON.stringify({ subjectIds: [], sourceRevision: 'fp1:source', planRevision: 0 }) }), noConfirmation.deps))?.status).toBe(409);
    expect((await handleSemesterSelectionRequest(new Request(`${url}?semesterId=20`), fixture().deps))?.status).toBe(400);
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body: '{' }), fixture().deps))?.status).toBe(400);
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body: JSON.stringify({ studentId: 22, subjectIds: [1], sourceRevision: 'fp1:source', planRevision: 0 }) }), fixture().deps))?.status).toBe(400);
  });

  it('returns a conflict for a closed deadline and an invalid response for oversized requests', async () => {
    const closed = fixture();
    closed.readOwnEligibility.mockResolvedValueOnce({ input: { ...input, pickDeadline: '2026-11-08T00:00:00.000Z' }, centreBasis: 'Campus', internal });
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body: JSON.stringify({ subjectIds: [], sourceRevision: 'fp1:source', planRevision: 0 }) }), closed.deps))?.status).toBe(409);
    const tooLarge = new Request(url, { method: 'PUT', body: ' '.repeat(16 * 1024 + 1) });
    expect(tooLarge.headers.get('content-length')).toBeNull();
    expect((await handleSemesterSelectionRequest(tooLarge, fixture().deps))?.status).toBe(413);
  });

  it('maps only a concurrent first-create primary-key collision to a stale-selection conflict', async () => {
    const body = JSON.stringify({ subjectIds: [1], sourceRevision: 'fp1:source', planRevision: 0 });
    const firstCreate = fixture();
    firstCreate.save.mockRejectedValueOnce(Object.assign(new Error('unique conflict'), { code: '23505', constraint: 'p002_semester_selection_pkey' }));
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body }), firstCreate.deps))?.status).toBe(409);
    const unrelated = fixture();
    unrelated.save.mockRejectedValueOnce(Object.assign(new Error('unique conflict'), { code: '23505', constraint: 'other_constraint' }));
    expect((await handleSemesterSelectionRequest(new Request(url, { method: 'PUT', body }), unrelated.deps))?.status).toBe(503);
  });

  it('denies staff, suspended students, and incomplete profiles before reading or writing plans', async () => {
    const staff = fixture();
    const staffAuth = { ...auth, access: { ...auth.access, find: vi.fn(async (clerkUserId: string) => ({ clerkUserId, appRole: 'COORDINATOR' as const, roles: ['COORDINATOR' as const], accessStatus: 'ACTIVE' as const })) } };
    const staffResponse = await handleSemesterSelectionRequest(new Request(url), { ...staff.deps, auth: staffAuth });
    expect(staffResponse?.status).toBe(403); expect(staff.readOwnEligibility).not.toHaveBeenCalled(); expect(staff.readOwnPlan).not.toHaveBeenCalled();

    const suspended = fixture();
    const suspendedAuth = { ...auth, access: { ...auth.access, find: vi.fn(async (clerkUserId: string) => ({ clerkUserId, appRole: 'STUDENT' as const, roles: ['STUDENT' as const], accessStatus: 'SUSPENDED' as const })) } };
    const suspendedResponse = await handleSemesterSelectionRequest(new Request(url), { ...suspended.deps, auth: suspendedAuth });
    expect(suspendedResponse?.status).toBe(403); expect(suspended.readOwnEligibility).not.toHaveBeenCalled(); expect(suspended.readOwnPlan).not.toHaveBeenCalled();

    const incomplete = fixture();
    const incompleteAuth = { ...auth, profiles: { stateFor: vi.fn(async () => 'SETUP_REQUIRED' as const) } };
    const incompleteResponse = await handleSemesterSelectionRequest(new Request(url), { ...incomplete.deps, auth: incompleteAuth });
    expect(incompleteResponse?.status).toBe(403); expect(incomplete.readOwnEligibility).not.toHaveBeenCalled(); expect(incomplete.readOwnPlan).not.toHaveBeenCalled();
  });
});

describe('semester selection atomic repository', () => {
  it('builds ordered parameterized statements with source, revision, owner, deadline, and offering guards', async () => {
    const commands = buildSelectionSaveStatements({ clerkUserId: 'clerk-own', centreId: 1, programmeId: 3, sourceSnapshot: internal.sourceSnapshot,
      studentId: 22, semesterId: 20, confirmationId: 31, sourceRevision: 'fp1:source', planRevision: 0, subjectIds: [1] });
    expect(commands).toHaveLength(8);
    expect(commands[0]?.text).toMatch(/clerk_user_id=\$1.*FOR UPDATE/);
    expect(commands[1]?.text).toMatch(/FOR SHARE/);
    expect(commands[2]?.text).toContain('to_jsonb(s)');
    expect(commands[2]?.text).toContain('pick_deadline > now()');
    expect(commands[2]?.text).toContain("ap.status<>'PROPOSED'");
    expect(commands[3]?.text).toContain("'P002_SEMESTER_SELECTION'");
    expect(commands[4]?.text).toContain('DELETE FROM public.plan_subject');
    expect(commands[5]?.text).toContain('jsonb_array_elements_text');
    expect(commands[4]?.text).not.toMatch(/DELETE FROM public\.academic_plan|DELETE FROM public\.p002_semester_selection/);
    for (const command of commands) await expect(parse(command.text)).resolves.toBeDefined();
  });

  it("reads only the own student's P002 plan and returns empty state at revision zero", async () => {
    const db: SelectionDatabase = { query: vi.fn(async () => [{ revision: 0, subject_ids: '[]', updated_at: null }]), transaction: vi.fn() };
    const repository = createSemesterSelectionRepository(db);
    await expect(repository.readOwnPlan('clerk-own', 20)).resolves.toEqual({ revision: 0, subjectIds: [], updatedAt: null });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE p.clerk_user_id=$1'), ['clerk-own', 20]);
  });
});

