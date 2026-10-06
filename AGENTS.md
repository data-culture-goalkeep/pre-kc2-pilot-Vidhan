# AGENTS.md

## Project
Kickstarter Tamahar / KC-2 Pilot Project - Vidhan

## Phase
Phase 1 only: data model, PostgreSQL/Supabase schema, sanitized data migration, validation, and PM handover.

## Targets
- GitHub: data-culture-goalkeep/pre-kc2-pilot-Vidhan
- Supabase: pre-kc2-pilot-Vidhan
- Supabase project ref: fclinhmjjtpfikyqmssz

## Architecture
- public schema: Phase 1 business/source-derived tables.
- private schema: migration runs, source lineage, and migration failures.
- Every migrated business row references private.source_records.
- Raw sanitized source rows are preserved in private.source_records.raw_row.
- RLS is enabled on public tables; Phase 2 client policies are intentionally not defined.

## Conventions
- Keep all schema changes reproducible under supabase/migrations/.
- Never store service-role keys, database passwords, access tokens, or other secrets in Git.
- Preserve original source identifiers and source labels.
- Do not silently normalize unresolved source semantics.
- Do not silently drop failed records; write failures to private.migration_failures.
- Treat null and zero distinctly.
- Phase 2/frontend work is out of scope.

## Source workbooks
- Updated_Children_Caregivers_Assessments_Tamahar
- Updated_Student_Session_Attendance_Tamahar

## Known source issues
- Caregiver rows CAGV799 onward contain an anomalous repeated pattern and are not trusted for automatic migration.
- Caregiver activity/training sheets use Child ID = NA.
- Hidden legacy attendance sheets Copy of FA and Inverse can overlap current attendance and are excluded from automatic business migration; their records must remain traceable.
- Attendance/program terminology contains historic/inconsistent labels.
- Source QA/derived fields are preserved where modeled.

## Useful Supabase commands
Use the installed Supabase CLI version's --help before relying on command flags.

- supabase --version
- supabase migration list --local
- supabase db reset
- supabase db push

## Key files
- supabase/migrations/: reproducible schema changes
- supabase/seed.sql: intentionally contains no fabricated business data
- docs/phase1-data-model.md: approved Phase 1 model / ERD
- docs/phase1-handover.md: final Phase 1 handover
