import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GraduationPlan, PlannedSemester, PlannedSubject, PlanningInput, ScenarioChange, SemesterRef } from '../../../../../packages/shared/src/planning/contracts';
import { checkPlacement, placementTargets, type PlacementTarget } from '../../../../../packages/shared/src/planning/placement';
import { semesterAt, semesterLabel, semesterTypeOf } from '../../../../../packages/shared/src/planning/semesters';
import { GripIcon, LockIcon, NormalIcon, PinIcon, ShortIcon, WarningIcon } from './icons';
import { subjectNote } from './plan-view';
import { useSortableLists } from './useSortableList';

const keyOf = (ref: SemesterRef) => ref.academicYear + '-' + ref.semesterNo;

interface Panel { semester: PlannedSemester; trailing: boolean }

/** Semesters of the plan grouped by academic year, plus one empty configured semester after the last when editable. */
function panelsByYear(input: PlanningInput, plan: GraduationPlan, editable: boolean): { year: string; panels: Panel[] }[] {
  const panels: Panel[] = plan.semesters.map(semester => ({ semester, trailing: false }));
  if (editable && input.start) {
    const ref = semesterAt(input.start, plan.semesters.length);
    const row = input.limits.find(l => l.academicYear === ref.academicYear && l.semesterNo === ref.semesterNo);
    if (row) panels.push({ trailing: true, semester: { ...ref, index: plan.semesters.length + 1, semesterType: semesterTypeOf(ref.semesterNo),
      label: semesterLabel(ref, plan.semesters.length + 1, true), maxSubjects: row.maxSubjects, maxCredits: row.maxCredits, subjects: [], credits: 0 } });
  }
  const years: { year: string; panels: Panel[] }[] = [];
  for (const panel of panels) {
    const last = years.at(-1);
    if (last && last.year === panel.semester.academicYear) last.panels.push(panel);
    else years.push({ year: panel.semester.academicYear, panels: [panel] });
  }
  return years;
}

function SubjectCard({ subject, editable, onMove }: { subject: PlannedSubject; editable: boolean; onMove: (s: PlannedSubject) => void }) {
  const locked = subject.failedAttempt;
  const note = subjectNote(subject);
  const classes = ['planning-subject-card', locked ? 'planning-locked planning-failed' : '', subject.pinned ? 'planning-pinned' : ''].filter(Boolean).join(' ');
  return <li className={classes} data-subject={subject.subjectCode} data-id={subject.curriculumSubjectId}>
    {editable && !locked && <span className="planning-grip" aria-hidden="true" title="Drag to another semester"><GripIcon /></span>}
    <div className="planning-card-body">
      <span className="planning-subject-name">{subject.subjectName}</span>
      <span className="planning-card-meta"><span className="planning-subject-code">{subject.subjectCode}</span><span className="planning-card-credits">{subject.creditHours} credits</span></span>
      {(note || locked) && <span className="planning-card-badges">
        {subject.pinned && !locked && <span className="planning-badge planning-badge--pin"><PinIcon />{note}</span>}
        {locked && <span className="planning-badge planning-badge--lock"><LockIcon />Can&apos;t move</span>}
        {note && !subject.pinned && <span className="planning-badge">{note}</span>}
      </span>}
    </div>
    {editable && !locked && <button type="button" className="planning-move" aria-label={'Move ' + subject.subjectCode} onClick={() => onMove(subject)}>Move…</button>}
  </li>;
}

function SemesterPanel({ panel, editable, blocked, onMove }: { panel: Panel; editable: boolean; blocked: boolean; onMove: (s: PlannedSubject) => void }) {
  const { semester } = panel;
  const short = semester.semesterType === 'SHORT';
  const full = semester.subjects.filter(s => !s.failedAttempt).length >= semester.maxSubjects || semester.credits >= semester.maxCredits;
  return <li className={'planning-semester planning-semester--n' + semester.semesterNo + (panel.trailing ? ' planning-semester--trailing' : '') + (blocked ? ' planning-semester--blocked' : '')}
    data-semester={keyOf(semester)} data-semester-no={semester.semesterNo}>
    <div className="planning-semester-head">
      <h4>{semester.label}</h4>
      <span className="planning-semester-type">{short ? <ShortIcon /> : <NormalIcon />}{short ? 'Short semester' : 'Normal semester'}</span>
      <span className="planning-semester-load">{semester.subjects.length} of {semester.maxSubjects} subjects · {semester.credits} of {semester.maxCredits} credits{full ? ' · Full' : ''}</span>
    </div>
    <ul className="planning-cards" data-key={keyOf(semester)} aria-label={semester.label + ' subjects'}>
      {semester.subjects.map(s => <SubjectCard key={s.curriculumSubjectId + (s.failedAttempt ? '-failed' : '')} subject={s} editable={editable} onMove={onMove} />)}
    </ul>
    {semester.subjects.length === 0 && <p className="planning-empty">{panel.trailing ? 'Drop here to move a subject later'
      : 'Nothing can be taken this semester: the subjects left are waiting for a prerequisite or run in the other semester type.'}</p>}
  </li>;
}

