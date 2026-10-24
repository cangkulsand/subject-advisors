# Programmer 4 Sprint 1 implementation plan

Scope: P004 / M0 / UC01 Register Account and UC02 Login / Logout.
Source: `sprint1 (1).md`, Section 4 and ownership/dependency rules.
No other programmer's use cases or FOUNDATION application shell are included.

## Starting state

The target directory contained the sprint specification, with no application source,
package manifest, Git repository or branch. Other setup notes appeared during the
session and have been preserved. Existing unrelated workspace projects were not edited.

## Implementation sequence

1. Define auth-only contracts for verified identity, access assignment, current account
   and P001's profile-completion reader. Use a type-only frontend bridge until FOUNDATION
   publishes shared contracts.
2. Add P004's independent access-assignment migration with unique Clerk IDs and checked
   roles/statuses. Implement parameterized Neon queries and conflict-safe initialization
   that never updates an existing role or suspension.
3. Verify bearer session tokens with Clerk's backend SDK, authorized frontend origins,
   and live session/user lookups. Recheck the verified primary institutional email on
   every student request. Add server-side role and profile guards.
4. Implement GET /api/me and bodyless POST /api/me/initialize. Consume verified identity
   exclusively; expose no privileged-role assignment endpoint.
5. Build reusable React Clerk auth controls, account completion, access guards, logout
   recovery and explicit missing-feature placeholders. Defer router/app shell registration
   to FOUNDATION and profile setup to P001.
6. Verify authorization policy, provider failure/revocation boundary, persistence queries,
   frontend API handling, mobile-width browser states and keyboard retry. Supply opt-in
   Neon migration tests and a live-service acceptance checklist.
7. Hand off integration instructions, configuration and trusted manual provisioning.

## Acceptance and boundaries

Implemented: feature modules, migration, auth contracts, auth validation harness,
unit tests, browser tests with mocked Clerk/API and opt-in database tests.

Integration pending: FOUNDATION's React/Vite app and Worker router/configuration,
P001's profile reader and setup form, provider settings and live-service verification.
No fake production identities, persistence or profile completion are provided.
No Git branch/PR can be reported because this directory is not a Git repository.

Shared additions are limited to package.json and auth-scoped validation configuration,
a lockfile if dependency installation permits it, and gitignore entries for local output.
These are a temporary feature harness, not a scaffold of the shared foundation.
Merge their dependencies/scripts into FOUNDATION's existing tooling on integration.
