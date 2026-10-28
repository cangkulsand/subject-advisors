import { useLayoutEffect, useRef, type FocusEvent, type ReactNode } from 'react';
import './subject-records-table.css';

export type SubjectRecordSelection = 'TAKEN' | 'EXEMPTED' | null;
export type SavedSubjectStatus = 'COMPLETED' | 'EXEMPTED' | 'FAILED' | 'WITHDRAWN' | 'AMBIGUOUS' | 'NOT_RECORDED';

export interface SubjectRecordsTableRow {
  subjectId: string | number;
  subjectCode: string;
  subjectName: string;
  credits: number;
  savedStatus: SavedSubjectStatus;
  notice?: string;
  selectionDisabled?: boolean;
  actionDisabled?: boolean;
}

export interface SubjectRecordsTableProps {
  rows: readonly SubjectRecordsTableRow[];
  selections: Readonly<Record<string, SubjectRecordSelection>>;
  onSelectionChange: (subjectId: SubjectRecordsTableRow['subjectId'], selection: SubjectRecordSelection, opener?: HTMLElement) => void;
  pending?: boolean;
  error?: ReactNode;
  onDetails?: (row: SubjectRecordsTableRow, opener?: HTMLElement) => void;
}

export function SubjectRecordsTable({
  rows,
  selections,
  onSelectionChange,
  pending = false,
  error,
  onDetails,
}: SubjectRecordsTableProps) {
  const focusedChoice = useRef<{ element: HTMLInputElement; subjectId: string } | null>(null);
  const savedStatuses = useRef(new Map(rows.map(row => [String(row.subjectId), row.savedStatus])));
  const priority = (status: SavedSubjectStatus) => status === 'EXEMPTED' ? 2 : status === 'COMPLETED' ? 1 : 0;
  const orderedRows = [...rows].sort((left, right) => priority(left.savedStatus) - priority(right.savedStatus) || left.subjectCode.localeCompare(right.subjectCode));
  const statusLabel = (status: SavedSubjectStatus) => status === 'COMPLETED' ? 'Taken' : status === 'NOT_RECORDED' ? '-' : status === 'AMBIGUOUS' ? 'Multiple saved records' : status[0] + status.slice(1).toLowerCase();
  useLayoutEffect(() => {
    const focus = focusedChoice.current;
    const previousStatus = focus ? savedStatuses.current.get(focus.subjectId) : undefined;
    const nextStatus = focus ? rows.find(row => String(row.subjectId) === focus.subjectId)?.savedStatus : undefined;
    if (focus && previousStatus !== nextStatus) {
      if (focus.element.isConnected) focus.element.focus({ preventScroll: true });
      focusedChoice.current = null;
    }
    savedStatuses.current = new Map(rows.map(row => [String(row.subjectId), row.savedStatus]));
  }, [rows]);
  function trackChoiceFocus(event: FocusEvent<HTMLElement>) {
    const subjectId = event.target instanceof HTMLInputElement ? event.target.closest('tr')?.dataset.subjectId : undefined;
    focusedChoice.current = event.target instanceof HTMLInputElement && event.target.type === 'checkbox' && subjectId
      ? { element: event.target, subjectId } : null;
  }
  return (
    <section className="subject-records-table" aria-busy={pending} onFocusCapture={trackChoiceFocus} onBlurCapture={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focusedChoice.current = null;
    }}>
      {pending && <p className="subject-records-table__pending" role="status">Updating subject selections…</p>}
      {error && <p className="subject-records-table__error" role="alert">{error}</p>}
      <div className="subject-records-table__scroll" tabIndex={0} aria-label="Scrollable subject records table">
        <table>
          <caption>Subject records</caption>
          <thead>
            <tr>
              <th scope="col">Subject code</th>
              <th scope="col">Subject name</th>
              <th scope="col">Subject credits</th>
              <th scope="col">Status</th>
              <th scope="col" className="subject-records-table__choice-heading">Taken</th>
              <th scope="col" className="subject-records-table__choice-heading">Exempted</th>
              {onDetails && <th scope="col">Details</th>}
            </tr>
          </thead>
          <tbody>
            {orderedRows.map(row => {
              const selection = selections[String(row.subjectId)] ?? null;
              const subjectLabel = `${row.subjectCode} ${row.subjectName}`;
              return (
                <tr key={row.subjectId} data-subject-id={String(row.subjectId)}>
                  <th scope="row">{row.subjectCode}</th>
                  <td>{row.subjectName}</td>
                  <td className="subject-records-table__credits">{row.credits}</td>
                  <td className="subject-records-table__choice-cell">
                    <span className={`subject-records-table__status subject-records-table__status--${row.savedStatus.toLowerCase()}`}>
                      {row.savedStatus === 'NOT_RECORDED' ? <><span aria-hidden="true">-</span><span className="subject-records-table__sr-only">Not recorded</span></> : statusLabel(row.savedStatus)}
                    </span>
                    {row.notice && <p className="subject-records-table__notice">{row.notice}</p>}
                  </td>
                  <td>
                    <label className="subject-records-table__choice">
                      <input
                        type="checkbox"
                        checked={selection === 'TAKEN'}
                        disabled={pending || row.selectionDisabled}
                        onChange={event => onSelectionChange(row.subjectId, event.currentTarget.checked ? 'TAKEN' : null, event.currentTarget)}
                        aria-label={`Taken for ${subjectLabel}`}
                      />
                    </label>
                  </td>
                  <td className="subject-records-table__choice-cell">
                    <label className="subject-records-table__choice">
                      <input
                        type="checkbox"
                        checked={selection === 'EXEMPTED'}
                        disabled={pending || row.selectionDisabled}
                        onChange={event => onSelectionChange(row.subjectId, event.currentTarget.checked ? 'EXEMPTED' : null, event.currentTarget)}
                        aria-label={`Exempted for ${subjectLabel}`}
                      />
                    </label>
                  </td>
                  {onDetails && (
                    <td>
                      <button type="button" className="subject-records-table__details" disabled={pending || row.actionDisabled} onClick={event => onDetails(row, event.currentTarget)} aria-label={`View details for ${subjectLabel}`} title={`View details for ${subjectLabel}`}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
