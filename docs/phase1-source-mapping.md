# Phase 1 Source-to-Target Mapping

## Source workbook: Updated_Children_Caregivers_Assessments_Tamahar

| Source sheet | Target | Migration treatment |
|---|---|---|
| Children | public.children | One source row -> one child. Source ID retained as child_id. |
| Children programme start/end columns | public.child_program_periods | EI/Nursery/FA/PV/SW start/end pairs are unpivoted into programme-period rows when either start or end is populated. |
| Caregivers | public.caregivers + public.caregiver_child_links | Rows with a resolvable Child Id are migrated; caregiver relationship attributes move to caregiver_child_links. Anomalous rows without Child Id are logged as failures. |
| ADL Assessment | public.adl_assessments | One source row -> one assessment; Child Id resolved to children. |
| Development Assessment | public.development_assessments | One source row -> one assessment/domain record; Child Id resolved to children. |
| Caregiver Outcome Assessment | public.caregiver_outcome_assessments + public.caregiver_outcome_responses | Assessment metadata/summaries remain on assessment table; Section A-G and open-ended source questions are unpivoted to response rows. Rows with unresolved Child/Caregiver IDs are logged. |

## Source workbook: Updated_Student_Session_Attendance_Tamahar

| Source sheet | Target | Migration treatment |
|---|---|---|
| GC-EI | child_attendance_months + child_attendance_days | Monthly row + 31 normalized day rows. |
| GC-Nursery | child_attendance_months + child_attendance_days | Same. |
| GC-FA | child_attendance_months + child_attendance_days | Same. |
| GC-MNH | child_attendance_months + child_attendance_days | Same. |
| GC-PVSW | child_attendance_months + child_attendance_days | Same; source programme/subtype labels preserved. |
| TH-ST | child_attendance_months + child_attendance_days | Same. |
| TH-PT | child_attendance_months + child_attendance_days | Same; one row lacking Academic Year was logged as a failure. |
| TH-OT | child_attendance_months + child_attendance_days | Same. |
| TH-VT | child_attendance_months + child_attendance_days | Same. |
| Cag-Sg | caregiver_activity_months + caregiver_activity_days | Caregiver ID resolved; Child Id is NA in source and child_pk remains null. |
| Cag-Individual Counseling | caregiver_activity_months + caregiver_activity_days | Same. |
| Cag-Tr-Pn | caregiver_training_events | One source row -> one event. |
| Cag-Tr | caregiver_training_participation_years + caregiver_training_participation_months | One annual row + 12 month rows; source participation codes preserved unchanged. |
| Copy of FA | source_records + migration_failures | Hidden legacy source excluded from business migration due overlap/duplicate risk. |
| Inverse | source_records + migration_failures | Hidden transposed legacy source excluded due overlap and non-standard sanitization labels. |
| Child_Mapping | none | Empty source sheet. |
| Caregiver_Mapping | none | Empty source sheet. |
| Read Me | none | Documentation/instructions, not transactional source rows. |

## Source lineage

Every migrated business row references `private.source_records.source_record_id`. The source record stores:
- workbook name
- Drive file ID
- sheet name
- source row number
- source record key where available
- upstream source URL where present
- full sanitized source row as JSONB

## Failure handling

Rows that cannot be safely mapped to required target relationships are not silently discarded. They are written to `private.migration_failures` with source workbook, sheet, row number, source key, failure reason, category, and raw source context.
