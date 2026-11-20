# S1-INT-026 - Role-aware application palette

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-30
- **Sprint:** Sprint 1 integration follow-up
- **Owner:** INT / integration
- **Related UC / FR:** Shared role workspaces and public/auth presentation; no new use case, route, or access rule
- **Reviewer:** Coordinator PASS; human peer review pending

## 1. Plan

### Objective / problem
Apply the user's new palette consistently to public, student, administrator, coordinator, and Clerk sign-in/up surfaces. The current root tokens and staff/student navigation still encode older colors and blue action buttons.

### Scope and requirements
- In scope: shared semantic palette and role-navigation tokens, student shell navigation, public landing, shared administrator/coordinator staff shell, admin page/card styling, Clerk-supported appearance variables, theme guide, focused harness expectations, and this change record.
- Explicit user colors: burgundy brand `#6B1D2F`, hover `#521624`, cream `#FAF6EE`, surface white, heading `#1A1A1A`, body `#555555`, nav inactive `#B88B96`, cream active indicator, divider `#521624`, cream hover `#F0E9DA`; primary actions burgundy with white text, hover `#521624`; outlined secondary actions use brand text/border and cream hover. Existing semantic success/warning/error colors remain semantic.
- User-authored coordinator choice did not arrive before implementation. Working assumption: invert coordinator navigation only using cream with burgundy foreground/active state; do not invert the full coordinator page. Admin navigation uses the existing progress-card dark slate gradient.
- Explicit out of scope: authorization, role resolution, routes, role switching behavior, menu/dialog keyboard behavior, workflow/business logic, data/APIs, image changes, database/auth operations, production, deploy, commit, or push.

### Current and intended behavior
Shared tokens currently use the burgundy template plus blue action standard. Student navigation is white with pale rose active state. The staff shell shares one `admin-shell` treatment for admin and coordinator. Align shell/page/auth presentation to the supplied new palette and give staff navigation a presentation-only role variant while preserving role guards and behavior. Preserve the pre-existing uncommitted INT025 files and all user removals of landing sections.

### Proposed implementation / expected files
- `apps/web/src/app/student-shell.css`: shared semantic tokens, dark-mode-compatible overrides, student role-navigation styling.
- `apps/web/src/features/landing/landing.css`: consume updated tokens; solid burgundy header/navigation, cream active marker, new secondary outline treatment.
- `apps/web/src/features/profile/profile.css` and `apps/web/src/features/offerings/offerings.css`: style secondary buttons with the requested outlined brand treatment while retaining primary and red Cancel roles.
- `apps/web/src/features/admin/staff-navigation.tsx` and `apps/web/src/features/coordinator/CoordinatorRoutes.tsx`: pass a presentation variant only.
- `apps/web/src/features/admin/admin.css`: align page/cards/forms/actions; admin nav uses existing progress-card background; coordinator nav inverse presentation; headers/drawer/focus remain legible.
- `apps/web/src/features/records/subject-records-table.css`: reuse the existing degree-progress gradient through one shared token.
- `apps/web/src/features/auth/Auth.tsx` and `auth.css`: update supported Clerk appearance color variables and surrounding auth panel.
- `docs/themeguide.md`: make the user's newer palette/action standard canonical and specify student/admin/coordinator navigation variants.
- `tools/integration/test-ui.mjs` and `tools/p001/test-ui.mjs`: update obsolete blue-action expectations; preserve semantic cancel and behavior checks. Existing admin/auth/landing harnesses remain focused on route/accessibility/responsive behavior.
- `tools/offerings/test-ui.mjs`: correct one stale expected literal for a known-empty prerequisite cell (`-`), matching unchanged component behavior. The same expectation failed at baseline HEAD before this palette work.
- This change record.

### API/data/migration and shared impacts
No API, database, schema, identity, access-control, route, dependency, or business logic impacts. Shared visual tokens intentionally affect all app shells and pages consuming them. Presentation variant is explicit and has no authorization meaning.

