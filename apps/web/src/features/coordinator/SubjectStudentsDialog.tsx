import { useState } from 'react';
import { ClearFilters, SearchField, SegmentedFilter, TableToolbar } from '../../components/table-toolbar/TableToolbar';
import type { UncertaintyReason } from '../../../../../packages/shared/src/forecasting/contracts';
import type { RunSubjectStudents, SubjectStudentOutcome, SubjectStudentOutcomeKind } from '../../../../../packages/shared/src/forecasting/runs';
import type { CoordinatorClient } from './client';
import { Panel, ReadOnlyDialog, useRead } from './coordinator-ui';

export const reasonLabels: Record<UncertaintyReason, string> = {
  COHORT_STATUS_UNMAPPED: 'Cohort status is not active', HISTORY_UNKNOWN: 'Academic history unknown', HISTORY_PARTIAL: 'Academic history incomplete', SOURCE_STATUS_UNMAPPED: 'Unmapped subject status',
  RETAKE_OUTCOME_UNRESOLVED: 'Repeat attempt still in progress', CREDIT_EVIDENCE_MISSING: 'Credit evidence missing', CGPA_EVIDENCE_MISSING: 'CGPA evidence missing',
  PREREQUISITE_EVIDENCE_MISSING: 'Prerequisite not proven', COREQUISITE_EVIDENCE_MISSING: 'Corequisite not proven', CURRICULUM_VERSION_UNRESOLVED: 'Curriculum version unresolved', REJECTED_HISTORY_ROW: 'History row rejected in import',
};
const statusLabels: Record<SubjectStudentOutcomeKind, string> = {
  SUPPORTED: 'Counted', UNCERTAIN: 'Uncertain', PASSED: 'Already passed', PREREQUISITE_NOT_MET: 'Prerequisite not met', NOT_OFFERED: 'Not offered this semester',
};
const statusClass: Record<SubjectStudentOutcomeKind, string> = {
  SUPPORTED: 'coordinator-pill-success', UNCERTAIN: 'coordinator-pill-warning', PASSED: 'coordinator-pill-muted', PREREQUISITE_NOT_MET: 'coordinator-pill-muted', NOT_OFFERED: 'coordinator-pill-muted',
};
const FILTERS = [
  { value: '', label: 'All' }, { value: 'COUNTED', label: 'Counted' }, { value: 'UNCERTAIN', label: 'Uncertain' }, { value: 'NEAR', label: 'Near graduation' }, { value: 'NOT_COUNTED', label: 'Not counted' },
];
const PAGE_SIZE = 20;

function matchesFilter(student: SubjectStudentOutcome, filter: string) {
  if (filter === 'COUNTED') return student.outcome === 'SUPPORTED';
  if (filter === 'UNCERTAIN') return student.outcome === 'UNCERTAIN';
  if (filter === 'NEAR') return student.nearGraduation;
  if (filter === 'NOT_COUNTED') return student.outcome !== 'SUPPORTED' && student.outcome !== 'UNCERTAIN';
  return true;
}
function Details({ student }: { student: SubjectStudentOutcome }) {
  const lines: string[] = [];
  if (student.uncertaintyReasons.length > 0) lines.push(student.uncertaintyReasons.map(reason => reasonLabels[reason] ?? reason).join('; '));
  if (student.nearGraduation) lines.push(`Near graduation · ${Math.max(0, student.remainingCredits ?? 0)} credits left`);
  if (student.passedByRetake) lines.push('Passed after a repeat attempt');
  if (lines.length === 0) return <>—</>;
  return <>{lines.map(line => <span key={line} className="coordinator-student-details">{line}</span>)}</>;
}

function Roster({ data }: { data: RunSubjectStudents }) {
  const [filter, setFilter] = useState(''), [search, setSearch] = useState(''), [requested, setPage] = useState(1);
  const term = search.trim().toLowerCase(), filtering = filter !== '' || term !== '';
  const matching = data.students.filter(student => matchesFilter(student, filter)
    && (!term || student.externalReference.toLowerCase().includes(term) || (student.studentName ?? '').toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE)), page = Math.min(requested, pages);
  const clear = () => { setFilter(''); setSearch(''); setPage(1); };
  const s = data.summary;
  const facts: Array<[string, number]> = [['Potential demand (counted)', s.counted], ['Uncertain', s.uncertain], ['Near graduation', s.nearGraduation], ['Not counted', s.notCounted]];
  return <>
    <dl className="coordinator-counts" aria-label="Student counts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {s.uncertaintyReasonCounts.length > 0 && <ul className="coordinator-students-reasons" aria-label="Why students are uncertain">
      {s.uncertaintyReasonCounts.map(item => <li key={item.reason}>{reasonLabels[item.reason] ?? item.reason}: {item.count}</li>)}</ul>}
    {!data.catalogueMatchesRun && <p className="coordinator-warning" role="status">This list was recomputed with the current curriculum, so it may differ from the counts saved with this forecast.</p>}
    <TableToolbar label="Filter students">
      <SegmentedFilter label="Show" value={filter} onChange={value => { setFilter(value); setPage(1); }} options={FILTERS}/>
      <SearchField label="Search students" value={search} placeholder="Search matric or name" onChange={value => { setSearch(value); setPage(1); }}/>
      {filtering && <ClearFilters onClear={clear}/>}
    </TableToolbar>
    {matching.length === 0
      ? <div className="admin-empty" role="status"><p>{data.students.length === 0 ? 'No students follow a curriculum that includes this subject.' : 'No students match these filters.'}</p>{filtering && <button type="button" onClick={clear}>Clear filters</button>}</div>
      : <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Students table" tabIndex={0}>
        <table><thead><tr><th scope="col">Student</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
          <tbody>{matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(student => <tr key={student.externalReference} data-student={student.externalReference}>
            <th scope="row"><strong>{student.studentName ?? 'Name not provided'}</strong><span className="coordinator-subject-code">{student.externalReference}</span></th>
            <td><span className={'admin-pill ' + statusClass[student.outcome]}>{statusLabels[student.outcome]}</span></td>
            <td><Details student={student}/></td>
          </tr>)}</tbody></table></div>
        {pages > 1 && <div className="admin-pagination"><span>{filtering ? `${matching.length} of ${data.students.length}` : matching.length} students · Page {page} of {pages}</span>
          <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}</>}
  </>;
}

/** Read-only list of the students behind one subject's numbers. Never changes demand. */
export function SubjectStudentsDialog({ client, forecastRunId, subjectId, subjectCode, onClose }: { client: CoordinatorClient; forecastRunId: number; subjectId: number; subjectCode: string; onClose: () => void }) {
  const read = useRead(signal => client.getSubjectStudents(forecastRunId, subjectId, signal), `students|${forecastRunId}|${subjectId}`);
  return <ReadOnlyDialog title={`Students · ${subjectCode}`} onClose={onClose}>
    <Panel error={read.error} retry={read.retry} label="students">{read.data && <Roster data={read.data}/>}</Panel>
  </ReadOnlyDialog>;
}
