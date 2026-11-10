# Subject configuration rules (for the admin "create / edit subject" menu)

- **Status:** Decided by the product owner on 2026-11-01 and 2026-11-02 (discussion during S2-P004-007).
- **Audience:** the programmer building the System Admin subject and curriculum menu (`/admin/curriculum`),
  and anyone who reads subject settings (forecast, offerings, records).
- **Related:** [S2-P004-006](../changes/S2-P004-006-confirmed-offerings-rule.md) (confirmed offerings rule),
  [S2-P004-007](../changes/S2-P004-007-uc20-forecast-and-confirmation-build.md) (forecast build),
  [S1-P002-006](../changes/S1-P002-006-guided-offerings.md) (original Normal/Short rule),
  [hand-off prompts](../sprint/02/handoff-academic-setup-and-profile.md).

Every rule below is stored as **data**, not code. An admin changes it by editing the subject, and nothing
needs redeploying. The create/edit subject form is where these values are set.

## 1. What the form must capture

### Subject (table `subject`, shared by all curricula)

| Field | Column | Rule |
| --- | --- | --- |
| Subject code | `subject_code` varchar(20), unique | Required, trimmed, upper case (e.g. `SECJ1013`). Never reuse a code for a different subject. |
| Subject name | `subject_name` varchar(255) | Required. |
| Credit hours | `credit_hours` integer ≥ 0 | Required. Drives credit totals, near-graduation and the default semester type (section 3). |
| Class type | `class_type` `LECTURE` or `LAB` | **Required for anything that is offered.** Decides the class size (section 2). A subject with no class type shows "Configuration required" in the forecast and gets no proposed classes. |
| Offered through the forecast | `include_in_offering_forecast` boolean, default true | Turn **off** for subjects that are never offered as classes (section 4). Off means: no demand, no classes, cannot be approved. |
| Status | `status` | Existing field; keep current usage. |

### Subject inside a curriculum (table `curriculum_subject`, per curriculum)

| Field | Column | Rule |
| --- | --- | --- |
| Category | `subject_category` (required) | E.g. `Core`, `Elective E1`, `Elective E2`, `Elective U1`, `Elective U2`, `Industrial Training`. U1/U2 affects the default semester type. |
| Compulsory | `is_compulsory` 0/1 | Required. |
| Display name | `display_name` (optional) | Curriculum-specific name, if it differs from the subject name. |
| Semester type | table `subject_semester_rule` (`NORMAL` / `SHORT`) | One row per curriculum subject (section 3). |
| Prerequisites | table `subject_prerequisite` (`MANDATORY` / `RECOMMENDED` / `COREQUISITE`), plus optional `prerequisite_details` jsonb for conditional rules | MANDATORY gates the forecast; RECOMMENDED is advice only. |

## 2. Class type and class size

| Class type | Minimum | Optimal | Maximum per class |
| --- | --- | --- | --- |
| `LAB` | 15 | 25 | 35 |
| `LECTURE` (non-lab) | 15 | 25 | 45 |

- The sizes live in table `class_capacity_rule` (global rule per class type), not in the subject. The
  subject only says LAB or LECTURE.
- Rule of thumb used for the proof of concept: programming, development, database and explicit lab subjects are
  `LAB`; everything else is `LECTURE`.
- The minimum (15) is still a provisional value.
- **Form hint:** show the class size the subject will get, e.g. "Lab — up to 35 students per class".

## 3. Semester type: Normal or Short

Semester 1 and 2 are **Normal**; semester 3 is **Short**. Each curriculum subject runs in one semester type.

**Default rule** (pre-fill the form with it, and let the admin override it):

- **Short only:** subjects worth **2 credits**, or category **Elective U1 / U2**.
- **Normal only:** everything else.

**Decided exceptions:**

| Subject | Semester | Why |
| --- | --- | --- |
| SECD3761 Seminar Keusahawanan Teknologi Maklumat (1 credit) | Short | Product owner decision |
| SECR2242 Computer Networks (2 credits) + SECR2941 Computer Networks Lab (1 credit) | Normal | Lecture/lab pair; runs together |
| SECR3242 Internetworking Technology (2 credits) + SECR3941 Internetworking Technology (Lab) (1 credit) | Normal | Lecture/lab pair; runs together |
| SECJ3032 / SECR3032 Project I (2 credits) | Normal | Not offered anyway (section 4) |

The following 2-credit **Core** university subjects are Short only. This was confirmed by the product owner:
UHLB1112, UHLB2122, UHLB3132, UHIS1022, UHMS1182, UHMT1012, UHIT2302, UBSS1032, UKXQ2022.

**Form rules:**

- Pre-select the semester type from the default rule when the admin adds a subject to a curriculum. Show
  why, e.g. "2 credits → Short semester".
- Allow an override, which needs a reason; that is how the exceptions above are kept.
- **Lecture/lab pairs:** when a subject has a paired lab or lecture, both must have the same semester type.
  The form should warn if they differ. A "paired with" link is a future improvement; today the pairs above are
  recognised by their prerequisites.
