# S1-INT-025 - Public landing page theme alignment

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-30
- **Sprint:** Sprint 1 integration follow-up
- **Owner:** INT / integration
- **Related UC / FR:** Public entry route supporting UC01/UC02 account access; no new authentication requirement
- **Reviewer:** Coordinator review PASS; human peer review pending

## 1. Plan

### Objective / problem
Align the public landing page with the shared application's current burgundy brand, blue action buttons, light surfaces, Outfit typography, and keyboard-focus styling. The landing page previously defined an independent teal palette and Inter typography.

### Scope and requirements
- In scope: scoped landing page CSS, minimal cleanup of removed-section navigation/data in the landing component, focused landing browser harness compatibility, and this record.
- Out of scope: shared token changes, private/auth/student routes, route/provider behavior, image changes, layout/content restoration, dependencies, APIs, and production operations.
- Sprint reference: `docs/sprint1 (1).md`, Section 4 (P004 auth use cases) for public account-access context only; this integration styling change does not implement UC01/UC02 behavior.

### Current and intended behavior
The root page used standalone teal, Inter, and custom neutral values while the app shell defines the current shared palette in `student-shell.css`. Use existing CSS variables for page color, text, borders, focus and actions; preserve the responsive hero/header/footer and supplied image. The working tree already contained user edits removing workspace/about sections; preserve those removals and remove only their now-unused data and dangling navigation targets.

### Proposed implementation
Update `landing.css` with scoped semantic token use, blue action CTA colors and Outfit typography. Update `LandingPage.tsx` only to remove its unused `features` constant and nav links to removed sections; retain functional Home and sign-in navigation. Adapt `tools/landing/test-ui.mjs` to current markup, checking existing responsive behavior, image/footer containment, valid current anchors, absent removed sections, keyboard focus, no API traffic, and auth-route CSS isolation.

### API/data/migration and shared impacts
No API, data, route, provider, dependency, shared token, or cross-route style changes. `student-shell.css` is globally available to the landing page.

### Acceptance criteria
- Landing colors and typography derive from existing shared CSS variables; no independent teal UI palette remains.
- Primary and secondary actions use shared blue action colors; visible focus uses the shared focus token.
- Removed workspace/about sections remain absent; nav contains only valid current-page navigation.
- Hero image retains intrinsic dimensions and responsive `height:auto`; no horizontal overflow at tested sizes.
- Landing styling remains scoped and sign-in route appearance unchanged.
- Focused harness, typecheck, targeted ESLint, and local build results are recorded accurately.

### Risks, assumptions, rollback
Assumption: globally loaded root tokens are available to `/`; verified via app shell import and rendered harness. Rollback is limited to restoring the scoped landing CSS/component/harness edits and removing this record; no user content/image changes.

## 2. Implementation

- Replaced standalone landing color/typography values with the existing shared burgundy brand, neutral surface/text, blue action, and focus tokens; retained responsive layout, image dimensions, and reduced-motion handling.
- Scoped auth-link button styles strongly enough to avoid `!important` color overrides.
- Relaxed hero headline tracking to `-.035em` after visual review found tight tracking joined word shapes at desktop and mobile sizes.
- Set the secondary CTA hover text to the shared darker action-blue token so it retains normal-text contrast on the subtle surface.
- Preserved the user's removal of workspace/about sections and removed only their unused navigation links and feature data.
- Updated the existing landing harness for the current hero/footer structure and screenshots; no image, shared token, route, dependency, API, or auth-provider edits.

## 3. Review

- **Self-review:** Inspected the actual diff and confirmed the only intended tracked files are the landing component/CSS, existing landing harness, and this record. The baseline user removal of workspace/about content in `LandingPage.tsx` is preserved. No image or global token edits.
- **Verification:** `node tools/landing/test-ui.mjs` passed at 300, 320, 375, 768, 1024 and 1440 px; checked no horizontal overflow, image/footer containment, expected intrinsic image width, current nav anchors, removed section absence, no API requests, keyboard focus, auth links, and sign-in CSS isolation. `npm.cmd run typecheck` passed. `npx.cmd eslint apps/web/src/features/landing/LandingPage.tsx tools/landing/test-ui.mjs` passed. `npm.cmd run build:local` passed (137 modules transformed). `git diff --check` passed; Git emitted only LF-to-CRLF normalization warnings.
- **Live DEV checks:** Read-only Playwright visit to `http://127.0.0.1:5173/` confirmed burgundy brand `rgb(82, 31, 40)`, Outfit typography, 1452×1083 hero image, no workspace/about sections, valid Home anchor, and no page overflow at 1440 and 375 px. Saved `.wrangler/landing-theme-review/live-1440.png` and `live-375.png`. No auth links were activated, no API/private data was requested, and no process was restarted.
- **Rendered contrast audit:** At live DEV, computed normal muted copy `rgb(120, 99, 104)` on the landing surface (white) is **5.55:1**; primary action text/background is **5.17:1** normally and **6.70:1** on hover; secondary action text/background is **5.17:1** normally and **5.76:1** on hover; the visible focus ring `rgb(154, 89, 107)` against the white surface is **5.23:1**. Text pairs exceed 4.5:1; the focus ring exceeds the 3:1 non-text threshold. This audit covers the rendered white-surface CTA/copy states and does not assess every possible image-overlap/antialiasing edge.
- **Visual checks:** Reviewed `.wrangler/landing-review/landing-320.png`, `landing-375.png`, and `landing-1440.png`, and live DEV captures at 375/1440. Headline word spacing is clear, brand/actions match shared colors, and the responsive image/footer fit. Harness waits for `document.fonts.ready` before capturing.
- **Review outcome:** PASS — SELF-REVIEW and coordinator review. Human peer review pending.

## 4. Changelog

- **Date:** 2026-10-30
- **Type:** Changed / Fixed / Docs
- **Actual changes:** Aligned the public landing page with existing app theme tokens; corrected hero headline tracking and secondary CTA hover contrast; removed links/data for sections already removed by the user; adapted the focused harness to the existing landing composition.
- **Affected routes / consumers:** Public `/` only. The harness also verifies sign-in CSS remains isolated.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Responsive landing harness passed at six widths; typecheck, targeted ESLint, local build, and diff check passed. Live DEV route and computed contrast audit passed; desktop and mobile screenshots reviewed.
- **Outstanding items:** Human peer review pending. No signed-in account actions, database operations, production changes, commit, or push were performed.
- **Final status:** READY_FOR_REVIEW
