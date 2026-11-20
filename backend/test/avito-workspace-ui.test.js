'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const USER = 'aa63f3cd-73bc-40c0-9b5f-ce62f3d28e49';
const ORG = '2d775d05-277d-4955-82cd-f2abfaa25311';
const OTHER = 'd1915d6d-2f70-4c75-be95-454dd1b64dce';
const ACCOUNT = '24136436-1484-4e54-9da3-a5bfbf281515';
const ORIGIN = 'https://hair1guru1school-cyber.github.io';
const HOST = 'https://avitoboss.online';
const source = name => fs.readFileSync(path.resolve(__dirname, '../../js/' + name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const response = value => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });
const drain = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
const token = subject => 'header.' + Buffer.from(JSON.stringify({ sub: subject, exp: 4102444800 })).toString('base64url') + '.signature';

function childHarness(options = {}) {
  const messages = [], calls = [], events = {}, storage = new Map();
  storage.set('avitolog_avito_accounts_session', JSON.stringify({ access_token: token(options.subject || USER), expires_at: 4102444800 }));
  const parent = { postMessage(value, origin) { messages.push({ value: clone(value), origin }); } };
  const window = {
    parent, location: { href: HOST + '/integrations/avito-accounts/?workspaceBridge=1&expected_user_id=' + USER + '&organization_id=' + ORG + (options.extraQuery || ''), protocol: 'https:', hostname: 'avitoboss.online' },
    addEventListener(type, callback) { events[type] = callback; }
  };
  const document = { readyState: 'complete', getElementById() { throw new Error('Bridge initialized normal accounts UI'); } };
  const account = { id: ACCOUNT, avito_user_id: '123', display_name: 'Fil Ai Маркетинг', status: 'connected', access_token: 'private-credential' };
  const context = { window, document, sessionStorage: { getItem(key) { return storage.get(key) || null; }, setItem(key, value) { storage.set(key, value); } }, localStorage: { getItem() { return null; } }, URL, Intl, Date, AbortController,
    atob: value => Buffer.from(value, 'base64').toString('binary'), setTimeout() { return 1; }, clearTimeout() {},
    async fetch(url, init) {
      calls.push({ url, init });
      if (options.fetchOverride) { const overridden = await options.fetchOverride(url, init, window); if (overridden) return overridden; }
      if (url.endsWith('/context')) return response({ ok: true, user: { id: USER }, organizations: [{ id: ORG, role: 'owner' }] });
      if (url.includes('/accounts?')) return response({ ok: true, accounts: [account] });
      if (url.includes('/connections?')) return response({ ok: true, connections: [{ ...account, id: OTHER, avito_user_id: '123' }] });
      if (url.includes('/preferences?')) return response({ ok: true, preferences: [] });
      if (url.includes('/chats')) return response({ ok: true, chats: [], messages: [], pagination: { has_more: false } });
      if (url.includes('/accounts/' + ACCOUNT)) return response({ ok: true, account, overview: { today: { contacts: 3 } }, profile: { name: 'Safe account' } });
      throw new Error('Unexpected request ' + url);
    }
  };
  vm.runInNewContext(source('avito-accounts.js'), context);
  return { calls, messages, window, parent, storage,
    async request(fields = {}, origin = ORIGIN, sender = parent) {
      await events.message({ source: sender, origin, data: { type: 'avitolog:workspace:request', requestId: '0123456789abcdef', action: 'accounts', ...fields } });
      return messages.at(-1)?.value;
    }
  };
}

test('workspace child bridge is idle, pins user/organization and returns de-duplicated non-secret catalog', async () => {
  const h = childHarness();
  assert.equal(h.calls.length, 0);
  const result = await h.request();
  assert.deepEqual(result.accounts, [{ id: 'personal:' + ACCOUNT, account_id: ACCOUNT, source: 'personal', avito_user_id: '123', display_name: 'Fil Ai Маркетинг' }]);
  assert.equal(h.calls.length, 3);
  assert.ok(h.calls.every(call => call.url.includes('organization_id=' + ORG) && !call.url.endsWith('/context')));
  assert.ok(h.calls.every(call => call.url.includes('messenger_access=1')), 'chat catalog requests opt in to messenger-only access');
  assert.ok(!JSON.stringify(result).includes('private-credential'));
  for (const [origin, sender] of [['https://evil.invalid', h.parent], [ORIGIN, {}]]) {
    const count = h.messages.length; await h.request({}, origin, sender); assert.equal(h.messages.length, count);
  }
  const other = childHarness({ subject: OTHER });
  assert.equal((await other.request()).code, 'subject_mismatch');
  assert.equal(other.calls.length, 0);
  const mixed = childHarness({ extraQuery: '&embedded=1' });
  assert.equal((await mixed.request()).code, 'invalid_request');
  assert.equal(mixed.calls.length, 0);
});

test('workspace child routes reads and explicit sends only to authorized catalog ids with safe POST bodies', async () => {
  const h = childHarness();
  assert.equal((await h.request({ action: 'send', accountId: 'personal:' + OTHER, chatId: 'chat1', text: 'Hello', sendId: OTHER })).code, 'account_forbidden');
  const sent = await h.request({ action: 'send', accountId: 'personal:' + ACCOUNT, chatId: 'chat1', text: 'Hello', sendId: OTHER });
  assert.equal(sent.ok, true);
  const call = h.calls.at(-1);
  assert.equal(call.url, '/api/integrations/avito-accounts/accounts/' + ACCOUNT + '/chats/chat1/messages');
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(JSON.parse(call.init.body), { organization_id: ORG, text: 'Hello', request_id: OTHER });
  assert.equal((await h.request({ action: 'messages', accountId: 'personal:' + ACCOUNT, chatId: '../bad' })).code, 'invalid_request');
});

test('workspace catalog skips redundant health context and shares concurrent metadata without weakening endpoint denials', async () => {
  const gates = [];
  const h = childHarness({ fetchOverride(url) {
    if (url.endsWith('/context')) throw new Error('Workspace must not run storage health probes');
    return new Promise(resolve => gates.push(resolve));
  } });
  const first = h.request({ requestId: '1111111111111111' });
  const second = h.request({ requestId: '2222222222222222' });
  await drain();
  assert.equal(gates.length, 3, 'the card and chat share one metadata batch');
  assert.equal(h.calls.length, 3);
  gates.forEach(resolve => resolve());
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  for (const endpoint of ['/accounts?', '/connections?', '/preferences?']) {
    const denied = childHarness({ fetchOverride(url) {
      if (url.includes(endpoint)) return { ok: false, status: 403, text: async () => JSON.stringify({ ok: false, error: 'permission_denied' }) };
    } });
    const value = await denied.request();
    assert.equal(value.ok, false);
    assert.equal(value.code, 'permission_denied');
    assert.equal(value.accounts, undefined);
    assert.equal(value.result, undefined);
    assert.equal(denied.calls.length, 3);
  }
});

