-- Phase 3A PROPOSAL ONLY.
-- DO NOT APPLY TO PRODUCTION.
-- Intended first target: isolated Tamahar staging/preview branch after review.

begin;

create table public.operational_attendance_entries (
  attendance_entry_id uuid primary key default gen_random_uuid(),
  child_pk uuid not null references public.children(child_pk) on delete restrict,
  entry_date date not null,
  activity_type text not null check (activity_type in ('programme','therapy')),
  activity_source_label text not null,
  attendance_code text not null check (attendance_code in ('P','A','H','NS','PwC')),
  reason_for_absence text,
  notes text,
  baseline_child_attendance_day_id uuid references public.child_attendance_days(child_attendance_day_id) on delete restrict,
  correction_reason text,
  revision integer not null default 1 check (revision >= 1),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),

  constraint operational_attendance_source_type_check check (
    (activity_type = 'programme' and activity_source_label in ('GC-EI','GC-Nursery','GC-FA','GC-PVSW'))
    or
    (activity_type = 'therapy' and activity_source_label in ('TH-ST','TH-PT','TH-OT','TH-VT'))
  ),
  constraint operational_attendance_baseline_reason_check check (
    baseline_child_attendance_day_id is null or nullif(btrim(correction_reason),'') is not null
  ),
  constraint operational_attendance_unique_entry unique (child_pk, entry_date, activity_source_label)
);

create table private.operational_attendance_entry_history (
  audit_id uuid primary key default gen_random_uuid(),
  attendance_entry_id uuid not null references public.operational_attendance_entries(attendance_entry_id) on delete restrict,
  revision integer not null check (revision >= 1),
  action text not null check (action in ('INSERT','UPDATE')),
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb not null
);

alter table public.operational_attendance_entries enable row level security;
alter table private.operational_attendance_entry_history enable row level security;

create or replace function private.phase3_prepare_attendance_entry()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'authenticated actor required';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.revision := 1;
  else
    if new.child_pk is distinct from old.child_pk
       or new.entry_date is distinct from old.entry_date
       or new.activity_type is distinct from old.activity_type
       or new.activity_source_label is distinct from old.activity_source_label
       or new.baseline_child_attendance_day_id is distinct from old.baseline_child_attendance_day_id then
      raise exception 'attendance entry identity fields are immutable';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.revision := old.revision + 1;
  end if;

  return new;
end;
$$;

create trigger phase3_prepare_attendance_entry
before insert or update on public.operational_attendance_entries
for each row execute function private.phase3_prepare_attendance_entry();

