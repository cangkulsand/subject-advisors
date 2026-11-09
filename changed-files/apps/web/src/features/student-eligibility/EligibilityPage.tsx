import { useEffect, useMemo, useState } from 'react';
import { AppLink } from '../../app/navigation';
import { ClearFilters, SearchField, SegmentedFilter, TableToolbar } from '../../components/table-toolbar/TableToolbar';
import type { EligibilityResult } from '../../../../../packages/shared/src/forecasting/student-eligibility';
import { StudentEligibilityApiError, type StudentEligibilityClient, type StudentEligibilityData } from './client';
import { SemesterSelectionPanel } from './SemesterSelectionPanel';
import '../../app/typography.css';
import './eligibility.css';

type StatusFilter = 'ALL' | 'ELIGIBLE' | 'INELIGIBLE' | 'REVIEW';
const statusOptions = [
  { value: 'ALL', label: 'All' }, { value: 'ELIGIBLE', label: 'Eligible' },
  { value: 'INELIGIBLE', label: 'Ineligible' }, { value: 'REVIEW', label: 'Review' },
];
const statusLabel = (status: EligibilityResult['status']) => status === 'ELIGIBLE' ? 'Eligible' : status === 'CONDITIONAL' ? 'Conditional' : status === 'INELIGIBLE' ? 'Ineligible' : 'Needs review';
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export function EligibilityPage({ client }: { client: StudentEligibilityClient }) {
  const [data, setData] = useState<StudentEligibilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const refresh = () => { if (selectionDirty) setConfirmRefresh(true); else setAttempt(value => value + 1); };

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError(null);
    client.load(controller.signal).then(value => {
      if (active) { setData(value); setLoading(false); }
    }, reason => { if (active) { setError(reason); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [client, attempt]);

  const filtered = useMemo(() => (data?.results ?? []).filter(result => {
    const statusMatches = status === 'ALL' || (status === 'REVIEW' ? result.status === 'UNCERTAIN' || result.status === 'CONDITIONAL' : result.status === status);
    const term = search.trim().toLowerCase();
    return statusMatches && (!term || `${result.subjectName} ${result.subjectCode} ${result.explanation}`.toLowerCase().includes(term));
  }), [data, status, search]);
  const clear = () => { setStatus('ALL'); setSearch(''); };
  const hasFilters = status !== 'ALL' || Boolean(search.trim());
  const blocked = error instanceof StudentEligibilityApiError && [401, 403].includes(error.status);

  return <section className="student-eligibility" aria-busy={loading}>
    <header className="student-eligibility-header">
      <div><h1>Subject eligibility</h1><p>Review your eligibility for subjects confirmed for your next semester.</p></div>
      <button type="button" className="student-eligibility-refresh" onClick={refresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </header>
    {confirmRefresh && <div className="semester-selection-error" role="alertdialog" aria-label="Discard selection draft before refreshing"><p>Refreshing eligibility will reload the selection page and discard your unsaved draft.</p><div className="semester-selection-actions"><button type="button" onClick={() => { setConfirmRefresh(false); setSelectionDirty(false); setAttempt(value => value + 1); }}>Refresh and discard draft</button><button type="button" className="student-eligibility-secondary" onClick={() => setConfirmRefresh(false)}>Keep editing</button></div></div>}

    {loading && <div className="student-eligibility-panel" role="status">Loading confirmed offerings and your academic evidence…</div>}
    {!loading && error !== null && <div className="student-eligibility-panel student-eligibility-error" role="alert">
      <h2>{blocked ? 'Account access required' : 'Eligibility is unavailable'}</h2>
      <p>{error instanceof StudentEligibilityApiError ? error.message : 'We could not reach eligibility services. Please retry.'}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry loading</button>
      {error instanceof StudentEligibilityApiError && error.status === 401 && <p><a href="/sign-in">Sign in</a></p>}
    </div>}

    {!loading && !error && data && data.state === 'NO_ACTIVE_CONFIRMATION' && <div className="student-eligibility-panel" role="status">
      <h2>Offerings are not confirmed yet</h2>
      <p>Your coordinator has not confirmed offerings for your next semester. Eligibility will appear here after a confirmed list is available.</p>
          <p>While you wait, review <AppLink href="/student/records">your academic records</AppLink> and <AppLink href="/student/pathway">your pathway</AppLink>.</p>
    </div>}

    {data?.state === 'AVAILABLE' && !(error instanceof StudentEligibilityApiError && [401, 403].includes(error.status)) && <>
      <section className="student-eligibility-provenance" aria-label="Confirmation details">
        <h2>Coordinator-confirmed offerings</h2>
        <dl>
          <div><dt>Confirmation</dt><dd>Revision {data.confirmationRevision} · recorded {dateLabel(data.confirmedAt!)}</dd></div>
          {data.scope && <div><dt>Target scope</dt><dd>{data.scopeLabels ? `${data.scopeLabels.programmeName} · ${data.scopeLabels.learningCentreName} · ${data.scopeLabels.targetSemesterLabel}` : 'Your programme · your learning centre · next semester'}</dd></div>}
        </dl>
        <p className="student-eligibility-basis">{data.centreBasis}</p>
      </section>

      {!data.results.length ? <div className="student-eligibility-panel" role="status">
        <h2>No confirmed subjects match your curriculum</h2>
        <p>The confirmed list is available, but it contains no subjects in your curriculum for this target scope.</p>
        <p>Review <AppLink href="/student/profile">your academic profile</AppLink> or <AppLink href="/student/pathway">your pathway</AppLink> if these details look wrong.</p>
      </div> : <section className="student-eligibility-results" aria-label="Eligibility results">
        <TableToolbar label="Filter eligibility results">
          <SegmentedFilter label="Eligibility status" options={statusOptions} value={status} onChange={value => setStatus(value as StatusFilter)} />
          <SearchField label="Find a subject" value={search} onChange={setSearch} placeholder="Search subjects" maxLength={120} />
          {hasFilters && <ClearFilters onClear={clear} />}
        </TableToolbar>
        <p className="student-eligibility-count" role="status">Showing {filtered.length} of {data.results.length} subjects</p>
        {!filtered.length ? <div className="student-eligibility-panel"><h2>No matching subjects</h2><p>Change the status filter or search terms.</p></div> : <>
          <p className="student-eligibility-table-hint">Scroll the results table horizontally to see credits and explanations.</p>
          <div className="student-eligibility-table-scroll" role="region" aria-label="Eligibility results table; scroll horizontally" tabIndex={0}>
            <table className="student-eligibility-table"><thead><tr><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Credits</th><th scope="col">Why</th></tr></thead><tbody>
              {filtered.map(result => <tr key={result.subjectId}>
                <th scope="row"><strong>{result.subjectName}</strong><span className="student-eligibility-code">{result.subjectCode}</span></th>
                <td><span className={`student-eligibility-status is-${result.status.toLowerCase()}`}>{statusLabel(result.status)}</span></td>
                <td className="student-eligibility-credits">{result.creditHours}</td>
                <td><span>{result.explanation}</span>{result.status === 'UNCERTAIN' && <span className="student-eligibility-review-links"> Check your <AppLink href="/student/records">academic records</AppLink> and <AppLink href="/student/pathway">prerequisites</AppLink>.</span>}</td>
              </tr>)}
            </tbody></table>
          </div>
        </>}
        <p className="student-eligibility-note">Eligibility is based on your saved academic records and maintained prerequisite information. A confirmed offering is not official registration.</p>
      </section>}
      {client.selection && <SemesterSelectionPanel client={client.selection} onDirtyChange={setSelectionDirty} refreshKey={attempt} />}
    </>}
  </section>;
}
