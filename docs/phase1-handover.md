# Kickstarter Tamahar — Phase 1 Handover

## 1. Phase context

**Organisation:** Tamahar  
**Role:** Analyst  
**Scope:** Phase 1 only — Data Model and Database  
**GitHub:** `data-culture-goalkeep/pre-kc2-pilot-Vidhan`  
**Supabase:** `pre-kc2-pilot-Vidhan`  
**Supabase project ref:** `fclinhmjjtpfikyqmssz`

Phase 1 covers source analysis, data modelling, database implementation, sanitized-data migration, source lineage, failure logging, verification, and handover. No frontend/Vercel/Phase 2 implementation is included.

## 2. Source inputs

### Updated_Children_Caregivers_Assessments_Tamahar
- Children
- Caregivers
- ADL Assessment
- Development Assessment
- Caregiver Outcome Assessment

### Updated_Student_Session_Attendance_Tamahar
- Read Me
- Child_Mapping (empty)
- Caregiver_Mapping (empty)
- GC-EI
- Copy of FA (hidden legacy)
- GC-Nursery
- GC-FA
- GC-MNH
- GC-PVSW
- TH-ST
- TH-PT
- TH-OT
- TH-VT
- Cag-Sg
- Cag-Individual Counseling
- Cag-Tr-Pn
- Cag-Tr
- Inverse (hidden legacy)

See `docs/phase1-source-mapping.md` for the source-to-target mapping.

## 3. Final data model

The model uses two schemas:

- **public** — business/source-derived Phase 1 tables.
- **private** — migration lineage and failure/audit tables.

### Public tables
1. children
2. child_program_periods
3. caregivers
4. caregiver_child_links
5. child_attendance_months
6. child_attendance_days
7. caregiver_activity_months
8. caregiver_activity_days
9. caregiver_training_events
10. caregiver_training_participation_years
11. caregiver_training_participation_months
12. adl_assessments
13. development_assessments
14. caregiver_outcome_assessments
15. caregiver_outcome_responses

### Private tables
16. migration_runs
17. source_records
18. migration_failures

The ERD is documented in `docs/phase1-data-model.md`.

## 4. Table structures

### private.migration_runs
- `migration_run_id uuid PK default gen_random_uuid()`
- `started_at timestamptz not null default now()`
- `completed_at timestamptz null`
- `status text not null`
- `notes text null`
- Check: status is one of running/completed/completed_with_failures/failed.

### private.source_records
- `source_record_id uuid PK`
- `migration_run_id uuid FK -> migration_runs`
- `source_workbook text`
- `source_file_id text null`
- `source_sheet text`
- `source_row_number integer`
- `source_record_key text null`
- `upstream_source_url text null`
- `raw_row jsonb`
- `created_at timestamptz`
- Unique: migration_run_id + source_workbook + source_sheet + source_row_number.

### private.migration_failures
- `migration_failure_id uuid PK`
- `migration_run_id uuid FK -> migration_runs`
- `source_record_id uuid null FK -> source_records`
- `source_workbook text`
- `source_sheet text`
- `source_row_number integer null`
- `source_record_key text null`
- `failure_reason text`
- `failure_category text null`
- `raw_value_context jsonb null`
- `created_at timestamptz`

### public.children
- `child_pk uuid PK`
- `child_id text not null unique`
- `child_name text not null`
- `centre_name text null`
- `gender text null`
- `date_of_birth date null`
- `enrollment_date date null`
- `annual_income numeric null`
- `annual_income_bucket text null`
- `income_category text null`
- `status text not null`
- `disability_type text null`
- `disability_sub_type text null`
- `severity text null`
- `developmental_age_at_intake text null`
- `current_program_source text null`
- `exit_date date null`
- `exit_reason text null`
- `exit_theme_shortened text null`
- `exit_theme text null`
- `notes text null`
- `error_validation text null`
- `mark_issue boolean null`
- `source_record_id uuid not null FK -> private.source_records`

### public.child_program_periods
- `child_program_period_id uuid PK`
- `child_pk uuid FK -> children`
- `source_program_label text`
- `start_term text null`
- `end_term text null`
- `source_record_id uuid FK -> source_records`

### public.caregivers
- `caregiver_pk uuid PK`
- `caregiver_id text not null`
- `caregiver_name text not null`
- `status text null`
- `employment_status text null`
- `education_level text null`
- `notes text null`
- `mark_issue boolean null`
- `source_record_id uuid FK -> source_records`

### public.caregiver_child_links
- `caregiver_child_link_id uuid PK`
- `caregiver_pk uuid FK -> caregivers`
- `child_pk uuid FK -> children`
- `caregiver_type text null`
- `primary_caregiver boolean null`
- `parental_involvement boolean null`
- `child_status_raw text null`
- `source_record_id uuid FK -> source_records`

