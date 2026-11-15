# S3-INT-001 — Remove AI co-author trailers from `main` history

- **Status:** DONE (2026-11-15)
- **Date:** 2026-11-15
- **Sprint:** Sprint 3
- **Owner:** Integration (FOUNDATION)
- **Branch / PR:** `main` (history rewrite, force-pushed to `origin` and the prod repository); no PR
- **Reviewer:** Project owner

## 1. Plan

By project owner decision, commits in this repository carry no AI co-author trailer. Remove the existing
`Co-Authored-By: Claude …` lines from `main` history.

## 2. Implementation

- `git filter-branch --msg-filter` over the 52 commits from `8cd1f79` (the first commit with the trailer, 2026-11-14)
  to the UC13 merge. Only commit messages changed: every file tree is identical, authors and dates are kept.
- All commit IDs in that range changed. The 16 references to old merge-commit IDs in `docs/changes/*` were
  updated to the new IDs.
- Feature branches already on `origin` keep their old IDs and messages.

## 3. Impact

Anyone with a local copy of `main` from before 2026-11-15 must run `git fetch origin && git reset --hard origin/main`
on `main` (after saving local work). A local backup tag `backup/main-before-trailer-strip-2026-11-15` exists on the
owner's machine only.

## 4. Changelog

- 2026-11-15 - Type: Chore. Rewrote `main` history to remove AI co-author trailers; no file content changed.
