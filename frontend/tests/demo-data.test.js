'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'demo.js'), 'utf8');

function buildDemo() {
  let fetchCalls = 0;
  const context = {
    console,
    Date,
    fetch: async () => { fetchCalls += 1; throw new Error('demo must not call fetch'); },
    window: {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {demo:context.window.TamaharDemo, fetchCalls:()=>fetchCalls};
}

async function main() {
  const {demo,fetchCalls} = buildDemo();
  const workspace = await demo.loadWorkspace('2026-09');
  assert.equal(workspace.children.length, 4);
  assert.equal(workspace.selectedMonth, '2026-09');
  assert.equal(fetchCalls(), 0);

  for (const child of workspace.children) {
    assert.match(child.sourceId, /^DEMO-/);
    assert.match(child.name, /^Demo Child /);
    assert.equal(child.backendRaw, null);
    assert.ok(child.backendAttendanceSummary);
    assert.ok(child.backendAdl.length > 0);
    assert.ok(child.backendDevelopment.length > 0);
  }

  const before = workspace.children[0].attendanceRaw;
  await demo.loadMonth(workspace.children, '2026-10');
  assert.notDeepEqual(workspace.children[0].attendanceRaw, before);
  assert.equal(fetchCalls(), 0);

  console.log('demo-data tests passed');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
