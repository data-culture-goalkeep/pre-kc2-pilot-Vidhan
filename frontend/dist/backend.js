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
  async function request(table, params = {}) {
    const u = new URL(`${REST}/${table}`);
    for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    const res = await fetch(u, {headers: await headers()});
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j.message || j.hint || JSON.stringify(j); } catch { detail = await res.text(); }
      const accessHint = res.status===401 ? ' Authentication is required or the session is invalid.' : res.status===403 ? ' Data API grants/RLS do not permit this request.' : '';
      const err = new Error(`Supabase ${res.status}: ${detail || res.statusText}.${accessHint}`);
      err.status = res.status; throw err;
    }
    return res.json();
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
      age:ageAt(r.date_of_birth), severity:r.severity || 'Not recorded', enrolled:r.enrollment_date || '1900-01-01',
      moves:[], exit:r.exit_date || '', status:r.status || '', disabilityType:r.disability_type || '', disabilitySubType:r.disability_sub_type || '',
      attendance:{}, attendanceRaw:{}, absences:{}, therapy:{}, therapySessions:[], goals:[blankGoal()], adl:[], quarterly:[], behaviours:[], home:[], work:[], developmental:[], parentSessions:[],
      backendAdl:[], backendDevelopment:[], backendAttendanceSummary:null, backendRaw:r
    };
  }
  async function loadMonth(children, isoMonthValue) {
    const {academicYear,monthLabel} = sourcePeriod(isoMonthValue);
    const months = await fetchAll('child_attendance_months', {
      select:'child_attendance_month_id,child_pk,academic_year,month_label,program_source_label,program_subtype_batch,source_status,source_present_count,source_absent_count,source_total_count,source_attendance_percentage,reason_for_absence,source_record_id',
      academic_year:`eq.${academicYear}`, month_label:`eq.${monthLabel}`
    });
    for (const c of children) { c.attendance={}; c.attendanceRaw={}; c.absences={}; c.therapy={}; c.therapySessions=[]; c.backendAttendanceSummary=null; }
    const monthById = new Map(months.map(x=>[x.child_attendance_month_id,x]));
    const childByPk = new Map(children.map(c=>[c.childPk,c]));
    const ids = months.map(x=>x.child_attendance_month_id);
    const dayRows=[];
    for (let i=0;i<ids.length;i+=60) {
      const chunk=ids.slice(i,i+60); if (!chunk.length) continue;
      dayRows.push(...await fetchAll('child_attendance_days', {select:'child_attendance_month_id,day_of_month,attendance_code', child_attendance_month_id:`in.(${chunk.join(',')})`}));
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
        if (code==='P' || code==='A') c.attendance[date]=code;
        if (code==='A' && m.reason_for_absence) c.absences[date]={reason:m.reason_for_absence,followup:'Source reason recorded at monthly-row level'};
      } else if (therapyLabels[m.program_source_label] && code) {
        const session={date,type:therapyLabels[m.program_source_label],code,attended:code==='P',sourceProgram:m.program_source_label};
        c.therapySessions.push(session);
        if (!c.therapy[date] && (code==='P'||code==='A')) c.therapy[date]={type:session.type,attended:session.attended,code};
      }
    }
    const holidays={};
    for (const [date,codes] of codesByDate) if (codes.includes('H') && !codes.some(x=>x==='P'||x==='A')) holidays[date]='Source holiday/centre closed';
    return {holidays, monthRows:months.length, dayRows:dayRows.length, academicYear, monthLabel};
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
  window.TamaharBackend={loadWorkspace,loadMonth,sourcePeriod,isoMonth};
})();