### public.child_attendance_months
- `child_attendance_month_id uuid PK`
- `child_pk uuid FK -> children`
- `academic_year text`
- `month_label text`
- `source_status text null`
- `program_source_label text`
- `program_subtype_batch text null`
- `source_pwc_count integer null`
- `source_present_count integer null`
- `source_absent_count integer null`
- `source_total_count integer null`
- `source_attendance_percentage numeric null`
- `notes text null`
- `reason_for_absence text null`
- `validation_present integer null`
- `validation_absent integer null`
- `validation_total integer null`
- `validation_check text null`
- `mark_issue boolean null`
- `source_record_id uuid FK -> source_records`

### public.child_attendance_days
- `child_attendance_day_id uuid PK`
- `child_attendance_month_id uuid FK -> child_attendance_months`
- `day_of_month smallint`
- `attendance_code text null`
- `source_record_id uuid FK -> source_records`
- Unique monthly-record + day.
- Check day between 1 and 31.

### public.caregiver_activity_months
- `caregiver_activity_month_id uuid PK`
- `caregiver_pk uuid FK -> caregivers`
- `child_pk uuid null FK -> children`
- `child_name_source text null`
- `academic_year text`
- `month_label text`
- `source_status text null`
- `activity_source_label text`
- `source_present_count integer null`
- `source_absent_count integer null`
- `source_total_count integer null`
- `source_attendance_percentage numeric null`
- `notes text null`
- `reason_for_absence text null`
- `mark_issue boolean null`
- `unidentified_column_raw text null`
- `source_record_id uuid FK -> source_records`

### public.caregiver_activity_days
- `caregiver_activity_day_id uuid PK`
- `caregiver_activity_month_id uuid FK -> caregiver_activity_months`
- `day_of_month smallint`
- `attendance_code text null`
- `source_record_id uuid FK -> source_records`
- Unique monthly-record + day.
- Check day between 1 and 31.

### public.caregiver_training_events
- `caregiver_training_event_pk uuid PK`
- `training_id text unique`
- `training_name text`
- `academic_year text`
- `month_label text`
- `planned_date date null`
- `actual_date date null`
- `program_specific_raw text null`
- `planned_attendance integer null`
- `actual_attendance integer null`
- `source_record_id uuid FK -> source_records`

### public.caregiver_training_participation_years
- `caregiver_training_participation_id uuid PK`
- `caregiver_pk uuid FK -> caregivers`
- `child_pk uuid null FK -> children`
- `child_name_source text null`
- `academic_year text`
- `caregiver_type text null`
- `source_status text null`
- `program_source_label text`
- `source_present_count integer null`
- `source_absent_count integer null`
- `source_total_count integer null`
- `source_attendance_percentage numeric null`
- `notes text null`
- `reason_for_absence text null`
- `validation_present integer null`
- `validation_check text null`
- `mark_issue boolean null`
- `source_record_id uuid FK -> source_records`

### public.caregiver_training_participation_months
- `caregiver_training_month_id uuid PK`
- `caregiver_training_participation_id uuid FK -> caregiver_training_participation_years`
- `month_label text`
- `participation_code text null`
- `source_record_id uuid FK -> source_records`
- Unique participation-record + month.

### public.adl_assessments
- `adl_assessment_pk uuid PK`
- `adl_assessment_id text unique`
- `child_pk uuid FK -> children`
- `academic_year text`
- `goals_planned integer null`
- `goals_independent_score_4 integer null`
- `goals_supervision_score_3 integer null`
- `goals_limited_assistance_score_2 integer null`
- `goals_extensive_assistance_score_1 integer null`
- `goals_fully_dependent_score_0 integer null`
- `notes text null`
- `mark_issue boolean null`
- `source_record_id uuid FK -> source_records`

### public.development_assessments
- `development_assessment_pk uuid PK`
- `development_assessment_id text unique`
- `child_pk uuid FK -> children`
- `academic_year text`
- `term text`
- `domain_type text`
- `goals_planned integer null`
- `goals_progressed integer null`
- `goals_slightly_progressed integer null`
- `goals_not_progressed integer null`
- `notes text null`
- `mark_issue boolean null`
- `source_record_id uuid FK -> source_records`

