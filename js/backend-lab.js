(function () {
  'use strict';

  var SESSION_KEY = 'avitolog_backend_lab_session';
  var cfg = window.AVITOLOG_SUPABASE || {};
  var form = document.getElementById('loginForm');
  var loginPanel = document.getElementById('loginPanel');
  var sessionPanel = document.getElementById('sessionPanel');
  var statusEl = document.getElementById('status');
  var organizationCard = document.getElementById('organizationCard');
  var loginBtn = document.getElementById('loginBtn');

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function saveSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: session.user
    }));
  }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function request(path, options) {
    var response = await fetch(cfg.url + path, options);
    var text = await response.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { message: text }; }
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || ('HTTP ' + response.status));
    return data;
  }

  async function loadOrganization(session) {
    var rows = await request('/rest/v1/organizations?select=id,name,organization_members(role)&limit=5', {
      headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + session.access_token }
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('RLS работает, но организация для пользователя не найдена');
    var org = rows[0];
    var role = org.organization_members && org.organization_members[0] ? org.organization_members[0].role : 'member';
    organizationCard.innerHTML = '<b>' + String(org.name || 'AVITOLOG') + '</b><br>Роль: ' + String(role) + '<br>RLS: доступ разрешён';
    loginPanel.classList.add('off');
    sessionPanel.classList.add('on');
    setStatus('Успешно: Auth и RLS работают. Основной фронт ещё не переключён.', 'ok');
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    loginBtn.disabled = true;
    setStatus('Проверяю вход и права доступа...');
    try {
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      var session = await request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      document.getElementById('password').value = '';
      saveSession(session);
      await loadOrganization(session);
    } catch (error) {
      clearSession();
      setStatus('Ошибка: ' + error.message, 'err');
    } finally {
      loginBtn.disabled = false;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    clearSession();
    sessionPanel.classList.remove('on');
    loginPanel.classList.remove('off');
    organizationCard.textContent = '';
    setStatus('Тестовая сессия удалена из этой вкладки.');
  });

  var session = readSession();
  if (session && session.access_token) {
    loadOrganization(session).catch(function (error) {
      clearSession();
      setStatus('Сессия устарела: ' + error.message, 'err');
    });
  }
})();
