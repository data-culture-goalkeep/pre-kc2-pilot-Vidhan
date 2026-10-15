'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const backendSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'backend.js'), 'utf8');

function response(rows, status = 200, statusText = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText || (status >= 200 && status < 300 ? 'OK' : status === 409 ? 'Conflict' : 'Forbidden'),
    async json() { return rows; },
    async text() { return JSON.stringify(rows); }
  };
}

function buildContext({key = 'sb_publishable_test_key', fetchImpl, accessToken = null, phase3Writes = false}) {
  const context = {
    console,
    URL,
    atob: s => Buffer.from(s, 'base64').toString('utf8'),
    fetch: fetchImpl,
    window: {
      TamaharAuth: accessToken ? {getAccessToken: async () => accessToken} : undefined,
      TAMAHAR_CONFIG: {
        dataMode: 'supabase',
        supabaseUrl: 'https://example.supabase.co',
        supabasePublishableKey: key,
        defaultMonth: '2026-09',
        readOnly: true,
        phase3Writes
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

async function testBearerTokenAttached() {
  let seenAuthorization = null;
  const fetchImpl = async (url, options) => {
    seenAuthorization = options?.headers?.Authorization || null;
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'children') return response([]);
    return response([]);
  };
  const api = buildContext({fetchImpl, accessToken:'staff-access-token'});
  await assert.rejects(api.loadWorkspace(), /No child rows were returned/);
  assert.equal(seenAuthorization, 'Bearer staff-access-token');
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
    {child_attendance_day_id:'day-1',child_attendance_month_id:monthRows[0].child_attendance_month_id, day_of_month:1, attendance_code:'P'},
    {child_attendance_day_id:'day-2',child_attendance_month_id:monthRows[0].child_attendance_month_id, day_of_month:2, attendance_code:'A'},
    {child_attendance_day_id:'day-3',child_attendance_month_id:monthRows[0].child_attendance_month_id, day_of_month:3, attendance_code:'NS'},
    {child_attendance_day_id:'day-4',child_attendance_month_id:monthRows[1].child_attendance_month_id, day_of_month:1, attendance_code:'P'}
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


async function testOperationalOverlayPersistsAfterReload() {
  const childPk='11111111-1111-4111-8111-111111111111';
  const children=[{
    child_pk:childPk,child_id:'CH001',child_name:'Example Child',centre_name:'Centre A',gender:'Female',
    date_of_birth:'2018-01-01',enrollment_date:'2025-06-01',status:'Active',disability_type:'Example',
    disability_sub_type:null,severity:'Moderate',current_program_source:'EI',exit_date:null,exit_reason:null,notes:null
  }];
  const monthId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const monthRows=[{child_attendance_month_id:monthId,child_pk:childPk,academic_year:'2026-27',month_label:'Sept',program_source_label:'GC-EI',program_subtype_batch:null,source_status:null,source_present_count:1,source_absent_count:0,source_total_count:1,source_attendance_percentage:100,reason_for_absence:null,source_record_id:'src1'}];
  const dayRows=[{child_attendance_day_id:'day-1',child_attendance_month_id:monthId,day_of_month:1,attendance_code:'P'}];
  const operational=[{
    attendance_entry_id:'op-1',child_pk:childPk,entry_date:'2026-09-01',activity_type:'programme',
    activity_source_label:'GC-EI',attendance_code:'A',reason_for_absence:'Operational illness',notes:null,
    baseline_child_attendance_day_id:'day-1',correction_reason:'Correct source entry',revision:1
  }];
  const fetchImpl=async url=>{
    const u=new URL(url), table=u.pathname.split('/').pop();
    if(table==='children') return response(children);
    if(table==='adl_assessments'||table==='development_assessments') return response([]);
    if(table==='child_attendance_months') return response(u.searchParams.has('academic_year')?monthRows:[{academic_year:'2026-27',month_label:'Sept'}]);
    if(table==='child_attendance_days') return response(dayRows);
    if(table==='operational_attendance_entries') return response(operational);
    throw new Error(`Unexpected table ${table}`);
  };
  const api=buildContext({fetchImpl,accessToken:'staff-token',phase3Writes:true});
  const workspace=await api.loadWorkspace();
  const c=workspace.children[0];
  assert.equal(c.attendanceRaw['2026-09-01'],'A');
  assert.equal(c.absences['2026-09-01'].reason,'Operational illness');
  assert.equal(c.attendanceMeta['2026-09-01'].operational,true);
  assert.equal(c.operationalEntries['2026-09-01|GC-EI'].attendance_entry_id,'op-1');
}

async function testWriteDisabledByDefault() {
  const api=buildContext({fetchImpl:async()=>response([]),accessToken:'staff-token'});
  await assert.rejects(
    api.saveOperationalAttendance({
      childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'EI',entryDate:'2026-09-10',
      activityType:'programme',attendanceCode:'P'
    }),
    /writes are disabled/
  );
}

async function testInsertAndCorrectionRequests() {
  const seen=[];
  const fetchImpl=async (url,options={})=>{
    const u=new URL(url), table=u.pathname.split('/').pop();
    seen.push({url:String(url),method:options.method||'GET',headers:options.headers,body:options.body});
    if(table!=='operational_attendance_entries') throw new Error(`Unexpected table ${table}`);
    const body=options.body?JSON.parse(options.body):{};
    if(options.method==='POST') return response([{attendance_entry_id:'op-new',child_pk:body.child_pk,entry_date:body.entry_date,activity_type:body.activity_type,activity_source_label:body.activity_source_label,attendance_code:body.attendance_code,revision:1}],201);
    if(options.method==='PATCH') return response([{attendance_entry_id:'op-new',child_pk:'11111111-1111-4111-8111-111111111111',entry_date:'2026-09-10',activity_type:'programme',activity_source_label:'GC-EI',attendance_code:body.attendance_code,correction_reason:body.correction_reason,revision:2}]);
    throw new Error('Unexpected method');
  };
  const api=buildContext({fetchImpl,accessToken:'staff-token',phase3Writes:true});
  const inserted=await api.saveOperationalAttendance({
    childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'EI',entryDate:'2026-09-10',
    activityType:'programme',attendanceCode:'P'
  });
  assert.equal(inserted.attendance_entry_id,'op-new');
  const post=seen.find(x=>x.method==='POST');
  assert.equal(post.headers.Authorization,'Bearer staff-token');
  assert.equal(JSON.parse(post.body).activity_source_label,'GC-EI');

  await assert.rejects(
    api.saveOperationalAttendance({
      childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'EI',entryDate:'2026-09-10',
      activityType:'programme',activitySourceLabel:'GC-EI',attendanceCode:'A',attendanceEntryId:'op-new'
    }),
    /correction reason is required/
  );

  const corrected=await api.saveOperationalAttendance({
    childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'EI',entryDate:'2026-09-10',
    activityType:'programme',activitySourceLabel:'GC-EI',attendanceCode:'A',attendanceEntryId:'op-new',
    correctionReason:'Attendance was entered incorrectly'
  });
  assert.equal(corrected.revision,2);
  const patch=seen.find(x=>x.method==='PATCH');
  assert.match(patch.url,/attendance_entry_id=eq\.op-new/);
  assert.equal(JSON.parse(patch.body).correction_reason,'Attendance was entered incorrectly');
}

async function testBaselineCorrectionAndDuplicateConflict() {
  let mode='baseline';
  const fetchImpl=async (_url,options={})=>{
    if(mode==='baseline') {
      const body=JSON.parse(options.body);
      return response([{attendance_entry_id:'op-base',...body,revision:1}],201);
    }
    return response({code:'23505',message:'duplicate key value violates unique constraint'},409);
  };
  const api=buildContext({fetchImpl,accessToken:'staff-token',phase3Writes:true});
  await assert.rejects(
    api.saveOperationalAttendance({
      childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'EI',entryDate:'2026-09-05',
      activityType:'programme',attendanceCode:'A',baselineDayId:'day-1'
    }),
    /correction reason is required/
  );
  const row=await api.saveOperationalAttendance({
    childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'EI',entryDate:'2026-09-05',
    activityType:'programme',attendanceCode:'A',baselineDayId:'day-1',correctionReason:'Correct imported day'
  });
  assert.equal(row.baseline_child_attendance_day_id,'day-1');
  mode='duplicate';
  await assert.rejects(
    api.saveOperationalAttendance({
      childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'EI',entryDate:'2026-09-06',
      activityType:'programme',attendanceCode:'P'
    }),
    /already exists/
  );
}

async function testGCMNHIsNotWritable() {
  const api=buildContext({fetchImpl:async()=>response([]),accessToken:'staff-token',phase3Writes:true});
  assert.equal(api.programmeSourceLabel('MNH'),null);
  await assert.rejects(
    api.saveOperationalAttendance({
      childPk:'11111111-1111-4111-8111-111111111111',programmeSource:'MNH',entryDate:'2026-09-10',
      activityType:'programme',attendanceCode:'P'
    }),
    /not writable/
  );
}

async function main() {
  await testSecretKeyRejected();
  await testBearerTokenAttached();
  await testMappedWorkspace();
  await testOperationalOverlayPersistsAfterReload();
  await testWriteDisabledByDefault();
  await testInsertAndCorrectionRequests();
  await testBaselineCorrectionAndDuplicateConflict();
  await testGCMNHIsNotWritable();
  console.log('backend-adapter tests passed');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
