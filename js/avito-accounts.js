(function () {
  'use strict';

  var BASE = '/api/integrations/avito-accounts';
  var INVITES_BASE = '/api/integrations/avito-invites';
  var INVITE_SCOPES = ['messenger:read', 'messenger:write', 'user:read', 'items:info', 'user_operations:read', 'autoload:reports', 'items:apply_vas', 'stats:read', 'ratings:read', 'ratings:write', 'job:negotiations', 'user_balance:read', 'special_offers:sending', 'short_term_rent:read'];
  var SESSION_KEY = 'avitolog_avito_accounts_session';
  var ORG_KEY = 'avitolog_avito_accounts_organization';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var adsBridge = adsBridgeContext();
  var workspaceBridge = workspaceBridgeContext();
  var ADS_PARENT_ORIGIN = 'https://hair1guru1school-cyber.github.io';
  var ADS_METRICS = ['views', 'contacts', 'contactsShowPhone', 'contactsMessenger', 'favorites', 'spending'];
  var LEGACY_KEYS = [
    ['session', 'avitolog_avito_session'],
    ['session', 'avitolog_backend_preview_session'],
    ['session', 'avitolog_backend_app_session'],
    ['local', 'avitolog_backend_session_v1']
  ];
  var dayWatchStarted = false;
  var retryTimer = null, retryRunning = false, overviewQueueRuns = 0;
  var pendingSnapshots = Object.create(null);
  var overviewTail = Promise.resolve();
  var localSignedOut = false;
  var authGeneration = 0;
  var refreshPromise = null;
  var sessionRevision = null;
  var adsAccountsCache = null;
  var workspaceCatalogTask = null;
  var state = { session: null, configuration: null, storageReady: false, inviteConfiguration: null, inviteStorageReady: false, invitation: null, inviteRecords: Object.create(null), disconnectSource: '', organizations: [], organizationId: '', accounts: [], selectedId: '', reconnectId: '', disconnectId: '', busy: false, listLoaded: false, snapshotOrganizationId: '', snapshots: Object.create(null), listGeneration: 0, detailGeneration: 0, preferences: Object.create(null), preferencesReady: false, credentialTarget: '', credentialMode: '', aliasTarget: null, overviewTask: null, preferenceTask: null };
  state.tariffPayments = Object.create(null);
  var paymentRequests = Object.create(null);
  var viewCacheTimer = null, viewCacheEpoch = 0;
  function viewCacheScope() {
    var uid=state.session&&jwtSubject(state.session.access_token),org=state.organizationId;
    if(!UUID.test(uid||'')||!UUID.test(org||'')||!canManage())return '';
    var params=new URL(window.location.href).searchParams,profile=params.get('profile')||'standalone';
    if(params.has('embedded')&&(params.get('expected_user_id')!==uid||params.get('organization_id')!==org||['fil','sasha'].indexOf(profile)<0))return '';
    return uid+'|'+profile+'|'+org;
  }
  function cachedAccount(account) {
    var value={};['id','source','avito_user_id','credential_version','status','display_name','created_at','updated_at','connected_at','last_validated_at'].forEach(function(key){if(typeof account[key]==='string'||typeof account[key]==='number')value[key]=account[key];});return value;
  }
  function saveAccountsView() {
    if(viewCacheTimer!==null)return;
    if(!window.AVBStartupCache||!state.listLoaded||state.cachedPreview||!viewCacheScope())return;
    var owner=viewCacheScope(),epoch=viewCacheEpoch;
    viewCacheTimer=setTimeout(function(){
      viewCacheTimer=null;
      if(owner!==viewCacheScope()||epoch!==viewCacheEpoch||state.cachedPreview)return;
      var snapshots={};state.accounts.forEach(function(account){var id=accountKey(account),entry=state.snapshots[id],payload=entry&&entry.payload,overview=payload&&safeCachedOverview(payload.overview);if(!overview||!sameSnapshotIdentity(entry,account))return;var balance=payload.balance||{},safeBalance={available:balance.available===true,real:typeof balance.real==='number'&&Number.isFinite(balance.real)?balance.real:null,bonus:typeof balance.bonus==='number'&&Number.isFinite(balance.bonus)?balance.bonus:null};snapshots[id]={payload:{account:cachedAccount(account),overview:overview,balance:safeBalance},attemptedAt:0,reused:true,cachedOnly:true};});
      window.AVBStartupCache.write('accounts:'+owner,{accounts:state.accounts.map(cachedAccount),snapshots:snapshots,preferences:state.preferences,layout:state.layout,selectedId:state.selectedId},function(){return owner===viewCacheScope()&&epoch===viewCacheEpoch;});
    },750);
  }
  async function restoreAccountsView() {
    if(!window.AVBStartupCache||state.listLoaded)return;
    var owner=viewCacheScope(),epoch=viewCacheEpoch,generation=state.listGeneration;
    if(!owner)return;
    var saved=await window.AVBStartupCache.read('accounts:'+owner,function(){return owner===viewCacheScope()&&epoch===viewCacheEpoch;});
    if(!saved||!Array.isArray(saved.accounts)||saved.accounts.length>2000||state.listLoaded||owner!==viewCacheScope()||epoch!==viewCacheEpoch||generation!==state.listGeneration)return;
    var accounts=saved.accounts.filter(function(a){return a&&UUID.test(a.id||'')&&/^[1-9][0-9]{0,24}$/.test(String(a.avito_user_id||''))&&['oauth','personal',undefined].indexOf(a.source)>=0;}).map(cachedAccount);
    if(!accounts.length)return;
    state.cachedPreview=true;state.accounts=accounts;
    if(!state.preferencesReady&&saved.preferences&&typeof saved.preferences==='object')state.preferences=saved.preferences;
    if(!state.layoutReady&&saved.layout)state.layout=checkedLayout({revision:0,layout:saved.layout});
    accounts.forEach(function(account){var id=accountKey(account),entry=saved.snapshots&&saved.snapshots[id],overview=entry&&entry.payload&&safeCachedOverview(entry.payload.overview);if(overview&&sameSnapshotIdentity(entry,account))state.snapshots[id]={payload:{account:account,overview:overview,balance:entry.payload.balance||{}},attemptedAt:0,reused:true,cachedOnly:true};});
    state.selectedId='';renderAccounts();notice('Предыдущие данные · обновляем в фоне. До проверки списка доступен только просмотр.','info');
  }

  function byId(id) { return document.getElementById(id); }
  function securePage() { return window.location.protocol === 'https:' && window.location.hostname === 'avitoboss.online'; }
  function text(id, value) { byId(id).textContent = value == null ? '' : String(value); }
  function element(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function parsed(raw) { try { return JSON.parse(raw || 'null'); } catch (error) { return null; } }
  function adsBridgeContext() {
    try {
      var params = new URL(window.location.href).searchParams;
      if (!params.has('adsBridge')) return { enabled: false };
      var userId = (params.get('expected_user_id') || '').toLowerCase();
      var organizationId = (params.get('organization_id') || '').toLowerCase();
      var valid = params.get('adsBridge') === '1' && !params.has('embedded') && UUID.test(userId) && UUID.test(organizationId);
      ['adsBridge', 'expected_user_id', 'organization_id'].forEach(function (key) { if (params.getAll(key).length !== 1) valid = false; });
      return { enabled: true, valid: valid, userId: userId, organizationId: organizationId };
    } catch (error) { return { enabled: false, valid: false }; }
  }
  function workspaceBridgeContext() {
    try {
      var params = new URL(window.location.href).searchParams;
      if (!params.has('workspaceBridge')) return { enabled: false };
      var userId = (params.get('expected_user_id') || '').toLowerCase();
      var organizationId = (params.get('organization_id') || '').toLowerCase();
      var valid = params.get('workspaceBridge') === '1' && !params.has('adsBridge') && !params.has('embedded') && UUID.test(userId) && UUID.test(organizationId);
      ['workspaceBridge', 'expected_user_id', 'organization_id'].forEach(function (key) { if (params.getAll(key).length !== 1) valid = false; });
      return { enabled: true, valid: valid, userId: userId, organizationId: organizationId };
    } catch (error) { return { enabled: true, valid: false }; }
  }
  function startWorkspaceBridge() {
    // This bridge never transfers a session or credentials to the CRM origin.
    adsBridge = workspaceBridge;
    var running = 0;
    window.addEventListener('message', async function (event) {
      if (event.source !== window.parent || window.parent === window || [ADS_PARENT_ORIGIN, 'https://avitoboss.online'].indexOf(event.origin) === -1) return;
      var data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.type !== 'avitolog:workspace:request' || typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(data.requestId)) return;
      var reply = { type: 'avitolog:workspace:response', requestId: data.requestId, ok: false };
      var ownsSlot = false;
      try {
        if (!securePage() || !workspaceBridge.valid || Object.keys(data).some(function (key) { return ['type', 'requestId', 'action', 'accountId', 'chatId', 'offset', 'text', 'sendId'].indexOf(key) === -1; })) throw adsBridgeError('invalid_request');
        var fields = { accounts: [], overview: ['accountId'], chats: ['accountId', 'offset'], messages: ['accountId', 'chatId', 'offset'], send: ['accountId', 'chatId', 'text', 'sendId'], read: ['accountId', 'chatId'] };
        if (!fields[data.action] || Object.keys(data).some(function (key) { return ['type', 'requestId', 'action'].concat(fields[data.action]).indexOf(key) === -1; })) throw adsBridgeError('invalid_request');
        if (['accounts', 'overview', 'chats', 'messages', 'send', 'read'].indexOf(data.action) === -1 || running >= 3) throw adsBridgeError('busy');
        running += 1; ownsSlot = true;
        var accounts = await workspaceBridgeAccounts();
        if (data.action === 'accounts') {
          if (Object.keys(data).length !== 3) throw adsBridgeError('invalid_request');
          reply.accounts = Object.keys(accounts).map(function (key) {
            var account = accounts[key], source = account.oauth ? 'oauth' : 'personal';
            return { id: source + ':' + account.id, account_id: account.id, source: source, avito_user_id: account.avitoUserId, display_name: account.name };
          });
        } else {
          var account = Object.keys(accounts).map(function (key) { return accounts[key]; }).find(function (item) { return (item.oauth ? 'oauth:' : 'personal:') + item.id === data.accountId; });
          if (!account) throw adsBridgeError('account_forbidden');
          var path = (account.oauth ? '/connections/' : '/accounts/') + encodeURIComponent(account.id);
          var options = { invites: account.oauth }, query = '?organization_id=' + encodeURIComponent(workspaceBridge.organizationId);
          if (data.action === 'overview') {
            if (Object.keys(data).some(function (key) { return ['type', 'requestId', 'action', 'accountId'].indexOf(key) === -1; })) throw adsBridgeError('invalid_request');
            var details = await adsBridgeApi(path + query, account.oauth);
            if (!details.account || String(details.account.id) !== account.id || String(details.account.avito_user_id) !== account.avitoUserId) throw adsBridgeError('account_forbidden');
            reply.overview = Object.assign({}, details.overview || {}, { balance: details.balance || null, profile: details.profile || null });
          } else {
            var offset = data.offset === undefined ? 0 : data.offset;
            if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000) throw adsBridgeError('invalid_request');
            path += '/chats';
            if (data.action !== 'chats') {
              if (typeof data.chatId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(data.chatId)) throw adsBridgeError('invalid_request');
              path += '/' + encodeURIComponent(data.chatId) + (data.action === 'read' ? '/read' : '/messages');
            }
            if (data.action === 'send' || data.action === 'read') {
              if (data.action === 'send' && (typeof data.text !== 'string' || !data.text.trim() || Array.from(data.text).length > 1000 || !UUID.test(data.sendId || ''))) throw adsBridgeError('invalid_request');
              options.method = 'POST';
              options.body = { organization_id: workspaceBridge.organizationId };
              if (data.action === 'send') Object.assign(options.body, { text: data.text, request_id: data.sendId });
            } else path += query + '&limit=50&offset=' + offset;
            await adsBridgeSession();
            reply.result = await api(path, options);
          }
        }
        await adsBridgeSession();
        reply.ok = true;
      } catch (error) {
        delete reply.result; delete reply.overview; delete reply.accounts;
        var allowed = ['auth_required', 'subject_mismatch', 'organization_forbidden', 'account_forbidden', 'invalid_request', 'busy', 'messenger_read_required', 'messenger_write_required', 'permission_denied', 'try_later', 'chat_unavailable', 'messages_unavailable', 'send_unknown'];
        var code = error.bridgeCode || error.code;
        if (error.status === 401) code = 'auth_required';
        if (error.status === 403 && allowed.indexOf(code) === -1) code = 'organization_forbidden';
        reply.code = allowed.indexOf(code) === -1 ? 'unavailable' : code;
        if (['auth_required', 'subject_mismatch', 'organization_forbidden', 'account_forbidden'].indexOf(reply.code) !== -1) adsAccountsCache = null;
      } finally { if (ownsSlot) running -= 1; }
      window.parent.postMessage(reply, event.origin);
    });
  }
  function adsBridgeError(code) { return Object.assign(new Error('ADS bridge request rejected'), { bridgeCode: code }); }
  function adsBridgeFailure(entries) {
    var errors = entries.map(function (entry) { return entry.error; }).filter(Boolean);
    return errors.filter(function (error) { return ['auth_required', 'subject_mismatch', 'organization_forbidden', 'account_forbidden'].indexOf(error.bridgeCode) !== -1 || error.status === 401 || error.status === 403; })[0] || errors[0];
  }
  async function adsBridgeSession() {
    var store = window.AVITOLOG_AVITO_SESSION_STORE;
    if (store && typeof store.readVersioned === 'function') {
      var latest;
      try { latest = await store.readVersioned(); } catch (error) { throw adsBridgeError('auth_required'); }
      if (!latest || !latest.available) throw adsBridgeError('auth_required');
      var durable = !latest.signedOut && sessionValue(latest.session, true);
      if (!durable) {
        markLocalSignedOut();
        throw adsBridgeError('auth_required');
      }
      if (localSignedOut || !state.session || state.session.access_token !== durable.access_token || sessionRevision !== latest.revision) {
        authGeneration += 1;
        refreshPromise = null;
        localSignedOut = false;
        rememberCurrentSession(durable, latest.revision);
      }
    }
    var session = await activeSession(false);
    if (!session) throw adsBridgeError('auth_required');
    if (jwtSubject(session.access_token) !== adsBridge.userId) throw adsBridgeError('subject_mismatch');
    return session;
  }
  async function adsBridgeApi(path, invites) {
    await adsBridgeSession();
    var payload = await api(path, { invites: invites === true });
    await adsBridgeSession();
    return payload;
  }
  async function workspaceBridgeAccounts() {
    await adsBridgeSession();
    if (workspaceCatalogTask) return workspaceCatalogTask;
    var task = adsBridgeAccounts();
    workspaceCatalogTask = task;
    try { return await task; }
    finally { if (workspaceCatalogTask === task) workspaceCatalogTask = null; }
  }
  async function adsBridgeAccounts() {
    var session = await adsBridgeSession();
    if (adsAccountsCache && adsAccountsCache.expiresAt > Date.now() && adsAccountsCache.token === session.access_token && adsAccountsCache.revision === sessionRevision) return adsAccountsCache.accounts;
    // Workspace already pins the JWT subject. Each metadata endpoint verifies that
    // JWT and exact-org owner/admin access; /context only adds redundant health probes.
    if (!workspaceBridge.enabled) {
      var context = await adsBridgeApi('/context');
      if (!context.user || String(context.user.id || '').toLowerCase() !== adsBridge.userId) throw adsBridgeError('subject_mismatch');
      if (!Array.isArray(context.organizations) || !context.organizations.some(function (org) {
        return String(org.id || '').toLowerCase() === adsBridge.organizationId && (org.role === 'owner' || org.role === 'admin');
      })) throw adsBridgeError('organization_forbidden');
    }
    var query = '?organization_id=' + encodeURIComponent(adsBridge.organizationId);
    var metadata = await Promise.all([
      adsBridgeApi('/accounts' + query),
      adsBridgeApi('/connections' + query, true),
      adsBridgeApi('/preferences' + query)
    ].map(function (task) { return task.then(function (payload) { return { payload: payload }; }, function (error) { return { error: error }; }); }));
    var metadataFailure = adsBridgeFailure(metadata);
    if (metadataFailure) throw metadataFailure;
    var personal = metadata[0].payload, oauth = metadata[1].payload, preferences = metadata[2].payload;
    if (!Array.isArray(personal.accounts) || !Array.isArray(oauth.connections) || !Array.isArray(preferences.preferences)) throw adsBridgeError('unavailable');
    var names = Object.create(null);
    preferences.preferences.forEach(function (item) {
      var id = String(item && item.avito_user_id || '');
      if (/^[0-9]{1,25}$/.test(id) && typeof item.display_name === 'string' && item.display_name.trim()) names[id] = item.display_name.slice(0, 200);
    });
    var accounts = Object.create(null);
    // Business ownership is selected explicitly in ADS, never inferred from OAuth consent.
    [personal.accounts, oauth.connections].forEach(function (rows, index) {
      rows.forEach(function (account) {
        var id = String(account && account.avito_user_id || '');
        if (!account || !UUID.test(String(account.id || '')) || !/^[0-9]{1,25}$/.test(id) || !activeAccount(account) || accounts[id]) return;
        accounts[id] = { id: account.id, avitoUserId: id, name: names[id] || (typeof account.display_name === 'string' ? account.display_name.slice(0, 200) : 'Avito'), oauth: index === 1 };
      });
    });
    session = await adsBridgeSession();
    adsAccountsCache = { accounts: accounts, token: session.access_token, revision: sessionRevision, expiresAt: Date.now() + 15000 };
    return accounts;
  }
  function safeAdsBridgeStatistics(overview) {
    overview = overview && typeof overview === 'object' ? overview : {};
    var date = moscowDay(), end = Date.parse(date + 'T00:00:00Z');
    var dates = Array.from({ length: 30 }, function (_, index) { return new Date(end - (29 - index) * 86400000).toISOString().slice(0, 10); });
    function metrics(value) {
      var result = {};
      ADS_METRICS.forEach(function (key) { var n = value && value[key]; result[key] = typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null; });
      return result;
    }
    var today = overview.today || {}, history = overview.history || {};
    var validToday = today.available === true && today.date === date;
    var validHistory = history.available === true && history.dateFrom === dates[0] && history.dateTo === date && Array.isArray(history.days) && history.days.length === 30 && history.days.every(function (day, index) { return day && day.date === dates[index]; });
    return {
      today: Object.assign({ available: validToday, date: date, timezone: 'Europe/Moscow' }, metrics(validToday ? today : null)),
      history: { available: validHistory, dateFrom: dates[0], dateTo: date, timezone: 'Europe/Moscow', days: dates.map(function (day, index) { return Object.assign({ date: day }, metrics(validHistory ? history.days[index] : null)); }), totals: metrics(validHistory ? history.totals : null) }
    };
  }
  function startAdsBridge() {
    var running = false;
    window.addEventListener('message', async function (event) {
      if (event.source !== window.parent || window.parent === window || event.origin !== ADS_PARENT_ORIGIN) return;
      var data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.type !== 'avitolog:ads:request' || typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(data.requestId)) return;
      var reply = { type: 'avitolog:ads:response', requestId: data.requestId, ok: false };
      try {
        if (!securePage() || !adsBridge.valid || Object.keys(data).some(function (key) { return ['type', 'requestId', 'action', 'accountIds'].indexOf(key) === -1; }) || ['accounts', 'metrics'].indexOf(data.action) === -1) throw adsBridgeError('invalid_request');
        if (running) throw adsBridgeError('busy');
        var ids = data.accountIds;
        if (data.action === 'metrics' && (!Array.isArray(ids) || !ids.length || ids.length > 4 || ids.some(function (id, index) { return typeof id !== 'string' || !/^[0-9]{1,25}$/.test(id) || ids.indexOf(id) !== index; }))) throw adsBridgeError('invalid_request');
        if (data.action === 'accounts' && ids !== undefined) throw adsBridgeError('invalid_request');
        running = true;
        try {
          var accounts = await adsBridgeAccounts();
          if (data.action === 'accounts') reply.accounts = Object.keys(accounts).map(function (id) { return { avitoUserId: id, name: accounts[id].name }; });
          else {
            if (ids.some(function (id) { return !accounts[id]; })) throw adsBridgeError('account_forbidden');
            var statistics = [];
            for (var index = 0; index < ids.length; index += 2) {
              // Drain each small batch even on failure so requests cannot overlap a later bridge job.
              var batch = await Promise.all(ids.slice(index, index + 2).map(async function (id) {
                try {
                  var account = accounts[id];
                  var payload = await adsBridgeApi((account.oauth ? '/connections/' : '/accounts/') + encodeURIComponent(account.id) + '?organization_id=' + encodeURIComponent(adsBridge.organizationId) + '&ads_stats=1', account.oauth);
                  if (!payload.account || String(payload.account.avito_user_id || '') !== account.avitoUserId || String(payload.account.id || '') !== String(account.id)) throw adsBridgeError('unavailable');
                  return { statistic: Object.assign({ avitoUserId: account.avitoUserId, name: account.name }, safeAdsBridgeStatistics(payload.overview)) };
                } catch (error) { return { error: error }; }
              }));
              var failure = adsBridgeFailure(batch);
              if (failure) throw failure;
              batch.forEach(function (entry) { statistics.push(entry.statistic); });
            }
            reply.statistics = statistics;
          }
          await adsBridgeSession();
          reply.ok = true;
        } finally { running = false; }
      } catch (error) {
        if (['auth_required', 'subject_mismatch', 'organization_forbidden', 'account_forbidden'].indexOf(error.bridgeCode) !== -1 || error.status === 401 || error.status === 403) adsAccountsCache = null;
        reply = { type: 'avitolog:ads:response', requestId: data.requestId, ok: false, code: error.bridgeCode || (error.status === 401 ? 'auth_required' : error.status === 403 ? 'organization_forbidden' : 'unavailable') };
      }
      window.parent.postMessage(reply, ADS_PARENT_ORIGIN);
    });
  }
  function jwtSubject(token) {
    try {
      var part = String(token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      var id = String(JSON.parse(atob(part)).sub || '').toLowerCase();
      return UUID.test(id) ? id : '';
    } catch (error) { return ''; }
  }
  function jwtExpiry(token) {
    try {
      var part = String(token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      return Number(JSON.parse(atob(part)).exp || 0);
    } catch (error) { return 0; }
  }
  function sessionValue(value, owned) {
    var source = value && value.session && value.session.access_token ? value.session : value;
    if (!source || !source.access_token) return null;
    return { access_token: String(source.access_token), refresh_token: String(source.refresh_token || ''), expires_at: Number(source.expires_at || jwtExpiry(source.access_token)), owned: owned };
  }
  function storedSession() {
    var sessions = [];
    try { var own = sessionValue(parsed(sessionStorage.getItem(SESSION_KEY)), true); if (own) sessions.push(own); } catch (error) {}
    LEGACY_KEYS.forEach(function (entry) {
      try {
        var candidate = sessionValue(parsed((entry[0] === 'local' ? localStorage : sessionStorage).getItem(entry[1])), false);
        if (candidate) sessions.push(candidate);
      } catch (error) {}
    });
    var cutoff = Date.now() / 1000 + 60;
    sessions.sort(function (a, b) { return Number(!b.expires_at || b.expires_at > cutoff) - Number(!a.expires_at || a.expires_at > cutoff) || Number(b.owned) - Number(a.owned) || b.expires_at - a.expires_at; });
    return sessions[0] || null;
  }
  async function saveSession(payload, fallback) {
    var session = sessionValue({ access_token: payload.access_token, refresh_token: payload.refresh_token || fallback || '', expires_at: Number(payload.expires_at) || Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600) }, true);
    if (!session) throw new Error('Не удалось получить сессию входа');
    authGeneration += 1;
    refreshPromise = null;
    sessionRevision = null;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (error) {}
    state.session = session;
    localSignedOut = false;
    var store = window.AVITOLOG_AVITO_SESSION_STORE;
    if (store && typeof store.write === 'function' && !await store.write(session)) notice('Вход выполнен, но браузер не разрешил сохранить его после закрытия. Не очищайте данные сайта.', 'info');
    return session;
  }
  function unauthorized() { var error = new Error('Сессия истекла. Войдите снова.'); error.status = 401; return error; }
  function serverError(payload, status) {
    var code = payload && (payload.error || payload.code);
    var messages = {
      configuration: 'Модуль API ещё не настроен на сервере',
      integration_disabled: 'Модуль API пока выключен',
      storage_unavailable: 'Безопасное хранилище аккаунтов недоступно',
      authentication_required: 'Сессия истекла. Войдите снова.',
      forbidden: 'Недостаточно прав для этого действия',
      permission_denied: 'Avito не предоставил права на эти данные',
      origin_forbidden: 'Запрос отклонён проверкой безопасности',
      origin_rejected: 'Запрос отклонён проверкой безопасности',
      invalid_organization: 'Организация указана неверно',
      organization_required: 'Выберите организацию',
      invalid_request: 'Проверьте заполнение полей',
      invalid_credentials: 'Avito отклонил ключи. Проверьте Client ID и Client Secret.',
      credentials_required: 'Введите корректные персональные Client ID и Client Secret аккаунта Avito.',
      credentials_rejected: 'Avito отклонил ключи. Проверьте Client ID и Client Secret.',
      profile_unavailable: 'Avito не вернул профиль. Проверьте доступ аккаунта к API.',
      account_disconnected: 'Аккаунт отключён. Введите ключи заново.',
      account_changed: 'Аккаунт изменён параллельно. Обновите список.',
      account_not_found: 'Аккаунт не найден',
      account_limit: 'Достигнут лимит подключений. Отключите ненужный аккаунт.',
      json_required: 'Сервер отклонил формат запроса. Обновите страницу.',
      token_exchange: 'Avito не выдал токен по этим ключам',
      account_mismatch: 'Ключи относятся к другому аккаунту Avito',
      account_exists: 'Этот аккаунт уже подключён в организации',
      connection_not_found: 'Аккаунт не найден',
      not_found: 'Аккаунт не найден',
      reconnect_required: 'Нужно заново ввести ключи аккаунта',
      confirmation_required: 'Подтвердите отключение аккаунта',
      try_later: 'Сервис временно занят. Повторите позже.',
      service_unavailable: 'Avito временно недоступен',
      avito_unavailable: 'Avito временно недоступен',
      invalid_state: 'Ссылка согласия недействительна. Создайте новую ссылку.',
      invalid_invitation: 'Ссылка недействительна или уже использована. Создайте новую.',
      invalid_expiration: 'Срок ссылки указан неверно',
      denied: 'Клиент не разрешил доступ к аккаунту',
      missing_code: 'Avito не подтвердил согласие. Создайте новую ссылку.',
      display_name_required: 'Введите название от 1 до 200 символов без управляющих знаков.'
    };
    return messages[code] || (status === 403 ? 'Недостаточно прав для этого действия' : 'Запрос не выполнен. HTTP ' + status + (/^[a-z_]{1,80}$/.test(code || '') ? ' · ' + code : '') + '. Повторите позже.');
  }
  async function request(url, options) {
    if (!securePage()) { byId('clientSecret').value = ''; throw new Error('Откройте модуль по защищённому адресу https://avitoboss.online/integrations/avito-accounts/'); }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 90000);
    var authRefresh = !!(options && options.authRefresh);
    var fetchOptions = Object.assign({ cache: 'no-store', credentials: 'same-origin', signal: controller.signal }, options || {});
    delete fetchOptions.authRefresh;
    try {
      var response = await fetch(url, fetchOptions);
      var payload = parsed(await response.text());
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        var formatError = new Error('Сервер вернул некорректный ответ. Успешное сохранение не подтверждено.');
        formatError.status = 502;
        throw formatError;
      }
      if (!response.ok || payload.ok === false) {
        if (response.status === 401 && (payload.error === 'authentication_required' || payload.code === 'authentication_required')) {
          var authError = unauthorized();
          if (authRefresh) authError.refreshRejected = true;
          throw authError;
        }
        var error = new Error(serverError(payload, response.status));
        error.status = response.status === 401 ? 403 : response.status;
        error.retryableSnapshot = [502, 503, 504].indexOf(response.status) !== -1 && ['provider_unavailable', 'profile_unavailable', 'balance_unavailable', 'advance_unavailable', 'statistics_unavailable', 'relay_unavailable'].indexOf(payload.error || payload.code) !== -1;
        if (authRefresh && (response.status === 400 || response.status === 401)) { error.status = response.status; error.refreshRejected = true; }
        if (['permission_denied', 'forbidden', 'account_disconnected', 'account_changed', 'reconnect_required', 'messenger_read_required', 'messenger_write_required', 'try_later', 'chat_unavailable', 'messages_unavailable', 'send_unknown'].indexOf(payload.error || payload.code) !== -1 || /^(?:bidding_|quote_|groups_|cpx_)[a-z_]+$/.test(payload.error || payload.code || '')) error.code = payload.error || payload.code;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw Object.assign(new Error('Сервер не ответил вовремя. Проверьте список перед повторным добавлением.'), { retryableSnapshot: true });
      // Never echo transport/provider exceptions that could include credentials.
      if (!error.status && !(error instanceof Error && /^Сервер не ответил/.test(error.message))) throw Object.assign(new Error('Не удалось связаться с сервером. Проверьте соединение и повторите запрос.'), { retryableSnapshot: true });
      throw error;
    } finally { clearTimeout(timer); }
  }
  function rememberCurrentSession(session, revision) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (error) {}
    state.session = session;
    sessionRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
    return session;
  }
  function permanentRefreshFailure(error) { return !!error && error.refreshRejected === true; }
  function markLocalSignedOut() {
    authGeneration += 1;
    refreshPromise = null;
    sessionRevision = null;
    localSignedOut = true;
    state.session = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (error) {}
  }
  async function clearOwnAuthentication() {
    markLocalSignedOut();
    var store = window.AVITOLOG_AVITO_SESSION_STORE;
    var saved = true;
    if (store && typeof store.clear === 'function') {
      try { saved = await store.clear(); } catch (error) { saved = false; }
    }
    return saved;
  }
  async function rejectSessionIfCurrent(session, revision, generation) {
    if (localSignedOut || generation !== authGeneration) return { session: state.session, changed: true, cleared: false };
    var store = window.AVITOLOG_AVITO_SESSION_STORE;
    if (store && typeof store.clearRefresh === 'function' && Number.isSafeInteger(revision) && revision >= 0) {
      var result = null;
      try { result = await store.clearRefresh(revision, session.access_token); } catch (error) {}
      if (localSignedOut || generation !== authGeneration) return { session: state.session, changed: true, cleared: false };
      if (result && result.saved) {
        markLocalSignedOut();
        return { session: null, changed: false, cleared: true };
      }
      if (result && result.conflict && typeof store.readVersioned === 'function') {
        var latest = null;
        try { latest = await store.readVersioned(); } catch (error) {}
        if (localSignedOut || generation !== authGeneration) return { session: state.session, changed: true, cleared: false };
        if (latest && latest.signedOut) {
          markLocalSignedOut();
          return { session: null, changed: true, cleared: true };
        }
        var replacement = sessionValue(latest && latest.session, true);
        if (latest && latest.available && replacement && (!replacement.expires_at || replacement.expires_at > Date.now() / 1000 + 60)) {
          localSignedOut = false;
          return { session: rememberCurrentSession(replacement, latest.revision), changed: true, cleared: false };
        }
      }
      // An unavailable store is not proof that this rejected token is still current.
      markLocalSignedOut();
      return { session: null, changed: true, cleared: false };
    }
    // Cached older helpers cannot perform an atomic clear. Keep durable state untouched.
    markLocalSignedOut();
    return { session: null, changed: false, cleared: false };
  }
  async function refreshedSession(session, forceRefresh) {
    if (refreshPromise) return refreshPromise;
    var generation = authGeneration;
    var task = (async function () {
      var current = session;
      var revision = null;
      var store = window.AVITOLOG_AVITO_SESSION_STORE;
      if (store && typeof store.readVersioned === 'function') {
        var versioned = null;
        try { versioned = await store.readVersioned(); } catch (error) {}
        if (localSignedOut || generation !== authGeneration) return null;
        if (versioned && versioned.signedOut) {
          localSignedOut = true;
          state.session = null;
          return null;
        }
        var durable = sessionValue(versioned && versioned.session, true);
        if (durable) {
          current = durable;
          revision = Number.isSafeInteger(versioned.revision) ? versioned.revision : null;
          if (!forceRefresh && (!current.expires_at || current.expires_at > Date.now() / 1000 + 60)) return rememberCurrentSession(current, revision);
        }
      }
      if (!current || !current.owned || !current.refresh_token) return null;
      state.session = current;
      var cfg = window.AVITOLOG_SUPABASE || {};
      var payload;
      try {
        payload = await request(cfg.url + '/auth/v1/token?grant_type=refresh_token', { authRefresh: true, method: 'POST', headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: current.refresh_token }) });
      } catch (error) {
        if (localSignedOut || generation !== authGeneration) return null;
        if (permanentRefreshFailure(error)) {
          var rejected = await rejectSessionIfCurrent(current, revision, generation);
          return rejected.session;
        }
        state.session = current;
        throw error;
      }
      if (localSignedOut || generation !== authGeneration) return null;
      var next = sessionValue({ access_token: payload.access_token, refresh_token: payload.refresh_token || current.refresh_token, expires_at: Number(payload.expires_at) || Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600) }, true);
      if (!next) throw new Error('Не удалось получить сессию входа');
      var saved = true;
      if (store && typeof store.writeRefresh === 'function') {
        if (revision == null) saved = false;
        else {
          var result = await store.writeRefresh(next, revision, current.access_token);
          saved = !!(result && result.saved);
          if (result && result.conflict && typeof store.readVersioned === 'function') {
            var latest = await store.readVersioned();
            if (localSignedOut || generation !== authGeneration || latest && latest.signedOut) return null;
            var replacement = sessionValue(latest && latest.session, true);
            if (replacement) return rememberCurrentSession(replacement, latest.revision);
          }
        }
      } else if (store && typeof store.write === 'function') {
        saved = await store.write(next);
      }
      if (localSignedOut || generation !== authGeneration) return null;
      rememberCurrentSession(next, result && result.saved ? result.revision : null);
      if (!saved) notice('Вход продлён, но браузер не разрешил надёжно сохранить его после закрытия. Откройте модуль отдельно и повторите вход.', 'info');
      return next;
    })();
    refreshPromise = task;
    try { return await task; }
    finally { if (refreshPromise === task) refreshPromise = null; }
  }
  async function activeSession(forceRefresh) {
    if (localSignedOut) return null;
    var session = state.session;
    var store = window.AVITOLOG_AVITO_SESSION_STORE;
    if (!session && store && typeof store.readVersioned === 'function') {
      try {
        var versioned = await store.readVersioned();
        if (versioned && versioned.signedOut) { localSignedOut = true; return null; }
        session = sessionValue(versioned && versioned.session, true);
        sessionRevision = session && Number.isSafeInteger(versioned.revision) ? versioned.revision : null;
      } catch (error) {}
    }
    if (!session && store && typeof store.read === 'function') {
      try { session = sessionValue(await store.read(), true); } catch (error) {}
      if (localSignedOut) return null;
      if (!session && typeof store.isSignedOut === 'function') {
        try { if (await store.isSignedOut()) { localSignedOut = true; return null; } } catch (error) {}
      }
    }
    if (!session) {
      session = storedSession();
      sessionRevision = null;
      if (session && session.owned && store && typeof store.write === 'function') await store.write(session);
    }
    if (!session) return null;
    if (!forceRefresh && (!session.expires_at || session.expires_at > Date.now() / 1000 + 60)) { state.session = session; return session; }
    // Never refresh or rewrite another module's session.
    if (!session.owned) return null;
    if (!session.refresh_token) { await clearOwnAuthentication(); return null; }
    return refreshedSession(session, forceRefresh === true);
  }
  async function api(path, options) {
    options = options || {};
    var headers = { Accept: 'application/json' };
    var session = null;
    if (!options.public) {
      session = await activeSession(false);
      if (!session) throw unauthorized();
      if (typeof options.guard === 'function') options.guard();
      headers.Authorization = 'Bearer ' + session.access_token;
    }
    if (options.body) headers['Content-Type'] = 'application/json';
    var url = (options.invites ? INVITES_BASE : BASE) + path;
    var requestOptions = { method: options.method || 'GET', headers: headers, body: options.body ? JSON.stringify(options.body) : undefined };
    try {
      return await request(url, requestOptions);
    } catch (error) {
      if (options.public || options.invites || error.status !== 401) throw error;
      var refreshed = await activeSession(true);
      if (!refreshed) throw unauthorized();
      var retryGeneration = authGeneration;
      var retryRevision = sessionRevision;
      if (typeof options.guard === 'function') options.guard();
      headers.Authorization = 'Bearer ' + refreshed.access_token;
      try {
        return await request(url, requestOptions);
      } catch (retryError) {
        if (retryError.status === 401) {
          var rejected = await rejectSessionIfCurrent(refreshed, retryRevision, retryGeneration);
          if (rejected.session) {
            var changedError = new Error('Сессия обновилась в другом окне. Повторите запрос.');
            changedError.status = 401;
            changedError.preserveSession = true;
            throw changedError;
          }
        }
        throw retryError;
      }
    }
  }
  function notice(message, kind) {
    text('noticeText', message);
    byId('notice').dataset.kind = kind || 'info';
    byId('notice').classList.remove('is-hidden');
  }
  function failure(error) {
    if(error.status===401||error.status===403){var cacheOwner=viewCacheScope();viewCacheEpoch++;if(cacheOwner&&window.AVBStartupCache)window.AVBStartupCache.write('accounts:'+cacheOwner,null);if(state.cachedPreview){state.cachedPreview=false;state.accounts=[];renderAccounts();}}
    if (error.status === 401) {
      if (error.preserveSession !== true) state.session = null;
      state.organizations = [];
      state.organizationId = '';
      state.accounts = [];
      state.selectedId = '';
      state.listLoaded = false;
      clearSnapshots('');
      resetCredentialForm();
      closeDisconnect();
      clearInvitation();
      state.inviteRecords = Object.create(null);
      populateOrganizations();
      renderAccounts();
      byId('accountDetail').classList.add('is-hidden');
    }
    notice(error.message || 'Не удалось выполнить запрос', 'error');
  }
  function canManage() {
    var org = state.organizations.find(function (item) { return String(item.id) === state.organizationId; });
    return !!org && (org.role === 'owner' || org.role === 'admin');
  }
  var ACCOUNT_GROUPS = [['', 'Без группы'], ['construction', '🏗 СТРОИТЕЛЬСТВО'], ['furniture', '🪑 МЕБЕЛЬ'], ['special', '🛠 СПЕЦ УСЛУГИ'], ['materials', '🧱 СТРОЙМАТЕРИАЛЫ'], ['online', '🌐 ONLINE УСЛУГИ'], ['equipment', '⚙ ОБОРУДОВАНИЕ'], ['auto', '🚙 АВТО / МОТО'], ['avitolog', '🅰️ АВИТОЛОГИ'], ['fences', '📐 ВОРОТА / ЗАБОРЫ'], ['houses', '🏡 ДОМА'], ['other', 'ДРУГОЕ']];
  function emptyLayout() { return { order: [], accounts: Object.create(null) }; }
  state.layout = emptyLayout();
  state.layoutRevision = 0;
  state.layoutReady = false;
  function accountLayout(id) { return state.layout.accounts[String(id)] || { group: '', hidden: false, deleted: false }; }
  var TABLE_SORT_KEYS = ['name', 'advance', 'wallet', 'spending', 'listings', 'contacts', 'views', 'favorites', 'group'];
  var tableDatabaseTask = null;
  var tablePreferenceRevision = 0;
  var accountStackDialog = null;
  var OPTIONAL_COLUMNS = ['wallet', 'spending', 'listings', 'contacts', 'views', 'favorites', 'group'];
  function checkedAccountStacks(value) {
    var used = Object.create(null), result = [];
    if (!Array.isArray(value)) return result;
    value.slice(0, 100).forEach(function (stack) {
      if (!Array.isArray(stack) || stack.length < 2 || stack.length > 200 || Object.keys(used).length + stack.length > 200) return;
      var seen = Object.create(null);
      if (stack.some(function (id) { if (typeof id !== 'string' || !/^[0-9]{1,25}$/.test(id) || seen[id] || used[id]) return true; seen[id] = true; return false; })) return;
      stack.forEach(function (id) { used[id] = true; }); result.push(stack.slice());
    });
    return result;
  }
  function mergedAccountStacks(stacks, sourceId, targetId) {
    var current = checkedAccountStacks(stacks), members = [sourceId, targetId];
    if (sourceId === targetId || !/^[0-9]{1,25}$/.test(sourceId) || !/^[0-9]{1,25}$/.test(targetId)) return current;
    var remaining = current.filter(function (stack) { if (stack.indexOf(sourceId) < 0 && stack.indexOf(targetId) < 0) return true; members = members.concat(stack); return false; });
    remaining.push(members.filter(function (id, index) { return members.indexOf(id) === index; })); return checkedAccountStacks(remaining);
  }
  function detachedAccountStacks(stacks, id) {
    return checkedAccountStacks(stacks).map(function (stack) { return stack.filter(function (member) { return member !== id; }); }).filter(function (stack) { return stack.length > 1; });
  }
  function keepAccountStacksTogether(groups) {
    var stacks = checkedAccountStacks(state.tablePresentation.accountStacks), membership = Object.create(null), result = [];
    stacks.forEach(function (stack) { stack.forEach(function (id) { membership[id] = stack; }); });
    groups.forEach(function (group) {
      if (result.indexOf(group) >= 0) return;
      var stack = membership[group.avitoUserId];
      if (!stack) { result.push(group); return; }
      groups.forEach(function (member) { if (result.indexOf(member) < 0 && stack.indexOf(member.avitoUserId) >= 0) result.push(member); });
    });
    return result;
  }
  function closeAccountStackPicker() { if (accountStackDialog) { accountStackDialog.close(); accountStackDialog.remove(); accountStackDialog = null; } }
  async function persistedAccountStacks(scope, value) {
    var database = await tableDatabase(); if (!database) return null;
    return new Promise(function (resolve) {
      var settled = false, timer = setTimeout(function () { finish(null); }, 2000);
      function finish(result) { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } }
      try {
        var writing = Array.isArray(value), tx = database.transaction('presentation', writing ? 'readwrite' : 'readonly'), store = tx.objectStore('presentation');
        var request = writing ? store.put({ version: 1, stacks: checkedAccountStacks(value) }, 'account-stacks|' + scope) : store.get('account-stacks|' + scope);
        tx.onabort = tx.onerror = function () { finish(null); }; if (request) request.onerror = tx.onerror;
        if (writing) tx.oncomplete = function () { finish(true); };
        else request.onsuccess = function () { var saved = request.result; finish(saved && saved.version === 1 && Array.isArray(saved.stacks) ? checkedAccountStacks(saved.stacks) : null); };
      } catch (error) { finish(null); }
    });
  }
  async function saveAccountStacks(stacks, expectedScope) {
    if (!expectedScope || presentationScope(state.organizationId) !== expectedScope || state.tablePrefsScope !== expectedScope) throw new Error('Профиль изменился. Откройте связку заново.');
    var previous = checkedAccountStacks(state.tablePresentation.accountStacks);
    state.tablePresentation.accountStacks = checkedAccountStacks(stacks); tablePreferenceRevision += 1;
    var revision = tablePreferenceRevision, saved = await persistedAccountStacks(expectedScope, state.tablePresentation.accountStacks);
    if (presentationScope(state.organizationId) !== expectedScope || state.tablePrefsScope !== expectedScope) return false;
    if (!saved) {
      if (tablePreferenceRevision === revision) { state.tablePresentation.accountStacks = previous; tablePreferenceRevision += 1; }
      renderAccounts(); throw new Error('Браузер не подтвердил сохранение связки. Прежний порядок сохранён; повторите попытку.');
    }
    renderAccounts(); return true;
  }
  async function openAccountStackPicker(sourceId) {
    if (state.busy || state.inlineAlias || !canManage()) return;
    var organizationId = state.organizationId, scope = presentationScope(organizationId);
    if (state.tablePreferenceTask) await state.tablePreferenceTask;
    if (!scope || presentationScope(state.organizationId) !== scope || organizationId !== state.organizationId || !canManage()) return;
    var groups = orderedAccountGroups().filter(function (group) { return !accountLayout(group.avitoUserId).deleted; });
    var source = groups.find(function (group) { return group.avitoUserId === sourceId; }); if (!source) return;
    closeAccountStackPicker();
    var current = checkedAccountStacks(state.tablePresentation.accountStacks), stack = current.find(function (item) { return item.indexOf(sourceId) >= 0; }) || [];
    var dialog = element('dialog', 'account-stack-dialog'), title = element('h2', '', 'Держать аккаунты рядом');
    dialog.appendChild(title); dialog.setAttribute('aria-label', 'Связка аккаунтов');
    dialog.appendChild(element('p', '', accountName(source.primary)));
    var label = element('label', '', 'Соединить с аккаунтом'), select = element('select'); select.setAttribute('aria-label', 'Другой аккаунт');
    var placeholder = element('option', '', 'Выберите аккаунт'); placeholder.value = ''; select.appendChild(placeholder);
    groups.forEach(function (group) { if (group.avitoUserId === sourceId || stack.indexOf(group.avitoUserId) >= 0) return; var option = element('option', '', accountName(group.primary)); option.value = group.avitoUserId; select.appendChild(option); });
    label.appendChild(select); dialog.appendChild(label);
    if (stack.length) dialog.appendChild(element('p', 'small', 'Уже связаны: ' + stack.filter(function (id) { return id !== sourceId; }).map(function (id) { var group = groups.find(function (item) { return item.avitoUserId === id; }); return group ? accountName(group.primary) : id; }).join(', ')));
    dialog.appendChild(element('p', 'small', 'Связка сохраняется в этом браузере. Строки сортируются одним блоком по первому аккаунту в выбранной сортировке. Фильтры и скрытие сохраняются. Балансы и ключи не объединяются.'));
    var warning = element('p', 'small'), actions = element('div', 'dialog-actions'); warning.setAttribute('role', 'status'); dialog.appendChild(warning);
    var link = element('button', 'button primary', 'Соединить'), cancel = element('button', 'button', 'Отмена'); link.type = cancel.type = 'button';
    var unlink = stack.length ? element('button', 'button', 'Разъединить этот аккаунт') : null;
    async function submit(detach) {
      if (state.busy || !canManage()) return;
      var target = select.value;
      if (!detach && (!target || target === sourceId || !state.accounts.some(function (account) { return String(account.avito_user_id) === target && !accountLayout(target).deleted; }))) { warning.textContent = 'Выберите другой доступный аккаунт.'; return; }
      link.disabled = cancel.disabled = select.disabled = true; if (unlink) unlink.disabled = true;
      await operation(async function () {
        try {
          var latest = state.tablePresentation.accountStacks;
          if (await saveAccountStacks(detach ? detachedAccountStacks(latest, sourceId) : mergedAccountStacks(latest, sourceId, target), scope)) { closeAccountStackPicker(); notice(detach ? 'Связка снята.' : 'Аккаунты будут оставаться рядом при сортировке.', 'success'); }
        } catch (error) { warning.textContent = error.message; }
      });
      if (dialog.isConnected) { link.disabled = cancel.disabled = select.disabled = false; if (unlink) unlink.disabled = false; }
    }
    link.addEventListener('click', function () { submit(false); }); cancel.addEventListener('click', closeAccountStackPicker);
    actions.appendChild(link); if (unlink) { unlink.type = 'button'; unlink.addEventListener('click', function () { submit(true); }); actions.appendChild(unlink); } actions.appendChild(cancel); dialog.appendChild(actions);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); if (!state.busy) closeAccountStackPicker(); });
    accountStackDialog = dialog; document.body.appendChild(dialog); dialog.showModal();
  }
  function defaultTablePresentation() { return { sortKey: '', sortDirection: 'desc', lowAdvanceEnabled: false, lowAdvanceThreshold: 500, columns: { wallet: true, spending: true, listings: true, contacts: true, views: true, favorites: true, group: true }, showTariff: true, estimateTariff: false, accountStacks: [] }; }
  state.tablePresentation = defaultTablePresentation();
  state.tablePrefsScope = '';
  state.priorityPollAt = 0;
  function checkedTablePresentation(value) {
    var result = defaultTablePresentation();
    if (!value || typeof value !== 'object') return result;
    if (TABLE_SORT_KEYS.indexOf(value.sortKey) !== -1) result.sortKey = value.sortKey;
    if (value.sortDirection === 'asc') result.sortDirection = 'asc';
    result.lowAdvanceEnabled = value.lowAdvanceEnabled === true;
    if (typeof value.lowAdvanceThreshold === 'number' && Number.isFinite(value.lowAdvanceThreshold) && value.lowAdvanceThreshold >= 0 && value.lowAdvanceThreshold <= 1000000000) result.lowAdvanceThreshold = value.lowAdvanceThreshold;
    if (value.columns && typeof value.columns === 'object') OPTIONAL_COLUMNS.forEach(function (key) { if (typeof value.columns[key] === 'boolean') result.columns[key] = value.columns[key]; });
    if (typeof value.showTariff === 'boolean') result.showTariff = value.showTariff;
    result.estimateTariff = value.estimateTariff === true;
    result.accountStacks = checkedAccountStacks(value.accountStacks);
    return result;
  }
  function renderTableSettings() {
    state.tablePresentation = checkedTablePresentation(state.tablePresentation);
    if (!byId('accountTableSettings')) return;
    OPTIONAL_COLUMNS.forEach(function (key) {
      var suffix = key.charAt(0).toUpperCase() + key.slice(1), input = byId('tableShow' + suffix);
      input.checked = state.tablePresentation.columns[key];
      input.disabled = !state.session || state.busy || !!state.inlineAlias;
      byId('sort' + suffix + 'Heading').classList.toggle('is-hidden', !input.checked);
    });
    byId('tableShowTariff').checked = state.tablePresentation.showTariff;
    byId('tableEstimateTariff').checked = state.tablePresentation.estimateTariff;
    ['tableShowTariff', 'tableEstimateTariff'].forEach(function (id) { byId(id).disabled = !state.session || state.busy || !!state.inlineAlias; });
  }
  function changeTableSettings() {
    if (state.busy || !state.session || state.inlineAlias) { renderTableSettings(); return; }
    OPTIONAL_COLUMNS.forEach(function (key) {
      state.tablePresentation.columns[key] = byId('tableShow' + key.charAt(0).toUpperCase() + key.slice(1)).checked;
      if (!state.tablePresentation.columns[key] && state.tablePresentation.sortKey === key) state.tablePresentation.sortKey = '';
    });
    state.tablePresentation.showTariff = byId('tableShowTariff').checked;
    state.tablePresentation.estimateTariff = byId('tableEstimateTariff').checked;
    tablePreferenceRevision += 1;
    saveTablePreferences();
    renderAccounts();
    var account = state.accounts.find(function (item) { return accountKey(item) === state.selectedId; });
    var entry = account && state.snapshots[state.selectedId];
    if (entry && entry.payload && sameSnapshotIdentity(entry, account)) renderDetails(entry.payload);
    else if (account) renderTariffPayment(account);
    if (account && !byId('accountDetail').classList.contains('is-hidden')) fetchTariffPayment(account);
  }
  function presentationScope(organizationId) {
    try {
      var part = String(state.session && state.session.access_token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      var subject = JSON.parse(atob(part)).sub;
      return typeof subject === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(subject) && organizationId ? 'v1|' + subject + '|' + organizationId : '';
    } catch (error) { return ''; }
  }
  function tableDatabase() {
    if (tableDatabaseTask) return tableDatabaseTask;
    var task = new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      var settled = false;
      var timer = setTimeout(function () { finish(null); }, 1500);
      function finish(value) { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } else if (value) value.close(); }
      try {
        var request = window.indexedDB.open('avitolog_avito_accounts_table_preferences', 1);
        request.onupgradeneeded = function () { if (!request.result.objectStoreNames.contains('presentation')) request.result.createObjectStore('presentation'); };
        request.onsuccess = function () { var database = request.result; database.onversionchange = function () { database.close(); tableDatabaseTask = null; }; finish(database); };
        request.onerror = request.onblocked = function () { finish(null); };
      } catch (error) { finish(null); }
    });
    tableDatabaseTask = task;
    task.then(function (database) { if (!database && tableDatabaseTask === task) tableDatabaseTask = null; });
    return task;
  }
  async function loadTablePreferences(organizationId, generation) {
    var scope = presentationScope(organizationId);
    if (scope !== state.tablePrefsScope) {
      state.tablePrefsScope = scope;
      state.tablePresentation = defaultTablePresentation();
      tablePreferenceRevision += 1;
    }
    var revision = tablePreferenceRevision;
    if (!scope) return;
    var database = await tableDatabase();
    if (!database) return;
    var stackTask = persistedAccountStacks(scope);
    var value = await new Promise(function (resolve) {
      try {
        var transaction = database.transaction('presentation', 'readonly');
        var request = transaction.objectStore('presentation').get(scope);
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = transaction.onabort = function () { resolve(null); };
      } catch (error) { resolve(null); }
    });
    var savedStacks = await stackTask;
    if (value == null && savedStacks == null || state.organizationId !== organizationId || state.listGeneration !== generation || state.tablePrefsScope !== scope || tablePreferenceRevision !== revision) return;
    state.tablePresentation = checkedTablePresentation(value);
    if (savedStacks !== null) state.tablePresentation.accountStacks = savedStacks;
    state.priorityPollAt = Date.now();
    renderAccounts();
  }
  function tablePreferenceNotice(saved) {
    text('tablePrefsState', saved ? 'Вид таблицы сохранён только в этом браузере.' : 'Сохранение вида в браузере не подтверждено. Настройки пока действуют на этой странице.');
    byId('tablePrefsState').dataset.tone = saved ? '' : 'warning';
  }
  async function saveTablePreferences() {
    var scope = presentationScope(state.organizationId);
    var value = checkedTablePresentation(state.tablePresentation);
    var revision = tablePreferenceRevision;
    if (!scope || scope !== state.tablePrefsScope) { tablePreferenceNotice(false); return false; }
    var database = await tableDatabase();
    var saved = database ? await new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { finish(false); }, 2000);
      function finish(value) { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } }
      try {
        var transaction = database.transaction('presentation', 'readwrite');
        transaction.oncomplete = function () { finish(true); };
        transaction.onerror = transaction.onabort = function () { finish(false); };
        transaction.objectStore('presentation').put(value, scope);
      } catch (error) { finish(false); }
    }) : false;
    if (state.tablePrefsScope === scope && presentationScope(state.organizationId) === scope && tablePreferenceRevision === revision) tablePreferenceNotice(saved);
    return saved;
  }
  function automaticTableOrder() { return !!state.tablePresentation.sortKey || state.tablePresentation.lowAdvanceEnabled; }
  function tableSort(key) {
    if (state.busy || state.inlineAlias || TABLE_SORT_KEYS.indexOf(key) === -1) return;
    var presentation = state.tablePresentation;
    presentation.sortDirection = presentation.sortKey === key && presentation.sortDirection === 'desc' ? 'asc' : 'desc';
    presentation.sortKey = key;
    tablePreferenceRevision += 1;
    saveTablePreferences();
    renderAccounts();
  }
  function manualTableOrder() {
    if (state.busy || state.inlineAlias) return;
    state.tablePresentation.sortKey = '';
    state.tablePresentation.lowAdvanceEnabled = false;
    tablePreferenceRevision += 1;
    saveTablePreferences();
    renderAccounts();
  }
  function groupSnapshot(group) {
    var account = group.primary, entry = state.snapshots[accountKey(account)];
    return state.snapshotOrganizationId === state.organizationId && activeAccount(account) && sameSnapshotIdentity(entry, account) ? entry : null;
  }
  function displayedListings(overview) {
    var listings = overview.listings || {};
    var denied = ['permission_denied', 'forbidden', 'account_disconnected', 'account_changed', 'reconnect_required'];
    return denied.indexOf(overview.error) === -1 && denied.indexOf(listings.error) === -1 && listings.available === true && listings.visibility === 'status_only' && Number.isSafeInteger(listings.active) && listings.active >= 0 ? listings : null;
  }
  function displayedTodayMetric(overview, key, currentDay) {
    var today = overview.today || {}, value = today[key];
    var denied = ['permission_denied', 'forbidden', 'account_disconnected', 'account_changed', 'reconnect_required'];
    return today.available === true && today.date === (currentDay || moscowDay()) && denied.indexOf(overview.error) === -1 && denied.indexOf(today.error) === -1 && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  }
  function tableMetric(group, key, currentDay) {
    var entry = groupSnapshot(group), payload = entry && entry.payload || {}, overview = payload.overview || {};
    if (!entry) return null;
    if (['contacts', 'views', 'favorites', 'spending'].indexOf(key) !== -1) return displayedTodayMetric(overview, key, currentDay);
    if (entry.error || overview.stale === true) return null;
    if (key === 'listings') { var listings = displayedListings(overview); return listings ? listings.active : null; }
    var section = key === 'advance' ? overview.advance || {} : key === 'wallet' ? payload.balance || {} : overview.today || {};
    var value = key === 'advance' ? section.balance : key === 'wallet' ? section.real : section[key];
    if (section.available !== true || section.stale === true || typeof value !== 'number' || !Number.isFinite(value)) return null;
    currentDay = currentDay || moscowDay();
    if (key === 'advance' && (moscowDate(section.fetched_at || overview.fetched_at || '') !== currentDay || !overview.today || overview.today.date !== currentDay)) return null;
    if (key !== 'advance' && key !== 'wallet' && (section.date !== currentDay || value < 0 || value > Number.MAX_SAFE_INTEGER)) return null;
    return value;
  }
  function lowAdvance(group, currentDay) { if (!state.tablePresentation.lowAdvanceEnabled) return false; var value = tableMetric(group, 'advance', currentDay); return value !== null && value <= state.tablePresentation.lowAdvanceThreshold; }
  function tableGroupName(group) { var key = accountLayout(group.avitoUserId).group; return (ACCOUNT_GROUPS.find(function (item) { return item[0] === key; }) || ACCOUNT_GROUPS[0])[1]; }
  function presentedAccountGroups(groups) {
    var presentation = state.tablePresentation, currentDay = moscowDay(), key = presentation.sortKey;
    return keepAccountStacksTogether(groups.map(function (group, index) { return { group: group, index: index, low: lowAdvance(group, currentDay), value: key === 'group' ? tableGroupName(group) : key === 'name' ? accountName(group.primary) : key ? tableMetric(group, key, currentDay) : null }; }).sort(function (left, right) {
      var comparison = key === 'contacts' ? 0 : Number(right.low) - Number(left.low);
      if (comparison) return comparison;
      if (key) {
        var av = left.value, bv = right.value;
        if (av === null || bv === null) comparison = Number(av === null) - Number(bv === null);
        else comparison = (key === 'name' || key === 'group' ? av.localeCompare(bv, 'ru', { sensitivity: 'base', numeric: true }) : av - bv) * (presentation.sortDirection === 'asc' ? 1 : -1);
      }
      return comparison || Number(right.low) - Number(left.low) || left.index - right.index;
    }).map(function (item) { return item.group; }));
  }
  function orderedAccountGroups() {
    var rank = Object.create(null);
    state.layout.order.forEach(function (id, index) { rank[id] = index; });
    return logicalAccounts().map(function (group, index) { return { group: group, rank: rank[group.avitoUserId] === undefined ? state.layout.order.length + index : rank[group.avitoUserId] }; }).sort(function (a, b) { return a.rank - b.rank; }).map(function (item) { return item.group; });
  }
  function visibleAccountGroups() {
    var groupFilter = byId('accountGroupFilter').value || '';
    var visibility = byId('accountVisibilityFilter').value || 'visible';
    return presentedAccountGroups(orderedAccountGroups().filter(function (group) {
      var settings = accountLayout(group.avitoUserId);
      if (groupFilter && settings.group !== groupFilter) return false;
      if (visibility === 'all') return true;
      if (visibility === 'deleted') return settings.deleted;
      if (visibility === 'hidden') return settings.hidden && !settings.deleted;
      return !settings.hidden && !settings.deleted;
    }));
  }
  function checkedLayout(payload) {
    if (!Number.isSafeInteger(payload.revision) || payload.revision < 0 || !payload.layout || !Array.isArray(payload.layout.order) || payload.layout.order.length > 200 || !payload.layout.accounts || typeof payload.layout.accounts !== 'object' || Array.isArray(payload.layout.accounts)) throw new Error('Сервер не подтвердил настройки списка.');
    var seen = Object.create(null), result = emptyLayout();
    payload.layout.order.forEach(function (id) { if (typeof id !== 'string' || !/^[0-9]{1,25}$/.test(id) || seen[id]) throw new Error('Некорректный порядок аккаунтов.'); seen[id] = true; result.order.push(id); });
    var keys = Object.keys(payload.layout.accounts);
    if (keys.length > 200) throw new Error('Слишком много настроек аккаунтов.');
    keys.forEach(function (id) {
      var item = payload.layout.accounts[id];
      if (!/^[0-9]{1,25}$/.test(id) || !item || !ACCOUNT_GROUPS.some(function (group) { return group[0] === item.group; }) || typeof item.hidden !== 'boolean' || typeof item.deleted !== 'boolean') throw new Error('Некорректные настройки аккаунта.');
      result.accounts[id] = { group: item.group, hidden: item.hidden, deleted: item.deleted };
    });
    return result;
  }
  async function loadLayout(organizationId, generation) {
    var retainedLayout = state.layoutReady && state.snapshotOrganizationId === organizationId;
    if (!retainedLayout) state.layoutReady = false;
    try {
      var payload = await api('/layout?organization_id=' + encodeURIComponent(organizationId));
      if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
      var layout = checkedLayout(payload);
      // A background GET must not replace a newer successful group save.
      if (retainedLayout && payload.revision < state.layoutRevision) return;
      state.layout = layout;
      state.layoutRevision = payload.revision;
      state.layoutReady = true;
      text('layoutState', 'Порядок, группы и скрытие сохраняются на сервере.');
      renderAccounts();
    } catch (error) {
      if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
      text('layoutState', retainedLayout ? 'Обновление групп временно недоступно. Используется последняя подтверждённая версия; сохранение защищено от конфликтов.' : 'Настройки списка не загружены. Нажмите «Обновить список»; изменение порядка и групп пока недоступно.');
      renderControls();
    }
  }
  async function saveLayout(layout) {
    if (state.busy || !state.layoutReady || !canManage() || state.inlineAlias) return;
    var organizationId = state.organizationId, revision = state.layoutRevision, generation = state.listGeneration;
    await operation(async function () {
      try {
        var payload = await api('/layout', { method: 'POST', body: { organization_id: organizationId, revision: revision, layout: layout } });
        if (state.organizationId !== organizationId) return;
        state.layout = checkedLayout(payload);
        state.layoutRevision = payload.revision;
        var selected = state.accounts.find(function (account) { return accountKey(account) === state.selectedId; });
        if (selected && !visibleAccountGroups().some(function (group) { return group.avitoUserId === String(selected.avito_user_id); })) { state.selectedId = ''; byId('accountDetail').classList.add('is-hidden'); }
        armSnapshotRetry();
        renderAccounts();
        notice('Настройки списка сохранены.', 'success');
      } catch (error) {
        if (error.status === 409 && state.organizationId === organizationId) {
          await loadLayout(organizationId, generation);
          throw new Error('Список изменён в другом окне. Получены актуальные настройки; повторите действие.');
        }
        renderAccounts();
        throw error;
      }
    });
  }
  function suggestedAccountGroup(name) {
    var value = String(name || '').toLowerCase().replace(/ё/g, 'е');
    var rules = [
      ['fences', /забор|ворот|огражден/], ['materials', /жби|бетон|кирпич|стройматериал|пиломатериал|технониколь/],
      ['furniture', /мебел|кухн|шкаф|кроват|диван|комод/], ['avitolog', /авитолог|avitolog|продвижен|маркетинг|marketing/],
      ['houses', /(^|[^а-яa-z])дома($|[^а-яa-z])|домов|коттедж|модульн.*дом|каркасн.*дом/], ['construction', /строител|ремонт квартир|фасад|кровл|фундамент/],
      ['auto', /авто|мото|шиномонтаж/], ['equipment', /оборудован|станок|станки|компрессор/],
      ['online', /сайт|дизайн|онлайн|online/], ['special', /спецтехник|эвакуатор|грузоперевоз/]
    ];
    var found = rules.find(function (rule) { return rule[1].test(value); });
    return found ? found[0] : '';
  }
  function renderCredentialGroupHint() {
    var select = byId('credentialGroup');
    var key = select.value === '__auto__' ? suggestedAccountGroup(byId('accountName').value) : select.value;
    var group = ACCOUNT_GROUPS.find(function (item) { return item[0] === key; }) || ACCOUNT_GROUPS[0];
    text('credentialGroupHint', select.value === '__auto__' ? 'Предположение: ' + group[1] + '. После проверки учтём имя профиля Avito; группу можно выбрать вручную.' : 'Будет сохранено: ' + group[1] + '.');
  }
  async function saveCredentialGroup(account, choice, knownAccount, organizationId) {
    // Automatic grouping never overwrites an existing account's saved group.
    if (choice === '__auto__' && knownAccount) return true;
    var group = choice === '__auto__' ? suggestedAccountGroup(account.display_name) : choice;
    if (!ACCOUNT_GROUPS.some(function (item) { return item[0] === group; })) throw new Error('Группа не подтверждена.');
    if (state.layoutTask) await state.layoutTask;
    if (state.organizationId !== organizationId || !state.layoutReady || !canManage()) throw new Error('Настройки групп пока недоступны.');
    var id = String(account.avito_user_id || '');
    if (!/^[0-9]{1,25}$/.test(id)) throw new Error('Avito ID не подтверждён.');
    if (accountLayout(id).group === group) return true;
    var layout = JSON.parse(JSON.stringify(state.layout));
    layout.accounts[id] = Object.assign({}, accountLayout(id), { group: group });
    var payload = await api('/layout', { method: 'POST', body: { organization_id: organizationId, revision: state.layoutRevision, layout: layout } });
    if (state.organizationId !== organizationId) return false;
    state.layout = checkedLayout(payload);
    state.layoutRevision = payload.revision;
    return true;
  }
  function updateAccountLayout(account, patch) {
    var id = String(typeof account === 'string' ? account : account.avito_user_id || '');
    if (!/^[0-9]{1,25}$/.test(id)) return;
    var layout = JSON.parse(JSON.stringify(state.layout));
    layout.accounts[id] = Object.assign({}, accountLayout(id), patch);
    return saveLayout(layout);
  }
  function moveAccount(id, delta, targetId) {
    if (automaticTableOrder()) return;
    var visible = visibleAccountGroups().map(function (group) { return group.avitoUserId; });
    var fromVisible = visible.indexOf(id), toId = targetId || visible[fromVisible + delta];
    if (fromVisible < 0 || !toId || toId === id || visible.indexOf(toId) < 0) return;
    var layout = JSON.parse(JSON.stringify(state.layout));
    var order = orderedAccountGroups().map(function (group) { return group.avitoUserId; }).filter(function (value) { return /^[0-9]{1,25}$/.test(value); });
    layout.order.forEach(function (value) { if (order.indexOf(value) < 0) order.push(value); });
    var from = order.indexOf(id), to = order.indexOf(toId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(order.indexOf(toId) + (from < to ? 1 : 0), 0, id);
    layout.order = order;
    return saveLayout(layout);
  }
  function configurationReady() { return !!state.configuration && state.configuration.ready === true && state.configuration.enabled !== false; }
  function ready() { return configurationReady() && state.storageReady; }
  function inviteScopesValid(scopes) { return Array.isArray(scopes) && scopes.indexOf('user:read') !== -1 && !scopes.some(function (scope, index) { return INVITE_SCOPES.indexOf(scope) === -1 || scopes.indexOf(scope) !== index; }); }
  function invitesConfigured() {
    var cfg = state.inviteConfiguration;
    if (!cfg || cfg.ready !== true || cfg.enabled !== true) return false;
    if (cfg.callback_mode === 'supabase') {
      var nativeBase = 'https://iexrnbvimnnbebrvfkha.supabase.co/functions/v1/avito-invites';
      return cfg.public_begin_url === nativeBase + '/begin' && cfg.redirect_uri === nativeBase + '/callback' && inviteScopesValid(cfg.scopes);
    }
    return (cfg.callback_mode === undefined || cfg.callback_mode === 'relay') && (cfg.redirect_uri === undefined || cfg.redirect_uri === 'https://avitoboss.online/oauth/avito/callback') && (cfg.public_begin_url === undefined || cfg.public_begin_url === null) && (cfg.scopes === undefined || inviteScopesValid(cfg.scopes));
  }
  function invitesReady() { return invitesConfigured() && state.inviteStorageReady; }
  function inviteUnavailable() { state.inviteStorageReady = false; clearInvitation(); notice('Клиентские подключения сейчас недоступны. Личные API-аккаунты и вход продолжают работать.', 'info'); }
  function renderControls() {
    renderTableSettings();
    byId('authPanel').classList.toggle('is-hidden', !!state.session);
    byId('credentialFields').disabled = !securePage() || state.busy || !ready() || !state.session || !canManage();
    byId('organizationSelect').disabled = state.busy || !state.organizations.length;
    byId('refreshBtn').disabled = state.busy;
    byId('refreshAccountBtn').disabled = state.busy || !state.selectedId || !state.session || !canManage();
    byId('loginBtn').disabled = state.busy;
    byId('logoutBtn').classList.toggle('is-hidden', !state.session);
    byId('logoutBtn').disabled = state.busy;
    byId('addApiBtn').disabled = state.busy || !state.session || !ready() || !canManage();
    byId('saveAliasBtn').disabled = state.busy || !state.preferencesReady || !state.aliasTarget;
    byId('cancelReconnectBtn').disabled = state.busy;
    byId('disconnectConfirm').disabled = state.busy;
    byId('createInviteBtn').disabled = state.busy || !securePage() || !invitesReady() || !state.session || !canManage();
    byId('inviteLabel').disabled = byId('createInviteBtn').disabled;
    byId('copyInviteBtn').disabled = state.busy || !state.invitation || !safeInviteUrl(state.invitation.url);
    var currentInvite = state.inviteRecords[state.organizationId];
    byId('cancelInviteBtn').classList.toggle('is-hidden', !currentInvite || !state.session || !canManage());
    byId('cancelInviteBtn').disabled = state.busy || !invitesReady() || !currentInvite || !state.session || !canManage();
    text('inviteState', !invitesConfigured() ? 'Клиентские ссылки пока выключены: безопасный callback ещё не подтверждён.' : !state.session ? 'Войдите как владелец или администратор, чтобы создать ссылку.' : !invitesReady() ? 'Безопасное хранилище клиентских подключений недоступно.' : !canManage() ? 'Для ссылок нужны права владельца или администратора.' : 'Клиент войдёт только в Avito и сам подтвердит доступ. Пароль и ключи не нужны.');
    text('accountsCount', state.session ? (state.listLoaded ? 'Аккаунтов: ' + orderedAccountGroups().filter(function (group) { return !accountLayout(group.avitoUserId).deleted; }).length + ' · показано ' + visibleAccountGroups().length : 'Список не загружен') : 'Требуется вход');
    var message = state.busy ? 'Выполняется запрос...' : !state.configuration ? 'Не удалось проверить настройки' : !configurationReady() ? 'Серверная настройка не завершена' : !state.session ? 'Модуль готов. Войдите в систему.' : !state.organizationId || !canManage() ? 'Нет доступной организации с правами владельца или администратора' : !state.storageReady ? 'Безопасное хранилище аккаунтов недоступно' : 'Подключение по API готово';
    text('pageState', message);
    byId('pageState').dataset.tone = !state.busy && configurationReady() && (!state.session || ready() && canManage()) ? 'ready' : 'warning';
    document.querySelectorAll('.account-actions button').forEach(function (button) { button.disabled = state.busy || button.dataset.requiresPreferences === 'true' && (!state.preferencesReady || button.dataset.validIdentity !== 'true') || button.dataset.requiresCredentials === 'true' && (!securePage() || !ready() || !canManage() || button.dataset.validIdentity !== 'true') || (button.dataset.requiresActive === 'true' && button.dataset.active !== 'true'); });
    document.querySelectorAll('.account-name-input').forEach(function (input) { input.readOnly = state.busy || !state.preferencesReady || !canManage() || input.dataset.validIdentity !== 'true'; });
    document.querySelectorAll('[data-layout-control]').forEach(function (control) { control.disabled = state.busy || !state.layoutReady || !canManage() || control.dataset.validIdentity === 'false' || control.dataset.boundary === 'true' || control.dataset.manualOrder === 'true' && automaticTableOrder(); });
    byId('accountGroupFilter').disabled = state.busy || !state.session;
    byId('accountVisibilityFilter').disabled = state.busy || !state.session;
    TABLE_SORT_KEYS.forEach(function (key) {
      var id = 'sort' + key.charAt(0).toUpperCase() + key.slice(1);
      byId(id).disabled = state.busy || !state.session || !!state.inlineAlias;
      byId(id + 'Heading').setAttribute('aria-sort', state.tablePresentation.sortKey === key ? state.tablePresentation.sortDirection === 'asc' ? 'ascending' : 'descending' : 'none');
    });
    byId('lowAdvanceEnabled').checked = state.tablePresentation.lowAdvanceEnabled;
    byId('lowAdvanceEnabled').disabled = state.busy || !state.session || !!state.inlineAlias;
    if (document.activeElement !== byId('lowAdvanceThreshold')) byId('lowAdvanceThreshold').value = String(state.tablePresentation.lowAdvanceThreshold);
    byId('lowAdvanceThreshold').disabled = state.busy || !state.session || !!state.inlineAlias;
    byId('manualOrderBtn').disabled = state.busy || !automaticTableOrder() || !!state.inlineAlias;
    text('tableOrderState', automaticTableOrder() ? (state.tablePresentation.lowAdvanceEnabled ? state.tablePresentation.sortKey === 'contacts' ? 'Низкий аванс — при одинаковом числе контактов. ' : 'Низкий аванс выше любой сортировки. ' : '') + 'Для перетаскивания нажмите «Ручной порядок».' : 'Ручной порядок');
    Array.prototype.forEach.call(byId('sourceControls').children, function (button) { button.disabled = state.busy || button.dataset.requiresCredentials === 'true' && (!securePage() || !ready() || !canManage() || button.dataset.validIdentity !== 'true'); });
  }
  async function operation(task) {
    if (state.busy) return;
    state.busy = true;
    renderControls();
    try { await task(); } catch (error) { failure(error); } finally { state.busy = false; renderControls(); }
  }
  function date(value) {
    if (!value) return 'Не указано';
    var parsedDate = new Date(value);
    return Number.isFinite(parsedDate.getTime()) ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(parsedDate) : 'Не указано';
  }
  function money(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Не получен';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }
  function moscowDate(value) {
    var parsedDate = new Date(value);
    if (!Number.isFinite(parsedDate.getTime())) return '';
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(parsedDate);
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }
  function moscowDay() { return moscowDate(new Date()); }
  function snapshotDate(value) {
    var parsedDate = new Date(value || '');
    return Number.isFinite(parsedDate.getTime()) ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(parsedDate) + ' МСК' : 'не получено';
  }
  function snapshotTime(value) {
    var parsedDate = new Date(value || '');
    if (!Number.isFinite(parsedDate.getTime())) return 'Нет данных';
    var parts = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(parsedDate);
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.day + '.' + values.month + ' ' + values.hour + ':' + values.minute;
  }
  function metricMoney(section, value) { return section && section.available === true && typeof value === 'number' && Number.isFinite(value) ? money(value) : '-'; }
  function metricCount(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 20 }).format(value) : '-'; }
  function activeAccount(account) { return account && (account.status === 'active' || account.status === 'connected'); }
  function accountKey(account) { return (account && account.source === 'oauth' ? 'oauth:' : 'personal:') + String(account && account.id || ''); }
  function logicalAccounts() {
    var groups = [], byUser = Object.create(null);
    state.accounts.forEach(function (account) {
      var key = account.avito_user_id ? String(account.avito_user_id) : accountKey(account);
      var group = byUser[key];
      if (!group) { group = { avitoUserId: String(account.avito_user_id || ''), personal: null, oauth: null, primary: account }; byUser[key] = group; groups.push(group); }
      var source = account.source === 'oauth' ? 'oauth' : 'personal';
      if (!group[source] || !activeAccount(group[source]) && activeAccount(account)) group[source] = account;
    });
    groups.forEach(function (group) { group.primary = activeAccount(group.personal) ? group.personal : activeAccount(group.oauth) ? group.oauth : group.personal || group.oauth; });
    return groups;
  }
  function groupFor(account) { return logicalAccounts().find(function (group) { return group.avitoUserId && group.avitoUserId === String(account.avito_user_id || '') || accountKey(group.primary) === accountKey(account); }); }
  function accountName(account) { var preference = state.preferences[String(account.avito_user_id || '')]; return preference && preference.display_name || account.display_name || 'Аккаунт Avito'; }
  function openProjectCard(account) {
    var group = groupFor(account), ids = [group && group.personal, group && group.oauth].filter(Boolean).map(accountKey);
    if (!ids.length) ids = [accountKey(account)];
    var params = new URL(window.location.href).searchParams;
    if (params.has('embedded')) {
      var userId = params.get('expected_user_id') || '', organizationId = params.get('organization_id') || '', profile = params.get('profile') || '';
      if (params.get('embedded') !== '1' || ['embedded','expected_user_id','organization_id','profile'].some(function(key){return params.getAll(key).length !== 1;}) || !UUID.test(userId) || !UUID.test(organizationId) || ['fil','sasha'].indexOf(profile) === -1 || jwtSubject((state.session || {}).access_token) !== userId || state.organizationId.toLowerCase() !== organizationId) return notice('Обновите основную систему и войдите в аккаунты под тем же пользователем.', 'error');
      var parentOrigin = window.location.ancestorOrigins && window.location.ancestorOrigins[0];
      var origins = [ADS_PARENT_ORIGIN, 'https://avitoboss.online'];
      var targets = origins.indexOf(parentOrigin) !== -1 ? [parentOrigin] : origins;
      var message = { type: 'avitolog:project-card:open', requestId: crypto.randomUUID(), accountIds: ids, name: accountName(account).slice(0, 200), userId: userId, organizationId: organizationId, profile: profile };
      targets.forEach(function (origin) { window.parent.postMessage(message, origin); });
    } else window.open(ADS_PARENT_ORIGIN + '/AVITOLOG/index.html?projectAccount=' + encodeURIComponent(ids[0]) + '&v=20261027-project-groups3', '_blank', 'noopener');
  }
  function accountIdentity(account) { return accountKey(account) + '|' + String(account && account.avito_user_id || '') + '|' + String(account && account.credential_version || ''); }
  function sameSnapshotIdentity(entry, account) { return !!entry && (entry.payload ? accountIdentity(entry.payload.account) : entry.identity) === accountIdentity(account); }
  function advanceDenied(account, advance) { return account && account.source === 'oauth' && advance && advance.available !== true && (advance.error === 'permission_denied' || advance.error === 'forbidden'); }
  function displayedAdvance(overview) {
    var advance = overview.advance || {};
    if (advance.stale === true && (moscowDate(advance.fetched_at || '') !== moscowDay() || !overview.today || overview.today.date !== moscowDay())) return { available: false, balance: null, error: advance.error };
    return advance;
  }
  function advanceTitle(account, advance) {
    if (advanceDenied(account, advance)) return 'Avito выдаёт CPA-аванс только по персональным API-ключам этого аккаунта. Подключение OAuth не предоставляет этот показатель.';
    if (advance.stale === true) return 'Устаревший аванс. Последнее успешное получение: ' + snapshotDate(advance.fetched_at) + '. ' + unavailable(advance);
    return advance.available === true ? 'Отдельный баланс CPA/аванса Avito, не сумма кошелька' : unavailable(advance);
  }
  function cancelSnapshotRetry() { if (retryTimer !== null) clearTimeout(retryTimer); retryTimer = null; }
  function clearSnapshots(organizationId) {
    closeAccountStackPicker();
    clearAccountBidding();
    cancelSnapshotRetry();
    state.snapshotOrganizationId = organizationId || '';
    state.snapshots = Object.create(null);
    state.tariffPayments = Object.create(null);
    state.listGeneration += 1;
    state.detailGeneration += 1;
    state.selectedId = '';
    state.preferences = Object.create(null);
    state.preferencesReady = false;
    state.aliasTarget = null;
    state.inlineAlias = null;
    state.groupInteraction = null;
    state.pendingAccountRender = false;
    state.layout = emptyLayout();
    state.layoutRevision = 0;
    state.layoutReady = false;
    state.dragAccount = null;
    state.tablePresentation = defaultTablePresentation();
    state.tablePrefsScope = '';
    state.priorityPollAt = 0;
    tablePreferenceRevision += 1;
    text('tablePrefsState', 'Настройки вида сохраняются только в этом браузере.');
    byId('accountGroupFilter').value = '';
    byId('accountVisibilityFilter').value = 'visible';
    state.overviewTask = null;
    resetCredentialForm();
    if (byId('aliasDialog').open) byId('aliasDialog').close();
    byId('sourceControls').replaceChildren();
    byId('accountDetail').classList.add('is-hidden');
    ['profileData', 'balanceData', 'todayData', 'itemsBody'].forEach(function (id) { byId(id).replaceChildren(); });
    text('detailStatus', '');
  }
  function snapshotNote(entry) {
    if (!entry) return 'Данные ещё не получены';
    var overview = entry.payload && entry.payload.overview || {};
    var message = 'Получено: ' + snapshotDate(overview.fetched_at);
    if (overview.cached === true || entry.reused === true) message += '. Из кеша';
    if (overview.stale === true) message += '. Старый снимок';
    if (overview.advance && overview.advance.stale === true) message += '. Аванс устарел: ' + snapshotDate(overview.advance.fetched_at);
    if (entry.payload && entry.payload.balance && entry.payload.balance.stale === true) message += '. Кошелёк устарел: ' + snapshotDate(entry.payload.balance.fetched_at);
    if (overview.today && overview.today.stale === true || overview.history && overview.history.stale === true) message += '. Статистика из последнего успешного обновления: ' + snapshotDate(overview.today && overview.today.stale === true ? overview.today.fetched_at : overview.history.fetched_at);
    if (entry.error) message += '. Обновление не выполнено';
    var today = overview.today || {};
    if (today.date && today.date !== moscowDay()) message += '. Статистика за ' + today.date + ' (МСК), не за сегодня';
    return message;
  }
  function recentSnapshot(entry) {
    if (!entry || entry.cachedOnly === true) return false;
    var overview = entry.payload && entry.payload.overview || {};
    if (overview.today && overview.today.date && overview.today.date !== moscowDay()) return false;
    var fetched = new Date(overview.fetched_at || '').getTime();
    var retry = new Date(overview.retry_at || '').getTime();
    var next = Math.max(entry.attemptedAt + 60000, Number.isFinite(fetched) ? fetched + 60000 : 0, Number.isFinite(retry) ? retry : 0);
    return Date.now() < next;
  }
  function currentSnapshotRequest(organizationId, generation, id) {
    return state.organizationId === organizationId && state.snapshotOrganizationId === organizationId && state.listGeneration === generation && state.accounts.some(function (account) { return accountKey(account) === id && activeAccount(account) && !accountLayout(account.avito_user_id).deleted; });
  }
  function retryCurrent(id, entry) {
    var account = state.accounts.find(function (item) { return accountKey(item) === id; });
    return state.session && entry.retrySession === state.session && entry.retryToken === state.session.access_token && entry.retryAuthGeneration === authGeneration && securePage() && canManage() && entry.retryDay === moscowDay() && currentSnapshotRequest(state.organizationId, entry.retryGeneration, id) && sameSnapshotIdentity(entry, account);
  }
  function armSnapshotRetry() {
    cancelSnapshotRetry();
    if (retryRunning) return;
    var next = Infinity;
    Object.keys(state.snapshots).forEach(function (id) {
      var entry = state.snapshots[id];
      if (entry.retryAt && retryCurrent(id, entry)) next = Math.min(next, entry.retryAt);
    });
    if (Number.isFinite(next)) retryTimer = setTimeout(runSnapshotRetry, Math.min(2147483647, Math.max(0, next - Date.now())));
  }
  async function runSnapshotRetry() {
    retryTimer = null;
    if (state.busy || overviewQueueRuns) { retryTimer = setTimeout(runSnapshotRetry, 1000); return; }
    var id = Object.keys(state.snapshots).find(function (key) { var entry = state.snapshots[key]; return entry.retryAt && entry.retryAt <= Date.now() && retryCurrent(key, entry); });
    if (!id) { armSnapshotRetry(); return; }
    var entry = state.snapshots[id];
    entry.retryAt = null;
    var transient = entry.retryKind === 'transient';
    if (transient) entry.transientRetryCount += 1;
    else entry.retryCount += 1;
    retryRunning = true;
    try { await fetchSnapshot(id, state.organizationId, entry.retryGeneration, false, transient); }
    catch (error) { if (error.status === 401) failure(error); }
    finally { retryRunning = false; armSnapshotRetry(); }
  }
  function transientSnapshot(entry) {
    if (entry.error) return entry.retryableSnapshot === true;
    var payload = entry.payload || {}, overview = payload.overview || {};
    if (['permission_denied', 'forbidden', 'account_disconnected', 'account_changed', 'reconnect_required'].indexOf(overview.error) !== -1) return false;
    return [overview, overview.advance, overview.today, overview.history, overview.listings, payload.balance].some(function (section) { return section && section.error === 'provider_unavailable'; });
  }
  function scheduleSnapshotRetry(id, entry, previous, generation) {
    var retryCount = previous && previous.retryGeneration === generation ? previous.retryCount || 0 : 0;
    var transientRetryCount = previous && previous.retryGeneration === generation ? previous.transientRetryCount || 0 : 0;
    entry.retryGeneration = generation;
    entry.retryCount = retryCount;
    entry.transientRetryCount = transientRetryCount;
    entry.retryAt = null;
    entry.retryKind = '';
    var overview = entry.payload && entry.payload.overview || {};
    var rateLimited = overview.error === 'rate_limited' || overview.advance && overview.advance.error === 'rate_limited' || overview.today && overview.today.error === 'rate_limited';
    var retryAt = typeof overview.retry_at === 'string' ? new Date(overview.retry_at).getTime() : NaN;
    if (rateLimited && Number.isFinite(retryAt) && entry.retryCount < 2) {
      var fetched = new Date(overview.fetched_at || '').getTime();
      entry.retryAt = Math.max(entry.attemptedAt + 60000, retryAt, Number.isFinite(fetched) ? fetched + 60000 : 0);
      entry.retryKind = 'rate';
    } else if (!rateLimited && transientSnapshot(entry) && entry.transientRetryCount < 3) {
      entry.retryAt = Date.now() + [15000, 45000, 120000][entry.transientRetryCount];
      entry.retryKind = 'transient';
    }
    if (entry.retryAt) {
      entry.retrySession = state.session;
      entry.retryToken = state.session && state.session.access_token;
      entry.retryAuthGeneration = authGeneration;
      entry.retryDay = moscowDay();
    }
    armSnapshotRetry();
  }
  function retainAdvance(payload, previous) {
    var overview = payload.overview || {}, advance = overview.advance || {};
    var oldOverview = previous && previous.payload && previous.payload.overview || {}, oldAdvance = oldOverview.advance || {};
    var fetchedAt = oldAdvance.fetched_at || oldOverview.fetched_at;
    var fetchedDay = moscowDate(fetchedAt || '');
    if (['permission_denied', 'forbidden'].indexOf(overview.error) !== -1) return Object.assign({}, payload, { overview: Object.assign({}, overview, { advance: { available: false, balance: null, error: overview.error } }) });
    if (overview.stale === true && advance.available === true) {
      var current = moscowDate(overview.fetched_at || '') === moscowDay() && overview.today && overview.today.date === moscowDay();
      return Object.assign({}, payload, { overview: Object.assign({}, overview, { advance: current ? Object.assign({}, advance, { stale: true, fetched_at: overview.fetched_at, error: overview.error || 'provider_unavailable' }) : { available: false, balance: null, error: overview.error || 'provider_unavailable' } }) });
    }
    if (advance.available !== true && ['rate_limited', 'provider_unavailable'].indexOf(advance.error) !== -1 && sameSnapshotIdentity(previous, payload.account) && oldAdvance.available === true && typeof oldAdvance.balance === 'number' && Number.isFinite(oldAdvance.balance) && oldOverview.today && oldOverview.today.date === moscowDay() && (!overview.today || overview.today.date === moscowDay()) && fetchedDay === moscowDay()) {
      payload = Object.assign({}, payload, { overview: Object.assign({}, overview, { advance: Object.assign({}, oldAdvance, { stale: true, fetched_at: fetchedAt, error: advance.error }) }) });
    }
    return payload;
  }
  function retainKnownMetrics(payload, previous) {
    if (!state.organizationId || state.snapshotOrganizationId !== state.organizationId || !previous || !previous.payload || !activeAccount(payload.account) || !sameSnapshotIdentity(previous, payload.account)) return payload;
    var overview = payload.overview || {}, oldOverview = previous.payload.overview || {}, day = moscowDay();
    if (['permission_denied', 'forbidden', 'account_disconnected', 'account_changed', 'reconnect_required'].indexOf(overview.error) !== -1) return payload;
    var keys = ['views', 'contacts', 'contactsShowPhone', 'contactsMessenger', 'favorites', 'spending'];
    function known(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER; }
    function mergeMetrics(next, old, retained) {
      var result = Object.assign({}, next);
      keys.forEach(function (key) { if (!known(next[key]) && known(old[key])) { result[key] = old[key]; retained.value = true; } });
      return result;
    }
    var mergedOverview = Object.assign({}, overview), changed = false;
    ['today', 'history'].forEach(function (name) {
      var next = overview[name] || {}, old = oldOverview[name] || {}, fetchedAt = old.fetched_at || oldOverview.fetched_at;
      if (['rate_limited', 'provider_unavailable'].indexOf(next.error || overview.error) === -1 || old.available !== true || moscowDate(fetchedAt || '') !== day) return;
      var retained = { value: false }, section;
      if (name === 'today') {
        if (next.date !== day || old.date !== day) return;
        section = mergeMetrics(next, old, retained);
      } else {
        if (next.dateTo !== day || old.dateTo !== day || !/^\d{4}-\d{2}-\d{2}$/.test(old.dateFrom || '') || next.dateFrom !== old.dateFrom || !Array.isArray(old.days) || old.days.length > 30) return;
        section = Object.assign({}, next, { totals: mergeMetrics(next.totals || {}, old.totals || {}, retained) });
        var nextDays = Array.isArray(next.days) ? next.days : [];
        section.days = old.days.map(function (oldDay) {
          var nextDay = nextDays.find(function (item) { return item.date === oldDay.date; });
          return mergeMetrics(nextDay || { date: oldDay.date }, oldDay, retained);
        });
      }
      if (!retained.value) return;
      mergedOverview[name] = Object.assign(section, { available: true, stale: true, fetched_at: fetchedAt });
      changed = true;
    });
    return changed ? Object.assign({}, payload, { overview: mergedOverview }) : payload;
  }
  function retainKnownBalance(payload, previous) {
    var balance = payload.balance || {};
    function known(value) { return value && value.available === true && typeof value.real === 'number' && Number.isFinite(value.real) && typeof value.bonus === 'number' && Number.isFinite(value.bonus); }
    if (known(balance)) {
      if (balance.stale === true) return payload;
      return Object.assign({}, payload, { balance: Object.assign({}, balance, { fetched_at: new Date().toISOString() }) });
    }
    if (!state.organizationId || state.snapshotOrganizationId !== state.organizationId || !previous || !previous.payload || !activeAccount(payload.account) || !sameSnapshotIdentity(previous, payload.account)) return payload;
    if (['provider_unavailable', 'rate_limited', 'try_later'].indexOf(balance.error) === -1 || ['permission_denied', 'forbidden', 'account_disconnected', 'account_changed', 'reconnect_required'].indexOf(payload.overview && payload.overview.error) !== -1) return payload;
    var old = previous.payload.balance;
    if (!known(old) || !Number.isFinite(new Date(old.fetched_at || '').getTime())) return payload;
    return Object.assign({}, payload, { balance: Object.assign({}, old, { stale: true, error: balance.error }) });
  }
  function walletTitle(balance) {
    if (balance.available !== true) return unavailable(balance);
    var message = 'Основной баланс кошелька. Бонусный: ' + metricMoney(balance, balance.bonus);
    if (balance.stale === true) message += '. Устаревшие данные. Последнее успешное получение: ' + snapshotDate(balance.fetched_at) + '. ' + unavailable(balance);
    else if (balance.fetched_at) message += '. Получено: ' + snapshotDate(balance.fetched_at);
    return message;
  }
  function walletField(balance, bonus) {
    var result = field(bonus ? 'Бонусный баланс' : 'Кошелёк', money(bonus ? balance.bonus : balance.real), bonus ? '🎁' : '👛');
    result.title = walletTitle(balance);
    return result;
  }
  function safeCachedOverview(value) {
    function object(item) { return item && typeof item === 'object' && !Array.isArray(item); }
    var day = moscowDay();
    if (!object(value) || typeof value.fetched_at !== 'string' || moscowDate(value.fetched_at) !== day || new Date(value.fetched_at).getTime() > Date.now() + 5000 || typeof value.retry_at !== 'string' || !Number.isFinite(new Date(value.retry_at).getTime())) return null;
    if (['permission_denied', 'forbidden'].indexOf(value.error) !== -1) return null;
    function flags(section) {
      var result = {};
      if (['permission_denied', 'rate_limited', 'storage_unavailable', 'provider_unavailable'].indexOf(section.error) !== -1) result.error = section.error;
      if (section.stale === true || value.stale === true) { result.stale = true; result.fetched_at = value.fetched_at; }
      return result;
    }
    function metrics(section) {
      if (!object(section)) return null;
      var result = {};
      for (var index = 0; index < ADS_METRICS.length; index += 1) {
        var key = ADS_METRICS[index], amount = section[key];
        if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER)) return null;
        result[key] = amount;
      }
      return result;
    }
    var today = value.today, advance = value.advance, listings = value.listings, todayMetrics = metrics(today);
    if (!todayMetrics || typeof today.available !== 'boolean' || today.date !== day || today.timezone !== 'Europe/Moscow') return null;
    if (!object(advance) || typeof advance.available !== 'boolean' || advance.currency !== 'RUB' || advance.balance !== null && (typeof advance.balance !== 'number' || !Number.isFinite(advance.balance))) return null;
    if (!object(listings) || typeof listings.available !== 'boolean' || listings.visibility !== 'status_only' || listings.active !== null && (!Number.isSafeInteger(listings.active) || listings.active < 0)) return null;
    var result = {
      today: Object.assign({ available: today.available, date: day, timezone: 'Europe/Moscow' }, todayMetrics, flags(today)),
      advance: Object.assign({ available: advance.available, balance: advance.balance, currency: 'RUB' }, flags(advance)),
      listings: Object.assign({ available: listings.available, active: listings.active, visibility: 'status_only' }, flags(listings)),
      fetched_at: value.fetched_at, retry_at: value.retry_at, cached: true
    };
    Object.assign(result, flags(value));
    if (value.tariff !== undefined) {
      var tariff = value.tariff;
      if (!object(tariff) || typeof tariff.available !== 'boolean' || tariff.scope !== 'transport_non_cpa') return null;
      result.tariff = Object.assign({ available: tariff.available, scope: tariff.scope }, flags(tariff));
      if (tariff.available === true) {
        if (typeof tariff.name !== 'string' || Array.from(tariff.name).length > 200 || typeof tariff.active !== 'boolean' || tariff.ends_at !== null && (typeof tariff.ends_at !== 'string' || !Number.isFinite(new Date(tariff.ends_at).getTime())) || tariff.days_remaining !== null && (!Number.isSafeInteger(tariff.days_remaining) || tariff.days_remaining < 0)) return null;
        Object.assign(result.tariff, { name: tariff.name, active: tariff.active, ends_at: tariff.ends_at, days_remaining: tariff.days_remaining });
      }
    }
    return result;
  }
  function hydrateCachedOverviews(payload, organizationId, generation, session) {
    if (!session || state.session !== session || !securePage() || !canManage() || state.organizationId !== organizationId || state.snapshotOrganizationId !== organizationId || state.listGeneration !== generation || !Array.isArray(payload.accounts) || !Array.isArray(payload.cached_overviews) || payload.cached_overviews.length > 200) return;
    payload.cached_overviews.forEach(function (saved) {
      if (!saved || !UUID.test(saved.account_id || '') || !UUID.test(saved.credential_version || '')) return;
      var account = state.accounts.find(function (item) { return item.source !== 'oauth' && item.id === saved.account_id && activeAccount(item) && item.credential_version === saved.credential_version && payload.accounts.some(function (listed) { return listed.id === item.id && listed.source !== 'oauth' && listed.credential_version === item.credential_version && String(listed.avito_user_id) === String(item.avito_user_id); }); });
      if (!account) return;
      var id = accountKey(account), previous = state.snapshots[id];
      if (previous && previous.payload && sameSnapshotIdentity(previous, account)) return;
      var overview = safeCachedOverview(saved.overview);
      if (overview) state.snapshots[id] = { payload: { account: account, overview: overview }, attemptedAt: 0, error: null, reused: true, cachedOnly: true };
    });
  }
  function field(label, value, icon) {
    var container = element('dl', 'data-field');
    var heading = element('dt', '', icon ? '' : label);
    if (icon) {
      var marker = element('span', 'metric-icon', icon);
      marker.setAttribute('aria-hidden', 'true');
      heading.appendChild(marker);
      heading.appendChild(element('span', '', label));
    }
    container.appendChild(heading);
    container.appendChild(element('dd', '', value || 'Не получено'));
    return container;
  }
  function status(account) {
    var labels = { active: 'Подключён', connected: 'Подключён', disconnected: 'Отключён', revoked: 'Отключён', expired: 'Нужно переподключить', reconnect_required: 'Нужно переподключить', error: 'Ошибка' };
    var value = String(account.status || '');
    return { text: labels[value] || 'Статус не получен', tone: value === 'active' || value === 'connected' ? 'ready' : value === 'disconnected' || value === 'revoked' ? 'off' : 'warning' };
  }
  function compactAction(button, icon) { button.dataset.icon = icon; button.title = button.title || button.textContent; button.setAttribute('aria-label', button.textContent); }
  function tokenStatus(account) {
    var labels = { active: 'Действует', valid: 'Действует', expired: 'Истёк', missing: 'Не получен', unavailable: 'Недоступен', disconnected: 'Отключён' };
    if (labels[account.token_state]) return labels[account.token_state];
    if (!account.token_expires_at) return 'Срок не получен';
    return new Date(account.token_expires_at).getTime() <= Date.now() ? 'Истёк' : 'Действует';
  }
  function safeAvitoUrl(value) {
    try {
      var url = new URL(String(value || ''));
      return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'avito.ru' || url.hostname.endsWith('.avito.ru')) ? url.href : '';
    } catch (error) { return ''; }
  }
  function appendLink(container, label, value) {
    var target = safeAvitoUrl(value);
    if (!target) { container.textContent = label; return; }
    var link = element('a', '', label);
    link.href = target;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.appendChild(link);
  }
  function resetCredentialForm() {
    state.reconnectId = '';
    state.credentialTarget = '';
    state.credentialMode = '';
    byId('clientId').value = '';
    byId('clientSecret').value = '';
    byId('accountName').value = '';
    byId('credentialGroup').value = '__auto__';
    renderCredentialGroupHint();
    text('credentialTitle', 'Добавить аккаунт');
    text('saveAccountBtn', 'Проверить и добавить');
    byId('cancelReconnectBtn').classList.add('is-hidden');
    text('credentialContext', 'Добавление отдельного аккаунта по его персональным API-ключам.');
    credentialResult('', '');
  }
  function credentialResult(message, tone) { text('credentialStatus', message); byId('credentialStatus').dataset.tone = tone || ''; }
  function selectCredentialTarget(account) {
    var target = String(account.avito_user_id || '');
    if (state.credentialMode !== 'selected' || state.credentialTarget !== target) {
      resetCredentialForm();
      byId('credentialGroup').value = accountLayout(target).group;
      renderCredentialGroupHint();
    }
    var group = groupFor(account), personal = group && group.personal;
    state.credentialMode = 'selected';
    state.credentialTarget = target;
    state.reconnectId = personal ? String(personal.id) : '';
    text('credentialTitle', personal ? 'Обновить персональные API-ключи' : 'Добавить персональные API-ключи');
    text('credentialContext', 'Ключи должны принадлежать этому аккаунту. Avito ID: ' + (target || 'не получен') + '. OAuth-подключение останется отдельным.');
    text('saveAccountBtn', personal ? 'Проверить и обновить ключи' : 'Проверить и привязать ключи');
  }
  function addApiAccount() {
    if (state.busy || !canManage()) return;
    clearAccountBidding();
    resetCredentialForm();
    state.credentialMode = 'new';
    state.selectedId = '';
    byId('accountDetail').classList.remove('is-hidden');
    byId('accountReadData').classList.add('is-hidden');
    byId('sourceControls').replaceChildren();
    byId('credentialPanel').open = true;
    text('detailTitle', 'Добавить аккаунт по API-ключам');
    renderAccounts();
    renderControls();
    byId('clientId').focus();
  }
  function reconnect(account) {
    if (state.busy || !canManage()) return;
    if (account.source === 'oauth') { operation(function () { return createInvitation(account); }); return; }
    openApiCredentials(account);
  }
  function apiCredentialsButton(account) {
    var button = element('button', 'button api-keys-action', 'API');
    button.type = 'button';
    button.title = 'Ввести и сохранить персональные Client ID / Client Secret этого аккаунта';
    button.setAttribute('aria-label', 'API-ключи: ' + accountName(account));
    button.dataset.requiresCredentials = 'true';
    button.dataset.validIdentity = /^[0-9]{1,25}$/.test(String(account.avito_user_id || '')) ? 'true' : 'false';
    button.addEventListener('click', function () { openApiCredentials(account); });
    return button;
  }
  function openApiCredentials(account) {
    if (state.busy || !state.session || !canManage() || !ready() || !securePage()) return;
    if (!account || !/^[0-9]{1,25}$/.test(String(account.avito_user_id || '')) || !state.accounts.some(function (item) { return accountIdentity(item) === accountIdentity(account); })) return;
    selectCredentialTarget(account);
    state.selectedId = accountKey(account);
    byId('accountDetail').classList.remove('is-hidden');
    byId('accountReadData').classList.add('is-hidden');
    renderSourceControls(account);
    byId('credentialPanel').open = true;
    text('detailTitle', accountName(account));
    byId('cancelReconnectBtn').classList.remove('is-hidden');
    renderAccounts();
    renderControls();
    byId('clientId').focus();
  }
  function renderAccounts() {
    byId('accountsGrid').inert=state.cachedPreview===true;
    saveAccountsView();
    state.tablePresentation = checkedTablePresentation(state.tablePresentation);
    // Keep the native group picker mounted while background snapshots arrive.
    var interaction = state.groupInteraction;
    if (interaction && state.session && canManage() && interaction.organizationId === state.organizationId && document.activeElement === interaction.select && state.accounts.some(function (account) { return accountIdentity(account) === interaction.identity; })) {
      state.pendingAccountRender = true;
      renderControls();
      return;
    }
    state.groupInteraction = null;
    state.pendingAccountRender = false;
    // Background reads must not detach the form while the user is typing keys.
    if (!state.busy && state.session && canManage() && byId('accountDetail').dataset.accountKey === state.selectedId && !byId('accountDetail').classList.contains('is-hidden') && byId('credentialPanel').open && ['clientId', 'clientSecret', 'accountName', 'credentialGroup'].some(function (id) { return document.activeElement === byId(id); })) { renderControls(); return; }
    // Background metrics must not replace an in-progress name edit.
    if (state.inlineAlias && state.inlineAlias.organizationId === state.organizationId && state.accounts.some(function (account) { return accountIdentity(account) === accountIdentity(state.inlineAlias.account); })) { renderControls(); return; }
    state.inlineAlias = null;
    // Keep the single credential form alive when the table rows are rebuilt.
    byId('accountDetailHome').appendChild(byId('accountDetail'));
    byId('accountDetail').dataset.accountKey = '';
    var grid = byId('accountsGrid');
    grid.replaceChildren();
    var visibleGroups = visibleAccountGroups();
    if (state.selectedId) byId('accountDetail').classList.toggle('is-hidden', !visibleGroups.some(function (group) { return [group.personal, group.oauth].some(function (source) { return source && accountKey(source) === state.selectedId; }); }));
    byId('accountsMessage').classList.toggle('is-hidden', visibleGroups.length > 0);
    text('accountsMessage', !state.session ? 'Войдите, чтобы увидеть аккаунты вашей организации.' : !state.listLoaded ? 'Список ещё не загружен. Нажмите «Обновить список».' : state.accounts.length ? 'В этом фильтре аккаунтов нет.' : 'Подключённых аккаунтов пока нет.');
    var currentDay = moscowDay();
    var lowBalances = visibleGroups.map(function (group) { return lowAdvance(group, currentDay); });
    state.renderedDay = currentDay;
    text('metricsDate', 'Сегодня: ' + currentDay + ' (МСК)');
    visibleGroups.forEach(function (group, visibleIndex) {
      var account = group.primary;
      var id = accountKey(account);
      var candidate = state.snapshots[id];
      var entry = state.snapshotOrganizationId === state.organizationId && activeAccount(account) && sameSnapshotIdentity(candidate, account) ? candidate : null;
      var payload = entry && entry.payload || {};
      var overview = payload.overview || {};
      var balance = payload.balance || {};
      var advance = displayedAdvance(overview);
      var today = overview.today || {};
      var card = element('tr', 'account-row');
      var settings = accountLayout(group.avitoUserId);
      card.dataset.group = settings.group;
      card.dataset.grouped = state.tablePresentation.sortKey === 'group' ? 'true' : 'false';
      card.dataset.groupStart = state.tablePresentation.sortKey === 'group' && (visibleIndex === 0 || accountLayout(visibleGroups[visibleIndex - 1].avitoUserId).group !== settings.group || lowBalances[visibleIndex - 1] !== lowBalances[visibleIndex]) ? 'true' : 'false';
      card.dataset.visibility = settings.deleted ? 'deleted' : settings.hidden ? 'hidden' : 'visible';
      card.dataset.selected = id === state.selectedId ? 'true' : 'false';
      var identity = element('td', 'account-identity');
      var summary = element('div', 'account-summary');
      summary.title = 'Avito ID: ' + (account.avito_user_id || 'не получен');
      summary.title += account.source === 'oauth' ? '. Подключён с согласия клиента (OAuth).' : '. Персональные API-ключи.';
      var name = element('h3', 'account-name');
      var nameInput = element('input', 'account-name-input');
      nameInput.type = 'text';
      nameInput.value = accountName(account);
      nameInput.size = Math.max(1, Array.from(nameInput.value).length + 1);
      nameInput.autocomplete = 'off';
      nameInput.spellcheck = false;
      nameInput.setAttribute('aria-label', 'Название аккаунта: ' + accountName(account));
      nameInput.title = 'Введите новое имя. Enter или выход из поля: сохранить. Escape: отменить.';
      nameInput.dataset.validIdentity = /^[0-9]{1,25}$/.test(String(account.avito_user_id || '')) ? 'true' : 'false';
      nameInput.addEventListener('focus', function () {
        if (nameInput.readOnly) return;
        if (!state.inlineAlias || state.inlineAlias.input !== nameInput) state.inlineAlias = { organizationId: state.organizationId, account: account, input: nameInput, saving: false, invalid: false, composing: false };
        nameInput.select();
      });
      nameInput.addEventListener('input', function () { nameInput.size = Math.max(1, Array.from(nameInput.value).length + 1); if (state.inlineAlias && state.inlineAlias.input === nameInput) state.inlineAlias.invalid = false; });
      nameInput.addEventListener('compositionstart', function () { if (state.inlineAlias && state.inlineAlias.input === nameInput) state.inlineAlias.composing = true; });
      nameInput.addEventListener('compositionend', function () { if (state.inlineAlias && state.inlineAlias.input === nameInput) state.inlineAlias.composing = false; });
      nameInput.addEventListener('keydown', function (event) {
        var target = state.inlineAlias;
        if (!target || target.input !== nameInput || event.isComposing || target.composing) return;
        if (event.key === 'Escape') { event.preventDefault(); cancelInlineAlias(target); }
        if (event.key === 'Enter') { event.preventDefault(); return saveInlineAlias(target, false); }
      });
      nameInput.addEventListener('blur', function () { if (state.inlineAlias && state.inlineAlias.input === nameInput) return saveInlineAlias(state.inlineAlias, true); });
      name.appendChild(nameInput);
      summary.appendChild(name);
      var metadata = element('div', 'account-meta');
      var accountStatus = status(account);
      var badge = element('span', 'badge account-status', accountStatus.tone === 'ready' ? '' : accountStatus.text);
      badge.dataset.tone = accountStatus.tone;
      badge.title = accountStatus.text + '. ' + summary.title + '. Токен: ' + tokenStatus(account) + '. Срок: ' + date(account.token_expires_at) + '. Добавлен: ' + date(account.created_at);
      if (accountStatus.tone === 'ready') badge.appendChild(element('span', 'visually-hidden', accountStatus.text));
      metadata.appendChild(badge);
      var stackLink = element('button', 'account-stack-link', '+'); stackLink.type = 'button';
      var linkedStack = state.tablePresentation.accountStacks.find(function (stack) { return stack.indexOf(group.avitoUserId) >= 0; });
      stackLink.title = linkedStack ? 'Связанные аккаунты: изменить или разъединить' : 'Держать рядом с другим аккаунтом';
      stackLink.setAttribute('aria-label', 'Связать аккаунт: ' + accountName(account)); stackLink.setAttribute('aria-haspopup', 'dialog');
      stackLink.dataset.linked = linkedStack ? 'true' : 'false'; stackLink.dataset.layoutControl = 'true'; stackLink.dataset.validIdentity = /^[0-9]{1,25}$/.test(group.avitoUserId) ? 'true' : 'false';
      stackLink.addEventListener('click', function () { openAccountStackPicker(group.avitoUserId).catch(failure); }); metadata.appendChild(stackLink);
      var note = element('span', 'snapshot-note visually-hidden', snapshotTime(overview.fetched_at));
      note.title = activeAccount(account) ? 'Последнее обновление. ' + snapshotNote(entry) : 'Отключённые аккаунты не запрашиваются';
      if (account.source === 'oauth' && !invitesReady()) note.title += '. Текущее состояние OAuth временно не подтверждено.';
      badge.title += '. Обновлено: ' + snapshotDate(overview.fetched_at) + '. ' + note.title;
      badge.setAttribute('aria-label', badge.title);
      var snapshotWarning = entry && (entry.error || overview.stale === true || advance.stale === true || balance.stale === true || today.stale === true || overview.history && overview.history.stale === true || today.date && today.date !== currentDay);
      note.dataset.tone = snapshotWarning ? 'warning' : '';
      if (snapshotWarning) {
        var warning = element('span', 'snapshot-warning', '!');
        warning.setAttribute('aria-label', note.title);
        badge.appendChild(warning);
      }
      metadata.appendChild(note);
      summary.appendChild(metadata);
      var movers = element('span', 'row-order-controls');
      var handle = element('button', 'account-row-handle', '⋮⋮');
      handle.type = 'button';
      handle.draggable = true;
      handle.setAttribute('aria-label', 'Перетащить аккаунт ' + accountName(account));
      handle.title = 'Перетащите строку для изменения порядка';
      handle.dataset.layoutControl = 'true';
      handle.dataset.manualOrder = 'true';
      handle.dataset.validIdentity = /^[0-9]{1,25}$/.test(group.avitoUserId) ? 'true' : 'false';
      handle.addEventListener('dragstart', function (event) {
        if (state.busy || !state.layoutReady || state.inlineAlias || automaticTableOrder() || handle.disabled) { event.preventDefault(); return; }
        state.dragAccount = { id: group.avitoUserId, organizationId: state.organizationId };
        card.dataset.dragging = 'true';
        if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', group.avitoUserId); }
      });
      handle.addEventListener('dragend', function () { state.dragAccount = null; card.dataset.dragging = 'false'; card.dataset.dropTarget = 'false'; });
      card.addEventListener('dragover', function (event) { if (state.dragAccount && state.dragAccount.organizationId === state.organizationId && state.dragAccount.id !== group.avitoUserId) { event.preventDefault(); card.dataset.dropTarget = 'true'; } });
      card.addEventListener('dragleave', function () { card.dataset.dropTarget = 'false'; });
      card.addEventListener('drop', function (event) {
        var drag = state.dragAccount;
        state.dragAccount = null;
        card.dataset.dropTarget = 'false';
        if (!drag || drag.organizationId !== state.organizationId) return;
        event.preventDefault();
        return moveAccount(drag.id, 0, group.avitoUserId);
      });
      movers.appendChild(handle);
      summary.appendChild(movers);
      identity.appendChild(summary);
      card.appendChild(identity);
      var walletCell = element('td', 'account-metric', metricMoney(balance, balance.real));
      walletCell.title = walletTitle(balance);
      var advanceCell = element('td', 'account-metric advance-metric', advanceDenied(account, advance) ? '' : metricMoney(advance, advance.balance));
      advanceCell.dataset.lowBalance = lowBalances[visibleIndex] ? 'true' : 'false';
      if (advanceDenied(account, advance)) advanceCell.appendChild(element('span', 'small', 'Нужны API-ключи'));
      advanceCell.title = advanceTitle(account, advance);
      card.appendChild(advanceCell);
      card.appendChild(walletCell);
      var availableToday = today.available === true && today.date === currentDay;
      var spendingCell = element('td', 'account-metric spending-metric', displayedTodayMetric(overview, 'spending', currentDay) !== null ? metricMoney(today, displayedTodayMetric(overview, 'spending', currentDay)) : '-');
      var statisticsFreshness = today.stale === true ? ' Последнее успешное обновление: ' + snapshotDate(today.fetched_at) + '. Новые данные временно недоступны.' : ' Avito может обновлять статистику с задержкой.';
      spendingCell.title = availableToday ? 'Расходы за ' + today.date + ' (МСК).' + statisticsFreshness : unavailable(today);
      card.appendChild(spendingCell);
      var listings = entry ? displayedListings(overview) : null;
      var listingsCell = element('td', 'account-metric listings-metric', listings ? '' : '-');
      var visibilityNote = 'Статусы публикации Avito; видимость в поиске API не сообщает.';
      if (listings) {
        listingsCell.title = (listings.active === 0 ? 'Нет активных объявлений.' : 'Активные объявления: ' + listings.active + '.') + ' ' + visibilityNote;
        if (entry.error || overview.stale === true || listings.stale === true) listingsCell.title += ' Последнее успешное обновление: ' + snapshotDate(listings.fetched_at || overview.fetched_at) + '. Новые данные временно недоступны.';
        listingsCell.setAttribute('aria-label', listingsCell.title);
        var activeListings = element('span', listings.active === 0 ? 'listings-zero' : 'listings-active', metricCount(listings.active));
        activeListings.title = 'Активные объявления';
        listingsCell.appendChild(activeListings);
      } else listingsCell.title = 'Нет актуальных данных о статусах объявлений. ' + visibilityNote + (overview.listings && overview.listings.error ? ' ' + unavailable(overview.listings) : '');
      card.appendChild(listingsCell);
      ['contacts', 'views', 'favorites'].forEach(function (name) {
        var cell = element('td', 'account-metric' + (name === 'contacts' ? ' contacts-metric' : ''), metricCount(displayedTodayMetric(overview, name, currentDay)));
        cell.title = availableToday ? 'За ' + today.date + ' (МСК).' + statisticsFreshness : unavailable(today);
        card.appendChild(cell);
      });
      var actionsCell = element('td', 'account-actions-cell');
      var actions = element('div', 'account-actions');
      var show = element('button', 'button', 'Посмотреть данные');
      compactAction(show, '📊');
      show.type = 'button';
      show.setAttribute('aria-expanded', state.selectedId === id && !byId('accountDetail').classList.contains('is-hidden') ? 'true' : 'false');
      show.dataset.requiresActive = 'true';
      show.dataset.active = accountStatus.tone === 'ready' && !settings.deleted ? 'true' : 'false';
      show.addEventListener('click', function () { operation(function () { return loadDetails(accountKey(account), false); }); });
      actions.appendChild(show);
      var refresh = element('button', 'button', 'Обновить');
      compactAction(refresh, '↻');
      refresh.type = 'button';
      refresh.dataset.requiresActive = 'true';
      refresh.dataset.active = accountStatus.tone === 'ready' && !settings.deleted ? 'true' : 'false';
      refresh.addEventListener('click', function () { operation(function () { return fetchSnapshot(id, state.organizationId, state.listGeneration, true); }); });
      actions.appendChild(refresh);
      if (canManage()) {
        var projectCard = element('button', 'button', 'Карта проекта');
        compactAction(projectCard, '▣');
        projectCard.type = 'button';
        projectCard.addEventListener('click', function () { openProjectCard(account); });
        actions.appendChild(projectCard);
        actions.appendChild(apiCredentialsButton(account));
        if (group.oauth) {
          var renew = element('button', 'button', 'Новая ссылка');
          compactAction(renew, '↗');
          renew.type = 'button';
          renew.addEventListener('click', function () { reconnect(group.oauth); });
          actions.appendChild(renew);
        }
        var remove = element('button', 'button danger', group.personal && group.oauth ? account.source === 'oauth' ? 'Отключить OAuth' : 'Отключить API' : 'Отключить');
        compactAction(remove, '⏻');
        remove.type = 'button';
        remove.dataset.requiresActive = 'true';
        remove.dataset.active = accountStatus.tone === 'ready' ? 'true' : 'false';
        remove.addEventListener('click', function () { openDisconnect(account); });
        actions.appendChild(remove);
        var visibilityActions = element('span', 'row-visibility-actions');
        var hide = element('button', 'button', settings.hidden ? 'Показать' : 'Скрыть');
        compactAction(hide, settings.hidden ? '◉' : '○');
        hide.type = 'button';
        hide.dataset.layoutControl = 'true';
        hide.dataset.validIdentity = handle.dataset.validIdentity;
        hide.addEventListener('click', function () { return updateAccountLayout(account, { hidden: !settings.hidden }); });
        visibilityActions.appendChild(hide);
        var trash = element('button', 'button', settings.deleted ? 'Восстановить' : 'Удалить');
        trash.type = 'button';
        trash.title = settings.deleted ? 'Вернуть аккаунт из удалённых' : 'Убрать в удалённые. Ключи сохранятся, аккаунт можно восстановить через фильтр.';
        compactAction(trash, settings.deleted ? '↶' : '×');
        trash.dataset.layoutControl = 'true';
        trash.dataset.validIdentity = handle.dataset.validIdentity;
        trash.addEventListener('click', function () { return updateAccountLayout(account, { deleted: !settings.deleted, hidden: settings.deleted ? false : settings.hidden }); });
        visibilityActions.appendChild(trash);
        actions.appendChild(visibilityActions);
      }
      actionsCell.appendChild(actions);
      card.appendChild(actionsCell);
      var groupCell = element('td', 'account-group-cell');
      var groupSelect = element('select', 'account-group-select');
      groupSelect.setAttribute('aria-label', 'Группа аккаунта ' + accountName(account));
      ACCOUNT_GROUPS.forEach(function (item) { var option = element('option', '', item[1]); option.value = item[0]; groupSelect.appendChild(option); });
      groupSelect.value = settings.group;
      groupSelect.dataset.group = settings.group;
      groupSelect.dataset.layoutControl = 'true';
      groupSelect.dataset.validIdentity = handle.dataset.validIdentity;
      groupSelect.addEventListener('focus', function () { state.groupInteraction = { select: groupSelect, identity: accountIdentity(account), organizationId: state.organizationId }; });
      groupSelect.addEventListener('change', function () { state.groupInteraction = null; return updateAccountLayout(account, { group: groupSelect.value }); });
      groupSelect.addEventListener('blur', function () {
        if (state.groupInteraction && state.groupInteraction.select === groupSelect) state.groupInteraction = null;
        // Let the next click finish before replacing rows with their latest data.
        if (state.pendingAccountRender) setTimeout(function () { if (state.pendingAccountRender) renderAccounts(); }, 0);
      });
      groupCell.appendChild(groupSelect);
      card.appendChild(groupCell);
      ['name', 'advance', 'wallet', 'spending', 'listings', 'contacts', 'views', 'favorites', 'actions', 'group'].forEach(function (key, index) {
        if (OPTIONAL_COLUMNS.indexOf(key) !== -1) card.children[index].classList.toggle('is-hidden', !state.tablePresentation.columns[key]);
      });
      grid.appendChild(card);
      if (!byId('accountDetail').classList.contains('is-hidden') && [group.personal, group.oauth].some(function (source) { return source && accountKey(source) === state.selectedId; })) {
        var detailRow = element('tr', 'account-detail-row');
        var detailCell = element('td', 'account-detail-cell');
        detailCell.colSpan = 10;
        byId('accountDetail').dataset.accountKey = state.selectedId;
        detailCell.appendChild(byId('accountDetail'));
        detailRow.appendChild(detailCell);
        grid.appendChild(detailRow);
      }
    });
    renderControls();
  }
  function checkDayChange() {
    if (state.renderedDay === moscowDay()) return;
    renderAccounts();
    var entry = state.snapshotOrganizationId === state.organizationId && state.snapshots[state.selectedId];
    if (entry && entry.payload && !byId('accountDetail').classList.contains('is-hidden') && !byId('accountReadData').classList.contains('is-hidden')) renderDetails(entry.payload);
  }
  function startDayWatch() {
    if (dayWatchStarted) return;
    dayWatchStarted = true;
    // The optional priority watch shares the existing timer and bounded read queue.
    setInterval(function () { checkDayChange(); refreshLowAdvance(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') { checkDayChange(); refreshLowAdvance(); } });
  }
  function refreshLowAdvance() {
    if (!state.tablePresentation.lowAdvanceEnabled || document.visibilityState === 'hidden' || !state.session || !securePage() || !ready() || !canManage() || !state.listLoaded || !state.layoutReady || state.busy || state.inlineAlias || overviewQueueRuns || retryRunning || Date.now() - state.priorityPollAt < 120000) return;
    var organizationId = state.organizationId, generation = state.listGeneration;
    var groups = visibleAccountGroups();
    if (!groups.some(function (group) { return activeAccount(group.primary) && !accountLayout(group.avitoUserId).deleted; })) return;
    state.priorityPollAt = Date.now();
    state.overviewTask = overviewTail.catch(function () {}).then(function () {
      if (!state.tablePresentation.lowAdvanceEnabled || document.visibilityState === 'hidden' || !state.session || !ready() || state.busy || state.inlineAlias || !state.layoutReady || state.organizationId !== organizationId || state.listGeneration !== generation) return;
      return loadOverviewQueue(organizationId, generation, groups);
    }).catch(function (error) { if (state.organizationId === organizationId && state.listGeneration === generation) failure(error); });
    overviewTail = state.overviewTask;
    return state.overviewTask;
  }
  function populateOrganizations() {
    var select = byId('organizationSelect');
    select.replaceChildren();
    if (!state.organizations.length) {
      var empty = element('option', '', 'Организация не выбрана');
      empty.value = '';
      select.appendChild(empty);
    }
    state.organizations.forEach(function (org) {
      var option = element('option', '', (org.name || 'Организация') + ' · ' + (org.role || 'участник'));
      option.value = String(org.id);
      select.appendChild(option);
    });
    select.value = state.organizationId;
  }
  async function loadAccounts() {
    if (!state.organizationId || !canManage()) return;
    var organizationId = state.organizationId, listSession = state.session;
    if (state.snapshotOrganizationId !== organizationId) clearSnapshots(organizationId);
    var generation = ++state.listGeneration;
    cancelSnapshotRetry();
    state.preferenceTask = loadPreferences(organizationId, generation);
    state.layoutTask = loadLayout(organizationId, generation);
    state.tablePreferenceTask = loadTablePreferences(organizationId, generation);
    // List reads are independent; keep the snapshot queue behind layout validation.
    var connectionsTask = invitesReady() ? api('/connections?organization_id=' + encodeURIComponent(organizationId), { invites: true }).then(function (payload) { return { payload: payload }; }, function (error) { return { error: error }; }) : null;
    var payload = await api('/accounts?organization_id=' + encodeURIComponent(organizationId));
    if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
    if (!Array.isArray(payload.accounts)) throw new Error('Сервер не подтвердил список аккаунтов. Повторите загрузку.');
    var accounts = payload.accounts;
    if (connectionsTask) {
      try {
        var result = await connectionsTask;
        if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
        if (result.error) throw result.error;
        var connected = result.payload;
        if (!Array.isArray(connected.connections)) throw new Error('Список клиентских подключений не подтверждён');
        accounts = accounts.concat(connected.connections.map(function (account) { return Object.assign({}, account, { source: 'oauth' }); }));
      } catch (error) {
        if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
        inviteUnavailable();
        accounts = accounts.concat(state.accounts.filter(function (account) { return account.source === 'oauth'; }));
      }
    } else accounts = accounts.concat(state.accounts.filter(function (account) { return account.source === 'oauth'; }));
    state.accounts = accounts;
    Object.keys(state.snapshots).forEach(function (id) {
      if (!state.accounts.some(function (account) { return accountKey(account) === id && activeAccount(account) && sameSnapshotIdentity(state.snapshots[id], account); })) delete state.snapshots[id];
    });
    hydrateCachedOverviews(payload, organizationId, generation, listSession);
    state.listLoaded = true; state.cachedPreview = false;
    var selected = state.accounts.find(function (account) { return accountKey(account) === state.selectedId; });
    if (selected) state.selectedId = accountKey(groupFor(selected).primary);
    if (!state.accounts.some(function (account) { return accountKey(account) === state.selectedId; })) {
      state.selectedId = '';
      byId('accountDetail').classList.add('is-hidden');
    }
    renderAccounts();
    var layoutTask = state.layoutTask;
    state.overviewTask = overviewTail.catch(function () {}).then(function () { return layoutTask; }).then(function () {
      if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
      return loadOverviewQueue(organizationId, generation);
    }).catch(function (error) { if (state.organizationId === organizationId && state.listGeneration === generation) failure(error); });
    overviewTail = state.overviewTask;
  }
  async function loadPreferences(organizationId, generation) {
    state.preferencesReady = false;
    try {
      var payload = await api('/preferences?organization_id=' + encodeURIComponent(organizationId));
      if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
      if (!Array.isArray(payload.preferences)) throw new Error('Не удалось получить названия аккаунтов.');
      var preferences = Object.create(null);
      payload.preferences.forEach(function (item) { if (item && /^[0-9]{1,25}$/.test(String(item.avito_user_id || '')) && typeof item.display_name === 'string') preferences[String(item.avito_user_id)] = item; });
      state.preferences = preferences;
      state.preferencesReady = true;
      renderAccounts();
    } catch (error) {
      if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
      state.preferencesReady = false;
      renderControls();
      notice('Названия аккаунтов пока не загружены. Список и API продолжают работать; редактирование имени временно недоступно.', 'info');
    }
  }
  function openAlias(account) {
    if (state.busy || !state.preferencesReady || !canManage()) return;
    state.aliasTarget = { organizationId: state.organizationId, account: account };
    byId('accountAlias').value = accountName(account);
    byId('accountEmoji').value = '';
    if (!byId('aliasDialog').open) byId('aliasDialog').showModal();
    renderControls();
  }
  async function persistAccountAlias(target, value) {
    var account = target.account;
    var payload = await api('/preferences', { method: 'POST', body: { organization_id: target.organizationId, source: account.source === 'oauth' ? 'oauth' : 'personal', account_id: account.id, display_name: value } });
    if (state.organizationId !== target.organizationId) return false;
    if (!payload.preference || String(payload.preference.avito_user_id) !== String(account.avito_user_id) || typeof payload.preference.display_name !== 'string') throw new Error('Сервер не подтвердил сохранение названия.');
    state.preferences[String(account.avito_user_id)] = payload.preference;
    var selected = state.accounts.find(function (item) { return accountKey(item) === state.selectedId; });
    if (selected) text('detailTitle', accountName(selected));
    return true;
  }
  function cancelInlineAlias(target) {
    if (state.inlineAlias !== target || target.saving) return;
    state.inlineAlias = null;
    renderAccounts();
  }
  async function saveInlineAlias(target, blur) {
    if (state.inlineAlias !== target || target.saving || state.busy || target.organizationId !== state.organizationId || !state.preferencesReady || !canManage()) return;
    var value = target.input.value.trim().normalize('NFC');
    if ((blur && target.invalid) || value === accountName(target.account)) { cancelInlineAlias(target); return; }
    if (!value || Array.from(value).length > 200) {
      target.invalid = true;
      notice('Введите название: от 1 до 200 символов, можно с эмодзи.', 'error');
      if (blur) cancelInlineAlias(target);
      return;
    }
    target.saving = true;
    await operation(async function () {
      if (!await persistAccountAlias(target, value)) return;
      state.inlineAlias = null;
      renderAccounts();
      notice('Название аккаунта сохранено.', 'success');
    });
    target.saving = false;
    if (state.inlineAlias === target) { target.input.title = 'Название не сохранено. Enter: повторить. Escape: отменить.'; target.input.focus(); }
  }
  async function saveAlias(event) {
    event.preventDefault();
    var target = state.aliasTarget;
    if (!target || !state.preferencesReady || target.organizationId !== state.organizationId || !canManage()) return;
    var value = byId('accountAlias').value.trim().normalize('NFC');
    if (!value || Array.from(value).length > 200) { notice('Введите название: от 1 до 200 символов, можно с эмодзи.', 'error'); return; }
    await operation(async function () {
      if (!await persistAccountAlias(target, value)) return;
      state.aliasTarget = null;
      byId('aliasDialog').close();
      renderAccounts();
      notice('Название аккаунта сохранено.', 'success');
    });
  }
  async function localLogout() {
    if (state.busy) return;
    var clearing = clearOwnAuthentication();
    failure({ status: 401, message: 'Вы вышли из модуля Avito. Вход в CRM не изменён.' });
    var saved = await clearing;
    if (!saved) notice('Вы вышли из модуля. Браузер не смог запомнить выход после закрытия страницы.', 'info');
  }
  function renderSourceControls(account) {
    var container = byId('sourceControls');
    container.replaceChildren();
    var group = groupFor(account);
    if (!group || !canManage()) return;
    container.appendChild(apiCredentialsButton(account));
    [['personal', 'Отключить API'], ['oauth', 'Отключить OAuth']].forEach(function (source) {
      var connection = group[source[0]];
      if (!connection || !activeAccount(connection)) return;
      var remove = element('button', 'button danger', source[1]);
      remove.type = 'button';
      remove.disabled = state.busy;
      remove.addEventListener('click', function () { openDisconnect(connection); });
      container.appendChild(remove);
    });
  }
  async function fetchSnapshot(id, organizationId, generation, refresh, transientRetry) {
    if (!currentSnapshotRequest(organizationId, generation, id)) return null;
    var existing = state.snapshots[id];
    var account = state.accounts.find(function (item) { return accountKey(item) === id; });
    if (existing && existing.payload && !sameSnapshotIdentity(existing, account)) { delete state.snapshots[id]; existing = null; }
    var retryFailed = transientRetry === true || refresh && existing && (existing.error || transientSnapshot(existing));
    if (!retryFailed && recentSnapshot(existing)) {
      existing.reused = true;
      scheduleSnapshotRetry(id, existing, existing, generation);
      renderAccounts();
      if (!existing.payload) throw new Error('Данные временно недоступны. Повторный запрос возможен через минуту.');
      return existing.payload;
    }
    var attemptedAt = Date.now();
    var identity = accountIdentity(account);
    var oauth = account && account.source === 'oauth';
    var path = (oauth ? '/connections/' : '/accounts/') + encodeURIComponent(account.id);
    var requestKey = organizationId + '|' + identity;
    if (pendingSnapshots[requestKey]) return existing && existing.payload || null;
    pendingSnapshots[requestKey] = true;
    try {
      var payload = refresh ? await api(path + '/refresh', { invites: oauth, method: 'POST', body: { organization_id: organizationId } }) : await api(path + '?organization_id=' + encodeURIComponent(organizationId), { invites: oauth });
      if (!currentSnapshotRequest(organizationId, generation, id) || !state.accounts.some(function (item) { return accountKey(item) === id && accountIdentity(item) === identity; })) return null;
      if (!payload.account || String(payload.account.id || '') !== String(account.id) || !payload.profile) throw new Error('Сервер не подтвердил данные аккаунта. Повторите запрос.');
      if (oauth) payload.account.source = 'oauth';
      payload = retainAdvance(payload, existing);
      payload = retainKnownMetrics(payload, existing);
      payload = retainKnownBalance(payload, existing);
      var entry = { payload: payload, attemptedAt: attemptedAt, error: null };
      state.snapshots[id] = entry;
      state.accounts = state.accounts.map(function (account) { return accountKey(account) === id ? payload.account : account; });
      scheduleSnapshotRetry(id, entry, existing, generation);
      renderAccounts();
      if (state.selectedId === id && !byId('accountDetail').classList.contains('is-hidden') && !byId('accountReadData').classList.contains('is-hidden')) renderDetails(payload);
      return payload;
    } catch (error) {
      if (!currentSnapshotRequest(organizationId, generation, id) || !state.accounts.some(function (item) { return accountKey(item) === id && accountIdentity(item) === identity; })) return null;
      var authorizationLost = error.status === 401 || error.status === 403;
      if (oauth && error.status === 401) { inviteUnavailable(); error = Object.assign(new Error('Клиентские данные сейчас недоступны. Личные аккаунты продолжают работать.'), { status: 503 }); }
      var invalidate = authorizationLost || ['permission_denied', 'forbidden', 'account_disconnected', 'account_changed', 'reconnect_required'].indexOf(error.code) !== -1;
      var oldPayload = !invalidate && existing && existing.payload;
      if (oldPayload) {
        oldPayload = retainAdvance(Object.assign({}, oldPayload, { overview: Object.assign({}, oldPayload.overview, { advance: { available: false, balance: null, error: 'provider_unavailable' } }) }), existing);
        oldPayload = retainKnownBalance(Object.assign({}, oldPayload, { balance: { available: false, error: 'provider_unavailable' } }), existing);
      }
      var failedEntry = { payload: oldPayload || null, identity: identity, attemptedAt: attemptedAt, error: error.message, retryableSnapshot: !invalidate && error.retryableSnapshot === true };
      state.snapshots[id] = failedEntry;
      scheduleSnapshotRetry(id, failedEntry, existing, generation);
      if (invalidate && state.selectedId === id) {
        ['profileData', 'balanceData', 'todayData', 'itemsBody'].forEach(function (name) { byId(name).replaceChildren(); });
        text('detailStatus', 'Доступ не подтверждён. Предыдущие данные скрыты.');
      }
      renderAccounts();
      if (oldPayload && state.selectedId === id && !byId('accountDetail').classList.contains('is-hidden') && !byId('accountReadData').classList.contains('is-hidden')) renderDetails(oldPayload);
      throw error;
    } finally { delete pendingSnapshots[requestKey]; }
  }
  async function loadOverviewQueue(organizationId, generation, groups) {
    overviewQueueRuns += 1;
    var watching = Array.isArray(groups);
    var ids = (groups || orderedAccountGroups()).filter(function (group) { return !accountLayout(group.avitoUserId).deleted; }).map(function (group) { return group.primary; }).filter(function (account) { return activeAccount(account) && (account.source !== 'oauth' || invitesReady()); }).map(accountKey);
    var next = 0;
    async function worker() {
      while (state.organizationId === organizationId && state.listGeneration === generation && next < ids.length && (!watching || state.tablePresentation.lowAdvanceEnabled && document.visibilityState !== 'hidden' && !state.busy && !state.inlineAlias)) {
        var id = ids[next++];
        try { await fetchSnapshot(id, organizationId, generation, false); }
        catch (error) {
          if (state.organizationId !== organizationId || state.listGeneration !== generation) return;
          if (error.status === 401) { failure(error); return; }
        }
      }
    }
    try { await Promise.all([worker(), worker()]); }
    finally { overviewQueueRuns -= 1; armSnapshotRetry(); }
  }
  async function reload() {
    state.configuration = null;
    state.storageReady = false;
    var inviteConfigTask=api('/config', { public: true, invites: true }).then(function(value){return value;},function(){return null;});
    var config = await api('/config', { public: true });
    state.configuration = config.configuration || config;
    state.inviteConfiguration = null;
    state.inviteStorageReady = false;
    var inviteConfig=await inviteConfigTask;if(inviteConfig)state.inviteConfiguration=inviteConfig.configuration||inviteConfig;
    state.session = await activeSession();
    if (!state.session) {
      state.organizations = [];
      state.organizationId = '';
      state.accounts = [];
      state.listLoaded = false;
      state.selectedId = '';
      clearSnapshots('');
      clearInvitation();
      byId('accountDetail').classList.add('is-hidden');
      populateOrganizations();
      renderAccounts();
      return;
    }
    var inviteContextTask=invitesConfigured()?api('/context',{invites:true}).then(function(value){return value;},function(){return null;}):null;
    var context = await api('/context');
    state.storageReady = context.storage_ready === true;
    state.organizations = Array.isArray(context.organizations) ? context.organizations : [];
    if (invitesConfigured()) {
      var inviteContext=await inviteContextTask;if(inviteContext)state.inviteStorageReady=inviteContext.storage_ready===true;else inviteUnavailable();
    }
    var remembered = state.organizationId;
    try { remembered = remembered || sessionStorage.getItem(ORG_KEY) || ''; } catch (error) {}
    state.organizationId = state.organizations.some(function (org) { return String(org.id) === remembered; }) ? remembered : String((state.organizations[0] || {}).id || '');
    if (state.snapshotOrganizationId !== state.organizationId) {
      clearSnapshots(state.organizationId);
      resetCredentialForm();
      closeDisconnect();
      clearInvitation();
    }
    populateOrganizations();
    if (!state.organizationId || !canManage()) {
      clearSnapshots(state.organizationId);
      state.accounts = [];
      state.selectedId = '';
      state.listLoaded = false;
      byId('accountDetail').classList.add('is-hidden');
      renderAccounts();
      throw new Error('Нет организации с правами владельца или администратора');
    }
    if (!state.storageReady) throw new Error('Безопасное хранилище аккаунтов ещё не настроено');
    var listTask=loadAccounts();restoreAccountsView().catch(function(){});await listTask;
  }
  function unavailable(section) {
    var messages = { permission_denied: 'Avito не предоставил права на эти данные.', forbidden: 'Avito не предоставил права на эти данные.', unsupported: 'Этот раздел API пока не подключён.', not_implemented: 'Этот раздел API пока не подключён.', provider_unavailable: 'Avito временно не вернул эти данные.', unavailable: 'Данные сейчас недоступны.', rate_limited: 'Avito ограничил частоту запросов. Повторите позже.' };
    var message = messages[section && section.error] || 'Эти данные недоступны для аккаунта или временно не получены. Нулевые значения не подставляются.';
    var diagnostic = section && section.diagnostic || {};
    var reasons = { http_error: 'ошибка HTTP', transport_error: 'ошибка соединения', invalid_json: 'некорректный JSON', empty_totals: 'пустые итоги статистики', unexpected_group_type: 'неожиданная группировка', invalid_metric: 'неверный формат показателя', invalid_response: 'неожиданный формат ответа' };
    var details = [];
    if (section && Object.prototype.hasOwnProperty.call(messages, section.error)) details.push(section.error);
    if (typeof diagnostic.http_status === 'number' && Number.isInteger(diagnostic.http_status) && diagnostic.http_status >= 100 && diagnostic.http_status <= 599) details.push('HTTP ' + diagnostic.http_status);
    if (typeof diagnostic.reason === 'string' && Object.prototype.hasOwnProperty.call(reasons, diagnostic.reason)) details.push(reasons[diagnostic.reason] + ' (' + diagnostic.reason + ')');
    var shape = diagnostic.shape || {};
    ['has_result', 'has_groupings', 'has_group_type', 'grouping_count', 'total_count', 'metric_count', 'group_is_dates', 'group_is_totals', 'group_is_total', 'group_is_item', 'group_date_matches'].forEach(function (key) {
      var value = shape[key];
      if (typeof value === 'boolean' || typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000000) details.push(key + '=' + value);
    });
    return message + (details.length ? ' Диагностика: ' + details.join('; ') + '.' : '');
  }
  function clearAccountBidding() {
    if (window.AvitoBidding && typeof window.AvitoBidding.clear === 'function') window.AvitoBidding.clear();
    var host = byId('accountBiddingHost');
    if (host) host.replaceChildren();
  }
  function renderAccountBidding(account) {
    var host = byId('accountBiddingHost');
    if (!host || !window.AvitoBidding || !account || !state.session) return;
    var group = groupFor(account), target = group && group.personal && activeAccount(group.personal) ? group.personal : account;
    var org = state.organizationId, selected = state.selectedId, identity = accountIdentity(target), subject = jwtSubject(state.session.access_token);
    var base = (target.source === 'oauth' ? '/connections/' : '/accounts/') + encodeURIComponent(target.id) + '/bidding';
    function current() {
      return !!state.session && canManage() && state.organizationId === org && state.selectedId === selected &&
        jwtSubject(state.session.access_token) === subject && !byId('accountDetail').classList.contains('is-hidden') &&
        state.accounts.some(function (item) { return accountIdentity(item) === identity && activeAccount(item); });
    }
    function guard() { if (!current()) { var error = new Error('Аккаунт или режим изменился. Откройте управление ставками заново.'); error.code = 'bidding_context_changed'; throw error; } }
    window.AvitoBidding.mount(host, {
      key: subject + '|' + org + '|' + identity, organizationId: org,
      account: Object.assign({}, target, { display_name: accountName(account) }), canManage: canManage(), isCurrent: current,
      api: function (path, options) {
        guard();
        if (path.split('?')[0] !== base && path.indexOf(base + '/') !== 0) throw new Error('Недопустимый маршрут управления ставками.');
        return api(path, Object.assign({}, options || {}, { invites: target.source === 'oauth', guard: guard }));
      }
    });
  }
  function renderDetails(payload) {
    var account = payload.account || {};
    var profile = payload.profile || {};
    text('detailTitle', accountName(account));
    byId('accountReadData').classList.remove('is-hidden');
    renderSourceControls(account);
    renderAccountBidding(account);
    var entry = state.snapshotOrganizationId === state.organizationId && state.snapshots[accountKey(account)] || { payload: payload };
    text('detailStatus', snapshotNote(entry) + '. Это данные API, не записи CRM.');
    var profileData = byId('profileData');
    profileData.replaceChildren(field('Имя профиля', profile.name), field('Avito ID', profile.id || account.avito_user_id), field('Токен до', date(account.token_expires_at)));
    var tariff = payload.overview && payload.overview.tariff || {};
    var tariffField = field('Тариф', tariff.available === true ? tariff.name : 'Не предоставлен API');
    tariffField.title = 'Метод Avito доступен только для категории «Транспорт» без CPA, по персональным API-ключам. Для других тарифов данные не подставляются.';
    if (state.tablePresentation.showTariff) profileData.appendChild(tariffField);
    if (state.tablePresentation.showTariff && tariff.available === true) {
      profileData.appendChild(field('Тариф действует', tariff.active === true ? 'Да' : 'Нет'));
      profileData.appendChild(field('Осталось дней', Number.isSafeInteger(tariff.days_remaining) && tariff.days_remaining >= 0 ? String(tariff.days_remaining) : 'Не предоставлено API'));
      profileData.appendChild(field('Тариф до', tariff.ends_at ? date(tariff.ends_at) : 'Не предоставлено API'));
    }
    renderTariffPayment(account);
    if (safeAvitoUrl(profile.profile_url)) {
      var profileLink = field('Страница Avito', '');
      var value = profileLink.children[1];
      value.textContent = '';
      appendLink(value, 'Открыть профиль', profile.profile_url);
      profileData.appendChild(profileLink);
    }
    var balance = payload.balance || {};
    var balanceData = byId('balanceData');
    balanceData.replaceChildren();
    var overview = payload.overview || {};
    var advance = displayedAdvance(overview);
    var advanceField = field('Аванс', advanceDenied(account, advance) ? 'Нужны API-ключи' : metricMoney(advance, advance.balance), '💳');
    advanceField.className += ' advance-field';
    advanceField.title = advanceTitle(account, advance);
    balanceData.appendChild(advanceField);
    if (balance.available === true) {
      balanceData.appendChild(walletField(balance, false));
      balanceData.appendChild(walletField(balance, true));
    } else { balanceData.appendChild(element('p', 'muted', unavailable(balance))); }
    var today = overview.today || {};
    var statistics = byId('todayData');
    statistics.replaceChildren();
    text('todayTitle', 'Статистика за ' + (today.date || moscowDay()) + ' (МСК)');
    renderStatistics(overview);
    var items = payload.items || {};
    var rows = Array.isArray(items.items) ? items.items : [];
    byId('itemsTable').classList.toggle('is-hidden', items.available !== true || rows.length === 0);
    var body = byId('itemsBody');
    body.replaceChildren();
    text('itemsStatus', items.available !== true ? unavailable(items) : rows.length ? 'Показано объявлений: ' + rows.length + (items.has_more === true ? ' (есть следующие страницы).' : '.') : 'Avito вернул пустой список объявлений.');
    rows.forEach(function (item) {
      var row = element('tr');
      row.appendChild(element('td', '', item.id || 'Не получен'));
      var title = element('td');
      appendLink(title, item.title || 'Без названия', item.url);
      row.appendChild(title);
      row.appendChild(element('td', '', item.status || 'Не получен'));
      row.appendChild(element('td', '', money(item.price)));
      body.appendChild(row);
    });
  }
  function renderStatistics(overview) {
    var today = overview.today || {}, history = overview.history || {};
    var currentDay = moscowDay();
    var validToday = today.available === true && today.date === currentDay;
    var validHistory = history.available === true && history.dateTo === currentDay && Array.isArray(history.days) && history.days.length <= 30;
    var period = state.statisticsPeriod === 'today' ? 'today' : 'month';
    text('todayTitle', period === 'today' ? 'Сегодня · ' + currentDay + ' · МСК' : '30 дней · ' + (validHistory ? history.dateFrom + ' — ' + history.dateTo : 'МСК'));
    byId('statisticsTodayBtn').setAttribute('aria-pressed', period === 'today' ? 'true' : 'false');
    byId('statisticsMonthBtn').setAttribute('aria-pressed', period === 'month' ? 'true' : 'false');
    var container = byId('todayData');
    container.replaceChildren();
    var days = period === 'today' ? (validToday ? [today] : []) : validHistory ? history.days : [];
    var totals = period === 'today' ? validToday ? today : {} : validHistory ? history.totals || {} : {};
    [['contacts', 'Контакты', '☎'], ['views', 'Просмотры', '👁'], ['favorites', 'Избранное', '♥'], ['spending', 'Расходы', '₽']].forEach(function (metric) {
      var key = metric[0], isMoney = key === 'spending';
      function valueText(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? isMoney ? money(value) : metricCount(value) : '-'; }
      var panel = element('section', 'statistics-card');
      panel.dataset.metric = key;
      panel.appendChild(element('h4', '', metric[2] + ' ' + metric[1]));
      panel.appendChild(element('strong', 'statistics-total', valueText(totals[key])));
      panel.appendChild(element('span', 'statistics-today', 'Сегодня: ' + valueText(validToday ? today[key] : null)));
      var chart = element('div', 'statistics-chart');
      chart.setAttribute('aria-label', metric[1] + ' по дням');
      var maximum = days.reduce(function (max, day) { return typeof day[key] === 'number' && Number.isFinite(day[key]) && day[key] >= 0 ? Math.max(max, day[key]) : max; }, 0);
      days.forEach(function (day) {
        var known = typeof day[key] === 'number' && Number.isFinite(day[key]) && day[key] >= 0;
        var bar = element('span', 'statistics-bar');
        bar.dataset.known = known ? 'true' : 'false';
        bar.setAttribute('style', '--bar-height:' + (known && maximum ? Math.max(2, Math.round(day[key] / maximum * 100)) : known ? 2 : 0) + '%');
        var tooltip = String(day.date || '') + ' · ' + metric[1] + ': ' + valueText(day[key]);
        bar.title = tooltip;
        bar.setAttribute('aria-label', tooltip);
        bar.tabIndex = 0;
        bar.appendChild(element('span', 'statistics-tooltip', tooltip));
        chart.appendChild(bar);
      });
      panel.appendChild(chart);
      var range = element('span', 'statistics-range', days.length ? String(days[0].date || '').slice(5) + ' — ' + String(days[days.length - 1].date || '').slice(5) : 'Нет данных');
      panel.appendChild(range);
      container.appendChild(panel);
    });
    var shownSection = period === 'today' ? today : history;
    text('statisticsNote', !validToday && period === 'today' ? unavailable(today) : !validHistory && period === 'month' ? unavailable(history) : (shownSection.stale === true ? 'Сохранена статистика с ' + snapshotDate(shownSection.fetched_at) + '; обновление временно недоступно. ' : '') + 'Расходы — деньги на объявления и услуги, без бонусов; не только аванс. Пропуски API показаны прочерком, не нулём.');
  }
  function changeStatisticsPeriod(period) {
    state.statisticsPeriod = period;
    var entry = state.snapshotOrganizationId === state.organizationId && state.snapshots[state.selectedId];
    if (entry && entry.payload) renderStatistics(entry.payload.overview || {});
  }
  function renderTariffPayment(account) {
    var container = byId('tariffPaymentData');
    if (!container) return;
    container.classList.toggle('is-hidden', !state.tablePresentation.estimateTariff);
    container.replaceChildren();
    if (!state.tablePresentation.estimateTariff) return;
    container.appendChild(element('strong', '', 'Тариф по оплатам · тест'));
    var entry = state.tariffPayments[accountKey(account)];
    if (!entry || entry.identity !== accountIdentity(account) || entry.organizationId !== state.organizationId || entry.day !== moscowDay()) { container.appendChild(element('span', '', 'История ещё не проверена.')); return; }
    if (entry.pending) { container.appendChild(element('span', '', 'Проверяем оплаты за 30 дней...')); return; }
    var value = entry.value || {};
    if (value.available !== true) { container.appendChild(element('span', '', value.error === 'permission_denied' ? 'Авито не предоставил доступ к истории операций.' : 'История временно недоступна. Это не означает отсутствие оплаты.')); return; }
    var candidate = value.candidate;
    if (candidate) {
      container.appendChild(element('span', '', 'Предположительно оплата тарифа: ' + money(candidate.amountRub) + ' · ' + date(candidate.paidAt)));
      container.appendChild(element('span', 'small', (candidate.evidence === 'tariff_service' ? 'В операции указан тариф или подписка. ' : 'Совпала только сумма отдельного списания. ') + 'Уровень, действие и срок тарифа не подтверждены. Это не входит в расчёт расходов повторно.'));
    } else container.appendChild(element('span', '', 'За последние 30 дней подходящих отдельных списаний 3 000/6 000 ₽ не найдено. Это не означает, что тарифа нет.'));
  }
  async function fetchTariffPayment(account) {
    if (!state.tablePresentation.estimateTariff || !state.session || !canManage() || !activeAccount(account) || accountKey(account) !== state.selectedId) return;
    var id = accountKey(account), identity = accountIdentity(account), organizationId = state.organizationId, generation = state.listGeneration;
    var key = organizationId + '|' + identity, day = moscowDay(), existing = state.tariffPayments[id];
    if (paymentRequests[key] || existing && existing.identity === identity && existing.organizationId === organizationId && existing.day === day && Date.now() - existing.attemptedAt < 60000) return;
    var entry = { identity: identity, organizationId: organizationId, day: day, attemptedAt: Date.now(), pending: true, value: null };
    state.tariffPayments[id] = entry;
    paymentRequests[key] = true;
    renderTariffPayment(account);
    try {
      var oauth = account.source === 'oauth';
      var payload = await api((oauth ? '/connections/' : '/accounts/') + encodeURIComponent(account.id) + '/refresh', { invites: oauth, method: 'POST', body: { organization_id: organizationId, tariff_payment_only: true } });
      if (state.organizationId !== organizationId || state.listGeneration !== generation || state.tariffPayments[id] !== entry || !state.accounts.some(function (item) { return accountIdentity(item) === identity; })) return;
      if (oauth && payload.account) payload.account.source = 'oauth';
      if (!payload.account || accountIdentity(payload.account) !== identity || !payload.tariff_payment || typeof payload.tariff_payment.available !== 'boolean') throw new Error('Данные оплаты не подтверждены.');
      var value = payload.tariff_payment, candidate = value.candidate;
      if (value.available && (value.dateTo !== day || candidate && (![3000, 6000].includes(candidate.amountRub) || !['tariff_service', 'amount_only'].includes(candidate.evidence) || !Number.isFinite(Date.parse(candidate.paidAt))))) throw new Error('Формат оплаты не подтверждён.');
      entry.value = value;
    } catch (error) {
      if (state.organizationId === organizationId && state.tariffPayments[id] === entry) entry.value = { available: false, error: error.status === 403 ? 'permission_denied' : 'provider_unavailable' };
      if (error.status === 401) failure(error);
    } finally {
      entry.pending = false;
      delete paymentRequests[key];
      if (state.organizationId === organizationId && state.listGeneration === generation && state.selectedId === id && state.tariffPayments[id] === entry && !byId('accountDetail').classList.contains('is-hidden')) renderTariffPayment(account);
    }
  }
  function closeDetails() {
    clearAccountBidding();
    state.selectedId = '';
    state.detailGeneration += 1;
    byId('accountDetail').classList.add('is-hidden');
    resetCredentialForm();
    renderAccounts();
  }
  async function loadDetails(id, refresh) {
    if (!canManage()) throw new Error('Недостаточно прав для просмотра аккаунта');
    if (!refresh && state.selectedId === id && !byId('accountDetail').classList.contains('is-hidden') && !byId('accountReadData').classList.contains('is-hidden')) { closeDetails(); return; }
    var organizationId = state.organizationId;
    var generation = state.listGeneration;
    var detailGeneration = ++state.detailGeneration;
    state.selectedId = id;
    var selectedAccount = state.accounts.find(function (account) { return accountKey(account) === id; });
    if (selectedAccount) { selectCredentialTarget(selectedAccount); renderSourceControls(selectedAccount); }
    byId('credentialPanel').open = false;
    byId('accountReadData').classList.remove('is-hidden');
    byId('accountDetail').classList.remove('is-hidden');
    renderAccountBidding(selectedAccount);
    var previous = state.snapshotOrganizationId === organizationId && state.snapshots[id];
    if (previous && previous.payload && selectedAccount && sameSnapshotIdentity(previous, selectedAccount)) renderDetails(previous.payload);
    else {
      ['profileData', 'balanceData', 'todayData', 'itemsBody'].forEach(function (name) { byId(name).replaceChildren(); });
      byId('itemsTable').classList.add('is-hidden');
      text('itemsStatus', '');
    }
    text('detailStatus', previous && previous.payload ? 'Обновляем данные. Предыдущие значения сохранены на экране.' : 'Получаем актуальные данные от Avito...');
    renderAccounts();
    try {
      var payload = await fetchSnapshot(id, organizationId, generation, refresh);
      if (state.organizationId !== organizationId || state.selectedId !== id || state.detailGeneration !== detailGeneration || !payload) return;
      renderDetails(payload);
      fetchTariffPayment(payload.account);
    } catch (error) {
      if (state.organizationId !== organizationId || state.selectedId !== id || state.detailGeneration !== detailGeneration) return;
      text('detailStatus', 'Данные не получены. Старый снимок не показывается как актуальный.');
      throw error;
    }
  }
  async function submitCredentials(event) {
    event.preventDefault();
    if (state.busy || !canManage() || !ready()) return;
    if (!securePage()) { byId('clientSecret').value = ''; credentialResult('Ввод ключей разрешён только на защищённой странице avitoboss.online.', 'error'); notice('Ввод ключей разрешён только на защищённой странице avitoboss.online.', 'error'); return; }
    var credentials = { organization_id: state.organizationId, display_name: byId('accountName').value.trim(), client_id: byId('clientId').value.trim(), client_secret: byId('clientSecret').value };
    var groupChoice = byId('credentialGroup').value || '';
    var targetId = state.credentialTarget;
    if (state.credentialMode === 'selected') {
      if (!/^[0-9]{1,25}$/.test(targetId)) { byId('clientSecret').value = ''; credentialResult('Avito ID выбранного аккаунта не подтверждён. Обновите список.', 'error'); notice('Avito ID выбранного аккаунта не подтверждён. Обновите список.', 'error'); return; }
      credentials.expected_avito_user_id = targetId;
    }
    byId('clientSecret').value = '';
    credentialResult('Проверяем ключи и принадлежность аккаунту...', '');
    var reconnectId = state.reconnectId;
    await operation(async function () {
      try {
        var path = reconnectId ? '/accounts/' + encodeURIComponent(reconnectId) + '/reconnect' : '/accounts';
        var payload = await api(path, { method: 'POST', body: credentials });
        if (!payload.account || !payload.account.id) throw new Error('Сервер не подтвердил сохранение аккаунта. Проверьте список перед повторным добавлением.');
        if (targetId && String(payload.account.avito_user_id || '') !== targetId) throw new Error('Сервер не подтвердил принадлежность ключей выбранному аккаунту.');
        if (state.organizationId !== credentials.organization_id) return;
        var knownAccount = state.accounts.some(function (account) { return String(account.avito_user_id || '') === String(payload.account.avito_user_id || ''); });
        // The table's saved alias takes precedence over account metadata.
        var nameSaved = true;
        if (credentials.display_name) {
          try { nameSaved = await persistAccountAlias({ account: payload.account, organizationId: credentials.organization_id }, credentials.display_name); }
          catch (error) { nameSaved = false; }
        }
        if (state.organizationId !== credentials.organization_id) return;
        var groupSaved = true;
        try { groupSaved = await saveCredentialGroup(payload.account, groupChoice, knownAccount, credentials.organization_id); }
        catch (error) { groupSaved = false; }
        if (state.organizationId !== credentials.organization_id) return;
        resetCredentialForm();
        var key = accountKey(payload.account);
        delete state.snapshots[key];
        state.accounts = state.accounts.filter(function (account) { return accountKey(account) !== key; }).concat(payload.account);
        state.listLoaded = true;
        state.selectedId = key;
        selectCredentialTarget(payload.account);
        byId('credentialPanel').open = false;
        byId('accountReadData').classList.remove('is-hidden');
        ['profileData', 'balanceData', 'todayData'].forEach(function (name) { byId(name).replaceChildren(); });
        text('detailTitle', accountName(payload.account));
        text('detailStatus', 'Аккаунт сохранён. Загружаем показатели; группу уже можно выбрать в строке.');
        if (!knownAccount) { byId('accountGroupFilter').value = ''; byId('accountVisibilityFilter').value = 'visible'; }
        renderAccounts();
        var settings = accountLayout(String(payload.account.avito_user_id || ''));
        var message = reconnectId ? 'API-ключи проверены и обновлены.' : knownAccount ? 'API-ключи привязаны к существующему аккаунту. OAuth сохранён, дубликат не создаётся.' : 'API-ключи проверены, аккаунт добавлен в таблицу.';
        if (nameSaved && credentials.display_name) message += ' Название сохранено: «' + credentials.display_name + '».';
        if (!nameSaved) message += ' Ключи сохранены, но название сохранить не удалось. Измените его в строке аккаунта; повторно вводить ключи не нужно.';
        if (settings.hidden || settings.deleted) message += ' Аккаунт остаётся в фильтре «' + (settings.deleted ? 'Удалённые' : 'Скрытые') + '»; его настройки не изменены.';
        if (!groupSaved) message += ' Ключи сохранены, но группу не удалось сохранить. Выберите её в строке после обновления списка.';
        credentialResult(message, nameSaved && groupSaved ? 'ready' : 'warning');
        notice(message, nameSaved && groupSaved ? 'success' : 'info');
        loadAccounts().catch(function () { if (state.organizationId === credentials.organization_id) notice('Аккаунт сохранён. Обновление списка временно не удалось; запись не потеряна.', 'info'); });
      } catch (error) {
        if (state.organizationId === credentials.organization_id) credentialResult((error.message || 'Ключи не сохранены. Повторите попытку.') + ' Секрет очищен; для повторной проверки введите его заново.', 'error');
        throw error;
      } finally { credentials.client_secret = ''; credentials.client_id = ''; }
    });
  }
  function openDisconnect(account) {
    if (state.busy || !canManage()) return;
    state.disconnectId = accountKey(account);
    state.disconnectSource = account.source || '';
    text('disconnectText', 'Отключить «' + (account.display_name || 'Аккаунт Avito') + '»? Сервер остановит доступ ' + (account.source === 'oauth' ? 'через это клиентское подключение.' : 'через эти ключи.') + ' Данные CRM, кассы, проектов и другие аккаунты не изменятся.');
    byId('disconnectDialog').showModal();
  }
  function closeDisconnect() { state.disconnectId = ''; state.disconnectSource = ''; if (byId('disconnectDialog').open) byId('disconnectDialog').close(); }
  async function disconnect() {
    if (!state.disconnectId || !canManage()) return;
    var id = state.disconnectId;
    var organizationId = state.organizationId;
    var oauth = state.disconnectSource === 'oauth';
    var account = state.accounts.find(function (item) { return accountKey(item) === id && (item.source === 'oauth') === oauth; });
    if (!account) return;
    await operation(async function () {
      await api((oauth ? '/connections/' : '/accounts/') + encodeURIComponent(account.id) + '/disconnect', { invites: oauth, method: 'POST', body: { organization_id: organizationId, confirmation: 'DISCONNECT' } });
      if (state.organizationId !== organizationId) return;
      delete state.snapshots[id];
      closeDisconnect();
      if (state.selectedId === id) { state.selectedId = ''; byId('accountDetail').classList.add('is-hidden'); }
      if (!oauth && state.reconnectId === String(account.id)) resetCredentialForm();
      await loadAccounts();
      notice('Аккаунт отключён. Данные других модулей не изменены.', 'success');
    });
  }
  function safeInviteUrl(value) {
    try {
      var url = new URL(String(value || ''));
      return url.origin === 'https://avitoboss.online' && !url.username && !url.password && url.pathname === '/integrations/avito-connect/' && !url.search && /^#invite=[a-f0-9]{64}$/.test(url.hash) ? url.href : '';
    } catch (error) { return ''; }
  }
  function clearInvitation() {
    state.invitation = null;
    byId('inviteUrl').value = '';
    text('inviteExpiry', '');
    byId('inviteResult').classList.add('is-hidden');
  }
  async function createInvitation(account) {
    if (!invitesReady() || !canManage()) return;
    var organizationId = state.organizationId;
    var body = { organization_id: organizationId, label: byId('inviteLabel').value.trim(), expires_in_hours: 24 };
    if (account && account.source === 'oauth') {
      body.connection_id = String(account.id);
      body.expected_version = account.credential_version;
    }
    clearInvitation();
    var payload = await api('/invitations', { invites: true, method: 'POST', body: body });
    if (state.organizationId !== organizationId) return;
    var url = safeInviteUrl(payload.url);
    if (!url || !payload.invitation || !Number.isFinite(new Date(payload.invitation.expires_at || '').getTime())) throw new Error('Сервер не подтвердил безопасную ссылку. Ссылка не показана.');
    state.invitation = { url: url, expires_at: payload.invitation.expires_at };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.invitation.id || '')) { clearInvitation(); throw new Error('Сервер не подтвердил возможность отменить ссылку. Ссылка не показана.'); }
    state.inviteRecords[organizationId] = { id: payload.invitation.id, organization_id: organizationId, expires_at: payload.invitation.expires_at };
    byId('inviteUrl').value = url;
    text('inviteExpiry', 'Одноразовая ссылка действует до ' + snapshotDate(payload.invitation.expires_at) + '. Передайте её только нужному клиенту.');
    byId('inviteResult').classList.remove('is-hidden');
    notice('Ссылка создана. Нажмите «Скопировать ссылку» и откройте её в нужном браузере.', 'success');
  }
  async function copyInvitation() {
    var url = state.invitation && safeInviteUrl(state.invitation.url);
    if (!url) return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(url);
      notice('Ссылка скопирована. Отправьте её только нужному клиенту.', 'success');
    } catch (error) { byId('inviteUrl').focus(); byId('inviteUrl').select(); notice('Выделена ссылка. Скопируйте её вручную.', 'info'); }
  }
  async function cancelInvitation() {
    var organizationId = state.organizationId;
    var invitation = state.inviteRecords[organizationId];
    if (!invitation || !invitesReady() || !canManage() || invitation.organization_id !== organizationId) return;
    await api('/invitations/' + encodeURIComponent(invitation.id) + '/revoke', { invites: true, method: 'POST', body: { organization_id: organizationId } });
    if (state.inviteRecords[organizationId] === invitation) delete state.inviteRecords[organizationId];
    if (state.organizationId !== organizationId) return;
    clearInvitation();
    notice('Ссылка отменена. Уже подключённый аккаунт этим действием не отключается.', 'success');
  }
  function bind() {
    OPTIONAL_COLUMNS.map(function (key) { return 'tableShow' + key.charAt(0).toUpperCase() + key.slice(1); }).concat(['tableShowTariff', 'tableEstimateTariff']).forEach(function (id) { var input = byId(id); if (input) input.addEventListener('change', changeTableSettings); });
    byId('noticeClose').addEventListener('click', function () { byId('notice').classList.add('is-hidden'); });
    byId('refreshBtn').addEventListener('click', function () { operation(reload); });
    byId('accountName').addEventListener('input', renderCredentialGroupHint);
    byId('credentialGroup').addEventListener('change', renderCredentialGroupHint);
    byId('sourceControls').addEventListener('click', function () { byId('apiActionsMenu').open = false; });
    ['accountGroupFilter', 'accountVisibilityFilter'].forEach(function (id) { byId(id).addEventListener('change', function () { if (!state.busy) renderAccounts(); }); });
    TABLE_SORT_KEYS.forEach(function (key) { byId('sort' + key.charAt(0).toUpperCase() + key.slice(1)).addEventListener('click', function () { tableSort(key); }); });
    byId('manualOrderBtn').addEventListener('click', manualTableOrder);
    byId('lowAdvanceEnabled').addEventListener('change', function () {
      if (state.busy || state.inlineAlias) return;
      state.tablePresentation.lowAdvanceEnabled = this.checked;
      state.priorityPollAt = Date.now();
      tablePreferenceRevision += 1;
      saveTablePreferences();
      renderAccounts();
    });
    byId('lowAdvanceThreshold').addEventListener('change', function () {
      if (state.busy || state.inlineAlias) return;
      var raw = String(this.value).trim(), value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || value > 1000000000) { this.value = String(state.tablePresentation.lowAdvanceThreshold); return; }
      state.tablePresentation.lowAdvanceThreshold = value;
      tablePreferenceRevision += 1;
      saveTablePreferences();
      renderAccounts();
    });
    byId('credentialForm').addEventListener('submit', submitCredentials);
    byId('addApiBtn').addEventListener('click', addApiAccount);
    byId('logoutBtn').addEventListener('click', localLogout);
    byId('aliasForm').addEventListener('submit', saveAlias);
    byId('cancelAliasBtn').addEventListener('click', function () { state.aliasTarget = null; byId('aliasDialog').close(); });
    byId('accountEmoji').addEventListener('change', function () { if (this.value) { var value = byId('accountAlias').value.replace(/^(?:👤|🏡|🚚|🧱|🏭|🛠️|🌿|⭐)\s*/u, ''); byId('accountAlias').value = this.value + ' ' + value; } });
    byId('cancelReconnectBtn').addEventListener('click', function () { var account = state.accounts.find(function (item) { return accountKey(item) === state.selectedId; }); resetCredentialForm(); if (account) selectCredentialTarget(account); });
    byId('createInviteBtn').addEventListener('click', function () { operation(function () { return createInvitation(); }); });
    byId('inviteUrl').addEventListener('click', function () { this.select(); });
    byId('copyInviteBtn').addEventListener('click', copyInvitation);
    byId('cancelInviteBtn').addEventListener('click', function () { operation(cancelInvitation); });
    byId('refreshAccountBtn').addEventListener('click', function () { byId('apiActionsMenu').open = false; if (state.selectedId) operation(function () { return loadDetails(state.selectedId, true); }); });
    byId('closeDetailsBtn').addEventListener('click', closeDetails);
    byId('statisticsTodayBtn').addEventListener('click', function () { changeStatisticsPeriod('today'); });
    byId('statisticsMonthBtn').addEventListener('click', function () { changeStatisticsPeriod('month'); });
    byId('organizationSelect').addEventListener('change', function () {
      if (state.busy) return;
      state.organizationId = this.value;
      clearSnapshots(state.organizationId);
      try { sessionStorage.setItem(ORG_KEY, state.organizationId); } catch (error) {}
      resetCredentialForm();
      closeDisconnect();
      clearInvitation();
      state.accounts = [];
      state.selectedId = '';
      state.listLoaded = false;
      byId('accountDetail').classList.add('is-hidden');
      renderAccounts();
      operation(loadAccounts);
    });
    byId('disconnectCancel').addEventListener('click', closeDisconnect);
    byId('disconnectConfirm').addEventListener('click', disconnect);
    byId('disconnectDialog').addEventListener('cancel', function (event) { event.preventDefault(); if (!state.busy) closeDisconnect(); });
    byId('loginForm').addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.busy) return;
      var password = byId('loginPassword').value;
      var email = byId('loginEmail').value.trim();
      byId('loginPassword').value = '';
      operation(async function () {
        var cfg = window.AVITOLOG_SUPABASE || {};
        if (!cfg.url || !cfg.publishableKey) throw new Error('Конфигурация входа недоступна');
        try {
          var payload = await request(cfg.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) });
          await saveSession(payload);
          await reload();
        } finally { password = ''; }
      });
    });
  }
  function init() {
    if (workspaceBridge.enabled) { startWorkspaceBridge(); return; }
    if (adsBridge.enabled) { startAdsBridge(); return; }
    if (!securePage()) {
      byId('clientSecret').value = '';
      byId('credentialFields').disabled = true;
      byId('loginBtn').disabled = true;
      byId('refreshBtn').disabled = true;
      text('pageState', 'Откройте защищённую страницу: https://avitoboss.online/integrations/avito-accounts/');
      byId('pageState').dataset.tone = 'error';
      return;
    }
    bind();
    startDayWatch();
    operation(reload);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
