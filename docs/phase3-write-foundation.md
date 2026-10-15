# Phase 3A — Controlled Write Foundation (PROPOSAL ONLY)

> **Status:** Review artifact. Nothing in this document has been applied to production or any Supabase branch.

## Goals

Phase 3A introduces an operational write layer while keeping Phase 1 migrated rows immutable and traceable through their existing `source_record_id` lineage.

The first write scope is:
- daily programme attendance;
- daily therapy attendance;
- correction of operational attendance entries;
- audit/revision history.

It does **not** yet enable:
- deletion;
- direct edits to migrated `children`, `child_attendance_months`, `child_attendance_days`, `adl_assessments`, or `development_assessments`;
- child master-data edits;
- programme reassignment;
- ADL/development assessment writes;
- goals, behaviour, home-guidance, parent-session, or work-skill persistence.

## Why migrated Phase 1 rows remain read-only

All migrated business rows carry a non-null `source_record_id` pointing to `private.source_records`. Updating those rows in place would make the stored value diverge from the sanitized source row that the lineage ID represents. New application-created rows also have no legitimate Phase 1 source row.

Phase 3 therefore adds a separate operational layer. Phase 1 remains the immutable baseline.

## Proposed operational tables

### public.operational_attendance_entries

One current operational entry per child/date/source stream.

| Column | Type | Rule |
|---|---|---|
| attendance_entry_id | uuid | PK, generated |
| child_pk | uuid | required FK -> children |
| entry_date | date | required |
| activity_type | text | `programme` or `therapy` |
| activity_source_label | text | required; approved source stream |
| attendance_code | text | required; `P`, `A`, `H`, `NS`, or `PwC` |
| reason_for_absence | text | optional |
| notes | text | optional |
| baseline_child_attendance_day_id | uuid | optional FK -> imported child_attendance_days |
| correction_reason | text | required when overriding a baseline day |
| revision | integer | starts at 1, increments on update |
| created_by | uuid | always current `auth.uid()` |
| created_at | timestamptz | server timestamp |
| updated_by | uuid | always current `auth.uid()` |
| updated_at | timestamptz | server timestamp |

Unique key: `(child_pk, entry_date, activity_source_label)`.

A missing operational row means **no operational override has been recorded**. It must never be interpreted as a fabricated attendance code.

Identity fields (`child_pk`, `entry_date`, `activity_type`, `activity_source_label`, and the optional baseline link) are immutable after insert. Correcting an attendance code updates the same logical record and creates a history revision.

### private.operational_attendance_entry_history

Immutable audit records written by a trigger:
- audit ID;
- operational entry ID;
- revision;
- action (`INSERT` or `UPDATE`);
- actor `auth.uid()`;
- timestamp;
- old row JSON;
- new row JSON.

Authenticated clients receive no direct INSERT/UPDATE/DELETE privilege on this table.

## Source-label scope

Initial programme write streams:
- `GC-EI` -> child current programme `EI`
- `GC-Nursery` -> `Nursery`
- `GC-FA` -> `FA`
- `GC-PVSW` -> `PV` or `SW`

Initial therapy write streams:
- `TH-ST`
- `TH-PT`
- `TH-OT`
- `TH-VT`

`GC-MNH` remains **PENDING VALIDATION** for write entry because the Phase 1 source contains that stream but the child master programme vocabulary does not contain an explicit MNH programme value. Existing migrated GC-MNH rows remain readable; Phase 3 must not guess a write mapping.

## Proposed role-permission matrix

| Role | Programme attendance | Therapy attendance | Audit history |
|---|---|---|---|
| administrator | all accessible children | all accessible children | all |
| management | all accessible children | all accessible children | all |
| programme_manager | allowed programme streams for children visible under existing RLS | no | matching accessible entries |
| teacher | programme attendance for children visible through programme/child scope | no | matching accessible entries |
| therapist | no | therapy attendance for children visible through programme/child scope | matching accessible entries |

This is intentionally least-privilege. Assessment and master-data write permissions are deferred to later Phase 3 review.

## Proposed RLS behavior

All operational tables keep RLS enabled.

An operational attendance row is readable/writable only when:
1. the JWT has `app_metadata.tamahar.enabled = true`;
2. its role is allowed for the requested activity type;
3. the referenced child is visible through the existing `children` RLS policy;
4. programme attendance source labels agree with the child's current programme;
5. UPDATE passes the same checks against the proposed new row (`WITH CHECK`), not only the existing row.

No DELETE policy is proposed.

## Monthly aggregates

Phase 1 monthly source totals stay immutable.

Phase 3B will derive an **effective** daily/monthly view by overlaying operational entries on the imported source baseline. Operational monthly totals should be computed from effective daily values rather than independently typed into `child_attendance_months`.

This foundation does not backfill missing daily values and does not infer daily attendance from migrated monthly totals.

## Staging requirement

Do not apply this proposal to production.

Approved validation environment:
- GitHub-hosted ephemeral runner;
- Supabase local development stack started with the Supabase CLI;
- schema created from the checked-in Phase 1/2 migrations;
- Phase 3 proposal applied only to that local database;
- dedicated synthetic test fixtures only;
- no remote Supabase project, production credentials, hosted branch, billing upgrade, or paid resource.

A hosted Phase 3 Vercel-to-Supabase staging test is intentionally out of scope under the current free-only constraint. No production child data is used for Phase 3 validation.
