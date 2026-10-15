-- Phase 3A SECURITY TEST PLAN (proposal; run only on isolated staging).
-- The test harness should execute each block in a transaction and roll it back.

-- Required fixtures (synthetic only):
-- 1. one EI child, one FA child, one PV child;
-- 2. test JWT contexts for administrator, management,
--    EI programme_manager, EI teacher, one-child teacher, therapist,
--    disabled user, and unrelated programme_manager;
-- 3. no fixture may reuse a real production child identifier.

-- A. Administrator
-- - INSERT programme attendance for each synthetic child -> allowed.
-- - INSERT therapy attendance -> allowed.
-- - UPDATE attendance_code/reason/notes -> allowed.
-- - second INSERT with same child/date/source -> unique violation.
-- - UPDATE child_pk/date/source/activity_type -> rejected by trigger.
-- - DELETE -> permission denied.

-- B. Programme manager scoped to EI
-- - EI child + GC-EI -> allowed.
-- - FA child + GC-FA -> denied by child RLS.
-- - therapy row -> denied.
-- - attempt to update an EI row so it moves to another child/source -> rejected.

-- C. Teacher scoped to EI
-- - EI programme attendance -> allowed.
-- - TH-* therapy attendance -> denied.
-- - FA child -> denied.
-- - teacher with explicit child_id exception may write programme attendance
--   only when the source label still agrees with that child's current programme.

-- D. Therapist scoped to EI / child
-- - TH-* row for visible child -> allowed.
-- - GC-* programme row -> denied.
-- - out-of-scope child -> denied.

-- E. Disabled / missing-claim user
-- - SELECT/INSERT/UPDATE -> zero/denied as appropriate.

-- F. Provenance
-- - Source tables remain byte-for-byte unchanged after all operational writes.
-- - source_record_id values on imported rows remain unchanged.
-- - operational rows contain no fabricated source_record_id.
-- - every INSERT/UPDATE produces exactly one immutable history row.
-- - history actor_id equals auth.uid().
-- - revision increments monotonically.

-- G. Validation
-- - invalid attendance code -> check violation.
-- - duplicate logical entry -> unique violation.
-- - baseline override without correction_reason -> check violation.
-- - unsupported GC-MNH operational insert -> check violation pending mapping approval.

-- H. Phase 2 regression
-- Run existing frontend auth, runtime-config, adapter and assembly tests.
-- Verify all existing read-only source records still load when no operational
-- records exist.
