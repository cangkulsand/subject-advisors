import { useId, useState } from 'react';
import { AppLink, navigateApp } from '../../app/navigation';
import { TableToolbar, SegmentedFilter, SearchField, FilterMenu, ClearFilters } from '../../components/table-toolbar/TableToolbar';
import type { InitialDemandProjection, InitialDemandSubject } from '../../../../../packages/shared/src/forecasting/initial-demand';
import type { CoordinatorClient } from './client';
import { PageHeading, Panel, ScopeFields, chooseScope, readScope, scopeHref, useRead, usePagedList, LoadMore, type ChosenScope } from './coordinator-ui';
import './initial-demand.css';

const path = '/coordinator/initial-demand';
const filters = [{ value: '', label: 'All' }, { value: 'QUALIFIED', label: 'Qualified' }, { value: 'BELOW_THRESHOLD', label: 'Below 30' }, { value: 'UNCERTAIN', label: 'Uncertain' }];
const status = (row: InitialDemandSubject) => row.excluded ? 'Excluded' : row.outcome === 'QUALIFIED' ? 'Qualified' : row.outcome === 'UNCERTAIN' ? 'Uncertain' : 'Below 30';
export function downloadInitialDemand(data: InitialDemandProjection) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `initial-demand-batch-${data.importBatchId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function Results({ client, scope, batchId }: { client: CoordinatorClient; scope: ChosenScope; batchId: number }) {
  const read = useRead(signal => client.initialDemand(scope, batchId, signal), `${scope.programmeId}|${scope.learningCentreId}|${scope.targetSemesterId}|${batchId}`);
  const [filter, setFilter] = useState(''), [query, setQuery] = useState(''), [sort, setSort] = useState('demand');
  const data = read.data, needle = query.trim().toLowerCase();
  const rows = data?.subjects.filter(row => (!filter || !row.excluded && row.outcome === filter) && (!needle || `${row.subjectCode} ${row.subjectName}`.toLowerCase().includes(needle))).sort((a, b) => sort === 'name' ? a.subjectName.localeCompare(b.subjectName) : b.eligibleDistinctCount - a.eligibleDistinctCount || a.subjectCode.localeCompare(b.subjectCode)) ?? [];
  return <Panel error={read.error} retry={read.retry} label="initial eligible demand">{data && <section className="admin-card p002-demand">
    <div className="admin-card-title"><div><h2>Initial subject consideration list</h2><p>At least {data.threshold} distinct eligible students qualifies a subject for resource review.</p></div>
      <div className="coordinator-row-actions"><button type="button" onClick={read.retry}>Refresh demand</button><button type="button" onClick={() => downloadInitialDemand(data)}>Download handoff JSON</button></div></div>
    <div className="p002-demand-metrics" aria-label="Initial demand summary"><p><strong>{data.studentsInCohort}</strong> distinct students</p><p><strong>{data.qualifiedSubjectIds.length}</strong> qualified subjects</p><p><strong>{data.threshold}</strong> eligibility threshold</p></div>
    <p>Unknown evidence is shown separately and never counts toward 30. This is potential demand for planning; coordinator confirmation follows resource review.</p>
    {(data.ambiguousDuplicateReferences > 0 || data.unresolvedCurriculumStudents > 0) && <p className="coordinator-warning" role="status">Review academic data: {data.ambiguousDuplicateReferences} conflicting student references; {data.unresolvedCurriculumStudents} students with an unresolved curriculum.</p>}
    <TableToolbar label="Filter initial demand"><SegmentedFilter label="Demand status" options={filters} value={filter} onChange={setFilter}/>
      <FilterMenu label="Sort" icon="sort" showValue groups={[{ id: 'sort', heading: 'Sort by', value: sort, noAll: true, options: [{ value: 'demand', label: 'Highest demand' }, { value: 'name', label: 'Subject name' }], onChange: setSort }]}/>
      <SearchField label="Search demand subjects" value={query} onChange={setQuery} placeholder="Search subject name or code" maxLength={120}/>
      {(filter || needle) && <ClearFilters onClear={() => { setFilter(''); setQuery(''); }}/>}</TableToolbar>
    {!data.subjects.length ? <p className="admin-empty">This accepted snapshot has no curriculum subjects to assess. Review its roster and catalogue in Data Imports.</p> : !rows.length ? <p className="admin-empty">No subjects match these filters.</p> : <><p className="admin-muted">Scroll the table horizontally on smaller screens to see demand counts and results.</p><div className="admin-table-scroll p002-demand-table" role="region" aria-label="Initial demand subjects" tabIndex={0}><table><thead><tr><th scope="col">Subject</th><th scope="col">Credits</th><th scope="col">Eligible</th><th scope="col">Uncertain</th><th scope="col">Already passed</th><th scope="col">Prerequisite unmet</th><th scope="col">Not offered</th><th scope="col">Result</th></tr></thead><tbody>{rows.map(row => <tr key={row.subjectId}><td><strong>{row.subjectName}</strong><span className="p002-demand-code">{row.subjectCode}</span></td><td>{row.creditHours}</td><td>{row.eligibleDistinctCount}</td><td>{row.uncertainDistinctCount}{row.uncertainDistinctCount > 0 && <details><summary>Reasons</summary><ul>{Object.entries(row.uncertaintyReasonCounts).map(([reason, count]) => <li key={reason}>{reason.toLowerCase().replaceAll('_', ' ')}: {count}</li>)}</ul></details>}</td><td>{row.passedCount}</td><td>{row.prerequisiteNotMetCount}</td><td>{row.notOfferedCount}</td><td><span className={'admin-pill ' + (row.outcome === 'QUALIFIED' && !row.excluded ? 'admin-status-active' : 'admin-status-suspended')}>{status(row)}</span>{row.excluded && <p>{row.exclusionReason}</p>}</td></tr>)}</tbody></table></div></>}
    <details className="p002-demand-provenance"><summary>Source and handoff provenance</summary><dl><dt>Accepted batch</dt><dd>#{data.importBatchId}</dd><dt>Source fingerprint</dt><dd>{data.sourceFingerprint}</dd><dt>Catalogue fingerprint</dt><dd>{data.catalogueFingerprint}</dd><dt>Demand revision</dt><dd>{data.revision}</dd></dl></details>
    <p><AppLink href={scopeHref('/coordinator/forecasts', scope, { import: batchId })}>Continue to resource refinement →</AppLink></p>
    <p className="admin-muted">The JSON includes the qualified subject IDs and all subject counts for Sharhan’s refinement stage. The existing forecast workspace retains its own review and confirmation controls.</p>
  </section>}</Panel>;
}
function SnapshotPicker({ client, scope, selected }: { client: CoordinatorClient; scope: ChosenScope; selected: number | null }) {
  const id = useId();
  const list = usePagedList(signal => client.listImports(scope, { limit: 100 }, signal), cursor => client.listImports(scope, { limit: 100, cursor }), JSON.stringify(scope));
  return <><section className="admin-card"><h2>Accepted academic snapshot</h2><p>Use an accepted system snapshot, CSV import, or combined snapshot. Create a fresh snapshot after students update their records.</p>
    <Panel error={list.error} retry={list.retry} label="accepted snapshots">{list.data && <>{!list.items.length ? <p className="admin-empty">No accepted snapshots for this scope. <AppLink href={scopeHref('/coordinator/imports', scope)}>Open Data Imports</AppLink> to create one.</p> : <div className="admin-field"><label htmlFor={id}>Academic snapshot</label><select id={id} value={selected ?? ''} onChange={event => navigateApp(scopeHref(path, scope, event.target.value ? { import: event.target.value } : {}), { replace: true })}><option value="">Choose an accepted snapshot</option>{selected && !list.items.some(item => item.importBatchId === selected) && <option value={selected}>Batch #{selected} (linked snapshot)</option>}{list.items.map(item => <option key={item.importBatchId} value={item.importBatchId}>#{item.importBatchId} · {item.sourceLabel} · {item.counts.uniqueStudents} students</option>)}</select></div>}
    {list.loadMoreError && <p role="alert">{list.loadMoreError}</p>}<LoadMore cursor={list.cursor} busy={list.loadingMore} onMore={() => void list.more()} label="Load older snapshots"/></>}</Panel></section>
    {selected && <Results key={`${scope.programmeId}|${scope.learningCentreId}|${scope.targetSemesterId}|${selected}`} client={client} scope={scope} batchId={selected}/>}</>;
}
export function InitialDemandPage({ client, search }: { client: CoordinatorClient; search: string }) {
  const context = useRead(signal => client.context(undefined, signal), 'initial-demand-context');
  const { programmeId, learningCentreId, extra } = readScope(search);
  const value = extra.get('import'), selected = value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const scope = context.data ? chooseScope(context.data, programmeId, learningCentreId) : null;
  return <><PageHeading title="Initial Eligible Demand" text="Identify subjects still needed by at least 30 eligible students before class and resource planning."/>
    <Panel error={context.error} retry={context.retry} label="assigned scope">{context.data && <><section className="admin-card"><h2>Programme and learning centre</h2><ScopeFields context={context.data} path={path} programmeId={programmeId} learningCentreId={learningCentreId}/></section>
    {scope ? <SnapshotPicker key={`${scope.programmeId}|${scope.learningCentreId}|${scope.targetSemesterId}`} client={client} scope={scope} selected={selected}/> : context.data.programmes.length > 0 && context.data.targetSemesterId != null && <section className="admin-card admin-empty"><h2>Choose a scope</h2><p>Select your assigned programme and learning centre to inspect initial demand.</p></section>}</>}</Panel></>;
}
