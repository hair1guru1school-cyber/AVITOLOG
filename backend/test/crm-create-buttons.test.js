'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/goals.js'), 'utf8');

function harness(suffix = '_sasha') {
  const handlers = [], notices = [], opened = [];
  const window = { AVITOLOG_BACKEND_SERVER_ONLY: true, AVITOLOG_BACKEND_INITIAL_SYNC_READY: false,
    AVITOLOG_KEY: key => key + suffix, __showToast: text => notices.push(text) };
  const document = { addEventListener(type, fn, options) { handlers.push({ type, fn, options }); },
    getElementById: () => null, createElement() { throw Error('Unexpected form creation'); } };
  const end = source.lastIndexOf('})();');
  const code = source.slice(0, end) + `
    window.__createTest = { originalOpen: openModal,
      capture: function() { openModal = function(button, week, stage) { window.__opened(button, week, stage); }; },
      captureClient: function() { addClientToWeek = function(week, name) { window.__opened(null, week, name); }; },
      payload: getSelectedLeftPayload,
      insert: function(client, data) { loadData = function() { return data; }; saveData = function() { return true; }; syncGoalToKassaIfReady = function() {}; render = function() {}; insertClientToWeekAt(3, '', 'weekly', client); return data.projects; },
      week: renderWeekSection, section: renderSection };
  ` + source.slice(end);
  window.__opened = (button, week, stage) => opened.push({ button, week, stage });
  vm.runInNewContext(code, { window, document, Date, Intl, JSON, console,
    localStorage: { getItem: () => null }, setTimeout() {}, clearTimeout() {}, setInterval() {} });
  return { window, document, handlers, notices, opened, api: window.__createTest };
}
function button(attrs = {}, block = '') {
  return { getAttribute: key => attrs[key] || null,
    closest: selector => selector === '.goal-block' && block ? { classList: { contains: key => key === 'goal-block-' + block } } : null };
}
function click(h, b) {
  let prevented = 0, stopped = 0;
  const event = { target: { closest: () => b }, currentTarget: h.document,
    preventDefault: () => prevented++, stopPropagation: () => stopped++ };
  h.handlers.filter(x => x.type === 'click' && x.options === true).forEach(x => x.fn(event));
  return { prevented, stopped };
}

test('create handlers exist before the first CRM render, including Sasha startup', () => {
  for (const suffix of ['', '_sasha']) {
    const h = harness(suffix);
    assert.equal(typeof h.window.__goalsOpenModalForWeek, 'function');
    assert.equal(typeof h.window.__goalsOpenModalForBtn, 'function');
    h.api.capture();
    h.window.__goalsOpenModalForWeek({ currentTarget: button() }, 2);
    assert.equal(h.opened[0].week, 2); assert.equal(h.opened[0].stage, 'weekly');
  }
});

test('weekly create clicks do not depend on global inline handlers or a completed rerender', () => {
  const h = harness(); h.api.capture();
  delete h.window.__goalsOpenModalForWeek;
  const b = button({ 'data-goal-create-week': '3' });
  assert.deepEqual(click(h, b), { prevented: 1, stopped: 1 });
  assert.equal(h.opened.length, 1); assert.equal(h.opened[0].button, b);
  assert.equal(h.opened[0].week, 3); assert.equal(h.opened[0].stage, 'weekly');
});

test('working, sold and archive add buttons preserve their target stage', () => {
  const h = harness(); h.api.capture();
  for (const stage of ['working', 'sold', 'archive']) click(h, button({ 'data-goal-create-stage': stage }));
  assert.deepEqual(h.opened.map(x => x.stage), ['working', 'sold', 'archive']);
  assert.ok(h.opened.every(x => x.week === null));
});

test('unrelated Telegram buttons and disabled controls are left alone', () => {
  const h = harness(); h.api.capture();
  assert.deepEqual(click(h, null), { prevented: 0, stopped: 0 });
  const disabled = button({ 'data-goal-create-week': '1' }); disabled.disabled = true;
  assert.deepEqual(click(h, disabled), { prevented: 0, stopped: 0 });
  assert.equal(h.opened.length, 0);
});

test('waiting and read-only profiles get an explicit notice without creating or changing data', () => {
  const h = harness();
  h.api.originalOpen(null, 1, 'weekly'); assert.equal(h.notices.length, 1);
  h.window.AVITOLOG_BACKEND_INITIAL_SYNC_READY = true;
  h.window.__avitologBackendReadOnly = () => true;
  h.api.originalOpen(null, 1, 'weekly'); assert.equal(h.notices.length, 2);
  assert.equal(h.opened.length, 0);
});

test('week markup carries its own create target instead of a silent optional inline handler', () => {
  const h = harness();
  const html = h.api.week(3, [], [], null, 3, 2026, 10, []);
  assert.match(html, /data-goal-create-week="3"/);
  assert.doesNotMatch(html, /onclick="window\.__goalsOpenModalForWeek/);
  assert.match(h.api.section('Working', '', [], '', false, false, 'work'), /data-goal-create-stage="working"/);
});

test('attached client buttons work before rerender and without the optional global mirror', () => {
  const h = harness(); h.api.captureClient(); delete h.window.__goalsAddClientToWeek;
  const b = button({ 'data-goal-add-client-week': '3', 'data-goal-client-name': 'Выкуп тачек' });
  assert.deepEqual(click(h, b), { prevented: 1, stopped: 1 });
  assert.equal(h.opened.length, 1); assert.equal(h.opened[0].week, 3); assert.equal(h.opened[0].stage, 'Выкуп тачек');
});

test('attached client selection never takes another project name or contacts from the hidden form', () => {
  const h = harness(); h.window.__goalsGetActiveClient = () => ({ company: 'Выкуп тачек', folderId: 'selected-folder', phone: 'selected-phone', telegram: 'selected-tg', category: 'Авто', source_account_id: 'selected-source' });
  const hidden = { company: 'Блочник', phone: 'other-phone', contact_name: 'Other person', tg: 'other-tg', category: 'Дома', source_account_id: 'other-source' };
  h.document.getElementById = id => Object.hasOwn(hidden, id) ? { value: hidden[id] } : null;
  const payload = h.api.payload(true);
  assert.equal(payload.company, 'Выкуп тачек'); assert.equal(payload.phone, 'selected-phone'); assert.equal(payload.telegram, 'selected-tg'); assert.equal(payload.contact_name || '', ''); assert.equal(payload.source_account_id, 'selected-source');
  assert.equal(h.api.payload().company, 'Блочник');
});

test('shared legacy folder links cannot replace another named CRM project', () => {
  const h=harness();h.window.AVITOLOG_BACKEND_INITIAL_SYNC_READY=true;
  const old={id:'existing',name:'Елочник',company:'Выкуп тачек',stage:'weekly',date:'2026-11-15',folderId:'shared-folder',crmClientId:'shared-folder',crmClientRecordId:'shared-client',mainPrice:'20000',weekIndex:3};
  const snapshot=JSON.stringify(old),data={projects:[old]},client={company:'Выкуп тачек',folderId:'shared-folder',client_id:'shared-client'};
  h.api.insert(client,data);assert.equal(data.projects.length,2);assert.equal(JSON.stringify(old),snapshot);assert.equal(data.projects[0].name,'Выкуп тачек');assert.equal(data.projects[0].weekIndex,3);
  h.api.insert(client,data);assert.equal(data.projects.length,2);
});
