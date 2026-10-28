'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/crm-settings.js'), 'utf8');
const box = { module: { exports: {} } };
vm.runInNewContext(source, box);
const api = box.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

function harness() {
  const local = new Map(), durable = new Map(), writes = [], events = [];
  let profile = 'fil', identity = 'owner-one';
  const win = {
    AVITOLOG_KEY: name => name + (profile === 'sasha' ? '_sasha' : ''),
    __avitologBackendIdentity: () => ({ id: identity }),
    localStorage: { getItem: key => local.get(key) || null, setItem(key, value) { local.set(key, value); } }
  };
  const driver = { read: async key => durable.get(key) || null, write: async value => { durable.set(value.scope, plain(value)); writes.push(plain(value)); } };
  return { win, local, durable, writes, events, driver, profile(value) { profile = value; }, identity(value) { identity = value; }, store() { const store = api.createStore(win, driver); store.subscribe(value => events.push(plain(value))); return store; } };
}

test('defaults are conservative, whitelisted and copied independently', () => {
  assert.deepEqual(plain(api.normalize()), { weeklyAutoSort: true, autoVk: true, autoTelegram: true, autoChatPositions: false, autoAccountDetails: false, soldColor: '#1b2b25', workColor: '#2a2722' });
  const result = api.normalize({ autoVk: false, autoTelegram: 'false', autoChatPositions: true, soldColor: '#ABCDEF', workColor: 'red;display:none', phone: 'not a preference' });
  assert.equal(result.autoVk, false); assert.equal(result.autoTelegram, true); assert.equal(result.autoChatPositions, true);
  assert.equal(result.soldColor, '#abcdef'); assert.equal(result.workColor, '#2a2722'); assert.equal(result.phone, undefined);
  const copy = api.normalize(); copy.autoVk = false; assert.equal(api.normalize().autoVk, true);
});

test('automation is fail-closed until the persisted settings have loaded', async () => {
  const h = harness(), key = api.scope(h.win);
  let release;
  h.driver.read = () => new Promise(resolve => { release = resolve; });
  const store = h.store(); assert.equal(store.isEnabled('autoVk'), false); assert.equal(store.isReady(), false);
  await Promise.resolve();
  release({ scope: key, updatedAt: 20, settings: { autoVk: false, autoTelegram: true } });
  await store.whenReady();
  assert.equal(store.isReady(), true); assert.equal(store.isEnabled('autoVk'), false); assert.equal(store.isEnabled('autoTelegram'), true);
  assert.equal(store.isEnabled('unknownFlag'), false);
});

test('local fallback settings and colors survive a new store instance', async () => {
  const h = harness(); h.driver.read = h.driver.write = async () => { throw Error('idb unavailable'); };
  const first = h.store(); await first.whenReady();
  const saved = await first.set({ autoVk: false, soldColor: '#245537' });
  assert.equal(saved.saved, true); assert.equal(saved.mode, 'localStorage');
  const second = h.store(); await second.whenReady();
  assert.equal(second.get().autoVk, false); assert.equal(second.get().soldColor, '#245537');
});

test('weekly sorting defaults on for old records and an explicit opt-out persists', async () => {
  const h = harness(), first = h.store(); await first.whenReady();
  assert.equal(first.get().weeklyAutoSort, true); await first.set({ weeklyAutoSort: false });
  const next = h.store(); await next.whenReady(); assert.equal(next.get().weeklyAutoSort, false);
  assert.equal(next.get().autoVk, true);
});

test('IndexedDB path persists when localStorage is full or unavailable', async () => {
  const h = harness(); h.win.localStorage.getItem = h.win.localStorage.setItem = () => { throw Error('QuotaExceededError'); };
  const first = h.store(); await first.whenReady();
  const saved = await first.set({ autoTelegram: false, workColor: '#123456' });
  assert.equal(saved.saved, true); assert.equal(saved.mode, 'indexeddb');
  assert.equal(first.status().saved, true);
  const second = h.store(); await second.whenReady();
  assert.equal(second.get().autoTelegram, false); assert.equal(second.get().workColor, '#123456');
});

