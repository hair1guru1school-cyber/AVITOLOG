(function () {
  'use strict';
  if (!window.AVITOLOG_BACKEND_MODE) return;

  var cfg = window.AVITOLOG_SUPABASE || {};
  var coreKeys = { avitolog_clients: true, avitolog_projects: true };
  var coreEnabled = false;
  var financeEnabled = false;
  var contentEnabled = false;
  var timers = {};
  var statusEl;

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
      /^crm_ads_(?:expenses_v1|expenses_month_\d{4}-\d{2}|posts_plan_v1|posts_source_v1|links_v1|posts_sync_queue_v1)$/.test(key);
  }
  function isAllowed(key) { return Boolean(coreKeys[key] || isFinanceKey(key) || isContentKey(key)); }
  function sessionData() {
    try {
      return JSON.parse(sessionStorage.getItem('avitolog_backend_preview_session') || sessionStorage.getItem('avitolog_backend_app_session') || 'null');
    } catch (e) { return null; }
  }
  function saveSession(data) {
    var key = sessionStorage.getItem('avitolog_backend_preview_session') ? 'avitolog_backend_preview_session' : 'avitolog_backend_app_session';
    var expiresAt = Number(data.expires_at || 0);
    if (!expiresAt && data.expires_in) expiresAt = Math.floor(Date.now() / 1000) + Number(data.expires_in);
    var value = { access_token: data.access_token, refresh_token: data.refresh_token || '', expires_at: expiresAt };
    sessionStorage.setItem(key, JSON.stringify(value));
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
  async function writeKey(key, value) {
    var response = await fetch(cfg.url + '/rest/v1/rpc/upsert_frontend_state', {
      method: 'POST', headers: await headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_key: key, p_value: String(value == null ? '' : value) })
    });
    if (!response.ok) throw new Error((await response.text()) || 'Supabase write failed');
    return response.json();
  }
  function queueWrite(key, value) {
    var enabled = coreKeys[key] ? coreEnabled : (isFinanceKey(key) ? financeEnabled : (isContentKey(key) && contentEnabled));
    if (!enabled) return;
    clearTimeout(timers[key]);
    setStatus('Supabase: сохраняю ' + (coreKeys[key] ? 'CRM/проекты' : (isFinanceKey(key) ? 'кассу/цели' : 'КП/ADS')) + '...');
    timers[key] = setTimeout(function () {
      writeKey(key, value).then(function (result) {
        setStatus('Supabase: сохранено · версия ' + result.revision);
      }).catch(function (error) { setStatus('Ошибка записи: ' + error.message, true); });
    }, 700);
  }
  async function readRemote() {
    var response = await fetch(cfg.url + '/rest/v1/frontend_state_records?select=storage_key,value_text,revision,updated_at&order=storage_key', { headers: await headers() });
    if (!response.ok) throw new Error((await response.text()) || 'frontend_state_records read failed');
    return response.json();
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
      await writeKey('avitolog_clients', localStorage.getItem('avitolog_clients') || '[]');
      await writeKey('avitolog_projects', localStorage.getItem('avitolog_projects') || '{}');
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
        if (key && isFinanceKey(key)) records.push({ key: key, value: localStorage.getItem(key) || '' });
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
    var detail = event.detail || {}; queueWrite(detail.key, detail.value);
  });
  document.addEventListener('DOMContentLoaded', async function () {
    var phase = 'start';
    if (window.AVITOLOG_BACKEND_PREVIEW) {
      ensureStatus();
      statusEl.textContent = 'Supabase: проверка записи...';
    }
    if (!sessionData()) { setStatus('Нет активной Supabase-сессии', true); return; }
    try {
      phase = 'read'; var rows = await readRemote(); var remoteKeys = {};
      phase = 'apply'; rows.forEach(function (row) {
        if (!isAllowed(row.storage_key)) return;
        remoteKeys[row.storage_key] = true;
        var target = window.AVITOLOG_BACKEND_STORAGE_TARGET;
        var prefix = window.AVITOLOG_BACKEND_STORAGE_PREFIX || 'sb_backend::';
        if (target) Storage.prototype.setItem.call(target, prefix + row.storage_key, row.value_text);
        else localStorage.setItem(row.storage_key, row.value_text);
      });
      coreEnabled = Boolean(remoteKeys.avitolog_clients && remoteKeys.avitolog_projects);
      financeEnabled = Object.keys(remoteKeys).some(isFinanceKey);
      contentEnabled = Object.keys(remoteKeys).some(isContentKey);
      setStatus('Supabase: CRM/Проекты ' + (coreEnabled ? 'ВКЛ' : 'ВЫКЛ') + ' · Касса/Цели ' + (financeEnabled ? 'ВКЛ' : 'ВЫКЛ') + ' · КП/ADS ' + (contentEnabled ? 'ВКЛ' : 'ВЫКЛ'));
      if (!coreEnabled) button('Включить запись CRM/проектов', enableCore);
      else if (!financeEnabled) button('Включить запись кассы и целей', enableFinance);
      else if (!contentEnabled) button('Включить запись КП и ADS', enableContent);
      if (rows.length && sessionStorage.getItem('avitolog_backend_state_loaded') !== '1') {
        sessionStorage.setItem('avitolog_backend_state_loaded', '1'); window.location.reload();
      }
    } catch (error) { setStatus('Ошибка Supabase (' + phase + '): ' + error.message, true); }
  });
})();
