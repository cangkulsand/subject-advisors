import { useEffect, useId, useRef, useState } from 'react';
import { AppLink } from '../../app/navigation';
import { CoordinatorApiError, type CoordinatorClient, type MutationResult } from './client';
import {
  ActionDialog, LoadMore, PageHeading, Panel, ScopeFields, StatusRegion, chooseScope, readScope, scopeHref, usePagedList, useRead, when,
  type ChosenScope, type Notice,
} from './coordinator-ui';
import type { ForecastAuditEntry, ForecastScope, UncertaintyReason } from '../../../../../packages/shared/src/forecasting/contracts';
import {
  RUN_LIMITS, type ForecastRunDetail, type ForecastRunStatus, type ForecastRunSummary, type NewerForecastAvailable, type ReplacementSection, type RunDecisionAction,
  type RunSection, type RunSectionFlag, type RunSubject, type SubjectDecisionStatus,
} from '../../../../../packages/shared/src/forecasting/runs';

const ASSUMPTION_BODY = 'These numbers count students who appear eligible for each subject from their academic history. They are an estimate for planning; student picks come later.';
const statusLabels: Record<ForecastRunStatus, string> = { DRAFT: 'Draft', UNDER_REVIEW: 'Under review', FINALIZED: 'Finalized' };
const statusClass: Record<ForecastRunStatus, string> = { DRAFT: 'coordinator-pill-info', UNDER_REVIEW: 'coordinator-pill-warning', FINALIZED: 'coordinator-pill-success' };
const decisionLabels: Record<SubjectDecisionStatus, string> = { NONE: 'No sections', PENDING: 'Pending', REVIEWED: 'Reviewed', APPROVED: 'Approved', DEFERRED: 'Deferred', MIXED: 'Mixed' };
const decisionClass: Record<SubjectDecisionStatus, string> = { NONE: '', PENDING: 'coordinator-pill-warning', REVIEWED: 'coordinator-pill-info', APPROVED: 'coordinator-pill-success', DEFERRED: 'coordinator-pill-muted', MIXED: 'coordinator-pill-info' };
const flagLabels: Record<RunSectionFlag, string> = { BELOW_MINIMUM: 'Below minimum', BELOW_OPTIMAL: 'Below optimal', ABOVE_NORMAL_MAXIMUM: 'Above normal maximum' };
const qualityLabels = { SUPPORTED: 'Supported', PRELIMINARY: 'Preliminary', INSUFFICIENT_DATA: 'Insufficient data' } as const;
const reasonLabels: Record<UncertaintyReason, string> = {
  COHORT_STATUS_UNMAPPED: 'Cohort status is not active', HISTORY_UNKNOWN: 'Academic history unknown', HISTORY_PARTIAL: 'Academic history incomplete', SOURCE_STATUS_UNMAPPED: 'Unmapped subject status',
  RETAKE_OUTCOME_UNRESOLVED: 'Repeat attempt still in progress', CREDIT_EVIDENCE_MISSING: 'Credit evidence missing', CGPA_EVIDENCE_MISSING: 'CGPA evidence missing',
  PREREQUISITE_EVIDENCE_MISSING: 'Prerequisite not proven', COREQUISITE_EVIDENCE_MISSING: 'Corequisite not proven', CURRICULUM_VERSION_UNRESOLVED: 'Curriculum version unresolved', REJECTED_HISTORY_ROW: 'History row rejected in import',
};
const actionLabels: Record<string, string> = { START_REVIEW: 'Review started', REVIEW: 'Marked reviewed', APPROVE: 'Approved', DEFER: 'Deferred', REPLACE_ALLOCATION: 'Classes changed', FINALIZE: 'Finalized' };
const actionVerb: Record<Exclude<RunDecisionAction, 'REPLACE_ALLOCATION'>, { title: string; confirm: string; text: string }> = {
  APPROVE: { title: 'Approve', confirm: 'Approve subject', text: 'Mark every proposed section of this subject as approved.' },
  REVIEW: { title: 'Mark reviewed', confirm: 'Mark reviewed', text: 'Mark every proposed section of this subject as reviewed, without approving it yet.' },
  DEFER: { title: 'Defer', confirm: 'Defer subject', text: 'Defer this subject. Its sections are kept but not approved.' },
};
const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`;

function FlagBadges({ flags }: { flags: RunSectionFlag[] }) {
  return <>{flags.map(flag => <span key={flag} data-flag={flag} className={'admin-pill ' + (flag === 'ABOVE_NORMAL_MAXIMUM' ? 'coordinator-pill-danger' : 'coordinator-pill-warning')}>{flagLabels[flag]}</span>)}</>;
}
/** Subjects listed in the table: excluded and not-offered subjects are hidden, so they are not counted. */
const shownSubjects = (summary: ForecastRunSummary['summary']) => summary.subjects - summary.excludedSubjects - summary.notOfferedInSemesterTypeSubjects;
function SummaryFacts({ run }: { run: Pick<ForecastRunDetail, 'summary'> }) {
  const s = run.summary;
  const facts: Array<[string, number]> = [['Subjects', shownSubjects(s)], ['Potential demand', s.totalSupportedDemand], ['Uncertain students', s.totalUncertain], ['Proposed sections', s.totalSections], ['Sections awaiting decision', s.pendingSections], ['Below minimum', s.sectionsBelowMinimum], ['Below optimal', s.sectionsBelowOptimal]];
  return <dl className="coordinator-counts" aria-label="Forecast summary">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function NewerBadge({ newer, scope }: { newer: NewerForecastAvailable; scope: ForecastScope }) {
  return <AppLink className="coordinator-newer" href={scopeHref('/coordinator/forecasts', scope, { run: newer.forecastRunId })}>Newer forecast available: version {newer.versionNumber} ({statusLabels[newer.status].toLowerCase()})</AppLink>;
}

function RunList({ client, scope }: { client: CoordinatorClient; scope: ChosenScope }) {
  const list = usePagedList<ForecastRunSummary>(signal => client.listRuns(scope, { limit: 20 }, signal), cursor => client.listRuns(scope, { limit: 20, cursor }), [scope.programmeId, scope.learningCentreId].join('|'));
  return <section className="coordinator-setup-section" aria-labelledby="coordinator-runs-heading">
    <div className="admin-card-title"><div><h3 id="coordinator-runs-heading">Forecasts</h3><p className="admin-muted">Newest first. Each forecast comes from one accepted import. Figures are potential demand, not registration.</p></div></div>
    <Panel error={list.error} retry={list.retry} label="forecasts">{list.data && (list.items.length === 0
      ? <div className="admin-empty"><h3>No forecasts yet</h3><p>Generate one from an accepted import.</p><AppLink className="coordinator-link-button" href={scopeHref('/coordinator/imports', scope)}>Go to Data Imports</AppLink></div>
      : <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Forecasts table" tabIndex={0}>
        <table><thead><tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Generated</th><th scope="col">Subjects</th><th scope="col">Potential demand</th><th scope="col">Sections</th><th scope="col">Awaiting decision</th><th scope="col">Actions</th></tr></thead>
          <tbody>{list.items.map(run => <tr key={run.forecastRunId}>
            <td><strong>Version {run.versionNumber}</strong><span className="admin-audit-id">Forecast #{run.forecastRunId} · import #{run.importBatchId}</span>
              {run.newerForecastAvailable && <NewerBadge newer={run.newerForecastAvailable} scope={run}/>}</td>
            <td><span className={'admin-pill ' + statusClass[run.status]}>{statusLabels[run.status]}</span></td><td>{when(run.generatedAt)}</td>
            <td>{shownSubjects(run.summary)}</td><td>{run.summary.totalSupportedDemand}<span className="admin-audit-id">{run.summary.totalUncertain} uncertain</span></td>
            <td>{run.summary.totalSections}</td><td>{run.summary.pendingSections}</td>
            <td><AppLink className="coordinator-link-button" href={scopeHref('/coordinator/forecasts', run, { run: run.forecastRunId })} aria-label={`Open forecast version ${run.versionNumber}`}>Open</AppLink></td></tr>)}</tbody></table></div>
        {list.loadMoreError && <p className="admin-form-error" role="alert">{list.loadMoreError}</p>}
        <LoadMore cursor={list.cursor} busy={list.loadingMore} onMore={() => void list.more()} label="Load more forecasts"/></>)}
    </Panel>
  </section>;
}

interface AllocationRow { key: number; proposedSectionId?: number; size: string; justification: string }
function AllocationDialog({ subject, onCancel, onSubmit }: { subject: RunSubject; onCancel: () => void; onSubmit: (sections: ReplacementSection[], reason: string) => Promise<void> }) {
  const demand = subject.forecastCount ?? 0;
  const normalMax = Math.max(...subject.sections.map(section => section.normalMaximum));
  const exceptionMax = subject.sections.reduce<number | null>((best, section) => section.exceptionMaximum === null ? best : Math.max(best ?? 0, section.exceptionMaximum), null);
  const hardMax = exceptionMax ?? normalMax, optimal = subject.sections[0]!.breakEvenTarget, minimum = subject.sections[0]!.minimumEnrollment;
  const nextKey = useRef(subject.sections.length);
  const [rows, setRows] = useState<AllocationRow[]>(() => subject.sections.map((section, index) => ({ key: index, proposedSectionId: section.proposedSectionId, size: String(section.expectedStudents), justification: section.justification ?? '' })));
  const sizeOf = (row: AllocationRow) => /^\d+$/.test(row.size.trim()) ? Number(row.size.trim()) : NaN;
  const total = rows.reduce((sum, row) => sum + (Number.isFinite(sizeOf(row)) ? sizeOf(row) : 0), 0);
  const update = (key: number, patch: Partial<AllocationRow>) => setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
  function problems(): string[] {
    const found: string[] = [];
    rows.forEach((row, index) => {
      const size = sizeOf(row);
      if (!Number.isInteger(size) || size < 1) found.push(`Section ${index + 1}: enter a whole number of students, at least 1.`);
      else if (size > hardMax) found.push(`Section ${index + 1}: ${size} students is above the capacity limit of ${hardMax}.`);
      else if (size > normalMax && !row.justification.trim()) { /* the decision reason is used when no justification is given */ }
    });
    if (rows.length > RUN_LIMITS.maxSectionsPerSubject) found.push(`Use at most ${RUN_LIMITS.maxSectionsPerSubject} sections.`);
    if (total !== demand) found.push(`The sections add up to ${total}, but the forecast demand is ${demand}. They must add up to ${demand}.`);
    return found;
  }
  const live = problems();
  return <ActionDialog wide title={`Change classes · ${subject.subjectCode}`} confirmLabel="Save classes"
    description={<>{subject.subjectName}. Split the {demand} students of forecast demand into sections. Normal maximum {normalMax}{exceptionMax !== null ? `, exception maximum ${exceptionMax}` : ''}; optimal {optimal}; minimum {minimum}.</>}
    validate={() => { const found = problems(); return found.length ? found.join(' ') : null; }} onCancel={onCancel}
    onSubmit={async reason => onSubmit(rows.map((row, index): ReplacementSection => ({
      ...(row.proposedSectionId ? { proposedSectionId: row.proposedSectionId } : {}), sectionNumber: index + 1, expectedStudents: sizeOf(row),
      ...(sizeOf(row) > normalMax && row.justification.trim() ? { justification: row.justification.trim() } : {}),
    })), reason)}>
    {busy => <fieldset className="coordinator-allocation" disabled={busy}><legend>Sections</legend>
      {rows.map((row, index) => {
        const size = sizeOf(row), over = Number.isFinite(size) && size > normalMax;
        return <div className="coordinator-allocation-row" key={row.key}>
          <div className="admin-field"><label htmlFor={`alloc-${row.key}`}>Section {index + 1} size</label>
            <input id={`alloc-${row.key}`} inputMode="numeric" value={row.size} aria-invalid={!Number.isInteger(size) || size < 1 || size > hardMax || undefined} onChange={event => update(row.key, { size: event.target.value })}/></div>
          {over && <div className="admin-field"><label htmlFor={`just-${row.key}`}>Section {index + 1} justification (above {normalMax})</label>
            <input id={`just-${row.key}`} value={row.justification} maxLength={RUN_LIMITS.maxJustificationLength} placeholder="Defaults to the reason below" onChange={event => update(row.key, { justification: event.target.value })}/></div>}
          <button type="button" className="admin-row-action" disabled={rows.length === 1} aria-label={`Remove section ${index + 1}`} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove</button>
        </div>;
      })}
      <div className="coordinator-allocation-foot">
        <button type="button" className="admin-row-action" disabled={rows.length >= RUN_LIMITS.maxSectionsPerSubject} onClick={() => setRows(current => [...current, { key: nextKey.current++, size: '', justification: '' }])}>Add section</button>
        <p aria-live="polite" aria-atomic="true" className={total === demand ? 'coordinator-total-ok' : 'coordinator-total-bad'}>Total {total} of {demand} students{total === demand ? '' : total > demand ? ` · ${total - demand} too many` : ` · ${demand - total} left to place`}</p>
      </div>
      {live.length > 0 && !live[0]!.startsWith('The sections add up') && <ul className="coordinator-problems">{live.filter(item => !item.startsWith('The sections add up')).map(item => <li key={item}>{item}</li>)}</ul>}
    </fieldset>}
  </ActionDialog>;
}

function SectionList({ sections }: { sections: RunSection[] }) {
  if (!sections.length) return <span className="admin-muted">No sections proposed</span>;
  return <ul className="coordinator-sections">{sections.map(section => <li key={section.proposedSectionId}><strong>Section {section.sectionNumber}: {section.expectedStudents} students</strong><FlagBadges flags={section.flags}/>
    {section.justification && <span className="admin-audit-id">Justification: {section.justification}</span>}</li>)}</ul>;
}

type Dialog = null | { kind: 'start' } | { kind: 'finalize' } | { kind: 'decide'; action: Exclude<RunDecisionAction, 'REPLACE_ALLOCATION'>; subject: RunSubject } | { kind: 'allocate'; subject: RunSubject };

const SORT_LABELS = { name: 'Subject name (A–Z)', code: 'Subject code (A–Z)', demand: 'Potential demand (high to low)', uncertain: 'Uncertain (high to low)', near: 'Near graduation (high to low)', sections: 'Proposed sections (high to low)' } as const;
type SubjectSort = keyof typeof SORT_LABELS;
interface SubjectFilters { q: string; type: string; decision: string; flag: string; sort: SubjectSort }
const NO_FILTERS: SubjectFilters = { q: '', type: '', decision: '', flag: '', sort: 'name' };
function matchesFilters(subject: RunSubject, { q, type, decision, flag }: SubjectFilters) {
  const term = q.trim().toLowerCase();
  if (term && !subject.subjectCode.toLowerCase().includes(term) && !subject.subjectName.toLowerCase().includes(term)) return false;
  if (type && (subject.classType ?? 'NONE') !== type) return false;
  if (decision && subject.decisionStatus !== decision) return false;
  if (flag === 'BELOW_MINIMUM' || flag === 'BELOW_OPTIMAL') return subject.sections.some(section => section.flags.includes(flag));
  if (flag === 'CONFIG') return subject.configurationStatus === 'CONFIGURATION_REQUIRED';
  if (flag === 'UNCERTAIN') return subject.uncertainStudentCount > 0;
  return true;
}
function sortSubjects(list: RunSubject[], sort: SubjectSort) {
  const value = (subject: RunSubject) => sort === 'demand' ? subject.supportedEligibleCount : sort === 'uncertain' ? subject.uncertainStudentCount : sort === 'near' ? subject.nearGraduationCount : subject.sections.length;
  const alpha = sort === 'name' || sort === 'code';
  return [...list].sort((left, right) => (alpha ? 0 : value(right) - value(left)) || (sort === 'code' ? 0 : left.subjectName.localeCompare(right.subjectName, undefined, { sensitivity: 'base' })) || left.subjectCode.localeCompare(right.subjectCode));
}
const SUBJECT_PAGE_SIZE = 20;
function SubjectTable({ run, editable, pendingIds, onDecide, onAllocate }: { run: ForecastRunDetail; editable: boolean; pendingIds: number[]; onDecide: (action: Exclude<RunDecisionAction, 'REPLACE_ALLOCATION'>, subject: RunSubject) => void; onAllocate: (subject: RunSubject) => void }) {
  const [open, setOpen] = useState<number[]>([]);
  const idBase = useId();
  const subjects = run.subjects.filter(subject => !subject.excluded && !subject.semesterTypeExcluded);
  const [filters, setFilters] = useState(NO_FILTERS), [requested, setPage] = useState(1), filtering = filters.q !== '' || filters.type !== '' || filters.decision !== '' || filters.flag !== '';
  const matching = sortSubjects(subjects.filter(subject => matchesFilters(subject, filters)), filters.sort);
  const pages = Math.max(1, Math.ceil(matching.length / SUBJECT_PAGE_SIZE)), page = Math.min(requested, pages);
  const change = (patch: Partial<SubjectFilters>) => { setFilters(current => ({ ...current, ...patch })); setPage(1); };
  const clear = () => { setFilters(current => ({ ...NO_FILTERS, sort: current.sort })); setPage(1); };
  // After a finalize attempt with unreviewed subjects: clear filters and sorting (a filter could hide them), then show the page of the first one that still needs a decision.
  useEffect(() => {
    const first = sortSubjects(subjects, NO_FILTERS.sort).findIndex(subject => pendingIds.includes(subject.subjectId) && subject.decisionStatus === 'PENDING');
    if (first >= 0) { setFilters(NO_FILTERS); setPage(Math.floor(first / SUBJECT_PAGE_SIZE) + 1); }
  }, [pendingIds]);
  const toolbar = <form className="admin-filters coordinator-subject-filters" role="search" aria-label="Filter and sort subjects" onSubmit={event => event.preventDefault()}>
    <label className="admin-search-field">Search subjects<input type="search" value={filters.q} placeholder="Subject code or name" onChange={event => change({ q: event.target.value })}/></label>
    <label>Class type<select value={filters.type} onChange={event => change({ type: event.target.value })}><option value="">All</option><option value="LECTURE">Lecture</option><option value="LAB">Lab</option><option value="NONE">Not set</option></select></label>
    <label>Decision<select value={filters.decision} onChange={event => change({ decision: event.target.value })}><option value="">All</option>{(['PENDING', 'APPROVED', 'REVIEWED', 'DEFERRED', 'MIXED', 'NONE'] as const).map(status => <option key={status} value={status}>{decisionLabels[status]}</option>)}</select></label>
    <label>Flags<select value={filters.flag} onChange={event => change({ flag: event.target.value })}><option value="">All</option><option value="BELOW_MINIMUM">Below minimum</option><option value="BELOW_OPTIMAL">Below optimal</option><option value="CONFIG">Configuration required</option><option value="UNCERTAIN">Has uncertain students</option></select></label>
    <label>Sort by<select value={filters.sort} onChange={event => change({ sort: event.target.value as SubjectSort })}>{Object.entries(SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {filtering && <button type="button" onClick={clear}>Clear filters</button>}
  </form>;
  if (matching.length === 0) return <>{toolbar}<div className="admin-empty" role="status"><p>No subjects match these filters.</p><button type="button" onClick={clear}>Clear filters</button></div></>;
  return <>{toolbar}<div className="admin-table-scroll coordinator-table coordinator-subjects" role="region" aria-label="Subjects table" tabIndex={0}>
    <table><thead><tr><th scope="col">Subject</th><th scope="col">Class type</th><th scope="col">Potential demand</th><th scope="col">Uncertain</th><th scope="col">Near graduation</th><th scope="col">Quality</th><th scope="col">Proposed sections</th><th scope="col">Decision</th></tr></thead>
      <tbody>{matching.slice((page - 1) * SUBJECT_PAGE_SIZE, page * SUBJECT_PAGE_SIZE).map(subject => {
        const expanded = open.includes(subject.subjectId), reasonsId = `${idBase}-r${subject.subjectId}`, highlight = pendingIds.includes(subject.subjectId) && subject.decisionStatus === 'PENDING';
        const decidable = editable && subject.configurationStatus === 'CONFIGURED' && subject.sections.length > 0;
        return <tr key={subject.subjectId} className={highlight ? 'coordinator-row-pending' : undefined} data-subject={subject.subjectCode}>
          <th scope="row"><strong>{subject.subjectName}</strong><span className="coordinator-subject-code">{subject.subjectCode}</span><span className="admin-audit-id">{subject.creditHours} credit hours</span></th>
          <td>{subject.classType === 'LAB' ? 'Lab' : subject.classType === 'LECTURE' ? 'Lecture' : 'Not set'}</td>
          <td><strong className="coordinator-number">{subject.supportedEligibleCount}</strong></td>
          <td>{subject.uncertainStudentCount === 0 ? '0' : <>
            <button type="button" className="coordinator-expander" aria-expanded={expanded} aria-controls={reasonsId} aria-label={`${subject.uncertainStudentCount} uncertain students for ${subject.subjectCode}, show reasons`}
              onClick={() => setOpen(current => expanded ? current.filter(id => id !== subject.subjectId) : [...current, subject.subjectId])}>{subject.uncertainStudentCount} <span aria-hidden="true">{expanded ? '▴' : '▾'}</span></button>
            <ul id={reasonsId} hidden={!expanded} className="coordinator-reasons">{subject.uncertaintyReasonCounts.map(item => <li key={item.reason}>{reasonLabels[item.reason] ?? item.reason}: {item.count}</li>)}</ul></>}</td>
          <td>{subject.nearGraduationCount}<span className="admin-audit-id">information only</span></td>
          <td><span className={'admin-pill ' + (subject.qualityStatus === 'SUPPORTED' ? 'coordinator-pill-success' : subject.qualityStatus === 'PRELIMINARY' ? 'coordinator-pill-warning' : 'coordinator-pill-muted')}>{qualityLabels[subject.qualityStatus]}</span>
            {subject.configurationStatus === 'CONFIGURATION_REQUIRED' && <span className="coordinator-config-issue">Configuration required{subject.configurationMessage ? `: ${subject.configurationMessage}` : ''}</span>}</td>
          <td><SectionList sections={subject.sections}/></td>
          <td><span className={'admin-pill ' + decisionClass[subject.decisionStatus]}>{decisionLabels[subject.decisionStatus]}</span>
            {highlight && <span className="coordinator-needed">Decision needed</span>}
            {decidable && <div className="coordinator-row-actions">
              {(['APPROVE', 'REVIEW', 'DEFER'] as const).map(action => <button type="button" key={action} className="admin-row-action" aria-label={`${actionVerb[action].title} ${subject.subjectCode}`} onClick={() => onDecide(action, subject)}>{actionVerb[action].title}</button>)}
              <button type="button" className="admin-row-action" aria-label={`Change classes ${subject.subjectCode}`} onClick={() => onAllocate(subject)}>Change classes</button></div>}</td>
        </tr>;
      })}</tbody></table>
  </div>
  {pages > 1 && <div className="admin-pagination"><span>{filtering ? `${matching.length} of ${subjects.length}` : matching.length} subjects · Page {page} of {pages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}</>;
}

function AuditTable({ client, run }: { client: CoordinatorClient; run: ForecastRunDetail }) {
  const audit = usePagedList<ForecastAuditEntry>(signal => client.listAudit(run.forecastRunId, { limit: 20 }, signal), cursor => client.listAudit(run.forecastRunId, { limit: 20, cursor }), 'audit|' + run.forecastRunId);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } void audit.refresh(); }, [run.revision]);
  const codes = new Map(run.subjects.map(subject => [subject.subjectId, subject.subjectCode]));
  return <section className="admin-card" aria-labelledby="coordinator-audit-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-audit-heading">Audit history</h2><p className="admin-muted">Every review step, decision and class change, newest first.</p></div></div>
    <Panel error={audit.error} retry={audit.retry} label="audit history">{audit.data && (audit.items.length === 0 ? <p className="admin-empty">No decisions recorded yet.</p> :
      <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Audit history table" tabIndex={0}>
        <table><thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Subject</th><th scope="col">By</th><th scope="col">Reason</th></tr></thead>
          <tbody>{audit.items.map(entry => <tr key={entry.decisionAuditId}><td>{when(entry.recordedAt)}</td><td>{actionLabels[entry.actionType] ?? entry.actionType}</td>
            <td>{entry.subjectId ? codes.get(entry.subjectId) ?? `#${entry.subjectId}` : 'Whole forecast'}</td><td className="admin-actor">{entry.recordedBy}</td>
            <td className="admin-reason">{entry.reason ?? '—'}
              <details className="coordinator-audit-details"><summary>Before and after</summary><pre>{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre></details></td></tr>)}</tbody></table></div>
        {audit.loadMoreError && <p className="admin-form-error" role="alert">{audit.loadMoreError}</p>}
        <LoadMore cursor={audit.cursor} busy={audit.loadingMore} onMore={() => void audit.more()} label="Load older entries"/></>)}
    </Panel>
  </section>;
}

