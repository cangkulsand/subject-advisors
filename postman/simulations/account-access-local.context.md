# Account access local simulation

Created 2026-10-28 from the repository-owned account API contract. No shared workspace or cloud mock was created.

## Purpose

Run the actual browser account client/cache against the local account API fixture. The source contract is `docs/api/auth-multi-role.openapi.json`; the handler is `../mocks/account-access/default.js`. This does not substitute for backend authorization, PostgreSQL, or Clerk acceptance tests.

## Execution

```powershell
postman simulation run postman/simulations/account-access-local.sim.yaml --port auto --no-history --output ndjson
# In another terminal, use the account member address from the listening event:
$env:ROLE_SIMULATION_URL = '<local account member address>'
node tools/auth/test-role-simulation.mjs
```

Stop with Ctrl+C after verification. Mock edits require restarting the simulation.

## Assumptions

- Preserve the advertised `account` path prefix; omitting it misses the member (observed 2026-10-28).
- Only fictional identities/tokens are used. The fixture models role response handling, not JWT verification or backend grants (reasoned 2026-10-28, `default.js`).

## Observations

<!-- begin:observations -->
- 2026-10-28: Postman CLI 1.74.0 served every client operation on the `account` member; none was silent. Five client/cache checks passed, including the expected 403 denial. The simulation was stopped afterwards.
<!-- end:observations -->

## What didn't work

- 2026-10-28: The first fixture returned only STUDENT instead of owner roles because `pm.state.get/set` return promises; awaiting them fixed the fixture and the rerun passed.
