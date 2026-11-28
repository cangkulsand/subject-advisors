# Curriculum subject search and credit check (S3-P004-044): short design

- **Date:** 2026-11-28
- **Owner:** P004, for Harraz's review item. To be handed over to Harraz.
- **Status:** approved by the owner, 2026-11-28.

**Why:** the 21 Nov review asked to "follow up on subject-list search and validation of total subject credits against the curriculum credit requirement".

**Where:** the Subject List tab of the curriculum editor. It is Subjects & Prerequisites at `/admin/curriculum`, and Curriculum & Subjects at `/coordinator/curriculum`.

**Approaches (owner chose option 1, warn only):**
1. **Minimum path vs total (chosen).** Compulsory credits, plus the fewest credits that meet each requirement group, compared with `total_credit_required`.
2. **Plain sum of every mapped subject.** Rejected: it is always "over" when there are electives (SECJ: 198 vs 131).
3. **Configured group requirements only.** Rejected: it misses groups that cannot be met with the subjects mapped.

**Never blocks saving.** Blocking was also rejected, because curricula are built up step by step.

**Design:**
- **Search:**
  - The shared table toolbar (`TableToolbar`, `SearchField`, `ClearFilters`) sits above the Subject List table.
  - The field is labelled "Search subjects" and matches code or name, ignoring case, as the user types.
  - A count line reads "N of M subjects".
  - Clear is shown while a search is active.
  - With no matches, the table area shows "No subjects match the search."
- **Credit check (warning only), a panel above the toolbar:**
  - **Pure function:** `creditCheck(subjects, requirements, totalCredits)` in `packages/shared/src/curriculum/credit-check.ts`.
  - **Compulsory:** the sum of credits of compulsory subjects.
  - **Each requirement group**, matched by the normalised category/type (the `requirementKey` rule: upper case, spaces and underscores alike), takes:
    - **Count** = the compulsory subjects in the group, plus the cheapest optional subjects until the required subject count is reached.
    - **Credits** = their credits, plus more of the cheapest optional subjects until the required credits are reached.
    - **Extra** = the credits of the optional subjects chosen.
    - **Unmet:** if the subjects available cannot meet the requirement, the group is "unmet", with a message.
  - **Minimum** = compulsory + the sum of the groups' extra credits.
  - **Status:** "Matches" when minimum = total. Otherwise "Short by N credits" or "Over by N credits".
  - **Total not set:** if the total is not configured, the panel shows "Total credit requirement is not set."
  - **Copy:**
    - "Credit check: required <total> credits"
    - "Minimum to graduate <n>"
    - "Industrial Training needs 92 credits; only 12 are available."
    - "Elective E1 needs 4 subjects; only 3 are available."
- **Data:** the curriculum snapshot response carries `requirements: { type, credits, subjects }[]`, read from `curriculum_requirement` outside the md5 revision, like `sharedWith`. There is no database change.

**Left to the builder:** the panel layout within the themeguide, and the toolbar placement.
