# UC08 integration contract

GET/PUT /api/semester-offerings reuses P004's authorize middleware, requiring an
active STUDENT and completed profile. Identity is resolved from the verified Clerk
session, never from ownership fields in request bodies.

- GET without query returns curriculum subjects and configured semesters.
- GET ?semesterId=201 also returns that student's saved selection.
- PUT JSON: {"semesterId":"201","curriculumSubjectIds":["101"]}. Empty arrays clear
  the saved set; IDs are positive INTEGER decimal strings (numeric input normalizes).
- Duplicate/foreign/invalid IDs are rejected. Replacement is transactional and
  idempotent, locking the student's profile before reconciliation. A failure rolls
  back the replacement. Last committed full replacement wins across sessions.
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
requires STUDENT/profile completion; drafts reset on user/session changes.

The baseline currently has an auth-only preview, not a shared academic router or
P001 profile service. Those owners must provide/mount their services before real
student persistence can be accepted. The independent dev:offerings demo remains
explicitly fictional. No complete-profile fallback or production identity mock exists.
Backend bindings reuse DATABASE_URL and existing Clerk settings; obtain them privately.

Boundaries still requiring live integration: production per-request connection
adapter/Workers lifecycle, real Clerk sessions, public membership-trigger behavior,
competing-session saves, approved reference data and human peer acceptance.
