/** UC10 client surface kept separate for consumers that only need semester-plan operations. */
export { createStudentSelectionClient, parseSemesterSelectionPageData } from './client';
export type { StudentSelectionClient } from './client';
export type { SaveSemesterSelection, SemesterSelectionPageData } from '../../../../../packages/shared/src/forecasting/semester-selection-contracts';
