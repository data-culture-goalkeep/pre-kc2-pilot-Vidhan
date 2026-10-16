-- Phase 3A ROLLBACK PLAN — REVIEW ARTIFACT ONLY.
-- DO NOT APPLY TO PRODUCTION.
--
-- STAGING rollback:
-- If Phase 3A staging validation fails, the preferred rollback is to reset or
-- delete/recreate the isolated Supabase branch. This guarantees all synthetic
-- fixtures and untracked schema changes are discarded.
--
-- The SQL below is a destructive staging-only fallback when branch reset is
-- unavailable. It must not be used on production after real operational data
-- exists.

begin;

revoke all on public.operational_attendance_entries from authenticated, anon, public;
revoke all on private.operational_attendance_entry_history from authenticated, anon, public;

drop policy if exists tamahar_operational_attendance_update on public.operational_attendance_entries;
drop policy if exists tamahar_operational_attendance_insert on public.operational_attendance_entries;
drop policy if exists tamahar_operational_attendance_select on public.operational_attendance_entries;

drop trigger if exists phase3_audit_attendance_entry on public.operational_attendance_entries;
drop trigger if exists phase3_prepare_attendance_entry on public.operational_attendance_entries;

drop function if exists private.phase3_audit_attendance_entry();
drop function if exists private.phase3_prepare_attendance_entry();

drop table if exists private.operational_attendance_entry_history;
drop table if exists public.operational_attendance_entries;

commit;

-- FUTURE PRODUCTION rollback rule:
-- Never drop operational tables/history automatically after real writes exist.
-- A production rollback must first freeze writes by revoking INSERT/UPDATE and
-- removing write policies, keep data/audit history intact, switch the UI back
-- to the Phase 2 read-only path, and require a separately reviewed migration
-- for any later archival or schema removal.
