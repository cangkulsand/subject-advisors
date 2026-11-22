import { describe, expect, it, vi } from 'vitest';
import { createOfferingDecisionsRepository } from './decisions-repository';

const row = (recordedBy: string, admin: boolean) => ({ audit_id: 1, subject_id: 3, subject_code: 'SECJ1013', subject_name: 'Programming', before_status: 'PENDING',
  after_status: 'OFFERED', import_batch_id: null, affected_picks: 0, recorded_by: recordedBy, recorded_at: '2026-11-22T00:00:00.000Z', recorded_by_admin: admin });

describe('offering decision audit: System Admin marker (S3-P004-033)', () => {
  it('marks entries whose recorder holds SYSTEM_ADMIN, read in the same query', async () => {
    const query = vi.fn(async () => [row('user_admin', true), row('user_coordinator', false)]);
    const repository = createOfferingDecisionsRepository(query as never, vi.fn() as never);
    const entries = await repository.listAudit({ programmeId: 5, learningCentreId: 2, targetSemesterId: 4 }, 10, null);
    expect(entries.map(entry => [entry.recordedBy, entry.recordedByAdmin])).toEqual([['user_admin', true], ['user_coordinator', false]]);
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/app_role\s*=\s*'SYSTEM_ADMIN'/);
    expect(sql).toMatch(/clerk_user_id\s*=\s*a\.recorded_by/);
    // A coordinator who still holds an old (unusable) SYSTEM_ADMIN membership is not marked (S3-P004-033 review).
    expect(sql).toMatch(/NOT EXISTS[\s\S]*app_role\s*=\s*'COORDINATOR'/);
  });
});
