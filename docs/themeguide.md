# Theme Guide — Academic Journey

> **Approved template update — 26 October 2026:** The shared template now uses
> primary **#521f28**, burgundy/rose accents, warm neutral surfaces and a responsive
> sidebar/header with optional dark mode. The implemented tokens in
> `apps/web/src/app/student-shell.css` are the current source of truth, including
> the readable dark variants. Use the existing CSS implementation; do not install
> Tailwind or restore the older teal/blue and light-only examples below. Those
> examples are historical guidance; the accessibility and ownership rules remain.
> See [UI handoff](ui-handoff.md) for feature integration and scope.

> **Project:** AI-Powered Academic Advisory System for UTMSPACE Part-Time Students  
> **Design concept:** **Academic Journey Command Center** — calm academic productivity with purposeful, game-inspired pathway exploration  
> **Default appearance:** **Light mode only for the initial implementation**  
> **Frontend:** React + TypeScript + Vite + Tailwind CSS  
> **Audience:** FOUNDATION, Programmers 1–4, integration reviewers, and Codex  
> **Status:** Shared **UI implementation standard**, not a change to SRS/SDD functional requirements

---

## 1. Mandatory instructions for Codex

**Before modifying any frontend component, page, form, layout, styling, or visual interaction:**

1. Read this entire `themeguide.md`, `implementationguide.md`, and the relevant owner section of `sprint1.md` (or the current sprint file).
2. Inspect the existing frontend, installed Tailwind version, shared components, current CSS, and the working tree. **Do not reinstall, re-scaffold, or replace a working UI foundation.**
3. Follow `implementationguide.md` for **every change: PLAN → IMPLEMENTATION → REVIEW → CHANGELOG**. Add/maintain the required `docs/changes/<change-id>.md` record.
4. Apply the tokens, components, accessibility practices, and UX patterns in this guide. Reuse shared components instead of creating visually inconsistent duplicates.
5. Implement **only the programmer/use case selected by the user**. This guide grants permission to *style* work in scope; it does **not** authorize additional functionality or another programmer's tasks.
6. Never silently change shared design tokens, top-level layout, Tailwind configuration, navigation, or another owner's components. Ask the shared foundation owner to coordinate—or propose the smallest reviewed change and document its impact.
7. Never claim a design is responsive, accessible, reviewed, or tested without performing the relevant checks.

**Source-of-truth boundaries:** SRS/SDD controls *what the system does*; sprint files control *who implements which functionality*; `implementationguide.md` controls *how changes are managed*; this file controls *how the user interface looks and behaves*. Academic policies, eligibility, official offerings, and graduation predictions must not be invented for UI examples.

## 2. Design vision and student HCI principles

**Design promise:** Help working part-time students **understand their academic position, plan their next semester, and explore possible pathways** without requiring them to understand technical module names or remember complicated prerequisites.

The interface must be:

- **Calm and efficient:** clear visual hierarchy, generous spacing, restrained decoration, short paths to frequent actions.
- **Task-first:** expose *Overview*, *Academic Records*, *Semester Planner*, and *My Pathway* to students rather than `M1`, `M3`, or `UC17`.
- **Progressive:** show today's most relevant information first; reveal more detail when requested.
- **Honest:** distinguish self-reported records and offered subjects from official verification; distinguish actual progress, proposed plans, and hypothetical scenarios.
- **Accessible:** understandable without color alone; keyboard-friendly; labeled; readable on smaller screens.
- **Responsive:** optimized for phone and laptop; adult students may review their academic plan during short breaks.
- **Consistent across roles:** shared type, palette, spacing, and controls; coordinator/admin dashboards use denser professional tables, not gamified chrome.

### Three questions the UI should answer

| User question | UI response |
| --- | --- |
| **Where am I?** | Academic summary, credit status (when available), records status, unfinished setup. |
| **What can I do next?** | One obvious primary action such as *Complete profile* or *Enter semester offerings*. |
| **What happens if I change my plan?** | A distinct, clearly labeled **simulation** view when the relevant later-sprint functionality exists. |

**Do not** label preliminary student-reported information as university-confirmed, display unsupported graduation guarantees, or imply that a saved plan is an official enrollment.

