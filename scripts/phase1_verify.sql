-- Phase 1 verification queries
-- Safe read-only checks for the approved Tamahar schema.

select table_schema, table_name
from information_schema.tables
where table_schema in ('public','private')
  and table_type='BASE TABLE'
order by table_schema, table_name;

select 'children' table_name, count(*) row_count from public.children
union all select 'caregivers', count(*) from public.caregivers
union all select 'child_attendance_months', count(*) from public.child_attendance_months
union all select 'child_attendance_days', count(*) from public.child_attendance_days
union all select 'caregiver_activity_months', count(*) from public.caregiver_activity_months
union all select 'caregiver_activity_days', count(*) from public.caregiver_activity_days
union all select 'caregiver_training_events', count(*) from public.caregiver_training_events
union all select 'caregiver_training_participation_years', count(*) from public.caregiver_training_participation_years
union all select 'caregiver_training_participation_months', count(*) from public.caregiver_training_participation_months
union all select 'adl_assessments', count(*) from public.adl_assessments
union all select 'development_assessments', count(*) from public.development_assessments
union all select 'caregiver_outcome_assessments', count(*) from public.caregiver_outcome_assessments
union all select 'caregiver_outcome_responses', count(*) from public.caregiver_outcome_responses
union all select 'source_records', count(*) from private.source_records
union all select 'migration_failures', count(*) from private.migration_failures;

select source_workbook, source_sheet, count(*) source_records
from private.source_records
group by source_workbook, source_sheet
order by source_workbook, source_sheet;

select source_workbook, source_sheet, failure_category, count(*) failures
from private.migration_failures
group by source_workbook, source_sheet, failure_category
order by source_workbook, source_sheet, failure_category;
