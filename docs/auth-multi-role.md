# Multi-role account access

Status: implementation ready for review on `feature/p004-multi-role-access`. Live migration, grants, provider setup and deployment remain unexecuted. Cloudflare builds from `main`; merge only after the required schema migration and release review.

Clerk remains the identity provider. `user_access_assignment` remains one account row per immutable Clerk user ID, with one global suspension status. `user_role_assignment` is the authoritative list of explicit memberships. The legacy `app_role` column is retained as a default-view projection, not an authorization source. No role is inferred from email, client headers, query parameters, UI selection, or public signup input.

| Role | Eligibility after an explicit grant |
| --- | --- |
| STUDENT | Verified primary email with exact `graduate.utm.my` domain; profile completion required for records/offerings/pathway |
| COORDINATOR | Verified primary email with exact `utm.my` domain |
| SYSTEM_ADMIN | Verified primary email and trusted identity-bound grant |
| Protected owner's coordinator exception | Explicit `OWNER_STUDENT_COORDINATOR` grant on the same account as the protected admin membership; verified primary `graduate.utm.my` email |

The protected owner has all three roles. The protected admin membership cannot be deleted, demoted, unprotected, transferred to another account, or replaced by another owner through normal provisioning. The account's Clerk ID cannot be remapped. This does not bypass global suspension or Clerk session revocation. Database/provider superuser recovery remains outside normal application controls.

The privately verified owner identity from this implementation session is recorded in ignored `.wrangler/multi-role-owner-context.json` for continuation. It is not an authorization token and the provisioning command must reverify that identity before any live grant. No real email or Clerk ID is embedded in migrations, fixtures or runtime configuration.

Students see their student workspace only. Approved staff with one role see their assigned workspace. Multi-role accounts see a Workspace view selector in student header controls and staff placeholder pages. A switch revalidates `/api/me`, checks the requested role is still eligible, and uses the existing unsaved-change navigation guard. Staff dashboards remain placeholders; this change adds no forecasting or user-management UI.

## API and cache compatibility

The maintained account contract is [auth-multi-role.openapi.json](api/auth-multi-role.openapi.json). `/api/me` and empty-body `/api/me/initialize` retain `appRole`, `profileState` and `landingPath`, and add:

- `roles`: explicit database memberships.
- `availableRoles`: email-eligible subset of those memberships.
- `studentProfileState`: independent student profile status; an incomplete/unavailable student profile does not prevent a granted staff view.

Student APIs independently require the student grant, exact verified email, ownership and applicable profile completion. Every request checks current account suspension and memberships. Browser snapshots are UI state, never authorization. Account cache version v3 rejects old stored role data and invalid/inconsistent role sets. The client can normalize a completely legacy network response into its one known role during rolling deployment; malformed partial new contracts are rejected. Academic profile/record cache retention is unchanged.

## Rollout order

1. Review the forward migration `0004_multi_role_access.sql`. Never modify the checksums or contents of migrations 0000–0003.
2. Apply 0004 with the existing gated database tooling to the explicitly approved development target. Backfill preserves existing grants, IDs and audit references. No owner is automatically chosen or granted privileged access.
3. Deploy membership-aware backend and client together. Do not issue new multi-role grants while old single-role backend code is still serving requests. Missing role tables/data fail closed.
4. Run the trusted provisioning dry-run for the exact Clerk user ID and verified primary email. Review its result before running the explicit apply command.
5. Sign out/in after an out-of-band initial role grant, or revalidate access through a role switch. Role revocations and suspension are enforced by the backend on the next protected API request.

Rollback retains additive tables/history and rolls back application code only. The old application cannot safely represent newly multi-role grants; reconcile this limitation before any rollback. No destructive down migration is provided.

## Trusted owner provisioning

`tools/auth/provision-roles.mjs` is an operator-only command, never an HTTP endpoint. It validates the exact Clerk ID against the expected verified primary email using the configured Clerk secret key, rejects banned/locked identities, and uses the existing explicit-target safeguards. Use credentials from the same Clerk instance as the application. Development and production Clerk identities are separate.

Supply `CLERK_SECRET_KEY` and the dedicated `DB_FOUNDATION_...` connection variable in the operator environment (or a private ignored environment file). The approved target JSON must pass `tools/db/migrations.mjs` validation and identify the exact database/branch. Do not use application `DATABASE_URL` as an implicit target. Never commit credentials or place secret values in command arguments.

```powershell
node tools/auth/provision-roles.mjs --target <approved-target.json> --user-id <verified-Clerk-user-id> --expected-email <verified-primary-email> --roles STUDENT,COORDINATOR,SYSTEM_ADMIN --owner --actor <operator-identity> --reason "Approved initial protected owner"
```

This default dry-run performs only SELECTs after identity verification. To execute the reviewed grant, repeat the same command with `--apply`. This implementation task has not run that live command. Normal coordinator provisioning uses `--roles COORDINATOR`, an exact verified `utm.my` address and no `--owner` flag. Provisioning is additive, audited, idempotent and refuses to reactivate suspended accounts. A new staff account does not retain an implicit student grant. Existing grants are preserved. Protected owner rotation/unprotection is unsupported and requires a separately reviewed database-owner recovery process.

## Local verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run db:review
npm.cmd run test:db-tooling
node --test tools/auth/role-provisioning.test.mjs
node tools/auth/test-multi-role-db.mjs
$env:PLAYWRIGHT_BROWSERS_PATH = (Resolve-Path .cache-offerings/playwright).Path
node tools/integration/test-ui.mjs --installed
npm.cmd run check:cloudflare
```

The PostgreSQL runner creates a new disposable cluster under ignored `.wrangler/multi-role-postgres/`, binds loopback only, and stops it after tests. It never reads application database credentials. Windows test binaries were installed locally from `@embedded-postgres/windows-x64@18.4.0-beta.17`; provide `MULTI_ROLE_POSTGRES_BIN` to an equivalent PostgreSQL 17+ bin directory elsewhere. Local test clusters use loopback trust authentication and must not be exposed remotely. Real PostgreSQL tests cover backfill, baseline/schema/role boundaries, protected owner identity and membership, audit immutability, provisioning, and two-session races for last-admin revocation/suspension. Clerk/API browser fixtures are explicitly mocked and do not establish live provider acceptance.