---

## 3. Primary light-mode color system (canonical)

Use **semantic tokens** rather than scattering hex values and arbitrary Tailwind colors throughout components.

### 3.1 Core colors

| Token | Hex | Purpose | Tailwind example |
| --- | --- | --- | --- |
| `app-bg` | `#F8FAFC` | Overall page background; calm cool white | `bg-app-bg` |
| `surface` | `#FFFFFF` | Cards, forms, panels, navbar | `bg-surface` |
| `surface-subtle` | `#F1F5F9` | Hover zones, side panels, neutral badges | `bg-surface-subtle` |
| `heading` | `#0F172A` | Headings, high-emphasis text | `text-heading` |
| `body` | `#334155` | General content | `text-body` |
| `muted` | `#475569` | Secondary descriptions and form help | `text-muted` |
| `subtle` | `#64748B` | Low-emphasis metadata **only when contrast is adequate** | `text-subtle` |
| `outline` | `#E2E8F0` | Card borders, input borders, dividers | `border-outline` |
| `brand` | `#0F766E` | Primary actions, active progress, key highlights | `bg-brand`, `text-brand` |
| `brand-hover` | `#115E59` | Primary action hover/pressed state | `hover:bg-brand-hover` |
| `accent` | `#2563EB` | Links, selected states, pathway focus, informational emphasis | `text-accent` |
| `accent-hover` | `#1D4ED8` | Links/secondary emphasis hover | `hover:text-accent-hover` |
| `focus` | `#2563EB` | Visible keyboard focus ring | `focus-visible:ring-focus` |

**Decision:** `brand` (teal) is the default **primary call-to-action** color; `accent` (blue) is for **navigation, links, and informational interactions**. Never alternate teal and blue randomly between two identical Save buttons.

### 3.2 Feedback colors

| Meaning | Foreground | Background | Example |
| --- | --- | --- | --- |
| Success | `#166534` | `#F0FDF4` | Completed, changes saved |
| Warning | `#92400E` | `#FFFBEB` | Incomplete data, attention needed |
| Error / danger | `#B91C1C` | `#FEF2F2` | Invalid input, destructive action |
| Information | `#1D4ED8` | `#EFF6FF` | Advisory note, selected subject |
| Neutral | `#475569` | `#F1F5F9` | Locked, not yet started |

Statuses **always** include readable text and, where useful, an icon; color must not be the only signal. Check text-background contrast in real rendered states, including hover/disabled/focus.

### 3.3 Colors must mean the same thing everywhere

- **Teal:** primary action, positive academic progression, current active step.
- **Blue:** active link or selection, inspectable information, eligible subject.
- **Green:** completed item or successful operation.
- **Amber:** warnings, unverified/incomplete details, conditional states.
- **Red:** validation errors and destructive consequences; never decorative.
- **Slate:** neutral, remaining, empty, or locked items.
- **Purple (limited to future simulations):** a visually distinct hypothetical change; not part of the default navigation palette.

The pathway node state color mappings in §10 override generic associations when representing academic states. Include a status label with each node.

---

## 4. Tailwind CSS integration and theme tokens

### 4.1 Version policy

- **New foundation:** prefer **Tailwind CSS v4 with the official Vite plugin** and CSS-first `@theme` configuration.
- **Existing application:** inspect `package.json`, CSS entry points, Vite config, and plugins. If Tailwind v3 is already installed, **keep the working setup** unless a version migration has been approved as a separate task. Recreate these tokens using `theme.extend.colors` in `tailwind.config` for v3.
- Do **not** mix v3 `@tailwind base/components/utilities` setup with v4's CSS-first `@import "tailwindcss"` in one new stylesheet.
- The Tailwind and React versions must be compatible with the existing app; do not pin speculative package versions in feature branches.

### 4.2 New Tailwind v4 + React/Vite foundation (FOUNDATION owner only)

Install at the **web app's** package boundary, following the repository's package manager/workspace conventions:

```bash
npm install tailwindcss @tailwindcss/vite
```

If the project uses pnpm/yarn or a workspace, use its existing package manager and proper workspace command. The existing React plugin should be retained:

