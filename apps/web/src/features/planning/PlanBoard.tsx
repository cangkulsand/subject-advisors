import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GraduationPlan, PlannedSemester, PlannedSubject, PlanningInput, ScenarioChange, ScenarioChangeKind, SemesterRef } from '../../../../../packages/shared/src/planning/contracts';
import { checkChange, checkPlacement, placementTargets, type PlacementTarget } from '../../../../../packages/shared/src/planning/placement';
import { semesterAt, semesterLabel, semesterTypeOf } from '../../../../../packages/shared/src/planning/semesters';
import { GripIcon, LockIcon, NormalIcon, PinIcon, ShortIcon, WarningIcon } from './icons';
import { CHANGE_LABEL, replacementOptions, subjectNote } from './plan-view';
import { useSortableLists } from './useSortableList';
import { DialogHead } from '../../components/dialog/DialogHead';

const keyOf = (ref: SemesterRef) => ref.academicYear + '-' + ref.semesterNo;
const POSTPONE_KEY = 'postpone';
const ClockIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;

interface Panel { semester: PlannedSemester; trailing: boolean; unconfigured: boolean }

/** Semesters of the plan grouped by academic year, plus one empty configured semester after the last when editable. */
function panelsByYear(input: PlanningInput, plan: GraduationPlan, editable: boolean): { year: string; panels: Panel[] }[] {
  const configured = (s: PlannedSemester) => input.limits.some(l => l.academicYear === s.academicYear && l.semesterNo === s.semesterNo);
  const panels: Panel[] = plan.semesters.map(semester => ({ semester, trailing: false, unconfigured: editable && !configured(semester) }));
  if (editable && input.start) {
    const ref = semesterAt(input.start, plan.semesters.length);
    const row = input.limits.find(l => l.academicYear === ref.academicYear && l.semesterNo === ref.semesterNo);
    if (row) panels.push({ trailing: true, unconfigured: false, semester: { ...ref, index: plan.semesters.length + 1, semesterType: semesterTypeOf(ref.semesterNo),
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
    {semester.subjects.length === 0 && <p className="planning-empty">{panel.unconfigured ? 'Not set up for moving subjects'
      : panel.trailing ? 'Drop here to move a subject later'
      : 'Nothing can be taken this semester: the subjects left are waiting for a prerequisite or run in the other semester type.'}</p>}
    {semester.subjects.length > 0 && panel.unconfigured && <p className="planning-empty">Not set up for moving subjects</p>}
  </li>;
}

export interface OtherChange { key: string; label: string; change: ScenarioChange }
/** The what-ifs besides moving: postpone, fail, withdraw and, for an elective, replace it with another option. */
function otherChanges(input: PlanningInput, baseline: GraduationPlan, subject: PlannedSubject): OtherChange[] {
  const id = subject.curriculumSubjectId;
  const simple = (['POSTPONE', 'FAIL', 'WITHDRAW'] as ScenarioChangeKind[]).map(kind => ({ key: kind, label: CHANGE_LABEL[kind], change: { kind, curriculumSubjectId: id } }));
  const replace = replacementOptions(input, baseline, subject).map(option => ({ key: 'REPLACE-' + option.curriculumSubjectId, label: `Replace with ${option.subjectName} (${option.subjectCode})`,
    change: { kind: 'REPLACE' as const, curriculumSubjectId: id, replacementId: option.curriculumSubjectId } }));
  return [...simple, ...replace];
}

function MoveDialog({ subject, current, targets, others, onClose, onConfirm, onOther }: { subject: PlannedSubject; current: string | null; targets: PlacementTarget[]; others: OtherChange[]; onClose: () => void; onConfirm: (target: SemesterRef) => void; onOther: (change: ScenarioChange) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  const chosen = targets.find(t => keyOf(t.semester) === choice && t.ok);
  const other = others.find(o => 'other:' + o.key === choice);
  return <dialog ref={ref} className="planning-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <DialogHead onClose={onClose}><h3 id={titleId}>Move {subject.subjectCode}</h3></DialogHead>
    <p className="planning-dialog-lead">{subject.subjectName}{current ? <> — now in <strong>{current}</strong></> : ''}. Choose the semester to take it in; the rest of your plan is rearranged around it.</p>
    <fieldset className="planning-targets"><legend>Semester</legend>
      {targets.map(target => <label key={keyOf(target.semester)} className={'planning-target' + (target.ok ? '' : ' planning-target--off')}>
        <input type="radio" name="planning-target" value={keyOf(target.semester)} disabled={!target.ok} checked={choice === keyOf(target.semester)} onChange={() => setChoice(keyOf(target.semester))}
          aria-describedby={target.reason ? `${titleId}-reason-${keyOf(target.semester)}` : undefined} />
        <span className="planning-target-text"><span>{target.label}</span>{target.reason && <span className="planning-target-reason" id={`${titleId}-reason-${keyOf(target.semester)}`}>{target.reason}</span>}</span>
      </label>)}
    </fieldset>
    {others.length > 0 && <fieldset className="planning-targets"><legend>Or try</legend>
      {others.map(o => <label key={o.key} className="planning-target">
        <input type="radio" name="planning-target" value={'other:' + o.key} checked={choice === 'other:' + o.key} onChange={() => setChoice('other:' + o.key)} />
        <span className="planning-target-text"><span>{o.label}</span></span>
      </label>)}
    </fieldset>}
    <div className="planning-dialog-actions">
      <button type="button" className="planning-button" onClick={onClose}>Cancel</button>
      <button type="button" className="planning-button planning-button--primary" disabled={!chosen && !other}
        onClick={() => { if (chosen) onConfirm(chosen.semester); else if (other) onOther(other.change); }}>{other ? 'Apply' : 'Move here'}</button>
    </div>
  </dialog>;
}

/**
 * The plan as coloured semester panels with subject cards (S3-P004-010). When editable, cards can be dragged to another
 * semester or moved with "Move…"; every move goes through `checkPlacement`, and only accepted lists reach `onChange`.
 */
export function PlanBoard({ input, plan, baseline, changes, editable, heading, onChange }: {
  input: PlanningInput; plan: GraduationPlan; baseline: GraduationPlan; changes: ScenarioChange[]; editable: boolean; heading: string;
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
  const tryChange = (change: ScenarioChange) => {
    const check = checkChange(input, changes, change);
    if (!check.ok) { setMessage(check.reason); return; }
    setMessage('');
    onChange(check.changes);
  };
  useSortableLists(container, canEdit, {
    onStart: id => setBlocked(new Set(placementTargets(input, plan, changes, id).filter(t => !t.ok).map(t => keyOf(t.semester)))),
    onEnd: () => setBlocked(new Set()),
    onMove: (id, key) => {
      if (key === POSTPONE_KEY) { tryChange({ kind: 'POSTPONE', curriculumSubjectId: id }); return; }
      const target = refByKey.get(key); if (target) move(id, target);
    },
  }, [years]);

  return <section className="planning-card planning-board" aria-labelledby="planning-timeline-heading">
    <div className="planning-board-head"><h2 id="planning-timeline-heading">{heading}</h2></div>
    <p className="planning-move-message" role="status">{message && <><WarningIcon />{message}</>}</p>
    <div ref={container} className="planning-years">
      {canEdit && <div className="planning-postpone">
        <div className="planning-cards planning-postpone-zone" data-key={POSTPONE_KEY} aria-label="Postpone one semester"><ClockIcon />Drop here to postpone one semester</div>
      </div>}
      {years.map(year => <section key={year.year || 'plan'} className="planning-year" aria-label={year.year || 'Planned semesters'}>
        {year.year && <h3 className="planning-year-head">{year.year}</h3>}
        <ol className="planning-year-grid">{year.panels.map(panel => <SemesterPanel key={keyOf(panel.semester) + panel.semester.index} panel={panel} editable={canEdit}
          blocked={blocked.has(keyOf(panel.semester))} onMove={setMoving} />)}</ol>
      </section>)}
    </div>
    {moving && <MoveDialog subject={moving} current={plan.semesters.find(s => s.subjects.some(x => x.curriculumSubjectId === moving.curriculumSubjectId && !x.failedAttempt))?.label ?? null}
      targets={placementTargets(input, plan, changes, moving.curriculumSubjectId)} others={otherChanges(input, baseline, moving)}
      onClose={() => { setReturnFocus({ code: moving.subjectCode }); setMoving(null); }}
      onConfirm={target => { setReturnFocus({ code: moving.subjectCode }); setMoving(null); move(moving.curriculumSubjectId, target); }}
      onOther={change => { setReturnFocus({ code: moving.subjectCode }); setMoving(null); tryChange(change); }} />}
  </section>;
}
