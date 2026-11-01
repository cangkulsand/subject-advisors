import { describe, expect, it } from 'vitest';
import {
  ADMIN_REASON_MAX_LENGTH, normaliseEmail, normaliseReason, validateChangeAccessRequest,
  validateCreateAccountRequest, validateCreateInvitationRequest, validateGrantRoleRequest,
  validateRevokeRoleRequest,
} from './admin';

describe('normaliseReason', () => {
  it('trims', () => expect(normaliseReason('  hi  ')).toBe('hi'));
  it('accepts the max length', () => expect(normaliseReason('a'.repeat(ADMIN_REASON_MAX_LENGTH))).not.toBeNull());
  it.each(['', '   ', 'a'.repeat(ADMIN_REASON_MAX_LENGTH + 1), null, 5, undefined])('rejects %j', v => {
    expect(normaliseReason(v)).toBeNull();
  });
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
