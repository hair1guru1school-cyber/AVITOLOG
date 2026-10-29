'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const load = () => import('../../supabase/functions/_shared/avito-bidding.mjs');
const ORG = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const GROUP = '44444444-4444-4444-8444-444444444444';
const NOW = Date.parse('2026-10-24T12:00:00Z');
function provider() {
  const budget = () => ({ minLimitPenny: 10000, maxLimitPenny: 1000000, recBudgetPenny: 20000, budgets: [{ valuePenny: 20000, minForecast: 2, maxForecast: 5, compare: 10 }] });
  return { actionTypeID: 5, selectedType: 'manual', manual: { bidPenny: 200, limitPenny: 20000, minBidPenny: 100, maxBidPenny: 1000, recBidPenny: 300, minLimitPenny: 10000, maxLimitPenny: 1000000,
    bids: [{ valuePenny: 200, minForecast: 1, maxForecast: 4, compare: 20 }, { valuePenny: 300, minForecast: 3, maxForecast: 7, compare: 50 }] },
  auto: { budgetPenny: null, budgetType: null, minBudgetPenny: 10000, maxBudgetPenny: 1000000, dailyBudget: budget(), weeklyBudget: budget(), monthlyBudget: budget() } };
}
async function harness(options = {}) {
  const api = await load(), reads = [], writes = [], reservations = [], audits = options.audits || new Map(), groupRecords = options.groupRecords || new Map();
  let clock = NOW, value = provider(), allowed = true, version = '55555555-5555-4555-8555-555555555555', guardCount = 0;
  const row = { id: ACCOUNT, organization_id: ORG, avito_user_id: '123', status: 'connected', credential_version: version };
  const context = { row, org: ORG, actor: ACTOR, token: 'test-token', guard: async () => { guardCount++; if (!allowed || options.guardFailureAt === guardCount || row.credential_version !== version) throw Object.assign(new Error(), { status: 409, code: 'account_changed' }); } };
  const store = {
    queue: options.queue,
    reserve: async parameters => { reservations.push(parameters); return options.rateLimit !== parameters.p_kind; },
    begin: async parameters => { if (options.beginFails || audits.has(parameters.p_quote_id)) return false; audits.set(parameters.p_quote_id, { ...parameters, status: 'submitting' }); return true; },
    finish: async parameters => { if (options.finishFails) return false; const record = audits.get(parameters.p_quote_id); if (!record || record.status !== 'submitting') return false; Object.assign(record, { status: parameters.p_status, error: parameters.p_error }); return true; },
    getGroups: async (module, org, id) => groupRecords.get([module, org, id].join(':')) || null,
    setGroups: async parameters => { const key = [parameters.p_module, parameters.p_organization_id, parameters.p_account_id].join(':'), previous = groupRecords.get(key); if ((previous?.revision || 0) !== parameters.p_expected_revision) return null; const saved = { revision: parameters.p_expected_revision + 1, groups: parameters.p_groups }; groupRecords.set(key, saved); return saved; }
  };
  const requestJson = async (url, init) => {
    reads.push({ url, init });
    if (url.includes('/core/v1/accounts/')) return { status: options.itemStatus || 'active' };
    if (url.includes('/cpxpromo/1/getBids/')) return structuredClone(value);
    if (url.includes('/core/v1/items?')) { const parsed = new URL(url), limit = Number(parsed.searchParams.get('per_page')), page = Number(parsed.searchParams.get('page')); return { resources: options.itemResources || [{ id: 1234, title: '<b>Real title</b>', status: 'active', url: 'https://www.avito.ru/test_1234' }], meta: { page, per_page: limit } }; }
    if (url.endsWith('/getPromotionsByItemIds')) { if (options.promotionsFail) throw Object.assign(new Error(), { code: 'bidding_promotions_unavailable' }); return { items: [{ itemID: 1234, actionTypeID: 5, manualPromotion: { bidPenny: 200, limitPenny: 20000 } }] }; }
    if (url.includes('/stats/v1/accounts/')) {
      await options.onStatistics?.();
      if (options.statisticsFail) throw Object.assign(new Error('private diagnostic'), { code: 'statistics_provider_error' });
      return structuredClone(options.statisticsResponse || { result: { items: [{ itemId: 1234, stats: [{ date: '2026-10-01', uniqContacts: 2, uniqViews: 20, uniqFavorites: 3 }] }] } });
    }
    throw new Error('Unexpected provider request');
  };
  const fetchImpl = async (url, init) => {
    writes.push({ url, init });
    if (options.transportFailure) throw new TypeError('private provider diagnostics');
    if (options.onWrite) options.onWrite({ row });
    return new Response(options.writeBody === undefined ? null : options.writeBody, { status: options.writeStatus || 200 });
  };
  const create = module => api.createAvitoBidding({ requestJson, fetch: fetchImpl, now: () => clock, signingSecret: 'test-signing-secret', store, module: module || 'personal' });
  const run = (action, method = 'GET', body = {}, selected = context, instance = engine) => instance.handle({ context: selected, route: { action, itemId: '1234' }, method, body, url: new URL('https://avitoboss.online/test?organization_id=' + selected.org) });
  const engine = create();
  const preview = () => run('preview', 'POST', { organization_id: ORG, item_id: '1234', mode: 'manual', bid_penny: 300, limit_penny: 20000 });
  const apply = quote => run('apply', 'POST', { organization_id: ORG, quote, confirmation: 'APPLY_BIDS' });
  return { api, context, reads, writes, audits, groupRecords, reservations, create, run, preview, apply, setClock: time => { clock = time; }, setProvider: entry => { value = entry; }, revoke: () => { allowed = false; }, changeVersion: () => { version = 'changed'; } };
}
test('CPX normalization keeps exact kopecks, offered competition ladder and forecast units', async () => {
  const { normalizeBidding } = await load(), result = normalizeBidding(provider(), '1234', NOW);
  assert.equal(result.current.bid_penny, 200); assert.equal(result.manual.recommended_bid_penny, 300);
  assert.deepEqual(result.manual.ladder[1], { value_penny: 300, min_forecast: 3, max_forecast: 7, compare: 50 });
  assert.equal(result.auto.daily.recommended_budget_penny, 20000); assert.equal(result.fetched_at, new Date(NOW).toISOString());
  assert.equal(result.action_type_id, 5); assert.equal(result.current.budget_penny, null);
});
test('auto promotion remains auto when the provider has no known budget ceiling or period', async () => {
  const { normalizeBidding } = await load();
  for (const [amount, period] of [[null, null], [null, '1d'], [undefined, undefined], [20000, null]]) {
    const value = provider(); value.selectedType = 'auto'; value.auto.budgetPenny = amount; value.auto.budgetType = period;
    const normalized = normalizeBidding(value, '1234', NOW);
    assert.equal(normalized.mode, 'auto'); assert.equal(normalized.current.mode, 'auto');
    assert.equal(normalized.current.budget_penny, amount ?? null); assert.equal(normalized.current.budget_type, period ?? null);
    assert.equal(normalized.current.bid_penny, null); assert.equal(normalized.current.limit_penny, null);
  }
});
test('API routes are closed and account identities validated', async () => {
  const { biddingRoute } = await load(), prefix = '/api/integrations/avito-accounts/accounts';
  assert.deepEqual(biddingRoute(prefix + '/' + ACCOUNT + '/bidding/items/1234', prefix), { accountId: ACCOUNT, action: 'detail', itemId: '1234' });
  for (const tail of ['/bidding/setManual', '/bidding/items/0', '/bidding/items/123/extra', '/bidding/groups/anything']) assert.equal(biddingRoute(prefix + '/' + ACCOUNT + tail, prefix), null);
  assert.equal(biddingRoute(prefix + '/wrong/bidding/items', prefix), null);
});
test('durable queue preview is immutable and read-only; only a signed scoped confirmation queues it',async()=>{
  const calls=[],h=await harness({queue:async(name,payload)=>{calls.push([name,structuredClone(payload)]);return name==='draft'?true:{id:payload.p_id,status:'queued'};}});
  const draft=await h.run('queue-preview','POST',{item_ids:['1234','1235'],change:{mode:'manual',bid_penny:300,limit_penny:20000}});
  assert.equal(draft.count,2);assert.equal(calls[0][0],'draft');assert.deepEqual(calls[0][1].p_ids,['1234','1235']);assert.equal(calls[0][1].p_intent.action_type_id,5);assert.equal(h.writes.length,0);
  await assert.rejects(()=>h.apply(draft.quote),{code:'invalid_quote'});
  await assert.rejects(()=>h.run('queue-confirm','POST',{quote:draft.quote}),{code:'confirmation_required'});
  await assert.rejects(()=>h.run('queue-confirm','POST',{quote:draft.quote,confirmation:'QUEUE_BIDS'},{...h.context,actor:ACCOUNT}),{code:'bidding_quote_expired'});
  const result=await h.run('queue-confirm','POST',{quote:draft.quote,confirmation:'QUEUE_BIDS'});assert.equal(result.job.id,draft.job_id);assert.equal(calls.at(-1)[0],'confirm');assert.equal(h.writes.length,0);
});
test('queue plans reject duplicate IDs, unknown fields, unbounded limits and missing CPX edit rights',async()=>{
  const h=await harness({queue:async()=>true});
  for(const body of [{item_ids:['1234','1234'],change:{mode:'base'}},{item_ids:['1234'],change:{mode:'manual',bid_penny:300}},{item_ids:['1234'],change:{mode:'base'},other:true}])await assert.rejects(()=>h.run('queue-preview','POST',body));
  const {requireBiddingScope}=await load();assert.throws(()=>requireBiddingScope({status:'connected',scopes:['items:info','cpxpromo:read']},'queue-confirm',true),{code:'bidding_scope_required'});assert.equal(h.writes.length,0);
});
test('OAuth requires both CPX scopes on money preview/apply and item ownership scope', async () => {
  const { requireBiddingScope } = await load(), row = { status: 'connected', scopes: ['items:info', 'cpxpromo:read'] };
  requireBiddingScope(row, 'items', true);
  assert.throws(() => requireBiddingScope(row, 'preview', true), { code: 'bidding_scope_required' });
  assert.throws(() => requireBiddingScope(row, 'apply', true), { code: 'bidding_scope_required' });
  row.scopes.push('cpxpromo:edit'); requireBiddingScope(row, 'apply', true);
  assert.throws(() => requireBiddingScope({ ...row, status: 'disconnected' }, 'items', false), { code: 'account_disconnected' });
  requireBiddingScope({ status: 'connected' }, 'apply', false);
});
test('list and detail perform no financial requests; list promotion failure preserves active items', async () => {
  for (const promotionsFail of [false, true]) {
    const h = await harness({ promotionsFail }), list = await h.run('items');
    assert.equal(list.items[0].item_id, '1234'); assert.equal(list.items[0].status, 'active');
    assert.equal(list.items[0].promotion?.bid_penny ?? null, promotionsFail ? null : 200);
    await h.run('detail'); assert.equal(h.writes.length, 0); assert.equal(h.audits.size, 0);
    assert.match(h.reads.find(read => read.url.includes('/core/v1/accounts/')).url, /\/accounts\/123\/items\/1234\/$/);
  }
});
test('preview contains signed bounded change only and does not submit', async () => {
  const h = await harness(), result = await h.preview();
  assert.equal(h.writes.length, 0); assert.equal(h.audits.size, 0);
  assert.equal(Date.parse(result.expires_at) - NOW, 900000); assert.equal(result.before.bid_penny, 200); assert.equal(result.after.bid_penny, 300);
  assert.doesNotMatch(JSON.stringify(result), /test-token|test-signing-secret/);
});
test('manual limits are finite and minimum bid is strictly exclusive', async () => {
  const { biddingChange, normalizeBidding } = await load(), detail = normalizeBidding(provider(), '1234', NOW);
  for (const bid of [100, 99, -1, 100.5, NaN, Infinity, 1001, '300']) assert.throws(() => biddingChange({ item_id: '1234', mode: 'manual', bid_penny: bid, limit_penny: 20000 }, detail));
  for (const limit of [undefined, null, 0, 9999, 1000001, Infinity, '20000']) assert.throws(() => biddingChange({ item_id: '1234', mode: 'manual', bid_penny: 300, limit_penny: limit }, detail));
  assert.equal(biddingChange({ item_id: '1234', mode: 'manual', bid_penny: 101, limit_penny: 10000 }, detail).bid_penny, 101);
});
test('auto uses provider period-specific budget bounds and rejects mixed mode fields', async () => {
  const { biddingChange, normalizeBidding } = await load(), detail = normalizeBidding(provider(), '1234', NOW);
  for (const type of ['1d', '7d', '30d']) assert.equal(biddingChange({ item_id: '1234', mode: 'auto', budget_type: type, budget_penny: 20000 }, detail).budget_type, type);
  for (const body of [{ mode: 'auto', budget_penny: 20000, budget_type: '2d' }, { mode: 'auto', budget_penny: 20000, budget_type: '1d', bid_penny: 300 }, { mode: 'base', budget_penny: 20000 }]) assert.throws(() => biddingChange({ item_id: '1234', ...body }, detail));
});
test('fresh ownership must be active, provider errors cannot fabricate availability', async () => {
  for (const itemStatus of ['another_user', 'old', 'blocked', 'removed', 'not_found']) { const h = await harness({ itemStatus }); await assert.rejects(h.preview(), { code: 'bidding_item_not_active' }); assert.equal(h.writes.length, 0); }
  const { normalizeBidding } = await load();
  for (const malformed of [{ error: 'x' }, { ...provider(), actionTypeID: '5' }, { ...provider(), selectedType: 'unexpected' }]) assert.throws(() => normalizeBidding(malformed, '1234', NOW));
  const bad = provider(); bad.manual.bids[0].maxForecast = -1; assert.throws(() => normalizeBidding(bad, '1234', NOW));
});
test('apply submits once with exact provider wire fields and stores an audit record', async () => {
  const h = await harness(), preview = await h.preview(), result = await h.apply(preview.quote);
  assert.deepEqual(result, { ok: true, status: 'applied', item_id: '1234' }); assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].url, 'https://api.avito.ru/cpxpromo/1/setManual');
  assert.deepEqual(JSON.parse(h.writes[0].init.body), { itemID: 1234, actionTypeID: 5, bidPenny: 300, limitPenny: 20000 });
  assert.equal(h.writes[0].init.redirect, 'error'); assert.equal([...h.audits.values()][0].status, 'applied');
  assert.equal(h.reads.filter(read => read.url.includes('/getBids/')).length, 2);
  await assert.rejects(h.apply(preview.quote), { code: 'bidding_quote_consumed' }); assert.equal(h.writes.length, 1);
});
test('replayed quote remains consumed across a fresh handler instance', async () => {
  const h = await harness(), preview = await h.preview(); await h.apply(preview.quote);
  const restarted = h.create();
  await assert.rejects(h.run('apply', 'POST', { quote: preview.quote, confirmation: 'APPLY_BIDS' }, h.context, restarted), { code: 'bidding_quote_consumed' });
  assert.equal(h.writes.length, 1);
});
test('quote cannot cross actor, account, organization, credential revision or module', async () => {
  const h = await harness(), preview = await h.preview();
  const contexts = [{ ...h.context, actor: GROUP }, { ...h.context, org: GROUP }, { ...h.context, row: { ...h.context.row, id: GROUP } }, { ...h.context, row: { ...h.context.row, credential_version: GROUP } }];
  for (const context of contexts) await assert.rejects(h.run('apply', 'POST', { quote: preview.quote, confirmation: 'APPLY_BIDS' }, context));
  await assert.rejects(h.run('apply', 'POST', { quote: preview.quote, confirmation: 'APPLY_BIDS' }, h.context, h.create('oauth')));
  assert.equal(h.writes.length, 0);
});
test('expired or tampered quotes and changed live bids are blocked before reservation', async () => {
  const h = await harness(), preview = await h.preview();
  await assert.rejects(h.apply(preview.quote.slice(0, -8) + 'aaaaaaaa'), { code: 'invalid_quote' });
  const changed = provider(); changed.manual.bidPenny = 250; h.setProvider(changed);
  await assert.rejects(h.apply(preview.quote), { code: 'bidding_changed' });
  h.setProvider(provider()); h.setClock(NOW + 900001);
  await assert.rejects(h.apply(preview.quote), { code: 'bidding_quote_expired' });
  assert.equal(h.writes.length, 0); assert.equal(h.audits.size, 0);
});
test('fresh provider bound changes invalidate a formerly valid preview', async () => {
  const h = await harness(), preview = await h.preview(), changed = provider(); changed.manual.minBidPenny = 350; changed.manual.recBidPenny = 400; h.setProvider(changed);
  await assert.rejects(h.apply(preview.quote), { code: 'bid_out_of_bounds' }); assert.equal(h.writes.length, 0);
});
test('submit requires exact explicit confirmation and current scope guard', async () => {
  const h = await harness(), preview = await h.preview();
  await assert.rejects(h.run('apply', 'POST', { quote: preview.quote, confirmation: 'yes' }), { code: 'confirmation_required' });
  h.revoke(); await assert.rejects(h.apply(preview.quote), { code: 'account_changed' }); assert.equal(h.writes.length, 0);
});
test('no provider write occurs without durable begin reservation', async () => {
  const h = await harness({ beginFails: true }), preview = await h.preview();
  await assert.rejects(h.apply(preview.quote), { code: 'bidding_quote_consumed' }); assert.equal(h.writes.length, 0);
});
test('transport, server errors and malformed successful responses are uncertain and never retried', async () => {
  for (const options of [{ transportFailure: true }, { writeStatus: 500 }, { writeBody: '{"error":"secret"}' }, { writeBody: '<html>oops</html>' }, { writeBody: 'a'.repeat(17000) }]) {
    const h = await harness(options), preview = await h.preview(), result = await h.apply(preview.quote);
    assert.equal(result.status, 'unknown'); assert.equal(h.writes.length, 1); assert.equal([...h.audits.values()][0].status, 'unknown');
    await assert.rejects(h.apply(preview.quote)); assert.equal(h.writes.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /secret|html|private/);
  }
});
test('documented definite rejection is not presented as success and is not retried', async () => {
  for (const writeStatus of [400, 401, 403, 404, 422, 429]) { const h = await harness({ writeStatus }), preview = await h.preview(), result = await h.apply(preview.quote); assert.equal(result.status, 'rejected'); assert.equal(h.writes.length, 1); }
});
test('failed durable completion downgrades an acknowledged provider change to unknown', async () => {
  const h = await harness({ finishFails: true }), preview = await h.preview(), result = await h.apply(preview.quote);
  assert.equal(result.status, 'unknown'); assert.equal(result.error, 'bidding_audit_unconfirmed'); assert.equal(h.writes.length, 1);
});
test('read and write provider quotas fail closed', async () => {
  const h = await harness({ rateLimit: 'detail' }); await assert.rejects(h.preview(), { code: 'bidding_rate_limited' }); assert.equal(h.reads.length, 0);
  const second = await harness({ rateLimit: 'manual' }), preview = await second.preview(); await assert.rejects(second.apply(preview.quote), { code: 'bidding_rate_limited' }); assert.equal(second.writes.length, 0);
});
test('base and auto changes use their dedicated provider endpoints only', async () => {
  for (const [mode, path, fields] of [['base', 'remove', {}], ['auto', 'setAuto', { budget_type: '7d', budget_penny: 20000 }]]) {
    const h = await harness(), preview = await h.run('preview', 'POST', { item_id: '1234', mode, ...fields }), result = await h.apply(preview.quote);
    assert.equal(result.status, 'applied'); assert.equal(h.writes[0].url, 'https://api.avito.ru/cpxpromo/1/' + path);
    assert.equal(JSON.parse(h.writes[0].init.body).itemID, 1234);
  }
});
test('groups round-trip and revision conflicts preserve the latest server value', async () => {
  const h = await harness(), first = await h.run('groups'); assert.deepEqual(first, { ok: true, revision: 0, groups: [] });
  const groups = [{ id: GROUP, name: 'Тестовая группа', item_ids: ['1234', '5678'] }];
  const saved = await h.run('groups', 'POST', { organization_id: ORG, revision: 0, groups }); assert.equal(saved.revision, 1);
  await assert.rejects(h.run('groups', 'POST', { organization_id: ORG, revision: 0, groups: [] }), { code: 'bidding_groups_conflict' });
  assert.deepEqual((await h.run('groups')).groups, groups); assert.equal(h.writes.length, 0);
  const other = { ...h.context, org: GROUP }; assert.deepEqual((await h.run('groups', 'GET', {}, other)).groups, []);
});
test('group shape, duplicates, cross-field injection and volume are bounded', async () => {
  const { validateBiddingGroups } = await load(), entry = { id: GROUP, name: 'Группа', item_ids: ['1234'] };
  for (const value of [null, {}, [entry, entry], [{ ...entry, item_ids: ['1234', '1234'] }], [{ ...entry, item_ids: ['1e9'] }], [{ ...entry, extra: 'x' }], [{ ...entry, name: 'x'.repeat(81) }], [{ ...entry, item_ids: Array.from({ length: 201 }, (_, i) => String(i + 1)) }]]) assert.throws(() => validateBiddingGroups(value));
});

