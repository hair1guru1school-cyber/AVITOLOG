(function () {
  'use strict';
  if (!window.AVITOLOG_BACKEND_MODE) return;

  var cfg = window.AVITOLOG_SUPABASE || {};
  var coreKeys = {
    avitolog_clients: true, avitolog_projects: true, crm_tasks_v1: true,
    avitolog_clients_sasha: true, avitolog_projects_sasha: true, crm_tasks_v1_sasha: true
  };
  var coreEnabled = false;
  var financeEnabled = false;
  var contentEnabled = false;
  var timers = {};
  var pendingWrites = {};
  var writeInFlight = {};
  var appliedRevisions = {};
  var statusEl;
  var persistentSessionKey = 'avitolog_backend_session_v1';
  var serverOnlyMode = !!window.AVITOLOG_BACKEND_SERVER_ONLY;
  var pullTimer = null;
  var lastLocalWriteAt = 0;
  var initialSyncReady = !serverOnlyMode;
  var DIRTY_RETRY_TTL_MS = 14 * 24 * 60 * 60 * 1000;
  var DIRTY_QUEUE_KEY = 'avitolog_backend_dirty_keys_v1';
  var PENDING_PAYLOAD_PREFIX = 'avitolog_backend_pending_payload_';
  function revisionSignatureStorageKey() {
    return 'avitolog_backend_revision_signature_' + (window.AVITOLOG_KEY_SUFFIX === '_sasha' ? 'sasha' : 'fil');
  }
  function dirtyStorageKey(key) {
    return 'avitolog_backend_dirty_' + String(key || '').replace(/[^\w.-]+/g, '_');
  }
  function pendingPayloadKey(key) {
    return PENDING_PAYLOAD_PREFIX + String(key || '').replace(/[^\w.-]+/g, '_');
  }
  function parseStoredJson(raw) {
    try { return JSON.parse(raw || 'null'); } catch (e) { return null; }
  }
  function shadowWriteRaw(key, value) {
    try {
      if (window.__crmShadow && typeof window.__crmShadow.writeLive === 'function') {
        window.__crmShadow.writeLive(String(key), String(value == null ? '' : value));
      }
    } catch (e) {}
  }
  function readShadowLiveAll() {
    return new Promise(function(resolve) {
      try {
        if (!window.__crmShadow || typeof window.__crmShadow.readAllLive !== 'function') return resolve(null);
        window.__crmShadow.readAllLive(function(rows) { resolve(rows || null); });
      } catch (e) { resolve(null); }
    });
  }
  function pendingPayloadFromRaw(key, raw) {
    var data = parseStoredJson(raw);
    if (!data || String(data.key || '') !== String(key || '')) return null;
    var ts = Number(data.ts || 0);
    if (!ts || (Date.now() - ts) > DIRTY_RETRY_TTL_MS) return null;
    return {
      key: String(data.key),
      value: String(data.value == null ? '' : data.value),
      previousValue: String(data.previousValue == null ? '' : data.previousValue),
      ts: ts
    };
  }
  function readPendingPayloadCached(key, shadowRows) {
    var raw = storageGetAny(pendingPayloadKey(key));
    if (!raw && shadowRows && shadowRows[pendingPayloadKey(key)]) {
      raw = String(shadowRows[pendingPayloadKey(key)].value || '');
    }
    return pendingPayloadFromRaw(key, raw);
  }
  async function readPendingPayload(key, shadowRows) {
    var hit = readPendingPayloadCached(key, shadowRows);
    if (hit) return hit;
    var rows = shadowRows || await readShadowLiveAll();
    return readPendingPayloadCached(key, rows);
  }
  function rememberPendingPayload(key, value, previousValue) {
    if (!key) return;
    var raw = JSON.stringify({
      key: String(key),
      value: String(value == null ? '' : value),
      previousValue: String(previousValue == null ? '' : previousValue),
      ts: Date.now()
    });
    var pKey = pendingPayloadKey(key);
    try { sessionStorage.setItem(pKey, raw); } catch (eSession) {}
    try { localStorage.setItem(pKey, raw); } catch (eLocal) {}
    shadowWriteRaw(pKey, raw);
  }
  function clearPendingPayload(key) {
    var pKey = pendingPayloadKey(key);
    try { sessionStorage.removeItem(pKey); } catch (eSession) {}
    try { localStorage.removeItem(pKey); } catch (eLocal) {}
    shadowWriteRaw(pKey, '');
  }
  function storageGetAny(key) {
    var value = '';
    try { value = localStorage.getItem(key) || ''; } catch (eLocal) {}
    if (!value) { try { value = sessionStorage.getItem(key) || ''; } catch (eSession) {} }
    return value;
  }
  function readDirtyKeys() {
    var out = [];
    var seen = {};
    [storageGetAny(DIRTY_QUEUE_KEY)].forEach(function(raw) {
      try {
        JSON.parse(raw || '[]').forEach(function(key) {
          if (key && !seen[key]) { seen[key] = true; out.push(key); }
        });
      } catch (e) {}
    });
    return out;
  }
  function writeDirtyKeys(keys) {
    var raw = JSON.stringify((keys || []).filter(Boolean));
    try { localStorage.setItem(DIRTY_QUEUE_KEY, raw); } catch (eLocal) {}
    try { sessionStorage.setItem(DIRTY_QUEUE_KEY, raw); } catch (eSession) {}
    shadowWriteRaw(DIRTY_QUEUE_KEY, raw);
  }
  async function readDirtyKeysWithShadow(shadowRows) {
    var out = readDirtyKeys();
    var seen = {};
    out.forEach(function(key) { if (key) seen[key] = true; });
    var rows = shadowRows || await readShadowLiveAll();
    if (rows) {
      var dirtyRow = rows[DIRTY_QUEUE_KEY];
      try {
        JSON.parse((dirtyRow && dirtyRow.value) || '[]').forEach(function(key) {
          if (key && !seen[key]) { seen[key] = true; out.push(key); }
        });
      } catch (e) {}
      Object.keys(rows).forEach(function(rowKey) {
        if (rowKey.indexOf(PENDING_PAYLOAD_PREFIX) !== 0) return;
        var data = parseStoredJson(rows[rowKey] && rows[rowKey].value);
        var key = data && data.key;
        if (key && !seen[key]) { seen[key] = true; out.push(key); }
      });
    }
    return out;
  }
  function rememberDirtyKey(key) {
    var keys = readDirtyKeys();
    if (keys.indexOf(key) < 0) { keys.push(key); writeDirtyKeys(keys); }
  }
  function forgetDirtyKey(key) {
    var keys = readDirtyKeys().filter(function(item) { return item !== key; });
    writeDirtyKeys(keys);
  }
  function markDirty(key) {
    if (!key) return;
    try { localStorage.setItem(dirtyStorageKey(key), String(Date.now())); } catch (e) {}
    try { sessionStorage.setItem(dirtyStorageKey(key), String(Date.now())); } catch (e2) {}
    rememberDirtyKey(key);
  }
  function clearDirty(key) {
    if (!key) return;
    try { localStorage.removeItem(dirtyStorageKey(key)); } catch (e) {}
    try { sessionStorage.removeItem(dirtyStorageKey(key)); } catch (e2) {}
    forgetDirtyKey(key);
  }
  function isRecentlyDirty(key) {
    try {
      var ts = Number(storageGetAny(dirtyStorageKey(key)) || 0);
      return !!ts && (Date.now() - ts) < DIRTY_RETRY_TTL_MS;
    } catch (e) {
      return false;
    }
  }

  function ensureStatus() {
    if (statusEl) return statusEl;
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'position:fixed;z-index:2147483647;right:12px;bottom:12px;padding:7px 10px;border-radius:8px;background:#584713;color:#fff;font:700 11px Segoe UI,Arial,sans-serif;box-shadow:0 2px 12px #0008';
    document.body.appendChild(statusEl);
    return statusEl;
  }

  function isFinanceKey(key) {
    return /^avitolog_goals_v1(?:_sasha)?(?:_month_\d{4}-\d{2})?$/.test(key) ||
      /^avitolog_goal_achievements_v1(?:_sasha)?$/.test(key) ||
      /^avitolog_assets_(?:my|sasha|base)_v2(?:_sasha)?(?:_month_\d{4}-\d{2})?$/.test(key);
  }
  function isContentKey(key) {
    if (/^avitolog_kp_editor(?:_|$)/.test(String(key || ''))) return false;
    if (key === 'avitolog_kp_preview_width' || key === 'avitolog_kp_editor_zoom') return false;
    return /^avitolog_kp_/.test(key) || key === 'avito_kp_saved_client_packages_v1' || key === 'avito_kp_custom' ||
      key === 'avitolog_aoax_autoloads_v1' ||
      /^crm_ads_(?:expenses_v1|expenses_month_\d{4}-\d{2}|posts_plan_v1|posts_source_v1|links_v1|posts_sync_queue_v1)$/.test(key);
  }
  function isAllowed(key) { return Boolean(coreKeys[key] || isFinanceKey(key) || isContentKey(key)); }
  function isSashaScopedKey(key) {
    return /_sasha(?:_month_\d{4}-\d{2})?$/.test(String(key || ''));
  }
  function isBackendSessionSasha() {
    var data = sessionData();
    return String((data && data.email) || '').toLowerCase() === 'cyplakovaleksandr153@gmail.com';
  }
  function isServerOnlySashaViewer() {
    return serverOnlyMode && window.AVITOLOG_KEY_SUFFIX === '_sasha' && !isBackendSessionSasha();
  }
  function isCurrentProfileWritableKey(key) {
    var sashaProfile = window.AVITOLOG_KEY_SUFFIX === '_sasha';
    if (isContentKey(key)) return !sashaProfile;
    return sashaProfile ? isSashaScopedKey(key) : !isSashaScopedKey(key);
  }
  function sessionData() {
    try {
      var temporary = sessionStorage.getItem('avitolog_backend_preview_session') || sessionStorage.getItem('avitolog_backend_app_session');
      var raw = temporary || localStorage.getItem(persistentSessionKey) || 'null';
      if (temporary && !localStorage.getItem(persistentSessionKey)) {
        try { localStorage.setItem(persistentSessionKey, temporary); } catch (persistError) {}
      }
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function clearBackendSession() {
    try { sessionStorage.removeItem('avitolog_backend_preview_session'); } catch (e1) {}
    try { sessionStorage.removeItem('avitolog_backend_app_session'); } catch (e2) {}
    try { localStorage.removeItem(persistentSessionKey); } catch (e3) {}
  }
  function isSessionExpiredError(error) {
    return /session expired|jwt expired|invalid refresh token|refresh_token/i.test(String((error && error.message) || error || ''));
  }
  function showReauthStatus(prefix) {
    ensureStatus();
    statusEl.innerHTML = '';
    statusEl.style.background = '#701b2b';
    var text = document.createElement('span');
    text.textContent = (prefix || 'Supabase') + ': сессия истекла. ';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Войти';
    btn.style.cssText = 'margin-left:8px;padding:3px 8px;border:0;border-radius:6px;background:#ffd0dc;color:#24050b;font:800 11px Segoe UI,Arial,sans-serif;cursor:pointer';
    btn.onclick = function () {
      clearBackendSession();
      window.location.href = 'backend-preview.html?v=20260801-no-auto-backend-1';
    };
    statusEl.appendChild(text);
    statusEl.appendChild(btn);
  }
  function saveSession(data) {
    var previous = sessionData() || {};
    var key = sessionStorage.getItem('avitolog_backend_preview_session') ? 'avitolog_backend_preview_session' : 'avitolog_backend_app_session';
    var expiresAt = Number(data.expires_at || 0);
    if (!expiresAt && data.expires_in) expiresAt = Math.floor(Date.now() / 1000) + Number(data.expires_in);
    var value = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: expiresAt,
      email: String((data.user && data.user.email) || data.email || previous.email || '').toLowerCase()
    };
    sessionStorage.setItem(key, JSON.stringify(value));
    try { localStorage.setItem(persistentSessionKey, JSON.stringify(value)); } catch (persistError) {}
    return value;
  }
  async function token() {
    var data = sessionData();
    if (!data || !data.access_token) return null;
    if (!data.expires_at || Number(data.expires_at) > Math.floor(Date.now() / 1000) + 60) return data.access_token;
    if (!data.refresh_token) return null;
    var response = await fetch(cfg.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: data.refresh_token })
    });
    var refreshed = await response.json();
    if (!response.ok || !refreshed.access_token) {
      return null;
    }
    return saveSession(refreshed).access_token;
  }
  async function headers(extra) {
    var accessToken = await token();
    if (!accessToken) throw new Error('Supabase session expired');
    return Object.assign({ apikey: cfg.publishableKey, Authorization: 'Bearer ' + accessToken }, extra || {});
  }
  function setStatus(text, error) {
    if (!statusEl && !error && !window.AVITOLOG_BACKEND_PREVIEW) return;
    ensureStatus();
    statusEl.textContent = text;
    statusEl.style.background = error ? '#701b2b' : '#073f35';
  }
  function rememberRevision(key, revision) {
    var rev = Number(revision || 0);
    if (!key || !rev) return;
    appliedRevisions[key] = Math.max(Number(appliedRevisions[key] || 0), rev);
  }
  function isOlderOrSameRevision(key, revision) {
    var rev = Number(revision || 0);
    var known = Number(appliedRevisions[key] || 0);
    return !!rev && !!known && rev <= known;
  }
  async function writeKey(key, value) {
    var response = await fetch(cfg.url + '/rest/v1/rpc/upsert_frontend_state', {
      method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_key: key, p_value: String(value == null ? '' : value) })
    });
    if (!response.ok) throw new Error('[' + key + '] ' + ((await response.text()) || 'Supabase write failed'));
    var result = await response.json();
    rememberRevision(key, result && result.revision);
    return result;
  }
  function writeKeyKeepalive(key, value) {
    try {
      var data = sessionData();
      var accessToken = data && data.access_token;
      if (!accessToken || !key) return false;
      if (data && data.expires_at && Number(data.expires_at) <= Math.floor(Date.now() / 1000) + 60) return false;
      var body = JSON.stringify({ p_key: key, p_value: String(value == null ? '' : value) });
      if (body.length > 60000) return false;
      fetch(cfg.url + '/rest/v1/rpc/upsert_frontend_state', {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: cfg.publishableKey,
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: body
      }).catch(function () {});
      return true;
    } catch (e) {
      return false;
    }
  }
  function isProjectsStorageKey(key) {
    return /^avitolog_projects(?:_sasha)?$/.test(String(key || ''));
  }
  function parseJsonValue(value) {
    try { return JSON.parse(value || ''); } catch (e) { return null; }
  }
  function stableJson(value) {
    try { return JSON.stringify(value == null ? null : value); } catch (e) { return String(value); }
  }
  function backendItemId(item) {
    item = item || {};
    return String(item.id || item.projectId || item.task_id || item.client_id || item.uuid || '').trim();
  }
  function mergeArrayByChangedIds(remoteArr, previousArr, nextArr) {
    remoteArr = Array.isArray(remoteArr) ? remoteArr : [];
    previousArr = Array.isArray(previousArr) ? previousArr : [];
    nextArr = Array.isArray(nextArr) ? nextArr : [];
    if (!remoteArr.length && nextArr.length) return nextArr.slice();
    var prevById = {};
    var nextById = {};
    var changedById = {};
    var removedById = {};
    previousArr.forEach(function (item) {
      var id = backendItemId(item);
      if (id) prevById[id] = item;
    });
    nextArr.forEach(function (item) {
      var id = backendItemId(item);
      if (id) nextById[id] = item;
    });
    Object.keys(nextById).forEach(function (id) {
      if (!prevById[id] || stableJson(prevById[id]) !== stableJson(nextById[id])) changedById[id] = nextById[id];
    });
    Object.keys(prevById).forEach(function (id) {
      if (!nextById[id]) removedById[id] = prevById[id];
    });
    var out = [];
    var seen = {};
    remoteArr.forEach(function (item) {
      var id = backendItemId(item);
      if (id && removedById[id] && stableJson(item) === stableJson(removedById[id])) return;
      if (id && changedById[id]) {
        out.push(changedById[id]);
        seen[id] = true;
        return;
      }
      out.push(item);
      if (id) seen[id] = true;
    });
    Object.keys(changedById).forEach(function (id) {
      if (!seen[id]) out.push(changedById[id]);
    });
    return out;
  }
  function mergeProjectsValue(remoteValue, previousValue, nextValue) {
    var remote = parseJsonValue(remoteValue);
    var previous = parseJsonValue(previousValue);
    var next = parseJsonValue(nextValue);
    if (!remote || !previous || !next || !Array.isArray(previous.projects) || !Array.isArray(next.projects)) return nextValue;
    var out = Object.assign({}, remote);
    ['projects', 'hiddenProjects', 'tasks', 'taskLog'].forEach(function (field) {
      if (Array.isArray(next[field]) || Array.isArray(previous[field]) || Array.isArray(remote[field])) {
        out[field] = mergeArrayByChangedIds(remote[field], previous[field], next[field]);
      }
    });
    return JSON.stringify(out);
  }
  async function prepareValueForWrite(key, value, previousValue) {
    if (!isProjectsStorageKey(key) || !previousValue) return value;
    try {
      var rows = await readRemote();
      var row = (rows || []).find(function (item) { return item && item.storage_key === key; });
      if (!row || !row.value_text) return value;
      return mergeProjectsValue(row.value_text, previousValue, value);
    } catch (e) {
      return value;
    }
  }
  function writeLabelForKey(key) {
    return coreKeys[key] ? 'CRM/проекты' : (isFinanceKey(key) ? 'кассу/цели' : 'КП/ADS');
  }
  function drainPendingWrite(key) {
    if (writeInFlight[key]) {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(function () { timers[key] = null; drainPendingWrite(key); }, 250);
      return;
    }
    var pending = pendingWrites[key];
    if (!pending) return;
    writeInFlight[key] = true;
    var shouldWriteNext = false;
    prepareValueForWrite(key, pending.value, pending.previousValue).then(function (prepared) {
      return writeKey(key, prepared).then(function (result) {
        return { result: result, prepared: prepared };
      });
    }).then(function (payload) {
      if (pendingWrites[key] === pending) {
        delete pendingWrites[key];
        clearDirty(key);
        clearPendingPayload(key);
        setStatus('Supabase: сохранено · версия ' + payload.result.revision);
      } else {
        shouldWriteNext = true;
        setStatus('Supabase: дописываю свежую версию...');
      }
    }).catch(function (error) {
      if (isSessionExpiredError(error)) { showReauthStatus('Supabase write'); return; }
      setStatus('Ошибка записи: ' + error.message, true);
    }).finally(function () {
      writeInFlight[key] = false;
      if (shouldWriteNext || pendingWrites[key]) schedulePendingWrite(key, 0);
    });
  }
  function schedulePendingWrite(key, delay) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      timers[key] = null;
      drainPendingWrite(key);
    }, delay);
  }
  function flushDeferredPendingWrites() {
    Object.keys(pendingWrites).forEach(function (key) {
      if (!timers[key]) schedulePendingWrite(key, 0);
    });
  }
  function queueWrite(key, value, previousValue) {
    if (!isAllowed(key)) return;
    if (!isCurrentProfileWritableKey(key)) return;
    lastLocalWriteAt = Date.now();
    var enabled = coreKeys[key] ? coreEnabled : (isFinanceKey(key) ? financeEnabled : (isContentKey(key) && contentEnabled));
    if (!enabled && !serverOnlyMode) return;
    pendingWrites[key] = { value: String(value == null ? '' : value), previousValue: String(previousValue == null ? '' : previousValue), ts: Date.now() };
    rememberPendingPayload(key, value, previousValue);
    markDirty(key);
    setStatus('Supabase: сохраняю ' + writeLabelForKey(key) + '...');
    if (serverOnlyMode && !initialSyncReady) return;
    var delay = (key.indexOf('projects') >= 0 || isFinanceKey(key)) ? 0 : 700;
    schedulePendingWrite(key, delay);
  }
  function flushPendingWritesKeepalive() {
    Object.keys(pendingWrites).forEach(function (key) {
      var pending = pendingWrites[key];
      if (!pending) return;
      try { clearTimeout(timers[key]); } catch (e0) {}
      writeKeyKeepalive(key, pending.value);
    });
  }
  window.addEventListener('pagehide', flushPendingWritesKeepalive);
  window.addEventListener('beforeunload', flushPendingWritesKeepalive);
  async function readRemote() {
    var sashaProfile = typeof window !== 'undefined' && window.AVITOLOG_KEY_SUFFIX === '_sasha';
    var response = await fetch(cfg.url + '/rest/v1/rpc/read_frontend_state', {
      method: 'POST',
      headers: await headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_sasha: !!sashaProfile })
    });
    if (!response.ok && response.status === 404) {
      response = await fetch(cfg.url + '/rest/v1/frontend_state_records?select=storage_key,value_text,revision,updated_at&order=storage_key', { headers: await headers() });
    }
    if (!response.ok) throw new Error((await response.text()) || 'frontend_state_records read failed');
    return response.json();
  }
  async function ensureSashaTeamMember() {
    if (window.AVITOLOG_BACKEND_PREVIEW) return;
    var data = sessionData();
    var email = String((data && data.email) || '').toLowerCase();
    if (!email || email === 'cyplakovaleksandr153@gmail.com') return;
    var flag = 'avitolog_backend_sasha_member_checked_v2';
    try {
      if (sessionStorage.getItem(flag) === '1') return;
      sessionStorage.setItem(flag, '1');
    } catch (eFlag) {}
    try {
      await fetch(cfg.url + '/rest/v1/rpc/add_team_member_by_email', {
        method: 'POST',
        headers: await headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ p_email: 'cyplakovaleksandr153@gmail.com' })
      });
    } catch (e) {}
  }
  function isStaleRemoteRow(row) {
    var t = Date.parse((row && row.updated_at) || '');
    return !!t && (Date.now() - t) > 12 * 60 * 60 * 1000;
  }
  function shouldKeepLocalOverStaleRemote(row, localValue) {
    if (!serverOnlyMode || !row || !localValue || localValue === (row.value_text || '')) return false;
    if (!isCurrentProfileWritableKey(row.storage_key) || !isStaleRemoteRow(row)) return false;
    if (!hasProfileData(row.storage_key, localValue)) return false;
    return profileValueScore(row.storage_key, localValue) > profileValueScore(row.storage_key, row.value_text || '');
  }
  function shouldKeepLocalOverOlderLowerRemote(row, localValue, shadowRows) {
    if (!serverOnlyMode || !row || !localValue || localValue === (row.value_text || '')) return false;
    if (!isCurrentProfileWritableKey(row.storage_key) || !hasProfileData(row.storage_key, localValue)) return false;
    var localScore = profileValueScore(row.storage_key, localValue);
    var remoteScore = profileValueScore(row.storage_key, row.value_text || '');
    if (localScore <= remoteScore) return false;
    var localTs = 0;
    try { localTs = Date.parse((shadowRows && shadowRows[row.storage_key] && shadowRows[row.storage_key].updatedAt) || '') || 0; } catch (eLocalTs) {}
    var remoteTs = Date.parse((row && row.updated_at) || '') || 0;
    return !remoteTs || !localTs || localTs > remoteTs + 1000;
  }
  function pickLocalApplyCandidate(row, localValue, shadowRows) {
    if (!serverOnlyMode || !row || !isCurrentProfileWritableKey(row.storage_key)) return localValue || '';
    var remoteValue = row.value_text || '';
    var bestValue = localValue || '';
    var bestScore = profileValueScore(row.storage_key, bestValue);
    var remoteScore = profileValueScore(row.storage_key, remoteValue);
    var remoteTs = Date.parse((row && row.updated_at) || '') || 0;
    var shadowRow = shadowRows && shadowRows[row.storage_key];
    var shadowValue = shadowRow ? String(shadowRow.value || '') : '';
    if (shadowValue && shadowValue !== remoteValue && hasProfileData(row.storage_key, shadowValue)) {
      var shadowScore = profileValueScore(row.storage_key, shadowValue);
      var shadowTs = Date.parse((shadowRow && shadowRow.updatedAt) || '') || 0;
      if (shadowScore > Math.max(bestScore, remoteScore) && (!remoteTs || !shadowTs || shadowTs > remoteTs + 1000)) {
        bestValue = shadowValue;
      }
    }
    return bestValue;
  }
  async function applyRemoteRows(rows) {
    var remoteKeys = {};
    var appliedKeys = [];
    var mergedWrites = [];
    var shadowRows = await readShadowLiveAll();
    (rows || []).forEach(function (row) {
      if (!isAllowed(row.storage_key)) return;
      remoteKeys[row.storage_key] = true;
      appliedKeys.push(row.storage_key);
      var localBeforeApply = '';
      try { localBeforeApply = localStorage.getItem(row.storage_key) || ''; } catch (localReadError) {}
      localBeforeApply = pickLocalApplyCandidate(row, localBeforeApply, shadowRows);
      if (shouldKeepLocalOverOlderLowerRemote(row, localBeforeApply, shadowRows) || shouldKeepLocalOverStaleRemote(row, localBeforeApply)) {
        markDirty(row.storage_key);
        rememberPendingPayload(row.storage_key, localBeforeApply, row.value_text || '');
        mergedWrites.push({ key: row.storage_key, value: localBeforeApply, previousValue: row.value_text || '', staleLocalRecovery: true });
        return;
      }
      var pendingPayload = readPendingPayloadCached(row.storage_key, shadowRows);
      if ((isRecentlyDirty(row.storage_key) || pendingPayload) && (localBeforeApply || pendingPayload)) {
        mergedWrites.push({
          key: row.storage_key,
          value: pendingPayload ? pendingPayload.value : localBeforeApply,
          previousValue: pendingPayload ? pendingPayload.previousValue : '',
          dirtyRetry: true
        });
        return;
      }
      if (pendingWrites[row.storage_key]) return;
      if (isOlderOrSameRevision(row.storage_key, row.revision)) return;
      rememberRevision(row.storage_key, row.revision);
      var shouldMerge = false;
      var mergedState = shouldMerge ? mergeRemoteWithLocalValue(row.storage_key, row.value_text || '', localBeforeApply) : { value: row.value_text, changed: false };
      var valueToApply = mergedState.value;
      if (mergedState.changed) mergedWrites.push({ key: row.storage_key, value: valueToApply });
      var target = window.AVITOLOG_BACKEND_STORAGE_TARGET;
      var prefix = typeof window.AVITOLOG_BACKEND_STORAGE_PREFIX === 'string' ? window.AVITOLOG_BACKEND_STORAGE_PREFIX : 'sb_backend::';
      if (target) Storage.prototype.setItem.call(target, prefix + row.storage_key, valueToApply);
      else localStorage.setItem(row.storage_key, valueToApply);
    });
    refreshOpenScreensAfterRemoteApply(appliedKeys);
    try {
      document.dispatchEvent(new CustomEvent('avitolog:backend-remote-applied', {
        detail: { keys: appliedKeys.slice(), remoteKeys: remoteKeys }
      }));
    } catch (appliedEventError) {}
    if (mergedWrites.length) {
      for (var mw = 0; mw < mergedWrites.length; mw++) {
        var preparedMerged = await prepareValueForWrite(mergedWrites[mw].key, mergedWrites[mw].value, mergedWrites[mw].previousValue || '');
        await writeKey(mergedWrites[mw].key, preparedMerged);
        try { localStorage.setItem(mergedWrites[mw].key, preparedMerged); } catch (eSetMerged) {}
        clearDirty(mergedWrites[mw].key);
        clearPendingPayload(mergedWrites[mw].key);
      }
    }
    return { remoteKeys: remoteKeys, appliedKeys: appliedKeys, mergedWrites: mergedWrites };
  }
  window.__avitologBackendPullNow = async function () {
    var rows = await readRemote();
    var res = await applyRemoteRows(rows);
    return { ok: true, applied: res.appliedKeys.length, keys: res.appliedKeys };
  };
  window.__avitologBackendHistory = async function (key, limit) {
    var storageKey = String(key || 'avitolog_clients_sasha');
    var response = await fetch(cfg.url + '/rest/v1/rpc/frontend_state_history', {
      method: 'POST',
      headers: await headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_key: storageKey, p_limit: limit || 25 })
    });
    var rows = await response.json();
    if (!response.ok) throw new Error((rows && rows.message) || 'frontend_state_history failed');
    return (rows || []).map(function(row) {
      var score = profileValueScore(storageKey, row.value_text || '');
      return Object.assign({}, row, { score: score });
    });
  };
  window.__avitologBackendRestoreHistory = async function (key, auditId) {
    var storageKey = String(key || 'avitolog_clients_sasha');
    var rows = await window.__avitologBackendHistory(storageKey, 100);
    var hit = rows.find(function(row) { return String(row.audit_id) === String(auditId); });
    if (!hit || !hit.value_text) throw new Error('Версия не найдена: ' + auditId);
    await writeKey(storageKey, hit.value_text);
    localStorage.setItem(storageKey, hit.value_text);
    refreshOpenScreensAfterRemoteApply([storageKey]);
    return { ok: true, key: storageKey, audit_id: hit.audit_id, score: hit.score };
  };
  function restoreEsc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function restoreMonthKey(delta) {
    var d = new Date();
    d.setMonth(d.getMonth() + Number(delta || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function restoreLabelForKey(key) {
    var labels = {
      avitolog_clients_sasha: 'CRM клиенты Саши',
      avitolog_projects_sasha: 'Проекты Саши',
      crm_tasks_v1_sasha: 'Задачи Саши',
      avitolog_assets_my_v2_sasha: 'Касса Саши',
      avitolog_goals_v1_sasha: 'CRM воронка Саши LIVE',
      avitolog_goal_achievements_v1_sasha: 'Достижения Саши'
    };
    return labels[key] || key.replace('avitolog_goals_v1_sasha_month_', 'CRM воронка Саши ');
  }
  function ensureRestoreStyles() {
    if (document.getElementById('backendRestoreStyles')) return;
    var st = document.createElement('style');
    st.id = 'backendRestoreStyles';
    st.textContent = [
      '.backend-restore-backdrop{position:fixed;inset:0;z-index:2147482500;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:22px}',
      '.backend-restore-modal{width:min(980px,94vw);max-height:88vh;overflow:auto;background:#0d1724;border:1px solid rgba(53,208,255,.45);border-radius:18px;box-shadow:0 26px 90px #000;color:#e9f7ff;font:13px Segoe UI,Arial,sans-serif}',
      '.backend-restore-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(53,208,255,.22);position:sticky;top:0;background:#0d1724;z-index:2}',
      '.backend-restore-head b{font-size:18px}.backend-restore-close{margin-left:auto;background:#1c2a3c;border:1px solid #38516e;color:#fff;border-radius:9px;padding:8px 11px;cursor:pointer}',
      '.backend-restore-body{padding:16px 18px}.backend-restore-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.backend-restore-tab{border:1px solid rgba(53,208,255,.35);background:#122235;color:#dff8ff;border-radius:10px;padding:8px 10px;font-weight:800;cursor:pointer}.backend-restore-tab.on{background:#18c99b;color:#061411}',
      '.backend-restore-row{display:grid;grid-template-columns:110px 140px 1fr 100px 120px;gap:10px;align-items:center;padding:10px;border:1px solid rgba(53,208,255,.18);border-radius:12px;margin-bottom:8px;background:rgba(255,255,255,.035)}',
      '.backend-restore-row small{color:#8ca5ba}.backend-restore-row button{background:#20d6a0;border:0;border-radius:9px;padding:8px 10px;font-weight:900;cursor:pointer;color:#061411}.backend-restore-row button.danger{background:#ff6b88;color:#24050b}',
      '.backend-restore-meta{white-space:nowrap;color:#9fe7ff}.backend-restore-preview{font-family:Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#d5e8f5}.backend-restore-status{color:#9fe7ff;margin-bottom:10px;font-weight:800}'
    ].join('');
    document.head.appendChild(st);
  }
  function restorePreviewForValue(key, value) {
    try {
      var parsed = JSON.parse(value || '');
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 4).map(function(x) { return (x && (x.company || x.name || x.title)) || 'запись'; }).join(' · ');
      }
      if (parsed && Array.isArray(parsed.projects)) {
        return parsed.projects.slice(0, 4).map(function(x) { return (x && (x.name || x.title)) || 'проект'; }).join(' · ');
      }
    } catch (e) {}
    return String(value || '').slice(0, 120);
  }
  function defaultRestoreKeys() {
    var cur = restoreMonthKey(0);
    var prev = restoreMonthKey(-1);
    return [
      'avitolog_clients_sasha',
      'avitolog_goals_v1_sasha',
      'avitolog_goals_v1_sasha_month_' + cur,
      'avitolog_goals_v1_sasha_month_' + prev,
      'avitolog_projects_sasha',
      'avitolog_assets_my_v2_sasha',
      'crm_tasks_v1_sasha'
    ];
  }
  async function renderRestoreHistory(key) {
    var root = document.getElementById('backendRestoreList');
    var status = document.getElementById('backendRestoreStatus');
    if (!root || !status) return;
    status.textContent = 'Загружаю историю: ' + restoreLabelForKey(key) + '...';
    root.innerHTML = '';
    document.querySelectorAll('.backend-restore-tab').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-key') === key);
    });
    try {
      var rows = await window.__avitologBackendHistory(key, 40);
      status.textContent = rows.length ? ('Версий найдено: ' + rows.length) : 'История пустая по этому разделу.';
      root.innerHTML = rows.map(function(row) {
        var dt = row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '';
        var preview = restorePreviewForValue(key, row.value_text || '');
        return '<div class="backend-restore-row">' +
          '<div class="backend-restore-meta">#' + restoreEsc(row.audit_id) + '<br><small>rev ' + restoreEsc(row.revision || '') + '</small></div>' +
          '<div>' + restoreEsc(dt) + '<br><small>' + restoreEsc(row.action || '') + '</small></div>' +
          '<div class="backend-restore-preview" title="' + restoreEsc(preview) + '">' + restoreEsc(preview || 'без превью') + '</div>' +
          '<div><b>' + restoreEsc(row.score || 0) + '</b><br><small>вес</small></div>' +
          '<button type="button" class="danger" data-restore-key="' + restoreEsc(key) + '" data-audit-id="' + restoreEsc(row.audit_id) + '">Вернуть</button>' +
        '</div>';
      }).join('');
    } catch (error) {
      status.textContent = 'Ошибка истории: ' + (error && error.message ? error.message : String(error));
    }
  }
  window.__avitologBackendOpenRestore = function () {
    ensureRestoreStyles();
    var old = document.getElementById('backendRestoreModal');
    if (old) old.remove();
    var keys = defaultRestoreKeys();
    var wrap = document.createElement('div');
    wrap.id = 'backendRestoreModal';
    wrap.className = 'backend-restore-backdrop';
    wrap.innerHTML = '<div class="backend-restore-modal" role="dialog" aria-modal="true">' +
      '<div class="backend-restore-head"><b>🛟 Восстановление из Supabase</b><span>Выбери раздел и версию. Это перезапишет только выбранный ключ.</span><button type="button" class="backend-restore-close">Закрыть</button></div>' +
      '<div class="backend-restore-body"><div class="backend-restore-tabs">' +
        keys.map(function(k) { return '<button type="button" class="backend-restore-tab" data-key="' + restoreEsc(k) + '">' + restoreEsc(restoreLabelForKey(k)) + '</button>'; }).join('') +
      '</div><div id="backendRestoreStatus" class="backend-restore-status"></div><div id="backendRestoreList"></div></div>' +
    '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function(e) {
      if (e.target === wrap || e.target.closest('.backend-restore-close')) {
        wrap.remove();
        return;
      }
      var tab = e.target.closest('.backend-restore-tab');
      if (tab) {
        renderRestoreHistory(tab.getAttribute('data-key'));
        return;
      }
      var restoreBtn = e.target.closest('[data-restore-key][data-audit-id]');
      if (restoreBtn) {
        var k = restoreBtn.getAttribute('data-restore-key');
        var id = restoreBtn.getAttribute('data-audit-id');
        if (!confirm('Восстановить "' + restoreLabelForKey(k) + '" из версии #' + id + '?')) return;
        restoreBtn.disabled = true;
        restoreBtn.textContent = '...';
        window.__avitologBackendRestoreHistory(k, id)
          .then(function() {
            restoreBtn.textContent = 'Готово';
            renderRestoreHistory(k);
          })
          .catch(function(error) {
            restoreBtn.disabled = false;
            restoreBtn.textContent = 'Вернуть';
            alert('Ошибка восстановления: ' + (error && error.message ? error.message : String(error)));
          });
      }
    });
    renderRestoreHistory(keys[0]);
  };
  function scoreMoney(value) {
    return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
  }
  function profileValueScore(key, value) {
    if (!value) return 0;
    try {
      var parsed = JSON.parse(value);
      if ((key.indexOf('projects') >= 0 || key.indexOf('goals') >= 0) && parsed && Array.isArray(parsed.projects)) {
        var score = parsed.projects.length * 100;
        parsed.projects.forEach(function(p) {
          if (!p) return;
          if (Array.isArray(p.events)) score += p.events.length * 3;
          if (Array.isArray(p.childLineEvents)) {
            p.childLineEvents.forEach(function(arr) { if (Array.isArray(arr)) score += arr.length * 3; });
          }
          if (p.name && String(p.name).trim() && String(p.name).trim() !== 'Новый проект') score += 5;
          score += scoreMoney(p.saleAmount || p.mainPrice || p.paid || 0);
        });
        return score;
      }
      if (/^avitolog_assets_/.test(key) && Array.isArray(parsed)) {
        return parsed.length * 1000000 + parsed.reduce(function(sum, row) {
          if (!row) return sum;
          return sum + scoreMoney(row.paid) + scoreMoney(row.expected) + scoreMoney(row.soldFor) + scoreMoney(row.toAgent);
        }, 0);
      }
      if (Array.isArray(parsed)) return parsed.length;
    } catch (e) {}
    return String(value || '').length ? 1 : 0;
  }
  async function pushCurrentProfileStateNow(options) {
    options = options || {};
    var byKey = {};
    function addRecord(key, value) {
      if (!key || !isAllowed(key) || !isCurrentProfileWritableKey(key)) return;
      value = value || '';
      var score = profileValueScore(key, value);
      var current = byKey[key];
      if (!current || score > current.score) byKey[key] = { key: key, value: value, score: score };
    }
    function collectFromStore(store, stripPrefix) {
      if (!store) return;
      try {
        for (var i = 0; i < store.length; i++) {
          var rawKey = store.key(i);
          if (!rawKey) continue;
          var key = rawKey;
          if (stripPrefix) {
            if (rawKey.indexOf(stripPrefix) !== 0) continue;
            key = rawKey.slice(stripPrefix.length);
          }
          addRecord(key, store.getItem(rawKey) || '');
        }
      } catch (e) {}
    }
    collectFromStore(localStorage, '');
    if (serverOnlyMode && !isServerOnlySashaViewer() && !options.skipNative) {
      var nativeStore = window.AVITOLOG_BACKEND_NATIVE_STORAGE;
      var prefix = typeof window.AVITOLOG_BACKEND_STORAGE_PREFIX === 'string' ? window.AVITOLOG_BACKEND_STORAGE_PREFIX : '';
      collectFromStore(nativeStore, '');
      if (window.AVITOLOG_BACKEND_STORAGE_TARGET && prefix) collectFromStore(window.AVITOLOG_BACKEND_STORAGE_TARGET, prefix);
    }
    var records = Object.keys(byKey).map(function(key) { return byKey[key]; });
    for (var j = 0; j < records.length; j++) {
      if (hasProfileData(records[j].key, records[j].value)) await writeKey(records[j].key, records[j].value);
    }
    return records.length;
  }
  async function forceSashaLegacyProjectsToServer() {
    if (!serverOnlyMode || window.AVITOLOG_KEY_SUFFIX !== '_sasha' || !isBackendSessionSasha()) return false;
    var raw = '';
    try { raw = window.AVITOLOG_BACKEND_NATIVE_STORAGE && window.AVITOLOG_BACKEND_NATIVE_STORAGE.getItem('avitolog_projects') || ''; } catch (eNative) {}
    if (!raw) { try { raw = localStorage.getItem('avitolog_projects') || ''; } catch (eLocal) {} }
    if (!hasProfileData('avitolog_projects_sasha', raw)) throw new Error('Не нашёл старые локальные проекты Саши avitolog_projects');
    await writeKey('avitolog_projects_sasha', raw);
    try { localStorage.setItem('avitolog_projects_sasha', raw); } catch (eSet) {}
    setStatus('Supabase: проекты Саши заменены локальной истиной');
    return true;
  }
  window.__avitologBackendForceSashaLegacyProjectsToServer = forceSashaLegacyProjectsToServer;
  window.__avitologBackendPushCurrentProfileNow = pushCurrentProfileStateNow;
  function hasProfileData(key, value) {
    if (!value) return false;
    try {
      var parsed = JSON.parse(value);
      if (key.indexOf('clients') >= 0 || key.indexOf('tasks') >= 0 || /^avitolog_assets_/.test(key) || /^avitolog_goal_achievements_v1/.test(key)) return Array.isArray(parsed) && parsed.length > 0;
      if (key.indexOf('projects') >= 0 || key.indexOf('goals') >= 0) return parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0;
    } catch (e) {}
    return false;
  }
  async function retryDirtyLocalWrites() {
    var shadowRows = await readShadowLiveAll();
    var keys = await readDirtyKeysWithShadow(shadowRows);
    var written = 0;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var pendingPayload = await readPendingPayload(key, shadowRows);
      if (!isAllowed(key) || !isCurrentProfileWritableKey(key) || (!isRecentlyDirty(key) && !pendingPayload) || pendingWrites[key]) continue;
      var value = '';
      var previousValue = '';
      if (pendingPayload) {
        value = pendingPayload.value;
        previousValue = pendingPayload.previousValue;
      } else {
        try { value = localStorage.getItem(key) || ''; } catch (eLocal) {}
      }
      if (!hasProfileData(key, value)) continue;
      var prepared = await prepareValueForWrite(key, value, previousValue);
      await writeKey(key, prepared);
      try { localStorage.setItem(key, prepared); } catch (eSet) {}
      clearDirty(key);
      clearPendingPayload(key);
      written++;
    }
    if (written) refreshOpenScreensAfterRemoteApply(keys);
    return written;
  }
  function clientMergeKey(item) {
    item = item || {};
    var id = String(item.client_id || item.id || '').trim();
    if (id) return 'id:' + id;
    var folder = String(item.folderId || item.folder_id || item.drive_folder_id || item.folderLink || '').trim();
    if (folder) return 'folder:' + folder;
    var parts = [
      item.company || item.company_name || '',
      item.contact_name || item.contact || '',
      item.phone || '',
      item.telegram || item.tg || ''
    ].map(function(x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean);
    return parts.length ? ('fields:' + parts.join('|')) : '';
  }
  function idMergeKey(item) {
    item = item || {};
    var id = String(item.id || item.projectId || item.task_id || item.client_id || '').trim();
    return id ? ('id:' + id) : '';
  }
  function assetMergeKey(item) {
    item = item || {};
    var id = String(item.id || item.paymentId || item.crmClientId || item.client_id || '').trim();
    if (id) return 'id:' + id;
    var name = String(item.name || item.client || item.project || '').trim().toLowerCase();
    var date = String(item.paymentDate || item.date || item.startDate || '').trim();
    var amount = String(item.paid || item.soldFor || item.toAgent || item.expected || '').replace(/\s+/g, '').trim();
    return name ? ('asset:' + [name, date, amount].join('|')) : '';
  }
  function mergeArraysByKey(remoteArr, localArr, keyFn) {
    var out = [];
    var seen = {};
    function add(item, preferExisting) {
      var key = keyFn(item);
      if (!key) key = 'anon:' + JSON.stringify(item || {});
      if (seen[key] != null) {
        if (!preferExisting) out[seen[key]] = item;
        return;
      }
      seen[key] = out.length;
      out.push(item);
    }
    (remoteArr || []).forEach(function(item) { add(item, true); });
    (localArr || []).forEach(function(item) { add(item, true); });
    return out;
  }
  function mergeRemoteWithLocalValue(key, remoteValue, localValue) {
    if (!localValue || localValue === remoteValue) return { value: remoteValue, changed: false };
    try {
      var remote = JSON.parse(remoteValue || '');
      var local = JSON.parse(localValue || '');
      var merged = null;
      if (key.indexOf('clients') >= 0 && Array.isArray(remote) && Array.isArray(local)) {
        merged = mergeArraysByKey(remote, local, clientMergeKey);
      } else if (key.indexOf('tasks') >= 0 && Array.isArray(remote) && Array.isArray(local)) {
        merged = mergeArraysByKey(remote, local, idMergeKey);
      } else if (/^avitolog_assets_/.test(key) && Array.isArray(remote) && Array.isArray(local)) {
        merged = mergeArraysByKey(remote, local, assetMergeKey);
      } else if (key.indexOf('projects') >= 0 && remote && local && Array.isArray(remote.projects) && Array.isArray(local.projects)) {
        merged = Object.assign({}, remote);
        merged.projects = mergeArraysByKey(remote.projects, local.projects, idMergeKey);
        merged.hiddenProjects = mergeArraysByKey(remote.hiddenProjects || [], local.hiddenProjects || [], idMergeKey);
        merged.tasks = mergeArraysByKey(remote.tasks || [], local.tasks || [], idMergeKey);
        merged.taskLog = mergeArraysByKey(remote.taskLog || [], local.taskLog || [], idMergeKey);
      }
      if (!merged) return { value: remoteValue, changed: false };
      var text = JSON.stringify(merged);
      return { value: text, changed: text !== remoteValue };
    } catch (error) {
      return { value: remoteValue, changed: false };
    }
  }
  function refreshOpenScreensAfterRemoteApply(changedKeys) {
    try {
      var keys = Array.isArray(changedKeys) ? changedKeys : [];
      var hasProjects = keys.some(function(key) { return /^avitolog_projects(?:_sasha)?$/.test(key); });
      var hasAoax = keys.indexOf('avitolog_aoax_autoloads_v1') >= 0;
      var hasFinance = keys.some(function(key) { return isFinanceKey(key); });
      var hasCore = keys.some(function(key) { return coreKeys[key]; });
      setTimeout(function() {
        try {
          if ((hasProjects || hasAoax) && typeof window !== 'undefined') {
            window._projectsDataMem = null;
            window._projectsDataMemKey = null;
            if (window.projectsMode && typeof window.renderProjectsScreen === 'function') {
              window.renderProjectsScreen();
            } else if (window.projectsMode && typeof window.rerenderProjectsPreserveScroll === 'function') {
              window.rerenderProjectsPreserveScroll();
            }
          }
          if (hasFinance && window.assetsMode && typeof window.__renderAssetsPage === 'function') {
            window.__renderAssetsPage();
          }
          if ((hasFinance || hasProjects || hasCore) && window.goalsMode && window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') {
            window.AVITOLOG_GOALS.render();
          }
          if (hasCore && !window.projectsMode && !window.assetsMode && typeof window.refreshClientContents === 'function') {
            window.refreshClientContents(true);
          }
        } catch (renderError) {}
      }, 0);
    } catch (error) {}
  }
  async function seedCurrentProfile(remoteKeys) {
    if (serverOnlyMode || window.AVITOLOG_BACKEND_PREVIEW) return false;
    var suffix = window.AVITOLOG_KEY_SUFFIX === '_sasha' ? '_sasha' : '';
    var keys = ['avitolog_clients' + suffix, 'avitolog_projects' + suffix, 'crm_tasks_v1' + suffix];
    try {
      for (var li = 0; li < localStorage.length; li++) {
        var lk = localStorage.key(li);
        if (lk && isFinanceKey(lk) && isCurrentProfileWritableKey(lk) && keys.indexOf(lk) < 0) keys.push(lk);
      }
    } catch (localKeysError) {}
    var seeded = false;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = localStorage.getItem(key) || '';
      if (!remoteKeys[key] && hasProfileData(key, value)) {
        await writeKey(key, value);
        seeded = true;
      }
    }
    return seeded;
  }
  function button(label, action) {
    ensureStatus();
    var el = document.createElement('button');
    el.type = 'button'; el.textContent = label;
    el.style.cssText = 'display:block;margin-top:6px;border:0;border-radius:6px;padding:5px 8px;background:#20d6a0;color:#07130f;font:800 11px Segoe UI,Arial,sans-serif;cursor:pointer';
    el.onclick = function () { action(el); };
    statusEl.appendChild(el);
  }
  async function enableCore(el) {
    el.disabled = true;
    try {
      var sashaProfile = window.AVITOLOG_KEY_SUFFIX === '_sasha';
      var clientsKey = sashaProfile ? 'avitolog_clients_sasha' : 'avitolog_clients';
      var projectsKey = sashaProfile ? 'avitolog_projects_sasha' : 'avitolog_projects';
      await writeKey(clientsKey, localStorage.getItem(clientsKey) || '[]');
      await writeKey(projectsKey, localStorage.getItem(projectsKey) || '{}');
      coreEnabled = true; setStatus('Supabase: CRM/Проекты ВКЛ · Касса/Цели ВЫКЛ');
      button('Включить запись кассы и целей', enableFinance);
    } catch (error) { el.disabled = false; setStatus('Не удалось включить CRM/проекты: ' + error.message, true); }
  }
  async function enableFinance(el) {
    el.disabled = true;
    try {
      var records = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && isFinanceKey(key) && isCurrentProfileWritableKey(key)) records.push({ key: key, value: localStorage.getItem(key) || '' });
      }
      if (!records.length) throw new Error('Ключи кассы и целей не найдены');
      for (var j = 0; j < records.length; j++) await writeKey(records[j].key, records[j].value);
      financeEnabled = true;
      setStatus('Supabase: CRM/Проекты + Касса/Цели ВКЛ · КП/ADS ВЫКЛ');
      button('Включить запись КП и ADS', enableContent);
    } catch (error) { el.disabled = false; setStatus('Не удалось включить кассу/цели: ' + error.message, true); }
  }
  async function enableContent(el) {
    el.disabled = true;
    try {
      var records = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && isContentKey(key)) records.push({key:key,value:localStorage.getItem(key)||''});
      }
      if (!records.length) throw new Error('Ключи КП и ADS не найдены');
      for (var j=0;j<records.length;j++) await writeKey(records[j].key,records[j].value);
      contentEnabled = true;
      setStatus('Supabase: CRM/Проекты + Касса/Цели + КП/ADS ВКЛ · ключей КП/ADS ' + records.length);
    } catch(error) { el.disabled=false;setStatus('Не удалось включить КП/ADS: '+error.message,true); }
  }

  document.addEventListener('avitolog:storage-write', function (event) {
    var detail = event.detail || {}; queueWrite(detail.key, detail.value, detail.previousValue);
  });
  document.addEventListener('DOMContentLoaded', async function () {
    var phase = 'start';
    try {
      var restoreBtn = document.getElementById('backendRestoreBtn');
      if (restoreBtn) restoreBtn.style.display = 'inline-flex';
    } catch (restoreBtnError) {}
    if (window.AVITOLOG_BACKEND_PREVIEW) {
      ensureStatus();
      statusEl.textContent = 'Supabase: проверка записи...';
    }
    if (!sessionData()) { showReauthStatus('Supabase'); return; }
    try {
      phase = 'team'; await ensureSashaTeamMember();
      var forceLocalToServer = false;
      var forceSashaLegacyProjects = false;
      try {
        var forceParams = new URLSearchParams(window.location.search);
        forceLocalToServer = forceParams.get('forceLocalToServer') === '1';
        forceSashaLegacyProjects = forceParams.get('forceSashaLegacyProjects') === '1';
      } catch (forceParamError) {}
      if (serverOnlyMode && forceSashaLegacyProjects) {
        phase = 'force-sasha-legacy-projects';
        await forceSashaLegacyProjectsToServer();
      } else if (serverOnlyMode && forceLocalToServer && !isServerOnlySashaViewer()) {
        phase = 'forcepush';
        await pushCurrentProfileStateNow({ skipNative: true });
      }
      phase = 'pre-dirty'; await retryDirtyLocalWrites();
      phase = 'read'; var rows = await readRemote();
      phase = 'apply'; var applied = await applyRemoteRows(rows); var remoteKeys = applied.remoteKeys; var appliedKeys = applied.appliedKeys;
      initialSyncReady = true;
      phase = 'pending'; flushDeferredPendingWrites();
      phase = 'dirty'; await retryDirtyLocalWrites();
      phase = 'seed';
      if (await seedCurrentProfile(remoteKeys)) {
        sessionStorage.removeItem(revisionSignatureStorageKey());
        if (!serverOnlyMode) {
          window.location.reload();
          return;
        }
      }
      var sashaProfile = window.AVITOLOG_KEY_SUFFIX === '_sasha';
      var clientsKey = sashaProfile ? 'avitolog_clients_sasha' : 'avitolog_clients';
      var projectsKey = sashaProfile ? 'avitolog_projects_sasha' : 'avitolog_projects';
      coreEnabled = window.AVITOLOG_BACKEND_PREVIEW ? Boolean(remoteKeys[clientsKey] && remoteKeys[projectsKey]) : true;
      financeEnabled = window.AVITOLOG_BACKEND_PREVIEW ? Object.keys(remoteKeys).some(isFinanceKey) : true;
      contentEnabled = window.AVITOLOG_BACKEND_PREVIEW ? Object.keys(remoteKeys).some(isContentKey) : true;
      setStatus((serverOnlyMode ? 'Supabase SERVER: ' : 'Supabase: ') + 'CRM/Проекты ' + (coreEnabled ? 'ВКЛ' : 'ВЫКЛ') + ' · Касса/Цели ' + (financeEnabled ? 'ВКЛ' : 'ВЫКЛ') + ' · КП/ADS ' + (contentEnabled ? 'ВКЛ' : 'ВЫКЛ'));
      if (!coreEnabled) button('Включить запись CRM/проектов', enableCore);
      else if (!financeEnabled) button('Включить запись кассы и целей', enableFinance);
      else if (!contentEnabled) button('Включить запись КП и ADS', enableContent);
      var revisionSignature = rows.filter(function(row) { return isAllowed(row.storage_key); })
        .map(function(row) { return row.storage_key + ':' + row.revision; }).join('|');
      var revisionKey = revisionSignatureStorageKey();
      if (rows.length && sessionStorage.getItem(revisionKey) !== revisionSignature) {
        sessionStorage.setItem(revisionKey, revisionSignature);
        if (!serverOnlyMode) window.location.reload();
      }
      if (serverOnlyMode && !pullTimer) {
        if (!isServerOnlySashaViewer()) {
          setStatus('Supabase SERVER: сервер главный · изменения пишутся сразу');
        } else {
          pullTimer = setInterval(function () {
            if (document.hidden) return;
            if (Date.now() - lastLocalWriteAt < 3500) return;
            window.__avitologBackendPullNow().catch(function (pullError) {
              if (isSessionExpiredError(pullError)) { showReauthStatus('Supabase read'); return; }
              setStatus('Ошибка server pull: ' + pullError.message, true);
            });
          }, 5000);
        }
      }
    } catch (error) {
      if (isSessionExpiredError(error)) { showReauthStatus('Supabase ' + phase); return; }
      setStatus('Ошибка Supabase (' + phase + '): ' + error.message, true);
    }
  });
})();