test('workspace child removes all result data if final subject postguard fails', async () => {
  const h = childHarness({ fetchOverride(url, init, window) {
    if (!url.includes('/chats')) return;
    window.AVITOLOG_AVITO_SESSION_STORE = { async readVersioned() { return { available: true, revision: 2, session: { access_token: token(OTHER), expires_at: 4102444800 } }; } };
    return response({ ok: true, chats: [{ id: 'private-chat', text: 'sensitive-message' }] });
  } });
  const result = await h.request({ action: 'chats', accountId: 'personal:' + ACCOUNT });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'subject_mismatch');
  assert.equal(result.result, undefined, 'an error response must not carry the prior account chat data');
  assert.equal(result.overview, undefined);
  assert.equal(result.accounts, undefined);
});

test('workspace child action fields are strict before metadata access, with backend-compatible pagination', async () => {
  for (const fields of [
    { action: 'accounts', accountId: 'personal:' + ACCOUNT },
    { action: 'overview', accountId: 'personal:' + ACCOUNT, offset: 0 },
    { action: 'chats', accountId: 'personal:' + ACCOUNT, text: 'ignored-secret' },
    { action: 'messages', accountId: 'personal:' + ACCOUNT, chatId: 'chat1', sendId: OTHER },
    { action: 'send', accountId: 'personal:' + ACCOUNT, chatId: 'chat1', text: 'Hello', sendId: OTHER, offset: 0 },
    { action: 'read', accountId: 'personal:' + ACCOUNT, chatId: 'chat1', text: 'ignored-secret' }
  ]) {
    const h = childHarness();
    assert.equal((await h.request(fields)).code, 'invalid_request');
    assert.equal(h.calls.length, 0);
  }
  const h = childHarness();
  assert.equal((await h.request({ action: 'messages', accountId: 'personal:' + ACCOUNT, chatId: 'chat1', offset: 1001 })).code, 'invalid_request');
  assert.ok(h.calls.every(call => !call.url.includes('/chats')));
});

class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.attributes = {}; this.style = {}; this._text = ''; this.value = ''; this.hidden = false; this.disabled = false; this.parentNode = null; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { throw new Error('Unsafe HTML insertion: ' + value); }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  focus() {}
  async emit(type, fields = {}) { const event = { preventDefault() {}, stopPropagation() {}, target: this, ...fields }; await Promise.all((this.listeners[type] || []).map(fn => fn(event))); }
  requestSubmit() { return this.emit('submit'); }
  all(predicate) { return this.children.flatMap(child => [child, ...child.all(predicate)]).filter(predicate); }
  querySelectorAll(selector) { return this.all(node => selector.startsWith('.') ? String(node.className || '').split(/\s+/).includes(selector.slice(1)) : node.tagName === selector.toUpperCase()); }
}
function parentHarness(options = {}) {
  const body = new Node('body'), events = {}, intervals = [], timers = new Map(), posts = [], dispatched = [];
  let timerId = 0;
  const document = { body, createElement(tag) { const node = new Node(tag); node.contentWindow = { postMessage(value, origin) { posts.push({ value: clone(value), origin, frame: node }); } }; return node; }, dispatchEvent(event) { dispatched.push(clone(event)); } };
  const window = { AVITOLOG_BACKEND_MODE: true, AVITOLOG_BACKEND_INITIAL_SYNC_READY: true, __avitologBackendIdentity() { return { id: USER }; }, AVITOLOG_SUPABASE: { profileOrganizations: { fil: ORG, sasha: OTHER } }, addEventListener(type, callback) { events[type] = callback; } };
  if (options.productionConfig) vm.runInNewContext(source('supabase-config.js'), { window });
  const context = { window, document, crypto: webcrypto, URL, Date, Uint8Array, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval(fn) { intervals.push(fn); return intervals.length; } };
  vm.runInNewContext(source('avito-workspace-bridge.js'), context);
  return { window, document, posts, intervals, timers, dispatched, frames: () => body.children,
    respond(post, data, origin = HOST, sender = post.frame.contentWindow) { events.message({ source: sender, origin, data: { type: 'avitolog:workspace:response', requestId: post.value.requestId, ...data } }); },
    expire(delay) { [...timers].filter(([, timer]) => timer.delay === delay).forEach(([id, timer]) => { timers.delete(id); timer.fn(); }); }
  };
}

test('Sasha has a default chat organization while the bridge still pins his signed-in identity', async () => {
  const h = parentHarness({ productionConfig: true });
  h.window.__avitologBackendIdentity = () => ({ id: OTHER });
  h.window.AVITOLOG_USER = 'sasha';
  h.window.AVITOLOG_KEY_SUFFIX = '_sasha';
  assert.equal(h.window.AvitoWorkspaceBridge.context(), OTHER + '|sasha|' + ORG);
  const task = h.window.AvitoWorkspaceBridge.listAccounts(); await drain();
  const frame = h.frames()[0];
  assert.equal(new URL(frame.src).searchParams.get('expected_user_id'), OTHER);
  assert.equal(new URL(frame.src).searchParams.get('organization_id'), ORG);
  await frame.emit('load'); await drain();
  h.respond(h.posts[0], { ok: true, accounts: [] });
  assert.equal((await task).length, 0);
  h.window.AVITOLOG_USER = 'unknown';
  h.window.AVITOLOG_KEY_SUFFIX = '';
  h.window.__avitologBackendIdentity = () => null;
  assert.equal(h.window.AvitoWorkspaceBridge.context(), '');
});

test('workspace parent pins iframe context, ignores forged responses and caches only safe account metadata', async () => {
  const h = parentHarness();
  const task = h.window.AvitoWorkspaceBridge.listAccounts(); await drain();
  const frame = h.frames()[0];
  assert.equal(new URL(frame.src).origin, HOST);
  assert.equal(new URL(frame.src).searchParams.get('expected_user_id'), USER);
  assert.equal(new URL(frame.src).searchParams.get('organization_id'), ORG);
  await frame.emit('load'); await drain();
  const post = h.posts[0]; assert.equal(post.origin, HOST);
  h.respond(post, { ok: true, accounts: [] }, 'https://evil.invalid');
  h.respond(post, { ok: true, accounts: [] }, HOST, {});
  h.respond(post, { ok: true, accounts: [{ source: 'personal', account_id: ACCOUNT, id: 'personal:' + ACCOUNT, avito_user_id: '123', display_name: 'Fil', private: 'do-not-copy' }] });
  const accounts = await task;
  assert.equal(accounts.length, 1); assert.ok(!JSON.stringify(accounts).includes('do-not-copy'));
  assert.equal((await h.window.AvitoWorkspaceBridge.listAccounts()).length, 1);
  assert.equal(h.posts.length, 1);
});