```ts
// apps/web/vite.config.ts (illustrative; merge into existing plugins)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

Create one web-app global CSS entry (for example `apps/web/src/styles/global.css`), imported **once** by the React entry point:

```css
@import "tailwindcss";

@theme {
  --color-app-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-subtle: #f1f5f9;
  --color-heading: #0f172a;
  --color-body: #334155;
  --color-muted: #475569;
  --color-subtle: #64748b;
  --color-outline: #e2e8f0;
  --color-brand: #0f766e;
  --color-brand-hover: #115e59;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-focus: #2563eb;

  --color-success-text: #166534;
  --color-success-bg: #f0fdf4;
  --color-warning-text: #92400e;
  --color-warning-bg: #fffbeb;
  --color-danger-text: #b91c1c;
  --color-danger-bg: #fef2f2;
  --color-info-text: #1d4ed8;
  --color-info-bg: #eff6ff;

  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
}

@layer base {
  html {
    font-family: var(--font-sans);
  }
  body {
    background: var(--color-app-bg);
    color: var(--color-body);
  }
}
```

**Resulting utilities** include `bg-app-bg`, `bg-surface`, `text-heading`, `text-muted`, `border-outline`, `bg-brand`, `hover:bg-brand-hover`, `text-accent`, `ring-focus`, `bg-warning-bg`, and `text-warning-text`.

**Font availability:** `Inter` is a preference, not a mandatory remote font. Use the system font fallback unless the repository already has an approved way to load it. Avoid adding an unsolicited runtime dependency or external font request.

**Tailwind v3 note:** the CSS `@theme` block is a v4 example, not something to paste into v3. With v3, map the same token names/values in `tailwind.config` and keep the existing `@tailwind` directives.

### 4.3 Tailwind usage rules for all programmers

1. Prefer semantic utilities such as `text-heading`, `bg-surface`, and `border-outline` over raw values like `bg-[#F8FAFC]`.
2. Use shared primitives for repeated components instead of independently styling every card/button/input.
3. Use a `cn(...)`-style class helper **only if installed or agreed as part of shared setup**; never add a utility library to solve a one-off styling problem.
4. Use **literal class strings or static variants**, not runtime-built `bg-${status}-500`; dynamic Tailwind class construction can be omitted by the compiler.
5. Avoid arbitrary spacing/width values unless needed for the graph canvas or a documented exception.
6. No `!important` overrides or global CSS patches to work around a poorly composed component.
7. Third-party UI (Clerk, React Flow) should be themed via supported interfaces or scoped styles. Do not edit dependency files or destabilize its interaction/accessibility behavior.
8. Use existing icon tooling; prefer one consistent line-icon family (for example Lucide) **only if approved/installed**. Text labels must remain.
9. Do not introduce dark-mode classes or a theme switcher in Sprint 1. Dark mode may be planned as a later enhancement.

---

## 5. Typography and content hierarchy

| Element | Recommended Tailwind classes | Notes |
| --- | --- | --- |
| Page title | `text-2xl md:text-3xl font-semibold tracking-tight text-heading` | One clear page-level `<h1>` |
| Section title | `text-lg md:text-xl font-semibold text-heading` | Prefer sentence case |
| Card title | `text-base font-semibold text-heading` | Short and scannable |
| Body | `text-sm md:text-base leading-6 text-body` | Default readable content |
| Helper text | `text-sm leading-5 text-muted` | Form instructions and explanations |
| Metadata | `text-xs md:text-sm text-muted` | Noncritical timestamps/identifiers |
| Form label | `text-sm font-medium text-heading` | Always visible, never placeholder-only |
| Numerical KPI | `text-2xl md:text-3xl font-semibold tabular-nums text-heading` | Clearly label units |

**Writing style:** plain English in the initial implementation, with terms that students understand. Example: *Academic Records* rather than *AcademicRecord CRUD*. Keep labels consistent across modules. Localize later through a planned i18n approach rather than hardcoded inconsistent language switches.

Use short action labels: **Save profile**, **Update records**, **View offerings**, **Explore pathway**, **Sign out**. Error messages should state what happened and what the student can do next.

---

## 6. Spacing, shape, and elevation

Use the default Tailwind spacing scale (4px base steps where appropriate):

| Usage | Default |
| --- | --- |
| Page horizontal padding | `px-4 sm:px-6 lg:px-8` |
| Main content width | `max-w-7xl mx-auto` |
| Standard section separation | `space-y-6 lg:space-y-8` |
| Standard card padding | `p-4 sm:p-6` |
| Card grid gap | `gap-4 lg:gap-6` |
| Form vertical field gap | `space-y-4` |
| Standard input/button minimum height | `min-h-11` (44px) |
| Card border/radius | `border border-outline rounded-xl` |
| Card shadow | `shadow-sm` only where it helps hierarchy |
| Buttons/inputs radius | `rounded-lg` |

Avoid heavy drop shadows, gradients, glassmorphism, glowing text, and decorative patterns on routine pages. **One visual accent at a time.**

---

## 7. Layout and navigation system

### 7.1 Shared application shell (FOUNDATION owner)

- **Desktop:** a clear sidebar navigation plus main content. A typical sidebar is `w-64`; content uses a consistent max width.
- **Mobile:** a compact header with an accessible menu; the main content becomes a single column. No permanently visible 256px sidebar.
- **Persistent layout:** navigation, header, user identity/menu, content region; optional breadcrumb where helpful.
- **Role-aware navigation:** student, Academic Coordinator, and System Administrator destinations should be visibly appropriate **and backed by server-side authorization**. Hiding an item is not a security boundary.
- **Sprint boundary:** show future modules only as clearly unavailable/coming-soon destinations **if the product deliberately calls for them**; no misleading clickable mock functions.

**Student-facing main navigation:**

1. **Overview** — current academic situation and next action.
2. **Academic Records** — profile and academic subject history.
3. **Semester Planner** — student-reported offerings and later eligible choices/recommendations.
4. **My Pathway** — the prerequisite tree and, in later sprints, timeline and simulations.

**Coordinator/admin navigation:** professional, functional titles. Do not apply game UI metaphors to validation workflows, role management, audit data, or class forecast decisions.

### 7.2 Typical page skeleton

```tsx
export function ExamplePage() {
  return (
    <main className="min-h-screen bg-app-bg text-body">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-heading md:text-3xl">
            Academic Records
          </h1>
          <p className="text-sm text-muted">
            Maintain your self-reported academic history.
          </p>
        </header>
        <section aria-label="Academic records" className="rounded-xl border border-outline bg-surface p-4 shadow-sm sm:p-6">
          {/* Only the selected programmer's in-scope content belongs here. */}
        </section>
      </div>
    </main>
  );
}
```

If the shell already owns `<main>`, padding, or background, **do not nest another global shell** in feature pages. Use the existing shell and only render the page's content.

---

## 8. Standard components and states

**Shared component ownership:** FOUNDATION owns reusable design primitives, where available. Feature programmers import them; if a primitive is missing, request it or use small local markup without editing unrelated shared styles. P004's Clerk authentication work should consume the foundation's shell rather than unilaterally redesigning it.

| Component | Appearance and interaction |
| --- | --- |
| `Button` primary | Teal fill, white text, rounded-lg, visible hover/focus, minimum 44px height |
| `Button` secondary | White background, slate border/text, subtle hover |
| `Button` destructive | Red foreground/confirm action only when actually destructive |
| `Card` | White, 1px slate border, rounded-xl, subtle shadow |
| `Input` / `Select` | Visible label, white fill, slate border, error/help text, focus ring |
| `Badge` / `StatusChip` | Soft fill, dark readable text, label and optional icon |
| `Alert` | Soft colored background, icon/heading/message, next-step guidance |
| `Modal` / `Drawer` | Keyboard-accessible, correctly labeled, focus-managed; use established primitives |
| `Table` | Clear headers, good numeric alignment, overflow handling on small screens |
| `Skeleton` | Reserved space appropriate to actual layout; `aria-busy` or equivalent for meaningful regions |
| `EmptyState` | Explicit zero-results explanation and helpful next action |

### 8.1 Primary button example

```tsx
<button
  type="submit"
  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
>
  Save profile
</button>
```

`disabled` controls must provide accessible context as needed: explain *why* a button is unavailable (for example, required fields missing). Do not rely on reduced opacity alone to communicate important states.

### 8.2 Labeled input example

```tsx
<div className="space-y-1.5">
  <label htmlFor="weekly-work-hours" className="block text-sm font-medium text-heading">
    Weekly working hours
  </label>
  <input
    id="weekly-work-hours"
    name="weeklyWorkHours"
    type="number"
    min={0}
    inputMode="numeric"
    aria-describedby="weekly-work-hours-help"
    className="block min-h-11 w-full rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-heading outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus"
  />
  <p id="weekly-work-hours-help" className="text-sm text-muted">
    Enter an estimate of your typical weekly working hours.
  </p>
</div>
```

Add `aria-invalid`, field-specific descriptions, and semantic validation error text when the input is invalid; associate messages with the correct field. Browser minimum constraints are not a substitute for server validation.

### 8.3 Mandatory UI states

Every data-dependent feature should explicitly consider:

- **Loading** — meaningful skeleton/spinner text and stable layout.
- **Empty** — explain no information was found and suggest a relevant next action.
- **Validation error** — show an actionable message close to the invalid control.
- **Server/network error** — give a retry or safe recovery path.
- **Saved/success** — concise feedback that does not imply official verification.
- **Permission denied** — a clear access-denied view rather than a broken route.
- **Missing prerequisite/insufficient information** — explain uncertainty without inventing a rule.

Use real state management and truthful feedback; do not show success before a save has succeeded.

---

## 9. UX patterns by programmer and module

### P001 — Academic Profile and Subject Records (UC03, UC04)

- Use a **guided, concise form** with clear sections: programme/curriculum, employment commitments, weekly work/study availability.
- Show previously entered values; distinguish edit mode from read-only summaries when helpful.
- Academic record rows/cards should show subject code, name, status, and required exemption details.
- Use clear status words: **Completed, Exempted, Failed, Withdrawn**. Exemption-credit recognition is a distinct concept; do not infer awarded credits from a status badge.
- On mobile, records can become stacked cards. Keep editing controls obvious and accessible.

### P002 — Semester Offerings (UC08)

- Header should identify **academic year**, **semester 1/2/3**, and derived **semester type** (Normal/Short).
- Display subject code, subject name, credit hours, and selected state.
- Use search/filter only when useful; avoid dense multi-step screens for a short list.
- Distinguish a **student-reported subject offering** from an officially verified offering in copy and badges.
- If no subjects are selected, explain what must be entered before later recommendations can be generated.
- Do not build eligibility or recommendation algorithms as part of this Sprint 1 UI.

### P003 — Interactive Academic Pathway (UC17)

- The tree may use **subtle game-inspired connected nodes**, but must remain a legitimate academic information visualization: legible codes, clear prerequisites, simple interactions.
- Provide zoom, pan, fit-to-view and a visible legend when supported by the feature scope.
- Each node needs subject code/name, visible status, and clear differentiation from other states.
- Required prerequisite connections should not resemble optional/advisory prior-knowledge relationships.
- Offer a **keyboard-friendly accessible list/tree fallback** if React Flow visualization is difficult to use.
- A selected node can reveal basic details within the UC17 prototype contract; do not prematurely implement the UC18 exploration engine, future semester schedule, or what-if simulator.

### P004 — Authentication (UC01, UC02)

- Signup/login pages should look trustworthy and familiar: minimal distraction, clear purpose, visible institution-email requirement for student signup.
- Use Clerk's supported appearance customization hooks where possible; do not rebuild authentication security or verification flows from scratch.
- Keep errors useful but avoid exposing secrets or whether privileged internal accounts exist.
- Confirm successful login with clear destination; student onboarding can direct to mandatory profile setup without implementing P001 forms.
- Authentication and role routing **must** be enforced by the backend; UI elements are not sufficient access control.

### Later sprint coordinator/admin UI

- Forecasts: readable tables, dataset dates, coverage warnings, version status and review actions.
- Administration: searchable role/access tables and unambiguous destructive or security-sensitive confirmations.
- Keep the same visual tokens but favor auditability and information density over decorative graphics.

---

## 10. Interactive pathway visual language

Status styles should be distinguishable by **label + shape/icon + color**, not color alone:

| Academic pathway state | Suggested style | Required textual label |
| --- | --- | --- |
| Completed | soft green, check icon | **Completed** |
| Exempted | soft cyan, certificate/check mark | **Exempted** |
| In progress | soft amber, progress indicator | **In progress** |
| Eligible | soft blue, solid accent edge | **Eligible** |
| Locked | subdued slate, lock icon | **Locked** |
| Recommended | soft teal, recommendation marker | **Recommended** |
| Remaining / not started | white/slate border, neutral text | **Not started** |
| Hypothetical (later sprint) | purple dashed border, explicit scenario banner | **Simulation** |

**Status priority:** statuses can overlap conceptually (for example, an eligible subject might be recommended). Represent the student's **actual academic status** as the base and supplementary recommendation as a separate chip/marker; do not erase one state in favor of another.

**Prerequisite edges:** mandatory = solid line; advisory prior-knowledge = dashed line (only where source data differentiates these); selected dependency = highlighted line. Use an accessible accompanying textual list.

**Interaction model:**

- Provide clear visible focus and selected states.
- Ensure keyboard access to subject details via accessible fallback even if canvas keyboard traversal has limitations.
- Do not make double-click or drag-and-drop the only way to inspect a subject.
- Prefer inspect-on-select to complex animations or hidden gestures.
- Support zoom without hiding the user's location in the graph; provide **Fit view**.
- Respect `prefers-reduced-motion`; avoid gratuitous pulse/glow effects.

In Sprint 1 UC17, graph status data must reflect actual available records and clearly labeled sample fixtures only in isolated demos/tests. Do not hardcode a fictitious transcript as a real student's progress.

---

## 11. Responsive behavior

**Mobile-first baseline:** 320px minimum practical viewport test, then test representative widths around 375px, 768px, 1024px, and 1440px. Breakpoints should respond to the actual content, not only device names.

| Area | Narrow screens | Wide screens |
| --- | --- | --- |
| Navigation | Compact menu/header | Persistent sidebar if useful |
| Page layout | Single-column stacked sections | 2–3 columns where meaningful |
| Forms | Single-column fields, full-width primary action | Logical 2-column groups only if scannability improves |
| Academic records | Stack records as cards or horizontal table scroll with headers preserved | Compact, readable table |
| Semester offerings | Searchable list/cards, large selection target | Table or multi-column list |
| Pathway | List fallback or simplified graph with obvious zoom controls | Full graph/canvas with details pane |
| Metrics | 1–2 per row with visible labels | 3–4 per row where space allows |

No horizontal **page-level** overflow. For a genuinely wide table or graph, provide a local scroll/pan container and a non-visual alternative as appropriate. Buttons and selectable controls should have practical touch target sizes (use `min-h-11`; ensure sufficient width/spacing).

---

## 12. Accessibility and inclusive HCI requirements

Target **WCAG 2.2 AA** as a design goal; manually check critical screens and use automated tools as supporting evidence rather than a complete guarantee.

**Minimum review checklist:**

- [ ] Every input has a visible label and appropriate help/error association.
- [ ] Every control is operable via keyboard; focus indicators are obvious and not clipped.
- [ ] Text and essential UI elements have adequate contrast for their intended use.
- [ ] Status is not communicated by color alone; the label is readable by assistive technologies.
- [ ] Heading hierarchy, landmarks, table headers, and button names are semantic.
- [ ] Errors explain the action required; focus moves sensibly after form errors or route transitions.
- [ ] Accessible names are provided for icon-only actions such as zoom, menu, remove, and logout.
- [ ] At 200% browser zoom, content remains usable and text does not overlap or disappear.
- [ ] `prefers-reduced-motion` is respected for nonessential animations.
- [ ] React Flow provides an accessible textual list fallback, and its graph is not the only route to information.
- [ ] Asynchronous save/error states are communicated to assistive technologies where appropriate.

Do not remove focus outlines without supplying an equal-or-better visible focus style.

---

## 13. Shared files, naming, and owner coordination

**Illustrative structure** (adapt to the real repository; do not overwrite existing architecture):

```text
apps/web/src/
  styles/
    global.css                   # Tailwind import + semantic design tokens (FOUNDATION)
  components/ui/                 # Shared primitives (FOUNDATION)
    Button.tsx
    Card.tsx
    TextField.tsx
    StatusChip.tsx
    Alert.tsx
    EmptyState.tsx
  app/                           # Shared shell/nav (FOUNDATION)
  features/
    auth/                        # P004 (Clerk UI)
    profile/                     # P001
    records/                     # P001
    offerings/                   # P002
    pathway/                     # P003
```

**Change rules:**

- `global.css`, shared `components/ui`, root layout, and Tailwind/Vite configuration are FOUNDATION-owned.
- Feature owners should use the shared primitives and tokens, not duplicate them with slightly different hex values.
- If a shared token/component is missing, coordinate a small foundation PR rather than changing it concurrently in four branches.
- Keep feature CSS scoped if necessary (e.g. React Flow canvas); avoid generic global overrides like `.node`, `button`, or `input` that could affect other modules.
- Keep component names PascalCase; feature modules colocate their view, state, tests, and local helpers.
- Shared theme changes require impact review on **all four programmer-owned areas** and a per-change record following `implementationguide.md`.

---

## 14. UI review and definition of done

A frontend change is **ready for human review** when all applicable items below are satisfied:

### Plan
- [ ] Owner, selected sprint use case(s), and expected UI behavior recorded in `docs/changes/<id>.md`.
- [ ] Existing tokens, reusable primitives, and related screens inspected.
- [ ] Required loading/empty/error states and accessibility cases included in acceptance criteria.

### Implementation
- [ ] Uses **this light theme's semantic tokens** and approved shared components.
- [ ] Has correct responsive behavior at representative narrow and wide widths.
- [ ] Labels, statuses, copy, and data provenance are clear.
- [ ] All interactive elements have keyboard/focus/disabled/error behavior where applicable.
- [ ] Does not alter another programmer's functionality or implement later-sprint workflows.

### Review
- [ ] Actual lint, typecheck, test, and build results recorded (or explicit blockers).
- [ ] Relevant pages visually checked at mobile + desktop sizes; screenshots can be attached to the change record or PR where practical.
- [ ] Keyboard, labels, and color-contrast checks performed on key components.
- [ ] No horizontal page overflow, broken wrapping, misleading statuses, or clipped dialogs.
- [ ] Human approval marked **pending** until a human reviewer actually approves.

### Changelog
- [ ] Changed files, user-visible changes, technical notes, tests run, known limitations, and any shared-file impacts recorded.
- [ ] Any new reusable token or component is documented here and coordinated with the foundation owner.

**Do not mark a UI change complete merely because it looks polished in a screenshot.** Required functions, real interaction, error behavior, and security constraints remain defined by the sprint and implementation guides.

---

## 15. Recommended Codex prompt

**For a single developer, e.g. Programmer 4:**

```text
Read sprint1.md, implementationguide.md, and themeguide.md completely.
Implement ONLY Programmer 4 (P004) Sprint 1 tasks (UC01 and UC02).
Follow PLAN -> IMPLEMENTATION -> REVIEW -> CHANGELOG for every change.
Use the shared Tailwind light-mode theme and existing design components.
Do not change other programmers' modules or the shared design system without
coordination. Run the available tests and report actual results and blockers.
```

Replace `Programmer 4 (P004)` and `UC01 and UC02` with the relevant scope for other developers. The scope-selection instruction in `sprint1.md` remains authoritative.

---

## 16. Reference documentation

- Tailwind CSS (official): https://tailwindcss.com/docs/installation/using-vite
- Tailwind CSS theme variables: https://tailwindcss.com/docs/theme
- Tailwind CSS colors: https://tailwindcss.com/docs/colors
- Tailwind CSS v3-to-v4 upgrade guide: https://tailwindcss.com/docs/upgrade-guide
- WCAG 2.2 (W3C): https://www.w3.org/TR/WCAG22/

**Final design rule:** A student should immediately understand **where they are, what is actionable, what is uncertain, and what remains a hypothetical plan**. All programmers must reinforce that understanding with the same visual language.
