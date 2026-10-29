# S1-INT-022 - Public Subject Advisors landing page

- **Status:** READY_FOR_REVIEW
- **Date:** 2026-10-29
- **Sprint:** Sprint 1 integration follow-up
- **Owner:** INT / integration
- **Related UC / FR:** Public entry route supporting UC01/UC02 account access; no new authentication requirement
- **Branch / PR:** `feature-offerings-prerequisites` / not created
- **Reviewer:** Coordinator review PASS; human peer review pending

## 1. Plan

### Objective / problem
Replace the bare root account-links page with a public landing page inspired by the user's supplied portfolio-style mockup. Ignore the root `reference/` directory in Git while leaving its local file untouched. The user has supplied the hero PNG at `reference/frontpageimg.png`; use it as-is and do not generate or substitute an image.

### Scope and requirements
- In scope: `/` page composition and scoped styling, the user-provided PNG now available at `reference/frontpageimg.png`, root ignore rule for `/reference/`, and local UI/build verification.
- Out of scope: Clerk setup/keys/provider changes, all redirect changes except the approved client-side logout destinations, auth gates, private API/data access, student/staff pages, offers/records APIs, marketing claims, invented numbers/testimonials, automatic recommendation/eligibility claims, production or provider operations, and generating/replacing the user's image.

### Current and intended behavior
`AppRoutes` currently renders a small generic account-links card at `/`; sign-in, sign-up, auth completion, and guarded student/staff routes are already routed separately. Replace only `/` with a responsive public introduction to Subject Advisors, while keeping links to real authentication routes and in-page sections functional. Do not add auth-dependent requests or access private application data. The user's PNG is wired as an unchanged local copy and has been visually reviewed in desktop and mobile page previews.

### Proposed implementation
- Expected files: `.gitignore` (anchored `/reference/` rule), `apps/web/src/app/AppRoutes.tsx`, new `apps/web/src/features/landing/LandingPage.tsx`, `landing.css`, an unchanged copy of the user-provided PNG at `apps/web/src/features/landing/assets/frontpageimg.png`, and a mocked-browser or local preview harness only if needed; this record.
- Follow the supplied visual direction: light background, subtle mint accents/dots, Subject Advisors brand, large two-line headline, concise accurate copy, three factual feature anchors/labels (no fabricated metrics), working CTAs, and hero artwork supplied by the user. Use scoped page CSS; keep the existing app shell and auth-provider setup unchanged apart from the approved client-side logout destination.
- The user image is available, copied unchanged with suitable alternative text, intrinsic dimensions, and responsive sizing. Transparency is not required; do not alter the image. Do not reference the ignored mockup from app code.

### API/data/migration and shared impacts
No API, identity/authorization policy, provider keys, database, cache, schema, or dependency changes. Root AppRoutes gets the landing component at `/`. The two client-side logout destinations change from `/sign-in` to `/`: Clerk's provider default and `LogoutButton`'s explicit `signOut` option. Session/cache invalidation policy and sign-in, sign-up, auth-completion, and protected-route redirects remain unchanged. The supplied image is static local content copied unchanged from the reference folder.

### Acceptance criteria
- [x] Root route presents the Subject Advisors landing page and uses the supplied mockup as guidance without copying unrelated portfolio claims/links.
- [x] Sign-in, create-account, continue-to-account CTAs reach the existing routes; feature navigation anchors reach actual sections.
- [x] Landing code makes no auth/private-data requests; the only auth navigation change is the two approved client-side logout destinations. Sign-in, sign-up, auth-completion, and protected-route redirects remain unchanged.
- [x] Both provider-default and explicit button logout destinations go to `/`; cache clearing and pending/success/failure/retry behavior remain unchanged.
- [x] At 300/320/375/768/1024/1440px, content reflows without page-level horizontal overflow; links/buttons support keyboard and visible focus.
- [x] The user-provided PNG is integrated unchanged and reviewed in desktop/mobile page previews; coordinator has inspected the source image; no generated substitute is used.
- [x] `reference/` is Git-ignored and its mockup remains on disk.

### Verification plan
Stage A: inspect routes and rendered screenshots at desktop/mobile; run the focused public-page harness, full typecheck, targeted ESLint, local build, and `git diff --check`. Verify ignore behavior with `git check-ignore -v` and that both reference images remain present.

