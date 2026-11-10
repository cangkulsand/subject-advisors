import { useState } from 'react';
import { ClearFilters, SearchField, TableToolbar } from '../../components/table-toolbar/TableToolbar';
import type { ForecastScope } from '../../../../../packages/shared/src/forecasting/contracts';
import type { DecisionPickers } from '../../../../../packages/shared/src/forecasting/offering-decisions';
import type { CoordinatorClient } from './client';
import { Panel, ReadOnlyDialog, useRead } from './coordinator-ui';

const PAGE_SIZE = 20;

/**
 * Picker lists already loaded on the open forecast page, keyed by `subjectId` (the page shows one scope and one semester).
 * Memory only: the lists hold personal data, so they are never written to browser storage (docs/cachingguide.md rule 9).
 * The page clears the cache on Refresh and when it is left.
 */
export type PickerListCache = Map<string, DecisionPickers>;

function Pickers({ data }: { data: DecisionPickers }) {
  const [search, setSearch] = useState(''), [requested, setPage] = useState(1);
  const term = search.trim().toLowerCase(), filtering = term !== '';
  const matching = data.pickers.filter(picker => !term || [picker.studentName, picker.matricNo ?? '', picker.email ?? ''].some(value => value.toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE)), page = Math.min(requested, pages);
  const clear = () => { setSearch(''); setPage(1); };
  if (data.pickers.length === 0) return <div className="admin-empty" role="status"><p>No student picked this subject.</p></div>;
  return <>
    {!data.emailsAvailable && <p className="coordinator-warning" role="status">Sign-in emails could not be loaded, so students without a matric number show no contact detail.</p>}
    <TableToolbar label="Filter pickers">
      <SearchField label="Search pickers" value={search} placeholder="Search name, matric or email" onChange={value => { setSearch(value); setPage(1); }}/>
      {filtering && <ClearFilters onClear={clear}/>}
    </TableToolbar>
    {matching.length === 0
      ? <div className="admin-empty" role="status"><p>No students match this search.</p><button type="button" onClick={clear}>Clear filters</button></div>
      : <><div className="admin-table-scroll coordinator-table" role="region" aria-label="Pickers table" tabIndex={0}>
        <table><thead><tr><th scope="col">Student</th></tr></thead>
          <tbody>{matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(picker => <tr key={picker.studentId} data-student={picker.studentId}>
            <th scope="row"><strong>{picker.studentName}</strong>{(picker.matricNo ?? picker.email) && <span className="coordinator-subject-code">{picker.matricNo ?? picker.email}</span>}</th>
          </tr>)}</tbody></table></div>
        {pages > 1 && <div className="admin-pagination"><span>{filtering ? `${matching.length} of ${data.pickers.length}` : matching.length} students · Page {page} of {pages}</span>
          <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}</>}
  </>;
}

function LoadPickers({ client, scope, subjectId, cache }: { client: CoordinatorClient; scope: ForecastScope; subjectId: number; cache: PickerListCache }) {
  const read = useRead(async signal => {
    const data = await client.getPickers(scope, subjectId, signal);
    cache.set(String(subjectId), data);
    return data;
  }, 'pickers|' + subjectId);
  return <Panel error={read.error} retry={read.retry} label="pickers">{read.data && <Pickers data={read.data}/>}</Panel>;
}

/** Read-only list of the students who picked one approved subject, after selection closed. Reopening a subject uses the page's cache. */
export function SubjectPickersDialog({ client, scope, subjectId, subjectCode, cache, onClose }: { client: CoordinatorClient; scope: ForecastScope; subjectId: number; subjectCode: string; cache: PickerListCache; onClose: () => void }) {
  const cached = cache.get(String(subjectId));
  return <ReadOnlyDialog title={`Picked · ${subjectCode}`} onClose={onClose}>
    {cached ? <Pickers data={cached}/> : <LoadPickers client={client} scope={scope} subjectId={subjectId} cache={cache}/>}
  </ReadOnlyDialog>;
}
