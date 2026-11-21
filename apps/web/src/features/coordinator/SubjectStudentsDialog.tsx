import { useState } from 'react';
import { ClearFilters, SearchField, SegmentedFilter, TableToolbar } from '../../components/table-toolbar/TableToolbar';
import type { UncertaintyReason } from '../../../../../packages/shared/src/forecasting/contracts';
import type { RunSubjectStudent, SubjectStudentOutcomeKind } from '../../../../../packages/shared/src/forecasting/runs';
import type { LiveSubjectStudents } from '../../../../../packages/shared/src/forecasting/live';
import { Panel, ReadOnlyDialog, useRead } from './coordinator-ui';
import { HELP, Help } from './coordinator-help';
import { PagerButtons } from '../../components/icon-button/IconButton';

export const reasonLabels: Record<UncertaintyReason, string> = {
  COHORT_STATUS_UNMAPPED: 'Cohort status is not active', HISTORY_UNKNOWN: 'Academic history unknown', HISTORY_PARTIAL: 'Academic history incomplete', SOURCE_STATUS_UNMAPPED: 'Unmapped subject status',
  RETAKE_OUTCOME_UNRESOLVED: 'Repeat attempt still in progress', CREDIT_EVIDENCE_MISSING: 'Credit evidence missing', CGPA_EVIDENCE_MISSING: 'CGPA evidence missing',
  PREREQUISITE_EVIDENCE_MISSING: 'Prerequisite not proven', COREQUISITE_EVIDENCE_MISSING: 'Corequisite not proven', CURRICULUM_VERSION_UNRESOLVED: 'Curriculum version unresolved', REJECTED_HISTORY_ROW: 'History row rejected in import',
};
const statusLabels: Record<SubjectStudentOutcomeKind, string> = {
  SUPPORTED: 'Counted', UNCERTAIN: 'Records incomplete', PASSED: 'Already passed', PREREQUISITE_NOT_MET: 'Prerequisite not met', NOT_OFFERED: 'Not offered this semester',
};
const statusClass: Record<SubjectStudentOutcomeKind, string> = {
  SUPPORTED: 'coordinator-pill-success', UNCERTAIN: 'coordinator-pill-muted', PASSED: 'coordinator-pill-muted', PREREQUISITE_NOT_MET: 'coordinator-pill-muted', NOT_OFFERED: 'coordinator-pill-muted',
};
const FILTERS = [
  // Uncertain students are shown as Not counted (S3-P004-030): they were never counted as eligible.
  { value: 'COUNTED', label: 'Counted' }, { value: 'NEAR', label: 'Near graduation' }, { value: 'NOT_COUNTED', label: 'Not counted' },
];
/** The list opens on the students counted as eligible to take: that is who the coordinator clicked the count to see. */
const DEFAULT_FILTER = 'COUNTED';
const PAGE_SIZE = 20;

function matchesFilter(student: RunSubjectStudent, filter: string) {
  if (filter === 'COUNTED') return student.outcome === 'SUPPORTED';
  if (filter === 'NEAR') return student.nearGraduation;
  return student.outcome !== 'SUPPORTED';
}
function Details({ student }: { student: RunSubjectStudent }) {
  const lines: string[] = [];
  if (student.uncertaintyReasons.length > 0) lines.push(student.uncertaintyReasons.map(reason => reasonLabels[reason] ?? reason).join('; '));
  if (student.nearGraduation) lines.push(`Near graduation · ${Math.max(0, student.remainingCredits ?? 0)} credits left`);
  if (student.passedByRetake) lines.push('Passed after a repeat attempt');
  if (lines.length === 0) return <>—</>;
  return <>{lines.map(line => <span key={line} className="coordinator-student-details">{line}</span>)}</>;
}