test('group appearance round-trips with strict safe metadata and automatic membership remains virtual', async () => {
  const h = await harness(), builtin = '00000000-0000-4000-8000-000000000001';
  const groups = [{ id: GROUP, name: 'Manual', item_ids: ['1234'], emoji: '🚀', color: '#54B8FF' }, { id: builtin, name: 'Контактные', item_ids: [], emoji: '☎️', color: '#35d0a1' }];
  const saved = await h.run('groups', 'POST', { organization_id: ORG, revision: 0, groups });
  assert.equal(saved.groups[0].color, '#54b8ff'); assert.equal(saved.groups[0].emoji, '🚀');
  assert.deepEqual((await h.run('groups')).groups, saved.groups);
  for (const entry of [{ ...groups[0], emoji: '' }, { ...groups[0], emoji: 'x'.repeat(13) }, { ...groups[0], emoji: '\n🚀' }, { ...groups[0], color: 'red' }, { ...groups[0], color: '#fff;display:none' }, { ...groups[1], name: 'Renamed' }, { ...groups[1], item_ids: ['1234'] }]) assert.throws(() => h.api.validateBiddingGroups([entry]), { code: 'invalid_bidding_groups' });
});

test('item statistics use bounded bulk available history, exact counters and no paid operations', async () => {
  const h = await harness(), list = await h.run('items'), value = list.items[0].statistics;
  assert.deepEqual([value.contacts, value.views, value.favorites], [2, 20, 3]);
  assert.deepEqual(value.period, { date_from: '2026-01-28', date_to: '2026-10-24', days: 270, kind: 'available_history' });
  assert.deepEqual(list.statistics_period, value.period);
  const request = h.reads.filter(read => read.url.includes('/stats/'));
  assert.equal(request.length, 1); assert.equal(request[0].url, 'https://api.avito.ru/stats/v1/accounts/123/items');
  assert.deepEqual(JSON.parse(request[0].init.body), { itemIds: [1234], dateFrom: '2026-01-28', dateTo: '2026-10-24', fields: ['uniqContacts', 'uniqViews', 'uniqFavorites'], periodGrouping: 'month' });
  assert.equal(h.writes.length, 0); assert.equal(h.audits.size, 0);
  assert.doesNotMatch(JSON.stringify(list), /test-token|private diagnostic|lifetime/);
});

