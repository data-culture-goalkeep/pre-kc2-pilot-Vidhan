# Phase 1 Data Model / ERD

Project: Kickstarter Tamahar  
Supabase target: `pre-kc2-pilot-Vidhan`

```mermaid
erDiagram
  MIGRATION_RUNS ||--o{ SOURCE_RECORDS : contains
  MIGRATION_RUNS ||--o{ MIGRATION_FAILURES : logs
  SOURCE_RECORDS o|--o{ MIGRATION_FAILURES : may_fail

  CHILDREN ||--o{ CHILD_PROGRAM_PERIODS : has
  CHILDREN ||--o{ CAREGIVER_CHILD_LINKS : linked_to
  CAREGIVERS ||--o{ CAREGIVER_CHILD_LINKS : linked_to

  CHILDREN ||--o{ CHILD_ATTENDANCE_MONTHS : has
  CHILD_ATTENDANCE_MONTHS ||--o{ CHILD_ATTENDANCE_DAYS : contains

  CAREGIVERS ||--o{ CAREGIVER_ACTIVITY_MONTHS : has
  CAREGIVER_ACTIVITY_MONTHS ||--o{ CAREGIVER_ACTIVITY_DAYS : contains

  CAREGIVERS ||--o{ CAREGIVER_TRAINING_PARTICIPATION_YEARS : has
  CAREGIVER_TRAINING_PARTICIPATION_YEARS ||--o{ CAREGIVER_TRAINING_PARTICIPATION_MONTHS : contains

  CHILDREN ||--o{ ADL_ASSESSMENTS : has
  CHILDREN ||--o{ DEVELOPMENT_ASSESSMENTS : has

  CHILDREN o|--o{ CAREGIVER_OUTCOME_ASSESSMENTS : assessed_for
  CAREGIVERS o|--o{ CAREGIVER_OUTCOME_ASSESSMENTS : responds
  CAREGIVER_OUTCOME_ASSESSMENTS ||--o{ CAREGIVER_OUTCOME_RESPONSES : contains
```

## Tables

### public
- children
- child_program_periods
- caregivers
- caregiver_child_links
- child_attendance_months
- child_attendance_days
- caregiver_activity_months
- caregiver_activity_days
- caregiver_training_events
- caregiver_training_participation_years
- caregiver_training_participation_months
- adl_assessments
- development_assessments
- caregiver_outcome_assessments
- caregiver_outcome_responses

### private
- migration_runs
- source_records
- migration_failures

## Design decisions
- Internal UUID primary keys are used while original source IDs remain preserved.
- Programme and centre values remain source text because the source does not provide authoritative master tables.
- Daily attendance is normalized from day-number columns into child/caregiver day rows.
- Caregiver outcome question responses are normalized into response rows.
- Source-derived totals and QA fields are retained where modeled.
- Source lineage is mandatory for migrated business records.
- Business values remain text rather than PostgreSQL enums where source semantics are not authoritative.
- Hidden legacy attendance sources are retained for lineage/failure reporting rather than automatically merged into current attendance.
