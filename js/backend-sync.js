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
  var appliedRevisions = {};
  var statusEl;
  var persistentSessionKey = 'avitolog_backend_session_v1';
  var serverOnlyMode = !!window.AVITOLOG_BACKEND_SERVER_ONLY;
  var pullTimer = null;
  var lastLocalWriteAt = 0;
  var initialSyncReady = !serverOnlyMode;
  function revisionSignatureStorageKey() {
    return 'avitolog_backend_revision_signature_' + (window.AVITOLOG_KEY_SUFFIX === '_sasha' ? 'sasha' : 'fil');
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
      if (temporary && !localStorage.getItem(persistentSessionKey)) localStorage.setItem(persistentSessionKey, temporary);
      return JSON.parse(raw);
    } catch (e) { return null; }
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
    localStorage.setItem(persistentSessionKey, JSON.stringify(value));
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
    if (!response.ok || !refreshed.access_token) return null;
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
    if (!response.ok) throw new Error((await response.text()) || 'Supabase write failed');
    var result = await response.json();
    rememberRevision(key, result && result.revision);
    return result;
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
  function queueWrite(key, value, previousValue) {
    if (!isCurrentProfileWritableKey(key)) return;
    if (serverOnlyMode && !initialSyncReady) return;
    lastLocalWriteAt = Date.now();
    var enabled = coreKeys[key] ? coreEnabled : (isFinanceKey(key) ? financeEnabled : (isContentKey(key) && contentEnabled));
    if (!enabled && !serverOnlyMode) return;
    clearTimeout(timers[key]);
    pendingWrites[key] = { value: String(value == null ? '' : value), previousValue: String(previousValue == null ? '' : previousValue), ts: Date.now() };
    setStatus('Supabase: сохраняю ' + (coreKeys[key] ? 'CRM/проекты' : (isFinanceKey(key) ? 'кассу/цели' : 'КП/ADS')) + '...');
    var delay = key.indexOf('projects') >= 0 ? 0 : 700;
    timers[key] = setTimeout(function () {
      var pending = pendingWrites[key] || {};
      var expected = pending.value;
      prepareValueForWrite(key, expected, pending.previousValue).then(function (prepared) {
        return writeKey(key, prepared);
      }).then(function (result) {
        if (pendingWrites[key] === pending) delete pendingWrites[key];
        setStatus('Supabase: сохранено · версия ' + result.revision);
      }).catch(function (error) { setStatus('Ошибка записи: ' + error.message, true); });
    }, delay);
  }
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
  async function applyRemoteRows(rows) {
    var remoteKeys = {};
    var appliedKeys = [];
    var mergedWrites = [];
    (rows || []).forEach(function (row) {
      if (!isAllowed(row.storage_key)) return;
      remoteKeys[row.storage_key] = true;
      appliedKeys.push(row.storage_key);
      var localBeforeApply = '';
      try { localBeforeApply = localStorage.getItem(row.storage_key) || ''; } catch (localReadError) {}
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
    if (mergedWrites.length) {
      for (var mw = 0; mw < mergedWrites.length; mw++) {
        await writeKey(mergedWrites[mw].key, mergedWrites[mw].value);
      }
    }
    return { remoteKeys: remoteKeys, appliedKeys: appliedKeys, mergedWrites: mergedWrites };
  }
  window.__avitologBackendPullNow = async function () {
    var rows = await readRemote();
    var res = await applyRemoteRows(rows);
    return { ok: true, applied: res.appliedKeys.length, keys: res.appliedKeys };
  };
  function profileValueScore(key, value) {
    if (!value) return 0;
    try {
      var parsed = JSON.parse(value);
      if (key.indexOf('projects') >= 0 && parsed && Array.isArray(parsed.projects)) {
        var score = parsed.projects.length * 100;
        parsed.projects.forEach(function(p) {
          if (!p) return;
          if (Array.isArray(p.events)) score += p.events.length * 3;
          if (Array.isArray(p.childLineEvents)) {
            p.childLineEvents.forEach(function(arr) { if (Array.isArray(arr)) score += arr.length * 3; });
          }
          if (p.name && String(p.name).trim() && String(p.name).trim() !== 'Новый проект') score += 5;
        });
        return score;
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
      if (key.indexOf('projects') >= 0) return parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0;
    } catch (e) {}
    return false;
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
    if (window.AVITOLOG_BACKEND_PREVIEW) {
      ensureStatus();
      statusEl.textContent = 'Supabase: проверка записи...';
    }
    if (!sessionData()) { setStatus('Нет активной Supabase-сессии', true); return; }
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
      phase = 'read'; var rows = await readRemote();
      phase = 'apply'; var applied = await applyRemoteRows(rows); var remoteKeys = applied.remoteKeys; var appliedKeys = applied.appliedKeys;
      initialSyncReady = true;
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
            window.__avitologBackendPullNow().catch(function (pullError) { setStatus('Ошибка server pull: ' + pullError.message, true); });
          }, 5000);
        }
      }
    } catch (error) { setStatus('Ошибка Supabase (' + phase + '): ' + error.message, true); }
  });
})();