test('workspace parent rejects pending frame load on profile change and a late old load cannot cancel the new timeout', async () => {
  const h = parentHarness();
  const first = h.window.AvitoWorkspaceBridge.listAccounts().then(() => 'resolved', error => error.message); await drain();
  const old = h.frames()[0];
  h.window.AVITOLOG_KEY_SUFFIX = '_sasha';
  h.intervals.forEach(fn => fn());
  assert.equal(await first, 'context_changed');
  assert.deepEqual(h.dispatched, [{ type: 'avitolog:workspace-reset', detail: { reason: 'context_changed' } }]);
  const second = h.window.AvitoWorkspaceBridge.listAccounts().then(() => 'resolved', error => error.message); await drain();
  assert.notEqual(h.frames()[0], old);
  await old.emit('load');
  assert.ok([...h.timers.values()].some(timer => timer.delay === 25000), 'stale iframe load must not clear the current readiness timeout');
  h.expire(25000);
  assert.equal(await second, 'transport_unavailable');
  assert.equal(h.dispatched.at(-1).detail.reason, 'transport_unavailable');
  assert.equal(h.frames().length, 0);
  assert.equal(h.timers.size, 0);
});

test('workspace iframe readiness timeout settles all waiting callers with a transport-only reset and permits an explicit retry', async () => {
  const h = parentHarness(), originalScope = h.window.AvitoWorkspaceBridge.context();
  const first = h.window.AvitoWorkspaceBridge.listAccounts().then(() => 'resolved', error => error.message);
  const second = h.window.AvitoWorkspaceBridge.getChats('personal:' + ACCOUNT).then(() => 'resolved', error => error.message);
  await drain();
  const old = h.frames()[0];
  assert.equal(h.frames().length, 1);
  assert.equal(h.posts.length, 0);
  h.expire(25000);
  assert.deepEqual(await Promise.all([first, second]), ['transport_unavailable', 'transport_unavailable']);
  assert.deepEqual(h.dispatched, [{ type: 'avitolog:workspace-reset', detail: { reason: 'transport_unavailable' } }]);
  assert.equal(h.window.AvitoWorkspaceBridge.context(), originalScope);
  assert.equal(h.frames().length, 0);
  assert.equal(h.timers.size, 0, 'all readiness and operation promises must be settled');
  assert.equal(h.posts.length, 0, 'a timeout must not automatically retry a request');
  const retry = h.window.AvitoWorkspaceBridge.listAccounts(); await drain();
  const fresh = h.frames()[0]; assert.notEqual(fresh, old);
  await old.emit('load');
  assert.ok([...h.timers.values()].some(timer => timer.delay === 25000));
  await fresh.emit('load'); await drain();
  h.respond(h.posts.at(-1), { ok: true, accounts: [] });
  assert.deepEqual(clone(await retry), []);
  assert.equal(h.timers.size, 0);
});

test('explicit authentication and organization denials stay hard and settle every pending operation', async () => {
  for (const code of ['auth_required', 'subject_mismatch', 'organization_forbidden']) {
    const h = parentHarness(), originalScope = h.window.AvitoWorkspaceBridge.context();
    const first = h.window.AvitoWorkspaceBridge.getChats('personal:' + ACCOUNT).then(() => 'resolved', error => error.message);
    const second = h.window.AvitoWorkspaceBridge.getMessages('personal:' + ACCOUNT, 'chat1').then(() => 'resolved', error => error.message);
    await drain(); await h.frames()[0].emit('load'); await drain();
    assert.equal(h.posts.length, 2);
    h.respond(h.posts[0], { ok: false, code });
    assert.deepEqual(await Promise.all([first, second]), [code, 'context_changed']);
    assert.deepEqual(h.dispatched, [{ type: 'avitolog:workspace-reset', detail: { reason: 'context_changed' } }]);
    assert.equal(h.window.AvitoWorkspaceBridge.context(), originalScope, 'an unchanged owner does not soften an explicit denial');
    assert.equal(h.frames().length, 0);
    assert.equal(h.timers.size, 0);
    h.respond(h.posts[1], { ok: true, result: { messages: [{ text: 'late-private-result' }] } });
    assert.equal(h.dispatched.length, 1);
  }
});

test('readiness timeout after an unpolled profile change remains a hard context reset', async () => {
  const h = parentHarness();
  const pending = h.window.AvitoWorkspaceBridge.listAccounts().then(() => 'resolved', error => error.message);
  await drain();
  h.window.AVITOLOG_KEY_SUFFIX = '_sasha';
  h.expire(25000);
  assert.equal(await pending, 'context_changed');
  assert.deepEqual(h.dispatched, [{ type: 'avitolog:workspace-reset', detail: { reason: 'context_changed' } }]);
  assert.equal(h.frames().length, 0);
  assert.equal(h.timers.size, 0);
});

test('workspace reads allow a slow provider response without retries or an extended send deadline', async () => {
  const h = parentHarness();
  const task = h.window.AvitoWorkspaceBridge.getChats('personal:' + ACCOUNT); await drain();
  await h.frames()[0].emit('load'); await drain();
  h.expire(45000);
  assert.equal(h.posts.length, 1);
  assert.ok([...h.timers.values()].some(timer => timer.delay === 90000));
  h.respond(h.posts[0], { ok: true, result: { chats: [] } });
  assert.deepEqual(clone(await task), { chats: [] });
  const timeout = h.window.AvitoWorkspaceBridge.getMessages('personal:' + ACCOUNT, 'chat1').then(() => 'resolved', error => error.message); await drain();
  h.expire(90000);
  assert.equal(await timeout, 'timeout');
  assert.equal(h.posts.length, 2);
});

