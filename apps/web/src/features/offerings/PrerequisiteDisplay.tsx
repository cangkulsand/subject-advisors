import type { OfferingSubject } from '../../../../../packages/shared/src/offerings/offerings';
import { offeringPrerequisiteDisplay } from './prerequisites';

export function PrerequisiteDisplay({ subject, catalogue }: { subject: OfferingSubject; catalogue: readonly OfferingSubject[] }) {
  const display = offeringPrerequisiteDisplay(subject, catalogue);
  return <div className="offerings-prerequisites" aria-label="Prerequisite information">
    {display.status === 'unavailable' ? <p className="offerings-prerequisites-note">Prerequisite information unavailable.</p> :
      !display.groups.length ? <p className="offerings-prerequisites-note">-</p> :
        display.groups.map(group => <div className="offerings-prerequisite-group" key={group.type}>
          <span className="offerings-prerequisite-label">{group.label}</span>
          <ul>{group.subjects.map(required => <li key={required.curriculumSubjectId}>
            <span className="offerings-prerequisite-code">{required.code}</span>
            <span>{required.name}</span>
          </li>)}</ul>
        </div>)}
  </div>;
}
