# Phase 2 security and deployment readiness

## Existing backend

Use the existing Supabase project:

- Project: `pre-kc2-pilot-Vidhan`
- Project ref: `fclinhmjjtpfikyqmssz`
- API URL: `https://fclinhmjjtpfikyqmssz.supabase.co`

Do not create a second Supabase project.

## Browser credentials

The frontend may use only the Supabase **publishable** key. Never use a secret/service-role key in browser code, static files, chat messages, or committed repository content.

Runtime browser configuration is generated from environment variables using:

```sh
python3 frontend/scripts/render_runtime_config.py
```

`frontend/dist/runtime-config.js` is gitignored.

## Current client-access blocker

At Phase 2 inspection time:

- all 15 public business tables have RLS enabled;
- five tables have authenticated read policies (`children`, `child_attendance_months`, `child_attendance_days`, `adl_assessments`, `development_assessments`);
- the remaining public tables do not yet have client policies;
- `anon` and `authenticated` do **not** currently have explicit `SELECT` table privileges on the public business tables;
- Supabase Auth currently has no application users.

Therefore, the source integration is complete but a normal browser cannot yet read production records. This is intentional until the project owner approves the authentication/authorization setup.

Do not solve this by granting anonymous/public access to child/caregiver data.

## Authorization requirements before real-data deployment

A production rollout needs an approved decision covering:

1. authentication method for Tamahar staff;
2. staff roles and who provisions users;
3. role/programme/child scope stored in trusted `app_metadata` (not user-editable metadata);
4. least-privilege Data API grants;
5. matching RLS policies for every table exposed to the frontend;
6. whether the application remains read-only or needs writes;
7. if writes are needed, approved validation/audit/source-lineage behavior.

The existing `children` RLS policy already references Tamahar role/scope values in `app_metadata`, but there are currently no Auth users carrying that metadata.

## Private migration/audit schema

The frontend must not query `private.migration_runs`, `private.source_records`, or `private.migration_failures`.

Supabase currently reports RLS disabled on these three private tables. They currently have no normal frontend role grants in the inspected setup, but this should still be reviewed as defense in depth before production. The Phase 2 frontend branch does not alter this schema.

Potential hardening SQL, **only after project-owner review of private-schema access requirements**:

```sql
ALTER TABLE "private"."migration_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."source_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."migration_failures" ENABLE ROW LEVEL SECURITY;
```

Do not apply this blindly: enabling RLS without appropriate internal policies can block legitimate audit/migration workflows.

## Deployment verification

Before publishing the production site:

- generate `runtime-config.js` from deployment environment variables;
- authenticate with a test user provisioned through the approved flow;
- verify the test user sees only its intended programmes/children;
- verify unauthenticated access returns no child/caregiver records;
- inspect browser network requests for accidental secrets;
- verify no `service_role`, `sb_secret_`, database password, or DB URL is present in static assets;
- exercise all five navigation areas and month/programme filtering;
- verify unsupported write forms remain disabled/read-only until approved;
- run Supabase Security Advisor after any RLS/grant changes.