### Acceptance criteria and verification
- User's specified colors are represented by shared semantic tokens and applied consistently to public, student, admin, coordinator, and Clerk prebuilt auth screens.
- Admin navigation matches the existing dark progress card; the coordinator variant assumes the requested inversion applies to navigation only (cream/burgundy), not the whole coordinator page. This is the implementation assumption for review and does not block completion.
- Actual academic CTA labels remain unchanged. Primary and secondary action states use the requested new palette; destructive/cancel actions remain semantically red.
- Student dark mode, menu/dialog behavior, role guards, route behavior, and the preserved landing layout/image/removals continue working.
- Contrast audit covers normal text, primary/secondary normal and hover, focus, and the exact user-specified inactive-nav color; document the known inactive-label contrast limitation instead of silently substituting a color.
- Run the existing landing, installed integration, admin, and auth UI harnesses, typecheck, targeted ESLint, and local build with database test variables omitted from child environments.
- Capture role/public desktop and mobile screenshots under `.wrangler/role-theme-review/` where harnesses permit.

### Risks, assumptions, rollback
The exact requested inactive navigation color `#B88B96` has lower contrast on the burgundy nav than the normal-text AA threshold; preserve the exact requested color and report its measured ratio. Role variant is presentation only. Rollback restores the listed CSS/component/docs/harness changes and this record without affecting data or auth policy. The coordinator cream-nav treatment is the documented implementation assumption.

## 2. Implementation

- Updated shared light/dark semantic theme tokens and student navigation; retained the exact requested inactive navigation color `#B88B96` and documented its contrast limitation.
- Applied full-width burgundy landing navigation, cream app surface, and outlined secondary action without changing landing copy/image or restoring user-removed sections.
- Added a presentation-only staff navigation variant. Admin navigation uses the existing progress-card gradient; coordinator navigation uses the provisional cream/burgundy inverse. Main page surfaces remain cream with white cards.
- On mobile, the admin topbar now shares the admin navigation surface and foreground; coordinator topbar stays cream/burgundy. Native select controls retain white fill and dark text.
- Updated shared default secondary-button styling in profile and offerings while preserving explicit primary and cancel styles. Preserved academic status colors, including the not-recorded light-grey pill.
- Profile and offerings secondary buttons use their local accent aliases so light mode stays burgundy and dark mode uses readable rose; removed the broad dark-mode button override that could recolor the records table's solid View details action.
- Updated supported Clerk appearance colors and auth panel surface/type. No authentication flow changed.
- Updated theme guidance and obsolete blue-action harness expectations. Corrected only the stale offerings fixture expectation described above.

Files: `apps/web/src/app/student-shell.css`, `apps/web/src/features/admin/admin.css`, `apps/web/src/features/admin/staff-navigation.tsx`, `apps/web/src/features/auth/Auth.tsx`, `apps/web/src/features/auth/auth.css`, `apps/web/src/features/coordinator/CoordinatorRoutes.tsx`, `apps/web/src/features/landing/landing.css`, `apps/web/src/features/profile/profile.css`, `apps/web/src/features/offerings/offerings.css`, `apps/web/src/features/records/subject-records-table.css`, `docs/themeguide.md`, `tools/integration/test-ui.mjs`, `tools/landing/test-ui.mjs`, `tools/offerings/test-ui.mjs`, and `tools/p001/test-ui.mjs`. The pre-existing user edit in `LandingPage.tsx` remains intact.

## 3. Review

