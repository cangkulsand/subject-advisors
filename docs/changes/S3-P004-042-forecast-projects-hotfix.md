# S3-P004-042: Hotfix, projects and industrial training in the Offering Forecast

- **Status:** applied to Neon on 2026-11-28 (dev and prod share the database). Data only: no code change, no migration.
- **Owner:** P004, at the owner's request.

## Problem

The owner could not see Software Engineering Project I in the coordinator's Offering Forecast. Nine subjects had `subject.include_in_offering_forecast = false`, so the forecast left them out by design, and nothing on screen could change the flag.

## Change (owner request, 2026-11-28)

**Flag turned on** for 8 subjects:
- SECJ3032 and SECR3032: Project I
- SECJ4134 and SECR4134: Project II
- SECJ4118 and SECR4118: Industrial Training
- SECJ4114 and SECR4114: Industrial Training (Report)

**Class type fixed:** SECJ4114 and SECJ4118 had no class type. They were given `LECTURE`, matching their SECR twins, so the forecast can size their classes. Without a class type the forecast shows "configuration required".

**Unchanged:** UKQT3001 Extracurricular Experiential Learning stays out of the forecast.

**How it was applied:** a one-off transaction with the actor `hotfix:owner-request` and a reason.

## Effect

- **Coordinators:** these subjects now appear in the Offering Forecast and need a decision (Pending / Approved / Removed) like any other subject.
- **Students:** these subjects were always open before. They are now handled like other subjects: students see them in semester offerings once the coordinator approves them, and the graduation-plan first semester only allows them after approval (`planning/repository.ts`).

## Rollback

```sql
UPDATE public.subject SET include_in_offering_forecast=false
  WHERE subject_code IN ('SECJ3032','SECJ4134','SECJ4114','SECJ4118','SECR3032','SECR4134','SECR4114','SECR4118');
```

To roll back the class type as well, set `class_type` back to NULL for SECJ4114 and SECJ4118.

## Follow-up

An "Include in Offering Forecast" setting in Curriculum & Subjects, so that admins or coordinators can change this without database work.
