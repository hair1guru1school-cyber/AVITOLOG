import { encryptTokens, decryptTokens, hashState, buildAuthorizationUrl } from './avito-core.mjs';
import { createTariffPaymentReader } from './avito-tariff-payment.mjs';
import { createAccountMetricCache, retainAccountMetricFields } from './avito-metric-cache.mjs';
import { createAvitoMessenger, messengerRoute, messengerPagination, messengerBody, requireMessengerScope } from './avito-messenger.mjs';
import { createAvitoBidding, createBiddingStore, biddingRoute, requireBiddingScope } from './avito-bidding.mjs';
import { registerBidWorker } from './avito-bid-worker.mjs';
import { signAccountRelayRequest, accountStatisticsRange, unavailableAccountHistory, safeAccountStatistics, readAccountMetadataPages, readAccountListingSummary, createProviderReadDiagnostic } from './avito-accounts-core.mjs';

const API = '/api/integrations/avito-invites';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[a-f0-9]{64}$/;
const COOKIE = '__Host-avito_invite_browser';
const NATIVE_ORIGIN = 'https://iexrnbvimnnbebrvfkha.supabase.co';
const NATIVE_BASE = NATIVE_ORIGIN + '/functions/v1/avito-invites';
const META = 'id,organization_id,avito_user_id,display_name,status,token_expires_at,credential_version,scopes,created_at,updated_at';
const INVITE_META = 'id,organization_id,label,connection_id,expected_version,expires_at,revoked_at,used_at,created_at';
const encoder = new TextEncoder();
const security = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { ...security, 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const cookie = value => COOKIE + '=' + value + '; Path=/; Max-Age=' + (value ? '600' : '0') + '; Secure; HttpOnly; SameSite=Lax';
const aad = (org, id) => 'avito:1:' + org + ':' + id;
const version = value => Number.isSafeInteger(value) && value >= 0;
const base64 = value => btoa(Array.from(value, byte => String.fromCharCode(byte)).join(''));
const SCOPES = new Set([
  'messenger:read', 'messenger:write', 'user:read', 'items:info', 'user_operations:read',
  'autoload:reports', 'items:apply_vas', 'stats:read', 'ratings:read', 'ratings:write',
  'job:negotiations', 'user_balance:read', 'special_offers:sending', 'short_term_rent:read', 'cpxpromo:read', 'cpxpromo:edit'
]);
const CALLBACK_STAGES = new Set(['claim', 'creator', 'token_http', 'token_shape', 'profile_http', 'profile_shape', 'encrypt', 'finalize']);
const CALLBACK_FAILURE_CODES = new Set(['invalid_state', 'permission_denied', 'denied', 'missing_code', 'token_exchange', 'profile_unavailable', 'storage_unavailable', 'account_changed', 'account_mismatch', 'try_later']);
const PROVIDER_OAUTH_ERRORS = new Set(['invalid_client', 'invalid_grant', 'invalid_request', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope']);

async function transportKey(secret) {
  return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('avito-invites-transport:v1:' + secret))));
}
export async function sealInviteRequest(payload, relaySecret, path) {
  return { sealed: await encryptTokens(payload, await transportKey(relaySecret), 'POST:' + path) };
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function parse(text) {
  try { const value = JSON.parse(text || '{}'); if (!object(value)) throw new Error(); return value; }
  catch (_) { throw fail(400, 'invalid_request'); }
}
async function boundedText(response, maximum, code, status = 502, diagnostic) {
  if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel().catch(() => {}); throw Object.assign(fail(status, code), { responseReason: 'content_length' }); }
  if (!response.body) return '';
  const reader = response.body.getReader(), bytes = new Uint8Array(maximum);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      diagnostic?.bytes(length + value.byteLength);
      if (value.byteLength > maximum - length) { await reader.cancel().catch(() => {}); throw Object.assign(fail(status, code), { responseReason: 'body_size' }); }
      bytes.set(value, length); length += value.byteLength;
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)); }
    catch (_) { throw Object.assign(fail(status, code), { responseReason: 'invalid_utf8' }); }
  } catch (error) { diagnostic?.observe(error); throw error.responseReason ? error : Object.assign(fail(status, code), { responseReason: ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : length ? 'body_read_after_data' : 'body_read_before_data' }); }
  finally { reader.releaseLock(); }
}
export function getInvitesConfig(env = {}) {
  const read = name => String(typeof env.get === 'function' ? env.get(name) || '' : env[name] || '').trim();
  const origin = read('AVITO_PUBLIC_ORIGIN') || 'https://avitoboss.online';
  const callbackMode = read('AVITO_CLIENT_INVITES_CALLBACK_MODE') || 'relay';
  const cfg = {
    enabled: read('AVITO_CLIENT_INVITES_ENABLED') === '1', loggingConfirmed: read('AVITO_CALLBACK_LOGGING_CONFIRMED') === 'true', regLogsAccepted: read('AVITO_INVITES_REG_LOGS_ACCEPTED') === 'true',
    callbackMode, managedLogsAccepted: read('AVITO_INVITES_MANAGED_LOGS_ACCEPTED') === 'true',
    origin, redirectUri: callbackMode === 'supabase' ? read('AVITO_CLIENT_INVITES_REDIRECT_URI') || NATIVE_BASE + '/callback' : read('AVITO_REDIRECT_URI') || origin + '/oauth/avito/callback',
    publicBeginUrl: callbackMode === 'supabase' ? NATIVE_BASE + '/begin' : null,
    clientId: read('AVITO_CLIENT_INVITES_CLIENT_ID') || read('AVITO_CLIENT_ID'), clientSecret: read('AVITO_CLIENT_INVITES_CLIENT_SECRET') || read('AVITO_CLIENT_SECRET'),
    encryptionKey: read('AVITO_TOKEN_ENCRYPTION_KEY'), relaySecret: read('AVITO_RELAY_SECRET'),
    supabaseUrl: read('SUPABASE_URL').replace(/\/+$/, ''), anonKey: read('SUPABASE_ANON_KEY'), serviceKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    scopes: (read('AVITO_CLIENT_INVITES_SCOPES') || 'user:read,user_balance:read,stats:read,items:info').split(',').map(value => value.trim()), missing: []
  };
  if (!cfg.enabled) cfg.missing.push('AVITO_CLIENT_INVITES_ENABLED');
  if (!['relay', 'supabase'].includes(callbackMode)) cfg.missing.push('AVITO_CLIENT_INVITES_CALLBACK_MODE');
  if (callbackMode === 'supabase') {
    if (!cfg.managedLogsAccepted) cfg.missing.push('AVITO_INVITES_MANAGED_LOGS_ACCEPTED');
  } else if (!cfg.loggingConfirmed && !cfg.regLogsAccepted) cfg.missing.push('AVITO_CALLBACK_LOGGING_CONFIRMED');
  for (const [key, name] of [['clientId', 'AVITO_CLIENT_INVITES_CLIENT_ID'], ['clientSecret', 'AVITO_CLIENT_INVITES_CLIENT_SECRET'], ['relaySecret', 'AVITO_RELAY_SECRET'], ['supabaseUrl', 'SUPABASE_URL'], ['anonKey', 'SUPABASE_ANON_KEY'], ['serviceKey', 'SUPABASE_SERVICE_ROLE_KEY']]) if (!cfg[key]) cfg.missing.push(name);
  try {
    const publicUrl = new URL(origin), redirect = new URL(cfg.redirectUri), backend = new URL(cfg.supabaseUrl);
    if (publicUrl.protocol !== 'https:' || publicUrl.origin !== origin || publicUrl.username || publicUrl.password || redirect.search || redirect.hash || redirect.username || redirect.password || backend.protocol !== 'https:' || backend.origin !== cfg.supabaseUrl || backend.username || backend.password) throw new Error();
    if (callbackMode === 'supabase') {
      if (origin !== 'https://avitoboss.online' || cfg.supabaseUrl !== NATIVE_ORIGIN || cfg.redirectUri !== NATIVE_BASE + '/callback') throw new Error();
    } else if (redirect.origin !== origin || redirect.pathname !== '/oauth/avito/callback') throw new Error();
  } catch (_) { cfg.missing.push('AVITO_PUBLIC_ORIGIN_OR_REDIRECT_URI_OR_SUPABASE_URL'); }
  if (!/^[A-Za-z0-9_-]{4,256}$/.test(cfg.clientId) || !/^[\x21-\x7e]{4,1024}$/.test(cfg.clientSecret)) cfg.missing.push('AVITO_CLIENT_INVITES_CREDENTIALS');
  if (!cfg.scopes.includes('user:read') || new Set(cfg.scopes).size !== cfg.scopes.length || cfg.scopes.some(value => !SCOPES.has(value))) cfg.missing.push('AVITO_CLIENT_INVITES_SCOPES');
  try {
    const raw = /^[a-f0-9]{64}$/i.test(cfg.encryptionKey) ? Uint8Array.from(cfg.encryptionKey.match(/../g), byte => parseInt(byte, 16)) : Uint8Array.from(atob(cfg.encryptionKey), value => value.charCodeAt(0));
    if (raw.length !== 32) throw new Error();
  } catch (_) { cfg.missing.push('AVITO_TOKEN_ENCRYPTION_KEY'); }
  cfg.ready = cfg.missing.length === 0;
  return cfg;
}
function safeConnection(row, now) {
  return { id: row.id, source: 'oauth', display_name: row.display_name || '', avito_user_id: row.avito_user_id, status: row.status,
    credential_version: row.credential_version, token_expires_at: row.token_expires_at, scopes: row.scopes || [], created_at: row.created_at, updated_at: row.updated_at,
    token_state: row.status === 'disconnected' ? 'disconnected' : Date.parse(row.token_expires_at) > now ? 'valid' : 'expired' };
}
function safeInvitation(row) {
  return { id: row.id, label: row.label || '', connection_id: row.connection_id || null, expected_version: row.expected_version ?? null,
    expires_at: row.expires_at, revoked_at: row.revoked_at || null, used_at: row.used_at || null, created_at: row.created_at };
}
function tokenValue(value) { return typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[\x00-\x20\x7f]/.test(value); }
function callbackBrowser(request) {
  const header = request.headers.get('cookie') || '';
  if (header.length > 8192) throw fail(400, 'invalid_state');
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(COOKIE + '='));
  if (values.length !== 1 || !HEX.test(values[0].slice(COOKIE.length + 1))) throw fail(400, 'invalid_state');
  return values[0].slice(COOKIE.length + 1);
}
function callbackQuery(url, request) {
  if (url.search.length > 8192) throw fail(400, 'invalid_request');
  const body = { browser: callbackBrowser(request) };
  for (const [name, value] of url.searchParams) {
    if (!['state', 'code', 'error', 'error_description'].includes(name) || Object.hasOwn(body, name) || !value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value) || name !== 'error_description' && /\s/.test(value)) throw fail(400, 'invalid_request');
    body[name] = value;
  }
  if (!HEX.test(body.state || '') || Object.hasOwn(body, 'code') === Object.hasOwn(body, 'error') || Object.hasOwn(body, 'error_description') && !Object.hasOwn(body, 'error')) throw fail(400, 'invalid_request');
  delete body.error_description;
  return body;
}
function nativeResult(status) {
  return new Response(null, { status: 303, headers: { ...security, 'Set-Cookie': cookie(''), Location: 'https://avitoboss.online/integrations/avito-connect/?status=' + status } });
}
function safeProfile(value) {
  const id = typeof value?.id === 'number' && Number.isSafeInteger(value.id) ? String(value.id) : value?.id;
  if (!object(value) || typeof id !== 'string' || !/^[1-9][0-9]{0,24}$/.test(id)) throw fail(502, 'profile_unavailable');
  const profile = { id, name: typeof value.name === 'string' ? value.name.slice(0, 200) : '' };
  if (typeof value.profile_url === 'string' && value.profile_url.length < 2048) {
    try { const url = new URL(value.profile_url); if (url.protocol === 'https:' && (url.hostname === 'avito.ru' || url.hostname.endsWith('.avito.ru')) && !url.username && !url.password) profile.profile_url = url.toString(); } catch (_) { /* Omit non-provider links. */ }
  }
  return profile;
}
const MOSCOW = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
function dateFor(now) { const parts = Object.fromEntries(MOSCOW.formatToParts(new Date(now)).map(part => [part.type, part.value])); return parts.year + '-' + parts.month + '-' + parts.day; }
function unavailable(date, error, retryAt) {
  return { advance: { available: false, balance: null, currency: 'RUB', error }, listings: { available: false, active: null, visibility: 'status_only', error }, today: { available: false, date, timezone: 'Europe/Moscow', views: null, contacts: null, favorites: null, spending: null, error }, history: unavailableAccountHistory(date, error), fetched_at: null, retry_at: retryAt, cached: false };
}

