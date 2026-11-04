import { ClearFilters, FilterMenu, SearchField, SegmentedFilter, TableToolbar } from '../../components/table-toolbar/TableToolbar';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { AppLink } from '../../app/navigation';
import { CoordinatorApiError, type CoordinatorClient, type MutationResult } from './client';
import {
  ActionDialog, ActionIcon, LoadMore, PageHeading, Panel, ScopeFields, StatusRegion, chooseScope, readScope, scopeHref, usePagedList, useRead, when,
  type ChosenScope, type Notice,
} from './coordinator-ui';
import { SubjectStudentsDialog } from './SubjectStudentsDialog';
import type { ForecastAuditEntry, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import {
  type ForecastRunDetail, type ForecastRunStatus, type ForecastRunSummary, type NewerForecastAvailable, type RunDecisionAction,
  type RunSectionFlag, type RunSubject, type SubjectDecisionStatus,
} from '../../../../../packages/shared/src/forecasting/runs';

const statusLabels: Record<ForecastRunStatus, string> = { DRAFT: 'Draft', UNDER_REVIEW: 'Under review', FINALIZED: 'Finalized' };
const statusClass: Record<ForecastRunStatus, string> = { DRAFT: 'coordinator-pill-info', UNDER_REVIEW: 'coordinator-pill-warning', FINALIZED: 'coordinator-pill-success' };
const decisionLabels: Record<SubjectDecisionStatus, string> = { NONE: 'No sections', PENDING: 'Pending', REVIEWED: 'Reviewed', APPROVED: 'Approved', DEFERRED: 'Removed', MIXED: 'Mixed' };
const decisionClass: Record<SubjectDecisionStatus, string> = { NONE: '', PENDING: 'coordinator-pill-warning', REVIEWED: 'coordinator-pill-info', APPROVED: 'coordinator-pill-success', DEFERRED: 'coordinator-pill-muted', MIXED: 'coordinator-pill-info' };
const flagLabels: Record<RunSectionFlag, string> = { BELOW_MINIMUM: 'Below minimum', BELOW_OPTIMAL: 'Below optimal', ABOVE_NORMAL_MAXIMUM: 'Above normal maximum' };
const qualityLabels = { SUPPORTED: 'Supported', PRELIMINARY: 'Preliminary', INSUFFICIENT_DATA: 'Insufficient data' } as const;
const actionLabels: Record<string, string> = { START_REVIEW: 'Review started', REVIEW: 'Marked reviewed', APPROVE: 'Approved', DEFER: 'Removed', REPLACE_ALLOCATION: 'Classes changed', REOPEN: 'Added back', FINALIZE: 'Finalized' };
/** Decisions offered as row buttons; REOPEN is only used by Add back. REPLACE_ALLOCATION is not offered: class splitting happens outside this system. */
type SubjectAction = Exclude<RunDecisionAction, 'REPLACE_ALLOCATION' | 'REOPEN'>;
const actionVerb: Record<SubjectAction, { title: string; confirm: string; text: string }> = {
  APPROVE: { title: 'Approve', confirm: 'Approve subject', text: 'Approve this subject for the offering plan.' },
  REVIEW: { title: 'Mark reviewed', confirm: 'Mark reviewed', text: 'Mark this subject as reviewed, without approving it yet.' },
  DEFER: { title: 'Remove', confirm: 'Remove subject', text: 'Remove this subject from the offering plan. You can add it back from Removed subjects.' },
};
const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`;

function FlagBadges({ flags }: { flags: RunSectionFlag[] }) {
  return <>{flags.map(flag => <span key={flag} data-flag={flag} className={'admin-pill ' + (flag === 'ABOVE_NORMAL_MAXIMUM' ? 'coordinator-pill-danger' : 'coordinator-pill-warning')}>{flagLabels[flag]}</span>)}</>;
}
/** Subjects listed in the table: excluded and not-offered subjects are hidden, so they are not counted. */
const shownSubjects = (summary: ForecastRunSummary['summary']) => summary.subjects - summary.excludedSubjects - summary.notOfferedInSemesterTypeSubjects;
function SummaryFacts({ run }: { run: Pick<ForecastRunDetail, 'summary'> }) {
  const s = run.summary;
  const facts: Array<[string, number]> = [['Subjects', shownSubjects(s)], ['Potential demand', s.totalSupportedDemand], ['Below minimum', s.sectionsBelowMinimum], ['Below optimal', s.sectionsBelowOptimal]];
  return <dl className="coordinator-counts" aria-label="Forecast summary">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function NewerBadge({ newer, scope }: { newer: NewerForecastAvailable; scope: ForecastScope }) {
  return <AppLink className="coordinator-newer" href={scopeHref('/coordinator/forecasts', scope, { run: newer.forecastRunId })}>Newer forecast available: version {newer.versionNumber} ({statusLabels[newer.status].toLowerCase()})</AppLink>;
}

const RUN_STATUS_FILTERS = [{ value: '', label: 'All' }, ...(['DRAFT', 'UNDER_REVIEW', 'FINALIZED'] as const).map(value => ({ value, label: statusLabels[value] }))];
type RunSort = 'newest' | 'oldest' | 'demand' | 'pending';
const RUN_SORTS: Array<{ value: RunSort; label: string }> = [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'demand', label: 'Most demand' }, { value: 'pending', label: 'Most awaiting decision' }];
const runOrder: Record<RunSort, (a: ForecastRunSummary, b: ForecastRunSummary) => number> = {
  newest: (a, b) => b.versionNumber - a.versionNumber || b.forecastRunId - a.forecastRunId,
  oldest: (a, b) => a.versionNumber - b.versionNumber || a.forecastRunId - b.forecastRunId,
  demand: (a, b) => b.summary.totalSupportedDemand - a.summary.totalSupportedDemand || b.versionNumber - a.versionNumber,
  pending: (a, b) => b.summary.pendingSections - a.summary.pendingSections || b.versionNumber - a.versionNumber,
};
const openIcon = <ActionIcon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></ActionIcon>;

const SOURCE_META: Record<ForecastRunDetail['dataSource'], { label: string; hint: string }> = {
  SYSTEM: { label: 'System students', hint: 'Student-entered records' },
  CSV: { label: 'CSV upload', hint: 'Coordinator CSV' },
  COMBINED: { label: 'Combined', hint: 'Student-entered records + CSV' },
};
const metaIcons = {
  generated: <ActionIcon><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></ActionIcon>,
  finalized: <ActionIcon><path d="M20 6 9 17l-5-5"/></ActionIcon>,
  snapshot: <ActionIcon><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></ActionIcon>,
  id: <ActionIcon><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/></ActionIcon>,
};
/** Forecast header facts as one row of icon chips. Account IDs are not shown: they mean nothing to a coordinator (names come with the audit history). */
function RunMeta({ run }: { run: ForecastRunDetail }) {
  const source = SOURCE_META[run.dataSource];
  return <ul className="coordinator-meta" aria-label="Forecast details">
    <li><span className={'admin-pill ' + (run.dataSource === 'CSV' ? 'coordinator-pill-neutral' : 'admin-status-active')}>{source.label}</span><span className="coordinator-meta-hint">{source.hint}</span></li>
    <li>{metaIcons.generated}Generated {when(run.generatedAt)}</li>
    {run.finalizedAt && <li>{metaIcons.finalized}Finalized {when(run.finalizedAt)}</li>}
    <li>{metaIcons.snapshot}<AppLink href={scopeHref('/coordinator/imports', run, { import: run.importBatchId })}>Snapshot #{run.importBatchId}</AppLink></li>
    <li>{metaIcons.id}Forecast #{run.forecastRunId}</li>
  </ul>;
}

const STATUS_STEPS: Array<{ value: ForecastRunStatus; help: string }> = [
  { value: 'DRAFT', help: 'Generated, not reviewed yet.' },
  { value: 'UNDER_REVIEW', help: 'Record a decision on each subject.' },
  { value: 'FINALIZED', help: 'Read-only. Next: confirm offerings.' },
];
/** Forecast status dropdown: radio items with a helper line. Status only moves forward one step (Draft -> Under review -> Finalized); picking it opens the existing confirmation dialog. */
interface MenuOption<T extends string> { value: T; label: string; help?: string; checked: boolean; disabled: boolean }
const chevron = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m19 9-7 7-7-7"/></svg>;
/**
 * Dropdown of radio items (Flowbite "dropdown with radio" pattern), used for the forecast status and each subject's action.
 * The popover is fixed to the viewport, so a scrolling table cannot clip it; it follows its button on scroll or resize and opens upwards near the bottom.
 */
function RadioMenu<T extends string>({ label, menuLabel, buttonClass, children, options, onPick }: { label: string; menuLabel: string; buttonClass: string; children: ReactNode; options: Array<MenuOption<T>>; onPick: (value: T) => void }) {
  const [open, setOpen] = useState(false), [place, setPlace] = useState<CSSProperties>({}), root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), popover = useRef<HTMLUListElement>(null), menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside); window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); };
  }, [open]);
  // Keep the fixed popover next to its button (also while the page or the table scrolls); open upwards when there is no room below.
  const position = () => {
    if (!button.current || !popover.current) return;
    const anchor = button.current.getBoundingClientRect(), menu = popover.current.getBoundingClientRect();
    const below = anchor.bottom + 6 + menu.height <= window.innerHeight;
    setPlace({ position: 'fixed', right: 'auto', top: below ? anchor.bottom + 6 : Math.max(8, anchor.top - 6 - menu.height), left: Math.min(Math.max(8, anchor.right - menu.width), window.innerWidth - menu.width - 8) });
  };
  useLayoutEffect(() => { if (open) position(); }, [open]);
  const items = () => Array.from(popover.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
  const openMenu = () => { setPlace({ position: 'fixed', visibility: 'hidden' }); setOpen(true); requestAnimationFrame(() => (items().find(item => item.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus({ preventScroll: true })); };
  const close = (restore: boolean) => { setOpen(false); if (restore) button.current?.focus(); };
  const onMenuKey = (event: KeyboardEvent) => {
    const list = items(), index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length]?.focus(); }
  };
  return <div className="coordinator-status-menu" ref={root}>
    <button type="button" ref={button} className={buttonClass} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={label}
      onClick={() => open ? close(false) : openMenu()} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(); } }}>
      {children}{chevron}
    </button>
    {open && <ul ref={popover} style={place} className={'coordinator-status-popover' + (options.some(option => option.help) ? '' : ' coordinator-status-popover-compact')} id={menuId} role="menu" aria-label={menuLabel} onKeyDown={onMenuKey}>
      {options.map(option => {
        const helpId = `${menuId}-${option.value}`;
        return <li key={option.value} role="none">
          <button type="button" role="menuitemradio" aria-checked={option.checked} aria-disabled={option.disabled ? true : undefined} aria-describedby={option.help ? helpId : undefined} tabIndex={-1} className="coordinator-status-option"
            onClick={() => { if (option.checked) { close(true); return; } if (option.disabled) return; close(true); onPick(option.value); }}>
            <span className="coordinator-status-radio" aria-hidden="true"/>
            <span><span className="coordinator-status-label">{option.label}</span>{option.help && <span id={helpId} className="coordinator-status-help">{option.help}</span>}</span>
          </button></li>;
      })}
    </ul>}
  </div>;
}

/** Forecast status: only the next status can be picked (Draft -> Under review -> Finalized); picking it opens the existing confirmation dialog. */
function StatusMenu({ status, onChange }: { status: ForecastRunStatus; onChange: (next: 'UNDER_REVIEW' | 'FINALIZED') => void }) {
  const current = STATUS_STEPS.findIndex(step => step.value === status), next = STATUS_STEPS[current + 1]?.value;
  return <RadioMenu label={`Forecast status: ${statusLabels[status]}`} menuLabel="Forecast status" buttonClass="admin-primary coordinator-status-button"
    options={STATUS_STEPS.map(step => ({ value: step.value, label: statusLabels[step.value], help: step.help, checked: step.value === status, disabled: step.value !== status && step.value !== next }))}
    onPick={value => onChange(value as 'UNDER_REVIEW' | 'FINALIZED')}>Status: {statusLabels[status]}</RadioMenu>;
}

const ACTION_CHOICES: Array<{ action: SubjectAction; status: SubjectDecisionStatus }> = [{ action: 'APPROVE', status: 'APPROVED' }, { action: 'REVIEW', status: 'REVIEWED' }, { action: 'DEFER', status: 'DEFERRED' }];
/** A subject's action: the current decision as a pill; the menu offers Approved, Reviewed or Removed, each confirmed in a dialog with a reason. */
function ActionMenu({ subject, onDecide }: { subject: RunSubject; onDecide: (action: SubjectAction, subject: RunSubject) => void }) {
  return <RadioMenu label={`Action for ${subject.subjectCode}: ${decisionLabels[subject.decisionStatus]}`} menuLabel={`Action for ${subject.subjectCode}`} buttonClass="coordinator-decision-button"
    options={ACTION_CHOICES.map(choice => ({ value: choice.action, label: decisionLabels[choice.status], checked: subject.decisionStatus === choice.status, disabled: false }))}
    onPick={action => onDecide(action, subject)}><span className={'admin-pill ' + decisionClass[subject.decisionStatus]}>{decisionLabels[subject.decisionStatus]}</span></RadioMenu>;
}

function RunList({ client, scope }: { client: CoordinatorClient; scope: ChosenScope }) {
  // Forecast versions per scope are few, so a page of 100 normally holds the whole list and the filters apply to all of it.
  const list = usePagedList<ForecastRunSummary>(signal => client.listRuns(scope, { limit: 100 }, signal), cursor => client.listRuns(scope, { limit: 100, cursor }), [scope.programmeId, scope.learningCentreId].join('|'));
  const [status, setStatus] = useState(''), [query, setQuery] = useState(''), [sort, setSort] = useState<RunSort>('newest');
  const needle = query.trim().toLowerCase().replace(/^(version|v|#)\s*/, ''), filtering = status !== '' || needle !== '';
  const rows = list.items.filter(run => (!status || run.status === status) && (!needle || [run.versionNumber, run.forecastRunId, run.importBatchId].some(id => String(id) === needle))).sort(runOrder[sort]);
  return <section className="coordinator-setup-section" aria-labelledby="coordinator-runs-heading">
    <div className="admin-card-title"><div><h3 id="coordinator-runs-heading">Forecasts</h3><p className="admin-muted">Each forecast comes from one student data snapshot. Figures are potential demand, not registration.</p></div></div>
    <Panel error={list.error} retry={list.retry} label="forecasts">{list.data && (list.items.length === 0
      ? <div className="admin-empty"><h3>No forecasts yet</h3><p>Generate one from a student data snapshot.</p><AppLink className="coordinator-link-button" href={scopeHref('/coordinator/imports', scope)}>Go to Data Imports</AppLink></div>
      : <><TableToolbar label="Filter and sort forecasts">
          <SegmentedFilter label="Status" options={RUN_STATUS_FILTERS} value={status} onChange={setStatus}/>
          <FilterMenu label="Sort" icon="sort" showValue groups={[{ id: 'sort', heading: 'Sort by', value: sort, noAll: true, options: RUN_SORTS, onChange: value => setSort(value as RunSort) }]}/>
          <SearchField label="Search forecasts" value={query} placeholder="Search version, forecast or import #" maxLength={20} onChange={setQuery}/>
          {filtering && <ClearFilters onClear={() => { setStatus(''); setQuery(''); }}/>}
        </TableToolbar>
        {rows.length === 0
          ? <div className="admin-empty"><h3>No forecasts match</h3><p>Change the status or the search to see more forecasts.</p></div>
          : <div className="admin-table-scroll coordinator-table" role="region" aria-label="Forecasts table" tabIndex={0}>
          <table><thead><tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Generated</th><th scope="col">Subjects</th><th scope="col">Potential demand</th><th scope="col">Sections</th><th scope="col">Awaiting decision</th><th scope="col">Actions</th></tr></thead>
            <tbody>{rows.map(run => <tr key={run.forecastRunId}>
              <td><strong>Version {run.versionNumber}</strong><span className="admin-audit-id">Forecast #{run.forecastRunId} · import #{run.importBatchId}</span>
                {run.newerForecastAvailable && <NewerBadge newer={run.newerForecastAvailable} scope={run}/>}</td>
              <td><span className={'admin-pill ' + statusClass[run.status]}>{statusLabels[run.status]}</span></td><td>{when(run.generatedAt)}</td>
              <td>{shownSubjects(run.summary)}</td><td>{run.summary.totalSupportedDemand}<span className="admin-audit-id">{run.summary.totalUncertain} uncertain</span></td>
              <td>{run.summary.totalSections}</td><td>{run.summary.pendingSections}</td>
              <td><div className="coordinator-row-actions"><AppLink className="coordinator-icon-button" href={scopeHref('/coordinator/forecasts', run, { run: run.forecastRunId })} aria-label={`Open forecast version ${run.versionNumber}`} title="Open forecast">{openIcon}</AppLink></div></td></tr>)}</tbody></table></div>}
        {filtering && list.cursor && <p className="admin-muted">Filters apply to the forecasts loaded so far. Load more to include older ones.</p>}
        {list.loadMoreError && <p className="admin-form-error" role="alert">{list.loadMoreError}</p>}
        <LoadMore cursor={list.cursor} busy={list.loadingMore} onMore={() => void list.more()} label="Load more forecasts"/></>)}
    </Panel>
  </section>;
}

/** Capacity flags of any proposed section, shown once per subject under its demand (sections are not split in this system: the coordinator works from demand). */
const subjectFlags = (subject: RunSubject) => [...new Set(subject.sections.flatMap(section => section.flags))];

type Dialog = null | { kind: 'start' } | { kind: 'finalize' } | { kind: 'decide'; action: SubjectAction; subject: RunSubject } | { kind: 'restore'; subject: RunSubject };

const SORT_LABELS = { name: 'Subject name (A–Z)', code: 'Subject code (A–Z)', demand: 'Potential demand (high to low)' } as const;
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
  const value = (subject: RunSubject) => subject.supportedEligibleCount;
  const alpha = sort === 'name' || sort === 'code';
  return [...list].sort((left, right) => (alpha ? 0 : value(right) - value(left)) || (sort === 'code' ? 0 : left.subjectName.localeCompare(right.subjectName, undefined, { sensitivity: 'base' })) || left.subjectCode.localeCompare(right.subjectCode));
}
const SUBJECT_PAGE_SIZE = 20;
const classTypeLabel = (subject: RunSubject) => subject.classType === 'LAB' ? 'Lab' : subject.classType === 'LECTURE' ? 'Lecture' : 'Class type not set';
const decisionIcons: Record<'RESTORE', ReactNode> = {
  RESTORE: <ActionIcon><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></ActionIcon>,
};
/** Removed (deferred) subjects, beside the Subjects table: name and code only, with an add-back action while the review is open. */
function RemovedSubjects({ subjects, editable, onRestore }: { subjects: RunSubject[]; editable: boolean; onRestore: (subject: RunSubject) => void }) {
  return <aside className="coordinator-removed" aria-labelledby="coordinator-removed-heading">
    <h3 id="coordinator-removed-heading">Removed subjects <span className="admin-pill coordinator-pill-muted">{subjects.length}</span></h3>
    <div className="admin-table-scroll coordinator-table" role="region" aria-label="Removed subjects table" tabIndex={0}>
      <table><thead><tr><th scope="col">Subject</th>{editable && <th scope="col"><span className="admin-sr-only">Action</span></th>}</tr></thead>
        <tbody>{subjects.map(subject => <tr key={subject.subjectId} data-subject={subject.subjectCode}>
          <th scope="row"><strong>{subject.subjectName}</strong><span className="coordinator-subject-code">{subject.subjectCode}</span></th>
          {editable && <td><button type="button" className="coordinator-icon-button" aria-label={`Add back ${subject.subjectCode}`} title="Add back" onClick={() => onRestore(subject)}>{decisionIcons.RESTORE}</button></td>}
        </tr>)}</tbody></table></div>
  </aside>;
}
function SubjectTable({ client, run, editable, pendingIds, onDecide, onRestore }: { client: CoordinatorClient; run: ForecastRunDetail; editable: boolean; pendingIds: number[]; onDecide: (action: SubjectAction, subject: RunSubject) => void; onRestore: (subject: RunSubject) => void }) {
  const [studentsFor, setStudentsFor] = useState<RunSubject | null>(null);
  const listed = run.subjects.filter(subject => !subject.excluded && !subject.semesterTypeExcluded);
  // Removed (deferred) subjects leave the main table and are listed beside it, where they can be added back.
  const subjects = listed.filter(subject => subject.decisionStatus !== 'DEFERRED'), removed = listed.filter(subject => subject.decisionStatus === 'DEFERRED');
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
  const decisionTabs = ['PENDING', 'APPROVED', 'REVIEWED'] as const, otherDecisions = ['MIXED', 'NONE'] as const;
  const toolbar = <TableToolbar label="Filter and sort subjects">
    <SegmentedFilter label="Decision" value={filters.decision} onChange={decision => change({ decision })} options={[{ value: '', label: 'All' }, ...decisionTabs.map(status => ({ value: status, label: decisionLabels[status] }))]}/>
    <FilterMenu groups={[
      { id: 'type', heading: 'Class type', value: filters.type, onChange: type => change({ type }), options: [{ value: 'LECTURE', label: 'Lecture' }, { value: 'LAB', label: 'Lab' }, { value: 'NONE', label: 'Not set' }] },
      { id: 'flag', heading: 'Flags', value: filters.flag, onChange: flag => change({ flag }), options: [{ value: 'BELOW_MINIMUM', label: 'Below minimum' }, { value: 'BELOW_OPTIMAL', label: 'Below optimal' }, { value: 'CONFIG', label: 'Configuration required' }, { value: 'UNCERTAIN', label: 'Has uncertain students' }] },
      { id: 'decision', heading: 'Other decisions', allLabel: 'Any', value: (otherDecisions as readonly string[]).includes(filters.decision) ? filters.decision : '', onChange: decision => change({ decision }), options: otherDecisions.map(status => ({ value: status, label: decisionLabels[status] })) },
    ]}/>
    <FilterMenu label="Sort" icon="sort" showValue groups={[{ id: 'sort', heading: 'Sort by', noAll: true, value: filters.sort, onChange: sort => change({ sort: sort as SubjectSort }), options: Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label })) }]}/>
    <SearchField label="Search subjects" value={filters.q} placeholder="Search subject code or name" onChange={q => change({ q })}/>
    {filtering && <ClearFilters onClear={clear}/>}
  </TableToolbar>;
  const side = removed.length > 0 && <RemovedSubjects subjects={removed} editable={editable} onRestore={onRestore}/>;
  const studentsDialog = studentsFor && <SubjectStudentsDialog client={client} forecastRunId={run.forecastRunId} subjectId={studentsFor.subjectId} subjectCode={studentsFor.subjectCode} onClose={() => setStudentsFor(null)}/>;
  if (matching.length === 0) return <div className="coordinator-subjects-layout"><div className="coordinator-subjects-main">{toolbar}<div className="admin-empty" role="status"><p>{subjects.length === 0 ? 'Every subject has been removed.' : 'No subjects match these filters.'}</p>{filtering && <button type="button" onClick={clear}>Clear filters</button>}</div></div>{side}{studentsDialog}</div>;
  return <div className="coordinator-subjects-layout"><div className="coordinator-subjects-main">{toolbar}<div className="admin-table-scroll coordinator-table coordinator-subjects" role="region" aria-label="Subjects table" tabIndex={0}>
    <table><thead><tr><th scope="col">Subject</th><th scope="col">Potential demand</th><th scope="col">Quality</th><th scope="col">Action</th></tr></thead>
      <tbody>{matching.slice((page - 1) * SUBJECT_PAGE_SIZE, page * SUBJECT_PAGE_SIZE).map(subject => {
        const highlight = pendingIds.includes(subject.subjectId) && subject.decisionStatus === 'PENDING';
        const decidable = editable && subject.configurationStatus === 'CONFIGURED' && subject.sections.length > 0;
        return <tr key={subject.subjectId} className={highlight ? 'coordinator-row-pending' : undefined} data-subject={subject.subjectCode}>
          <th scope="row"><strong>{subject.subjectName}</strong><span className="coordinator-subject-code">{subject.subjectCode}</span><span className="admin-audit-id">{classTypeLabel(subject)} · {subject.creditHours} credit hours</span></th>
          <td><strong className="coordinator-number">{subject.supportedEligibleCount}</strong>{subjectFlags(subject).length > 0 && <div className="coordinator-demand-flags"><FlagBadges flags={subjectFlags(subject)}/></div>}</td>
          <td><span className={'admin-pill ' + (subject.qualityStatus === 'SUPPORTED' ? 'coordinator-pill-success' : subject.qualityStatus === 'PRELIMINARY' ? 'coordinator-pill-warning' : 'coordinator-pill-muted')}>{qualityLabels[subject.qualityStatus]}</span>
            <button type="button" className="coordinator-expander coordinator-students-button" aria-haspopup="dialog" aria-label={`View students for ${subject.subjectCode}`} onClick={() => setStudentsFor(subject)}>{subject.uncertainStudentCount > 0 ? `${subject.uncertainStudentCount} uncertain · View students` : 'View students'}</button>
            {subject.configurationStatus === 'CONFIGURATION_REQUIRED' && <span className="coordinator-config-issue">Configuration required{subject.configurationMessage ? `: ${subject.configurationMessage}` : ''}</span>}</td>
          <td>{decidable ? <ActionMenu subject={subject} onDecide={onDecide}/> : <span className={'admin-pill ' + decisionClass[subject.decisionStatus]}>{decisionLabels[subject.decisionStatus]}</span>}
            {highlight && <span className="coordinator-needed">Decision needed</span>}</td>
        </tr>;
      })}</tbody></table>
  </div>
  {pages > 1 && <div className="admin-pagination"><span>{filtering ? `${matching.length} of ${subjects.length}` : matching.length} subjects · Page {page} of {pages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}</div>{side}{studentsDialog}</div>;
}

function AuditTable({ client, run }: { client: CoordinatorClient; run: ForecastRunDetail }) {
  const audit = usePagedList<ForecastAuditEntry>(signal => client.listAudit(run.forecastRunId, { limit: 20 }, signal), cursor => client.listAudit(run.forecastRunId, { limit: 20, cursor }), 'audit|' + run.forecastRunId);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } void audit.refresh(); }, [run.revision]);
  const codes = new Map(run.subjects.map(subject => [subject.subjectId, subject.subjectCode]));
  return <section className="admin-card" aria-labelledby="coordinator-audit-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-audit-heading">Audit history</h2><p className="admin-muted">Every review step and decision, newest first.</p></div></div>
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
    const decide = (action: SubjectAction, subject: RunSubject) => async (reason: string) => mutate(rev => client.decide(run.forecastRunId, rev, scope, [{ subjectId: subject.subjectId, action, reason }]), `${actionVerb[action].title}: ${subject.subjectCode} recorded.`);
    return <>
      <StatusRegion notice={notice}/>
      <section className="admin-card" aria-labelledby="coordinator-run-heading">
        <AppLink className="admin-back" href={scopeHref('/coordinator/forecasts', run)}>← Back to forecasts</AppLink>
        <div className="admin-card-title"><div><h2 id="coordinator-run-heading" tabIndex={-1} ref={heading}>Forecast version {run.versionNumber}</h2>
          <RunMeta run={run}/></div>
          <div className="coordinator-head-actions">
            <button type="button" onClick={() => void read.reload()}>Refresh</button>
            <StatusMenu status={run.status} onChange={next => setDialog({ kind: next === 'UNDER_REVIEW' ? 'start' : 'finalize' })}/>
          </div></div>
        {run.newerForecastAvailable && <p className="coordinator-newer-wrap"><NewerBadge newer={run.newerForecastAvailable} scope={run}/></p>}
        <SummaryFacts run={run}/>
        {run.status === 'DRAFT' && <p className="admin-muted">Start the review to record decisions on each subject.</p>}
        {run.status === 'FINALIZED' && <p className="coordinator-readonly-note" role="note">This forecast is finalized and read-only. Next step: <AppLink href="/coordinator/decisions">Confirm offerings</AppLink>.</p>}
      </section>
      <section className="admin-card" aria-labelledby="coordinator-subjects-heading">
        <div className="admin-card-title"><div><h2 id="coordinator-subjects-heading">Subjects</h2><p className="admin-muted">Potential demand is the supported eligible pool. Uncertain students are not counted in it.</p></div></div>
        {shown === 0 ? <p className="admin-empty">No subjects are forecast for this scope.</p> : <SubjectTable client={client} run={run} editable={editable} pendingIds={pendingIds} onDecide={(action, subject) => setDialog({ kind: 'decide', action, subject })} onRestore={subject => setDialog({ kind: 'restore', subject })}/>}
      </section>
      <AuditTable client={client} run={run}/>
      {dialog?.kind === 'start' && <ActionDialog title="Start review" confirmLabel="Start review" reasonLabel={null} onCancel={() => setDialog(null)}
        description="Move this draft forecast into review. You can then approve, review or remove each subject."
        onSubmit={() => mutate(rev => client.startReview(run.forecastRunId, rev, scope), 'Review started.')}/>}
      {dialog?.kind === 'decide' && <ActionDialog title={`${actionVerb[dialog.action].title} ${dialog.subject.subjectCode}`} confirmLabel={actionVerb[dialog.action].confirm} onCancel={() => setDialog(null)}
        description={<>{dialog.subject.subjectName}. {actionVerb[dialog.action].text}</>} onSubmit={decide(dialog.action, dialog.subject)}/>}
      {dialog?.kind === 'restore' && <ActionDialog title={`Add back ${dialog.subject.subjectCode}`} confirmLabel="Add back subject" onCancel={() => setDialog(null)}
        description={<>{dialog.subject.subjectName}. Put this subject back in the offering plan. It returns to the Subjects table as pending and needs a new decision.</>}
        onSubmit={async reason => mutate(rev => client.decide(run.forecastRunId, rev, scope, [{ subjectId: dialog.subject.subjectId, action: 'REOPEN', reason }]), `Added back: ${dialog.subject.subjectCode}.`)}/>}
      {dialog?.kind === 'finalize' && <ActionDialog title="Finalize forecast" confirmLabel="Finalize forecast" danger onCancel={() => setDialog(null)}
        description={<>Finalizing freezes this forecast: no decision can change afterwards. Every proposed section must already be reviewed, approved or deferred ({plural(run.summary.pendingSections, 'section')} still pending).</>}
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
    <PageHeading title="Class Offering Forecast"/>
    {runId !== null ? <RunDetail key={runId} client={client} runId={runId}/> :
      <Panel error={context.error} retry={context.retry} label="forecast scope">{context.data && <>
        <section className="admin-card coordinator-setup" aria-labelledby="coordinator-forecast-scope-heading">
          <div className="admin-card-title"><div><h2 id="coordinator-forecast-scope-heading">Forecast scope</h2><p className="admin-muted">Choose a programme, then a learning centre. Imports and forecasts are kept separately for each scope.</p></div></div>
          <div className="coordinator-setup-section"><ScopeFields context={context.data} path="/coordinator/forecasts" programmeId={programmeId} learningCentreId={learningCentreId}/></div>
          {scope ? <RunList key={`${scope.programmeId}-${scope.learningCentreId}`} client={client} scope={scope}/>
            : context.data.programmes.length > 0 && <div className="coordinator-setup-section"><p className="admin-muted">Select a programme and a learning centre to see its forecasts.</p></div>}
        </section>
      </>}</Panel>}
  </>;
}
