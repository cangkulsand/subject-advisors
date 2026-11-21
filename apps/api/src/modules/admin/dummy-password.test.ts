import { expect, it } from 'vitest';
import { DUMMY_PASSWORD_ALPHABET, generateDummyPassword } from './dummy-password';

it('is 20 characters from the alphabet with upper, lower, digit and symbol, every time', () => {
  for (let i = 0; i < 200; i++) {
    const password = generateDummyPassword();
    expect(password).toHaveLength(20);
    expect([...password].every(c => DUMMY_PASSWORD_ALPHABET.includes(c))).toBe(true);
    expect(password).toMatch(/[A-Z]/); expect(password).toMatch(/[a-z]/); expect(password).toMatch(/[0-9]/); expect(password).toMatch(/[!@#$%*\-_]/);
  }
});
it('differs between calls', () => {
  expect(generateDummyPassword()).not.toBe(generateDummyPassword());
});
it('re-draws until every class is present', () => {
  let call = 0;
  // First draw: only "A" (index 0); later draws use real randomness.
  const random = (n: number) => call++ === 0 ? new Uint8Array(n) : crypto.getRandomValues(new Uint8Array(n));
  const password = generateDummyPassword(random);
  expect(password).not.toBe('A'.repeat(20));
  expect(password).toMatch(/[a-z]/);
});
