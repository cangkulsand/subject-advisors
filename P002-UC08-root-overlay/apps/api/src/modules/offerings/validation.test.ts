import { describe, expect, it } from 'vitest';
import { parseSave, readSave } from './validation';

const semesterId = '201';
const subject = '101';
describe('offering input boundary', () => {
  it('allows a confirmed empty list for clearing offerings', () => {
    expect(parseSave({ semesterId, curriculumSubjectIds: [] })).toEqual({ semesterId, curriculumSubjectIds: [] });
  });
  it.each([
    null, [], {}, { semesterId }, { semesterId, curriculumSubjectIds: 'all' },
    { semesterId, curriculumSubjectIds: [42.5] }, { semesterId: "' OR TRUE", curriculumSubjectIds: [] },
    { semesterId, curriculumSubjectIds: [], studentId: 'other' },
    { semesterId, curriculumSubjectIds: [], clerkUserId: 'other' },
    { semesterId, curriculumSubjectIds: Array(501).fill(subject) },
  ])('rejects malformed or ownership-bearing payload %j', value => {
    expect(() => parseSave(value)).toThrow();
  });
  it('normalizes numeric and decimal-string IDs before checking duplicates', () => {
    expect(() => parseSave({ semesterId, curriculumSubjectIds: [subject, Number(subject)] })).toThrow('only once');
  });
  it('accepts valid JSON, including content-type parameters', async () => {
    const body = { semesterId, curriculumSubjectIds: [subject] };
    expect(await readSave(new Request('https://test.invalid', { method: 'PUT', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }))).toEqual(body);
  });
  it('rejects malformed JSON', async () => {
    await expect(readSave(new Request('https://test.invalid', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' }))).rejects.toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });
  it('requires JSON content type', async () => {
    await expect(readSave(new Request('https://test.invalid', { method: 'PUT', body: '{}' }))).rejects.toMatchObject({ status: 415 });
  });
  it('limits actual streamed bytes without trusting Content-Length', async () => {
    const request = new Request('https://test.invalid', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(32_769),
    });
    await expect(readSave(request)).rejects.toMatchObject({ status: 413 });
  });
});