Stage B integration checks (execute sequentially after Stage A): `npm.cmd test`; `node tools/integration/test-ui.mjs --installed`; `node tools/admin/test-ui.mjs`; `npm.cmd run build:cloudflare` (build static production assets only). Remove `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `OFFERINGS_TEST_DATABASE_URL` from each child check environment. Do not access live services, deploy, run Wrangler checks, change dependencies/schema/cache/domain, or commit. Record exact command results/counts; then verify copied/user image hashes and ignored reference paths, run `git diff --check`, inspect the scoped diff/status/branch/HEAD, and stop for coordinator review.

### Follow-up C plan — approved logout destination correction
- **Approved scope:** Change only Clerk's provider-level `afterSignOutUrl` and the explicit `LogoutButton` `signOut` `redirectUrl` from `/sign-in` to `/`, returning signed-out users to the public landing page.
- **Production files:** Only `apps/web/src/features/auth/Auth.tsx`, with those two destination values. Keep `clearAccountCache(false)`, pending/success/failure/retry behavior, and sign-in, sign-up, auth-completion, and protected-route redirects unchanged.
- **Test-only files:** Extend the existing Clerk mock and auth UI harness narrowly to record `afterSignOutUrl` and `signOut` options, verify account/academic session cache keys are removed by logout, and retain failure visibility/retryability. No provider navigation simulation.
- **Verification:** Run sequentially with `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `OFFERINGS_TEST_DATABASE_URL` omitted from child environments: `npm.cmd run test:ui`; targeted existing account-cache and profile data-cache unit tests; full typecheck; targeted ESLint for Auth.tsx, mock, auth UI harness, and landing only if changed; `npm.cmd run build:local`. No full test suite, live provider/database/API, Wrangler, or deploy. Record exact counts/results; inspect only this approved source/test scope plus the INT022 record and preserve all other work.
- **Rollback:** Restore the two prior `/sign-in` destination strings and revert the narrowly added mock/harness assertions; no provider keys or persisted application behavior beyond the public post-logout destination changes.

### Risks / assumptions / rollback
- Risks: landing CSS must fill the public page despite the existing local preview body padding and must not alter auth/private route layout; the user's image dimensions or framing may require responsive sizing.
- Assumption: `/` is the public landing route and current `/sign-in`, `/sign-up`, `/auth/complete` links are the correct destinations, as verified in AppRoutes/AuthPage. The user supplied `reference/frontpageimg.png`; the coordinator inspected it and the landing page previews confirm the image renders within the responsive layout.
- Rollback: restore the original root component route, remove scoped landing component/style and the `.gitignore` rule; leave the user-owned `reference/` folder intact and retain any supplied image unless asked otherwise.

## 2. Implementation

- **Status:** READY_FOR_REVIEW
- **Files actually changed:** `.gitignore`; `apps/web/src/app/AppRoutes.tsx`; `apps/web/src/features/auth/Auth.tsx`; new `apps/web/src/features/landing/LandingPage.tsx`, `landing.css`, and unchanged `assets/frontpageimg.png`; `apps/web/src/features/auth/testing/clerk-mock.tsx`, `ui-harness.tsx`; PNG data-URL loader options in `tools/integration/test-ui.mjs` and `tools/admin/test-ui.mjs`; `tools/auth/test-ui.mjs`; new `tools/landing/test-ui.mjs`; this record. Moved the hash-verified generated `academic-advisor.png` into ignored `.wrangler/landing-review/discarded-generated/`.
- **Summary:** Replaced the root account-links card with a responsive public landing page, factual profile/records/semester-offerings highlights, functional auth links and section navigation, and the user's supplied PNG. The layout fills the local preview body's padding without changing global or private/auth styles. The image has intrinsic dimensions and decorative glyphs are hidden from assistive technology. The focused landing harness exercises the actual local entry point and CSS with test-only Clerk. In follow-up C, changed only the two logout destinations in production `Auth.tsx` from `/sign-in` to `/`; `clearAccountCache(false)`, loading/success/failure/retry logic, sign-in/up/completion redirects, and protected-route redirects remain unchanged. The auth mock records logout options and provider default without simulating navigation, and its browser checks verify cache cleanup and retryability. The originally generated advisor image was not used: its SHA-256 was verified before moving it to ignored review storage. The user-provided PNG copy matches its source hash.

## 3. Review

