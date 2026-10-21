(() => {
  'use strict';

  const PROGRAMMES = [
    'Early Intervention',
    'Nursery',
    'Functional Academics',
    'Prevocational & Sheltered Workshop'
  ];
  const PROGRAMME_COLORS = ['#245b36','#96b940','#dfb920','#527a96'];
  const THERAPIES = ['Occupational therapy','Visual therapy','Speech therapy','Physical therapy'];
  const cfg = window.TAMAHAR_CONFIG || {};
  const attendanceDateKey = 'tamahar.attendance.selectedDate.v2';
  const attendanceZone = 'Asia/Kolkata';
  function todayInProgrammeZone(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:attendanceZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part = type => parts.find(x=>x.type===type)?.value;
    return [part('year'),part('month'),part('day')].join('-');
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const d = new Date(value + 'T12:00:00Z');
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value;
  }
  function storedDate() {
    try { const v=window.sessionStorage.getItem(attendanceDateKey);return validDate(v)?v:null; } catch {return null;}
  }
  function rememberDate(value) {
    try { if(validDate(value)) window.sessionStorage.setItem(attendanceDateKey,value);else window.sessionStorage.removeItem(attendanceDateKey); } catch {}
  }
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const state = {
    page: 'today',
    childTab: 'overview',
    children: [],
    month: cfg.defaultMonth || '2026-09',
    programmeFilter: 'all',
    search: '',
    selectedId: null,
    entryDate: null,
    holidays: {},
    availableMonths: [],
    saveKeys: new Set(),
    bulkSaving: false,
    batchFailures: [],
    writeMessage: '',
    progressYear: 'all',
    progressStudent: 'all',
    progressSort: 'name',
    monthLoading: false
  };

  function programmeName(index) {
    return PROGRAMMES[index] || 'Not currently enrolled / unmapped';
  }
  function monthDates(isoMonth) {
    const [year, month] = isoMonth.split('-').map(Number);
    const n = new Date(year, month, 0).getDate();
    return Array.from({length:n}, (_, i) => `${isoMonth}-${String(i + 1).padStart(2,'0')}`);
  }
  function childById(id) {
    return state.children.find(c => c.id === Number(id));
  }
  function visibleChildren() {
    const q = state.search.trim().toLowerCase();
    return state.children.filter(c => {
      const programmeMatches = state.programmeFilter === 'all' || c.programme === Number(state.programmeFilter);
      const searchMatches = !q || [c.name,c.sourceId,c.centre,c.status,c.programmeSource].some(v => String(v || '').toLowerCase().includes(q));
      return programmeMatches && searchMatches;
    });
  }
  function tamaharClaims() {
    return window.TamaharAuth?.getUser?.()?.app_metadata?.tamahar || {};
  }
  function writeMode() {
    return window.TamaharBackend?.writeEnabled?.() === true;
  }
  function canWriteProgramme() {
    return writeMode() && ['administrator','management','programme_manager','teacher'].includes(String(tamaharClaims().role || ''));
  }
  function canWriteTherapy() {
    return writeMode() && ['administrator','management','therapist'].includes(String(tamaharClaims().role || ''));
  }
  function therapyLabel(source) {
    return ({'TH-OT':'Occupational therapy','TH-VT':'Visual therapy','TH-ST':'Speech therapy','TH-PT':'Physical therapy'})[source] || source;
  }
  function codeOptions(selected='') {
    return ['','P','A','H','NS','PwC'].map(code => `<option value="${esc(code)}" ${code===selected?'selected':''}>${code || 'Choose…'}</option>`).join('');
  }
  function programmeWritable(c) {
    return canWriteProgramme() && !!window.TamaharBackend?.programmeSourceLabel?.(c.programmeSource);
  }
  function writeNotice() {
    if (!writeMode()) return '<div class="callout">Phase 3 writes are disabled in this build. Existing Phase 2 data remains read-only.</div>';
    return state.writeMessage ? `<div class="callout">${esc(state.writeMessage)}</div>` : '';
  }
  function attendanceStats(c) {
    const x = c.backendAttendanceSummary;
    if (!x) return {present:0, absent:0, total:0, percent:null};
    return {
      present:Number(x.present || 0),
      absent:Number(x.absent || 0),
      total:Number(x.total || 0),
      percent:x.percent == null ? null : Math.round(Number(x.percent)),
      pwc:Number(x.pwc || 0),
      holidays:Number(x.holidays || 0),
      notScheduled:Number(x.notScheduled || 0)
    };
  }
  function pill(text, kind='') {
    return `<span class="pill ${kind}">${esc(text)}</span>`;
  }
  function header(kicker, title, intro) {
    return `<div class="eyebrow">${esc(kicker)}</div><h1 class="title">${esc(title)}</h1><p class="intro">${esc(intro)}</p>`;
  }
  function bar(label, value, max, color='#96b940') {
    const width = max ? Math.min(100, Math.max(0, 100 * value / max)) : 0;
    return `<div class="bar-row"><span>${esc(label)}</span><div class="bar"><i style="width:${width}%;background:${color}"></i></div><strong>${esc(value)}</strong></div>`;
  }
  function setStatus(text) {
    const el = $('data-status');
    if (el) el.textContent = text;
  }
  function showLoading(text) {
    renderNav();
    $('view').innerHTML = `<section class="card card-pad"><h2 class="section-title">${esc(text)}</h2><p class="muted">Please wait.</p></section>`;
  }
  function showLogin(message = '') {
    $('nav').innerHTML = '';
    $('crumb').textContent = 'Staff sign in';
    setStatus('Authentication required');
    $('view').innerHTML = `<section class="card card-pad auth-card"><div class="eyebrow">Tamahar staff access</div><h1 class="title">Sign in to the Programme Workspace</h1><p class="intro">Use the Supabase Auth account that was provisioned for this pilot. Your session is kept in this browser and refreshed automatically.</p>${message ? `<div class="callout auth-error">${esc(message)}</div>` : ''}<form class="auth-form" onsubmit="TamaharUI.signIn(event)"><label>Email<input id="auth-email" type="email" autocomplete="username" required></label><label>Password<input id="auth-password" type="password" autocomplete="current-password" required></label><div class="auth-actions"><button class="btn" type="submit">Sign in</button><button class="btn ghost" type="button" onclick="TamaharUI.showForgotPassword()">Forgot password</button></div></form></section>`;
  }
  function showForgotPassword(message = '') {
    $('nav').innerHTML = '';
    $('crumb').textContent = 'Password recovery';
    setStatus('Password recovery');
    $('view').innerHTML = `<section class="card card-pad auth-card"><div class="eyebrow">Tamahar staff access</div><h1 class="title">Reset your password</h1><p class="intro">Enter the email address for your existing Tamahar account. One recovery email will be sent; the app does not automatically retry or resend.</p>${message ? `<div class="callout auth-error">${esc(message)}</div>` : ''}<form class="auth-form" onsubmit="TamaharUI.requestPasswordReset(event)"><label>Email<input id="recovery-email" type="email" autocomplete="email" required></label><div class="auth-actions"><button class="btn" type="submit">Send recovery email</button><button class="btn ghost" type="button" onclick="TamaharUI.showLogin()">Back to sign in</button></div></form></section>`;
  }
  function showRecoveryError(message) {
    $('nav').innerHTML = '';
    $('crumb').textContent = 'Password recovery';
    setStatus('Recovery link invalid');
    $('view').innerHTML = `<section class="card card-pad auth-card"><div class="eyebrow">Recovery link problem</div><h1 class="title">This password-reset link cannot be used</h1><div class="callout auth-error">${esc(message || 'The recovery link is invalid or has expired.')}</div><p class="muted">Request a new recovery email after Supabase's email rate limit has cleared. Do not keep reusing this expired link.</p><div class="auth-actions"><button class="btn" onclick="TamaharUI.showForgotPassword()">Request a new link</button><button class="btn ghost" onclick="TamaharUI.showLogin()">Back to sign in</button></div></section>`;
  }
  function showSetPassword(message = '') {
    $('nav').innerHTML = '';
    $('crumb').textContent = 'Set new password';
    setStatus('Recovery session verified');
    $('view').innerHTML = `<section class="card card-pad auth-card"><div class="eyebrow">Tamahar staff access</div><h1 class="title">Set a new password</h1><p class="intro">Your recovery link has been verified. Choose a new password for this existing account.</p>${message ? `<div class="callout auth-error">${esc(message)}</div>` : ''}<form class="auth-form" onsubmit="TamaharUI.updatePassword(event)"><label>New password<input id="new-password" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm new password<input id="confirm-password" type="password" autocomplete="new-password" minlength="8" required></label><div class="auth-actions"><button class="btn" type="submit">Set new password</button></div></form></section>`;
  }
  function showError(error) {
    const isAuth = error?.status === 401;
    const isDenied = error?.status === 403;
    if (isAuth) {
      showLogin('Your session is missing or expired. Sign in again.');
      return;
    }
    setStatus(isDenied ? 'Access denied' : 'Backend access pending');
    const title = isDenied ? 'Your current access is not permitted' : 'Programme Workspace unavailable';
    const detail = isDenied
      ? 'You are signed in, but the existing Tamahar app_metadata scope does not permit these records.'
      : 'The Phase 1 Supabase integration is configured, but this request could not be completed.';
    $('view').innerHTML = `<section class="card card-pad error-state"><div class="eyebrow">${isDenied ? 'Access denied' : 'Connection unavailable'}</div><h1 class="title">${esc(title)}</h1><p class="intro">${esc(error?.message || error)}</p><div class="callout">${esc(detail)}</div><div class="state-actions"><button class="btn" onclick="TamaharUI.retry()">Retry connection</button>${window.TamaharAuth?.getSession?.() ? '<button class="btn ghost" onclick="TamaharUI.signOut()">Clear saved session</button>' : ''}</div></section>`;
  }
  function backendBanner() {
    if (writeMode()) {
      return '<div class="callout" style="margin-bottom:18px"><strong>Controlled attendance entry enabled.</strong> Authorized programme and therapy attendance writes are stored separately from the immutable Phase 1 source records.</div>';
    }
    return '<div class="callout" style="margin-bottom:18px"><strong>Phase 2 · read-only Supabase integration.</strong> The original Programme Workspace is connected only to the existing Phase 1 backend. Real records appear when the current Supabase access context is authorized; no demo data is used.</div>';
  }
  function filters() {
    return `<div class="filters"><label class="field-inline">Month <input type="month" value="${esc(state.month)}" onchange="TamaharUI.setMonth(this.value)"></label><label class="field-inline">Programme <select onchange="TamaharUI.setProgramme(this.value)"><option value="all">All programmes</option>${PROGRAMMES.map((name,i)=>`<option value="${i}" ${String(state.programmeFilter)===String(i)?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label class="field-inline search-field">Search <input type="search" placeholder="Child, ID, centre…" value="${esc(state.search)}" oninput="TamaharUI.setSearch(this.value)"></label></div>`;
  }

  function renderNav() {
    const items = [
      ['today','Monthly work'],
      ['mark','✎ Daily attendance'],
      ['children','Children'],
      ['programmes','General info'],
      ['progress','Child progress'],
      ['student-dashboard','Student Progress Dashboard']
    ];
    $('nav').innerHTML = items.map(([key,label]) => `<button class="${state.page===key || (state.page==='child' && key==='children') ? 'active':''}" onclick="TamaharUI.go('${key}')">${label}</button>`).join('') + (window.TamaharAuth?.getSession?.() ? '<button onclick="TamaharUI.signOut()">Clear saved session</button>' : '');
    $('crumb').textContent = items.find(([key]) => key === state.page)?.[1] || (state.page === 'child' ? 'Child record' : 'Programme workspace');
  }

  function childTable(rows) {
    if (!rows.length) return '<div class="empty">No child records match this view.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>Child</th><th>Programme</th><th>Status</th><th>Enrolled</th><th>Attendance</th><th></th></tr></thead><tbody>${rows.map(c=>{const a=attendanceStats(c);return `<tr class="clickable" onclick="TamaharUI.openChild(${c.id})"><td><strong>${esc(c.name)}</strong><br><small class="muted">${esc(c.sourceId)}</small></td><td>${esc(programmeName(c.programme))}</td><td>${esc(c.status || '—')}</td><td>${esc(c.enrolled || '—')}</td><td>${a.percent==null?'—':a.percent+'%'}</td><td>Open →</td></tr>`}).join('')}</tbody></table></div>`;
  }

  function dashboard() {
    const rows = visibleChildren();
    const withAttendance = rows.filter(c => c.backendAttendanceSummary);
    const low = withAttendance.filter(c => attendanceStats(c).percent != null && attendanceStats(c).percent < 80);
    const therapyEntries = rows.reduce((n,c)=>n+(c.therapySessions || []).filter(x=>x.date.startsWith(state.month)).length,0);
    return header('Programme work', `${new Date(state.month+'-01T12:00:00').toLocaleString('en',{month:'long',year:'numeric'})} work`, 'Review effective attendance, therapy participation and child records. Imported Phase 1 records remain unchanged.') + filters() +
      `<div class="metrics"><div class="card metric-card"><span>Children in view</span><div class="metric">${rows.length}</div><small>Accessible Phase 1 child records</small></div><div class="card metric-card"><span>Attendance rows</span><div class="metric">${withAttendance.length}</div><small>Children with matching monthly source rows</small></div><div class="card metric-card"><span>Below 80%</span><div class="metric">${low.length}</div><small>Using effective daily attendance</small></div><div class="card metric-card"><span>Therapy entries</span><div class="metric">${therapyEntries}</div><small>TH-* daily source codes</small></div></div>` +
      `<div class="grid"><section class="card card-pad"><h2 class="section-title">Attendance review</h2><p class="muted">Monthly attendance is derived from effective daily codes: P and PwC count as present, A counts as absent, and H / NS are excluded from the total. Imported monthly source fields remain unchanged.</p>${PROGRAMMES.map((name,i)=>{const group=rows.filter(c=>c.programme===i), values=group.map(c=>attendanceStats(c).percent).filter(v=>v!=null);const avg=values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;return bar(name,avg,100,PROGRAMME_COLORS[i])}).join('')}</section><section class="card card-pad"><h2 class="section-title">Children needing review</h2>${childTable(low.slice(0,10))}</section></div>`;
  }

  function dailyAttendance() {
    const rows = visibleChildren();
    const date = state.entryDate?.startsWith(state.month) ? state.entryDate : `${state.month}-01`;
    const body = rows.map(c => {
      const code = c.attendanceRaw?.[date] || c.attendance?.[date] || '';
      const meta = c.attendanceMeta?.[date] || {};
      const therapy = (c.therapySessions || []).filter(x => x.date === date);
      const programmeEditor = programmeWritable(c)
        ? `<form class="inline-edit" data-child-id="${c.id}" onsubmit="TamaharUI.saveProgrammeAttendance(event,${c.id},'${date}')"><input type="checkbox" name="bulkSelected" aria-label="Select ${esc(c.name)} for batch save"><select name="attendanceCode" required>${codeOptions(code)}</select><input name="reason" placeholder="Absence reason" value="${esc(c.absences?.[date]?.reason || '')}"><input name="correctionReason" placeholder="${meta.operational || meta.baselineExists ? 'Correction reason required' : 'Correction reason (optional)'}" ${meta.operational || meta.baselineExists ? 'required' : ''}><button class="btn compact" type="submit">Save</button></form>`
        : pill(code || '—', code==='A'?'warn':code==='P'?'':'grey');
      const therapyDisplay = therapy.map(x=>`${esc(x.type)} · ${pill(x.code,x.code==='A'?'warn':x.code==='P'?'':'grey')}`).join('<br>') || '—';
      const therapyEditor = canWriteTherapy()
        ? `<button class="btn ghost compact" type="button" onclick="TamaharUI.openTherapyEditor(${c.id},'${date}')">Record therapy</button>`
        : '';
      return `<tr><td><button class="text-link" onclick="TamaharUI.openChild(${c.id})">${esc(c.name)}</button></td><td>${esc(programmeName(c.programme))}</td><td>${programmeEditor}</td><td>${therapyDisplay}<div class="cell-actions">${therapyEditor}</div></td><td>${esc(c.absences?.[date]?.reason || '—')}</td></tr>`;
    }).join('');
    return header('Daily entry','Attendance and therapy', writeMode() ? 'Record authorized operational attendance without changing imported Phase 1 source rows.' : 'Read-only migrated daily source codes for the selected date.') + filters() + writeNotice() + `<section class="card card-pad"><div class="row"><label class="field-inline">Class day <input type="date" min="${state.month}-01" max="${monthDates(state.month).at(-1)}" value="${date}" onchange="TamaharUI.setEntryDate(this.value)"></label><button class="btn ghost compact" type="button" onclick="TamaharUI.todayAttendance()">Today</button><span class="muted">Operational corrections overlay the immutable Phase 1 baseline after reload.</span></div>${canWriteProgramme()?`<div class="row" style="margin:12px 0;gap:12px;flex-wrap:wrap"><button class="btn" type="button" data-batch-save onclick="TamaharUI.saveSelectedAttendance(event)" ${state.bulkSaving?'disabled':''}>${state.bulkSaving?'Saving selected…':'Save selected attendance' }</button><button class="btn ghost compact" type="button" onclick="TamaharUI.selectAllAttendance(true)">Select all</button><button class="btn ghost compact" type="button" onclick="TamaharUI.selectAllAttendance(false)">Clear</button><span class="muted">Check the children to save together. Unselected records stay unchanged.</span></div>`:""}<div class="table-wrap"><table><thead><tr><th>Child</th><th>Programme</th><th>Class code / entry</th><th>Therapy on this date</th><th>Absence reason</th></tr></thead><tbody>${body || '<tr><td colspan="5">No records.</td></tr>'}</tbody></table></div></section>`;
  }

  function studentVisuals(rows) {
    const groups = PROGRAMMES.map((name,i)=>({name,count:rows.filter(c=>c.programme===i).length,color:PROGRAMME_COLORS[i]}));
    const statuses = new Map();
    rows.forEach(c=>{const label=String(c.status || 'Not recorded').trim() || 'Not recorded';statuses.set(label,(statuses.get(label)||0)+1);});
    const valid = rows.filter(c=>attendanceStats(c).total>0);
    const present=valid.reduce((n,c)=>n+attendanceStats(c).present,0);
    const total=valid.reduce((n,c)=>n+attendanceStats(c).total,0);
    const percent=total?Math.round(100*present/total):null;
    return `<div class="metrics"><div class="card metric-card"><span>Children in view</span><div class="metric">${rows.length}</div></div><div class="card metric-card"><span>Attendance recorded</span><div class="metric">${valid.length}</div><small>Children with eligible days in selected month</small></div><div class="card metric-card"><span>Combined attendance</span><div class="metric">${percent===null?'—':percent+'%'}</div><small>Sum(P + PwC) / Sum(P + PwC + A)</small></div><div class="card metric-card"><span>Programme groups</span><div class="metric">${groups.filter(g=>g.count).length}</div></div></div><div class="grid"><section class="card card-pad"><h2 class="section-title">Children by programme</h2>${groups.map(g=>bar(g.name,g.count,Math.max(rows.length,1),g.color)).join('')}</section><section class="card card-pad"><h2 class="section-title">Recorded student statuses</h2>${[...statuses].sort((a,b)=>b[1]-a[1]).map(([label,n])=>bar(label,n,Math.max(rows.length,1),'#527a96')).join('') || '<p class="muted">No matching children.</p>'}</section></div>`;
  }

  function childrenPage() {
    return header('Records','Children','Open a child to review master data, attendance, therapy and Phase 1 assessments.') + filters() + studentVisuals(visibleChildren()) + `<section class="card card-pad" style="margin-bottom:18px"><h2 class="section-title">Backend-connected records</h2><p class="muted">Creation and editing are intentionally disabled until Phase 2 authorization and write/audit rules are approved.</p></section><section class="card">${childTable(visibleChildren())}</section>`;
  }

  function severityComparison(rows) {
    const labels = ['Mild','Moderate','Severe','Not recorded'];
    const counts = labels.map(label => rows.filter(c => (c.severity || 'Not recorded') === label).length);
    const colors = ['#96b940','#dfb920','#b45336','#a6aead'];
    return `<section class="card card-pad comparison-card"><h2 class="section-title">Severity in current view</h2>${labels.map((label,i)=>bar(label,counts[i],Math.max(1,rows.length),colors[i])).join('')}</section>`;
  }

  function programmeReview() {
    const rows = visibleChildren();
    const groups = PROGRAMMES.map((name,i)=>({name,i,rows:rows.filter(c=>c.programme===i)}));
    return header('Programme review','General info','Read-only comparison of accessible Phase 1 child, attendance and therapy records.') + filters() +
      severityComparison(rows) +
      `<div class="grid"><section class="card card-pad"><h2 class="section-title">Attendance by programme</h2>${groups.map(g=>{const vals=g.rows.map(c=>attendanceStats(c).percent).filter(v=>v!=null);const avg=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;return bar(g.name,avg,100,PROGRAMME_COLORS[g.i])}).join('')}<p class="notice">Programme bars use effective daily attendance after operational corrections: (P + PwC) / (P + PwC + A).</p></section><section class="card card-pad"><h2 class="section-title">Therapy participation</h2>${THERAPIES.map(t=>{const n=rows.filter(c=>(c.therapySessions||[]).some(x=>x.date.startsWith(state.month)&&x.type===t&&x.code==='P')).length;return bar(t,n,Math.max(1,rows.length),'#527a96')}).join('')}<p class="notice">Distinct children with at least one P-coded therapy entry in the selected month.</p></section></div>` +
      `<p class="callout">Goal, behaviour, home-guidance and other prototype comparisons are intentionally omitted because they do not have approved Phase 1 persistence structures.</p>`;
  }

  function progressPage() {
    const rows = visibleChildren();
    const adl = rows.reduce((n,c)=>n+(c.backendAdl || []).length,0);
    const dev = rows.reduce((n,c)=>n+(c.backendDevelopment || []).length,0);
    return header('Programme review','Child progress','Review migrated ADL and development assessment records without synthetic score conversions.') + filters() + `<div class="metrics"><div class="card metric-card"><span>Children in view</span><div class="metric">${rows.length}</div></div><div class="card metric-card"><span>ADL records</span><div class="metric">${adl}</div></div><div class="card metric-card"><span>Development records</span><div class="metric">${dev}</div></div><div class="card metric-card"><span>Cross-scale score</span><div class="metric">—</div><small>Not invented</small></div></div><section class="card card-pad"><h2 class="section-title">Open a child for assessment detail</h2>${childTable(rows)}</section>`;
  }


  // Assessments carry academic years and terms, not exact observation dates.
  // Describe recorded outcomes; do not infer longitudinal improvement from goal counts.
  function assessmentYears(rows) {
    return [...new Set(rows.flatMap(c=>[...(c.backendAdl||[]),...(c.backendDevelopment||[])].map(r=>r.academic_year).filter(Boolean)))].sort();
  }
  function progressRows() {
    return visibleChildren().filter(c=>state.progressStudent==='all'||c.childPk===state.progressStudent);
  }
  function progressAssessments(c) {
    const inYear=r=>state.progressYear==='all'||r.academic_year===state.progressYear;
    return {adl:(c.backendAdl||[]).filter(inYear),dev:(c.backendDevelopment||[]).filter(inYear)};
  }
  function selectedProgressDetail(childPk) {
    const c=state.children.find(x=>x.childPk===childPk);
    if(c){state.selectedId=c.id;state.childTab='assessments';state.page='child';render();}
  }
  function studentProgressDashboard() {
    const scoped=visibleChildren(),years=assessmentYears(scoped),rows=progressRows();
    const records=rows.map(c=>({c,...progressAssessments(c)}));
    const assessed=records.filter(x=>x.adl.length+x.dev.length>0);
    const dev=records.flatMap(x=>x.dev.filter(r=>!r.mark_issue));
    const adl=records.flatMap(x=>x.adl.filter(r=>!r.mark_issue));
    const counts=new Map();
    for(const r of dev){
      const domain=String(r.domain_type||'Unspecified').trim();
      const k=domain+'|'+String(r.term||'Unspecified');
      if(!counts.has(k))counts.set(k,{domain,term:r.term||'Unspecified',observations:0,planned:0,progressed:0,slightly:0,not:0});
      const v=counts.get(k);v.observations++;
      for(const [field,target] of [['goals_planned','planned'],['goals_progressed','progressed'],['goals_slightly_progressed','slightly'],['goals_not_progressed','not']]){
        if(Number.isInteger(r[field])&&r[field]>=0)v[target]+=r[field];
      }
    }
    const groups=[...new Set(scoped.map(c=>programmeName(c.programme)))].sort().map(name=>{
      const group=records.filter(x=>programmeName(x.c.programme)===name);
      const covered=group.filter(x=>x.adl.length+x.dev.length>0).length;
      return {name,total:group.length,covered};
    });
    const sorted=[...records].sort((x,y)=>state.progressSort==='records'
      ? (y.adl.length+y.dev.length)-(x.adl.length+x.dev.length)
      : String(x.c.name).localeCompare(String(y.c.name)));
    const yearOptions=years.map(y=>`<option value="${esc(y)}" ${state.progressYear===y?'selected':''}>${esc(y)}</option>`).join('');
    const studentOptions=scoped.map(c=>`<option value="${esc(c.childPk)}" ${state.progressStudent===c.childPk?'selected':''}>${esc(c.name)} · ${esc(c.sourceId)}</option>`).join('');
    return header('Assessment evidence','Student Progress Dashboard','Review recorded ADL independence categories and development goal outcomes. Academic-year/term records do not establish individual growth without comparable dated assessments.')
      + `<section class="card card-pad"><div class="filters"><label class="field-inline">Academic year <select onchange="TamaharUI.setProgressYear(this.value)"><option value="all">All available years</option>${yearOptions}</select></label><label class="field-inline">Programme <select onchange="TamaharUI.setProgramme(this.value)"><option value="all">All permitted programmes</option>${PROGRAMMES.map((n,i)=>`<option value="${i}" ${String(state.programmeFilter)===String(i)?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label class="field-inline">Student <select onchange="TamaharUI.setProgressStudent(this.value)"><option value="all">All students</option>${studentOptions}</select></label><button class="btn ghost compact" onclick="TamaharUI.resetProgressFilters()">Reset filters</button></div><p class="muted">Viewing ${esc(state.progressYear==='all'?'all available academic years':state.progressYear)} · ${esc(state.programmeFilter==='all'?'all permitted programmes':programmeName(Number(state.programmeFilter)))} · ${rows.length} student(s). Assessment dates are not stored; calendar-month presets would be misleading.</p></section>`
      + `<div class="metrics" style="margin-top:16px"><div class="card metric-card"><span>Students in scope</span><div class="metric">${rows.length}</div><small>Accessible children matching filters</small></div><div class="card metric-card"><span>With assessment records</span><div class="metric">${assessed.length}</div><small>${rows.length?(100*assessed.length/rows.length).toFixed(1):'—'}% of students in scope</small></div><div class="card metric-card"><span>Development observations</span><div class="metric">${dev.length}</div><small>Non-flagged domain/term rows</small></div><div class="card metric-card"><span>ADL observations</span><div class="metric">${adl.length}</div><small>Non-flagged academic-year rows</small></div></div>`
      + `<div class="grid"><section class="card card-pad"><h2 class="section-title">Assessment coverage by programme</h2><p class="muted">Assessed students / accessible students in each programme, within the selected academic year.</p>${groups.map(g=>`<div class="bar-row"><span>${esc(g.name)}</span><div class="bar"><i style="width:${g.total?100*g.covered/g.total:0}%"></i></div><strong>${g.covered}/${g.total}</strong></div>`).join('')||'<div class="empty">No students in scope.</div>'}</section><section class="card card-pad"><h2 class="section-title">ADL independence categories</h2><p class="muted">Number of goals recorded in each existing source category; these are distributions, not changes in independence over time.</p>${[['Independent (4)','goals_independent_score_4'],['Supervision (3)','goals_supervision_score_3'],['Limited assistance (2)','goals_limited_assistance_score_2'],['Extensive assistance (1)','goals_extensive_assistance_score_1'],['Fully dependent (0)','goals_fully_dependent_score_0']].map(([label,key])=>{const total=adl.reduce((n,r)=>n+(Number(r[key])||0),0),max=adl.reduce((n,r)=>n+Math.max(0,Number(r.goals_planned)||0),0);return bar(label,total,Math.max(max,total));}).join('')||'<div class="empty">No ADL records.</div>'}</section></div>`
      + `<section class="card card-pad" style="margin-top:18px"><h2 class="section-title">Development goal outcomes by source domain and term</h2><p class="muted">Goal counts are descriptive. A progressed goal is a recorded outcome, not evidence of improvement versus a previous assessment. Rows marked as issues are excluded.</p><div class="table-wrap"><table><thead><tr><th>Domain</th><th>Term</th><th>Observations</th><th>Goals planned</th><th>Progressed</th><th>Slightly progressed</th><th>Not progressed</th></tr></thead><tbody>${[...counts.values()].sort((a,b)=>a.domain.localeCompare(b.domain)||a.term.localeCompare(b.term)).map(g=>`<tr><td>${esc(g.domain)}</td><td>${esc(g.term)}</td><td>${g.observations}</td><td>${g.planned}</td><td>${g.progressed}</td><td>${g.slightly}</td><td>${g.not}</td></tr>`).join('')||'<tr><td colspan="7">No usable development observations for these filters.</td></tr>'}</tbody></table></div></section>`
      + `<section class="card card-pad" style="margin-top:18px"><div class="row"><h2 class="section-title">Student assessment detail</h2><label class="field-inline">Sort <select onchange="TamaharUI.setProgressSort(this.value)"><option value="name" ${state.progressSort==='name'?'selected':''}>Name</option><option value="records" ${state.progressSort==='records'?'selected':''}>Assessment count</option></select></label></div><p class="muted">Progress classification: insufficient comparable assessment evidence. This dataset does not provide exact assessment dates or a validated repeat-measure scoring method.</p><div class="table-wrap"><table><thead><tr><th>Student</th><th>Programme</th><th>ADL rows</th><th>Development rows</th><th>Available academic years</th><th>Evidence</th><th></th></tr></thead><tbody>${sorted.map(x=>{const yrs=[...new Set([...x.adl,...x.dev].map(r=>r.academic_year).filter(Boolean))].sort();return `<tr><td>${esc(x.c.name)}<small class="muted">${esc(x.c.sourceId)}</small></td><td>${esc(programmeName(x.c.programme))}</td><td>${x.adl.length}</td><td>${x.dev.length}</td><td>${esc(yrs.join(', ')||'—')}</td><td>${x.adl.length+x.dev.length?'Recorded outcomes; longitudinal comparison not validated':'Limited assessment evidence'}</td><td><button class="text-link" onclick="TamaharUI.openProgressChild('${esc(x.c.childPk)}')">Open →</button></td></tr>`}).join('')||'<tr><td colspan="7">No student assessments match the selected filters.</td></tr>'}</tbody></table></div></section>`;
  }

  function childHeader(c) {
    return `<div class="row"><button class="btn ghost" onclick="TamaharUI.go('children')">← Children</button>${pill(programmeName(c.programme))}</div>${header('Child record',c.name,`Age ${c.age} · ${c.severity || 'Severity not recorded'} · Enrolled ${c.enrolled || '—'} · Phase 1 backend record`)}`;
  }
  function childTabs(c) {
    const tabs = [['overview','Overview'],['attendance','Attendance'],['assessments','ADL & development'],['therapy','Therapy'],['goals','Goals'],['support','Behaviour & home']];
    if (c.programme === 3) tabs.push(['work','Work skills']);
    return `<div class="tabs">${tabs.map(([key,label])=>`<button class="${state.childTab===key?'active':''}" onclick="TamaharUI.setChildTab('${key}')">${label}</button>`).join('')}</div>`;
  }
  function childOverview(c) {
    const a = attendanceStats(c);
    return `<div class="grid"><section class="card card-pad"><h2 class="section-title">Child master record</h2><p><strong>Source ID:</strong> ${esc(c.sourceId)}</p><p><strong>Status:</strong> ${esc(c.status || '—')}</p><p><strong>Programme:</strong> ${esc(c.programmeSource || programmeName(c.programme))}</p><p><strong>Centre:</strong> ${esc(c.centre || '—')}</p><p><strong>Disability:</strong> ${esc([c.disabilityType,c.disabilitySubType].filter(Boolean).join(' · ') || '—')}</p><p><strong>Severity:</strong> ${esc(c.severity || '—')}</p></section><section class="card card-pad"><h2 class="section-title">Attendance this month</h2><div class="metric">${a.percent==null?'—':a.percent+'%'}</div><p class="muted">${a.present} present (including ${a.pwc} PwC) · ${a.absent} absent · effective total ${a.total}</p></section><section class="card card-pad"><h2 class="section-title">Assessments</h2><p>${(c.backendAdl||[]).length} ADL record(s)</p><p>${(c.backendDevelopment||[]).length} development record(s)</p></section><section class="card card-pad"><h2 class="section-title">Prototype-only features</h2><p class="muted">Goals, behaviour concerns, home guidance and work-skill entry are retained as navigation references but are not persisted because Phase 1 has no approved matching write tables.</p></section></div>`;
  }
  function childAttendance(c) {
    const month=state.month, prior=new Date(month+'-01T12:00:00Z');
    prior.setUTCMonth(prior.getUTCMonth()-1);
    const following=new Date(month+'-01T12:00:00Z');
    following.setUTCMonth(following.getUTCMonth()+1);
    const prev=prior.toISOString().slice(0,7),next=following.toISOString().slice(0,7);
    const available=state.availableMonths;
    const monthControls=`<div class="row" style="margin-bottom:14px;flex-wrap:wrap;gap:10px"><button class="btn ghost compact" onclick="TamaharUI.childMonth('${prev}')">← Previous</button><label class="field-inline">Month <input type="month" value="${esc(month)}" onchange="TamaharUI.childMonth(this.value)"></label><button class="btn ghost compact" onclick="TamaharUI.childMonth('${next}')">Next →</button><button class="btn ghost compact" onclick="TamaharUI.childMonth(todayInProgrammeZoneForUI())">Current month</button></div><p class="muted">Selected student: ${esc(c.name)} · ${esc(c.sourceId)}. Source months available: ${esc(available[0]||'none')} to ${esc(available.at(-1)||'none')}. You can also inspect a month without records.</p>`;
    const dates = monthDates(state.month);
    const first = new Date(`${state.month}-01T12:00:00`).getDay();
    const a = attendanceStats(c);
    return monthControls + `<div class="grid"><section class="card card-pad"><h2 class="section-title">${esc(state.month)} attendance</h2><p class="muted">P and PwC count as present; A counts as absent; H and NS are excluded from the monthly total. Daily source codes remain visible unchanged.</p><div class="month-grid">${Array.from({length:first},()=>'<span></span>').join('')}${dates.map((date,i)=>{const raw=c.attendanceRaw?.[date]||c.attendance?.[date]||'';return `<div class="day ${raw?'':'off'}"><strong>${i+1}</strong><small>${raw?pill(raw,raw==='A'?'warn':raw==='P'?'':'grey'):'—'}</small></div>`}).join('')}</div><p><strong>${a.percent==null?'Monthly percentage unavailable':a.percent+'%'}</strong> · ${a.present} present (including ${a.pwc} PwC) · ${a.absent} absent · effective total ${a.total}</p></section><section class="card card-pad"><h2 class="section-title">Absence reasons</h2><div class="list">${dates.filter(d=>c.attendance?.[d]==='A').map(d=>`<div class="item"><strong>${esc(d)}</strong><small>${esc(c.absences?.[d]?.reason || 'No source reason recorded')}</small></div>`).join('') || '<p class="muted">No P/A-coded absences for this month.</p>'}</div></section></div>`;
  }
  function childAssessments(c) {
    const adl = c.backendAdl || [];
    const dev = c.backendDevelopment || [];
    return `<div class="grid"><section class="card card-pad"><h2 class="section-title">ADL assessments · Phase 1 fields</h2><div class="table-wrap"><table><thead><tr><th>Year</th><th>Goals</th><th>Independent</th><th>Supervision</th><th>Limited</th><th>Extensive</th><th>Dependent</th></tr></thead><tbody>${adl.map(r=>`<tr><td>${esc(r.academic_year)}</td><td>${r.goals_planned??'—'}</td><td>${r.goals_independent_score_4??'—'}</td><td>${r.goals_supervision_score_3??'—'}</td><td>${r.goals_limited_assistance_score_2??'—'}</td><td>${r.goals_extensive_assistance_score_1??'—'}</td><td>${r.goals_fully_dependent_score_0??'—'}</td></tr>`).join('') || '<tr><td colspan="7">No ADL records.</td></tr>'}</tbody></table></div></section><section class="card card-pad"><h2 class="section-title">Development assessments · Phase 1 fields</h2><div class="table-wrap"><table><thead><tr><th>Year</th><th>Term</th><th>Domain</th><th>Planned</th><th>Progressed</th><th>Slightly</th><th>Not progressed</th></tr></thead><tbody>${dev.map(r=>`<tr><td>${esc(r.academic_year)}</td><td>${esc(r.term)}</td><td>${esc(r.domain_type)}</td><td>${r.goals_planned??'—'}</td><td>${r.goals_progressed??'—'}</td><td>${r.goals_slightly_progressed??'—'}</td><td>${r.goals_not_progressed??'—'}</td></tr>`).join('') || '<tr><td colspan="7">No development records.</td></tr>'}</tbody></table></div></section></div><p class="callout">The PM prototype's alternate ADL/development scales are not written to the database because they do not match the approved Phase 1 model.</p>`;
  }
  function childTherapy(c) {
    const sessions = (c.therapySessions || []).filter(x=>x.date.startsWith(state.month)).sort((a,b)=>a.date.localeCompare(b.date)||a.sourceProgram.localeCompare(b.sourceProgram));
    const entry = canWriteTherapy() ? `<section class="card card-pad" style="margin-bottom:18px"><h2 class="section-title">Record therapy attendance</h2><form class="write-form" onsubmit="TamaharUI.saveTherapyAttendance(event,${c.id})"><label>Date<input name="entryDate" type="date" min="${state.month}-01" max="${monthDates(state.month).at(-1)}" value="${state.entryDate?.startsWith(state.month)?state.entryDate:state.month+'-01'}" required></label><label>Therapy<select name="sourceLabel" required><option value="">Choose…</option><option value="TH-OT">Occupational therapy</option><option value="TH-PT">Physical therapy</option><option value="TH-ST">Speech therapy</option><option value="TH-VT">Visual therapy</option></select></label><label>Status<select name="attendanceCode" required>${codeOptions('')}</select></label><label>Reason / note<input name="reason" placeholder="Optional absence reason"></label><label>Correction reason<input name="correctionReason" placeholder="Required when correcting an existing or imported entry"></label><button class="btn" type="submit">Save therapy status</button></form></section>` : '';
    return writeNotice() + entry + `<section class="card card-pad"><h2 class="section-title">Therapy attendance</h2><p class="muted">Phase 1 TH-* rows remain unchanged; operational entries are overlaid after reload.</p><div class="table-wrap"><table><thead><tr><th>Date</th><th>Therapy</th><th>Code</th><th>Origin</th></tr></thead><tbody>${sessions.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${pill(x.code,x.code==='A'?'warn':x.code==='P'?'':'grey')}</td><td>${x.operational?'Operational':'Phase 1 source'}</td></tr>`).join('') || '<tr><td colspan="4">No therapy records for this month.</td></tr>'}</tbody></table></div></section>`;
  }
  function unsupported(title) {
    return `<section class="card card-pad"><h2 class="section-title">${esc(title)}</h2><p class="muted">This PM prototype feature does not have a directly matching approved Phase 1 persistence structure. It is intentionally not connected rather than inventing a new table or business rule.</p></section>`;
  }
  function childPage() {
    const c = childById(state.selectedId);
    if (!c) return '<section class="card card-pad"><p>No child selected.</p></section>';
    const views = {
      overview: childOverview,
      attendance: childAttendance,
      assessments: childAssessments,
      therapy: childTherapy,
      goals: () => unsupported('Goals / monthly goal reviews'),
      support: () => unsupported('Behaviour concerns, home guidance and parent sessions'),
      work: () => unsupported('Work skills')
    };
    return childHeader(c) + childTabs(c) + views[state.childTab](c);
  }

  function render() {
    renderNav();
    const pages = {today:dashboard, mark:dailyAttendance, children:childrenPage, programmes:programmeReview, progress:progressPage, 'student-dashboard':studentProgressDashboard, child:childPage};
    $('view').innerHTML = backendBanner() + pages[state.page]();
  }

  async function loadMonth(month) {
    showLoading(`Loading ${month} from Supabase…`);
    try {
      const result = await window.TamaharBackend.loadMonth(state.children, month);
      state.month = month;
      state.entryDate = state.entryDate?.startsWith(`${month}-`) ? state.entryDate : `${month}-01`;
      state.holidays = result.holidays || {};
      setStatus(`Connected · ${state.children.length} Phase 1 child records · ${writeMode()?'controlled attendance writes enabled':'read-only'}`);
      render();
    } catch (error) {
      console.error(error);
      showError(error);
    }
  }

  window.todayInProgrammeZoneForUI = () => todayInProgrammeZone().slice(0,7);
  window.TamaharUI = {
    openProgressChild(childPk) { selectedProgressDetail(childPk); },
    setProgressYear(value) { state.progressYear=value;render(); },
    setProgressStudent(value) { state.progressStudent=value;render(); },
    setProgressSort(value) { state.progressSort=value;render(); },
    resetProgressFilters() {state.progressYear='all';state.progressStudent='all';state.programmeFilter='all';state.search='';state.progressSort='name';render();},
    childMonth(value) {if(/^\\d{4}-\\d{2}$/.test(value))loadMonth(value);},
    go(page) { if(page==='mark' && state.page!=='mark' && !storedDate()) {state.entryDate=todayInProgrammeZone();state.month=state.entryDate.slice(0,7);loadMonth(state.month);} state.page = page; render(); window.scrollTo({top:0,behavior:'smooth'}); },
    openChild(id) { state.selectedId = Number(id); state.childTab='overview'; state.page='child'; render(); window.scrollTo({top:0,behavior:'smooth'}); },
    setChildTab(tab) { state.childTab = tab; render(); },
    setProgramme(value) { state.programmeFilter = value; render(); },
    setSearch(value) { state.search = value; render(); },
    retry() { bootstrap(); },
    showLogin() { showLogin(); },
    showForgotPassword() { showForgotPassword(); },
    async requestPasswordReset(event) {
      event?.preventDefault?.();
      const email = $('recovery-email')?.value || '';
      showLoading('Requesting password-recovery email…');
      try {
        await window.TamaharAuth.requestPasswordReset(email);
        showForgotPassword('Recovery email sent. Use the newest link only. If Supabase reports a rate limit, wait for the limit to clear before requesting another email.');
      } catch (error) {
        console.error(error);
        const rateLimited = error?.status === 429 || /rate limit/i.test(error?.message || '');
        showForgotPassword(rateLimited
          ? 'Supabase email rate limit is active. Do not retry repeatedly; wait for the limit to clear, then request one new recovery email.'
          : (error?.message || 'Unable to send a recovery email.'));
      }
    },
    async updatePassword(event) {
      event?.preventDefault?.();
      const password = $('new-password')?.value || '';
      const confirm = $('confirm-password')?.value || '';
      if (password !== confirm) {
        showSetPassword('The two password entries do not match.');
        return;
      }
      showLoading('Updating password…');
      try {
        await window.TamaharAuth.updatePassword(password);
        await bootstrap();
      } catch (error) {
        console.error(error);
        showSetPassword(error?.message || 'Unable to update the password.');
      }
    },
    async signIn(event) {
      event?.preventDefault?.();
      const email = $('auth-email')?.value || '';
      const password = $('auth-password')?.value || '';
      showLoading('Signing in…');
      try {
        await window.TamaharAuth.signIn(email, password);
        await bootstrap();
      } catch (error) {
        console.error(error);
        const message = error?.code === 'tamahar_access_not_enabled'
          ? 'This account is authenticated, but no approved Tamahar role/programme scope has been assigned yet.'
          : (error?.message || 'Sign-in failed.');
        showLogin(message);
      }
    },
    async signOut() {
      showLoading('Clearing saved session…');
      await window.TamaharAuth?.signOut?.();
      state.children = [];
      state.availableMonths = [];
      state.selectedId = null;
      rememberDate(null);
      await bootstrap();
    },
    selectAllAttendance(checked) {
      document.querySelectorAll('#view form.inline-edit input[name="bulkSelected"]').forEach(box => box.checked = checked);
    },
    async saveSelectedAttendance(event) {
      event?.preventDefault?.();
      if (!canWriteProgramme() || state.bulkSaving) return;
      const date = state.entryDate?.startsWith(state.month) ? state.entryDate : todayInProgrammeZone();
      const selected = [...document.querySelectorAll('#view form.inline-edit')].filter(form=>form.elements.bulkSelected?.checked);
      if (!selected.length) {
        state.writeMessage='Select one or more children first.';
        document.querySelector('[data-batch-save]')?.insertAdjacentHTML('afterend','<span role="alert">'+esc(state.writeMessage)+'</span>');
        return;
      }
      const entries=[], failures=[];
      for(const form of selected) {
        const c=childById(Number(form.dataset.childId));
        if(!c || !programmeWritable(c)) {failures.push((c?.name||'Selected child')+': not authorized for programme attendance');continue;}
        const code=form.elements.attendanceCode.value;
        const correctionReason=form.elements.correctionReason?.value.trim()||'';
        const sourceLabel=window.TamaharBackend.programmeSourceLabel(c.programmeSource);
        const meta=c.attendanceMeta?.[date]||{};
        const existing=c.operationalEntries?.[date+'|'+sourceLabel]||null;
        const item={c,code,correctionReason,sourceLabel,meta,existing,reason:form.elements.reason?.value.trim()||''};
        entries.push(item);
        if(!code || ((meta.baselineExists||existing)&&!correctionReason)) {
          failures.push(c.name+': select a code and supply the required correction reason');
          item.invalid=true;
        }
      }
      state.bulkSaving=true;
      const saveButton=document.querySelector('[data-batch-save]');
      if(saveButton){saveButton.disabled=true;saveButton.textContent='Saving '+selected.length+' entries…';}
      let accepted=0;
      for(const item of entries) {
        if(item.invalid)continue;
        const key=item.c.childPk+'|'+date+'|'+item.sourceLabel;
        if(state.saveKeys.has(key)){failures.push(item.c.name+': already being saved');continue;}
        state.saveKeys.add(key);
        try {
          await window.TamaharBackend.saveOperationalAttendance({
            childPk:item.c.childPk,programmeSource:item.c.programmeSource,entryDate:date,
            activityType:'programme',activitySourceLabel:item.sourceLabel,
            attendanceCode:item.code,reasonForAbsence:item.reason,correctionReason:item.correctionReason,
            baselineExists:!!item.meta.baselineExists,attendanceEntryId:item.existing?.attendance_entry_id||null
          });
          accepted++;
        } catch(error) {
          failures.push(item.c.name+': '+(error?.message||'Network or database write failed'));
        } finally {state.saveKeys.delete(key);}
      }
      let refreshed=false;
      try {
        await loadMonth(state.month);
        refreshed=true;
      } catch(error) {failures.push('Refresh: '+(error?.message||'Unable to verify stored records'));}
      let verified=0;
      if(refreshed) for(const item of entries) {
        if(failures.some(message=>message.startsWith(item.c.name+':')))continue;
        const live=state.children.find(c=>c.childPk===item.c.childPk);
        const row=live?.operationalEntries?.[date+'|'+item.sourceLabel];
        if(row?.attendance_code===item.code)verified++;
        else failures.push(item.c.name+': persisted record not verified; review before retrying');
      }
      state.bulkSaving=false;
      if(saveButton){saveButton.disabled=false;saveButton.textContent='Save selected attendance';}
      state.writeMessage=refreshed?
        'Verified '+verified+' of '+selected.length+' selected entries.' :
        'Database acknowledged '+accepted+' of '+selected.length+' entries, but refresh failed. Check saved records before retrying.';
      if(failures.length)state.writeMessage+=' Issues: '+failures.join('; ');
      render();
      const pending=entries.filter(item=>failures.some(message=>message.startsWith(item.c.name+':')));
      for(const item of pending) {
        const form=document.querySelector('#view form.inline-edit[data-child-id="'+item.c.id+'"]');
        if(!form)continue;
        form.elements.bulkSelected.checked=true;
        form.elements.attendanceCode.value=item.code;
        form.elements.reason.value=item.reason;
        form.elements.correctionReason.value=item.correctionReason;
      }
    },
    async saveProgrammeAttendance(event, childId, date) {
      event?.preventDefault?.();
      const c = childById(childId);
      if (!c) return;
      const form = event.currentTarget;
      const code = form.elements.attendanceCode.value;
      const reason = form.elements.reason?.value || '';
      const correctionReason = form.elements.correctionReason?.value || '';
      const sourceLabel = window.TamaharBackend.programmeSourceLabel(c.programmeSource);
      const meta = c.attendanceMeta?.[date] || {};
      const existing = c.operationalEntries?.[`${date}|${sourceLabel}`] || null;
      const key = `${c.childPk}|${date}|${sourceLabel}`;
      if (state.saveKeys.has(key)) return;
      state.saveKeys.add(key);
      state.writeMessage = 'Saving attendance…';
      render();
      try {
        await window.TamaharBackend.saveOperationalAttendance({
          childPk:c.childPk,
          programmeSource:c.programmeSource,
          entryDate:date,
          activityType:'programme',
          activitySourceLabel:sourceLabel,
          attendanceCode:code,
          reasonForAbsence:reason,
          correctionReason,
          baselineExists:!!meta.baselineExists,
          attendanceEntryId:existing?.attendance_entry_id || null
        });
        state.writeMessage = `Attendance saved for ${c.name} on ${date}.`;
        await loadMonth(state.month);
      } catch (error) {
        console.error(error);
        state.writeMessage = error?.message || 'Unable to save attendance.';
        render();
      } finally {
        state.saveKeys.delete(key);
      }
    },
    openTherapyEditor(childId, date) {
      state.selectedId = Number(childId);
      state.entryDate = date;
      state.childTab = 'therapy';
      state.page = 'child';
      render();
      window.scrollTo({top:0,behavior:'smooth'});
    },
    async saveTherapyAttendance(event, childId) {
      event?.preventDefault?.();
      const c = childById(childId);
      if (!c) return;
      const form = event.currentTarget;
      const date = form.elements.entryDate.value;
      const sourceLabel = form.elements.sourceLabel.value;
      const attendanceCode = form.elements.attendanceCode.value;
      const reason = form.elements.reason?.value || '';
      const correctionReason = form.elements.correctionReason?.value || '';
      const existing = c.operationalEntries?.[`${date}|${sourceLabel}`] || null;
      const baseline = (c.therapySessions || []).find(x=>x.date===date && x.sourceProgram===sourceLabel && !x.operational);
      const key = `${c.childPk}|${date}|${sourceLabel}`;
      if (state.saveKeys.has(key)) return;
      state.saveKeys.add(key);
      state.writeMessage = 'Saving therapy attendance…';
      render();
      try {
        await window.TamaharBackend.saveOperationalAttendance({
          childPk:c.childPk,
          entryDate:date,
          activityType:'therapy',
          activitySourceLabel:sourceLabel,
          attendanceCode,
          reasonForAbsence:reason,
          correctionReason,
          baselineExists:!!baseline,
          attendanceEntryId:existing?.attendance_entry_id || null
        });
        state.entryDate = date;
        state.writeMessage = `${therapyLabel(sourceLabel)} saved for ${c.name} on ${date}.`;
        await loadMonth(state.month);
        state.selectedId = Number(childId);
        state.childTab = 'therapy';
        state.page = 'child';
        render();
      } catch (error) {
        console.error(error);
        state.writeMessage = error?.message || 'Unable to save therapy attendance.';
        render();
      } finally {
        state.saveKeys.delete(key);
      }
    },
    setEntryDate(value) { if(!validDate(value))return;state.entryDate=value;rememberDate(value);if(value.slice(0,7)!==state.month)loadMonth(value.slice(0,7));else render(); },
    todayAttendance() { const date=todayInProgrammeZone();state.entryDate=date;rememberDate(date);if(date.slice(0,7)!==state.month)loadMonth(date.slice(0,7));else render(); },
    setMonth(value) { if (value) loadMonth(value); }
  };

  async function bootstrap() {
    showLoading('Connecting to Phase 1 Supabase…');
    try {
      if (!window.TamaharAuth) throw new Error('Authentication module failed to load.');
      const recovery = await window.TamaharAuth.consumeRecoveryCallback();
      if (recovery?.kind === 'error') {
        showRecoveryError(recovery.message);
        return;
      }
      if (recovery?.kind === 'recovery') {
        showSetPassword();
        return;
      }
      const session = await window.TamaharAuth.initialize();
      if (!session) {
        showLogin();
        return;
      }
      const data = await window.TamaharBackend.loadWorkspace();
      state.children = data.children;
      state.availableMonths = data.availableMonths || [];
      state.month = data.selectedMonth || state.month;
      state.entryDate = storedDate() || todayInProgrammeZone();
      state.month = state.entryDate.slice(0,7);
      if (data.selectedMonth !== state.month) await window.TamaharBackend.loadMonth(state.children,state.month);
      state.holidays = data.holidays || {};
      state.selectedId = state.children[0]?.id || null;
      setStatus(`Connected · ${state.children.length} Phase 1 child records · ${writeMode()?'controlled attendance writes enabled':'read-only'}`);
      render();
    } catch (error) {
      console.error(error);
      showError(error);
    }
  }

  bootstrap();
})();