test('workspace parent rejects operation after profile switch and never automatically retries an uncertain send', async () => {
  const h = parentHarness();
  const request = h.window.AvitoWorkspaceBridge.sendMessage('personal:' + ACCOUNT, 'chat1', 'Hello').then(() => 'resolved', error => error.message); await drain();
  await h.frames()[0].emit('load'); await drain();
  assert.equal(h.posts[0].value.action, 'send');
  h.expire(45000);
  assert.equal(await request, 'send_unknown');
  assert.equal(h.posts.length, 1);
  const next = h.window.AvitoWorkspaceBridge.getChats('personal:' + ACCOUNT).then(() => 'resolved', error => error.message); await drain();
  const post = h.posts.at(-1);
  h.window.AVITOLOG_KEY_SUFFIX = '_sasha';
  h.respond(post, { ok: true, result: { chats: [{ id: 'other-mode-sensitive' }] } });
  assert.equal(await next, 'context_changed');
  assert.equal(h.frames().length, 0);
});

function chatHarness(options = {}) {
  const body = new Node('body'), head = new Node('head'), events = {}, intervals = [], intervalDelays = [], writes = [], store = new Map(options.localEntries || []);
  let scope = options.initialScope === undefined ? USER + '|fil|' + ORG : options.initialScope, clock = Date.parse('2026-10-20T12:00:00Z'), clients = [];
  const account = { id: 'personal:' + ACCOUNT, source: 'personal', account_id: ACCOUNT, avito_user_id: '123', display_name: 'Fil Ai Маркетинг' };
  const row = { id: 'chat1', updated: 123, unread: true, counterparty: { id: '456', name: '<img src=x onerror=alert(1)>', profile_url: 'https://avito.ru/user/hash/profile' }, last_message: { text: '<script>example</script>' } };
  const calls = { chats: [], messages: [], sends: [], reads: [], saves: [] };
  const bridge = {
    context() { return scope; }, async listAccounts() { return [account]; },
    async getChats(id) { calls.chats.push(id); return { chats: [row] }; },
    async getMessages(...args) { calls.messages.push(args); if (options.messages) return options.messages(...args); return { messages: [{ id: 'm1', text: '<b>plain text</b>', type: 'text', direction: 'in', created: 123, link_url: 'javascript:alert(1)' }], pagination: { has_more: false } }; },
    async sendMessage(...args) { calls.sends.push(args); if (options.send) return options.send(...args); return { ok: true, message: { id: 'sent1', text: args[2], type: 'text', direction: 'out', created: 124 } }; },
    async markRead(...args) { calls.reads.push(args); return { ok: true }; }
  };
  const document = {
    body, head, readyState: 'complete', visibilityState: 'visible', createElement(tag) { return new Node(tag); },
    getElementById(id) { return [body, head].flatMap(n => n.all(child => child.id === id))[0] || null; },
    addEventListener(type, fn) { (events[type] ||= []).push(fn); }, dispatchEvent(event) { (events[event.type] || []).forEach(fn => fn(event)); }
  };
  const localStorage = { getItem(key) { return store.get(key) || null; }, setItem(key, value) { if (options.fullLS) throw new Error('QuotaExceededError'); writes.push({ key, value }); store.set(key, String(value)); } };
  const windowEvents = {};
  const window = { innerWidth: 1440, innerHeight: 900, addEventListener(type, fn) { (windowEvents[type] ||= new Set()).add(fn); }, removeEventListener(type, fn) { windowEvents[type]?.delete(fn); }, AvitoWorkspaceBridge: bridge, AVITOLOG_KEY(base) { return base + (scope.includes('|sasha|') ? '_sasha' : ''); }, getCrmClients() { return clients; }, saveCrmClients(value) { calls.saves.push(clone(value)); clients = value; }, setActiveClient() {} };
  if (options.preferenceStore) window.AvitoChatStore = options.preferenceStore;
  class Today extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = { window, document, localStorage, crypto: webcrypto, URL, Intl, Date: Today, CRM_CATEGORY_OPTIONS: [{ v: 'category1', n: 'Services' }], CRM_DEFAULT_CATEGORY_ID: 'category1', CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, setInterval(fn, delay) { intervals.push(fn); intervalDelays.push(delay); return intervals.length; } };
  vm.runInNewContext(source('avito-chat-replies.js'), context);
  vm.runInNewContext(source('avito-chat.js'), context);
  const find = predicate => body.all(predicate)[0];
  return { window, document, body, bridge, calls, writes, row, find, clients: () => clients, intervals, intervalDelays, store,
    setScope(value) { scope = value; }, advance(ms) { clock += ms; },
    async emitWindow(type, fields = {}) { const event = { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {}, ...fields }; await Promise.all([...(windowEvents[type] || [])].map(fn => fn(event))); },
    async openChat() { window.AvitoChat.open(false); await drain(); await find(node => node.className === 'avchat-row').emit('click'); await drain(); }
  };
}

