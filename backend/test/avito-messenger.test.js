'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const NOW = Date.parse('2026-10-20T12:00:00Z');
const ORG = '2d775d05-277d-4955-82cd-f2abfaa25311';
const ACTOR = 'd1915d6d-2f70-4c75-be95-454dd1b64dce';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';
const CHAT_SELECTOR = 'c1_' + Buffer.from('u2i-chat_1').toString('base64url');
const SECRET = 'test-provider-secret-not-returned';
const env = {
  AVITO_ACCOUNTS_ENABLED: '1', AVITO_CLIENT_INVITES_ENABLED: '1', AVITO_CALLBACK_LOGGING_CONFIRMED: 'true',
  AVITO_CLIENT_ID: 'test-client', AVITO_CLIENT_SECRET: 'test-client-secret',
  AVITO_PUBLIC_ORIGIN: 'https://avitoboss.online', AVITO_RELAY_SECRET: 'test-relay-secret',
  AVITO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  SUPABASE_URL: 'https://supabase.invalid', SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service'
};
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const message = (overrides = {}) => ({ id: 'message-1', type: 'text', created: 1792497600, author_id: 456, direction: 'in', is_read: false, content: { text: 'Hello', secret: SECRET }, access_token: SECRET, ...overrides });
const chat = () => ({ id: 'u2i-chat_1', created: 1792497500, updated: 1792497600, last_message: message(),
  users: [{ id: 123, name: 'Own account' }, { id: 456, name: 'Client', public_user_profile: { url: 'https://www.avito.ru/user/hash/profile', avatar: { default: 'https://www.avito.st/avatar.png' }, private: SECRET } }],
  context: { type: 'item', value: { id: 789, title: 'Avitologist', url: 'https://avito.ru/item_789', price_string: '100 RUB', private: SECRET } }, private: SECRET });

async function harness(source = 'personal', options = {}) {
  const accounts = await import('../../supabase/functions/_shared/avito-accounts-core.mjs');
  const invites = await import('../../supabase/functions/_shared/avito-invites-core.mjs');
  const oauth = await import('../../supabase/functions/_shared/avito-core.mjs');
  const base = '/api/integrations/' + (source === 'personal' ? 'avito-accounts/accounts' : 'avito-invites/connections');
  const row = { id: ACCOUNT, organization_id: ORG, avito_user_id: '123', display_name: 'Own', status: 'connected', credential_version: source === 'personal' ? OTHER : 1,
    scopes: options.scopes || ['user:read', 'messenger:read', 'messenger:write'], token_expires_at: new Date(NOW + 3600000).toISOString() };
  const encrypted = source === 'personal' ? await accounts.encryptAccountSecrets({ client_id: 'client-id', client_secret: SECRET, access_token: SECRET }, env.AVITO_TOKEN_ENCRYPTION_KEY, 'avito-personal:1:' + ORG + ':' + ACCOUNT) :
    await oauth.encryptTokens({ access_token: SECRET, refresh_token: 'refresh-not-returned' }, env.AVITO_TOKEN_ENCRYPTION_KEY, 'avito:1:' + ORG + ':' + ACCOUNT);
  const calls = [], reserves = [], logs = [];
  let role = options.role || 'owner', secretReads = 0, gets = 0;
  const get = async (org, id) => {
    gets++;
    if (options.onGet) options.onGet({ row, gets, setRole: value => { role = value; } });
    return org === ORG && id === ACCOUNT ? { ...row, scopes: row.scopes.slice() } : null;
  };
  const store = source === 'personal' ? {
    getAccount: get,
    async listAccounts() { return [{ ...row }]; },
    async listPreferences() { return []; },
    async getSecrets() { secretReads++; return { credential_version: row.credential_version, encrypted_payload: encrypted }; },
    async reserve(org, actor, action) { reserves.push({ org, actor, action }); return !options.rateLimit; }
  } : {
    get,
    async list() { return [{ ...row }]; },
    async secrets() { secretReads++; return { encrypted_tokens: encrypted }; },
    async reserve(value) { reserves.push(value); return !options.rateLimit; }
  };
  const fetch = async (input, init = {}) => {
    const url = new URL(input), auth = new Headers(init.headers).get('authorization');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    if (url.origin === env.SUPABASE_URL) {
      if (url.pathname === '/auth/v1/user') return auth === 'Bearer owner' ? response({ id: options.actor || ACTOR }) : response({ detail: SECRET }, 401);
      if (url.pathname === '/rest/v1/organization_members') return response(url.searchParams.get('organization_id') === 'eq.' + ORG ? [{ role }] : []);
      throw new Error('Unexpected storage request');
    }
    assert.equal(url.origin, 'https://api.avito.ru');
    assert.equal(auth, 'Bearer ' + SECRET);
    calls.push({ url, init });
    if (options.provider) return options.provider({ url, init, row, setRole: value => { role = value; } });
    if (url.pathname.endsWith('/read')) return response({ ok: true, secret: SECRET });
    if (init.method === 'POST') return response(message({ direction: 'out', content: { text: JSON.parse(init.body).message.text }, author_id: undefined }));
    if (url.pathname.includes('/messages/')) return response([message()]);
    return response({ chats: [chat()], secret: SECRET });
  };
  const messengerLogger = record => logs.push(structuredClone(record));
  const handler = source === 'personal' ? accounts.createAvitoAccountsHandler({ env, store, fetch, now: () => NOW, messengerLogger }) : invites.createAvitoInvitesHandler({ env, store, fetch, now: () => NOW, messengerLogger });
  async function request(tail = '/chats', { method = 'GET', body, query = '', token = 'owner', org = ORG, origin = env.AVITO_PUBLIC_ORIGIN, absolutePath } = {}) {
    const path = absolutePath || base + '/' + ACCOUNT + tail;
    const search = method === 'GET' ? '?organization_id=' + org + query : query;
    const sealed = body === undefined ? '' : JSON.stringify(await (source === 'personal' ? accounts.sealAccountRequest(body, env.AVITO_RELAY_SECRET, path) : invites.sealInviteRequest(body, env.AVITO_RELAY_SECRET, path)));
    const authorization = 'Bearer ' + token, timestamp = String(NOW / 1000);
    const signature = await accounts.signAccountRelayRequest({ timestamp, method, path: path + search, body: sealed, authorization }, env.AVITO_RELAY_SECRET);
    const result = await handler(new Request('https://edge.invalid' + path + search, { method, headers: { Authorization: authorization, Origin: origin, 'Content-Type': 'application/json', 'x-avito-relay-secret': signature, 'x-avito-relay-timestamp': timestamp }, body: method === 'POST' ? sealed : undefined }));
    const value = await result.json();
    assert.ok(!JSON.stringify(value).includes(SECRET));
    return { status: result.status, value };
  }
  return { request, row, calls, reserves, logs, base, setRole: value => { role = value; }, secretReads: () => secretReads };
}

