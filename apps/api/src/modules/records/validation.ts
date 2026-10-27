import { fields, invalid, nonnegative, positiveId, text } from '../profile/validation';
import { statuses, type RecordInput, type RecordStatus } from './contracts';
export function recordInput(value: unknown): RecordInput {
  const body = fields(value, ['subjectId','semesterId','status','grade','recognizedCredits','remarks']);
  if (!statuses.includes(body.status as RecordStatus)) invalid('Select Completed, Exempted, Failed or Withdrawn.');
  const status = body.status as RecordStatus;
  const credits = status === 'COMPLETED' && (body.recognizedCredits === undefined || body.recognizedCredits === null)
    ? null : nonnegative(body.recognizedCredits, 'Recognized credits');
  if ((status === 'FAILED' || status === 'WITHDRAWN') && credits !== 0) invalid('Failed and withdrawn records must have zero recognized credits.');
  return {
    subjectId: positiveId(body.subjectId, 'Subject'),
    semesterId: body.semesterId === null || body.semesterId === undefined ? null : positiveId(body.semesterId, 'Semester'),
    status, grade: text(body.grade, 'Grade', 5), recognizedCredits: credits,
    remarks: text(body.remarks, 'Remarks', 255, status === 'EXEMPTED'),
  };
}
