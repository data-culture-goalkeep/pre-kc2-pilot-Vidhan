# Final production acceptance — Tamahar Programme Workspace

**Date:** 21 October 2026 (Asia/Kolkata)  
**Release baseline:** `b5539d3981a1c6b183bf5711f152495e5dae5a7d`  
**Production:** https://pre-kc2-pilot-vidhan.vercel.app  
**Deployment:** https://vercel.com/kc-3/pre-kc2-pilot-vidhan/EjCZYoSLN79BurGanPYC3R2Xgeib  
**Acceptance:** The project owner explicitly confirmed the live application and the latest attendance/date improvements are working correctly on 21 October 2026. **The accepted release is complete for the agreed pilot scope.**

## Delivered

- Phase 1 imported records retained as an immutable source baseline with provenance.
- Phase 2 authenticated, RLS-protected read access to children, programme work, attendance and assessments.
- Phase 3 controlled programme and therapy attendance entry, corrections, duplicate prevention, correction reasons and private audit/revision history.
- Selected-row programme attendance saving with per-row outcome reporting and verification after reload.
- India programme-local current-date default, explicit Today action and manual date persistence on refresh.
- Child/student KPI cards and visual programme/status summaries; full code inventory: [frontend visual inventory](frontend-visual-inventory-20261021.md).
- No arbitrary production testing entries or modifications to imported Phase 1 records were necessary for final closure.

## Verified release gates

- PR #6 merged: https://github.com/data-culture-goalkeep/pre-kc2-pilot-Vidhan/pull/6
- PR #7 merged: https://github.com/data-culture-goalkeep/pre-kc2-pilot-Vidhan/pull/7
- Frontend and synthetic UI regression workflow passed: https://github.com/data-culture-goalkeep/pre-kc2-pilot-Vidhan/actions/runs/39570358131
- Local Supabase integration/security workflow passed: https://github.com/data-culture-goalkeep/pre-kc2-pilot-Vidhan/actions/runs/39570358065
- Vercel GitHub deployment status `success` for the accepted release SHA.
- Production browser acceptance confirmed by the user; not independently re-run from an authenticated assistant browser.

## Attendance interpretation

`present = P + PwC`; `absent = A`; `total = P + PwC + A`. `H`, `NS` and blanks are excluded. Percentage = `100 * present / total` when total > 0. Effective operational overrides are shown in the UI without changing immutable imported monthly totals.

## Scope boundaries / non-blocking future work

The pilot does **not** implement direct child-master editing, programme reassignment, ADL/development writes, goals, behaviour or parent-session persistence. Detailed audit history stays private. Therapy batch entry remains individual. A selection-batch is not a single atomic transaction; partial writes are reported. These are known documented scope limits, not unresolved blockers to the accepted attendance pilot.

Future operational administration can review Supabase performance advisors and compromised-password protection, and provision/test non-administrator roles as staff are onboarded. No further production code, data migration or paid resources are required for this release closure.

## Hand-off links

- [Application](https://pre-kc2-pilot-vidhan.vercel.app)
- [Repository](https://github.com/data-culture-goalkeep/pre-kc2-pilot-Vidhan)
- [Supabase project](https://supabase.com/dashboard/project/fclinhmjjtpfikyqmssz)
- [Phase 1 handover](phase1-handover.md)
- [Phase 3 foundation and security model](phase3-write-foundation.md)
- [Complete visual inventory](frontend-visual-inventory-20261021.md)
