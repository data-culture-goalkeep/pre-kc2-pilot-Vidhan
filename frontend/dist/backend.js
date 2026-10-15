(() => {
  const cfg = window.TAMAHAR_CONFIG || {};
  const REST = String(cfg.supabaseUrl || '').replace(/\/$/, '') + '/rest/v1';
  const pageSize = 1000;
  const monthNames = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,July:7,Aug:8,Sept:9,Oct:10,Nov:11,Dec:12};
  const monthLabels = {1:'Jan',2:'Feb',3:'Mar',4:'Apr',5:'May',6:'Jun',7:'July',8:'Aug',9:'Sept',10:'Oct',11:'Nov',12:'Dec'};
  const mainAttendanceLabels = new Set(['GC-EI','GC-Nursery','GC-FA','GC-PVSW']);
  const therapyLabels = {'TH-OT':'Occupational therapy','TH-VT':'Visual therapy','TH-ST':'Speech therapy','TH-PT':'Physical therapy'};
  const programMap = {EI:0,Nursery:1,FA:2,PV:3,SW:3};

  function decodeJwtRole(key) {
    try {
      if (!key || key.split('.').length !== 3) return null;
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return payload?.role || null;
    } catch { return null; }
  }
  function validateConfig() {
    if (!cfg.supabaseUrl) throw new Error('Supabase URL is missing. Generate dist/runtime-config.js from environment variables before deployment.');
    if (!cfg.supabasePublishableKey) throw new Error('Supabase publishable key is missing. Generate dist/runtime-config.js from environment variables before deployment.');
    if (String(cfg.supabasePublishableKey).startsWith('sb_secret_') || decodeJwtRole(cfg.supabasePublishableKey)==='service_role') {
      throw new Error('Unsafe Supabase key detected. Never put a secret/service-role key in browser configuration.');
    }
  }
  async function headers() {
    const h = {apikey: cfg.supabasePublishableKey, Accept:'application/json'};
    const tokenProvider = window.TamaharAuth?.getAccessToken;
    const accessToken = typeof tokenProvider === 'function' ? await tokenProvider() : null;
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }
  async function request(table, params = {}, options = {}) {
    const u = new URL(`${REST}/${table}`);
    for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    const h = await headers();
    if (options.body !== undefined) h['Content-Type'] = 'application/json';
    if (options.prefer) h.Prefer = options.prefer;
    const res = await fetch(u, {
      method: options.method || 'GET',
      headers: h,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    let payload = null;
    try { payload = await res.json(); } catch {}
    if (!res.ok) {
      let detail = '';
      if (payload) detail = payload.message || payload.hint || payload.details || JSON.stringify(payload);
      if (!detail) { try { detail = await res.text(); } catch {} }
      const accessHint = res.status===401 ? ' Authentication is required or the session is invalid.'
        : res.status===403 ? ' Data API grants/RLS do not permit this request.'
        : res.status===409 ? ' An attendance entry already exists for this child, date and source stream.' : '';
      const err = new Error(`Supabase ${res.status}: ${detail || res.statusText}.${accessHint}`);
      err.status = res.status;
      err.code = payload?.code || null;
      throw err;
    }
    return payload ?? [];
  }
  async function fetchAll(table, params = {}) {
    const out = [];
    for (let offset=0;;offset+=pageSize) {
      const rows = await request(table, {...params, limit:String(pageSize), offset:String(offset)});
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
    return out;
  }
  function isoMonth(academicYear, monthLabel) {
    const m = monthNames[monthLabel]; if (!m) return null;
    const first = Number(String(academicYear).slice(0,4)); if (!first) return null;
    const year = m >= 6 ? first : first + 1;
    return `${year}-${String(m).padStart(2,'0')}`;
  }
  function sourcePeriod(iso) {
    const [y,m] = iso.split('-').map(Number);
    const start = m >= 6 ? y : y - 1;
    return {academicYear:`${start}-${String(start+1).slice(-2)}`, monthLabel:monthLabels[m]};
  }
  function ageAt(dob, asOf = new Date()) {
    if (!dob) return '—'; const d = new Date(`${dob}T12:00:00`); if (Number.isNaN(d.getTime())) return '—';
    let n = asOf.getFullYear()-d.getFullYear();
    if (asOf.getMonth()<d.getMonth() || (asOf.getMonth()===d.getMonth() && asOf.getDate()<d.getDate())) n--;
    return n;
  }
  function blankGoal() { return {date:'', goal:'Goals are not modelled in the Phase 1 backend', status:'Not available', note:'', value:0}; }
  function childModel(r, i) {
    return {
      id:i+1, childPk:r.child_pk, sourceId:r.child_id, name:r.child_name,
      programme: Object.prototype.hasOwnProperty.call(programMap,r.current_program_source) ? programMap[r.current_program_source] : -1,
      programmeSource:r.current_program_source || '', centre:r.centre_name || '', gender:r.gender || '', dob:r.date_of_birth || '',
      age:ageAt(r.date_of_birth), severity:r.severity || 'Not recorded', enrolled:r.enrollment_date || '',
      moves:[], exit:r.exit_date || '', status:r.status || '', disabilityType:r.disability_type || '', disabilitySubType:r.disability_sub_type || '',
      attendance:{}, attendanceRaw:{}, attendanceMeta:{}, absences:{}, therapy:{}, therapySessions:[], operationalEntries:{}, goals:[], adl:[], quarterly:[], behaviours:[], home:[], work:[], developmental:[], parentSessions:[],
      backendAdl:[], backendDevelopment:[], backendAttendanceSummary:null, backendRaw:r
    };
  }
  function programmeSourceLabel(programmeSource) {
    return ({EI:'GC-EI',Nursery:'GC-Nursery',FA:'GC-FA',PV:'GC-PVSW',SW:'GC-PVSW'})[programmeSource] || null;
  }
  function writeEnabled() {
    return cfg.phase3Writes === true;
  }
  function assertWriteEnabled() {
    if (!writeEnabled()) {
      const err = new Error('Phase 3 writes are disabled in this environment.');
      err.code = 'phase3_writes_disabled';
      throw err;
    }
  }
  function monthBounds(isoMonthValue) {
    const [year,month] = isoMonthValue.split('-').map(Number);
    const last = new Date(year, month, 0).getDate();
    return [`${isoMonthValue}-01`, `${isoMonthValue}-${String(last).padStart(2,'0')}`];
  }
  function operationalKey(date, sourceLabel) {
    return `${date}|${sourceLabel}`;
  }
  function applyOperationalRow(c, row) {
    const date = row.entry_date;
    c.operationalEntries[operationalKey(date,row.activity_source_label)] = row;
    if (row.activity_type === 'programme') {
      c.attendanceRaw[date] = row.attendance_code;
      if (row.attendance_code === 'P' || row.attendance_code === 'A') c.attendance[date] = row.attendance_code;
      else delete c.attendance[date];
      delete c.absences[date];
      if (row.attendance_code === 'A' && row.reason_for_absence) {
        c.absences[date] = {reason:row.reason_for_absence,followup:'Operational correction'};
      }
      c.attendanceMeta[date] = {
        sourceProgram: row.activity_source_label,
        baselineDayId: row.baseline_child_attendance_day_id || c.attendanceMeta?.[date]?.baselineDayId || null,
        operationalEntryId: row.attendance_entry_id,
        revision: row.revision,
        operational: true
      };
      return;
    }
    c.therapySessions = (c.therapySessions || []).filter(x => !(x.date===date && x.sourceProgram===row.activity_source_label));
    const session = {
      date,
      type: therapyLabels[row.activity_source_label] || row.activity_source_label,
      code: row.attendance_code,
      attended: row.attendance_code === 'P',
      sourceProgram: row.activity_source_label,
      reasonForAbsence: row.reason_for_absence || '',
      notes: row.notes || '',
      baselineDayId: row.baseline_child_attendance_day_id || null,
      operationalEntryId: row.attendance_entry_id,
      revision: row.revision,
      operational: true
    };
    c.therapySessions.push(session);
    if (row.attendance_code==='P' || row.attendance_code==='A') {
      c.therapy[date] = {type:session.type,attended:session.attended,code:session.code,operational:true};
    }
  }
  async function loadOperationalMonth(children, isoMonthValue) {
    if (!writeEnabled()) return [];
    const [start,end] = monthBounds(isoMonthValue);
    const rows = await fetchAll('operational_attendance_entries', {
      select:'attendance_entry_id,child_pk,entry_date,activity_type,activity_source_label,attendance_code,reason_for_absence,notes,baseline_child_attendance_day_id,correction_reason,revision,created_by,created_at,updated_by,updated_at',
      and:`(entry_date.gte.${start},entry_date.lte.${end})`
    });
    const byPk = new Map(children.map(c=>[c.childPk,c]));
    for (const row of rows) {
      const c = byPk.get(row.child_pk);
      if (c) applyOperationalRow(c,row);
    }
    return rows;
  }
  async function saveOperationalAttendance(input) {
    assertWriteEnabled();
    const allowedCodes = new Set(['P','A','H','NS','PwC']);
    const allowedTherapy = new Set(Object.keys(therapyLabels));
    const sourceLabel = input.activitySourceLabel || (input.activityType==='programme' ? programmeSourceLabel(input.programmeSource) : null);
    if (!input.childPk || !input.entryDate) throw new Error('Child and date are required.');
    if (!allowedCodes.has(input.attendanceCode)) throw new Error('Choose a valid attendance code.');
    if (input.activityType === 'programme') {
      if (!sourceLabel || sourceLabel === 'GC-MNH') throw new Error('Programme attendance is not writable for this source mapping.');
    } else if (input.activityType === 'therapy') {
      if (!allowedTherapy.has(sourceLabel)) throw new Error('Choose a supported therapy stream.');
    } else {
      throw new Error('Choose programme or therapy attendance.');
    }

    const body = {
      attendance_code: input.attendanceCode,
      reason_for_absence: input.reasonForAbsence?.trim() || null,
      notes: input.notes?.trim() || null,
      correction_reason: input.correctionReason?.trim() || null
    };
    let rows;
    if (input.attendanceEntryId) {
      if (!body.correction_reason) throw new Error('A correction reason is required when changing an existing operational entry.');
      rows = await request('operational_attendance_entries', {
        attendance_entry_id:`eq.${input.attendanceEntryId}`,
        select:'attendance_entry_id,child_pk,entry_date,activity_type,activity_source_label,attendance_code,reason_for_absence,notes,baseline_child_attendance_day_id,correction_reason,revision,created_by,created_at,updated_by,updated_at'
      }, {method:'PATCH', body, prefer:'return=representation'});
    } else {
      if (input.baselineDayId && !body.correction_reason) throw new Error('A correction reason is required when overriding imported Phase 1 attendance.');
      rows = await request('operational_attendance_entries', {
        select:'attendance_entry_id,child_pk,entry_date,activity_type,activity_source_label,attendance_code,reason_for_absence,notes,baseline_child_attendance_day_id,correction_reason,revision,created_by,created_at,updated_by,updated_at'
      }, {
        method:'POST',
        body:{
          child_pk:input.childPk,
          entry_date:input.entryDate,
          activity_type:input.activityType,
          activity_source_label:sourceLabel,
          attendance_code:body.attendance_code,
          reason_for_absence:body.reason_for_absence,
          notes:body.notes,
          baseline_child_attendance_day_id:input.baselineDayId || null,
          correction_reason:body.correction_reason
        },
        prefer:'return=representation'
      });
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error('The attendance save returned no persisted row.');
    return row;
  }
  async function loadMonth(children, isoMonthValue) {
    const {academicYear,monthLabel} = sourcePeriod(isoMonthValue);
    const months = await fetchAll('child_attendance_months', {
      select:'child_attendance_month_id,child_pk,academic_year,month_label,program_source_label,program_subtype_batch,source_status,source_present_count,source_absent_count,source_total_count,source_attendance_percentage,reason_for_absence,source_record_id',
      academic_year:`eq.${academicYear}`, month_label:`eq.${monthLabel}`
    });
    for (const c of children) { c.attendance={}; c.attendanceRaw={}; c.attendanceMeta={}; c.absences={}; c.therapy={}; c.therapySessions=[]; c.operationalEntries={}; c.backendAttendanceSummary=null; }
    const monthById = new Map(months.map(x=>[x.child_attendance_month_id,x]));
    const childByPk = new Map(children.map(c=>[c.childPk,c]));
    const ids = months.map(x=>x.child_attendance_month_id);
    const dayRows=[];
    for (let i=0;i<ids.length;i+=60) {
      const chunk=ids.slice(i,i+60); if (!chunk.length) continue;
      dayRows.push(...await fetchAll('child_attendance_days', {select:'child_attendance_day_id,child_attendance_month_id,day_of_month,attendance_code', child_attendance_month_id:`in.(${chunk.join(',')})`}));
    }
    const codesByDate = new Map();
    for (const m of months) {
      const c = childByPk.get(m.child_pk); if (!c) continue;
      if (mainAttendanceLabels.has(m.program_source_label)) {
        const prev=c.backendAttendanceSummary||{present:0,absent:0,total:0,sourcePrograms:[],rawRows:[]};
        prev.present+=Number(m.source_present_count||0); prev.absent+=Number(m.source_absent_count||0); prev.total+=Number(m.source_total_count||0);
        if(!prev.sourcePrograms.includes(m.program_source_label))prev.sourcePrograms.push(m.program_source_label); prev.rawRows.push(m);
        prev.percent=prev.total?100*prev.present/prev.total:(m.source_attendance_percentage===null?null:Number(m.source_attendance_percentage));
        c.backendAttendanceSummary=prev;
      }
    }
    for (const d of dayRows) {
      const m = monthById.get(d.child_attendance_month_id); if (!m) continue;
      const c = childByPk.get(m.child_pk); if (!c) continue;
      const date = `${isoMonthValue}-${String(d.day_of_month).padStart(2,'0')}`;
      const code = d.attendance_code;
      if (!codesByDate.has(date)) codesByDate.set(date,[]); if (code) codesByDate.get(date).push(code);
      if (mainAttendanceLabels.has(m.program_source_label)) {
        if (code) c.attendanceRaw[date]=code;
        if (code) c.attendanceMeta[date]={sourceProgram:m.program_source_label,baselineDayId:d.child_attendance_day_id||null,operational:false};
        if (code==='P' || code==='A') c.attendance[date]=code;
        if (code==='A' && m.reason_for_absence) c.absences[date]={reason:m.reason_for_absence,followup:'Source reason recorded at monthly-row level'};
      } else if (therapyLabels[m.program_source_label] && code) {
        const session={date,type:therapyLabels[m.program_source_label],code,attended:code==='P',sourceProgram:m.program_source_label,baselineDayId:d.child_attendance_day_id||null,operational:false};
        c.therapySessions.push(session);
        if (!c.therapy[date] && (code==='P'||code==='A')) c.therapy[date]={type:session.type,attended:session.attended,code};
      }
    }
    const operationalRows = await loadOperationalMonth(children, isoMonthValue);
    const holidays={};
    for (const [date,codes] of codesByDate) if (codes.includes('H') && !codes.some(x=>x==='P'||x==='A')) holidays[date]='Source holiday/centre closed';
    return {holidays, monthRows:months.length, dayRows:dayRows.length, operationalRows:operationalRows.length, academicYear, monthLabel};
  }
  async function loadWorkspace() {
    validateConfig();
    const [childRows, adlRows, devRows, periods] = await Promise.all([
      fetchAll('children',{select:'child_pk,child_id,child_name,centre_name,gender,date_of_birth,enrollment_date,status,disability_type,disability_sub_type,severity,current_program_source,exit_date,exit_reason,notes',order:'child_name.asc'}),
      fetchAll('adl_assessments',{select:'adl_assessment_id,child_pk,academic_year,goals_planned,goals_independent_score_4,goals_supervision_score_3,goals_limited_assistance_score_2,goals_extensive_assistance_score_1,goals_fully_dependent_score_0,notes,mark_issue'}),
      fetchAll('development_assessments',{select:'development_assessment_id,child_pk,academic_year,term,domain_type,goals_planned,goals_progressed,goals_slightly_progressed,goals_not_progressed,notes,mark_issue'}),
      fetchAll('child_attendance_months',{select:'academic_year,month_label'})
    ]);
    if (!childRows.length) throw new Error('No child rows were returned. The frontend is wired to Supabase, but Data API grants/RLS policies currently do not allow this client to read the Phase 1 tables.');
    const children=childRows.map(childModel), byPk=new Map(children.map(c=>[c.childPk,c]));
    for (const r of adlRows) byPk.get(r.child_pk)?.backendAdl.push(r);
    for (const r of devRows) byPk.get(r.child_pk)?.backendDevelopment.push(r);
    const availableMonths=[...new Set(periods.map(x=>isoMonth(x.academic_year,x.month_label)).filter(Boolean))].sort();
    const selectedMonth=availableMonths.at(-1)||cfg.defaultMonth||'2026-09';
    const monthData=await loadMonth(children,selectedMonth);
    return {children,availableMonths,selectedMonth,...monthData};
  }
  window.TamaharBackend={loadWorkspace,loadMonth,sourcePeriod,isoMonth,programmeSourceLabel,saveOperationalAttendance,writeEnabled};
})();
