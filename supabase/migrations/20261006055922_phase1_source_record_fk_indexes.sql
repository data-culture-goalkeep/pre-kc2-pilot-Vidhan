-- Kickstarter Tamahar Phase 1
-- Add covering indexes for source-record foreign keys identified by Supabase advisors.

create index if not exists children_source_record_idx on public.children(source_record_id);
create index if not exists child_program_periods_source_record_idx on public.child_program_periods(source_record_id);
create index if not exists caregivers_source_record_idx on public.caregivers(source_record_id);
create index if not exists caregiver_child_links_source_record_idx on public.caregiver_child_links(source_record_id);
create index if not exists child_attendance_months_source_record_idx on public.child_attendance_months(source_record_id);
create index if not exists child_attendance_days_source_record_idx on public.child_attendance_days(source_record_id);
create index if not exists caregiver_activity_months_source_record_idx on public.caregiver_activity_months(source_record_id);
create index if not exists caregiver_activity_days_source_record_idx on public.caregiver_activity_days(source_record_id);
create index if not exists caregiver_training_events_source_record_idx on public.caregiver_training_events(source_record_id);
create index if not exists caregiver_training_participation_years_source_record_idx on public.caregiver_training_participation_years(source_record_id);
create index if not exists caregiver_training_participation_months_source_record_idx on public.caregiver_training_participation_months(source_record_id);
create index if not exists adl_assessments_source_record_idx on public.adl_assessments(source_record_id);
create index if not exists development_assessments_source_record_idx on public.development_assessments(source_record_id);
create index if not exists caregiver_outcome_assessments_source_record_idx on public.caregiver_outcome_assessments(source_record_id);
create index if not exists caregiver_outcome_responses_source_record_idx on public.caregiver_outcome_responses(source_record_id);
