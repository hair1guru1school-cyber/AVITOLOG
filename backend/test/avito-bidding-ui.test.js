'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.resolve(__dirname, '../../js/avito-bidding.js'), 'utf8');
const holder = { exports: {} };
vm.runInThisContext('(function(module){' + code + '\n})')(holder);
const ui = holder.exports;
const copy = value => JSON.parse(JSON.stringify(value));
const detail = () => ({
  item_id: '123', action_type_id: 5, mode: 'manual',
  current: { mode: 'manual', action_type_id: 5, bid_penny: 1500, limit_penny: 100000 },
  manual: { min_bid_penny: 1000, max_bid_penny: 10000, recommended_bid_penny: 2300, min_limit_penny: 10000, max_limit_penny: 500000, ladder: [] },
  auto: { min_budget_penny: 10000, max_budget_penny: 1000000, daily: { min_limit_penny: 10000, max_limit_penny: 100000, recommended_budget_penny: 30000, ladder: [] }, weekly: { min_limit_penny: 70000, max_limit_penny: 700000, ladder: [] } }
});

test('money accepts common Russian decimal/grouping formats without floating-point kopeck loss', () => {
  for (const text of ['1 560,01', '1\u00a0560.01', '1\u202f560,01', '1560.01']) assert.equal(ui.moneyInput(text), 156001);
  assert.equal(ui.moneyInput('0,01'), 1);
  for (const bad of ['', '1e4', '-10', 'Infinity', '15,555', '+12', '1,2,3', '1 000 рублей', 'NaN']) assert.equal(ui.moneyInput(bad), null, bad);
});
test('manual validates strict lower bid boundary and finite daily limit', () => {
  const data = detail();
  assert.deepEqual(ui.validateForm({ mode: 'manual', bid: '10,01', limit: '100' }, data), { mode: 'manual', bid_penny: 1001, limit_penny: 10000 });
  for (const bid of ['10', '9', '100,01', '']) assert.throws(() => ui.validateForm({ mode: 'manual', bid, limit: '100' }, data));
  for (const limit of ['', '0', '99,99', '5000,01']) assert.throws(() => ui.validateForm({ mode: 'manual', bid: '15', limit }, data));
  data.manual.max_bid_penny = null;
  assert.throws(() => ui.validateForm({ mode: 'manual', bid: '15', limit: '100' }, data), /границы/);
});
test('auto period and range validation do not treat weekly budget as daily', () => {
  assert.deepEqual(ui.validateForm({ mode: 'auto', period: '7d', budget: '700' }, detail()), { mode: 'auto', budget_type: '7d', budget_penny: 70000 });
  assert.throws(() => ui.validateForm({ mode: 'auto', period: '7d', budget: '699,99' }, detail()));
  assert.throws(() => ui.validateForm({ mode: 'auto', period: '30d', budget: '2000' }, detail()), /недоступен/);
  assert.throws(() => ui.validateForm({ mode: 'auto', period: '1d', budget: '1000,01' }, detail()));
});
test('base-price reset has no invented zero rate or free-placement claim', () => {
  assert.deepEqual(ui.validateForm({ mode: 'base', bid: '999', budget: '900' }, detail()), { mode: 'base' });
  assert.match(code, /Это не бесплатное размещение/);
  assert.throws(() => ui.validateForm({ mode: 'base' }, null));
});
test('validation leaves source details intact', () => {
  const source = detail(), before = copy(source);
  ui.validateForm({ mode: 'manual', bid: '23', limit: '150' }, source);
  assert.deepEqual(source, before);
});
test('compare uses only an exact offered value; no interpolated competitor metric', () => {
  const ladder = [{ value_penny: 1000, compare: 25 }, { value_penny: 2000, compare: 70 }];
  assert.equal(ui.offerAt(ladder, 1500), null);
  assert.equal(ui.offerAt(ladder, 1000).compare, 25);
  assert.equal(ui.offerAt(null, 1000), null);
});
test('mixed or unknown billing targets cannot receive a common rate', () => {
  assert.equal(ui.sameActions([detail(), detail()]), true);
  assert.equal(ui.sameActions([detail(), { action_type_id: 7 }]), false);
  assert.equal(ui.sameActions([detail(), {}]), false);
  assert.equal(ui.sameActions([]), false);
  assert.match(ui.actionLabel(5), /пакет кликов/);
  assert.doesNotMatch(ui.actionLabel(5), /просмотр/);
  assert.match(ui.actionLabel(7), /чате/);
});
test('identity cache key isolates organization, account source, credential version and user', () => {
  const context = { key: 'a', organizationId: 'org1', account: { source: 'oauth', id: '1', avito_user_id: 12, credential_version: 1 } };
  for (const changed of [Object.assign({}, context, { organizationId: 'org2' }), Object.assign({}, context, { key: 'b' }), Object.assign({}, context, { account: Object.assign({}, context.account, { credential_version: 2 }) }), Object.assign({}, context, { account: Object.assign({}, context.account, { source: 'personal' }) }), Object.assign({}, context, { account: Object.assign({}, context.account, { avito_user_id: 99 }) })]) assert.notEqual(ui.scopeKey(context), ui.scopeKey(changed));
});
test('queue preserves order and waits before each financial request', async () => {
  const events = [];
  const runner = ui.createRunner({ isCurrent: () => true, wait: async (_, item) => events.push('wait:' + item), perform: async item => { events.push('write:' + item); return { status: 'applied' }; }, onResult: (item, result) => events.push(result.status + ':' + item) });
  const result = await runner.run([1, 2]);
  assert.equal(result.length, 2);
  assert.deepEqual(events, ['wait:1', 'write:1', 'applied:1', 'wait:2', 'write:2', 'applied:2']);
});
test('queue cancellation does not claim to cancel an already sent request', async () => {
  const sent = [], results = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const runner = ui.createRunner({ isCurrent: () => true, wait: async () => {}, perform: async item => { sent.push(item); await pending; return { status: 'applied' }; }, onResult: item => results.push(item) });
  const run = runner.run([1, 2, 3]);
  await new Promise(resolve => setImmediate(resolve));
  runner.cancel(); release(); await run;
  assert.deepEqual(sent, [1]); assert.deepEqual(results, [1]);
});
test('queue rechecks identity after waiting and never sends after account switch', async () => {
  const sent = []; let current = true;
  const runner = ui.createRunner({ isCurrent: () => current, wait: async () => { current = false; }, perform: async item => { sent.push(item); return { status: 'applied' }; }, onResult: () => assert.fail('stale result rendered') });
  await runner.run([1, 2]); assert.deepEqual(sent, []);
});
test('late financial response is not shown in another workspace', async () => {
  let current = true, sent = 0;
  const runner = ui.createRunner({ isCurrent: () => current, wait: async () => {}, perform: async () => { sent++; current = false; return { status: 'applied' }; }, onResult: () => assert.fail('stale result rendered') });
  const result = await runner.run([1, 2]); assert.equal(sent, 1); assert.equal(result.length, 1);
});
test('unknown or network-failed financial requests are never retried and stop the remaining queue', async () => {
  for (const throwing of [false, true]) {
    const sent = [], results = [];
    const runner = ui.createRunner({ isCurrent: () => true, wait: async () => {}, perform: async item => { sent.push(item); if (throwing) throw new Error('timeout'); return { status: 'unknown' }; }, onResult: (_, result) => results.push(result.status) });
    await runner.run([1, 2, 3]); assert.deepEqual(sent, [1]); assert.deepEqual(results, ['unknown']);
  }
});
test('definite rejections remain visible and do not prevent other explicitly approved items', async () => {
  const results = [];
  const runner = ui.createRunner({ isCurrent: () => true, wait: async () => {}, perform: async item => ({ status: item === 1 ? 'rejected' : 'applied' }), onResult: (_, result) => results.push(result.status) });
  await runner.run([1, 2]); assert.deepEqual(results, ['rejected', 'applied']);
});
test('simultaneous runs are rejected instead of duplicate writes', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const runner = ui.createRunner({ isCurrent: () => true, wait: async () => pending, perform: async () => ({ status: 'applied' }), onResult: () => {} });
  const run = runner.run([1]); await assert.rejects(runner.run([1]), /уже/); runner.cancel(); release(); await run;
});

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.events = {}; this.attributes = {}; this.open = false; this.value = ''; this.style = { setProperty: (name, value) => { this.style[name] = value; } }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { (this.events[name] ||= []).push(listener); }
  fire(name) { for (const listener of this.events[name] || []) listener({}); }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  remove() { this.removed = true; }
}
function browser(options = {}) {
  const body = new Element('body');
  const win = { document: { body, createElement: tag => new Element(tag) }, setTimeout: options.setTimeout || setTimeout, crypto: { randomUUID: () => 'new-group' }, Option: function(text, value) { const option = new Element('option'); option.textContent = text; option.value = value; return option; } };
  if (options.dashboard) { win.AvitoBiddingDashboard = options.dashboard; win.clearTimeout = options.clearTimeout || clearTimeout; }
  return { win, api: (options.ui || ui).install(win), host: new Element('div') };
}
function context(overrides = {}) { return Object.assign({ serverQueue: false, key: 'u1', organizationId: 'org1', account: { id: 'a1', source: 'oauth', credential_version: 1, display_name: 'Safe name' }, canManage: true, isCurrent: () => true, api: async () => ({ items: [], groups: [], revision: 1 }) }, overrides); }
const tick = () => new Promise(resolve => setImmediate(resolve));
test('mount automatically reads the summary list only; no detail, groups, quote or financial request', async () => {
  const b = browser(), requests = [];
  b.api.mount(b.host, context({ api: async (...args) => { requests.push(args); return {}; } }));
  await tick(); assert.equal(requests.length, 1);
  assert.match(requests[0][0], /\/connections\/a1\/bidding\/items\?limit=99&offset=0&organization_id=org1$/);
  assert.equal(requests[0][1], undefined);
  assert.equal(b.host.children.length, 1);
  assert.match(b.host.children[0].children[0].children[0].textContent, /Ставки/);
});
test('same-key remount retains loaded state and cached rows', () => {
  const b = browser(), ctx = context(), state = b.api.mount(b.host, ctx);
  state.items.push({ item_id: 123, title: 'Keep me' }); state.loaded = true;
  const remount = b.api.mount(new Element('div'), context());
  assert.equal(remount, state); assert.equal(remount.items[0].title, 'Keep me');
});
test('clear removes all in-memory snapshots and quotes at logout', () => {
  const b = browser(), state = b.api.mount(b.host, context());
  state.items.push({ item_id: 123 }); state.quotes.push({ quote: 'DO_NOT_PERSIST' });
  b.api.clear(); assert.equal(state.disposed, true); assert.equal(state.quotes.length, 0);
  const next = b.api.mount(b.host, context()); assert.equal(next.items.length, 0);
});
test('stale open-button callback cannot issue requests after switching organization', async () => {
  const b = browser(), requests = [];
  const old = b.api.mount(b.host, context({ api: async (...args) => requests.push(args) }));
  const button = b.host.children[0].children[1];
  b.api.mount(b.host, context({ organizationId: 'org2' }));
  const before = requests.length;
  button.fire('click'); await tick(); assert.equal(old.disposed, true); assert.equal(requests.length, before);
});
test('late list response after logout never overwrites another account or reopens dialog', async () => {
  const b = browser(); let resolveItems;
  const pending = new Promise(resolve => { resolveItems = resolve; });
  const state = b.api.mount(b.host, context({ api: async path => path.includes('/items?') ? pending : { groups: [], revision: 1 } }));
  b.host.children[0].children[1].fire('click'); await tick();
  b.api.clear(); resolveItems({ items: [{ item_id: 5, title: 'Old account' }] }); await tick();
  const next = b.api.mount(b.host, context({ organizationId: 'org2' }));
  assert.equal(next.items.length, 0); assert.equal(state.dialog, null);
});
test('opening reads only the correct source/account routes and scopes organization', async () => {
  const b = browser(), requests = [];
  b.api.mount(b.host, context({ api: async (path, options) => { requests.push({ path, options }); return { items: [], groups: [], revision: 2 }; } }));
  b.host.children[0].children[1].fire('click'); await tick();
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.path.startsWith('/connections/a1/bidding/')));
  assert.ok(requests.every(request => request.path.includes('organization_id=org1')));
  assert.ok(requests.every(request => !request.options || !request.options.method));
});
test('untrusted titles and account names are assigned as text; no browser storage or executable HTML', () => {
  assert.doesNotMatch(code, /\.innerHTML\s*=|insertAdjacentHTML|localStorage|sessionStorage|eval\s*\(/);
  const b = browser(); b.api.mount(b.host, context({ account: { id: 'a', source: 'personal', display_name: '<img src=x onerror=alert(1)>' } }));
  b.host.children[0].children[1].fire('click');
  const title = b.win.document.body.children[0].children[0].children[0].children[1];
  assert.equal(title.textContent, '<img src=x onerror=alert(1)>');
});
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) { const result = find(child, predicate); if (result) return result; }
  return null;
}
function clickByText(node, text) {
  const button = find(node, element => element.tagName === 'button' && (element.textContent === text || element.attributes['aria-label'] === text));
  assert.ok(button, 'button ' + text); button.fire('click'); return button;
}
async function loadedBrowser(options = {}) {
  const b = browser(), requests = [];
  const ctx = context({
    serverQueue: options.serverQueue === true,
    canManage: options.canManage !== false,
    api: async (url, request) => {
      requests.push({ url, request: request && copy(request) });
      if (options.api) { const result = await options.api(url, request); if (result !== undefined) return result; }
      if (url.includes('/items?')) return { items: [{ item_id: '123', title: 'My real-like ad', status: 'active', promotion: detail().current }], next_offset: null };
      if (url.includes('/items/123')) return { bidding: detail() };
      if (url.includes('/groups')) return { groups: [], revision: 1 };
      if (url.endsWith('/preview')) return { quote: 'server-confirmed-quote', expires_at: new Date(Date.now() + 900000).toISOString(), before: detail().current, after: { mode: 'manual', action_type_id: 5, bid_penny: 2300, limit_penny: 100000 } };
      if (url.endsWith('/apply')) return { status: 'applied' };
      throw new Error('Unexpected ' + url);
    }
  });
  const state = b.api.mount(b.host, ctx);
  b.host.children[0].children[1].fire('click');
  await tick(); await tick();
  return Object.assign(b, { state, requests });
}
test('server queue previews without applying, requires consent, and does not cancel on dialog close', async () => {
  let job=null, confirms=0;
  const b=await loadedBrowser({serverQueue:true,api:async(url,options)=>{
    if(url.includes('/jobs?'))return {jobs:job?[job]:[]};
    if(url.endsWith('/queue-preview'))return {quote:'queue-sealed',count:options.body.item_ids.length,after:{...detail().current,bid_penny:2300},expires_at:new Date(Date.now()+900000).toISOString()};
    if(url.endsWith('/queue-confirm')){confirms++;assert.equal(options.body.confirmation,'QUEUE_BIDS');return {job:job={id:'saved-job',status:'queued',item_count:1,counts:{pending:1}}};}
  }});
  b.state.form.bid='23';clickByText(b.state.parts.controls,'Проверить и поставить в очередь (1)');await tick();await tick();
  assert.equal(confirms,0);const submit=clickByText(b.state.parts.preview,'Подтвердить и запустить');await tick();assert.equal(confirms,0);
  const check=find(b.state.parts.preview,e=>e.tagName==='input'&&e.type==='checkbox');check.checked=true;check.fire('change');submit.fire('click');await tick();await tick();assert.equal(confirms,1);
  b.state.dialog.close();await tick();assert.equal(b.requests.some(r=>r.url.endsWith('/queue-cancel')),false);assert.equal(b.requests.some(r=>r.url.endsWith('/apply')),false);assert.equal(b.state.jobs[0].id,'saved-job');
});
test('server queue refuses empty daily budget inline and never previews paid data',async()=>{
  const b=await loadedBrowser({serverQueue:true,api:async url=>url.includes('/jobs?')?{jobs:[]}:undefined});b.state.form.limit='';clickByText(b.state.parts.controls,'Проверить и поставить в очередь (1)');await tick();assert.match(allText(b.state.formError),/Дневной лимит/);assert.equal(b.requests.some(r=>r.url.endsWith('/queue-preview')),false);
});
test('UI cap remains 350 RUB even when Avito offers thousands',()=>{const d=detail();d.manual.max_bid_penny=700000;assert.throws(()=>ui.validateForm({mode:'manual',bid:'351',limit:'1000'},d),/350/);assert.equal(ui.validateForm({mode:'manual',bid:'350',limit:'1000'},d).bid_penny,35000);});
test('recommendation fills the field only; previews and opening do not send paid apply', async () => {
  const b = await loadedBrowser();
  assert.equal(b.state.form.bid, '15');
  const recommendation = clickByText(b.state.parts.controls, 'Рекомендация: 23 ₽');
  assert.match(recommendation.className, /avb-recommendation/);
  assert.match(allText(recommendation), /Подставить/);
  assert.equal(b.state.parts.controls.children.includes(recommendation), false);
  assert.equal(b.state.form.bid, '23');
  assert.equal(b.requests.filter(entry => entry.request && entry.request.method === 'POST').length, 0);
  b.state.lastCpxAt = 0;
  clickByText(b.state.parts.controls, 'Рассчитать для выбранных (1)');
  await tick(); await tick();
  assert.equal(b.state.quotes.length, 1);
  assert.equal(b.requests.filter(entry => entry.url.endsWith('/preview')).length, 1);
  assert.equal(b.requests.filter(entry => entry.url.endsWith('/apply')).length, 0);
  const apply = find(b.state.parts.preview, element => element.tagName === 'button' && String(element.textContent).startsWith('Применить к'));
  assert.equal(apply.disabled, true);
});
test('only checked explicit confirmation applies a server quote with mandatory confirmation phrase', async () => {
  const b = await loadedBrowser();
  b.state.form.bid = '23'; b.state.lastCpxAt = 0;
  clickByText(b.state.parts.controls, 'Рассчитать для выбранных (1)'); await tick(); await tick();
  const apply = find(b.state.parts.preview, element => element.tagName === 'button' && String(element.textContent).startsWith('Применить к'));
  apply.fire('click'); await tick();
  assert.equal(b.requests.filter(entry => entry.url.endsWith('/apply')).length, 0);
  const check = find(b.state.parts.preview, element => element.tagName === 'input' && element.type === 'checkbox');
  check.checked = true; check.fire('change'); assert.equal(apply.disabled, false);
  b.state.lastCpxAt = 0; apply.fire('click'); await tick(); await tick();
  const writes = b.requests.filter(entry => entry.url.endsWith('/apply'));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].request.body, { organization_id: 'org1', quote: 'server-confirmed-quote', confirmation: 'APPLY_BIDS' });
  assert.equal(b.state.results[0].status, 'applied'); assert.equal(b.state.quotes.length, 0);
});
test('expired quotes are discarded without any financial request', async () => {
  const b = await loadedBrowser();
  b.state.form.bid = '23'; b.state.lastCpxAt = 0;
  clickByText(b.state.parts.controls, 'Рассчитать для выбранных (1)'); await tick(); await tick();
  b.state.quotes[0].expires = new Date(Date.now() - 1000).toISOString();
  const check = find(b.state.parts.preview, element => element.tagName === 'input' && element.type === 'checkbox'); check.checked = true; check.fire('change');
  const apply = find(b.state.parts.preview, element => element.tagName === 'button' && String(element.textContent).startsWith('Применить к')); apply.fire('click'); await tick();
  assert.equal(b.state.quotes.length, 0); assert.equal(b.requests.filter(entry => entry.url.endsWith('/apply')).length, 0);
});
test('read-only UI cannot quote or mutate even if a stale/forced button event occurs', async () => {
  const b = await loadedBrowser({ canManage: false });
  const preview = clickByText(b.state.parts.controls, 'Рассчитать для выбранных (1)');
  assert.equal(preview.disabled, true); await tick();
  assert.equal(b.requests.filter(entry => entry.request && entry.request.method === 'POST').length, 0);
});
test('credential rotation invalidates old confirmation before any apply request', async () => {
  const b = await loadedBrowser();
  b.state.form.bid = '23'; b.state.lastCpxAt = 0;
  clickByText(b.state.parts.controls, 'Рассчитать для выбранных (1)'); await tick(); await tick();
  const check = find(b.state.parts.preview, element => element.tagName === 'input' && element.type === 'checkbox'); check.checked = true; check.fire('change');
  const apply = find(b.state.parts.preview, element => element.tagName === 'button' && String(element.textContent).startsWith('Применить к'));
  b.api.mount(b.host, context({ account: { id: 'a1', source: 'oauth', credential_version: 2 } }));
  apply.fire('click'); await tick(); assert.equal(b.requests.filter(entry => entry.url.endsWith('/apply')).length, 0);
});
test('an unknown paid response is retained for manual verification, never repeated', async () => {
  const b = await loadedBrowser({ api: async url => url.endsWith('/apply') ? { status: 'unknown', error: { code: 'timeout', message: 'No confirmation' } } : undefined });
  b.state.form.bid = '23'; b.state.lastCpxAt = 0;
  clickByText(b.state.parts.controls, 'Рассчитать для выбранных (1)'); await tick(); await tick();
  const check = find(b.state.parts.preview, element => element.tagName === 'input' && element.type === 'checkbox'); check.checked = true; check.fire('change');
  b.state.lastCpxAt = 0; clickByText(b.state.parts.preview, 'Применить к 1 объявлениям'); await tick(); await tick();
  assert.equal(b.requests.filter(entry => entry.url.endsWith('/apply')).length, 1); assert.equal(b.state.results[0].status, 'unknown');
  assert.match(b.state.parts.preview.children[0].children[1].textContent, /не повторять автоматически/);
});
test('late selected-item details refresh the list row from missing promotion to its actual base mode', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const b = await loadedBrowser({ api: async url => {
    if (url.includes('/items?')) return { items: [{ item_id: '123', title: 'Ad without bulk promotion', status: 'active', promotion: null }], next_offset: null };
    if (url.includes('/items/123')) return pending;
    return undefined;
  } });
  assert.ok(find(b.state.parts.table, node => node.textContent === 'Не загружено'));
  const real = detail(); real.current = { mode: 'base', action_type_id: 5 }; real.mode = 'base';
  release({ bidding: real }); await tick(); await tick();
  assert.ok(find(b.state.parts.table, node => node.textContent === 'Базовая цена'));
  assert.equal(find(b.state.parts.table, node => node.textContent === 'Не загружено'), null);
  assert.equal(b.requests.filter(entry => entry.request && entry.request.method === 'POST').length, 0);
});

