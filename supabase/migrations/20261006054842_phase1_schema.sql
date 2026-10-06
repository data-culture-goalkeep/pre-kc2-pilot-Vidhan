-- Kickstarter Tamahar Phase 1
-- Approved provisional schema; unresolved business semantics remain stored as source text.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table private.migration_runs (
  migration_run_id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running','completed','completed_with_failures','failed')),
  notes text
);

create table private.source_records (
  source_record_id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references private.migration_runs(migration_run_id) on delete restrict,
  source_workbook text not null,
  source_file_id text,
  source_sheet text not null,
  source_row_number integer not null check (source_row_number > 0),
  source_record_key text,
  upstream_source_url text,
  raw_row jsonb not null,
  created_at timestamptz not null default now(),
  unique (migration_run_id, source_workbook, source_sheet, source_row_number)
);

create index source_records_migration_run_idx on private.source_records(migration_run_id);
create index source_records_workbook_sheet_idx on private.source_records(source_workbook, source_sheet);
create index source_records_key_idx on private.source_records(source_record_key) where source_record_key is not null;

create table private.migration_failures (
  migration_failure_id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references private.migration_runs(migration_run_id) on delete restrict,
  source_record_id uuid references private.source_records(source_record_id) on delete restrict,
  source_workbook text not null,
  source_sheet text not null,
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  source_record_key text,
  failure_reason text not null,
  failure_category text,
  raw_value_context jsonb,
  created_at timestamptz not null default now()
);

create index migration_failures_run_idx on private.migration_failures(migration_run_id);
create index migration_failures_source_record_idx on private.migration_failures(source_record_id);
create index migration_failures_workbook_sheet_idx on private.migration_failures(source_workbook, source_sheet);

