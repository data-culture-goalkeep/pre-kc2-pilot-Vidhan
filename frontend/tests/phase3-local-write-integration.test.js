'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const backendSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'backend.js'), 'utf8');
const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_ANON_KEY;
const jwtSecret = process.env.LOCAL_SUPABASE_JWT_SECRET;

if (!url || !key || !jwtSecret) {
  throw new Error('Local Supabase URL, anon key and JWT secret are required.');
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function tokenFor(sub, tamahar) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const payload = b64url(JSON.stringify({
    aud:'authenticated',
    exp:now + 3600,
    iat:now,
    sub,
    role:'authenticated',
    email:`${sub}@synthetic.invalid`,
    app_metadata:{tamahar}
  }));
  const sig = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function buildApi(token) {
  const context = {
    console,
    URL,
    Date,
    fetch,
    atob:s=>Buffer.from(s,'base64').toString('utf8'),
    window:{
      TamaharAuth:{getAccessToken:async()=>token},
      TAMAHAR_CONFIG:{
        dataMode:'supabase',
        supabaseUrl:url,
        supabasePublishableKey:key,
        defaultMonth:'2026-09',
        readOnly:true,
        phase3Writes:true
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(backendSource,context);
  return context.window.TamaharBackend;
}

async function main() {
  const admin = buildApi(tokenFor(
    '90000000-0000-0000-0000-000000000001',
    {enabled:true,role:'administrator'}
  ));

  let workspace = await admin.loadWorkspace();
  let child = workspace.children.find(c=>c.sourceId==='SYN-EI-1');
  assert.ok(child, 'synthetic EI child must load');

  const baselineMeta = child.attendanceMeta['2026-09-05'];
  assert.equal(child.attendanceRaw['2026-09-05'],'P');
  assert.ok(baselineMeta?.baselineDayId, 'baseline source day ID must be mapped');

  const correction = await admin.saveOperationalAttendance({
    childPk:child.childPk,
    programmeSource:'EI',
    entryDate:'2026-09-05',
    activityType:'programme',
    attendanceCode:'A',
    reasonForAbsence:'Synthetic local test',
    baselineDayId:baselineMeta.baselineDayId,
    correctionReason:'Synthetic correction of imported baseline'
  });
  assert.equal(correction.attendance_code,'A');

  workspace = await admin.loadWorkspace();
  child = workspace.children.find(c=>c.sourceId==='SYN-EI-1');
  assert.equal(child.attendanceRaw['2026-09-05'],'A');
  assert.equal(child.absences['2026-09-05'].reason,'Synthetic local test');
  assert.equal(child.attendanceMeta['2026-09-05'].operational,true);

  const correctedAgain = await admin.saveOperationalAttendance({
    childPk:child.childPk,
    programmeSource:'EI',
    entryDate:'2026-09-05',
    activityType:'programme',
    activitySourceLabel:'GC-EI',
    attendanceCode:'P',
    attendanceEntryId:child.operationalEntries['2026-09-05|GC-EI'].attendance_entry_id,
    correctionReason:'Synthetic second correction'
  });
  assert.equal(correctedAgain.revision,2);

  const therapy = await admin.saveOperationalAttendance({
    childPk:child.childPk,
    entryDate:'2026-09-21',
    activityType:'therapy',
    activitySourceLabel:'TH-OT',
    attendanceCode:'P'
  });
  assert.equal(therapy.activity_source_label,'TH-OT');

  workspace = await admin.loadWorkspace();
  child = workspace.children.find(c=>c.sourceId==='SYN-EI-1');
  assert.equal(child.attendanceRaw['2026-09-05'],'P');
  assert.ok(child.therapySessions.some(x=>x.date==='2026-09-21' && x.sourceProgram==='TH-OT' && x.operational));

  const eiManager = buildApi(tokenFor(
    '90000000-0000-0000-0000-000000000002',
    {enabled:true,role:'programme_manager',programmes:['EI'],child_ids:[]}
  ));
  await assert.rejects(
    eiManager.saveOperationalAttendance({
      childPk:'20000000-0000-0000-0000-000000000002',
      programmeSource:'FA',
      entryDate:'2026-09-22',
      activityType:'programme',
      attendanceCode:'P'
    }),
    /Supabase (401|403)/
  );

  console.log('phase3 local write integration tests passed');
}

main().catch(err=>{
  console.error(err);
  process.exitCode=1;
});