test('unavailable persistent storage reports memory-only instead of a false saved state', async () => {
  const h = harness(); h.win.localStorage.setItem = () => { throw Error('quota'); };
  h.driver.read = h.driver.write = async () => { throw Error('unavailable'); };
  const store = h.store(); await store.whenReady(); const result = await store.set({ autoVk: false });
  assert.equal(result.saved, false); assert.equal(result.mode, 'memory'); assert.equal(store.get().autoVk, false);
  assert.equal(store.status().saved, false);
});

test('profiles and signed-in account identities never share cached preferences', async () => {
  const h = harness(), store = h.store(); await store.whenReady(); await store.set({ autoVk: false, soldColor: '#123456' });
  h.profile('sasha'); assert.equal(store.isEnabled('autoVk'), false); await store.whenReady();
  assert.equal(store.get().autoVk, true); assert.equal(store.get().soldColor, '#1b2b25');
  await store.set({ autoTelegram: false });
  h.profile('fil'); await store.whenReady(); assert.equal(store.get().autoVk, false); assert.equal(store.get().autoTelegram, true);
  h.identity('owner-two'); await store.whenReady(); assert.equal(store.get().autoVk, true); assert.equal(store.get().soldColor, '#1b2b25');
  assert.equal(h.durable.size, 2);
});

test('switching profiles during a delayed read prevents a stale save', async () => {
  const h = harness(); let release; h.driver.read = () => new Promise(resolve => { release = resolve; });
  const store = h.store(), write = store.set({ autoVk: false }); await Promise.resolve(); h.profile('sasha'); release(null);
  await assert.rejects(write, /Профиль изменился/); assert.equal(h.writes.length, 0); assert.equal(h.local.size, 0);
});

test('newer local record wins over a stale IndexedDB result', async () => {
  const h = harness(), key = api.scope(h.win);
  h.local.set(key, JSON.stringify({ scope: key, updatedAt: 50, settings: { autoVk: false } }));
  h.durable.set(key, { scope: key, updatedAt: 10, settings: { autoVk: true } });
  const store = h.store(); await store.whenReady(); assert.equal(store.get().autoVk, false);
});

test('rapid preference saves are serialized and keep the latest complete snapshot', async () => {
  const h = harness(), store = h.store(); await store.whenReady();
  const pending = [store.set({ autoVk: false }), store.set({ autoTelegram: false }), store.set({ soldColor: '#123456' })];
  await Promise.all(pending);
  assert.equal(h.writes.length, 3);
  const last = h.writes[2].settings;
  assert.equal(last.autoVk, false); assert.equal(last.autoTelegram, false); assert.equal(last.soldColor, '#123456');
  assert.ok(h.writes[2].updatedAt > h.writes[0].updatedAt);
});

test('external tab refresh can load updated preferences without leaking the prior scope', async () => {
  const h = harness(), store = h.store(); await store.whenReady();
  h.local.set(api.scope(h.win), JSON.stringify({ scope: api.scope(h.win), updatedAt: Date.now(), settings: { autoVk: false } }));
  await store.refresh(); assert.equal(store.get().autoVk, false);
  const value = store.get(); value.autoVk = true; assert.equal(store.get().autoVk, false);
});

test('custom-color contrast chooses readable text without modifying the global theme', () => {
  assert.equal(api.contrast('#ffffff').ink, '#173027'); assert.equal(api.contrast('#000000').ink, '#edf8f2');
  assert.match(source, /robot\.parentNode\.insertBefore\(button, robot\.nextSibling\)/);
  assert.match(source, /if \(custom\).*?setProperty/);
  assert.match(source, /else doc\.body\.style\.removeProperty\(name\)/);
  assert.doesNotMatch(source, /\bfetch\(|saveCrmClients\(|saveProjectsData\(|setActiveClient\(/);
});
