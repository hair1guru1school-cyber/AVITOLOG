{
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/projects.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function classes() {
  const values = new Set();
  return { add: (...args) => args.forEach(v => values.add(v)), remove: (...args) => args.forEach(v => values.delete(v)), contains: v => values.has(v) };
}
function harness() {
  const storage = new Map(), timers = new Map(), events = [], warnings = [];
  let timerId = 0;
  const ctx = { console: { warn: (...args) => warnings.push(args), log() {} }, Date, Intl, Promise, Set, Map,
    projectsMode: true, _driveToken: '', _driveUserEmail: '', SHEETS_ID: 'fixture-only',
    AVITOLOG_BACKEND_SERVER_ONLY: true, AVITOLOG_BACKEND_INITIAL_SYNC_READY: true,
    AVITOLOG_BACKEND_MODE: true, _profile: 'fil', _readOnly: false,
    AVITOLOG_KEY: key => key + ':' + ctx._profile, __avitologBackendReadOnly: () => ctx._readOnly,
    __avitologBackendIdentity: () => ({ id: 'fixture-user' }),
    addEventListener() {}, removeEventListener() {},
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval() {}, clearInterval() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    document: { hidden: false, addEventListener() {}, removeEventListener() {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], elementFromPoint: () => null,
      dispatchEvent: event => events.push(event), body: { classList: classes() } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async () => { throw Error('Unexpected external request in unit test'); }, getDriveToken: async () => 'fixture-token'
  };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(source, ctx);
  ctx.saveProjectsData({ projects: [{ id: 'p1', title: 'Original', zone: 'active', events: [] }, { id: 'p2', title: 'Neighbour', zone: 'active', events: [] }], tasks: [{ id: 'task-keep' }], hiddenProjects: [], taskLog: [] });
  events.length = 0;
  return { ctx, storage, events, warnings, timers,
    data: () => copy(ctx.loadProjectsData()),
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } };
}
function editor(h) {
  const input = { value: 'Original', size: 10, style: {}, isConnected: true, focused: false,
    removeAttribute() {}, setAttribute() {}, focus() { this.focused = true; }, select() {},
    blur() { this.focused = false; if (this.onblur) this.onblur(); } };
  const cell = { classList: classes(), closest() { return this; }, querySelector: () => input, getAttribute: () => 'p1' };
  h.ctx.editProjectCell(cell);
  return { input, cell, key(key, extra) { input.onkeydown({ key, preventDefault() {}, stopPropagation() {}, ...extra }); } };
}
function sheetRow(overrides = {}) {
  const row = ['2026-01-01T00:00:00Z', 'p1', 'Old sheet name', 'In progress', '', '', '', '', '', '', '', '', '', '', '', '', '0'];
  Object.entries(overrides).forEach(([key, value]) => { row[Number(key)] = value; });
  return row;
}


test('server calendar cannot be replaced by the legacy Sheets mirror, even when its timestamp is fresh',async()=>{
 const h=harness(),before=h.data();let calls=0;h.ctx._driveToken='fixture';h.ctx.fetch=async()=>{calls++;return {ok:true,json:async()=>({values:[sheetRow({0:new Date().toISOString(),5:'2020-01-01',6:'2020-02-01'})]})};};
 assert.equal(await h.ctx.hydrateProjectsFromActiveSheet(true),false);h.ctx.runProjectsSheetPull(true);h.ctx.startProjectsSheetPullTimer();assert.equal(calls,0);assert.deepEqual(h.data(),before);
});
test('single and bulk moves preserve the current section, order of remaining projects and calendar',()=>{
 for(const bulk of [false,true]){const h=harness(),before=h.data();h.ctx.rerenderProjectsImmediate=()=>{};h.ctx._projectsZoneTab='active';if(bulk)h.ctx.moveProjectsToZone(['p1','p2'],'second_chance');else h.ctx.moveProjectToZone('p1','second_chance');assert.equal(h.ctx._projectsZoneTab,'active');assert.equal(h.data().projects[0].zone,'second_chance');assert.deepEqual(h.data().projects[0].events,before.projects[0].events);assert.deepEqual(h.data().tasks,before.tasks);}
});
test('group filtering does not mutate the default project order or zone',()=>{
 const h=harness(),before=h.data();h.ctx.ProjectGroups={forProject:(p,groups)=>groups.find(g=>g.id===p.projectGroupId)};assert.equal(h.ctx.getProjectGroupId({projectGroupId:'furniture'},[{id:'furniture'}]),'furniture');assert.deepEqual(h.data(),before);
});
test('disconnecting AoA-X preserves newer manual calendar entries rather than replaying its old backup',()=>{
 const h=harness(),p={events:[{type:'active_range',source:'manual',startDate:'2026-11-08',endDate:'2026-12-08'},{type:'active_range',source:'aoax',startDate:'2026-10-01',endDate:'2026-10-31'}],aoaxAutoloadBackup:{events:[{type:'active_range',source:'manual',startDate:'2020-01-01',endDate:'2020-02-01'}]}};
 h.ctx.restoreProjectBeforeAoax(p);assert.equal(p.events.length,1);assert.equal(p.events[0].startDate,'2026-11-08');assert.equal(p.aoaxAutoloadBackup,undefined);
});
}

