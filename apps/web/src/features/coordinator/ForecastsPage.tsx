import { ClearFilters, FilterMenu, SearchField, SegmentedFilter, TableToolbar } from '../../components/table-toolbar/TableToolbar';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ToastStack } from '../../components/feedback/ToastStack';
import { useToastNotifications } from '../../components/feedback/useToastNotifications';
import { CoordinatorApiError, type CoordinatorClient } from './client';
import {
  ActionIcon, LoadMore, PageHeading, Panel, ScopeFields, chooseScope, errorText, readScope, usePagedList, useRead, when,
  type ChosenScope,
} from './coordinator-ui';
import { SubjectPickersDialog, type PickerListCache } from './SubjectPickersDialog';
import { SubjectStudentsDialog, type StudentListCache } from './SubjectStudentsDialog';
import { HELP, Help } from './coordinator-help';
import type { ClassType, ForecastContext, ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { LiveForecast, LiveSubject } from '../../../../../packages/shared/src/forecasting/live';
import type { OfferingDecision, OfferingDecisionAuditEntry, OfferingDecisionSet, OfferingDecisionStatus } from '../../../../../packages/shared/src/forecasting/offering-decisions';
import { IconButton, PagerButtons } from '../../components/icon-button/IconButton';

const statusLabels: Record<OfferingDecisionStatus, string> = { PENDING: 'Pending', APPROVED: 'Approved', REMOVED: 'Removed' };
const statusClass: Record<OfferingDecisionStatus, string> = { PENDING: 'coordinator-pill-warning', APPROVED: 'coordinator-pill-success', REMOVED: 'coordinator-pill-muted' };
const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`;

interface MenuOption<T extends string> { value: T; label: string; help?: string; checked: boolean; disabled: boolean }
const chevron = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m19 9-7 7-7-7"/></svg>;
/**
 * Dropdown of radio items (Flowbite "dropdown with radio" pattern), used for each subject's action (Pending, Approved, Removed).
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

/** One row of the decisions table: a live forecast subject merged with its stored decision (no decision = Pending). Subjects decided earlier but absent from the live forecast have no counts. */
interface SubjectRow {
  subjectId: number; subjectCode: string; subjectName: string; creditHours: number; classType: ClassType;
  status: OfferingDecisionStatus; inForecast: boolean; run: LiveSubject | null;
  /** Students whose curriculum has the subject and who have not passed it; null without a breakdown or outside the forecast. */
  notTaken: number | null;
  /** Supported eligible students; null when the subject is not in the live forecast. */
  eligible: number | null;
}
function buildRows(forecast: LiveForecast, decisions: OfferingDecision[]): SubjectRow[] {
  const decided = new Map(decisions.map(decision => [decision.subjectId, decision]));
  const rows: SubjectRow[] = forecast.subjects.filter(subject => !subject.excluded && !subject.semesterTypeExcluded).map(subject => ({
    subjectId: subject.subjectId, subjectCode: subject.subjectCode, subjectName: subject.subjectName, creditHours: subject.creditHours, classType: subject.classType,
    status: decided.get(subject.subjectId)?.status ?? 'PENDING', inForecast: true, run: subject,
    notTaken: subject.breakdown ? subject.breakdown.inCurriculum - subject.breakdown.alreadyPassed : null, eligible: subject.supportedEligibleCount,
  }));
  const listed = new Set(rows.map(row => row.subjectId));
  for (const decision of decisions) if (!listed.has(decision.subjectId)) rows.push({
    subjectId: decision.subjectId, subjectCode: decision.subjectCode, subjectName: decision.subjectName, creditHours: decision.creditHours, classType: decision.classType,
    status: decision.status, inForecast: false, run: null, notTaken: null, eligible: null,
  });
  return rows;
}

const studentsIcon = <svg className="coordinator-count-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const SORT_LABELS = { eligible: 'Eligible to take', name: 'Subject name', code: 'Subject code' } as const;
type SubjectSort = keyof typeof SORT_LABELS;
interface SubjectFilters { q: string; type: string; status: string; sort: SubjectSort }
const NO_FILTERS: SubjectFilters = { q: '', type: '', status: '', sort: 'eligible' };
function matchesFilters(row: SubjectRow, { q, type, status }: SubjectFilters) {
  const term = q.trim().toLowerCase();
  if (term && !row.subjectCode.toLowerCase().includes(term) && !row.subjectName.toLowerCase().includes(term)) return false;
  if (type && (row.classType ?? 'NONE') !== type) return false;
  if (status && row.status !== status) return false;
  return true;
}
const byName = (left: SubjectRow, right: SubjectRow) => left.subjectName.localeCompare(right.subjectName, undefined, { sensitivity: 'base' }) || left.subjectCode.localeCompare(right.subjectCode);
/** Default order: most eligible students first (subjects outside the forecast last), then by name. */
function sortRows(list: SubjectRow[], sort: SubjectSort) {
  return [...list].sort((left, right) => sort === 'code' ? left.subjectCode.localeCompare(right.subjectCode)
    : sort === 'name' ? byName(left, right) : ((right.eligible ?? -1) - (left.eligible ?? -1)) || byName(left, right));
}
const SUBJECT_PAGE_SIZE = 20;
const classTypeLabel = (classType: ClassType) => classType === 'LAB' ? 'Lab' : classType === 'LECTURE' ? 'Lecture' : 'Class type not set';
const restoreIcon = <ActionIcon><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></ActionIcon>;

/** A subject's action: the current status as a pill; the menu offers Pending, Approved or Removed and a click applies it at once (no dialog, no reason). */
function ActionMenu({ row, onDecide }: { row: SubjectRow; onDecide: (row: SubjectRow, status: OfferingDecisionStatus) => void }) {
  return <RadioMenu label={`Action for ${row.subjectCode}: ${statusLabels[row.status]}`} menuLabel={`Action for ${row.subjectCode}`} buttonClass="coordinator-decision-button"
    options={(['PENDING', 'APPROVED', 'REMOVED'] as const).map(status => ({ value: status, label: statusLabels[status], checked: row.status === status, disabled: false }))}
    onPick={status => onDecide(row, status)}><span className={'admin-pill ' + statusClass[row.status]}>{statusLabels[row.status]}</span></RadioMenu>;
}

/** Removed subjects, beside the Subjects table: name and code only, with an add-back action (back to Pending) while decisions are editable. */
function RemovedSubjects({ rows, editable, onRestore }: { rows: SubjectRow[]; editable: boolean; onRestore: (row: SubjectRow) => void }) {
  return <aside className="coordinator-removed" aria-labelledby="coordinator-removed-heading">
    <h3 id="coordinator-removed-heading">Removed subjects <span className="admin-pill coordinator-pill-muted">{rows.length}</span></h3>
    <div className="admin-table-scroll coordinator-table" role="region" aria-label="Removed subjects table" tabIndex={0}>
      <table><thead><tr><th scope="col">Subject</th>{editable && <th scope="col"><span className="admin-sr-only">Action</span></th>}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.subjectId} data-subject={row.subjectCode}>
          <th scope="row"><strong>{row.subjectName}</strong><span className="coordinator-subject-code">{row.subjectCode}</span>{!row.inForecast && <span className="admin-pill coordinator-pill-muted">not in the forecast</span>}</th>
          {editable && <td><button type="button" className="coordinator-icon-button" aria-label={`Add back ${row.subjectCode}`} title="Add back" onClick={() => onRestore(row)}>{restoreIcon}</button></td>}
        </tr>)}</tbody></table></div>
  </aside>;
}

function SubjectTable({ client, scope, rows, studentCache, pickerCache, editable, closed, pickCounts, onDecide }: { client: CoordinatorClient; scope: ForecastScope; rows: SubjectRow[]; studentCache: StudentListCache; pickerCache: PickerListCache; editable: boolean; closed: boolean; pickCounts: Map<number, number>; onDecide: (row: SubjectRow, status: OfferingDecisionStatus) => void }) {
  const [studentsFor, setStudentsFor] = useState<SubjectRow | null>(null), [pickersFor, setPickersFor] = useState<SubjectRow | null>(null);
  // Removed subjects leave the main table and are listed beside it, where they can be added back.
  const subjects = rows.filter(row => row.status !== 'REMOVED'), removed = sortRows(rows.filter(row => row.status === 'REMOVED'), 'name');
  const [filters, setFilters] = useState(NO_FILTERS), [requested, setPage] = useState(1), filtering = filters.q !== '' || filters.type !== '' || filters.status !== '';
  const matching = sortRows(subjects.filter(row => matchesFilters(row, filters)), filters.sort);
  const pages = Math.max(1, Math.ceil(matching.length / SUBJECT_PAGE_SIZE)), page = Math.min(requested, pages);
  const change = (patch: Partial<SubjectFilters>) => { setFilters(current => ({ ...current, ...patch })); setPage(1); };
  const clear = () => { setFilters(current => ({ ...NO_FILTERS, sort: current.sort })); setPage(1); };
  const toolbar = <TableToolbar label="Filter and sort subjects">
    <SegmentedFilter label="Status" value={filters.status} onChange={status => change({ status })} options={[{ value: '', label: 'All' }, { value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }]}/>
    <FilterMenu groups={[
      { id: 'type', heading: 'Class type', value: filters.type, onChange: type => change({ type }), options: [{ value: 'LECTURE', label: 'Lecture' }, { value: 'LAB', label: 'Lab' }, { value: 'NONE', label: 'Not set' }] },
    ]}/>
    <FilterMenu label="Sort" icon="sort" showValue groups={[{ id: 'sort', heading: 'Sort by', noAll: true, value: filters.sort, onChange: sort => change({ sort: sort as SubjectSort }), options: Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label })) }]}/>
    <SearchField label="Search subjects" value={filters.q} placeholder="Search subject code or name" onChange={q => change({ q })}/>
    {filtering && <ClearFilters onClear={clear}/>}
  </TableToolbar>;
  const side = removed.length > 0 && <RemovedSubjects rows={removed} editable={editable} onRestore={row => onDecide(row, 'PENDING')}/>;
  const pickersDialog = pickersFor && <SubjectPickersDialog client={client} scope={scope} subjectId={pickersFor.subjectId} subjectCode={pickersFor.subjectCode} cache={pickerCache} onClose={() => setPickersFor(null)}/>;
  const studentsDialog = studentsFor && <SubjectStudentsDialog load={signal => client.getLiveSubjectStudents(scope, studentsFor.subjectId, signal)} cacheKey={String(studentsFor.subjectId)} subjectCode={studentsFor.subjectCode} cache={studentCache} onClose={() => setStudentsFor(null)}/>;
  if (matching.length === 0) return <div className="coordinator-subjects-layout"><div className="coordinator-subjects-main">{toolbar}<div className="admin-empty" role="status"><p>{subjects.length === 0 ? 'Every subject has been removed.' : 'No subjects match these filters.'}</p>{filtering && <button type="button" onClick={clear}>Clear filters</button>}</div></div>{side}{studentsDialog}{pickersDialog}</div>;
  return <div className="coordinator-subjects-layout"><div className="coordinator-subjects-main">{toolbar}<div className="admin-table-scroll coordinator-table coordinator-subjects coordinator-decisions" role="region" aria-label="Subjects table" tabIndex={0}>
    <table><thead><tr><th scope="col">Subject</th><th scope="col"><Help label="Not taken yet" text={HELP.notTakenYet}/></th><th scope="col"><Help label="Eligible to take" text={HELP.eligible}/></th><th scope="col"><Help label="Action" text={HELP.action}/></th>{closed && <th scope="col"><Help label="Picked" text={HELP.picked}/></th>}</tr></thead>
      <tbody>{matching.slice((page - 1) * SUBJECT_PAGE_SIZE, page * SUBJECT_PAGE_SIZE).map(row => <tr key={row.subjectId} data-subject={row.subjectCode}>
        <th scope="row"><strong>{row.subjectName}</strong><span className="coordinator-subject-code">{row.subjectCode}</span><span className="admin-audit-id">{classTypeLabel(row.classType)} · {row.creditHours} credit hours</span>
          {!row.inForecast && <span className="admin-pill coordinator-pill-muted">not in the forecast</span>}</th>
        <td><strong className="coordinator-number">{row.notTaken ?? '—'}</strong></td>
        <td>{row.run
          ? <button type="button" className="coordinator-count-button" aria-haspopup="dialog" aria-label={`View students for ${row.subjectCode}`} title="View students" onClick={() => setStudentsFor(row)}>
            <span className="coordinator-number">{row.eligible ?? 0}</span>{studentsIcon}</button>
          : <strong className="coordinator-number">{row.eligible ?? '—'}</strong>}</td>
        <td>{editable ? <ActionMenu row={row} onDecide={onDecide}/> : <span className={'admin-pill ' + statusClass[row.status]}>{statusLabels[row.status]}</span>}</td>
        {closed && <td>{row.status === 'APPROVED'
          ? <><strong className="coordinator-number">{pickCounts.get(row.subjectId) ?? 0}</strong>
            <button type="button" className="coordinator-expander coordinator-students-button" aria-haspopup="dialog" aria-label={`View pickers for ${row.subjectCode}`} onClick={() => setPickersFor(row)}>View pickers</button></>
          : <strong className="coordinator-number">—</strong>}</td>}
      </tr>)}</tbody></table>
  </div>
  {pages > 1 && <div className="admin-pagination"><span>{filtering ? `${matching.length} of ${subjects.length}` : matching.length} subjects · Page {page} of {pages}</span><PagerButtons page={page} pages={pages} onPage={setPage}/></div>}</div>{side}{studentsDialog}{pickersDialog}</div>;
}

function AuditTable({ audit }: { audit: ReturnType<typeof usePagedList<OfferingDecisionAuditEntry>> }) {
  return <section className="admin-card" aria-labelledby="coordinator-audit-heading">
    <div className="admin-card-title"><div><h2 id="coordinator-audit-heading">Audit history</h2><p className="admin-muted">Every change of a subject's status, newest first.</p></div></div>
    <Panel error={audit.error} retry={audit.retry} label="audit history">{audit.data && (audit.items.length === 0 ? <p className="admin-empty">No decisions recorded yet.</p> :
      <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Audit history table" tabIndex={0}>
        <table><thead><tr><th scope="col">When</th><th scope="col">Change</th><th scope="col">Subject</th><th scope="col">By</th><th scope="col">Snapshot</th></tr></thead>
          <tbody>{audit.items.map(entry => <tr key={entry.auditId}><td>{when(entry.recordedAt)}</td><td>{statusLabels[entry.beforeStatus]} → {statusLabels[entry.afterStatus]}</td>
            <th scope="row"><strong>{entry.subjectName}</strong><span className="coordinator-subject-code">{entry.subjectCode}</span></th><td className="admin-actor">{entry.recordedBy}</td>
            <td>{entry.importBatchId ? `Snapshot #${entry.importBatchId}` : '—'}</td></tr>)}</tbody></table></div>
        {audit.loadMoreError && <p className="admin-form-error" role="alert">{audit.loadMoreError}</p>}
        <LoadMore cursor={audit.cursor} busy={audit.loadingMore} onMore={() => void audit.more()} label="Load older entries"/></>)}
    </Panel>
  </section>;
}