export function createAvitoInvitesHandler(options = {}) {
  const cfg = getInvitesConfig(options.env || {}), fetchImpl = options.fetch || globalThis.fetch, now = options.now || Date.now;
  const logger = typeof options.logger === 'function' ? options.logger : record => console.warn('avito_invites_callback_failure', JSON.stringify(record));
  const providerLogger = typeof options.providerLogger === 'function' ? options.providerLogger : record => console.warn('avito_provider_read_failure', JSON.stringify(record));
  const cache = new Map(), requests = new Map();
  const tariffPaymentReader = createTariffPaymentReader(now);
  async function requestJson(url, init, code, maximum = 16384, timeout = 15000, diagnostic, validate) {
    let response;
    const providerDiagnostic = createProviderReadDiagnostic('oauth', code, providerLogger, now);
    const messengerResponse = ['chat_unavailable', 'messages_unavailable', 'send_unknown', 'read_unavailable'].includes(code);
    const signal = AbortSignal.timeout(timeout);
    try { response = await fetchImpl(url, { ...init, redirect: 'error', signal }); }
    catch (error) { providerDiagnostic?.failure(error, signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'transport_error'); throw Object.assign(fail(502, code), messengerResponse ? { messengerReason: signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'transport_error' } : {}); }
    providerDiagnostic?.response(response);
    if (diagnostic) diagnostic.httpStatus = response.status;
    const responseError = (status, errorCode) => Object.assign(fail(status, errorCode), messengerResponse ? { providerStatus: response.status, messengerReason: 'http_error' } : {});
    if (!response.ok) {
      providerDiagnostic?.failure(fail(502, code), 'http_error');
      if (code === 'storage_unavailable') {
        try {
          const body = JSON.parse(await boundedText(response, 16384, code));
          if (body.code === '42501') throw fail(403, 'permission_denied');
          if (['40001', '23505'].includes(body.code)) throw fail(409, 'account_changed');
          if (body.code === '54000') throw fail(429, 'try_later');
        } catch (error) { if (['permission_denied', 'account_changed', 'try_later'].includes(error.code)) throw error; }
      }
      await response.body?.cancel().catch(() => {});
      if (response.status === 429) throw responseError(429, 'try_later');
      if ([401, 403].includes(response.status)) throw responseError(code === 'authentication_required' ? 401 : 403, code === 'authentication_required' ? code : 'permission_denied');
      throw responseError(502, code);
    }
    const contentType = response.headers.get('content-type') || '';
    if (messengerResponse && contentType && !/^application\/(?:[a-z0-9.+-]+\+)?json\b/i.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(fail(502, code), { providerStatus: response.status, messengerReason: 'content_type' });
    }
    let raw;
    try {
      providerDiagnostic?.phase('body');
      raw = await boundedText(response, maximum, code, 502, providerDiagnostic);
      providerDiagnostic?.phase('json');
      const value = JSON.parse(raw);
      if (!validate) return value;
      providerDiagnostic?.phase('schema');
      return validate(value);
    }
    catch (error) {
      providerDiagnostic?.failure(error, signal.aborted ? 'timeout' : error.responseReason || (raw === '' ? 'empty_body' : error instanceof SyntaxError ? 'invalid_json' : 'invalid_response'));
      const safe = error.code ? error : fail(502, code);
      if (messengerResponse) {
        Object.assign(safe, { providerStatus: response.status, messengerReason: signal.aborted ? 'timeout' : error.responseReason || (raw === '' ? 'empty_body' : error instanceof SyntaxError ? 'invalid_json' : 'invalid_response') });
      }
      throw safe;
    }
  }
  async function service(route, method = 'GET', body, timeout = 15000) {
    return requestJson(cfg.supabaseUrl + '/rest/v1/' + route, { method, headers: { apikey: cfg.serviceKey, Authorization: 'Bearer ' + cfg.serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) }, 'storage_unavailable', 131072, timeout);
  }
  const rpc = (name, body) => service('rpc/' + name, 'POST', body);
  const store = options.store || {
    async health() {
      for (const table of ['avito_client_invites', 'avito_client_invite_states', 'avito_invite_rate_limits', 'avito_invite_renewal_claims', 'avito_account_metric_cache']) await service(table + '?select=*&limit=0');
      await service('avito_connections?select=credential_version&limit=0');
      return true;
    },
    async list(org) {
      return readAccountMetadataPages((offset, limit) => service('avito_connections?select=' + META + '&organization_id=eq.' + org + '&order=created_at.desc,id.desc&limit=' + limit + '&offset=' + offset), org);
    },
    async get(org, id) { const rows = await service('avito_connections?select=' + META + '&organization_id=eq.' + org + '&id=eq.' + id + '&limit=1'); return rows?.[0] || null; },
    async secrets(id) { const rows = await service('avito_connection_secrets?select=encrypted_tokens&connection_id=eq.' + id + '&limit=1'); return rows?.[0] || null; },
    async listInvitations(org) { return service('avito_client_invites?select=' + INVITE_META + '&organization_id=eq.' + org + '&order=created_at.desc&limit=100'); },
    issue: body => rpc('avito_issue_client_invite', body), begin: body => rpc('avito_begin_client_invite', body), claim: body => rpc('avito_claim_client_invite_state', body),
    fail: body => rpc('avito_fail_client_invite_state', body), finalize: body => rpc('avito_finalize_client_invite', body), revoke: body => rpc('avito_revoke_client_invite', body),
    reserve: body => rpc('avito_invite_reserve_request', body), claimRenewal: body => rpc('avito_invite_claim_renewal', body), updateToken: body => rpc('avito_invite_update_token', body),
    async getMetricCache(module, org, id, timeout) {
      const rows = await service('avito_account_metric_cache?select=module,organization_id,account_id,credential_version,metric_date,snapshot_started_at,expires_at,overview&module=eq.' + module + '&organization_id=eq.' + org + '&account_id=eq.' + id + '&limit=1', 'GET', undefined, timeout);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    putMetricCache: body => service('rpc/avito_metric_cache_put', 'POST', body, 1500),
    releaseRenewal: body => rpc('avito_invite_release_renewal', body), disconnect: body => rpc('avito_invite_disconnect', body)
  };
  const sharedMetrics = createAccountMetricCache({ store, module: 'oauth', now, sleep: options.metricCacheSleep });
  const messenger = createAvitoMessenger({ requestJson, now, module: 'oauth', logger: typeof options.messengerLogger === 'function' ? options.messengerLogger : record => console.warn('avito_messenger_failure', JSON.stringify(record)) });
  const bidding = createAvitoBidding({ requestJson, fetch: fetchImpl, now, signingSecret: cfg.encryptionKey, module: 'oauth', store: options.biddingStore || createBiddingStore(service) });
  registerBidWorker(options.biddingWorkerRegistry, 'oauth', { service, activeToken, bidding, scope: requireBiddingScope, getRow: async (org, id) => (await service('avito_connections?select=id,organization_id,avito_user_id,status,scopes,credential_version,token_expires_at&organization_id=eq.' + org + '&id=eq.' + id + '&limit=1'))?.[0] });
  function ready() { if (!cfg.ready) throw fail(503, 'configuration'); }
  async function userRequest(route, authorization) { return requestJson(cfg.supabaseUrl + '/rest/v1/' + route, { headers: { apikey: cfg.anonKey, Authorization: authorization } }, 'permission_denied', 131072); }
  async function authenticate(request, org) {
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw fail(401, 'authentication_required');
    if (!cfg.supabaseUrl || !cfg.anonKey) throw fail(503, 'configuration');
    const user = await requestJson(cfg.supabaseUrl + '/auth/v1/user', { headers: { apikey: cfg.anonKey, Authorization: authorization } }, 'authentication_required');
    if (!UUID.test(user?.id || '')) throw fail(401, 'authentication_required');
    if (org) {
      const rows = await userRequest('organization_members?select=role&organization_id=eq.' + org + '&user_id=eq.' + user.id + '&limit=1', authorization);
      if (!Array.isArray(rows) || !['owner', 'admin'].includes(rows[0]?.role)) throw fail(403, 'permission_denied');
    }
    return { user, authorization };
  }
  async function creatorAllowed(org, actor) {
    const rows = await service('organization_members?select=role&organization_id=eq.' + org + '&user_id=eq.' + actor + '&limit=1');
    if (!Array.isArray(rows) || !['owner', 'admin'].includes(rows[0]?.role)) throw fail(403, 'permission_denied');
  }
  function organization(body, url) {
    const org = body.organization_id || url.searchParams.get('organization_id') || '';
    if (typeof org !== 'string' || !UUID.test(org)) throw fail(400, 'organization_required');
    if (body.organization_id && url.searchParams.has('organization_id') && body.organization_id !== url.searchParams.get('organization_id')) throw fail(400, 'invalid_request');
    return org;
  }
  async function get(org, id) { const row = await store.get(org, id); if (!row || !version(row.credential_version)) throw fail(404, 'account_not_found'); return row; }
  async function reserve(org, actor, action, id = null) {
    const allowed = await store.reserve({ p_organization_id: org, p_actor_id: actor, p_action: action, p_connection_id: id });
    if (allowed !== true) throw fail(allowed === false ? 429 : 503, allowed === false ? 'try_later' : 'storage_unavailable');
  }
  async function tokenFor(body, fallbackScopes = [], diagnostic) {
    if (diagnostic) { diagnostic.stage = 'token_http'; diagnostic.httpStatus = null; }
    const value = await requestJson('https://api.avito.ru/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }).toString() }, 'token_exchange', 16384, 15000, diagnostic);
    const expires = value?.expires_in;
    if (diagnostic) {
      const scope = typeof value?.scope === 'string' ? value.scope.split(/[\s,]+/).filter(Boolean) : [];
      const errorPresent = object(value) === true && Object.hasOwn(value, 'error');
      const errorObject = object(value?.error) === true;
      const providerError = [value?.error, errorObject ? value.error.code : undefined, value?.code].find(entry => typeof entry === 'string' && PROVIDER_OAUTH_ERRORS.has(entry));
      diagnostic.stage = 'token_shape';
      diagnostic.tokenShape = {
        refresh_present: typeof value?.refresh_token === 'string' && value.refresh_token.length > 0,
        expires_number: typeof expires === 'number' && Number.isFinite(expires),
        expires_decimal_string: typeof expires === 'string' && /^[0-9]+$/.test(expires),
        scope_string: typeof value?.scope === 'string',
        scope_subset_ok: object(value) === true && (!Object.hasOwn(value, 'scope') || typeof value.scope === 'string' && scope.includes('user:read') && scope.every(entry => cfg.scopes.includes(entry))),
        access_present: typeof value?.access_token === 'string' && value.access_token.length > 0,
        object: object(value) === true,
        data_object: object(value?.data) === true,
        result_object: object(value?.result) === true,
        error_present: errorPresent,
        error_object: errorObject,
        data_access_present: typeof value?.data?.access_token === 'string' && value.data.access_token.length > 0,
        data_refresh_present: typeof value?.data?.refresh_token === 'string' && value.data.refresh_token.length > 0,
        data_expires_number: typeof value?.data?.expires_in === 'number' && Number.isFinite(value.data.expires_in),
        data_expires_decimal_string: typeof value?.data?.expires_in === 'string' && /^[0-9]+$/.test(value.data.expires_in),
        result_access_present: typeof value?.result?.access_token === 'string' && value.result.access_token.length > 0,
        result_refresh_present: typeof value?.result?.refresh_token === 'string' && value.result.refresh_token.length > 0,
        result_expires_number: typeof value?.result?.expires_in === 'number' && Number.isFinite(value.result.expires_in),
        result_expires_decimal_string: typeof value?.result?.expires_in === 'string' && /^[0-9]+$/.test(value.result.expires_in),
        provider_error: providerError || (errorPresent || object(value) && Object.hasOwn(value, 'code') ? 'unrecognized' : 'absent')
      };
    }
    if (!object(value) || !tokenValue(value.access_token) || !tokenValue(value.refresh_token) || !Number.isFinite(expires) || expires < 30 || expires > 90 * 86400) throw fail(502, 'token_exchange');
    if (encoder.encode(JSON.stringify({ access_token: value.access_token, refresh_token: value.refresh_token })).length > 12000) throw fail(502, 'token_exchange');
    const providedScope = Object.hasOwn(value, 'scope');
    if (providedScope && typeof value.scope !== 'string' || !Array.isArray(fallbackScopes)) throw fail(502, 'token_exchange');
    // An omitted grant list is unknown, not proof that requested permissions were granted.
    const scopes = providedScope ? [...new Set(value.scope.split(/[\s,]+/).filter(Boolean))] : [...fallbackScopes];
    if (scopes.some(scope => typeof scope !== 'string' || !cfg.scopes.includes(scope)) || (providedScope || scopes.length > 0) && !scopes.includes('user:read')) throw fail(502, 'token_exchange');
    return { access_token: value.access_token, refresh_token: value.refresh_token, scopes, expires_at: new Date(now() + expires * 1000).toISOString() };
  }
  async function profile(token, diagnostic) {
    if (diagnostic) { diagnostic.stage = 'profile_http'; diagnostic.httpStatus = null; }
    return requestJson('https://api.avito.ru/core/v1/accounts/self', { headers: { Authorization: 'Bearer ' + token } }, 'profile_unavailable', 16384, 15000, diagnostic, value => {
      if (diagnostic) diagnostic.stage = 'profile_shape';
      return safeProfile(value);
    });
  }
  async function begin(invite) {
    if (typeof invite !== 'string' || !HEX.test(invite)) throw fail(400, 'invalid_invitation');
    const state = random(), browser = random();
    const pending = await store.begin({ p_invite_hash: await hashState(invite), p_state_hash: await hashState(state), p_browser_hash: await hashState(browser), p_expires_at: new Date(now() + 600000).toISOString() });
    if (!object(pending)) throw fail(400, 'invalid_invitation');
    const authorizationUrl = new URL(buildAuthorizationUrl(cfg, state));
    authorizationUrl.hostname = 'www.avito.ru';
    authorizationUrl.searchParams.set('redirect_uri', cfg.redirectUri);
    return { browser, authorizationUrl: authorizationUrl.toString() };
  }
  async function callback(body) {
    const diagnostic = { stage: 'claim', httpStatus: null };
    let stateHash, claimId, claimed = false;
    try {
      const state = body.state, browser = body.browser;
      if (typeof state !== 'string' || typeof browser !== 'string' || !HEX.test(state) || !HEX.test(browser)) throw fail(400, 'invalid_state');
      stateHash = await hashState(state); claimId = crypto.randomUUID();
      const browserHash = await hashState(browser);
      const pending = await store.claim({ p_state_hash: stateHash, p_browser_hash: browserHash, p_claim_id: claimId });
      if (!object(pending) || !UUID.test(pending.organization_id || '') || !UUID.test(pending.actor_id || '') || Date.parse(pending.expires_at) <= now() || !Number.isFinite(Date.parse(pending.expires_at))) throw fail(400, 'invalid_state');
      claimed = true;
      diagnostic.stage = 'creator';
      await creatorAllowed(pending.organization_id, pending.actor_id);
      if (body.error) throw fail(400, 'denied');
      if (typeof body.code !== 'string' || !body.code || body.code.length > 4096 || /[\x00-\x20\x7f]/.test(body.code)) throw fail(400, 'missing_code');
      const tokens = await tokenFor({ grant_type: 'authorization_code', code: body.code, redirect_uri: cfg.redirectUri }, [], diagnostic);
      const account = await profile(tokens.access_token, diagnostic), id = pending.connection_id || crypto.randomUUID();
      if (!UUID.test(id)) throw fail(400, 'invalid_state');
      diagnostic.stage = 'encrypt'; diagnostic.httpStatus = null;
      const encryptedTokens = await encryptTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }, cfg.encryptionKey, aad(pending.organization_id, id));
      diagnostic.stage = 'finalize';
      const saved = await store.finalize({ p_state_hash: stateHash, p_browser_hash: browserHash, p_claim_id: claimId, p_connection_id: id,
        p_avito_user_id: account.id, p_display_name: account.name, p_token_expires_at: tokens.expires_at, p_scopes: tokens.scopes,
        p_encrypted_tokens: encryptedTokens });
      if (saved !== id) throw fail(409, 'account_changed');
      return { ok: true, status: 'connected' };
    } catch (error) {
      if (claimed) await store.fail({ p_state_hash: stateHash, p_claim_id: claimId }).catch(() => {});
      // Log fixed stages and shape booleans only, never credentials, payloads or exception text.
      const record = { stage: CALLBACK_STAGES.has(diagnostic.stage) ? diagnostic.stage : 'claim', code: CALLBACK_FAILURE_CODES.has(error.code) ? error.code : 'service_unavailable' };
      if (Number.isInteger(diagnostic.httpStatus) && diagnostic.httpStatus >= 100 && diagnostic.httpStatus <= 599) record.http_status = diagnostic.httpStatus;
      if (diagnostic.tokenShape) record.token_shape = diagnostic.tokenShape;
      try { logger(record); } catch (_) { /* Logging must not alter the callback result. */ }
      throw error;
    }
  }
  async function activeToken(row, org, auth) {
    if (row.status !== 'connected') throw fail(409, 'account_disconnected');
    const secret = await store.secrets(row.id);
    let tokens;
    try { tokens = await decryptTokens(secret?.encrypted_tokens, cfg.encryptionKey, aad(org, row.id)); }
    catch (_) { throw fail(503, 'storage_unavailable'); }
    if (!tokenValue(tokens.access_token) || !tokenValue(tokens.refresh_token)) throw fail(503, 'storage_unavailable');
    if (Date.parse(row.token_expires_at) > now() + 60000) return tokens.access_token;
    const claimId = crypto.randomUUID(), parameters = { p_organization_id: org, p_connection_id: row.id, p_actor_id: auth.user.id, p_expected_version: row.credential_version, p_claim_id: claimId };
    if (await store.claimRenewal({ ...parameters, p_expires_at: new Date(now() + 90000).toISOString() }) !== true) throw fail(409, 'account_changed');
    try {
      const next = await tokenFor({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, row.scopes);
      const account = await profile(next.access_token);
      if (account.id !== row.avito_user_id) throw fail(409, 'account_mismatch');
      const changed = await store.updateToken({ ...parameters, p_token_expires_at: next.expires_at, p_scopes: next.scopes,
        p_encrypted_tokens: await encryptTokens({ access_token: next.access_token, refresh_token: next.refresh_token }, cfg.encryptionKey, aad(org, row.id)) });
      if (changed !== true) throw fail(409, 'account_changed');
      row.credential_version += 1; row.token_expires_at = next.expires_at;
      return next.access_token;
    } finally { await store.releaseRenewal({ p_organization_id: org, p_connection_id: row.id, p_actor_id: auth.user.id, p_claim_id: claimId }).catch(() => {}); }
  }
  const metricError = error => error.code === 'permission_denied' ? 'permission_denied' : error.code === 'try_later' ? 'rate_limited' : 'provider_unavailable';
  async function overview(row, org, auth, token, statisticsOnly = false) {
    const date = dateFor(now()), baseKey = org + ':' + row.id + ':' + row.credential_version + ':' + date;
    const project = value => {
      if (!statisticsOnly) return value;
      const { today, history, fetched_at, retry_at, cached, stale, error } = value;
      return { today, history, fetched_at, retry_at, cached, stale, error };
    };
    const key = baseKey, saved = cache.get(key), fresh = saved && saved.until > now(), fullBatch = !statisticsOnly || sharedMetrics.enabled;
    if (fresh && (statisticsOnly || saved.complete)) return project({ ...saved.value, cached: true });
    if (requests.has(key)) {
      const pending = requests.get(key), value = await pending.promise;
      if (!statisticsOnly && !pending.complete && !value.stale && cache.get(key)?.until > now()) return overview(row, org, auth, token);
      return project({ ...value, cached: Boolean(value.fetched_at) || value.cached });
    }
    const started = now(), retryAt = new Date(started + 60000).toISOString(), base = unavailable(date, 'provider_unavailable', retryAt);
    if (requests.size >= 200) return unavailable(date, 'rate_limited', retryAt);
    const load = async () => {
      let previous = saved;
      const shared = await sharedMetrics.read(org, row, date);
      if (shared && (!previous || shared.snapshotStartedAt > (previous.snapshotStartedAt || 0))) previous = { ...shared, until: shared.expiresAt, complete: true };
      if (shared && shared.expiresAt > now()) {
        if (!cache.has(key) && cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(key, { ...shared, until: shared.expiresAt, complete: true });
        return { ...shared.value, cached: true };
      }
      // Complete a fresh ADS batch without reserving or fetching its statistics twice.
      if (!fresh) {
        try { await reserve(org, auth.user.id, 'metrics', row.id); }
        catch (error) {
          const refreshed = metricError(error) === 'rate_limited' ? await sharedMetrics.wait(org, row, date) : null;
          if (refreshed) {
            if (!cache.has(key) && cache.size >= 200) cache.delete(cache.keys().next().value);
            cache.set(key, { ...refreshed, until: refreshed.expiresAt, complete: true });
            return { ...refreshed.value, cached: true };
          }
          const missing = unavailable(date, metricError(error), retryAt);
          return previous ? { ...missing, ...previous.value, cached: true, stale: true, error: metricError(error), retry_at: retryAt } : missing;
        }
      }
      const advanceRequest = async () => {
        try {
          return await requestJson('https://api.avito.ru/cpa/v3/balanceInfo', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Source': 'AVITOBOSS' }, body: '{}' }, 'advance_unavailable', 16384, 8000, undefined, value => {
            if (!object(value) || Object.hasOwn(value, 'error') || Object.hasOwn(value, 'code') || !Number.isSafeInteger(value.balance)) throw fail(502, 'advance_unavailable');
            return { available: true, balance: value.balance / 100, currency: 'RUB' };
          });
        } catch (error) { return { ...base.advance, error: metricError(error) }; }
      };
      const statsRequest = async () => {
        try {
          const { dateFrom, dateTo } = accountStatisticsRange(date);
          return await requestJson('https://api.avito.ru/stats/v2/accounts/' + row.avito_user_id + '/items', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom, dateTo, metrics: ['views', 'contacts', 'contactsShowPhone', 'contactsMessenger', 'favorites', 'spending'], grouping: 'day', limit: 1000, offset: 0 }) }, 'statistics_unavailable', 131072, 8000, undefined, value => safeAccountStatistics(value, date));
        } catch (error) { return { today: { ...base.today, error: metricError(error) }, history: { ...base.history, error: metricError(error) } }; }
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
      const statsRequestOnce = () => fresh ? Promise.resolve(saved.value) : statsRequest();
      const values = !fullBatch ? [null, await statsRequestOnce(), null] : await Promise.all([advanceRequest(), statsRequestOnce(), listingsRequest()]);
      const [advance, statistics, listings] = values;
      const { today, history } = statistics;
      let value = { today, history, fetched_at: fresh ? saved.value.fetched_at : new Date(now()).toISOString(), retry_at: fresh ? saved.value.retry_at : retryAt, cached: false };
      if (fullBatch) Object.assign(value, { advance, listings });
      value = retainAccountMetricFields(value, previous?.value);
      if (fullBatch) await sharedMetrics.write(org, row, date, started, value);
      if (!cache.has(key) && cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { value, complete: fullBatch, snapshotStartedAt: started, until: fresh ? saved.until : started + 60000 }); return value;
    };
    const pending = load(), request = { promise: pending, complete: fullBatch }; requests.set(key, request);
    try { return project(await pending); } finally { if (requests.get(key) === request) requests.delete(key); }
  }
  async function paymentDetails(row, org, auth) {
    await reserve(org, auth.user.id, 'read');
    const token = await activeToken(row, org, auth), accountProfile = await profile(token);
    if (accountProfile.id !== row.avito_user_id) throw fail(409, 'account_mismatch');
    const key = org + ':' + row.id + ':' + row.credential_version + ':' + dateFor(now());
    const value = !Array.isArray(row.scopes) || !row.scopes.includes('user_operations:read') ? { available: false, experimental: true, error: 'permission_denied' } :
      await tariffPaymentReader(key, (body, limits) => requestJson('https://api.avito.ru/core/v1/accounts/operations_history/', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, 'tariff_payment_unavailable', limits.maximum, limits.timeout));
    const current = await get(org, row.id);
    await creatorAllowed(org, auth.user.id);
    if (current.status !== 'connected') throw fail(409, 'account_disconnected');
    if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
    return { ok: true, account: safeConnection(current, now()), tariff_payment: value };
  }
  async function details(row, org, auth, statisticsOnly = false) {
    await reserve(org, auth.user.id, 'read');
    if (statisticsOnly) {
      const token = await activeToken(row, org, auth), metrics = await overview(row, org, auth, token, true);
      const current = await get(org, row.id);
      await creatorAllowed(org, auth.user.id);
      if (current.status !== 'connected') throw fail(409, 'account_disconnected');
      if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
      const { today, history, fetched_at, retry_at, cached, stale, error } = metrics;
      return { ok: true, account: safeConnection(current, now()), overview: { today, history, fetched_at, retry_at, cached, stale, error } };
    }
    const token = await activeToken(row, org, auth), accountProfile = await profile(token);
    if (accountProfile.id !== row.avito_user_id) throw fail(409, 'account_mismatch');
    let balance = { available: false, error: 'provider_unavailable' };
    try {
      balance = await requestJson('https://api.avito.ru/core/v1/accounts/' + row.avito_user_id + '/balance/', { headers: { Authorization: 'Bearer ' + token } }, 'balance_unavailable', 16384, 15000, undefined, value => {
        if (!object(value) || !Number.isFinite(value.real) || !Number.isFinite(value.bonus)) throw fail(502, 'balance_unavailable');
        return { available: true, real: value.real, bonus: value.bonus };
      });
    } catch (error) { balance.error = metricError(error); }
    const metrics = await overview(row, org, auth, token), current = await get(org, row.id);
    await creatorAllowed(org, auth.user.id);
    if (current.status !== 'connected') throw fail(409, 'account_disconnected');
    if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
    return { ok: true, account: safeConnection(current, now()), profile: accountProfile, balance, overview: metrics, items: { available: false, items: [], error: 'not_implemented' } };
  }
  return async function handle(request) {
    let isCallback = false, nativeFlow = false, messengerKind = null;
    try {
      const url = new URL(request.url);
      let path = url.pathname;
      for (const prefix of ['/functions/v1/avito-invites', '/avito-invites']) if (path === prefix || path.startsWith(prefix + '/')) { path = path.slice(prefix.length) || '/'; break; }
      isCallback = path === API + '/callback';
      nativeFlow = cfg.callbackMode === 'supabase' && ['/begin', '/callback'].includes(path);
      if (request.url.length > 16384 || (request.headers.get('authorization') || '').length > 4096) throw fail(413, 'request_too_large');
      if (nativeFlow) {
        ready();
        // Supabase can rewrite the runtime origin; routing and public identities remain pinned separately.
        if (!['/functions/v1/avito-invites' + path, '/avito-invites' + path].includes(url.pathname)) throw fail(403, 'origin_rejected');
        if (path === '/begin') {
          if (request.method !== 'POST') throw fail(405, 'method_not_allowed');
          if (url.search || request.headers.get('origin') !== cfg.origin) throw fail(403, 'origin_rejected');
          if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('content-type') || '')) throw fail(415, 'form_required');
          const form = new URLSearchParams(await boundedText(request, 256, 'request_too_large', 413));
          if ([...form].length !== 1 || !form.has('invite')) throw fail(400, 'invalid_invitation');
          const started = await begin(form.get('invite'));
          return new Response(null, { status: 303, headers: { ...security, 'Set-Cookie': cookie(started.browser), Location: started.authorizationUrl } });
        }
        if (request.method !== 'GET') throw fail(405, 'method_not_allowed');
        await callback(callbackQuery(url, request));
        return nativeResult('connected');
      }
      if (!cfg.relaySecret) throw fail(503, 'configuration');
      const signature = request.headers.get('x-avito-relay-secret') || '', timestamp = request.headers.get('x-avito-relay-timestamp') || '';
      if (!HEX.test(signature) || !/^[0-9]{10}$/.test(timestamp) || Math.abs(now() / 1000 - Number(timestamp)) > 60) throw fail(403, 'relay_rejected');
      if (!['GET', 'POST'].includes(request.method)) throw fail(405, 'method_not_allowed');
      let raw = '';
      if (request.method === 'POST') {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw fail(415, 'json_required');
        raw = await boundedText(request, /\/bidding\/queue-preview$/.test(path) ? 524288 : 24576, 'request_too_large', 413);
      }
      const expected = await signAccountRelayRequest({ timestamp, method: request.method, path: path + url.search, body: raw, authorization: request.headers.get('authorization') || '' }, cfg.relaySecret);
      let difference = 0; for (let index = 0; index < 64; index++) difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
      if (difference) throw fail(403, 'relay_rejected');
      const adsFlags = url.searchParams.getAll('ads_stats');
      const adsPath = path.match(/^\/api\/integrations\/avito-invites\/connections\/([^/]+)$/);
      const adsStatisticsRead = request.method === 'GET' && adsPath && UUID.test(adsPath[1]) && adsFlags.length === 1 && adsFlags[0] === '1';
      const chatRoute = messengerRoute(path, API + '/connections');
      const bidRoute = biddingRoute(path, API + '/connections');
      const chatRead = request.method === 'GET' && chatRoute && ['chats', 'messages'].includes(chatRoute.action);
      if (chatRoute) messengerKind = request.method === 'POST' && chatRoute.action === 'messages' ? 'send' : chatRoute.action;
      if ([...url.searchParams.keys()].some(name => name !== 'organization_id' && !(name === 'ads_stats' && adsStatisticsRead) && !(name === 'statistics_days' && bidRoute?.action === 'items' && request.method === 'GET') && !((chatRead || bidRoute?.action === 'items' && request.method === 'GET') && ['limit', 'offset'].includes(name))) || ['organization_id', 'limit', 'offset', 'statistics_days'].some(name => url.searchParams.getAll(name).length > 1)) throw fail(400, 'invalid_request');
      const origin = request.headers.get('origin');
      if (origin && origin !== cfg.origin) throw fail(403, 'origin_rejected');
      if (path === API + '/config' && request.method === 'GET') return json({ ok: true, configuration: { enabled: cfg.enabled, ready: cfg.ready, missing: cfg.missing, callback_mode: cfg.callbackMode, public_begin_url: cfg.publicBeginUrl, redirect_uri: cfg.redirectUri, scopes: cfg.scopes } });
      if (path === API + '/context' && request.method === 'GET') {
        const auth = await authenticate(request), rows = await userRequest('organization_members?select=organization_id,role,organizations(id,name)&user_id=eq.' + auth.user.id + '&role=in.(owner,admin)&limit=100', auth.authorization);
        let storageReady = false;
        if (cfg.ready) { try { storageReady = store.health ? await store.health() === true : true; } catch (_) { /* Schema diagnostics stay server-side. */ } }
        return json({ ok: true, storage_ready: storageReady, organizations: Array.isArray(rows) ? rows.filter(row => ['owner', 'admin'].includes(row.role)).map(row => ({ id: row.organization_id, name: row.organizations?.name || '', role: row.role })) : [] });
      }
      ready();
      let body = {};
      if (request.method === 'POST') {
        const outer = parse(raw);
        if (Object.keys(outer).length !== 1 || !object(outer.sealed)) throw fail(400, 'invalid_request');
        try { body = await decryptTokens(outer.sealed, await transportKey(cfg.relaySecret), 'POST:' + path); if (!object(body)) throw new Error(); }
        catch (_) { throw fail(400, 'invalid_request'); }
      }
      if (path === API + '/begin' && request.method === 'POST') {
        if (cfg.callbackMode === 'supabase') throw fail(400, 'native_flow_required');
        if (Object.keys(body).some(key => key !== 'invite') || typeof body.invite !== 'string' || !HEX.test(body.invite) || url.search) throw fail(400, 'invalid_invitation');
        const started = await begin(body.invite);
        return json({ ok: true, authorization_url: started.authorizationUrl }, 200, { 'Set-Cookie': cookie(started.browser) });
      }
      if (isCallback && request.method === 'POST') {
        if (cfg.callbackMode === 'supabase') throw fail(400, 'native_flow_required');
        if (Object.keys(body).some(key => !['state', 'code', 'error', 'browser'].includes(key)) || url.search) throw fail(400, 'invalid_request');
        return json(await callback(body), 200, { 'Set-Cookie': cookie('') });
      }
      const org = organization(body, url), auth = await authenticate(request, org);
      if (bidRoute) {
        const row = await get(org, bidRoute.accountId);
        requireBiddingScope(row, bidRoute.action, true);
        const token = ['groups','jobs','queue-confirm','queue-cancel'].includes(bidRoute.action) ? null : await activeToken(row, org, auth);
        const guard = async () => {
          await creatorAllowed(org, auth.user.id);
          const current = await get(org, row.id);
          requireBiddingScope(current, bidRoute.action, true);
          if (current.organization_id !== org || current.credential_version !== row.credential_version || current.avito_user_id !== row.avito_user_id) throw fail(409, 'account_changed');
        };
        await guard();
        return json(await bidding.handle({ context: { row, org, actor: auth.user.id, token, guard }, route: bidRoute, url, method: request.method, body }));
      }
      if (chatRoute) {
        if (!(chatRead || request.method === 'POST' && ['messages', 'read'].includes(chatRoute.action))) throw fail(405, 'method_not_allowed');
        const row = await get(org, chatRoute.accountId), action = request.method === 'POST' && chatRoute.action === 'messages' ? 'send' : 'read';
        requireMessengerScope(row, action, true);
        const page = chatRead ? messengerPagination(url) : null;
        const input = chatRead ? null : messengerBody(body, chatRoute.action);
        const token = await activeToken(row, org, auth);
        requireMessengerScope(row, action, true);
        const guard = async () => {
          await creatorAllowed(org, auth.user.id);
          const current = await get(org, row.id);
          requireMessengerScope(current, action, true);
          if (current.credential_version !== row.credential_version) throw fail(409, 'account_changed');
        };
        await guard();
        const parameters = { row, org, token, route: chatRoute, reserve: () => reserve(org, auth.user.id, 'read'), beforeRetry: guard };
        const result = chatRead ? await messenger.read({ ...parameters, page }) : await messenger.write({ ...parameters, body: input, beforeSubmit: guard });
        await guard();
        return json(result);
      }
      if (path === API + '/connections' && request.method === 'GET') {
        const rows = await store.list(org); return json({ ok: true, connections: rows.map(row => safeConnection(row, now())) });
      }
      if (path === API + '/invitations' && request.method === 'GET') {
        const rows = await store.listInvitations(org); return json({ ok: true, invitations: rows.map(safeInvitation) });
      }
      if (path === API + '/invitations' && request.method === 'POST') {
        const hours = body.expires_in_hours ?? 24;
        if (!Number.isFinite(hours) || hours < 1 || hours > 24) throw fail(400, 'invalid_expiration');
        const connectionId = body.connection_id ?? null, expectedVersion = body.expected_version ?? null, clientId = body.client_id ?? null;
        if (connectionId !== null && (!UUID.test(connectionId) || !version(expectedVersion)) || connectionId === null && expectedVersion !== null || clientId !== null && !UUID.test(clientId)) throw fail(400, 'invalid_request');
        const id = crypto.randomUUID(), token = random(), expiresAt = new Date(now() + hours * 3600000).toISOString();
        const label = typeof body.label === 'string' ? body.label.trim().slice(0, 200) : '';
        const issued = await store.issue({ p_invite_id: id, p_invite_hash: await hashState(token), p_organization_id: org, p_actor_id: auth.user.id, p_client_id: clientId, p_connection_id: connectionId, p_expected_version: expectedVersion, p_expires_at: expiresAt, p_label: label });
        if (issued !== id) throw fail(issued === null ? 429 : 503, issued === null ? 'try_later' : 'storage_unavailable');
        return json({ ok: true, invitation: { id, label, connection_id: connectionId, expected_version: expectedVersion, expires_at: expiresAt, revoked_at: null, used_at: null, created_at: new Date(now()).toISOString() }, url: cfg.origin + '/integrations/avito-connect/#invite=' + token });
      }
      const revoke = path.match(/^\/api\/integrations\/avito-invites\/invitations\/([^/]+)\/revoke$/);
      if (revoke && UUID.test(revoke[1]) && request.method === 'POST') {
        const changed = await store.revoke({ p_organization_id: org, p_invite_id: revoke[1], p_actor_id: auth.user.id });
        if (changed !== true) throw fail(404, 'invitation_not_found'); return json({ ok: true });
      }
      const match = path.match(/^\/api\/integrations\/avito-invites\/connections\/([^/]+)(?:\/(refresh|disconnect))?$/);
      if (!match || !UUID.test(match[1])) throw fail(404, 'not_found');
      const row = await get(org, match[1]);
      if ((!match[2] && request.method === 'GET') || match[2] === 'refresh' && request.method === 'POST') {
        if (body.tariff_payment_only !== undefined && typeof body.tariff_payment_only !== 'boolean') throw fail(400, 'invalid_request');
        const statisticsFlags = url.searchParams.getAll('ads_stats');
        if (statisticsFlags.length && (request.method !== 'GET' || statisticsFlags.length !== 1 || statisticsFlags[0] !== '1')) throw fail(400, 'invalid_request');
        return json(await (match[2] === 'refresh' && body.tariff_payment_only === true ? paymentDetails(row, org, auth) : details(row, org, auth, statisticsFlags.length === 1)));
      }
      if (match[2] === 'disconnect' && request.method === 'POST') {
        if (body.confirmation !== 'DISCONNECT') throw fail(400, 'confirmation_required');
        if (await store.disconnect({ p_organization_id: org, p_connection_id: row.id, p_actor_id: auth.user.id, p_expected_version: row.credential_version }) !== true) throw fail(409, 'account_changed');
        return json({ ok: true });
      }
      throw fail(405, 'method_not_allowed');
    } catch (error) {
      if (messengerKind) messenger.failure(error, 'request', messengerKind);
      if (nativeFlow) return nativeResult(error.code === 'denied' ? 'cancelled' : 'failed');
      return json({ ok: false, error: error.code || 'service_unavailable' }, error.status || 503, isCallback ? { 'Set-Cookie': cookie('') } : {});
    }
  };
}
