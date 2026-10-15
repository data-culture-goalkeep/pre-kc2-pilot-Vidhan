-- Phase 3A executable local/CI security assertions.
-- Requires only synthetic fixtures. Run on local Supabase, never production.

create schema if not exists phase3_test;
grant usage on schema phase3_test to authenticated;

create or replace function phase3_test.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok,false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end $$;
grant execute on function phase3_test.assert_true(boolean,text) to authenticated;

-- A. Administrator: programme + therapy INSERT, UPDATE, duplicate and immutable identity.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"tamahar":{"enabled":true,"role":"administrator"}}}',true);

insert into public.operational_attendance_entries (
  child_pk,entry_date,activity_type,activity_source_label,attendance_code
) values (
  '20000000-0000-0000-0000-000000000001','2026-09-10','programme','GC-EI','P'
);

insert into public.operational_attendance_entries (
  child_pk,entry_date,activity_type,activity_source_label,attendance_code
) values (
  '20000000-0000-0000-0000-000000000001','2026-09-10','therapy','TH-OT','P'
);

update public.operational_attendance_entries
set attendance_code='A', reason_for_absence='Synthetic test', correction_reason='Synthetic correction 1'
where child_pk='20000000-0000-0000-0000-000000000001'
  and entry_date='2026-09-10' and activity_source_label='GC-EI';

select phase3_test.assert_true(
  (select revision=2 and updated_by='90000000-0000-0000-0000-000000000001'::uuid
   from public.operational_attendance_entries
   where child_pk='20000000-0000-0000-0000-000000000001' and entry_date='2026-09-10' and activity_source_label='GC-EI'),
  'administrator update must increment revision and stamp actor'
);

do $$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000001','2026-09-10','programme','GC-EI','P');
    raise exception 'expected duplicate rejection';
  exception when unique_violation then null;
  end;
end $$;

do $$
begin
  begin
    update public.operational_attendance_entries
      set child_pk='20000000-0000-0000-0000-000000000002',
          correction_reason='Synthetic escape attempt'
    where child_pk='20000000-0000-0000-0000-000000000001'
      and entry_date='2026-09-10' and activity_source_label='GC-EI';
    raise exception 'expected immutable identity rejection';
  exception when raise_exception then
    if sqlerrm = 'expected immutable identity rejection' then raise; end if;
  end;
end $$;
rollback;

-- B. EI programme manager: EI allowed; FA and therapy denied.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"tamahar":{"enabled":true,"role":"programme_manager","programmes":["EI"],"child_ids":[]}}}',true);

insert into public.operational_attendance_entries (
  child_pk,entry_date,activity_type,activity_source_label,attendance_code
) values ('20000000-0000-0000-0000-000000000001','2026-09-11','programme','GC-EI','P');

do $$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000002','2026-09-11','programme','GC-FA','P');
    raise exception 'expected out-of-scope denial';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000001','2026-09-11','therapy','TH-ST','P');
    raise exception 'expected therapy denial';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- C. EI teacher: programme allowed, therapy denied.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"tamahar":{"enabled":true,"role":"teacher","programmes":["EI"],"child_ids":[]}}}',true);
insert into public.operational_attendance_entries (
  child_pk,entry_date,activity_type,activity_source_label,attendance_code
) values ('20000000-0000-0000-0000-000000000001','2026-09-12','programme','GC-EI','P');

do $$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000001','2026-09-12','therapy','TH-OT','P');
    raise exception 'expected teacher therapy denial';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- D. Therapist: therapy allowed for visible child, programme denied.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"tamahar":{"enabled":true,"role":"therapist","programmes":["EI"],"child_ids":[]}}}',true);
insert into public.operational_attendance_entries (
  child_pk,entry_date,activity_type,activity_source_label,attendance_code
) values ('20000000-0000-0000-0000-000000000001','2026-09-13','therapy','TH-PT','P');

do $$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000001','2026-09-13','programme','GC-EI','P');
    raise exception 'expected therapist programme denial';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- E. Disabled user denied.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"tamahar":{"enabled":false,"role":"administrator"}}}',true);
select phase3_test.assert_true(
  (select count(*)=0 from public.operational_attendance_entries),
  'disabled user must not read operational rows'
);
do $$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000001','2026-09-14','programme','GC-EI','P');
    raise exception 'expected disabled-user denial';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- F/G. Baseline provenance, correction reason, unsupported code/source.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"tamahar":{"enabled":true,"role":"administrator"}}}',true);

insert into public.operational_attendance_entries (
  child_pk,entry_date,activity_type,activity_source_label,attendance_code,
  baseline_child_attendance_day_id,correction_reason
) values (
  '20000000-0000-0000-0000-000000000001','2026-09-05','programme','GC-EI','A',
  '40000000-0000-0000-0000-000000000001','Synthetic baseline correction'
);

do $phase3$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000001','2026-09-15','programme','GC-MNH','P');
    raise exception 'expected GC-MNH rejection';
  exception when insufficient_privilege or check_violation then null;
  end;
end
$phase3$;

do $phase3$
begin
  begin
    insert into public.operational_attendance_entries (
      child_pk,entry_date,activity_type,activity_source_label,attendance_code
    ) values ('20000000-0000-0000-0000-000000000001','2026-09-16','programme','GC-EI','INVALID');
    raise exception 'expected attendance-code rejection';
  exception when check_violation then null;
  end;
end
$phase3$;

rollback;

select phase3_test.assert_true(
  (select attendance_code='P' and source_record_id='10000000-0000-0000-0000-000000000004'::uuid
   from public.child_attendance_days
   where child_attendance_day_id='40000000-0000-0000-0000-000000000001'),
  'Phase 1 source attendance row must remain unchanged'
);

-- H. Audit persistence test uses committed synthetic transaction, then cleanup.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"tamahar":{"enabled":true,"role":"administrator"}}}',true);
insert into public.operational_attendance_entries (
  child_pk,entry_date,activity_type,activity_source_label,attendance_code
) values ('20000000-0000-0000-0000-000000000001','2026-09-20','programme','GC-EI','P');
update public.operational_attendance_entries
set attendance_code='A',correction_reason='Synthetic audit correction'
where child_pk='20000000-0000-0000-0000-000000000001'
and entry_date='2026-09-20' and activity_source_label='GC-EI';
commit;

reset role;
select phase3_test.assert_true(
  (select count(*)=2 from private.operational_attendance_entry_history h
   join public.operational_attendance_entries e using (attendance_entry_id)
   where e.child_pk='20000000-0000-0000-0000-000000000001'
     and e.entry_date='2026-09-20'
     and e.activity_source_label='GC-EI'),
  'exactly two audit rows required for insert + update'
);
select phase3_test.assert_true(
  (select count(distinct actor_id)=1
          and count(*) filter (where actor_id='90000000-0000-0000-0000-000000000001'::uuid)=count(*)
   from private.operational_attendance_entry_history h
   join public.operational_attendance_entries e using (attendance_entry_id)
   where e.child_pk='20000000-0000-0000-0000-000000000001'
     and e.entry_date='2026-09-20'
     and e.activity_source_label='GC-EI'),
  'audit actor must equal auth.uid()'
);

delete from private.operational_attendance_entry_history
where attendance_entry_id in (
  select attendance_entry_id from public.operational_attendance_entries
  where child_pk='20000000-0000-0000-0000-000000000001'
    and entry_date='2026-09-20' and activity_source_label='GC-EI'
);
delete from public.operational_attendance_entries
where child_pk='20000000-0000-0000-0000-000000000001'
  and entry_date='2026-09-20' and activity_source_label='GC-EI';

drop schema phase3_test cascade;
