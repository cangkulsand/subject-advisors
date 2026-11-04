import { InfoTip } from '../../components/info-tip/InfoTip';

/** Plain-language explanations shown in the hover info tips of the forecast screens. */
export const HELP = {
  subjects: 'Subjects in this forecast that run this semester. Subjects excluded from forecasting or not offered in this semester type are hidden.',
  demand: 'Students who can take the subject next semester according to their records: not passed yet and prerequisites met. It is a forecast, not registration.',
  belowMinimum: 'Subjects whose potential demand is under the minimum class size in the capacity rules.',
  quality: 'How sure the count is. Uncertain students might take the subject, but their records are incomplete or a prerequisite is not proven, so they are not in the demand. Open View students to see each student.',
  awaiting: 'Subjects that still need a decision (approve, review or remove) before the forecast can be finalized.',
  counted: 'Students included in the potential demand.',
  uncertain: 'Students who might take the subject, but their records are incomplete or a prerequisite is not proven. They are not in the potential demand.',
  nearGraduation: 'Counted students who can finish their programme within two semesters at the maximum credit load, so they are likely to register.',
  notCounted: 'Students who already passed the subject, have not met a prerequisite, or whose curriculum does not offer it this semester.',
  student: 'Name and student reference. Students from a CSV show the matric number from the file. Students who entered their records in the portal show PORTAL- and their portal record number, because the snapshot does not store matric numbers.',
} as const;

/** A label followed by its info tip; the icon stays on the line of the label's last word. */
export function Help({ label, text }: { label: string; text: string }) {
  const split = label.lastIndexOf(' ');
  return <>{label.slice(0, split + 1)}<span style={{ whiteSpace: 'nowrap' }}>{label.slice(split + 1)}<InfoTip title={label}>{text}</InfoTip></span></>;
}
