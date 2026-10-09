# Tamahar Programme Workspace — Phase 2 frontend

This directory contains the Phase 2 frontend for the existing Tamahar Phase 1 Supabase backend.

## Stack

The PM reference export is intentionally preserved as a buildless static application:

- HTML + inline CSS
- browser JavaScript
- local PNG brand asset
- Supabase Data API over `fetch`
- no npm packages, framework, bundler, CDN, or lockfile

Introducing React/shadcn would be a stack rewrite and is not required by the supplied frontend source.

## Source layout

- `dist/index.html` — application shell and reference visual styling
- `dist/app.js` — screens, navigation, rendering, filters, charts, read-only views
- `dist/backend.js` — Phase 1 Supabase adapter and source-to-UI transformation
- `dist/config.js` — safe committed defaults only
- `dist/runtime-config.js` — generated deployment config; gitignored
- `dist/tamahar-logo.png` — supplied brand asset
- `scripts/render_runtime_config.py` — generates browser config from environment variables
- `tests/backend-adapter.test.js` — adapter transformation/security tests

## Configure

Use the existing Phase 1 project only. Do not create another database.

Required deployment environment variables:

```text
SUPABASE_URL=https://fclinhmjjtpfikyqmssz.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key from existing project>
```

Generate the browser runtime configuration:

```sh
python3 frontend/scripts/render_runtime_config.py
```

`SUPABASE_PUBLISHABLE_KEY` is designed for public clients, but a Supabase secret/service-role key must never be used here. The renderer rejects modern `sb_secret_...` keys, and `backend.js` also rejects secret/service-role keys before making requests.

## Run locally

```sh
python3 -m http.server 8000 --directory frontend/dist
```

Then open `http://localhost:8000`.

Without `runtime-config.js`, the UI loads safely and reports that backend client access is pending rather than falling back to synthetic data.

For a future approved authentication flow, `backend.js` reads the access token only from a runtime provider function `window.TamaharAuth.getAccessToken()`. No user access token should be written into `config.js` or `runtime-config.js`.

## Current integration scope

Connected to existing Phase 1 tables:

- `public.children`
- `public.child_attendance_months`
- `public.child_attendance_days`
- `public.adl_assessments`
- `public.development_assessments`

The frontend is deliberately **read-only** until the Phase 2 authorization/write model is approved. It does not query the `private` migration/audit schema and does not create or alter Phase 1 records.

See `../docs/phase2-frontend-backend-mapping.md` and `../docs/phase2-security-and-deployment.md` for the exact mapping and production-readiness requirements.
