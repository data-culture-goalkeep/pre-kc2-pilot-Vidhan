(() => {
  'use strict';

  const childTemplates = [
    {id:1, sourceId:'DEMO-001', name:'Demo Child A', programme:0, programmeSource:'EI', centre:'Demo Centre North', gender:'Female', dob:'2019-02-14', age:7, severity:'Moderate', enrolled:'2025-06-10', status:'Active', disabilityType:'Demo category', disabilitySubType:'Synthetic', therapyType:'Occupational therapy'},
    {id:2, sourceId:'DEMO-002', name:'Demo Child B', programme:1, programmeSource:'Nursery', centre:'Demo Centre North', gender:'Male', dob:'2020-05-06', age:6, severity:'Mild', enrolled:'2025-08-01', status:'Active', disabilityType:'Demo category', disabilitySubType:'Synthetic', therapyType:'Speech therapy'},
    {id:3, sourceId:'DEMO-003', name:'Demo Child C', programme:2, programmeSource:'FA', centre:'Demo Centre South', gender:'Female', dob:'2016-11-20', age:9, severity:'Severe', enrolled:'2024-07-15', status:'Active', disabilityType:'Demo category', disabilitySubType:'Synthetic', therapyType:'Physical therapy'},
    {id:4, sourceId:'DEMO-004', name:'Demo Child D', programme:3, programmeSource:'PV', centre:'Demo Centre South', gender:'Male', dob:'2013-08-09', age:13, severity:'Moderate', enrolled:'2023-06-05', status:'Active', disabilityType:'Demo category', disabilitySubType:'Synthetic', therapyType:'Visual therapy'}
  ];

  function datesForMonth(month) {
    const [year, m] = month.split('-').map(Number);
    const days = new Date(year, m, 0).getDate();
    return Array.from({length:days}, (_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
  }

  function populateMonth(child, month) {
    const dates = datesForMonth(month);
    child.attendance = {};
    child.attendanceRaw = {};
    child.absences = {};
    child.therapy = {};
    child.therapySessions = [];

    let present = 0;
    let absent = 0;
    dates.slice(0, 12).forEach((date, index) => {
      const weekday = new Date(`${date}T12:00:00`).getDay();
      if (weekday === 0) return;
      let code = 'P';
      if ((index + child.id) % 7 === 0) code = 'A';
      if ((index + child.id) % 11 === 0) code = 'H';
      child.attendanceRaw[date] = code;
      if (code === 'P' || code === 'A') child.attendance[date] = code;
      if (code === 'P') present += 1;
      if (code === 'A') {
        absent += 1;
        child.absences[date] = {reason:'Synthetic demo absence',followup:'DEMO only'};
      }
      if (index % 5 === child.id % 5) {
        const therapyCode = index % 10 === 0 ? 'A' : 'P';
        const session = {date,type:child.therapyType,code:therapyCode,attended:therapyCode==='P',sourceProgram:'DEMO'};
        child.therapySessions.push(session);
        child.therapy[date] = {type:session.type,attended:session.attended,code:session.code};
      }
    });
    const total = present + absent;
    child.backendAttendanceSummary = {
      present, absent, total,
      percent: total ? (100 * present / total) : null,
      sourcePrograms:['DEMO'],
      rawRows:[]
    };
  }

  function buildChildren(month) {
    return childTemplates.map(template => {
      const child = {
        ...template,
        childPk:`demo-${template.id}`,
        exit:'', moves:[], goals:[], quarterly:[], behaviours:[], home:[], work:[], developmental:[], parentSessions:[],
        backendAdl:[{
          adl_assessment_id:`DEMO-ADL-${template.id}`, child_pk:`demo-${template.id}`, academic_year:'DEMO',
          goals_planned:5, goals_independent_score_4:template.id % 2, goals_supervision_score_3:2,
          goals_limited_assistance_score_2:1, goals_extensive_assistance_score_1:1,
          goals_fully_dependent_score_0:0, notes:'Synthetic demo assessment', mark_issue:false
        }],
        backendDevelopment:[{
          development_assessment_id:`DEMO-DEV-${template.id}`, child_pk:`demo-${template.id}`, academic_year:'DEMO',
          term:'Demo term', domain_type:'Synthetic domain', goals_planned:4,
          goals_progressed:2, goals_slightly_progressed:1, goals_not_progressed:1,
          notes:'Synthetic demo assessment', mark_issue:false
        }],
        backendRaw:null
      };
      populateMonth(child, month);
      return child;
    });
  }

  async function loadWorkspace(defaultMonth = '2026-09') {
    const children = buildChildren(defaultMonth);
    return {
      children,
      availableMonths:[defaultMonth],
      selectedMonth:defaultMonth,
      holidays:{},
      monthRows:0,
      dayRows:0,
      academicYear:'DEMO',
      monthLabel:'DEMO'
    };
  }

  async function loadMonth(children, month) {
    for (const child of children) populateMonth(child, month);
    return {holidays:{},monthRows:0,dayRows:0,academicYear:'DEMO',monthLabel:'DEMO'};
  }

  window.TamaharDemo = {loadWorkspace,loadMonth};
})();