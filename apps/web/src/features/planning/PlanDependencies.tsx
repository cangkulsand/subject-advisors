import { useMemo, useState } from 'react';
import type { GraduationPlan, PlanningInput } from '../../../../../packages/shared/src/planning/contracts';
import { TalentTree } from '../pathway/TalentTree';
import { planDependencies } from './dependencies';

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completed', EXEMPTED: 'Exempted', IN_PROGRESS: 'In progress', ELIGIBLE: 'Eligible',
  LOCKED: 'Locked', RECOMMENDED: 'Recommended', REMAINING: 'Remaining', UNKNOWN: 'Not calculated',
};

export function PlanDependencies({ input, plan, baseline }: { input: PlanningInput; plan: GraduationPlan; baseline: GraduationPlan | null }) {
  const { graph, annotations } = useMemo(() => planDependencies(input, plan, baseline), [input, plan, baseline]);
  const [tableOpen, setTableOpen] = useState(false);
  const byId = useMemo(() => new Map(input.subjects.map(s => [String(s.curriculumSubjectId), s])), [input]);
  const labelOf = (id: number) => byId.get(String(id))?.subjectCode ?? String(id);
  return <section className="planning-card planning-dependencies" aria-labelledby="planning-deps-heading">
    <h2 id="planning-deps-heading">Subject dependencies</h2>
    <p className="planning-lead">How the subjects link and where this view puts them. Dashed outlines mark subjects whose semester changed from the baseline plan.</p>
    <div className="planning-deps-canvas"><TalentTree graph={graph} annotations={annotations} /></div>
    <p className="planning-deps-legend"><span className="planning-deps-sample" aria-hidden="true" />Dashed outline: moved in this what-if</p>
    <button type="button" className="planning-button" aria-expanded={tableOpen} onClick={() => setTableOpen(open => !open)}>View dependencies as a table</button>
    {tableOpen && <div className="planning-table-scroll" role="region" aria-label="Subject dependencies" tabIndex={0}>
      <table className="planning-table">
        <thead><tr><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Must finish first</th><th scope="col">Same or earlier semester</th><th scope="col">In this view</th><th scope="col">Baseline plan</th></tr></thead>
        <tbody>{input.subjects.map(s => {
          const id = String(s.curriculumSubjectId);
          const note = annotations[id]!;
          return <tr key={id} data-subject={s.subjectCode}>
            <th scope="row"><span className="planning-subject-name">{s.subjectName}</span><span className="planning-subject-code">{s.subjectCode}</span></th>
            <td>{STATUS_LABEL[graph.nodes.find(n => n.id === id)!.status]}</td>
            <td>{s.prerequisites.map(labelOf).join(', ') || '—'}</td>
            <td>{(s.corequisites ?? []).map(labelOf).join(', ') || '—'}</td>
            <td>{note.semester}</td>
            <td>{note.baselineSemester ?? '—'}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
