import assert from 'node:assert/strict';

// Actual local Worker/runtime regression; deliberately invalid token, no account writes.
for (const base of ['http://127.0.0.1:8787', 'http://127.0.0.1:5173']) {
  for (const body of [undefined, '', '{}', ' ', '{"appRole":"SYSTEM_ADMIN"}']) {
    const response = await fetch(base + '/api/me/initialize', {
      method: 'POST',
      headers: { Authorization: 'Bearer local-initialize-regression' },
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    const empty = body === undefined || body === '';
    assert.equal(response.status, empty ? 401 : 400);
    assert.equal(result.error?.code, empty ? 'SESSION_INVALID' : 'BODY_NOT_ALLOWED');
  }
}
console.log('PASS 10 real HTTP initialization checks: empty requests reach auth; nonempty payloads rejected.');