test('monthly statistics sum only returned metrics, never infer missing values as zero', async () => {
  const { normalizeBiddingStatistics, biddingStatisticsPeriod } = await load(), period = biddingStatisticsPeriod(NOW);
  const normalize = stats => normalizeBiddingStatistics({ result: { items: [{ itemId: 1234, stats }] } }, ['1234'], period, NOW).get('1234');
  const summed = normalize([{ date: '2026-01-01', uniqContacts: 0, uniqViews: 10, uniqFavorites: 1 }, { date: '2026-02-01', uniqContacts: 2, uniqViews: 20 }]);
  assert.deepEqual([summed.contacts, summed.views, summed.favorites], [2, 30, null]);
  assert.deepEqual([normalize([]).contacts, normalize([]).views, normalize([]).favorites], [null, null, null]);
  assert.equal(normalize([{ date: '2026-10-01', uniqContacts: 0 }]).contacts, 0);
  assert.equal(normalizeBiddingStatistics({ result: { items: [] } }, ['1234'], period, NOW).size, 0);
  assert.equal(biddingStatisticsPeriod(Date.parse('2026-10-24T22:00:00Z')).date_to, '2026-10-25');
});

test('a full 99-ad page requests statistics once in bulk and keeps absent items unknown', async () => {
  const resources = Array.from({ length: 99 }, (_, index) => ({ id: 1234 + index, title: 'Ad ' + index, status: 'active', url: 'https://www.avito.ru/item_' + (1234 + index) }));
  const h = await harness({ itemResources: resources }), result = await h.run('items');
  const requests = h.reads.filter(read => read.url.includes('/stats/'));
  assert.equal(result.items.length, 99); assert.equal(result.next_offset, 99); assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].init.body).itemIds.length, 99);
  assert.equal(result.items[0].statistics.contacts, 2); assert.equal(result.items[1].statistics, null);
  assert.equal(result.items[1].statistics_error, 'bidding_statistics_missing');
  assert.equal(h.reads.some(read => read.url.includes('/getBids/')), false); assert.equal(h.writes.length, 0);
});

