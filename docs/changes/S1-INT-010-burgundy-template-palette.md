# S1-INT-010 — Burgundy template palette

- Status: READY_FOR_REVIEW
- Date: 2026-10-26
- Owner: Integration / presentation only
- Branch: local main; human review pending

## 1. Plan

Use the requested #521f28 primary color throughout the shared app. Replace blue
brand accents with burgundy, rose highlights and warm neutral surfaces/text.
Use readable rose variants on warm dark surfaces in dark mode. Keep success,
warning and error colors distinguishable with complementary green, amber and red.

Update student-shell.css tokens, logo and remaining shared feature overrides;
expose the base palette at :root so preview.css uses it for public pages. Update
auth.css focus color and ClerkProvider appearance variables using the installed
@clerk/react 6.17.7 types and official appearance guidance. No auth logic changes.
Adjust the existing browser dark-background expectation to the intentional new
color. No new tests for this reversible presentation change; run existing browser
checks, inspect generated screenshots and calculate text/focus contrast pairs.

Acceptance: #521f28 light primary, coordinated navigation/buttons/forms/login,
readable light/dark theme, existing navigation/form guards preserved. Verify
typecheck/lint/build, shared browser tests and auth UI checks. Preserve all earlier
uncommitted work, including ongoing profile data-cache work. No dependencies,
API/data/schema/environment changes, commit, push or deployment. Rollback only
this palette/appearance diff; retain other integration edits.

## 2. Implementation

Applied #521f28 primary, #3c151c hover, rose accents and warm neutral surfaces at
:root in student-shell.css. Updated the logo, navigation highlights, badges,
feature controls, links, placeholders and dark theme. Preview/public-page CSS
uses the shared tokens; auth.css uses the coordinated focus ring. ClerkProvider
appearance variables use matching static colors supported by installed SDK types.
No authentication flow logic changed. Existing shared browser dark-background
assertion now expects the intentional warm dark canvas.

## 3. Review

PASS — SELF-REVIEW; human review pending.

- npm.cmd run typecheck and npm.cmd run lint: PASS.
- node tools/integration/test-ui.mjs --installed: 24 PASS, explicit mocked Clerk/API.
  Includes the concurrent academic data-cache navigation check, left intact.
- node tools/auth/test-ui.mjs: 11 PASS, mocked Clerk/API.
- npm.cmd run build:local: PASS; git diff --check: PASS (line-ending notices only).
- Inline Node script executed through PowerShell stdin parsed actual root/dark
  tokens and calculated sRGB luminance contrast for 13 pairs per mode. All passed:
  text/primary/semantic pairs >=4.5, focus/control boundaries >=3. Light primary
  white text 13.25:1; dark primary 6.61:1; lowest text pair 5.16:1. This is a palette
  check, not a full accessibility audit.
- Visually inspected .wrangler/theme-desktop.png, theme-dark.png and theme-mobile.png
  from the shared browser runner. Fixed dark active-step/action text and placeholder
  contrast found during review; repeated shared browser checks and frontend build
  after those CSS fixes, both PASS.
- Actual served CSS and Auth.tsx modules return HTTP 200; CSS includes #521f28.

Clerk appearance configuration follows the clerk-custom-ui skill and official
[variables documentation](https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/variables),
checked against installed @clerk/react types. Live Clerk widget appearance was not
tested with a real login. No packages, environment, backend or database changed.

## 4. Changelog

2026-10-26: Recorded the requested burgundy palette plan before edits.

2026-10-26: Added burgundy/rose/warm-neutral light and dark palettes, coordinated
public/auth appearance and semantic states. Typecheck/lint/build, 24 shared and
11 auth mocked browser checks passed. Palette contrast and responsive screenshots
reviewed; READY_FOR_REVIEW. Commit/push subsequently requested by the user.

2026-10-26: Assigned sequence 010 to avoid the concurrent academic cache record's
009 identifier before the user-requested combined commit.