- **Self-review checklist:** Scope limited to the public `/` route and its page CSS, PNG harness compatibility, focused landing harness, and the two approved logout destinations. Only the two client-side logout destinations changed; identity/authorization checks, session/cache clearing, and other private-route behavior remain unchanged. Three highlight cards accurately describe profile, subject records, and semester offerings. Links and anchors, visible keyboard focus, image alternative text/intrinsic size, no API requests, responsive overflow, and auth CSS scoping are covered by the focused harness.
- **Stage A evidence:** `node tools/landing/test-ui.mjs` passed at 300, 320, 375, 768, 1024, and 1440 px and confirmed the public route makes no `/api/` requests, anchors resolve, image loads without overlapping the workspace section, CTAs retain their intended paths, visible focus is present, and landing styles remain scoped on `/sign-in`. `npm run typecheck` passed. Targeted ESLint passed for `AppRoutes.tsx`, `LandingPage.tsx`, and the admin/integration/landing UI harnesses. `npm run build:local` passed. Preview screenshots: `.wrangler/landing-review/landing-320.png`, `landing-375.png`, `landing-768.png`, and `landing-1440.png`.
- **Stage B evidence:** Sequential commands with `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `OFFERINGS_TEST_DATABASE_URL` removed from each child environment: `npm.cmd test` exit 0 (35 test files passed, 2 skipped; 484 tests passed, 13 skipped); `node tools/integration/test-ui.mjs --installed` exit 0 (34 mocked browser checks passed); `node tools/admin/test-ui.mjs` exit 0 (24 browser checks passed); `npm.cmd run build:cloudflare` exit 0 (Vite production asset build, 137 modules transformed; no Wrangler check or deploy). No live database/auth/API/provider access was used.
- **Follow-up C evidence:** With the same database variables removed from each child environment, `npm.cmd run test:ui` exit 0 (12 mocked Clerk/API UI checks); `node node_modules/vitest/vitest.mjs run --config vitest.auth.config.ts apps/web/src/features/auth/account-cache.test.ts apps/web/src/features/profile/data-cache.test.ts` exit 0 (2 files, 30 tests passed); `npm.cmd run typecheck` exit 0; targeted ESLint for `Auth.tsx`, Clerk mock, auth UI harness, and auth browser harness exit 0; `npm.cmd run build:local` exit 0 (137 modules transformed). Logout UI checks assert provider default and explicit redirect are `/`, seed and verify removal of both account and academic session cache prefixes, and verify logout failure remains visible, enabled, and retryable. No Clerk provider navigation is simulated.
- **Final integrity checks:** `git diff --check` passed with only existing CRLF normalization warnings for unrelated files. Both `reference/Screenshot 2026-10-29 204911.png` and `reference/frontpageimg.png` remain present and are ignored by root `/reference/` rule. User image source and copy SHA-256 both equal `E344BD64A94918F19ACFFFA7356D0630E196C41A515DDB585C8F4973624471F4`. Discarded generated `academic-advisor.png` SHA-256 is `020B665B0602178849C8F79378DC0F03155983CCC29547AA4BA8460E50FA849C` in ignored review storage; there is no generated candidate in the app asset folder.
- **Manual checks:** Inspected the actual `/` page with `tools/auth/local/main.tsx`, the test-only Clerk mock, and `tools/auth/local/preview.css`; visually reviewed desktop/mobile captures after correcting image overflow at mobile size. Verified `.landing-nav` resets the local generic `nav` margin and the private sign-in route retains its expected 512px panel width/body padding.
- **Review outcome:** Coordinator review PASS for Stage A, Stage B, and Follow-up C code, visual results, and verification evidence. Human peer review pending.
- **Human reviewer / approval:** Pending.

## 4. Changelog

- **Date:** 2026-10-29
- **Type:** Added / Changed / Docs
- **Added / Changed / Fixed / Removed:** Added the public landing page at `/`, responsive scoped styling, factual workspace highlights, auth route links, feature-section navigation, and unchanged user-provided PNG. Added focused landing browser harness and esbuild PNG loaders. Updated both production logout destinations to the public `/` route and extended mocked Clerk/logout checks for destination options, provider default, cache cleanup, and retryable failure. Moved the exact-hash generated candidate to ignored review storage; it is not used.
- **Affected routes / tables / consumers:** Public `/` route and client-side sign-out destinations for the Clerk provider default and `LogoutButton`. Sign-in, sign-up, auth completion, protected routes, and API/data consumers are unchanged.
- **Breaking changes / migration steps:** None.
- **Verification summary:** Focused landing browser harness passed at six widths; full unit tests passed with 13 tests/2 files skipped; installed integration UI passed 34 checks; admin UI passed 24 checks; auth UI passed 12 checks; account/profile cache tests passed 30 tests; typecheck, targeted ESLint, local and Cloudflare Vite builds, and `git diff --check` passed. Desktop/mobile screenshots reviewed. PNG source/copy SHA-256 match; discarded generated candidate hash verified; both reference files remain present and ignored. Database variables were removed from child environments for all requested runs.
- **Outstanding blockers / follow-up:** Human peer review pending. No live API, auth provider, database, or production service access occurred.
- **Final status:** READY_FOR_REVIEW
