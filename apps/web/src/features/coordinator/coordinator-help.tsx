import { InfoTip } from '../../components/info-tip/InfoTip';

/** Plain-language explanations shown in the hover info tips of the forecast screens. */
export const HELP = {
  notTakenYet: 'Students whose curriculum includes the subject and who have not passed it or been exempted.',
  eligible: 'Students who have not taken the subject and meet its prerequisites according to their records. This is the number you decide on; it is a forecast, not registration.',
  action: 'Pending subjects are not shown to students. Approved subjects are offered when selection opens. Removed subjects are listed beside the table and can be added back.',
  picked: 'Students who picked this subject before selection closed. A pick is not a registration.',
  counted: 'Students counted as eligible to take the subject.',
  nearGraduation: 'Counted students who can finish their programme within two semesters at the maximum credit load, so they are likely to register.',
  notCounted: 'Students who already passed the subject, have not met a prerequisite, whose curriculum does not offer it this semester, or whose records are incomplete (for example no academic history yet, or a prerequisite that cannot be proven).',
  student: 'Name, then the matric number: from the CSV, or from the profile of students who entered their records in the portal. A portal student who has not added a matric number yet shows their sign-in email, or PORTAL- and their portal record number when no email is known.',
} as const;

/** A label followed by its info tip; the icon stays on the line of the label's last word. */
export function Help({ label, text }: { label: string; text: string }) {
  const split = label.lastIndexOf(' ');
  return <>{label.slice(0, split + 1)}<span style={{ whiteSpace: 'nowrap' }}>{label.slice(split + 1)}<InfoTip title={label}>{text}</InfoTip></span></>;
}
