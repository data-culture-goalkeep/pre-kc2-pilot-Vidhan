'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function createHarness({selectedCodes=['P','A','PwC'],failure=[],now='2026-10-21T19:15:00+05:30',stored=null}={}) {
  const storage=new Map(stored?[['tamahar.attendance.selectedDate.v2',stored]]:[]);
  const persisted=new Map();
  const calls=[];
  const view={innerHTML:''}, nav={innerHTML:''}, crumb={textContent:''}, status={textContent:''};
  const uiNodes={'view':view,'nav':nav,'crumb':crumb,'data-status':status};
  const children=selectedCodes.map((code,i)=>({
    id:i+1,childPk:'child-'+i,name:'Child '+i,sourceId:'C'+i,programme:0,programmeSource:'EI',status:'Active',centre:'A',
    attendanceRaw:{},attendance:{},attendanceMeta:{},operationalEntries:{},programmeAttendanceByKey:{},
    therapySessions:[],backendAttendanceSummary:{present:0,absent:0,total:0,percent:null}
  }));
  const forms=selectedCodes.map((code,i)=>({
    dataset:{childId:String(i+1)},
    elements:{
      bulkSelected:{checked:true}, attendanceCode:{value:code},
      reason:{value:''}, correctionReason:{value:''}
    }
  }));
  const button={disabled:false,textContent:'Save selected attendance',insertAdjacentHTML(){}};
  const document={
    getElementById:id=>uiNodes[id]||null,
    querySelectorAll:selector=>selector.includes('form.inline-edit')?forms:[],
    querySelector:selector=>{
      if(selector==='[data-batch-save]')return button;
      const m=selector.match(/data-child-id="(\d+)"/);
      return m?forms[Number(m[1])-1]:null;
    }
  };
  const fixedDate=class extends Date {
    constructor(...args){super(...(args.length?args:[now]));}
    static now(){return new Date(now).valueOf();}
  };
  const backend={
    writeEnabled:()=>true,
    programmeSourceLabel:source=>source==='EI'?'GC-EI':null,
    loadWorkspace:async()=>({children,selectedMonth:'2027-05',availableMonths:[],holidays:{}}),
    loadMonth:async(rows,month)=>{
      for(const c of rows){c.operationalEntries={};}
      for(const [key,row] of persisted) {
        const c=rows.find(child=>child.childPk===row.child_pk);
        if(c)c.operationalEntries[row.entry_date+'|'+row.activity_source_label]=row;
      }
      return {holidays:{}};
    },
    saveOperationalAttendance:async input=>{
      calls.push(input);
      if(failure.includes(input.childPk))throw Object.assign(new Error('denied or network failure'),{status:403});
      const row={child_pk:input.childPk,entry_date:input.entryDate,activity_source_label:input.activitySourceLabel,attendance_code:input.attendanceCode,attendance_entry_id:input.childPk+'-entry'};
      persisted.set(input.childPk,row);
      return row;
    }
  };
  const window={
    TAMAHAR_CONFIG:{defaultMonth:'2027-05'},
    TamaharAuth:{initialize:async()=>({}),consumeRecoveryCallback:async()=>({kind:'none'}),getUser:()=>({app_metadata:{tamahar:{enabled:true,role:'administrator'}}}),getSession:()=>({})},
    TamaharBackend:backend,scrollTo(){},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,v)=>storage.set(key,v),removeItem:key=>storage.delete(key)}
  };
  const context={window,document,Date:fixedDate,Intl,console,setTimeout,clearTimeout};
  vm.createContext(context);vm.runInContext(source,context);
  return {window,storage,forms,button,calls,persisted,view,async ready(){await tick();await tick();}};
}
(async()=>{
  {
    const h=createHarness();await h.ready();
    h.window.TamaharUI.go('mark');await h.ready();
    assert.match(h.view.innerHTML,/2026-10-21/,'first attendance view defaults to Kolkata today');
    await h.window.TamaharUI.saveSelectedAttendance({preventDefault(){}});
    assert.equal(h.calls.length,3,'all selected writes awaited');
    assert.equal(h.persisted.size,3);
    assert.match(h.view.innerHTML,/Verified 3 of 3/);
    assert.equal(h.button.disabled,false,'button is not permanently disabled after completion');
  }
  {
    const h=createHarness({failure:['child-1']});await h.ready();
    await h.window.TamaharUI.saveSelectedAttendance({preventDefault(){}});
    assert.equal(h.persisted.size,2);
    assert.match(h.view.innerHTML,/Verified 2 of 3/);
    assert.equal(h.forms[1].elements.bulkSelected.checked,true,'failed row remains selected');
    assert.equal(h.forms[0].elements.bulkSelected.checked,true,'fake form state is not cleared; real DOM replaces it');
  }
  {
    const h=createHarness({failure:['child-0','child-1','child-2']});await h.ready();
    await h.window.TamaharUI.saveSelectedAttendance({preventDefault(){}});
    assert.equal(h.persisted.size,0);
    assert.match(h.view.innerHTML,/Verified 0 of 3/);
  }
  {
    const h=createHarness({stored:'2025-08-17'});await h.ready();
    h.window.TamaharUI.go('mark');await h.ready();
    assert.match(h.view.innerHTML,/2025-08-17/,'refresh keeps prior user selection');
    h.window.TamaharUI.todayAttendance();await h.ready();
    assert.equal(h.storage.get('tamahar.attendance.selectedDate.v2'),'2026-10-21');
    h.window.TamaharUI.setEntryDate('2027-05-18');await h.ready();
    assert.equal(h.storage.get('tamahar.attendance.selectedDate.v2'),'2027-05-18');
  }
  {
    const h=createHarness({now:'2026-10-20T19:00:00Z'});await h.ready();h.window.TamaharUI.go('mark');await h.ready();
    assert.match(h.view.innerHTML,/2026-10-21/,'UTC evening resolves to next Kolkata date');
  }
  console.log('Attendance UI date and batch regression tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
