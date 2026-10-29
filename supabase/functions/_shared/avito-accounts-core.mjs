import { createTariffPaymentReader } from './avito-tariff-payment.mjs';
import { createAccountMetricCache, retainAccountMetricFields } from './avito-metric-cache.mjs';
import { createAvitoMessenger, messengerRoute, messengerPagination, messengerBody, requireMessengerScope } from './avito-messenger.mjs';
import { createAvitoBidding, createBiddingStore, biddingRoute, requireBiddingScope } from './avito-bidding.mjs';
import { registerBidWorker } from './avito-bid-worker.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const API = '/api/integrations/avito-accounts';
const META = 'id,organization_id,avito_user_id,display_name,status,token_expires_at,credential_version,created_at,updated_at';
const encoder = new TextEncoder();
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const PROVIDER_READ_ENDPOINTS = new Map([['profile_unavailable', 'profile'], ['balance_unavailable', 'balance'], ['advance_unavailable', 'advance'], ['statistics_unavailable', 'statistics'], ['listings_unavailable', 'listings'], ['tariff_unavailable', 'tariff']]);
const PROVIDER_ERROR_NAMES = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'TimeoutError', 'AbortError', 'Http', 'UnexpectedEof', 'ConnectionReset', 'ConnectionAborted', 'BrokenPipe', 'TimedOut', 'BadResource']);
const PROVIDER_RESPONSE_REASONS = new Set(['transport_error', 'timeout', 'http_error', 'content_length', 'body_size', 'body_read_before_data', 'body_read_after_data', 'invalid_utf8', 'empty_body', 'invalid_json', 'invalid_response']);
export function createProviderReadDiagnostic(module, code, logger, now = Date.now) {
  const endpoint = PROVIDER_READ_ENDPOINTS.get(code);
  if (!endpoint || typeof logger !== 'function') return null;
  const started = now();
  let phase = 'fetch', status = null, bytes = 0, encoding = 'none', contentType = 'absent', observed;
  return {
    response(response) {
      status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      const encoded = (response.headers.get('content-encoding') || '').trim().toLowerCase();
      encoding = !encoded || encoded === 'identity' ? 'none' : ['gzip', 'br', 'deflate'].includes(encoded) ? encoded : 'other';
      const type = response.headers.get('content-type') || '';
      contentType = !type ? 'absent' : /^application\/(?:[a-z0-9.+-]+\+)?json\b/i.test(type) ? 'json' : /^text\/html\b/i.test(type) ? 'html' : 'other';
    },
    phase(value) { if (['fetch', 'body', 'json', 'schema'].includes(value)) phase = value; },
    bytes(value) { if (Number.isSafeInteger(value) && value >= 0) bytes = Math.min(value, 1073741824); },
    observe(error) { observed = error; },
    failure(error, reason) {
      const name = (observed || error)?.name;
      const elapsed = now() - started;
      const record = { module: ['personal', 'oauth'].includes(module) ? module : 'unknown', endpoint, phase,
        http_status: status, error_class: PROVIDER_ERROR_NAMES.has(name) ? name : 'other',
        response_reason: PROVIDER_RESPONSE_REASONS.has(reason) ? reason : 'invalid_response',
        elapsed_ms: Number.isFinite(elapsed) ? Math.min(300000, Math.max(0, Math.floor(elapsed / 100) * 100)) : 0,
        bytes_received: bytes, encoding, content_type: contentType };
      try { logger(record); } catch (_) { /* Diagnostics must not change the provider result. */ }
    }
  };
}
export async function readAccountMetadataPages(readPage, organizationId) {
  const rows = [], seen = new Set(), pageSize = 100;
  for (let page = 0; page < 100; page++) {
    const batch = await readPage(page * pageSize, pageSize);
    if (!Array.isArray(batch) || batch.length > pageSize) throw fail(503, 'storage_unavailable');
    for (const row of batch) {
      if (!row || !UUID.test(String(row.id || '')) || String(row.organization_id || '').toLowerCase() !== organizationId.toLowerCase() || seen.has(String(row.id).toLowerCase())) throw fail(503, 'storage_unavailable');
      seen.add(String(row.id).toLowerCase());
      rows.push(row);
    }
    if (batch.length < pageSize) return rows;
  }
  // A bounded read failure is preferable to silently hiding later accounts.
  throw fail(503, 'storage_unavailable');
}
export async function readAccountListingSummary(readPage) {
  const seen = new Set(), pageSize = 99;
  for (let page = 1; page <= 20; page++) {
    const value = await readPage(page, pageSize, 'active');
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.hasOwn(value, 'error') || Object.hasOwn(value, 'code') ||
        !Array.isArray(value.resources) || value.resources.length > pageSize || !value.meta ||
        value.meta.page !== page || value.meta.per_page !== pageSize) throw fail(502, 'listings_unavailable');
    for (const item of value.resources) {
      const id = typeof item?.id === 'number' && Number.isSafeInteger(item.id) ? String(item.id) : item?.id;
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof id !== 'string' || !/^[1-9][0-9]{0,24}$/.test(id) ||
          item.status !== 'active' || seen.has(id)) throw fail(502, 'listings_unavailable');
      seen.add(id);
    }
    if (value.resources.length < pageSize) return { available: true, active: seen.size, visibility: 'status_only' };
  }
  // Never present a bounded, incomplete scan as an exact account total.
  throw fail(502, 'listings_unavailable');
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
const base64 = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
function unbase64(value) {
  return Uint8Array.from(atob(String(value || '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
}
function keyBytes(value) {
  const text = String(value || '').trim();
  const bytes = /^[a-f0-9]{64}$/i.test(text) ? Uint8Array.from(text.match(/../g), byte => parseInt(byte, 16)) : unbase64(text);
  if (bytes.length !== 32) throw new Error('Invalid encryption key');
  return bytes;
}
async function cryptoKey(value) { return crypto.subtle.importKey('raw', keyBytes(value), 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function encryptAccountSecrets(payload, key, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, await cryptoKey(key), encoder.encode(JSON.stringify(payload))));
  return { v: 1, iv: base64(iv), ciphertext: base64(encrypted) };
}
export async function decryptAccountSecrets(box, key, aad, maximum = 32768) {
  if (!box || box.v !== 1) throw new Error('Invalid encrypted account');
  const iv = unbase64(box.iv), ciphertext = unbase64(box.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 17 || ciphertext.length > maximum) throw new Error('Invalid encrypted account');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, await cryptoKey(key), ciphertext)));
}
async function equalSecret(left, right) {
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const a = await digest(left), b = await digest(right);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < a.length; index++) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}
async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function signAccountRelayRequest({ timestamp, method, path, body = '', authorization = '' }, relaySecret) {
  const data = timestamp + '\n' + method + '\n' + path + '\n' + await sha256Hex(body) + '\n' + authorization;
  const key = await crypto.subtle.importKey('raw', encoder.encode(relaySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
}
export function getAccountsConfig(env = {}) {
  const read = name => String(typeof env.get === 'function' ? env.get(name) || '' : env[name] || '').trim();
  const cfg = {
    enabled: read('AVITO_ACCOUNTS_ENABLED') === '1', origin: read('AVITO_PUBLIC_ORIGIN') || 'https://avitoboss.online',
    encryptionKey: read('AVITO_TOKEN_ENCRYPTION_KEY'), relaySecret: read('AVITO_RELAY_SECRET'),
    supabaseUrl: read('SUPABASE_URL').replace(/\/+$/, ''), anonKey: read('SUPABASE_ANON_KEY'), serviceKey: read('SUPABASE_SERVICE_ROLE_KEY'), missing: []
  };
  if (!cfg.enabled) cfg.missing.push('AVITO_ACCOUNTS_ENABLED');
  for (const [field, name] of [['relaySecret', 'AVITO_RELAY_SECRET'], ['supabaseUrl', 'SUPABASE_URL'], ['anonKey', 'SUPABASE_ANON_KEY'], ['serviceKey', 'SUPABASE_SERVICE_ROLE_KEY']]) if (!cfg[field]) cfg.missing.push(name);
  try { keyBytes(cfg.encryptionKey); } catch (_) { cfg.missing.push('AVITO_TOKEN_ENCRYPTION_KEY'); }
  try {
    const origin = new URL(cfg.origin), backend = new URL(cfg.supabaseUrl);
    if (origin.protocol !== 'https:' || origin.origin !== cfg.origin || origin.username || origin.password) throw new Error('Invalid origin');
    if (backend.protocol !== 'https:' || backend.origin !== cfg.supabaseUrl || backend.username || backend.password) throw new Error('Invalid backend');
  } catch (_) { cfg.missing.push('AVITO_PUBLIC_ORIGIN_OR_SUPABASE_URL'); }
  cfg.ready = cfg.missing.length === 0;
  return cfg;
}
async function boundedText(response, maximum, code, diagnostic) {
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel().catch(() => {});
    throw Object.assign(fail(502, code), { responseReason: 'content_length' });
  }
  if (!response.body) return '';
  const reader = response.body.getReader(), bytes = new Uint8Array(maximum);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      diagnostic?.bytes(length + value.byteLength);
      if (value.byteLength > maximum - length) { await reader.cancel().catch(() => {}); throw Object.assign(fail(502, code), { responseReason: 'body_size' }); }
      bytes.set(value, length); length += value.byteLength;
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)); }
    catch (_) { throw Object.assign(fail(502, code), { responseReason: 'invalid_utf8' }); }
  } catch (error) { diagnostic?.observe(error); throw error.responseReason ? error : Object.assign(fail(502, code), { responseReason: ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : length ? 'body_read_after_data' : 'body_read_before_data' }); }
  finally { reader.releaseLock(); }
}
function parseBody(text) {
  try {
    const value = JSON.parse(text || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
    return value;
  } catch (_) { throw fail(400, 'invalid_request'); }
}
function credentials(body) {
  const client_id = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  const client_secret = typeof body.client_secret === 'string' ? body.client_secret.trim() : '';
  if (!/^[A-Za-z0-9_-]{4,256}$/.test(client_id) || !/^[\x21-\x7e]{4,1024}$/.test(client_secret)) throw fail(400, 'credentials_required');
  return { client_id, client_secret };
}
function displayName(value) {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value)) throw fail(400, 'display_name_required');
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > 200 || !/[\p{L}\p{N}\p{P}\p{S}]/u.test(name)) throw fail(400, 'display_name_required');
  return name;
}
function safePreference(row) {
  return { avito_user_id: row.avito_user_id, display_name: row.display_name, updated_at: row.updated_at };
}
const LAYOUT_GROUPS = new Set(['', 'construction', 'furniture', 'special', 'materials', 'online', 'equipment', 'auto', 'avitolog', 'fences', 'houses', 'other']);
const layoutId = value => typeof value === 'string' && /^[0-9]{1,25}$/.test(value);
function accountLayout(value) {
  const object = item => item && typeof item === 'object' && !Array.isArray(item);
  if (!object(value) || Object.keys(value).sort().join(',') !== 'accounts,order' || !Array.isArray(value.order) ||
      value.order.length > 200 || !object(value.accounts) || Object.keys(value.accounts).length > 200 ||
      value.order.some(id => !layoutId(id)) || new Set(value.order).size !== value.order.length) throw fail(400, 'invalid_layout');
  const accounts = {};
  for (const [id, item] of Object.entries(value.accounts)) {
    if (!layoutId(id) || !object(item) || Object.keys(item).sort().join(',') !== 'deleted,group,hidden' ||
        !LAYOUT_GROUPS.has(item.group) || typeof item.hidden !== 'boolean' || typeof item.deleted !== 'boolean') throw fail(400, 'invalid_layout');
    accounts[id] = { group: item.group, hidden: item.hidden, deleted: item.deleted };
  }
  return { order: value.order.slice(), accounts };
}
function safeLayout(row) {
  if (!row) return { layout: { order: [], accounts: {} }, revision: 0 };
  try {
    if (!Number.isSafeInteger(row.revision) || row.revision < 0) throw new Error('Invalid revision');
    return { layout: accountLayout(row.layout), revision: row.revision };
  } catch (_) { throw fail(503, 'storage_unavailable'); }
}
function accountId(value) {
  const id = typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === 'string' ? value : '';
  if (!/^[1-9][0-9]{0,24}$/.test(id)) throw fail(502, 'profile_unavailable');
  return id;
}
function safeProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(502, 'profile_unavailable');
  const profile = { id: accountId(value.id), name: typeof value.name === 'string' ? value.name.slice(0, 200) : '' };
  if (typeof value.profile_url === 'string' && value.profile_url.length < 2048) {
    try {
      const url = new URL(value.profile_url);
      if (url.protocol === 'https:' && (url.hostname === 'avito.ru' || url.hostname.endsWith('.avito.ru')) && !url.username && !url.password) profile.profile_url = url.toString();
    } catch (_) { /* Invalid provider links are omitted. */ }
  }
  return profile;
}
function safeAccount(row, now) {
  return {
    id: row.id, avito_user_id: row.avito_user_id, display_name: row.display_name || '', status: row.status,
    credential_version: typeof row.credential_version === 'string' && UUID.test(row.credential_version) ? row.credential_version : null,
    token_expires_at: row.token_expires_at, created_at: row.created_at, updated_at: row.updated_at,
    token_state: row.status === 'disconnected' ? 'disconnected' : Date.parse(row.token_expires_at) > now ? 'valid' : 'expired'
  };
}
const aadFor = (org, id) => 'avito-personal:1:' + org + ':' + id;
const METRICS_TTL = 60000;
const METRICS_CACHE_LIMIT = 200;
const MOSCOW_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
function metricDate(time) {
  const parts = Object.fromEntries(MOSCOW_DATE.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
const STATISTICS_METRICS = ['views', 'contacts', 'contactsShowPhone', 'contactsMessenger', 'favorites', 'spending'];
const emptyMetrics = () => ({ views: null, contacts: null, contactsShowPhone: null, contactsMessenger: null, favorites: null, spending: null });
export function accountStatisticsRange(date) {
  const end = Date.parse(date + 'T00:00:00Z');
  const dates = Array.from({ length: 30 }, (_, index) => new Date(end - (29 - index) * 86400000).toISOString().slice(0, 10));
  return { dateFrom: dates[0], dateTo: date, dates };
}
export function unavailableAccountHistory(date, error) {
  const { dateFrom, dateTo, dates } = accountStatisticsRange(date);
  return { available: false, dateFrom, dateTo, timezone: 'Europe/Moscow', days: dates.map(day => ({ date: day, ...emptyMetrics() })), totals: emptyMetrics(), error };
}
function unavailableOverview(date, error, retryAt) {
  return {
    advance: { available: false, balance: null, currency: 'RUB', error },
    listings: { available: false, active: null, visibility: 'status_only', error },
    tariff: { available: false, scope: 'transport_non_cpa', error },
    today: { available: false, date, timezone: 'Europe/Moscow', ...emptyMetrics(), error },
    history: unavailableAccountHistory(date, error),
    fetched_at: null, retry_at: retryAt, cached: false
  };
}
function metricError(error) {
  return error.code === 'permission_denied' ? 'permission_denied' : error.code === 'try_later' ? 'rate_limited' : error.code === 'storage_unavailable' ? 'storage_unavailable' : 'provider_unavailable';
}
function metricFailure(value) {
  return !value || typeof value !== 'object' || Array.isArray(value) || Object.hasOwn(value, 'error') || Object.hasOwn(value, 'code') || value.result?.error !== undefined || value.result?.status === false;
}
export function safeAccountTariff(value, time) {
  const current = value && value.current;
  if (metricFailure(value) || !current || typeof current !== 'object' || Array.isArray(current) ||
      typeof current.level !== 'string' || !current.level.trim() || typeof current.isActive !== 'boolean') throw fail(502, 'tariff_unavailable');
  const closes = current.closeTime;
  if (closes != null && (!Number.isSafeInteger(closes) || closes < 0 || closes > 8640000000000)) throw fail(502, 'tariff_unavailable');
  return {
    available: true, scope: 'transport_non_cpa', name: [...current.level.trim()].slice(0, 200).join(''), active: current.isActive,
    ends_at: closes == null ? null : new Date(closes * 1000).toISOString(),
    days_remaining: closes == null ? null : Math.max(0, Math.ceil((closes * 1000 - time) / 86400000))
  };
}
const STATISTICS_REASONS = new Set(['http_error', 'transport_error', 'invalid_json', 'empty_totals', 'unexpected_group_type', 'invalid_metric', 'invalid_response', 'invalid_date', 'duplicate_date', 'incomplete_response']);
function statisticsDiagnostic(error) {
  const diagnostic = {
    http_status: Number.isInteger(error.providerStatus) && error.providerStatus >= 100 && error.providerStatus <= 599 ? error.providerStatus : null,
    reason: STATISTICS_REASONS.has(error.statisticsReason) ? error.statisticsReason : 'invalid_response'
  };
  if (error.statisticsShape) diagnostic.shape = Object.fromEntries(Object.entries(error.statisticsShape).filter(([, value]) => typeof value === 'boolean' || typeof value === 'number' && Number.isSafeInteger(value) && value >= 0));
  return diagnostic;
}
export function safeAccountStatistics(value, date) {
  const result = value && value.result, groupings = result && result.groupings;
  const shape = { has_result: Boolean(result && typeof result === 'object' && !Array.isArray(result)), has_groupings: Array.isArray(groupings) };
  if (Array.isArray(groupings)) shape.grouping_count = groupings.length;
  if (Number.isSafeInteger(result?.dataTotalCount) && result.dataTotalCount >= 0) shape.total_count = result.dataTotalCount;
  const reject = reason => { throw Object.assign(fail(502, 'statistics_unavailable'), { providerStatus: 200, statisticsReason: reason, statisticsShape: shape }); };
  if (metricFailure(value) || !shape.has_result || !shape.has_groupings ||
      (result.dataTotalCount !== undefined && (!Number.isSafeInteger(result.dataTotalCount) || result.dataTotalCount < 0))) reject('invalid_response');
  const object = item => item && typeof item === 'object' && !Array.isArray(item);
  const completePage = page => {
    if (['hasMore', 'has_more'].some(key => Object.hasOwn(page, key) && page[key] !== false) ||
        ['nextCursor', 'next_cursor', 'next'].some(key => Object.hasOwn(page, key) && page[key] !== null && page[key] !== '')) reject('incomplete_response');
    if (page.offset !== undefined && page.offset !== 0 || page.limit !== undefined && (!Number.isSafeInteger(page.limit) || page.limit < groupings.length)) reject('incomplete_response');
  };
  completePage(value); completePage(result);
  if (result.pagination !== undefined) {
    if (!object(result.pagination)) reject('invalid_response');
    completePage(result.pagination);
    if (result.pagination.total !== undefined && result.pagination.total !== groupings.length) reject('incomplete_response');
  }
  if (groupings.length === 0) reject('empty_totals');
  if (groupings.length > 30 || groupings.some(group => !object(group))) reject('invalid_response');
  const first = groupings[0];
  shape.has_group_type = first.type !== undefined;
  shape.group_is_dates = first.type === 'dates';
  shape.group_is_totals = first.type === 'totals';
  shape.group_is_total = first.type === 'total';
  shape.group_is_item = first.type === 'item';
  const parseMetrics = group => {
    if (!Array.isArray(group.metrics) || group.metrics.length > 100) reject('invalid_response');
    const metrics = emptyMetrics(), seen = new Set();
    for (const metric of group.metrics) {
      if (!object(metric) || typeof metric.slug !== 'string') reject('invalid_metric');
      if (!STATISTICS_METRICS.includes(metric.slug)) continue;
      if (seen.has(metric.slug) || !Number.isFinite(metric.value) || metric.value < 0 || metric.value > Number.MAX_SAFE_INTEGER) reject('invalid_metric');
      seen.add(metric.slug); metrics[metric.slug] = metric.value;
    }
    return { metrics, count: seen.size };
  };
  const inRubles = metrics => ({ ...metrics, spending: metrics.spending === null ? null : metrics.spending / 100 });
  const today = { available: false, date, timezone: 'Europe/Moscow', ...emptyMetrics(), error: 'statistics_unavailable' };
  const timestamp = typeof result.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/.test(result.timestamp) ? result.timestamp : null;
  const setToday = metrics => {
    Object.assign(today, { available: true }, inRubles(metrics));
    delete today.error;
    if (timestamp) today.provider_updated_at = timestamp;
  };
  // Undated totals may cover the entire requested range, not today's activity.
  if (groupings.some(group => group.type !== 'dates')) reject('unexpected_group_type');
  if (result.dataTotalCount !== groupings.length) reject('incomplete_response');
  const { dateFrom, dateTo, dates } = accountStatisticsRange(date), byDate = new Map();
  let metricCount = 0;
  for (const group of groupings) {
    if (!Number.isSafeInteger(group.id) || group.id <= 0 || group.id >= 4102444800) reject('invalid_date');
    const day = metricDate(group.id * 1000);
    if (day < dateFrom || day > dateTo) reject('invalid_date');
    if (byDate.has(day)) reject('duplicate_date');
    const parsed = parseMetrics(group);
    byDate.set(day, parsed.metrics); metricCount += parsed.count;
    if (day === date && parsed.count) setToday(parsed.metrics);
  }
  if (!metricCount) reject('empty_totals');
  const totals = emptyMetrics();
  for (const slug of STATISTICS_METRICS) {
    if (dates.every(day => byDate.get(day)?.[slug] !== null && byDate.get(day)?.[slug] !== undefined)) {
      const total = dates.reduce((sum, day) => sum + byDate.get(day)[slug], 0);
      if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) reject('invalid_metric');
      totals[slug] = total;
    }
  }
  const days = dates.map(day => ({ date: day, ...inRubles(byDate.get(day) || emptyMetrics()) }));
  return { today, history: { available: true, dateFrom, dateTo, timezone: 'Europe/Moscow', days, totals: inRubles(totals) } };
}
async function transportKey(relaySecret) {
  return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('avito-accounts-transport:v1:' + relaySecret))));
}
export async function sealAccountRequest(payload, relaySecret, path) {
  const box = await encryptAccountSecrets(payload, await transportKey(relaySecret), 'POST:' + path);
  const encrypted = unbase64(box.ciphertext);
  return { sealed: { v: 1, iv: box.iv, tag: base64(encrypted.slice(-16)), ciphertext: base64(encrypted.slice(0, -16)) } };
}
async function readSealedBody(rawBody, path, relaySecret) {
  const outer = parseBody(rawBody), box = outer.sealed;
  if (Object.keys(outer).length !== 1 || !box || box.v !== 1 || typeof box.tag !== 'string') throw fail(400, 'invalid_request');
  try {
    const maximum = /\/bidding\/queue-preview$/.test(path) ? 262144 : path === API + '/layout' ? 65536 : biddingRoute(path, API + '/accounts')?.action === 'groups' ? 18000 : 16384;
    const tag = unbase64(box.tag), ciphertext = unbase64(box.ciphertext);
    if (tag.length !== 16 || ciphertext.length > maximum) throw new Error('Invalid sealed request');
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext); combined.set(tag, ciphertext.length);
    const body = await decryptAccountSecrets({ v: 1, iv: box.iv, ciphertext: base64(combined) }, await transportKey(relaySecret), 'POST:' + path, maximum + 16);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body;
  } catch (_) { throw fail(400, 'invalid_request'); }
}

