# S3-P004-011 — Sign-up tells students to use their @graduate.utm.my email

- **Status:** Implemented on branch, awaiting owner merge
- **Date:** 2026-11-17
- **Sprint:** Sprint 3 (hotfix)
- **Owner:** P004 (M0 authentication)
- **Related UC / FR:** UC01 (student registration); student accounts need a verified @graduate.utm.my email
- **Branch / PR:** `hotfix/signup-student-email`; no PR
- **Reviewer:** Pending

## 1. Plan

Students reached the Clerk sign-up form without a clear note that only their UTM student email works. The rule was
already enforced by the API (other domains are refused after sign-up) but only mentioned in one plain line.

## 2. Change

- `/sign-up` (`apps/web/src/features/auth/Auth.tsx`, `auth.css`): a "Student email required" notice above the form:
  "Sign up with your UTM student email ending in **@graduate.utm.my** (for example, name@graduate.utm.my). Other email
  addresses cannot be used for a student account." It is a `role="note"` labelled by its title. `/sign-in` keeps the
  existing one-line text.
- Home page (`apps/web/src/features/landing/LandingPage.tsx`, `landing.css`): "Students: sign up with your
  @graduate.utm.my email." under the "Create your account" button.
- No change to who may register; the API rule is unchanged.

## 3. Tests

- `tools/landing/test-ui.mjs`: two new checks (the notice is on `/sign-up` above the form and names the domain; the home
  page shows the hint), plus a sign-up screenshot in `.wrangler/landing-review/`.
- `tools/landing/test-ui.mjs` and `tools/auth/test-ui.mjs` now honour `PLAYWRIGHT_CHANNEL` like the other UI tests.
- Results: typecheck, lint, check:cloudflare pass; `npm test` 1765 passed (65 skipped); landing UI 9 PASS; auth UI 12 PASS.

## 4. Changelog

- 2026-11-17 - Type: Changed. Sign-up and the home page tell students to use their @graduate.utm.my email.