{
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/backend-sync.js'), 'utf8');
const uidA = '11111111-1111-4111-8111-111111111111';
const uidB = '22222222-2222-4222-8222-222222222222';
const clientsKey = 'avitolog_clients_sasha';
const projectsKey = 'avitolog_projects_sasha';
const cashKey = 'avitolog_assets_my_v2_sasha';
const tick = () => new Promise(resolve => setImmediate(resolve));

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

function authSession(uid) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ sub: uid, exp: expires })).toString('base64url');
  return JSON.stringify({ access_token: 'header.' + payload + '.signature', refresh_token: 'test-refresh-' + uid, expires_at: expires, email: 'cyplakovaleksandr153@gmail.com' });
}

function environment(options = {}) {
  const localStorage = options.localStorage || storage();
  const sessionStorage = storage();
  const uid = options.uid || uidA;
  localStorage.setItem('avitolog_backend_session_v1', authSession(uid));
  if (options.viewer) { const session = JSON.parse(authSession(uid)); session.email = 'owner@example.invalid'; localStorage.setItem('avitolog_backend_session_v1', JSON.stringify(session)); }
  const listeners = new Map();
  const windowListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const elements = [];
  const document = {
    hidden: false,
    getElementById: () => null,
    createElement() {
      const element = { style: {}, textContent: '', appendChild() {} };
      elements.push(element); return element;
    },
    body: { appendChild() {} },
    addEventListener(name, callback) { listeners.set(name, callback); },
    dispatchEvent() {}
  };
  const window = {
    document, localStorage, sessionStorage,
    AVITOLOG_BACKEND_MODE: true, AVITOLOG_BACKEND_SERVER_ONLY: true,
    AVITOLOG_KEY_SUFFIX: options.suffix ?? '_sasha',
    AVITOLOG_SUPABASE: { url: 'https://supabase.invalid', publishableKey: 'test-key' },
    location: { search: '', reload() {} },
    addEventListener(name, callback) { windowListeners.set(name, callback); }
  };
  let reads = 0;
  const writes = [];
  const requests = [];
  const rows = options.rows || [];
  const response = data => ({ ok: true, status: 200, json: async () => data });
  const fetch = async (url, init) => {
    requests.push(url);
    if (url.includes('/auth/v1/token')) return response(JSON.parse(authSession(options.refreshUid || uid)));
    if (url.endsWith('/rpc/read_frontend_state')) {
      reads += 1;
      if (reads === 1 && options.initialRead) await options.initialRead;
      if (options.interceptRead) {
        const intercepted = await options.interceptRead(reads, rows);
        if (intercepted) return intercepted;
      }
      return response(rows.map(row => ({ ...row })));
    }
    if (url.includes('/frontend_state_records?')) return response(options.tableRows || []);
    if (url.endsWith('/rpc/compare_and_swap_frontend_edits') && options.history) {
      const body = JSON.parse(init.body);
      if (options.interceptHistory) { const answer = await options.interceptHistory(body, rows); if (answer) return answer; }
      if (body.p_edits.some(edit => rows.find(row => row.storage_key === edit.key)?.revision !== edit.expected_revision)) return { ok: false, status: 409, text: async () => '{"code":"40001","message":"conflict"}' };
      return response(body.p_edits.map(edit => { const row = rows.find(item => item.storage_key === edit.key); row.value_text = edit.value; row.revision++; return { storage_key: row.storage_key, revision: row.revision }; }));
    }
    if (url.endsWith('/rpc/upsert_frontend_state')) {
      if (options.interceptWrite) {
        const intercepted = await options.interceptWrite(init, localStorage);
        if (intercepted) return intercepted;
      }
      if (options.failWrites) throw new Error('offline');
      const body = JSON.parse(init.body);
      writes.push(body);
      const row = rows.find(item => item.storage_key === body.p_key);
      if (row) { row.value_text = body.p_value; row.revision += 1; }
      else rows.push({ storage_key: body.p_key, value_text: body.p_value, revision: 1 });
      return response({ revision: row?.revision || 1 });
    }
    throw new Error('Unexpected request: ' + url);
  };
  const context = vm.createContext({
    window, document, localStorage, sessionStorage, fetch, console,
    URLSearchParams, Date, Promise, AbortController,
    CustomEvent: function(name, data) { this.type = name; this.detail = data?.detail; },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: () => ++timerId, clearInterval() {}
  });
  vm.runInContext(source, context);
  return {
    window, localStorage, sessionStorage, rows, writes, requests, elements, windowListeners,
    start: () => listeners.get('DOMContentLoaded')(),
    edit(key, value, previousValue) {
      localStorage.setItem(key, value);
      listeners.get('avitolog:storage-write')({ detail: { key, value, previousValue } });
    },
    async drain() {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const ready = [...timers].filter(([, timer]) => timer.delay === 0);
        for (const [id, timer] of ready) { timers.delete(id); timer.callback(); }
        await tick();
        if (![...timers.values()].some(timer => timer.delay === 0)) { await tick(); return; }
      }
      throw new Error('Write queue did not settle');
    }
  };
}

