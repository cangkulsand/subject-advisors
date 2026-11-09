# P002 lecturer update — Idham

## Two-minute script

Good morning, Dr Adilah. I am presenting my P002 work on student eligibility and proposed semester selection.

The 1 November discussion separated course offering into two stages. My Sprint 1 responsibility is the initial demand filter: it counts students who still need a subject and meet prerequisite conditions. The threshold discussed for this first list is 30 students. In the demonstration cohort, Software Design has 30 eligible students and qualifies, Computer Networks has 29 and does not, and Database Systems has 31 and qualifies. Sharhan owns the Sprint 2 refinement stage, including resource considerations and coordinator additions or removals. The finalised offering list then feeds my student eligibility check, so students do not re-upload the same offering PDF. The 25-student and class-count examples were not fixed rules. Automated approval or publication to SMP was not agreed.

In the formal v2.1 sprint table, my Sprint 2 allocation is UC09 and UC10: eligibility validation and proposed semester selection. UC11 and UC12, covering intelligent ranking, bottleneck warnings and alternatives, are listed for Sprint 3. The current P002 feature checks which finalised offerings a student is eligible to take; this does not mean AI ranking is complete.

The UC10 plan now supports save and reload, edit, cancel and clear, with selection totals and eligibility reasons. It validates using maintained programme configuration. Full checks report 1,462 passing tests, 59 inherited skips across 74 files, 30 UI checks, and 11 isolated PostgreSQL integration cases. Those database cases include atomic persistence, a valid concurrent pair, stale-source rejection, invalid-selection preservation and rollback after a forced database error. The SRS treats the normal 10-credit amount, possible approval-dependent 12-credit load and short-semester 6-credit figure as provisional pending confirmation. It allows no more than three subjects in each semester type. A two-credit subject needs explicit Normal-semester permission; a mandatory sequential prerequisite must already be passed. A genuine co-requisite pair can be selected together. Exceptions are configured, not inferred from subject codes.

The implementation is ready for review. Human review and acceptance against a connected Neon development database remain pending. The current Kuala Lumpur student-centre mapping and Sharhan's downstream consumption of the initial candidate handoff are team integration items outside my UC10 change. Aisar and Harraz's programme structure work, maintained prerequisite and semester configuration, and verified curriculum rules remain important dependencies. Thank you.

## Feature and demo checklist

Use these prompts to demonstrate the current behavior. The real database run used an isolated in-memory PostgreSQL WASM instance; it does not establish connected-environment acceptance.

- [ ] Show the demand examples: Software Design 30 qualifies, Computer Networks 29 does not, and Database Systems 31 qualifies. These are fictional cohort results; the 30-student threshold was discussed for the first filter.
- [ ] Show the initial-list handoff to Sharhan. Explain that resource refinement and coordinator additions/removals belong to Sharhan. The 25-student and class-count examples are not fixed rules.
- [ ] Show student eligibility against the finalised offering set, with explanations based on the student's own academic history and maintained prerequisites.
- [ ] Demonstrate a proposed selection, totals, save and reload, edit, cancel and clear. Show that an invalid selection is rejected without replacing the existing plan.
- [ ] Demonstrate the configured concurrent pair and explain why a mandatory sequential prerequisite must already be passed; co-selecting it does not satisfy the sequence.
- [ ] Explain configured caps and exceptions. The SRS's 10-credit Normal amount, possible approval-dependent 12-credit allowance and 6-credit Short figure remain provisional pending confirmation. The three-subject maximum, two-credit Short-semester default, FYP1 exception and English 1 → English 2 → English 3 sequence must follow maintained rules.
- [ ] State that AI ranking and bottleneck recommendations are Sprint 3 work. Automated approval, SMP publication, and Sharhan's resource optimizer are not claimed as completed.

## Team dependencies to call out

| Dependency | Owner / source | Why it matters |
|---|---|---|
| Finalised offering set | Sharhan's second filter and coordinator adjustments; discussion headings `2 Course offering requirements` and `3 Revised workflow` | Idham's individual eligibility must use the final list, not a student-entered PDF or a superseded initial result. |
| Valid programme, subject and prerequisite structure | Aisar and Harraz jointly for programme management; exact division was not settled (`6 Aisar responsibilities`, `7 Harraz responsibilities`, `8 Dependencies to reflect in the plan`) | Eligibility and later pathway work depend on maintained programme data and correct prerequisite relationships. |
| Academic records and eligibility evidence | Student records plus configured curriculum prerequisites | Both the initial demand count and individual UC09 check need to distinguish unmet requirements from unknown history. |
| Verified programme rules | Team follow-up (`9 Actions following the meeting`); applicable curriculum/regulations | Credit caps, semester permissions, exceptions and graduation requirements remain provisional until verified. |
| Test cohort | Team action (`9 Actions following the meeting`) | Suitable fictional student histories are needed to exercise demand and eligibility edge cases; the meeting did not assign one definitive owner for all test accounts. |
| UC10 review and acceptance | P002 change plan `docs/changes/S2-P002-002-v21-semester-selection.md`; isolated DB evidence in the outer delivery at `verification-results/selection-db.log` | Implementation and 11 isolated PostgreSQL cases are ready for review. Human review and connected Neon development-database acceptance remain pending. |

## Status wording

The 1 November discussion records the revised responsibilities; the SRS v2.1 sprint table formalizes them. `docs/p002-revised-sprints.md` and `docs/p002-verification.md` document the earlier P002 demand and eligibility work. UC10 persistence has been exercised against isolated PostgreSQL. Human peer review and connected Neon development-database acceptance remain pending.