export function createAvitoAccountsHandler(options = {}) {
  const cfg = getAccountsConfig(options.env || {}), fetchImpl = options.fetch || globalThis.fetch, now = options.now || Date.now;
  const providerLogger = typeof options.providerLogger === 'function' ? options.providerLogger : record => console.warn('avito_provider_read_failure', JSON.stringify(record));
  const metricCache = new Map(), metricRequests = new Map();
  const tariffPaymentReader = createTariffPaymentReader(now);
  async function requestJson(url, init, code, maximum = 131072, timeout = 15000, validate) {
    let response;
    const diagnostic = createProviderReadDiagnostic('personal', code, providerLogger, now);
    const messengerResponse = ['chat_unavailable', 'messages_unavailable', 'send_unknown', 'read_unavailable'].includes(code);
    const signal = AbortSignal.timeout(timeout);
    try { response = await fetchImpl(url, { ...init, redirect: 'error', signal }); }
    catch (error) { diagnostic?.failure(error, signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'transport_error'); throw Object.assign(fail(502, code), code === 'statistics_unavailable' ? { statisticsReason: 'transport_error' } : {}, messengerResponse ? { messengerReason: signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'transport_error' } : {}); }
    diagnostic?.response(response);
    const responseError = (status, errorCode) => Object.assign(fail(status, errorCode), { providerStatus: response.status }, code === 'statistics_unavailable' ? { statisticsReason: 'http_error' } : {}, messengerResponse ? { messengerReason: 'http_error' } : {});
    if (!response.ok) {
      diagnostic?.failure(fail(502, code), 'http_error');
      if (code === 'storage_unavailable') {
        try {
          const value = JSON.parse(await boundedText(response, 16384, code));
          if (value.code === '54000') throw fail(403, 'account_limit');
          if (['40001', '23505'].includes(value.code)) throw fail(409, 'account_changed');
          if (value.code === '42501') throw fail(403, 'permission_denied');
          if (value.code === 'P0002') throw fail(404, 'account_not_found');
        } catch (error) { if (['account_limit', 'account_changed', 'permission_denied', 'account_not_found'].includes(error.code)) throw error; }
      }
      await response.body?.cancel().catch(() => {});
      if (response.status === 429) throw responseError(429, 'try_later');
      if ([401, 403].includes(response.status)) {
        if (code === 'authentication_required') throw fail(response.status, code);
        if (code === 'storage_unavailable') throw fail(503, code);
        throw responseError(403, code === 'credentials_rejected' ? code : 'permission_denied');
      }
      throw responseError(502, code);
    }
    const contentType = response.headers.get('content-type') || '';
    if (messengerResponse && contentType && !/^application\/(?:[a-z0-9.+-]+\+)?json\b/i.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(fail(502, code), { providerStatus: response.status, messengerReason: 'content_type' });
    }
    let raw;
    try {
      diagnostic?.phase('body');
      raw = await boundedText(response, maximum, code, diagnostic);
      diagnostic?.phase('json');
      const value = JSON.parse(raw);
      if (!validate) return value;
      diagnostic?.phase('schema');
      return validate(value);
    }
    catch (error) {
      diagnostic?.failure(error, signal.aborted ? 'timeout' : error.responseReason || (raw === '' ? 'empty_body' : error instanceof SyntaxError ? 'invalid_json' : 'invalid_response'));
      const safe = error.code ? error : fail(502, code);
      if (code === 'statistics_unavailable') Object.assign(safe, { providerStatus: response.status, statisticsReason: error.statisticsReason || (error instanceof SyntaxError ? 'invalid_json' : 'invalid_response') });
      if (messengerResponse) {
        Object.assign(safe, { providerStatus: response.status, messengerReason: signal.aborted ? 'timeout' : error.responseReason || (raw === '' ? 'empty_body' : error instanceof SyntaxError ? 'invalid_json' : 'invalid_response') });
      }
      throw safe;
    }
  }
  async function serviceRequest(route, method = 'GET', body, timeout = 15000, maximum = 131072) {
    return requestJson(cfg.supabaseUrl + '/rest/v1/' + route, {
      method, headers: { apikey: cfg.serviceKey, Authorization: 'Bearer ' + cfg.serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }, 'storage_unavailable', maximum, timeout);
  }
  async function userRequest(route, authorization) {
    return requestJson(cfg.supabaseUrl + '/rest/v1/' + route, { headers: { apikey: cfg.anonKey, Authorization: authorization } }, 'permission_denied');
  }
  const store = options.store || {
    async health() {
      for (const table of ['avito_personal_accounts', 'avito_personal_account_secrets', 'avito_account_rate_limits', 'avito_account_preferences', 'avito_account_layouts', 'avito_account_metric_cache']) await serviceRequest(table + '?select=*&limit=0');
      return true;
    },
    async listPreferences(org) {
      return serviceRequest('avito_account_preferences?select=avito_user_id,display_name,updated_at&organization_id=eq.' + org + '&order=avito_user_id&limit=200');
    },
    async setPreference(payload) {
      const rows = await serviceRequest('rpc/avito_accounts_set_preference', 'POST', payload);
      return rows && rows[0] || null;
    },
    async getLayout(org) {
      const rows = await serviceRequest('avito_account_layouts?select=layout,revision&organization_id=eq.' + org + '&limit=1');
      if (!Array.isArray(rows)) throw fail(503, 'storage_unavailable');
      return rows[0] || null;
    },
    async setLayout(payload) {
      try {
        const rows = await serviceRequest('rpc/avito_accounts_set_layout', 'POST', payload);
        return rows && rows[0] || null;
      } catch (error) {
        if (error.code === 'account_changed') throw fail(409, 'layout_conflict');
        throw error;
      }
    },
    async listAccounts(org, authorization) {
      return readAccountMetadataPages((offset, limit) => userRequest('avito_personal_accounts?select=' + META + '&organization_id=eq.' + org + '&order=created_at.desc,id.desc&limit=' + limit + '&offset=' + offset, authorization), org);
    },
    async getAccount(org, id, authorization) {
      const rows = await userRequest('avito_personal_accounts?select=' + META + '&organization_id=eq.' + org + '&id=eq.' + id + '&limit=1', authorization);
      return rows && rows[0] || null;
    },
    async findAccount(org, userId) {
      const rows = await serviceRequest('avito_personal_accounts?select=' + META + '&organization_id=eq.' + org + '&avito_user_id=eq.' + userId + '&limit=1');
      return rows && rows[0] || null;
    },
    async reserve(org, actor, action, id = null) {
      return serviceRequest('rpc/avito_accounts_reserve_request', 'POST', { p_organization_id: org, p_actor_id: actor, p_action: action, p_account_id: id });
    },
    async getMetricCache(module, org, id, timeout) {
      const rows = await serviceRequest('avito_account_metric_cache?select=module,organization_id,account_id,credential_version,metric_date,snapshot_started_at,expires_at,overview&module=eq.' + module + '&organization_id=eq.' + org + '&account_id=eq.' + id + '&limit=1', 'GET', undefined, timeout);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async listMetricCache(org, ids, date, timeout) {
      if (!UUID.test(org) || !Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(ids).size !== ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(503, 'storage_unavailable');
      return serviceRequest('avito_account_metric_cache?select=module,organization_id,account_id,credential_version,metric_date,snapshot_started_at,expires_at,overview&module=eq.personal&organization_id=eq.' + org + '&metric_date=eq.' + date + '&account_id=in.(' + ids.join(',') + ')&limit=' + ids.length, 'GET', undefined, Math.max(1, Math.min(2500, timeout)), 2097152);
    },
    async putMetricCache(payload) { return serviceRequest('rpc/avito_metric_cache_put', 'POST', payload, 1500); },
    async save(payload) { return serviceRequest('rpc/avito_accounts_save', 'POST', payload); },
    async getSecrets(org, id) {
      const rows = await serviceRequest('avito_personal_account_secrets?select=encrypted_payload,credential_version&organization_id=eq.' + org + '&account_id=eq.' + id + '&limit=1');
      return rows && rows[0] || null;
    },
    async updateToken(payload) { return serviceRequest('rpc/avito_accounts_update_token', 'POST', payload); },
    async disconnect(org, id, actor) { return serviceRequest('rpc/avito_accounts_disconnect', 'POST', { p_organization_id: org, p_account_id: id, p_actor_id: actor }); }
  };
  const sharedMetrics = createAccountMetricCache({ store, module: 'personal', now, sleep: options.metricCacheSleep });
  async function initialCachedOverviews(org, rows, maximum) {
    if (typeof store.listMetricCache !== 'function' || maximum < 2) return [];
    const date = metricDate(now()), deadline = Date.now() + 2500, result = [];
    const eligible = rows.filter(row => row.organization_id === org && row.status === 'connected' && UUID.test(row.id || '') && typeof row.credential_version === 'string' && UUID.test(row.credential_version));
    let size = 2;
    for (let offset = 0; offset < eligible.length; offset += 100) {
      const batch = eligible.slice(offset, offset + 100), ids = batch.map(row => row.id), remaining = deadline - Date.now();
      if (remaining <= 0) break;
      let timer, saved;
      try {
        saved = await Promise.race([
          Promise.resolve().then(() => store.listMetricCache(org, ids, date, remaining)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(fail(503, 'storage_unavailable')), remaining); })
        ]);
      } catch (_) { continue; }
      finally { clearTimeout(timer); }
      if (!Array.isArray(saved) || saved.length > batch.length) continue;
      const records = new Map(), duplicate = new Set(), allowed = new Set(ids);
      for (const record of saved) {
        if (!record || !allowed.has(record.account_id)) continue;
        if (records.has(record.account_id)) { records.delete(record.account_id); duplicate.add(record.account_id); }
        else if (!duplicate.has(record.account_id)) records.set(record.account_id, record);
      }
      const cacheReader = createAccountMetricCache({ module: 'personal', now, store: {
        getMetricCache: async (_module, _org, id) => records.get(id), putMetricCache: async () => false
      } });
      for (const row of batch) {
        const known = await cacheReader.read(org, row, date);
        const fetched = Date.parse(known?.value.fetched_at || '');
        if (!known || known.snapshotStartedAt > now() || !Number.isFinite(fetched) || fetched > now() || metricDate(fetched) !== date) continue;
        const { history: _history, ...overview } = known.value;
        overview.cached = true;
        const expired = known.expiresAt <= now();
        if (expired) overview.stale = true;
        for (const field of ['today', 'advance', 'listings', 'tariff']) {
          if (overview[field]?.available === true && (expired || overview[field].stale === true)) overview[field] = { ...overview[field], stale: true, fetched_at: overview.fetched_at };
        }
        const item = { account_id: row.id, credential_version: row.credential_version, overview };
        const added = encoder.encode(JSON.stringify(item)).length + (result.length ? 1 : 0);
        if (size + added > maximum) return result;
        result.push(item); size += added;
      }
    }
    return result;
  }
  const messenger = createAvitoMessenger({ requestJson, now, module: 'personal', logger: typeof options.messengerLogger === 'function' ? options.messengerLogger : record => console.warn('avito_messenger_failure', JSON.stringify(record)) });
  const bidding = createAvitoBidding({ requestJson, fetch: fetchImpl, now, signingSecret: cfg.encryptionKey, module: 'personal', store: options.biddingStore || createBiddingStore(serviceRequest) });
  registerBidWorker(options.biddingWorkerRegistry, 'personal', { service: serviceRequest, activeToken, bidding, scope: requireBiddingScope, getRow: async (org, id) => (await serviceRequest('avito_personal_accounts?select=' + META + '&organization_id=eq.' + org + '&id=eq.' + id + '&limit=1'))?.[0] });
  function ready() { if (!cfg.ready) throw fail(503, 'configuration'); }
  async function authenticate(request, org) {
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw fail(401, 'authentication_required');
    if (!cfg.supabaseUrl || !cfg.anonKey) throw fail(503, 'configuration');
    const user = await requestJson(cfg.supabaseUrl + '/auth/v1/user', { headers: { apikey: cfg.anonKey, Authorization: authorization } }, 'authentication_required');
    if (!user || !UUID.test(user.id || '')) throw fail(401, 'authentication_required');
    if (!org) return { user, authorization };
    const members = await userRequest('organization_members?select=role&organization_id=eq.' + org + '&user_id=eq.' + user.id + '&limit=1', authorization);
    const member = Array.isArray(members) ? members[0] : null;
    if (!member || !['owner', 'admin'].includes(member.role)) throw fail(403, 'permission_denied');
    return { user, authorization, role: member.role };
  }
  function organization(body, url) {
    const org = String(body.organization_id || url.searchParams.get('organization_id') || '');
    if (!UUID.test(org)) throw fail(400, 'organization_required');
    return org;
  }
  async function reserve(org, actor, action, id) {
    const allowed = await store.reserve(org, actor, action, id);
    if (allowed !== true) throw fail(allowed === false ? 429 : 503, allowed === false ? 'try_later' : 'storage_unavailable');
  }
  async function tokenFor(keys) {
    const result = await requestJson('https://api.avito.ru/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', ...keys }).toString() }, 'credentials_rejected', 16384);
    const expires = Number(result && result.expires_in);
    if (!result || typeof result.access_token !== 'string' || !result.access_token || result.access_token.length > 8192 || /[\x00-\x20\x7f]/.test(result.access_token) || !Number.isFinite(expires) || expires < 30 || expires > 366 * 86400) throw fail(502, 'credentials_rejected');
    return { access_token: result.access_token, expires_at: new Date(now() + expires * 1000).toISOString() };
  }
  async function profileFor(token) { return requestJson('https://api.avito.ru/core/v1/accounts/self', { headers: { Authorization: 'Bearer ' + token } }, 'profile_unavailable', 16384, 15000, safeProfile); }
  async function getAccount(org, id, auth) {
    const row = await store.getAccount(org, id, auth.authorization);
    if (!row) throw fail(404, 'account_not_found');
    return row;
  }
  async function saveCredentials(body, org, auth, selected) {
    const keys = credentials(body);
    const expectedId = body.expected_avito_user_id;
    if (expectedId !== undefined && (typeof expectedId !== 'string' || !/^[0-9]{1,25}$/.test(expectedId))) throw fail(400, 'invalid_request');
    await reserve(org, auth.user.id, 'exchange');
    const token = await tokenFor(keys), profile = await profileFor(token.access_token);
    if (expectedId !== undefined && expectedId !== profile.id) throw fail(409, 'account_mismatch');
    if (selected && selected.avito_user_id !== profile.id) throw fail(409, 'account_mismatch');
    const existing = selected || await store.findAccount(org, profile.id);
    if (!selected && existing && existing.status === 'disconnected') throw fail(409, 'account_disconnected');
    const id = existing && existing.id || crypto.randomUUID(), version = crypto.randomUUID();
    const name = typeof body.display_name === 'string' && body.display_name.trim() ? body.display_name.trim().slice(0, 200) : existing && existing.display_name || profile.name;
    const box = await encryptAccountSecrets({ ...keys, access_token: token.access_token }, cfg.encryptionKey, aadFor(org, id));
    await store.save({ p_organization_id: org, p_account_id: id, p_actor_id: auth.user.id, p_avito_user_id: profile.id, p_display_name: name, p_token_expires_at: token.expires_at, p_encrypted_payload: box, p_credential_version: version, p_expected_version: existing && existing.credential_version || null });
    const saved = await getAccount(org, id, auth);
    return { ok: true, account: safeAccount(saved, now()) };
  }
  async function activeToken(row, org, auth, forceRenew = false) {
    if (row.status !== 'connected') throw fail(409, 'account_disconnected');
    const secret = await store.getSecrets(org, row.id);
    if (!secret || secret.credential_version !== row.credential_version) throw fail(409, 'account_changed');
    let payload;
    try { payload = await decryptAccountSecrets(secret.encrypted_payload, cfg.encryptionKey, aadFor(org, row.id)); }
    catch (_) { throw fail(503, 'storage_unavailable'); }
    const keys = credentials(payload);
    if (typeof payload.access_token !== 'string' || !payload.access_token || payload.access_token.length > 8192 || /[\x00-\x20\x7f]/.test(payload.access_token)) throw fail(503, 'storage_unavailable');
    if (!forceRenew && Date.parse(row.token_expires_at) > now() + 60000) return payload.access_token;
    await reserve(org, auth.user.id, 'renew', row.id);
    const token = await tokenFor(keys), profile = await profileFor(token.access_token);
    if (profile.id !== row.avito_user_id) throw fail(409, 'account_mismatch');
    const nextVersion = crypto.randomUUID();
    const changed = await store.updateToken({ p_organization_id: org, p_account_id: row.id, p_actor_id: auth.user.id, p_expected_version: row.credential_version, p_credential_version: nextVersion, p_token_expires_at: token.expires_at, p_encrypted_payload: await encryptAccountSecrets({ ...keys, access_token: token.access_token }, cfg.encryptionKey, aadFor(org, row.id)) });
    if (changed !== true) throw fail(409, 'account_changed');
    row.token_expires_at = token.expires_at;
    row.credential_version = nextVersion;
    return token.access_token;
  }
  async function overview(row, org, auth, token, statisticsOnly = false) {
    const date = metricDate(now()), baseKey = org + ':' + row.id + ':' + row.credential_version + ':' + date;
    const project = value => {
      if (!statisticsOnly) return value;
      const { today, history, fetched_at, retry_at, cached, stale, error } = value;
      return { today, history, fetched_at, retry_at, cached, stale, error };
    };
    const key = baseKey;
    const cached = metricCache.get(key), fullBatch = !statisticsOnly || sharedMetrics.enabled;
    const fresh = cached && cached.expiresAt > now();
    if (fresh && (statisticsOnly || cached.complete)) return project({ ...cached.value, cached: true });
    if (metricRequests.has(key)) {
      const pending = metricRequests.get(key), value = await pending.promise;
      if (!statisticsOnly && !pending.complete && !value.stale && metricCache.get(key)?.expiresAt > now()) return overview(row, org, auth, token);
      return project({ ...value, cached: Boolean(value.fetched_at) || value.cached });
    }
    if (metricRequests.size >= METRICS_CACHE_LIMIT) return unavailableOverview(date, 'rate_limited', new Date(now() + METRICS_TTL).toISOString());
    const load = async () => {
      let previous = cached;
      const shared = await sharedMetrics.read(org, row, date);
      if (shared && (!previous || shared.snapshotStartedAt > (previous.snapshotStartedAt || 0))) previous = { ...shared, complete: true };
      if (shared && shared.expiresAt > now()) {
        if (!metricCache.has(key) && metricCache.size >= METRICS_CACHE_LIMIT) metricCache.delete(metricCache.keys().next().value);
        metricCache.set(key, { ...shared, complete: true });
        return { ...shared.value, cached: true };
      }
      const started = now(), retryAt = new Date(started + METRICS_TTL).toISOString();
      // A fresh ADS result already owns this minute's metrics reservation.
      if (!fresh) {
        try { await reserve(org, auth.user.id, 'metrics', row.id); }
        catch (error) {
          const code = metricError(error);
          const refreshed = code === 'rate_limited' ? await sharedMetrics.wait(org, row, date) : null;
          if (refreshed) {
            if (!metricCache.has(key) && metricCache.size >= METRICS_CACHE_LIMIT) metricCache.delete(metricCache.keys().next().value);
            metricCache.set(key, { ...refreshed, complete: true });
            return { ...refreshed.value, cached: true };
          }
          const unavailable = unavailableOverview(date, code, retryAt);
          return previous ? { ...unavailable, ...previous.value, cached: true, stale: true, error: code, retry_at: retryAt } : unavailable;
        }
      }
      const base = unavailableOverview(date, 'provider_unavailable', retryAt);
      const advanceRequest = async () => {
        try {
          return await requestJson('https://api.avito.ru/cpa/v3/balanceInfo', {
            method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Source': 'AVITOBOSS' }, body: '{}'
          }, 'advance_unavailable', 16384, 8000, value => {
            if (metricFailure(value) || !Number.isSafeInteger(value.balance)) throw fail(502, 'advance_unavailable');
            return { available: true, balance: value.balance / 100, currency: 'RUB' };
          });
        } catch (error) { return { ...base.advance, error: metricError(error) }; }
      };
      const statisticsRequest = async () => {
        try {
          const { dateFrom, dateTo } = accountStatisticsRange(date);
          return await requestJson('https://api.avito.ru/stats/v2/accounts/' + row.avito_user_id + '/items', {
            method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateFrom, dateTo, metrics: STATISTICS_METRICS, grouping: 'day', limit: 1000, offset: 0 })
          }, 'statistics_unavailable', 131072, 8000, value => safeAccountStatistics(value, date));
        } catch (error) {
          const failure = { error: metricError(error), diagnostic: statisticsDiagnostic(error) };
          return { today: { ...base.today, ...failure }, history: { ...base.history, ...failure } };
        }
      };
      const listingsRequest = async () => {
        const started = now();
        try {
          return await readAccountListingSummary(async (page, perPage, status) => {
            const remaining = 8000 - (now() - started);
            if (remaining <= 0) throw fail(502, 'listings_unavailable');
            const query = new URLSearchParams({ page: String(page), per_page: String(perPage), status });
            return requestJson('https://api.avito.ru/core/v1/items?' + query, { headers: { Authorization: 'Bearer ' + token } }, 'listings_unavailable', 262144, remaining);
          });
        } catch (error) { return { ...base.listings, error: metricError(error) }; }
      };
      const tariffRequest = async () => {
        try {
          // Avito documents this endpoint only for non-CPA transport tariffs and personal keys.
          return await requestJson('https://api.avito.ru/tariff/info/1', {
            method: 'GET', headers: { Authorization: 'Bearer ' + token }
          }, 'tariff_unavailable', 16384, 4000, value => safeAccountTariff(value, now()));
        } catch (error) { return { ...base.tariff, error: metricError(error) }; }
      };
      const statisticsRequestOnce = () => fresh ? Promise.resolve(cached.value) : statisticsRequest();
      const values = !fullBatch ? [null, await statisticsRequestOnce(), null, null] : await Promise.all([advanceRequest(), statisticsRequestOnce(), listingsRequest(), tariffRequest()]);
      const [advance, statistics, listings, tariff] = values;
      const { today, history } = statistics;
      let value = { today, history, fetched_at: fresh ? cached.value.fetched_at : new Date(now()).toISOString(), retry_at: fresh ? cached.value.retry_at : retryAt, cached: false };
      if (fullBatch) Object.assign(value, { advance, listings, tariff });
      value = retainAccountMetricFields(value, previous?.value);
      if (fullBatch) await sharedMetrics.write(org, row, date, started, value);
      if (!metricCache.has(key) && metricCache.size >= METRICS_CACHE_LIMIT) metricCache.delete(metricCache.keys().next().value);
      // Cache only safe metrics, partitioned by organization, key generation and Moscow date.
      metricCache.set(key, { value, complete: fullBatch, snapshotStartedAt: started, expiresAt: fresh ? cached.expiresAt : started + METRICS_TTL });
      return value;
    };
    const pending = load();
    const request = { promise: pending, complete: fullBatch };
    metricRequests.set(key, request);
    try { return project(await pending); } finally { if (metricRequests.get(key) === request) metricRequests.delete(key); }
  }
  async function paymentDetails(row, org, auth) {
    await reserve(org, auth.user.id, 'read');
    const token = await activeToken(row, org, auth), profile = await profileFor(token);
    if (profile.id !== row.avito_user_id) throw fail(409, 'account_mismatch');
    const key = org + ':' + row.id + ':' + row.credential_version + ':' + metricDate(now());
    const value = await tariffPaymentReader(key, (body, limits) => requestJson('https://api.avito.ru/core/v1/accounts/operations_history/', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }, 'tariff_payment_unavailable', limits.maximum, limits.timeout));
    const current = await getAccount(org, row.id, auth);
    if (current.status !== 'connected') throw fail(409, 'account_disconnected');
    if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
    return { ok: true, account: safeAccount(current, now()), tariff_payment: value };
  }
  async function details(row, org, auth, statisticsOnly = false) {
    await reserve(org, auth.user.id, 'read');
    if (statisticsOnly) {
      const token = await activeToken(row, org, auth), metrics = await overview(row, org, auth, token, true);
      const current = await getAccount(org, row.id, auth);
      if (current.status !== 'connected') throw fail(409, 'account_disconnected');
      if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
      const { today, history, fetched_at, retry_at, cached, stale, error } = metrics;
      return { ok: true, account: safeAccount(current, now()), overview: { today, history, fetched_at, retry_at, cached, stale, error } };
    }
    const wasCached = Date.parse(row.token_expires_at) > now() + 60000;
    let token = await activeToken(row, org, auth), profile;
    try { profile = await profileFor(token); }
    catch (error) {
      if (!wasCached || error.providerStatus !== 401) throw error;
      token = await activeToken(row, org, auth, true);
      profile = await profileFor(token);
    }
    if (profile.id !== row.avito_user_id) throw fail(409, 'account_mismatch');
    let balance = { available: false, error: 'provider_unavailable' };
    try {
      balance = await requestJson('https://api.avito.ru/core/v1/accounts/' + row.avito_user_id + '/balance/', { headers: { Authorization: 'Bearer ' + token } }, 'balance_unavailable', 16384, 15000, value => {
        if (!value || typeof value.real !== 'number' || !Number.isFinite(value.real) || typeof value.bonus !== 'number' || !Number.isFinite(value.bonus)) throw fail(502, 'balance_unavailable');
        return { available: true, real: value.real, bonus: value.bonus };
      });
    } catch (error) { balance.error = error.code === 'permission_denied' ? 'permission_denied' : error.code === 'try_later' ? 'try_later' : 'provider_unavailable'; }
    const metrics = await overview(row, org, auth, token), current = await getAccount(org, row.id, auth);
    if (current.status !== 'connected') throw fail(409, 'account_disconnected');
    if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
    return { ok: true, account: safeAccount(current, now()), profile, balance, overview: metrics, items: { available: false, items: [], error: 'not_implemented' } };
  }
  return async function handle(request) {
    let messengerKind = null;
    try {
      if (!cfg.relaySecret) throw fail(503, 'configuration');
      if (request.url.length > 16384 || (request.headers.get('authorization') || '').length > 4096) throw fail(413, 'request_too_large');
      const url = new URL(request.url);
      let path = url.pathname;
      for (const prefix of ['/functions/v1/avito-accounts', '/avito-accounts']) if (path === prefix || path.startsWith(prefix + '/')) { path = path.slice(prefix.length) || '/'; break; }
      const supplied = request.headers.get('x-avito-relay-secret') || '', timestamp = request.headers.get('x-avito-relay-timestamp') || '';
      if (!/^[a-f0-9]{64}$/.test(supplied) || !/^[0-9]{10}$/.test(timestamp) || Math.abs(now() / 1000 - Number(timestamp)) > 60) throw fail(403, 'relay_rejected');
      let rawBody = '';
      if (request.method === 'POST') {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw fail(415, 'json_required');
        try { rawBody = await boundedText(request, /\/bidding\/queue-preview$/.test(path) ? 524288 : path === API + '/layout' ? 98304 : 24576, 'request_too_large'); }
        catch (error) { throw fail(error.code === 'request_too_large' ? 413 : 400, error.code === 'request_too_large' ? error.code : 'invalid_request'); }
      }
      const expected = await signAccountRelayRequest({ timestamp, method: request.method, path: path + url.search, body: rawBody, authorization: request.headers.get('authorization') || '' }, cfg.relaySecret);
      if (!await equalSecret(supplied, expected)) throw fail(403, 'relay_rejected');
      const adsFlags = url.searchParams.getAll('ads_stats');
      const adsPath = path.match(/^\/api\/integrations\/avito-accounts\/accounts\/([^/]+)$/);
      const adsStatisticsRead = request.method === 'GET' && adsPath && UUID.test(adsPath[1]) && adsFlags.length === 1 && adsFlags[0] === '1';
      const chatRoute = messengerRoute(path, API + '/accounts');
      const bidRoute = biddingRoute(path, API + '/accounts');
      const chatRead = request.method === 'GET' && chatRoute && ['chats', 'messages'].includes(chatRoute.action);
      if (chatRoute) messengerKind = request.method === 'POST' && chatRoute.action === 'messages' ? 'send' : chatRoute.action;
      if ([...url.searchParams.keys()].some(key => key !== 'organization_id' && !(key === 'ads_stats' && adsStatisticsRead) && !(key === 'statistics_days' && bidRoute?.action === 'items' && request.method === 'GET') && !((chatRead || bidRoute?.action === 'items' && request.method === 'GET') && ['limit', 'offset'].includes(key))) || ['organization_id', 'limit', 'offset', 'statistics_days'].some(key => url.searchParams.getAll(key).length > 1)) throw fail(400, 'invalid_request');
      const origin = request.headers.get('origin');
      if (origin && origin !== cfg.origin) throw fail(403, 'origin_rejected');
      if (path === API + '/config' && request.method === 'GET') return json({ ok: true, configuration: { enabled: cfg.enabled, ready: cfg.ready, missing: cfg.missing } });
      if (path === API + '/context' && request.method === 'GET') {
        const auth = await authenticate(request);
        const memberships = await userRequest('organization_members?select=organization_id,role,organizations(id,name)&user_id=eq.' + auth.user.id + '&role=in.(owner,admin)&limit=100', auth.authorization);
        let storageReady = false;
        if (cfg.ready) { try { storageReady = await store.health(); } catch (_) { /* No database diagnostics are exposed. */ } }
        return json({ ok: true, user: { id: auth.user.id }, storage_ready: storageReady, organizations: Array.isArray(memberships) ? memberships.filter(row => ['owner', 'admin'].includes(row.role)).map(row => ({ id: row.organization_id, name: row.organizations && row.organizations.name || '', role: row.role })) : [] });
      }
      ready();
      if (bidRoute) {
        const body = request.method === 'POST' ? await readSealedBody(rawBody, path, cfg.relaySecret) : {};
        if (body.organization_id && url.searchParams.has('organization_id') && body.organization_id !== url.searchParams.get('organization_id')) throw fail(400, 'invalid_request');
        const org = organization(body, url), auth = await authenticate(request, org), row = await getAccount(org, bidRoute.accountId, auth);
        requireBiddingScope(row, bidRoute.action, false);
        const token = ['groups','jobs','queue-confirm','queue-cancel'].includes(bidRoute.action) ? null : await activeToken(row, org, auth);
        const guard = async () => {
          await authenticate(request, org);
          const current = await getAccount(org, row.id, auth);
          requireBiddingScope(current, bidRoute.action, false);
          if (current.organization_id !== org || current.credential_version !== row.credential_version || current.avito_user_id !== row.avito_user_id) throw fail(409, 'account_changed');
        };
        await guard();
        return json(await bidding.handle({ context: { row, org, actor: auth.user.id, token, guard }, route: bidRoute, url, method: request.method, body }));
      }
      if (chatRoute) {
        if (!(chatRead || request.method === 'POST' && ['messages', 'read'].includes(chatRoute.action))) throw fail(405, 'method_not_allowed');
        const body = request.method === 'POST' ? await readSealedBody(rawBody, path, cfg.relaySecret) : {};
        if (body.organization_id && url.searchParams.has('organization_id') && body.organization_id !== url.searchParams.get('organization_id')) throw fail(400, 'invalid_request');
        const org = organization(body, url), auth = await authenticate(request, org), row = await getAccount(org, chatRoute.accountId, auth);
        requireMessengerScope(row, 'read', false);
        const page = chatRead ? messengerPagination(url) : null;
        const input = chatRead ? null : messengerBody(body, chatRoute.action);
        const token = await activeToken(row, org, auth);
        const guard = async () => {
          await authenticate(request, org);
          const current = await getAccount(org, row.id, auth);
          requireMessengerScope(current, 'read', false);
          if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
        };
        await guard();
        const parameters = { row, org, token, route: chatRoute, reserve: () => reserve(org, auth.user.id, 'read'), beforeRetry: guard };
        const result = chatRead ? await messenger.read({ ...parameters, page }) : await messenger.write({ ...parameters, body: input, beforeSubmit: guard });
        await guard();
        return json(result);
      }
      if (path === API + '/layout' && request.method === 'GET') {
        const org = organization({}, url);
        await authenticate(request, org);
        return json({ ok: true, ...safeLayout(await store.getLayout(org)) });
      }
      if (path === API + '/layout' && request.method === 'POST') {
        const body = await readSealedBody(rawBody, path, cfg.relaySecret), org = organization(body, url), auth = await authenticate(request, org);
        if (Object.keys(body).sort().join(',') !== 'layout,organization_id,revision' || !Number.isSafeInteger(body.revision) || body.revision < 0) throw fail(400, 'invalid_layout');
        const layout = accountLayout(body.layout);
        const saved = await store.setLayout({ p_organization_id: org, p_actor_id: auth.user.id, p_expected_revision: body.revision, p_layout: layout });
        if (!saved) throw fail(503, 'storage_unavailable');
        return json({ ok: true, ...safeLayout(saved) });
      }
      if (path === API + '/preferences' && request.method === 'GET') {
        const org = organization({}, url);
        await authenticate(request, org);
        const rows = await store.listPreferences(org);
        if (!Array.isArray(rows)) throw fail(503, 'storage_unavailable');
        return json({ ok: true, preferences: rows.slice(0, 200).map(safePreference) });
      }
      if (path === API + '/preferences' && request.method === 'POST') {
        const body = await readSealedBody(rawBody, path, cfg.relaySecret), org = organization(body, url), auth = await authenticate(request, org);
        if (!['personal', 'oauth'].includes(body.source) || typeof body.account_id !== 'string' || !UUID.test(body.account_id)) throw fail(400, 'invalid_request');
        const preference = await store.setPreference({ p_organization_id: org, p_actor_id: auth.user.id, p_source: body.source, p_account_id: body.account_id, p_display_name: displayName(body.display_name) });
        if (!preference) throw fail(503, 'storage_unavailable');
        return json({ ok: true, preference: safePreference(preference) });
      }
      if (path === API + '/accounts' && request.method === 'GET') {
        const org = organization({}, url), auth = await authenticate(request, org), rows = await store.listAccounts(org, auth.authorization);
        const result = { ok: true, accounts: rows.map(row => safeAccount(row, now())) };
        const budget = Math.min(81920, 131072 - encoder.encode(JSON.stringify(result)).length - 32);
        const cached = await initialCachedOverviews(org, rows, budget);
        if (cached.length) result.cached_overviews = cached;
        return json(result);
      }
      if (path === API + '/accounts' && request.method === 'POST') {
        const body = await readSealedBody(rawBody, path, cfg.relaySecret), org = organization(body, url), auth = await authenticate(request, org);
        return json(await saveCredentials(body, org, auth));
      }
      const match = path.match(/^\/api\/integrations\/avito-accounts\/accounts\/([^/]+)(?:\/(refresh|reconnect|disconnect))?$/);
      if (!match || !UUID.test(match[1])) throw fail(404, 'not_found');
      const [unused, id, action] = match;
      if (!action && request.method === 'GET') {
        const org = organization({}, url), auth = await authenticate(request, org);
        const statisticsFlags = url.searchParams.getAll('ads_stats');
        if (statisticsFlags.length > 1 || statisticsFlags.length && statisticsFlags[0] !== '1') throw fail(400, 'invalid_request');
        return json(await details(await getAccount(org, id, auth), org, auth, statisticsFlags.length === 1));
      }
      if (action && request.method === 'POST') {
        const body = await readSealedBody(rawBody, path, cfg.relaySecret), org = organization(body, url), auth = await authenticate(request, org), row = await getAccount(org, id, auth);
        if (action === 'refresh') {
          if (body.tariff_payment_only !== undefined && typeof body.tariff_payment_only !== 'boolean') throw fail(400, 'invalid_request');
          return json(await (body.tariff_payment_only === true ? paymentDetails(row, org, auth) : details(row, org, auth)));
        }
        if (action === 'reconnect') return json(await saveCredentials(body, org, auth, row));
        if (body.confirmation !== 'DISCONNECT') throw fail(400, 'confirmation_required');
        await store.disconnect(org, id, auth.user.id);
        return json({ ok: true });
      }
      throw fail(405, 'method_not_allowed');
    } catch (error) {
      if (messengerKind) messenger.failure(error, 'request', messengerKind);
      return json({ ok: false, error: error.code || 'service_unavailable' }, error.status || 503);
    }
  };
}