### public.caregiver_outcome_assessments
- `caregiver_outcome_assessment_pk uuid PK`
- `caregiver_outcome_id text null`
- `child_pk uuid null FK -> children`
- `caregiver_pk uuid null FK -> caregivers`
- `child_name_source text null`
- `centre_name text null`
- `program_source_label text null`
- `academic_year text null`
- `assessment_batch_no integer null`
- `assessment_date date null`
- `section_a_score numeric null`
- `section_b_score numeric null`
- `section_c_score numeric null`
- `section_d_score numeric null`
- `section_e_score numeric null`
- `section_f_score numeric null`
- `section_g_score numeric null`
- `total_score numeric null`
- `percentage numeric null`
- `overall_score_interpretation text null`
- `section_a_interpretation text null`
- `section_b_interpretation text null`
- `section_c_interpretation text null`
- `section_d_interpretation text null`
- `section_e_interpretation text null`
- `section_f_interpretation text null`
- `confidence numeric null`
- `parent_stress numeric null`
- `applying_therapy_strategies text null`
- `notes text null`
- `mark_issue boolean null`
- `source_record_id uuid FK -> source_records`

### public.caregiver_outcome_responses
- `caregiver_outcome_response_id uuid PK`
- `caregiver_outcome_assessment_pk uuid FK -> caregiver_outcome_assessments`
- `source_column_name text`
- `section_label text null`
- `question_text text`
- `numeric_response numeric null`
- `text_response text null`
- `source_record_id uuid FK -> source_records`

## 5. Controlled values and approved-for-now semantics

No business PostgreSQL enums were introduced. Source values remain text so the Phase 1 database does not overstate source certainty.

Observed values include:
- child/caregiver status: Active, Exited, Expired
- attendance: P, A, H, NS, PwC, blank
- caregiver training: A, NS, P1/P2/P4 and related numbered P codes
- development term: Term 1, Term 2
- development domains: Cognition, Cognition/ Communication, Communication, Fine Motor, Gross Motor, Personal Social
- severity: Mild, Moderate, Severe
- income category: 1.BPL, 2.Low, 3.Mid, 4.High

The previously reviewed ambiguities are treated as approved-for-now source semantics. They were preserved rather than converted into stricter business rules.

## 6. Source tracking

Every migrated business row carries a non-null `source_record_id` pointing to `private.source_records`.

The source-record table preserves:
- source workbook
- Drive file ID
- source sheet
- source row number
- source key where available
- upstream source URL where available
- the complete sanitized source row in JSONB

This allows target records to be traced back to their sanitized source representation.

## 7. Migration run

Migration run ID:

`11111111-1111-4111-8111-202610060001`

Status:

`completed_with_failures`

All non-migrated rows covered by the migration scope were logged; no failed record was intentionally dropped without a failure/exclusion entry.

## 8. Migration results

### Master / assessment sources

| Source sheet | Source rows | Migrated primary rows | Failed/excluded |
|---|---:|---:|---:|
| Children | 413 | 413 children | 0 |
| Caregivers | 2,716 | 798 caregivers + 798 links | 1,918 |
| ADL Assessment | 120 | 120 | 0 |
| Development Assessment | 2,508 | 2,508 | 0 |
| Caregiver Outcome Assessment | 213 | 212 assessments | 1 |

Successful caregiver-outcome assessments generated **6,572 normalized question-response rows**.

Children generated **517 child programme-period rows** from populated EI/Nursery/FA/PV/SW start/end fields.

### Child attendance sources

| Source sheet | Source rows | Migrated monthly rows | Failed |
|---|---:|---:|---:|
| GC-EI | 559 | 559 | 0 |
| GC-Nursery | 188 | 188 | 0 |
| GC-FA | 327 | 327 | 0 |
| GC-MNH | 283 | 283 | 0 |
| GC-PVSW | 502 | 502 | 0 |
| TH-ST | 448 | 448 | 0 |
| TH-PT | 428 | 427 | 1 |
| TH-OT | 171 | 171 | 0 |
| TH-VT | 190 | 190 | 0 |

Total child monthly attendance rows: **3,095**.  
Each successful monthly row generated 31 normalized day rows: **95,945 child attendance day rows**.

### Caregiver activities and training

| Source sheet | Source rows | Migrated rows | Failed |
|---|---:|---:|---:|
| Cag-Sg | 1,623 | 1,623 monthly activity rows | 0 |
| Cag-Individual Counseling | 1,350 | 1,350 monthly activity rows | 0 |
| Cag-Tr-Pn | 17 | 17 training events | 0 |
| Cag-Tr | 292 | 292 annual participation rows | 0 |

Caregiver activities generated **92,163 day rows** (2,973 × 31).  
Caregiver training participation generated **3,504 month rows** (292 × 12).

### Legacy/excluded sources

| Source sheet | Source rows logged | Business rows migrated | Failure/exclusion log |
|---|---:|---:|---:|
| Copy of FA | 40 | 0 | 40 |
| Inverse | 294 | 0 | 294 |

These hidden sheets were deliberately not merged into business attendance because they overlap current attendance structures and present duplicate/sanitization risk. Their source rows and exclusion reasons are still traceable.

## 9. Failure log

Total failure/exclusion entries: **2,254**.