function MoveDialog({ subject, targets, onClose, onConfirm }: { subject: PlannedSubject; targets: PlacementTarget[]; onClose: () => void; onConfirm: (target: SemesterRef) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  const chosen = targets.find(t => keyOf(t.semester) === choice && t.ok);
  return <dialog ref={ref} className="planning-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <h3 id={titleId}>Move {subject.subjectCode}</h3>
    <p className="planning-dialog-lead">{subject.subjectName}. Choose the semester to take it in; the rest of your plan is rearranged around it.</p>
    <fieldset className="planning-targets"><legend>Semester</legend>
      {targets.map(target => <label key={keyOf(target.semester)} className={'planning-target' + (target.ok ? '' : ' planning-target--off')}>
        <input type="radio" name="planning-target" value={keyOf(target.semester)} disabled={!target.ok} checked={choice === keyOf(target.semester)} onChange={() => setChoice(keyOf(target.semester))} />
        <span className="planning-target-text"><span>{target.label}</span>{target.reason && <span className="planning-target-reason">{target.reason}</span>}</span>
      </label>)}
    </fieldset>
    <div className="planning-dialog-actions">
      <button type="button" className="planning-button" onClick={onClose}>Cancel</button>
      <button type="button" className="planning-button planning-button--primary" disabled={!chosen} onClick={() => chosen && onConfirm(chosen.semester)}>Move here</button>
    </div>
  </dialog>;
}

/**
 * The plan as coloured semester panels with subject cards (S3-P004-010). When editable, cards can be dragged to another
 * semester or moved with "Move…"; every move goes through `checkPlacement`, and only accepted lists reach `onChange`.
 */
export function PlanBoard({ input, plan, changes, editable, heading, status, onChange }: {
  input: PlanningInput; plan: GraduationPlan; changes: ScenarioChange[]; editable: boolean; heading: string; status?: ReactNode;
  onChange: (next: ScenarioChange[]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [moving, setMoving] = useState<PlannedSubject | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  // After the Move dialog closes, focus goes back to that subject's Move button (in its new semester when it moved).
  const [returnFocus, setReturnFocus] = useState<{ code: string } | null>(null);
  useEffect(() => {
    if (!returnFocus || moving) return;
    container.current?.querySelector<HTMLElement>('[data-subject="' + returnFocus.code + '"]:not(.planning-failed) .planning-move')?.focus();
    setReturnFocus(null);
  }, [returnFocus, moving, plan]);
  const canEdit = editable && input.start !== null;
  const years = useMemo(() => panelsByYear(input, plan, canEdit), [input, plan, canEdit]);
  const refByKey = useMemo(() => new Map(years.flatMap(y => y.panels).map(p => [keyOf(p.semester), { academicYear: p.semester.academicYear, semesterNo: p.semester.semesterNo }])), [years]);

  const move = (subjectId: number, target: SemesterRef) => {
    const check = checkPlacement(input, changes, subjectId, target);
    if (!check.ok) { setMessage(check.reason); return; }
    setMessage('');
    onChange(check.changes);
  };
  useSortableLists(container, canEdit, {
    onStart: id => setBlocked(new Set(placementTargets(input, plan, changes, id).filter(t => !t.ok).map(t => keyOf(t.semester)))),
    onEnd: () => setBlocked(new Set()),
    onMove: (id, key) => { const target = refByKey.get(key); if (target) move(id, target); },
  }, [years]);

  return <section className="planning-card planning-board" aria-labelledby="planning-timeline-heading">
    <div className="planning-board-head"><h2 id="planning-timeline-heading">{heading}</h2>{status}</div>
    {canEdit && <p className="planning-lead">Drag a subject by its handle, or use Move…, to take it in another semester. The rest of the plan is rearranged around it.</p>}
    <p className="planning-move-message" role="status">{message && <><WarningIcon />{message}</>}</p>
    <div ref={container} className="planning-years">
      {years.map(year => <section key={year.year || 'plan'} className="planning-year" aria-label={year.year || 'Planned semesters'}>
        {year.year && <h3 className="planning-year-head">{year.year}</h3>}
        <ol className="planning-year-grid">{year.panels.map(panel => <SemesterPanel key={keyOf(panel.semester) + panel.semester.index} panel={panel} editable={canEdit}
          blocked={blocked.has(keyOf(panel.semester))} onMove={setMoving} />)}</ol>
      </section>)}
    </div>
    {moving && <MoveDialog subject={moving} targets={placementTargets(input, plan, changes, moving.curriculumSubjectId)}
      onClose={() => { setReturnFocus({ code: moving.subjectCode }); setMoving(null); }}
      onConfirm={target => { setReturnFocus({ code: moving.subjectCode }); setMoving(null); move(moving.curriculumSubjectId, target); }} />}
  </section>;
}