test('malformed or cross-account statistics cannot be accepted as item totals', async () => {
  const { normalizeBiddingStatistics, biddingStatisticsPeriod } = await load(), period = biddingStatisticsPeriod(NOW);
  const item = { itemId: 1234, stats: [{ date: '2026-10-01', uniqContacts: 2 }] };
  for (const response of [null, { result: { items: [item] }, errors: { '1234': 'forbidden' } }, { result: { items: [item, item] } }, { result: { items: [{ ...item, itemId: 9999 }] } }, { result: { items: [{ ...item, stats: [{ date: '2026-10-01', uniqContacts: -1 }] }] } }, { result: { items: [{ ...item, stats: [{ date: '2026-10-01', uniqContacts: '2' }] }] } }, { result: { items: [{ ...item, stats: [{ date: '2026-02-30', uniqContacts: 2 }] }] } }, { result: { items: [{ ...item, stats: [{ date: '2025-12-01', uniqContacts: 2 }] }] } }, { result: { items: [{ ...item, stats: [{ date: '2026-10-01', uniqContacts: Number.MAX_SAFE_INTEGER }, { date: '2026-09-01', uniqContacts: 1 }] }] } }]) assert.throws(() => normalizeBiddingStatistics(response, ['1234'], period, NOW));
});

test('statistics failure is nonblocking and stale successes survive throttled refresh failures', async () => {
  const options = {}, h = await harness(options);
  const first = await h.run('items');
  await h.run('items'); assert.equal(h.reads.filter(read => read.url.includes('/stats/')).length, 1);
  h.setClock(NOW + 60001); options.statisticsFail = true;
  const failed = await h.run('items');
  assert.equal(failed.items[0].promotion.bid_penny, 200); assert.equal(failed.items[0].statistics.contacts, 2);
  assert.equal(failed.items[0].statistics.stale, true); assert.equal(failed.items[0].statistics_error, 'bidding_statistics_unavailable');
  assert.equal(failed.items[0].statistics.fetched_at, first.items[0].statistics.fetched_at);
  await h.run('items'); assert.equal(h.reads.filter(read => read.url.includes('/stats/')).length, 2);
  const empty = await harness({ statisticsFail: true }), list = await empty.run('items');
  assert.equal(list.items[0].statistics, null); assert.equal(list.items[0].promotion.bid_penny, 200);
});

