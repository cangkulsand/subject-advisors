import type { AcademicRecord } from '../../../../api/src/modules/records/contracts';
import type { SubjectOption } from '../../../../api/src/modules/profile/contracts';
import { summarizeRecordedCredits } from './recorded-credit-summary';

export function RecordedCreditProgress({ subjects, records, totalCreditRequired }: {
  subjects: readonly SubjectOption[];
  records: readonly AcademicRecord[];
  totalCreditRequired?: number | null;
}) {
  const summary = summarizeRecordedCredits(subjects, records);
  const configuredTotal = typeof totalCreditRequired === 'number' && Number.isInteger(totalCreditRequired) && totalCreditRequired >= 0 && totalCreditRequired <= 2147483647
    ? totalCreditRequired : undefined;
  const recordedCredits = summary.earnedCredits + summary.exemptedCredits;
  const ready = summary.complete && configuredTotal !== undefined && configuredTotal > 0;
  const progressPercent = ready ? Math.min(100, Math.round((recordedCredits / configuredTotal) * 100)) : null;
  const remainingCredits = ready ? Math.max(0, configuredTotal - recordedCredits) : null;
  const unavailable = !summary.complete
    ? summary.mappedSubjectCount === 0
      ? 'Credit progress unavailable because current curriculum subjects could not be mapped.'
      : `Credit progress unavailable because ${summary.unresolvedCount} current subject mapping${summary.unresolvedCount === 1 ? ' is' : 's are'} missing or ambiguous. Known totals below are partial.`
    : configuredTotal === undefined
      ? 'Credit progress unavailable because this curriculum has no configured credit total.'
      : 'Credit progress unavailable because the configured curriculum total is zero.';

  return <section className="p001-degree-progress" aria-labelledby="p001-degree-progress-title">
    <div className="p001-degree-heading">
      <div><p className="p001-degree-eyebrow">SUMMARY</p><h2 id="p001-degree-progress-title">Academic Progress</h2></div>
    </div>
    {ready ? <>
      <div className="p001-degree-result"><strong>{recordedCredits}<span> / {configuredTotal}</span></strong><span>credits recorded</span></div>
      <div className="p001-degree-meter">
        <span className="p001-degree-bubble" style={{ left: `clamp(24px, ${progressPercent}%, calc(100% - 24px))` }}>{progressPercent}%</span>
        <div className="p001-degree-track" role="progressbar" aria-label="Recorded credit progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent!}
          aria-valuetext={recordedCredits > configuredTotal! ? `${recordedCredits} of ${configuredTotal} recognized credits recorded; above the configured total` : `${recordedCredits} of ${configuredTotal} recognized credits recorded (${progressPercent}%)`}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
      {recordedCredits > configuredTotal! && <p className="p001-degree-caption">Recorded credits exceed the configured curriculum total by {recordedCredits - configuredTotal!} credits.</p>}
    </> : <p className="p001-degree-unavailable">{unavailable}</p>}
    <div className="p001-degree-metrics" aria-label="Recorded credit breakdown">
      <div><strong>{summary.mappedSubjectCount ? summary.earnedCredits : '—'}</strong><span>{summary.complete ? 'Earned credits' : 'Known earned credits'}</span>
        {summary.complete && <small>{summary.takenCount} Taken subjects</small>}</div>
      <div><strong>{summary.mappedSubjectCount ? summary.exemptedCredits : '—'}</strong><span>{summary.complete ? 'Exempted credits' : 'Known exempted credits'}</span>
        {summary.complete && <small>{summary.exemptedCount} Exempted subjects</small>}</div>
      <div><strong>{remainingCredits ?? '—'}</strong><span>Remaining credits</span>
        {ready && recordedCredits > configuredTotal! && <small>Recorded total exceeded</small>}</div>
    </div>
  </section>;
}