- Missing rule rows mean "runs in any semester". Avoid that for real subjects: always save a row.

## 4. Subjects that are never offered

Set `include_in_offering_forecast = false` for:

| Code | Subject |
| --- | --- |
| SECJ3032 / SECR3032 | Projek Sarjana Muda 1 / Project I |
| SECJ4134 / SECR4134 | Projek Sarjana Muda 2 / Project II |
| SECJ4114 / SECR4114 | Latihan Industri (laporan / report) |
| SECJ4118 / SECR4118 | Latihan Industri (HW) |
| UKQT3001 | Pengalaman Pembelajaran Luar Kurikulum |

Effect:

- **Coordinator forecast:** listed under "Excluded subjects" with the reason; no demand and no classes.
- **Approve offerings:** cannot be approved, so students never pick them on the offerings page.
- **Student records and degree progress: no effect.** Students still record these subjects (completed,
  failed, exempted) and their credits still count. The flag is read only by the coordinator forecasting
  module.

**Form hint:** label the switch "Offered as a class each semester". When switching it off, ask for a short
reason, e.g. "Final year project", "Industrial training" or "Co-curricular experience". The forecast shows it.

## 5. Where each setting is used

| Setting | Coordinator forecast | Confirm offerings | Student offerings page (P002, planned) | Student records / progress |
| --- | --- | --- | --- | --- |
| Credit hours | Credits, near graduation | Shown | Pick limits | Credits |
| Class type | Class size and number of classes | Shown | — | — |
| Offered as a class | Excluded list | Cannot approve | Never listed | No effect |
| Semester type | Off-semester subjects listed separately | Cannot approve for the other type | Should read the same table (follow-up) | No effect |
| MANDATORY prerequisite | Eligibility | — | Display aid | — |

Follow-up for P002: the student offerings page still uses a hardcoded Normal/Short predicate
(`apps/web/src/features/offerings/display-filter.ts`). It should switch to `subject_semester_rule`, so
students and coordinators use one rule.

## 6. Checklist for creating a new subject

1. Code, name and credit hours.
2. Class type: LAB or LECTURE.
3. Offered as a class? Off for final-year projects, industrial training and co-curricular experience.
4. Add it to each curriculum: category, compulsory, optional display name.
5. Semester type, pre-filled from the default rule. Override with a reason; keep lecture/lab pairs together.
6. Prerequisites: MANDATORY / RECOMMENDED / COREQUISITE.
7. Save with a reason. The change is audited, like other admin changes.

## 7. Current development data (Neon development branch, 2026-11-02)

These values were set directly for the proof of concept and should be re-entered or confirmed through the
admin menu once it exists:

- `class_type` set on the 94 subjects that were forecastable on 2026-11-01: 17 LAB, 77 LECTURE.
- `class_capacity_rule`: LAB 15/25/35, LECTURE 15/25/45.
- `subject_semester_rule` filled for curricula 1 (SECJ) and 3 (SECRH) using the default rule and the exceptions
  above.
- `include_in_offering_forecast = false` for the 9 subjects in section 4.

## 8. Other degrees

When a new degree (programme) and its curriculum are created, its subjects are configured the same way. The rules
above are the **current defaults for SECJ and SECRH**, not fixed for every degree.

| Setting | Can each degree have its own value? | How |
| --- | --- | --- |
| Semester type (Normal / Short) | **Yes**, per degree | `subject_semester_rule` is stored per curriculum subject, so the same subject can be Normal in one degree and Short in another. |
| Category, compulsory, display name, prerequisites | **Yes**, per degree | Stored on `curriculum_subject` / `subject_prerequisite`. |
| Default semester rule (2 credits or U1/U2 → Short) | Should be | Today it is only the form's pre-fill. Make it a per-degree setting (or let the admin pick a template) so a degree with different conventions starts from its own default. |
| Class type (LAB / LECTURE) | **No, shared** | Stored on `subject`. A subject shared by two degrees has one class type. |
| Offered as a class (`include_in_offering_forecast`) | **No, shared** | Stored on `subject`. Excluding a shared subject excludes it for every degree. |
| Class sizes | **No, global** today | `class_capacity_rule` is one rule per class type. The engine already supports subject- and centre-specific rules if columns are added later. |

**Shared subjects** (the same code in several degrees, e.g. the U-coded university subjects): if a degree
needs a different class type or a different "offered" setting for a shared subject, the shared columns are not
enough. In that case, move or override those two settings at curriculum level, which needs a small migration:
add nullable `class_type` / `include_in_offering_forecast` overrides on `curriculum_subject`, with the subject
value as the fallback. Do this only when a real case appears; until then, keep them on `subject`.

**Form guidance for a new degree:**

1. Create the degree and its curriculum.
2. Add its subjects. Existing subjects are reused by code, so new ones need the full subject fields (section 1).
3. Review the pre-filled semester types against that degree's own conventions, and override with a reason
   where needed.
4. Review the never-offered list for that degree's own final-year project, industrial training and similar
   subjects.
5. Check that every offered subject has a class type before coordinators run a forecast.