function RunDetail({ client, runId }: { client: CoordinatorClient; runId: number }) {
  const read = useRead(signal => client.getRun(runId, signal), 'run|' + runId);
  const [notice, setNotice] = useState<Notice>(null), [dialog, setDialog] = useState<Dialog>(null), [pendingIds, setPendingIds] = useState<number[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (read.data) heading.current?.focus(); }, [read.data?.run.forecastRunId]);
  const loaded = read.data;
  const run = loaded?.run, revision = loaded?.revision ?? '';
  const announce = (next: Notice) => { setNotice(next); requestAnimationFrame(() => document.getElementById('coordinator-action-status')?.focus()); };
  async function mutate(op: (revision: string) => Promise<MutationResult>, success: string) {
    try { await op(revision); }
    catch (error) {
      if (error instanceof CoordinatorApiError && error.code === 'RUN_REVISION_MISMATCH') { setDialog(null); setPendingIds([]); announce({ kind: 'warning', text: 'This forecast changed; reloaded.' }); await read.reload(); return; }
      if (error instanceof CoordinatorApiError && ['RUN_FINALIZED', 'RUN_STATE_CONFLICT'].includes(error.code)) void read.reload();
      throw error;
    }
    setDialog(null); announce({ kind: 'success', text: success }); await read.reload();
  }
  return <Panel error={read.error} retry={read.retry} label="forecast">{run && (() => {
    const scope: ForecastScope = { programmeId: run.programmeId, learningCentreId: run.learningCentreId, targetSemesterId: run.targetSemesterId };
    const editable = run.status === 'UNDER_REVIEW', shown = run.subjects.filter(subject => !subject.excluded && !subject.semesterTypeExcluded).length;
    const decide = (action: Exclude<RunDecisionAction, 'REPLACE_ALLOCATION'>, subject: RunSubject) => async (reason: string) => mutate(rev => client.decide(run.forecastRunId, rev, scope, [{ subjectId: subject.subjectId, action, reason }]), `${actionVerb[action].title}: ${subject.subjectCode} recorded.`);
    return <>
      <StatusRegion notice={notice}/>
      <section className="admin-card" aria-labelledby="coordinator-run-heading">
        <AppLink className="admin-back" href={scopeHref('/coordinator/forecasts', run)}>← Back to forecasts</AppLink>
        <div className="admin-card-title"><div><h2 id="coordinator-run-heading" tabIndex={-1} ref={heading}>Forecast version {run.versionNumber} <span className={'admin-pill ' + statusClass[run.status]}>{statusLabels[run.status]}</span></h2>
          <p className="admin-muted">Forecast #{run.forecastRunId} from import #{run.importBatchId} · generated {when(run.generatedAt)} by {run.generatedBy}{run.finalizedAt ? ` · finalized ${when(run.finalizedAt)} by ${run.finalizedBy}` : ''}</p>
          {run.dataSource === 'SYSTEM' && <p><span className="admin-pill admin-status-active">System students</span> <span className="admin-muted">Based on student-entered records.</span></p>}
          {run.dataSource === 'COMBINED' && <p><span className="admin-pill admin-status-active">Combined</span> <span className="admin-muted">Combined: student-entered records + CSV import.</span></p>}</div>
          <div className="coordinator-head-actions">
            <button type="button" onClick={() => void read.reload()}>Refresh</button>
            {run.status === 'DRAFT' && <button type="button" className="admin-primary" onClick={() => setDialog({ kind: 'start' })}>Start review</button>}
            {editable && <button type="button" className="admin-primary" onClick={() => setDialog({ kind: 'finalize' })}>Finalize forecast</button>}
          </div></div>
        {run.newerForecastAvailable && <p className="coordinator-newer-wrap"><NewerBadge newer={run.newerForecastAvailable} scope={run}/></p>}
        <p className="coordinator-assumption" role="note"><strong>Potential demand, not registration.</strong> {ASSUMPTION_BODY}{run.assumptionNote ? <span className="admin-audit-id">{run.assumptionNote}</span> : null}</p>
        <SummaryFacts run={run}/>
        {run.status === 'DRAFT' && <p className="admin-muted">Start the review to record decisions on each subject.</p>}
        {run.status === 'FINALIZED' && <p className="coordinator-readonly-note" role="note">This forecast is finalized and read-only. Next step: <AppLink href="/coordinator/decisions">Confirm offerings</AppLink>.</p>}
      </section>
      <section className="admin-card" aria-labelledby="coordinator-subjects-heading">
        <div className="admin-card-title"><div><h2 id="coordinator-subjects-heading">Subjects</h2><p className="admin-muted">Potential demand is the supported eligible pool. Uncertain students are not counted in it.</p></div></div>
        {shown === 0 ? <p className="admin-empty">No subjects are forecast for this scope.</p> : <SubjectTable run={run} editable={editable} pendingIds={pendingIds} onDecide={(action, subject) => setDialog({ kind: 'decide', action, subject })} onAllocate={subject => setDialog({ kind: 'allocate', subject })}/>}
      </section>
      <AuditTable client={client} run={run}/>
      {dialog?.kind === 'start' && <ActionDialog title="Start review" confirmLabel="Start review" reasonLabel={null} onCancel={() => setDialog(null)}
        description="Move this draft forecast into review. You can then approve, review or defer each subject and change its classes."
        onSubmit={() => mutate(rev => client.startReview(run.forecastRunId, rev, scope), 'Review started.')}/>}
      {dialog?.kind === 'decide' && <ActionDialog title={`${actionVerb[dialog.action].title} ${dialog.subject.subjectCode}`} confirmLabel={actionVerb[dialog.action].confirm} onCancel={() => setDialog(null)}
        description={<>{dialog.subject.subjectName}. {actionVerb[dialog.action].text}</>} onSubmit={decide(dialog.action, dialog.subject)}/>}
      {dialog?.kind === 'allocate' && <AllocationDialog subject={dialog.subject} onCancel={() => setDialog(null)}
        onSubmit={(sections, reason) => mutate(rev => client.decide(run.forecastRunId, rev, scope, [{ subjectId: dialog.subject.subjectId, action: 'REPLACE_ALLOCATION', reason, replacementSections: sections }]), `Classes changed for ${dialog.subject.subjectCode}.`)}/>}
      {dialog?.kind === 'finalize' && <ActionDialog title="Finalize forecast" confirmLabel="Finalize forecast" danger onCancel={() => setDialog(null)}
        description={<>Finalizing freezes this forecast: no decision or class can change afterwards. Every proposed section must already be reviewed, approved or deferred ({plural(run.summary.pendingSections, 'section')} still pending).</>}
        onSubmit={async reason => {
          try { await mutate(rev => client.finalize(run.forecastRunId, rev, scope, { reason }), 'Forecast finalized. It is now read-only.'); }
          catch (error) {
            if (error instanceof CoordinatorApiError && error.code === 'REVIEWS_INCOMPLETE') {
              const ids = Array.isArray(error.details?.pendingSubjectIds) ? (error.details!.pendingSubjectIds as unknown[]).filter((id): id is number => typeof id === 'number') : [];
              const codes = run.subjects.filter(subject => ids.includes(subject.subjectId)).map(subject => subject.subjectCode);
              setDialog(null); setPendingIds(ids);
              announce({ kind: 'warning', text: `${plural(ids.length, 'subject')} still ${ids.length === 1 ? 'needs' : 'need'} a decision before this forecast can be finalized${codes.length ? ': ' + codes.join(', ') : ''}. They are highlighted below.` });
              return;
            }
            throw error;
          }
        }}/>}
    </>;
  })()}</Panel>;
}

