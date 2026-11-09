import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepAccountSession } from '../auth/account-cache';
import { createStudentEligibilityClient, createStudentSelectionClient, parseSemesterSelectionPageData, parseStudentEligibility, StudentEligibilityApiError } from './client';

const data = {
  state: 'AVAILABLE', scope: { programmeId: 1, learningCentreId: 2, targetSemesterId: 3 }, confirmationId: 4,
  confirmationRevision: 5, confirmedAt: '2026-11-07T00:00:00.000Z', centreBasis: 'Profile learning centre',
  scopeLabels: { programmeName: 'Computer Science', learningCentreName: 'Kuala Lumpur', targetSemesterLabel: 'Semester 2, 2026' },
  results: [{ subjectId: 8, subjectCode: 'DEMO1000', subjectName: 'Demo subject', creditHours: 3, status: 'ELIGIBLE', explanation: 'Confirmed and prerequisites met.', clerkUserId: 'must not be returned' }],
};

describe('student eligibility client', () => {
  beforeEach(() => keepAccountSession({ userId: 'student-own', sessionId: 'session-own' }));
  afterEach(() => vi.useRealTimers());

  it('fetches a fresh token without caching and returns only the public projection fields', async () => {
    const getToken = vi.fn(async () => 'fresh-token');
    const fetcher = vi.fn(async (...request: Parameters<typeof fetch>) => { void request; return new Response(JSON.stringify({ data }), { status: 200 }); });
    const client = createStudentEligibilityClient(getToken, 'https://api.example/', fetcher);
    const result = await client.load();
    expect(getToken).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('https://api.example/api/student/eligible-offerings', expect.objectContaining({ cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer fresh-token' } }));
    expect(result.results[0]).not.toHaveProperty('clerkUserId');
    expect(result.results[0]).toMatchObject({ subjectCode: 'DEMO1000', status: 'ELIGIBLE' });
  });

  it('rejects an invalid projection instead of trusting it', () => {
    expect(() => parseStudentEligibility({ ...data, results: [{ ...data.results[0], status: 'POSSIBLY_ELIGIBLE' }] })).toThrow(StudentEligibilityApiError);
    expect(() => parseStudentEligibility({ ...data, confirmationRevision: null })).toThrow(StudentEligibilityApiError);
  });

  it('parses conditional eligibility and a whitelisted selection response', () => {
    const page = { eligibility: { state: 'AVAILABLE', scope: data.scope, confirmationId: 4, confirmationRevision: 5, confirmedAt: data.confirmedAt,
      results: [{ subjectId: 8, subjectCode: 'DEMO1000', subjectName: 'Demo subject', creditHours: 3, status: 'CONDITIONAL', requiredConcurrentSubjectIds: [9], explanation: 'Select together.' }] },
      centreBasis: 'Profile learning centre', scopeLabels: data.scopeLabels, sourceRevision: 'rev-1', deadline: null, editingOpen: true,
      plan: { revision: 0, subjectIds: [], updatedAt: null }, validation: { valid: true, totalSubjects: 0, totalCredits: 0, limits: { maxSubjects: 3, maxCredits: 10 }, issues: [] }, secret: 'not returned' };
    const parsed = parseSemesterSelectionPageData(page);
    expect(parsed.eligibility.results[0]).toMatchObject({ status: 'CONDITIONAL', requiredConcurrentSubjectIds: [9] });
    expect(parsed).not.toHaveProperty('secret');
    expect(() => parseSemesterSelectionPageData({ ...page, eligibility: { ...page.eligibility, results: [{ ...page.eligibility.results[0], requiredConcurrentSubjectIds: [] }] } })).toThrow(StudentEligibilityApiError);
  });

  it('accepts an empty selection page without an active confirmation and zero configured limits', () => {
    const emptyPage = { eligibility: { state: 'NO_ACTIVE_CONFIRMATION', scope: null, confirmationId: null, confirmationRevision: null, confirmedAt: null, results: [] },
      centreBasis: 'Profile learning centre', sourceRevision: 'none', deadline: null, editingOpen: false,
      plan: { revision: 0, subjectIds: [], updatedAt: null }, validation: null };
    expect(parseSemesterSelectionPageData(emptyPage).eligibility.state).toBe('NO_ACTIVE_CONFIRMATION');
    const zeroCaps = { eligibility: data, centreBasis: 'Profile learning centre', sourceRevision: 'source-1', deadline: null, editingOpen: true, plan: { revision: 0, subjectIds: [], updatedAt: null }, validation: { valid: true, totalSubjects: 0, totalCredits: 0, limits: { maxSubjects: 0, maxCredits: 0 }, issues: [] } };
    expect(parseSemesterSelectionPageData(zeroCaps).validation?.limits).toEqual({ maxSubjects: 0, maxCredits: 0 });
    expect(() => parseSemesterSelectionPageData({ ...zeroCaps, plan: { revision: 1, subjectIds: [8, 8], updatedAt: null } })).toThrow(StudentEligibilityApiError);
  });

  it('uses the fresh-token selection endpoints and sends only the server contract', async () => {
    const token = vi.fn(async () => 'fresh-token');
    const payload = { eligibility: data, centreBasis: 'Profile learning centre', sourceRevision: 'source-1', deadline: null, editingOpen: true,
      plan: { revision: 2, subjectIds: [8], updatedAt: '2026-11-09T10:00:00Z' }, validation: { valid: true, totalSubjects: 1, totalCredits: 3, limits: { maxSubjects: 3, maxCredits: 10 }, issues: [] } };
    const fetcher = vi.fn(async (...request: Parameters<typeof fetch>) => { void request; return new Response(JSON.stringify({ data: payload }), { status: 200 }); });
    const selection = createStudentSelectionClient(token, '', fetcher);
    const loaded = await selection.load();
    expect(loaded.plan.subjectIds).toEqual([8]);
    await selection.save({ subjectIds: [8], sourceRevision: 'source-1', planRevision: 2 });
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/student/semester-selection', expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'omit' }));
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/student/semester-selection', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ subjectIds: [8], sourceRevision: 'source-1', planRevision: 2 }) }));
    expect(createStudentEligibilityClient(token, '', fetcher, selection).selection).toBe(selection);
  });

  it('keeps structured 422 issues and a stale 409 distinguishable', async () => {
    const invalid = createStudentSelectionClient(async () => 'token', '', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'INVALID_SELECTION', message: 'Review selection', details: { issues: [{ code: 'MISSING_COREQUISITE', subjectId: 8, message: 'Select DEMO2000 too.' }] } } }), { status: 422 })));
    const invalidResponse = await invalid.save({ subjectIds: [8], sourceRevision: 'source-1', planRevision: 2 }).catch(error => error);
    expect(invalidResponse).toMatchObject({ status: 422, issues: [{ code: 'MISSING_COREQUISITE', subjectId: 8 }] });
    const stale = createStudentSelectionClient(async () => 'token', '', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'STALE_PLAN', message: 'Reload required.' } }), { status: 409 })));
    await expect(stale.save({ subjectIds: [], sourceRevision: 'source-1', planRevision: 2 })).rejects.toMatchObject({ status: 409, code: 'STALE_PLAN' });
  });

  it('checks the account stamp after the asynchronous token boundary', async () => {
    let resolveToken!: (token: string) => void;
    const getToken = () => new Promise<string>(resolve => { resolveToken = resolve; });
    const client = createStudentEligibilityClient(getToken);
    const pending = client.load();
    keepAccountSession({ userId: 'another-student', sessionId: 'session-other' });
    resolveToken('late-token');
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  });

  it('times out while token acquisition is pending and never starts a late fetch', async () => {
    vi.useFakeTimers();
    let resolveToken!: (token: string) => void;
    const getToken = () => new Promise<string>(resolve => { resolveToken = resolve; });
    const fetcher = vi.fn();
    const pending = createStudentEligibilityClient(getToken, '', fetcher).load();
    const rejection = expect(pending).rejects.toMatchObject({ code: 'ELIGIBILITY_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20000);
    await rejection;
    resolveToken('too-late');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts while token acquisition is pending and never starts a late fetch', async () => {
    let resolveToken!: (token: string) => void;
    const getToken = () => new Promise<string>(resolve => { resolveToken = resolve; });
    const fetcher = vi.fn();
    const controller = new AbortController();
    const pending = createStudentEligibilityClient(getToken, '', fetcher).load(controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    await rejection;
    resolveToken('too-late');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks the account stamp after decoding and never returns a stale body', async () => {
    let resolveBody!: (value: unknown) => void;
    const response = { status: 200, ok: true, json: () => new Promise(resolve => { resolveBody = resolve; }) } as Response;
    const fetcher = vi.fn(async () => response);
    const pending = createStudentEligibilityClient(async () => 'token', '', fetcher).load();
    await Promise.resolve(); await Promise.resolve();
    keepAccountSession({ userId: 'another-student', sessionId: 'session-other' });
    resolveBody({ data });
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  });
});