test('chat stays idle while closed; opening and polling never sends a message and content renders only as text', async () => {
  const h = chatHarness();
  assert.equal(h.calls.chats.length, 0); assert.equal(h.calls.sends.length, 0);
  await h.openChat();
  assert.equal(h.calls.chats.length, 1); assert.equal(h.calls.messages.length, 1);
  assert.equal(h.calls.sends.length, 0);
  assert.ok(h.body.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.ok(h.body.textContent.includes('<b>plain text</b>'));
  assert.equal(h.body.all(node => node.tagName === 'IMG' || node.tagName === 'SCRIPT').length, 0);
  assert.ok(h.body.all(node => node.tagName === 'A').every(node => node.href.startsWith('https://avito.ru/')));
  h.intervals.forEach(fn => fn()); await drain();
  assert.equal(h.calls.sends.length, 0);
});

test('chat marks read only after visible selected history loads successfully', async () => {
  const h = chatHarness({ messages: async () => { throw new Error('messages_unavailable'); } });
  await h.openChat();
  assert.equal(h.calls.reads.length, 0, 'a failed history read must not clear unread status on Avito');
  assert.equal(h.row.unread, true);
});

test('chat renders the first account immediately while another read is pending and keeps it after a failed refresh', async () => {
  const h = chatHarness(); let slow;
  const catalog = await h.bridge.listAccounts(), first = catalog[0];
  const second = { ...first, id: 'personal:second', display_name: 'Фил PROдвижение' };
  h.bridge.listAccounts = async () => [first, second];
  h.bridge.getChats = async id => id === first.id ? { chats: [h.row] } : new Promise(resolve => { slow = resolve; });
  h.window.AvitoChat.open(false); await drain();
  assert.equal(h.body.all(node => node.className === 'avchat-row').length, 1);
  slow({ chats: [] }); await drain();
  h.bridge.getChats = async () => { throw new Error('provider_unavailable'); };
  h.advance(60000); h.intervals.forEach(fn => fn()); await drain();
  assert.equal(h.body.all(node => node.className === 'avchat-row').length, 1);
  assert.equal(h.calls.sends.length, 0);
});

test('history refresh preserves a message explicitly sent while the read was in flight', async () => {
  const h = chatHarness(); await h.openChat(); let finishRead;
  h.bridge.getMessages = async () => new Promise(resolve => { finishRead = resolve; });
  h.advance(16000); h.intervals.forEach(fn => fn()); await drain();
  const text = h.find(node => node.tagName === 'TEXTAREA'); text.value = 'Keep my new message';
  await h.find(node => node.className === 'avchat-compose').emit('submit');
  finishRead({ messages: [{ id: 'old', text: 'Older history', created: 1 }], pagination: { has_more: false } });
  await drain();
  const history = h.find(node => node.className === 'avchat-history');
  assert.ok(history.textContent.includes('Keep my new message'));
  assert.ok(history.textContent.includes('Older history'));
});

test('chat import is explicit, deduplicated, profile scoped and cannot write after a mode switch', async () => {
  const h = chatHarness(); await h.openChat();
  assert.equal(h.calls.saves.length, 0);
  await h.find(node => node.textContent === '+ В CRM').emit('click');
  const form = h.find(node => node.className === 'avchat-import');
  const name = h.find(node => node.attributes['aria-label'] === 'Название клиента');
  const category = h.find(node => node.attributes['aria-label'] === 'Категория CRM');
  const week = h.find(node => node.attributes['aria-label'] === 'Неделя CRM');
  name.value = 'Prospect'; category.value = 'category1'; week.value = '0';
  await form.emit('submit');
  assert.equal(h.clients().length, 1);
  assert.equal(h.clients()[0].avito_chat_key, '123:chat1');
  assert.equal(h.clients()[0].avito_account, 'https://avito.ru/user/hash/profile');
  await form.emit('submit'); assert.equal(h.clients().length, 1);
  const before = h.calls.saves.length;
  h.setScope(USER + '|sasha|' + OTHER);
  await form.emit('submit');
  assert.equal(h.calls.saves.length, before);
  assert.ok(h.writes.every(write => !write.key.includes('_sasha')));
});

test('chat sends only on explicit submit and suppresses double submits while pending', async () => {
  let complete;
  const h = chatHarness({ send: () => new Promise(resolve => { complete = resolve; }) }); await h.openChat();
  const text = h.find(node => node.tagName === 'TEXTAREA'), compose = h.find(node => node.className === 'avchat-compose');
  text.value = 'My explicit reply';
  const first = compose.emit('submit'); await drain();
  assert.equal(h.calls.sends.length, 1);
  await compose.emit('submit'); assert.equal(h.calls.sends.length, 1);
  complete({ ok: true, message: { id: 'sent1', type: 'text', text: 'My explicit reply', direction: 'out', created: 124 } });
  await first;
  assert.equal(text.value, '');
});

test('chat header omits the conversation count and each conversation has a safe emoji avatar', async () => {
  const h = chatHarness();
  h.row.counterparty.name = 'Мебель 🪑';
  h.bridge.getChats = async () => ({ chats: Array.from({ length: 100 }, (_, i) => ({ ...h.row, id: 'chat' + i })) });
  h.window.AvitoChat.open(false); await drain();
  const header = h.find(node => node.className === 'avchat-head');
  assert.equal(header.textContent.includes('100'), false);
  assert.deepEqual(header.children.map(node => node.tagName), ['STRONG', 'BUTTON', 'BUTTON']);
  assert.equal(h.body.all(node => node.tagName === 'BUTTON' && node.className === 'avchat-move').length, 0);
  assert.equal(header.tabIndex, 0);
  const avatars = h.body.all(node => node.className === 'avchat-avatar');
  assert.equal(avatars.length, 100);
  assert.ok(avatars.every(node => node.textContent === '🪑' && node.attributes['aria-hidden'] === 'true'));
  assert.equal(h.body.all(node => node.tagName === 'IMG' || node.tagName === 'SCRIPT').length, 0);
});

test('CRM action sits beside the client name and import actions share one colored icon row', async () => {
  const h = chatHarness(); await h.openChat();
  const crm = h.find(node => node.className === 'avchat-crm');
  assert.equal(crm.parentNode.className, 'avchat-title-line');
  assert.ok(crm.parentNode.children.some(node => node.className === 'avchat-title-copy' && node.textContent.includes(h.row.counterparty.name)));
  assert.equal(crm.parentNode.parentNode.className, 'avchat-chat-title');
  await crm.emit('click');
  const actions = h.find(node => node.className === 'avchat-import-actions');
  assert.deepEqual(actions.children.map(node => node.className), ['avchat-import-add', 'avchat-import-link', 'avchat-import-cancel']);
  assert.deepEqual(actions.children.map(node => node.textContent), ['➕ Добавить', '🔗 Привязать', '✕ Отмена']);
  assert.equal(actions.children[0].disabled, false); assert.equal(actions.children[1].disabled, true);
  const css = h.document.head.textContent;
  for (const selector of ['.avchat-import-actions{display:flex', '.avchat-import-add{background:', '.avchat-import-link{background:', '.avchat-import-cancel{background:']) assert.ok(css.includes(selector));
  await actions.children[2].emit('click');
  assert.equal(h.find(node => node.className === 'avchat-import').hidden, true);
  assert.equal(h.calls.saves.length, 0);
});

test('experimental niche is opt-in, ignores the receiving account listing and remains profile scoped', async () => {
  const h = chatHarness();
  h.row.counterparty.name = 'Иван'; h.row.item = { title: 'Ремонт квартир и строительство домов' };
  await h.openChat();
  assert.equal(h.find(node => node.className === 'avchat-niche'), undefined);
  const setting = h.find(node => node.tagName === 'INPUT' && node.type === 'checkbox' && node.parentNode.textContent.includes('Подсказка ниши'));
  assert.equal(setting.checked, false);
  setting.checked = true; await setting.emit('change');
  let niche = h.find(node => node.className === 'avchat-niche');
  assert.equal(niche.textContent, 'Ниша: не определена', 'our own item title cannot identify the client business');
  assert.ok(niche.title.includes('API не предоставляет'));
  await niche.emit('click');
  const input = h.find(node => node.attributes['aria-label'] === 'Ниша клиента'); input.value = 'Заборы, ворота';
  const staleForm = h.find(node => node.className === 'avchat-niche-editor');
  await staleForm.emit('submit');
  assert.equal(h.find(node => node.className === 'avchat-niche').textContent, 'Ниша: Заборы, ворота');
  assert.ok(h.writes.some(write => write.key === 'avitolog_chat_preferences_v1:' + USER + '|fil|' + ORG));
  const before = h.writes.length;
  h.setScope(USER + '|sasha|' + OTHER); input.value = 'Нельзя сохранить в другой режим';
  await staleForm.emit('submit');
  assert.equal(h.writes.length, before);
  h.intervals.forEach(fn => fn()); await drain();
  h.window.AvitoChat.open(false); await drain();
  await h.find(node => node.className === 'avchat-row').emit('click'); await drain();
  assert.equal(setting.checked, false); assert.equal(h.find(node => node.className === 'avchat-niche'), undefined);
});

test('launcher restores the last open mode with its moved position, size and splitter width', async () => {
  const h = chatHarness(); await h.openChat();
  const panel = h.find(node => node.id === 'avitoChatPanel'), launch = h.find(node => node.id === 'avitoChatLauncher');
  const width = h.find(node => node.className === 'avchat-resize avchat-resize-left');
  const height = h.find(node => node.className === 'avchat-resize avchat-resize-top');
  const split = h.find(node => node.className === 'avchat-resize avchat-resize-split');
  const move = h.find(node => node.className === 'avchat-head');
  const collapse = h.find(node => node.title === 'Свернуть чат');
  await width.emit('keydown', { key: 'ArrowLeft' }); await height.emit('keydown', { key: 'ArrowDown' });
  await split.emit('keydown', { key: 'ArrowRight' }); await move.emit('keydown', { key: 'ArrowLeft' }); await move.emit('keydown', { key: 'ArrowUp' });
  const mini = clone(panel.style), miniSplit = h.find(node => node.className === 'avchat-conversations').style.width;
  await collapse.emit('click'); assert.equal(panel.hidden, true); assert.equal(launch.hidden, false);
  await launch.emit('click'); await drain();
  assert.equal(panel.dataset.mode, 'mini'); assert.deepEqual(panel.style, mini);
  assert.equal(h.find(node => node.className === 'avchat-conversations').style.width, miniSplit);
  await collapse.emit('click'); await launch.emit('click', { shiftKey: true }); await drain();
  assert.equal(panel.dataset.mode, 'web');
  await width.emit('keydown', { key: 'ArrowRight', shiftKey: true }); await move.emit('keydown', { key: 'ArrowLeft' });
  const web = clone(panel.style);
  await collapse.emit('click'); await launch.emit('click'); await drain();
  assert.equal(panel.dataset.mode, 'web'); assert.deepEqual(panel.style, web);
  await collapse.emit('click'); h.window.AvitoChat.open(); await drain();
  assert.equal(panel.dataset.mode, 'web'); assert.deepEqual(panel.style, web);
});

test('chat can move by its heading or any of four narrow outer edges without a separate move button', async () => {
  const h = chatHarness(); await h.openChat();
  const panel = h.find(node => node.id === 'avitoChatPanel'), header = h.find(node => node.className === 'avchat-head');
  const originalSize = [panel.style.width, panel.style.height];
  const drag = async (handle, target = handle) => {
    const before = parseFloat(panel.style.right);
    await handle.emit('pointerdown', { target, pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100 });
    assert.equal(panel.dataset.resizing, 'moving');
    await h.emitWindow('pointermove', { clientX: 80, clientY: 80 }); await h.emitWindow('pointerup');
    assert.equal(parseFloat(panel.style.right), before + 20);
    assert.deepEqual([panel.style.width, panel.style.height], originalSize);
  };
  await drag(header, header.children[0]);
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const edge = h.find(node => node.className === 'avchat-drag-edge avchat-drag-' + side);
    assert.equal(edge.tagName, 'DIV'); assert.equal(edge.tabIndex, -1); assert.equal(edge.attributes['aria-hidden'], 'true');
    await drag(edge);
  }
  assert.equal(h.body.all(node => node.tagName === 'BUTTON' && node.attributes['aria-label'] === 'Переместить окно чата').length, 0);
  const before = panel.style.right;
  for (const tag of ['button', 'input', 'a']) {
    const control = new Node(tag), child = new Node('span'); control.append(child); header.append(control);
    await header.emit('pointerdown', { target: child, pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100 });
    await header.emit('keydown', { target: child, key: 'ArrowLeft' });
    assert.equal(panel.dataset.resizing, undefined); assert.equal(panel.style.right, before);
    control.remove();
  }
  await header.emit('keydown', { key: 'ArrowLeft' }); assert.equal(parseFloat(panel.style.right), parseFloat(before) + 20);
  const css = h.document.head.textContent;
  assert.ok(css.includes('.avchat-resize-left{left:4px}'));
  assert.ok(css.includes('.avchat-resize-top{top:4px}'));
  assert.ok(css.includes('.avchat-resize-corner{z-index:6}'));
});