create or replace function private.phase3_audit_attendance_entry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'authenticated actor required';
  end if;

  insert into private.operational_attendance_entry_history (
    attendance_entry_id, revision, action, actor_id, old_row, new_row
  )
  values (
    new.attendance_entry_id,
    new.revision,
    tg_op,
    auth.uid(),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

revoke all on function private.phase3_audit_attendance_entry() from public, anon, authenticated;

create trigger phase3_audit_attendance_entry
after insert or update on public.operational_attendance_entries
for each row execute function private.phase3_audit_attendance_entry();

-- Narrow Data API grants. No DELETE.
grant select (
  attendance_entry_id, child_pk, entry_date, activity_type, activity_source_label,
  attendance_code, reason_for_absence, notes, baseline_child_attendance_day_id,
  correction_reason, revision, created_by, created_at, updated_by, updated_at
) on public.operational_attendance_entries to authenticated;

grant insert (
  child_pk, entry_date, activity_type, activity_source_label,
  attendance_code, reason_for_absence, notes,
  baseline_child_attendance_day_id, correction_reason
) on public.operational_attendance_entries to authenticated;

grant update (
  attendance_code, reason_for_absence, notes, correction_reason
) on public.operational_attendance_entries to authenticated;

-- Existing child SELECT RLS is deliberately reused as the child-scope authority.
create policy tamahar_operational_attendance_select
on public.operational_attendance_entries
for select to authenticated
using (
  (select auth.jwt()->'app_metadata'->'tamahar'->>'enabled') = 'true'
  and child_pk in (select child_pk from public.children)
);

create policy tamahar_operational_attendance_insert
on public.operational_attendance_entries
for insert to authenticated
with check (
  (select auth.jwt()->'app_metadata'->'tamahar'->>'enabled') = 'true'
  and child_pk in (select child_pk from public.children)
  and (
    (
      (select auth.jwt()->'app_metadata'->'tamahar'->>'role') in ('administrator','management')
    )
    or
    (
      activity_type = 'programme'
      and (select auth.jwt()->'app_metadata'->'tamahar'->>'role') in ('programme_manager','teacher')
    )
    or
    (
      activity_type = 'therapy'
      and (select auth.jwt()->'app_metadata'->'tamahar'->>'role') = 'therapist'
    )
  )
  and (
    activity_type = 'therapy'
    or exists (
      select 1
      from public.children c
      where c.child_pk = operational_attendance_entries.child_pk
        and (
          (operational_attendance_entries.activity_source_label = 'GC-EI' and c.current_program_source = 'EI')
          or (operational_attendance_entries.activity_source_label = 'GC-Nursery' and c.current_program_source = 'Nursery')
          or (operational_attendance_entries.activity_source_label = 'GC-FA' and c.current_program_source = 'FA')
          or (operational_attendance_entries.activity_source_label = 'GC-PVSW' and c.current_program_source in ('PV','SW'))
        )
    )
  )
);

create policy tamahar_operational_attendance_update
on public.operational_attendance_entries
for update to authenticated
using (
  (select auth.jwt()->'app_metadata'->'tamahar'->>'enabled') = 'true'
  and child_pk in (select child_pk from public.children)
  and (
    (select auth.jwt()->'app_metadata'->'tamahar'->>'role') in ('administrator','management')
    or (activity_type = 'programme' and (select auth.jwt()->'app_metadata'->'tamahar'->>'role') in ('programme_manager','teacher'))
    or (activity_type = 'therapy' and (select auth.jwt()->'app_metadata'->'tamahar'->>'role') = 'therapist')
  )
)
with check (
  (select auth.jwt()->'app_metadata'->'tamahar'->>'enabled') = 'true'
  and child_pk in (select child_pk from public.children)
  and (
    (select auth.jwt()->'app_metadata'->'tamahar'->>'role') in ('administrator','management')
    or (activity_type = 'programme' and (select auth.jwt()->'app_metadata'->'tamahar'->>'role') in ('programme_manager','teacher'))
    or (activity_type = 'therapy' and (select auth.jwt()->'app_metadata'->'tamahar'->>'role') = 'therapist')
  )
  and (
    activity_type = 'therapy'
    or exists (
      select 1
      from public.children c
      where c.child_pk = operational_attendance_entries.child_pk
        and (
          (operational_attendance_entries.activity_source_label = 'GC-EI' and c.current_program_source = 'EI')
          or (operational_attendance_entries.activity_source_label = 'GC-Nursery' and c.current_program_source = 'Nursery')
          or (operational_attendance_entries.activity_source_label = 'GC-FA' and c.current_program_source = 'FA')
          or (operational_attendance_entries.activity_source_label = 'GC-PVSW' and c.current_program_source in ('PV','SW'))
        )
    )
  )
);

-- Audit rows are readable only through a still-visible operational entry.
grant select (
  audit_id, attendance_entry_id, revision, action, actor_id, changed_at, old_row, new_row
) on private.operational_attendance_entry_history to authenticated;

create policy tamahar_operational_attendance_history_select
on private.operational_attendance_entry_history
for select to authenticated
using (
  attendance_entry_id in (
    select attendance_entry_id
    from public.operational_attendance_entries
  )
);

commit;
