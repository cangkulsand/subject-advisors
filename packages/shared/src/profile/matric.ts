/** Matric numbers (S3-P004-039). The UTM form is SX + two-digit intake year + serial + programme code + mode + two digits, e.g. SX232315ECJHF04. */
export const MATRIC_BATCH_MAX = 500;

/** Removes whitespace and uppercases: every store and comparison uses this form. */
export function normaliseMatric(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** The intake year (2000 + yy) and the programme code, or null when the number does not start with SX and two digits. No range check. */
export function readMatric(matricNo: string): { intakeYear: number; programmeCode: string | null } | null {
  const match = /^SX(\d{2})\d*([A-Z]{4})?/.exec(normaliseMatric(matricNo));
  if (!match) return null;
  return { intakeYear: 2000 + Number(match[1]), programmeCode: match[2] ?? null };
}

/** Splits a pasted list (new lines, commas, semicolons, tabs or spaces), normalises each number and drops blanks and repeats in order. */
export function splitMatricList(text: string): { matricNos: string[]; repeated: number } {
  const seen = new Set<string>();
  let repeated = 0;
  for (const part of text.split(/[\s,;]+/)) {
    const value = normaliseMatric(part);
    if (!value) continue;
    if (seen.has(value)) repeated += 1; else seen.add(value);
  }
  return { matricNos: [...seen], repeated };
}
