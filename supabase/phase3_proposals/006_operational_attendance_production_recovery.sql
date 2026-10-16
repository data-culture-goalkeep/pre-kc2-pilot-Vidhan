-- Production recovery: freeze operational attendance writes without deleting history.
-- Safe to apply after real operational entries exist.
begin;

revoke insert, update on public.operational_attendance_entries from authenticated;

drop policy if exists tamahar_operational_attendance_update
  on public.operational_attendance_entries;
drop policy if exists tamahar_operational_attendance_insert
  on public.operational_attendance_entries;

-- Keep SELECT policy so already-authorized staff can still see persisted
-- operational attendance in the dashboard after the frontend is switched
-- back to read-only mode.
-- Keep both operational tables, triggers and private audit history intact.

commit;