const ad = (id, bid, type = 5, mode = 'manual') => ({ item_id: String(id), title: 'Ad ' + id, promotion: { mode, action_type_id: type, bid_penny: bid } });
const allText = node => [node.textContent || '', ...(node.children || []).map(allText)].join(' ');
test('average uses positive manual kopecks only, deduplicates ads and keeps action units separate', () => {
  const result = ui.averageBids([ad(1, 1001), ad(2, 2002), ad(1, 99999), ad(3, 900, 1), ad(4, 500, 7), ad(5, 900000, 5, 'auto'), ad(6, 100, 5, 'base'), ad(7, null), ad(8, 0), ad(9, -1), ad(10, NaN), ad(11, 12.5), ad(12, 500, 99)]);
  assert.deepEqual(result.groups, [{ action_type_id: 5, count: 2, average_penny: 1502 }, { action_type_id: 1, count: 1, average_penny: 900 }, { action_type_id: 7, count: 1, average_penny: 500 }]);
  assert.equal(result.total_count, 12); assert.equal(result.manual_count, 4); assert.equal(result.auto_count, 1); assert.equal(result.base_count, 1); assert.equal(result.unknown_count, 6);
  assert.deepEqual(ui.averageBids([]).groups, []);
});
test('a newer detail supersedes the bulk rate but an older cached detail does not', () => {
  const items = [ad(1, 2000)], details = new Map([['1', { at: 90, value: { current: { mode: 'manual', action_type_id: 5, bid_penny: 1000 } } }]]);
  assert.equal(ui.averageBids(items, details, 100).groups[0].average_penny, 2000);
  details.get('1').at = 100;
  assert.equal(ui.averageBids(items, details, 100).groups[0].average_penny, 1000);
  assert.equal(items[0].promotion.bid_penny, 2000);
});
test('first automatic page shows a partial average before loading any more ads', async () => {
  let releaseDelay;
  const b = browser({ setTimeout: callback => { releaseDelay = callback; } }), requests = [];
  const state = b.api.mount(b.host, context({ api: async url => { requests.push(url); return { items: [ad(1, 2100)], next_offset: 99 }; } }));
  await tick();
  assert.equal(requests.length, 1); assert.equal(state.selectedId, ''); assert.equal(state.details.size, 0);
  assert.match(allText(b.host), /21 ₽/); assert.match(allText(b.host), /По загруженным 1 объявлениям/); assert.doesNotMatch(allText(b.host), /Все активные/);
  b.api.clear(); releaseDelay(); await tick(); assert.equal(requests.length, 1);
});
test('automatic warming is bounded to five pages and retains an explicit incomplete label', async () => {
  const b = browser({ setTimeout: callback => queueMicrotask(callback) }), requests = [];
  b.api.mount(b.host, context({ api: async url => { requests.push(url); const offset = Number(new URL('https://test' + url).searchParams.get('offset')); return { items: [ad(offset + 1, 2000)], next_offset: offset + 99 }; } }));
  await tick(); await tick();
  assert.equal(requests.length, 5); assert.match(allText(b.host), /По загруженным 5 объявлениям/); assert.doesNotMatch(allText(b.host), /Все активные/);
  assert.ok(requests.every(url => url.includes('/items?') && url.startsWith('/connections/a1/bidding/')));
  b.api.clear();
});
test('a complete automatic list states all active ads and does not invent zero for absent bids', async () => {
  const b = browser();
  b.api.mount(b.host, context({ api: async () => ({ items: [ad(1, null)], next_offset: null }) })); await tick();
  assert.match(allText(b.host), /Все активные: 1/); assert.match(allText(b.host), /Ручные ставки не получены/); assert.doesNotMatch(allText(b.host), /0 ₽/);
});
test('same-key remount shares the pending summary request and a fresh snapshot is not reread', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const b = browser(), requests = [];
  const ctx = context({ api: async url => { requests.push(url); return pending; } });
  const state = b.api.mount(b.host, ctx); b.api.mount(b.host, ctx); b.api.mount(b.host, ctx);
  assert.equal(requests.length, 1);
  release({ items: [ad(1, 1800)], next_offset: null }); await tick();
  assert.equal(state.loaded, true); b.api.mount(b.host, ctx); await tick(); assert.equal(requests.length, 1);
});
test('failed refresh preserves previous summary values and does not retry on every remount', async () => {
  const b = browser(); let failRead = false, reads = 0;
  const ctx = context({ api: async () => { reads++; if (failRead) throw new Error('temporarily unavailable'); return { items: [ad(1, 1900)], next_offset: null }; } });
  const state = b.api.mount(b.host, ctx); await tick(); failRead = true; state.loadedAt = Date.now() - 61000; state.lastReadAttempt = 0;
  b.api.mount(b.host, ctx); await tick(); assert.equal(reads, 2);
  assert.match(allText(b.host), /19 ₽/); assert.match(allText(b.host), /Не обновлено/);
  b.api.mount(b.host, ctx); await tick(); assert.equal(reads, 2); assert.equal(state.items.length, 1);
});
test('pending automatic summary never crosses account or credential identity', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const b = browser();
  const old = b.api.mount(b.host, context({ api: async () => pending }));
  const next = b.api.mount(b.host, context({ account: { id: 'different', source: 'personal', credential_version: 2 }, api: async () => ({ items: [ad(2, 5000)], next_offset: null }) }));
  await tick(); release({ items: [ad(1, 1000)], next_offset: null }); await tick();
  assert.equal(old.disposed, true); assert.equal(next.items[0].item_id, '2'); assert.match(allText(b.host), /50 ₽/); assert.doesNotMatch(allText(b.host), /10 ₽/);
});
test('context guard exceptions fail closed without issuing any summary request', async () => {
  const b = browser(); let reads = 0;
  b.api.mount(b.host, context({ isCurrent: () => { throw new Error('session pending'); }, api: async () => { reads++; return {}; } })); await tick();
  assert.equal(reads, 0);
});
test('compact editor contains confirmation next to controls; group and market details start collapsed', async () => {
  const data = detail(); data.manual.ladder = Array.from({ length: 30 }, (_, index) => ({ value_penny: 1500 + index * 100, min_forecast: index, max_forecast: index + 3, compare: index }));
  const b = await loadedBrowser({ api: async url => url.includes('/items/123') ? { bidding: data } : undefined });
  const editor = find(b.state.dialog, node => node.className === 'avb-editor');
  assert.ok(editor.children.includes(b.state.parts.controls)); assert.ok(editor.children.includes(b.state.parts.preview));
  const groups = find(b.state.parts.toolbar, node => node.className === 'avb-groups-editor'), market = find(b.state.parts.controls, node => node.className === 'avb-market-details');
  assert.equal(groups.open, false); assert.equal(market.open, false);
  assert.ok(find(groups, node => node.className === 'avb-groups-content'));
  assert.equal(find(market, node => node.tagName === 'tbody').children.length, 30);
  assert.match(allText(b.state.forecastHost), /0–3 действий/);
  b.state.form.bid = '15,01'; const field = find(b.state.parts.controls, node => node.tagName === 'input' && node.value === '15'); field.value = '15,01'; field.fire('input');
  assert.match(allText(b.state.forecastHost), /точных вариантов/);
  assert.equal(b.requests.filter(entry => entry.url.endsWith('/apply')).length, 0);
});
test('initial editor prefers a known promoted ad without changing the checked batch selection', async () => {
  const b = browser(), requests = [];
  const state = b.api.mount(b.host, context({ api: async url => {
    requests.push(url);
    if (url.includes('/items?')) return { items: [{ item_id: '111', title: 'No promotion', promotion: null }, ad(222, 1800)], next_offset: null };
    if (url.includes('/items/222?')) { const data = detail(); data.item_id = '222'; return { bidding: data }; }
    if (url.includes('/groups?')) return { groups: [], revision: 1 };
    throw new Error('Unexpected route ' + url);
  } }));
  await tick(); state.selected.add('111'); b.host.children[0].children[1].fire('click'); await tick(); await tick();
  assert.equal(state.selectedId, '222'); assert.deepEqual(Array.from(state.selected), ['111']);
  assert.ok(requests.some(url => url.includes('/items/222?'))); assert.ok(requests.every(url => !url.includes('/items/111?')));
  assert.equal(state.details.get('222').value.item_id, '222');
});

