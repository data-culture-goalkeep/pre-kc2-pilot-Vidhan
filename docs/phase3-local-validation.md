# Phase 3A/3B local validation

Status: **PASS** on GitHub Actions using an ephemeral local Supabase stack and synthetic fixtures only.

No hosted Supabase branch/project was created. The production attendance schema was later deployed through the version-controlled migration; local validation continues to use synthetic data only.

## Requirements for a developer workstation

To run the same validation locally:

- Git
- Docker Engine / Docker Desktop
- Supabase CLI
- Node.js 22+ (for existing frontend regression tests)
- Python 3 (for runtime-config regression tests)
- `psql` client, or use the one available in the Supabase/Postgres tooling environment

No Supabase cloud access token, production database password, service-role key, or production child data is required.

## Commands used by CI

```bash
supabase init
supabase start

export DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'

supabase db reset --local

psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/phase3_proposals/001_operational_attendance_foundation.sql

psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/phase3_proposals/004_local_synthetic_fixture.sql

psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/phase3_proposals/005_local_security_assertions.sql

node frontend/tests/phase3-local-write-integration.test.js

psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/phase3_proposals/003_operational_attendance_rollback.sql

test "$(psql "$DB_URL" -Atc \
  "select to_regclass('public.operational_attendance_entries') is null")" = "t"

test "$(psql "$DB_URL" -Atc \
  "select to_regclass('private.operational_attendance_entry_history') is null")" = "t"

node --check frontend/dist/auth.js
node --check frontend/dist/backend.js
node --check frontend/dist/app.js
node frontend/tests/auth-client.test.js
node frontend/tests/frontend-assembly.test.js
node frontend/tests/backend-adapter.test.js
python3 frontend/tests/runtime-config.test.py

supabase stop --no-backup
```

## Synthetic fixtures

The fixture file creates only synthetic records:

- `SYN-EI-1`
- `SYN-FA-1`
- `SYN-PV-1`
- one synthetic imported EI attendance baseline row

It does not contain or copy any real child identifier or production record.

## Security cases exercised

The local suite verifies:

- administrator programme-attendance INSERT succeeds;
- administrator therapy INSERT succeeds;
- authorized UPDATE succeeds and increments revision;
- duplicate logical submission is rejected;
- child/date/source/activity identity cannot be reassigned by UPDATE;
- EI programme manager can write EI programme attendance;
- EI programme manager cannot write FA attendance;
- programme manager cannot write therapy;
- teacher can write scoped programme attendance;
- teacher cannot write therapy;
- therapist can write scoped therapy attendance;
- therapist cannot write classroom/programme attendance;
- disabled Tamahar user cannot read or write operational rows;
- GC-MNH writes remain denied;
- unsupported attendance codes are rejected;
- baseline correction linkage is inferred server-side and validated against the same child/date/source;
- browser clients cannot read or supply the internal baseline source-row UUID;
- imported Phase 1 attendance/source lineage remains unchanged;
- audit history records both INSERT and UPDATE;
- audit actor equals `auth.uid()`;
- rollback removes Phase 3 operational tables from the local database;
- the frontend REST adapter performs programme insert/correction/reload and therapy insert/reload against local Supabase;
- out-of-scope REST writes are rejected;
- all existing Phase 2 frontend regression tests still pass.

## CI result

The current branch is validated by the GitHub Actions workflow `Phase 3 local Supabase validation`. The workflow is intentionally tied to the current commit and should be used as the authoritative result rather than retaining a stale historical run ID in this document.

## Limitation

This validates PostgreSQL/Supabase schema, grants, RLS, trigger behavior, synthetic write flows, rollback, and existing frontend regressions.

It does **not** provide a hosted isolated Supabase endpoint for a Vercel Preview. Under the zero-cost constraint, hosted Phase 3 write integration testing is intentionally skipped rather than pointing a write-enabled frontend at production.

Production now uses the controlled operational attendance model under RLS. Imported Phase 1 source rows remain read-only.
