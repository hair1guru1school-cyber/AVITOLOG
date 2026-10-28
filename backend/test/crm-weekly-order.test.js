'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/goals.js'), 'utf8');
function harness() {
  let data = { projects: [] }, writes = 0;
  const values = new Map(), window = { AVITOLOG_BACKEND_SERVER_ONLY: true, AVITOLOG_BACKEND_INITIAL_SYNC_READY: false, AVITOLOG_KEY: key => key };
  const document = { addEventListener() {}, getElementById() { return null; } };
  window.__read = () => JSON.parse(JSON.stringify(data)); window.__write = value => { data = value; writes++; };
  const end = source.lastIndexOf('})();');
  const code = source.slice(0, end) + `
    loadLiveData = window.__read;
    setGoalsStorageValue = function(key, value) { window.__write(JSON.parse(value)); return true; };
    window.__test = { rank: weeklyProjectRank, order: orderedWeekProjects, week: renderWeekSection, section: renderSection, create: createGoalProjectFromClient, enabled: weeklyAutoSortEnabled };
  ` + source.slice(end);
  vm.runInNewContext(code, { window, document, Date, JSON, Intl, Math, console, localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }, setInterval() {}, setTimeout() {}, clearTimeout() {} });
  return { api: window.__test, window, data: () => data, set: value => { data = value; }, writes: () => writes };
}
const project = (id, extra = {}) => ({ id, name: id, stage: 'weekly', date: '2026-10-28', status: [], ...extra });
test('weekly display has four stable priority tiers and does not mutate records or manual order', () => {
  const h = harness(), rows = [project('paid', { status: ['paid'], mainPrice: '500' }), project('empty'), project('priced', { mainPrice: '10 000' }), project('kp1', { mainPrice: '200', status: ['kp_sent'] }), project('kp2', { mainPrice: '100', status: ['kp'] }), project('linked', { mainPrice: '900', status: ['kp'] })];
  const before = JSON.stringify(rows), soldLinks = { linked: true };
  assert.deepEqual(Array.from(h.api.order(rows, soldLinks, true), p => p.id), ['kp1', 'kp2', 'priced', 'empty', 'paid', 'linked']);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(Array.from(h.api.order(rows, soldLinks, false), p => p.id), rows.map(p => p.id));
});
test('zero, missing, negative and malformed prices are unpriced even with a KP tag', () => {
  const h = harness();
  for (const value of ['', '—', '0', '-1', 'unknown']) assert.equal(h.api.rank(project('x', { mainPrice: value, status: ['kp'] }), {}), 2);
  assert.equal(h.api.rank(project('x', { priceOptions: ['—', '1 500,50'] }), {}), 1);
  assert.equal(h.api.rank(project('x', { mainPrice: '25 000 ₽', status: ['kp'] }), {}), 0);
  assert.equal(h.api.rank(project('x', { status: ['paid'] }), {}), 3);
});
test('rendered rows use new buttons and optional dimming, without an account-source picker', () => {
  const h = harness(), rows = [project('empty'), project('paid', { status: ['paid'] }), project('priced', { mainPrice: '100' })];
  let html = h.api.week(4, rows, [], null, 4, 2026, 9, []);
  assert.match(html, /goal-week-no-price/); assert.match(html, /goal-week-paid/);
  assert.match(html, /goal-folder-action/); assert.match(html, /goal-paid-action/); assert.match(html, /goal-actions-menu-btn/);
  assert.doesNotMatch(html, /goal-source-btn|title="Удалить из недели"|В работу \(копия/);
  assert.ok(html.indexOf('goal-folder-action') < html.indexOf('goal-contact-btn'));
  h.window.CrmSettings = { get: () => ({ weeklyAutoSort: false }) };
  html = h.api.week(4, rows, [], null, 4, 2026, 9, []);
  assert.doesNotMatch(html, /goal-week-no-price|goal-week-paid/);
  assert.equal(h.writes(), 0);
});
test('adding a client or price does not invent a KP status; confirmed saved files do', () => {
  const h = harness(), client = { company: 'Client', folderId: 'folder', kp_count: '25000' };
  assert.deepEqual(Array.from(h.api.create(client, 4, 'weekly').status), []);
  h.window.__getSavedKpPackagesForClient = () => [{ imageFileId: '' }];
  assert.deepEqual(Array.from(h.api.create(client, 4, 'weekly').status), []);
  h.window.__getSavedKpPackagesForClient = () => [{ imageFileId: 'confirmed-file' }];
  assert.deepEqual(Array.from(h.api.create(client, 4, 'weekly').status), ['kp']);
});
test('a confirmed KP updates exact current client links only, retaining financial and other fields', () => {
  const h = harness(); h.set({ projects: [project('linked', { folderId: 'folder', phone: '+70000000000', status: ['invoice'], saleAmount: '123' }), project('same-name', { name: 'Client', folderId: 'other' }), project('sold', { folderId: 'folder', stage: 'sold', status: ['paid'] }), project('archive', { folderId: 'folder', stage: 'archive' })] });
  assert.equal(h.window.__goalsKpCreated({ folderId: 'folder' }, '', 'folder', 'now'), 0);
  assert.equal(h.writes(), 0);
  assert.equal(h.window.__goalsKpCreated({ folderId: 'folder' }, 'file-id', 'resolved-folder', 'now'), 1);
  const rows = h.data().projects;
  assert.deepEqual(rows[0].status, ['invoice', 'kp']); assert.equal(rows[0].saleAmount, '123'); assert.equal(rows[0].phone, '+70000000000');
  assert.equal(rows[0].kpCreatedV1.fileId, 'file-id'); assert.deepEqual(rows[1].status, []); assert.deepEqual(rows[2].status, ['paid']); assert.deepEqual(rows[3].status, []);
});

test('a read-only profile cannot be changed by the KP callback', () => {
  const h = harness(); h.set({ projects: [project('p', { folderId: 'folder' })] });
  h.window.AVITOLOG_BACKEND_MODE = true; h.window.AVITOLOG_PROFILE_LOCKED = false; h.window.AVITOLOG_KEY = key => key + '_sasha';
  assert.equal(h.window.__goalsKpCreated({ folderId: 'folder' }, 'file', 'folder', 'now'), 0); assert.equal(h.writes(), 0);
});
