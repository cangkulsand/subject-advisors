/** Browser-test entry point only; never exported by the feature or demo. */
import { createRoot } from 'react-dom/client';
import { OfferingsPage } from '../OfferingsPage';
import { OfferingApiError } from '../client';
import { demoContext } from '../../../../../../tools/offerings/demo/fixtures';
import type { OfferingsClient } from '../../../../../../packages/shared/src/offerings/offerings';
import { richOfferingFixture } from './rich-fixtures';

const scenario = new URLSearchParams(location.search).get('scenario');
let failSave = scenario === 'rich-save-fail';
const saveCalls: Array<{ semesterId: string; curriculumSubjectIds: string[] }> = [];
Object.assign(window, { __offeringSaveCalls: saveCalls });
const client: OfferingsClient = {
  async load(semesterId) {
    if (scenario === 'forbidden') throw new OfferingApiError(403, 'ROLE_DENIED', 'Your account does not have access to offerings.');
    if (scenario === 'profile') throw new OfferingApiError(403, 'PROFILE_SETUP_REQUIRED', 'Complete your academic profile first.');
    if (scenario === 'session') throw new OfferingApiError(401, 'SESSION_REQUIRED', 'Your session has ended.');
    if (scenario === 'loading') await new Promise<void>(() => undefined);
    if (['rich', 'rich-short', 'rich-save-fail', 'history-unavailable', 'progress', 'zero-progress', 'zero-total', 'over-total', 'missing-total'].includes(scenario ?? '')) {
      let fixture = scenario === 'history-unavailable'
        ? { ...richOfferingFixture, academicHistory: { status: 'unavailable' as const } }
        : richOfferingFixture;
      if (['progress', 'zero-progress', 'zero-total', 'over-total', 'missing-total'].includes(scenario ?? '') && fixture.academicHistory?.status === 'available') {
        const records = (scenario === 'zero-progress' ? [] : fixture.academicHistory.records.filter(record => record.subjectId !== '79')).map(record =>
          record.subjectId === '71' ? { ...record, recognizedCredits: 85 } :
            record.subjectId === '72' ? { ...record, recognizedCredits: 11 } : record);
        const totalCreditRequired = scenario === 'zero-total' ? 0 : scenario === 'over-total' ? 90 : 131;
        fixture = { ...fixture, curriculum: { ...fixture.curriculum, totalCreditRequired }, academicHistory: { status: 'available', records } };
        if (scenario === 'missing-total') {
          const curriculum = { ...fixture.curriculum }; delete curriculum.totalCreditRequired;
          fixture = { ...fixture, curriculum };
        }
      }
      const currentSemesterId = scenario === 'rich-short' ? '203' : '201';
      return { ...fixture, currentSemesterId, selection: fixture.selection?.semesterId === currentSemesterId ? fixture.selection : { semesterId: currentSemesterId, curriculumSubjectIds: [] } };
    }
    return { ...demoContext, subjects: scenario === 'empty-catalogue' ? [] : demoContext.subjects,
      semesters: scenario === 'empty-semesters' ? [] : demoContext.semesters,
      selection: semesterId ? { semesterId, curriculumSubjectIds: [] } : null };
  },
  async save(input) {
    if (failSave) { failSave = false; throw new Error('Simulated save failure.'); }
    saveCalls.push(input);
    return input;
  },
};
createRoot(document.getElementById('root')!).render(<OfferingsPage client={client} demonstration />);
