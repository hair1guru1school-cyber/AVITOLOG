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


const groupsApi=require('../../js/project-groups.js');
function groupState(){return {projectGroupsV1:groupsApi.catalog({}),projects:['p1','p2','p3'].map(id=>({id,zone:'active',title:id,sortOrder:1,projectGroupId:'furniture',projectGroupSource:'manual',crmData:{project_group_id:'furniture',notes:'Keep'},events:[{type:'active_range',startDate:'2026-11-01',endDate:'2026-12-01'}],mustLaunchRequired:true,manualPaymentsV1:{totalPaid:100}})),tasks:[{id:'keep-task'}]};}
function attachGroups(env){
 const win=env.window;win.CustomEvent=function(type,options){this.type=type;this.detail=options&&options.detail;};win.document.readyState='loading';win.AVITOLOG_KEY=k=>k+(win.AVITOLOG_KEY_SUFFIX||'');win.projectsMode=true;win.groupRefreshes=[];
 win._projectsDataMemKey=projectsKey;win._projectsDataMem=JSON.parse(env.localStorage.getItem(projectsKey));
 win.loadProjectsData=()=>win._projectsDataMem;
 win.saveProjectsData=next=>{const previous=env.localStorage.getItem(projectsKey);win._projectsDataMem=next;env.edit(projectsKey,JSON.stringify(next),previous);};
 win.refreshProjectsGroupRows=id=>win.groupRefreshes.push(id);win.rerenderProjectsPreserveScroll=()=>{throw Error('Unexpected full render');};
 return groupsApi.install(win);
}
test('group selection is visible and queued immediately without waiting for a server request',async()=>{
 const before=groupState(),env=environment({rows:[row(projectsKey,before)]});await env.start();const service=attachGroups(env),reads=env.requests.length;
 await service.assign('p1','fences');assert.equal(env.requests.length,reads);assert.equal(env.writes.length,0);assert.equal(pendingKeys(env.localStorage).length,1);assert.equal(env.window._projectsDataMem.projects[0].projectGroupId,'fences');assert.deepEqual(env.window.groupRefreshes,['p1']);assert.equal(JSON.parse(env.rows[0].value_text).projects[0].projectGroupId,'furniture');
 await env.drain();const saved=JSON.parse(env.rows[0].value_text);assert.equal(saved.projects[0].projectGroupId,'fences');assert.deepEqual(saved.projects[0].events,before.projects[0].events);assert.deepEqual(saved.tasks,before.tasks);assert.equal(saved.projects[0].manualPaymentsV1.totalPaid,100);
});
test('rapid clicks coalesce into one durable write and the last choice wins separately for each project',async()=>{
 const env=environment({rows:[row(projectsKey,groupState())]});await env.start();const service=attachGroups(env);
 await service.assign('p1','houses');await service.assign('p2','fences');await service.assign('p1','construction');await service.assign('p3','equipment');await service.assign('p2','houses');
 assert.equal(env.writes.length,0);await env.drain();assert.equal(env.writes.length,1);assert.deepEqual(JSON.parse(env.rows[0].value_text).projects.map(p=>p.projectGroupId),['construction','houses','equipment']);assert.equal(pendingKeys(env.localStorage).length,0);
});
test('choices made during a background write retain remote calendar edits and every later choice',async()=>{
 let release,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);let first=true;
 const initial=groupState(),env=environment({rows:[row(projectsKey,initial)],interceptWrite:async()=>{if(first){first=false;started();await gate;}}});await env.start();const service=attachGroups(env);
 const remote=structuredClone(initial);remote.projects[2].events.push({type:'launch_range',startDate:'2026-11-09',endDate:'2026-11-15'});env.rows[0].value_text=JSON.stringify(remote);env.rows[0].revision++;
 await service.assign('p1','fences');const draining=env.drain();await ready;await service.assign('p1','houses');await service.assign('p2','equipment');release();await draining;await env.drain();
 const saved=JSON.parse(env.rows[0].value_text);assert.equal(saved.projects[0].projectGroupId,'houses');assert.equal(saved.projects[1].projectGroupId,'equipment');assert.equal(saved.projects[2].events.length,2);
});
test('offline group changes survive reload and merge with newer server data instead of being lost',async()=>{
 const before=groupState(),offline=environment({rows:[row(projectsKey,before)],failWrites:true});await offline.start();await attachGroups(offline).assign('p1','fences');await offline.drain();assert.equal(pendingKeys(offline.localStorage).length,1);
 const remote=structuredClone(before);remote.projects[1].crmData.city='New city';const restored=environment({localStorage:offline.localStorage,rows:[row(projectsKey,remote)]});await restored.start();await restored.drain();const saved=JSON.parse(restored.rows[0].value_text);assert.equal(saved.projects[0].projectGroupId,'fences');assert.equal(saved.projects[1].crmData.city,'New city');assert.equal(pendingKeys(restored.localStorage).length,0);
});
test('deleted server groups reject queued assignments without losing the draft, and a valid new choice recovers',async()=>{
 const initial=groupState(),env=environment({rows:[row(projectsKey,initial)]});await env.start();const service=attachGroups(env);await service.assign('p1','fences');
 const remote=structuredClone(initial);remote.projectGroupsV1.groups.find(g=>g.id==='fences').deleted=true;env.rows[0].value_text=JSON.stringify(remote);env.rows[0].revision++;await env.drain();assert.equal(env.writes.length,0);assert.equal(pendingKeys(env.localStorage).length,1);assert.equal(JSON.parse(env.rows[0].value_text).projects[0].projectGroupId,'furniture');
 await service.assign('p1','houses');await env.drain();assert.equal(JSON.parse(env.rows[0].value_text).projects[0].projectGroupId,'houses');assert.equal(pendingKeys(env.localStorage).length,0);
});
test('read-only views, missing projects and unknown groups never enqueue writes',async()=>{
 const env=environment({rows:[row(projectsKey,groupState())]});await env.start();const service=attachGroups(env);await assert.rejects(service.assign('missing','fences'),/не найден/);await assert.rejects(service.assign('p1','missing'),/не существует/);env.window.__avitologBackendReadOnly=()=>true;await assert.rejects(service.assign('p1','fences'),/просмотра/);assert.equal(pendingKeys(env.localStorage).length,0);
});
test('opening group lists uses scoped memory, without cloning or fetching every project again',async()=>{
 const env=environment({rows:[row(projectsKey,groupState())]});await env.start();const service=attachGroups(env);env.window.__avitologBackendReadConfirmedProjects=()=>{throw Error('Full snapshot must not be cloned');};for(let i=0;i<50;i++)assert.equal(service.list().length,11);
});
test('a presentation error cannot falsely reject an already queued group change',async()=>{
 const env=environment({rows:[row(projectsKey,groupState())]});await env.start();const service=attachGroups(env);env.window.refreshProjectsGroupRows=()=>{throw Error('view failure');};await service.assign('p1','fences');assert.equal(pendingKeys(env.localStorage).length,1);await env.drain();assert.equal(JSON.parse(env.rows[0].value_text).projects[0].projectGroupId,'fences');
});
