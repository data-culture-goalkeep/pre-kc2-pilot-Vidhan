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
    writeMessage: ''
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
      percent:x.percent == null ? null : Math.round(Number(x.percent))
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
      return '<div class="callout" style="margin-bottom:18px"><strong>Phase 3B · local write validation.</strong> Operational attendance/therapy writes are enabled only in this local test configuration. Imported Phase 1 records remain immutable.</div>';
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
      ['progress','Child progress']
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
    return header('Programme work', `${new Date(state.month+'-01T12:00:00').toLocaleString('en',{month:'long',year:'numeric'})} work`, 'Review attendance, therapy participation and child records from the existing Phase 1 backend.') + filters() +
      `<div class="metrics"><div class="card metric-card"><span>Children in view</span><div class="metric">${rows.length}</div><small>Accessible Phase 1 child records</small></div><div class="card metric-card"><span>Attendance rows</span><div class="metric">${withAttendance.length}</div><small>Children with matching monthly source rows</small></div><div class="card metric-card"><span>Below 80%</span><div class="metric">${low.length}</div><small>Using migrated source percentage</small></div><div class="card metric-card"><span>Therapy entries</span><div class="metric">${therapyEntries}</div><small>TH-* daily source codes</small></div></div>` +
      `<div class="grid"><section class="card card-pad"><h2 class="section-title">Attendance review</h2><p class="muted">Source-calculated attendance values are retained. NS, PwC, H and other source codes are not silently reinterpreted.</p>${PROGRAMMES.map((name,i)=>{const group=rows.filter(c=>c.programme===i), values=group.map(c=>attendanceStats(c).percent).filter(v=>v!=null);const avg=values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;return bar(name,avg,100,PROGRAMME_COLORS[i])}).join('')}</section><section class="card card-pad"><h2 class="section-title">Children needing review</h2>${childTable(low.slice(0,10))}</section></div>`;
  }

  function dailyAttendance() {
    const rows = visibleChildren();
    const date = state.entryDate?.startsWith(state.month) ? state.entryDate : `${state.month}-01`;
    const body = rows.map(c => {
      const code = c.attendanceRaw?.[date] || c.attendance?.[date] || '';
      const meta = c.attendanceMeta?.[date] || {};
      const therapy = (c.therapySessions || []).filter(x => x.date === date);
      const programmeEditor = programmeWritable(c)
        ? `<form class="inline-edit" onsubmit="TamaharUI.saveProgrammeAttendance(event,${c.id},'${date}')"><select name="attendanceCode" required>${codeOptions(code)}</select><input name="reason" placeholder="Absence reason" value="${esc(c.absences?.[date]?.reason || '')}"><input name="correctionReason" placeholder="${meta.operational || meta.baselineExists ? 'Correction reason required' : 'Correction reason (optional)'}" ${meta.operational || meta.baselineExists ? 'required' : ''}><button class="btn compact" type="submit">Save</button></form>`
        : pill(code || '—', code==='A'?'warn':code==='P'?'':'grey');
      const therapyDisplay = therapy.map(x=>`${esc(x.type)} · ${pill(x.code,x.code==='A'?'warn':x.code==='P'?'':'grey')}`).join('<br>') || '—';
      const therapyEditor = canWriteTherapy()
        ? `<button class="btn ghost compact" type="button" onclick="TamaharUI.openTherapyEditor(${c.id},'${date}')">Record therapy</button>`
        : '';
      return `<tr><td><button class="text-link" onclick="TamaharUI.openChild(${c.id})">${esc(c.name)}</button></td><td>${esc(programmeName(c.programme))}</td><td>${programmeEditor}</td><td>${therapyDisplay}<div class="cell-actions">${therapyEditor}</div></td><td>${esc(c.absences?.[date]?.reason || '—')}</td></tr>`;
    }).join('');
    return header('Daily entry','Attendance and therapy', writeMode() ? 'Record authorized operational attendance without changing imported Phase 1 source rows.' : 'Read-only migrated daily source codes for the selected date.') + filters() + writeNotice() + `<section class="card card-pad"><div class="row"><label class="field-inline">Class day <input type="date" min="${state.month}-01" max="${monthDates(state.month).at(-1)}" value="${date}" onchange="TamaharUI.setEntryDate(this.value)"></label><span class="muted">Operational corrections overlay the immutable Phase 1 baseline after reload.</span></div><div class="table-wrap"><table><thead><tr><th>Child</th><th>Programme</th><th>Class code / entry</th><th>Therapy on this date</th><th>Absence reason</th></tr></thead><tbody>${body || '<tr><td colspan="5">No records.</td></tr>'}</tbody></table></div></section>`;
  }

  function childrenPage() {
    return header('Records','Children','Open a child to review master data, attendance, therapy and Phase 1 assessments.') + filters() + `<section class="card card-pad" style="margin-bottom:18px"><h2 class="section-title">Backend-connected records</h2><p class="muted">Creation and editing are intentionally disabled until Phase 2 authorization and write/audit rules are approved.</p></section><section class="card">${childTable(visibleChildren())}</section>`;
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
      `<div class="grid"><section class="card card-pad"><h2 class="section-title">Attendance by programme</h2>${groups.map(g=>{const vals=g.rows.map(c=>attendanceStats(c).percent).filter(v=>v!=null);const avg=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;return bar(g.name,avg,100,PROGRAMME_COLORS[g.i])}).join('')}<p class="notice">Programme bars use source attendance percentages for children with a matching monthly row.</p></section><section class="card card-pad"><h2 class="section-title">Therapy participation</h2>${THERAPIES.map(t=>{const n=rows.filter(c=>(c.therapySessions||[]).some(x=>x.date.startsWith(state.month)&&x.type===t&&x.code==='P')).length;return bar(t,n,Math.max(1,rows.length),'#527a96')}).join('')}<p class="notice">Distinct children with at least one P-coded therapy entry in the selected month.</p></section></div>` +
      `<p class="callout">Goal, behaviour, home-guidance and other prototype comparisons are intentionally omitted because they do not have approved Phase 1 persistence structures.</p>`;
  }

  function progressPage() {
    const rows = visibleChildren();
    const adl = rows.reduce((n,c)=>n+(c.backendAdl || []).length,0);
    const dev = rows.reduce((n,c)=>n+(c.backendDevelopment || []).length,0);
    return header('Programme review','Child progress','Review migrated ADL and development assessment records without synthetic score conversions.') + filters() + `<div class="metrics"><div class="card metric-card"><span>Children in view</span><div class="metric">${rows.length}</div></div><div class="card metric-card"><span>ADL records</span><div class="metric">${adl}</div></div><div class="card metric-card"><span>Development records</span><div class="metric">${dev}</div></div><div class="card metric-card"><span>Cross-scale score</span><div class="metric">—</div><small>Not invented</small></div></div><section class="card card-pad"><h2 class="section-title">Open a child for assessment detail</h2>${childTable(rows)}</section>`;
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
    return `<div class="grid"><section class="card card-pad"><h2 class="section-title">Child master record</h2><p><strong>Source ID:</strong> ${esc(c.sourceId)}</p><p><strong>Status:</strong> ${esc(c.status || '—')}</p><p><strong>Programme:</strong> ${esc(c.programmeSource || programmeName(c.programme))}</p><p><strong>Centre:</strong> ${esc(c.centre || '—')}</p><p><strong>Disability:</strong> ${esc([c.disabilityType,c.disabilitySubType].filter(Boolean).join(' · ') || '—')}</p><p><strong>Severity:</strong> ${esc(c.severity || '—')}</p></section><section class="card card-pad"><h2 class="section-title">Attendance this month</h2><div class="metric">${a.percent==null?'—':a.percent+'%'}</div><p class="muted">${a.present} present · ${a.absent} absent · source total ${a.total}</p></section><section class="card card-pad"><h2 class="section-title">Assessments</h2><p>${(c.backendAdl||[]).length} ADL record(s)</p><p>${(c.backendDevelopment||[]).length} development record(s)</p></section><section class="card card-pad"><h2 class="section-title">Prototype-only features</h2><p class="muted">Goals, behaviour concerns, home guidance and work-skill entry are retained as navigation references but are not persisted because Phase 1 has no approved matching write tables.</p></section></div>`;
  }
  function childAttendance(c) {
    const dates = monthDates(state.month);
    const first = new Date(`${state.month}-01T12:00:00`).getDay();
    const a = attendanceStats(c);
    return `<div class="grid"><section class="card card-pad"><h2 class="section-title">${esc(state.month)} attendance</h2><p class="muted">P/A are shown directly; H, NS, PwC and other source values remain unchanged.</p><div class="month-grid">${Array.from({length:first},()=>'<span></span>').join('')}${dates.map((date,i)=>{const raw=c.attendanceRaw?.[date]||c.attendance?.[date]||'';return `<div class="day ${raw?'':'off'}"><strong>${i+1}</strong><small>${raw?pill(raw,raw==='A'?'warn':raw==='P'?'':'grey'):'—'}</small></div>`}).join('')}</div><p><strong>${a.percent==null?'Monthly percentage unavailable':a.percent+'%'}</strong> · ${a.present} present · ${a.absent} absent · source total ${a.total}</p></section><section class="card card-pad"><h2 class="section-title">Absence reasons</h2><div class="list">${dates.filter(d=>c.attendance?.[d]==='A').map(d=>`<div class="item"><strong>${esc(d)}</strong><small>${esc(c.absences?.[d]?.reason || 'No source reason recorded')}</small></div>`).join('') || '<p class="muted">No P/A-coded absences for this month.</p>'}</div></section></div>`;
  }
  function childAssessments(c) {
    const adl = c.backendAdl || [];
    const dev = c.backendDevelopment || [];
    return `<div class="grid"><section class="card card-pad"><h2 class="section-title">ADL assessments · Phase 1 fields</h2><div class="table-wrap"><table><thead><tr><th>Year</th><th>Goals</th><th>Independent</th><th>Supervision</th><th>Limited</th><th>Extensive</th><th>Dependent</th></tr></thead><tbody>${adl.map(r=>`<tr><td>${esc(r.academic_year)}</td><td>${r.goals_planned??'—'}</td><td>${r.goals_independent_score_4??'—'}</td><td>${r.goals_supervision_score_3??'—'}</td><td>${r.goals_limited_assistance_score_2??'—'}</td><td>${r.goals_extensive_assistance_score_1??'—'}</td><td>${r.goals_fully_dependent_score_0??'—'}</td></tr>`).join('') || '<tr><td colspan="7">No ADL records.</td></tr>'}</tbody></table></div></section><section class="card card-pad"><h2 class="section-title">Development assessments · Phase 1 fields</h2><div class="table-wrap"><table><thead><tr><th>Year</th><th>Term</th><th>Domain</th><th>Planned</th><th>Progressed</th><th>Slightly</th><th>Not progressed</th></tr></thead><tbody>${dev.map(r=>`<tr><td>${esc(r.academic_year)}</td><td>${esc(r.term)}</td><td>${esc(r.domain_type)}</td><td>${r.goals_planned??'—'}</td><td>${r.goals_progressed??'—'}</td><td>${r.goals_slightly_progressed??'—'}</td><td>${r.goals_not_progressed??'—'}</td></tr>`).join('') || '<tr><td colspan="7">No development records.</td></tr>'}</tbody></table></div></section></div><p class="callout">The PM prototype's alternate ADL/development scales are not written to the database because they do not match the approved Phase 1 model.</p>`;
  }
  function childTherapy(c) {
    const sessions = (c.therapySessions || []).filter(x=>x.date.startsWith(state.month)).sort((a,b)=>a.date.localeCompare(b.date)||a.sourceProgram.localeCompare(b.sourceProgram));
    const entry = canWriteTherapy() ? `<section class="card card-pad" style="margin-bottom:18px"><h2 class="section-title">Record therapy attendance</h2><form class="write-form" onsubmit="TamaharUI.saveTherapyAttendance(event,${c.id})"><label>Date<input name="entryDate" type="date" min="${state.month}-01" max="${monthDates(state.month).at(-1)}" value="${state.entryDate?.startsWith(state.month)?state.entryDate:state.month+'-01'}" required></label><label>Therapy<select name="sourceLabel" required><option value="">Choose…</option><option value="TH-OT">Occupational therapy</option><option value="TH-PT">Physical therapy</option><option value="TH-ST">Speech therapy</option><option value="TH-VT">Visual therapy</option></select></label><label>Status<select name="attendanceCode" required>${codeOptions('')}</select></label><label>Reason / note<input name="reason" placeholder="Optional absence reason"></label><label>Correction reason<input name="correctionReason" placeholder="Required when correcting an existing or imported entry"></label><button class="btn" type="submit">Save therapy status</button></form></section>` : '';
    return writeNotice() + entry + `<section class="card card-pad"><h2 class="section-title">Therapy attendance</h2><p class="muted">Phase 1 TH-* rows remain unchanged; local Phase 3 operational entries are overlaid after reload.</p><div class="table-wrap"><table><thead><tr><th>Date</th><th>Therapy</th><th>Code</th><th>Origin</th></tr></thead><tbody>${sessions.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${pill(x.code,x.code==='A'?'warn':x.code==='P'?'':'grey')}</td><td>${x.operational?'Operational':'Phase 1 source'}</td></tr>`).join('') || '<tr><td colspan="4">No therapy records for this month.</td></tr>'}</tbody></table></div></section>`;
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
    const pages = {today:dashboard, mark:dailyAttendance, children:childrenPage, programmes:programmeReview, progress:progressPage, child:childPage};
    $('view').innerHTML = backendBanner() + pages[state.page]();
  }

  async function loadMonth(month) {
    showLoading(`Loading ${month} from Supabase…`);
    try {
      const result = await window.TamaharBackend.loadMonth(state.children, month);
      state.month = month;
      state.entryDate = `${month}-01`;
      state.holidays = result.holidays || {};
      setStatus(`Connected · ${state.children.length} Phase 1 child records · ${writeMode()?'local Phase 3 writes enabled':'read-only'}`);
      render();
    } catch (error) {
      console.error(error);
      showError(error);
    }
  }

  window.TamaharUI = {
    go(page) { state.page = page; render(); window.scrollTo({top:0,behavior:'smooth'}); },
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
      await bootstrap();
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
    setEntryDate(value) { state.entryDate = value; render(); },
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
      state.entryDate = `${state.month}-01`;
      state.holidays = data.holidays || {};
      state.selectedId = state.children[0]?.id || null;
      setStatus(`Connected · ${state.children.length} Phase 1 child records · ${writeMode()?'local Phase 3 writes enabled':'read-only'}`);
      render();
    } catch (error) {
      console.error(error);
      showError(error);
    }
  }

  bootstrap();
})();
