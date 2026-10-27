import { describe, expect, it } from 'vitest';
import { offeringId } from './identifiers';

describe('canonical PostgreSQL integer identifiers', () => {
  it.each([1, '1', 2_147_483_647, '2147483647'])('normalizes %j', value => {
    expect(offeringId(value)).toBe(String(value));
  });
  it.each([0, -1, 1.5, 2_147_483_648, '', '01', ' 1', '+1', '1e2', '1.0', '2147483648', null, true,
    'a0000000-0000-4000-8000-000000000001'])('rejects invalid ID %j', value => {
    expect(() => offeringId(value)).toThrow();
  });
});
