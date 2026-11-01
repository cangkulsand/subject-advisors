/** Strict, dependency-free CSV v1 reader (RFC 4180 subset): UTF-8 with optional BOM, comma delimiter, LF or CRLF. */
export type CsvFileErrorCode = 'CSV_ENCODING_INVALID' | 'CSV_MALFORMED' | 'CSV_EMPTY';
export class CsvFileError extends Error {
  constructor(readonly code: CsvFileErrorCode, message: string, readonly row: number | null = null) { super(message); }
}
export interface CsvRecord { /** 1-based record number; the header is record 1. */ row: number; fields: string[] }

/** Decodes bytes as strict UTF-8 and removes one leading BOM. NUL bytes are rejected. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new CsvFileError('CSV_ENCODING_INVALID', 'The file is not valid UTF-8 text.'); }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000')) throw new CsvFileError('CSV_ENCODING_INVALID', 'The file contains binary (NUL) characters.');
  return text;
}

/**
 * Parses CSV text into records. Fully blank lines are skipped (record numbers still count them).
 * Quoted fields may contain commas, doubled quotes and line breaks; a quote inside an unquoted field,
 * text after a closing quote, or an unterminated quote is malformed. `maxRecords` stops early with a
 * truncated marker so oversized files are not fully materialised.
 */
export function parseCsv(text: string, maxRecords = Number.POSITIVE_INFINITY): { records: CsvRecord[]; truncated: boolean } {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;     // inside a quoted section
  let wasQuoted = false;  // current field started with a quote
  let afterQuote = false; // just closed a quote
  let hasContent = false; // current line has any character
  let row = 1;
  const endField = () => { fields.push(field); field = ''; wasQuoted = false; afterQuote = false; };
  const endRecord = (): boolean => {
    if (hasContent) { endField(); records.push({ row, fields }); }
    fields = []; hasContent = false; row += 1;
    return records.length > maxRecords;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; afterQuote = true; }
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      if (field.trim() !== '' || wasQuoted || afterQuote) throw new CsvFileError('CSV_MALFORMED', 'A quote appears inside an unquoted field.', row);
      field = ''; quoted = true; wasQuoted = true; hasContent = true;
    } else if (ch === ',') {
      hasContent = true; endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      else if (ch === '\r') throw new CsvFileError('CSV_MALFORMED', 'A bare carriage return is not a valid line ending.', row);
      if (endRecord()) return { records: records.slice(0, maxRecords), truncated: true };
    } else {
      if (afterQuote) {
        if (ch === ' ' || ch === '	') continue; // tolerate padding after a closing quote
        throw new CsvFileError('CSV_MALFORMED', 'Text follows a closing quote.', row);
      }
      field += ch; hasContent = true;
    }
  }
  if (quoted) throw new CsvFileError('CSV_MALFORMED', 'A quoted field is not closed.', row);
  if (hasContent) { endField(); records.push({ row, fields }); }
  const truncated = records.length > maxRecords;
  return { records: truncated ? records.slice(0, maxRecords) : records, truncated };
}

/** Builds a CSV line (used for the template and tests). */
export function csvLine(values: readonly string[]): string {
  return values.map((value) => (/[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value)).join(',');
}
