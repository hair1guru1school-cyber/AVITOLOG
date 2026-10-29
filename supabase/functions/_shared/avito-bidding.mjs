const API = 'https://api.avito.ru';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const QUOTE_TTL = 900000;
const CONTACTS_GROUP = '00000000-0000-4000-8000-000000000001';
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const money = value => integer(value) && value <= 100000000000;
const optionalMoney = value => value === undefined || value === null ? null : money(value) ? value : (() => { throw fail(502, 'bidding_invalid_response'); })();
function itemId(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,15}$/.test(text) || !Number.isSafeInteger(Number(text))) throw fail(400, 'invalid_item');
  return text;
}
const stable = value => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const base64 = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unbase64(value) { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw fail(400, 'invalid_quote'); return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0)); }
async function digest(value) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(stable(value))))); }
async function signingKey(secret) { return crypto.subtle.importKey('raw', encoder.encode('avito-bidding:v1:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function acknowledged(response) {
  if (Number(response.headers.get('content-length')) > 16384) { await response.body?.cancel().catch(() => {}); return false; }
  if (!response.body) return true;
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel().catch(() => {}); return false; }
      chunks.push(value);
    }
    if (!size) return true;
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    if (!text) return true;
    const value = JSON.parse(text);
    return object(value) && !Object.hasOwn(value, 'error') && !Object.hasOwn(value, 'code') && Object.keys(value).every(key => key === 'message') && (!Object.hasOwn(value, 'message') || typeof value.message === 'string');
  } finally { reader.releaseLock(); }
}
export function biddingRoute(path, prefix) {
  if (!path.startsWith(prefix + '/')) return null;
  const match = path.slice(prefix.length).match(/^\/([^/]+)\/bidding\/(items(?:\/([1-9][0-9]{0,15}))?|preview|apply|groups|jobs|queue-preview|queue-confirm|queue-cancel)$/);
  if (!match || !UUID.test(match[1])) return null;
  return { accountId: match[1], action: match[2].startsWith('items') ? match[3] ? 'detail' : 'items' : match[2], itemId: match[3] || null };
}
export function requireBiddingScope(row, action, oauth) {
  if (!row || row.status !== 'connected') throw fail(409, 'account_disconnected');
  if (!oauth) return;
  const needed = ['items:info', 'cpxpromo:read', ...(['preview','apply','queue-preview','queue-confirm'].includes(action) ? ['cpxpromo:edit'] : [])];
  if (!Array.isArray(row.scopes) || needed.some(scope => !row.scopes.includes(scope))) throw fail(403, 'bidding_scope_required');
}
function ladder(value) {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw fail(502, 'bidding_invalid_response');
  const seen = new Set();
  return value.map(entry => {
    if (!object(entry) || !money(entry.valuePenny) || !integer(entry.minForecast) || !integer(entry.maxForecast) || entry.maxForecast < entry.minForecast || !Number.isSafeInteger(entry.compare) || Math.abs(entry.compare) > 10000 || seen.has(entry.valuePenny)) throw fail(502, 'bidding_invalid_response');
    seen.add(entry.valuePenny);
    return { value_penny: entry.valuePenny, min_forecast: entry.minForecast, max_forecast: entry.maxForecast, compare: entry.compare };
  }).sort((a, b) => a.value_penny - b.value_penny);
}
function bounds(value, names) {
  if (names.some(name => !money(value[name]))) throw fail(502, 'bidding_invalid_response');
}
function budget(value) {
  if (!object(value)) throw fail(502, 'bidding_invalid_response');
  bounds(value, ['minLimitPenny', 'maxLimitPenny', 'recBudgetPenny']);
  if (value.maxLimitPenny < value.minLimitPenny || value.recBudgetPenny < value.minLimitPenny || value.recBudgetPenny > value.maxLimitPenny) throw fail(502, 'bidding_invalid_response');
  return { min_limit_penny: value.minLimitPenny, max_limit_penny: value.maxLimitPenny, recommended_budget_penny: value.recBudgetPenny, ladder: ladder(value.budgets) };
}
export function normalizeBidding(value, id, now = Date.now()) {
  if (!object(value) || !Number.isSafeInteger(value.actionTypeID) || value.actionTypeID <= 0 || typeof value.selectedType !== 'string' || Object.hasOwn(value, 'error')) throw fail(502, 'bidding_invalid_response');
  let manual = null, auto = null;
  const current = { mode: 'base', action_type_id: value.actionTypeID, bid_penny: null, limit_penny: null, budget_penny: null, budget_type: null };
  if (value.manual != null) {
    const m = value.manual;
    if (!object(m)) throw fail(502, 'bidding_invalid_response');
    bounds(m, ['minBidPenny', 'maxBidPenny', 'recBidPenny', 'minLimitPenny', 'maxLimitPenny']);
    if (m.maxBidPenny <= m.minBidPenny || m.recBidPenny < m.minBidPenny || m.recBidPenny > m.maxBidPenny || m.maxLimitPenny < m.minLimitPenny) throw fail(502, 'bidding_invalid_response');
    manual = { min_bid_penny: m.minBidPenny, max_bid_penny: m.maxBidPenny, recommended_bid_penny: m.recBidPenny, min_limit_penny: m.minLimitPenny, max_limit_penny: m.maxLimitPenny, ladder: ladder(m.bids) };
    const bid = optionalMoney(m.bidPenny), limit = optionalMoney(m.limitPenny);
    if (value.selectedType === 'manual' && bid !== null) Object.assign(current, { mode: 'manual', bid_penny: bid, limit_penny: limit });
  }
  if (value.auto != null) {
    const a = value.auto;
    if (!object(a)) throw fail(502, 'bidding_invalid_response');
    bounds(a, ['minBudgetPenny', 'maxBudgetPenny']);
    if (a.maxBudgetPenny < a.minBudgetPenny) throw fail(502, 'bidding_invalid_response');
    auto = { min_budget_penny: a.minBudgetPenny, max_budget_penny: a.maxBudgetPenny, daily: budget(a.dailyBudget), weekly: budget(a.weeklyBudget), monthly: budget(a.monthlyBudget) };
    const amount = optionalMoney(a.budgetPenny);
    if (a.budgetType != null && !['1d', '7d', '30d'].includes(a.budgetType)) throw fail(502, 'bidding_invalid_response');
    if (value.selectedType === 'auto') Object.assign(current, { mode: 'auto', budget_penny: amount, budget_type: a.budgetType ?? null });
  }
  if (!['manual', 'auto', 'base', ''].includes(value.selectedType) || !manual && !auto) throw fail(502, 'bidding_unavailable');
  return { item_id: itemId(id), action_type_id: value.actionTypeID, mode: current.mode, current, manual, auto, fetched_at: new Date(now).toISOString() };
}
export function biddingChange(body, detail) {
  const allowed = ['organization_id', 'item_id', 'mode', 'bid_penny', 'limit_penny', 'budget_penny', 'budget_type'];
  if (!object(body) || Object.keys(body).some(key => !allowed.includes(key)) || !['manual', 'auto', 'base'].includes(body.mode) || itemId(body.item_id) !== detail.item_id || ![1, 5, 7].includes(detail.action_type_id)) throw fail(400, 'invalid_bidding_change');
  const after = { mode: body.mode, action_type_id: detail.action_type_id, bid_penny: null, limit_penny: null, budget_penny: null, budget_type: null };
  if (body.mode === 'manual') {
    const m = detail.manual;
    if (!m || !money(body.bid_penny) || body.bid_penny <= m.min_bid_penny || body.bid_penny > m.max_bid_penny || body.budget_penny !== undefined || body.budget_type !== undefined) throw fail(400, 'bid_out_of_bounds');
    if (!money(body.limit_penny) || body.limit_penny < m.min_limit_penny || body.limit_penny > m.max_limit_penny || body.limit_penny <= 0) throw fail(400, 'daily_limit_required');
    Object.assign(after, { bid_penny: body.bid_penny, limit_penny: body.limit_penny });
  } else if (body.mode === 'auto') {
    const a = detail.auto, bucket = a && a[{ '1d': 'daily', '7d': 'weekly', '30d': 'monthly' }[body.budget_type]];
    if (!bucket || !money(body.budget_penny) || body.budget_penny <= 0 || body.budget_penny < Math.max(a.min_budget_penny, bucket.min_limit_penny) || body.budget_penny > Math.min(a.max_budget_penny, bucket.max_limit_penny) || body.bid_penny !== undefined || body.limit_penny !== undefined) throw fail(400, 'budget_out_of_bounds');
    Object.assign(after, { budget_penny: body.budget_penny, budget_type: body.budget_type });
  } else if (['bid_penny', 'limit_penny', 'budget_penny', 'budget_type'].some(key => body[key] !== undefined)) throw fail(400, 'invalid_bidding_change');
  return after;
}
export function validateBiddingGroups(groups) {
  if (!Array.isArray(groups) || groups.length > 50) throw fail(400, 'invalid_bidding_groups');
  if (groups.reduce((total, group) => total + (Array.isArray(group?.item_ids) ? group.item_ids.length : 0), 0) > 400) throw fail(400, 'invalid_bidding_groups');
  const seen = new Set();
  return groups.map(group => {
    if (!object(group) || Object.keys(group).some(key => !['id', 'item_ids', 'name', 'emoji', 'color'].includes(key)) || !UUID.test(group.id || '') || seen.has(group.id.toLowerCase()) || typeof group.name !== 'string' || !group.name.trim() || [...group.name.trim()].length > 80 || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(group.name) || !Array.isArray(group.item_ids) || group.item_ids.length > 200 || group.emoji !== undefined && (typeof group.emoji !== 'string' || !group.emoji.trim() || [...group.emoji.trim()].length > 12 || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(group.emoji)) || group.color !== undefined && (typeof group.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(group.color))) throw fail(400, 'invalid_bidding_groups');
    seen.add(group.id.toLowerCase());
    const ids = group.item_ids.map(itemId);
    if (new Set(ids).size !== ids.length) throw fail(400, 'invalid_bidding_groups');
    if (group.id.toLowerCase() === CONTACTS_GROUP && (group.name.trim() !== 'Контактные' || ids.length)) throw fail(400, 'invalid_bidding_groups');
    return { id: group.id.toLowerCase(), name: group.name.trim(), item_ids: ids, ...(group.emoji === undefined ? {} : { emoji: group.emoji.trim() }), ...(group.color === undefined ? {} : { color: group.color.toLowerCase() }) };
  });
}
export function biddingStatisticsPeriod(time = Date.now(), days = 270) {
  const dateTo = new Date(time + 10800000).toISOString().slice(0, 10);
  const dateFrom = new Date(Date.parse(dateTo + 'T00:00:00Z') - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { date_from: dateFrom, date_to: dateTo, days, kind: days === 30 ? 'last_30_days' : 'available_history' };
}
export function normalizeBiddingStatistics(value, ids, period, time = Date.now()) {
  if (!object(value) || !object(value.result) || !Array.isArray(value.result.items) || value.result.items.length > ids.length || value.errors != null && (!object(value.errors) || Object.keys(value.errors).length)) throw fail(502, 'bidding_statistics_unavailable');
  const requested = new Set(ids), found = new Map(), fields = { contacts: 'uniqContacts', views: 'uniqViews', favorites: 'uniqFavorites' };
  for (const entry of value.result.items) {
    const id = itemId(entry?.itemId);
    if (!requested.has(id) || found.has(id) || !Array.isArray(entry.stats) || entry.stats.length > (period.days === 30 ? 30 : 10)) throw fail(502, 'bidding_statistics_unavailable');
    const daily = [];
    const totals = { contacts: 0, views: 0, favorites: 0 }, present = { contacts: !!entry.stats.length, views: !!entry.stats.length, favorites: !!entry.stats.length }, dates = new Set();
    for (const row of entry.stats) {
      if (!object(row) || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date + 'T00:00:00Z')) || new Date(row.date + 'T00:00:00Z').toISOString().slice(0, 10) !== row.date || row.date < (period.days === 30 ? period.date_from : period.date_from.slice(0, 7) + '-01') || row.date > period.date_to || dates.has(row.date)) throw fail(502, 'bidding_statistics_unavailable');
      dates.add(row.date);
      for (const [key, field] of Object.entries(fields)) {
        if (!Object.hasOwn(row, field)) { present[key] = false; continue; }
        if (!integer(row[field]) || !Number.isSafeInteger(totals[key] + row[field])) throw fail(502, 'bidding_statistics_unavailable');
        totals[key] += row[field];
      }
      if (period.days === 30) daily.push({ date: row.date, ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, Object.hasOwn(row, field) ? row[field] : null])) });
    }
    found.set(id, { ...Object.fromEntries(Object.keys(fields).map(key => [key, present[key] ? totals[key] : null])), period, fetched_at: new Date(time).toISOString(), ...(period.days === 30 ? { days: daily.sort((a, b) => a.date.localeCompare(b.date)), today: daily.find(day => day.date === period.date_to) || null } : {}) });
  }
  return found;
}
export function createBiddingStore(service) {
  const one = result => Array.isArray(result) ? result[0] : result;
  return {
    queue: (name, payload) => service('rpc/avito_bid_' + name, 'POST', payload),
    reserve: payload => service('rpc/avito_bidding_reserve', 'POST', payload),
    begin: payload => service('rpc/avito_bidding_begin', 'POST', payload),
    finish: payload => service('rpc/avito_bidding_finish', 'POST', payload),
    async getGroups(module, org, account) { return one(await service('avito_bidding_groups?select=groups,revision&module=eq.' + module + '&organization_id=eq.' + org + '&account_id=eq.' + account + '&limit=1')); },
    async setGroups(payload) { return one(await service('rpc/avito_bidding_set_groups', 'POST', payload)); }
  };
}
export function createAvitoBidding({ requestJson, fetch: fetchImpl = globalThis.fetch, now = Date.now, signingSecret, store, module }) {
  const statisticsCache = new Map(), statisticsPending = new Map();
  async function reserve(context, kind) {
    if (!store?.reserve || await store.reserve({ p_module: module, p_organization_id: context.org, p_account_id: context.row.id, p_actor_id: context.actor, p_kind: kind }) !== true) throw fail(429, 'bidding_rate_limited');
  }
  const auth = token => ({ Authorization: 'Bearer ' + token });
  async function statistics(context, items, period) {
    await context.guard();
    if (module === 'oauth' && !context.row.scopes?.includes('stats:read')) return { values: new Map(), error: 'bidding_statistics_scope_required' };
    const ids = items.map(item => item.item_id).sort(), key = JSON.stringify([module, context.org, context.row.id, context.actor, context.row.credential_version, context.row.avito_user_id, period.date_from, period.date_to, ids]);
    const saved = statisticsCache.get(key);
    if (saved && saved.expires > now()) return saved.result;
    if (statisticsPending.has(key)) { const result = await statisticsPending.get(key); await context.guard(); return result; }
    const work = (async () => {
      let result;
      try {
        const value = await requestJson(API + '/stats/v1/accounts/' + itemId(context.row.avito_user_id) + '/items', { method: 'POST', headers: { ...auth(context.token), 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds: ids.map(Number), dateFrom: period.date_from, dateTo: period.date_to, fields: ['uniqContacts', 'uniqViews', 'uniqFavorites'], periodGrouping: period.days === 30 ? 'day' : 'month' }) }, 'bidding_statistics_unavailable', 524288, 8000);
        result = { values: normalizeBiddingStatistics(value, ids, period, now()), error: null };
      } catch (_) {
        result = { values: new Map(Array.from(saved?.result.values || [], ([id, value]) => [id, { ...value, stale: true }])), error: 'bidding_statistics_unavailable' };
      }
      await context.guard();
      statisticsCache.delete(key);
      statisticsCache.set(key, { result, expires: now() + (result.error ? 5000 : 60000) });
      while (statisticsCache.size > 100) statisticsCache.delete(statisticsCache.keys().next().value);
      return result;
    })();
    statisticsPending.set(key, work);
    try { return await work; } finally { if (statisticsPending.get(key) === work) statisticsPending.delete(key); }
  }
  async function own(context, id) {
    const value = await requestJson(API + '/core/v1/accounts/' + itemId(context.row.avito_user_id) + '/items/' + itemId(id) + '/', { headers: auth(context.token) }, 'bidding_item_unavailable', 65536);
    if (!object(value) || value.status !== 'active' || Object.hasOwn(value, 'error')) throw fail(409, 'bidding_item_not_active');
  }
  async function detail(context, id) {
    await reserve(context, 'detail'); await context.guard(); await own(context, id);
    const value = await requestJson(API + '/cpxpromo/1/getBids/' + itemId(id), { headers: auth(context.token) }, 'bidding_unavailable', 524288);
    await context.guard();
    return normalizeBidding(value, id, now());
  }
  async function sign(payload) {
    const text = base64(encoder.encode(JSON.stringify(payload)));
    return text + '.' + base64(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(signingSecret), encoder.encode(text))));
  }
  async function decode(quote, context) {
    if (typeof quote !== 'string' || quote.length > 8192 || quote.split('.').length !== 2) throw fail(400, 'invalid_quote');
    try {
      const [text, signature] = quote.split('.');
      if (!await crypto.subtle.verify('HMAC', await signingKey(signingSecret), unbase64(signature), encoder.encode(text))) throw fail(400, 'invalid_quote');
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unbase64(text)));
      if (!object(value) || value.v !== 1 || value.module !== module || value.org !== context.org || value.account !== context.row.id || value.actor !== context.actor || value.version !== String(context.row.credential_version) || !UUID.test(value.id || '') || !Number.isSafeInteger(value.expires) || value.expires <= now() || value.expires > now() + QUOTE_TTL || !Number.isSafeInteger(value.issued) || value.issued > now() || value.expires - value.issued !== QUOTE_TTL) throw fail(409, 'bidding_quote_expired');
      itemId(value.item); return value;
    } catch (error) { throw error.code ? error : fail(400, 'invalid_quote'); }
  }
  async function list(context, url) {
    const limitText = url.searchParams.get('limit') || '99', offsetText = url.searchParams.get('offset') || '0';
    if (!/^\d{1,6}$/.test(limitText) || !/^\d{1,7}$/.test(offsetText)) throw fail(400, 'invalid_pagination');
    const limit = Math.min(Number(limitText), 99), offset = Number(offsetText);
    if (limit < 1 || offset % limit !== 0 || offset > 100000) throw fail(400, 'invalid_pagination');
    await reserve(context, 'list'); await context.guard();
    const page = offset / limit + 1, response = await requestJson(API + '/core/v1/items?page=' + page + '&per_page=' + limit + '&status=active', { headers: auth(context.token) }, 'bidding_items_unavailable', 262144);
    if (!object(response) || !Array.isArray(response.resources) || response.resources.length > limit || response.meta?.page !== page || response.meta?.per_page !== limit) throw fail(502, 'bidding_invalid_response');
    const seen = new Set(), items = response.resources.map(value => {
      const id = itemId(value?.id);
      if (!object(value) || value.status !== 'active' || seen.has(id)) throw fail(502, 'bidding_invalid_response');
      seen.add(id);
      let url = null;
      try { const parsed = new URL(value.url); if (parsed.protocol === 'https:' && /(^|\.)avito\.ru$/.test(parsed.hostname) && !parsed.username && !parsed.password) url = parsed.href; } catch (_) { /* Untrusted provider links are omitted. */ }
      return { item_id: id, title: typeof value.title === 'string' ? value.title.slice(0, 300) : '', url, status: 'active', promotion: null };
    });
    const requestedDays = url.searchParams.get('statistics_days');
    if (requestedDays != null && !['30', '270'].includes(requestedDays)) throw fail(400, 'invalid_statistics_period');
    const statisticsPeriod = biddingStatisticsPeriod(now(), requestedDays === '30' ? 30 : 270);
    if (items.length) await Promise.all([
      (async () => { try {
        const promotions = await requestJson(API + '/cpxpromo/1/getPromotionsByItemIds', { method: 'POST', headers: { ...auth(context.token), 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIDs: items.map(item => Number(item.item_id)) }) }, 'bidding_promotions_unavailable', 262144);
        if (!object(promotions) || !Array.isArray(promotions.items) || promotions.items.length > items.length) throw fail(502, 'bidding_invalid_response');
        const unique = new Set();
        for (const value of promotions.items) {
          const id = itemId(value?.itemID), item = items.find(item => item.item_id === id);
          if (!item || unique.has(id) || !Number.isSafeInteger(value.actionTypeID) || value.actionTypeID <= 0 || value.manualPromotion != null && value.autoPromotion != null) throw fail(502, 'bidding_invalid_response');
          unique.add(id);
          const manual = value.manualPromotion, auto = value.autoPromotion;
          if (manual != null && (!object(manual) || !money(manual.bidPenny)) || auto != null && (!object(auto) || !money(auto.budgetPenny) || !['1d', '7d', '30d'].includes(auto.budgetType))) throw fail(502, 'bidding_invalid_response');
          item.promotion = { mode: manual ? 'manual' : auto ? 'auto' : 'base', action_type_id: value.actionTypeID, bid_penny: manual ? manual.bidPenny : null, limit_penny: manual ? optionalMoney(manual.limitPenny) : null, budget_penny: auto ? auto.budgetPenny : null, budget_type: auto ? auto.budgetType : null };
        }
      } catch (error) { for (const item of items) { item.promotion = null; item.promotion_error = error.code || 'bidding_promotions_unavailable'; } } })(),
      (async () => {
        const result = await statistics(context, items, statisticsPeriod);
        for (const item of items) {
          item.statistics = result.values.get(item.item_id) || null;
          if (result.error || !item.statistics) item.statistics_error = result.error || 'bidding_statistics_missing';
        }
      })()
    ]);
    await context.guard();
    return { ok: true, items, statistics_period: statisticsPeriod, next_offset: items.length === limit ? offset + limit : null, fetched_at: new Date(now()).toISOString() };
  }
  async function preview(context, body) {
    const id = itemId(body.item_id), value = await detail(context, id), after = biddingChange(body, value);
    const issued = now(), payload = { v: 1, id: crypto.randomUUID(), module, org: context.org, account: context.row.id, actor: context.actor, version: String(context.row.credential_version), item: id, issued, expires: issued + QUOTE_TTL, before: value.current, after, fingerprint: await digest(value.current) };
    await context.guard();
    return { ok: true, item_id: id, quote: await sign(payload), expires_at: new Date(payload.expires).toISOString(), before: value.current, after };
  }
  async function apply(context, body) {
    if (!object(body) || Object.keys(body).some(key => !['organization_id', 'quote', 'confirmation'].includes(key)) || body.confirmation !== 'APPLY_BIDS') throw fail(400, 'confirmation_required');
    const quote = await decode(body.quote, context);
    if (quote.kind) throw fail(400, 'invalid_quote');
    const current = await detail(context, quote.item);
    if (await digest(current.current) !== quote.fingerprint) throw fail(409, 'bidding_changed');
    const change = { item_id: quote.item, mode: quote.after.mode };
    if (quote.after.mode === 'manual') Object.assign(change, { bid_penny: quote.after.bid_penny, limit_penny: quote.after.limit_penny });
    if (quote.after.mode === 'auto') Object.assign(change, { budget_penny: quote.after.budget_penny, budget_type: quote.after.budget_type });
    if (stable(biddingChange(change, current)) !== stable(quote.after)) throw fail(409, 'bidding_changed');
    await context.guard();
    await reserve(context, quote.after.mode);
    const started = await store.begin({ p_quote_id: quote.id, p_module: module, p_organization_id: context.org, p_account_id: context.row.id, p_actor_id: context.actor, p_credential_version: quote.version, p_item_id: quote.item, p_before: quote.before, p_after: quote.after, p_expires_at: new Date(quote.expires).toISOString() });
    if (started !== true) throw fail(409, 'bidding_quote_consumed');
    let status = 'unknown', error = null, submitted = false;
    try {
      await context.guard();
      const after = quote.after, payload = { itemID: Number(quote.item) };
      let path = '/cpxpromo/1/remove';
      if (after.mode === 'manual') { path = '/cpxpromo/1/setManual'; Object.assign(payload, { actionTypeID: after.action_type_id, bidPenny: after.bid_penny, limitPenny: after.limit_penny }); }
      if (after.mode === 'auto') { path = '/cpxpromo/1/setAuto'; Object.assign(payload, { actionTypeID: after.action_type_id, budgetPenny: after.budget_penny, budgetType: after.budget_type }); }
      // Financial submissions are deliberately single-shot. Transport and 5xx failures are uncertain, never retried.
      submitted = true;
      const response = await fetchImpl(API + path, { method: 'POST', headers: { ...auth(context.token), 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (response.status === 200) { status = await acknowledged(response) ? 'applied' : 'unknown'; if (status === 'unknown') error = 'bidding_result_unknown'; }
      else { status = [400, 401, 403, 404, 422, 429].includes(response.status) ? 'rejected' : 'unknown'; error = response.status === 429 ? 'bidding_rate_limited' : 'bidding_provider_rejected'; await response.body?.cancel().catch(() => {}); }
    } catch (cause) { status = submitted ? 'unknown' : 'rejected'; error = submitted ? 'bidding_result_unknown' : cause.code || 'account_changed'; }
    try { if (await store.finish({ p_quote_id: quote.id, p_actor_id: context.actor, p_status: status, p_error: error }) !== true) throw new Error(); }
    catch (_) { status = 'unknown'; error = 'bidding_audit_unconfirmed'; }
    return { ok: true, status, item_id: quote.item, ...(error ? { error } : {}) };
  }
  async function queue(context, action, body) {
    const scope = { p_module: module, p_org: context.org, p_account: context.row.id, p_actor: context.actor };
    await context.guard();
    if (action === 'jobs') return { ok: true, jobs: await store.queue('list', scope) };
    if (action === 'queue-cancel') {
      if (!object(body) || Object.keys(body).some(k => !['organization_id','job_id'].includes(k)) || !UUID.test(body.job_id || '')) throw fail(400, 'invalid_request');
      return { ok: true, job: await store.queue('cancel', { ...scope, p_id: body.job_id }) };
    }
    if (action === 'queue-preview') {
      if (!object(body) || Object.keys(body).some(k => !['organization_id','item_ids','change'].includes(k)) || !Array.isArray(body.item_ids) || body.item_ids.length < 1 || body.item_ids.length > 10000 || !object(body.change)) throw fail(400, 'invalid_queue');
      const ids = body.item_ids.map(itemId);
      if (new Set(ids).size !== ids.length) throw fail(400, 'invalid_queue');
      const value = await detail(context, ids[0]), after = biddingChange({ ...body.change, item_id: ids[0] }, value);
      if (after.mode === 'manual' && after.bid_penny > 35000) throw fail(400, 'bid_out_of_bounds');
      const issued = now(), payload = { v: 1, kind: 'queue', id: crypto.randomUUID(), module, org: context.org, account: context.row.id, actor: context.actor, version: String(context.row.credential_version), item: ids[0], after, count: ids.length, issued, expires: issued + QUOTE_TTL };
      await context.guard();
      if (await store.queue('draft', { ...scope, p_id: payload.id, p_version: payload.version, p_intent: after, p_ids: ids, p_expires: new Date(payload.expires).toISOString() }) !== true) throw fail(503, 'storage_unavailable');
      return { ok: true, job_id: payload.id, quote: await sign(payload), after, count: ids.length, expires_at: new Date(payload.expires).toISOString() };
    }
    if (!object(body) || Object.keys(body).some(k => !['organization_id','quote','confirmation'].includes(k)) || body.confirmation !== 'QUEUE_BIDS') throw fail(400, 'confirmation_required');
    const quote = await decode(body.quote, context);
    if (quote.kind !== 'queue') throw fail(400, 'invalid_quote');
    return { ok: true, job: await store.queue('confirm', { ...scope, p_id: quote.id, p_version: quote.version, p_intent: quote.after }) };
  }
  async function groups(context, body, method) {
    if (method === 'GET') {
      const record = await store.getGroups(module, context.org, context.row.id);
      await context.guard();
      if (!record) return { ok: true, revision: 0, groups: [] };
      if (!integer(record.revision)) throw fail(503, 'storage_unavailable');
      return { ok: true, revision: record.revision, groups: validateBiddingGroups(record.groups) };
    }
    if (Object.keys(body).sort().join(',') !== 'groups,organization_id,revision' || !integer(body.revision)) throw fail(400, 'invalid_bidding_groups');
    const value = validateBiddingGroups(body.groups);
    await context.guard();
    const saved = await store.setGroups({ p_module: module, p_organization_id: context.org, p_account_id: context.row.id, p_actor_id: context.actor, p_expected_revision: body.revision, p_groups: value });
    if (!saved || !integer(saved.revision) || saved.revision !== body.revision + 1) throw fail(409, 'bidding_groups_conflict');
    await context.guard();
    return { ok: true, revision: saved.revision, groups: validateBiddingGroups(saved.groups) };
  }
  return { async handle({ context, route, url, method, body }) {
    if (method === 'GET' && route.action === 'jobs' || method === 'POST' && ['queue-preview','queue-confirm','queue-cancel'].includes(route.action)) return queue(context, route.action, body);
    if (method === 'GET' && route.action === 'items') return list(context, url);
    if (method === 'GET' && route.action === 'detail') return { ok: true, bidding: await detail(context, route.itemId) };
    if (method === 'POST' && route.action === 'preview') return preview(context, body);
    if (method === 'POST' && route.action === 'apply') return apply(context, body);
    if (['GET', 'POST'].includes(method) && route.action === 'groups') return groups(context, body, method);
    throw fail(405, 'method_not_allowed');
  } };
}
