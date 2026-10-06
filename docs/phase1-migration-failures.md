# Phase 1 Migration Failure Log

Migration run: `11111111-1111-4111-8111-202610060001`

The complete row-level failure log is stored in `private.migration_failures` in Supabase. This document summarizes the recorded failures/exclusions.

| Source workbook | Sheet | Row reference | Count | Category | Reason |
|---|---|---:|---:|---|---|
| Updated_Children_Caregivers_Assessments_Tamahar | Caregivers | rows 800-2717 | 1,918 | source_data_quality | Anomalous caregiver block: Child Id missing with repeated placeholder pattern; not migrated as caregiver records. |
| Updated_Children_Caregivers_Assessments_Tamahar | Caregiver Outcome Assessment | row 108 | 1 | referential_integrity | Child Id and Caregiver ID are missing; record cannot be linked to required entities. |
| Updated_Student_Session_Attendance_Tamahar | TH-PT | row 69 | 1 | referential_integrity | Academic Year is blank; required attendance context is incomplete. Source key: BG123038 / July / TH-PT. |
| Updated_Student_Session_Attendance_Tamahar | Copy of FA | rows 2-41 | 40 | excluded_legacy_source | Hidden legacy FA source excluded from business migration due overlap/duplicate risk with current GC-FA. |
| Updated_Student_Session_Attendance_Tamahar | Inverse | populated rows 2-296 | 294 | excluded_legacy_source | Hidden transposed legacy attendance excluded due overlap and names outside the standard sanitized Student ### convention. |

**Total logged failures/exclusions: 2,254.**

## Full log query

```sql
select
  source_workbook,
  source_sheet,
  source_row_number,
  source_record_key,
  failure_category,
  failure_reason,
  raw_value_context
from private.migration_failures
where migration_run_id = '11111111-1111-4111-8111-202610060001'
order by source_workbook, source_sheet, source_row_number;
```