for (const source of ['personal', 'oauth']) {
  test(source + ' Sasha manager can use chat but not manage accounts, money, credentials or other tenants', async () => {
    const h = await harness(source, { role: 'manager' });
    assert.equal((await h.request()).status, 200);
    assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/messages')).status, 200);
    assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/messages', { method: 'POST', body: { organization_id: ORG, text: 'Hello', request_id: REQUEST } })).status, 200);
    const catalog = h.base;
    const result = await h.request('', { absolutePath: catalog, query: '&messenger_access=1' });
    assert.equal(result.status, 200);
    assert.equal(result.value.cached_overviews, undefined);
    assert.equal((await h.request('', { absolutePath: catalog })).status, 403);
    assert.equal((await h.request('')).status, 403);
    assert.equal((await h.request('/bidding/items')).status, 403);
    assert.equal((await h.request('/disconnect', { method: 'POST', body: { organization_id: ORG, confirmation: 'DISCONNECT' } })).status, 403);
    assert.equal((await h.request('', { absolutePath: catalog, method: 'POST', body: { organization_id: ORG } })).status, 403);
    assert.equal((await h.request('', { absolutePath: catalog, query: '&messenger_access=1&messenger_access=1' })).status, 400);
    assert.equal((await h.request('/chats', { org: OTHER })).status, 403);
    h.setRole('viewer');
    assert.equal((await h.request()).status, 403);
    const other = await harness(source, { role: 'manager', actor: OTHER });
    assert.equal((await other.request()).status, 403);
  });
  test(source + ' messenger lists normalized chats and paginated history without auto-reading or exposing provider extras', async () => {
    const h = await harness(source);
    const result = await h.request('/chats', { query: '&limit=50&offset=0' });
    assert.equal(result.status, 200);
    const value = result.value.chats[0];
    assert.equal(value.counterparty.id, '456');
    assert.equal(value.counterparty.profile_url, 'https://www.avito.ru/user/hash/profile');
    assert.equal(value.item.id, '789');
    assert.equal(value.unread, true);
    assert.equal(value.last_message.text, 'Hello');
    assert.equal(result.value.pagination.has_more, false);
    assert.equal(value.id, CHAT_SELECTOR);
    const history = await h.request('/chats/' + CHAT_SELECTOR + '/messages', { query: '&limit=25&offset=10' });
    assert.equal(history.status, 200);
    assert.equal(history.value.messages[0].direction, 'in');
    assert.equal(h.calls[0].url.pathname, '/messenger/v2/accounts/123/chats');
    assert.equal(h.calls[0].url.searchParams.get('chat_types'), 'u2i,u2u');
    assert.equal(h.calls[1].url.pathname, '/messenger/v3/accounts/123/chats/u2i-chat_1/messages/');
    assert.equal(h.calls[1].url.searchParams.get('offset'), '10');
    assert.ok(h.calls.every(call => !call.init.method));
    assert.ok(h.calls.every(call => call.init.headers.Accept === 'application/json' && call.init.headers['Accept-Encoding'] === 'identity'));
    const cached = await h.request();
    assert.equal(cached.value.cached, true);
    assert.equal(h.calls.length, 2);
    assert.equal(h.reserves.length, 2);
    assert.equal(h.logs.length, 0, 'successful and cached reads are never logged');
  });
  test(source + ' messenger enforces tenant, role, pagination, origin and method boundaries before provider access', async () => {
    const h = await harness(source);
    for (const invalid of ['&limit=0', '&limit=101', '&offset=1001', '&offset=-1', '&limit=2&limit=3', '&access_token=secret', '&ads_stats=1']) assert.equal((await h.request('/chats', { query: invalid })).status, 400);
    assert.equal((await h.request('/chats', { org: OTHER })).status, 403);
    assert.equal((await h.request('/chats', { token: 'bad' })).status, 401);
    assert.equal((await h.request('/chats', { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/read')).status, 405);
    h.setRole('viewer');
    assert.equal((await h.request()).status, 403);
    assert.equal(h.calls.length, 0);
  });
  test(source + ' cached messenger data is not returned after access or connection revocation', async () => {
    const h = await harness(source);
    assert.equal((await h.request()).status, 200);
    h.setRole('viewer');
    assert.equal((await h.request()).status, 403);
    h.setRole('owner'); h.row.status = 'disconnected';
    assert.equal((await h.request()).value.error, 'account_disconnected');
    assert.equal(h.calls.length, 1);
  });
  test(source + ' messenger suppresses a provider response after concurrent disconnect or role removal', async () => {
    for (const mode of ['disconnect', 'role']) {
      const h = await harness(source, { provider: ({ row, setRole }) => { if (mode === 'disconnect') row.status = 'disconnected'; else setRole('viewer'); return response({ chats: [chat()] }); } });
      const result = await h.request();
      assert.equal(result.value.ok, false);
      assert.ok(!result.value.chats);
    }
  });
  test(source + ' explicit text send has bounded body, no automatic retry and exact documented provider payload', async () => {
    const h = await harness(source);
    const body = { organization_id: ORG, text: 'Hello client', request_id: REQUEST };
    const result = await h.request('/chats/' + CHAT_SELECTOR + '/messages', { method: 'POST', body });
    assert.equal(result.status, 200);
    assert.equal(result.value.message.text, 'Hello client');
    assert.deepEqual(JSON.parse(h.calls[0].init.body), { type: 'text', message: { text: 'Hello client' } });
    assert.equal(h.calls[0].url.pathname, '/messenger/v1/accounts/123/chats/u2i-chat_1/messages');
    assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/messages', { method: 'POST', body })).status, 200);
    assert.equal(h.calls.length, 1);
    assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/messages', { method: 'POST', body: { ...body, text: 'different' } })).value.error, 'request_conflict');
    for (const patch of [{ text: '' }, { text: 'x'.repeat(1001) }, { text: '\u0000' }, { request_id: 'not-uuid' }, { unexpected: true }]) assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/messages', { method: 'POST', body: { ...body, ...patch } })).status, 400);
    assert.equal(h.calls.length, 1);
    const read = await h.request('/chats/' + CHAT_SELECTOR + '/read', { method: 'POST', body: { organization_id: ORG } });
    assert.deepEqual(read.value, { ok: true });
    assert.equal(h.calls[1].url.pathname, '/messenger/v1/accounts/123/chats/u2i-chat_1/read');
  });
  test(source + ' uncertain send is never retried in this instance and provider errors contain only safe codes', async () => {
    const h = await harness(source, { provider: () => response({ token: SECRET, error: SECRET }, 500) });
    const options = { method: 'POST', body: { organization_id: ORG, text: 'Hello', request_id: REQUEST } };
    assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/messages', options)).value.error, 'send_unknown');
    assert.equal((await h.request('/chats/' + CHAT_SELECTOR + '/messages', options)).value.error, 'send_unknown');
    assert.equal(h.calls.length, 1);
    for (const status of [403, 429]) {
      const denied = await harness(source, { provider: () => response({ error: SECRET }, status) });
      assert.equal((await denied.request()).value.error, status === 403 ? 'permission_denied' : 'try_later');
    }
  });
  test(source + ' send rechecks account generation immediately before its external side effect', async () => {
    const h = await harness(source, { onGet: ({ row, gets }) => { if (gets === 3) row.status = 'disconnected'; } });
    const result = await h.request('/chats/' + CHAT_SELECTOR + '/messages', { method: 'POST', body: { organization_id: ORG, text: 'Hello', request_id: REQUEST } });
    assert.equal(result.value.error, 'account_disconnected');
    assert.equal(h.calls.length, 0);
  });
  test(source + ' failed messenger diagnostics distinguish HTTP failures from collection validation without sensitive data', async () => {
    for (const status of [400, 401, 403, 429, 500]) {
      const h = await harness(source, { provider: () => response({ secret: SECRET, token: SECRET, url: 'https://api.avito.ru/private/' + ACCOUNT, error: SECRET }, status) });
      await h.request();
      assert.equal(h.logs.length, 1, 'the helper and outer guard must not log the same error twice');
      assert.deepEqual(h.logs[0], { module: source, phase: 'provider', kind: 'chats', code: [401, 403].includes(status) ? 'permission_denied' : status === 429 ? 'try_later' : 'chat_unavailable', provider_status: status, reason: 'http_error' });
      assert.ok(!JSON.stringify(h.logs).includes(SECRET));
      assert.ok(!JSON.stringify(h.logs).includes(ACCOUNT));
      assert.ok(!JSON.stringify(h.logs).includes('https:'));
      assert.equal(h.calls.length, 1, 'HTTP failures are not retried');
    }
    const malformed = await harness(source, { provider: () => response({ chats: 'not-an-array', token: SECRET }) });
    await malformed.request();
    assert.deepEqual(malformed.logs, [{ module: source, phase: 'collection', kind: 'chats', code: 'chat_unavailable', provider_status: null, reason: 'collection_shape' }]);
    const invalidEntry = await harness(source, { provider: () => response({ chats: [{ ...chat(), id: '../not-a-supported-id' }] }) });
    await invalidEntry.request();
    assert.equal(invalidEntry.logs[0].phase, 'sanitize');
    const parseFailure = await harness(source, { provider: () => new Response(SECRET, { status: 200 }) });
    await parseFailure.request();
    assert.equal(parseFailure.logs[0].phase, 'provider');
    assert.equal(parseFailure.logs[0].provider_status, 200);
    assert.equal(parseFailure.logs[0].reason, 'content_type');
    assert.ok(!JSON.stringify(parseFailure.logs).includes(SECRET));
  });
  test(source + ' messenger transport diagnostics contain only fixed failure classes and never retry external writes', async () => {
    const jsonHeaders = { 'Content-Type': 'application/json' };
    const cases = [
      ['transport_error', null, () => { throw new Error(SECRET + ' https://api.avito.ru/private/' + ACCOUNT); }],
      ['timeout', null, () => { throw new DOMException(SECRET, 'TimeoutError'); }],
      ['content_type', 200, () => new Response('<html>' + SECRET + '</html>', { headers: { 'Content-Type': 'text/html' } })],
      ['invalid_json', 200, () => new Response(SECRET, { headers: jsonHeaders })],
      ['empty_body', 200, () => new Response('', { headers: jsonHeaders })],
      ['content_length', 200, () => new Response(SECRET, { headers: { ...jsonHeaders, 'Content-Length': '1048577' } })],
      ['body_size', 200, () => new Response(new Uint8Array(1048577), { headers: jsonHeaders })],
      ['invalid_utf8', 200, () => new Response(new Uint8Array([255]), { headers: jsonHeaders })],
      ['body_read_before_data', 200, () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError(SECRET)); } }), { headers: jsonHeaders })],
      ['body_read_after_data', 200, () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, pull(controller) { controller.error(new TypeError(SECRET)); } }), { headers: jsonHeaders })],
      ['timeout', 200, () => new Response(new ReadableStream({ start(controller) { controller.error(new DOMException(SECRET, 'AbortError')); } }), { headers: jsonHeaders })]
    ];
    for (const [reason, status, provider] of cases) {
      const h = await harness(source, { provider });
      const result = await h.request();
      assert.equal(result.value.error, 'chat_unavailable', reason);
      assert.deepEqual(h.logs, [{ module: source, phase: 'provider', kind: 'chats', code: 'chat_unavailable', provider_status: status, reason }]);
      assert.ok(!JSON.stringify(h.logs).includes(SECRET));
      assert.ok(!JSON.stringify(h.logs).includes(ACCOUNT));
      assert.ok(!JSON.stringify(h.logs).includes('https:'));
      const retryable = ['transport_error', 'timeout', 'body_read_before_data', 'body_read_after_data'].includes(reason);
      assert.equal(h.calls.length, retryable ? 2 : 1, 'only transient GET transports have exactly one retry');
      assert.equal(h.reserves.length, h.calls.length, 'each physical GET needs its own reservation');
    }
    for (const [reason, chats] of [['collection_size', Array.from({ length: 51 }, chat)], ['duplicate_ids', [chat(), chat()]]]) {
      const h = await harness(source, { provider: () => response({ chats, token: SECRET }) });
      await h.request();
      assert.equal(h.logs[0].reason, reason);
      assert.equal(h.logs.length, 1);
    }
    const uncertain = await harness(source, { provider: () => { throw new DOMException(SECRET, 'TimeoutError'); } });
    const options = { method: 'POST', body: { organization_id: ORG, text: 'Hello', request_id: REQUEST } };
    await uncertain.request('/chats/' + CHAT_SELECTOR + '/messages', options);
    await uncertain.request('/chats/' + CHAT_SELECTOR + '/messages', options);
    assert.equal(uncertain.calls.length, 1);
    assert.equal(uncertain.logs[0].reason, 'timeout');
  });
  test(source + ' messenger rejects explicit non-JSON before reading and accepts absent or suffix JSON types', async () => {
    let reads = 0, cancels = 0;
    const blocked = await harness(source, { provider: () => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }), body: {
      getReader() { reads++; throw new Error(SECRET); }, async cancel() { cancels++; }
    } }) });
    assert.equal((await blocked.request()).value.error, 'chat_unavailable');
    assert.equal(reads, 0);
    assert.equal(cancels, 1);
    assert.equal(blocked.logs[0].reason, 'content_type');
    for (const headers of [{}, { 'Content-Type': 'application/json; charset=utf-8' }, { 'Content-Type': 'application/vnd.avito+json' }]) {
      const accepted = await harness(source, { provider: () => new Response(new TextEncoder().encode(JSON.stringify({ chats: [chat()] })), { headers }) });
      assert.equal((await accepted.request()).status, 200);
      assert.equal(accepted.logs.length, 0);
    }
  });
  test(source + ' messenger retries one transient GET with fresh admission and caches only the successful safe result', async () => {
    for (const tail of ['/chats', '/chats/' + CHAT_SELECTOR + '/messages']) {
      let attempts = 0;
      const h = await harness(source, { provider: () => {
        if (++attempts === 1) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, pull(controller) { controller.error(new TypeError(SECRET)); } }), { headers: { 'Content-Type': 'application/json' } });
        return response(tail === '/chats' ? { chats: [chat()] } : [message()]);
      } });
      const result = await h.request(tail);
      assert.equal(result.status, 200);
      assert.equal(h.calls.length, 2);
      assert.equal(h.reserves.length, 2);
      assert.equal(h.logs.length, 0, 'successful retry logs no provider response or private data');
      assert.equal((await h.request(tail)).value.cached, true);
      assert.equal(h.calls.length, 2);
    }
  });
  test(source + ' transient retry rechecks revocation and generation before any second provider request', async () => {
    for (const mode of ['disconnect', 'role', 'generation']) {
      const h = await harness(source, { provider: ({ row, setRole }) => {
        if (mode === 'disconnect') row.status = 'disconnected';
        else if (mode === 'role') setRole('viewer');
        else row.credential_version = source === 'personal' ? REQUEST : 2;
        throw new TypeError(SECRET);
      } });
      const result = await h.request();
      assert.equal(result.value.ok, false);
      assert.equal(result.value.chats, undefined);
      assert.equal(h.calls.length, 1);
      assert.equal(h.reserves.length, 1);
      assert.equal(h.logs[0].phase, 'before_retry');
    }
    const options = { rateLimit: false, provider: () => { options.rateLimit = true; throw new TypeError(SECRET); } };
    const limited = await harness(source, options);
    assert.equal((await limited.request()).value.error, 'try_later');
    assert.equal(limited.calls.length, 1, 'retry admission denial never reaches provider');
    assert.equal(limited.reserves.length, 2);
  });
}

