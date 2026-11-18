# Cloudflare Workers Builds preview deployment

This repository is configured for GitHub-triggered Cloudflare Workers Builds. Use the existing development Clerk application and development Neon database for a preview. Never point this preview at production data.

## Connect the repository

The GitHub repository is already connected to Workers Builds, according to the settings supplied by the project owner. In **Workers & Pages → subject-advisors-prod → Settings → Builds**, update that existing build configuration after the reviewed repository changes are pushed to `main`:

- Production branch: `main`
- Root directory: `/`
- Build command: `npm run build:cloudflare`
- Deploy command: `npm run deploy:cloudflare`
- Build environment: Node.js `22.12` or later
- Build variable: `VITE_CLERK_PUBLISHABLE_KEY` set to the public publishable key for the existing development Clerk application

The owner-provided current settings point at root `/subject-advisors`, use `npm run build`, and deploy with `npx wrangler deploy`; they show no build variables. Those values do not match this repository's root configuration. Update them to the values above after publishing the reviewed repository changes. Dashboard settings were not independently inspected or changed during this repository task.

Workers Builds runs the build command before the deploy command. The build prepares the integrated API modules and builds the SPA into `dist-cloudflare/web`; Wrangler then deploys the Worker and assets from `wrangler.jsonc`.

## Preview runtime settings

In the Worker settings, add these runtime secrets using the existing development settings:

- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`

Add the runtime variable `CLERK_AUTHORIZED_PARTIES` as a comma-separated list containing the exact HTTPS origin of this preview Worker (no path or trailing slash). If Cloudflare's preview URL changes, update this value to include the new exact origin. Also configure the development Clerk instance's allowed origins/redirect URLs for that preview hostname.

The Wrangler config keeps dashboard-managed variables across deployments. Keep this origin variable in the Worker settings rather than adding it to the repository config.

The frontend publishable key is public and belongs in the build variable; secret and database values belong only in Worker runtime secrets. Do not commit actual values to `.dev.vars`, `.env.local`, or this repository. `.dev.vars.example` lists the local runtime secret names without values; `CLERK_AUTHORIZED_PARTIES` is set in Worker settings for the preview origin.

## Operational notes

- The existing GitHub connection was reported by the owner; this task did not change dashboard settings or trigger a deployment.
- This preview uses the existing development services. It does not apply migrations. Confirm the development database is already at the schema expected by the integrated application.
- `npm run check:cloudflare` runs a local Wrangler dry-run after preparing generated integration modules.
- The Worker keeps API paths worker-first and the asset handler serves SPA deep links. The local-only `/api/auth/local-status` diagnostic is not part of the deployed adapter.

## Runtime limit: subrequests per request (S3-P004-016)

A Worker request may make only a limited number of outbound calls ("subrequests"): **50 on the Workers Free plan**
(1,000 on Paid). Every Neon query sent with `neon(...)` / `sql.query(...)` over HTTP and every Clerk API call is one
subrequest; a `sql.transaction([...])` batch counts once.

- **Never query once per row** (per student, per record, per subject). Read the whole list in one query with
  `WHERE id = ANY($1::int[])`, and call Clerk in pages (the identity lookup takes up to 100 users per call).
- Keep the number of queries per endpoint fixed, independent of how much data the scope has; parallel queries in a
  `Promise.all` still count one each.
- Symptom when the limit is hit: the request stops part way; endpoints that map unknown errors to a generic message
  (for example the coordinator API's "Forecasting data is unavailable. Please retry.") show only that.
- Incident: on 2026-11-18, "Students in the system" snapshots for SECJ (148 students) failed because the learning
  centre was read with one query per student. Fixed by a single `ANY(...)` query; an audit of every coordinator
  action found no other per-row calls (Generate forecast ≈ 18 subrequests whatever the student count).