test('optional OAuth statistics scope does not block bids or request ungranted statistics', async () => {
  const h = await harness(), oauth = h.create('oauth');
  h.context.row.scopes = ['items:info', 'cpxpromo:read'];
  let list = await h.run('items', 'GET', {}, h.context, oauth);
  assert.equal(list.items[0].statistics_error, 'bidding_statistics_scope_required'); assert.equal(list.items[0].promotion.bid_penny, 200);
  assert.equal(h.reads.filter(read => read.url.includes('/stats/')).length, 0);
  h.context.row.scopes.push('stats:read'); list = await h.run('items', 'GET', {}, h.context, oauth);
  assert.equal(list.items[0].statistics.contacts, 2);
});

test('statistics caches are actor/account/organization/credential isolated and hits remain guarded', async () => {
  const h = await harness();
  await h.run('items');
  for (const selected of [{ ...h.context, actor: GROUP }, { ...h.context, org: GROUP }, { ...h.context, row: { ...h.context.row, id: GROUP } }, { ...h.context, row: { ...h.context.row, credential_version: GROUP } }]) await h.run('items', 'GET', {}, selected);
  assert.equal(h.reads.filter(read => read.url.includes('/stats/')).length, 5);
  h.revoke(); await assert.rejects(h.run('items'), { code: 'account_changed' });
});