test('only read-only messenger calls get a longer streaming deadline; write deadlines and uncertain-send protection stay unchanged', async () => {
  const { createAvitoMessenger } = await import('../../supabase/functions/_shared/avito-messenger.mjs');
  const calls = [], row = { id: ACCOUNT, avito_user_id: '123', credential_version: 1 };
  const messenger = createAvitoMessenger({ async requestJson(...args) {
    calls.push(args);
    if (args[2] === 'chat_unavailable') return { chats: [chat()] };
    if (args[2] === 'messages_unavailable') return [message()];
    if (args[2] === 'read_unavailable') return { ok: true };
    return message({ direction: 'out' });
  } });
  const parameters = { row, org: ORG, token: SECRET, reserve: async () => {}, beforeSubmit: async () => {} };
  await messenger.read({ ...parameters, route: { action: 'chats' }, page: { limit: 50, offset: 0 } });
  await messenger.read({ ...parameters, route: { action: 'messages', chatId: CHAT_SELECTOR }, page: { limit: 50, offset: 0 } });
  const send = { ...parameters, route: { action: 'messages', chatId: CHAT_SELECTOR }, body: { text: 'Hello', request_id: REQUEST } };
  await messenger.write(send);
  await messenger.write(send);
  await messenger.write({ ...parameters, route: { action: 'read', chatId: CHAT_SELECTOR }, body: {} });
  assert.deepEqual(calls.map(args => [args[2], args[3], args[4]]), [
    ['chat_unavailable', 1048576, 35000], ['messages_unavailable', 1048576, 35000],
    ['send_unknown', 32768, 15000], ['read_unavailable', 32768, 15000]
  ]);
  assert.ok(calls.slice(0, 2).every(args => !args[1].method));
  assert.ok(calls.slice(2).every(args => args[1].method === 'POST'));
  assert.ok(calls.slice(0, 2).every(args => args[1].headers.Accept === 'application/json' && args[1].headers['Accept-Encoding'] === 'identity'));
  assert.ok(calls.slice(2).every(args => args[1].headers.Accept === undefined && args[1].headers['Accept-Encoding'] === undefined), 'write header behavior remains unchanged');
});

