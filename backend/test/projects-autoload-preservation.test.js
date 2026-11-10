'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

function fixture(name, exports) {
  const filename = path.join(__dirname, name + '.test.js');
  const definitions = fs.readFileSync(filename, 'utf8').split(/\r?\ntest\(/)[0];
  const mod = new Module(filename);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(definitions + '\nmodule.exports = {' + exports + '};', filename);
  return mod.exports;
}
const { environment, row, projectsKey } = fixture('backend-pending-writes', 'environment,row,projectsKey');
const { harness } = fixture('projects-interactions', 'harness');
const stamp = n => '2026-11-10T10:00:0' + n + '.000Z';
const range = end => ({ type: 'active_range', source: 'manual', startDate: '2026-11-10', endDate: end });
const project = (n, end) => ({ id: 'p1', events: end ? [range(end)] : [], autoloadManualOverrideAt: stamp(n), autoloadUpdatedAt: stamp(n), clientPath: { autoload: !!end } });
async function merge(before, remote, local) {
  const base = { projects: [before], tasks: [{ id: 'keep' }] };
  const env = environment({ rows: [row(projectsKey, base)] }); await env.start();
  env.rows[0].value_text = JSON.stringify({ ...base, projects: [remote] }); env.rows[0].revision++;
  env.edit(projectsKey, JSON.stringify({ ...base, projects: [local] }), JSON.stringify(base)); await env.drain();
  const saved = JSON.parse(env.rows[0].value_text);
  assert.deepEqual(saved.tasks, base.tasks);
  assert.deepEqual(JSON.parse(env.localStorage.getItem(projectsKey)), saved);
  return saved.projects[0];
}

test('fresh manual autoload survives a recovered server baseline without an endless conflict', async () => {
  const saved = await merge(project(1, '2026-11-15'), { ...project(2, '2026-11-20'), notes: 'remote' }, project(3, '2026-12-01'));
  assert.equal(saved.events[0].endDate, '2026-12-01');
  assert.equal(saved.autoloadManualOverrideAt, stamp(3)); assert.equal(saved.notes, 'remote');
});

test('an older pending calendar draft cannot undo a newer manual range', async () => {
  const saved = await merge(project(1, '2026-11-15'), project(3, '2026-12-01'), { ...project(2, '2026-11-20'), notes: 'local' });
  assert.equal(saved.events[0].endDate, '2026-12-01');
  assert.equal(saved.autoloadManualOverrideAt, stamp(3)); assert.equal(saved.notes, 'local');
});

test('a fresh explicit clear wins, but a stale range never resurrects a newer clear', async () => {
  let saved = await merge(project(1, '2026-11-15'), project(2, '2026-11-20'), project(3));
  assert.deepEqual(saved.events, []); assert.equal(saved.clientPath.autoload, false);
  saved = await merge(project(1, '2026-11-15'), project(3), project(2, '2026-11-20'));
  assert.deepEqual(saved.events, []); assert.equal(saved.autoloadManualOverrideAt, stamp(3));
});

test('disjoint manual child-row edits retain both rows and advance the server causal stamp', async () => {
  const before = { ...project(1, '2026-12-01'), childLines: ['A', 'B'], childLineEvents: [[range('2026-11-15')], [range('2026-11-15')]] };
  const remote = structuredClone(before), local = structuredClone(before);
  remote.childLineEvents[0] = [range('2026-11-25')]; remote.autoloadManualOverrideAt = remote.autoloadUpdatedAt = stamp(3);
  local.childLineEvents[1] = [range('2026-11-30')]; local.autoloadManualOverrideAt = local.autoloadUpdatedAt = stamp(2);
  const saved = await merge(before, remote, local);
  assert.equal(saved.childLineEvents[0][0].endDate, '2026-11-25');
  assert.equal(saved.childLineEvents[1][0].endDate, '2026-11-30');
  assert.ok(Date.parse(saved.autoloadManualOverrideAt) > Date.parse(stamp(3)));
});

test('manual timestamps advance even when the device clock trails the last saved edit', () => {
  const h = harness(), p = { autoloadUpdatedAt: '2099-01-01T00:00:00.000Z' };
  const first = h.ctx.nextProjectAutoloadTimestamp(p); p.autoloadManualOverrideAt = first;
  assert.ok(Date.parse(first) > Date.parse(p.autoloadUpdatedAt));
  assert.ok(Date.parse(h.ctx.nextProjectAutoloadTimestamp(p)) > Date.parse(first));
});

test('partial clearing keeps manual provenance and unaffected history', () => {
  const h = harness(), data = h.data(); h.ctx.rerenderProjectsPreserveScroll = () => {};
  data.projects[0] = { ...data.projects[0], ...project(1, '2026-12-01') };
  data.projects[0].events.push({ ...range('2026-10-27'), startDate: '2026-09-27', note: 'historical' });
  h.ctx.saveProjectsData(data); h.ctx.clearProjectAutoloadRangeForRow('p1', -1, '2026-11-15', '2026-11-17');
  const p = h.data().projects[0], ranges = p.events.filter(e => e.type === 'active_range');
  assert.equal(ranges.length, 3); assert.equal(ranges.find(e => e.note).endDate, '2026-10-27');
  for (const e of ranges.filter(e => !e.note)) { assert.equal(e.source, 'manual'); assert.equal(e.updatedAt, p.autoloadManualOverrideAt); }
});

test('setting autoload explicitly clears a dismissed launch warning with its own timestamp', () => {
  const h = harness(), data = h.data(); h.ctx.rerenderProjectsPreserveScroll = () => {};
  data.projects[0].mustLaunchRequired = true; data.projects[0].mustLaunchDate = '2026-11-12'; h.ctx.saveProjectsData(data);
  h.ctx.applyProjectAutoloadRangeForRow('p1', -1, '2026-11-10', '2099-12-01');
  const p = h.data().projects[0];
  assert.equal(p.mustLaunchRequired, false); assert.equal(p.mustLaunchDate, '');
  assert.equal(p.mustLaunchManualClearedAt, p.autoloadManualOverrideAt);
});
