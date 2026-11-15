import type { ProgressSource } from '../p001-sprint2/contracts';
import { progressSql, type Database } from '../p001-sprint2/repository';
import type { Confirmations, GraduationRepository } from './contracts';

const iso = (value: unknown): string | null => value === null || value === undefined ? null : new Date(value as string | number | Date).toISOString();

export function createGraduationRepository(db: Database): GraduationRepository {
  return {
    async source(clerkUserId) {
      const [progressRows, confirmationRows] = await Promise.all([
        db.query(progressSql, [clerkUserId]),
        db.query(`SELECT fees_cleared_confirmed_at, muet_confirmed_at FROM public.student_profile WHERE clerk_user_id=$1`, [clerkUserId]),
      ]);
      const progress = progressRows[0]?.source as ProgressSource | undefined, row = confirmationRows[0];
      if (!progress || !row) return null;
      return { progress, confirmations: { feesClearedConfirmedAt: iso(row.fees_cleared_confirmed_at), muetConfirmedAt: iso(row.muet_confirmed_at) } };
    },
    async save(clerkUserId, value: Confirmations) {
      const rows = await db.query(
        `UPDATE public.student_profile SET fees_cleared_confirmed_at=$2, muet_confirmed_at=$3 WHERE clerk_user_id=$1 RETURNING clerk_user_id`,
        [clerkUserId, value.feesClearedConfirmedAt, value.muetConfirmedAt]);
      return rows.length > 0;
    },
  };
}