test('messenger logger projects only fixed enums and bounded status, tolerates logger errors and never changes failures', async () => {
  const { createAvitoMessenger } = await import('../../supabase/functions/_shared/avito-messenger.mjs');
  const records = [], error = Object.assign(new Error(SECRET), { code: SECRET, providerStatus: SECRET, messengerReason: SECRET, body: { token: SECRET }, stack: SECRET });
  const messenger = createAvitoMessenger({ requestJson() {}, module: SECRET, logger: record => records.push(record) });
  messenger.failure(error, SECRET, SECRET);
  messenger.failure(error, 'provider', 'send');
  assert.deepEqual(records, [{ module: 'unknown', phase: 'request', kind: 'chats', code: 'service_unavailable', provider_status: null, reason: null }]);
  assert.ok(!JSON.stringify(records).includes(SECRET));
  const throws = createAvitoMessenger({ requestJson() {}, logger() { throw new Error(SECRET); } });
  assert.doesNotThrow(() => throws.failure(error, 'request', 'chats'));
});

test('OAuth messenger checks actual granted scopes before secrets or provider access', async () => {
  const h = await harness('oauth', { scopes: ['user:read'] });
  assert.equal((await h.request()).value.error, 'messenger_read_required');
  assert.equal(h.secretReads(), 0);
  h.row.scopes.push('messenger:read');
  const send = await h.request('/chats/' + CHAT_SELECTOR + '/messages', { method: 'POST', body: { organization_id: ORG, text: 'Hello', request_id: REQUEST } });
  assert.equal(send.value.error, 'messenger_write_required');
  assert.equal(h.secretReads(), 0);
});

