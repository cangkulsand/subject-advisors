/** PostgreSQL INTEGER IDs use canonical decimal strings at the browser/API boundary. */
export function offeringId(value: unknown): string {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))) {
    throw new Error('Invalid PostgreSQL integer identifier');
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 2_147_483_647) {
    throw new Error('Invalid PostgreSQL integer identifier');
  }
  return String(number);
}
