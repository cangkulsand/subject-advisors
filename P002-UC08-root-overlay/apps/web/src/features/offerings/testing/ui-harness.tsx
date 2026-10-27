/** Browser-test entry point only; never exported by the feature or demo. */
import { createRoot } from 'react-dom/client';
import { OfferingsPage } from '../OfferingsPage';
import { OfferingApiError } from '../client';
import { demoContext } from '../../../../../../tools/offerings/demo/fixtures';
import type { OfferingsClient } from '../../../../../../packages/shared/src/offerings/offerings';

const scenario = new URLSearchParams(location.search).get('scenario');
const client: OfferingsClient = {
  async load(semesterId) {
    if (scenario === 'forbidden') throw new OfferingApiError(403, 'ROLE_DENIED', 'Your account does not have access to offerings.');
    if (scenario === 'profile') throw new OfferingApiError(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile first.');
    if (scenario === 'session') throw new OfferingApiError(401, 'SESSION_REQUIRED', 'Your session has ended.');
    if (scenario === 'loading') await new Promise<void>(() => undefined);
    return { ...demoContext, subjects: scenario === 'empty-catalogue' ? [] : demoContext.subjects,
      semesters: scenario === 'empty-semesters' ? [] : demoContext.semesters,
      selection: semesterId ? { semesterId, curriculumSubjectIds: [] } : null };
  },
  async save(input) { return input; },
};
createRoot(document.getElementById('root')!).render(<OfferingsPage client={client} />);
