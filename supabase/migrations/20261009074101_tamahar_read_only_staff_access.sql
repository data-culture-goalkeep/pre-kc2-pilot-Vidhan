BEGIN;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT (child_pk,child_id,child_name,centre_name,gender,date_of_birth,enrollment_date,status,disability_type,disability_sub_type,severity,current_program_source,exit_date,exit_reason,notes) ON public.children TO authenticated;
GRANT SELECT (child_attendance_month_id,child_pk,academic_year,month_label,program_source_label,program_subtype_batch,source_status,source_present_count,source_absent_count,source_total_count,source_attendance_percentage,reason_for_absence,source_record_id) ON public.child_attendance_months TO authenticated;
GRANT SELECT (child_attendance_month_id,day_of_month,attendance_code) ON public.child_attendance_days TO authenticated;
GRANT SELECT (adl_assessment_id,child_pk,academic_year,goals_planned,goals_independent_score_4,goals_supervision_score_3,goals_limited_assistance_score_2,goals_extensive_assistance_score_1,goals_fully_dependent_score_0,notes,mark_issue) ON public.adl_assessments TO authenticated;
GRANT SELECT (development_assessment_id,child_pk,academic_year,term,domain_type,goals_planned,goals_progressed,goals_slightly_progressed,goals_not_progressed,notes,mark_issue) ON public.development_assessments TO authenticated;

CREATE POLICY tamahar_read_children ON public.children FOR SELECT TO authenticated USING (
  (SELECT auth.uid()) IS NOT NULL
  AND (SELECT auth.jwt()->'app_metadata'->'tamahar'->>'enabled') = 'true'
  AND (
    (SELECT auth.jwt()->'app_metadata'->'tamahar'->>'role') IN ('administrator','management')
    OR (
      (SELECT auth.jwt()->'app_metadata'->'tamahar'->>'role') IN ('programme_manager','teacher','therapist')
      AND (
        coalesce((SELECT auth.jwt()->'app_metadata'->'tamahar'->'programmes'),'[]'::jsonb) ? current_program_source
        OR (
          (SELECT auth.jwt()->'app_metadata'->'tamahar'->>'role') IN ('teacher','therapist')
          AND coalesce((SELECT auth.jwt()->'app_metadata'->'tamahar'->'child_ids'),'[]'::jsonb) ? child_id
        )
      )
    )
  )
);

CREATE POLICY tamahar_read_attendance_months ON public.child_attendance_months FOR SELECT TO authenticated
  USING (child_pk IN (SELECT child_pk FROM public.children));
CREATE POLICY tamahar_read_attendance_days ON public.child_attendance_days FOR SELECT TO authenticated
  USING (child_attendance_month_id IN (SELECT child_attendance_month_id FROM public.child_attendance_months));
CREATE POLICY tamahar_read_adl ON public.adl_assessments FOR SELECT TO authenticated
  USING (child_pk IN (SELECT child_pk FROM public.children));
CREATE POLICY tamahar_read_development ON public.development_assessments FOR SELECT TO authenticated
  USING (child_pk IN (SELECT child_pk FROM public.children));
COMMIT;
