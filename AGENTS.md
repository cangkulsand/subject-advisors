# Project execution

- Keep each task within the user's selected scope and follow `docs/implementationguide.md`.
- UI work must follow the "Typography and readability (mandatory)" section of `docs/themeguide.md` (type tokens in `apps/web/src/app/typography.css`; run the readability guard `tools/ui/readability.mjs` in UI tests).
- Tables with filtering, search or sorting must use the shared table toolbar (`apps/web/src/components/table-toolbar/`), see "Table toolbar (mandatory)" in `docs/themeguide.md`.
- This repository is the primary codebase. Code arriving from other members (handoffs, ZIPs, branches) must be merged into it, never copied over it: diff against the current files, keep existing behaviour and add only their real changes, and raise conflicts with the user instead of taking their version.