test('quick replies toggle and edit without sending, then an explicit template sends once without clearing the draft', async () => {
  const h = chatHarness(); await h.openChat();
  const quick = h.find(node => node.textContent === '⚡' && node.tagName === 'BUTTON');
  assert.equal(quick.disabled, false);
  const compose = h.find(node => node.className === 'avchat-compose'), draft = compose.children.find(node => node.tagName === 'TEXTAREA');
  draft.value = 'Keep my draft';
  await quick.emit('click');
  const replies = h.find(node => node.className === 'avchat-replies'); assert.equal(replies.hidden, false);
  assert.equal(h.calls.sends.length, 0);
  await h.find(node => node.attributes['aria-label'] === 'Изменить быстрые ответы').emit('click');
  const text = h.find(node => node.attributes['aria-label'] === 'Текст ответа 1'); text.value = 'Здравствуйте, {имя}! Аккаунт: {аккаунт}'; await text.emit('input');
  await h.find(node => node.attributes['aria-label'] === 'Сохранить быстрые ответы').emit('click');
  assert.equal(h.calls.sends.length, 0);
  assert.ok(h.writes.some(write => write.key.startsWith('avitolog_chat_replies_v1:')));
  const answer = h.find(node => node.attributes['aria-label'] === 'Отправить быстрый ответ: Приветствие');
  await answer.emit('click'); await drain();
  assert.equal(h.calls.sends.length, 1);
  assert.equal(h.calls.sends[0][2], 'Здравствуйте, ' + h.row.counterparty.name + '! Аккаунт: Fil Ai Маркетинг');
  assert.equal(draft.value, 'Keep my draft');
  assert.ok(replies.textContent.includes('Ответ отправлен.'));
  await quick.emit('click'); await quick.emit('click');
  assert.equal(h.calls.sends.length, 1);
});

