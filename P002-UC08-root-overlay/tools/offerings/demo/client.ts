import type { OfferingSelection, OfferingsClient } from '../../../packages/shared/src/offerings/offerings';
import { OfferingApiError } from '../../../apps/web/src/features/offerings/client';
import { demoContext } from './fixtures';

export const DEMO_STORAGE_KEY = 'p002.uc08.fictional-demo.v2';

function pause(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 160);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  });
}
/** Explicitly non-production. Uses this browser only; never simulates Clerk or a real API. */
export function createDemoClient() {
  let failSave = false;
  let failLoad = false;
  function read(): Record<string, string[]> {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (!raw) return {};
      const value: unknown = JSON.parse(raw);
      const subjects = new Set(demoContext.subjects.map(subject => subject.curriculumSubjectId));
      const semesters = new Set(demoContext.semesters.map(semester => semester.semesterId));
      if (typeof value !== 'object' || value === null || Array.isArray(value) ||
          Object.entries(value).some(([key, ids]) => !semesters.has(key) || !Array.isArray(ids) ||
            ids.some(id => typeof id !== 'string' || !subjects.has(id)) || new Set(ids).size !== ids.length)) throw new Error('Invalid demo data');
      return value as Record<string, string[]>;
    } catch { throw new OfferingApiError(503, 'DEMO_STORAGE_UNAVAILABLE', 'Demo storage is unavailable or invalid. Use Reset demo data, or allow browser storage.'); }
  }
  const api: OfferingsClient = {
    async load(semesterId, signal) {
      await pause(signal);
      if (failLoad) { failLoad = false; throw new OfferingApiError(503, 'DEMO_LOAD_FAILURE', 'Simulated loading failure. Retry loading to recover your saved demo offerings.'); }
      const selections = read();
      return {
        ...demoContext,
        selection: semesterId ? { semesterId, curriculumSubjectIds: selections[semesterId] ?? [] } : null,
      };
    },
    async save(input: OfferingSelection) {
      await pause();
      if (failSave) { failSave = false; throw new OfferingApiError(503, 'DEMO_SAVE_FAILURE', 'Simulated save failure. The previous browser-saved offering list has not changed.'); }
      const previous = read();
      try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...previous, [input.semesterId]: input.curriculumSubjectIds })); }
      catch { throw new OfferingApiError(503, 'DEMO_STORAGE_UNAVAILABLE', 'This browser could not store the demo offerings. Allow storage, then retry.'); }
      return { semesterId: input.semesterId, curriculumSubjectIds: [...input.curriculumSubjectIds] };
    },
  };
  return {
    api,
    failNextSave() { failSave = true; },
    failNextLoad() { failLoad = true; },
    reset() { localStorage.removeItem(DEMO_STORAGE_KEY); failSave = false; failLoad = false; },
  };
}
