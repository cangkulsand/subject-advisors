import type { AuthDependencies } from '../auth/contracts';
import type { OfferingContext, OfferingSelection } from '../../../../../packages/shared/src/offerings/offerings';

export interface StudentOfferingContext extends OfferingContext {
  /** Resolved by P001 from the verified Clerk ID, never from request parameters. */
  studentId: string;
}
export interface OfferingScope {
  clerkUserId: string;
  studentId: string;
  curriculumId: string;
}
export interface OfferingRepository {
  read(scope: OfferingScope, semesterId: string): Promise<OfferingSelection>;
  /** Must validate and replace atomically; a failure retains the complete previous set. */
  replace(scope: OfferingScope, input: OfferingSelection): Promise<OfferingSelection>;
}
export interface OfferingDependencies {
  auth: AuthDependencies;
  /** FOUNDATION/P001 supply this reader; null means profile setup is required. */
  contextFor(clerkUserId: string): Promise<StudentOfferingContext | null>;
  repository: OfferingRepository;
}