/** `expectedCounted`: the table's eligible count; the list is a second live read, so a record changed in between shows a note. */
function Roster({ data, expectedCounted }: { data: LiveSubjectStudents; expectedCounted: number }) {
  const [filter, setFilter] = useState(DEFAULT_FILTER), [search, setSearch] = useState(''), [requested, setPage] = useState(1);
  const term = search.trim().toLowerCase(), filtering = filter !== DEFAULT_FILTER || term !== '';
  const matching = data.students.filter(student => matchesFilter(student, filter)
    && (!term || [student.externalReference, student.studentName ?? '', student.matricNo ?? '', student.email ?? ''].some(value => value.toLowerCase().includes(term))));
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE)), page = Math.min(requested, pages);
  const clear = () => { setFilter(DEFAULT_FILTER); setSearch(''); setPage(1); };
  const s = data.summary;
  const facts: Array<[string, number, string]> = [['Eligible to take (counted)', s.counted, HELP.counted], ['Near graduation', s.nearGraduation, HELP.nearGraduation], ['Not counted', s.notCounted + s.uncertain, HELP.notCounted]];
  return <>
    {data.summary.counted !== expectedCounted && <p className="coordinator-warning" role="status">Student data changed since this page was calculated. Refresh the page to update the numbers.</p>}
    <dl className="coordinator-counts" aria-label="Student counts">{facts.map(([label, value, help]) => <div key={label}><dt><Help label={label} text={help}/></dt><dd>{value}</dd></div>)}</dl>
    {!data.emailsAvailable && <p className="coordinator-warning" role="status">Sign-in emails could not be loaded, so portal students without a matric number show their portal reference.</p>}
    <TableToolbar label="Filter students">
      <SegmentedFilter label="Show" value={filter} onChange={value => { setFilter(value); setPage(1); }} options={FILTERS}/>
      <SearchField label="Search students" value={search} placeholder="Search name, matric or email" onChange={value => { setSearch(value); setPage(1); }}/>
      {filtering && <ClearFilters onClear={clear}/>}
    </TableToolbar>
    {matching.length === 0
      ? <div className="admin-empty" role="status"><p>{data.students.length === 0 ? 'No students follow a curriculum that includes this subject.' : filtering ? 'No students match these filters.' : 'No students are counted as eligible to take this subject.'}</p>{filtering && <button type="button" onClick={clear}>Clear filters</button>}</div>
      : <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Students table" tabIndex={0}>
        <table><thead><tr><th scope="col"><Help label="Student" text={HELP.student}/></th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
          <tbody>{matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(student => <tr key={student.externalReference} data-student={student.externalReference}>
            <th scope="row"><strong>{student.studentName ?? 'Name not provided'}</strong><span className="coordinator-subject-code">{student.matricNo ?? student.email ?? student.externalReference}</span></th>
            <td><span className={'admin-pill ' + statusClass[student.outcome]}>{statusLabels[student.outcome]}</span></td>
            <td><Details student={student}/></td>
          </tr>)}</tbody></table></div>
        {pages > 1 && <div className="admin-pagination"><span>{filtering ? `${matching.length} of ${data.students.length}` : matching.length} students · Page {page} of {pages}</span>
          <PagerButtons page={page} pages={pages} onPage={setPage}/></div>}</>}
  </>;
}

/**
 * Student lists already loaded on the open forecast page, keyed by subject. Memory only: the lists hold personal data, so they are
 * never written to browser storage (docs/cachingguide.md). The live forecast is recalculated on Refresh, which clears this cache,
 * so a list always matches the numbers on screen (S3-P004-032).
 */
export type StudentListCache = Map<string, LiveSubjectStudents>;

function LoadRoster({ load, cache, cacheKey, expectedCounted }: { load: (signal: AbortSignal) => Promise<LiveSubjectStudents>; cache: StudentListCache; cacheKey: string; expectedCounted: number }) {
  const read = useRead(async signal => {
    const data = await load(signal);
    cache.set(cacheKey, data);
    return data;
  }, 'students|' + cacheKey);
  return <Panel error={read.error} retry={read.retry} label="students">{read.data && <Roster data={read.data} expectedCounted={expectedCounted}/>}</Panel>;
}

/** Read-only list of the students behind one subject's numbers. Never changes demand. Reopening a subject uses the page's cache. */
export function SubjectStudentsDialog({ load, cacheKey, subjectCode, expectedCounted, cache, onClose }: { load: (signal: AbortSignal) => Promise<LiveSubjectStudents>; cacheKey: string; subjectCode: string; expectedCounted: number; cache: StudentListCache; onClose: () => void }) {
  const cached = cache.get(cacheKey);
  return <ReadOnlyDialog title={`Students · ${subjectCode}`} onClose={onClose}>
    {cached ? <Roster data={cached} expectedCounted={expectedCounted}/> : <LoadRoster load={load} cache={cache} cacheKey={cacheKey} expectedCounted={expectedCounted}/>}
  </ReadOnlyDialog>;
}