const historyPeriod = { date_from: '2026-01-28', date_to: '2026-10-24', days: 270, kind: 'available_history' };
function statsAd(id, contacts, views = contacts, favorites = contacts) { return { item_id: String(id), title: 'Ad ' + id, statistics: { contacts, views, favorites, period: historyPeriod, fetched_at: '2026-10-24T12:00:00Z' } }; }
function tableIds(state) { return find(state.parts.table, node => node.tagName === 'tbody').children.map(row => row.children[1].children[1].textContent.match(/^ID (\d+)/)[1]); }
function groupSelect(state) { return find(state.parts.toolbar, node => node.tagName === 'select' && node.attributes['aria-label'] === 'Группа объявлений'); }

test('statistics sorting is numeric, stable and puts missing values after zero in both directions', () => {
  const ads = [statsAd(1, 0), statsAd(2, 3), statsAd(3, null), statsAd(4, 22), statsAd(5, 3), statsAd(6, '100'), statsAd(7, -2)];
  assert.deepEqual(ui.sortItems(ads, 'contacts', 'desc').map(item => item.item_id), ['4', '2', '5', '1', '3', '6', '7']);
  assert.deepEqual(ui.sortItems(ads, 'contacts', 'asc').map(item => item.item_id), ['1', '2', '5', '4', '3', '6', '7']);
  assert.deepEqual(ads.map(item => item.item_id), ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(ui.statValue(statsAd(1, Number.MAX_SAFE_INTEGER + 1), 'contacts'), null);
});

test('table metric headers sort descending first and selection remains attached to item IDs', async () => {
  const items = [statsAd(1, 0, 250, 5), statsAd(2, 12, 3, 7), statsAd(3, null, null, null), statsAd(4, 2, 99, 1)];
  const b = await loadedBrowser({ api: async url => url.includes('/items?') ? { items, statistics_period: historyPeriod, next_offset: null } : undefined });
  b.state.selected.add('1'); b.state.selected.add('4');
  clickByText(b.state.parts.table, 'Контакты'); assert.deepEqual(tableIds(b.state), ['2', '4', '1', '3']);
  assert.deepEqual(Array.from(b.state.selected), ['1', '4']);
  const rows = find(b.state.parts.table, node => node.tagName === 'tbody').children;
  assert.equal(rows[1].children[0].children[0].checked, true); assert.equal(rows[2].children[0].children[0].checked, true);
  clickByText(b.state.parts.table, 'Контакты'); assert.deepEqual(tableIds(b.state), ['1', '4', '2', '3']);
  clickByText(b.state.parts.table, 'Просмотры'); assert.deepEqual(tableIds(b.state), ['1', '4', '2', '3']);
  clickByText(b.state.parts.table, 'Избранное'); assert.deepEqual(tableIds(b.state), ['2', '1', '4', '3']);
  assert.equal(find(b.state.parts.table, node => node.tagName === 'th' && node.children[0] && node.children[0].textContent === 'Избранное').attributes['aria-sort'], 'descending');
  assert.equal(b.requests.filter(entry => entry.request && entry.request.method === 'POST').length, 0);
});

test('missing statistics stay empty, real zero is shown, and available API history is not called lifetime', async () => {
  const b = await loadedBrowser({ api: async url => url.includes('/items?') ? { items: [statsAd(1, 0, null, 6)], statistics_period: historyPeriod, next_offset: null } : undefined });
  const row = find(b.state.parts.table, node => node.tagName === 'tbody').children[0];
  assert.equal(row.children[2].textContent, '0'); assert.equal(row.children[3].textContent, ''); assert.equal(row.children[4].textContent, '6');
  assert.match(allText(b.state.parts.toolbar), /28\.01\.2026—24\.10\.2026 · 270 дней/);
  assert.doesNotMatch(allText(b.state.parts.toolbar), /всё время|все время|за 30 дней/i);
});

test('Contacts group exists with no saved groups and tracks strictly more than one contact on each refresh', async () => {
  let items = [statsAd(1, 0), statsAd(2, 1), statsAd(3, 2), statsAd(4, null)];
  const b = await loadedBrowser({ api: async url => url.includes('/items?') ? { items, statistics_period: historyPeriod, next_offset: null } : undefined });
  let group = groupSelect(b.state); assert.ok(group.children.some(option => option.value === ui.CONTACT_GROUP_ID));
  group.value = ui.CONTACT_GROUP_ID; group.fire('change'); assert.deepEqual(tableIds(b.state), ['3']);
  items = [statsAd(1, 3), statsAd(2, 1), statsAd(3, 0), statsAd(4, 2)];
  clickByText(b.state.parts.toolbar, 'Обновить список'); await tick(); assert.deepEqual(tableIds(b.state), ['1', '4']);
  assert.match(allText(groupSelect(b.state)), /Контактные/);
  assert.equal(find(b.state.parts.toolbar, node => node.textContent === 'Удалить группу'), null);
  assert.equal(b.state.groups.length, 0);
  assert.equal(b.requests.filter(entry => entry.request && entry.request.method === 'POST').length, 0);
});

test('temporary statistics failures retain successful values and dynamic Contacts membership', async () => {
  let fail = false;
  const original = statsAd(1, 8, 100, 5), missing = { item_id: '1', title: 'Latest title', statistics: { contacts: null, views: null, favorites: null }, statistics_error: 'upstream unavailable' };
  const b = await loadedBrowser({ api: async url => url.includes('/items?') ? { items: [fail ? missing : original], statistics_period: historyPeriod, next_offset: null } : undefined });
  groupSelect(b.state).value = ui.CONTACT_GROUP_ID; groupSelect(b.state).fire('change');
  fail = true; clickByText(b.state.parts.toolbar, 'Обновить список'); await tick();
  assert.deepEqual(tableIds(b.state), ['1']); assert.equal(b.state.items[0].statistics.contacts, 8); assert.equal(b.state.items[0].statistics.stale, true);
  assert.equal(b.state.items[0].title, 'Latest title'); assert.match(allText(b.state.parts.toolbar), /предыдущего обновления/);
  assert.equal(original.statistics.stale, undefined);
  const backendCached = Object.assign(statsAd(1, 9), { statistics_error: 'retry failed' });
  assert.equal(ui.mergeStatistics([backendCached], [original])[0].statistics.contacts, 9);
});

test('first statistics permission failure reports unavailable data, not nonexistent cached history', async () => {
  const b = await loadedBrowser({ api: async url => url.includes('/items?') ? { items: [{ item_id: '1', title: 'No stats access', statistics: null, statistics_error: 'bidding_statistics_scope_required' }], statistics_period: historyPeriod, next_offset: null } : undefined });
  const caption = find(b.state.parts.toolbar, node => node.className === 'avb-stats-period');
  assert.match(allText(caption), /статистики недоступна/); assert.doesNotMatch(allText(caption), /предыдущего обновления/);
  const row = find(b.state.parts.table, node => node.tagName === 'tbody').children[0];
  assert.deepEqual(row.children.slice(2, 5).map(cell => cell.textContent), ['', '', '']);
  const group = groupSelect(b.state); group.value = ui.CONTACT_GROUP_ID; group.fire('change');
  assert.deepEqual(tableIds(b.state), []); assert.match(allText(b.state.parts.table), /Для части объявлений статистика не получена/);
});

test('fresh partial metric response is not padded with stale prior counters', () => {
  const previous = statsAd(1, 8, 100, 5), fresh = Object.assign(statsAd(1, 3, null, 0), { statistics_error: 'one field unavailable' });
  const merged = ui.mergeStatistics([fresh], [previous])[0];
  assert.equal(merged.statistics.contacts, 3); assert.equal(merged.statistics.views, null); assert.equal(merged.statistics.favorites, 0);
  assert.equal(merged.statistics.stale, undefined); assert.equal(previous.statistics.views, 100);
});

test('group appearance is deterministic, escaped text, and rejects unsafe CSS colors', () => {
  assert.deepEqual(ui.groupAppearance({ name: 'Мебель' }), ui.groupAppearance({ name: 'Мебель' }));
  assert.equal(ui.groupAppearance({ name: 'Мебель' }).emoji, '🪑');
  assert.equal(ui.groupAppearance({ name: 'New', emoji: '🎯', color: '#AABBCC' }).color, '#aabbcc');
  assert.notEqual(ui.groupAppearance({ name: 'New', color: 'red;url(https://bad)' }).color, 'red;url(https://bad)');
  assert.match(ui.groupAppearance({ name: 'Any' }).color, /^#[0-9a-f]{6}$/);
  assert.equal(ui.groupAppearance({ name: 'Any', emoji: 'a'.repeat(13) }).emoji.length <= 12, true);
});

test('legacy saved groups gain appearance when edited without dropping existing IDs or other metadata', async () => {
  const old = [{ id: 'old-group', name: 'Мебель', item_ids: ['1', '2'] }, { id: 'other-group', name: 'Other', item_ids: ['3'], emoji: '💼', color: '#aabbcc' }];
  const b = await loadedBrowser({ api: async (url, request) => {
    if (url.includes('/items?')) return { items: [statsAd(1, 0), statsAd(2, 4)], next_offset: null };
    if (url.includes('/groups')) return request ? { groups: request.body.groups, revision: 2 } : { groups: old, revision: 1 };
  } });
  const group = groupSelect(b.state); group.value = 'old-group'; group.fire('change');
  const emoji = find(b.state.parts.toolbar, node => node.attributes['aria-label'] === 'Эмоджи группы'); emoji.value = '🎯'; emoji.fire('input');
  const color = find(b.state.parts.toolbar, node => node.attributes['aria-label'] === 'Цвет группы'); color.value = '#f38bb0'; color.fire('change');
  clickByText(b.state.parts.toolbar, 'Сохранить название и оформление'); await tick();
  const request = b.requests.find(entry => entry.request && entry.url.endsWith('/groups'));
  assert.deepEqual(request.request.body.groups[0], { id: 'old-group', name: 'Мебель', item_ids: ['1', '2'], emoji: '🎯', color: '#f38bb0' });
  assert.deepEqual(request.request.body.groups[1], old[1]);
  const badge = find(b.state.parts.table, node => node.className === 'avb-group-badge' && node.textContent === '🎯 Мебель');
  assert.equal(badge.style['--avb-group-color'], '#f38bb0');
});

test('Contacts appearance persists metadata only, never a frozen automatic membership', async () => {
  const b = await loadedBrowser({ api: async (url, request) => {
    if (url.includes('/items?')) return { items: [statsAd(1, 8)], next_offset: null };
    if (url.includes('/groups')) return request ? { groups: request.body.groups, revision: 2 } : { groups: [], revision: 1 };
  } });
  const group = groupSelect(b.state); group.value = ui.CONTACT_GROUP_ID; group.fire('change'); b.state.selected.add('1');
  const emoji = find(b.state.parts.toolbar, node => node.attributes['aria-label'] === 'Эмоджи группы'); emoji.value = '✨'; emoji.fire('input');
  clickByText(b.state.parts.toolbar, 'Сохранить оформление'); await tick();
  const request = b.requests.find(entry => entry.request && entry.url.endsWith('/groups'));
  assert.equal(request.request.body.groups[0].name, 'Контактные'); assert.deepEqual(request.request.body.groups[0].item_ids, []); assert.equal(request.request.body.groups[0].emoji, '✨');
  assert.deepEqual(tableIds(b.state), ['1']);
  assert.equal(b.requests.some(entry => entry.url.endsWith('/preview') || entry.url.endsWith('/apply')), false);
});

async function pagedBrowser(pages, options = {}) {
  const timers = [], requests = [], b = browser({ setTimeout: (callback, delay) => { timers.push({ callback, delay }); } });
  const state = b.api.mount(b.host, context({ canManage: options.canManage !== false, api: async (url, request) => {
    requests.push({ url, request });
    if (url.includes('/items?')) { const offset = Number(new URL('https://test' + url).searchParams.get('offset')); return typeof pages === 'function' ? pages(offset) : pages[offset]; }
    if (url.includes('/groups?')) return { groups: [], revision: 1 };
    if (/\/items\/\d+\?/.test(url)) { const value = detail(); value.item_id = url.match(/\/items\/(\d+)/)[1]; return { bidding: value }; }
    if (url.endsWith('/preview')) return { quote: 'safe-preview', expires_at: new Date(Date.now() + 900000).toISOString(), before: detail().current, after: detail().current };
    throw new Error('Unexpected ' + url);
  } }));
  b.host.children[0].children[1].fire('click'); await tick(); await tick();
  return Object.assign(b, { state, timers, requests, releaseTimer: async () => { assert.ok(timers.length, 'pending page timer'); timers.shift().callback(); await tick(); await tick(); } });
}
const listRequests = b => b.requests.filter(entry => entry.url.includes('/items?'));

test('Contacts loads all remaining pages, updates global sorting and preserves selected IDs and form', async () => {
  const b = await pagedBrowser({
    0: { items: [statsAd(1, 0), statsAd(2, 3)], next_offset: 99 },
    99: { items: [statsAd(3, 12), statsAd(4, 1)], next_offset: 198 },
    198: { items: [statsAd(5, 7)], next_offset: null }
  });
  b.state.selected.add('1'); b.state.form.bid = '19'; const editorId = b.state.selectedId;
  clickByText(b.state.parts.table, 'Контакты'); const group = groupSelect(b.state); group.value = ui.CONTACT_GROUP_ID; group.fire('change');
  assert.equal(b.state.loadingAll, true); assert.deepEqual(tableIds(b.state), ['2']); assert.equal(listRequests(b).length, 1);
  assert.ok(b.timers[0].delay > 3400 && b.timers[0].delay <= 3500); assert.match(allText(b.state.parts.toolbar), /Загружено объявлений: 2/);
  await b.releaseTimer(); assert.deepEqual(tableIds(b.state), ['3', '2']); assert.equal(b.state.loadingAll, true);
  await b.releaseTimer(); assert.deepEqual(tableIds(b.state), ['3', '5', '2']); assert.equal(b.state.loadingAll, false);
  assert.equal(listRequests(b).length, 3); assert.equal(b.state.next, null); assert.equal(b.state.form.bid, '19'); assert.equal(b.state.selectedId, editorId); assert.deepEqual(Array.from(b.state.selected), ['1']);
  assert.match(allText(b.state.parts.toolbar), /Загружено объявлений: 5/); assert.doesNotMatch(allText(b.state.parts.toolbar), /Список загружен частично/);
  assert.equal(b.requests.some(entry => entry.request && entry.request.method === 'POST'), false);
});

test('load-all is read-only and bounded to 100 additional pages with an honest incomplete warning', async () => {
  const b = await pagedBrowser(offset => ({ items: [statsAd(offset + 1, 2)], next_offset: offset + 99 }), { canManage: false });
  clickByText(b.state.parts.toolbar, 'Загрузить все');
  for (let page = 0; page < 100; page++) await b.releaseTimer();
  assert.equal(listRequests(b).length, 101); assert.equal(b.state.loadingAll, false); assert.equal(b.state.items.length, 101); assert.notEqual(b.state.next, null);
  assert.match(b.state.status, /предел 100 страниц/); assert.match(allText(b.state.parts.toolbar), /Список загружен частично/);
  assert.equal(b.timers.length, 0); assert.equal(b.requests.some(entry => entry.request), false);
});

test('load-all stops on explicit cancellation, dialog close, account switch or financial preview without retrying', async () => {
  for (const stop of ['cancel', 'close', 'scope', 'preview']) {
    const b = await pagedBrowser({ 0: { items: [statsAd(1, 2)], next_offset: 99 }, 99: { items: [statsAd(2, 7)], next_offset: null } });
    clickByText(b.state.parts.toolbar, 'Загрузить все'); assert.equal(b.state.loadingAll, true);
    if (stop === 'cancel') clickByText(b.state.parts.toolbar, 'Остановить загрузку');
    if (stop === 'close') b.state.dialog.close();
    if (stop === 'scope') b.api.clear();
    if (stop === 'preview') { b.state.lastCpxAt = 0; clickByText(b.state.parts.controls, 'Рассчитать для выбранных (1)'); await tick(); await tick(); }
    await b.releaseTimer();
    assert.equal(listRequests(b).length, 1, stop); assert.equal(b.state.loadingAll, false, stop); assert.equal(b.timers.length, 0, stop);
    assert.equal(b.state.items[0].item_id, '1'); assert.equal(b.requests.some(entry => entry.url.endsWith('/apply')), false);
  }
});

test('load-all stops after one failed page and retains first-page counters and Contacts membership', async () => {
  const b = await pagedBrowser(offset => { if (offset) throw new Error('temporary page failure'); return { items: [statsAd(1, 3)], next_offset: 99 }; });
  const group = groupSelect(b.state); group.value = ui.CONTACT_GROUP_ID; group.fire('change'); await b.releaseTimer();
  assert.equal(listRequests(b).length, 2); assert.equal(b.state.loadingAll, false); assert.equal(b.state.next, 99); assert.deepEqual(tableIds(b.state), ['1']);
  assert.equal(b.state.items[0].statistics.contacts, 3); assert.match(b.state.status, /temporary page failure/); assert.equal(b.timers.length, 0);
});

test('aged parent remount while manager is open never resets a fully loaded Contacts list to page one', async () => {
  const b = await pagedBrowser({ 0: { items: [statsAd(1, 2)], next_offset: 99 }, 99: { items: [statsAd(2, 8)], next_offset: null } });
  const group = groupSelect(b.state); group.value = ui.CONTACT_GROUP_ID; group.fire('change'); await b.releaseTimer();
  assert.equal(b.state.items.length, 2); assert.equal(b.state.next, null);
  b.state.loadedAt = Date.now() - 61000; b.state.lastReadAttempt = Date.now() - 61000;
  b.api.mount(b.host, b.state.ctx); await tick(); await tick();
  assert.equal(listRequests(b).length, 2); assert.equal(b.state.items.length, 2); assert.equal(b.state.next, null); assert.deepEqual(tableIds(b.state), ['1', '2']);
  assert.equal(b.timers.length, 0);
});

test('reopening Contacts during cancellation resumes from the remaining page without replacing loaded rows', async () => {
  const b = await pagedBrowser({ 0: { items: [statsAd(1, 2)], next_offset: 99 }, 99: { items: [statsAd(2, 8)], next_offset: null } });
  const group = groupSelect(b.state); group.value = ui.CONTACT_GROUP_ID; group.fire('change');
  b.state.dialog.close(); b.host.children[0].children[1].fire('click');
  assert.equal(b.state.resumeContactsLoad, true); assert.equal(listRequests(b).length, 1);
  await b.releaseTimer(); assert.equal(b.state.loadingAll, true); assert.deepEqual(tableIds(b.state), ['1']);
  await b.releaseTimer(); assert.equal(b.state.loadingAll, false); assert.deepEqual(tableIds(b.state), ['1', '2']);
  assert.equal(listRequests(b).length, 2); assert.match(listRequests(b)[1].url, /offset=99/);
});

test('background page-one refresh started while closed cannot truncate rows if manager reopens before its reply', async () => {
  let refresh = false, resolveRefresh;
  const pending = new Promise(resolve => { resolveRefresh = resolve; });
  const b = await pagedBrowser(offset => refresh && !offset ? pending : offset ? { items: [statsAd(2, 8)], next_offset: null } : { items: [statsAd(1, 2)], next_offset: 99 });
  clickByText(b.state.parts.toolbar, 'Загрузить все'); await b.releaseTimer();
  b.state.dialog.close(); b.state.loadedAt = Date.now() - 61000; b.state.lastReadAttempt = Date.now() - 61000; refresh = true;
  b.api.mount(b.host, b.state.ctx); assert.equal(listRequests(b).length, 3);
  b.host.children[0].children[1].fire('click'); resolveRefresh({ items: [statsAd(1, 3)], next_offset: 99 }); await tick(); await tick();
  assert.equal(b.state.items.length, 2); assert.equal(b.state.next, null); assert.equal(b.state.items[0].statistics.contacts, 2);
});
