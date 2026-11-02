import type { Progress, ProgressSource, ProgressSubject } from './contracts';
export function calculateProgress(source: ProgressSource): Progress {
  const { curriculum, attempts } = source;
  const warnings: string[] = [];
  const warn = (value: string) => { if (!warnings.includes(value)) warnings.push(value); };
  const totalCredits = Number.isInteger(curriculum.totalCredits) && curriculum.totalCredits > 0 ? curriculum.totalCredits : null;
  if (totalCredits === null) warn('The programme credit requirement is not configured. Remaining credits and percentage are unavailable.');
  if (!curriculum.subjects.length) warn('Curriculum subjects are not configured. Subject completion cannot be finalized.');
  if (!source.requirements.length) warn('No additional programme requirement groups are configured. Credit progress alone does not confirm programme completion.');
  const known = new Set(curriculum.subjects.map(s => s.subjectId));
  if (attempts.some(a => !known.has(a.subjectId))) warn('Some recorded subjects are outside the selected curriculum and were excluded.');
  const subjects: ProgressSubject[] = curriculum.subjects.map(subject => {
    const valid = attempts.filter(a => a.subjectId === subject.subjectId).filter(a => {
      const credits = a.recognizedCredits;
      const okay = Number.isInteger(credits) && credits! >= 0 && credits! <= subject.credits &&
        (a.status === 'COMPLETED' ? credits === subject.credits : a.status === 'EXEMPTED' ? Boolean(a.remarks?.trim()) :
          (a.status === 'FAILED' || a.status === 'WITHDRAWN') && credits === 0);
      if (!okay) warn('Some academic records have incomplete or inconsistent credit/exemption information and were excluded. Review your subject records.');
      return okay;
    });
    const completed = valid.some(a => a.status === 'COMPLETED');
    const exemptions = valid.filter(a => a.status === 'EXEMPTED');
    const outcome = completed ? 'COMPLETED' : exemptions.length ? 'EXEMPTED' : 'REMAINING';
    return { ...subject, outcome, earnedCredits: completed ? subject.credits : exemptions.length ? Math.max(...exemptions.map(a => a.recognizedCredits!)) : 0 };
  });
  const sum = (rows: ProgressSubject[]) => rows.reduce((n,s) => n + s.earnedCredits, 0);
  const earnedCredits = sum(subjects), completedCredits = sum(subjects.filter(s => s.outcome === 'COMPLETED'));
  const requirements = source.requirements.map(r => {
    const type = r.type.trim().toUpperCase();
    const matches = type === 'COMPULSORY' ? subjects.filter(s => s.compulsory) : subjects.filter(s => s.category.trim().toUpperCase() === type);
    const configured = matches.length > 0 && (r.credits !== null || r.subjects !== null);
    const earned = sum(matches), satisfied = matches.filter(s => s.outcome !== 'REMAINING').length;
    return { ...r, earnedCredits: configured ? earned : null, satisfiedSubjects: configured ? satisfied : null,
      status: !configured ? 'UNASSESSED' as const : (r.credits === null || earned >= r.credits) && (r.subjects === null || satisfied >= r.subjects) ? 'MET' as const : 'OUTSTANDING' as const };
  });
  if (requirements.some(r => r.status === 'UNASSESSED')) warn('Some requirement groups have no matching classification or threshold. They need configuration review.');
  return { programme: curriculum.programme, version: curriculum.version, totalCredits, earnedCredits, completedCredits,
    exemptionCredits: earnedCredits-completedCredits, remainingCredits: totalCredits === null ? null : Math.max(0,totalCredits-earnedCredits),
    percent: totalCredits === null ? null : Math.min(100,Math.round(earnedCredits/totalCredits*1000)/10),
    completedSubjects: subjects.filter(s => s.outcome === 'COMPLETED').length,
    exemptedSubjects: subjects.filter(s => s.outcome === 'EXEMPTED').length,
    zeroCreditExemptions: subjects.filter(s => s.outcome === 'EXEMPTED' && s.earnedCredits === 0).length,
    outstandingCompulsory: subjects.filter(s => s.compulsory && s.outcome === 'REMAINING').length,
    noHistory: attempts.length === 0, warnings, subjects, requirements };
}
