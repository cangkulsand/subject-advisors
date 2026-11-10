import { neon } from '@neondatabase/serverless';
import type { AuthBindings } from '../auth';
import type { AuthDependencies } from '../auth/contracts';
import { createAcademicSetupRepository } from '../admin/academic-repository';
import { createAdminIdentities } from '../admin/identities';
import { createDbScopeProvider } from './scope-provider';
import { createForecastingRepository } from './repository';
import { createOfferingDecisionsRepository } from './decisions-repository';
import { createForecastRunsRepository } from './runs-repository';
import { handleForecastingRequest } from './routes';
import type { PortalContact } from './contracts';
export { handleForecastingRequest } from './routes';

export function createForecastingHandler(env: Pick<AuthBindings, 'DATABASE_URL' | 'CLERK_SECRET_KEY'>, auth: AuthDependencies) {
  const sql = neon(env.DATABASE_URL);
  // sql.transaction submits the statements as one non-interactive HTTP transaction (BEGIN ... COMMIT, rolled back on any error).
  const query = async (text: string, values: unknown[]) => await sql.query(text, values) as Record<string, unknown>[];
  const transaction = async (statements: Array<{ text: string; values: unknown[] }>) =>
    await sql.transaction(statements.map(statement => sql.query(statement.text, statement.values))) as Record<string, unknown>[][];
  const repository = createForecastingRepository(query, transaction);
  const runs = createForecastRunsRepository(query, transaction);
  const decisions = createOfferingDecisionsRepository(query, transaction);
  // Live, uncached reads of the admin academic setup (migration 0008): assignments, current semester, active centres.
  // Student centre: the learning centre saved in the student's profile (S2-P004-023); null when none.
  const studentCentre = async (studentId: number) => {
    const rows = await query('SELECT learning_centre_id FROM public.student_profile WHERE student_id = $1', [studentId]);
    return rows[0]?.learning_centre_id == null ? null : Number(rows[0].learning_centre_id);
  };
  const scopes = createDbScopeProvider(createAcademicSetupRepository(query, transaction), studentCentre);
  const identities = createAdminIdentities(env.CLERK_SECRET_KEY);
  // Portal student -> live matric number and Clerk account (student_profile), then the primary email in pages of 100 (the identity lookup's bound).
  const portalContacts = async (studentIds: number[]) => {
    const contacts = new Map<number, PortalContact>();
    if (!studentIds.length) return { contacts, emailsAvailable: true };
    const rows = await query('SELECT student_id, clerk_user_id, matric_no FROM public.student_profile WHERE student_id = ANY($1::int[])', [studentIds]);
    const accounts = rows.map(row => ({ studentId: Number(row.student_id), clerkUserId: String(row.clerk_user_id), matricNo: typeof row.matric_no === 'string' && row.matric_no.trim() ? row.matric_no.trim() : null }));
    for (const account of accounts) contacts.set(account.studentId, { matricNo: account.matricNo, email: null });
    try {
      for (let start = 0; start < accounts.length; start += 100) {
        const page = accounts.slice(start, start + 100), found = await identities.lookup(page.map(account => account.clerkUserId));
        for (const account of page) contacts.get(account.studentId)!.email = found.get(account.clerkUserId)?.email ?? null;
      }
    } catch { return { contacts, emailsAvailable: false }; }
    return { contacts, emailsAvailable: true };
  };
  return (request: Request) => handleForecastingRequest(request, { auth, repository, runs, decisions, scopes, portalContacts });
}