const row = (key, value) => ({ storage_key: key, value_text: JSON.stringify(value), revision: 1, updated_at: new Date().toISOString() });
const pendingKeys = local => Object.keys(local.snapshot()).filter(key => key.startsWith('avitolog_backend_pending_payload_v2_'));


test('saving a card keeps unacknowledged calendar edits visible, including while its patch is in flight',async()=>{
 const base={projects:[{id:'p1',title:'A',events:[]}],tasks:[]};let release,started;
 const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 const env=environment({history:true,rows:[row(projectsKey,base)],interceptHistory:async()=>{started();await gate;}});await env.start();
 const save=env.window.__avitologBackendCommitStatePatch([projectsKey],values=>{const d=JSON.parse(values[projectsKey]);d.projects[0].title='Saved card';return {[projectsKey]:JSON.stringify(d)};});await ready;
 const draft=structuredClone(base);draft.projects[0].events=[{type:'active_range',startDate:'2026-11-08',endDate:'2026-12-08'}];draft.projects[0].mustLaunchRequired=true;
 env.edit(projectsKey,JSON.stringify(draft),JSON.stringify(base));release();await save;
 const visible=JSON.parse(env.localStorage.getItem(projectsKey));assert.equal(visible.projects[0].mustLaunchRequired,true);assert.equal(visible.projects[0].events.length,1);assert.equal(visible.projects[0].title,'Saved card');await env.drain();assert.deepEqual(JSON.parse(env.rows[0].value_text).projects[0].events,draft.projects[0].events);
});
test('a newer edit during a project write cannot delete newly discovered server projects or calendar types',async()=>{
 const initial={projects:[{id:'p1',title:'A',events:[]}],tasks:[]};let release,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);let intercepted=false;
 const env=environment({rows:[row(projectsKey,initial)],interceptWrite:async()=>{if(!intercepted){intercepted=true;started();await gate;}}});await env.start();
 const fresh=structuredClone(initial);fresh.projects.push({id:'server-only',title:'Remote'});fresh.projects[0].events=[{type:'active_range',startDate:'2026-11-08',endDate:'2026-12-08'}];env.rows[0].value_text=JSON.stringify(fresh);env.rows[0].revision++;
 const first=structuredClone(initial);first.projects[0].title='Renamed';env.edit(projectsKey,JSON.stringify(first),JSON.stringify(initial));const draining=env.drain();await ready;
 const second=structuredClone(first);second.projects[0].mustLaunchRequired=true;env.edit(projectsKey,JSON.stringify(second),JSON.stringify(first));release();await draining;await env.drain();
 const saved=JSON.parse(env.rows[0].value_text);assert.equal(saved.projects.length,2);assert.equal(saved.projects[0].events.length,1);assert.equal(saved.projects[0].mustLaunchRequired,true);
});
test('concurrent changes to different calendar types merge instead of replacing the whole calendar',async()=>{
 const base={projects:[{id:'p1',events:[]}],tasks:[]},env=environment({rows:[row(projectsKey,base)]});await env.start();const remote=structuredClone(base);remote.projects[0].events=[{type:'active_range',startDate:'2026-11-08',endDate:'2026-12-08'}];env.rows[0].value_text=JSON.stringify(remote);env.rows[0].revision++;
 const local=structuredClone(base);local.projects[0].events=[{type:'launch_range',startDate:'2026-11-09',endDate:'2026-11-15'}];env.edit(projectsKey,JSON.stringify(local),JSON.stringify(base));await env.drain();assert.deepEqual(JSON.parse(env.rows[0].value_text).projects[0].events.map(e=>e.type),['active_range','launch_range']);
});
test('the server-normalized snapshot, not the submitted card copy, becomes visible immediately',async()=>{
 const base={projects:[{id:'p1',zone:'second_chance',events:[]}],tasks:[]};let env;
 env=environment({history:true,rows:[row(projectsKey,base)],interceptHistory:async body=>{const record=env.rows[0],saved=JSON.parse(body.p_edits[0].value);saved.projects[0].zone='second_chance';record.value_text=JSON.stringify(saved);record.revision++;return {ok:true,status:200,json:async()=>[{storage_key:projectsKey,revision:record.revision,value_text:record.value_text}]};}});await env.start();
 await env.window.__avitologBackendCommitStatePatch([projectsKey],values=>{const d=JSON.parse(values[projectsKey]);d.projects[0].title='New title';return {[projectsKey]:JSON.stringify(d)};});
 assert.equal(JSON.parse(env.localStorage.getItem(projectsKey)).projects[0].zone,'second_chance');assert.equal(env.window.__avitologBackendReadConfirmedProjects().projects[0].title,'New title');
 const pendingMemory={projects:[{id:'in-memory-edit'}]};env.window._projectsDataMem=pendingMemory;env.window._projectsDataMemKey=projectsKey;await env.drain();assert.equal(env.window._projectsDataMem,pendingMemory,'delayed refresh cannot discard a newer memory edit');
});
}
