# Phase 3A/3B — Controlled Attendance Foundation

> **Status:** Implemented and deployed. Phase 1 imported rows remain immutable; controlled operational attendance writes are enabled under production RLS.

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
| baseline_child_attendance_day_id | uuid | optional FK -> imported child_attendance_days; inferred server-side and not exposed to browser clients |
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
| administrator | all accessible children | all accessible children | private/internal only |
| management | all accessible children | all accessible children | private/internal only |
| programme_manager | allowed programme streams for children visible under existing RLS | no | private/internal only |
| teacher | programme attendance for children visible through programme/child scope | no | private/internal only |
| therapist | no | therapy attendance for children visible through programme/child scope | private/internal only |

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

Imported Phase 1 monthly source fields remain unchanged for lineage/audit purposes.

The programme team confirmed the operational calculation rules:
- `P` counts as present;
- `PwC` (parent with child) counts as present;
- `A` counts as absent;
- `H` (holiday) is excluded from the total;
- `NS` (not scheduled) is excluded from the total.

The source data confirms that blank daily values are excluded from the monthly denominator where a source monthly total is recorded: all 3,094 rows with a non-null `source_total_count` equal daily `P + PwC + A`. One imported GC-PVSW row for Aug 2025-26 has null source monthly totals and is preserved unchanged as a source-data anomaly.

The effective monthly attendance shown by the application is therefore derived from the effective daily programme codes after operational overrides:

`present = P + PwC`

`absent = A`

`total = P + PwC + A`

`percentage = 100 * present / total` when `total > 0`

Operational corrections recalculate this displayed effective summary after reload. They do not update or overwrite `child_attendance_months` source fields.

## Validation and rollout

Validation uses GitHub-hosted ephemeral runners, the local Supabase development stack and synthetic fixtures. Production rollout uses the version-controlled migration `20261016083103_operational_attendance_production.sql`, RLS remains enabled, and no service-role credential is exposed to browser code.