create table public.children (
  child_pk uuid primary key default gen_random_uuid(),
  child_id text not null unique,
  child_name text not null,
  centre_name text,
  gender text,
  date_of_birth date,
  enrollment_date date,
  annual_income numeric,
  annual_income_bucket text,
  income_category text,
  status text not null,
  disability_type text,
  disability_sub_type text,
  severity text,
  developmental_age_at_intake text,
  current_program_source text,
  exit_date date,
  exit_reason text,
  exit_theme_shortened text,
  exit_theme text,
  notes text,
  error_validation text,
  mark_issue boolean,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index children_status_idx on public.children(status);
create index children_current_program_idx on public.children(current_program_source);
create index children_centre_idx on public.children(centre_name);

create table public.child_program_periods (
  child_program_period_id uuid primary key default gen_random_uuid(),
  child_pk uuid not null references public.children(child_pk) on delete restrict,
  source_program_label text not null,
  start_term text,
  end_term text,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index child_program_periods_child_program_idx on public.child_program_periods(child_pk, source_program_label);

create table public.caregivers (
  caregiver_pk uuid primary key default gen_random_uuid(),
  caregiver_id text not null,
  caregiver_name text not null,
  status text,
  employment_status text,
  education_level text,
  notes text,
  mark_issue boolean,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index caregivers_caregiver_id_idx on public.caregivers(caregiver_id);
create index caregivers_status_idx on public.caregivers(status);

create table public.caregiver_child_links (
  caregiver_child_link_id uuid primary key default gen_random_uuid(),
  caregiver_pk uuid not null references public.caregivers(caregiver_pk) on delete restrict,
  child_pk uuid not null references public.children(child_pk) on delete restrict,
  caregiver_type text,
  primary_caregiver boolean,
  parental_involvement boolean,
  child_status_raw text,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index caregiver_child_links_caregiver_idx on public.caregiver_child_links(caregiver_pk);
create index caregiver_child_links_child_idx on public.caregiver_child_links(child_pk);
create index caregiver_child_links_child_type_idx on public.caregiver_child_links(child_pk, caregiver_type);

create table public.child_attendance_months (
  child_attendance_month_id uuid primary key default gen_random_uuid(),
  child_pk uuid not null references public.children(child_pk) on delete restrict,
  academic_year text not null,
  month_label text not null,
  source_status text,
  program_source_label text not null,
  program_subtype_batch text,
  source_pwc_count integer,
  source_present_count integer,
  source_absent_count integer,
  source_total_count integer,
  source_attendance_percentage numeric,
  notes text,
  reason_for_absence text,
  validation_present integer,
  validation_absent integer,
  validation_total integer,
  validation_check text,
  mark_issue boolean,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index child_attendance_months_child_idx on public.child_attendance_months(child_pk);
create index child_attendance_months_child_year_idx on public.child_attendance_months(child_pk, academic_year);
create index child_attendance_months_period_idx on public.child_attendance_months(academic_year, month_label);
create index child_attendance_months_program_idx on public.child_attendance_months(program_source_label);

create table public.child_attendance_days (
  child_attendance_day_id uuid primary key default gen_random_uuid(),
  child_attendance_month_id uuid not null references public.child_attendance_months(child_attendance_month_id) on delete restrict,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  attendance_code text,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict,
  unique (child_attendance_month_id, day_of_month)
);
create index child_attendance_days_month_idx on public.child_attendance_days(child_attendance_month_id);

create table public.caregiver_activity_months (
  caregiver_activity_month_id uuid primary key default gen_random_uuid(),
  caregiver_pk uuid not null references public.caregivers(caregiver_pk) on delete restrict,
  child_pk uuid references public.children(child_pk) on delete restrict,
  child_name_source text,
  academic_year text not null,
  month_label text not null,
  source_status text,
  activity_source_label text not null,
  source_present_count integer,
  source_absent_count integer,
  source_total_count integer,
  source_attendance_percentage numeric,
  notes text,
  reason_for_absence text,
  mark_issue boolean,
  unidentified_column_raw text,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index caregiver_activity_months_caregiver_idx on public.caregiver_activity_months(caregiver_pk);
create index caregiver_activity_months_child_idx on public.caregiver_activity_months(child_pk) where child_pk is not null;
create index caregiver_activity_months_period_idx on public.caregiver_activity_months(academic_year, month_label);
create index caregiver_activity_months_activity_idx on public.caregiver_activity_months(activity_source_label);

create table public.caregiver_activity_days (
  caregiver_activity_day_id uuid primary key default gen_random_uuid(),
  caregiver_activity_month_id uuid not null references public.caregiver_activity_months(caregiver_activity_month_id) on delete restrict,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  attendance_code text,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict,
  unique (caregiver_activity_month_id, day_of_month)
);
create index caregiver_activity_days_month_idx on public.caregiver_activity_days(caregiver_activity_month_id);

create table public.caregiver_training_events (
  caregiver_training_event_pk uuid primary key default gen_random_uuid(),
  training_id text not null unique,
  training_name text not null,
  academic_year text not null,
  month_label text not null,
  planned_date date,
  actual_date date,
  program_specific_raw text,
  planned_attendance integer,
  actual_attendance integer,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index caregiver_training_events_academic_year_idx on public.caregiver_training_events(academic_year);
create index caregiver_training_events_planned_date_idx on public.caregiver_training_events(planned_date);
create index caregiver_training_events_actual_date_idx on public.caregiver_training_events(actual_date);

create table public.caregiver_training_participation_years (
  caregiver_training_participation_id uuid primary key default gen_random_uuid(),
  caregiver_pk uuid not null references public.caregivers(caregiver_pk) on delete restrict,
  child_pk uuid references public.children(child_pk) on delete restrict,
  child_name_source text,
  academic_year text not null,
  caregiver_type text,
  source_status text,
  program_source_label text not null,
  source_present_count integer,
  source_absent_count integer,
  source_total_count integer,
  source_attendance_percentage numeric,
  notes text,
  reason_for_absence text,
  validation_present integer,
  validation_check text,
  mark_issue boolean,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index caregiver_training_participation_years_caregiver_idx on public.caregiver_training_participation_years(caregiver_pk);
create index caregiver_training_participation_years_caregiver_year_idx on public.caregiver_training_participation_years(caregiver_pk, academic_year);
create index caregiver_training_participation_years_child_idx on public.caregiver_training_participation_years(child_pk) where child_pk is not null;

create table public.caregiver_training_participation_months (
  caregiver_training_month_id uuid primary key default gen_random_uuid(),
  caregiver_training_participation_id uuid not null references public.caregiver_training_participation_years(caregiver_training_participation_id) on delete restrict,
  month_label text not null,
  participation_code text,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict,
  unique (caregiver_training_participation_id, month_label)
);
create index caregiver_training_participation_months_parent_idx on public.caregiver_training_participation_months(caregiver_training_participation_id);

create table public.adl_assessments (
  adl_assessment_pk uuid primary key default gen_random_uuid(),
  adl_assessment_id text not null unique,
  child_pk uuid not null references public.children(child_pk) on delete restrict,
  academic_year text not null,
  goals_planned integer,
  goals_independent_score_4 integer,
  goals_supervision_score_3 integer,
  goals_limited_assistance_score_2 integer,
  goals_extensive_assistance_score_1 integer,
  goals_fully_dependent_score_0 integer,
  notes text,
  mark_issue boolean,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index adl_assessments_child_idx on public.adl_assessments(child_pk);
create index adl_assessments_child_year_idx on public.adl_assessments(child_pk, academic_year);

create table public.development_assessments (
  development_assessment_pk uuid primary key default gen_random_uuid(),
  development_assessment_id text not null unique,
  child_pk uuid not null references public.children(child_pk) on delete restrict,
  academic_year text not null,
  term text not null,
  domain_type text not null,
  goals_planned integer,
  goals_progressed integer,
  goals_slightly_progressed integer,
  goals_not_progressed integer,
  notes text,
  mark_issue boolean,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index development_assessments_child_idx on public.development_assessments(child_pk);
create index development_assessments_child_period_idx on public.development_assessments(child_pk, academic_year, term);
create index development_assessments_domain_idx on public.development_assessments(domain_type);

create table public.caregiver_outcome_assessments (
  caregiver_outcome_assessment_pk uuid primary key default gen_random_uuid(),
  caregiver_outcome_id text,
  child_pk uuid references public.children(child_pk) on delete restrict,
  caregiver_pk uuid references public.caregivers(caregiver_pk) on delete restrict,
  child_name_source text,
  centre_name text,
  program_source_label text,
  academic_year text,
  assessment_batch_no integer,
  assessment_date date,
  section_a_score numeric,
  section_b_score numeric,
  section_c_score numeric,
  section_d_score numeric,
  section_e_score numeric,
  section_f_score numeric,
  section_g_score numeric,
  total_score numeric,
  percentage numeric,
  overall_score_interpretation text,
  section_a_interpretation text,
  section_b_interpretation text,
  section_c_interpretation text,
  section_d_interpretation text,
  section_e_interpretation text,
  section_f_interpretation text,
  confidence numeric,
  parent_stress numeric,
  applying_therapy_strategies text,
  notes text,
  mark_issue boolean,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index caregiver_outcome_assessments_source_id_idx on public.caregiver_outcome_assessments(caregiver_outcome_id) where caregiver_outcome_id is not null;
create index caregiver_outcome_assessments_child_idx on public.caregiver_outcome_assessments(child_pk);
create index caregiver_outcome_assessments_caregiver_idx on public.caregiver_outcome_assessments(caregiver_pk);
create index caregiver_outcome_assessments_period_batch_idx on public.caregiver_outcome_assessments(academic_year, assessment_batch_no);

create table public.caregiver_outcome_responses (
  caregiver_outcome_response_id uuid primary key default gen_random_uuid(),
  caregiver_outcome_assessment_pk uuid not null references public.caregiver_outcome_assessments(caregiver_outcome_assessment_pk) on delete restrict,
  source_column_name text not null,
  section_label text,
  question_text text not null,
  numeric_response numeric,
  text_response text,
  source_record_id uuid not null references private.source_records(source_record_id) on delete restrict
);
create index caregiver_outcome_responses_assessment_idx on public.caregiver_outcome_responses(caregiver_outcome_assessment_pk);
create index caregiver_outcome_responses_section_idx on public.caregiver_outcome_responses(section_label);

alter table public.children enable row level security;
alter table public.child_program_periods enable row level security;
alter table public.caregivers enable row level security;
alter table public.caregiver_child_links enable row level security;
alter table public.child_attendance_months enable row level security;
alter table public.child_attendance_days enable row level security;
alter table public.caregiver_activity_months enable row level security;
alter table public.caregiver_activity_days enable row level security;
alter table public.caregiver_training_events enable row level security;
alter table public.caregiver_training_participation_years enable row level security;
alter table public.caregiver_training_participation_months enable row level security;
alter table public.adl_assessments enable row level security;
alter table public.development_assessments enable row level security;
alter table public.caregiver_outcome_assessments enable row level security;
alter table public.caregiver_outcome_responses enable row level security;

revoke all on table public.children, public.child_program_periods, public.caregivers,
  public.caregiver_child_links, public.child_attendance_months, public.child_attendance_days,
  public.caregiver_activity_months, public.caregiver_activity_days, public.caregiver_training_events,
  public.caregiver_training_participation_years, public.caregiver_training_participation_months,
  public.adl_assessments, public.development_assessments, public.caregiver_outcome_assessments,
  public.caregiver_outcome_responses
from anon, authenticated;
