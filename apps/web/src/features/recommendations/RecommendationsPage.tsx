import { useEffect, useMemo, useState } from 'react';
import type { PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import { recommend, type RecommendationOption } from '../../../../../packages/shared/src/recommendations/recommend';
import { AppLink } from '../../app/navigation';
import { errorMessage } from '../profile/client';
import type { PlanningClient } from '../planning/client';
import '../../app/typography.css';
import '../planning/planning-page.css';
import './recommendations-page.css';

/** "Same completion as the recommendation", "1 semester later than the recommendation". */
export function versusBest(difference: number | null): string {
  if (difference === null) return 'Completion cannot be planned yet';
  if (difference === 0) return 'Same completion as the recommendation';
  return `${difference} semester${difference === 1 ? '' : 's'} later than the recommendation`;
}

function OptionTable({ option, label }: { option: RecommendationOption; label: string }) {
  return <div className="planning-table-scroll" role="region" aria-label={label} tabIndex={0}><table className="planning-table planning-table--semester">
    <thead><tr><th scope="col">Subject</th><th scope="col" className="planning-number">Credits</th><th scope="col">Why</th></tr></thead>
    <tbody>{option.subjects.map(s => <tr key={s.curriculumSubjectId} data-subject={s.subjectCode}>
      <th scope="row"><span className="planning-subject-name">{s.subjectName}</span><span className="planning-subject-code">{s.subjectCode}</span></th>
      <td className="planning-number">{s.creditHours}</td>
      <td><ul className="recommend-reasons">{s.reasons.map(r => <li key={r}>{r}</li>)}</ul></td>
    </tr>)}</tbody></table></div>;
}

export function RecommendationsPage({ api }: { api: PlanningClient }) {
  const [input, setInput] = useState<PlanningInput>(), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setInput(undefined); setError('');
    api.load(controller.signal).then(value => { if (!controller.signal.aborted) setInput(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); });
    return () => controller.abort();
  }, [api, refresh]);
  const result = useMemo(() => input ? recommend(input) : null, [input]);
  return <section className="planning-page" aria-label="Subject recommendations">
    <header><p className="planning-eyebrow">Subject recommendations</p><h1>What should you take next semester?</h1>
      <p className="planning-lead">Each combination you could take is tried against the rest of your degree. The one that keeps you on the fastest path comes first.</p></header>
    {error && <div role="alert" className="planning-error"><p>{error}</p><button type="button" className="planning-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
    {!input && !error && <p role="status">Working out your recommendations…</p>}
    {result && <>
      {result.status === 'DONE' && <section className="planning-card" aria-label="Recommendation"><p className="planning-status planning-status--met">No subjects left to recommend</p></section>}
      {result.status === 'NO_CANDIDATES' && <section className="planning-card" aria-label="Recommendation"><h2>No recommendation for {result.semester?.label}</h2>
        <p className="planning-lead">None of the subjects you still need can be taken then: they are not on the offering list, wait for a prerequisite, or run in the other semester type.</p></section>}
      {result.status === 'READY' && result.best && <>
        <section className="planning-card" aria-labelledby="recommend-best-heading">
          <h2 id="recommend-best-heading">Recommended for {result.semester?.label}</h2>
          <dl className="planning-summary">
            <div><dt>Subjects</dt><dd>{result.best.subjects.length} of {result.semester?.maxSubjects}</dd></div>
            <div><dt>Credits</dt><dd>{result.best.credits} of {result.semester?.maxCredits}</dd></div>
            <div><dt>Projected completion</dt><dd>{result.best.completion?.label ?? 'Cannot be planned yet'}</dd></div>
          </dl>
          <OptionTable option={result.best} label="Recommended subjects"/>
          <p className="recommend-links"><AppLink href="/student/offerings">Save your picks on Semester offerings</AppLink><AppLink href="/student/plan">Try what-ifs in your Graduation plan</AppLink></p>
        </section>
        <section className="planning-card" aria-labelledby="recommend-warning-heading">
          <h2 id="recommend-warning-heading">Do not postpone</h2>
          {result.warnings.length === 0 ? <p className="planning-empty">No specific prerequisite warning was found from the available data.</p>
            : <ul className="recommend-warnings">{result.warnings.map(w => <li key={w.curriculumSubjectId}><strong>{w.subjectName}</strong> <span className="planning-subject-code">{w.subjectCode}</span><p>{w.message}</p></li>)}</ul>}
        </section>
        <section className="planning-card" aria-labelledby="recommend-alt-heading">
          <h2 id="recommend-alt-heading">Other combinations</h2>
          {result.alternatives.length === 0 ? <p className="planning-empty">No other valid combination is available, so only the recommendation is shown.</p>
            : <ol className="recommend-alternatives">{result.alternatives.map((option, index) => <li key={index} className="planning-semester">
              <div className="planning-semester-head"><h3>Option {index + 2}</h3><span>{option.subjects.length} subjects · {option.credits} credits</span></div>
              <p className={'recommend-versus' + (option.differenceFromBest ? ' planning-later' : '')}>{versusBest(option.differenceFromBest)}{option.completion ? ` (${option.completion.label})` : ''}</p>
              <OptionTable option={option} label={`Option ${index + 2} subjects`}/>
            </li>)}</ol>}
        </section>
      </>}
      <section className="planning-notice" aria-label="How recommendations are made"><h2>How recommendations are made</h2><ul>{result.assumptions.map(a => <li key={a}>{a}</li>)}</ul></section>
    </>}
  </section>;
}