test('messenger sanitizers reject malformed collections and unsafe URLs without inventing profile links', async () => {
  const { safeMessengerChat, safeMessengerMessage, messengerRoute } = await import('../../supabase/functions/_shared/avito-messenger.mjs');
  const value = chat();
  delete value.last_message.is_read;
  value.users[1].public_user_profile.url = 'https://avito.ru.evil.invalid/profile';
  value.users[1].public_user_profile.avatar.default = 'javascript:alert(1)';
  const safe = safeMessengerChat(value, '123');
  assert.equal(safe.counterparty.profile_url, null);
  assert.equal(safe.counterparty.avatar_url, null);
  assert.equal(safe.unread, null);
  assert.equal(safeMessengerMessage(message({ content: { text: '<script>text</script>', link: { url: 'javascript:alert(1)' } } })).text, '<script>text</script>');
  assert.throws(() => safeMessengerChat({ ...value, users: [] , id: '../traversal' }, '123'));
  assert.equal(messengerRoute('/x/' + ACCOUNT + '/chats/%2e%2e/messages', '/x'), null);
  const bad = await harness('personal', { provider: () => response({ chats: [chat(), chat()] }) });
  assert.equal((await bad.request()).value.error, 'chat_unavailable');
  const wrapped = await harness('oauth', { provider: () => response({ messages: [message()], error: SECRET, access_token: SECRET }) });
  assert.equal((await wrapped.request('/chats/' + CHAT_SELECTOR + '/messages')).value.error, 'messages_unavailable');
});