export function ForecastsPage({ client, search }: { client: CoordinatorClient; search: string }) {
  const context = useRead(signal => client.context(undefined, signal), 'context');
  const { programmeId, learningCentreId, extra } = readScope(search);
  const runParam = extra.get('run'), runId = runParam && /^[1-9]\d*$/.test(runParam) ? Number(runParam) : null;
  const scope = context.data ? chooseScope(context.data, programmeId, learningCentreId) : null;
  return <>
    <PageHeading title="Class Offering Forecast" text="Review the potential demand for each subject, adjust the proposed classes, and finalize the forecast for your programme and learning centre."/>
    {runId !== null ? <RunDetail key={runId} client={client} runId={runId}/> :
      <Panel error={context.error} retry={context.retry} label="forecast scope">{context.data && <>
        <section className="admin-card coordinator-setup" aria-labelledby="coordinator-forecast-scope-heading">
          <div className="admin-card-title"><div><h2 id="coordinator-forecast-scope-heading">Forecast scope</h2><p className="admin-muted">Choose a programme, then a learning centre. Imports and forecasts are kept separately for each scope.</p></div></div>
          <div className="coordinator-setup-section"><ScopeFields context={context.data} path="/coordinator/forecasts" programmeId={programmeId} learningCentreId={learningCentreId}/></div>
          {scope ? <RunList key={`${scope.programmeId}-${scope.learningCentreId}`} client={client} scope={scope}/>
            : <div className="coordinator-setup-section"><p className="admin-muted">Select a programme and a learning centre to see its forecasts.</p></div>}
        </section>
      </>}</Panel>}
  </>;
}
