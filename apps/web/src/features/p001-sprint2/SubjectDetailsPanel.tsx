import { useEffect, useRef } from 'react';
import { NO_MANDATORY_TEXT, type SubjectDetails } from './subject-details';

/** Read-only UC18 subject details in a modal dialog. Escape or Close returns focus to the opener. */
export function SubjectDetailsPanel({ details, onClose }: { details: SubjectDetails; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  const titleId = 'subject-details-title';
  return <dialog ref={dialog} className="progress-details" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="progress-details__body">
      <header className="progress-details__header">
        <div><p className="progress-details__code">{details.code}</p><h2 id={titleId}>{details.name}</h2></div>
        <button type="button" className="progress-button" onClick={onClose}>Close</button>
      </header>
      <dl className="progress-details__facts">
        <div><dt>Credits</dt><dd>{details.credits}</dd></div>
        <div><dt>Category</dt><dd>{details.category}</dd></div>
        <div><dt>Requirement</dt><dd>{details.requirement}</dd></div>
        <div><dt>Your status</dt><dd>{details.statusLabel}</dd></div>
        <div><dt>Semesters</dt><dd>{details.semesters}</dd></div>
      </dl>
      {details.semesterNote && <p className="progress-details__note">{details.semesterNote}</p>}
      <section aria-labelledby="subject-details-prerequisites">
        <h3 id="subject-details-prerequisites">Prerequisites</h3>
        {details.noMandatory && <p>{NO_MANDATORY_TEXT}</p>}
        {details.prerequisites.length > 0 && <ul className="progress-details__list">{details.prerequisites.map(item => <li key={item.kind + item.mappingId}>
          <span><strong>{item.code} — {item.name}</strong><small>{item.kindLabel}{item.adviceOnly ? ' (advice only)' : ''} · {item.outcomeLabel}</small></span>
          <span className={'progress-pill ' + (item.met ? 'progress-pill--met' : 'progress-pill--unmet')}>{item.met ? 'Met' : 'Not met'}</span>
        </li>)}</ul>}
      </section>
      <section aria-labelledby="subject-details-unlocks">
        <h3 id="subject-details-unlocks">Unlocks</h3>
        {details.unlocks.length ? <ul className="progress-details__list">{details.unlocks.map(item => <li key={item.mappingId}>
          <span><strong>{item.code} — {item.name}</strong><small>{item.kindLabel}</small></span>
        </li>)}</ul> : <p>No other subject requires this one.</p>}
      </section>
      <section aria-labelledby="subject-details-next">
        <h3 id="subject-details-next">Next semester</h3>
        <p><span className={'progress-pill ' + (details.approved ? 'progress-pill--met' : 'progress-pill--neutral')}>{details.nextSemester}</span></p>
      </section>
    </div>
  </dialog>;
}