test('expanded quick reply over the provider limit never sends or displays success', async () => {
  const h = chatHarness(); await h.openChat();
  await h.find(node => node.textContent === '⚡' && node.tagName === 'BUTTON').emit('click');
  await h.find(node => node.attributes['aria-label'] === 'Изменить быстрые ответы').emit('click');
  const text = h.find(node => node.attributes['aria-label'] === 'Текст ответа 1'); text.value = 'x'.repeat(995) + '{имя}'; await text.emit('input');
  await h.find(node => node.attributes['aria-label'] === 'Сохранить быстрые ответы').emit('click');
  await h.find(node => node.attributes['aria-label'] === 'Отправить быстрый ответ: Приветствие').emit('click'); await drain();
  assert.equal(h.calls.sends.length, 0);
  const replies = h.find(node => node.className === 'avchat-replies');
  assert.equal(replies.textContent.includes('Ответ отправлен.'), false);
  assert.ok(replies.textContent.includes('Проверьте текст'));
});

function durablePreferences(options = {}) {
  const records = new Map(options.entries || []), pending = [];
  let finishReady;
  const initialized = options.holdReady ? new Promise(resolve => { finishReady = resolve; }) : Promise.resolve();
  const api = {
    ready: () => initialized,
    getItem: key => records.get(key) ?? null,
    setItem(key, raw) {
      if (!options.holdPrefix || !key.startsWith(options.holdPrefix)) { records.set(key, raw); return Promise.resolve(); }
      return new Promise((resolve, reject) => pending.push({ key, raw, resolve() { records.set(key, raw); resolve(); }, reject }));
    },
    stats: () => ({ backend: 'indexeddb', localBytes: 5241000, localEntries: 5, categories: { crm: 10, projects: 20, finance: 30, imageCache: 0, other: 5240940 } })
  };
  return { api, records, pending, finishReady: () => finishReady() };
}
const chatScope = USER + '|fil|' + ORG;
const nicheCheckbox = h => h.find(node => node.tagName === 'INPUT' && node.type === 'checkbox' && node.parentNode.textContent.includes('Подсказка ниши'));
const accountCheckbox = h => h.find(node => node.tagName === 'INPUT' && node.type === 'checkbox' && node.parentNode.textContent.includes('Fil Ai Маркетинг'));

test('open requested before durable storage readiness mounts and opens the requested mode after hydration', async () => {
  const storage = durablePreferences({ holdReady: true }), h = chatHarness({ preferenceStore: storage.api, fullLS: true });
  h.window.AvitoChat.open(true); await drain();
  assert.equal(h.find(node => node.id === 'avitoChatPanel'), undefined); assert.equal(h.calls.chats.length, 0);
  storage.finishReady(); await drain();
  assert.equal(h.find(node => node.id === 'avitoChatPanel').dataset.mode, 'web'); assert.equal(h.calls.chats.length, 1);
  assert.deepEqual(h.writes, []); assert.equal(h.calls.sends.length, 0);
});

test('preferences wait for durable commit with full localStorage and reappear after a fresh chat reload', async () => {
  const storage = durablePreferences({ holdPrefix: 'avitolog_chat_preferences_v1:' }), h = chatHarness({ preferenceStore: storage.api, fullLS: true });
  await h.openChat(); const setting = nicheCheckbox(h); setting.checked = true;
  const saving = setting.emit('change'); await drain();
  assert.equal(setting.disabled, true); assert.equal(storage.records.has('avitolog_chat_preferences_v1:' + chatScope), false);
  assert.equal(h.find(node => node.className === 'avchat-status').textContent, 'Сохраняем настройки…');
  assert.equal(h.find(node => node.className === 'avchat-niche'), undefined);
  storage.pending.shift().resolve(); await saving;
  assert.equal(setting.disabled, false); assert.ok(h.find(node => node.className === 'avchat-niche'));
  assert.equal(h.find(node => node.className === 'avchat-status').textContent, 'Настройки сохранены.');
  const reloadedStorage = durablePreferences({ entries: [...storage.records] }), reloaded = chatHarness({ preferenceStore: reloadedStorage.api, fullLS: true });
  await reloaded.openChat(); assert.equal(nicheCheckbox(reloaded).checked, true); assert.ok(reloaded.find(node => node.className === 'avchat-niche'));
  assert.deepEqual(h.writes, []); assert.deepEqual(reloaded.writes, []);
});

test('aborted preference commit shows failure, reverts the checkbox and never claims durable success', async () => {
  const storage = durablePreferences({ holdPrefix: 'avitolog_chat_preferences_v1:' }), h = chatHarness({ preferenceStore: storage.api, fullLS: true });
  await h.openChat(); const setting = nicheCheckbox(h); setting.checked = true;
  const saving = setting.emit('change'); await drain(); storage.pending.shift().reject(new Error('aborted')); await saving;
  assert.equal(setting.checked, false); assert.equal(setting.disabled, false);
  const status = h.find(node => node.className === 'avchat-status'); assert.equal(status.dataset.error, 'true');
  assert.match(status.textContent, /не подтвердил сохранение/); assert.equal(h.find(node => node.className === 'avchat-niche'), undefined);
  assert.equal(storage.records.has('avitolog_chat_preferences_v1:' + chatScope), false); assert.deepEqual(h.writes, []);
});

test('forced catalog refresh cannot reset an account choice while its durable commit is pending', async () => {
  const selectionKey = 'avitolog_chat_accounts_v1:' + chatScope;
  const storage = durablePreferences({ entries: [[selectionKey, JSON.stringify(['personal:' + ACCOUNT])]], holdPrefix: 'avitolog_chat_accounts_v1:' });
  const h = chatHarness({ preferenceStore: storage.api, fullLS: true }); await h.openChat();
  const setting = accountCheckbox(h); setting.checked = false; const saving = setting.emit('change'); await drain();
  assert.equal(h.body.all(node => node.className === 'avchat-row').length, 0);
  await h.find(node => node.tagName === 'BUTTON' && node.textContent === 'Обновить').emit('click'); await drain();
  assert.equal(accountCheckbox(h).checked, false);
  assert.equal(h.body.all(node => node.className === 'avchat-row').length, 0);
  storage.pending.shift().resolve(); await saving; await drain();
  assert.equal(accountCheckbox(h).checked, false); assert.equal(h.body.all(node => node.className === 'avchat-row').length, 0);
  assert.equal(storage.records.get(selectionKey), '[]'); assert.deepEqual(h.writes, []);
});

