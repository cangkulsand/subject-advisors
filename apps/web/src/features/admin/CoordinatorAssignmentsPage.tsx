import { useEffect, useId, useState } from 'react';
import { AppLink } from '../../app/navigation';
import type { AcademicSetupClient } from './academic-client';
import type { AdminClient } from './client';
import type { AdminIdentity } from '../../../../../packages/shared/src/admin/admin';
import { ReasonDialog } from './AdminUserManagement';
import * as C from '../../../../../packages/shared/src/admin/academic-setup';
import { checked, formatDateTime, SetupCard, SetupForm, SetupTable, useSetupRead, type Values } from './academic-ui';
import { PagerButtons } from '../../components/icon-button/IconButton';

function CoordinatorPicker({ client, value, onChange }: { client: AdminClient; value: string; onChange: (value: string) => void }) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), id = useId();
  const state = useSetupRead(signal => client.users({ page, q: search, role: 'COORDINATOR', status: 'ACTIVE' }, signal), JSON.stringify([page, search]));
  return <div className="admin-setup-fields"><div className="admin-field"><label htmlFor={id + 'search'}>Find coordinator by name or email</label><input id={id + 'search'} value={search} onChange={e => { setSearch(e.target.value); setPage(1); onChange(''); }}/></div>
    {state.error ? <div><p role="alert">{state.error}</p><button type="button" onClick={state.refresh}>Retry coordinators</button></div> : !state.data ? <p role="status">Loading eligible coordinators…</p> : <><div className="admin-field"><label htmlFor={id}>Coordinator account</label><select id={id} required value={value} onChange={e => onChange(e.target.value)}><option value="">Choose coordinator…</option>{state.data.items.filter(a => a.roles.includes('COORDINATOR') && a.accessStatus === 'ACTIVE').map(a => <option key={a.accountId} value={a.accountId}>{a.identity.name ?? a.identity.email ?? 'Account ' + a.accountId} · {a.identity.email ?? 'Identity unavailable'}</option>)}</select></div>{!state.data.items.length && <p>No eligible coordinators found. Add the Coordinator role in Users &amp; Access first.</p>}<div className="admin-dialog-actions"><span>Page {page}</span><PagerButtons noun="coordinators" page={page} pages={Math.max(1, Math.ceil(state.data.total / state.data.pageSize))} onPage={next => { setPage(next); onChange(''); }}/></div></>}
  </div>;
}
/** Whole faculty or one programme, then one or more learning centres (S3-P004-040). Centres are stored comma-separated in the form values. */
function AssignmentOptions({ data, values, set }: { data: { faculties: C.Faculty[]; programmes: C.ProgrammeFaculty[]; centres: C.LearningCentre[] }; values: Values; set: (key: string, value: string) => void }) {
  const id = useId();
  const faculties = data.faculties.filter(f => f.isActive), programmes = data.programmes.filter(p => p.isActive && p.facultyId === Number(values.faculty));
  const centres = data.centres.filter(c => c.isActive), chosen = new Set((values.centres ?? '').split(',').filter(Boolean));
  const covers = values.covers === 'programme' ? 'programme' : 'faculty';
  const toggle = (centreId: string, on: boolean) => { const next = new Set(chosen); if (on) next.add(centreId); else next.delete(centreId); set('centres', [...next].join(',')); };
  return <>
    <div className="admin-field"><label htmlFor={id + 'faculty'}>Faculty</label><select id={id + 'faculty'} required value={values.faculty ?? ''} onChange={e => { set('faculty', e.target.value); set('programme', ''); }}>
      <option value="">Choose…</option>{faculties.map(f => <option key={f.facultyId} value={f.facultyId}>{f.facultyName}</option>)}</select>{!faculties.length && <small>No configured options available.</small>}</div>
    <fieldset className="admin-choice-group"><legend>Covers</legend>
      <label className="admin-check"><input type="radio" name={id + 'covers'} checked={covers === 'faculty'} onChange={() => { set('covers', 'faculty'); set('programme', ''); }}/>Whole faculty (all its programmes, including new ones)</label>
      <label className="admin-check"><input type="radio" name={id + 'covers'} checked={covers === 'programme'} onChange={() => set('covers', 'programme')}/>One programme</label>
    </fieldset>
    {covers === 'programme' && <div className="admin-field"><label htmlFor={id + 'programme'}>Programme</label><select id={id + 'programme'} required value={values.programme ?? ''} onChange={e => set('programme', e.target.value)}>
      <option value="">Choose…</option>{programmes.map(p => <option key={p.programmeId} value={p.programmeId}>{p.programmeCode} · {p.programmeName}</option>)}</select>{values.faculty && !programmes.length && <small>This faculty has no active programmes.</small>}</div>}
    <fieldset className="admin-choice-group"><legend>Learning centres</legend>
      {centres.map(c => <label key={c.learningCentreId} className="admin-check"><input type="checkbox" checked={chosen.has(String(c.learningCentreId))} onChange={e => toggle(String(c.learningCentreId), e.target.checked)}/>{c.centreName}</label>)}
      {!centres.length && <small>No configured options available.</small>}
    </fieldset>
  </>;
}
const centreIds = (v: Values) => (v.centres ?? '').split(',').filter(Boolean).map(Number);
const canSaveAssignment = (v: Values) => Boolean(v.account && v.faculty && centreIds(v).length && (v.covers !== 'programme' || v.programme));
type AccountName = { name: string; email: string | null };
/** Assignments store only account ids; names and emails come from the account details, one request per coordinator (S3-P004-025). Until they arrive, or if one fails, the row shows "Account #id". */
function useAccountNames(users: AdminClient, ids: number[]): Record<number, AccountName> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [names, setNames] = useState<Record<number, AccountName>>({});
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    // At most four lookups at a time, so a long list does not burst the identity provider (S3-P004-026).
    const ids = key.split(',').map(Number), results: Array<readonly [number, AdminIdentity] | null> = [];
    const worker = async () => { for (let id = ids.shift(); id !== undefined; id = ids.shift()) results.push(await users.account(id, controller.signal).then(account => [id, account.identity] as const, () => null)); };
    void Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker)).then(() => {
      if (controller.signal.aborted) return;
      const next: Record<number, AccountName> = {};
      for (const result of results) if (result && result[1].state === 'available') next[result[0]] = { name: result[1].name ?? result[1].email ?? 'Unnamed account', email: result[1].name ? result[1].email : null };
      setNames(next);
    });
    return () => controller.abort();
  }, [key, users]);
  return names;
}
export function CoordinatorAssignmentsPage({ client, users }: { client: AcademicSetupClient; users: AdminClient }) {
  const state = useSetupRead(async signal => ({ assignments: await client.assignments(signal), faculties: await client.faculties(signal), programmes: await client.programmes(signal), centres: await client.centres(signal) }));
  const [adding, setAdding] = useState(false), [ending, setEnding] = useState<C.AdminCoordinatorAssignment | null>(null), [success, setSuccess] = useState('');
  const names = useAccountNames(users, state.data?.assignments.map(row => row.accountId) ?? []);
  const who = (accountId: number) => names[accountId]?.name ?? 'Account #' + accountId;
  const centreName = (row: C.AdminCoordinatorAssignment) => state.data?.centres.find(c => c.learningCentreId === row.learningCentreId)?.centreName ?? String(row.learningCentreId);
  const facultyName = (row: C.AdminCoordinatorAssignment) => state.data?.faculties.find(f => f.facultyId === row.facultyId)?.facultyName ?? String(row.facultyId);
  const programmeCode = (row: C.AdminCoordinatorAssignment) => state.data?.programmes.find(p => p.programmeId === row.programmeId)?.programmeCode ?? String(row.programmeId);
  /** A whole-faculty row covers the faculty's active programmes, counted now (S3-P004-040). */
  const covered = (row: C.AdminCoordinatorAssignment) => state.data?.programmes.filter(p => p.isActive && p.facultyId === row.facultyId).length ?? 0;
  const where = (row: C.AdminCoordinatorAssignment) => (row.programmeId === null ? 'whole faculty' : programmeCode(row)) + ' at ' + centreName(row);
  const coverage = (row: C.AdminCoordinatorAssignment) => (row.programmeId === null ? facultyName(row) + ' (whole faculty)' : programmeCode(row)) + ' at ' + centreName(row);
  const done = () => { setAdding(false); setEnding(null); setSuccess('Coordinator assignment saved.'); state.refresh(); };
  return <SetupCard title="Coordinators" description="Who coordinates each faculty or programme, and at which learning centres." {...state} success={success} action={<button className="admin-primary" disabled={!state.data} onClick={() => setAdding(true)}>Add coordinator</button>}>
    <p className="admin-setup-note">Ended assignments remain in history. Account roles and active references are checked again when saving.</p>
    {!state.data?.assignments.length ? <p>No coordinator assignments configured.</p> : <SetupTable label="Coordinator assignments" headings={['Coordinator', 'Faculty', 'Covers', 'Learning centre', 'Started', 'Ended', 'Actions']}>{state.data.assignments.map(row => <tr key={row.assignmentId}><td><div className="admin-assignment-account"><AppLink href={'/admin/users/' + row.accountId}>{who(row.accountId)}</AppLink>{names[row.accountId]?.email && <span>{names[row.accountId]!.email}</span>}</div></td><td>{state.data!.faculties.find(f => f.facultyId === row.facultyId)?.facultyName ?? row.facultyId}</td><td>{row.programmeId === null ? <div className="admin-assignment-account"><span>Whole faculty</span><span>{covered(row) === 1 ? '1 programme' : covered(row) + ' programmes'}</span></div> : programmeCode(row)}</td><td>{state.data!.centres.find(c => c.learningCentreId === row.learningCentreId)?.centreName ?? row.learningCentreId}</td><td>{formatDateTime(row.startedAt)}</td><td>{row.endedAt ? formatDateTime(row.endedAt) : 'Active'}</td><td>{!row.endedAt && <button aria-label={'End assignment for ' + who(row.accountId) + ', ' + where(row)} onClick={() => setEnding(row)}>End assignment</button>}</td></tr>)}</SetupTable>}
    {adding && <SetupForm title="Add coordinator" fields={[]} initial={{ covers: 'faculty' }} canSave={canSaveAssignment} onClose={() => setAdding(false)} onSave={async (v, reason) => { await client.createAssignment(checked(C.validateCreateCoordinatorAssignmentRequest({ accountId: Number(v.account), facultyId: Number(v.faculty), programmeId: v.covers === 'programme' ? Number(v.programme) : null, learningCentreIds: centreIds(v), reason }))); done(); }}>{(v, set) => <><CoordinatorPicker client={users} value={v.account ?? ''} onChange={value => set('account', value)}/><AssignmentOptions data={state.data!} values={v} set={set}/></>}</SetupForm>}
    {ending && <ReasonDialog title="End coordinator assignment" description={<>End {who(ending.accountId)}&rsquo;s coverage of {coverage(ending)}. Its history is kept.</>} confirmLabel="End assignment" onCancel={() => setEnding(null)} onSubmit={async reason => { await client.endAssignment(ending.assignmentId, reason); done(); }}/>} 
  </SetupCard>;
}