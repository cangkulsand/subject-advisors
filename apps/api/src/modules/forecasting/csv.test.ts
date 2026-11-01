import { describe, expect, it } from 'vitest';
import { CsvFileError, csvLine, decodeCsvBytes, parseCsv } from './csv';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('CSV decoding', () => {
  it('strips one UTF-8 BOM and keeps the text', () => {
    expect(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('a,b')]))).toBe('a,b');
  });
  it('rejects invalid UTF-8 and NUL bytes', () => {
    expect(() => decodeCsvBytes(new Uint8Array([0xff, 0xfe, 0x41]))).toThrow(CsvFileError);
    expect(() => decodeCsvBytes(bytes('a\u0000b'))).toThrow(/NUL/);
  });
});

describe('CSV parsing', () => {
  it('handles LF, CRLF and a missing final newline, numbering records from the header', () => {
    for (const text of ['a,b\n1,2\n', 'a,b\r\n1,2\r\n', 'a,b\n1,2']) {
      expect(parseCsv(text).records).toEqual([{ row: 1, fields: ['a', 'b'] }, { row: 2, fields: ['1', '2'] }]);
    }
  });
  it('supports quoted commas, doubled quotes and embedded line breaks as one record', () => {
    const { records } = parseCsv('a,b\n"x,y","he said ""hi"""\n"line1\nline2",z\nlast,row');
    expect(records[1]!.fields).toEqual(['x,y', 'he said "hi"']);
    expect(records[2]).toEqual({ row: 3, fields: ['line1\nline2', 'z'] });
    expect(records[3]!.row).toBe(4);
  });
  it('keeps empty fields and skips fully blank lines while still counting them', () => {
    const { records } = parseCsv('a,b,c\n\n,,\nx,,z\n');
    expect(records.map((r) => r.row)).toEqual([1, 3, 4]);
    expect(records[1]!.fields).toEqual(['', '', '']);
  });
  it('tolerates padding around quoted fields', () => {
    expect(parseCsv('a,b\n "x" , "y" \n').records[1]!.fields.map((f) => f.trim())).toEqual(['x', 'y']);
  });
  it.each([
    ['unterminated quote', 'a,b\n"x,y\n'],
    ['quote inside field', 'a,b\nx"y,z\n'],
    ['text after closing quote', 'a,b\n"x"y,z\n'],
    ['bare carriage return', 'a,b\r1,2\r'],
  ])('rejects %s as malformed', (_name, text) => {
    expect(() => parseCsv(text)).toThrowError(expect.objectContaining({ code: 'CSV_MALFORMED' }));
  });
  it('stops early when the record limit is exceeded', () => {
    const text = 'h\n' + Array.from({ length: 50 }, (_, i) => String(i)).join('\n');
    const result = parseCsv(text, 10);
    expect(result.truncated).toBe(true);
    expect(result.records).toHaveLength(10);
  });
  it('round-trips through csvLine', () => {
    const values = ['plain', 'a,b', 'q"q', 'two\nlines', ''];
    expect(parseCsv(csvLine(values)).records[0]!.fields).toEqual(values);
  });
});
