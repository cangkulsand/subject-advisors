# Curriculum search and credit check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add search to the curriculum Subject List, and a warning-only credit check comparing the minimum path to graduate with the curriculum's total credit requirement.

**Architecture:**
- **Credit check:** a pure shared function computes the check.
- **Data:** the API adds `requirements` to the snapshot, outside the revision.
- **Page:** `CurriculumPage` renders the panel and the shared table toolbar search.

**Tech Stack:** TypeScript, React, Vitest, Playwright (`tools/p001-sprint2/test-uc24-ui.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-28-curriculum-credit-check-design.md`

## Global Constraints

- **Toolbar:** use the shared table toolbar (themeguide 5.2). Readability guard: text of at least 12px, and at least 14px in tables.
- **Copy:** use the design's text exactly.
- **No database change.** Requirements are matched with `requirementKey` (upper case, spaces and underscores alike).
- **Commits:** no AI trailer, explicit paths, never `docs/System Documents/`.

## Review Focus

1. **A group whose compulsory members already meet it adds 0 extra.** SECRH Core needs 62 credits and 21 subjects, all compulsory. Test in Task 1.
2. **A requirement with both a subject count and credits:** both have to be met. SECRH E3 needs 12 credits and 2 subjects. Test in Task 1.
3. **A requirement with no matching subjects is unmet.** Test in Task 1.
4. **A search with no matches** shows the empty message, and Clear restores the full list. Test in Task 3.
5. **A total of 0 or null:** the panel shows "not set". Test in Task 1.

---

### Task 1: The `creditCheck` function

**Files:** create `packages/shared/src/curriculum/credit-check.ts` and its test.

**Interface:**
- `creditCheck(subjects: { code: string; credits: number; category: string; compulsory: boolean }[], requirements: { type: string; credits: number | null; subjects: number | null }[], totalCredits: number | null): CreditCheck`
- `CreditCheck { total: number | null; compulsory: number; groups: { type: string; label: string; extra: number; unmet: string | null }[]; minimum: number; status: 'MATCHES' | 'SHORT' | 'OVER' | 'NOT_SET'; difference: number; summary: string }`

**Tests:**
- SECJ-like data gives the minimum and "Short by 1 credit".
- The IT 92 case gives an unmet message with the exact copy.
- Core all compulsory adds 0.
- A group with both a count and credits must meet both.
- A requirement with no subjects is unmet.
- A total of 0 gives `NOT_SET`.
- A match gives "Matches".

**Steps:** RED, then implement, then GREEN. Commit as `feat(curriculum): credit check (S3-P004-044)`.

### Task 2: API, requirements in the snapshot

**Files:** `apps/api/src/modules/p001-sprint2/{repository,contracts}.ts` and `sprint2.test.ts`.

- **Snapshot:** `withShared` also attaches `requirements`, from `SELECT requirement_type AS type, required_credits AS credits, required_subjects AS subjects FROM public.curriculum_requirement WHERE curriculum_id=$1 ORDER BY requirement_id`.
- **Type:** `CurriculumData.requirements?: Requirement[]`.
- **Test:** the repository `curriculum()` result carries requirements, and the revision is unchanged.

**Commit** as `feat(curriculum): snapshot carries requirement groups (S3-P004-044)`.

### Task 3: Page, the panel and the search

**Files:** `apps/web/src/features/p001-sprint2/CurriculumPage.tsx` and `tools/p001-sprint2/test-uc24-ui.mjs`. The fixture snapshot gets `requirements`.

**Browser checks** (placed before the pre-existing zoom check):
- **"curriculum: credit check shows the minimum and warns (S3-P004-044)":** the panel text matches the fixture.
- **"curriculum: subject search filters by code or name, shows the count and clears (S3-P004-044)"**

**Steps:** RED, then implement, then GREEN. Commit as `feat(curriculum): subject search and credit check panel (S3-P004-044)`.

### Task 4: Docs and suites

- **Docs:** change record `docs/changes/S3-P004-044-curriculum-credit-check.md`, and a README row.
- **Suites:** typecheck, lint, `npm test`, coordinator UI and the uc24 UI.
- **Commit.**
