import type { OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { formatCurriculumPrerequisiteExpression } from '../../../../../packages/shared/src/curriculum-reference';
import { offeringPrerequisiteDisplay } from './prerequisites';

export function PrerequisiteDisplay({ subject, catalogue }: { subject: OfferingSubject; catalogue: readonly OfferingSubject[] }) {
  const display = offeringPrerequisiteDisplay(subject, catalogue);
  return <div className="offerings-prerequisites" aria-label="Prerequisite information">
    {display.status === 'unavailable' ? <p className="offerings-prerequisites-note">Prerequisite information unavailable.</p> :
      !display.groups.length && !display.details?.expression && !display.details?.conditionNote && !display.details?.conditions.length && !display.details?.topicDependent ? <p className="offerings-prerequisites-note">-</p> : <>
        {display.details?.expression && <p>{formatCurriculumPrerequisiteExpression(display.details.expression)}</p>}
        {display.details?.conditions.map(condition => <p key={condition.type}>
          {condition.type === 'completedCredits' ? 'Completed credits' : 'CGPA'} {condition.operator} {condition.value}
        </p>)}
        {display.details?.conditionNote && <p>{display.details.conditionNote}</p>}
        {display.details?.topicDependent && !display.details.conditionNote && <p>Prerequisite depends on the selected topic.</p>}
        {!display.details && display.groups.map(group => <div className="offerings-prerequisite-group" key={group.type}>
          <span className="offerings-prerequisite-label">{group.label}</span>
          <ul>{group.subjects.map(required => <li key={required.curriculumSubjectId}>
            <span className="offerings-prerequisite-code">{required.code}</span>
            <span>{required.name}</span>
          </li>)}</ul>
        </div>)}
      </>}
  </div>;
}
