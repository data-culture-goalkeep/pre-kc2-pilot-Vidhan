'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const backendSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'backend.js'), 'utf8');

function response(rows, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Forbidden',
    async json() { return rows; },
    async text() { return JSON.stringify(rows); }
  };
}

function buildContext({key = 'sb_publishable_test_key', fetchImpl}) {
  const context = {
    console,
    URL,
    atob: s => Buffer.from(s, 'base64').toString('utf8'),
    fetch: fetchImpl,
    window: {
      TAMAHAR_CONFIG: {
        dataMode: 'supabase',
        supabaseUrl: 'https://example.supabase.co',
        supabasePublishableKey: key,
        defaultMonth: '2026-09',
        readOnly: true
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(backendSource, context);
  return context.window.TamaharBackend;
}

async function testSecretKeyRejected() {
  const api = buildContext({
    key: 'sb_secret_should_never_be_in_browser',
    fetchImpl: async () => { throw new Error('fetch must not run'); }
  });
  await assert.rejects(api.loadWorkspace(), /Unsafe Supabase key detected/);
}

async function testMappedWorkspace() {
  const children = [{
    child_pk: '11111111-1111-4111-8111-111111111111', child_id: 'CH001', child_name: 'Example Child',
    centre_name: 'Centre A', gender: 'Female', date_of_birth: '2018-01-01', enrollment_date: '2025-06-01',
    status: 'Active', disability_type: 'Example', disability_sub_type: null, severity: 'Moderate',
    current_program_source: 'EI', exit_date: null, exit_reason: null, notes: null
  }];
  const adl = [{
    adl_assessment_id:'ADL1', child_pk:children[0].child_pk, academic_year:'2026-27', goals_planned:5,
    goals_independent_score_4:1, goals_supervision_score_3:2, goals_limited_assistance_score_2:1,
    goals_extensive_assistance_score_1:1, goals_fully_dependent_score_0:0, notes:null, mark_issue:false
  }];
  const dev = [{
    development_assessment_id:'DEV1', child_pk:children[0].child_pk, academic_year:'2026-27', term:'Term 1',
    domain_type:'Communication', goals_planned:4, goals_progressed:2, goals_slightly_progressed:1,
    goals_not_progressed:1, notes:null, mark_issue:false
  }];
  const monthRows = [
    {child_attendance_month_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', child_pk:children[0].child_pk, academic_year:'2026-27', month_label:'Sept', program_source_label:'GC-EI', program_subtype_batch:null, source_status:null, source_present_count:1, source_absent_count:1, source_total_count:2, source_attendance_percentage:50, reason_for_absence:'Illness', source_record_id:'src1'},
    {child_attendance_month_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', child_pk:children[0].child_pk, academic_year:'2026-27', month_label:'Sept', program_source_label:'TH-OT', program_subtype_batch:null, source_status:null, source_present_count:1, source_absent_count:0, source_total_count:1, source_attendance_percentage:100, reason_for_absence:null, source_record_id:'src2'}
  ];
  const dayRows = [
    {child_attendance_month_id:monthRows[0].child_attendance_month_id, day_of_month:1, attendance_code:'P'},
    {child_attendance_month_id:monthRows[0].child_attendance_month_id, day_of_month:2, attendance_code:'A'},
    {child_attendance_month_id:monthRows[0].child_attendance_month_id, day_of_month:3, attendance_code:'NS'},
    {child_attendance_month_id:monthRows[1].child_attendance_month_id, day_of_month:1, attendance_code:'P'}
  ];

  const fetchImpl = async url => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    if (table === 'children') return response(children);
    if (table === 'adl_assessments') return response(adl);
    if (table === 'development_assessments') return response(dev);
    if (table === 'child_attendance_months') {
      if (u.searchParams.has('academic_year')) return response(monthRows);
      return response([{academic_year:'2026-27',month_label:'Sept'}]);
    }
    if (table === 'child_attendance_days') return response(dayRows);
    throw new Error(`Unexpected table ${table}`);
  };

  const api = buildContext({fetchImpl});
  assert.equal(api.isoMonth('2026-27','Sept'), '2026-09');
  assert.deepEqual(JSON.parse(JSON.stringify(api.sourcePeriod('2026-09'))), {academicYear:'2026-27',monthLabel:'Sept'});

  const workspace = await api.loadWorkspace();
  assert.equal(workspace.selectedMonth, '2026-09');
  assert.equal(workspace.children.length, 1);
  const c = workspace.children[0];
  assert.equal(c.sourceId, 'CH001');
  assert.equal(c.programme, 0);
  assert.equal(c.enrolled, '2025-06-01');
  assert.deepEqual(JSON.parse(JSON.stringify(c.goals)), []);
  assert.equal(c.backendAdl.length, 1);
  assert.equal(c.backendDevelopment.length, 1);
  assert.equal(c.attendance['2026-09-01'], 'P');
  assert.equal(c.attendance['2026-09-02'], 'A');
  assert.equal(c.attendance['2026-09-03'], undefined);
  assert.equal(c.attendanceRaw['2026-09-03'], 'NS');
  assert.equal(c.absences['2026-09-02'].reason, 'Illness');
  assert.equal(c.therapy['2026-09-01'].type, 'Occupational therapy');
  assert.equal(c.therapy['2026-09-01'].attended, true);
  assert.equal(c.backendAttendanceSummary.present, 1);
  assert.equal(c.backendAttendanceSummary.absent, 1);
  assert.equal(c.backendAttendanceSummary.total, 2);
}

async function main() {
  await testSecretKeyRejected();
  await testMappedWorkspace();
  console.log('backend-adapter tests passed');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