test('optional chat previews may be absent or unusable without hiding valid chats; history and chat ids remain strict', async () => {
  const { safeMessengerChat } = await import('../../supabase/functions/_shared/avito-messenger.mjs');
  for (const preview of [undefined, null, {}, [], { id: '\u0000not-a-valid-id', type: 'text', content: { text: SECRET } }]) {
    const value = safeMessengerChat({ ...chat(), last_message: preview }, '123');
    assert.equal(value.id, CHAT_SELECTOR);
    assert.equal(value.last_message, null);
    assert.equal(value.counterparty.id, '456');
    assert.ok(!JSON.stringify(value).includes(SECRET));
  }
  for (const source of ['personal', 'oauth']) {
    const h = await harness(source, { provider: () => response({ chats: [{ ...chat(), last_message: {} }] }) });
    const result = await h.request();
    assert.equal(result.status, 200);
    assert.equal(result.value.chats.length, 1);
    assert.equal(result.value.chats[0].last_message, null);
    assert.equal(h.logs.length, 0);
    const history = await harness(source, { provider: () => response([{ id: '\u0000bad', type: 'text' }]) });
    assert.equal((await history.request('/chats/' + CHAT_SELECTOR + '/messages')).value.error, 'messages_unavailable');
  }
  assert.throws(() => safeMessengerChat({ ...chat(), id: '../bad', last_message: {} }, '123'), { code: 'chat_unavailable' });
  assert.throws(() => safeMessengerChat({ ...chat(), users: null, last_message: {} }, '123'), { code: 'chat_unavailable' });
  const unsupported = safeMessengerChat({ ...chat(), last_message: message({ type: 'video', content: {} }) }, '123');
  assert.equal(unsupported.last_message.type, 'video');
  assert.equal(unsupported.last_message.text, '');
});

