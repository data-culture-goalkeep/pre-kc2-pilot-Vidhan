# Phase 2 frontend ↔ Phase 1 backend mapping

## Principle

The Phase 1 Supabase schema remains the source of truth. The PM frontend keeps its existing presentation model, while `frontend/dist/backend.js` translates normalized backend rows into the shapes needed by the UI. No duplicate database or alternate schema is introduced.

## Implemented mappings

| Frontend area | Phase 1 source | Mapping status |
| --- | --- | --- |
| Children list / child record | `public.children` | Connected |
| Programme label | `children.current_program_source` | Connected with explicit UI label mapping |
| Monthly attendance summary | `public.child_attendance_months` | Connected |
| Daily attendance calendar | `public.child_attendance_days` joined by month record | Connected, read-only |
| Therapy attendance | `TH-OT`, `TH-VT`, `TH-ST`, `TH-PT` rows in attendance tables | Connected, read-only |
| ADL assessment summary | `public.adl_assessments` | Connected using actual aggregate fields |
| Development assessment summary | `public.development_assessments` | Connected using actual year/term/domain goal counts |
| Programme comparison | Derived from accessible real child/assessment/attendance rows | Connected where source supports it |

### Programme labels

Frontend categories are mapped only where Phase 1 values support them:

- `EI` → Early Intervention
- `Nursery` → Nursery
- `FA` → Functional Academics
- `PV` and `SW` → Prevocational & Sheltered Workshop
- missing / `No new program enrolled` → Not currently enrolled

`GC-MNH` is preserved in the backend but is not forced into one of the four PM frontend programme categories because no approved mapping exists.

### Attendance semantics

Daily source codes are preserved. `P` and `A` drive present/absent display; values such as `H`, `NS`, `PwC`, blanks, and other source codes are not silently converted. Therapy rows use the Phase 1 source labels:

- `TH-OT` → Occupational therapy
- `TH-VT` → Visual therapy
- `TH-ST` → Speech therapy
- `TH-PT` → Physical therapy

## Prototype-only / unsupported write concepts

The PM prototype contains interaction concepts that are not directly represented by approved Phase 1 tables, including detailed goal-review entries, behaviour concerns, home guidance, and some work-skill/session forms. These are not persisted by this Phase 2 build and no new database table has been invented for them.

If Tamahar requires these as production data-entry workflows, the PM/data owner must approve the business model and a controlled Phase 2 schema extension before writes are implemented.

## Write policy

This branch intentionally performs no insert/update/delete against Phase 1 tables. Migrated source records and their lineage remain unchanged. A future write-capable application should use an approved transactional model and matching RLS rather than treating migrated source-lineage rows as editable application state.

## Verification note: daily attendance blanks and programme labels

Verified against the live Phase 1 Supabase records on 2026-10-14:

- `child_attendance_months` contains monthly aggregate attendance values (`source_present_count`, `source_absent_count`, `source_total_count`, `source_attendance_percentage`) independently of the per-day codes in `child_attendance_days`.
- Therefore Monthly Work can correctly show existing monthly attendance even when a selected Daily Attendance date has no recorded source code.
- Daily Attendance must continue to display `—` for an unrecorded day. Missing day codes must not be inferred from monthly totals.
- In academic year `2026-27`, September is explicitly partial in several source streams: `GC-EI` has coded days only through day 6, `GC-PVSW` through day 7, `TH-OT` through day 6, `TH-PT`/`TH-ST` through day 7, and `TH-VT` through day 8. By contrast, `GC-FA`, `GC-MNH`, and `GC-Nursery` contain codes through day 30.
- The latest available source period is May `2026-27` (May 2027 in ISO month terms). That period contains `GC-PVSW` rows only, so children outside that source programme correctly have no daily value in that selected period.
- `children.current_program_source` contains the explicit source value `No new program enrolled` for 275 children. The current UI maps this to the generic text `Not currently enrolled / unmapped`. This does not fabricate an enrolment, but it loses the distinction between an explicit source status and an unknown future unmapped code.
- Minimal UI clarification recommended for a future polish pass: when `current_program_source = 'No new program enrolled'`, display `No new programme enrolled` (or the exact source wording) rather than the generic `Not currently enrolled / unmapped`. Keep `Not currently enrolled / unmapped` only for genuinely unknown/unmapped values.

No source records, attendance codes, mappings, RLS policies, or database permissions were changed as part of this verification.
