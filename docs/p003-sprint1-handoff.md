# P003 Sprint 1 — Academic pathway handoff

This checkout includes a menu and page skeleton, **not a completed UC17 feature**.
Use `docs/sprint1 (1).md` section 7 and `docs/implementationguide.md` as the scope
and change workflow. The current checkout is local `main` with uncommitted work;
these additions have not been pushed. Preserve teammates' changes.

## Start here

Run `npm.cmd ci` if dependencies are not installed, then `npm.cmd run dev` from
the project root. Use the supplied private development environment files. Open
http://127.0.0.1:5173/student/pathway after signing in and completing profile setup.
The menu, search and breadcrumb already include **Academic pathway**.

Replace `apps/web/src/features/pathway/PathwayPage.tsx` with the actual feature.
Keep the named `PathwayPage` export from `features/pathway/index.ts` and its
`StudentPageProps` contract (`getToken: () => Promise<string | null>`, optional
`setup`). The shared route passes Clerk's token getter and owns the shell, auth
and profile guard. Do not add a second Clerk provider or reload the document to
navigate. Use `AppLink` from `app/navigation` for internal links.

The page is imported directly by `app/StudentRoutes.tsx`; no generated registry
edits are required. Keep the existing user/session key so changing account clears
private page state. The skeleton makes no feature API requests or writes.

## Implement only UC17 / FR-G1, FR-G2

- Add the read-only React Flow prerequisite tree and a typed node/edge adapter.
  `@xyflow/react` is not installed by this skeleton; coordinate its dependency
  addition and include the package lock change when implementing the graph.
- Use the student's selected curriculum: subject code, name, credit value and
  directed prerequisites. Distinguish mandatory from recommended prior knowledge.
- Show Completed and Exempted distinctly, remaining subjects neutrally, and real
  unmet mandatory relationships. Only display Eligible, In Progress and Recommended
  as actual results when supported by real inputs; otherwise leave them unknown.
  Demonstration fixtures must be explicitly fictional and isolated from real data.
- Add the status legend, zoom/pan, fit view and basic subject inspection. Include
  a keyboard-accessible list alternative and loading, empty, error/retry states.
- Preserve the advisory warning. Academic records remain self-reported. Do not
  implement scheduling, graduation predictions, what-if persistence, recommendations
  or mutations to academic outcomes/curriculum rules.

## Read-only data integration still needed

`GET /api/pathway/graph` is the Sprint 1 suggested endpoint; **it is not implemented
or registered by this skeleton**. Agree its exact response contract when building
the adapter. Do not return fabricated success or invent a second status model.

P003 owns `apps/api/src/modules/pathway/` for the read-only endpoint. Coordinate
minimal registration in `apps/api/src/integration/router.ts` and
`tools/integration/prepare.mjs` once that module exists. Inspect existing auth and
P001 module patterns rather than replacing the Worker entry point.

Resolve the student from the verified Clerk identity on the server; require active
STUDENT access and a complete profile. Filter subjects, prerequisite links and
records to that student's curriculum and identity, never a browser-supplied owner.
Use parameterized queries and the existing Neon driver. Reuse the existing API
success/error envelope and status codes; reject write methods on the graph route.

Existing source contracts and schema to inspect:

| Dependency | Location |
| --- | --- |
| Shared page props | `apps/web/src/app/feature-contracts.ts` |
| Token-aware frontend API example | `apps/web/src/features/profile/client.ts` |
| Auth/access boundary | `apps/api/src/modules/auth/` |
| Profile and catalogue selectors | `apps/api/src/modules/profile/` |
| Academic records and attempts | `apps/api/src/modules/records/` |
| Canonical schema and columns | `db/migrations/0001_initial_schema.sql` |
| Database contracts/decisions | `docs/changes/DB-FOUNDATION-001-schema-baseline.md` |

Use the existing integer IDs and documented record-attempt model. Inspect the
actual prerequisite columns/constraints; do not infer names or add replacement
tables. Reference catalogue/prerequisites must be verified before live graph
acceptance. Existing migrations are managed by the shared workflow; no migration
or reset is required for the menu or placeholder.

## Acceptance and handoff back to integration

Create your own P003 change record before implementing the feature. Include:

- Adapter tests for exact nodes/edges, mandatory/advisory links and status handling,
  including zero-credit exemptions and failed/withdrawn outcomes.
- Endpoint tests for unauthenticated/staff/incomplete-profile access, ownership and
  curriculum isolation, no writes, and data-source failures.
- Browser checks for real graph interactions, mobile layouts, accessible list and
  empty/error states. Prove saved P001 record changes appear on the next graph read.
- Actual typecheck/lint/test/build results, new dependency details and remaining
  data/contract blockers. Keep mocked fixtures separate from real-account evidence.

Useful existing checks:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
node tools/integration/test-ui.mjs --installed
npm.cmd run build
npm.cmd run build:local
```

The shared browser script currently verifies the protected skeleton and menu, not
UC17 graph acceptance. Do not mark the Sprint 1 pathway complete from those checks.
