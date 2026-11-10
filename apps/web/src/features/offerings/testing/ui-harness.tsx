/** Browser-test entry point only; never exported by the feature or demo. */
import { createRoot } from 'react-dom/client';
import { OfferingsPage } from '../OfferingsPage';
import { OfferingApiError } from '../client';
import { demoContext } from '../../../../../../tools/offerings/demo/fixtures';
import type { OfferingPageData, OfferingWindow, OfferingsClient } from '../../../../../../packages/shared/src/offerings/offerings';
import { richOfferingFixture } from './rich-fixtures';

const scenario = new URLSearchParams(location.search).get('scenario');
let failSave = scenario === 'rich-save-fail';
let rejectSave = scenario === 'reject-save';
const saveCalls: Array<{ semesterId: string; curriculumSubjectIds: string[] }> = [];
Object.assign(window, { __offeringSaveCalls: saveCalls });
const farFuture = '2099-01-01T00:00:00.000Z';
const longAgo = '2020-01-01T00:00:00.000Z';
const openWindow: OfferingWindow = { status: 'OPEN', targetSemesterId: '201', selectionOpensAt: longAgo, selectionClosesAt: '2099-02-01T00:00:00.000Z', learningCentreName: 'Kuala Lumpur' };
/** Selection window scenarios (S2-P004-022). Anything else is an open window with no dates. */
function windowScenario(page: OfferingPageData): OfferingPageData | null {
  switch (scenario) {
    case 'open-dates': return { ...page, window: openWindow };
    case 'limits': return { ...page, window: openWindow, limits: { maxSubjects: 2, maxCredits: 6 } };
    case 'not-open': return { ...page, subjects: [], selection: { semesterId: '201', curriculumSubjectIds: [] }, window: { ...openWindow, status: 'NOT_OPEN', selectionOpensAt: farFuture, selectionClosesAt: null } };
    case 'not-scheduled': return { ...page, subjects: [], selection: { semesterId: '201', curriculumSubjectIds: [] }, window: { ...openWindow, status: 'NOT_SCHEDULED', selectionOpensAt: null, selectionClosesAt: null } };
    case 'no-centre': return { ...page, subjects: [], selection: null, window: { ...openWindow, status: 'NO_LEARNING_CENTRE', learningCentreName: null } };
    case 'no-next': return { ...page, subjects: [], selection: null, window: { status: 'NO_NEXT_SEMESTER', targetSemesterId: null, selectionOpensAt: null, selectionClosesAt: null, learningCentreName: 'Kuala Lumpur' } };
    case 'closed': return { ...page, window: { ...openWindow, status: 'CLOSED', selectionOpensAt: longAgo, selectionClosesAt: '2020-02-01T00:00:00.000Z' }, selection: { semesterId: '201', curriculumSubjectIds: ['101', '102'] } };
    case 'withdrawn': return { ...page, window: openWindow, withdrawnSubjects: [{ subjectId: '9', code: 'DEMO999', name: 'Withdrawn elective', withdrawnAt: '2026-11-09T10:00:00.000Z' }] };
    default: return null;
  }
}
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
    const page: OfferingPageData = { ...demoContext, subjects: scenario === 'empty-catalogue' ? [] : demoContext.subjects,
      semesters: scenario === 'empty-semesters' ? [] : demoContext.semesters,
      selection: semesterId ? { semesterId, curriculumSubjectIds: [] } : null };
    return windowScenario(page) ?? page;
  },
  async save(input) {
    if (rejectSave) { rejectSave = false; throw new OfferingApiError(409, 'OFFERING_NOT_APPROVED', 'A subject you picked is no longer offered. Reload offerings.'); }
    if (failSave) { failSave = false; throw new Error('Simulated save failure.'); }
    saveCalls.push(input);
    return input;
  },
};
createRoot(document.getElementById('root')!).render(<OfferingsPage client={client} demonstration />);