test('optional absent participants remain unknown while malformed chat ids or users get fixed non-sensitive reasons', async () => {
  const { safeMessengerChat } = await import('../../supabase/functions/_shared/avito-messenger.mjs');
  const missing = chat(); delete missing.users;
  const safe = safeMessengerChat(missing, '123');
  assert.deepEqual(safe.users, []);
  assert.equal(safe.counterparty, null);
  for (const [patch, reason] of [
    [{ id: undefined }, 'chat_id_missing'], [{ id: 'private%chat' }, 'id_other'],
    [{ users: null }, 'users_shape'], [{ users: {} }, 'users_shape'],
    [{ users: Array.from({ length: 21 }, () => ({ id: 123 })) }, 'users_count'],
    [{ users: [null] }, 'user_shape'], [{ users: [[]] }, 'user_shape']
  ]) {
    const h = await harness('personal', { provider: () => response({ chats: [{ ...chat(), ...patch }] }) });
    const result = await h.request();
    assert.equal(result.value.error, 'chat_unavailable');
    assert.equal(h.logs[0].phase, 'sanitize');
    assert.equal(h.logs[0].reason, reason);
    assert.ok(!JSON.stringify(h.logs).includes('private%chat'));
    assert.ok(!JSON.stringify(h.logs).includes(SECRET));
  }
  const h = await harness('personal', { provider: () => response({ chats: [missing] }) });
  const result = await h.request();
  assert.equal(result.status, 200);
  assert.deepEqual(result.value.chats[0].users, []);
  assert.equal(h.logs.length, 0);
});

test('unsafe provider id diagnostics expose only fixed classes, never identifier content', async () => {
  for (const [id, reason] of [
    ['x'.repeat(201) + ':private', 'id_length'], ['..', 'id_dot'],
    ['private/chat', 'id_slash'], ['private\\chat', 'id_slash'],
    ['private%chat', 'id_other'], ['private?chat', 'id_other'], [1.5, 'id_other']
  ]) {
    const h = await harness('personal', { provider: () => response({ chats: [{ ...chat(), id }] }) });
    await h.request();
    assert.equal(h.logs.length, 1);
    assert.equal(h.logs[0].reason, reason);
    assert.ok(!JSON.stringify(h.logs).includes(String(id)));
    assert.deepEqual(Object.keys(h.logs[0]).sort(), ['code', 'kind', 'module', 'phase', 'provider_status', 'reason']);
  }
});

