import { describe, expect, it } from 'vitest';
import { DUMMY_CLERK_USER_LIMIT, dummyEmail, dummyMatric, isDummyEmail, validateCreateDummyUserRequest, validateResetDummyPasswordRequest } from './dummy';

const student = { role: 'STUDENT', name: 'Aina', curriculumId: 1, learningCentreId: 2, reason: 'testing' };
const coordinator = { role: 'COORDINATOR', name: 'Dr. Lim', programmeId: 3, learningCentreId: 2, reason: 'testing' };

describe('dummyEmail', () => {
  it('builds a student address on graduate.utm.my', () => {
    expect(dummyEmail('Aina Binti Ali', 'STUDENT', '3f9a')).toBe('aina-binti-ali-3f9a+clerk_test@graduate.utm.my');
  });
  it('builds a coordinator address on utm.my', () => {
    expect(dummyEmail('Dr. Lim', 'COORDINATOR', '00ff')).toBe('dr-lim-00ff+clerk_test@utm.my');
  });
  it('falls back to "dummy" when the name has no Latin letters or digits', () => {
    expect(dummyEmail('###', 'STUDENT', 'abcd')).toBe('dummy-abcd+clerk_test@graduate.utm.my');
    expect(dummyEmail('李明', 'STUDENT', 'abcd')).toBe('dummy-abcd+clerk_test@graduate.utm.my');
  });
  it('keeps the slug to 20 characters without a trailing dash', () => {
    const slug = dummyEmail('Abcdefghij Klmnopqrs Tuvwxyz Abcdefghij', 'STUDENT', 'abcd').split('-abcd+')[0]!;
    expect(slug.length).toBeLessThanOrEqual(20);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('isDummyEmail', () => {
  it('recognises only +clerk_test addresses', () => {
    expect(isDummyEmail('x+clerk_test@utm.my')).toBe(true);
    expect(isDummyEmail('X+CLERK_TEST@utm.my')).toBe(true);
    expect(isDummyEmail('x@utm.my')).toBe(false);
    expect(isDummyEmail(null)).toBe(false);
    expect(isDummyEmail(undefined)).toBe(false);
  });
});

describe('dummyMatric and limit', () => {
  it('prefixes DUMMY', () => { expect(dummyMatric('012345')).toBe('DUMMY012345'); });
  it('caps Clerk development users at 100', () => { expect(DUMMY_CLERK_USER_LIMIT).toBe(100); });
});

describe('validateCreateDummyUserRequest', () => {
  it('accepts a student and a coordinator', () => {
    expect(validateCreateDummyUserRequest(student)).toEqual({ ok: true, value: student });
    expect(validateCreateDummyUserRequest(coordinator)).toEqual({ ok: true, value: coordinator });
  });
  it('trims the name', () => {
    expect(validateCreateDummyUserRequest({ ...student, name: '  Aina  ' })).toEqual({ ok: true, value: student });
  });
  it.each([
    ['system admin role', { ...student, role: 'SYSTEM_ADMIN' }],
    ['empty name', { ...student, name: '  ' }],
    ['long name', { ...student, name: 'x'.repeat(101) }],
    ['student without curriculum', { role: 'STUDENT', name: 'A', learningCentreId: 2, reason: 'r' }],
    ['coordinator without programme', { role: 'COORDINATOR', name: 'A', learningCentreId: 2, reason: 'r' }],
    ['zero id', { ...student, learningCentreId: 0 }],
    ['student with programmeId', { ...student, programmeId: 3 }],
    ['unknown field', { ...student, password: 'x' }],
    ['empty reason', { ...student, reason: ' ' }],
  ])('rejects %s', (_label, body) => {
    expect(validateCreateDummyUserRequest(body).ok).toBe(false);
  });
});

describe('validateResetDummyPasswordRequest', () => {
  it('needs a reason and nothing else', () => {
    expect(validateResetDummyPasswordRequest({ reason: ' lost it ' })).toEqual({ ok: true, value: { reason: 'lost it' } });
    expect(validateResetDummyPasswordRequest({ reason: '' }).ok).toBe(false);
    expect(validateResetDummyPasswordRequest({ reason: 'x', password: 'y' }).ok).toBe(false);
  });
});
