# S2-P004-005 — Single-card admin users page

- **Status:** DONE
- **Date:** 2026-11-01
- **Sprint:** Sprint 2
- **Owner:** P004 / Programmer 4
- **Related UC / FR:** Admin "Users & Access" (`/admin/users`); follows S2-P004-004
- **Branch / PR:** `feature/p004-s2-admin-users-single-card`; no PR
- **Reviewer:** Coordinator review passed; human review not required by user

## 1. Plan

### Objective / problem

After S2-P004-004 the `/admin/users` page had three cards (a collapsible "Add a user" form,
"Invitations" and the accounts table). The user asked for one card, an icon "Add user" button that
opens a modal, and invitations shown inside the same table, grouped as invitations.

### Scope and requirements

- In scope: web UI of `/admin/users` only (`AdminPages.tsx`, `AdminUserManagement.tsx`,
  `admin.css`) and the admin browser harness (`tools/admin/test-ui.mjs`, `tools/admin/fixtures.mjs`).
- Out of scope: API, shared contracts, database, account detail page.

### Acceptance criteria

- Exactly one `.admin-card` on `/admin/users`.
- "Add user" button with a person-plus icon opens a native modal dialog named "Add user"; success
  closes it and reports in `#admin-action-status`; errors keep it open; Escape/Cancel return focus.
- One table ("Users and invitations table") with an "Invitations (n)" group above an
  "Accounts (n)" group; invitation rows carry an "Invitation" pill, status, invited/expiry dates and
  Revoke for pending rows.

## 2. Implementation

- `AddUserPanel` replaced by `AddUserDialog` (same form plus Cancel; same focus pattern as
  `ReasonDialog`).
- `InvitationsSection` removed; `AdminUsersPage` renders one card with title, icon button, filters
  and a grouped table using one `<tbody>` per group with a `scope="colgroup"` header row.
- Access filter: All (pending invitations + accounts), Active / Suspended (accounts only), Invited
  (invitations only, with an "Invitation status" select defaulting to Pending and its own pager).
  Search term and Role filter apply to invitations client-side; accounts keep server-side filtering.
- Fixture `empty` mode also returns no invitations so the empty state can be exercised.

## 3. Review

- Coordinator reviewed the diff and screenshots (desktop list, dialog open).
- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 702 passed, 27 skipped.
- `npm run test:ui:admin`: 32 checks PASS.
- Known limit: the All view fetches only the first page of pending invitations; the Invited view
  pages through all of them.

## 4. Changelog

- Changed: `/admin/users` is a single card; "Add user" (icon button) opens a modal form; invitations
  and accounts are shown in one grouped table; Access filter gains an "Invited" option.
- Removed: separate "Add a user" and "Invitations" cards and the "Hide form" toggle.
