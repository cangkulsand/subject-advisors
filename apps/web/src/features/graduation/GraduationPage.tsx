import { useEffect, useState } from 'react';
import { errorMessage } from '../profile/client';
import type { GraduationCheck, GraduationClient, GraduationStatus } from './client';
import '../../app/typography.css';
import './graduation-page.css';

const STATUS_LABEL: Record<GraduationStatus, string> = { ELIGIBLE: 'Eligible to graduate', NOT_YET_ELIGIBLE: 'Not yet eligible', CANNOT_ASSESS: 'Cannot assess' };
const STATUS_CLASS: Record<GraduationStatus, string> = { ELIGIBLE: 'met', NOT_YET_ELIGIBLE: 'unmet', CANNOT_ASSESS: 'neutral' };
function confirmation(at: string | null) {
  if (!at) return 'not confirmed';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return 'not confirmed';
  return 'confirmed ' + date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
}

export function GraduationPage({ api }: { api: GraduationClient }) {
  const [data, setData] = useState<GraduationCheck>(), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const [pending, setPending] = useState<{ feesCleared: boolean; muet: boolean }>(), [failed, setFailed] = useState<{ feesCleared: boolean; muet: boolean }>();
  useEffect(() => {
    const controller = new AbortController(); setData(undefined); setError('');
    api.load(controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, refresh]);
  async function save(next: { feesCleared: boolean; muet: boolean }) {
    setSaving(true); setSaveError(''); setFailed(undefined); setPending(next);
    try { setData(await api.save(next)); }
    catch (reason) { setSaveError(errorMessage(reason)); setFailed(next); }
    finally { setPending(undefined); setSaving(false); }
  }
  const fees = pending?.feesCleared ?? Boolean(data?.feesClearedConfirmedAt), muet = pending?.muet ?? Boolean(data?.muetConfirmedAt);
  return <section className="graduation-page" aria-label="Graduation check">
    <header><p className="graduation-eyebrow">Graduation check</p><h1>Are you ready to graduate?</h1><p className="graduation-lead">Your credits are checked against your programme, plus two things only you can confirm.</p></header>
    {error && <div role="alert" className="graduation-error"><p>{error}</p><button type="button" className="graduation-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
    {!data && !error && <p role="status">Loading graduation check…</p>}
    {data && <>
      <section className="graduation-card" aria-label="Graduation status">
        <p className={'graduation-status graduation-status--' + STATUS_CLASS[data.status]}>{STATUS_LABEL[data.status]}</p>
        {data.requiredCredits !== null && <div className="graduation-bar">
          <label htmlFor="graduation-credits">{data.earnedCredits} of {data.requiredCredits} credits earned</label>
          <progress id="graduation-credits" value={Math.min(data.earnedCredits, data.requiredCredits)} max={data.requiredCredits} />
          {data.remainingCredits !== null && <p>{data.remainingCredits} remaining</p>}
        </div>}
        {data.missing.length > 0 && <><h2>Still needed</h2><ul className="graduation-missing">{data.missing.map(item => <li key={item}>{item}</li>)}</ul></>}
      </section>
      <section className="graduation-card" aria-label="Your confirmations">
        <h2>Your confirmations</h2>
        <div className="graduation-check"><label><input type="checkbox" checked={fees} disabled={saving} onChange={e => void save({ feesCleared: e.target.checked, muet })} />I have no outstanding fees (no debt)</label><span>{confirmation(data.feesClearedConfirmedAt)}</span></div>
        <div className="graduation-check"><label><input type="checkbox" checked={muet} disabled={saving} onChange={e => void save({ feesCleared: fees, muet: e.target.checked })} />I have my MUET certificate</label><span>{confirmation(data.muetConfirmedAt)}</span></div>
        {saveError && <div role="alert" className="graduation-error"><p>{saveError}</p><button type="button" className="graduation-button" onClick={() => failed && void save(failed)}>Try again</button></div>}
      </section>
      <p className="graduation-notice">Based on your recorded subjects and your own confirmations. Not an official UTMSPACE graduation decision.</p>
    </>}
  </section>;
}