test('opaque chat selectors round-trip safe numeric, punctuation and UTF-8 IDs under unchanged 200-character routes', async () => {
  const { messengerChatSelector, decodeMessengerChatSelector, messengerRoute, safeMessengerMessage } = await import('../../supabase/functions/_shared/avito-messenger.mjs');
  for (const raw of [123456789, 'u2i-chat_1', 'part:thread', 'part.thread@id', 'raw+base64==', 'чат-диалог', 'x'.repeat(147)]) {
    const selector = messengerChatSelector(raw);
    assert.match(selector, /^c1_[A-Za-z0-9_-]+$/);
    assert.ok(selector.length <= 200);
    assert.equal(decodeMessengerChatSelector(selector), String(raw));
    assert.equal(messengerRoute('/api/accounts/' + ACCOUNT + '/chats/' + selector + '/messages', '/api/accounts').chatId, selector);
  }
  for (const raw of ['', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '.', '..', '../private', 'a/b', 'a\\b', 'a%2fb', 'a?b', 'a#b', 'a\u0000b', '\ud800', 'x'.repeat(148), 'я'.repeat(74)]) assert.throws(() => messengerChatSelector(raw), { code: 'chat_unavailable' });
  for (const selector of ['legacy-chat', 'c1_', 'c1_A', 'c1_YQ==', 'c1_YR', 'c1__w', 'c1_Lg', 'c1_Li4', 'c1_Lw', 'c1_JTJm', 'c1_' + 'YQ'.repeat(100)]) assert.throws(() => decodeMessengerChatSelector(selector), { code: 'invalid_request' });
  assert.equal(safeMessengerMessage(message({ id: 1234 })).id, '1234');
  assert.equal(safeMessengerMessage(message({ id: 'message:part+base64=/not-a-path' })).id, 'message:part+base64=/not-a-path');
  for (const id of ['', '\u0000', '\ud800', 'x'.repeat(513)]) assert.throws(() => safeMessengerMessage(message({ id })), { code: 'messages_unavailable' });
});

for (const source of ['personal', 'oauth']) {
  test(source + ' list opaque selector decodes once into an encoded provider segment for history, mark-read and explicit send', async () => {
    const rawId = 'u2i:raw+base64==', encoded = encodeURIComponent(rawId);
    const h = await harness(source, { provider: ({ url, init }) => {
      if (url.pathname.endsWith('/chats')) return response({ chats: [{ ...chat(), id: rawId }] });
      assert.ok(url.pathname.includes('/chats/' + encoded + '/'));
      if (url.pathname.endsWith('/read')) return response({ ok: true });
      if (init.method === 'POST') return response(message({ id: 'sent:message+id==', direction: 'out' }));
      return response([message({ id: 'inbound:message+id==' })]);
    } });
    const list = await h.request();
    const selector = list.value.chats[0].id;
    assert.match(selector, /^c1_[A-Za-z0-9_-]+$/);
    assert.notEqual(selector, rawId);
    assert.equal((await h.request('/chats/' + selector + '/messages')).value.messages[0].id, 'inbound:message+id==');
    assert.equal((await h.request('/chats/' + selector + '/read', { method: 'POST', body: { organization_id: ORG } })).status, 200);
    assert.equal((await h.request('/chats/' + selector + '/messages', { method: 'POST', body: { organization_id: ORG, text: 'Explicit reply', request_id: REQUEST } })).status, 200);
    assert.equal(h.logs.length, 0);
    assert.equal(h.calls.length, 4);
    const before = h.calls.length;
    assert.equal((await h.request('/chats/c1_Li4/messages')).value.error, 'invalid_request');
    assert.equal(h.calls.length, before, 'a forged traversal selector must never reach the provider');
  });
  test(source + ' history accepts direct arrays or strict messages wrappers, rejects error envelopes and keeps projections bounded', async () => {
    for (const wrap of [values => values, values => ({ messages: values, access_token: SECRET, private: SECRET })]) {
      const h = await harness(source, { provider: () => response(wrap([message({ id: 'message:opaque+id==' })])) });
      const result = await h.request('/chats/' + CHAT_SELECTOR + '/messages');
      assert.equal(result.status, 200);
      assert.equal(result.value.messages.length, 1);
      assert.equal(result.value.messages[0].id, 'message:opaque+id==');
      assert.ok(!JSON.stringify(result.value).includes(SECRET));
      assert.equal(h.logs.length, 0);
    }
    for (const envelope of [
      { messages: [message()], error: null }, { messages: [message()], code: 0 },
      { messages: [message()], error_description: '' }, { result: { messages: [message()] } },
      { messages: {} }, { messages: Array.from({ length: 51 }, (_, index) => message({ id: 'm' + index })) }
    ]) {
      const h = await harness(source, { provider: () => response(envelope) });
      const result = await h.request('/chats/' + CHAT_SELECTOR + '/messages');
      assert.equal(result.value.error, 'messages_unavailable');
      assert.equal(result.value.messages, undefined);
      assert.equal(h.logs[0].phase, 'collection');
    }
  });
}

test('Messenger implementation uses documented versions and excludes account keys, automatic marks and webhooks', () => {
  const source = fs.readFileSync(require.resolve('../../supabase/functions/_shared/avito-messenger.mjs'), 'utf8');
  assert.match(source, /\/messenger\/v2\/accounts\//);
  assert.match(source, /\/messenger\/v3\/accounts\//);
  assert.match(source, /\/messenger\/v1\/accounts\//);
  assert.doesNotMatch(source, /webhook|client_secret|encrypted_payload|console\./);
});

