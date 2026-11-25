import { describe, expect, it } from 'vitest';
import {
  ADMIN_REASON_MAX_LENGTH, SYSTEM_ADMIN_EMAIL_DOMAINS, isSystemAdminEmailDomain, normaliseEmail, normaliseReason, validateChangeAccessRequest,
  validateCreateAccountRequest, validateCreateInvitationRequest, validateGrantRoleRequest,
  validateRevokeRoleRequest, validateChangeIntakeYearRequest, ADMIN_INTAKE_YEAR_MIN, ADMIN_INTAKE_YEAR_MAX,
} from './admin';

describe('normaliseReason', () => {
  it('trims', () => expect(normaliseReason('  hi  ')).toBe('hi'));
  it('accepts the max length', () => expect(normaliseReason('a'.repeat(ADMIN_REASON_MAX_LENGTH))).not.toBeNull());
  it.each(['', '   ', 'a'.repeat(ADMIN_REASON_MAX_LENGTH + 1), null, 5, undefined])('rejects %j', v => {
    expect(normaliseReason(v)).toBeNull();
  });
});

describe('isSystemAdminEmailDomain', () => {
  it('accepts exactly gmail.com, case-insensitively (S3-P004-033)', () => {
    for (const address of ['a@gmail.com', 'A@GMAIL.COM', ' a@Gmail.Com ']) expect(isSystemAdminEmailDomain(address)).toBe(true);
  });
  it('rejects subdomains, lookalikes and malformed addresses', () => {
    for (const address of ['a@utm.my', 'a@graduate.utm.my', 'a@sub.gmail.com', 'a@evil-gmail.com', 'a@gmail.com.evil.io', 'a@utm.my.evil', 'a@mail.utm.my', 'a@gmail.com@x.io', '@gmail.com', 'gmail.com', 'a b@gmail.com', '']) expect(isSystemAdminEmailDomain(address)).toBe(false);
  });
  it('keeps the single source list', () => { expect([...SYSTEM_ADMIN_EMAIL_DOMAINS]).toEqual(['gmail.com']); });
});

describe('normaliseEmail', () => {
  it('trims and lower-cases', () => expect(normaliseEmail(' A.B@UTM.my ')).toBe('a.b@utm.my'));
  it.each(['', 'a', 'a@b', 'a b@utm.my', 'a@@utm.my', '@utm.my', 'a@utm..my', 3, null])('rejects %j', v => {
    expect(normaliseEmail(v)).toBeNull();
  });
});

describe.each([
  ['account', validateCreateAccountRequest],
  ['invitation', validateCreateInvitationRequest],
])('create %s request', (_name, validate) => {
  const good = { email: 'A@utm.my', roles: ['COORDINATOR'], reason: ' onboarding ' };
  it('normalises', () => {
    expect(validate(good)).toEqual({ ok: true, value: { email: 'a@utm.my', roles: ['COORDINATOR'], reason: 'onboarding' } });
  });
  it.each([
    ['unknown field', { ...good, extra: 1 }],
    ['empty roles', { ...good, roles: [] }],
    ['missing roles', { email: good.email, reason: good.reason }],
    ['duplicate roles', { ...good, roles: ['STUDENT', 'STUDENT'] }],
    ['invalid role', { ...good, roles: ['ROOT'] }],
    ['bad email', { ...good, email: 'nope' }],
    ['blank reason', { ...good, reason: '  ' }],
    ['non-object', 'x'],
    ['array', []],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(validate(body).ok).toBe(false);
  });
});

describe('grant / revoke / access requests', () => {
  it('validates grant', () => {
    expect(validateGrantRoleRequest({ role: 'STUDENT', reason: ' r ' })).toEqual({ ok: true, value: { role: 'STUDENT', reason: 'r' } });
    expect(validateGrantRoleRequest({ role: 'X', reason: 'r' }).ok).toBe(false);
    expect(validateGrantRoleRequest({ role: 'STUDENT', reason: 'r', x: 1 }).ok).toBe(false);
  });
  it('validates revoke', () => {
    expect(validateRevokeRoleRequest({ reason: 'r' })).toEqual({ ok: true, value: { reason: 'r' } });
    expect(validateRevokeRoleRequest({}).ok).toBe(false);
    expect(validateRevokeRoleRequest({ reason: 'r', role: 'STUDENT' }).ok).toBe(false);
  });
  it('validates access change', () => {
    expect(validateChangeAccessRequest({ status: 'SUSPENDED', reason: 'r' })).toEqual({ ok: true, value: { status: 'SUSPENDED', reason: 'r' } });
    expect(validateChangeAccessRequest({ status: 'DELETED', reason: 'r' }).ok).toBe(false);
    expect(validateChangeAccessRequest({ status: 'ACTIVE', reason: '' }).ok).toBe(false);
  });
});

describe('validateChangeIntakeYearRequest (S3-P004-037)', () => {
  it('accepts an integer year in range and trims the reason', () => {
    expect(validateChangeIntakeYearRequest({ intakeYear: 2022, reason: ' Wrong intake at setup ' })).toEqual({ ok: true, value: { intakeYear: 2022, reason: 'Wrong intake at setup' } });
    expect(validateChangeIntakeYearRequest({ intakeYear: ADMIN_INTAKE_YEAR_MIN, reason: 'r' }).ok).toBe(true);
    expect(validateChangeIntakeYearRequest({ intakeYear: ADMIN_INTAKE_YEAR_MAX, reason: 'r' }).ok).toBe(true);
  });
  it.each([1989, 2201, 2022.5, '2022', null, undefined, Number.NaN])('rejects intake year %j', intakeYear => {
    expect(validateChangeIntakeYearRequest({ intakeYear, reason: 'r' })).toEqual({ ok: false, error: 'Enter an intake year between 1990 and 2200.' });
  });
  it('requires a bounded reason and rejects unknown fields', () => {
    expect(validateChangeIntakeYearRequest({ intakeYear: 2022, reason: '  ' }).ok).toBe(false);
    expect(validateChangeIntakeYearRequest({ intakeYear: 2022, reason: 'a'.repeat(ADMIN_REASON_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(validateChangeIntakeYearRequest({ intakeYear: 2022 }).ok).toBe(false);
    expect(validateChangeIntakeYearRequest({ intakeYear: 2022, reason: 'r', curriculumId: 3 }).ok).toBe(false);
    expect(validateChangeIntakeYearRequest(null).ok).toBe(false);
  });
});
