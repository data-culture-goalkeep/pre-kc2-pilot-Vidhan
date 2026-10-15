-- Synthetic fixtures for Phase 3A local/CI validation only.
-- Never run against the production Tamahar project.

insert into private.migration_runs (migration_run_id,status,notes)
values ('00000000-0000-0000-0000-000000000001','completed','Phase 3 synthetic CI fixture');

insert into private.source_records (
  source_record_id,migration_run_id,source_workbook,source_sheet,source_row_number,source_record_key,raw_row
) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','SYNTHETIC_PHASE3','Children',1,'SYN-EI-1','{"synthetic":true}'::jsonb),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','SYNTHETIC_PHASE3','Children',2,'SYN-FA-1','{"synthetic":true}'::jsonb),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','SYNTHETIC_PHASE3','Children',3,'SYN-PV-1','{"synthetic":true}'::jsonb),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','SYNTHETIC_PHASE3','Attendance',10,'SYN-EI-BASE','{"synthetic":true}'::jsonb);

insert into public.children (
  child_pk,child_id,child_name,status,current_program_source,source_record_id
) values
('20000000-0000-0000-0000-000000000001','SYN-EI-1','Synthetic EI Child','Active','EI','10000000-0000-0000-0000-000000000001'),
('20000000-0000-0000-0000-000000000002','SYN-FA-1','Synthetic FA Child','Active','FA','10000000-0000-0000-0000-000000000002'),
('20000000-0000-0000-0000-000000000003','SYN-PV-1','Synthetic PV Child','Active','PV','10000000-0000-0000-0000-000000000003');

insert into public.child_attendance_months (
  child_attendance_month_id,child_pk,academic_year,month_label,program_source_label,
  source_present_count,source_absent_count,source_total_count,source_record_id
) values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '2026-27','Sept','GC-EI',1,0,1,'10000000-0000-0000-0000-000000000004'
);

insert into public.child_attendance_days (
  child_attendance_day_id,child_attendance_month_id,day_of_month,attendance_code,source_record_id
) values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  5,'P','10000000-0000-0000-0000-000000000004'
);
