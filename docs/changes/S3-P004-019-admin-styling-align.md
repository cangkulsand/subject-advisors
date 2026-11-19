# S3-P004-019 — Admin pages follow the staff page styling; modal title row spacing fix

- **Status:** On branch `feature/admin-styling-align` (not merged)
- **Date:** 2026-11-19
- **Sprint:** Sprint 3
- **Owner:** P004 (admin and shared UI)
- **Related UC / FR:** UC21, UC22; themeguide 5.3 and 5.5
- **Branch / PR:** `feature/admin-styling-align`; no PR
- **Reviewer:** Pending

## 1. Plan

The owner asked for the admin pages to follow the styling agreed for the coordinator (S3-P004-014 and S3-P004-018).

## 2. Implementation

- **Sidebar:** the "Workspace" group heading is removed. Overview and Users & Access are plain links. Academic setup keeps its heading for its seven pages, and Audit Log stays a plain link.
- **Setup pages** (Learning Centres, Faculties, Departments, Programmes, Coordinator Assignments, Academic Semesters):
  - `SetupCard` now renders the page heading above the card: h1, a one-line description, and the main action on the right.
  - Before, the h1 sat inside the card with no description.
  - Each page has a new one-line description.
- **Curriculum & Prerequisites:** the heading moves above the card.
- **Users & Access:**
  - the repeated card title "Users and invitations" is removed, and the card is labelled with `aria-label` instead;
  - "Add user" moves into the page heading next to the Refresh icon;
  - "Invitations are valid for 7 days" joins the page description;
  - the email-rule note stays in the Add user dialog.
- **Modal title row (fix to S3-P004-018):**
  - Chrome measures a sticky `top` from the dialog's content edge, so `top: 0` left about 60px above the title and covered the first field label.
  - The row now uses `top: calc(-1 * var(--dialog-pad))`, with 8px below the title.
- **Docs:** `docs/themeguide.md` gains 5.5 "Staff page heading and menu (mandatory)".

## 3. Verification

typecheck and lint pass. UI suites with Chrome:

| Suite | Result |
| --- | --- |
| admin | 51 PASS (new check: only Academic setup has a sidebar group heading) |
| coordinator | 56 PASS |
| integration | 75 PASS |
| P001 Sprint 2 UC24 | 14 PASS |

Screenshots show:
- Academic Semesters with its heading and description above the card;
- the Add semester dialog with its title row at the top and the first label visible.

## 4. Changelog

- The admin pages use the same heading, menu and modal styling as the coordinator pages.
