# UC08 integration contract

GET/PUT /api/semester-offerings reuses P004's authorize middleware, requiring an
active STUDENT and completed profile. Identity is resolved from the verified Clerk
session, never from ownership fields in request bodies.

- The completed profile supplies its required `currentSemesterId`. GET without a query
  returns that period's saved selection and the profile-selected ID with curriculum
  subjects/configured semester metadata. Optional `?semesterId=` is accepted only when
  it matches the saved profile choice; other periods are rejected.
- PUT JSON: {"semesterId":"201","curriculumSubjectIds":["101"]}. Empty arrays clear
  the saved set; IDs are positive INTEGER decimal strings (numeric input normalizes).
- Duplicate/foreign/invalid IDs are rejected. Replacement is transactional and
  idempotent, locking the student's profile and rechecking its current semester before
  reconciliation. A stale or mismatched period is rejected before any replacement.
  A failure rolls back the replacement. Previously saved periods remain intact when
  the student changes the profile choice, and become active again if selected later.
- Responses use the existing {data: ...}/{error: {code,message}} envelopes.

API entry: apps/api/src/modules/offerings/index.ts exports createOfferingHandler.
Supply createOfferingHandler(env, { profiles: realP001ProfileReader }) and register
its handler in the real shared Worker router. The optional contextFor override
must resolve the verified user's own profile/curriculum. The default context reader
consumes programme, curriculum, subject, curriculum_subject, academic_semester and
student_profile; repository storage uses the existing semester_offering table.
Canonical keys are INTEGER, not UUID. Do not recreate any tables.

Web entry: apps/web/src/features/offerings/StudentOfferingsRoute.tsx. Mount it at
/student/offerings inside the shared Clerk provider/shell. Its existing P004 gate
requires STUDENT/profile completion; drafts reset on user/session changes. The year and
semester dropdowns live in required academic-profile setup; Offerings displays the
saved current period and links back to edit the profile choice.

The baseline currently has an auth-only preview, not a shared academic router or
P001 profile service. Those owners must provide/mount their services before real
student persistence can be accepted. The independent dev:offerings demo remains
explicitly fictional. No complete-profile fallback or production identity mock exists.
Backend bindings reuse DATABASE_URL and existing Clerk settings; obtain them privately.

Boundaries still requiring live integration: production per-request connection
adapter/Workers lifecycle, real Clerk sessions, public membership-trigger behavior,
competing-session saves, approved reference data and human peer acceptance.