Breakdown:
- Caregivers rows 800-2717: **1,918** — anomalous rows missing Child Id / repeated placeholder pattern.
- Caregiver Outcome Assessment row 108: **1** — missing Child Id and Caregiver ID; unable to link.
- TH-PT row 69: **1** — Child BG123038, July, TH-PT; Academic Year blank.
- Copy of FA rows 2-41: **40** — excluded hidden legacy source.
- Inverse populated rows 2-296: **294** — excluded hidden transposed legacy source.

The complete row-level log remains in `private.migration_failures`. See `docs/phase1-migration-failures.md`.

## 10. Database verification

Verified in Supabase:
- 15 public business tables exist.
- 3 private migration/audit tables exist.
- all 15 public tables have RLS enabled.
- no orphan rows were found in tested child attendance, caregiver links, ADL, development, child-day, or caregiver-day FK relationships.
- all migration failures are explicitly recorded.
- source-record lineage contains **12,682** source records.
- source-record FK covering indexes were added after Supabase advisor review.

### Supabase advisor status

Security advisor currently reports informational `RLS enabled, no policy` notices on the 15 public tables. This is intentional for Phase 1: RLS is enabled and no frontend access policy has been invented.

Performance advisor reports unused-index notices because the schema is newly created. The earlier unindexed-foreign-key findings for source-record references were corrected by migration `20261006055922_phase1_source_record_fk_indexes.sql`.

## 11. Database migrations

Repository migrations:
- `supabase/migrations/20261006054842_phase1_schema.sql`
- `supabase/migrations/20261006055922_phase1_source_record_fk_indexes.sql`

These versions match the Supabase migration history.

`supabase/seed.sql` intentionally contains no fabricated business data. Sanitized source data is loaded through the controlled source-migration workflow.

## 12. Repository structure

Key Phase 1 files:

- `README.md`
- `AGENTS.md`
- `.env.example`
- `supabase/migrations/20261006054842_phase1_schema.sql`
- `supabase/migrations/20261006055922_phase1_source_record_fk_indexes.sql`
- `supabase/seed.sql`
- `docs/phase1-data-model.md`
- `docs/phase1-source-mapping.md`
- `docs/phase1-migration-failures.md`
- `docs/phase1-handover.md`
- `scripts/phase1_verify.sql`

No credentials or service-role secrets are stored in the repository.

## 13. Important technical decisions

1. UUID internal primary keys are used while source IDs are retained.
2. Programme and centre values are preserved as source text rather than forced into unvalidated master tables.
3. Child attendance is normalized from monthly wide rows into month + day tables.
4. Caregiver activity attendance is similarly normalized.
5. Caregiver training Jun-May values are normalized to month rows.
6. Caregiver-outcome questionnaire responses are normalized to response rows, while assessment summaries remain on the assessment header.
7. Caregiver identity is separated from caregiver-child linkage.
8. Raw sanitized source rows are preserved in JSONB for auditability.
9. Failed/unmapped records are logged explicitly.
10. Source-calculated QA fields are retained where they are useful for audit/comparison.
11. No Phase 2 access-control policy or frontend business rule has been invented.

## 14. Known issues / approved-for-now assumptions

The following source characteristics remain important even though they were approved to proceed for Phase 1:
- attendance values NS and PwC are stored unchanged;
- caregiver training P-number codes are stored unchanged;
- programme naming remains source-specific;
- `Expired` remains a source status;
- disability labels remain source text;
- blank and zero assessment values remain distinct;
- caregiver activity/training child linkage remains null where source Child ID is NA;
- legacy hidden attendance is not merged into current attendance;
- `child_status_raw` preserves the questionable Caregivers source field without reinterpreting it.

These should be revisited only if Phase 2 reporting or business workflows require canonical semantics.

## 15. Final consistency check

The following chain was compared:

source analysis → approved source model → ERD → SQL migrations → Supabase schema → migrated data → handover.

Result:
- model tables match the implemented 18-table database;
- migration filenames now match Supabase migration history;
- source-lineage fields are implemented and populated;
- source-to-target counts reconcile to successful rows plus logged failures/exclusions;
- tested FK relationships contain no orphans;
- the two known transactional failures are explicitly logged;
- anomalous caregiver and legacy-source blocks are explicitly logged rather than hidden;
- no unresolved schema discrepancy remains at Phase 1 handover.

## 16. PM / Phase 2 readiness notes

The Phase 1 database is populated and traceable, but Phase 2 should not assume client access is enabled. The public tables currently have RLS enabled with no client policies. Frontend authorization, API exposure, and UX decisions belong to the next phase.

Before frontend work starts, the PM/team should read:
1. `docs/phase1-data-model.md`
2. `docs/phase1-source-mapping.md`
3. `docs/phase1-migration-failures.md`
4. this handover
5. the two SQL migration files
