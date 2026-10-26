# S1-INT-004 — Serve the installed modules from the correct workspace

- Status: READY_FOR_REVIEW; correct integration preview running
- Date: 2026-10-26
- Owner: local integration runtime; no feature/schema changes
- Human review: pending

## 1. Plan

The user reports empty/unavailable academic pages at localhost:5173. Inspection of
the actual signed-in browser shows the shared "not available yet" fallback. Fetching
the running Vite module proves port 5173 serves the original subject advisors source
checkout and its empty feature registry, rather than production/subject advisors,
where both handoffs are installed. This is not caused by missing curriculum data.

Stop only the identified Vite/Worker processes serving the target localhost ports,
then start the shared launcher in this integration checkout with hidden background
processes and ignored logs. Verify served module paths, real P001/P002 imports and
actual signed-in page rendering without creating a profile or bypassing auth.
Preserve keys, DB, application code, other previews and Git work. No commit/push.

## 2. Implementation

Confirmed the Vite module URL pointed to the original checkout and its empty
.generated-integration/web.tsx. The identified Vite PID 41900 and Worker tree
belonged to launcher PID 23332. Stopped only that launcher tree and started
tools/auth/dev.mjs from production/subject advisors as hidden launcher PID 22224.
Ignored stdout/stderr logs are under .wrangler/integration-dev.*.log.
No feature code, auth checks, account data, environment values or DB rows changed.

## 3. Review

Read-only checks confirm one configured curriculum, 78 mapped subjects, one active
student assignment and no profile. P001's actual Neon HTTP repository reads return
SETUP_REQUIRED and the configured curriculum without error. These are diagnostic
reads, not a fabricated setup-complete state.

Initial actual signed-in Chrome capture showed the unavailable fallback. After
restart, live served module paths point to production/subject advisors and contain
the real ProfilePage, RecordsPage and OfferingsPage imports. All four student HTML
routes return 200; all three unauthenticated academic APIs return 401; backend
configuration presence is true. No profile was created as part of verification.

The user's app window was no longer the active matching window during the final
capture attempt, so no final signed-in screenshot or saved-profile acceptance is
claimed. Refreshing the same URL now loads the correct installed module registry.
Record/offerings profile-completion guards remain unchanged. No broad test rerun
was needed for this runtime-only correction; existing source is unchanged.

## 4. Changelog

2026-10-26: Recorded the actual wrong-workspace root cause before restarting services.

2026-10-26: Replaced only the incorrect local preview process tree with the shared
preview in the integration workspace. Verified production module URLs, all three
installed pages, route availability and protected API denial. No code/data changes,
commit, push, migration, auth bypass or production deployment.