- `node tools/landing/test-ui.mjs`: PASS at 300, 320, 375, 768, 1024, and 1440px; sign-in stylesheet isolation passed.
- `node tools/admin/test-ui.mjs`: PASS, 24 checks. Admin/coordinator desktop and mobile screenshots captured.
- `node tools/p001/test-ui.mjs`: PASS, 42 checks. Explicit cancel action remains red.
- `node tools/integration/test-ui.mjs --installed`: PASS, 34 checks.
- `node tools/auth/test-ui.mjs`: PASS, 12 mocked UI checks.
- `node tools/offerings/test-ui.mjs`: PASS after correcting its stale `No prerequisites configured.` expectation to `-`. Before correction, the fixture rendered `-`; repository HEAD's unchanged `PrerequisiteDisplay` also emits `-` for an empty group. No product component changed for this mismatch.
- `npm.cmd run typecheck`: PASS.
- Targeted ESLint on modified TSX and UI harnesses: PASS.
- `npm.cmd run build:local` (final CSS state): PASS (137 modules; 74.41 kB CSS, 471.38 kB JS).
- One-off WCAG contrast calculation using final CSS palette values: body `#555` on cream 6.92:1 and white 7.46:1; brand `#6B1D2F` on white 11.40:1; hover `#521624` on white 14.01:1; secondary brand text on cream hover `#F0E9DA` 9.43:1; cream focus on burgundy and burgundy focus on cream 10.58:1. Requested inactive nav `#B88B96` on burgundy measures 3.89:1, below 4.5:1 for normal-size text; the requested value is retained and no AA claim is made for those small labels.
- Targeted mocked-app mobile focus audit at 375px: account dropdown link matches `:focus-visible` with a 3px `rgb(107, 29, 47)` focus ring against white after the selector was strengthened to `.student-topbar .student-dropdown :focus-visible`; no signed-in account was used. Screenshot: `.wrangler/role-theme-review/student-mobile-account-menu.png`.
- One-off mocked dark records action audit using computed CSS states: secondary text `rgb(213, 154, 173)` on card `rgb(40, 28, 33)` measures 7.08:1; hover on `rgb(53, 38, 44)` measures 6.18:1. View details and primary white text on action `rgb(168, 82, 104)` measure 5.16:1 and hover `rgb(82, 22, 36)` 14.01:1. Cancel white text on red `rgb(185, 28, 28)` measures 6.47:1 and hover `rgb(153, 27, 27)` 8.31:1. These values were read from the rendered mocked app; no user account or real API was used.
- Targeted isolated 375px fictional admin preview after the mobile topbar correction: topbar uses the existing dark navigation gradient; title, menu, and sign-out use white/cream; menu and drawer-close keyboard focus resolve to the cream indicator at 3px. Native select rule is scoped to the admin topbar and retains dark text on white. Screenshot: `.wrangler/role-theme-review/admin-mobile.png`; drawer state: `admin-mobile-menu.png`.
- Screenshots retained under `.wrangler/role-theme-review/`: landing desktop/mobile; standalone P001 profile and records desktop/mobile; integrated student desktop/mobile/dark mode; admin and coordinator desktop/mobile. The integrated student captures are `student-integrated-{desktop,mobile,dark}.png`; the separate `student-profile-{desktop,mobile}.png` are standalone P001 views. Admin uses the established dark navigation gradient; coordinator uses cream navigation under the documented assumption.
- `git diff --check`: PASS (Git reports LF-to-CRLF normalization warnings for two edited files; no whitespace errors).
- No signed-in account actions, database operations, production changes, commit or push were performed. Public/Clerk SDK network initialization may occur when a public page loads.

Coordinator review: PASS on actual source scope, palette values, role-variant markup, preserved progress/status styles, and desktop/mobile public/admin/coordinator renders. Integrated student desktop/mobile/dark captures were also reviewed and passed. Human peer review remains pending.

## 4. Changelog

- Added role-aware shared palette and documented navigation/action standards.
- Preserved existing academic status colors, progress-card dark treatment, user landing edits, and role/auth behavior.
- Dark-mode secondary buttons now inherit readable local accents without recoloring solid record actions.
- Preserved the not-recorded light-grey `#F1F5F9` status pill and added a matching mobile admin topbar surface.
- Corrected one stale known-empty prerequisite test expectation to match existing output; all listed UI/build checks pass.
- **Outstanding:** human peer review pending. Coordinator cream-nav treatment is documented as the implementation assumption.