test('forced refresh cannot visually revert a pending niche preference to the old committed value', async () => {
  const storage = durablePreferences({ holdPrefix: 'avitolog_chat_preferences_v1:' }), h = chatHarness({ preferenceStore: storage.api });
  await h.openChat(); const setting = nicheCheckbox(h); setting.checked = true;
  const saving = setting.emit('change'); await drain();
  await h.find(node => node.tagName === 'BUTTON' && node.textContent === 'Обновить').emit('click'); await drain();
  assert.equal(nicheCheckbox(h).checked, true); assert.equal(nicheCheckbox(h).disabled, true);
  storage.pending.shift().resolve(); await saving;
  assert.equal(nicheCheckbox(h).checked, true); assert.ok(h.find(node => node.className === 'avchat-niche'));
});

test('pending preference completion stays scoped after switching to Sasha', async () => {
  const storage = durablePreferences({ holdPrefix: 'avitolog_chat_preferences_v1:' }), h = chatHarness({ preferenceStore: storage.api });
  await h.openChat(); const setting = nicheCheckbox(h); setting.checked = true;
  const saving = setting.emit('change'); await drain();
  h.setScope(USER + '|sasha|' + OTHER); h.intervals.forEach(fn => fn()); await drain();
  h.window.AvitoChat.open(false); await drain(); await h.find(node => node.className === 'avchat-row').emit('click'); await drain();
  const before = h.find(node => node.className === 'avchat-status').textContent;
  storage.pending.shift().resolve(); await saving;
  assert.equal(nicheCheckbox(h).checked, false); assert.equal(h.find(node => node.className === 'avchat-niche'), undefined);
  assert.equal(h.find(node => node.className === 'avchat-status').textContent, before);
  assert.equal(storage.records.has('avitolog_chat_preferences_v1:' + USER + '|sasha|' + OTHER), false);
});

test('an early open hydrates scoped settings and window geometry automatically once backend identity becomes ready', async () => {
  const layout = { lastMode: 'mini', mini: { width: 600, height: 500, right: 200, bottom: 100, split: 220 } };
  const storage = durablePreferences({ entries: [['avitolog_chat_preferences_v1:' + chatScope, '{"niche":true,"niches":{}}'], ['avitolog_chat_layout_v1:' + chatScope, JSON.stringify(layout)]] });
  const h = chatHarness({ initialScope: '', preferenceStore: storage.api, fullLS: true });
  h.window.AvitoChat.open(false); await drain();
  const panel = h.find(node => node.id === 'avitoChatPanel');
  assert.equal(nicheCheckbox(h).disabled, true); assert.equal(h.calls.chats.length, 0); assert.equal(storage.records.size, 2);
  const scopedLayout = storage.records.get('avitolog_chat_layout_v1:' + chatScope);
  assert.deepEqual(h.writes, []); assert.equal(storage.records.has('avitolog_chat_layout_v1:local'), false);
  h.setScope(chatScope);
  const readiness = h.intervals.filter((_, index) => h.intervalDelays[index] === 1000); assert.equal(readiness.length, 1);
  readiness.forEach(fn => fn()); await drain();
  assert.equal(nicheCheckbox(h).disabled, false); assert.equal(nicheCheckbox(h).checked, true); assert.equal(h.calls.chats.length, 1);
  assert.equal(panel.style.width, '600px'); assert.equal(panel.style.height, '500px'); assert.equal(panel.style.right, '200px'); assert.equal(panel.style.bottom, '100px');
  assert.equal(storage.records.get('avitolog_chat_layout_v1:' + chatScope), scopedLayout, 'hydration must not replace durable geometry with the temporary unauthenticated layout');
  assert.deepEqual(h.writes, []);
  for (let i = 0; i < 5; i++) readiness.forEach(fn => fn()); await drain();
  assert.equal(h.calls.chats.length, 1, 'metadata-only readiness polling must not fetch every second');
});

test('one-second readiness polling cannot unlock niche controls during a pending durable write', async () => {
  const storage = durablePreferences({ holdPrefix: 'avitolog_chat_preferences_v1:' }), h = chatHarness({ preferenceStore: storage.api });
  await h.openChat(); const setting = nicheCheckbox(h); setting.checked = true;
  const saving = setting.emit('change'); await drain();
  h.intervals.filter((_, index) => h.intervalDelays[index] === 1000).forEach(fn => fn()); await drain();
  assert.equal(setting.disabled, true); assert.equal(setting.checked, true);
  storage.pending.shift().resolve(); await saving;
  assert.equal(setting.disabled, false); assert.equal(setting.checked, true);
});

test('scope readiness while closed never auto-opens the panel or requests account data', async () => {
  const storage = durablePreferences(), h = chatHarness({ initialScope: '', preferenceStore: storage.api }); await drain();
  h.setScope(chatScope); h.intervals.filter((_, index) => h.intervalDelays[index] === 1000).forEach(fn => fn()); await drain();
  assert.equal(h.find(node => node.id === 'avitoChatPanel').hidden, true); assert.equal(h.calls.chats.length, 0); assert.equal(storage.records.size, 0);
});

test('a generic early launcher restores saved wide mode once scoped identity is ready without persisting temporary geometry', async () => {
  const saved = JSON.stringify({ lastMode: 'web', web: { width: 1000, height: 650, right: 100, bottom: 70, split: 300 } });
  const layoutKey = 'avitolog_chat_layout_v1:' + chatScope;
  const storage = durablePreferences({ entries: [[layoutKey, saved]] }), h = chatHarness({ initialScope: '', preferenceStore: storage.api, fullLS: true });
  await drain(); await h.find(node => node.id === 'avitoChatLauncher').emit('click'); await drain();
  assert.equal(h.find(node => node.id === 'avitoChatPanel').dataset.mode, 'mini');
  assert.equal(storage.records.size, 1); assert.deepEqual(h.writes, []);
  h.setScope(chatScope); h.intervals.filter((_, index) => h.intervalDelays[index] === 1000).forEach(fn => fn()); await drain();
  const panel = h.find(node => node.id === 'avitoChatPanel');
  assert.equal(panel.dataset.mode, 'web'); assert.equal(panel.style.width, '1000px'); assert.equal(panel.style.height, '650px');
  assert.equal(panel.style.right, '100px'); assert.equal(panel.style.bottom, '70px');
  assert.equal(storage.records.get(layoutKey), saved); assert.equal(storage.records.size, 1); assert.deepEqual(h.writes, []);
});