test('simultaneous statistics reads coalesce and revocation during an in-flight read fails closed', async () => {
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const h = await harness({ onStatistics: async () => { began(); await wait; } });
  const first = h.run('items'), second = h.run('items'); await started;
  assert.equal(h.reads.filter(read => read.url.includes('/stats/')).length, 1);
  h.revoke(); release();
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'account_changed'));
});

test('appearance migration only replaces the guarded groups setter and preserves revision checks', () => {
  const sql = fs.readFileSync(require('node:path').join(__dirname, '../supabase/migrations/027_avito_bidding_group_appearance.sql'), 'utf8');
  assert.doesNotMatch(sql, /\b(?:drop|truncate|alter|trigger)\b/i);
  assert.match(sql, /create or replace function public\.avito_bidding_set_groups/);
  assert.match(sql, /public\.avito_bidding_account_version/); assert.match(sql, /coalesce\(current_revision,0\)<>p_expected_revision/);
  assert.match(sql, /key not in \('id','name','item_ids','emoji','color'\)/);
  assert.match(sql, /00000000-0000-4000-8000-000000000001/); assert.match(sql, /jsonb_array_length\(entry->'item_ids'\)<>0/);
  assert.match(sql, /from public,anon,authenticated/); assert.match(sql, /to service_role/); assert.match(sql, /set search_path=''/);
});
test('migration is additive, service-only, checks revisions/roles and persistently blocks unknown submissions', () => {
  const sql = fs.readFileSync(require('node:path').join(__dirname, '../supabase/migrations/026_avito_bidding.sql'), 'utf8');
  assert.match(sql, /^--[^\n]*\nbegin;/); assert.doesNotMatch(sql, /\b(?:drop|truncate|create or replace|trigger)\b/i);
  for (const table of ['groups', 'rate_limits', 'audit']) assert.match(sql, new RegExp('alter table public\\.avito_bidding_' + table + ' enable row level security'));
  assert.match(sql, /from public,anon,authenticated/); assert.match(sql, /to service_role/); assert.match(sql, /set search_path=''/);
  assert.match(sql, /role in \('owner','admin'\)/); assert.match(sql, /current_version<>p_credential_version/); assert.match(sql, /coalesce\(current_revision,0\)<>p_expected_revision/);
  assert.match(sql, /on conflict\(quote_id\) do nothing/); assert.match(sql, /status in \('submitting','unknown'\)/); assert.match(sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(sql, /\b(?:access_token|refresh_token|client_secret|encrypted_tokens)\b/);
});