/** "Selection not scheduled" / "Selection opens …" / "Selection open until …" / "Selection closed …". */
function phaseText(set: OfferingDecisionSet) {
  const { selectionOpensAt, selectionClosesAt } = set.semester;
  if (set.phase === 'PLANNING') return selectionOpensAt ? `Selection opens ${when(selectionOpensAt)}` : 'Selection not scheduled';
  if (set.phase === 'OPEN') return selectionClosesAt ? `Selection open until ${when(selectionClosesAt)}` : 'Selection open';
  return `Selection closed ${when(selectionClosesAt)}`;
}
/** The live forecast of one scope, with the decision of every subject (S3-P004-032). The semester is always the next Normal one (`targetSemesterId`); there is no snapshot or semester choice. */
function Forecast({ client, scope, scopeFields }: { client: CoordinatorClient; scope: ChosenScope; scopeFields: ReactNode }) {
  const scopeKey = [scope.programmeId, scope.learningCentreId, scope.targetSemesterId].join('|');
  const { toasts, notify, dismissToast, onToastAnimationEnd } = useToastNotifications();
  // Calculated from the students in the system on every read; nothing is stored.
  const forecast = useRead(signal => client.getLiveForecast(scope, signal), 'live|' + scopeKey);
  const decisions = useRead(signal => client.getDecisions(scope, signal), 'decisions|' + scopeKey);
  const audit = usePagedList<OfferingDecisionAuditEntry>(signal => client.listDecisionAudit(scope, { limit: 20 }, signal), cursor => client.listDecisionAudit(scope, { limit: 20, cursor }), 'decision-audit|' + scopeKey);
  const studentCache = useRef<StudentListCache>(new Map()), pickerCache = useRef<PickerListCache>(new Map()), busy = useRef(false);
  const live = forecast.data, set = decisions.data;
  // Student and picker lists hold personal data: memory only, dropped when the scope changes or the page is left (Refresh clears them too).
  useEffect(() => { const students = studentCache.current, pickers = pickerCache.current; students.clear(); pickers.clear(); return () => { students.clear(); pickers.clear(); }; }, [scopeKey]);

  /** One click applies the change: no dialog, no reason. A toast confirms it; a stale or locked answer reloads the decisions. */
  async function decide(row: SubjectRow, status: OfferingDecisionStatus) {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await client.decide({ scope, subjectId: row.subjectId, status, expectedStatus: row.status, importBatchId: null });
      // While selection is open, taking an approved subject away withdraws it from the students who picked it.
      if (result.phase === 'OPEN' && result.beforeStatus === 'APPROVED' && result.afterStatus !== 'APPROVED') notify(result.affectedPicks > 0 ? `${row.subjectCode} withdrawn. ${plural(result.affectedPicks, 'student')} who picked it will see a note.` : `${row.subjectCode} withdrawn.`);
      else if (result.beforeStatus !== result.afterStatus) notify(result.afterStatus === 'APPROVED' ? `${row.subjectCode} approved.` : result.afterStatus === 'REMOVED' ? `${row.subjectCode} removed.`
        : result.beforeStatus === 'REMOVED' ? `${row.subjectCode} added back.` : `${row.subjectCode} set back to pending.`);
    } catch (error) {
      if (error instanceof CoordinatorApiError && error.code === 'DECISION_STALE') notify('This subject was changed by someone else; reloaded.', 'warning');
      else if (error instanceof CoordinatorApiError && ['SEMESTER_READ_ONLY', 'SELECTION_CLOSED'].includes(error.code)) notify(error.message, 'warning');
      else { notify(errorText(error), 'danger'); busy.current = false; return; }
    }
    try { await Promise.all([decisions.reload(), audit.refresh()]); } finally { busy.current = false; }
  }
  const refresh = () => { studentCache.current.clear(); pickerCache.current.clear(); void forecast.reload(); void decisions.reload(); void audit.refresh(); };

  const rows = live && set ? buildRows(live, set.decisions) : null;
  const pending = rows ? rows.filter(row => row.status === 'PENDING').length : 0;
  return <>
    <section className="admin-card coordinator-setup" aria-label="Forecast scope">
      <div className="coordinator-setup-section">{scopeFields}</div>
      {set && rows && live && <div className="coordinator-setup-section">
        <p className="coordinator-phase" role="status">{phaseText(set)} · {plural(pending, 'subject')} still pending</p>
        <p className="admin-muted">Live student data · calculated {when(live.calculatedAt)}</p>
        {set.phase === 'PLANNING' && pending > 0 && <p className="coordinator-warning" role="status">{pending === 1 ? "1 subject still pending; it won't be shown to students unless approved." : `${pending} subjects still pending; they won't be shown to students unless approved.`}</p>}
      </div>}
    </section>
    <section className="admin-card" aria-labelledby="coordinator-subjects-heading">
      <div className="admin-card-title"><div><h2 id="coordinator-subjects-heading">Subjects</h2><p className="admin-muted">Eligible students are a forecast, not registration.{set?.editable === false ? " Decisions are locked." : " Choose an action for each subject; it applies at once."}</p></div>
        <IconButton icon="refresh" label="Refresh" onClick={refresh}/></div>
      <Panel error={forecast.error ?? decisions.error} retry={() => { forecast.retry(); decisions.retry(); }} label="forecast">{rows && live && set && (live.studentsInScope === 0 && rows.length === 0
        ? <p className="admin-empty">No students in this programme and learning centre yet.</p>
        : rows.length === 0 ? <p className="admin-empty">No subjects are forecast for this scope.</p>
        : <SubjectTable client={client} scope={scope} rows={rows} studentCache={studentCache.current} pickerCache={pickerCache.current} editable={set.editable} closed={set.phase === 'CLOSED'} pickCounts={new Map(set.pickCounts.map(item => [item.subjectId, item.pickCount]))} onDecide={(row, status) => void decide(row, status)}/>)}
      </Panel>
    </section>
    <AuditTable audit={audit}/>
    <ToastStack toasts={toasts} onDismiss={dismissToast} onExitAnimationEnd={onToastAnimationEnd}/>
  </>;
}

export function ForecastsPage({ client, search }: { client: CoordinatorClient; search: string }) {
  const context = useRead(signal => client.context(undefined, signal), 'context');
  const { programmeId, learningCentreId } = readScope(search);
  const scope = context.data ? chooseScope(context.data, programmeId, learningCentreId) : null;
  const fields = (data: ForecastContext) => <ScopeFields context={data} path="/coordinator/forecasts" programmeId={programmeId} learningCentreId={learningCentreId}/>;
  return <>
    <PageHeading title="Class Offering Forecast" text="See how many students can take each subject in the next Normal semester (Short semesters are arranged separately), then decide which subjects are offered."/>
    <Panel error={context.error} retry={context.retry} label="forecast scope">{context.data && (scope
      ? <Forecast key={`${scope.programmeId}-${scope.learningCentreId}`} client={client} scope={scope} scopeFields={fields(context.data)}/>
      : <section className="admin-card coordinator-setup" aria-label="Forecast scope">
        <div className="coordinator-setup-section">{fields(context.data)}</div>
        {context.data.programmes.length > 0 && <div className="coordinator-setup-section"><p className="admin-muted">Select a programme and a learning centre to see its forecast.</p></div>}
      </section>)}
    </Panel>
  </>;
}
