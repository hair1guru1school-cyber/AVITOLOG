(function () {
  'use strict';
  var SESSION_KEY = 'avitolog_backend_preview_session';
  var PERSISTENT_SESSION_KEY = 'avitolog_backend_session_v1';
  var cfg = window.AVITOLOG_SUPABASE || {};
  var status = document.getElementById('previewStatus');
  var loginCard = document.getElementById('loginCard');
  var loadCard = document.getElementById('loadCard');
  var inviteCard = document.getElementById('inviteCard');
  var deactivatePrimaryBtn = document.getElementById('deactivatePrimaryBtn');
  var inviteTokens = null;
  var params = new URLSearchParams(window.location.search);
  var returnToApp = params.get('return') === 'app';

  function setStatus(text) { status.textContent = text; }
  function session() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem('avitolog_backend_app_session') || localStorage.getItem(PERSISTENT_SESSION_KEY) || 'null');
    } catch (e) { return null; }
  }
  function saveSession(data) {
    var previous = session() || {};
    var expiresAt = Number(data.expires_at || 0);
    if (!expiresAt && data.expires_in) expiresAt = Math.floor(Date.now() / 1000) + Number(data.expires_in);
    var value = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: expiresAt,
      email: String((data.user && data.user.email) || data.email || previous.email || '').toLowerCase()
    };
    var packed = JSON.stringify(value);
    sessionStorage.setItem(SESSION_KEY, packed);
    try {
      localStorage.removeItem(PERSISTENT_SESSION_KEY);
      localStorage.setItem(PERSISTENT_SESSION_KEY, packed);
    } catch (e) {
      try { localStorage.removeItem(PERSISTENT_SESSION_KEY); } catch (e2) {}
      setStatus('Вход выполнен. Постоянная сессия не сохранилась из-за переполненного браузерного хранилища; на этой вкладке работать можно.');
    }
    return value;
  }
  async function activeSession() {
    var current = session();
    if (!current || !current.access_token) return null;
    if (!current.expires_at || Number(current.expires_at) > Math.floor(Date.now() / 1000) + 60) return current;
    if (!current.refresh_token) return null;
    var response = await fetch(cfg.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh_token })
    });
    var data = await response.json();
    if (!response.ok || !data.access_token) return null;
    return saveSession(data);
  }
  function showReady() { loginCard.classList.add('off'); loadCard.classList.remove('off'); }
  function markPrimaryMode(current) {
    try { sessionStorage.setItem('avitolog_backend_primary_session', '1'); } catch (e0) {}
    try { localStorage.setItem('avitolog_backend_primary', '1'); } catch (e1) {}
    try { localStorage.setItem('avitolog_backend_server_only', '1'); } catch (e2) {}
    if (String((current && current.email) || '').toLowerCase() === 'cyplakovaleksandr153@gmail.com') {
      try { localStorage.setItem('avitolog_current_user', 'sasha'); } catch (e3) {}
      try { localStorage.setItem('avitolog_profile_bookmark', 'sasha'); } catch (e4) {}
    }
  }
  function openMainAppSoon(current) {
    markPrimaryMode(current || session() || {});
    setTimeout(function () {
      window.location.href = 'index.html?v=20260824-main-link-primary-session-1';
    }, 450);
  }

  document.getElementById('previewLoginBtn').addEventListener('click', async function () {
    var button = this; button.disabled = true; setStatus('Проверяю вход и RLS...');
    try {
      var response = await fetch(cfg.url + '/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('previewEmail').value.trim(), password: document.getElementById('previewPassword').value })
      });
      var data = await response.json();
      if (!response.ok || !data.access_token) throw new Error(data.error_description || data.msg || 'Ошибка входа');
      document.getElementById('previewPassword').value = '';
      var saved = saveSession(data);
      showReady(); setStatus('Вход выполнен. Автоматически ничего не загружаю.');
      if (returnToApp) { setStatus('Вход выполнен. Открываю рабочий AVITOLOG...'); openMainAppSoon(saved); }
    } catch (error) { setStatus('Ошибка: ' + error.message); }
    finally { button.disabled = false; }
  });

  document.getElementById('invitePasswordBtn').addEventListener('click', async function () {
    var password = document.getElementById('invitePassword').value;
    var confirmation = document.getElementById('invitePasswordConfirm').value;
    if (password.length < 8) { setStatus('Пароль должен содержать минимум 8 символов.'); return; }
    if (password !== confirmation) { setStatus('Пароли не совпадают.'); return; }
    if (!inviteTokens || !inviteTokens.access_token) { setStatus('Ссылка приглашения недействительна. Отправьте приглашение повторно.'); return; }
    var button = this;
    button.disabled = true;
    try {
      var response = await fetch(cfg.url + '/auth/v1/user', {
        method: 'PUT',
        headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + inviteTokens.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
      });
      var user = await response.json();
      if (!response.ok) throw new Error(user.msg || user.message || ('HTTP ' + response.status));
      saveSession({
        access_token: inviteTokens.access_token,
        refresh_token: inviteTokens.refresh_token,
        expires_in: inviteTokens.expires_in,
        user: user
      });
      document.getElementById('invitePassword').value = '';
      document.getElementById('invitePasswordConfirm').value = '';
      inviteCard.classList.add('off');
      showReady();
      setStatus('Пароль сохранён. Теперь включите Supabase как основную базу на этом браузере.');
    } catch (error) {
      setStatus('Не удалось сохранить пароль: ' + error.message);
      button.disabled = false;
    }
  });

  document.getElementById('loadSnapshotBtn').addEventListener('click', async function () {
    var current = await activeSession();
    if (!current || !current.access_token) { setStatus('Сессия истекла. Войдите снова.'); loginCard.classList.remove('off'); loadCard.classList.add('off'); return; }
    var button = this; button.disabled = true; setStatus('Загружаю проверенный snapshot из Supabase...');
    try {
      var response = await fetch(cfg.url + '/rest/v1/migration_source_snapshots?select=checksum,raw_backup,created_at&order=created_at.desc&limit=20', { headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + current.access_token } });
      var rows = await response.json();
      if (!response.ok) throw new Error((rows && rows.message) || ('HTTP ' + response.status));
      var found = (rows || []).find(function (row) { try { var c = JSON.parse(row.raw_backup.keys.avitolog_clients || '[]'); return c.length >= 90; } catch (e) { return false; } });
      if (!found) throw new Error('Проверенный snapshot не найден');
      var backup = found.raw_backup, prefix = 'sb_backend::', remove = [];
      for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key && key.indexOf(prefix) === 0) remove.push(key); }
      remove.forEach(function (key) { localStorage.removeItem(key); });
      Object.keys(backup.keys || {}).forEach(function (key) { if (!/(auth|token|secret|password|api[_-]?key)/i.test(key)) localStorage.setItem(prefix + key, backup.keys[key]); });
      localStorage.setItem(prefix + 'avitolog_current_user', 'fil');
      localStorage.setItem(prefix + 'avitolog_drive_bypass', '1');
      sessionStorage.setItem('avitolog_backend_preview_summary', JSON.stringify({ checksum: found.checksum, keyCount: Object.keys(backup.keys || {}).length }));
      setStatus('Готово: ' + Object.keys(backup.keys || {}).length + ' ключей. Открываю привычный AVITOLOG...');
      window.location.href = 'index.html?backendPreview=1&backendSource=supabase';
    } catch (error) { setStatus('Ошибка загрузки preview: ' + error.message); button.disabled = false; }
  });

  document.getElementById('activatePrimaryBtn').addEventListener('click', async function () {
    var current = await activeSession();
    if (!current || !current.access_token) {
      setStatus('Сессия истекла. Войдите снова.');
      loginCard.classList.remove('off'); loadCard.classList.add('off'); return;
    }
    if (!window.confirm('Включить Supabase как основную базу на этом браузере? Google Drive продолжит работать, а возврат останется доступен внизу экрана.')) return;
    markPrimaryMode(current);
    setStatus('Supabase включён как основная база. Открываю рабочий AVITOLOG...');
    openMainAppSoon(current);
  });

  document.getElementById('addSashaMemberBtn').addEventListener('click', async function () {
    var current = await activeSession();
    if (!current || !current.access_token) { setStatus('Сессия истекла. Войдите снова.'); return; }
    var button = this;
    button.disabled = true;
    try {
      var response = await fetch(cfg.url + '/rest/v1/rpc/add_team_member_by_email', {
        method: 'POST',
        headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + current.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: 'cyplakovaleksandr153@gmail.com' })
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.message || ('HTTP ' + response.status));
      setStatus('Саша подключён к организации как manager. Теперь он может войти и работать в своём профиле.');
      button.textContent = 'Саша подключён';
    } catch (error) {
      setStatus('Не удалось подключить Сашу: ' + error.message);
      button.disabled = false;
    }
  });

  deactivatePrimaryBtn.addEventListener('click', function () {
    if (!window.confirm('Вернуться на прежнее локальное хранение в этом браузере? Данные в Supabase не удалятся.')) return;
    localStorage.removeItem('avitolog_backend_primary');
    deactivatePrimaryBtn.classList.add('off');
    setStatus('Основной Supabase-режим отключён только в этом браузере. Данные в Supabase сохранены.');
  });

  if (localStorage.getItem('avitolog_backend_primary') === '1') deactivatePrimaryBtn.classList.remove('off');

  (function readInviteLink() {
    var hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    var accessToken = hash.get('access_token');
    var type = hash.get('type');
    if (!accessToken || (type !== 'invite' && type !== 'recovery' && type !== 'signup')) return;
    inviteTokens = {
      access_token: accessToken,
      refresh_token: hash.get('refresh_token') || '',
      expires_in: Number(hash.get('expires_in') || 3600)
    };
    history.replaceState(null, '', window.location.pathname + window.location.search);
    loginCard.classList.add('off');
    loadCard.classList.add('off');
    inviteCard.classList.remove('off');
    setStatus('Приглашение подтверждено. Придумайте личный пароль Саши.');
  })();

  if (!inviteTokens && session() && session().access_token) {
    showReady();
    if (returnToApp) { setStatus('Авторизация есть. Открываю рабочий AVITOLOG...'); openMainAppSoon(session()); }
  }
})();
